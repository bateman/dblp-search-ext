/**
 * @file controller.js
 * @description Controller component for the MVC architecture. Routes between
 * model and view: runs searches on the model and has the view build the response.
 */

console.log("controller.js loaded");

/**
 * Controller class for managing communication between PublicationModel and PublicationView.
 * @class
 */
export class PublicationController {
  /**
   * Creates a new PublicationController instance
   * @constructor
   * @param {PublicationModel} model - The publication model instance
   * @param {PublicationView} view - The publication view instance
   */
  constructor(model, view) {
    /** @type {PublicationModel} */
    this.model = model;
    /** @type {PublicationView} */
    this.view = view;
  }

  /**
   * Handles a search request: runs it on the model, then has the view build
   * the response for the popup that asked
   * @async
   * @param {string} query - The search query string
   * @param {number} [offset=0] - Pagination offset
   * @returns {Promise<Object>} The response message for popup.js
   */
  async handleSearch(query, offset = 0) {
    console.log(`Controller received query: ${query} (offset: ${offset})`);
    const result = await this.model.searchPublications(query, offset);
    return this.view.render(result);
  }

  /**
   * Handles navigation to the next page of results
   * @async
   * @param {string} query - The search query string
   * @param {number} currentOffset - Current pagination offset
   * @param {number} maxResults - Number of results per page
   * @returns {Promise<Object>} The response message for popup.js
   */
  async handleNextPage(query, currentOffset, maxResults) {
    const nextOffset = currentOffset + maxResults;
    return this.handleSearch(query, nextOffset);
  }

  /**
   * Handles navigation to the previous page of results
   * @async
   * @param {string} query - The search query string
   * @param {number} currentOffset - Current pagination offset
   * @param {number} maxResults - Number of results per page
   * @returns {Promise<Object>} The response message for popup.js
   */
  async handlePreviousPage(query, currentOffset, maxResults) {
    const previousOffset = Math.max(0, currentOffset - maxResults);
    return this.handleSearch(query, previousOffset);
  }
}
