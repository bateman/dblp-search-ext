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

**Storage Keys**:
- `options` - User preferences (maxResults, keyRenaming, field removal settings)
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

## Adding New Options

To add a new user-configurable option:

1. **html/options.html** - Add checkbox/input element with unique `id`
2. **js/view/options.js**:
   - `saveOptions()` - Read element value and add to storage object
   - `restoreOptions()` - Add default value and restore element state
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
