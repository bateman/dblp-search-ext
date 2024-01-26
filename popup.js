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

                // extract the bibtex links
                var bibtexLinks = fetchBibtexLinks(doc);

                // extract crossref links
                fetchCrossRefLinks(doc).then(results => {
                    // read the results of each fetch are from a dictionary
                    results = results.filter(result => result !== undefined);
                    // sort the results by date
                    results.sort((a, b) => b.date.localeCompare(a.date));

                    // create a table with the results
                    var table = '<table class="table table-striped table-hover">';
                    table += '<thead><tr><th scope="col">Title</th><th scope="col">Authors</th><th scope="col">Date</th><th scope="col">Venue</th><th scope="col">Publisher</th><th scope="col">DOI</th><th scope="col">BibTeX</th></tr></thead>';
                    table += '<tbody>';
                    results.forEach((result, index) => {
                        table += '<tr>';
                        table += '<td>' + result.title + '</td>';
                        table += '<td>' + result.authors.join(', ') + '</td>';
                        table += '<td>' + result.date + '</td>';
                        table += '<td>' + result.venue + '</td>';
                        table += '<td>' + result.publisher + '</td>';
                        table += '<td><a href="' + result.doi + '" target="_blank">' + result.doiURL + '</a></td>';
                        table += '<td><button class="copyBibtexButton" data-url="' + bibtexLinks[index] +  '">Copy</button></td>';
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

    // fetch the bibtex links from the dblp search results page
    function fetchBibtexLinks(doc) {
        var links = doc.querySelectorAll('li a[href*="view=bibtex"]');
        var bibtexLinks = Array.from(links).map(link => link.href);
        // remove from links all elements that start as 'https://dblp.org/rec/journals/corr/abs-'
        bibtexLinks = bibtexLinks.filter(link => !link.startsWith('https://dblp.org/rec/journals/corr/abs-'));
        // now replace '.html?view=bibtex' with '.bib?param=1'
        // this allows to fetch the bibtex directly
        bibtexLinks = bibtexLinks.map(link => link.replace('.html?view=bibtex', '.bib?param=1'));

        return bibtexLinks;
    }

    // fetch the crossref links from the dblp search results page
    function fetchCrossRefLinks(doc) {
        var links = doc.querySelectorAll('li[class*="entry"] a[href*="crossref"]');
        // for each link, make a request to the crossref url
        var promises = Array.from(links).map(link => {
            return fetch(link.href)
                .then(response => response.text())
                .then(data => {
                    // try loading the JSON data, in case of error, ignore the element
                    try {
                        data = JSON.parse(data);
                        // read the DOI from the "message" field 
                        var doiURL = data.message.URL;
                        var doi = data.message.DOI;
                        // read the article type
                        var type = data.message.type;
                        // read the title
                        var title = data.message.title[0];
                        // read the date as YYYY-MM-DD
                        var date = data.message.indexed['date-time'].substring(0, 10);
                        // read the venue
                        var venue = data.message['container-title'][0];
                        // resource url
                        var url = data.message.resource.primary.URL;
                        // read the publisher
                        var publisher = data.message.publisher;
                        // read the authors into a list
                        var authors = data.message.author.map(author => author.given + ' ' + author.family);
                        // return the data into a dictionary
                        data = { doi, doiURL, type, title, date, venue, url, publisher, authors };
                    } catch (e) {
                        console.log('Unable to parse JSON data: ', data);
                        return;
                    }
                    return data;
                })
                .catch(error => console.error('Error fetching CrossRef links:', error));
        });
        return Promise.all(promises);
    }

    window.copyBibtexToClipboard = function(url) {
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
