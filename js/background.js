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

//  Add a listener for messages from the view
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  try {
    if (message.type === "REQUEST_SEARCH_PUBLICATIONS") {
      // handleSearch returns a promise, so we need to return true to indicate
      // that the response will be sent asynchronously
      controller
        .handleSearch(message.query)
        .then(() => {
          console.log(
            `Background.js completed a request to search for '${message.query}' sent by '${message.script}'.`
          );
          sendResponse({
            script: "background.js",
            success: true,
            response: `Search for '${message.query}' completed.`,
          });
        })
        .catch((error) => {
          console.error(
            `There was a problem with the message '${message.type}' sent by '${message.script}': ${error}`
          );
          sendResponse({
            script: "background.js",
            success: false,
            error: error.message || "Unknown error occurred",
            response: `There was a problem with the message '${message.type}' sent by '${message.script}': ${error}`,
          });
        });
      return true; // Will respond asynchronously
    }
  } catch (error) {
    console.error(
      `There was a problem with the message '${message.type}' sent by '${message.script}': ${error}`
    );
    sendResponse({
      script: "background.js",
      success: false,
      error: error.message || "Unknown error occurred",
    });
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
