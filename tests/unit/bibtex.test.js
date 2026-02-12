import { describe, it, expect } from "vitest";
import {
  extractAuthorFromKey,
  extractVenueFromKey,
  extractYearFromBibtex,
  findMatchingBrace,
  findFirstSignificantWord,
  extractFirstTitleWord,
  buildCitationKey,
  cleanBibtexMetadata,
  removeUrlFromBibtex,
} from "../../js/utils/bibtex.js";

describe("extractAuthorFromKey", () => {
  it("extracts author from standard DBLP key", () => {
    // "Smith21" → remove digits → "Smith" → no trailing uppercase sequence → "Smith"
    expect(extractAuthorFromKey("DBLP:journals/tse/Smith21")).toBe("Smith");
  });

  it("extracts author from key with trailing uppercase", () => {
    // "SmithAB21" → remove digits → "SmithAB" → remove trailing uppercase "AB" → "Smith"
    expect(extractAuthorFromKey("DBLP:conf/icse/SmithAB21")).toBe("Smith");
  });

  it("removes commas from author name", () => {
    expect(extractAuthorFromKey("DBLP:journals/tse/Smith,21")).toBe("Smith");
  });

  it("handles key with no trailing uppercase or digits", () => {
    expect(extractAuthorFromKey("DBLP:journals/tse/jones")).toBe("jones");
  });
});

describe("extractVenueFromKey", () => {
  it("extracts venue from DBLP key", () => {
    expect(extractVenueFromKey("DBLP:journals/tse/Smith21")).toBe("tse");
  });

  it("extracts venue from conference key", () => {
    expect(extractVenueFromKey("DBLP:conf/icse/Smith21")).toBe("icse");
  });
});

describe("extractYearFromBibtex", () => {
  it("extracts year from standard BibTeX entry", () => {
    const bibtex = `@article{key,
  author = {John Smith},
  title  = {Some Title},
  year   = {2023},
  journal = {TSE}
}`;
    expect(extractYearFromBibtex(bibtex)).toBe("2023");
  });

  it("returns null when year field is missing", () => {
    const bibtex = `@article{key,
  author = {John Smith},
  title  = {Some Title}
}`;
    expect(extractYearFromBibtex(bibtex)).toBe(null);
  });

  it("handles year with varying whitespace", () => {
    expect(extractYearFromBibtex("year={2021},")).toBe("2021");
    expect(extractYearFromBibtex("year = {2021},")).toBe("2021");
  });

  it("returns null when year is last field without trailing comma", () => {
    const bibtex = `@article{key,
  author = {Smith},
  year = {2023}
}`;
    // The regex requires a trailing comma after the year value
    expect(extractYearFromBibtex(bibtex)).toBe(null);
  });
});

describe("findMatchingBrace", () => {
  it("finds matching brace in simple case", () => {
    // "abc}" - starting after opening brace, braceCount starts at 1
    expect(findMatchingBrace("abc}", 0)).toBe(4);
  });

  it("handles nested braces", () => {
    // "{inner} rest}" - { at 0 bumps to 2, } at 6 drops to 1, } at 12 drops to 0 → endIndex=13
    expect(findMatchingBrace("{inner} rest}", 0)).toBe(13);
  });

  it("returns -1 for unmatched braces", () => {
    expect(findMatchingBrace("abc{def", 0)).toBe(-1);
  });

  it("returns index after closing brace", () => {
    expect(findMatchingBrace("}", 0)).toBe(1);
  });

  it("works with non-zero startIndex", () => {
    // "prefix {inner}" - start at index 8 (after the {), find closing } at index 13
    const data = "prefix {inner}";
    expect(findMatchingBrace(data, 8)).toBe(14);
  });

  it("handles empty string", () => {
    expect(findMatchingBrace("", 0)).toBe(-1);
  });

  it("handles deeply nested braces", () => {
    // braceCount starts at 1. "{{{}}}}": {→2, {→3, {→4, }→3, }→2, }→1, }→0 → endIndex=7
    expect(findMatchingBrace("{{{}}}}", 0)).toBe(7);
  });
});

describe("findFirstSignificantWord", () => {
  it("skips articles and short words", () => {
    expect(findFirstSignificantWord(["The", "Quick", "Brown"])).toBe("quick");
    expect(findFirstSignificantWord(["A", "New", "Approach"])).toBe("new");
    expect(findFirstSignificantWord(["An", "In", "On", "Introduction"])).toBe("introduction");
  });

  it("returns first significant word, cleaned", () => {
    expect(findFirstSignificantWord(["Hello!", "World"])).toBe("hello");
  });

  it("returns empty string when no significant words found", () => {
    expect(findFirstSignificantWord(["a", "an", "in"])).toBe("");
    expect(findFirstSignificantWord([])).toBe("");
  });

  it("skips words with 2 or fewer characters", () => {
    expect(findFirstSignificantWord(["ab", "cd", "testing"])).toBe("testing");
  });
});

describe("extractFirstTitleWord", () => {
  it("extracts first significant word from title", () => {
    const bibtex = `@article{key,
  title = {The Quick Brown Fox},
  year = {2023},
}`;
    expect(extractFirstTitleWord(bibtex)).toBe("quick");
  });

  it("handles LaTeX commands in title", () => {
    const bibtex = `@article{key,
  title = {\\textbf{Performance} Analysis},
  year = {2023},
}`;
    expect(extractFirstTitleWord(bibtex)).toBe("performance");
  });

  it("returns empty string when no title field", () => {
    const bibtex = `@article{key,
  author = {Smith},
  year = {2023},
}`;
    expect(extractFirstTitleWord(bibtex)).toBe("");
  });

  it("handles nested braces in title", () => {
    const bibtex = `@article{key,
  title = {A {Novel} Approach to Testing},
  year = {2023},
}`;
    expect(extractFirstTitleWord(bibtex)).toBe("novel");
  });

  it("handles empty title field", () => {
    const bibtex = `@article{key,
  title = {},
  year = {2023},
}`;
    expect(extractFirstTitleWord(bibtex)).toBe("");
  });

  it("matches title field case-insensitively", () => {
    const bibtex = `@article{key,
  Title = {Performance Analysis},
  year = {2023},
}`;
    expect(extractFirstTitleWord(bibtex)).toBe("performance");
  });
});

