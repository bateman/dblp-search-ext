/**
 * Checks on manifest.json, which serves every browser: Chrome, Edge, and
 * Safari read `background.service_worker`, Firefox reads `background.scripts`.
 * Nothing at runtime would notice the two drifting apart until a user on the
 * other browser reported a dead background script.
 */
import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";

/**
 * Reads and parses a JSON file from the repository root.
 * @param {string} name - File name relative to the repository root
 * @returns {Object} Parsed JSON
 */
function readRootJson(name) {
  return JSON.parse(
    readFileSync(new URL(`../../${name}`, import.meta.url), "utf8")
  );
}

const manifest = readRootJson("manifest.json");
const pkg = readRootJson("package.json");

describe("manifest.json", () => {
  it("points both background keys at the same module script", () => {
    const background = manifest.background;
    expect(typeof background.service_worker).toBe("string");
    expect(background.scripts).toEqual([background.service_worker]);
    expect(background.type).toBe("module");
  });

  it("asks Safari to run the background as a service worker", () => {
    // With both keys present Safari would otherwise use background.scripts
    expect(manifest.background.preferred_environment).toEqual(["service_worker"]);
  });

  it("requires a Chromium version that accepts background.scripts", () => {
    // Chromium before 121 rejects an MV3 manifest that has background.scripts
    const major = Number.parseInt(manifest.minimum_chrome_version, 10);
    expect(major).toBeGreaterThanOrEqual(121);
  });

  it("declares the Firefox add-on ID and minimum version", () => {
    const gecko = manifest.browser_specific_settings.gecko;
    expect(gecko.id).toBe("dblpSearch@fcalefato.dev");
    // Firefox supports background.preferred_environment from version 136
    const major = Number.parseInt(gecko.strict_min_version, 10);
    expect(major).toBeGreaterThanOrEqual(136);
  });

  it("has the same version as package.json", () => {
    expect(manifest.version).toBe(pkg.version);
  });
});
