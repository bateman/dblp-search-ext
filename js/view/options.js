/**
 * @file options.js
 * @description Settings UI for the extension. Handles drag-and-drop citation key builder
 * and user preference management.
 */

import { updateStatus } from "./commons.js";
import { validateMaxResults, validatePopupWidth } from "../utils/validation.js";
import {
  isValidZoteroTargetId,
  buildZoteroTargetPaths,
  requestZoteroPermission,
  zoteroFetch,
  zoteroPermissionFailureMessage,
} from "../utils/zotero.js";

const browser = window.msBrowser || window.browser || window.chrome;
console.log("options.js loaded");

/**
 * Valid field names for citation key building
 * @type {string[]}
 */
const VALID_FIELDS = ["author", "year", "venue", "title"];

/**
 * Valid separator tokens for citation key building
 * @type {string[]}
 */
const VALID_SEPARATORS = ["dash", "underscore"];

/**
 * Combined list of all valid tokens (fields + separators)
 * @type {string[]}
 */
const ALL_VALID_TOKENS = [...VALID_FIELDS, ...VALID_SEPARATORS];

/**
 * Counter for generating unique separator token IDs
 * @type {number}
 */
let separatorCounter = 0;

/**
 * Sample values used for citation key preview display
 * @type {{author: string, year: string, venue: string, title: string}}
 */
const sampleValues = {
  author: "author",
  year: new Date().getFullYear().toString(),
  venue: "venue",
  title: "title",
};

/**
 * IDs of the option controls whose change event triggers an autosave. The
 * citation-key builder saves through its own drag/remove handlers instead.
 * @type {string[]}
 */
const AUTOSAVE_CONTROL_IDS = [
  "maxResults",
  "popupWidth",
  "renamingCheckbox",
  "authorCapitalize",
  "venueUppercase",
  "removeTimestampBiburlBibsource",
  "removeUrl",
  "zoteroEnabled",
  "zoteroTarget",
];

/**
 * Pending autosave timer id, or null when none is scheduled
 * @type {number|null}
 */
let autosaveTimer = null;

/**
 * Schedules a debounced save of all options, coalescing rapid changes
 * (e.g. successive drags in the citation-key builder).
 */
function scheduleAutosave() {
  if (autosaveTimer !== null) {
    clearTimeout(autosaveTimer);
  }
  autosaveTimer = setTimeout(function () {
    autosaveTimer = null;
    saveOptions();
  }, 400);
}

// =====================================
// Event Listeners
// =====================================

/**
 * Initializes the options page when DOM is loaded
 */
document.addEventListener("DOMContentLoaded", function () {
  // Autosave: persist the options whenever a control changes
  AUTOSAVE_CONTROL_IDS.forEach(function (id) {
    document.getElementById(id).addEventListener("change", scheduleAutosave);
  });

  // Load the list of Zotero libraries/collections on demand
  document
    .getElementById("zoteroLoadTargets")
    .addEventListener("click", loadZoteroTargets);

  // Toggle drag & drop visibility based on checkbox
  const renamingCheckbox = document.getElementById("renamingCheckbox");
  renamingCheckbox.addEventListener("change", toggleDragDropVisibility);

  // Update preview when formatting options change
  document.getElementById("authorCapitalize").addEventListener("change", updatePreview);
  document.getElementById("venueUppercase").addEventListener("change", updatePreview);

  initDragAndDrop();
  restoreOptions();
});

// =====================================
// Drag & Drop Functions
// =====================================

/**
 * Toggles visibility of the drag-and-drop citation key builder based on checkbox state
 */
function toggleDragDropVisibility() {
  const isEnabled = document.getElementById("renamingCheckbox").checked;
  const builder = document.querySelector(".citation-key-builder");
  const label = document.getElementById("citationKeyPatternLabel");
  if (builder) {
    builder.style.display = isEnabled ? "block" : "none";
  }
  if (label) {
    label.style.display = isEnabled ? "inline-block" : "none";
  }
}

