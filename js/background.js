// Use the 'browser' namespace if it's available; otherwise, fall back to 'chrome'.
var browser = browser || chrome;
console.log("background.js loaded");

// create a context menu item to search dblp
browser.runtime.onInstalled.addListener(function () {
    let context = "selection"
    let title = "Search highlighted text on dblp";
    browser.contextMenus.create({
        title: title,
        contexts: [context],
        id: context
    });
});

// add menu click listener
browser.contextMenus.onClicked.addListener(function (info) {
    if (info.menuItemId === "selection") {
        let text = info.selectionText;
        browser.tabs.create({ url: 'https://dblp.org/search?q=' + encodeURIComponent(text) });
    }
});
