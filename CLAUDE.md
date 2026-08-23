# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

dblp Search is a cross-browser extension for searching publications on dblp.org and copying BibTeX entries. It supports Chrome, Firefox, Edge, and Safari.

## Architecture

**Pattern**: MVC with message-passing between extension components.

**Message Flow**:
```
popup.js → background.js → controller.js → model.js → DBLP API
                                              ↓
popup.js ← view.js ← controller.js ← model.js (observer pattern)
```

**Key Components**:

| File | Purpose |
|------|---------|
| `js/background.js` | Service worker, handles messages from popup/options |
| `js/model/model.js` | DBLP API calls, data parsing, storage integration |
| `js/controller/controller.js` | Routes between model and views |
| `js/view/popup.js` | Main UI, BibTeX copying, citation key formatting |
| `js/view/options.js` | Settings UI, drag-drop citation key builder |
| `js/view/commons.js` | Shared utilities (status updates) |

**Message Types** (handled in background.js):
- `REQUEST_SEARCH_PUBLICATIONS` - Execute search query
- `REQUEST_NEXT_PAGE` / `REQUEST_PREVIOUS_PAGE` - Pagination
- `REQUEST_SAVE_TO_ZOTERO` - Import a processed BibTeX entry into Zotero (runs in the service worker so the save survives the popup closing)

**Storage Keys**:
- `options` - User preferences (maxResults, keyRenaming, field removal, zoteroEnabled settings)
- `search` - Persisted search state (query, results, pagination)

## Browser Differences

- `manifest.json` - Used for Chrome, Edge, Safari
- `manifest.firefox.json` - Firefox-specific, includes `browser_specific_settings.gecko`

The build process swaps manifests automatically. Both must be kept in sync for version and permissions.

## DBLP API

**Endpoint**: `https://dblp.org/search/publ/api`

**Parameters**:
- `q` - Search query
- `format=json` - Response format
- `h` - Max results (hits) to return
- `f` - Offset for pagination

## Zotero Integration

"Save to Zotero" posts the processed BibTeX entry to the local connector server of the Zotero desktop app. The protocol constants, response mapping, and network calls live in `js/utils/zotero.js`; the popup processes the BibTeX and requests the permission, then hands the entry to `background.js` (`REQUEST_SAVE_TO_ZOTERO`), which performs the connector requests so the save is not killed when the popup closes on focus loss.

**Endpoint**: `POST http://127.0.0.1:23119/connector/import?session=<id>`

