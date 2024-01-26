// create a context menu item to search dblp
chrome.runtime.onInstalled.addListener(function () {
    let context = "selection"
    let title = "Search highlighted text on dblp";
    chrome.contextMenus.create({
        title: title,
        contexts: [context],
        id: context
    });
    console.log('dblp search extension installed.');
});

// add menu click listener
chrome.contextMenus.onClicked.addListener(function (info) {
    console.log('item ' + info.menuItemId + ' was clicked');
    if (info.menuItemId === "selection") {
        let text = info.selectionText;
        chrome.tabs.create({ url: 'https://dblp.org/search?q=' + encodeURIComponent(text) });
    }
});
