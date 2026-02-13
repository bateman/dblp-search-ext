/*global chrome*/

/**
 * @file background.js
 * @description Service worker for the dblp Search extension. Handles messages from popup/options,
 * manages context menus, and coordinates between MVC components.
 */

const browser = globalThis.browser || chrome;
console.log("background.js loaded");

// Instantiate the MVC classes
import { PublicationController } from "./controller/controller.js";
import { PublicationModel } from "./model/model.js";
import { PublicationView } from "./view/view.js";
import { extractDOI } from "./utils/doi.js";

/** @type {PublicationModel} */
const model = new PublicationModel();
/** @type {PublicationView} */
const view = new PublicationView();
/** @type {PublicationController} */
const controller = new PublicationController(model, view);

/**
 * Tracks badge timeout ID to prevent race conditions during badge updates
 * @type {number|null}
 */
let badgeTimeoutId = null;

/**
 * Shows feedback to user when selected text is not a valid DOI
 * Uses flashing badge (visual) and console warning (debugging)
 * @param {string} text - The selected text that failed validation
 */
function showInvalidDOIFeedback(text) {
  // Console warning for debugging (includes selected text)
  console.warn("Selected text is not a valid DOI format:", text);

  // Clear any existing timeout to prevent race conditions
  if (badgeTimeoutId) {
    clearTimeout(badgeTimeoutId);
    badgeTimeoutId = null;
  }

  // Flash the badge to make it more noticeable
  const flashCount = 3;
  const flashInterval = 300; // ms between flashes
  let flashes = 0;

  function flash() {
    try {
      const isVisible = flashes % 2 === 0;
      browser.action.setBadgeText({ text: isVisible ? "!" : "" });
      browser.action.setBadgeBackgroundColor({ color: "#b91a2d" });
      browser.action.setTitle({ title: "Invalid DOI format" });

      flashes++;
      if (flashes < flashCount * 2) {
        badgeTimeoutId = setTimeout(flash, flashInterval);
      } else {
        // Keep badge visible after flashing, then clear after 3 seconds
        browser.action.setBadgeText({ text: "!" });
        badgeTimeoutId = setTimeout(() => {
          try {
            browser.action.setBadgeText({ text: "" });
            browser.action.setTitle({ title: "dblp Search" });
          } catch (error) {
            console.error("Failed to clear badge:", error);
          }
          badgeTimeoutId = null;
        }, 3000);
      }
    } catch (error) {
      console.error("Failed to set badge:", error);
    }
  }

  flash();
}

/**
 * Handles message errors consistently by logging and sending error response
 * @param {Error} error - The error that occurred
 * @param {Object} message - The original message object
 * @param {string} message.type - The type of message
 * @param {string} message.script - The script that sent the message
 * @param {Function} sendResponse - Callback function to send response back
 */
function handleMessageError(error, message, sendResponse) {
  console.error(
    `There was a problem with the message '${message.type}' sent by '${message.script}': ${error}`
  );
  sendResponse({
    script: "background.js",
    success: false,
    error: error.message || "Unknown error occurred",
  });
}

/**
 * Message listener for handling requests from popup and other extension components.
 * Processes search requests and pagination commands.
 * @param {Object} message - The message object from the sender
 * @param {string} message.type - Message type (REQUEST_SEARCH_PUBLICATIONS, REQUEST_NEXT_PAGE, REQUEST_PREVIOUS_PAGE)
 * @param {string} message.script - The script that sent the message
 * @param {string} [message.query] - Search query string
 * @param {number} [message.offset] - Pagination offset
 * @param {number} [message.currentOffset] - Current pagination offset
 * @param {number} [message.maxResults] - Maximum results per page
 * @param {Object} sender - Information about the message sender
 * @param {Function} sendResponse - Callback to send response
 * @returns {boolean} True if response will be sent asynchronously, false otherwise
 */
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Ignore messages not meant for background.js
  if (!message.type || !message.type.startsWith("REQUEST_")) {
    return false;
  }

  try {
    if (message.type === "REQUEST_SEARCH_PUBLICATIONS") {
      // handleSearch returns a promise, so we need to return true to indicate
      // that the response will be sent asynchronously
      const offset = message.offset || 0;
      controller
        .handleSearch(message.query, offset)
        .then(() => {
          console.log(
            `Background.js completed a request to search for '${message.query}' (offset: ${offset}) sent by '${message.script}'.`
          );
          sendResponse({
            script: "background.js",
            success: true,
            response: `Search for '${message.query}' completed.`,
          });
        })
        .catch((error) => handleMessageError(error, message, sendResponse));
      return true; // Will respond asynchronously
    } else if (message.type === "REQUEST_NEXT_PAGE") {
      controller
        .handleNextPage(message.query, message.currentOffset, message.maxResults)
        .then(() => {
          console.log(
            `Background.js completed request for next page of '${message.query}'.`
          );
          sendResponse({
            script: "background.js",
            success: true,
            response: "Next page loaded.",
          });
        })
        .catch((error) => handleMessageError(error, message, sendResponse));
      return true;
    } else if (message.type === "REQUEST_PREVIOUS_PAGE") {
      controller
        .handlePreviousPage(message.query, message.currentOffset, message.maxResults)
        .then(() => {
          console.log(
            `Background.js completed request for previous page of '${message.query}'.`
          );
          sendResponse({
            script: "background.js",
            success: true,
            response: "Previous page loaded.",
          });
        })
        .catch((error) => handleMessageError(error, message, sendResponse));
      return true;
    }
  } catch (error) {
    handleMessageError(error, message, sendResponse);
  }
  return false;
});

/**
 * Creates context menu items when the extension is installed.
 * Adds menu options for searching highlighted text on dblp and resolving DOIs.
 */
browser.runtime.onInstalled.addListener(function () {
  // Context menu item to search dblp
  browser.contextMenus.create({
    title: "Search highlighted text on dblp",
    contexts: ["selection"],
    id: "selection",
  });

  // Context menu item to resolve DOI
  browser.contextMenus.create({
    title: "Resolve DOI",
    contexts: ["selection"],
    id: "doi-resolve",
  });
});

/**
 * Handles context menu item clicks.
 * - "selection": Opens dblp search with highlighted text
 * - "doi-resolve": Resolves DOI to its target URL
 * @param {Object} info - Information about the clicked menu item
 * @param {string} info.menuItemId - The ID of the clicked menu item
 * @param {string} info.selectionText - The selected text when the menu was clicked
 */
browser.contextMenus.onClicked.addListener(function (info) {
  if (info.menuItemId === "selection") {
    const query = info.selectionText;
    browser.tabs.create({
      url: "https://dblp.org/search?q=" + encodeURIComponent(query),
    });
  } else if (info.menuItemId === "doi-resolve") {
    const doi = extractDOI(info.selectionText);
    if (doi) {
      browser.tabs.create({
        url: "https://doi.org/" + encodeURIComponent(doi),
      });
    } else {
      showInvalidDOIFeedback(info.selectionText);
    }
  }
});
