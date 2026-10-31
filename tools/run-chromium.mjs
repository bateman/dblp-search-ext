/**
 * Runs a Chromium-based browser with an unpacked extension loaded through the
 * DevTools protocol (Extensions.loadUnpacked), the replacement Google
 * documents for --load-extension, which branded Google Chrome ignores since
 * version 137. Used by `make run/chrome`.
 *
 * Usage: node tools/run-chromium.mjs <browser> <extension-dir> [browser args...]
 *
 * The browser closes when this process ends (the protocol pipe closes), so it
 * stays in the foreground until the browser is closed or Ctrl-C is pressed.
 */
import { spawn } from "node:child_process";
import process from "node:process";

const LOAD_TIMEOUT_MS = 30000;
const LOAD_REQUEST_ID = 1;

// "loading" until the browser answers, then "loaded" or "failed"; an exit
// before "loaded" is reported as an error
let loadState = "loading";

/**
 * Starts the browser with the DevTools protocol on file descriptors 3 and 4
 * @param {string} browserPath - Browser executable
 * @param {string[]} browserArgs - Extra arguments (profile, flags, start URL)
 * @returns {import("node:child_process").ChildProcess} The browser process
 */
function startBrowser(browserPath, browserArgs) {
  const args = ["--remote-debugging-pipe", "--enable-unsafe-extension-debugging"].concat(browserArgs);
  return spawn(browserPath, args, { stdio: ["ignore", "inherit", "inherit", "pipe", "pipe"] });
}

/**
 * Sends Extensions.loadUnpacked and resolves with the extension ID
 * @param {import("node:child_process").ChildProcess} browser - The browser process
 * @param {string} extensionDir - Absolute path of the unpacked extension
 * @returns {Promise<string>} The ID of the loaded extension
 */
function loadExtension(browser, extensionDir) {
  return new Promise(function (resolve, reject) {
    let received = "";
    const timer = setTimeout(function () {
      reject(new Error("the browser did not answer within " + LOAD_TIMEOUT_MS / 1000 + " s"));
    }, LOAD_TIMEOUT_MS);
    browser.stdio[4].on("data", function (chunk) {
      received += chunk.toString();
      for (let end = received.indexOf("\0"); end !== -1; end = received.indexOf("\0")) {
        const message = JSON.parse(received.slice(0, end));
        received = received.slice(end + 1);
        if (message.id === LOAD_REQUEST_ID) {
          clearTimeout(timer);
          if (message.error) {
            reject(new Error(message.error.message));
          } else {
            resolve(message.result.id);
          }
        }
      }
    });
    // The pipe breaks if the browser exits early (or is not a Chromium browser)
    [browser.stdio[3], browser.stdio[4]].forEach(function (stream) {
      stream.on("error", function (err) {
        clearTimeout(timer);
        reject(err);
      });
    });
    const request = { id: LOAD_REQUEST_ID, method: "Extensions.loadUnpacked", params: { path: extensionDir } };
    browser.stdio[3].write(JSON.stringify(request) + "\0");
  });
}

/**
 * Entry point: launches the browser, loads the extension, and mirrors the
 * browser's exit
 */
function main() {
  const [browserPath, extensionDir, ...browserArgs] = process.argv.slice(2);
  if (!browserPath || !extensionDir) {
    console.error("Usage: node tools/run-chromium.mjs <browser> <extension-dir> [browser args...]");
    process.exit(2);
  }
  const browser = startBrowser(browserPath, browserArgs);
  browser.on("error", function (err) {
    console.error("Could not start " + browserPath + ": " + err.message);
    process.exit(1);
  });
  browser.on("exit", function (code) {
    if (loadState === "loading") {
      console.error(browserPath + " closed before loading the extension");
    }
    if (loadState !== "loaded") {
      process.exit(1);
    }
    process.exit(code === null ? 0 : code);
  });
  ["SIGINT", "SIGTERM"].forEach(function (signal) {
    process.on(signal, function () {
      browser.kill();
    });
  });
  loadExtension(browser, extensionDir)
    .then(function (id) {
      loadState = "loaded";
      console.log("Loaded extension " + id + " from " + extensionDir + " (Ctrl-C to quit)");
    })
    .catch(function (err) {
      console.error("Could not load the extension: " + err.message);
      loadState = "failed";
      browser.kill();
    });
}

main();