describe("buildCitationKey", () => {
  it("builds key with default fields (author, year, venue)", () => {
    const key = buildCitationKey(
      ["author", "year", "venue"],
      "Smith", "2023", "tse", "testing",
      false, false
    );
    expect(key).toBe("smith2023tse");
  });

  it("capitalizes author when option is set", () => {
    const key = buildCitationKey(
      ["author", "year", "venue"],
      "smith", "2023", "tse", "testing",
      true, false
    );
    expect(key).toBe("Smith2023tse");
  });

  it("uppercases venue when option is set", () => {
    const key = buildCitationKey(
      ["author", "year", "venue"],
      "smith", "2023", "tse", "testing",
      false, true
    );
    expect(key).toBe("smith2023TSE");
  });

  it("includes separators", () => {
    const key = buildCitationKey(
      ["author", "dash", "year", "underscore", "venue"],
      "smith", "2023", "tse", "testing",
      false, false
    );
    expect(key).toBe("smith-2023_tse");
  });

  it("includes title field", () => {
    const key = buildCitationKey(
      ["author", "year", "title"],
      "smith", "2023", "tse", "testing",
      false, false
    );
    expect(key).toBe("smith2023testing");
  });

  it("ignores unknown field names", () => {
    const key = buildCitationKey(
      ["author", "unknown", "year"],
      "smith", "2023", "tse", "testing",
      false, false
    );
    expect(key).toBe("smith2023");
  });

  it("returns empty string for empty fields array", () => {
    const key = buildCitationKey(
      [],
      "smith", "2023", "tse", "testing",
      false, false
    );
    expect(key).toBe("");
  });

  it("applies both authorCapitalize and venueUppercase together", () => {
    const key = buildCitationKey(
      ["author", "dash", "venue", "year"],
      "smith", "2023", "tse", "testing",
      true, true
    );
    expect(key).toBe("Smith-TSE2023");
  });

  it("handles empty author string", () => {
    const key = buildCitationKey(
      ["author", "year"],
      "", "2023", "tse", "testing",
      true, false
    );
    expect(key).toBe("2023");
  });
});

describe("cleanBibtexMetadata", () => {
  it("removes timestamp, biburl, and bibsource fields", () => {
    const bibtex = `@article{key,
  author = {Smith},
  title = {Test},
  timestamp = {Mon, 01 Jan 2023 00:00:00 +0100},
  biburl = {https://dblp.org/rec/journals/tse/Smith23.bib},
  bibsource = {dblp computer science bibliography, https://dblp.org}
}`;
    const result = cleanBibtexMetadata(bibtex);
    expect(result).not.toContain("timestamp");
    expect(result).not.toContain("biburl");
    expect(result).not.toContain("bibsource");
    expect(result).toContain("author");
    expect(result).toContain("title");
  });

  it("preserves other fields intact", () => {
    const bibtex = `@article{key,
  author = {Smith},
  year = {2023},
  timestamp = {Mon, 01 Jan 2023 00:00:00 +0100},
  biburl = {https://dblp.org/rec/key.bib},
  bibsource = {dblp}
}`;
    const result = cleanBibtexMetadata(bibtex);
    expect(result).toContain("author = {Smith}");
    expect(result).toContain("year = {2023}");
  });

  it("does not corrupt BibTeX without metadata fields", () => {
    const bibtex = `@article{key,
  author = {Smith},
  title = {Test},
  year = {2023}
}`;
    const result = cleanBibtexMetadata(bibtex);
    expect(result).toContain("author = {Smith}");
    expect(result).toContain("title = {Test}");
    expect(result).toContain("year = {2023}");
  });

  it("produces no double blank lines", () => {
    const bibtex = `@article{key,
  author = {Smith},
  timestamp = {Mon, 01 Jan 2023 00:00:00 +0100},
  biburl = {https://dblp.org/rec/key.bib},
  bibsource = {dblp}
}`;
    const result = cleanBibtexMetadata(bibtex);
    expect(result).not.toMatch(/\n\s*\n/);
  });
});

describe("removeUrlFromBibtex", () => {
  it("removes URL field from BibTeX", () => {
    const bibtex = `@article{key,
  author = {Smith},
  url = {https://example.com/paper},
  year = {2023}
}`;
    const result = removeUrlFromBibtex(bibtex);
    expect(result).not.toContain("url");
    expect(result).toContain("author");
    expect(result).toContain("year");
  });

  it("handles BibTeX without URL field", () => {
    const bibtex = `@article{key,
  author = {Smith},
  year = {2023}
}`;
    const result = removeUrlFromBibtex(bibtex);
    expect(result).toContain("author");
    expect(result).toContain("year");
  });

  it("removes URL as last field with trailing comma", () => {
    const bibtex = `@article{key,
  author = {Smith},
  url = {https://example.com/paper},
}`;
    const result = removeUrlFromBibtex(bibtex);
    expect(result).not.toContain("url");
    expect(result).toContain("author");
  });
});
