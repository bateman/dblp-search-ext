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
        var table = '<table id="results-table" class="table table-striped table-hover">';
        table += '<thead><tr><th scope="col" colspan="2">Title</th><th scope="col">Authors</th><th scope="col">Year</th><th scope="col">Venue</th><th scope="col">DOI</th><th scope="col">Access</th><th scope="col">BibTeX</th></tr></thead>';
        table += '<tbody>';
        publications.forEach((result) => {
            table += '<tr>';
            table += '<td><img class="' + result.type + '" title="' + result.type + '" src="../images/pub-type.png"></td>';
            table += '<td><a href="' + result.permaLink + '" target="_blank" title="' + result.permalink + '">' + result.title + '</a></td>';
            table += '<td>' + result.authors.join(', ') + '</td>';
            table += '<td>' + result.year + '</td>';
            table += '<td>' + result.venue + '</td>';
            table += '<td><a href="' + result.doiURL + '" target="_blank">' + result.doi + '</a></td>';
            table += '<td class="center"><img class="access" src="../images/' + result.access + '-access.png" title="This publication is ' + result.access + ' access"></td>';
            table += '<td class="center"><button class="copyBibtexButton" title="Copy BibTex" data-url="' + result.bibtexLink + '"><img src="../images/copy.png"></button></td>';
            table += '</tr>';
        });
        table += '</tbody>';
        table += '</table>';

        return table;
    }
}