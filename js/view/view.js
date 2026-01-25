/*global chrome*/

/**
 * @file view.js
 * @description View component for the MVC architecture (background script side).
 * Sends publication data to popup.js for rendering via message passing.
 */

console.log("view.js loaded");
var browser = browser || chrome;

/**
 * View class for sending publication data to the popup for rendering.
 * Acts as a bridge between the background script and the popup UI.
 * @class
 */
export class PublicationView {
  /**
   * Creates a new PublicationView instance
   * @constructor
   */
  constructor() {
    /** @type {number} Current pagination offset */
    this.currentOffset = 0;
  }

  /**
   * Sets the current pagination offset
   * @param {number} offset - The pagination offset value
   */
  setCurrentOffset(offset) {
    this.currentOffset = offset;
  }

  /**
   * Sends updated publication data to popup.js via browser message
   * @param {string} responseStatus - HTTP response status from DBLP API
   * @param {Object[]} publications - Array of publication objects
   * @param {number} totalHits - Total number of matching publications
   * @param {number} sentHits - Number of publications in current response
   * @param {number} excludedCount - Number of excluded publications
   */
  update(responseStatus, publications, totalHits, sentHits, excludedCount) {
    // Ensure all values have valid defaults to prevent NaN/undefined on Chrome
    const safeResponseStatus = responseStatus || "OK";
    const safeTotalHits = typeof totalHits === "number" ? totalHits : 0;
    const safeSentHits = typeof sentHits === "number" ? sentHits : 0;
    const safeExcludedCount = typeof excludedCount === "number" ? excludedCount : 0;

    console.log(
      `Sending response to popup.js: ${safeResponseStatus}, ${safeTotalHits}, ${safeSentHits}, ${safeExcludedCount}, offset: ${this.currentOffset}`
    );
    browser.runtime.sendMessage({
      script: "view.js",
      type: "RESPONSE_SEARCH_PUBLICATIONS",
      responseStatus: safeResponseStatus,
      totalHits: safeTotalHits,
      sentHits: safeSentHits,
      excludedCount: safeExcludedCount,
      publications: publications || [],
      currentOffset: this.currentOffset || 0,
    });
  }
}
