import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  DBLP_CHALLENGE_MESSAGE,
  isBotChallenge,
  describeHttpError,
  assertDblpData,
  withAppParam,
  dblpFetch,
  resetRequestThrottle,
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

  describe("withAppParam", () => {
    afterEach(() => {
      delete globalThis.chrome;
    });

    it("appends app=<name>_<version> using the manifest version", () => {
      globalThis.chrome = { runtime: { getManifest: () => ({ version: "3.9.1" }) } };
      expect(withAppParam("https://dblp.org/search/publ/api?q=x&format=json")).toBe(
        "https://dblp.org/search/publ/api?q=x&format=json&app=dblpSearch_3.9.1"
      );
    });

    it("starts the query string when the URL has none", () => {
      globalThis.chrome = { runtime: { getManifest: () => ({ version: "3.9.1" }) } };
      expect(withAppParam("https://dblp.org/rec/conf/esem/CalefatoQLK23.bib")).toBe(
        "https://dblp.org/rec/conf/esem/CalefatoQLK23.bib?app=dblpSearch_3.9.1"
      );
    });

    it("falls back to an unknown version outside an extension", () => {
      expect(withAppParam("https://dblp.org/x.bib?param=1")).toBe(
        "https://dblp.org/x.bib?param=1&app=dblpSearch_unknown"
      );
    });
  });

  describe("dblpFetch", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      resetRequestThrottle();
      globalThis.fetch = vi.fn().mockResolvedValue({ ok: true });
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("adds the app parameter and passes options through", async () => {
      const options = { signal: "s" };
      await dblpFetch("https://dblp.org/x.bib", options);
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "https://dblp.org/x.bib?app=dblpSearch_unknown",
        options
      );
    });

    it("spaces consecutive requests at least one second apart", async () => {
      const first = dblpFetch("https://dblp.org/a.bib");
      const second = dblpFetch("https://dblp.org/b.bib");
      await first;
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(999);
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(1);
      await second;
      expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    });

    it("does not delay a request after a quiet period", async () => {
      await dblpFetch("https://dblp.org/a.bib");
      await vi.advanceTimersByTimeAsync(5000);
      await dblpFetch("https://dblp.org/b.bib");
      expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    });
  });
});
