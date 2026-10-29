/**
 * Live checks against the real dblp service. Unlike the unit tests, nothing
 * here is mocked except the extension APIs: requests go through dblpFetch()
 * exactly as the extension sends them, so these tests fail when dblp changes
 * its firewall, its JSON format, or its BibTeX downloads.
 *
 * Run with `npm run test:live` (or `make test/live`); they are not part of
 * `npm test`, so CI does not depend on dblp being reachable.
 */
import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";

const manifest = JSON.parse(
  readFileSync(new URL("../../manifest.json", import.meta.url), "utf8")
);

// Only the extension APIs are stubbed: storage returns the defaults it is
// given (with fewer results, to keep the request small) and the manifest
// gives the real version, so dblp sees the same `app` parameter as users
globalThis.chrome = {
  storage: {
    local: {
      get: (defaults, callback) =>
        callback({ options: { ...defaults.options, maxResults: 5 } }),
    },
  },
  runtime: {
    getManifest: () => manifest,
  },
};

const { PublicationModel } = await import("../../js/model/model.js");
const { assertDblpData, dblpFetch } = await import("../../js/utils/dblp.js");

/** A query with stable results: the Senti4SD papers (EMSE 2018, ICSE 2018) */
const QUERY = "Sentiment polarity detection for software development";

/** Entry types the model maps dblp's publication types to */
const KNOWN_TYPES = [
  "article",
  "inproceedings",
  "editor",
  "incollection",
  "book",
  "misc",
  "refwork",
];

/** One retry absorbs a transient network error; a second failure is real */
const LIVE_TEST_OPTIONS = { retry: 1, timeout: 30000 };

describe("dblp live API", () => {
  /** @type {Object[]} Publications found by the search test */
  let publications = [];

  it("returns parseable search results", LIVE_TEST_OPTIONS, async () => {
    const result = await new PublicationModel().searchPublications(QUERY);

    // errorMessage tells why (anti-bot page, HTTP error, unexpected JSON)
    expect(result.status, result.errorMessage).toBe("OK");
    expect(result.totalHits).toBeGreaterThan(0);
    expect(result.sentHits).toBeGreaterThan(0);
    expect(result.publications.length).toBeGreaterThan(0);

    for (const pub of result.publications) {
      expect(KNOWN_TYPES).toContain(pub.type);
      expect(typeof pub.title).toBe("string");
      expect(pub.title.length).toBeGreaterThan(0);
      expect(pub.permaLink).toMatch(/^https:\/\/dblp\.org\/rec\//);
      expect(pub.year).toMatch(/^\d{4}$/);
      expect(typeof pub.venue).toBe("string");
      expect(Array.isArray(pub.authors)).toBe(true);
    }
    expect(result.publications.some((pub) => pub.authors.length > 0)).toBe(true);
    expect(result.publications.some((pub) => pub.doi !== "N/A")).toBe(true);

    publications = result.publications;
  });

  it("serves BibTeX for a search result", LIVE_TEST_OPTIONS, async () => {
    expect(publications.length, "the search test found no publications").toBeGreaterThan(0);

    const bibtex = await dblpFetch(publications[0].bibtexLink, (response) => {
      assertDblpData(response);
      return response.text();
    });

    expect(bibtex.trim()).toMatch(/^@\w+\{DBLP:/);
    expect(bibtex).toMatch(/title\s*=/);
    expect(bibtex).toMatch(/author\s*=|editor\s*=/);
  });
});
