/*global chrome*/

// view.js
console.log("view.js loaded");
var browser = browser || chrome;

export class PublicationView {
  constructor() {
    this.table = "";
    this.currentOffset = 0;
  }

  setCurrentOffset(offset) {
    this.currentOffset = offset;
  }

  // Escape HTML to prevent XSS attacks
  escapeHTML(str) {
    if (str === null || str === undefined) {
      return "";
    }
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // Validate URL to prevent javascript: protocol XSS attacks
  isValidURL(url) {
    if (!url || typeof url !== "string") {
      return false;
    }
    try {
      const parsed = new URL(url);
      return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch {
      return false;
    }
  }

  // Callback function for controller to notify to update the view
  update(responseStatus, publications, totalHits, sentHits, excludedCount) {
    if (totalHits > 0) {
      console.log(`Building table with ${sentHits} publications.`);
      this.table = this.buildTable(publications);
    } else {
      console.log("Warning: No publications found. Clearing the table.");
      this.table = "";
    }
    console.log(
      `Sending reponse to popup.js to display results : ${responseStatus}, ${totalHits}, ${sentHits}, ${excludedCount}, offset: ${this.currentOffset}`
    );
    browser.runtime.sendMessage({
      script: "view.js",
      type: "RESPONSE_SEARCH_PUBLICATIONS",
      responseStatus: responseStatus,
      totalHits: totalHits,
      sentHits: sentHits,
      excludedCount: excludedCount,
      resultsTable: this.table,
      currentOffset: this.currentOffset,
    });
  }

  // Build the table with the new data using string concatenation with HTML escaping
  // Note: Uses string building instead of DOM methods because this runs in a service worker
  buildTable(publications) {
    let htmlTable =
      '<table id="results-table" class="table table-striped table-hover">';
    htmlTable +=
      '<thead><tr><th scope="col" colspan="2">Title</th><th scope="col">Authors</th><th scope="col">Year</th><th scope="col">Venue</th><th scope="col">DOI</th><th scope="col">Access</th><th scope="col">BibTeX</th></tr></thead>';
    htmlTable += "<tbody>";

    publications.forEach((result) => {
      // Validate and escape all user-provided data
      const safeType = this.escapeHTML(result.type);
      const safeTitle = this.escapeHTML(result.title);
      const safePermaLink = this.isValidURL(result.permaLink)
        ? this.escapeHTML(result.permaLink)
        : "#";
      const authors = Array.isArray(result.authors) ? result.authors : [];
      const safeAuthors = this.escapeHTML(authors.join(", "));
      const safeYear = this.escapeHTML(result.year);
      const safeVenue = this.escapeHTML(result.venue);
      const safeDoi = this.escapeHTML(result.doi);
      const safeDoiURL = this.isValidURL(result.doiURL)
        ? this.escapeHTML(result.doiURL)
        : "#";
      const validAccess = ["open", "closed"].includes(result.access)
        ? result.access
        : "closed";
      const safeBibtexLink = this.isValidURL(result.bibtexLink)
        ? this.escapeHTML(result.bibtexLink)
        : "";

      htmlTable += "<tr>";
      htmlTable += `<td><img class="${safeType}" title="${safeType}" src="../images/pub-type.png"></td>`;
      htmlTable += `<td><a href="${safePermaLink}" target="_blank" title="${safePermaLink}">${safeTitle}</a></td>`;
      htmlTable += `<td>${safeAuthors}</td>`;
      htmlTable += `<td>${safeYear}</td>`;
      htmlTable += `<td>${safeVenue}</td>`;
      htmlTable += `<td><a href="${safeDoiURL}" target="_blank">${safeDoi}</a></td>`;
      htmlTable += `<td class="center"><img class="access" src="../images/${validAccess}-access.png" title="This publication is ${validAccess} access"></td>`;
      htmlTable += `<td class="center"><button class="copyBibtexButton" title="Copy BibTex" data-url="${safeBibtexLink}"><img src="../images/copy.png"></button></td>`;
      htmlTable += "</tr>";
    });

    htmlTable += "</tbody></table>";
    return htmlTable;
  }
}
