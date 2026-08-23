import { describe, it, expect, vi, afterEach } from "vitest";
import {
  ZOTERO_ORIGIN_PATTERN,
  ZOTERO_IMPORT_URL,
  ZOTERO_SELECTED_COLLECTION_URL,
  ZOTERO_UPDATE_SESSION_URL,
  generateZoteroSessionId,
  buildZoteroImportUrl,
  interpretZoteroSaveResponse,
  interpretZoteroRetargetResponse,
  retargetTimeoutOutcome,
  isValidZoteroTargetId,
  isZoteroPermissionDeclared,
  describeZoteroDestination,
  buildZoteroTargetPaths,
  performZoteroSave,
  requestZoteroPermission,
  zoteroFetch,
  zoteroPermissionFailureMessage,
} from "../../js/utils/zotero.js";

describe("ZOTERO_ORIGIN_PATTERN", () => {
  it("is a loopback match pattern without a port", () => {
    // Match patterns must not carry a port, or Chrome/Firefox reject them
    expect(ZOTERO_ORIGIN_PATTERN).toBe("http://127.0.0.1/*");
  });

  it("covers the import URL host", () => {
    const url = new URL(ZOTERO_IMPORT_URL);
    expect(ZOTERO_ORIGIN_PATTERN).toContain(url.hostname);
  });
});

describe("generateZoteroSessionId", () => {
  it("returns an 8-character string", () => {
    expect(generateZoteroSessionId()).toHaveLength(8);
  });

  it("only contains alphanumeric characters", () => {
    for (let i = 0; i < 20; i++) {
      expect(generateZoteroSessionId()).toMatch(/^[a-zA-Z0-9]{8}$/);
    }
  });

  it("generates distinct IDs across calls", () => {
    // Zotero rejects duplicate session IDs (409), so consecutive saves must
    // get fresh IDs. With 62^8 possibilities, 50 draws must not collide.
    const ids = new Set();
    for (let i = 0; i < 50; i++) {
      ids.add(generateZoteroSessionId());
    }
    expect(ids.size).toBe(50);
  });
});

describe("buildZoteroImportUrl", () => {
  it("appends the session ID to the import endpoint", () => {
    expect(buildZoteroImportUrl("abcDEF12")).toBe(
      "http://127.0.0.1:23119/connector/import?session=abcDEF12"
    );
  });

  it("URL-encodes the session ID", () => {
    expect(buildZoteroImportUrl("a b&c")).toBe(
      "http://127.0.0.1:23119/connector/import?session=a%20b%26c"
    );
  });
});

describe("interpretZoteroSaveResponse", () => {
  it("treats 201 Created as success", () => {
    const result = interpretZoteroSaveResponse(201);
    expect(result.ok).toBe(true);
    expect(result.message).toBe("Saved to Zotero");
  });

  it("treats 200 OK as success", () => {
    expect(interpretZoteroSaveResponse(200).ok).toBe(true);
  });

  it("maps 400 to an unrecognized-entry error", () => {
    const result = interpretZoteroSaveResponse(400);
    expect(result.ok).toBe(false);
    expect(result.message).toContain("did not recognize");
  });

  it("maps 500 to a could-not-save error", () => {
    const result = interpretZoteroSaveResponse(500);
    expect(result.ok).toBe(false);
    expect(result.message).toContain("could not save");
  });

  it("reports the status code for unexpected responses", () => {
    const result = interpretZoteroSaveResponse(409);
    expect(result.ok).toBe(false);
    expect(result.message).toContain("409");
  });
});

describe("connector endpoint URLs", () => {
  it("point at the local connector server", () => {
    expect(ZOTERO_SELECTED_COLLECTION_URL).toBe(
      "http://127.0.0.1:23119/connector/getSelectedCollection"
    );
    expect(ZOTERO_UPDATE_SESSION_URL).toBe(
      "http://127.0.0.1:23119/connector/updateSession"
    );
  });
});

