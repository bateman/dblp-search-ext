/*global chrome*/

// background.js
var browser = browser || chrome;
console.log("background.js loaded");

// Instantiate the MVC classes
import { PublicationController } from "./controller/controller.js";
import { PublicationModel } from "./model/model.js";
import { PublicationView } from "./view/view.js";

const model = new PublicationModel();
const view = new PublicationView();
const controller = new PublicationController(model, view);

// DOI validation patterns (based on Crossref recommendations)
// See: https://www.crossref.org/blog/dois-and-matching-regular-expressions/
// Character class includes all valid DOI characters per DOI handbook
const DOI_PATTERNS = [
  /^10\.\d{4,9}\/[-._;()/:A-Z0-9<>@#%+&?=]+$/i, // Standard DOIs (74.4M+)
  /^10\.1002\/[^\s]+$/i, // Wiley legacy DOIs (~300K)
];

// Track badge timeout to prevent race conditions
let badgeTimeoutId = null;

/**
 * Validates if a string is a valid DOI format
 * @param {string} doi - The DOI string to validate
 * @returns {boolean} True if valid DOI format
 */
function isValidDOI(doi) {
  return DOI_PATTERNS.some((pattern) => pattern.test(doi));
}

/**
 * Extracts a DOI from text, handling URL prefixes and trailing punctuation
 * @param {string} text - The text that may contain a DOI
 * @returns {string|null} The extracted DOI or null if invalid
 */
function extractDOI(text) {
  if (!text) return null;

  let cleaned = text.trim();

  // Remove common URL prefixes
  cleaned = cleaned.replace(/^(?:https?:\/\/)?(?:dx\.)?doi\.org\//i, "");

  // Remove doi: prefix
  cleaned = cleaned.replace(/^doi:\s*/i, "");

  // Remove URL query parameters and fragments (e.g., ?ref=foo or #abstract)
  cleaned = cleaned.replace(/[?#].*$/, "");

  // Strip trailing punctuation (but preserve valid DOI chars like parentheses)
  cleaned = cleaned.replace(/[.,;:!?'"\s]+$/, "");

  // Check if anything remains after cleaning
  if (!cleaned) return null;

  return isValidDOI(cleaned) ? cleaned : null;
}

/**
 * Shows feedback to user when selected text is not a valid DOI
 * Uses both badge text (visual) and console warning (debugging)
 * @param {string} text - The selected text that failed validation
 */
function showInvalidDOIFeedback(text) {
  // Option B: Console warning for debugging (includes selected text)
  console.warn("Selected text is not a valid DOI format:", text);

  // Clear any existing timeout to prevent race conditions
  if (badgeTimeoutId) {
    clearTimeout(badgeTimeoutId);
    badgeTimeoutId = null;
  }

  // Option A: Badge text for user feedback
  try {
    browser.action.setBadgeText({ text: "!" });
    browser.action.setBadgeBackgroundColor({ color: "#e74c3c" });
    browser.action.setTitle({ title: "Invalid DOI format" });

    // Clear badge after 3 seconds
    badgeTimeoutId = setTimeout(() => {
      try {
        browser.action.setBadgeText({ text: "" });
        browser.action.setTitle({ title: "dblp Search" });
      } catch (error) {
        console.error("Failed to clear badge:", error);
      }
      badgeTimeoutId = null;
    }, 3000);
  } catch (error) {
    console.error("Failed to set badge:", error);
  }
}

// Helper function to handle message errors consistently
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

//  Add a listener for messages from the view
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

// Create context menu items
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

// Add menu click listener
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
