/**
 * @file bibtex.js
 * @description BibTeX parsing and citation key manipulation utilities.
 */

/**
 * Extracts author surname from DBLP citation key
 * @param {string} key - DBLP citation key (e.g., "DBLP:journals/tse/Smith21")
 * @returns {string} Author surname with numeric suffixes removed
 */
export function extractAuthorFromKey(key) {
  let name = key.split("/")[2].replace(",", "");
  name = name.replace(/\d+/g, "");
  name = name.replace(/[A-Z]+$/, "");
  return name;
}

/**
 * Extracts venue abbreviation from DBLP citation key
 * @param {string} key - DBLP citation key
 * @returns {string} Venue abbreviation
 */
export function extractVenueFromKey(key) {
  return key.split("/")[1];
}

/**
 * Extracts publication year from BibTeX data
 * @param {string} data - BibTeX entry string
 * @returns {string|null} Four-digit year or null if not found
 */
export function extractYearFromBibtex(data) {
  const yearMatch = data.match(/year\s*=\s*\{(\d+)\},/);
  if (!yearMatch || yearMatch.length < 2) {
    return null;
  }
  return yearMatch[1];
}

/**
 * Finds the matching closing brace for a BibTeX field value
 * @param {string} data - BibTeX entry string
 * @param {number} startIndex - Index to start searching from (after opening brace)
 * @returns {number} Index after the matching closing brace, or -1 if not found
 */
export function findMatchingBrace(data, startIndex) {
  let braceCount = 1;
  let endIndex = startIndex;
  while (endIndex < data.length && braceCount > 0) {
    const char = data.charAt(endIndex);
    if (char === "{") {
      braceCount++;
    } else if (char === "}") {
      braceCount--;
    }
    endIndex++;
  }
  return braceCount === 0 ? endIndex : -1;
}

/**
 * Finds the first significant word from an array, skipping articles and short words
 * @param {string[]} words - Array of words to search
 * @returns {string} First significant word (lowercase, alphanumeric only) or empty string
 */
export function findFirstSignificantWord(words) {
  const skipWords = ["a", "an", "the", "on", "in", "at"];
  for (const wordItem of words) {
    const word = wordItem.toLowerCase();
    if (skipWords.indexOf(word) === -1 && word.length > 2) {
      return word.replace(/[^a-z0-9]/g, "");
    }
  }
  return "";
}

/**
 * Extracts the first significant word from the title field in BibTeX data
 * @param {string} data - BibTeX entry string
 * @returns {string} First significant title word or empty string
 */
export function extractFirstTitleWord(data) {
  const titleStart = data.match(/title\s*=\s*\{/i);
  if (!titleStart) {
    return "";
  }

  const startIndex = titleStart.index + titleStart[0].length;
  const endIndex = findMatchingBrace(data, startIndex);
  if (endIndex === -1) {
    return "";
  }

  let title = data.substring(startIndex, endIndex - 1);
  title = title.replace(/\\[a-zA-Z]+\{([^}]*)\}/g, "$1");
  title = title.replace(/[{}\\]/g, "");
  const words = title.split(/\s+/).filter(function(w) { return w.length > 0; });
  return findFirstSignificantWord(words);
}

/**
 * Builds a citation key from specified fields and formatting options
 * @param {string[]} fields - Array of field names to include (author, year, venue, title, dash, underscore)
 * @param {string} author - Author surname
 * @param {string} year - Publication year
 * @param {string} venue - Venue abbreviation
 * @param {string} title - First significant title word
 * @param {boolean} authorCapitalize - Whether to capitalize author name
 * @param {boolean} venueUppercase - Whether to uppercase venue
 * @returns {string} Formatted citation key
 */
export function buildCitationKey(fields, author, year, venue, title, authorCapitalize, venueUppercase) {
  let authorValue = author.toLowerCase();
  if (authorCapitalize) {
    authorValue = authorValue.charAt(0).toUpperCase() + authorValue.slice(1);
  }
  const venueValue = venueUppercase ? venue.toUpperCase() : venue.toLowerCase();

  return fields.map(function(f) {
    switch (f) {
      case "author": return authorValue;
      case "year": return year;
      case "venue": return venueValue;
      case "title": return title;
      case "dash": return "-";
      case "underscore": return "_";
      default: return "";
    }
  }).join("");
}

/**
 * Removes DBLP metadata fields (timestamp, biburl, bibsource) from BibTeX
 * @param {string} data - BibTeX entry string
 * @returns {string} Cleaned BibTeX string
 */
export function cleanBibtexMetadata(data) {
  data = data.replace(/\s*timestamp\s*=\s*\{[^}]*\},[\s\n]*/g, "");
  data = data.replace(/\s*biburl\s*=\s*\{[^}]*\},[\s\n]*/g, "");
  data = data.replace(/\s*bibsource\s*=\s*\{[^}]*\}[\s\n,]*/g, "");
  data = data.replace(/,(\s*})\s*$/, "\n}");
  data = data.replace(/\n\s*\n/g, "\n");
  return data;
}

/**
 * Removes the URL field from BibTeX entry
 * @param {string} data - BibTeX entry string
 * @returns {string} BibTeX string with URL field removed
 */
export function removeUrlFromBibtex(data) {
  data = data.replace(/\n\s*url\s*=\s*\{[^}]*\},?/g, "");
  data = data.replace(/,(\s*})\s*$/, "\n}");
  data = data.replace(/\n\s*\n/g, "\n");
  return data;
}
