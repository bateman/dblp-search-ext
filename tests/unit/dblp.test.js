import { describe, it, expect } from "vitest";
import {
  DBLP_CHALLENGE_MESSAGE,
  isBotChallenge,
  describeHttpError,
  assertDblpData,
} from "../../js/utils/dblp.js";

/**
 * Builds a minimal fetch Response stand-in.
 * @param {Object} init - ok/status/statusText and a plain headers object
 * @returns {Object} Response-like object
 */
function fakeResponse({ ok = true, status = 200, statusText = "", headers = {} }) {
  const lower = Object.fromEntries(
    Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v])
  );
  return {
    ok,
    status,
    statusText,
    headers: { get: (name) => lower[name.toLowerCase()] ?? null },
  };
}

describe("dblp response helpers", () => {
  describe("isBotChallenge", () => {
    it("detects the HTML anti-bot page", () => {
      const r = fakeResponse({ headers: { "Content-Type": "text/html; charset=utf-8" } });
      expect(isBotChallenge(r)).toBe(true);
    });

    it("accepts JSON and BibTeX responses", () => {
      expect(isBotChallenge(fakeResponse({ headers: { "Content-Type": "application/json" } }))).toBe(false);
      expect(isBotChallenge(fakeResponse({ headers: { "Content-Type": "text/x-bibtex; charset=utf-8" } }))).toBe(false);
    });

    it("returns false when headers are missing", () => {
      expect(isBotChallenge({ ok: true })).toBe(false);
      expect(isBotChallenge(fakeResponse({}))).toBe(false);
    });
  });

  describe("describeHttpError", () => {
    it("explains rate limiting with Retry-After seconds", () => {
      const r = fakeResponse({ ok: false, status: 429, headers: { "Retry-After": "120" } });
      expect(describeHttpError(r)).toBe(
        "dblp is rate-limiting requests (HTTP 429). Wait 120 seconds before trying again."
      );
    });

    it("falls back to a generic wait when Retry-After is absent or a date", () => {
      const r = fakeResponse({
        ok: false,
        status: 429,
        headers: { "Retry-After": "Wed, 21 Oct 2026 07:28:00 GMT" },
      });
      expect(describeHttpError(r)).toContain("Wait a minute");
      expect(describeHttpError(fakeResponse({ ok: false, status: 429 }))).toContain("Wait a minute");
    });

    it("includes code and status text for other errors", () => {
      const r = fakeResponse({ ok: false, status: 503, statusText: "Service Unavailable" });
      expect(describeHttpError(r)).toBe(
        "The dblp API returned an error (HTTP 503 Service Unavailable)."
      );
    });

    it("includes the code alone when status text is empty", () => {
      expect(describeHttpError(fakeResponse({ ok: false, status: 500 }))).toBe(
        "The dblp API returned an error (HTTP 500)."
      );
    });
  });

  describe("assertDblpData", () => {
    it("passes through data responses", () => {
      const r = fakeResponse({ headers: { "Content-Type": "application/json" } });
      expect(() => assertDblpData(r)).not.toThrow();
    });

    it("throws an HttpError with the challenge message on HTML pages", () => {
      const r = fakeResponse({ headers: { "Content-Type": "text/html" } });
      expect(() => assertDblpData(r)).toThrow(DBLP_CHALLENGE_MESSAGE);
      try {
        assertDblpData(r);
      } catch (err) {
        expect(err.name).toBe("HttpError");
      }
    });

    it("throws an HttpError on non-OK responses", () => {
      const r = fakeResponse({ ok: false, status: 429 });
      expect(() => assertDblpData(r)).toThrow(/HTTP 429/);
    });
  });
});