/**
 * Initializes drag-and-drop functionality for the citation key builder
 */
function initDragAndDrop() {
  const availableFields = document.getElementById("availableFields");
  const dropzone = document.getElementById("citationKeyDropzone");

  // Add drag events to all field tokens
  document.querySelectorAll(".field-token").forEach((token) => {
    token.addEventListener("dragstart", handleDragStart);
    token.addEventListener("dragend", handleDragEnd);
  });

  // Dropzone events
  dropzone.addEventListener("dragover", handleDragOver);
  dropzone.addEventListener("dragleave", handleDragLeave);
  dropzone.addEventListener("drop", handleDrop);

  // Also allow dropping back to available fields
  availableFields.addEventListener("dragover", handleDragOver);
  availableFields.addEventListener("dragleave", handleDragLeave);
  availableFields.addEventListener("drop", handleDropToAvailable);
}

/**
 * Handles drag start event for field tokens
 * @param {DragEvent} e - The drag event
 */
function handleDragStart(e) {
  e.target.classList.add("dragging");
  e.dataTransfer.effectAllowed = "move";
  e.dataTransfer.setData("text/plain", e.target.dataset.field);
  e.dataTransfer.setData("source", e.target.parentElement.id);
  // Include tokenId for separators to enable reordering
  if (e.target.dataset.tokenId) {
    e.dataTransfer.setData("tokenId", e.target.dataset.tokenId);
  }
}

/**
 * Handles drag end event, cleaning up visual states
 * @param {DragEvent} e - The drag event
 */
function handleDragEnd(e) {
  e.target.classList.remove("dragging");
  document.querySelectorAll(".drag-over").forEach((el) => {
    el.classList.remove("drag-over");
  });
}

/**
 * Handles drag over event, enabling drop and showing visual feedback
 * @param {DragEvent} e - The drag event
 */
function handleDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
  e.currentTarget.classList.add("drag-over");
}

/**
 * Handles drag leave event, removing visual feedback
 * @param {DragEvent} e - The drag event
 */
function handleDragLeave(e) {
  e.currentTarget.classList.remove("drag-over");
}

/**
 * Extracts and validates data from a drop event
 * @param {DragEvent} e - The drop event
 * @returns {{field: string, source: string, tokenId: string, isSeparator: boolean}} Drop data object
 */
function extractDropData(e) {
  e.preventDefault();
  e.currentTarget.classList.remove("drag-over");

  const field = e.dataTransfer.getData("text/plain");
  return {
    field,
    source: e.dataTransfer.getData("source"),
    tokenId: e.dataTransfer.getData("tokenId"),
    isSeparator: VALID_SEPARATORS.includes(field),
  };
}

/**
 * Moves an existing dropzone token to a new position (reordering)
 * @param {HTMLElement} dropzone - The dropzone element
 * @param {string} field - Field name of the dragged token
 * @param {string} tokenId - Specific token id (set for separators)
 * @param {HTMLElement|null} insertPosition - Element to insert before, or null for end
 */
function reorderDropzoneToken(dropzone, field, tokenId, insertPosition) {
  const existingToken = tokenId
    ? dropzone.querySelector(`[data-token-id="${tokenId}"]`)
    : dropzone.querySelector(`[data-field="${field}"]`);
  if (!existingToken) {
    return;
  }
  // Remove from current position, insert at the new one
  existingToken.remove();
  if (insertPosition) {
    dropzone.insertBefore(existingToken, insertPosition);
  } else {
    dropzone.appendChild(existingToken);
  }
  updatePreview();
  scheduleAutosave();
}

/**
 * Adds a token from the available fields to the dropzone
 * @param {HTMLElement} dropzone - The dropzone element
 * @param {string} field - Field name of the dragged token
 * @param {string} source - ID of the container the token was dragged from
 * @param {boolean} isSeparator - Whether this is a separator token
 * @param {HTMLElement|null} insertPosition - Element to insert before, or null for end
 */
