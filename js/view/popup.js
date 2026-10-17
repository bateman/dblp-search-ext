/**
 * @file popup.js
 * @description Main UI component for the extension popup. Handles search input,
 * results display, BibTeX copying, and pagination.
 */

import { updateStatus, clearStatus } from "./commons.js";
import { isValidURL, parseSearchWithDefaults } from "../utils/validation.js";
import { processBibtexData, buildBibtexFilename } from "../utils/bibtex.js";
import {
  isValidZoteroTargetId,
  isZoteroPermissionDeclared,
  requestZoteroPermission,
  zoteroPermissionFailureMessage,
} from "../utils/zotero.js";

console.log("popup.js loaded");
const browser = window.msBrowser || window.browser || window.chrome;

// Track currently selected row for keyboard navigation
let selectedRowIndex = -1;

// Publication types in filter-menu order, with their filter label and color
const PUB_TYPES = [
  { type: "article", label: "Article", color: "#c32b72" },
  { type: "inproceedings", label: "Conf", color: "#196ca3" },
  { type: "book", label: "Book", color: "#f8c91f" },
  { type: "incollection", label: "Chapter", color: "#ef942d" },
  { type: "editor", label: "Editor", color: "#33c3ba" },
  { type: "misc", label: "Misc", color: "#606b70" },
  { type: "refwork", label: "Ref", color: "#96ad2d" }
];

// Track current sort and filter settings
let currentSort = { field: "none", direction: "asc" };
// Publication types unchecked in the type filter (empty = show all)
const hiddenTypes = new Set();

// Store original publications for filtering/sorting
let originalPublications = [];

// Cached "Save to Zotero" option state, refreshed from storage whenever the
// results table is rebuilt. Used by the keyboard shortcut and context menu,
// which run synchronously and cannot wait for a storage read.
let zoteroEnabled = true;

// Fallback timeout (ms) for the search spinner. The spinner normally clears as
// soon as a search response arrives; this is only a safety net so it can never
// hang forever if a response message is lost. The model aborts after 10s, so
// 15s comfortably covers a worst-case round trip.
const SEARCH_STATUS_FALLBACK_MS = 15000;

// Track if filter dropdown should stay open after rebuild
let keepFilterDropdownOpen = false;

// Number of the latest search or page request. Replies to older requests are
// dropped, so a slow earlier search cannot overwrite a newer one.
let latestSearchId = 0;

// =====================================
// Event Listeners
// =====================================

document.addEventListener("DOMContentLoaded", function () {
  // Display extension version in the footer
  document.getElementById("version").textContent = browser.runtime.getManifest().version;

  // Restore popup width from storage
  restorePopupWidth();

  // Prime the cached Save to Zotero option state
  refreshZoteroButtonVisibility();

  // if the content of the popup was saved in the local storage, then restore it
  restoreResultsFromStorage();

  const queryInputField = document.getElementById("paperTitle");
  if (queryInputField) {
    queryInputField.focus();
  }

  // Get the highlighted text from the current tab
  browser.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    const tab = tabs[0]; // Now 'tab' is defined
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
    // Drop the reply of a search still in flight, so it can't refill the table
    latestSearchId++;
    requestClearResults(true);
  });

  // Keyboard navigation and shortcuts
  document.addEventListener("keydown", handleKeyboardShortcuts);
});

/**
 * Checks if keyboard shortcuts should be ignored based on active element
 * @returns {boolean} True if shortcuts should be ignored
 */
function shouldIgnoreShortcuts() {
  const activeTag = document.activeElement ? document.activeElement.tagName : "";
  return activeTag === "SELECT" || activeTag === "INPUT" || activeTag === "BUTTON";
}

/**
 * Handles jumping from search input to first result row
 * @param {KeyboardEvent} event - The keyboard event
 * @param {NodeList} rows - The result table rows
 * @param {HTMLInputElement} queryInputField - The search input field
 * @returns {boolean} True if the event was handled
 */
function handleSearchInputArrowKeys(event, rows, queryInputField) {
  if (document.activeElement !== queryInputField) {
    return false;
  }
  if ((event.key === "ArrowDown" || event.key === "ArrowUp") && rows.length > 0) {
    event.preventDefault();
    queryInputField.blur();
    selectedRowIndex = 0;
    const firstRow = rows.item(0);
    if (firstRow) {
      firstRow.classList.add("selected");
      firstRow.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }
  return true;
}

/**
 * Executes keyboard shortcut action on selected row
 * @param {string} key - The pressed key
 * @param {NodeList} rows - The result table rows
 */
function executeRowShortcut(key, rows) {
  if (selectedRowIndex < 0 || selectedRowIndex >= rows.length) {
    return;
  }
  const selectedRow = rows.item(selectedRowIndex);
  switch (key.toLowerCase()) {
    case "c":
      copySelectedRowBibtex(selectedRow);
      break;
    case "d":
      downloadSelectedRowBibtex(selectedRow);
      break;
    case "z":
      saveSelectedRowZotero(selectedRow);
      break;
    case "b":
      openSelectedRowDblp(selectedRow);
      break;
    case "o":
      openSelectedRowDoi(selectedRow);
      break;
  }
}

/**
 * Handles arrow key navigation in results table
 * @param {KeyboardEvent} event - The keyboard event
 * @param {NodeList} rows - The result table rows
 * @returns {boolean} True if the event was handled
 */
function handleArrowNavigation(event, rows) {
  if (event.key === "ArrowDown") {
    event.preventDefault();
    navigateRows(rows, 1);
    return true;
  }
  if (event.key === "ArrowUp") {
    event.preventDefault();
    navigateRows(rows, -1);
    return true;
  }
  return false;
}

/**
 * Main keyboard shortcut handler
 * @param {KeyboardEvent} event - The keyboard event
 */
function handleKeyboardShortcuts(event) {
  const rows = document.querySelectorAll("#results-table tbody tr");
  const queryInputField = document.getElementById("paperTitle");

  if (handleSearchInputArrowKeys(event, rows, queryInputField)) {
    return;
  }

  if (shouldIgnoreShortcuts() || rows.length === 0) {
    return;
  }

  if (handleArrowNavigation(event, rows)) {
    return;
  }

  if (hasModifierKey(event)) {
    return;
  }

  const key = event.key.toLowerCase();
  if (["c", "d", "z", "b", "o"].includes(key)) {
    executeRowShortcut(event.key, rows);
  }
}

/**
 * Checks whether a keyboard event carries a modifier that makes it a browser
 * chord (Ctrl+C, Cmd+Z, ...) rather than a row shortcut
 * @param {KeyboardEvent} event - The keyboard event
 * @returns {boolean} True when a chord modifier is pressed
 */
function hasModifierKey(event) {
  return event.ctrlKey || event.metaKey || event.altKey;
}

// =====================================
// Core Functions
// =====================================

/**
 * Sends a message to the background script and handles the response
 * @param {Object} dictObject - Message object to send
 * @param {string} dictObject.script - Identifier of the sending script
 * @param {string} dictObject.type - Message type
 * @param {function(Object): void} [onResult] - Called with the reply's result
 */
function sendMessage(dictObject, onResult) {
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
      if (onResult && response.result) {
        onResult(response.result);
      }
    }
  });
}

