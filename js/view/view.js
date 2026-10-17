/**
 * @file view.js
 * @description View component for the MVC architecture (background script side).
 * Builds the response message that carries a search result to popup.js.
 */

console.log("view.js loaded");

/**
 * View class that turns a search result into the response for the popup.
 * The response is sent back only to the page that made the request (never
 * broadcast), so a page can drop responses to searches it has since replaced.
 * @class
 */
export class PublicationView {
  /**
   * Builds the response message for popup.js from a search result
   * @param {SearchResult} result - The result returned by the model
   * @returns {Object} RESPONSE_SEARCH_PUBLICATIONS message for popup.js
   */
  render(result) {
    // Ensure all values have valid defaults to prevent NaN/undefined on Chrome
    const safeResponseStatus = result.status || "OK";
    const safeTotalHits = typeof result.totalHits === "number" ? result.totalHits : 0;
    const safeSentHits = typeof result.sentHits === "number" ? result.sentHits : 0;
    const safeExcludedCount =
      typeof result.excludedCount === "number" ? result.excludedCount : 0;
    const safeCurrentOffset =
      typeof result.currentOffset === "number" ? result.currentOffset : 0;

    console.log(
      `Sending response to popup.js: ${safeResponseStatus}, ${safeTotalHits}, ${safeSentHits}, ${safeExcludedCount}, offset: ${safeCurrentOffset}`
    );
    return {
      script: "view.js",
      type: "RESPONSE_SEARCH_PUBLICATIONS",
      responseStatus: safeResponseStatus,
      totalHits: safeTotalHits,
      sentHits: safeSentHits,
      excludedCount: safeExcludedCount,
      errorMessage: result.errorMessage || "",
      publications: result.publications || [],
      currentOffset: safeCurrentOffset,
    };
  }
}
