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

    // Build the table with the new data
    buildTable(publications) {
        var htmlTable = '<table id="results-table" class="table table-striped table-hover">';
        htmlTable += '<thead><tr><th scope="col" colspan="2">Title</th><th scope="col">Authors</th><th scope="col">Year</th><th scope="col">Venue</th><th scope="col">DOI</th><th scope="col">Access</th><th scope="col">BibTeX</th></tr></thead>';
        htmlTable += '<tbody>';
        publications.forEach((result) => {
            htmlTable += '<tr>';
            htmlTable += '<td><img class="' + result.type + '" title="' + result.type + '" src="../images/pub-type.png"></td>';
            htmlTable += '<td><a href="' + result.permaLink + '" target="_blank" title="' + result.permalink + '">' + result.title + '</a></td>';
            htmlTable += '<td>' + result.authors.join(', ') + '</td>';
            htmlTable += '<td>' + result.year + '</td>';
            htmlTable += '<td>' + result.venue + '</td>';
            htmlTable += '<td><a href="' + result.doiURL + '" target="_blank">' + result.doi + '</a></td>';
            htmlTable += '<td class="center"><img class="access" src="../images/' + result.access + '-access.png" title="This publication is ' + result.access + ' access"></td>';
            htmlTable += '<td class="center"><button class="copyBibtexButton" title="Copy BibTex" data-url="' + result.bibtexLink + '"><img src="../images/copy.png"></button></td>';
            htmlTable += '</tr>';
        });
        htmlTable += '</tbody>';
        htmlTable += '</table>';

        return htmlTable;
    }
}