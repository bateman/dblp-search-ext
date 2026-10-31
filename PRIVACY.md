# Privacy Statement

dblp Search does not collect, sell, or transmit personal data to the extension developer.

The extension sends search queries to `dblp.org` when you search for publications. If you open the popup after selecting text on a web page, that selected text may be used as the search query. Search results returned by dblp are public academic publication metadata.

The extension stores settings and recent search state locally in your browser using extension local storage. This may include your search query, public publication results, pagination state, and display preferences. This data stays on your device and is not sent to the developer.

When you copy a BibTeX entry, the extension fetches the public BibTeX record from dblp and writes it to your clipboard. When you download a BibTeX entry, the extension fetches the same public record from dblp and saves it as a `.bib` file to your device using the browser's download feature. Neither action sends data to the developer.

The extension also adds right-click menu items (shown when text is selected) that open a dblp.org search or resolve a selected DOI by opening the corresponding `doi.org` page in a new browser tab. These open public pages and send no data to the developer.

If you use "Save to Zotero", the extension sends the BibTeX entry (public dblp metadata) to the Zotero desktop app running on your own computer (`127.0.0.1`). It does not leave your device.

The extension uses only the permissions needed to provide these features.

## Firefox data collection declaration

Firefox asks every extension to declare the kinds of data it sends outside the browser, to anyone, not only to its developer. dblp Search declares:

- **Search terms**: the queries you type, sent to `dblp.org` when you search.
- **Website content**: text you select on a web page, sent to `dblp.org` as a search query, or to `doi.org` as a DOI to resolve, when you use the popup or the right-click menu on it.

Both are sent only as the direct result of an action you take, only to the services named above, and without identifiers, cookies, or analytics. Nothing is sent to the developer.