/**
 * Sends a search or page request and displays its result, unless a newer
 * request was sent in the meantime
 * @param {Object} message - REQUEST_SEARCH_PUBLICATIONS, REQUEST_NEXT_PAGE or
 *   REQUEST_PREVIOUS_PAGE message
 */
function sendSearchRequest(message) {
  latestSearchId++;
  const searchId = latestSearchId;
  sendMessage(message, function (response) {
    if (searchId === latestSearchId) {
      displaySearchResult(response);
    } else {
      console.log("Popup.js dropped the result of a replaced search.");
    }
  });
}

/**
 * Displays the result of a search or page request and saves it to storage
 * @param {Object} message - RESPONSE_SEARCH_PUBLICATIONS message built by view.js
 */
function displaySearchResult(message) {
  // Result (or error) is in: stop the search spinner.
  clearStatus();
  // Ensure all values have valid defaults to prevent NaN/undefined display
  const responseStatus = message.responseStatus || "OK";
  const totalHits = typeof message.totalHits === "number" ? message.totalHits : 0;
  const sentHits = typeof message.sentHits === "number" ? message.sentHits : 0;
  const excludedCount = typeof message.excludedCount === "number" ? message.excludedCount : 0;
  const currentOffset = typeof message.currentOffset === "number" ? message.currentOffset : 0;
  const publications = Array.isArray(message.publications) ? message.publications : [];
  const errorMessage = message.errorMessage || "";

  console.log(
    "Popup.js updating publications count: ",
    responseStatus,
    totalHits,
    sentHits,
    excludedCount,
    currentOffset
  );
  updatePublicationsCount(responseStatus, totalHits, errorMessage, sentHits, excludedCount);
  console.log("Popup.js updating publications table.");
  buildAndDisplayTable(publications);
  updatePaginationControls(totalHits, sentHits, currentOffset, excludedCount);
  saveResultsToStorage(
    document.getElementById("paperTitle").value,
    responseStatus,
    totalHits,
    sentHits,
    excludedCount,
    publications,
    currentOffset
  );
}

/**
 * Requests a publication search from the background script
 * @param {string} q - The search query string
 * @param {number} [offset=0] - Pagination offset
 */
function requestSearchDblp(q, offset = 0) {
  // Update status to let user know search has started. The spinner persists
  // until the response arrives (cleared in displaySearchResult); the fallback
  // timeout only guards against a lost response.
  updateStatus("Searching...", SEARCH_STATUS_FALLBACK_MS);
  // Clear existing results, but not the paperTitle
  requestClearResults(false);
  // Send message to background.js
  sendSearchRequest({
    script: "popup.js",
    type: "REQUEST_SEARCH_PUBLICATIONS",
    query: q,
    offset: offset,
  });
}

/**
 * Resets filter and sort settings to defaults
 */
function resetFiltersAndSort() {
  currentSort = { field: "none", direction: "asc" };
  hiddenTypes.clear();
  originalPublications = [];
  keepFilterDropdownOpen = false;
}

/**
 * Clears the current search results and optionally the search input
 * @param {boolean} [clearTitle=true] - Whether to also clear the search input field
 */
function requestClearResults(clearTitle = true) {
  console.log("Clearing existing results...");
  if (clearTitle) {
    document.getElementById("paperTitle").value = "";
  }
  resetFiltersAndSort();
  updatePublicationsCount("RESET", 0);
  clearResultsTable();
  updatePaginationControls(0, 0, 0);
}

/**
 * Describes the CoRR abs (arXiv) entries hidden from the results, so the
 * count line explains why fewer rows are shown than were found. The model
 * only counts them in the current response, hence "on this page" when the
 * results span several pages.
 * @param {number} totalHits - Total number of matching publications
 * @param {number} sentHits - Number of publications in the current response
 * @param {number} excludedCount - CoRR abs entries hidden from the current response
 * @returns {string} e.g. " (3 CoRR abs entries hidden)", or "" when none
 */
function describeHiddenEntries(totalHits, sentHits, excludedCount) {
  if (excludedCount <= 0) {
    return "";
  }
  const entries = excludedCount === 1 ? "entry" : "entries";
  const where = totalHits > sentHits ? " on this page" : "";
  return ` (${excludedCount} CoRR abs ${entries} hidden${where})`;
}

/**
 * Updates the publication count display in the UI
 * @param {string} responseStatus - HTTP response status or "RESET"
 * @param {number} totalHits - Total number of matching publications
 * @param {string} [errorMessage=""] - Human-readable error detail when the search failed
 * @param {number} [sentHits=0] - Number of publications in the current response
 * @param {number} [excludedCount=0] - CoRR abs entries hidden from the current response
 */
function updatePublicationsCount(
  responseStatus,
  totalHits,
  errorMessage = "",
  sentHits = 0,
  excludedCount = 0
) {
  const count = document.getElementById("count");
  if (count) {
    let message = "";
    if (responseStatus === "RESET") {
      count.classList.remove("error");
    } else if (responseStatus !== "OK") {
      // On failure, show the cause instead of a misleading "found 0, shown 0"
      message = errorMessage || `Query failed (${responseStatus}).`;
      count.classList.add("error");
    } else {
      message = `Query ${responseStatus}: found ${totalHits}` +
        describeHiddenEntries(totalHits, sentHits, excludedCount);
      count.classList.remove("error");
    }
    count.textContent = message;
  }
}


/**
 * Clears the results table content
 */
function clearResultsTable() {
  const results = document.getElementById("results");
  if (results) {
    results.textContent = "";
  }
}

/**
 * Creates a table cell with a type icon
 * @param {string} type - Publication type
 * @returns {HTMLTableCellElement} The created cell
 */
function createTypeCell(type) {
  const cell = document.createElement("td");
  const img = document.createElement("img");
  const safeType = normalizeType(type);
  img.className = safeType;
  img.title = safeType;
  img.src = "../images/pub-type.png";
  cell.appendChild(img);
  return cell;
}

/**
 * Creates a table cell with a linked title
 * @param {string} title - Publication title
 * @param {string} permaLink - DBLP permalink
 * @returns {HTMLTableCellElement} The created cell
 */
function createTitleCell(title, permaLink) {
  const cell = document.createElement("td");
  const link = document.createElement("a");
  link.href = isValidURL(permaLink) ? permaLink : "#";
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.title = permaLink || "";
  link.textContent = title;
  cell.appendChild(link);
  return cell;
}

