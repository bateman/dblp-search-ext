/**
 * @file popup.js
 * @description Main UI component for the extension popup. Handles search input,
 * results display, BibTeX copying, and pagination.
 */

import { updateStatus } from "./commons.js";
import { isValidURL, getNumericValue, parseSearchWithDefaults } from "../utils/validation.js";
import {
  extractAuthorFromKey,
  extractVenueFromKey,
  extractYearFromBibtex,
  findMatchingBrace,
  findFirstSignificantWord,
  extractFirstTitleWord,
  buildCitationKey,
  cleanBibtexMetadata,
  removeUrlFromBibtex,
} from "../utils/bibtex.js";

console.log("popup.js loaded");
const browser = window.msBrowser || window.browser || window.chrome;

// Track currently selected row for keyboard navigation
let selectedRowIndex = -1;

// Track current sort and filter settings
let currentSort = { field: "none", direction: "asc" };
let currentFilters = {
  article: true,
  inproceedings: true,
  book: true,
  incollection: true,
  editor: true,
  misc: true,
  refwork: true
};

// Store original publications for filtering/sorting
let originalPublications = [];

// Track if filter dropdown should stay open after rebuild
let keepFilterDropdownOpen = false;

// =====================================
// Event Listeners
// =====================================

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

  // Restore popup width from storage
  restorePopupWidth();

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
    requestClearResults(true);
  });

  browser.runtime.onMessage.addListener((message) => {
    console.log(
      `Popup.js received message from '${message.script}': ${message.type}`
    );
    if (message.type === "RESPONSE_SEARCH_PUBLICATIONS") {
      // Ensure all values have valid defaults to prevent NaN/undefined display
      const responseStatus = message.responseStatus || "OK";
      const totalHits = typeof message.totalHits === "number" ? message.totalHits : 0;
      const sentHits = typeof message.sentHits === "number" ? message.sentHits : 0;
      const excludedCount = typeof message.excludedCount === "number" ? message.excludedCount : 0;
      const currentOffset = typeof message.currentOffset === "number" ? message.currentOffset : 0;
      const publications = message.publications || [];

      console.log(
        "Popup.js updating publications count: ",
        responseStatus,
        totalHits,
        sentHits,
        excludedCount,
        currentOffset
      );
      updatePublicationsCount(
        responseStatus,
        totalHits,
        sentHits,
        excludedCount
      );
      console.log("Popup.js updating publications table.");
      buildAndDisplayTable(publications);
      updatePaginationControls(
        totalHits,
        sentHits,
        currentOffset
      );
      saveResultsToStorage(
        queryInputField.value,
        responseStatus,
        totalHits,
        sentHits,
        excludedCount,
        publications,
        currentOffset
      );
    }
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

  const key = event.key.toLowerCase();
  if (key === "c" || key === "d" || key === "o") {
    executeRowShortcut(event.key, rows);
  }
}

// =====================================
// Core Functions
// =====================================

/**
 * Sends a message to the background script and handles the response
 * @param {Object} dictObject - Message object to send
 * @param {string} dictObject.script - Identifier of the sending script
 * @param {string} dictObject.type - Message type
 */
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

/**
 * Requests a publication search from the background script
 * @param {string} q - The search query string
 * @param {number} [offset=0] - Pagination offset
 */
function requestSearchDblp(q, offset = 0) {
  // Update status to let user know search has started.
  updateStatus("Searching...", 2000);
  // Clear existing results, but not the paperTitle
  requestClearResults(false);
  // Send message to background.js
  sendMessage({
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
  currentFilters = {
    article: true,
    inproceedings: true,
    book: true,
    incollection: true,
    editor: true,
    misc: true,
    refwork: true
  };
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
  updatePublicationsCount("RESET", 0, 0, 0);
  clearResultsTable();
  updatePaginationControls(0, 0, 0);
}

/**
 * Updates the publication count display in the UI
 * @param {string} responseStatus - HTTP response status or "RESET"
 * @param {number} totalHits - Total number of matching publications
 * @param {number} sentHits - Number of publications in current response
 * @param {number} excludedCount - Number of excluded publications
 */
function updatePublicationsCount(
  responseStatus,
  totalHits,
  sentHits,
  excludedCount
) {
  const count = document.getElementById("count");
  if (count) {
    let message = "";
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
  const validTypes = ["article", "inproceedings", "book", "incollection", "editor", "misc", "refwork"];
  const safeType = validTypes.includes(type) ? type : "misc";
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
 * Creates a BibTeX copy button cell
 * @param {string} bibtexLink - URL to fetch BibTeX
 * @returns {HTMLTableCellElement} The created cell
 */
function createBibtexCell(bibtexLink) {
  const cell = document.createElement("td");
  cell.className = "center";
  const button = document.createElement("button");
  button.className = "copyBibtexButton";
  button.title = "Copy BibTex";
  if (isValidURL(bibtexLink)) {
    button.dataset.url = bibtexLink;
  }
  const img = document.createElement("img");
  img.src = "../images/copy.png";
  button.appendChild(img);
  cell.appendChild(button);
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
  authorsCell.textContent = authorsText;
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

  return row;
}

/**
 * Safely checks if a publication type is enabled in filters
 * @param {string} type - The publication type
 * @returns {boolean} True if the type is enabled
 */
function isTypeFilterEnabled(type) {
  switch (type) {
    case "article":
      return currentFilters.article !== false;
    case "inproceedings":
      return currentFilters.inproceedings !== false;
    case "book":
      return currentFilters.book !== false;
    case "incollection":
      return currentFilters.incollection !== false;
    case "editor":
      return currentFilters.editor !== false;
    case "misc":
      return currentFilters.misc !== false;
    case "refwork":
      return currentFilters.refwork !== false;
    default:
      return true;
  }
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
  const validTypes = ["article", "inproceedings", "book", "incollection", "editor", "misc", "refwork"];
  let filtered = publications.filter(function(pub) {
    const type = validTypes.includes(pub.type) ? pub.type : "misc";
    return isTypeFilterEnabled(type);
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
 * Checks if any filters are active (not all selected)
 * @returns {boolean} True if filtering is active
 */
function hasActiveFilters() {
  const validTypes = ["article", "inproceedings", "book", "incollection", "editor", "misc", "refwork"];
  return validTypes.some(function(type) {
    return !isTypeFilterEnabled(type);
  });
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
  filterBtn.className = "filter-btn" + (hasActiveFilters() ? " active" : "");
  filterBtn.title = "Filter by type";
  filterBtn.textContent = "\u25BC"; // ▼

  const dropdown = document.createElement("div");
  dropdown.className = "filter-dropdown" + (keepFilterDropdownOpen ? " show" : "");
  keepFilterDropdownOpen = false;

  const filterTypes = [
    { type: "article", label: "Article", color: "#c32b72" },
    { type: "inproceedings", label: "Conf", color: "#196ca3" },
    { type: "book", label: "Book", color: "#f8c91f" },
    { type: "incollection", label: "Chapter", color: "#ef942d" },
    { type: "editor", label: "Editor", color: "#33c3ba" },
    { type: "misc", label: "Misc", color: "#606b70" },
    { type: "refwork", label: "Ref", color: "#96ad2d" }
  ];

  filterTypes.forEach(function(ft) {
    const item = document.createElement("label");
    item.className = "filter-dropdown-item";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.dataset.type = ft.type;
    checkbox.checked = currentFilters[ft.type] !== false;

    checkbox.addEventListener("change", function(e) {
      e.stopPropagation();
      currentFilters[this.dataset.type] = this.checked;
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

// Global click handler to close filter dropdowns (added once)
document.addEventListener("click", function() {
  document.querySelectorAll(".filter-dropdown.show").forEach(function(d) {
    d.classList.remove("show");
  });
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
  hint.textContent = "Tip: Use \u2191\u2193 to navigate, C to copy BibTeX, D for DBLP, O for DOI";
  results.appendChild(hint);

  results.appendChild(table);

  // Add event listeners for copy buttons
  addCopyBibtexButtonEventListener();
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
        searchData.sentHits,
        searchData.excludedCount
      );
      buildAndDisplayTable(searchData.publications);
      updatePaginationControls(
        searchData.totalHits,
        searchData.sentHits,
        searchData.currentOffset
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
 * Copies BibTeX for the selected row
 * @param {HTMLTableRowElement} row - The selected row element
 */
function copySelectedRowBibtex(row) {
  const bibtexUrl = row.dataset.bibtexUrl;
  if (bibtexUrl && isValidURL(bibtexUrl)) {
    window.copyBibtexToClipboard(bibtexUrl);
    updateStatus("Copying BibTeX...", 2000);
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
 * Opens DOI page for the selected row
 * @param {HTMLTableRowElement} row - The selected row element
 */
function openSelectedRowDoi(row) {
  const doiUrl = row.dataset.doiUrl;
  if (doiUrl && isValidURL(doiUrl)) {
    browser.tabs.create({ url: doiUrl });
  } else {
    updateStatus("No DOI link available", 2000);
  }
}


// =====================================
// Copy BibTeX Functions
// =====================================

/**
 * Fetches BibTeX from URL, applies user options, and copies to clipboard
 * @param {string} url - URL to fetch BibTeX from
 */
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
            removeTimestampBiburlBibsource: true,
            removeUrl: false,
          },
        },
        function (items) {
          const keyRenaming = items.options.keyRenaming;
          let citationKeyFields = items.options.citationKeyFields;
          const authorCapitalize = items.options.authorCapitalize;
          const venueUppercase = items.options.venueUppercase;

          // Handle migration from old format
          if (!citationKeyFields && items.options.citationKeyPattern) {
            citationKeyFields = items.options.citationKeyPattern.split("-");
          }
          if (!citationKeyFields || citationKeyFields.length === 0) {
            citationKeyFields = ["author", "year", "venue"];
          }

          if (keyRenaming) {
            const keyMatch = data.match(/^@\S+\{(DBLP:\S+\/\S+\/\S+),/);
            if (!keyMatch || keyMatch.length < 1) {
              console.error("Could not find the citation key in the BibTeX");
              updateStatus("Error: Invalid BibTeX format", 3000);
              return;
            }
            const key = keyMatch[0];
            const author = extractAuthorFromKey(key);
            const venue = extractVenueFromKey(key);
            const year = extractYearFromBibtex(data);
            if (!year) {
              console.error("Could not find the year in the BibTeX");
              updateStatus("Error: Invalid BibTeX format (missing year)", 3000);
              return;
            }
            const title = extractFirstTitleWord(data);
            const newCitationKey = buildCitationKey(
              citationKeyFields, author, year, venue, title,
              authorCapitalize, venueUppercase
            );
            data = data.replace(/DBLP:\S+\/\S+\/\S+/, newCitationKey + ",");
          }

          if (items.options.removeTimestampBiburlBibsource) {
            data = cleanBibtexMetadata(data);
          }

          if (items.options.removeUrl) {
            data = removeUrlFromBibtex(data);
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

// =====================================
// Pagination Functions
// =====================================

/**
 * Updates pagination controls based on current results state
 * @param {number} totalHits - Total number of matching publications
 * @param {number} sentHits - Number of publications in current response
 * @param {number} currentOffset - Current pagination offset
 */
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

/**
 * Creates pagination control elements using safe DOM methods
 * @param {boolean} hasPrevPage - Whether previous page is available
 * @param {boolean} hasNextPage - Whether next page is available
 * @param {number} currentPage - Current page number (1-indexed)
 * @param {number} totalPages - Total number of pages
 * @param {number} totalHits - Total number of matching publications
 * @returns {HTMLDivElement} Container element with pagination controls
 */
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
