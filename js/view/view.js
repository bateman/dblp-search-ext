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

  // Build the table with the new data using DOM manipulation to prevent XSS
  buildTable(publications) {
    const table = document.createElement("table");
    table.id = "results-table";
    table.className = "table table-striped table-hover";

    // Create header with colspan=2 for Title to match original structure
    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");

    const thTitle = document.createElement("th");
    thTitle.scope = "col";
    thTitle.colSpan = 2;
    thTitle.textContent = "Title";
    headerRow.appendChild(thTitle);

    const otherHeaders = ["Authors", "Year", "Venue", "DOI", "Access", "BibTeX"];
    otherHeaders.forEach((headerText) => {
      const th = document.createElement("th");
      th.scope = "col";
      th.textContent = headerText;
      headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    publications.forEach((result) => {
      const row = document.createElement("tr");

      // Type icon cell
      const typeCell = document.createElement("td");
      const typeImg = document.createElement("img");
      // Type comes from transformType() which returns safe hardcoded values
      typeImg.className = result.type || "";
      typeImg.title = result.type || "";
      typeImg.src = "../images/pub-type.png";
      typeCell.appendChild(typeImg);
      row.appendChild(typeCell);

      // Title cell with validated URL
      const titleCell = document.createElement("td");
      const titleLink = document.createElement("a");
      if (this.isValidURL(result.permaLink)) {
        titleLink.href = result.permaLink;
      } else {
        titleLink.href = "#";
      }
      titleLink.target = "_blank";
      titleLink.title = result.permaLink || "";
      titleLink.textContent = result.title;
      titleCell.appendChild(titleLink);
      row.appendChild(titleCell);

      // Authors cell with defensive array check
      const authorsCell = document.createElement("td");
      const authors = Array.isArray(result.authors) ? result.authors : [];
      authorsCell.textContent = authors.join(", ");
      row.appendChild(authorsCell);

      // Year cell
      const yearCell = document.createElement("td");
      yearCell.textContent = result.year;
      row.appendChild(yearCell);

      // Venue cell
      const venueCell = document.createElement("td");
      venueCell.textContent = result.venue;
      row.appendChild(venueCell);

      // DOI cell with validated URL
      const doiCell = document.createElement("td");
      const doiLink = document.createElement("a");
      if (this.isValidURL(result.doiURL)) {
        doiLink.href = result.doiURL;
      } else {
        doiLink.href = "#";
      }
      doiLink.target = "_blank";
      doiLink.textContent = result.doi;
      doiCell.appendChild(doiLink);
      row.appendChild(doiCell);

      // Access cell
      const accessCell = document.createElement("td");
      accessCell.className = "center";
      const accessImg = document.createElement("img");
      accessImg.className = "access";
      // Validate access value against whitelist to prevent path traversal
      const validAccess = ["open", "closed"].includes(result.access)
        ? result.access
        : "closed";
      accessImg.src = `../images/${validAccess}-access.png`;
      accessImg.title = `This publication is ${validAccess} access`;
      accessCell.appendChild(accessImg);
      row.appendChild(accessCell);

      // BibTeX cell
      const bibtexCell = document.createElement("td");
      bibtexCell.className = "center";
      const bibtexButton = document.createElement("button");
      bibtexButton.className = "copyBibtexButton";
      bibtexButton.title = "Copy BibTex";
      // Validate bibtexLink URL before setting data attribute
      if (this.isValidURL(result.bibtexLink)) {
        bibtexButton.dataset.url = result.bibtexLink;
      }
      const bibtexImg = document.createElement("img");
      bibtexImg.src = "../images/copy.png";
      bibtexButton.appendChild(bibtexImg);
      bibtexCell.appendChild(bibtexButton);
      row.appendChild(bibtexCell);

      tbody.appendChild(row);
    });
    table.appendChild(tbody);

    return table.outerHTML;
  }
}
