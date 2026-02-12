import { describe, it, expect } from "vitest";
import {
  isValidURL,
  validateMaxResults,
  validatePopupWidth,
  getNumericValue,
  parseSearchWithDefaults,
} from "../../js/utils/validation.js";

describe("isValidURL", () => {
  it("accepts valid HTTP URLs", () => {
    expect(isValidURL("http://example.com")).toBe(true);
    expect(isValidURL("http://example.com/path?q=test")).toBe(true);
  });

  it("accepts valid HTTPS URLs", () => {
    expect(isValidURL("https://example.com")).toBe(true);
    expect(isValidURL("https://dblp.org/search?q=test")).toBe(true);
  });

  it("rejects javascript: protocol URLs", () => {
    expect(isValidURL("javascript:alert(1)")).toBe(false);
  });

  it("rejects data: URLs", () => {
    expect(isValidURL("data:text/html,<h1>hi</h1>")).toBe(false);
  });

  it("rejects ftp: URLs", () => {
    expect(isValidURL("ftp://example.com")).toBe(false);
  });

  it("rejects null, undefined, and empty strings", () => {
    expect(isValidURL(null)).toBe(false);
    expect(isValidURL(undefined)).toBe(false);
    expect(isValidURL("")).toBe(false);
  });

  it("rejects non-string values", () => {
    expect(isValidURL(123)).toBe(false);
    expect(isValidURL({})).toBe(false);
  });

  it("rejects invalid URL formats", () => {
    expect(isValidURL("not-a-url")).toBe(false);
    expect(isValidURL("://missing-protocol")).toBe(false);
  });
});

describe("validateMaxResults", () => {
  it("accepts valid values within range (1-1000)", () => {
    expect(validateMaxResults("1")).toEqual({ valid: true, value: 1 });
    expect(validateMaxResults("30")).toEqual({ valid: true, value: 30 });
    expect(validateMaxResults("500")).toEqual({ valid: true, value: 500 });
    expect(validateMaxResults("1000")).toEqual({ valid: true, value: 1000 });
  });

  it("rejects values below minimum", () => {
    expect(validateMaxResults("0")).toEqual({ valid: false, value: 30 });
    expect(validateMaxResults("-1")).toEqual({ valid: false, value: 30 });
  });

  it("rejects values above maximum", () => {
    expect(validateMaxResults("1001")).toEqual({ valid: false, value: 30 });
    expect(validateMaxResults("99999")).toEqual({ valid: false, value: 30 });
  });

  it("rejects non-numeric input", () => {
    expect(validateMaxResults("abc")).toEqual({ valid: false, value: 30 });
    expect(validateMaxResults("")).toEqual({ valid: false, value: 30 });
  });

  it("returns default value of 30 when invalid", () => {
    const result = validateMaxResults("invalid");
    expect(result.value).toBe(30);
  });
});

describe("validatePopupWidth", () => {
  it("accepts valid values within range (500-800)", () => {
    expect(validatePopupWidth("500")).toEqual({ valid: true, value: 500 });
    expect(validatePopupWidth("650")).toEqual({ valid: true, value: 650 });
    expect(validatePopupWidth("800")).toEqual({ valid: true, value: 800 });
  });

  it("rejects values below minimum", () => {
    expect(validatePopupWidth("499")).toEqual({ valid: false, value: 800 });
    expect(validatePopupWidth("0")).toEqual({ valid: false, value: 800 });
  });

  it("rejects values above maximum", () => {
    expect(validatePopupWidth("801")).toEqual({ valid: false, value: 800 });
    expect(validatePopupWidth("1000")).toEqual({ valid: false, value: 800 });
  });

  it("rejects non-numeric input", () => {
    expect(validatePopupWidth("abc")).toEqual({ valid: false, value: 800 });
  });

  it("returns default value of 800 when invalid", () => {
    const result = validatePopupWidth("invalid");
    expect(result.value).toBe(800);
  });
});

describe("getNumericValue", () => {
  it("returns the value when it is a number", () => {
    expect(getNumericValue(42, 0)).toBe(42);
    expect(getNumericValue(0, 10)).toBe(0);
    expect(getNumericValue(-5, 0)).toBe(-5);
  });

  it("returns the default when value is not a number", () => {
    expect(getNumericValue("hello", 0)).toBe(0);
    expect(getNumericValue(undefined, 10)).toBe(10);
    expect(getNumericValue(null, 5)).toBe(5);
    expect(getNumericValue(true, 0)).toBe(0);
  });
});

describe("parseSearchWithDefaults", () => {
  it("returns defaults when search is empty", () => {
    const result = parseSearchWithDefaults({});
    expect(result).toEqual({
      status: "",
      totalHits: 0,
      sentHits: 0,
      excludedCount: 0,
      currentOffset: 0,
      publications: [],
      paperTitle: "",
    });
  });

  it("returns defaults when items has empty search", () => {
    const result = parseSearchWithDefaults({ search: {} });
    expect(result).toEqual({
      status: "",
      totalHits: 0,
      sentHits: 0,
      excludedCount: 0,
      currentOffset: 0,
      publications: [],
      paperTitle: "",
    });
  });

  it("parses valid search data", () => {
    const items = {
      search: {
        status: "OK",
        totalHits: 100,
        sentHits: 30,
        excludedCount: 5,
        currentOffset: 30,
        publications: [{ title: "Test" }],
        paperTitle: "search query",
      },
    };
    const result = parseSearchWithDefaults(items);
    expect(result.status).toBe("OK");
    expect(result.totalHits).toBe(100);
    expect(result.sentHits).toBe(30);
    expect(result.excludedCount).toBe(5);
    expect(result.currentOffset).toBe(30);
    expect(result.publications).toEqual([{ title: "Test" }]);
    expect(result.paperTitle).toBe("search query");
  });

  it("handles non-numeric values by applying defaults", () => {
    const items = {
      search: {
        status: "OK",
        totalHits: "not a number",
        sentHits: undefined,
        excludedCount: null,
      },
    };
    const result = parseSearchWithDefaults(items);
    expect(result.totalHits).toBe(0);
    expect(result.sentHits).toBe(0);
    expect(result.excludedCount).toBe(0);
  });
});
