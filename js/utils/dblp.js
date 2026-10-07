/**
 * @file dblp.js
 * @description Helpers for interpreting dblp.org HTTP responses (API search and
 * BibTeX downloads), so failures reach the user with an actionable message.
 */

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
