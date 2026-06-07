/**
 * @file commons.js
 * @description Shared utility functions used across popup and options views.
 */

console.log("commons.js loaded");

/**
 * Pending auto-clear timers, keyed by status element id. Allows a later
 * updateStatus/clearStatus call to cancel a previous element's auto-clear,
 * preventing a stale timer from wiping a newer message.
 * @type {Map<string, number>}
 */
const statusTimers = new Map();

/**
 * Cancels any pending auto-clear timer for the given status element id.
 * @param {string} id - ID of the status element
 */
function cancelStatusTimer(id) {
  if (statusTimers.has(id)) {
    clearTimeout(statusTimers.get(id));
    statusTimers.delete(id);
  }
}

/**
 * Displays a status message with a loading spinner.
 * When timeout is greater than 0 the status auto-clears after that delay;
 * pass 0 (or a negative value) to keep it visible until cleared explicitly
 * via clearStatus() or a subsequent updateStatus() call.
 * @param {string} message - The status message to display
 * @param {number} [timeout=2000] - Milliseconds before clearing; 0 keeps it persistent
 * @param {string} [id="status"] - ID of the status element to update
 */
export function updateStatus(message, timeout = 2000, id = "status") {
  // `${message}&nbsp;<img class="status" src="../images/spinner.gif" />&nbsp;`
  const statusElement = document.getElementById(id);
  if (statusElement) {
    // Cancel any pending auto-clear from a previous update on this element
    cancelStatusTimer(id);

    // Clear existing content
    statusElement.textContent = "";

    // Create text node
    const textNode = document.createTextNode(message);
    statusElement.appendChild(textNode);

    // Create space element
    const space = document.createTextNode("\u00A0"); // Non-breaking space
    statusElement.appendChild(space);

    // Create and configure spinner image
    const spinner = document.createElement("img");
    spinner.className = "status";
    spinner.src = "../images/spinner.gif";
    spinner.alt = "Loading";
    spinner.width = 16;
    spinner.height = 16;
    statusElement.appendChild(spinner);

    // Add trailing space
    statusElement.appendChild(space.cloneNode());

    // Clear after timeout, unless persistent (timeout <= 0)
    if (timeout > 0) {
      const timerId = setTimeout(() => {
        statusElement.textContent = "";
        statusTimers.delete(id);
      }, timeout);
      statusTimers.set(id, timerId);
    }
  }
}

/**
 * Clears the status message (and spinner) immediately, cancelling any pending
 * auto-clear timer. Used to stop a persistent spinner once a result or error
 * has been received.
 * @param {string} [id="status"] - ID of the status element to clear
 */
export function clearStatus(id = "status") {
  cancelStatusTimer(id);
  const statusElement = document.getElementById(id);
  if (statusElement) {
    statusElement.textContent = "";
  }
}
