// options.js
import { updateStatus } from "./commons.js";

var browser = window.msBrowser || window.browser || window.chrome;
console.log("options.js loaded");

// Valid fields whitelist (used for validation throughout)
const VALID_FIELDS = ["author", "year", "venue", "title"];

// Sample values for preview
const sampleValues = {
  author: "calefato",
  year: "2023",
  venue: "esem",
  title: "option",
};

// ------------------------------------- Listeners -------------------------------------
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

// ------------------------------------- Drag & Drop -------------------------------------

function toggleDragDropVisibility() {
  const isEnabled = document.getElementById("renamingCheckbox").checked;
  const builder = document.querySelector(".citation-key-builder");
  if (builder) {
    builder.style.display = isEnabled ? "block" : "none";
  }
}

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

function handleDragStart(e) {
  e.target.classList.add("dragging");
  e.dataTransfer.effectAllowed = "move";
  e.dataTransfer.setData("text/plain", e.target.dataset.field);
  e.dataTransfer.setData("source", e.target.parentElement.id);
}

function handleDragEnd(e) {
  e.target.classList.remove("dragging");
  document.querySelectorAll(".drag-over").forEach((el) => {
    el.classList.remove("drag-over");
  });
}

function handleDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
  e.currentTarget.classList.add("drag-over");
}

function handleDragLeave(e) {
  e.currentTarget.classList.remove("drag-over");
}

function handleDrop(e) {
  e.preventDefault();
  e.currentTarget.classList.remove("drag-over");

  const field = e.dataTransfer.getData("text/plain");
  const source = e.dataTransfer.getData("source");
  const dropzone = document.getElementById("citationKeyDropzone");

  // Check if field is already in dropzone
  const existingToken = dropzone.querySelector(`[data-field="${field}"]`);
  if (existingToken) {
    return; // Field already in dropzone
  }

  // Find and move the token
  const token = document.querySelector(
    `#${source} .field-token[data-field="${field}"]`
  );
  if (token) {
    // Create a new token for the dropzone with remove button
    const newToken = createDropzoneToken(field);
    if (newToken) {
      dropzone.appendChild(newToken);
      // Hide original token
      token.style.display = "none";
      updatePreview();
    }
  }
}

function handleDropToAvailable(e) {
  e.preventDefault();
  e.currentTarget.classList.remove("drag-over");

  const field = e.dataTransfer.getData("text/plain");
  const source = e.dataTransfer.getData("source");

  if (source === "citationKeyDropzone") {
    removeFieldFromDropzone(field);
  }
}

function createDropzoneToken(field) {
  // Validate field against whitelist
  if (!VALID_FIELDS.includes(field)) {
    console.error("Invalid field:", field);
    return null;
  }

  const token = document.createElement("div");
  token.className = "field-token in-dropzone";
  token.draggable = true;
  token.dataset.field = field;

  // Use safe DOM methods instead of innerHTML to prevent XSS
  const textNode = document.createTextNode(capitalize(field));
  token.appendChild(textNode);

  const removeBtn = document.createElement("span");
  removeBtn.className = "remove-btn";
  removeBtn.title = "Remove";
  removeBtn.textContent = "\u00d7";
  token.appendChild(removeBtn);

  token.addEventListener("dragstart", handleDragStart);
  token.addEventListener("dragend", handleDragEnd);

  // Remove button click
  removeBtn.addEventListener("click", function (e) {
    e.stopPropagation();
    removeFieldFromDropzone(field);
  });

  return token;
}

function removeFieldFromDropzone(field) {
  // Validate field against whitelist
  if (!VALID_FIELDS.includes(field)) {
    return;
  }

  const dropzone = document.getElementById("citationKeyDropzone");
  const token = dropzone.querySelector(`[data-field="${field}"]`);
  if (token) {
    token.remove();
  }

  // Show original token in available fields
  const originalToken = document.querySelector(
    `#availableFields .field-token[data-field="${field}"]`
  );
  if (originalToken) {
    originalToken.style.display = "";
  }

  updatePreview();
}

function getSelectedFields() {
  const dropzone = document.getElementById("citationKeyDropzone");
  const tokens = dropzone.querySelectorAll(".field-token");
  return Array.from(tokens).map((t) => t.dataset.field);
}

function setSelectedFields(fields) {
  const dropzone = document.getElementById("citationKeyDropzone");

  // Clear dropzone
  dropzone.innerHTML = "";

  // Show all available tokens first
  document.querySelectorAll("#availableFields .field-token").forEach((t) => {
    t.style.display = "";
  });

  // Add selected fields to dropzone
  fields.forEach((field) => {
    const originalToken = document.querySelector(
      `#availableFields .field-token[data-field="${field}"]`
    );
    if (originalToken) {
      const newToken = createDropzoneToken(field);
      if (newToken) {
        dropzone.appendChild(newToken);
        originalToken.style.display = "none";
      }
    }
  });

  updatePreview();
}

// Safe getter to avoid dynamic property access (object injection)
function getSampleValue(field) {
  switch (field) {
    case "author": return sampleValues.author;
    case "year": return sampleValues.year;
    case "venue": return sampleValues.venue;
    case "title": return sampleValues.title;
    default: return "";
  }
}

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

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// ------------------------------------- Save/Restore -------------------------------------

// Saves options to chrome.storage
function saveOptions() {
  var maxResultsInput = document.getElementById("maxResults").value;
  var keyRenaming = document.getElementById("renamingCheckbox").checked;
  var citationKeyFields = getSelectedFields();
  var authorCapitalize = document.getElementById("authorCapitalize").checked;
  var venueUppercase = document.getElementById("venueUppercase").checked;
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
      },
    },
    function () {
      // Update status to let user know options were saved.
      updateStatus("Options saved successfully", 2000);
    }
  );
}

// Restores select box and checkbox state using the preferences stored in local storage
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
