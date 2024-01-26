document.addEventListener('DOMContentLoaded', function () {
    var searchButton = document.getElementById('searchButton');
    var paperTitleInput = document.getElementById('paperTitle');

    if (paperTitleInput) {
        paperTitleInput.focus();
    }

    // Get the highlighted text from the current tab
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        var tab = tabs[0];
        var url = tab.url;
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
    searchButton.addEventListener('click', function () {
        searchDblp();
    });

    // Search DBLP when the user presses the Enter key
    paperTitleInput.addEventListener('keydown', function (event) {
        if (event.key === 'Enter') {
            searchDblp();
        }
    });

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
                var publicationsInfo = extractPublicationInfo(doc);
                // add each publication contained in the publicationsInfo array
                publicationsInfo.then(results => {
                    // filter all the null and undefined results
                    results = results.filter(result => result != null);

                    // create a table with the results
                    var table = '<table class="table table-striped table-hover">';
                    table += '<thead><tr><th scope="col">Title</th><th scope="col">Authors</th><th scope="col">Date</th><th scope="col">Venue</th><th scope="col">Publisher</th><th scope="col">DOI</th><th scope="col">BibTeX</th></tr></thead>';
                    table += '<tbody>';
                    results.forEach((result) => {
                        table += '<tr>';
                        table += '<td>' + result.title + '</td>';
                        table += '<td>' + result.authors.join(', ') + '</td>';
                        table += '<td>' + result.date + '</td>';
                        table += '<td>' + result.venue + '</td>';
                        table += '<td>' + result.publisher + '</td>';
                        table += '<td><a href="' + result.doi + '" target="_blank">' + result.doiURL + '</a></td>';
                        table += '<td><button class="copyBibtexButton" data-url="' + result.bibtexLink + '">Copy</button></td>';
                        table += '</tr>';
                    });
                    table += '</tbody>';
                    table += '</table>';

                    // show the results into the document results div
                    document.getElementById('results').innerHTML = table;

                    // Add the event listener for the copyBibtexButton class
                    document.querySelectorAll('.copyBibtexButton').forEach(button => {
                        button.addEventListener('click', function () {
                            const url = this.getAttribute('data-url');
                            window.copyBibtexToClipboard(url);
                        });
                    });
                });
            });
        }
    }

    function doCORSRequest(options, printResult) {
        var cors_api_url = 'http://localhost:9999/';
        var x = new XMLHttpRequest();
        x.open(options.method, cors_api_url + options.url);
        x.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
        x.onload = x.onerror = function () {
            printResult(x.responseText || '');
        };
        x.send(options.data);
    }

    function extractPublicationInfo(doc) {
        var bibtexLinks = [];
        var bibtexLinkRefs = doc.querySelectorAll('li.drop-down div.body ul li a[href$="?view=bibtex"]');
        // extract the bibtex link for each element in bibtexLinkRefs and replace '.html?view=bibtex' with '.bib?param=1'
        // this allows to fetch the bibtex directly
        if (bibtexLinkRefs) {
            bibtexLinks = Array.from(bibtexLinkRefs).map(link => link.href.replace('.html?view=bibtex', '.bib?param=1'));
        }

        // extract the crossref links from the dblp search results page
        var crossRefLinkElements = doc.querySelectorAll('li.drop-down div.body ul li[class="wrap"] a[href^="https://api.crossref.org/works/"]');
        var crossRefLinks = [];
        if (crossRefLinkElements) {
            crossRefLinks = Array.from(crossRefLinkElements).map(crossRefLinkElement => {
                return fetch(crossRefLinkElement.href)
                    .then(response => response.text())
                    .then(data => {
                        try {
                            data = JSON.parse(data);
                            var doiURL = data.message.URL;
                            var doi = data.message.DOI;
                            var type = data.message.type;
                            var title = data.message.title[0];
                            var date = data.message.indexed['date-time'].substring(0, 10);
                            var venue = data.message['container-title'][0];
                            var url = data.message.resource.primary.URL;
                            var publisher = data.message.publisher;
                            var authors = data.message.author.map(author => author.given + ' ' + author.family);
                            data = { doi, doiURL, type, title, date, venue, url, publisher, authors };
                            return data;
                        } catch (e) {
                            console.log('Unable to parse JSON data: ', data);
                            return null;
                        }
                    })
                    .catch(error => {
                        console.error('Error fetching CrossRef link:', error);
                        return null;
                    });
            });
        }

        var publInfo = mergeInfo(bibtexLinks, crossRefLinks);
        return publInfo;
    }

    // merge the bibtex links and the crossref links
    async function mergeInfo(bibtexLinks, crossRefLinks) {
        const resolvedCrossRefLinks = await Promise.all(crossRefLinks);
        var publInfos = [];
        resolvedCrossRefLinks.forEach((crossRefLink, index) => {
            var pub = {};
            pub.bibtexLink = bibtexLinks[index];
            // exclude the Corr Abs elements
            if (!pub.bibtexLink.startsWith('https://dblp.org/rec/journals/corr/abs-')) {
                pub.title = crossRefLink.title;
                pub.authors = crossRefLink.authors;
                pub.date = crossRefLink.date;
                pub.venue = crossRefLink.venue;
                pub.publisher = crossRefLink.publisher;
                pub.doi = crossRefLink.doi;
                pub.doiURL = crossRefLink.doiURL;
                publInfos.push(pub);
            }
        });
        return publInfos;
    }

    window.copyBibtexToClipboard = function (url) {
        fetch(url)
            .then(response => response.text())
            .then(data => {
                navigator.clipboard.writeText(data)
                    .then(() => {
                        console.log('BibTeX copied to clipboard: ', data);
                    })
                    .catch(err => {
                        console.error('Could not copy BibTeX to clipboard: ', err);
                    });
            })
            .catch(err => {
                console.error('Could not fetch BibTeX: ', err);
            });
    }
});
