/* global chrome */

/**
 * @file model.js
 * @description Model component for the MVC architecture. Handles DBLP API calls,
 * data parsing, and storage integration.
 */

console.log("model.js loaded");
const browser = globalThis.browser || chrome;

/**
 * Model class for managing publication data from DBLP API.
 * Implements the observer pattern to notify controllers of data changes.
 * @class
 */
export class PublicationModel {
  /**
   * Creates a new PublicationModel instance
   * @constructor
   */
  constructor() {
    /** @type {Object[]} Array of parsed publication objects */
    this.publications = [];
    /** @type {Function|null} Callback function to notify observers of changes */
    this.notify = null;
    /** @type {string} HTTP response status */
    this.status = "";
    /** @type {number} Total number of hits from DBLP API */
    this.totalHits = 0;
    /** @type {number} Number of hits returned in current response */
    this.sentHits = 0;
    /** @type {number} Number of excluded publications (e.g., CoRR abs entries) */
    this.excludedCount = 0;
    /** @type {number} Current pagination offset */
    this.currentOffset = 0;
  }

  /**
   * Searches for publications on DBLP API matching the given query
   * @async
   * @param {string} query - The search query string
   * @param {number} [offset=0] - Pagination offset for results
   * @returns {Promise<void>}
   */
  async searchPublications(query, offset = 0) {
    console.log(`Searching publications matching: ${query} (offset: ${offset})`);
    this.currentOffset = offset;
    let url = `https://dblp.org/search/publ/api?q=${encodeURIComponent(
      query
    )}&format=json`;
    url = await this.getUrlWithMaxResults(url);
    if (offset > 0) {
      url += "&f=" + offset;
    }
    try {
      // Create AbortController for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);

      // HTTP/2 returns empty statusText on Chrome, so use "OK" for successful responses
      this.status = response.ok ? "OK" : (response.statusText || "Error");
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${this.status}`);
      }
      const data = await response.json();
      this.totalHits = parseInt(data.result.hits["@total"], 10) || 0;
      this.sentHits = parseInt(data.result.hits["@sent"], 10) || 0;
      if (this.sentHits > 0 && data.result.hits.hit) {
        const result = this.parsePublications(data.result.hits.hit);
        this.publications = result.publications;
        this.excludedCount = result.excludedCount;
      } else {
        this.publications = [];
        this.excludedCount = 0;
      }
    } catch (error) {
      if (error.name === "AbortError") {
        console.error("Request timeout: The dblp API did not respond in time");
        this.status = "Request Timeout";
      } else {
        console.error("There was a problem with the fetch operation: ", error);
        this.status = "Error";
      }
    }
    if (this.notify) {
      // Notify the view through controller that the model has changed
      this.notify();
    }
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
   * Transforms DBLP publication type to BibTeX entry type
   * @param {string} type - DBLP publication type (e.g., "Journal Articles")
   * @returns {string|undefined} BibTeX entry type (e.g., "article") or undefined if unknown type
   */
  transformType(type) {
    var _type;
    switch (type) {
      case "Journal Articles":
        _type = "article";
        break;
      case "Conference and Workshop Papers":
        _type = "inproceedings";
        break;
      case "Editorship":
        _type = "editor";
        break;
      case "Parts in Books or Collections":
        _type = "incollection";
        break;
      case "Books and Theses":
        _type = "book";
        break;
      case "Informal and Other Publications":
        _type = "misc";
        break;
      case "Reference Works":
        _type = "refwork";
        break;
    }
    return _type;
  }

  /**
   * Subscribes a callback function to be notified when model data changes
   * @param {Function} callback - Callback function to invoke on data changes
   */
  subscribe(callback) {
    this.notify = callback;
  }
}