/**
 * Creates a table cell with DOI link
 * @param {string} doi - DOI identifier
 * @param {string} doiURL - DOI URL
 * @returns {HTMLTableCellElement} The created cell
 */
function createDoiCell(doi, doiURL) {
  const cell = document.createElement("td");
  const link = document.createElement("a");
  link.href = isValidURL(doiURL) ? doiURL : "#";
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = doi;
  cell.appendChild(link);
  return cell;
}

/**
 * Creates an access indicator cell
 * @param {string} access - Access type (open/closed)
 * @returns {HTMLTableCellElement} The created cell
 */
function createAccessCell(access) {
  const cell = document.createElement("td");
  cell.className = "center";
  const img = document.createElement("img");
  img.className = "access";
  const validAccess = ["open", "closed"].includes(access) ? access : "closed";
  img.src = `../images/${validAccess}-access.png`;
  img.title = `This publication is ${validAccess} access`;
  cell.appendChild(img);
  return cell;
}

/**
 * Creates a BibTeX action button (copy or download)
 * @param {string} bibtexLink - URL to fetch BibTeX
 * @param {string} className - CSS class for the button
 * @param {string} title - Tooltip text
 * @param {string} iconSrc - Path to the button icon
 * @returns {HTMLButtonElement} The created button
 */
function createBibtexButton(bibtexLink, className, title, iconSrc) {
  const button = document.createElement("button");
  button.className = className;
  button.title = title;
  if (isValidURL(bibtexLink)) {
    button.dataset.url = bibtexLink;
  }
  const img = document.createElement("img");
  img.src = iconSrc;
  button.appendChild(img);
  return button;
}

/**
 * Creates a BibTeX actions cell with copy and download buttons
 * @param {string} bibtexLink - URL to fetch BibTeX
 * @returns {HTMLTableCellElement} The created cell
 */
function createBibtexCell(bibtexLink) {
  const cell = document.createElement("td");
  cell.className = "center";
  cell.appendChild(
    createBibtexButton(
      bibtexLink, "copyBibtexButton", "Copy BibTeX", "../images/copy.png"
    )
  );
  cell.appendChild(
    createBibtexButton(
      bibtexLink, "downloadBibtexButton", "Download BibTeX", "../images/download.png"
    )
  );
  const zoteroButton = createBibtexButton(
    bibtexLink, "saveZoteroButton", "Save to Zotero", "../images/zotero.png"
  );
  if (!zoteroEnabled) {
    zoteroButton.style.display = "none";
  }
  cell.appendChild(zoteroButton);
  return cell;
}

/**
 * Creates a publication row for the results table
 * @param {Object} result - Publication data
 * @param {number} index - Row index
 * @returns {HTMLTableRowElement} The created row
 */
function createPublicationRow(result, index) {
  const row = document.createElement("tr");
  row.dataset.index = index;
  row.dataset.dblpUrl = result.permaLink || "";
  row.dataset.doiUrl = result.doiURL || "";
  row.dataset.bibtexUrl = result.bibtexLink || "";

  row.appendChild(createTypeCell(result.type));
  row.appendChild(createTitleCell(result.title, result.permaLink));

  const authorsCell = document.createElement("td");
  const authors = Array.isArray(result.authors) ? result.authors : [];
  const authorsText = authors.join(", ");
  const authorsInner = document.createElement("div");
  authorsInner.className = "authors-cell";
  authorsInner.textContent = authorsText;
  authorsCell.appendChild(authorsInner);
  authorsCell.title = authorsText;
  row.appendChild(authorsCell);

  const yearCell = document.createElement("td");
  yearCell.textContent = result.year;
  row.appendChild(yearCell);

  const venueCell = document.createElement("td");
  venueCell.textContent = result.venue;
  venueCell.title = result.venue || "";
  row.appendChild(venueCell);

  row.appendChild(createDoiCell(result.doi, result.doiURL));
  row.appendChild(createAccessCell(result.access));
  row.appendChild(createBibtexCell(result.bibtexLink));

  // Add click handler to select row
  row.addEventListener("click", function (e) {
    // Don't select if clicking on a link or button (or their children)
    if (e.target.closest("a") || e.target.closest("button")) {
      return;
    }
    selectRow(index);
  });

  // Add right-click handler to open the actions context menu
  row.addEventListener("contextmenu", function (e) {
    showContextMenu(e, row);
  });

  return row;
}

/**
 * Maps a publication type to a known type, treating unknown ones as "misc"
 * @param {string} type - The publication type
 * @returns {string} A type listed in PUB_TYPES
 */
function normalizeType(type) {
  return PUB_TYPES.some((t) => t.type === type) ? type : "misc";
}

/**
 * Gets the sortable value for a publication based on field
 * @param {Object} pub - The publication object
 * @param {string} field - The field to sort by
 * @returns {string|number} The sortable value
 */
function getSortValue(pub, field) {
  if (field === "year") {
    return parseInt(pub.year, 10) || 0;
  }
  if (field === "venue") {
    return (pub.venue || "").toLowerCase();
  }
  if (field === "author") {
    return Array.isArray(pub.authors) && pub.authors.length > 0
      ? pub.authors[0].toLowerCase()
      : "";
  }
  return "";
}

/**
 * Compares two values for sorting
 * @param {string|number} valA - First value
 * @param {string|number} valB - Second value
 * @param {string} direction - Sort direction ("asc" or "desc")
 * @returns {number} Comparison result
 */
function compareValues(valA, valB, direction) {
  let comparison = 0;
  if (valA < valB) {
    comparison = -1;
  } else if (valA > valB) {
    comparison = 1;
  }
  return direction === "desc" ? -comparison : comparison;
}

/**
 * Applies current sort and filter settings to publications
 * @param {Object[]} publications - Original array of publication objects
 * @returns {Object[]} Filtered and sorted publications array
 */
function applyFiltersAndSort(publications) {
  if (!publications || publications.length === 0) {
    return [];
  }

  // Apply filters
  let filtered = publications.filter(function(pub) {
    return !hiddenTypes.has(normalizeType(pub.type));
  });

  // Apply sorting
  if (currentSort.field !== "none") {
    filtered = filtered.slice().sort(function(a, b) {
      const valA = getSortValue(a, currentSort.field);
      const valB = getSortValue(b, currentSort.field);
      return compareValues(valA, valB, currentSort.direction);
    });
  }

  return filtered;
}

/**
 * Gets the sort indicator character for a column
 * @param {string} field - The field name
 * @returns {string} Sort indicator character
 */
function getSortIndicator(field) {
  if (field === "none") {
    // Title column shows indicator only when in default order
    return currentSort.field === "none" ? "\u2022" : ""; // • or empty
  }
  if (currentSort.field !== field) {
    return "\u2195"; // ↕ (unsorted)
  }
  return currentSort.direction === "asc" ? "\u2191" : "\u2193"; // ↑ or ↓
}

