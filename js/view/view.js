/*global chrome*/

// view.js
console.log("view.js loaded");
var browser = browser || chrome;

export class PublicationView {
  constructor() {
    this.currentOffset = 0;
  }

  setCurrentOffset(offset) {
    this.currentOffset = offset;
  }

  // Callback function for controller to notify to update the view
  // Sends raw publications data to popup.js for rendering
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
