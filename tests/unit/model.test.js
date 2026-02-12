import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the browser API before importing model
const mockStorageGet = vi.fn();
globalThis.chrome = {
  storage: {
    local: {
      get: mockStorageGet,
    },
  },
};

const { PublicationModel } = await import("../../js/model/model.js");

describe("PublicationModel", () => {
  let model;

  beforeEach(() => {
    model = new PublicationModel();
    vi.restoreAllMocks();
  });

  describe("constructor", () => {
    it("initializes with empty state", () => {
      expect(model.publications).toEqual([]);
      expect(model.notify).toBe(null);
      expect(model.status).toBe("");
      expect(model.totalHits).toBe(0);
      expect(model.sentHits).toBe(0);
      expect(model.excludedCount).toBe(0);
      expect(model.currentOffset).toBe(0);
    });
  });

  describe("subscribe", () => {
    it("sets the notify callback", () => {
      const callback = vi.fn();
      model.subscribe(callback);
      expect(model.notify).toBe(callback);
    });
  });

  describe("transformType", () => {
    it("maps Journal Articles to article", () => {
      expect(model.transformType("Journal Articles")).toBe("article");
    });

    it("maps Conference and Workshop Papers to inproceedings", () => {
      expect(model.transformType("Conference and Workshop Papers")).toBe("inproceedings");
    });

    it("maps Editorship to editor", () => {
      expect(model.transformType("Editorship")).toBe("editor");
    });

    it("maps Parts in Books or Collections to incollection", () => {
      expect(model.transformType("Parts in Books or Collections")).toBe("incollection");
    });

    it("maps Books and Theses to book", () => {
      expect(model.transformType("Books and Theses")).toBe("book");
    });

    it("maps Informal and Other Publications to misc", () => {
      expect(model.transformType("Informal and Other Publications")).toBe("misc");
    });

    it("maps Reference Works to refwork", () => {
      expect(model.transformType("Reference Works")).toBe("refwork");
    });

    it("returns undefined for unknown types", () => {
      expect(model.transformType("Unknown")).toBe(undefined);
    });
  });

  describe("isExcludedPublication", () => {
    it("excludes CoRR abs entries", () => {
      expect(model.isExcludedPublication({ key: "journals/corr/abs-2301-12345" })).toBe(true);
    });

    it("does not exclude regular publications", () => {
      expect(model.isExcludedPublication({ key: "journals/tse/Smith23" })).toBe(false);
    });

    it("does not exclude CoRR non-abs entries", () => {
      expect(model.isExcludedPublication({ key: "journals/corr/Smith23" })).toBe(false);
    });
  });

  describe("extractAuthors", () => {
    it("extracts single author", () => {
      const authorsInfo = { author: { text: "John Smith" } };
      expect(model.extractAuthors(authorsInfo)).toEqual(["John Smith"]);
    });

    it("extracts multiple authors", () => {
      const authorsInfo = {
        author: [
          { text: "John Smith" },
          { text: "Jane Doe" },
        ],
      };
      expect(model.extractAuthors(authorsInfo)).toEqual(["John Smith", "Jane Doe"]);
    });

    it("removes numeric suffixes from author names", () => {
      const authorsInfo = {
        author: [
          { text: "John Smith 0001" },
          { text: "Jane Doe 0002" },
        ],
      };
      expect(model.extractAuthors(authorsInfo)).toEqual(["John Smith", "Jane Doe"]);
    });

    it("does not modify names without numeric suffix", () => {
      const authorsInfo = { author: { text: "Regular Author" } };
      expect(model.extractAuthors(authorsInfo)).toEqual(["Regular Author"]);
    });
  });

  describe("constructVenue", () => {
    it("returns simple venue for non-article types", () => {
      const pub = { venue: "ICSE", type: "Conference and Workshop Papers" };
      expect(model.constructVenue(pub)).toBe("ICSE");
    });

    it("appends volume for journal articles", () => {
      const pub = { venue: "TSE", type: "Journal Articles", volume: "42" };
      expect(model.constructVenue(pub)).toBe("TSE 42");
    });

    it("appends volume and number for journal articles", () => {
      const pub = { venue: "TSE", type: "Journal Articles", volume: "42", number: "3" };
      expect(model.constructVenue(pub)).toBe("TSE 42(3)");
    });

    it("does not append volume/number for non-articles", () => {
      const pub = { venue: "Springer", type: "Books and Theses", volume: "1" };
      expect(model.constructVenue(pub)).toBe("Springer");
    });

    it("appends number without volume for journal articles", () => {
      const pub = { venue: "TSE", type: "Journal Articles", number: "3" };
      expect(model.constructVenue(pub)).toBe("TSE(3)");
    });

    it("returns plain venue for article without volume or number", () => {
      const pub = { venue: "TSE", type: "Journal Articles" };
      expect(model.constructVenue(pub)).toBe("TSE");
    });
  });

  describe("createPublication", () => {
    it("creates a standardized publication object", () => {
      const pub = {
        type: "Journal Articles",
        title: "Test Paper",
        url: "https://dblp.org/rec/journals/tse/Smith23",
        year: "2023",
        pages: "1-15",
        doi: "10.1000/xyz",
        ee: "https://doi.org/10.1000/xyz",
        access: "open",
      };
      const authors = ["John Smith"];
      const venue = "TSE 42(3)";

      const result = model.createPublication(pub, authors, venue);

      expect(result.type).toBe("article");
      expect(result.title).toBe("Test Paper");
      expect(result.permaLink).toBe("https://dblp.org/rec/journals/tse/Smith23");
      expect(result.authors).toEqual(["John Smith"]);
      expect(result.year).toBe("2023");
      expect(result.venue).toBe("TSE 42(3)");
      expect(result.pages).toBe("1-15");
      expect(result.doi).toBe("10.1000/xyz");
      expect(result.doiURL).toBe("https://doi.org/10.1000/xyz");
      expect(result.bibtexLink).toBe("https://dblp.org/rec/journals/tse/Smith23.bib?param=1");
      expect(result.access).toBe("open");
    });

    it("uses N/A for missing DOI", () => {
      const pub = {
        type: "Conference and Workshop Papers",
        title: "Test",
        url: "https://dblp.org/rec/conf/icse/Smith23",
        year: "2023",
        access: "closed",
      };
      const result = model.createPublication(pub, ["Smith"], "ICSE");
      expect(result.doi).toBe("N/A");
    });

    it("handles missing ee and pages fields", () => {
      const pub = {
        type: "Journal Articles",
        title: "Test",
        url: "https://dblp.org/rec/journals/tse/Smith23",
        year: "2023",
        doi: "10.1000/xyz",
        access: "open",
      };
      const result = model.createPublication(pub, ["Smith"], "TSE");
      expect(result.doiURL).toBe(undefined);
      expect(result.pages).toBe(undefined);
    });
  });

  describe("parsePublications", () => {
    it("parses an array of publications", () => {
      const pubsInfo = [
        {
          info: {
            key: "journals/tse/Smith23",
            type: "Journal Articles",
            title: "Test Paper",
            url: "https://dblp.org/rec/journals/tse/Smith23",
            authors: { author: { text: "John Smith" } },
            year: "2023",
            venue: "TSE",
            doi: "10.1000/xyz",
            ee: "https://doi.org/10.1000/xyz",
            access: "open",
          },
        },
      ];

      const result = model.parsePublications(pubsInfo);
      expect(result.publications).toHaveLength(1);
      expect(result.excludedCount).toBe(0);
      expect(result.publications[0].title).toBe("Test Paper");
    });

    it("excludes CoRR abs entries and counts them", () => {
      const pubsInfo = [
        {
          info: {
            key: "journals/tse/Smith23",
            type: "Journal Articles",
            title: "Regular Paper",
            url: "https://dblp.org/rec/journals/tse/Smith23",
            authors: { author: { text: "Smith" } },
            year: "2023",
            venue: "TSE",
            access: "open",
          },
        },
        {
          info: {
            key: "journals/corr/abs-2301-12345",
            type: "Informal and Other Publications",
            title: "ArXiv Paper",
            url: "https://dblp.org/rec/journals/corr/abs-2301-12345",
            authors: { author: { text: "Doe" } },
            year: "2023",
            venue: "CoRR",
            access: "open",
          },
        },
      ];

      const result = model.parsePublications(pubsInfo);
      expect(result.publications).toHaveLength(1);
      expect(result.excludedCount).toBe(1);
      expect(result.publications[0].title).toBe("Regular Paper");
    });

    it("returns empty results for empty input array", () => {
      const result = model.parsePublications([]);
      expect(result.publications).toHaveLength(0);
      expect(result.excludedCount).toBe(0);
    });

    it("handles all entries being excluded", () => {
      const pubsInfo = [
        {
          info: {
            key: "journals/corr/abs-2301-00001",
            type: "Informal and Other Publications",
            title: "Paper 1",
            url: "https://dblp.org/rec/journals/corr/abs-2301-00001",
            authors: { author: { text: "Smith" } },
            year: "2023",
            venue: "CoRR",
            access: "open",
          },
        },
        {
          info: {
            key: "journals/corr/abs-2301-00002",
            type: "Informal and Other Publications",
            title: "Paper 2",
            url: "https://dblp.org/rec/journals/corr/abs-2301-00002",
            authors: { author: { text: "Doe" } },
            year: "2023",
            venue: "CoRR",
            access: "open",
          },
        },
      ];

      const result = model.parsePublications(pubsInfo);
      expect(result.publications).toHaveLength(0);
      expect(result.excludedCount).toBe(2);
    });
  });

  describe("getUrlWithMaxResults", () => {
    it("appends maxResults from storage to URL", async () => {
      mockStorageGet.mockImplementation((defaults, callback) => {
        callback({ options: { maxResults: 50 } });
      });

      const result = await model.getUrlWithMaxResults("https://dblp.org/search/publ/api?q=test&format=json");
      expect(result).toBe("https://dblp.org/search/publ/api?q=test&format=json&h=50");
    });

    it("clamps maxResults to valid range", async () => {
      mockStorageGet.mockImplementation((defaults, callback) => {
        callback({ options: { maxResults: 5000 } });
      });

      const result = await model.getUrlWithMaxResults("https://dblp.org/api?q=test");
      expect(result).toBe("https://dblp.org/api?q=test&h=1000");
    });

    it("clamps maxResults minimum to 1", async () => {
      mockStorageGet.mockImplementation((defaults, callback) => {
        callback({ options: { maxResults: 0 } });
      });

      const result = await model.getUrlWithMaxResults("https://dblp.org/api?q=test");
      expect(result).toBe("https://dblp.org/api?q=test&h=1");
    });
  });

  describe("searchPublications", () => {
    it("fetches and parses publications on success", async () => {
      const notifyFn = vi.fn();
      model.subscribe(notifyFn);

      mockStorageGet.mockImplementation((defaults, callback) => {
        callback({ options: { maxResults: 10 } });
      });

      const apiResponse = {
        result: {
          hits: {
            "@total": "1",
            "@sent": "1",
            hit: [
              {
                info: {
                  key: "journals/tse/Smith23",
                  type: "Journal Articles",
                  title: "Test Paper",
                  url: "https://dblp.org/rec/journals/tse/Smith23",
                  authors: { author: { text: "John Smith" } },
                  year: "2023",
                  venue: "TSE",
                  access: "open",
                },
              },
            ],
          },
        },
      };

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        statusText: "OK",
        json: () => Promise.resolve(apiResponse),
      });

      await model.searchPublications("test query");

      expect(model.status).toBe("OK");
      expect(model.totalHits).toBe(1);
      expect(model.sentHits).toBe(1);
      expect(model.publications).toHaveLength(1);
      expect(notifyFn).toHaveBeenCalledOnce();
    });

    it("handles HTTP errors", async () => {
      const notifyFn = vi.fn();
      model.subscribe(notifyFn);

      mockStorageGet.mockImplementation((defaults, callback) => {
        callback({ options: { maxResults: 10 } });
      });

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        statusText: "Not Found",
      });

      await model.searchPublications("bad query");

      expect(model.status).toBe("Error");
      expect(notifyFn).toHaveBeenCalledOnce();
    });

    it("handles fetch exceptions", async () => {
      const notifyFn = vi.fn();
      model.subscribe(notifyFn);

      mockStorageGet.mockImplementation((defaults, callback) => {
        callback({ options: { maxResults: 10 } });
      });

      globalThis.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

      await model.searchPublications("query");

      expect(model.status).toBe("Error");
      expect(notifyFn).toHaveBeenCalledOnce();
    });

    it("handles timeout (AbortError)", async () => {
      const notifyFn = vi.fn();
      model.subscribe(notifyFn);

      mockStorageGet.mockImplementation((defaults, callback) => {
        callback({ options: { maxResults: 10 } });
      });

      const abortError = new Error("Aborted");
      abortError.name = "AbortError";
      globalThis.fetch = vi.fn().mockRejectedValue(abortError);

      await model.searchPublications("query");

      expect(model.status).toBe("Request Timeout");
      expect(notifyFn).toHaveBeenCalledOnce();
    });

    it("sets currentOffset from parameter", async () => {
      mockStorageGet.mockImplementation((defaults, callback) => {
        callback({ options: { maxResults: 10 } });
      });

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          result: { hits: { "@total": "0", "@sent": "0" } },
        }),
      });

      await model.searchPublications("query", 30);
      expect(model.currentOffset).toBe(30);
    });

    it("handles zero results", async () => {
      mockStorageGet.mockImplementation((defaults, callback) => {
        callback({ options: { maxResults: 10 } });
      });

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          result: { hits: { "@total": "0", "@sent": "0" } },
        }),
      });

      await model.searchPublications("no results query");

      expect(model.status).toBe("OK");
      expect(model.totalHits).toBe(0);
      expect(model.sentHits).toBe(0);
      expect(model.publications).toEqual([]);
    });

    it("does not crash when no subscriber is set", async () => {
      // model.notify is null by default — should not throw
      mockStorageGet.mockImplementation((defaults, callback) => {
        callback({ options: { maxResults: 10 } });
      });

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          result: { hits: { "@total": "0", "@sent": "0" } },
        }),
      });

      await expect(model.searchPublications("query")).resolves.not.toThrow();
      expect(model.status).toBe("OK");
    });

    it("appends offset as &f= parameter in fetch URL", async () => {
      mockStorageGet.mockImplementation((defaults, callback) => {
        callback({ options: { maxResults: 10 } });
      });

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          result: { hits: { "@total": "0", "@sent": "0" } },
        }),
      });

      await model.searchPublications("test", 50);

      const fetchUrl = globalThis.fetch.mock.calls[0][0];
      expect(fetchUrl).toContain("&f=50");
    });

    it("does not append &f= when offset is 0", async () => {
      mockStorageGet.mockImplementation((defaults, callback) => {
        callback({ options: { maxResults: 10 } });
      });

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          result: { hits: { "@total": "0", "@sent": "0" } },
        }),
      });

      await model.searchPublications("test", 0);

      const fetchUrl = globalThis.fetch.mock.calls[0][0];
      expect(fetchUrl).not.toContain("&f=");
    });

    it("encodes query parameter in URL", async () => {
      mockStorageGet.mockImplementation((defaults, callback) => {
        callback({ options: { maxResults: 10 } });
      });

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          result: { hits: { "@total": "0", "@sent": "0" } },
        }),
      });

      await model.searchPublications("test query & special");

      const fetchUrl = globalThis.fetch.mock.calls[0][0];
      expect(fetchUrl).toContain("q=test%20query%20%26%20special");
    });
  });
});
