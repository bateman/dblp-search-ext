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
import { flashBadge } from "./utils/badge.js";

/** @type {PublicationModel} */
const model = new PublicationModel();
/** @type {PublicationView} */
const view = new PublicationView();
/** @type {PublicationController} */
const controller = new PublicationController(model, view);

/**
 * Shows feedback to user when selected text is not a valid DOI
 * Uses flashing badge (visual) and console warning (debugging)
 * @param {string} text - The selected text that failed validation
 */
function showInvalidDOIFeedback(text) {
  console.warn("Selected text is not a valid DOI format:", text);
  flashBadge();
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
 * Maps message types to their handler functions and log descriptions.
 * Each handler returns an object with:
 * - action: Promise from the controller method
 * - log: Human-readable description for logging
 * @type {Object<string, function(Object): {action: Promise, log: string}>}
 */
const messageHandlers = {
  REQUEST_SEARCH_PUBLICATIONS: (msg) => ({
    action: controller.handleSearch(msg.query, msg.offset || 0),
    log: `search for '${msg.query}' (offset: ${msg.offset || 0})`,
  }),
  REQUEST_NEXT_PAGE: (msg) => ({
    action: controller.handleNextPage(msg.query, msg.currentOffset, msg.maxResults),
    log: `next page of '${msg.query}'`,
  }),
  REQUEST_PREVIOUS_PAGE: (msg) => ({
    action: controller.handlePreviousPage(msg.query, msg.currentOffset, msg.maxResults),
    log: `previous page of '${msg.query}'`,
  }),
};

/**
 * Message listener for handling requests from popup and other extension components.
 * Processes search requests and pagination commands via the dispatcher map.
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
  if (!message.type || !message.type.startsWith("REQUEST_")) {
    return false;
  }

  const handler = messageHandlers[message.type];
  if (!handler) {
    return false;
  }

  const { action, log } = handler(message);
  action
    .then(() => {
      console.log(
        `Background.js completed ${log} sent by '${message.script}'.`
      );
      sendResponse({
        script: "background.js",
        success: true,
        response: `Completed ${log}.`,
      });
    })
    .catch((error) => handleMessageError(error, message, sendResponse));

  return true; // Will respond asynchronously
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
