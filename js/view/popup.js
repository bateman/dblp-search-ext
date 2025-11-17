// popup.js
import { updateStatus } from "./commons.js";

console.log("popup.js loaded");
var browser = window.msBrowser || window.browser || window.chrome;

// ------------------------------------- Listeners -------------------------------------

document.addEventListener("DOMContentLoaded", function () {
  // Display extension version in the footer
  fetch("../manifest.json")
    .then((response) => response.json())
    .then((data) => {
      document.getElementById("version").textContent = data.version;
    });

  // if the content of the popup was saved in the local storage, then restore it
  restoreResultsFromStorage();

  var queryInputField = document.getElementById("paperTitle");
  if (queryInputField) {
    queryInputField.focus();
  }

  // Get the highlighted text from the current tab
  browser.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    var tab = tabs[0]; // Now 'tab' is defined
    if (
      tab.url &&
      (tab.url.startsWith("http://") || tab.url.startsWith("https://"))
    ) {
      browser.scripting
        .executeScript({
          target: { tabId: tab.id },
          func: function () {
            return window.getSelection().toString();
          },
        })
        .then(function (result) {
          if (result && result.length > 0) {
            const highlightedText = result[0].result.trim();
            if (highlightedText) {
              queryInputField.value = highlightedText;
            }
          }
        })
        .catch(function (error) {
          console.error(
            "Error executing the copy highlighted text script:",
            error
          );
        });
    }
  });

  // Search DBLP when the search button is clicked
  document
    .getElementById("searchButton")
    .addEventListener("click", function () {
      const q = queryInputField.value.trim().replace(/\s/g, "+");
      requestSearchDblp(q);
    });

  // Search DBLP when the user presses the Enter key
  queryInputField.addEventListener("keydown", function (event) {
    if (event.key === "Enter") {
      const q = queryInputField.value.trim().replace(/\s/g, "+");
      requestSearchDblp(q);
    }
  });

  // Open the popup.html in a new tab when the openInTab button is clicked
  document.getElementById("openInTab").addEventListener("click", function () {
    browser.tabs.create({ url: browser.runtime.getURL("html/popup.html") });
  });

  // Clear the results when the clear button is clicked
  document.getElementById("clearButton").addEventListener("click", function () {
    browser.storage.local.set({
      search: {
        paperTitle: "",
        status: "",
        totalHits: 0,
        sentHits: 0,
        excludedCount: 0,
        results: [],
        currentOffset: 0,
      },
    });
    requestClearResults(true);
  });

  browser.runtime.onMessage.addListener((message) => {
    console.log(
      `Popup.js received message from '${message.script}': ${message.type}`
    );
    if (message.type === "RESPONSE_SEARCH_PUBLICATIONS") {
      console.log(
        "Popup.js updating publications count: ",
        message.responseStatus,
        message.totalHits,
        message.sentHits,
        message.excludedCount,
        message.currentOffset
      );
      updatePublicationsCount(
        message.responseStatus,
        message.totalHits,
        message.sentHits,
        message.excludedCount
      );
      console.log("Popup.js updating publications table.");
      updatePublicationsTable(message.resultsTable);
      updatePaginationControls(
        message.totalHits,
        message.sentHits,
        message.currentOffset || 0
      );
      saveResultsToStorage(
        queryInputField.value,
        message.responseStatus,
        message.totalHits,
        message.sentHits,
        message.excludedCount,
        message.resultsTable,
        message.currentOffset || 0
      );
    }
  });
});

// ------------------------------------- Functions -------------------------------------

// Send a message to the background script and log the response
function sendMessage(dictObject) {
  browser.runtime.sendMessage(dictObject, function (response) {
    console.log(
      `Popup.js received a response from '${response.script}': ${response}`
    );
  });
}

// Ask background script to execute the query on dblp
function requestSearchDblp(q, offset = 0) {
  // Update status to let user know search has started.
  updateStatus("Searching...", 2000);
  // Clear existing results, but not the paperTitle
  requestClearResults(false);
  // Send nmessage to background.js
  sendMessage({
    script: "popup.js",
    type: "REQUEST_SEARCH_PUBLICATIONS",
    query: q,
    offset: offset,
  });
}

// Ask background script to clear the count message
function requestClearResults(clearTitle = true) {
  console.log("Clearing existing results...");
  if (clearTitle) {
    document.getElementById("paperTitle").value = "";
  }
  updatePublicationsCount("RESET", 0, 0, 0);
  updatePublicationsTable("");
  updatePaginationControls(0, 0, 0);
}

// Update the count of publications found
function updatePublicationsCount(
  responseStatus,
  totalHits,
  sentHits,
  excludedCount
) {
  var count = document.getElementById("count");
  if (count) {
    var message = "";
    if (responseStatus === "RESET") {
      message = "";
      count.classList.remove("error");
    } else {
      message = `Query ${responseStatus}: found ${totalHits}, shown ${
        sentHits - excludedCount
      } (${excludedCount} CoRR abs entries ingored)`;
      if (responseStatus !== "OK") {
        count.classList.add("error");
      } else {
        count.classList.remove("error");
      }
    }
    count.textContent = message;
  }
}