/**
 * Handles click on a sortable column header
 * @param {string} field - The field to sort by ("none" resets to default order)
 */
function handleSortClick(field) {
  if (field === "none") {
    // Reset to default API order
    currentSort = { field: "none", direction: "asc" };
  } else if (currentSort.field === field) {
    // Toggle direction if same field
    currentSort.direction = currentSort.direction === "asc" ? "desc" : "asc";
  } else {
    // New field, default to descending for year, ascending for others
    currentSort.field = field;
    currentSort.direction = field === "year" ? "desc" : "asc";
  }
  rebuildTableWithFilters();
}

/**
 * Creates a sortable table header cell
 * @param {string} text - Header text
 * @param {string} field - Field name for sorting
 * @returns {HTMLTableCellElement} The header cell
 */
function createSortableHeader(text, field) {
  const th = document.createElement("th");
  th.scope = "col";
  th.className = "sortable-header";
  th.dataset.field = field;
  th.title = field === "none" ? "Click to reset to default order" : "Click to sort by " + text;

  const textSpan = document.createElement("span");
  textSpan.textContent = text;
  th.appendChild(textSpan);

  const indicator = document.createElement("span");
  indicator.className = "sort-indicator";
  indicator.textContent = getSortIndicator(field);
  th.appendChild(indicator);

  th.addEventListener("click", function() {
    handleSortClick(field);
  });

  return th;
}

/**
 * Creates the type column header with filter dropdown
 * @returns {HTMLTableCellElement} The header cell with filter
 */
function createTypeFilterHeader() {
  const th = document.createElement("th");
  th.scope = "col";
  th.className = "filter-header";

  const wrapper = document.createElement("div");
  wrapper.className = "filter-header-wrapper";

  const filterBtn = document.createElement("button");
  filterBtn.className = "filter-btn" + (hiddenTypes.size > 0 ? " active" : "");
  filterBtn.title = "Filter by type";
  filterBtn.textContent = "\u25BC"; // ▼

  const dropdown = document.createElement("div");
  dropdown.className = "filter-dropdown" + (keepFilterDropdownOpen ? " show" : "");
  keepFilterDropdownOpen = false;

  PUB_TYPES.forEach(function(ft) {
    const item = document.createElement("label");
    item.className = "filter-dropdown-item";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.dataset.type = ft.type;
    checkbox.checked = !hiddenTypes.has(ft.type);

    checkbox.addEventListener("change", function(e) {
      e.stopPropagation();
      if (this.checked) {
        hiddenTypes.delete(ft.type);
      } else {
        hiddenTypes.add(ft.type);
      }
      keepFilterDropdownOpen = true;
      rebuildTableWithFilters();
    });

    const colorBox = document.createElement("span");
    colorBox.className = "filter-color-box";
    colorBox.style.backgroundColor = ft.color;

    const label = document.createElement("span");
    label.textContent = ft.label;

    item.appendChild(checkbox);
    item.appendChild(colorBox);
    item.appendChild(label);
    dropdown.appendChild(item);
  });

  filterBtn.addEventListener("click", function(e) {
    e.stopPropagation();
    const wasOpen = dropdown.classList.contains("show");
    // Close any other open dropdowns first
    document.querySelectorAll(".filter-dropdown.show").forEach(function(d) {
      d.classList.remove("show");
    });
    if (!wasOpen) {
      dropdown.classList.add("show");
    }
  });

  // Close on click outside (using wrapper to scope the handler)
  dropdown.addEventListener("click", function(e) {
    e.stopPropagation();
  });

  wrapper.appendChild(filterBtn);
  wrapper.appendChild(dropdown);
  th.appendChild(wrapper);

  return th;
}

// Global click handler to close filter dropdowns and context menu (added once)
document.addEventListener("click", function() {
  document.querySelectorAll(".filter-dropdown.show").forEach(function(d) {
    d.classList.remove("show");
  });
  hideContextMenu();
});

/**
 * Rebuilds the table with current filter and sort settings
 */
function rebuildTableWithFilters() {
  const filtered = applyFiltersAndSort(originalPublications);
  displayTableWithPublications(filtered);
}

/**
 * Creates the table header row with sort/filter controls
 * @returns {HTMLTableSectionElement} The thead element
 */
function createTableHeader() {
  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");

  // Type column with filter dropdown
  headerRow.appendChild(createTypeFilterHeader());

  // Title column (click to reset to default API order)
  headerRow.appendChild(createSortableHeader("Title", "none"));

  // Sortable columns: Authors, Year, Venue
  headerRow.appendChild(createSortableHeader("Authors", "author"));
  headerRow.appendChild(createSortableHeader("Year", "year"));
  headerRow.appendChild(createSortableHeader("Venue", "venue"));

  // Non-sortable columns: DOI, Access, BibTeX
  const nonSortableHeaders = ["DOI", "Access", "BibTeX"];
  nonSortableHeaders.forEach(function(headerText) {
    const th = document.createElement("th");
    th.scope = "col";
    th.textContent = headerText;
    headerRow.appendChild(th);
  });

  thead.appendChild(headerRow);
  return thead;
}

/**
 * Displays publications in the table (internal function)
 * @param {Object[]} publications - Array of publication objects to display
 */
function displayTableWithPublications(publications) {
  const results = document.getElementById("results");
  if (!results) return;

  // Reset keyboard navigation selection
  resetSelectedRow();

  // Clear existing content
  results.textContent = "";

  // Don't show anything if no original publications
  if (!originalPublications || originalPublications.length === 0) {
    return;
  }

  // Create table (always show header so filters remain accessible)
  const table = document.createElement("table");
  table.id = "results-table";
  table.className = "table table-striped table-hover";

  // Create header with integrated sort/filter controls
  table.appendChild(createTableHeader());

  // Create body
  const tbody = document.createElement("tbody");
  if (!publications || publications.length === 0) {
    // Show message row when all results are filtered out
    const emptyRow = document.createElement("tr");
    const emptyCell = document.createElement("td");
    emptyCell.colSpan = 8;
    emptyCell.className = "no-results-message";
    emptyCell.textContent = "No publications match the current filters.";
    emptyRow.appendChild(emptyCell);
    tbody.appendChild(emptyRow);
  } else {
    publications.forEach((result, index) => {
      tbody.appendChild(createPublicationRow(result, index));
    });
  }
  table.appendChild(tbody);

  // Add keyboard shortcuts hint above the table
  const hint = document.createElement("div");
  hint.id = "keyboard-hint";
  hint.textContent = buildKeyboardHint();
  results.appendChild(hint);

  results.appendChild(table);

  // Clamp the authors column to the height of each row's title
  clampAuthorsToTitleHeight(table);

  // Add event listeners for copy, download, and save-to-Zotero buttons
  addCopyBibtexButtonEventListener();
  addDownloadBibtexButtonEventListener();
  addSaveZoteroButtonEventListener();

  // Sync the Save to Zotero buttons with the current option value
  refreshZoteroButtonVisibility();
}