- A fresh random 8-char `session` ID must be sent on every request — Zotero keys save sessions by ID and returns 409 on duplicates (including two requests with no session parameter).
- The request must carry the `Zotero-Allowed-Request: 1` header; Zotero silently drops browser-originated requests (Mozilla/* user agent or an Origin header) without it. This applies to all `/connector/*` endpoints.
- Body is the raw BibTeX (`Content-Type: text/plain`); Zotero's import translators auto-detect the format and save into the collection currently selected in Zotero.
- Responses: `201` saved (JSON array of items), `400` no translator recognized the data, `500` target library not editable.
- Requires the optional host permission `http://127.0.0.1/*` (match patterns cannot carry a port), requested at runtime on first use — `permissions.request()` must be called synchronously from the click handler or Firefox rejects it.

**Destination control** (two more connector endpoints, both `POST` with `Content-Type: application/json`):

- `/connector/getSelectedCollection` (body `{}`) — returns the current save target (`libraryName`, collection `name`/`id`, `editable`) plus `targets`: all editable libraries and collections in depth-first order, each `{id: "L<n>"|"C<n>", name, level, recent?}`. Used by the popup to name the destination in the status line and by the options page to build the destination picker.
- `/connector/updateSession` (body `{sessionID, target}`) — moves the items saved under `sessionID` to the given target treeViewID, including across libraries; also switches the selected row in the Zotero window. Must run promptly after import (sessions are GC'd after ~10 min). `400` with `{error: "SESSION_NOT_FOUND"|"COLLECTION_NOT_FOUND"}` on failure.
- The pinned destination is stored in `options.zoteroTarget` (treeViewID, `""` = currently selected in Zotero) and `options.zoteroTargetName` (display path, e.g. `My Library › ML Papers`).

## Adding New Options

To add a new user-configurable option:

1. **html/options.html** - Add checkbox/input element with unique `id`
2. **js/view/options.js**:
   - `saveOptions()` - Read element value and add to storage object
   - `restoreOptions()` - Add default value and restore element state
   - `AUTOSAVE_CONTROL_IDS` - Add the element id so changes autosave (the options page has no Save button; every change persists automatically, debounced)
3. **js/view/popup.js** - Read option from storage where needed, include default value

Always provide default values in every `storage.local.get()` call.

## Common Code Patterns

**Storage access with defaults**:
```javascript
browser.storage.local.get(
  { options: { optionName: defaultValue } },
  function(items) {
    var value = items.options.optionName;
  }
);
```

**Safe DOM element creation**:
```javascript
const el = document.createElement("div");
el.textContent = userContent;  // Never use innerHTML
el.className = "safe-class";
parent.appendChild(el);
```

## Code Quality & Security

Code is evaluated by CodeFactor (A+) and Codacy (A). Changes must follow these practices to maintain grades:

**Security:**
- Use safe DOM methods (createElement, textContent) instead of innerHTML
- Validate URLs before use in href attributes (`isValidURL()` in popup.js)
- Use whitelist validation for user-configurable values (`VALID_FIELDS`, `VALID_SEPARATORS` in options.js)
- Never use `eval()`, `new Function()`, or `setTimeout`/`setInterval` with strings
- Validate message origins in `runtime.onMessage` handlers
- Sanitize data from external APIs before use
- CSP enforced: `script-src 'self'; object-src 'self'`
- Use `charAt()` instead of bracket notation for string character access (avoids "Generic Object Injection Sink" warnings)

**Quality:**
- Use `const`/`let` instead of `var`
- Use strict equality (`===`) instead of loose (`==`)
- Handle promise rejections with `.catch()` or try/catch
- Avoid code duplication and keep functions focused
- Keep cyclomatic complexity below 8 (extract helper functions if needed)
- In `/*global*/` comments, only declare non-standard globals like `chrome`. Do NOT declare browser built-ins (`setTimeout`, `clearTimeout`, `console`, etc.) — the remote Codacy ESLint config recognizes them and `no-redeclare` with `builtinGlobals: true` will flag them as violations

## Dependencies

No npm packages. Pure vanilla JavaScript with ES6 modules.

Build tools required: `jq`, `zip`, `git`. For Firefox: `web-ext`. For Safari: Xcode.

## MCP Servers

Two MCP servers are available for development assistance:

### Codacy

Use Codacy tools to check code quality and security before committing changes.

**Key tools:**
- `codacy_list_repository_issues` - List code quality issues (best practices, complexity, style)
- `codacy_search_repository_srm_items` - List security vulnerabilities (SAST, Secrets, SCA, IaC)
- `codacy_get_file_issues` - Get issues for a specific file
- `codacy_get_repository_with_analysis` - Get overall repository metrics (Grade, Issues, Coverage)
- `codacy_cli_analyze` - Run local analysis without waiting for remote scan

**Usage guidelines:**
- **Every code change must be verified with `codacy_cli_analyze` before committing** to avoid decreasing code quality grades
- Run `codacy_list_repository_issues` after making changes to catch quality regressions
- Use `codacy_search_repository_srm_items` for security-focused reviews
- Check `codacy_get_file_issues` when modifying specific files
- Use filters: `levels` for severity, `categories` for issue type (security, performance, codestyle, etc.)

**Repository info** (extracted from git remote):
- Provider: `gh` (GitHub)
- Organization: `bateman`
- Repository: `dblp-search-ext`

### Context7

Use Context7 to get up-to-date documentation for browser extension APIs and JavaScript.

**Tools:**
- `resolve-library-id` - Find Context7 library ID (must call first)
- `query-docs` - Get documentation and code examples

**Useful libraries for this project:**
- Browser extension APIs (WebExtensions)
- MDN Web Docs for DOM APIs
- JavaScript language features

**Example workflow:**
```
1. resolve-library-id with query "chrome extension api"
2. query-docs with the returned library ID and specific question
```
