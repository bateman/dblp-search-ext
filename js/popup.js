document.addEventListener('DOMContentLoaded', function () {
    // if the content of the popup was saved in the local storage, then restore it
    chrome.storage.local.get({
        paperTitle: '',
        status: '',
        results: []
    }, function (items) {
        var paperTitle = items.paperTitle;
        var resCount = items.status;
        var results = items.results;
        if (paperTitle) {
            document.getElementById('paperTitle').value = paperTitle;
        }
        if (results.length > 0) {
            // show results count
            updateResultsCount(resCount);
            // create a table with the results
            var table = createResultsTable(results);
            // show the results into the document results div
            document.getElementById('results').innerHTML = table;
            // add copyBibtexButton event listener
            addCopyBibtexButtonEventListener();
        }
    });

    var paperTitleInput = document.getElementById('paperTitle');
    if (paperTitleInput) {
        paperTitleInput.focus();
    }

    function createResultsTable(results) {
        var table = '<table class="table table-striped table-hover">';
        // <th scope="col">DOI</th>
        table += '<thead><tr><th scope="col">Title</th><th scope="col">Authors</th><th scope="col">Year</th><th scope="col">Venue</th><th scope="col">BibTeX</th></tr></thead>';
        table += '<tbody>';
        results.forEach((result) => {
            table += '<tr>';
            table += '<td>' + result.title + '</td>';
            table += '<td>' + result.authors.join(', ') + '</td>';
            table += '<td>' + result.year + '</td>';
            table += '<td>' + result.venue + '</td>';
            // table += '<td><a href="' + result.doiURL + '" target="_blank">' + result.doi + '</a></td>';
            table += '<td><button class="copyBibtexButton" title="Copy BibTex" data-url="' + result.bibtexLink + '"><img src="images/copy.png"></button></td>';
            table += '</tr>';
        });
        table += '</tbody>';
        table += '</table>';
        return table;
    }

    function clearResults() {
        document.getElementById('paperTitle').value = '';
        document.getElementById('results').innerHTML = '';
        updateResultsCount('');
    }

    function addCopyBibtexButtonEventListener() {
        // Add the event listener for the copyBibtexButton class
        document.querySelectorAll('.copyBibtexButton').forEach(button => {
            button.addEventListener('click', function () {
                const url = this.getAttribute('data-url');
                window.copyBibtexToClipboard(url);
            });
        });
    }

    // Get the highlighted text from the current tab
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        var tab = tabs[0];
        chrome.scripting.executeScript({
            target: { tabId: tab.id },
            function: function () {
                return window.getSelection().toString();
            }
        }).then(function (result) {
            if (result && result.length > 0 && result[0].result) {
                paperTitleInput.value = result[0].result;
            }
        }).catch(function (error) {
            if (!error.message.includes('Cannot access chrome:// and edge:// URLs')) {
                console.error('Error executing script:', error);
            }
        });
    });

    // Search DBLP when the search button is clicked
    document.getElementById('searchButton').addEventListener('click', function () {
        // Update status to let user know search has started.
        updateStatus('Searching.', 1000);
        searchDblp();
    });

    // Open the popup.html in a new tab when the openInTab button is clicked
    document.getElementById('openInTab').addEventListener('click', function () {
        chrome.tabs.create({ url: chrome.runtime.getURL("popup.html") });
    });

    // Search DBLP when the user presses the Enter key
    paperTitleInput.addEventListener('keydown', function (event) {
        if (event.key === 'Enter') {
            // Update status to let user know search has started.
            updateStatus('Searching.', 1000);
            searchDblp();
        }
    });

    // Clear the results when the clear button is clicked
    document.getElementById('clearButton').addEventListener('click', function () {
        chrome.storage.local.set({
            paperTitle: '',
            status: '',
            results: []
        });
        clearResults();
    });

    // Search paperTitle on DBLP 
    function searchDblp() {
        var paperTitle = paperTitleInput.value.trim();
        if (paperTitle) {
            var url = 'https://dblp.org/search?q=' + encodeURIComponent(paperTitle);
            doCORSRequest({
                method: 'GET',
                url: url
            }, function printResult(result) {
                var parser = new DOMParser();
                var doc = parser.parseFromString(result, 'text/html');

                // extract all publication elements from the results page
                var results = extractPublicationInfo(doc)
                
                // show results count
                var resCount = 'Found ' + results.length + ' results.';
                updateResultsCount(resCount);
                // create a table with the results
                var table = createResultsTable(results);
                // show the results into the document results div
                document.getElementById('results').innerHTML = table;
                // add copyBibtexButton event listener
                addCopyBibtexButtonEventListener();

                // save the state of paperTitleInput, status, and results in the local storage
                chrome.storage.local.set({
                    paperTitle: paperTitle,
                    status: resCount,
                    results: results
                });
            });
        }
    }

    // Send the request to the CORS proxy
    function doCORSRequest(options, printResult) {
        chrome.storage.sync.get({
            corsApiUrl: 'https://corsproxy.io/?'
        }, function (items) {
            var cors_api_url = items.corsApiUrl;
            var x = new XMLHttpRequest();
            x.open(options.method, cors_api_url + options.url);
            x.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
            x.onload = x.onerror = function () {
                printResult(x.responseText || '');
            };
            x.send(options.data);
        });
    }

    /*
    <cite class="data tts-content" itemprop="headline">
        <span itemprop="author" itemscope itemtype="http://schema.org/Person">
            <a href="https://dblp.org/pid/171/7011.html" itemprop="url">
                <span itemprop="name" title="C. J. Dale">C. J. Dale</span>
            </a>
        </span>, 
        <span itemprop="author" itemscope itemtype="http://schema.org/Person">
            <a href="https://dblp.org/pid/171/6993.html" itemprop="url">
                <span itemprop="name" title="H. van der Zee">H. van der Zee</span>
            </a>
        </span>:
        <br> 
        <span class="title" itemprop="name">Software productivity metrics: who needs them?</span> 
        <a href="https://dblp.org/db/journals/infsof/infsof34.html#DaleZ92">
            <span itemprop="isPartOf" itemscope itemtype="http://schema.org/Periodical">
                <span itemprop="name">Inf. Softw. Technol.</span>
            </span> 
            <span itemprop="isPartOf" itemscope itemtype="http://schema.org/PublicationVolume">
                <span itemprop="volumeNumber">34</span>
            </span>
            (<span itemprop="isPartOf" itemscope itemtype="http://schema.org/PublicationIssue">
                <span itemprop="issueNumber">11</span>
            </span>)
        </a>: 
        ...
    </cite>
    */
    // extract all publication elements from the results page
    function extractPublicationInfo(doc) {
        var results = [];
        // find all the <cite> elements
        var citeElements = doc.querySelectorAll('cite[class="data tts-content"][itemprop="headline"]');

        // iterate over all the <cite> elements
        citeElements.forEach((citeElement) => {
            //if its a CorrAbs publication, then skip it
            // check for the presence of any anchor like this  <a href = "https://dblp.org/db/journals/corr/..." >
            if (citeElement.querySelector('a[href^="https://dblp.org/db/journals/corr/"]')) {
                return;
            }

            // extract the title
            var title = citeElement.querySelector('span[class="title"][itemprop="name"]').textContent;
            // extract the authors
            var authors = [];
            var authorElements = citeElement.querySelectorAll('span[itemprop="author"]');
            authorElements.forEach((authorElement) => {
                var authorName = authorElement.querySelector('span[itemprop="name"]').textContent;
                authors.push(authorName);
            });
            // extract the year
            var year = citeElement.querySelector('span[itemprop="datePublished"]').textContent;
            // try to extract the venue as a conference publication
            // if error, then extract the venue as a journal publication
            // conference: <span itemprop="isPartOf" itemscope itemtype = "http://schema.org/BookSeries" >
            // journals: <span itemprop="isPartOf" itemscope itemtype="http://schema.org/Periodical">
            var venue = ''
            try {
                venue = citeElement.querySelector('span[itemprop="isPartOf"][itemtype="http://schema.org/BookSeries"]').textContent;
                venue = venue + ' ' + year;
            } catch (error) {
                // extract the venue as a journal publication
                var volume = '';
                var issue = '';
                if (citeElement.querySelector('span[itemprop="isPartOf"][itemtype="http://schema.org/Periodical"]')) {
                    // extract the venue
                    venue = citeElement.querySelector('span[itemprop="isPartOf"][itemtype="http://schema.org/Periodical"]').textContent;
                    // extract the volume
                    volume = citeElement.querySelector('span[itemprop="volumeNumber"]').textContent;
                    // extract the issue
                    var issueElement = citeElement.querySelector('span[itemprop="issueNumber"]');
                    var issue = issueElement ? issueElement.textContent : '';
                    // if issue exists, add it to the venue string
                    venue = issue ? venue + ' ' + volume + '(' + issue + ')' : venue + ' ' + volume;
                }
            }
            // extract the bibtexLink
            // 1. find a with href such as "https://dblp.org/db/conf/icsqp/icsqp1994.html#LaiY94a" or "https://dblp.org/db/journals/infsof/infsof34.html#DaleZ92"
            // 2. split at # and take both parts
            // 3. use the second part "LaiY94a" to replace "icsqp1994", between last "/" and ".html"
            // 4. append ?view=bibtex at the end
            var dblpLink = citeElement.querySelector('a[href^="https://dblp.org/db/conf/"], a[href^="https://dblp.org/db/journals/"]')
            var bibtexLink = '';
            if (dblpLink) {
                var dblpLinkParts = dblpLink.href.split('#');
                var baseURL = dblpLinkParts[0];
                var citationKey = dblpLinkParts[1];
                // use regular expression to replace the venue part at the end of the URL (e.g., .../icsqp1994) with the citation key
                // the baseURL starts always with https://dblp.org/db/
                // the regular expression matches the last "/" and everything including ".html"
                bibtexLink = baseURL.replace(/\/[^\/]*\.html$/, '/' + citationKey + '.bib?param=1');
                // replace 'db' with 'rec' in the bibtexLink
                bibtexLink = bibtexLink.replace('db/', 'rec/');
            }
            // extract the doi
            var doi = '';
            var doiURL = '';
            retrieveDOI(bibtexLink).then(result => {
                doi = result.doi;
                doiURL = result.doiURL;
            });
            // FIXME result.doi and result.doiURL hold values but then doi and doiURL are empty 
            // after the assignment 

            // create the publication object
            var publication = {
                title: title,
                authors: authors,
                year: year,
                venue: venue,
                doi: doi,
                doiURL: doiURL,
                bibtexLink: bibtexLink
            };
            // add the publication object to the results array
            results.push(publication);
        });
        return results;
    }

    // retrieve the DOI from the BibTeX link
    async function retrieveDOI(bibtexLink) {
        var doi = '';
        var doiURL = '';
        if (bibtexLink) {
            try {
                const response = await fetch(bibtexLink);
                const data = await response.text();
                var doiRegex = /doi\s*=\s*\{(.*)\}/;
                var doiMatch = data.match(doiRegex);
                if (doiMatch && doiMatch.length > 1) {
                    doi = doiMatch[1];
                    doiURL = 'https://doi.org/' + doi;
                }
            } catch (err) {
                console.error('Could not fetch BibTeX: ', err);
            }
        }
        return { doi: doi, doiURL: doiURL };
    }

    // copy the BibTeX to the clipboard
    window.copyBibtexToClipboard = function (url) {
        fetch(url)
            .then(response => response.text())
            .then(data => {
                navigator.clipboard.writeText(data)
                    .catch(err => {
                        console.error('Could not copy BibTeX to clipboard: ', err);
                    });
            })
            .catch(err => {
                console.error('Could not fetch BibTeX: ', err);
            });
    }
});