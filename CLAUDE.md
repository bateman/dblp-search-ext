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

**Quality:**
- Use `const`/`let` instead of `var`
- Use strict equality (`===`) instead of loose (`==`)
- Handle promise rejections with `.catch()` or try/catch
- Avoid code duplication and keep functions focused

## Dependencies

No npm packages. Pure vanilla JavaScript with ES6 modules.

Build tools required: `jq`, `zip`, `git`. For Firefox: `web-ext`. For Safari: Xcode.
