/**
 * @file validation.js
 * @description Input validation utilities for URLs and user-configurable values.
 */

/**
 * Validates a URL to prevent javascript: protocol XSS attacks
 * @param {string} url - The URL to validate
 * @returns {boolean} True if URL is valid HTTP/HTTPS
 */
export function isValidURL(url) {
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

/**
 * Validates the max results input value
 * @param {string} input - The input value to validate
 * @returns {{valid: boolean, value: number}} Validation result with parsed value
 */
export function validateMaxResults(input) {
  const value = parseInt(input, 10);
  const valid = !isNaN(value) && value >= 1 && value <= 1000;
  return { valid, value: valid ? value : 30 };
}

/**
 * Validates the popup width input value
 * @param {string} input - The input value to validate
 * @returns {{valid: boolean, value: number}} Validation result with parsed value
 */
export function validatePopupWidth(input) {
  const value = parseInt(input, 10);
  const valid = !isNaN(value) && value >= 500 && value <= 800;
  return { valid, value: valid ? value : 800 };
}

/**
 * Safely extracts a numeric value with a default fallback
 * @param {*} value - The value to check
 * @param {number} defaultValue - Default value if not a number
 * @returns {number} The numeric value or default
 */
export function getNumericValue(value, defaultValue) {
  return typeof value === "number" && isFinite(value) ? value : defaultValue;
}

/**
 * Parses search data from storage with default values applied
 * @param {Object} items - Storage items object
 * @returns {Object} Parsed search data with defaults
 */
export function parseSearchWithDefaults(items) {
  const search = items.search || {};
  return {
    status: search.status || "",
    totalHits: getNumericValue(search.totalHits, 0),
    sentHits: getNumericValue(search.sentHits, 0),
    excludedCount: getNumericValue(search.excludedCount, 0),
    currentOffset: getNumericValue(search.currentOffset, 0),
    publications: search.publications || [],
    paperTitle: search.paperTitle || ""
  };
}