/**
 * Limits the authors cell height to the height of the title in the same row.
 * Authors wrap onto multiple lines and are truncated with an ellipsis when
 * they exceed the number of lines occupied by the title.
 * @param {HTMLTableElement} table - The results table
 */
function clampAuthorsToTitleHeight(table) {
  const rows = table.querySelectorAll("tbody tr");
  rows.forEach(function (row) {
    const titleLink = row.querySelector("td:nth-child(2) a");
    const authorsInner = row.querySelector("td:nth-child(3) .authors-cell");
    if (!titleLink || !authorsInner) return;

    const titleHeight = titleLink.getBoundingClientRect().height;
    const lineHeight = parseFloat(getComputedStyle(authorsInner).lineHeight);
    if (!titleHeight || !lineHeight) return;

    const lines = Math.max(1, Math.floor(titleHeight / lineHeight));
    authorsInner.style.webkitLineClamp = String(lines);
    authorsInner.style.lineClamp = String(lines);
  });
}

/**
 * Builds and displays the publications results table using safe DOM methods
 * @param {Object[]} publications - Array of publication objects to display
 */
function buildAndDisplayTable(publications) {
  // Store original publications for filtering/sorting
  originalPublications = publications || [];

  // Apply filters and sort, then display
  const filtered = applyFiltersAndSort(originalPublications);
  displayTableWithPublications(filtered);
}


/**
 * Restores previous search results from browser local storage
 */
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
      const searchData = parseSearchWithDefaults(items);

      if (searchData.publications.length === 0) {
        return;
      }

      updatePublicationsCount(
        searchData.status,
        searchData.totalHits,
        "",
        searchData.sentHits,
        searchData.excludedCount
      );
      buildAndDisplayTable(searchData.publications);
      updatePaginationControls(
        searchData.totalHits,
        searchData.sentHits,
        searchData.currentOffset,
        searchData.excludedCount
      );
      const queryInputField = document.getElementById("paperTitle");
      if (queryInputField) {
        queryInputField.value = searchData.paperTitle;
        queryInputField.focus();
      }
    }
  );
}

/**
 * Saves search results to browser local storage for persistence
 * @param {string} paperTitle - The search query
 * @param {string} status - Response status
 * @param {number} totalHits - Total number of matching publications
 * @param {number} sentHits - Number of publications in current response
 * @param {number} excludedCount - Number of excluded publications
 * @param {Object[]} publications - Array of publication objects
 * @param {number} currentOffset - Current pagination offset
 */
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

/**
 * Restores popup width from browser local storage
 */
function restorePopupWidth() {
  browser.storage.local.get(
    {
      options: {
        popupWidth: 800,
      },
    },
    function (items) {
      const width = Math.min(
        Math.max(items.options.popupWidth || 800, 500),
        800
      );
      document.body.style.width = width + "px";
    }
  );
}

/**
 * Adds click event listeners to all BibTeX copy buttons
 */
function addCopyBibtexButtonEventListener() {
  document.querySelectorAll(".copyBibtexButton").forEach((button) => {
    button.addEventListener("click", function () {
      const url = this.getAttribute("data-url");
      window.copyBibtexToClipboard(url);
    });
  });
}

/**
 * Adds click event listeners to all BibTeX download buttons
 */
function addDownloadBibtexButtonEventListener() {
  document.querySelectorAll(".downloadBibtexButton").forEach((button) => {
    button.addEventListener("click", function () {
      const url = this.getAttribute("data-url");
      window.downloadBibtex(url);
    });
  });
}

/**
 * Adds click event listeners to all Save to Zotero buttons
 */
function addSaveZoteroButtonEventListener() {
  document.querySelectorAll(".saveZoteroButton").forEach((button) => {
    button.addEventListener("click", function () {
      const url = this.getAttribute("data-url");
      window.saveBibtexToZotero(url);
    });
  });
}

// =====================================
// Keyboard Navigation Functions
// =====================================

/**
 * Navigates through result rows using arrow keys
 * @param {NodeList} rows - List of table row elements
 * @param {number} direction - Direction to navigate (1 for down, -1 for up)
 */
function navigateRows(rows, direction) {
  // Remove selection from current row
  const currentRow = rows.item(selectedRowIndex);
  if (currentRow) {
    currentRow.classList.remove("selected");
  }

  // Calculate new index
  if (selectedRowIndex === -1) {
    // No row selected yet, always start from first row
    selectedRowIndex = 0;
  } else {
    selectedRowIndex += direction;
  }

  // Clamp to valid range
  if (selectedRowIndex < 0) {
    selectedRowIndex = 0;
  } else if (selectedRowIndex >= rows.length) {
    selectedRowIndex = rows.length - 1;
  }

  // Select new row
  const newRow = rows.item(selectedRowIndex);
  if (newRow) {
    newRow.classList.add("selected");
    newRow.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }
}

/**
 * Resets the selected row index (called when table is rebuilt)
 */
function resetSelectedRow() {
  selectedRowIndex = -1;
}

/**
 * Selects a specific row by its index (used for click selection)
 * @param {number} index - The index of the row to select
 */
function selectRow(index) {
  const rows = document.querySelectorAll("#results-table tbody tr");
  if (index < 0 || index >= rows.length) {
    return;
  }

  // Remove selection from current row
  const currentRow = rows.item(selectedRowIndex);
  if (currentRow) {
    currentRow.classList.remove("selected");
  }

  // Select new row
  selectedRowIndex = index;
  const newRow = rows.item(selectedRowIndex);
  if (newRow) {
    newRow.classList.add("selected");
  }
}

/**
 * Copies BibTeX for the selected row (silently does nothing when it has none)
 * @param {HTMLTableRowElement} row - The selected row element
 */
function copySelectedRowBibtex(row) {
  const bibtexUrl = row.dataset.bibtexUrl;
  if (bibtexUrl && isValidURL(bibtexUrl)) {
    window.copyBibtexToClipboard(bibtexUrl);
  }
}

/**
 * Downloads BibTeX for the selected row (silently does nothing when it has none)
 * @param {HTMLTableRowElement} row - The selected row element
 */
function downloadSelectedRowBibtex(row) {
  const bibtexUrl = row.dataset.bibtexUrl;
  if (bibtexUrl && isValidURL(bibtexUrl)) {
    window.downloadBibtex(bibtexUrl);
  }
}

/**
 * Saves BibTeX for the selected row to Zotero
 * @param {HTMLTableRowElement} row - The selected row element
 */
