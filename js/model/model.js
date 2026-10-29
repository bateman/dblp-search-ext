/* global chrome */

/**
 * @file model.js
 * @description Model component for the MVC architecture. Handles DBLP API calls,
 * data parsing, and storage integration.
 */

console.log("model.js loaded");
const browser = globalThis.browser || chrome;

import { assertDblpData, dblpFetch } from "../utils/dblp.js";

/**
 * Result of one search, sent back to the popup that asked for it.
 * @typedef {Object} SearchResult
 * @property {string} status - "OK", "Error" or "Request Timeout"
 * @property {string} errorMessage - Human-readable error detail ("" on success)
 * @property {Object[]} publications - Parsed publication objects
 * @property {number} totalHits - Total number of hits from DBLP API
 * @property {number} sentHits - Number of hits returned in this response
 * @property {number} excludedCount - Excluded publications (e.g., CoRR abs entries)
 * @property {number} currentOffset - Pagination offset of this response
 */

/**
 * dblp publication types (the API's `info.type`) mapped to the entry types
 * the popup uses for color coding and filtering.
 * @type {Map<string, string>}
 */
const DBLP_TYPES = new Map([
  ["Journal Articles", "article"],
  ["Conference and Workshop Papers", "inproceedings"],
  ["Editorship", "editor"],
  ["Parts in Books or Collections", "incollection"],
  ["Books and Theses", "book"],
  ["Informal and Other Publications", "misc"],
  ["Reference Works", "refwork"],
  ["Data and Artifacts", "data"],
]);

/**
 * Model class for fetching and parsing publication data from DBLP API.
 * @class
 */
export class PublicationModel {
  /**
   * Searches for publications on DBLP API matching the given query. Each call
   * builds its own result, so overlapping searches cannot overwrite each other.
   * @async
   * @param {string} query - The search query string
   * @param {number} [offset=0] - Pagination offset for results
   * @returns {Promise<SearchResult>} The outcome of this search
   */
  async searchPublications(query, offset = 0) {
    console.log(`Searching publications matching: ${query} (offset: ${offset})`);
    let url = `https://dblp.org/search/publ/api?q=${encodeURIComponent(
      query
    )}&format=json`;
    url = await this.getUrlWithMaxResults(url);
    if (offset > 0) {
      url += "&f=" + offset;
    }
    try {
      const data = await dblpFetch(url, (response) => {
        // Throws an "HttpError" on HTTP errors (e.g. 429) and on dblp's anti-bot page
        assertDblpData(response);
        return response.json();
      });
      if (!data || !data.result || !data.result.hits) {
        // Valid HTTP response but not the shape we expect: treat as a parse error
        // (and keep it distinct from a network failure, which also throws TypeError)
        const parseError = new Error("The dblp API returned an unexpected response.");
        parseError.name = "ParseError";
        throw parseError;
      }
      return this.buildResult(data.result.hits, offset);
    } catch (error) {
      const { status, message } = this.classifyError(error);
      console.error("Search failed: ", message, error);
      // Zero counts so a failed search doesn't show stale/zero hits as data
      return {
        status: status,
        errorMessage: message,
        publications: [],
        totalHits: 0,
        sentHits: 0,
        excludedCount: 0,
        currentOffset: offset,
      };
    }
  }

  /**
   * Builds the result of a successful search from the API's `hits` object
   * @param {Object} hits - The `result.hits` object of the API response
   * @param {number} offset - Pagination offset of the request
   * @returns {SearchResult} The search result
   */
  buildResult(hits, offset) {
    const sentHits = parseInt(hits["@sent"], 10) || 0;
    const parsed = sentHits > 0 && hits.hit
      ? this.parsePublications(hits.hit)
      : { publications: [], excludedCount: 0 };
    return {
      status: "OK",
      errorMessage: "",
      publications: parsed.publications,
      totalHits: parseInt(hits["@total"], 10) || 0,
      sentHits: sentHits,
      excludedCount: parsed.excludedCount,
      currentOffset: offset,
    };
  }

  /**
   * Maps a fetch/parse error to a user-facing status and a descriptive message.
   * @param {Error} error - The error thrown during search
   * @returns {{status: string, message: string}} Status label and detail message
   */
  classifyError(error) {
    if (error.name === "AbortError") {
      return {
        status: "Request Timeout",
        message: "Request timeout: the dblp API did not respond in time.",
      };
    }
    if (error.name === "HttpError" || error.name === "ParseError") {
      return { status: "Error", message: error.message };
    }
    if (error.name === "TypeError") {
      // fetch() rejects with a TypeError on network/DNS/CORS failures
      return {
        status: "Error",
        message: "Network error: could not reach the dblp API. Check your connection.",
      };
    }
    return {
      status: "Error",
      message: `Could not process the dblp response: ${error.message}`,
    };
  }