// Update the table with the found publications
function updatePublicationsTable(tableHTML) {
  const results = document.getElementById("results");
  if (!results) return;

  if (tableHTML === "") {
    results.textContent = "";
    return;
  }

  // Create a temporary container to safely parse the HTML
  const parser = new DOMParser();
  const doc = parser.parseFromString(tableHTML, "text/html");

  // Clear existing content
  results.textContent = "";

  // Safely transfer the table content
  const parsedTable = doc.body.firstChild;
  if (parsedTable) {
    // Create a new table element and copy over safe attributes
    const safeTable = document.createElement(parsedTable.tagName);

    // Copy safe attributes
    const safeAttributes = ["class", "id", "role"];
    safeAttributes.forEach((attr) => {
      if (parsedTable.hasAttribute(attr)) {
        safeTable.setAttribute(attr, parsedTable.getAttribute(attr));
      }
    });

    // Safely clone the table content
    safeTable.appendChild(parsedTable.cloneNode(true));

    // Add the safe table to the document
    results.appendChild(safeTable);

    // Add event listeners if needed
    addCopyBibtexButtonEventListener();
  }
}

// Load the results from the local storage
function restoreResultsFromStorage() {
  browser.storage.local.get(
    {
      search: {
        paperTitle: "",
        status: "",
        totalHits: 0,
        sentHits: 0,
        excludedCount: 0,
        resultsTable: "",
        currentOffset: 0,
      },
    },
    function (items) {
      console.log("Restoring results from storage: ", items);
      if (items.search.resultsTable !== "") {
        updatePublicationsCount(
          items.search.status,
          items.search.totalHits,
          items.search.sentHits,
          items.search.excludedCount
        );
        updatePublicationsTable(items.search.resultsTable);
        updatePaginationControls(
          items.search.totalHits,
          items.search.sentHits,
          items.search.currentOffset || 0
        );
        var queryInputField = document.getElementById("paperTitle");
        if (queryInputField) {
          queryInputField.value = items.search.paperTitle;
          queryInputField.focus();
        }
      }
    }
  );
}

// Save the results to the local storage
function saveResultsToStorage(
  paperTitle,
  status,
  totalHits,
  sentHits,
  excludedCount,
  resultsTable,
  currentOffset
) {
  console.log(
    "Saving results to storage: ",
    paperTitle,
    status,
    totalHits,
    sentHits,
    excludedCount,
    currentOffset
  );
  browser.storage.local.set({
    search: {
      paperTitle: paperTitle,
      status: status,
      totalHits: totalHits,
      sentHits: sentHits,
      excludedCount: excludedCount,
      resultsTable: resultsTable,
      currentOffset: currentOffset,
    },
  });
}

// Add the event listener to all elements of copyBibtexButton class
function addCopyBibtexButtonEventListener() {
  document.querySelectorAll(".copyBibtexButton").forEach((button) => {
    button.addEventListener("click", function () {
      const url = this.getAttribute("data-url");
      window.copyBibtexToClipboard(url);
    });
  });
}

// Update pagination controls
function updatePaginationControls(totalHits, sentHits, currentOffset) {
  const paginationTop = document.getElementById("pagination");
  const paginationBottom = document.getElementById("pagination-bottom");

  if (!paginationTop || !paginationBottom) return;

  // Clear pagination if no results
  if (totalHits === 0) {
    paginationTop.textContent = "";
    paginationBottom.textContent = "";
    return;
  }

  // Get maxResults from storage to calculate pages
  browser.storage.local.get(
    {
      options: {
        maxResults: 30,
      },
    },
    function (items) {
      const maxResults = Math.min(Math.max(items.options.maxResults, 1), 1000);
      const currentPage = Math.floor(currentOffset / maxResults) + 1;
      const totalPages = Math.ceil(totalHits / maxResults);
      const hasNextPage = currentOffset + sentHits < totalHits;
      const hasPrevPage = currentOffset > 0;

      // Build pagination controls using safe DOM methods
      const paginationControlsTop = createPaginationControls(
        hasPrevPage,
        hasNextPage,
        currentPage,
        totalPages,
        totalHits,
        true
      );
      const paginationControlsBottom = createPaginationControls(
        hasPrevPage,
        hasNextPage,
        currentPage,
        totalPages,
        totalHits,
        false
      );

      // Clear and update both pagination areas
      paginationTop.textContent = "";
      paginationBottom.textContent = "";
      paginationTop.appendChild(paginationControlsTop);
      paginationBottom.appendChild(paginationControlsBottom);

      // Add event listeners for pagination buttons
      addPaginationEventListeners(currentOffset, maxResults);
    }
  );
}

