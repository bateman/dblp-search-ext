/**
 * @file zotero.js
 * @description Utilities for saving BibTeX entries to the Zotero desktop app
 * through its local connector HTTP server (127.0.0.1:23119).
 */

/**
 * Match pattern used to request the optional host permission for the local
 * Zotero connector server. Match patterns cannot include a port, so this
 * covers the loopback address in general; the extension only ever contacts
 * port 23119.
 * @type {string}
 */
export const ZOTERO_ORIGIN_PATTERN = "http://127.0.0.1/*";

/**
 * URL of the Zotero connector import endpoint. Zotero listens on the fixed
 * port 23119 and runs its import translators (BibTeX is auto-detected) on
 * the request body, saving the items to the currently selected collection.
 * @type {string}
 */
export const ZOTERO_IMPORT_URL = "http://127.0.0.1:23119/connector/import";

/**
 * URL of the Zotero connector endpoint that returns the current save target
 * and the full list of editable libraries and collections (as `targets`,
 * each with a treeViewID `id` like "L1"/"C23", a `name`, and a nesting
 * `level`).
 * @type {string}
 */
export const ZOTERO_SELECTED_COLLECTION_URL =
  "http://127.0.0.1:23119/connector/getSelectedCollection";

/**
 * URL of the Zotero connector endpoint that retargets a save session:
 * POSTing {sessionID, target} moves the items saved under that session to
 * the given library or collection (cross-library moves included).
 * @type {string}
 */
export const ZOTERO_UPDATE_SESSION_URL =
  "http://127.0.0.1:23119/connector/updateSession";

/**
 * Alphanumeric alphabet used for Zotero connector session IDs.
 * @type {string}
 */
const SESSION_ID_ALPHABET =
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

/**
 * Length of a Zotero connector session ID (matches Zotero's own random IDs).
 * @type {number}
 */
const SESSION_ID_LENGTH = 8;

/**
 * Generates a random alphanumeric session ID for the Zotero connector.
 * Zotero keys save sessions by this ID and rejects duplicates, so every
 * import request must send a fresh one.
 * @returns {string} An 8-character alphanumeric session ID
 */
export function generateZoteroSessionId() {
  const bytes = new Uint8Array(SESSION_ID_LENGTH);
  globalThis.crypto.getRandomValues(bytes);
  let id = "";
  for (const byte of bytes) {
    id += SESSION_ID_ALPHABET.charAt(byte % SESSION_ID_ALPHABET.length);
  }
  return id;
}

/**
 * Builds the Zotero connector import URL for a given save session ID.
 * @param {string} sessionId - Session ID generated for this import request
 * @returns {string} The full import URL including the session parameter
 */
export function buildZoteroImportUrl(sessionId) {
  return ZOTERO_IMPORT_URL + "?session=" + encodeURIComponent(sessionId);
}

/**
 * Maps the HTTP status of a Zotero connector import response to an outcome
 * object with a user-facing message. The endpoint returns 201 when the items
 * were saved, 400 when no import translator recognized the data, and 500
 * when the target library is not editable or an internal error occurred.
 * @param {number} status - HTTP status code of the import response
 * @returns {{ok: boolean, message: string}} Outcome with display message
 */
export function interpretZoteroSaveResponse(status) {
  if (status === 201 || status === 200) {
    return { ok: true, message: "Saved to Zotero" };
  }
  if (status === 400) {
    return {
      ok: false,
      message: "Error: Zotero did not recognize the BibTeX entry",
    };
  }
  if (status === 500) {
    return {
      ok: false,
      message: "Error: Zotero could not save the entry (is the library editable?)",
    };
  }
  return {
    ok: false,
    message: `Error: unexpected response from Zotero (HTTP ${status})`,
  };
}

/**
 * Validates a Zotero save-target treeViewID: "L<n>" for a library or
 * "C<n>" for a collection (whitelist validation; anything else is
 * rejected, including the empty string that means "currently selected
 * in Zotero").
 * @param {*} id - Value to validate
 * @returns {boolean} True when the value is a well-formed treeViewID
 */
export function isValidZoteroTargetId(id) {
  return typeof id === "string" && /^[LC]\d+$/.test(id);
}

