/**
 * @file options.js
 * @description Settings UI for the extension. Handles drag-and-drop citation key builder
 * and user preference management.
 */

import { updateStatus } from "./commons.js";

var browser = window.msBrowser || window.browser || window.chrome;
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

// =====================================
// Event Listeners
// =====================================

/**
 * Initializes the options page when DOM is loaded
 */
document.addEventListener("DOMContentLoaded", function () {
  document.getElementById("saveButton").addEventListener("click", saveOptions);

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
 * Handles drop event on the citation key dropzone
 * @param {DragEvent} e - The drop event
 */
function handleDrop(e) {
  const { field, source, tokenId, isSeparator } = extractDropData(e);
  const dropzone = document.getElementById("citationKeyDropzone");

  // Determine insert position based on drop location
  const insertPosition = getDropPosition(e, dropzone);

  // If dragging within dropzone (reordering)
  if (source === "citationKeyDropzone") {
    const existingToken = tokenId
      ? dropzone.querySelector(`[data-token-id="${tokenId}"]`)
      : dropzone.querySelector(`[data-field="${field}"]`);
    if (existingToken) {
      // Remove from current position
      existingToken.remove();
      // Insert at new position
      if (insertPosition) {
        dropzone.insertBefore(existingToken, insertPosition);
      } else {
        dropzone.appendChild(existingToken);
      }
      updatePreview();
    }
    return;
  }

  // For separators, always allow adding (they can be used multiple times)
  // For regular fields, check if already in dropzone
  if (!isSeparator) {
    const existingToken = dropzone.querySelector(`[data-field="${field}"]`);
    if (existingToken) {
      return; // Field already in dropzone
    }
  }

  // Find the token from available fields
  const token = document.querySelector(
    `#${source} .field-token[data-field="${field}"]`
  );
  if (token) {
    // Create a new token for the dropzone with remove button
    const newToken = createDropzoneToken(field, isSeparator);
    if (newToken) {
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
    }
  }
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
    var value = getSampleValue(f);
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
// Save/Restore Functions
// =====================================

/**
 * Saves all user options to browser storage
 */
function saveOptions() {
  var maxResultsInput = document.getElementById("maxResults").value;
  var keyRenaming = document.getElementById("renamingCheckbox").checked;
  var citationKeyFields = getSelectedFields();
  var authorCapitalize = document.getElementById("authorCapitalize").checked;
  var venueUppercase = document.getElementById("venueUppercase").checked;
  var removeTimestampBiburlBibsource = document.getElementById(
    "removeTimestampBiburlBibsource"
  ).checked;
  var removeUrl = document.getElementById("removeUrl").checked;

  // Validate maxResults input
  var maxResults = parseInt(maxResultsInput, 10);
  if (isNaN(maxResults) || maxResults < 1 || maxResults > 1000) {
    updateStatus("Error: Max results must be between 1 and 1000", 3000);
    // Reset to default value
    maxResults = 30;
    document.getElementById("maxResults").value = maxResults;
    return;
  }

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

      // Show/hide drag & drop based on checkbox state
      toggleDragDropVisibility();

      // Handle migration from old format
      var fields = items.options.citationKeyFields;
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
