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
    const readText = (response) => response.text();

    beforeEach(() => {
      vi.useFakeTimers();
      resetRequestThrottle();
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve("@article{x}"),
      });
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("fetches the dblp URL with the app parameter and returns the read body", async () => {
      await expect(dblpFetch("https://dblp.org/x.bib", readText)).resolves.toBe("@article{x}");
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "https://dblp.org/x.bib?app=dblpSearch_unknown",
        expect.objectContaining({ signal: expect.any(AbortSignal) })
      );
    });

    it.each([
      "https://evil.example/rec/x.bib",
      "https://dblp.org.evil.example/rec/x.bib",
      "https://dblp.org@evil.example/rec/x.bib",
      "http://dblp.org/rec/x.bib",
      "https://dblp.org:8443/rec/x.bib",
      "javascript:alert(1)",
      "not a url",
      "",
    ])("never fetches a URL outside https://dblp.org: %j", async (url) => {
      await expect(dblpFetch(url, readText)).rejects.toThrow("outside https://dblp.org");
      expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    it("spaces consecutive requests at least one second apart", async () => {
      const first = dblpFetch("https://dblp.org/a.bib", readText);
      const second = dblpFetch("https://dblp.org/b.bib", readText);
      await first;
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(999);
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(1);
      await second;
      expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    });

    it("does not delay a request after a quiet period", async () => {
      await dblpFetch("https://dblp.org/a.bib", readText);
      await vi.advanceTimersByTimeAsync(5000);
      await dblpFetch("https://dblp.org/b.bib", readText);
      expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    });

    it("starts the timeout only after the request leaves the queue", async () => {
      const signals = [];
      globalThis.fetch = vi.fn((url, { signal }) => {
        signals.push(signal);
        return new Promise(() => {}); // dblp never answers
      });
      dblpFetch("https://dblp.org/a.bib", readText).catch(() => {});
      dblpFetch("https://dblp.org/b.bib", readText).catch(() => {});
      dblpFetch("https://dblp.org/c.bib", readText).catch(() => {});

      // The third request waits 2 s in the queue, then gets its full 10 s
      await vi.advanceTimersByTimeAsync(2000);
      expect(signals).toHaveLength(3);
      await vi.advanceTimersByTimeAsync(9999);
      expect(signals[2].aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect(signals[2].aborted).toBe(true);
    });

    it("aborts with an AbortError when dblp does not answer in time", async () => {
      globalThis.fetch = vi.fn(
        (url, { signal }) =>
          new Promise((resolve, reject) => {
            signal.addEventListener("abort", () => {
              const err = new Error("Aborted");
              err.name = "AbortError";
              reject(err);
            });
          })
      );
      const pending = dblpFetch("https://dblp.org/a.bib", readText);
      const assertion = expect(pending).rejects.toMatchObject({ name: "AbortError" });
      await vi.advanceTimersByTimeAsync(10000);
      await assertion;
    });

    it("clears the timeout when the request fails", async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
      await expect(dblpFetch("https://dblp.org/a.bib", readText)).rejects.toThrow(
        "Failed to fetch"
      );
      expect(vi.getTimerCount()).toBe(0);
    });

    it("clears the timeout when reading the response fails", async () => {
      const failingRead = () => {
        throw new Error("bad body");
      };
      await expect(dblpFetch("https://dblp.org/a.bib", failingRead)).rejects.toThrow("bad body");
      expect(vi.getTimerCount()).toBe(0);
    });
  });
});
