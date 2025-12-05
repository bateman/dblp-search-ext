// options.js
import { updateStatus } from "./commons.js";

var browser = window.msBrowser || window.browser || window.chrome;
console.log("options.js loaded");

// ------------------------------------- Listeners -------------------------------------
document.addEventListener("DOMContentLoaded", function () {
  document.getElementById("saveButton").addEventListener("click", saveOptions);
  restoreOptions();
});

// ------------------------------------- Functions -------------------------------------

// Saves options to chrome.storage
function saveOptions() {
  var maxResultsInput = document.getElementById("maxResults").value;
  var keyRenaming = document.getElementById("renamingCheckbox").checked;
  var removeTimestampBiburlBibsource = document.getElementById(
    "removeTimestampBiburlBibsource"
  ).checked;

  // Validate maxResults input
  var maxResults = parseInt(maxResultsInput, 10);
  if (isNaN(maxResults) || maxResults < 1 || maxResults > 1000) {
    updateStatus("Error: Max results must be between 1 and 1000", 3000);
    // Reset to default value
    maxResults = 30;
    document.getElementById("maxResults").value = maxResults;
    return;
  }

  browser.storage.local.set(
    {
      options: {
        maxResults: maxResults,
        keyRenaming: keyRenaming,
        removeTimestampBiburlBibsource: removeTimestampBiburlBibsource,
      },
    },
    function () {
      // Update status to let user know options were saved.
      updateStatus("Options saved successfully", 2000);
    }
  );
}

// Restores select box and checkbox state using the preferences stored in local storag
function restoreOptions() {
  browser.storage.local.get(
    {
      options: {
        maxResults: 30,
        keyRenaming: true,
        removeTimestampBiburlBibsource: true,
      },
    },
    function (items) {
      document.getElementById("maxResults").value = items.options.maxResults;
      document.getElementById("renamingCheckbox").checked =
        items.options.keyRenaming;
      document.getElementById("removeTimestampBiburlBibsource").checked =
        items.options.removeTimestampBiburlBibsource;
    }
  );
}