function saveSelectedRowZotero(row) {
  if (!zoteroEnabled) {
    return;
  }
  const bibtexUrl = row.dataset.bibtexUrl;
  if (bibtexUrl && isValidURL(bibtexUrl)) {
    window.saveBibtexToZotero(bibtexUrl);
  } else {
    updateStatus("No BibTeX available", 2000);
  }
}

/**
 * Opens DBLP page for the selected row
 * @param {HTMLTableRowElement} row - The selected row element
 */
function openSelectedRowDblp(row) {
  const dblpUrl = row.dataset.dblpUrl;
  if (dblpUrl && isValidURL(dblpUrl)) {
    browser.tabs.create({ url: dblpUrl });
  } else {
    updateStatus("No DBLP link available", 2000);
  }
}

/**
 * Opens DOI page for the selected row (silently does nothing when it has none)
 * @param {HTMLTableRowElement} row - The selected row element
 */
function openSelectedRowDoi(row) {
  const doiUrl = row.dataset.doiUrl;
  if (doiUrl && isValidURL(doiUrl)) {
    browser.tabs.create({ url: doiUrl });
  }
}


// =====================================
// Context Menu Functions
// =====================================

// Available actions in the row right-click context menu
const CONTEXT_MENU_ITEMS = [
  { action: "copy", label: "Copy BibTeX", icon: "../images/copy.png" },
  { action: "download", label: "Download BibTeX", icon: "../images/download.png" },
  { action: "zotero", label: "Save to Zotero", icon: "../images/zotero.png" },
  { action: "dblp", label: "Open on dblp", icon: "../images/open-in-tab.png" },
  { action: "doi", label: "Resolve DOI", icon: "../images/open-in-tab.png" },
];

// Reusable context menu element and its current target row
let contextMenuEl = null;
let contextMenuTargetRow = null;

/**
 * Returns the relevant URL on a row for a given context menu action
 * @param {HTMLTableRowElement} row - The target row element
 * @param {string} action - The action identifier
 * @returns {string} The URL associated with the action (may be empty)
 */
function getRowUrlForAction(row, action) {
  switch (action) {
    case "copy":
    case "download":
    case "zotero":
      return row.dataset.bibtexUrl;
    case "dblp":
      return row.dataset.dblpUrl;
    case "doi":
      return row.dataset.doiUrl;
    default:
      return "";
  }
}

/**
 * Executes a context menu action on the target row
 * @param {string} action - The action identifier
 * @param {HTMLTableRowElement} row - The target row element
 */
function executeContextMenuAction(action, row) {
  switch (action) {
    case "copy":
      copySelectedRowBibtex(row);
      break;
    case "download":
      downloadSelectedRowBibtex(row);
      break;
    case "zotero":
      saveSelectedRowZotero(row);
      break;
    case "dblp":
      openSelectedRowDblp(row);
      break;
    case "doi":
      openSelectedRowDoi(row);
      break;
  }
}

/**
 * Creates a single context menu item button
 * @param {Object} item - The item descriptor (action, label, icon)
 * @returns {HTMLButtonElement} The created menu item
 */
function createContextMenuItem(item) {
  const button = document.createElement("button");
  button.className = "context-menu-item";
  button.dataset.action = item.action;

  const img = document.createElement("img");
  img.src = item.icon;
  button.appendChild(img);

  const label = document.createElement("span");
  label.textContent = item.label;
  button.appendChild(label);

  button.addEventListener("click", function (e) {
    e.stopPropagation();
    const row = contextMenuTargetRow;
    hideContextMenu();
    if (row) {
      executeContextMenuAction(item.action, row);
    }
  });

  return button;
}

/**
 * Builds the context menu element once and appends it to the document body
 * @returns {HTMLDivElement} The context menu element
 */
function buildContextMenu() {
  const menu = document.createElement("div");
  menu.id = "context-menu";
  menu.className = "context-menu";
  CONTEXT_MENU_ITEMS.forEach(function (item) {
    menu.appendChild(createContextMenuItem(item));
  });
  document.body.appendChild(menu);
  return menu;
}

/**
 * Enables or disables menu items based on the target row's available URLs,
 * and hides the Zotero item when the option is disabled
 * @param {HTMLTableRowElement} row - The target row element
 */
function updateContextMenuItemStates(row) {
  contextMenuEl.querySelectorAll(".context-menu-item").forEach(function (button) {
    const url = getRowUrlForAction(row, button.dataset.action);
    button.disabled = !(url && isValidURL(url));
    if (button.dataset.action === "zotero") {
      button.style.display = zoteroEnabled ? "" : "none";
    }
  });
}

/**
 * Positions the context menu at the cursor, keeping it within the viewport
 * @param {HTMLDivElement} menu - The context menu element
 * @param {number} x - Cursor X coordinate (clientX)
 * @param {number} y - Cursor Y coordinate (clientY)
 */
function positionContextMenu(menu, x, y) {
  // Show invisibly first to measure its size before clamping
  menu.style.visibility = "hidden";
  menu.classList.add("show");
  const rect = menu.getBoundingClientRect();

  let left = x;
  let top = y;
  if (left + rect.width > window.innerWidth) {
    left = window.innerWidth - rect.width - 4;
  }
  if (top + rect.height > window.innerHeight) {
    top = window.innerHeight - rect.height - 4;
  }

  menu.style.left = Math.max(left, 0) + "px";
  menu.style.top = Math.max(top, 0) + "px";
  menu.style.visibility = "visible";
}

/**
 * Opens the context menu for a row at the cursor position
 * @param {MouseEvent} event - The contextmenu event
 * @param {HTMLTableRowElement} row - The row that was right-clicked
 */
function showContextMenu(event, row) {
  event.preventDefault();
  if (!contextMenuEl) {
    contextMenuEl = buildContextMenu();
  }
  contextMenuTargetRow = row;
  selectRow(parseInt(row.dataset.index, 10));
  updateContextMenuItemStates(row);
  positionContextMenu(contextMenuEl, event.clientX, event.clientY);
}

/**
 * Hides the context menu and clears its target row
 */
function hideContextMenu() {
  if (contextMenuEl) {
    contextMenuEl.classList.remove("show");
    contextMenuEl.style.visibility = "";
  }
  contextMenuTargetRow = null;
}

// Dismiss the context menu on scroll, window resize, or the Escape key
window.addEventListener("scroll", hideContextMenu, true);
window.addEventListener("resize", hideContextMenu);
document.addEventListener("keydown", function (event) {
  if (event.key === "Escape") {
    hideContextMenu();
  }
});

// Dismiss the menu when right-clicking anywhere outside a results row. The
// row's own contextmenu handler runs first and re-opens it, so this only
// closes a stranded menu (e.g. when right-clicking blank space or the header).
document.addEventListener("contextmenu", function (event) {
  if (!event.target.closest("#results-table tbody tr")) {
    hideContextMenu();
  }
});