describe("isValidZoteroTargetId", () => {
  it("accepts library and collection treeViewIDs", () => {
    expect(isValidZoteroTargetId("L1")).toBe(true);
    expect(isValidZoteroTargetId("C23")).toBe(true);
    expect(isValidZoteroTargetId("L12345")).toBe(true);
  });

  it("rejects the empty string (means 'currently selected')", () => {
    expect(isValidZoteroTargetId("")).toBe(false);
  });

  it("rejects malformed or non-string values", () => {
    expect(isValidZoteroTargetId("X1")).toBe(false);
    expect(isValidZoteroTargetId("C")).toBe(false);
    expect(isValidZoteroTargetId("C1x")).toBe(false);
    expect(isValidZoteroTargetId("l1")).toBe(false);
    expect(isValidZoteroTargetId(null)).toBe(false);
    expect(isValidZoteroTargetId(23)).toBe(false);
    expect(isValidZoteroTargetId(undefined)).toBe(false);
  });
});

describe("describeZoteroDestination", () => {
  it("names the library when no collection is selected", () => {
    const info = {
      libraryID: 1,
      libraryName: "My Library",
      editable: true,
      id: null,
      name: "My Library",
    };
    expect(describeZoteroDestination(info)).toBe("My Library");
  });

  it("names library and collection when a collection is selected", () => {
    const info = {
      libraryID: 1,
      libraryName: "My Library",
      editable: true,
      id: 23,
      name: "ML Papers",
    };
    expect(describeZoteroDestination(info)).toBe("My Library › ML Papers");
  });

  it("returns empty string for a non-editable destination", () => {
    // Zotero falls back to My Library when the selection is read-only, so
    // naming the read-only selection would be wrong
    const info = {
      libraryName: "Read-only Group",
      editable: false,
      id: null,
      name: "Read-only Group",
    };
    expect(describeZoteroDestination(info)).toBe("");
  });

  it("returns empty string for missing or malformed info", () => {
    expect(describeZoteroDestination(null)).toBe("");
    expect(describeZoteroDestination({})).toBe("");
    expect(describeZoteroDestination({ editable: true })).toBe("");
  });
});

describe("interpretZoteroRetargetResponse", () => {
  it("names the destination on success", () => {
    const result = interpretZoteroRetargetResponse(200, "My Library › ML Papers");
    expect(result.ok).toBe(true);
    expect(result.message).toBe("Saved to Zotero › My Library › ML Papers");
  });

  it("keeps the save but warns when the move fails", () => {
    const result = interpretZoteroRetargetResponse(400, "Old Collection");
    expect(result.ok).toBe(false);
    expect(result.message).toContain("Saved to Zotero");
    expect(result.message).toContain("Old Collection");
    expect(result.message).toContain("Options");
  });
});

describe("buildZoteroTargetPaths", () => {
  const targets = [
    { id: "L1", name: "My Library", level: 0 },
    { id: "C10", name: "Papers", level: 1 },
    { id: "C11", name: "ML", level: 2 },
    { id: "C12", name: "Reviews", level: 1 },
    { id: "L5", name: "Shared Group", level: 0 },
    { id: "C20", name: "Drafts", level: 1 },
  ];

  it("builds full paths from the depth-first target list", () => {
    const result = buildZoteroTargetPaths(targets);
    expect(result.map((t) => t.path)).toEqual([
      "My Library",
      "My Library › Papers",
      "My Library › Papers › ML",
      "My Library › Reviews",
      "Shared Group",
      "Shared Group › Drafts",
    ]);
  });

  it("keeps ids, names, and levels", () => {
    const result = buildZoteroTargetPaths(targets);
    expect(result[2]).toEqual({
      id: "C11",
      name: "ML",
      level: 2,
      path: "My Library › Papers › ML",
    });
  });

  it("skips malformed entries", () => {
    const result = buildZoteroTargetPaths([
      { id: "L1", name: "My Library", level: 0 },
      { id: "bogus", name: "Nope", level: 1 },
      null,
      { id: "C2", level: 1 },
      { id: "C3", name: "Kept", level: 1 },
    ]);
    expect(result.map((t) => t.id)).toEqual(["L1", "C3"]);
  });

  it("defaults a missing level to 0", () => {
    const result = buildZoteroTargetPaths([{ id: "L1", name: "My Library" }]);
    expect(result[0].level).toBe(0);
    expect(result[0].path).toBe("My Library");
  });

  it("returns an empty array for missing input", () => {
    expect(buildZoteroTargetPaths(undefined)).toEqual([]);
    expect(buildZoteroTargetPaths([])).toEqual([]);
  });

  it("treats fractional, huge, or Infinity levels as 0 instead of throwing", () => {
    // A non-integer stack length assignment would throw RangeError
    const result = buildZoteroTargetPaths([
      { id: "L1", name: "A", level: 1.5 },
      { id: "C2", name: "B", level: 2 ** 32 },
      { id: "C3", name: "C", level: Infinity },
      { id: "C4", name: "D", level: -3 },
    ]);
    expect(result.map((t) => t.level)).toEqual([0, 0, 0, 0]);
    expect(result.map((t) => t.path)).toEqual(["A", "B", "C", "D"]);
  });
});

