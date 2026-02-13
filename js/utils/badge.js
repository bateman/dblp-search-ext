/*global chrome, setTimeout, clearTimeout, console*/

/**
 * @file badge.js
 * @description Utility for flashing the extension badge to provide visual feedback.
 */

const browser = globalThis.browser || chrome;

/**
 * Tracks badge timeout ID to prevent race conditions during badge updates
 * @type {number|null}
 */
let badgeTimeoutId = null;

/**
 * Returns a promise that resolves after the specified delay
 * @param {number} ms - Milliseconds to wait
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => {
    badgeTimeoutId = setTimeout(resolve, ms);
  });
}

/**
 * Resets the badge to its default state
 */
function clearBadge() {
  try {
    browser.action.setBadgeText({ text: "" });
    browser.action.setTitle({ title: "dblp Search" });
  } catch (error) {
    console.error("Failed to clear badge:", error);
  }
  badgeTimeoutId = null;
}

/**
 * Flashes the extension badge to provide visual feedback for invalid input.
 * Alternates badge visibility for the specified count, then holds for a delay before clearing.
 * @param {number} [count=3] - Number of flash cycles
 * @param {number} [interval=300] - Milliseconds between flashes
 * @param {number} [holdDuration=3000] - Milliseconds to hold badge after flashing
 */
async function flashBadge(count = 3, interval = 300, holdDuration = 3000) {
  if (badgeTimeoutId) {
    clearTimeout(badgeTimeoutId);
    badgeTimeoutId = null;
  }

  try {
    for (let i = 0; i < count * 2; i++) {
      const isVisible = i % 2 === 0;
      browser.action.setBadgeText({ text: isVisible ? "!" : "" });
      browser.action.setBadgeBackgroundColor({ color: "#b91a2d" });
      browser.action.setTitle({ title: "Invalid DOI format" });
      await sleep(interval);
    }

    // Hold the badge visible, then clear
    browser.action.setBadgeText({ text: "!" });
    await sleep(holdDuration);
    clearBadge();
  } catch (error) {
    console.error("Failed to set badge:", error);
  }
}

export { flashBadge };