// =====================================
// Copy BibTeX Functions
// =====================================

/**
 * Asks the background script to download a BibTeX entry from dblp. Every
 * dblp request runs there, so they all share one rate-limit queue.
 * @param {string} url - dblp BibTeX URL
 * @returns {Promise<string>} The raw BibTeX; rejects with the background's
 *   error, keeping its name ("AbortError", "HttpError") for handleBibtexError
 */
function fetchBibtex(url) {
  return new Promise((resolve, reject) => {
    browser.runtime.sendMessage(
      { script: "popup.js", type: "REQUEST_FETCH_BIBTEX", url: url },
      function (response) {
        if (browser.runtime.lastError || !response) {
          const detail = browser.runtime.lastError
            ? browser.runtime.lastError.message
            : "no response";
          reject(new Error("Could not reach the background script: " + detail));
          return;
        }
        if (!response.success) {
          const error = new Error(response.error);
          error.name = response.errorName || "Error";
          reject(error);
          return;
        }
        resolve(response.bibtex);
      }
    );
  });
}

/**
 * Fetches BibTeX from URL and applies the user's processing options.
 * @param {string} url - URL to fetch BibTeX from
 * @returns {Promise<{data: string, citationKey: string|null}>} Processed result
 */
function fetchAndProcessBibtex(url) {
  return fetchBibtex(url)
    .then(
      (data) =>
        new Promise((resolve, reject) => {
          browser.storage.local.get(
            {
              options: {
                keyRenaming: true,
                citationKeyFields: ["author", "year", "venue"],
                authorCapitalize: false,
                venueUppercase: false,
                removeTimestampBiburlBibsource: true,
                removeUrl: false,
              },
            },
            function (items) {
              try {
                resolve(processBibtexData(data, items.options));
              } catch (err) {
                reject(err);
              }
            }
          );
        })
    );
}

/**
 * Reports a BibTeX fetch/processing error to the user.
 * @param {Error} err - The error that occurred
 */
function handleBibtexError(err) {
  if (err.name === "AbortError") {
    console.error("Request timeout: Could not fetch BibTeX in time");
    updateStatus("Error: BibTeX request timeout", 3000);
  } else if (err.name === "HttpError") {
    console.error("Could not fetch BibTeX: ", err.message);
    updateStatus("Error: " + err.message, 6000);
  } else if (err.message && err.message.indexOf("Invalid BibTeX") === 0) {
    console.error("Could not process BibTeX: ", err);
    updateStatus("Error: " + err.message, 3000);
  } else {
    console.error("Could not fetch BibTeX: ", err);
    updateStatus("Error: Could not fetch BibTeX", 3000);
  }
}

/**
 * Fetches BibTeX from URL, applies user options, and copies to clipboard
 * @param {string} url - URL to fetch BibTeX from
 */
window.copyBibtexToClipboard = function (url) {
  fetchAndProcessBibtex(url)
    .then(({ data }) => {
      navigator.clipboard.writeText(data).catch(function (err) {
        console.error("Could not copy BibTeX to clipboard: ", err);
      });
    })
    .catch(handleBibtexError);
};

/**
 * Schedules revocation of a blob object URL after the browser has had time to
 * read it. Revoking synchronously can abort an in-flight download.
 * @param {string} blobUrl - The object URL to revoke
 */
function revokeBlobUrlLater(blobUrl) {
  setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
}

/**
 * Saves a blob via the downloads API (Chrome, Edge, Firefox). The download is
 * owned by the browser, so it survives the popup closing.
 * @param {string} blobUrl - Object URL of the blob to save
 * @param {string} filename - Suggested filename
 */
function downloadViaApi(blobUrl, filename) {
  Promise.resolve(
    browser.downloads.download({
      url: blobUrl,
      filename: filename,
      saveAs: false,
    })
  )
    .catch((err) => {
      console.error("Could not download BibTeX: ", err);
      updateStatus("Error: Could not download BibTeX", 3000);
    })
    .finally(() => revokeBlobUrlLater(blobUrl));
}

/**
 * Saves a blob via a temporary anchor click. Fallback for browsers without the
 * downloads API (Safari does not implement browser.downloads).
 * @param {string} blobUrl - Object URL of the blob to save
 * @param {string} filename - Suggested filename
 */
function downloadViaAnchor(blobUrl, filename) {
  const link = document.createElement("a");
  link.href = blobUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  revokeBlobUrlLater(blobUrl);
}

/**
 * Fetches BibTeX from URL, applies user options, and downloads it as a .bib
 * file named after the citation key.
 * @param {string} url - URL to fetch BibTeX from
 */
window.downloadBibtex = function (url) {
  fetchAndProcessBibtex(url)
    .then(({ data, citationKey }) => {
      const filename = buildBibtexFilename(citationKey);
      const blob = new Blob([data], { type: "application/x-bibtex" });
      const blobUrl = URL.createObjectURL(blob);

      // Prefer the downloads API where available (Chrome, Edge, Firefox); fall
      // back to an anchor click on Safari, which does not implement it.
      if (browser.downloads && typeof browser.downloads.download === "function") {
        downloadViaApi(blobUrl, filename);
      } else {
        downloadViaAnchor(blobUrl, filename);
      }
    })
    .catch(handleBibtexError);
};

// =====================================
// Save to Zotero Functions
// =====================================

// Blocks concurrent saves: a double-click (or repeated Z presses) would
// otherwise import the same entry twice, duplicating it in Zotero
let zoteroSaveInFlight = false;

/**
 * Builds the keyboard hint shown above the results table, mentioning the Z
 * shortcut only while saving to Zotero is enabled.
 * @returns {string} The hint text
 */
function buildKeyboardHint() {
  const zoteroPart = zoteroEnabled ? "Z to save to Zotero, " : "";
  return (
    "Tip: Use ↑↓ to navigate, C to copy BibTeX, D to download, " +
    zoteroPart +
    "B for DBLP, O for DOI — or right-click a row for actions"
  );
}

/**
 * Reads the Zotero option from storage, refreshes the cached flag used by
 * the keyboard shortcut and context menu, and shows or hides the Save to
 * Zotero buttons (and the Z shortcut hint) accordingly.
 */
function refreshZoteroButtonVisibility() {
  browser.storage.local.get(
    {
      options: {
        zoteroEnabled: true,
      },
    },
    function (items) {
      zoteroEnabled = items.options.zoteroEnabled !== false;
      document.querySelectorAll(".saveZoteroButton").forEach((button) => {
        button.style.display = zoteroEnabled ? "" : "none";
      });
      const hint = document.getElementById("keyboard-hint");
      if (hint) {
        hint.textContent = buildKeyboardHint();
      }
    }
  );
}

