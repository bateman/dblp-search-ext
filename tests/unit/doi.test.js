import { describe, it, expect } from "vitest";
import { isValidDOI, removeDOIUrlPrefix, extractDOI } from "../../js/utils/doi.js";

describe("isValidDOI", () => {
  it("accepts standard DOIs", () => {
    expect(isValidDOI("10.1000/xyz123")).toBe(true);
    expect(isValidDOI("10.1234/some-article_v1")).toBe(true);
    expect(isValidDOI("10.12345/TEST")).toBe(true);
  });

  it("accepts DOIs with special characters", () => {
    expect(isValidDOI("10.1000/something(1)")).toBe(true);
    expect(isValidDOI("10.1000/path/subpath")).toBe(true);
    expect(isValidDOI("10.1000/a;b:c")).toBe(true);
  });

  it("accepts Wiley legacy DOIs (10.1002 prefix)", () => {
    expect(isValidDOI("10.1002/something-special")).toBe(true);
    expect(isValidDOI("10.1002/(SICI)1097-0258(19980815)17:15<1661::AID-SIM968>3.0.CO;2-2")).toBe(true);
  });

  it("rejects invalid DOIs", () => {
    expect(isValidDOI("not-a-doi")).toBe(false);
    expect(isValidDOI("")).toBe(false);
    expect(isValidDOI("11.1000/xyz")).toBe(false);
    expect(isValidDOI("10.12/xyz")).toBe(false); // prefix too short
  });
});

describe("removeDOIUrlPrefix", () => {
  it("removes https://doi.org/ prefix", () => {
    expect(removeDOIUrlPrefix("https://doi.org/10.1000/xyz")).toBe("10.1000/xyz");
  });

  it("removes http://doi.org/ prefix", () => {
    expect(removeDOIUrlPrefix("http://doi.org/10.1000/xyz")).toBe("10.1000/xyz");
  });

  it("removes https://dx.doi.org/ prefix", () => {
    expect(removeDOIUrlPrefix("https://dx.doi.org/10.1000/xyz")).toBe("10.1000/xyz");
  });

  it("removes http://dx.doi.org/ prefix", () => {
    expect(removeDOIUrlPrefix("http://dx.doi.org/10.1000/xyz")).toBe("10.1000/xyz");
  });

  it("removes dx.doi.org/ prefix (no protocol)", () => {
    expect(removeDOIUrlPrefix("dx.doi.org/10.1000/xyz")).toBe("10.1000/xyz");
  });

  it("removes doi.org/ prefix (no protocol)", () => {
    expect(removeDOIUrlPrefix("doi.org/10.1000/xyz")).toBe("10.1000/xyz");
  });

  it("is case-insensitive for prefix matching", () => {
    expect(removeDOIUrlPrefix("HTTPS://DOI.ORG/10.1000/xyz")).toBe("10.1000/xyz");
  });

  it("preserves text without DOI prefix", () => {
    expect(removeDOIUrlPrefix("10.1000/xyz")).toBe("10.1000/xyz");
    expect(removeDOIUrlPrefix("some random text")).toBe("some random text");
  });
});

describe("extractDOI", () => {
  it("extracts a plain DOI", () => {
    expect(extractDOI("10.1000/xyz123")).toBe("10.1000/xyz123");
  });

  it("extracts DOI from URL with prefix", () => {
    expect(extractDOI("https://doi.org/10.1000/xyz123")).toBe("10.1000/xyz123");
    expect(extractDOI("http://dx.doi.org/10.1000/xyz123")).toBe("10.1000/xyz123");
  });

  it("extracts DOI with doi: prefix", () => {
    expect(extractDOI("doi: 10.1000/xyz123")).toBe("10.1000/xyz123");
    expect(extractDOI("DOI:10.1000/xyz123")).toBe("10.1000/xyz123");
  });

  it("strips trailing punctuation", () => {
    expect(extractDOI("10.1000/xyz123.")).toBe("10.1000/xyz123");
    expect(extractDOI("10.1000/xyz123,")).toBe("10.1000/xyz123");
    expect(extractDOI("10.1000/xyz123!")).toBe("10.1000/xyz123");
  });

  it("trims whitespace", () => {
    expect(extractDOI("  10.1000/xyz123  ")).toBe("10.1000/xyz123");
  });

  it("returns null for empty or null input", () => {
    expect(extractDOI("")).toBe(null);
    expect(extractDOI(null)).toBe(null);
    expect(extractDOI(undefined)).toBe(null);
  });

  it("returns null for invalid DOI text", () => {
    expect(extractDOI("not a doi")).toBe(null);
    expect(extractDOI("https://example.com")).toBe(null);
  });

  it("handles URL query parameters", () => {
    expect(extractDOI("10.1000/xyz123?ref=abc&type=pdf")).toBe("10.1000/xyz123");
  });
});