  /**
   * Appends maxResults parameter to the API URL from user settings
   * @async
   * @param {string} baseUrl - The base DBLP API URL
   * @returns {Promise<string>} URL with maxResults parameter appended
   */
  async getUrlWithMaxResults(baseUrl) {
    return new Promise((resolve) => {
      browser.storage.local.get(
        {
          options: {
            maxResults: 30,
          },
        },
        function (items) {
          let maxResults = items.options.maxResults;
          maxResults = Math.min(Math.max(maxResults, 1), 1000);
          const url = baseUrl + "&h=" + maxResults;
          resolve(url);
        }
      );
    });
  }

  /**
   * Parses raw publication data from DBLP API response
   * @param {Object[]} pubsInfo - Array of publication info objects from DBLP
   * @returns {{publications: Object[], excludedCount: number}} Parsed publications and count of excluded entries
   */
  parsePublications(pubsInfo) {
    const results = [];
    let excludedCount = 0;

    for (const pubInfo of pubsInfo) {
      const pub = pubInfo.info;

      if (this.isExcludedPublication(pub)) {
        excludedCount++;
        continue;
      }

      const authors = this.extractAuthors(pub.authors);
      const venue = this.constructVenue(pub);
      const publication = this.createPublication(pub, authors, venue);

      results.push(publication);
    }

    return {
      publications: results,
      excludedCount: excludedCount,
    };
  }

  /**
   * Checks if a publication should be excluded from results (e.g., CoRR abs entries)
   * @param {Object} pub - Publication info object
   * @param {string} pub.key - Publication key from DBLP
   * @returns {boolean} True if publication should be excluded
   */
  isExcludedPublication(pub) {
    return pub.key.includes("corr/abs-");
  }

  /**
   * Extracts author names from DBLP author info, cleaning up numeric suffixes
   * @param {Object} authorsInfo - Author information from DBLP
   * @param {Object|Object[]} authorsInfo.author - Single author or array of authors
   * @returns {string[]} Array of cleaned author names
   */
  extractAuthors(authorsInfo) {
    // Fix: dblp api sometimes returns '000n' next to authors' names
    const authors = [];
    // Some entries (e.g. front matter, editorials) have no authors field
    if (!authorsInfo || !authorsInfo.author) {
      return authors;
    }
    const regex = / 000\d+$/; // Matches ' 000' followed by one or more digits at the end of the string
    if (authorsInfo.author.length === undefined) {
      authors.push(authorsInfo.author.text.replace(regex, ""));
    } else {
      for (const author of authorsInfo.author) {
        authors.push(author.text.replace(regex, ""));
      }
    }
    return authors;
  }

  /**
   * Constructs venue string including volume and number for journal articles
   * @param {Object} pub - Publication info object
   * @param {string} pub.venue - Publication venue name
   * @param {string} pub.type - Publication type
   * @param {string} [pub.volume] - Volume number for journals
   * @param {string} [pub.number] - Issue number for journals
   * @returns {string} Formatted venue string
   */
  constructVenue(pub) {
    let venue = pub.venue;
    const type = this.transformType(pub.type);
    if (type === "article") {
      if (pub.volume !== undefined) {
        venue += " " + pub.volume;
      }
      if (pub.number !== undefined) {
        venue += "(" + pub.number + ")";
      }
    }
    return venue;
  }

  /**
   * Creates a standardized publication object from DBLP data
   * @param {Object} pub - Raw publication info from DBLP
   * @param {string[]} authors - Array of author names
   * @param {string} venue - Formatted venue string
   * @returns {Object} Standardized publication object with properties: type, title, permaLink, authors, year, venue, pages, doi, doiURL, bibtexLink, access
   */
  createPublication(pub, authors, venue) {
    return {
      type: this.transformType(pub.type),
      title: pub.title,
      permaLink: pub.url,
      authors: authors,
      year: pub.year,
      venue: venue,
      pages: pub.pages,
      doi: pub.doi ? pub.doi : "N/A",
      doiURL: pub.ee,
      bibtexLink: pub.url + ".bib?param=1",
      access: pub.access,
    };
  }

  /**
   * Transforms a dblp publication type to the entry type used by the popup
   * @param {string} type - DBLP publication type (e.g., "Journal Articles")
   * @returns {string|undefined} Entry type (e.g., "article") or undefined if unknown type
   */
  transformType(type) {
    return DBLP_TYPES.get(type);
  }
}
