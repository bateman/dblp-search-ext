// view.js
console.log("view.js loaded");
var browser = window.msBrowser || window.browser || window.chrome;

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
        const table = document.createElement('table');
        table.id = 'results-table';
        table.className = 'table table-striped table-hover';

        const thead = document.createElement('thead');
        const headerRow = document.createElement('tr');
        const headers = ['Title', 'Authors', 'Year', 'Venue', 'DOI', 'Access', 'BibTeX'];
        headers.forEach(headerText => {
            const th = document.createElement('th');
            th.scope = 'col';
            th.textContent = headerText;
            headerRow.appendChild(th);
        });
        thead.appendChild(headerRow);
        table.appendChild(thead);

        const tbody = document.createElement('tbody');
        publications.forEach(result => {
            const row = document.createElement('tr');

            const typeCell = document.createElement('td');
            const typeImg = document.createElement('img');
            typeImg.className = result.type;
            typeImg.title = result.type;
            typeImg.src = '../images/pub-type.png';
            typeCell.appendChild(typeImg);
            row.appendChild(typeCell);

            const titleCell = document.createElement('td');
            const titleLink = document.createElement('a');
            titleLink.href = result.permaLink;
            titleLink.target = '_blank';
            titleLink.title = result.permaLink;
            titleLink.textContent = result.title;
            titleCell.appendChild(titleLink);
            row.appendChild(titleCell);

            const authorsCell = document.createElement('td');
            authorsCell.textContent = result.authors.join(', ');
            row.appendChild(authorsCell);

            const yearCell = document.createElement('td');
            yearCell.textContent = result.year;
            row.appendChild(yearCell);

            const venueCell = document.createElement('td');
            venueCell.textContent = result.venue;
            row.appendChild(venueCell);

            const doiCell = document.createElement('td');
            const doiLink = document.createElement('a');
            doiLink.href = result.doiURL;
            doiLink.target = '_blank';
            doiLink.textContent = result.doi;
            doiCell.appendChild(doiLink);
            row.appendChild(doiCell);

            const accessCell = document.createElement('td');
            accessCell.className = 'center';
            const accessImg = document.createElement('img');
            accessImg.className = 'access';
            accessImg.src = `../images/${result.access}-access.png`;
            accessImg.title = `This publication is ${result.access} access`;
            accessCell.appendChild(accessImg);
            row.appendChild(accessCell);

            const bibtexCell = document.createElement('td');
            bibtexCell.className = 'center';
            const bibtexButton = document.createElement('button');
            bibtexButton.className = 'copyBibtexButton';
            bibtexButton.title = 'Copy BibTex';
            bibtexButton.dataset.url = result.bibtexLink;
            const bibtexImg = document.createElement('img');
            bibtexImg.src = '../images/copy.png';
            bibtexButton.appendChild(bibtexImg);
            bibtexCell.appendChild(bibtexButton);
            row.appendChild(bibtexCell);

            tbody.appendChild(row);
        });
        table.appendChild(tbody);

        return table.outerHTML;
    }
}