/**
 * Checks that a value is a non-empty string.
 * @param {*} value - Value to check
 * @returns {boolean} True for non-empty strings
 */
function isNonEmptyString(value) {
  return typeof value === "string" && value !== "";
}

/**
 * Describes the destination reported by the getSelectedCollection endpoint
 * as "Library" or "Library › Collection". Returns an empty string when the
 * destination is unknown or not editable (Zotero then falls back to My
 * Library on save, so no name is better than a wrong one).
 * @param {Object} info - Parsed getSelectedCollection response
 * @returns {string} Human-readable destination, or "" when unknown
 */
export function describeZoteroDestination(info) {
  if (!info || info.editable !== true || !isNonEmptyString(info.libraryName)) {
    return "";
  }
  const hasCollection = info.id !== null && info.id !== undefined;
  if (hasCollection && isNonEmptyString(info.name)) {
    return info.libraryName + " › " + info.name;
  }
  return info.libraryName;
}

/**
 * Maps the HTTP status of an updateSession (retarget) response to an outcome
 * object. The entry is already saved at this point, so a failure only means
 * it stayed in the collection currently selected in Zotero.
 * @param {number} status - HTTP status code of the updateSession response
 * @param {string} targetLabel - Display name of the configured destination
 * @returns {{ok: boolean, message: string}} Outcome with display message
 */
export function interpretZoteroRetargetResponse(status, targetLabel) {
  if (status === 200) {
    return { ok: true, message: "Saved to Zotero › " + targetLabel };
  }
  return {
    ok: false,
    message:
      "Saved to Zotero, but the entry could not be moved to '" +
      targetLabel +
      "' — it stayed in the collection selected in Zotero. Check the destination in Options.",
  };
}

/**
 * Outcome for a retarget request that timed out: unlike a definite 400, the
 * move may still have completed in Zotero, so the message must not claim the
 * entry stayed put.
 * @param {string} targetLabel - Display name of the configured destination
 * @returns {{ok: boolean, message: string}} Hedged outcome
 */
export function retargetTimeoutOutcome(targetLabel) {
  return {
    ok: false,
    message:
      "Saved to Zotero, but the move to '" +
      targetLabel +
      "' was not confirmed in time — check in Zotero where the entry ended up.",
  };
}

/**
 * Annotates the getSelectedCollection `targets` list with the full path of
 * each entry ("Library › Collection › Subcollection"). Targets arrive in
 * depth-first order with a nesting `level` (0 for libraries), so the path is
 * reconstructed with a name stack. Malformed entries are skipped.
 * @param {Object[]} targets - Targets from the getSelectedCollection response
 * @returns {{id: string, name: string, level: number, path: string}[]}
 *          Valid targets with their display paths
 */
/**
 * Sanitizes a target's nesting level. Only small non-negative integers are
 * usable: a fractional, huge, or Infinity level would make the path-stack
 * length assignment throw RangeError.
 * @param {*} level - Raw level value from the connector response
 * @returns {number} The level, or 0 when unusable
 */
function sanitizeTargetLevel(level) {
  return Number.isInteger(level) && level >= 0 && level <= 32 ? level : 0;
}

export function buildZoteroTargetPaths(targets) {
  const stack = [];
  const result = [];
  for (const target of targets || []) {
    if (!target || !isValidZoteroTargetId(target.id) || typeof target.name !== "string") {
      continue;
    }
    const level = sanitizeTargetLevel(target.level);
    // Truncate to the parent depth, then append (avoids a computed-index
    // write, which SAST tooling flags as an object-injection sink)
    stack.length = level;
    stack.push(target.name);
    const path = stack.filter(Boolean).join(" › ");
    result.push({ id: target.id, name: target.name, level: level, path: path });
  }
  return result;
}

// =====================================
// Connector network layer
// =====================================
// Shared by the popup, the options page, and the background service worker.
// The actual save runs in the background service worker so it survives the
// popup closing mid-flight (Chrome closes action popups on any focus loss).

/**
 * Milliseconds before a connector request is aborted.
 * @type {number}
 */
const ZOTERO_FETCH_TIMEOUT_MS = 10000;

