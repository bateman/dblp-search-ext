/**
 * @file dblp.js
 * @description Helpers for requests to dblp.org (API search and BibTeX
 * downloads): identifying the extension, respecting the rate limit, and
 * interpreting responses so failures reach the user with an actionable message.
 */

/**
 * Application name sent to dblp in the `app` query parameter. dblp requires
 * every API request to carry `app=<app-name>_<version>` to let it through its
 * anti-bot firewall; keep the name stable so dblp can trace problems to us.
 * @type {string}
 */
export const DBLP_APP_NAME = "dblpSearch";

/**
 * The only origin dblpFetch() will contact.
 * @type {string}
 */
const DBLP_ORIGIN = "https://dblp.org";

/**
 * Milliseconds before a dblp request (including reading its body) is aborted.
 * @type {number}
 */
const DBLP_FETCH_TIMEOUT_MS = 10000;

/**
 * Minimum delay between two requests to dblp. Its rate limiter punishes
 * clients sending more than one request per second.
 * @type {number}
 */
const MIN_REQUEST_INTERVAL_MS = 1000;

/** @type {number} Earliest time (ms since epoch) the next request may start */
let nextRequestSlot = 0;

/**
 * Returns the extension version from the manifest, for the `app` parameter.
 * @returns {string} The version, or "unknown" outside an extension context
 */
function getExtensionVersion() {
  const api = globalThis.browser || globalThis.chrome;
  if (api && api.runtime && typeof api.runtime.getManifest === "function") {
    return api.runtime.getManifest().version || "unknown";
  }
  return "unknown";
}

/**
 * Appends the `app=<name>_<version>` parameter that dblp requires.
 * @param {string} url - A dblp API or BibTeX URL
 * @returns {string} The URL with the `app` parameter appended
 */
export function withAppParam(url) {
  const separator = url.indexOf("?") === -1 ? "?" : "&";
  const app = encodeURIComponent(`${DBLP_APP_NAME}_${getExtensionVersion()}`);
  return `${url}${separator}app=${app}`;
}

/**
 * Reserves the next request slot, spacing requests from this context at least
 * MIN_REQUEST_INTERVAL_MS apart; requests fired in a burst are queued.
 * @returns {Promise<void>} Resolves when the request may start
 */
function waitForRequestSlot() {
  const now = Date.now();
  const wait = Math.max(0, nextRequestSlot - now);
  nextRequestSlot = Math.max(now, nextRequestSlot) + MIN_REQUEST_INTERVAL_MS;
  if (wait === 0) {
    return Promise.resolve();
  }
  return new Promise((resolve) => setTimeout(resolve, wait));
}

/**
 * Clears the request spacing state. Intended for unit tests.
 */
export function resetRequestThrottle() {
  nextRequestSlot = 0;
}

/**
 * Validates that a URL points to dblp.org over HTTPS and rebuilds it on the
 * fixed dblp origin with the `app` parameter, so no other host is ever fetched
 * (URLs may come from dblp API responses or persisted storage).
 * @param {string} url - A dblp API or BibTeX URL
 * @returns {string} The URL to fetch
 * @throws {Error} If the URL is malformed or not on https://dblp.org
 */
export function resolveDblpUrl(url) {
  let parsed = null;
  try {
    parsed = new URL(url);
  } catch {
    parsed = null;
  }
  if (!parsed || parsed.origin !== DBLP_ORIGIN) {
    throw new Error("Refusing to fetch a URL outside https://dblp.org.");
  }
  return withAppParam(DBLP_ORIGIN + parsed.pathname + parsed.search);
}

/**
 * Fetches a dblp URL with the required `app` parameter, at most one request
 * per second from the calling context, and a timeout that starts once the
 * request leaves the queue and also covers reading the body.
 * @param {string} url - A dblp API or BibTeX URL
 * @param {function(Response): *} readResponse - Checks the response and reads
 *   its body (e.g. `response.json()`); its result is returned
 * @returns {Promise<*>} The value produced by readResponse
 * @throws {Error} "AbortError" on timeout; errors from URL validation,
 *   fetch(), or readResponse
 */
export async function dblpFetch(url, readResponse) {
  const target = resolveDblpUrl(url);
  await waitForRequestSlot();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DBLP_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(target, { signal: controller.signal });
    return await readResponse(response);
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Message shown when dblp answers with its anti-bot challenge page instead of data.
 * dblp.org sits behind Anubis, which serves an HTML proof-of-work page (with
 * HTTP 200) to clients it has not verified yet.
 * @type {string}
 */
export const DBLP_CHALLENGE_MESSAGE =
  "dblp answered with its anti-bot check instead of data. " +
  "Search directly on dblp.org (open-in-tab button) and try again later.";

/**
 * Tells whether a successful dblp response is the anti-bot challenge page.
 * The API (format=json) and the .bib endpoints never return HTML, so an HTML
 * content type means dblp served its challenge instead of the requested data.
 * @param {Response} response - The fetch response from dblp
 * @returns {boolean} True if the body is an HTML page rather than data
 */
export function isBotChallenge(response) {
  if (!response.headers || typeof response.headers.get !== "function") {
    return false;
  }
  const contentType = response.headers.get("content-type") || "";
  return contentType.toLowerCase().indexOf("text/html") !== -1;
}

/**
 * Reads the Retry-After header (delay-seconds form) of a response.
 * @param {Response} response - The fetch response
 * @returns {number} Seconds to wait, or 0 if absent or not a number of seconds
 */
function getRetryAfterSeconds(response) {
  if (!response.headers || typeof response.headers.get !== "function") {
    return 0;
  }
  const seconds = parseInt(response.headers.get("retry-after"), 10);
  return seconds > 0 ? seconds : 0;
}

/**
 * Builds a user-facing message for a non-OK dblp response.
 * @param {Response} response - The non-OK fetch response
 * @returns {string} Human-readable description of the failure
 */
export function describeHttpError(response) {
  if (response.status === 429) {
    const seconds = getRetryAfterSeconds(response);
    const wait = seconds > 0 ? `${seconds} seconds` : "a minute";
    return `dblp is rate-limiting requests (HTTP 429). Wait ${wait} before trying again.`;
  }
  // statusText is often empty on HTTP/2 in Chrome, so always include the code
  const detail = response.statusText
    ? `${response.status} ${response.statusText}`
    : `${response.status}`;
  return `The dblp API returned an error (HTTP ${detail}).`;
}

/**
 * Throws a descriptive error if a dblp response cannot carry the requested data
 * (HTTP error or anti-bot challenge page). The error is named "HttpError".
 * @param {Response} response - The fetch response from dblp
 * @throws {Error} When the response is not OK or is the challenge page
 */
export function assertDblpData(response) {
  let message = "";
  if (!response.ok) {
    message = describeHttpError(response);
  } else if (isBotChallenge(response)) {
    message = DBLP_CHALLENGE_MESSAGE;
  }
  if (message) {
    const error = new Error(message);
    error.name = "HttpError";
    throw error;
  }
}