/**
 * Reads the configured Zotero save destination from storage. An empty
 * target means "currently selected in Zotero" (no retargeting).
 * @returns {Promise<{target: string, targetName: string}>} Destination config
 */
function getZoteroSaveOptions() {
  return new Promise((resolve) => {
    browser.storage.local.get(
      {
        options: {
          zoteroTarget: "",
          zoteroTargetName: "",
        },
      },
      function (items) {
        const target = items.options.zoteroTarget;
        resolve({
          target: isValidZoteroTargetId(target) ? target : "",
          targetName: items.options.zoteroTargetName || "",
        });
      }
    );
  });
}

/**
 * Hands the processed BibTeX entry to the background service worker, which
 * performs the connector requests. The save then survives the popup closing
 * (Chrome closes action popups on any focus loss); the response only feeds
 * the status line, so losing it is harmless.
 * @param {string} bibtex - The processed BibTeX entry
 * @param {{target: string, targetName: string}} zoteroOptions - Destination
 * @returns {Promise<{ok: boolean, message: string}>} Save outcome
 */
function requestBackgroundZoteroSave(bibtex, zoteroOptions) {
  return new Promise((resolve) => {
    browser.runtime.sendMessage(
      {
        script: "popup.js",
        type: "REQUEST_SAVE_TO_ZOTERO",
        bibtex: bibtex,
        target: zoteroOptions.target,
        targetName: zoteroOptions.targetName,
      },
      function (response) {
        if (browser.runtime.lastError || !response || !response.outcome) {
          const detail = browser.runtime.lastError
            ? browser.runtime.lastError.message
            : "no response";
          console.error("Zotero save message failed: ", detail);
          resolve({
            ok: false,
            message: "Error: could not start the Zotero save",
          });
          return;
        }
        resolve(response.outcome);
      }
    );
  });
}

/**
 * Fetches BibTeX from URL, applies user options, and imports the entry into
 * the Zotero desktop app via its local connector server.
 * @param {string} url - URL to fetch BibTeX from
 */
/**
 * Reports a permission request that did not end in "granted". When the
 * prompt itself failed on a correctly registered manifest (some browsers
 * cannot anchor the prompt to the popup), the Options page — a regular tab
 * where prompts are reliable — is opened for the user to grant access from.
 * An explicit denial is respected without opening anything.
 * @param {string} permission - "denied" or "failed"
 */
function handleZoteroPermissionFailure(permission) {
  const manifest = browser.runtime.getManifest();
  updateStatus(zoteroPermissionFailureMessage(permission, manifest), 8000);
  if (
    permission === "failed" &&
    isZoteroPermissionDeclared(manifest) &&
    browser.runtime.openOptionsPage
  ) {
    Promise.resolve(browser.runtime.openOptionsPage()).catch(function (err) {
      console.error("Could not open the options page: ", err);
    });
  }
}

window.saveBibtexToZotero = function (url) {
  if (zoteroSaveInFlight) {
    return;
  }
  zoteroSaveInFlight = true;
  // The permission prompt can stay open while the user reads it; keep a
  // persistent status so the pending state is visible (replaced as soon as
  // the request settles)
  updateStatus("Waiting for permission to connect to Zotero...", 0);
  requestZoteroPermission(browser)
    .then(function (permission) {
      if (permission !== "granted") {
        handleZoteroPermissionFailure(permission);
        return;
      }
      // Persistent status; replaced by the outcome message below
      updateStatus("Saving to Zotero...", 0);
      return Promise.all([fetchAndProcessBibtex(url), getZoteroSaveOptions()])
        .then(([processed, zoteroOptions]) =>
          requestBackgroundZoteroSave(processed.data, zoteroOptions)
        )
        .then((result) => updateStatus(result.message, result.ok ? 3000 : 6000))
        .catch(handleBibtexError);
    })
    .finally(function () {
      zoteroSaveInFlight = false;
    });
};

// =====================================
// Pagination Functions
// =====================================

/**
 * Updates pagination controls based on current results state
 * @param {number} totalHits - Total number of matching publications
 * @param {number} sentHits - Number of publications in current response
 * @param {number} currentOffset - Current pagination offset
 * @param {number} [excludedCount=0] - Excluded entries (e.g. CoRR abs) in the current page
 */
function updatePaginationControls(totalHits, sentHits, currentOffset, excludedCount = 0) {
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
      // Results shown on the current page (fetched minus CoRR abs entries filtered out)
      const resultsCount = Math.max(0, sentHits - excludedCount);

      // Build pagination controls using safe DOM methods
      const paginationControlsTop = createPaginationControls(
        hasPrevPage,
        hasNextPage,
        currentPage,
        totalPages,
        resultsCount,
        excludedCount
      );
      const paginationControlsBottom = createPaginationControls(
        hasPrevPage,
        hasNextPage,
        currentPage,
        totalPages,
        resultsCount,
        excludedCount
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

/**
 * Creates pagination control elements using safe DOM methods
 * @param {boolean} hasPrevPage - Whether previous page is available
 * @param {boolean} hasNextPage - Whether next page is available
 * @param {number} currentPage - Current page number (1-indexed)
 * @param {number} totalPages - Total number of pages
 * @param {number} resultsCount - Number of results shown on the current page (sent hits minus excluded entries)
 * @param {number} [excludedCount=0] - Excluded entries (e.g. CoRR abs) on the current page
 * @returns {HTMLDivElement} Container element with pagination controls
 */
function createPaginationControls(
  hasPrevPage,
  hasNextPage,
  currentPage,
  totalPages,
  resultsCount,
  excludedCount = 0
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
  pageInfo.textContent = `Page ${currentPage} of ${totalPages} (${resultsCount} results)`;
  pageInfo.title = `${excludedCount} CoRR abs entries ignored`;
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

/**
 * Adds click event listeners to pagination buttons (prev/next)
 * @param {number} currentOffset - Current pagination offset
 * @param {number} maxResults - Number of results per page
 */
function addPaginationEventListeners(currentOffset, maxResults) {
  const queryInputField = document.getElementById("paperTitle");
  const query = queryInputField.value.trim().replace(/\s/g, "+");

  // Previous page buttons (both top and bottom)
  document.querySelectorAll(".prevPageButton").forEach((button) => {
    button.addEventListener("click", function () {
      window.scrollTo(0, 0);
      updateStatus("Loading...", SEARCH_STATUS_FALLBACK_MS);
      sendSearchRequest({
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
      window.scrollTo(0, 0);
      updateStatus("Loading...", SEARCH_STATUS_FALLBACK_MS);
      sendSearchRequest({
        script: "popup.js",
        type: "REQUEST_NEXT_PAGE",
        query: query,
        currentOffset: currentOffset,
        maxResults: maxResults,
      });
    });
  });
}