/**
 * Resolves a connector endpoint name to its fixed loopback URL. Endpoint
 * names are whitelisted here and the session ID is format-validated, so no
 * caller-supplied URL (or unvetted string) can ever reach fetch().
 * @param {string} endpoint - "import", "getSelectedCollection", or "updateSession"
 * @param {string|null} sessionId - Save-session ID, required for "import"
 * @returns {string} The endpoint URL
 * @throws {Error} On an unknown endpoint name or malformed session ID
 */
function resolveZoteroEndpointUrl(endpoint, sessionId) {
  switch (endpoint) {
    case "import":
      if (!/^[a-zA-Z0-9]{8}$/.test(sessionId || "")) {
        throw new Error("Invalid Zotero session ID");
      }
      return buildZoteroImportUrl(sessionId);
    case "getSelectedCollection":
      return ZOTERO_SELECTED_COLLECTION_URL;
    case "updateSession":
      return ZOTERO_UPDATE_SESSION_URL;
    default:
      throw new Error(`Unknown Zotero connector endpoint: ${endpoint}`);
  }
}

/**
 * Fetches a Zotero connector endpoint — addressed by whitelisted name, never
 * by raw URL — with the mandatory opt-in header and a timeout. Zotero
 * silently drops browser-originated requests that do not carry the
 * Zotero-Allowed-Request header.
 * @param {string} endpoint - Endpoint name, see resolveZoteroEndpointUrl()
 * @param {string|null} sessionId - Save-session ID for "import", else null
 * @param {Object} options - fetch() options (headers are merged)
 * @returns {Promise<Response>} The fetch response
 * @throws {Error} On an unknown endpoint name or malformed session ID
 */
export function zoteroFetch(endpoint, sessionId, options) {
  const url = resolveZoteroEndpointUrl(endpoint, sessionId);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ZOTERO_FETCH_TIMEOUT_MS);
  options.signal = controller.signal;
  options.headers = Object.assign(
    { "Zotero-Allowed-Request": "1" },
    options.headers || {}
  );
  return fetch(url, options).finally(() => clearTimeout(timeoutId));
}

/**
 * Requests the optional host permission needed to reach the local Zotero
 * connector server. Safe to call when already granted (no prompt is shown).
 * Must be invoked synchronously from a user input handler, so callers run
 * it before any other async work.
 * @param {Object} browserApi - The browser/chrome API namespace object
 * @returns {Promise<string>} "granted" (held or accepted), "denied" (the
 *          user declined the prompt), or "failed" (the prompt could not be
 *          shown at all — the request call rejected)
 */
export function requestZoteroPermission(browserApi) {
  let requestPromise;
  try {
    requestPromise = browserApi.permissions.request({
      origins: [ZOTERO_ORIGIN_PATTERN],
    });
  } catch (err) {
    // Some engines reject invalid requests by throwing synchronously
    console.error("Zotero permission request failed: ", err);
    return Promise.resolve("failed");
  }
  return Promise.resolve(requestPromise).then(
    function (granted) {
      return granted ? "granted" : "denied";
    },
    function (err) {
      console.error("Zotero permission request failed: ", err);
      return "failed";
    }
  );
}

/**
 * Checks whether the runtime-registered manifest declares the Zotero origin
 * as an optional permission. When it does not, the browser is still running
 * a manifest from before the feature (an unpacked extension that was
 * updated on disk but not reloaded), and every permission request will
 * fail until the extension is reloaded.
 * @param {Object} manifest - Result of browserApi.runtime.getManifest()
 * @returns {boolean} True when the origin is declared
 */
export function isZoteroPermissionDeclared(manifest) {
  const optionalHosts = (manifest && manifest.optional_host_permissions) || [];
  const optionalPerms = (manifest && manifest.optional_permissions) || [];
  return (
    optionalHosts.includes(ZOTERO_ORIGIN_PATTERN) ||
    optionalPerms.includes(ZOTERO_ORIGIN_PATTERN)
  );
}

/**
 * Builds the user-facing message for a permission request that did not end
 * in "granted", pinpointing the cause where possible.
 * @param {string} permission - "denied" or "failed", from requestZoteroPermission()
 * @param {Object} manifest - Result of browserApi.runtime.getManifest()
 * @returns {string} Actionable error message
 */