describe("retargetTimeoutOutcome", () => {
  it("hedges instead of claiming the entry stayed put", () => {
    const outcome = retargetTimeoutOutcome("ML Papers");
    expect(outcome.ok).toBe(false);
    expect(outcome.message).toContain("Saved to Zotero");
    expect(outcome.message).toContain("ML Papers");
    expect(outcome.message).toContain("not confirmed");
    expect(outcome.message).not.toContain("stayed");
  });
});

describe("requestZoteroPermission", () => {
  it("resolves 'granted' when the browser grants", async () => {
    const api = { permissions: { request: async () => true } };
    expect(await requestZoteroPermission(api)).toBe("granted");
  });

  it("resolves 'denied' when the user declines the prompt", async () => {
    const api = { permissions: { request: async () => false } };
    expect(await requestZoteroPermission(api)).toBe("denied");
  });

  it("resolves 'failed' when the request call rejects", async () => {
    const api = {
      permissions: {
        request: () => Promise.reject(new Error("must be called during a user gesture")),
      },
    };
    expect(await requestZoteroPermission(api)).toBe("failed");
  });

  it("requests exactly the loopback origin pattern", async () => {
    let requested = null;
    const api = {
      permissions: {
        request: async (arg) => {
          requested = arg;
          return true;
        },
      },
    };
    await requestZoteroPermission(api);
    expect(requested).toEqual({ origins: [ZOTERO_ORIGIN_PATTERN] });
  });
});

describe("zoteroPermissionFailureMessage", () => {
  const declared = { optional_host_permissions: [ZOTERO_ORIGIN_PATTERN] };

  it("reports a plain decline without pointing elsewhere", () => {
    const msg = zoteroPermissionFailureMessage("denied", declared);
    expect(msg).toContain("declined");
    expect(msg).not.toContain("reload");
  });

  it("points at reloading when the registered manifest lacks the permission", () => {
    const msg = zoteroPermissionFailureMessage("failed", { optional_host_permissions: [] });
    expect(msg).toContain("reload the extension");
  });

  it("points at the Options page when the manifest is fine but the prompt failed", () => {
    const msg = zoteroPermissionFailureMessage("failed", declared);
    expect(msg).toContain("Options");
    expect(msg).toContain("Load from Zotero");
  });
});

describe("isZoteroPermissionDeclared", () => {
  it("accepts the origin under optional_host_permissions or optional_permissions", () => {
    expect(
      isZoteroPermissionDeclared({ optional_host_permissions: [ZOTERO_ORIGIN_PATTERN] })
    ).toBe(true);
    expect(
      isZoteroPermissionDeclared({ optional_permissions: [ZOTERO_ORIGIN_PATTERN] })
    ).toBe(true);
  });

  it("rejects manifests without the origin", () => {
    expect(isZoteroPermissionDeclared({})).toBe(false);
    expect(isZoteroPermissionDeclared(null)).toBe(false);
    expect(
      isZoteroPermissionDeclared({ optional_host_permissions: ["https://dblp.org/*"] })
    ).toBe(false);
  });
});

