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

chrome.contextMenus.onClicked.addListener(function (info) {
    console.log('item ' + info.menuItemId + ' was clicked');
    if (info.menuItemId === "selection") {
        let text = info.selectionText;
        chrome.tabs.create({ url: 'https://dblp.org/search?q=' + encodeURIComponent(text) });
    }
});
