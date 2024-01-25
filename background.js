chrome.runtime.onInstalled.addListener(function () {
    console.log('Dblp Search extension installed.');
});

chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
    if (request.action === 'openNewTab') {
        chrome.tabs.create({ url: request.url });
    }
});
