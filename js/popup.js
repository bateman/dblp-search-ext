var browser = window.msBrowser || window.browser || window.chrome;
console.log('popup.js loaded');

// ------------------------------------- Listeners -------------------------------------

document.addEventListener('DOMContentLoaded', function () {
    // if the content of the popup was saved in the local storage, then restore it
    browser.storage.local.get({
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

    // Get the highlighted text from the current tab
    // Query the active tab
    browser.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        var tab = tabs[0]; // Now 'tab' is defined
        if (tab.url.startsWith('http://') || tab.url.startsWith('https://')) {
            browser.scripting.executeScript({
                target: { tabId: tab.id }, func: function () {
                    return window.getSelection().toString();
                }
            }).then(function (result) {
                if (result && result.length > 0) {
                    const highlightedText = result[0].result.trim();
                    if (highlightedText) {
                        paperTitleInput.value = highlightedText;
                    }
                }
            }).catch(function (error) {
                console.error('Error executing script:', error);
            });
        }
    });

    // Search DBLP when the search button is clicked
    document.getElementById('searchButton').addEventListener('click', function () {
        // Update status to let user know search has started.
        updateStatus('Searching.', 1000);
        searchDblp();
    });

    // Open the popup.html in a new tab when the openInTab button is clicked
    document.getElementById('openInTab').addEventListener('click', function () {
        browser.tabs.create({ url: browser.runtime.getURL("popup.html") });
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
        browser.storage.local.set({
            paperTitle: '',
            status: '',
            results: []
        });
        clearResults();
    });

    // ------------------------------------- Functions -------------------------------------

    function addCopyBibtexButtonEventListener() {
        // Add the event listener for the copyBibtexButton class
        document.querySelectorAll('.copyBibtexButton').forEach(button => {
            button.addEventListener('click', function () {
                const url = this.getAttribute('data-url');
                copyBibtexToClipboard(url);
            });
        });
    }

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
                browser.storage.local.set({
                    paperTitle: paperTitle,
                    status: resCount,
                    results: results
                });
            });
        }
    }

    // Send the request to the CORS proxy
    function doCORSRequest(options, printResult) {
        browser.storage.local.get({
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
            // extract the venue
            // conference/workshops: <span itemprop="isPartOf" itemscope itemtype = "http://schema.org/BookSeries" >
            // journals: <span itemprop="isPartOf" itemscope itemtype="http://schema.org/Periodical">
            // books: <span itemprop="isPartOf" itemscope itemtype="http://schema.org/BookSeries">
            // book chapters: <span itemprop="isPartOf" itemscope itemtype="http://schema.org/BookSeries">
            // editorials: there is no <span itemprop="isPartOf" itemscope itemtype="...">
            var venue = '';
            var pubType = '';
            // extract the venue as a conference/workshop, book or book chapter publication
            var bookSeriesElement = citeElement.querySelector('span[itemprop="isPartOf"][itemtype="http://schema.org/BookSeries"]');
            if (bookSeriesElement) {
                pubType = 'incollection';
                venue = bookSeriesElement.textContent;
                venue = venue + ' ' + year;
            } else if (citeElement.querySelector('span[itemprop="isPartOf"][itemtype="http://schema.org/Periodical"]')) {
                // extract the venue as a journal publication
                pubType = 'article';
                // extract the venue
                venue = citeElement.querySelector('span[itemprop="isPartOf"][itemtype="http://schema.org/Periodical"]').textContent;
                // extract the volume
                var volume = citeElement.querySelector('span[itemprop="volumeNumber"]').textContent;
                // extract the issue
                var issueElement = citeElement.querySelector('span[itemprop="issueNumber"]');
                var issue = issueElement ? issueElement.textContent : '';
                // if issue exists, add it to the venue string
                venue = issue ? venue + ' ' + volume + '(' + issue + ')' : venue + ' ' + volume;
            } else if (!citeElement.querySelector('span[itemprop="isPartOf"]')) {
                // if there is no <span itemprop="isPartOf" ...>
                // extract the venue as editorial
                pubType = 'editor';
                var title = citeElement.querySelector('span[class="title"][itemprop="name"]').textContent;
                var publisher = citeElement.querySelector('span[itemprop="publisher"]');
                // if publisher exists, add its textContent to the venue string
                venue = publisher ? title + ', ' + publisher.textContent : title;
                var ISBN = citeElement.querySelector('span[itemprop="isbn"]');
                // if ISBN exists, add it to the venue string
                venue = ISBN ? venue + ', ISBN:' + ISBN.textContent : venue;
            }
            // extract the bibtexLink
            // 1. find a with href such as "https://dblp.org/db/conf/icsqp/icsqp1994.html#LaiY94a" or "https://dblp.org/db/journals/infsof/infsof34.html#DaleZ92"
            // 2. split at # and take both parts
            // 3. use the second part "LaiY94a" to replace "icsqp1994", between last "/" and ".html"
            // 4. append ?view=bibtex at the end
            var dblpLink = citeElement.querySelector('a[href^="https://dblp.org/db/conf/"], a[href^="https://dblp.org/db/journals/"], a[href^="https://dblp.org/db/books/"]');
            var permaLink = '';
            var bibtexLink = '';
            var dblpID = '';
            if (dblpLink) {
                if (pubType === 'editor') {
                    var dblpLinkParts = dblpLink.href.split('db/');
                    var baseURL = dblpLinkParts[0] + 'rec/conf/';
                    var confPart = dblpLinkParts[1];
                    dblpID = confPart.replace('.html', '');
                    // confPart looks like "conf/cibse/cibse2023.html"
                    // use regular expression to match "cibse"
                    // then remove "cibse" from "cibse2023.html"
                    // at the end, confPart must be "conf/cibse/2023.html"
                    var conf = confPart.match(/conf\/([^\/]*)\//)[1] + '/';
                    var confYear = confPart.replace(conf, '').match(/\d+/)[0];
                    var link = baseURL + conf + confYear;
                    permaLink = link + '.html';
                    bibtexLink = link + '.bib?param=1';
                } else { // article or incollection
                    var dblpLinkParts = dblpLink.href.split('#');
                    var baseURL = dblpLinkParts[0];
                    var citationKey = dblpLinkParts[1];
                    // use regular expression to replace the venue part at the end of the URL (e.g., .../icsqp1994) with the citation key
                    // the baseURL starts always with https://dblp.org/db/
                    // the regular expression matches the last "/" and everything including ".html"
                    var link = baseURL.replace(/\/[^\/]*\.html$/, '/' + citationKey)
                    // replace 'db' with 'rec' in the bibtexLink
                    link = link.replace('db/', 'rec/');
                    permaLink = link + '.html';
                    bibtexLink = link + '.bib?param=1';
                    dblpID = link.replace('https://dblp.org/rec/', '');
                    if (pubType === 'incollection') {
                        // it's not a jouranl article so we need to
                        // distinguish between book / book chapter and conference / workshop
                        // <li class="entry inproceedings toc" id=
                        var type = doc.querySelector('li[class="entry inproceedings toc"][id="' + dblpID + '"]');
                        if (type) {
                            pubType = 'inproceedings';
                        } else {  // its a book or book chapter (incollection)
                            var baseURL = 'https://dblp.org/rec/';
                            dblpID = 'books/sp/' + year.substring(2) + '/' + dblpID.split('/')[2];
                            link = baseURL + dblpID;
                            permaLink = link + '.html';
                            bibtexLink = link + '.bib?param=1';
                        }
                    }
                }
            }
            // extract the doi
            var result = retrieveDOI(dblpID, doc);
            var doi = result.doi;
            var doiURL = result.doiURL;

            // create the publication object
            var publication = {
                type: pubType,
                title: title,
                permalink: permaLink,
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

    function retrieveDOI(dblpID, doc) {
        var doi = '';
        var doiURL = '';
        if (dblpID && doc) {
            var doiElement = doc.querySelector('li[id="' + dblpID + '"] nav[class="publ"] ul li[class="drop-down"] div[class="head"] a[href^="https://doi.org/"]');
            if (doiElement) {
                doiURL = doiElement.href;
                doi = doiElement.href.replace('https://doi.org/', '');
            }
        }
        return { doi: doi, doiURL: doiURL };
    }

    function createResultsTable(results) {
        var table = '<table class="table table-striped table-hover">';
        table += '<thead><tr><th scope="col" colspan="2">Title</th><th scope="col">Authors</th><th scope="col">Year</th><th scope="col">Venue</th><th scope="col">DOI</th><th scope="col">BibTeX</th></tr></thead>';
        table += '<tbody>';
        results.forEach((result) => {
            table += '<tr>';
            table += '<td><img class="' + result.type + '" title="' + result.type + '" src="../images/pub-type.png"></td>';
            table += '<td><a href="' + result.permalink + '" target="_blank">' + result.title + '</a></td>';
            table += '<td>' + result.authors.join(', ') + '</td>';
            table += '<td>' + result.year + '</td>';
            table += '<td>' + result.venue + '</td>';
            table += '<td><a href="' + result.doiURL + '" target="_blank">' + result.doi + '</a></td>';
            table += '<td><button class="copyBibtexButton" title="Copy BibTex" data-url="' + result.bibtexLink + '"><img src="../images/copy.png"></button></td>';
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

    // copy the BibTeX to the clipboard
    window.copyBibtexToClipboard = function (url) {
        fetch(url)
            .then(response => response.text())
            .then(data => {
                // if the keyRenaming option is enabled, then rename the citation key
                // before copying the BibTeX to the clipboard      
                // get the keyRenaming option
                var gettingItem = browser.storage.local.get('keyRenaming');
                gettingItem.then((res) => {
                    var keyRenaming = res.keyRenaming || false;
                    if (keyRenaming) {
                        // rename the citation key
                        // ^@\S+\{(DBLP:\S+\/\S+\/\S+),$
                        var key = data.match(/^@\S+\{(DBLP:\S+\/\S+\/\S+),/)[0];
                        if (!key) {
                            console.error('Could not find the citation key in the BibTeX');
                            return;
                        }
                        var venue = key.split('/')[1];
                        var name = key.split('/')[2].replace(',', '');
                        // remove all digits from name
                        name = name.replace(/\d+/g, '');
                        // starting from the end, remove all Capital letters from name
                        // stop at the first non-capital letter
                        name = name.replace(/[A-Z]+$/, '');
                        // extract the year from a string like this: "year = {2020},"
                        var year = data.match(/year\s*=\s*\{(\d+)\},/)[1];
                        var newCitationKey = name.toLowerCase() + year + venue;
                        // replace the old citation key with the new one
                        // specifically, replace all the text from DBLP until the first comma (excluded)
                        // for example, "@inproceedings{DBLP:conf/esem/CalefatoQLK23,""
                        // becomes "@inproceedings{calefato2023esem,"
                        data = data.replace(/DBLP:\S+\/\S+\/\S+/, newCitationKey + ',');
                    }
                    navigator.clipboard.writeText(data)
                        .catch(err => {
                            console.error('Could not copy BibTeX to clipboard: ', err);
                        });
                });
            })
            .catch(err => {
                console.error('Could not fetch BibTeX: ', err);
            });
    }
});
