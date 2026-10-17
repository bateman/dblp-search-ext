import { describe, it, expect } from "vitest";
import { PublicationView } from "../../js/view/view.js";

describe("PublicationView", () => {
  const view = new PublicationView();

  describe("render", () => {
    it("builds the response message from a search result", () => {
      const publications = [{ title: "Test" }];
      const message = view.render({
        status: "OK",
        errorMessage: "",
        publications,
        totalHits: 42,
        sentHits: 30,
        excludedCount: 2,
        currentOffset: 30,
      });

      expect(message).toEqual({
        script: "view.js",
        type: "RESPONSE_SEARCH_PUBLICATIONS",
        responseStatus: "OK",
        totalHits: 42,
        sentHits: 30,
        excludedCount: 2,
        errorMessage: "",
        publications,
        currentOffset: 30,
      });
    });

    it("keeps the error status and message of a failed search", () => {
      const message = view.render({
        status: "Request Timeout",
        errorMessage: "Request timeout: the dblp API did not respond in time.",
        publications: [],
        totalHits: 0,
        sentHits: 0,
        excludedCount: 0,
        currentOffset: 0,
      });

      expect(message.responseStatus).toBe("Request Timeout");
      expect(message.errorMessage).toBe("Request timeout: the dblp API did not respond in time.");
    });

    it("fills safe defaults for missing or non-numeric values", () => {
      const message = view.render({ totalHits: "12" });

      expect(message.responseStatus).toBe("OK");
      expect(message.totalHits).toBe(0);
      expect(message.sentHits).toBe(0);
      expect(message.excludedCount).toBe(0);
      expect(message.currentOffset).toBe(0);
      expect(message.errorMessage).toBe("");
      expect(message.publications).toEqual([]);
    });
  });
});
