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

// Create a context menu item to search dblp
browser.runtime.onInstalled.addListener(function () {
  let context = "selection";
  let title = "Search highlighted text on dblp";
  browser.contextMenus.create({
    title: title,
    contexts: [context],
    id: context,
  });
});

// Add menu click listener
browser.contextMenus.onClicked.addListener(function (info) {
  if (info.menuItemId === "selection") {
    const query = info.selectionText;
    browser.tabs.create({
      url: "https://dblp.org/search?q=" + encodeURIComponent(query),
    });
  }
});
