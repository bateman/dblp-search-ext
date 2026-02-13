/**
 * @file doi.js
 * @description DOI validation and extraction utilities.
 */

/**
 * DOI validation patterns based on Crossref recommendations
 * @see https://www.crossref.org/blog/dois-and-matching-regular-expressions/
 * @type {RegExp[]}
 */
export const DOI_PATTERNS = [
  /^10\.\d{4,9}\/[-._;()/:A-Z0-9]+$/i, // Standard DOIs (74.4M+)
  /^10\.1002\/[^\s]+$/i, // Wiley legacy DOIs (~300K) - intentionally permissive for SICI
];

/**
 * Validates if a string is a valid DOI format
 * @param {string} doi - The DOI string to validate
 * @returns {boolean} True if valid DOI format
 */
export function isValidDOI(doi) {
  return DOI_PATTERNS.some((pattern) => pattern.test(doi));
}

/**
 * Removes DOI URL prefixes from text using string operations (avoids regex ReDoS)
 * Handles: https://doi.org/, http://doi.org/, https://dx.doi.org/, doi.org/, etc.
 * @param {string} text - The text to clean
 * @returns {string} Text with URL prefix removed
 */
export function removeDOIUrlPrefix(text) {
  const lowerText = text.toLowerCase();
  const prefixes = [
    "https://dx.doi.org/",
    "http://dx.doi.org/",
    "https://doi.org/",
    "http://doi.org/",
    "dx.doi.org/",
    "doi.org/",
  ];

  for (const prefix of prefixes) {
    if (lowerText.startsWith(prefix)) {
      return text.slice(prefix.length);
    }
  }
  return text;
}

/**
 * Extracts a DOI from text, handling URL prefixes and trailing punctuation
 * @param {string} text - The text that may contain a DOI
 * @returns {string|null} The extracted DOI or null if invalid
 */
export function extractDOI(text) {
  if (!text) return null;

  let cleaned = text.trim();

  // Remove common URL prefixes (using string methods to avoid ReDoS)
  cleaned = removeDOIUrlPrefix(cleaned);

  // Remove doi: prefix
  cleaned = cleaned.replace(/^doi:\s*/i, "");

  // Remove URL query parameters and fragments only when they look like URL syntax
  // (contain = or &), since ? and # can be valid DOI characters
  cleaned = cleaned.replace(/[?#](?=[^?#]*[=&]).*$/, "");

  // Strip trailing punctuation (preserve : and ; which can be valid in DOIs)
  cleaned = cleaned.replace(/[.,!?'"\s]+$/, "");

  // Check if anything remains after cleaning
  if (!cleaned) return null;

  return isValidDOI(cleaned) ? cleaned : null;
}
