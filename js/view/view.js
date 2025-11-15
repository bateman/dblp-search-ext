/*global chrome*/

// view.js
console.log("view.js loaded");
var browser = browser || chrome;

export class PublicationView {
  constructor() {
    this.table = "";
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
      `Sending reponse to popup.js to display results : ${responseStatus}, ${totalHits}, ${sentHits}, ${excludedCount}`
    );
    browser.runtime.sendMessage({
      script: "view.js",
      type: "RESPONSE_SEARCH_PUBLICATIONS",
      responseStatus: responseStatus,
      totalHits: totalHits,
      sentHits: sentHits,
      excludedCount: excludedCount,
      resultsTable: this.table,
    });
  }

  // Build the table with the new data
  buildTable(publications) {
    // Create table element
    const table = document.createElement("table");
    table.id = "results-table";
    table.className = "table table-striped table-hover";

    // Create thead
    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");
    const headers = [
      { text: "Title", colspan: 2 },
      { text: "Authors" },
      { text: "Year" },
      { text: "Venue" },
      { text: "DOI" },
      { text: "Access" },
      { text: "BibTeX" },
    ];

    headers.forEach((header) => {
      const th = document.createElement("th");
      th.scope = "col";
      if (header.colspan) {
        th.colSpan = header.colspan;
      }
      th.textContent = header.text;
      headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    // Create tbody
    const tbody = document.createElement("tbody");
    publications.forEach((result) => {
      const row = document.createElement("tr");

      // Type icon cell
      const typeCell = document.createElement("td");
      const typeImg = document.createElement("img");
      typeImg.className = this.escapeHtml(result.type);
      typeImg.title = this.escapeHtml(result.type);
      typeImg.src = "../images/pub-type.png";
      typeImg.alt = this.escapeHtml(result.type);
      typeCell.appendChild(typeImg);
      row.appendChild(typeCell);

      // Title cell
      const titleCell = document.createElement("td");
      const titleLink = document.createElement("a");
      titleLink.href = this.sanitizeUrl(result.permaLink);
      titleLink.target = "_blank";
      titleLink.rel = "noopener noreferrer";
      titleLink.title = this.escapeHtml(result.title);
      titleLink.textContent = result.title;
      titleCell.appendChild(titleLink);
      row.appendChild(titleCell);

      // Authors cell
      const authorsCell = document.createElement("td");
      authorsCell.textContent = result.authors.join(", ");
      row.appendChild(authorsCell);

      // Year cell
      const yearCell = document.createElement("td");
      yearCell.textContent = result.year;
      row.appendChild(yearCell);

      // Venue cell
      const venueCell = document.createElement("td");
      venueCell.textContent = result.venue;
      row.appendChild(venueCell);

      // DOI cell
      const doiCell = document.createElement("td");
      const doiLink = document.createElement("a");
      doiLink.href = this.sanitizeUrl(result.doiURL);
      doiLink.target = "_blank";
      doiLink.rel = "noopener noreferrer";
      doiLink.textContent = result.doi;
      doiCell.appendChild(doiLink);
      row.appendChild(doiCell);

      // Access cell
      const accessCell = document.createElement("td");
      accessCell.className = "center";
      const accessImg = document.createElement("img");
      accessImg.className = "access";
      accessImg.src = `../images/${this.escapeHtml(result.access)}-access.png`;
      accessImg.title = `This publication is ${this.escapeHtml(
        result.access
      )} access`;
      accessImg.alt = `${this.escapeHtml(result.access)} access`;
      accessCell.appendChild(accessImg);
      row.appendChild(accessCell);

      // BibTeX cell
      const bibtexCell = document.createElement("td");
      bibtexCell.className = "center";
      const bibtexButton = document.createElement("button");
      bibtexButton.className = "copyBibtexButton";
      bibtexButton.title = "Copy BibTeX";
      bibtexButton.setAttribute("data-url", this.sanitizeUrl(result.bibtexLink));
      const bibtexImg = document.createElement("img");
      bibtexImg.src = "../images/copy.png";
      bibtexImg.alt = "Copy";
      bibtexButton.appendChild(bibtexImg);
      bibtexCell.appendChild(bibtexButton);
      row.appendChild(bibtexCell);

      tbody.appendChild(row);
    });
    table.appendChild(tbody);

    // Return the outer HTML
    return table.outerHTML;
  }

  // Sanitize HTML to prevent XSS
  escapeHtml(text) {
    if (text === undefined || text === null) {
      return "";
    }
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  // Sanitize URLs to prevent javascript: protocol injection
  sanitizeUrl(url) {
    if (!url) {
      return "#";
    }
    const urlStr = String(url);
    // Only allow http:, https:, and relative URLs
    if (
      urlStr.startsWith("http://") ||
      urlStr.startsWith("https://") ||
      urlStr.startsWith("/") ||
      urlStr.startsWith("../")
    ) {
      return urlStr;
    }
    // If it doesn't match safe patterns, return a safe default
    return "#";
  }
}