function addTokenToDropzone(dropzone, field, source, isSeparator, insertPosition) {
  // Separators can be used multiple times; regular fields only once
  if (!isSeparator && dropzone.querySelector(`[data-field="${field}"]`)) {
    return;
  }
  const token = document.querySelector(
    `#${source} .field-token[data-field="${field}"]`
  );
  if (!token) {
    return;
  }
  const newToken = createDropzoneToken(field, isSeparator);
  if (!newToken) {
    return;
  }
  if (insertPosition) {
    dropzone.insertBefore(newToken, insertPosition);
  } else {
    dropzone.appendChild(newToken);
  }
  // Hide original token only for non-separators
  if (!isSeparator) {
    token.style.display = "none";
  }
  updatePreview();
  scheduleAutosave();
}

/**
 * Handles drop event on the citation key dropzone
 * @param {DragEvent} e - The drop event
 */
function handleDrop(e) {
  const { field, source, tokenId, isSeparator } = extractDropData(e);
  const dropzone = document.getElementById("citationKeyDropzone");
  const insertPosition = getDropPosition(e, dropzone);

  if (source === "citationKeyDropzone") {
    reorderDropzoneToken(dropzone, field, tokenId, insertPosition);
    return;
  }
  addTokenToDropzone(dropzone, field, source, isSeparator, insertPosition);
}

/**
 * Determines the insert position based on drop location within dropzone
 * @param {DragEvent} e - The drop event
 * @param {HTMLElement} dropzone - The dropzone element
 * @returns {HTMLElement|null} Element to insert before, or null for end
 */
function getDropPosition(e, dropzone) {
  const tokens = Array.from(dropzone.querySelectorAll(".field-token:not(.dragging)"));

  for (const token of tokens) {
    const rect = token.getBoundingClientRect();
    const midpoint = rect.left + rect.width / 2;
    if (e.clientX < midpoint) {
      return token;
    }
  }
  return null; // Insert at end
}

/**
 * Handles drop event on the available fields area (removes from dropzone)
 * @param {DragEvent} e - The drop event
 */
function handleDropToAvailable(e) {
  const { field, source, tokenId, isSeparator } = extractDropData(e);

  if (source === "citationKeyDropzone") {
    removeFieldFromDropzone(field, tokenId, isSeparator);
  }
}

/**
 * Creates a token element for the dropzone with remove button
 * @param {string} field - Field name (must be in ALL_VALID_TOKENS)
 * @param {boolean} [isSeparator=false] - Whether this is a separator token
 * @returns {HTMLElement|null} Token element or null if invalid field
 */
function createDropzoneToken(field, isSeparator = false) {
  // Validate field against whitelist
  if (!ALL_VALID_TOKENS.includes(field)) {
    console.error("Invalid field:", field);
    return null;
  }

  const token = document.createElement("div");
  token.className = "field-token in-dropzone";
  if (isSeparator) {
    token.classList.add("separator-token");
  }
  token.draggable = true;
  token.dataset.field = field;

  // Assign unique tokenId for separators to enable multiple instances
  const tokenId = isSeparator ? `${field}-${separatorCounter++}` : field;
  token.dataset.tokenId = tokenId;

  // Use safe DOM methods instead of innerHTML to prevent XSS
  const displayText = getSeparatorDisplay(field);
  const textNode = document.createTextNode(displayText);
  token.appendChild(textNode);

  const removeBtn = document.createElement("span");
  removeBtn.className = "remove-btn";
  removeBtn.title = "Remove";
  removeBtn.textContent = "\u00d7";
  token.appendChild(removeBtn);

  token.addEventListener("dragstart", handleDragStart);
  token.addEventListener("dragend", handleDragEnd);

  // Remove button click - use tokenId for separators
  removeBtn.addEventListener("click", function (e) {
    e.stopPropagation();
    removeFieldFromDropzone(field, tokenId, isSeparator);
  });

  return token;
}

/**
 * Gets the display text for a field token
 * @param {string} field - Field name
 * @returns {string} Display text (e.g., "-" for "dash", capitalized name for fields)
 */
