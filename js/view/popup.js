// popup.js
import { updateStatus } from "./commons.js";

console.log("popup.js loaded");
var browser = window.msBrowser || window.browser || window.chrome;

// ------------------------------------- Listeners -------------------------------------

document.addEventListener("DOMContentLoaded", function () {
  // Display extension version in the footer
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

  fetch("../manifest.json", { signal: controller.signal })
    .then((response) => {
      clearTimeout(timeoutId);
      return response.json();
    })
    .then((data) => {
      document.getElementById("version").textContent = data.version;
    })
    .catch((error) => {
      clearTimeout(timeoutId);
      console.error("Could not load manifest version:", error);
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
        publications: [],
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
      buildAndDisplayTable(message.publications);
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
        message.publications,
        message.currentOffset || 0
      );
    }
  });
});

// ------------------------------------- Functions -------------------------------------

// Send a message to the background script and log the response
function sendMessage(dictObject) {
  browser.runtime.sendMessage(dictObject, function (response) {
    if (browser.runtime.lastError) {
      console.error("Popup.js message error:", browser.runtime.lastError.message);
      return;
    }
    if (!response) {
      console.warn("Popup.js received no response from background script");
      return;
    }
    if (response.success === false) {
      console.error(
        `Popup.js received an error from '${response.script}': ${response.error}`
      );
      updateStatus(`Error: ${response.error}`, 5000);
    } else {
      console.log(
        `Popup.js received a response from '${response.script}': ${response.response}`
      );
    }
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
  clearResultsTable();
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
      } (${excludedCount} CoRR abs entries ignored)`;
      if (responseStatus !== "OK") {
        count.classList.add("error");
      } else {
        count.classList.remove("error");
      }
    }
    count.textContent = message;
  }
}

// Validate URL to prevent javascript: protocol XSS attacks
function isValidURL(url) {
  if (!url || typeof url !== "string") {
    return false;
  }
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

// Clear the results table
function clearResultsTable() {
  const results = document.getElementById("results");
  if (results) {
    results.textContent = "";
  }
}

// Build and display the publications table using DOM methods
function buildAndDisplayTable(publications) {
  const results = document.getElementById("results");
  if (!results) return;

  // Clear existing content
  results.textContent = "";

  if (!publications || publications.length === 0) {
    return;
  }

  // Create table
  const table = document.createElement("table");
  table.id = "results-table";
  table.className = "table table-striped table-hover";

  // Create header
  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");

  const thTitle = document.createElement("th");
  thTitle.scope = "col";
  thTitle.colSpan = 2;
  thTitle.textContent = "Title";
  headerRow.appendChild(thTitle);

  const otherHeaders = ["Authors", "Year", "Venue", "DOI", "Access", "BibTeX"];
  otherHeaders.forEach((headerText) => {
    const th = document.createElement("th");
    th.scope = "col";
    th.textContent = headerText;
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);
  table.appendChild(thead);

  // Create body
  const tbody = document.createElement("tbody");
  publications.forEach((result) => {
    const row = document.createElement("tr");

    // Type icon cell
    const typeCell = document.createElement("td");
    const typeImg = document.createElement("img");
    typeImg.className = result.type || "";
    typeImg.title = result.type || "";
    typeImg.src = "../images/pub-type.png";
    typeCell.appendChild(typeImg);
    row.appendChild(typeCell);

    // Title cell with validated URL
    const titleCell = document.createElement("td");
    const titleLink = document.createElement("a");
    if (isValidURL(result.permaLink)) {
      titleLink.href = result.permaLink;
    } else {
      titleLink.href = "#";
    }
    titleLink.target = "_blank";
    titleLink.title = result.permaLink || "";
    titleLink.textContent = result.title;
    titleCell.appendChild(titleLink);
    row.appendChild(titleCell);

    // Authors cell
    const authorsCell = document.createElement("td");
    const authors = Array.isArray(result.authors) ? result.authors : [];
    authorsCell.textContent = authors.join(", ");
    row.appendChild(authorsCell);

    // Year cell
    const yearCell = document.createElement("td");
    yearCell.textContent = result.year;
    row.appendChild(yearCell);

    // Venue cell
    const venueCell = document.createElement("td");
    venueCell.textContent = result.venue;
    row.appendChild(venueCell);

    // DOI cell with validated URL
    const doiCell = document.createElement("td");
    const doiLink = document.createElement("a");
    if (isValidURL(result.doiURL)) {
      doiLink.href = result.doiURL;
    } else {
      doiLink.href = "#";
    }
    doiLink.target = "_blank";
    doiLink.textContent = result.doi;
    doiCell.appendChild(doiLink);
    row.appendChild(doiCell);

    // Access cell
    const accessCell = document.createElement("td");
    accessCell.className = "center";
    const accessImg = document.createElement("img");
    accessImg.className = "access";
    const validAccess = ["open", "closed"].includes(result.access)
      ? result.access
      : "closed";
    accessImg.src = `../images/${validAccess}-access.png`;
    accessImg.title = `This publication is ${validAccess} access`;
    accessCell.appendChild(accessImg);
    row.appendChild(accessCell);

    // BibTeX cell
    const bibtexCell = document.createElement("td");
    bibtexCell.className = "center";
    const bibtexButton = document.createElement("button");
    bibtexButton.className = "copyBibtexButton";
    bibtexButton.title = "Copy BibTex";
    if (isValidURL(result.bibtexLink)) {
      bibtexButton.dataset.url = result.bibtexLink;
    }
    const bibtexImg = document.createElement("img");
    bibtexImg.src = "../images/copy.png";
    bibtexButton.appendChild(bibtexImg);
    bibtexCell.appendChild(bibtexButton);
    row.appendChild(bibtexCell);

    tbody.appendChild(row);
  });
  table.appendChild(tbody);

  results.appendChild(table);

  // Add event listeners for copy buttons
  addCopyBibtexButtonEventListener();
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
        publications: [],
        currentOffset: 0,
      },
    },
    function (items) {
      console.log("Restoring results from storage: ", items);
      if (items.search.publications && items.search.publications.length > 0) {
        updatePublicationsCount(
          items.search.status,
          items.search.totalHits,
          items.search.sentHits,
          items.search.excludedCount
        );
        buildAndDisplayTable(items.search.publications);
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
  publications,
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
      publications: publications,
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

// ------------------------------------- BibTeX Helper Functions -------------------------------------

// Extract author name from DBLP citation key
function extractAuthorFromKey(key) {
  var name = key.split("/")[2].replace(",", "");
  name = name.replace(/\d+/g, "");
  name = name.replace(/[A-Z]+$/, "");
  return name;
}

// Extract venue from DBLP citation key
function extractVenueFromKey(key) {
  return key.split("/")[1];
}

// Extract year from BibTeX data
function extractYearFromBibtex(data) {
  var yearMatch = data.match(/year\s*=\s*\{(\d+)\},/);
  if (!yearMatch || yearMatch.length < 2) {
    return null;
  }
  return yearMatch[1];
}

// Extract first significant word from title
function extractFirstTitleWord(data) {
  var titleMatch = data.match(/title\s*=\s*\{([^}]+)\}/);
  if (!titleMatch) {
    return "";
  }
  var title = titleMatch[1];
  title = title.replace(/\\[a-zA-Z]+\{([^}]*)\}/g, "$1");
  title = title.replace(/[{}\\]/g, "");
  var words = title.split(/\s+/).filter(function(w) { return w.length > 0; });
  var skipWords = ["a", "an", "the", "on", "in", "at"];
  for (var wordItem of words) {
    var word = wordItem.toLowerCase();
    if (skipWords.indexOf(word) === -1 && word.length > 2) {
      return word.replace(/[^a-z0-9]/g, "");
    }
  }
  return "";
}

// Build citation key from fields and options
function buildCitationKey(fields, author, year, venue, title, authorCapitalize, venueUppercase) {
  var authorValue = author.toLowerCase();
  if (authorCapitalize) {
    authorValue = authorValue.charAt(0).toUpperCase() + authorValue.slice(1);
  }
  var venueValue = venueUppercase ? venue.toUpperCase() : venue.toLowerCase();

  return fields.map(function(f) {
    switch (f) {
      case "author": return authorValue;
      case "year": return year;
      case "venue": return venueValue;
      case "title": return title;
      default: return "";
    }
  }).join("");
}

// Clean BibTeX by removing metadata fields
function cleanBibtexMetadata(data) {
  data = data.replace(/\s*timestamp\s*=\s*\{[^}]*\},[\s\n]*/g, "");
  data = data.replace(/\s*biburl\s*=\s*\{[^}]*\},[\s\n]*/g, "");
  data = data.replace(/\s*bibsource\s*=\s*\{[^}]*\}[\s\n,]*/g, "");
  data = data.replace(/,(\s*})\s*$/, "\n}");
  data = data.replace(/\n\s*\n/g, "\n");
  return data;
}

// ------------------------------------- Copy BibTeX -------------------------------------

// Copy the BibTeX to the clipboard
window.copyBibtexToClipboard = function (url) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

  fetch(url, { signal: controller.signal })
    .then((response) => {
      clearTimeout(timeoutId);
      return response.text();
    })
    .then((data) => {
      // If the keyRenaming option is enabled, then rename the citation key
      // before copying the BibTeX to the clipboard
      browser.storage.local.get(
        {
          options: {
            keyRenaming: true,
            citationKeyFields: ["author", "year", "venue"],
            authorCapitalize: false,
            venueUppercase: false,
          },
        },
        function (items) {
          var keyRenaming = items.options.keyRenaming;
          var citationKeyFields = items.options.citationKeyFields;
          var authorCapitalize = items.options.authorCapitalize;
          var venueUppercase = items.options.venueUppercase;

          // Handle migration from old format
          if (!citationKeyFields && items.options.citationKeyPattern) {
            citationKeyFields = items.options.citationKeyPattern.split("-");
          }
          if (!citationKeyFields || citationKeyFields.length === 0) {
            citationKeyFields = ["author", "year", "venue"];
          }

          if (keyRenaming) {
            var keyMatch = data.match(/^@\S+\{(DBLP:\S+\/\S+\/\S+),/);
            if (!keyMatch || keyMatch.length < 1) {
              console.error("Could not find the citation key in the BibTeX");
              updateStatus("Error: Invalid BibTeX format", 3000);
              return;
            }
            var key = keyMatch[0];
            var author = extractAuthorFromKey(key);
            var venue = extractVenueFromKey(key);
            var year = extractYearFromBibtex(data);
            if (!year) {
              console.error("Could not find the year in the BibTeX");
              updateStatus("Error: Invalid BibTeX format (missing year)", 3000);
              return;
            }
            var title = extractFirstTitleWord(data);
            var newCitationKey = buildCitationKey(
              citationKeyFields, author, year, venue, title,
              authorCapitalize, venueUppercase
            );
            data = data.replace(/DBLP:\S+\/\S+\/\S+/, newCitationKey + ",");
          }

          if (items.options.removeTimestampBiburlBibsource) {
            data = cleanBibtexMetadata(data);
          }

          navigator.clipboard.writeText(data).catch(function(err) {
            console.error("Could not copy BibTeX to clipboard: ", err);
          });
        }
      );
    })
    .catch((err) => {
      clearTimeout(timeoutId);
      if (err.name === "AbortError") {
        console.error("Request timeout: Could not fetch BibTeX in time");
        updateStatus("Error: BibTeX request timeout", 3000);
      } else {
        console.error("Could not fetch BibTeX: ", err);
        updateStatus("Error: Could not fetch BibTeX", 3000);
      }
    });
};

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
        totalHits
      );
      const paginationControlsBottom = createPaginationControls(
        hasPrevPage,
        hasNextPage,
        currentPage,
        totalPages,
        totalHits
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
  totalHits
) {
  const container = document.createElement("div");
  container.className = "pagination-controls";

  // Previous button
  const prevButton = document.createElement("button");
  prevButton.className = "pagination-button";
  prevButton.textContent = "← Prev";
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
