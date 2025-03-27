/* global chrome */

// model.js
console.log("model.js loaded");
var browser = browser || chrome;

export class PublicationModel {
  constructor() {
    this.publications = [];
    this.notify = null;
    this.status = "";
    this.totalHits = 0;
    this.sentHits = 0;
    this.excludedCount = 0;
  }

  async searchPublications(query) {
    console.log(`Searching publications matching: ${query}`);
    var url = `https://dblp.org/search/publ/api?q=${encodeURIComponent(
      query
    )}&format=json`;
    url = await this.getUrlWithMaxResults(url);
    try {
      const response = await fetch(url);
      this.status = response.statusText;
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${this.status}`);
      }
      const data = await response.json();
      this.totalHits = data.result.hits["@total"];
      this.sentHits = data.result.hits["@sent"];
      if (this.totalHits > 0) {
        //this.publications = this.parsePublications(data.result.hits.hit);
        const result = this.parsePublications(data.result.hits.hit);
        this.publications = result.publications;
        this.excludedCount = result.excludedCount;
      }
    } catch (error) {
      console.error("There was a problem with the fetch operation: ", error);
    }
    if (this.notify) {
      // Notify the view through controller that the model has changed
      this.notify();
    }
  }

  async getUrlWithMaxResults(baseUrl) {
    return new Promise((resolve) => {
      browser.storage.local.get(
        {
          options: {
            maxResults: 30,
          },
        },
        function (items) {
          var maxResults = items.options.maxResults;
          maxResults = Math.min(Math.max(maxResults, 1), 1000);
          var url = baseUrl + "&h=" + maxResults;
          resolve(url);
        }
      );
    });
  }

  parsePublications(pubsInfo) {
    const results = [];
    let excludedCount = 0;

    for (const pubInfo of pubsInfo) {
      const pub = pubInfo.info;

      if (this.isExcludedPublication(pub)) {
        excludedCount++;
        continue;
      }

      const authors = this.extractAuthors(pub.authors);
      const venue = this.constructVenue(pub);
      const publication = this.createPublication(pub, authors, venue);

      results.push(publication);
    }

    return {
      publications: results,
      excludedCount: excludedCount,
    };
  }

  isExcludedPublication(pub) {
    return pub.key.includes("corr/abs-");
  }

  extractAuthors(authorsInfo) {
    // Fix: dblp api sometimes returns '000n' next to authors' names
    const authors = [];
    const regex = / 000\d+$/; // Matches ' 000' followed by one or more digits at the end of the string
    if (authorsInfo.author.length === undefined) {
      authors.push(authorsInfo.author.text.replace(regex, ""));
    } else {
      for (const author of authorsInfo.author) {
        authors.push(author.text.replace(regex, ""));
      }
    }
    return authors;
  }

  constructVenue(pub) {
    let venue = pub.venue;
    const type = this.transformType(pub.type);
    if (type === "article") {
      if (pub.volume !== undefined) {
        venue += " " + pub.volume;
      }
      if (pub.number !== undefined) {
        venue += "(" + pub.number + ")";
      }
    }
    return venue;
  }

  createPublication(pub, authors, venue) {
    return {
      type: this.transformType(pub.type),
      title: pub.title,
      permaLink: pub.url,
      authors: authors,
      year: pub.year,
      venue: venue,
      pages: pub.pages,
      doi: pub.doi ? pub.doi : "N/A",
      doiURL: pub.ee,
      bibtexLink: pub.url + ".bib?param=1",
      access: pub.access,
    };
  }

  transformType(type) {
    var _type;
    switch (type) {
      case "Journal Articles":
        _type = "article";
        break;
      case "Conference and Workshop Papers":
        _type = "inproceedings";
        break;
      case "Editorship":
        _type = "editor";
        break;
      case "Parts in Books or Collections":
        _type = "incollection";
        break;
      case "Books and Theses":
        _type = "book";
        break;
      case "Informal and Other Publications":
        _type = "misc";
        break;
      case "Reference Works":
        _type = "refwork";
        break;
    }
    return _type;
  }

  subscribe(callback) {
    this.notify = callback;
  }
}