function getSeparatorDisplay(field) {
  switch (field) {
    case "dash": return "-";
    case "underscore": return "_";
    default: return capitalize(field);
  }
}

/**
 * Removes a field token from the dropzone
 * @param {string} field - Field name to remove
 * @param {string|null} [tokenId=null] - Specific token ID (for separators)
 * @param {boolean} [isSeparator=false] - Whether this is a separator token
 */
function removeFieldFromDropzone(field, tokenId = null, isSeparator = false) {
  // Validate field against whitelist
  if (!ALL_VALID_TOKENS.includes(field)) {
    return;
  }

  const dropzone = document.getElementById("citationKeyDropzone");

  // For separators, use tokenId to find the specific instance
  // For regular fields, use field name
  const token = tokenId
    ? dropzone.querySelector(`[data-token-id="${tokenId}"]`)
    : dropzone.querySelector(`[data-field="${field}"]`);

  if (token) {
    token.remove();
  }

  // Show original token in available fields only for non-separators
  if (!isSeparator) {
    const originalToken = document.querySelector(
      `#availableFields .field-token[data-field="${field}"]`
    );
    if (originalToken) {
      originalToken.style.display = "";
    }
  }

  updatePreview();
  scheduleAutosave();
}

/**
 * Gets the ordered list of fields currently in the dropzone
 * @returns {string[]} Array of field names in order
 */
function getSelectedFields() {
  const dropzone = document.getElementById("citationKeyDropzone");
  const tokens = dropzone.querySelectorAll(".field-token");
  return Array.from(tokens).map((t) => t.dataset.field);
}

/**
 * Sets the dropzone fields from an array, restoring a saved configuration
 * @param {string[]} fields - Array of field names to set
 */
function setSelectedFields(fields) {
  const dropzone = document.getElementById("citationKeyDropzone");

  // Clear dropzone
  dropzone.innerHTML = "";

  // Reset separator counter
  separatorCounter = 0;

  // Show all available tokens first (only non-separators get hidden)
  document.querySelectorAll("#availableFields .field-token").forEach((t) => {
    t.style.display = "";
  });

  // Add selected fields to dropzone
  fields.forEach((field) => {
    const isSeparator = VALID_SEPARATORS.includes(field);
    const originalToken = document.querySelector(
      `#availableFields .field-token[data-field="${field}"]`
    );
    if (originalToken) {
      const newToken = createDropzoneToken(field, isSeparator);
      if (newToken) {
        dropzone.appendChild(newToken);
        // Only hide original for non-separators
        if (!isSeparator) {
          originalToken.style.display = "none";
        }
      }
    }
  });

  updatePreview();
}

/**
 * Safely gets a sample value for a field (avoids object injection)
 * @param {string} field - Field name
 * @returns {string} Sample value for the field
 */
function getSampleValue(field) {
  switch (field) {
    case "author": return sampleValues.author;
    case "year": return sampleValues.year;
    case "venue": return sampleValues.venue;
    case "title": return sampleValues.title;
    case "dash": return "-";
    case "underscore": return "_";
    default: return "";
  }
}

/**
 * Updates the citation key preview based on current dropzone configuration
 */
function updatePreview() {
  const fields = getSelectedFields();
  const preview = document.getElementById("citationKeyPreview");

  if (fields.length === 0) {
    preview.textContent = "(select fields)";
    return;
  }

  const authorCapitalize = document.getElementById("authorCapitalize").checked;
  const venueUppercase = document.getElementById("venueUppercase").checked;

  const key = fields.map((f) => {
    let value = getSampleValue(f);
    if (f === "author" && authorCapitalize) {
      value = value.charAt(0).toUpperCase() + value.slice(1);
    }
    if (f === "venue" && venueUppercase) {
      value = value.toUpperCase();
    }
    return value;
  }).join("");
  preview.textContent = key;
}

/**
 * Capitalizes the first letter of a string
 * @param {string} str - String to capitalize
 * @returns {string} Capitalized string
 */
