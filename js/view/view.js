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
    console.log(
      `Sending response to popup.js: ${responseStatus}, ${totalHits}, ${sentHits}, ${excludedCount}, offset: ${this.currentOffset}`
    );
    browser.runtime.sendMessage({
      script: "view.js",
      type: "RESPONSE_SEARCH_PUBLICATIONS",
      responseStatus: responseStatus,
      totalHits: totalHits,
      sentHits: sentHits,
      excludedCount: excludedCount,
      publications: publications,
      currentOffset: this.currentOffset,
    });
  }
}