// Create pagination controls using safe DOM methods
function createPaginationControls(
  hasPrevPage,
  hasNextPage,
  currentPage,
  totalPages,
  totalHits,
  isTop
) {
  const container = document.createElement("div");
  container.className = "pagination-controls";

  // Previous button
  const prevButton = document.createElement("button");
  prevButton.className = "pagination-button";
  prevButton.textContent = "← Previous";
  if (hasPrevPage) {
    prevButton.classList.add("prevPageButton");
  } else {
    prevButton.disabled = true;
  }
  container.appendChild(prevButton);

  // Page info
  const pageInfo = document.createElement("span");
  pageInfo.className = "pagination-info";
  pageInfo.textContent = `Page ${currentPage} of ${totalPages} (${totalHits} total results)`;
  container.appendChild(pageInfo);

  // Next button
  const nextButton = document.createElement("button");
  nextButton.className = "pagination-button";
  nextButton.textContent = "Next →";
  if (hasNextPage) {
    nextButton.classList.add("nextPageButton");
  } else {
    nextButton.disabled = true;
  }
  container.appendChild(nextButton);

  return container;
}

// Add event listeners to pagination buttons
function addPaginationEventListeners(currentOffset, maxResults) {
  const queryInputField = document.getElementById("paperTitle");
  const query = queryInputField.value.trim().replace(/\s/g, "+");

  // Previous page buttons (both top and bottom)
  document.querySelectorAll(".prevPageButton").forEach((button) => {
    button.addEventListener("click", function () {
      updateStatus("Loading...", 2000);
      sendMessage({
        script: "popup.js",
        type: "REQUEST_PREVIOUS_PAGE",
        query: query,
        currentOffset: currentOffset,
        maxResults: maxResults,
      });
    });
  });

  // Next page buttons (both top and bottom)
  document.querySelectorAll(".nextPageButton").forEach((button) => {
    button.addEventListener("click", function () {
      updateStatus("Loading...", 2000);
      sendMessage({
        script: "popup.js",
        type: "REQUEST_NEXT_PAGE",
        query: query,
        currentOffset: currentOffset,
        maxResults: maxResults,
      });
    });
  });
}

// Copy the BibTeX to the clipboard
window.copyBibtexToClipboard = function (url) {
  fetch(url)
    .then((response) => response.text())
    .then((data) => {
      // If the keyRenaming option is enabled, then rename the citation key
      // before copying the BibTeX to the clipboard
      browser.storage.local.get(
        {
          options: {
            keyRenaming: true,
          },
        },
        function (items) {
          var keyRenaming = items.options.keyRenaming;
          if (keyRenaming) {
            // Rename the citation key
            var key = data.match(/^@\S+\{(DBLP:\S+\/\S+\/\S+),/)[0];
            if (!key) {
              console.error("Could not find the citation key in the BibTeX");
              return;
            }
            var venue = key.split("/")[1];
            var name = key.split("/")[2].replace(",", "");
            // Remove all digits from name
            name = name.replace(/\d+/g, "");
            // Starting from the end, remove all Capital letters from name
            // stop at the first non-capital letter
            name = name.replace(/[A-Z]+$/, "");
            // extract the year from a string like this: "year = {2020},"
            var year = data.match(/year\s*=\s*\{(\d+)\},/)[1];
            var newCitationKey = name.toLowerCase() + year + venue;
            // Replace the old citation key with the new one:
            // specifically, replace all the text from DBLP until the first comma (excluded)
            // for example, "@inproceedings{DBLP:conf/esem/CalefatoQLK23,..."
            // becomes "@inproceedings{calefato2023esem,..."
            data = data.replace(/DBLP:\S+\/\S+\/\S+/, newCitationKey + ",");
          }
          // Remove timestamp, biburl, and bibsource fields including trailing comma and whitespace
          var removeTimestampBiburlBibsource =
            items.options.removeTimestampBiburlBibsource;
          if (removeTimestampBiburlBibsource) {
            data = data.replace(/\s*timestamp\s*=\s*\{[^}]*\},[\s\n]*/g, "");
            data = data.replace(/\s*biburl\s*=\s*\{[^}]*\},[\s\n]*/g, "");
            data = data.replace(/\s*bibsource\s*=\s*\{[^}]*\}[\s\n,]*/g, "");
          }
          // Remove trailing comma from last field and add newline before closing brace
          data = data.replace(/,(\s*})\s*$/, "\n}");
          // Fix any remaining multiple newlines
          data = data.replace(/\n\s*\n/g, "\n");
          navigator.clipboard.writeText(data).catch((err) => {
            console.error("Could not copy BibTeX to clipboard: ", err);
          });
        }
      );
    })
    .catch((err) => {
      console.error("Could not fetch BibTeX: ", err);
    });
};