function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// =====================================
// Zotero Destination Functions
// =====================================

/**
 * Handles the "Load from Zotero" button: requests the optional host
 * permission (must run synchronously in the click handler), then fetches
 * the list of libraries and collections from the running Zotero app.
 */
function loadZoteroTargets() {
  // Persistent status while the permission prompt is open; replaced as soon
  // as the request settles
  updateStatus("Waiting for permission to connect to Zotero...", 0);
  requestZoteroPermission(browser).then(function (permission) {
    if (permission !== "granted") {
      updateStatus(
        zoteroPermissionFailureMessage(permission, browser.runtime.getManifest()),
        8000
      );
      return;
    }
    fetchZoteroTargets();
  });
}

/**
 * Fetches the editable libraries and collections from the local Zotero
 * connector server and fills the destination dropdown with them.
 */
function fetchZoteroTargets() {
  updateStatus("Loading libraries and collections from Zotero...", 0);
  zoteroFetch("getSelectedCollection", null, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  })
    .then((response) => response.json())
    .then((info) => {
      const targets = buildZoteroTargetPaths(info.targets);
      populateZoteroTargetSelect(targets);
      updateStatus(`Loaded ${targets.length} destinations from Zotero`, 2000);
    })
    .catch(() => {
      updateStatus(
        "Error: could not reach Zotero. Is the Zotero desktop app running?",
        4000
      );
    });
}

/**
 * Fills the destination dropdown with the given targets, keeping the
 * "Currently selected in Zotero" entry first and preserving the current
 * choice when it still exists.
 * @param {{id: string, name: string, level: number, path: string}[]} targets
 *        Targets with display paths, from buildZoteroTargetPaths()
 */
function populateZoteroTargetSelect(targets) {
  const select = document.getElementById("zoteroTarget");
  const previous = select.value;

  // Remove everything but the first, fixed option
  while (select.options.length > 1) {
    select.remove(1);
  }

  targets.forEach(function (target) {
    const option = document.createElement("option");
    option.value = target.id;
    // Indent nested collections to mirror the Zotero tree. The indent uses
    // non-breaking spaces (U+00A0): ordinary leading spaces are stripped
    // from option labels by the HTML renderer
    option.textContent = "  ".repeat(target.level) + target.name;
    option.dataset.path = target.path;
    select.appendChild(option);
  });

  // Re-select the previous destination if it is still available
  select.value = previous;
  if (select.value !== previous) {
    select.value = "";
  }
}

/**
 * Restores the saved destination into the dropdown without contacting
 * Zotero: the stored id and display path are enough to show the choice.
 * @param {string} target - Stored treeViewID ("" for current selection)
 * @param {string} targetName - Stored display path of the destination
 */
function restoreZoteroTargetSelect(target, targetName) {
  if (!isValidZoteroTargetId(target)) {
    return;
  }
  const select = document.getElementById("zoteroTarget");
  const option = document.createElement("option");
  option.value = target;
  option.textContent = targetName || target;
  option.dataset.path = targetName || target;
  select.appendChild(option);
  select.value = target;
}

/**
 * Reads the destination currently chosen in the dropdown.
 * @returns {{target: string, targetName: string}} The destination to store
 */
function readZoteroTargetSelection() {
  const select = document.getElementById("zoteroTarget");
  const option = select.selectedOptions.length > 0 ? select.selectedOptions[0] : null;
  if (!option || !isValidZoteroTargetId(option.value)) {
    return { target: "", targetName: "" };
  }
  return {
    target: option.value,
    targetName: option.dataset.path || option.textContent.trim(),
  };
}

// =====================================
// Save/Restore Functions
// =====================================


/**
 * Saves all user options to browser storage
 */
