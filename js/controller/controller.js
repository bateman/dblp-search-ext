/**
 * @file controller.js
 * @description Controller component for the MVC architecture. Routes between
 * model and views, handling user actions and data updates.
 */

console.log("controller.js loaded");

/**
 * Controller class for managing communication between PublicationModel and PublicationView.
 * Subscribes to model changes and updates the view accordingly.
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

    // Subscribe to model changes and update view
    this.model.subscribe(() => {
      console.log(
        "Controller received notification from model to update the view: ",
        this.model.status,
        this.model.totalHits,
        this.model.sentHits,
        this.model.excludedCount,
        this.model.currentOffset
      );
      this.view.setCurrentOffset(this.model.currentOffset);
      this.view.update(
        this.model.status,
        this.model.publications,
        this.model.totalHits,
        this.model.sentHits,
        this.model.excludedCount
      );
    });
  }

  /**
   * Handles a search request by delegating to the model
   * @async
   * @param {string} query - The search query string
   * @param {number} [offset=0] - Pagination offset
   * @returns {Promise<void>}
   */
  async handleSearch(query, offset = 0) {
    console.log(`Controller received query: ${query} (offset: ${offset})`);
    await this.model.searchPublications(query, offset);
  }

  /**
   * Handles navigation to the next page of results
   * @async
   * @param {string} query - The search query string
   * @param {number} currentOffset - Current pagination offset
   * @param {number} maxResults - Number of results per page
   * @returns {Promise<void>}
   */
  async handleNextPage(query, currentOffset, maxResults) {
    const nextOffset = currentOffset + maxResults;
    await this.handleSearch(query, nextOffset);
  }

  /**
   * Handles navigation to the previous page of results
   * @async
   * @param {string} query - The search query string
   * @param {number} currentOffset - Current pagination offset
   * @param {number} maxResults - Number of results per page
   * @returns {Promise<void>}
   */
  async handlePreviousPage(query, currentOffset, maxResults) {
    const previousOffset = Math.max(0, currentOffset - maxResults);
    await this.handleSearch(query, previousOffset);
  }
}