describe("zoteroFetch", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("resolves whitelisted endpoint names to their fixed URLs", async () => {
    const calls = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((url, options) => {
        calls.push({ url, options });
        return Promise.resolve({ status: 200 });
      })
    );
    await zoteroFetch("getSelectedCollection", null, { method: "POST" });
    await zoteroFetch("updateSession", null, { method: "POST" });
    await zoteroFetch("import", "abcDEF12", { method: "POST" });
    expect(calls.map((c) => c.url)).toEqual([
      ZOTERO_SELECTED_COLLECTION_URL,
      ZOTERO_UPDATE_SESSION_URL,
      "http://127.0.0.1:23119/connector/import?session=abcDEF12",
    ]);
    // The mandatory opt-in header is always injected
    expect(calls[0].options.headers["Zotero-Allowed-Request"]).toBe("1");
  });

  it("refuses anything that is not a whitelisted endpoint name", () => {
    expect(() => zoteroFetch("https://evil.example/x", null, {})).toThrow(
      "Unknown Zotero connector endpoint"
    );
    expect(() => zoteroFetch("", null, {})).toThrow(
      "Unknown Zotero connector endpoint"
    );
  });

  it("refuses malformed session IDs for the import endpoint", () => {
    expect(() => zoteroFetch("import", "../../etc", {})).toThrow(
      "Invalid Zotero session ID"
    );
    expect(() => zoteroFetch("import", "a&b=c123", {})).toThrow(
      "Invalid Zotero session ID"
    );
    expect(() => zoteroFetch("import", null, {})).toThrow(
      "Invalid Zotero session ID"
    );
  });
});

describe("performZoteroSave", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function mockFetch(handler) {
    const calls = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((url, options) => {
        calls.push({ url, options });
        return Promise.resolve(handler(url, options));
      })
    );
    return calls;
  }

  it("imports then retargets with the same session when a target is pinned", async () => {
    const calls = mockFetch((url) =>
      url.includes("/connector/import")
        ? { status: 201, json: async () => [] }
        : { status: 200, json: async () => ({}) }
    );
    const outcome = await performZoteroSave("@article{x,}", {
      target: "C11",
      targetName: "My Library › ML",
    });
    expect(outcome).toEqual({ ok: true, message: "Saved to Zotero › My Library › ML" });
    expect(calls).toHaveLength(2);

    const importUrl = new URL(calls[0].url);
    expect(importUrl.pathname).toBe("/connector/import");
    const session = importUrl.searchParams.get("session");
    expect(session).toMatch(/^[a-zA-Z0-9]{8}$/);
    expect(calls[0].options.headers["Zotero-Allowed-Request"]).toBe("1");
    expect(calls[0].options.body).toBe("@article{x,}");

    expect(calls[1].url).toBe(ZOTERO_UPDATE_SESSION_URL);
    expect(JSON.parse(calls[1].options.body)).toEqual({
      sessionID: session,
      target: "C11",
    });
  });

  it("names the currently selected collection when no target is pinned", async () => {
    const calls = mockFetch((url) =>
      url.includes("/connector/import")
        ? { status: 201, json: async () => [] }
        : {
            status: 200,
            json: async () => ({
              libraryName: "My Library",
              editable: true,
              id: 23,
              name: "ML Papers",
            }),
          }
    );
    const outcome = await performZoteroSave("@article{x,}", {
      target: "",
      targetName: "",
    });
    expect(outcome).toEqual({
      ok: true,
      message: "Saved to Zotero › My Library › ML Papers",
    });
    const paths = calls.map((c) => new URL(c.url).pathname).sort();
    expect(paths).toEqual([
      "/connector/getSelectedCollection",
      "/connector/import",
    ]);
  });

  it("does not retarget when the import fails", async () => {
    const calls = mockFetch(() => ({ status: 400, json: async () => ({}) }));
    const outcome = await performZoteroSave("not bibtex", {
      target: "C11",
      targetName: "X",
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.message).toContain("did not recognize");
    expect(calls).toHaveLength(1);
  });

  it("keeps the save but warns when the retarget fails", async () => {
    const outcome = await (function () {
      mockFetch((url) =>
        url.includes("/connector/import")
          ? { status: 201, json: async () => [] }
          : { status: 400, json: async () => ({ error: "COLLECTION_NOT_FOUND" }) }
      );
      return performZoteroSave("@article{x,}", { target: "C99", targetName: "Gone" });
    })();
    expect(outcome.ok).toBe(false);
    expect(outcome.message).toContain("Saved to Zotero");
    expect(outcome.message).toContain("Gone");
  });

  it("reports Zotero as unreachable on network failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new TypeError("Failed to fetch")))
    );
    const outcome = await performZoteroSave("@article{x,}", {
      target: "",
      targetName: "",
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.message).toContain("could not reach Zotero");
  });
});