function saveOptions() {
  const maxResultsInput = document.getElementById("maxResults").value;
  const keyRenaming = document.getElementById("renamingCheckbox").checked;
  const citationKeyFields = getSelectedFields();
  const authorCapitalize = document.getElementById("authorCapitalize").checked;
  const venueUppercase = document.getElementById("venueUppercase").checked;
  const removeTimestampBiburlBibsource = document.getElementById(
    "removeTimestampBiburlBibsource"
  ).checked;
  const removeUrl = document.getElementById("removeUrl").checked;
  const zoteroEnabled = document.getElementById("zoteroEnabled").checked;
  const zoteroTargetSelection = readZoteroTargetSelection();
  const popupWidthInput = document.getElementById("popupWidth").value;

  // Validate maxResults input
  const maxResultsValidation = validateMaxResults(maxResultsInput);
  if (!maxResultsValidation.valid) {
    updateStatus("Error: Max results must be between 1 and 1000", 3000);
    document.getElementById("maxResults").value = maxResultsValidation.value;
    return;
  }
  const maxResults = maxResultsValidation.value;

  // Validate popupWidth input
  const popupWidthValidation = validatePopupWidth(popupWidthInput);
  if (!popupWidthValidation.valid) {
    updateStatus("Error: Popup width must be between 500 and 800", 3000);
    document.getElementById("popupWidth").value = popupWidthValidation.value;
    return;
  }
  const popupWidth = popupWidthValidation.value;

  // Validate citation key fields
  if (keyRenaming && citationKeyFields.length === 0) {
    updateStatus("Error: Please select at least one field for citation key", 3000);
    return;
  }

  browser.storage.local.set(
    {
      options: {
        maxResults: maxResults,
        keyRenaming: keyRenaming,
        citationKeyFields: citationKeyFields,
        authorCapitalize: authorCapitalize,
        venueUppercase: venueUppercase,
        removeTimestampBiburlBibsource: removeTimestampBiburlBibsource,
        removeUrl: removeUrl,
        zoteroEnabled: zoteroEnabled,
        zoteroTarget: zoteroTargetSelection.target,
        zoteroTargetName: zoteroTargetSelection.targetName,
        popupWidth: popupWidth,
      },
    },
    function () {
      // Update status to let user know options were saved.
      updateStatus("Options saved successfully", 2000);
    }
  );
}

/**
 * Restores user options from browser storage and updates UI elements
 */
function restoreOptions() {
  browser.storage.local.get(
    {
      options: {
        maxResults: 30,
        keyRenaming: true,
        citationKeyFields: ["author", "year", "venue"],
        authorCapitalize: false,
        venueUppercase: false,
        removeTimestampBiburlBibsource: true,
        removeUrl: false,
        zoteroEnabled: true,
        zoteroTarget: "",
        zoteroTargetName: "",
        popupWidth: 800,
      },
    },
    function (items) {
      document.getElementById("maxResults").value = items.options.maxResults;
      document.getElementById("renamingCheckbox").checked =
        items.options.keyRenaming;
      document.getElementById("authorCapitalize").checked =
        items.options.authorCapitalize;
      document.getElementById("venueUppercase").checked =
        items.options.venueUppercase;
      document.getElementById("removeTimestampBiburlBibsource").checked =
        items.options.removeTimestampBiburlBibsource;
      document.getElementById("removeUrl").checked = items.options.removeUrl;
      // Default to enabled when the option is missing from stored settings
      // (e.g. after updating from a version that predates it)
      document.getElementById("zoteroEnabled").checked =
        items.options.zoteroEnabled !== false;
      restoreZoteroTargetSelect(
        items.options.zoteroTarget,
        items.options.zoteroTargetName
      );
      document.getElementById("popupWidth").value =
        items.options.popupWidth || 800;

      // Show/hide drag & drop based on checkbox state
      toggleDragDropVisibility();

      // Handle migration from old format
      let fields = items.options.citationKeyFields;
      if (!fields && items.options.citationKeyPattern) {
        // Convert old pattern to new fields array
        fields = items.options.citationKeyPattern.split("-");
      }
      if (!fields || fields.length === 0) {
        fields = ["author", "year", "venue"];
      }

      setSelectedFields(fields);
    }
  );
}
