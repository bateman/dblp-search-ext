// model.js
console.log("model.js loaded");
var browser = browser || chrome;

export class PublicationModel {
    constructor() {
        this.publications = [];
        this.notify = null;
        this.status = '';
        this.totalHits = 0;
        this.sentHits = 0;
    }

    async searchPublications(query) {
        console.log(`Searching publications matching: ${query}`);
        var url = `https://dblp.org/search/publ/api?q=${encodeURIComponent(query)}&format=json`;
        url = await this.getUrlWithMaxResults(url)
        try {
            const response = await fetch(url);
            this.status = response.statusText;
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${this.status}`);
            }
            const data = await response.json();
            this.totalHits = data.result.hits['@total'];
            this.sentHits = data.result.hits['@sent'];
            if (this.totalHits > 0) {
                this.publications = this.parsePublications(data.result.hits.hit);
            }
        } catch (error) {
            console.error('There was a problem with the fetch operation: ', error);
        }
        if (this.notify) {
            // Notify the view through controller that the model has changed
            this.notify();
        }
    }

    async getUrlWithMaxResults(baseUrl) {
        return new Promise((resolve) => {
            browser.storage.local.get({
                'options': {
                    maxResults: 30
                }
            }, function (items) {
                var maxResults = items.options.maxResults;
                maxResults = Math.min(Math.max(maxResults, 1), 1000);
                var url = baseUrl + '&h=' + maxResults;
                resolve(url);
            });
        });
    }

    parsePublications(pubsInfo) {
        var results = [];
        // extract all publication elements from the json object 
        for (var i = 0; i < pubsInfo.length; i++) {
            const pub = pubsInfo[i].info;

            if (pub.key.includes('corr/abs-')) {
                continue;
            }

            var authors = [];
            // if there is only one author, then the author field is an object
            // if there are more than one authors, then the author field is an array of objects
            if (pub.authors.author.length === undefined) {
                authors.push(pub.authors.author.text);
            } else {
                for (var j = 0; j < pub.authors.author.length; j++) {
                    authors.push(pub.authors.author[j].text);
                }
            }
            var venue = pub.venue;
            var type = this.transformType(pub.type);
            if (type === 'article') {
                if (pub.volume !== undefined) {
                    venue += ' ' + pub.volume;
                }
                if (pub.number !== undefined) {
                    venue += '(' + pub.number + ')';
                }
            }

            var publication = {
                type: type,
                title: pub.title,
                permaLink: pub.url,
                authors: authors,
                year: pub.year,
                venue: venue,
                pages: pub.pages,
                doi: pub.doi ? pub.doi : 'N/A',
                doiURL: pub.ee,
                bibtexLink: pub.url + '.bib?param=1',
                access: pub.access
            };
            results.push(publication);
        }

        return results;
    }

    transformType(type) {
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

    subscribe(callback) {
        this.notify = callback;
    }
}