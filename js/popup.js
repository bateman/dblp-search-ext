var browser = window.msBrowser || window.browser || window.chrome;
console.log('popup.js loaded');

// ------------------------------------- Listeners -------------------------------------

document.addEventListener('DOMContentLoaded', function () {
    // Display extension version in the footer
    fetch('../manifest.json')
        .then(response => response.json())
        .then(data => {
            document.getElementById('version').textContent = data.version;
        });
        
    // if the content of the popup was saved in the local storage, then restore it
    browser.storage.local.get({
        'search': {
            paperTitle: '',
            status: '',
            results: []
        }
    }, function (items) {
        if (paperTitle) {
            document.getElementById('paperTitle').value = items.search.paperTitle;
        }
        if (items.search.results.length > 0) {
            // show results count
            updateResultsCount(items.search.status);
            // create a table with the results
            var table = createResultsTable(items.search.results);
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
        // Clear existing results
        clearResults(false);
        // Update status to let user know search has started.
        updateStatus('Searching...', 2000);
        searchDblp();
    });

    // Open the popup.html in a new tab when the openInTab button is clicked
    document.getElementById('openInTab').addEventListener('click', function () {
        browser.tabs.create({ url: browser.runtime.getURL("popup.html") });
    });

    // Search DBLP when the user presses the Enter key
    paperTitleInput.addEventListener('keydown', function (event) {
        if (event.key === 'Enter') {
            // Clear existing results
            clearResults(false);
            // Update status to let user know search has started.
            updateStatus('Searching...', 2000);
            searchDblp();
        }
    });

    // Clear the results when the clear button is clicked
    document.getElementById('clearButton').addEventListener('click', function () {
        browser.storage.local.set({
            'search': { 
                paperTitle: '',
                status: '',
                results: []
            }
        });
        clearResults(true);
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
            var q = paperTitle.replace(/\s/g, '+');
            doApiRequest({
                method: 'GET',
                query: q
            }, function printResult(resultObj) {
                console.log(resultObj); 
                // extract all publication elements from the json object 
                var results = extractPublicationInfo(resultObj.result.hits.hit);

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
                    'search': {
                        paperTitle: paperTitle,
                        status: resCount,
                        results: results
                    }
                });
            });
        }
    }

    // Send the request to the DBLP API
    async function doApiRequest(options, printResult) {
        var url = 'https://dblp.org/search/publ/api?q="' + options.query + '"&format=json';
        url = await getUrlWithMaxResults(url);
        fetch(url)
            .then(response => response.json())
            .then(data => {
                printResult(data);                
            })
            .catch((error) => {
                console.error('Error:', error);
                updateResultsCount('Error: ' + error.message);
            });
    }

    function getUrlWithMaxResults(baseUrl) {
        return new Promise((resolve, reject) => {
            browser.storage.local.get({
                'options': {
                    maxResults: 30
                }
            }, function(items) {
                var maxResults = items.options.maxResults;
                maxResults = Math.min(Math.max(maxResults, 1), 1000);
                var url = baseUrl + '&h=' + maxResults;
                resolve(url);
            });
        });
    }

    // extract all publication elements from the results object
    function extractPublicationInfo(resultHits) {
        var results = [];
        if (resultHits) {
            for (var i = 0; i < resultHits.length; i++) {
                if (resultHits[i].info.key.includes('corr/abs-')){
                    continue;
                }
                const access = resultHits[i].info.access;
                var doi = resultHits[i].info.doi;
                if (doi === undefined) {
                    doi = 'N/A';
                }
                const doiURL = resultHits[i].info.ee;
                
                var authors = [];
                // if there is only one author, then the author field is an object
                // if there are more than one authors, then the author field is an array of objects
                if (resultHits[i].info.authors.author.length === undefined) {
                    authors.push(resultHits[i].info.authors.author.text);
                } else {
                    for (var j = 0; j < resultHits[i].info.authors.author.length; j++) {
                        authors.push(resultHits[i].info.authors.author[j].text);
                    }
                }
                const title = resultHits[i].info.title;
                const year = resultHits[i].info.year;
                var type = transformType(resultHits[i].info.type);
                var venue = resultHits[i].info.venue;
                if (type === 'article') {
                    if (resultHits[i].info.volume !== undefined) {
                        venue += ' ' + resultHits[i].info.volume;
                    }
                    if (resultHits[i].info.number !== undefined) {
                        venue += '(' + resultHits[i].info.number + ')';
                    }
                }
                
                const pages = resultHits[i].info.pages;                
                const permaLink = resultHits[i].info.url;
                const bibtexLink = resultHits[i].info.url + '.bib?param=1';

                // create the publication object
                var publication = {
                    type: type,
                    title: title,
                    permalink: permaLink,
                    authors: authors,
                    year: year,
                    venue: venue,
                    pages: pages,
                    doi: doi,
                    doiURL: doiURL,
                    bibtexLink: bibtexLink,
                    access: access
                };
                // add the publication object to the results array
                results.push(publication);
            }
        };
        return results;
    }

    function transformType(type) {
        var _type;
        switch (type) {
            case 'Journal Articles':
                _type = 'article';
                break;
            case 'Conference and Workshop Papers':
                _type = 'inproceedings';
                break;
            case 'Editorship':
                _type = 'editor';
                break;
            case 'Parts in Books or Collections':
                _type = 'incollection';
                break;
            case 'Books and Theses':
                _type = 'book';
                break;
            case 'Informal and Other Publications':
                _type = 'misc';
                break;
            case 'Reference Works':
                _type = 'refwork';
                break;
        }
        return _type;
    }



    function createResultsTable(results) {
        var table = '<table class="table table-striped table-hover">';
        table += '<thead><tr><th scope="col" colspan="2">Title</th><th scope="col">Authors</th><th scope="col">Year</th><th scope="col">Venue</th><th scope="col">DOI</th><th scope="col">Access</th><th scope="col">BibTeX</th></tr></thead>';
        table += '<tbody>';
        results.forEach((result) => {
            table += '<tr>';
            table += '<td><img class="' + result.type + '" title="' + result.type + '" src="../images/pub-type.png"></td>';
            table += '<td><a href="' + result.permalink + '" target="_blank">' + result.title + '</a></td>';
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

    function clearResults(clearTitle = true) {
        if (clearTitle) {
            document.getElementById('paperTitle').value = '';
        }
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
                browser.storage.local.get({
                    'options': {
                        keyRenaming: true
                    }
                }, function(items) {
                    var keyRenaming = items.options.keyRenaming;
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
                        // for example, "@inproceedings{DBLP:conf/esem/CalefatoQLK23,..."
                        // becomes "@inproceedings{calefato2023esem,..."
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