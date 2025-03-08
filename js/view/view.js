/*global chrome*/

// view.js
console.log("view.js loaded");
var browser = browser || chrome;

export class PublicationView {
    constructor() {
        this.table = '';
    }

    // Callback function for controller to notify to update the view
    update(responseStatus, publications, totalHits, sentHits, excludedCount) {
        if(totalHits > 0) {
            console.log(`Building table with ${sentHits} publications.`);
            this.table = this.buildTable(publications);
        } else {
            console.log('Warning: No publications found. Clearing the table.');
            this.table = '';
        }
        console.log(`Sending reponse to popup.js to display results : ${responseStatus}, ${totalHits}, ${sentHits}, ${excludedCount}`);
        browser.runtime.sendMessage({
            script: 'view.js',
            type: 'RESPONSE_SEARCH_PUBLICATIONS',
            responseStatus: responseStatus,
            totalHits: totalHits,
            sentHits: sentHits,
            excludedCount: excludedCount,
            resultsTable: this.table
        });
    }

     // Helper method to escape HTML special characters
    escapeHTML(str) {
        if (!str) 
            return '';
        else return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    // Build the table with the new data
    buildTable(publications) {
        var htmlTable = '<table id="results-table" class="table table-striped table-hover">';
        htmlTable += '<thead><tr><th scope="col" colspan="2">Title</th><th scope="col">Authors</th><th scope="col">Year</th><th scope="col">Venue</th><th scope="col">DOI</th><th scope="col">Access</th><th scope="col">BibTeX</th></tr></thead>';
        htmlTable += '<tbody>';
        publications.forEach((result) => {
            htmlTable += '<tr>';
            htmlTable += '<td><img class="' + this.escapeHTML(result.type) + '" title="' + this.escapeHTML(result.type) + '" src="../images/pub-type.png"></td>';
            htmlTable += '<td><a href="' + this.escapeHTML(result.permaLink) + '" target="_blank" title="' + this.escapeHTML(result.permalink) + '">' + this.escapeHTML(result.title) + '</a></td>';
            htmlTable += '<td>' + this.escapeHTML(result.authors.join(', ')) + '</td>';
            htmlTable += '<td>' + this.escapeHTML(result.year) + '</td>';
            htmlTable += '<td>' + this.escapeHTML(result.venue) + '</td>';
            htmlTable += '<td><a href="' + this.escapeHTML(result.doiURL) + '" target="_blank">' + this.escapeHTML(result.doi) + '</a></td>';
            htmlTable += '<td class="center"><img class="access" src="../images/' + this.escapeHTML(result.access) + '-access.png" title="This publication is ' + this.escapeHTML(result.access) + ' access"></td>';
            htmlTable += '<td class="center"><button class="copyBibtexButton" title="Copy BibTex" data-url="' + this.escapeHTML(result.bibtexLink) + '"><img src="../images/copy.png"></button></td>';
            htmlTable += '</tr>';
        });
        htmlTable += '</tbody>';
        htmlTable += '</table>';

        return htmlTable;
    }
}