export function zoteroPermissionFailureMessage(permission, manifest) {
  if (permission === "denied") {
    return "Error: permission to connect to Zotero was declined";
  }
  if (!isZoteroPermissionDeclared(manifest)) {
    return (
      "Error: the loaded extension is missing the Zotero permission — " +
      "reload the extension in chrome://extensions (or about:debugging in " +
      "Firefox), then try again"
    );
  }
  return (
    "Error: the permission prompt could not be shown here — open the " +
    "extension Options and click 'Load from Zotero' to grant access, then " +
    "try again"
  );
}

/**
 * Maps a network-level Zotero failure (unreachable or timed out) to an
 * outcome object.
 * @param {Error} err - The fetch error
 * @returns {{ok: boolean, message: string}} Failure outcome
 */
function zoteroUnreachableOutcome(err) {
  return {
    ok: false,
    message:
      err.name === "AbortError"
        ? "Error: Zotero did not respond in time"
        : "Error: could not reach Zotero. Is the Zotero desktop app running?",
  };
}

/**
 * Posts a processed BibTeX entry to the local Zotero connector import
 * endpoint. Zotero auto-detects the format and saves the entry to the
 * currently selected collection. Zotero-side failures resolve to an outcome
 * object instead of rejecting.
 * @param {string} bibtex - The BibTeX entry to import
 * @param {string} sessionId - Fresh save-session ID for this import
 * @returns {Promise<{ok: boolean, message: string}>} Import outcome
 */
function postBibtexToZotero(bibtex, sessionId) {
  return zoteroFetch("import", sessionId, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: bibtex,
  })
    .then((response) => interpretZoteroSaveResponse(response.status))
    .catch(zoteroUnreachableOutcome);
}

/**
 * Asks Zotero where a default save lands (the target selected in the Zotero
 * window) so the success message can name it. Best effort: any failure falls
 * back to a plain success message.
 * @returns {Promise<{ok: boolean, message: string}>} Success outcome
 */
function describeCurrentZoteroTarget() {
  return zoteroFetch("getSelectedCollection", null, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  })
    .then((response) => response.json())
    .then((info) => {
      const destination = describeZoteroDestination(info);
      return {
        ok: true,
        message: destination ? "Saved to Zotero › " + destination : "Saved to Zotero",
      };
    })
    .catch(() => ({ ok: true, message: "Saved to Zotero" }));
}

/**
 * Moves the entry saved under the given session to the destination pinned in
 * the extension options, using Zotero's updateSession endpoint.
 * @param {string} sessionId - Session ID used for the import request
 * @param {{target: string, targetName: string}} zoteroOptions - Destination
 * @returns {Promise<{ok: boolean, message: string}>} Retarget outcome
 */
function retargetZoteroSession(sessionId, zoteroOptions) {
  const label = zoteroOptions.targetName || zoteroOptions.target;
  return zoteroFetch("updateSession", null, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionID: sessionId, target: zoteroOptions.target }),
  })
    .then((response) => interpretZoteroRetargetResponse(response.status, label))
    .catch((err) =>
      err.name === "AbortError"
        ? retargetTimeoutOutcome(label)
        : interpretZoteroRetargetResponse(0, label)
    );
}

/**
 * Imports a BibTeX entry into Zotero and resolves its destination: either
 * retargets the save to the pinned destination, or names the collection
 * currently selected in Zotero (fetched in parallel, since it only
 * decorates the success message).
 * @param {string} bibtex - The processed BibTeX entry
 * @param {{target: string, targetName: string}} zoteroOptions - Destination
 * @returns {Promise<{ok: boolean, message: string}>} Overall outcome
 */
export function performZoteroSave(bibtex, zoteroOptions) {
  const sessionId = generateZoteroSessionId();
  if (zoteroOptions.target) {
    return postBibtexToZotero(bibtex, sessionId).then((result) => {
      if (!result.ok) {
        return result;
      }
      return retargetZoteroSession(sessionId, zoteroOptions);
    });
  }
  const describePromise = describeCurrentZoteroTarget();
  return postBibtexToZotero(bibtex, sessionId).then((result) => {
    if (!result.ok) {
      return result;
    }
    return describePromise;
  });
}
