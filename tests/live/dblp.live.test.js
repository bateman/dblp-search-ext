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
const { fetchDblpBibtex } = await import("../../js/utils/dblp.js");
const { processBibtexData } = await import("../../js/utils/bibtex.js");

/** A query with stable results: the Senti4SD papers (EMSE 2018, ICSE 2018) */
const QUERY = "Sentiment polarity detection for software development";

/** BibTeX download of the EMSE 2018 paper found by QUERY */
const BIBTEX_URL = "https://dblp.org/rec/journals/ese/CalefatoLMN18.bib?param=1";

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

// No retries: retrying a 429 or an anti-bot page at once would not help and
// would only send dblp more requests; one weekly failure is worth a look
const LIVE_TEST_OPTIONS = { timeout: 30000 };

describe("dblp live API", () => {
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
    expect(result.publications.map((pub) => pub.bibtexLink)).toContain(BIBTEX_URL);
  });

  it("serves BibTeX the extension can process", LIVE_TEST_OPTIONS, async () => {
    const bibtex = await fetchDblpBibtex(BIBTEX_URL);

    // The default options: key renamed to <author><year><venue>, dblp metadata removed
    const processed = processBibtexData(bibtex, {
      keyRenaming: true,
      citationKeyFields: ["author", "year", "venue"],
      authorCapitalize: false,
      venueUppercase: false,
      removeTimestampBiburlBibsource: true,
      removeUrl: false,
    });

    expect(processed.citationKey).toBe("calefato2018ese");
    expect(processed.data).toMatch(/^@article\{calefato2018ese,/);
    expect(processed.data).toMatch(/title\s*=\s*\{Sentiment Polarity Detection/);
    expect(processed.data).toMatch(/author\s*=\s*\{Fabio Calefato/);
    expect(processed.data).not.toMatch(/timestamp\s*=|biburl\s*=|bibsource\s*=/);
  });
});
