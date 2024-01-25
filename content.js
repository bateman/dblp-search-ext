chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
    if (request.action === 'searchDblp') {
        var selectedText = request.paperTitle;
        if (selectedText) {
            var searchUrl = 'https://dblp.org/search?q=' + encodeURIComponent(selectedText);
            chrome.runtime.sendMessage({ action: 'openNewTab', url: searchUrl });
        } else {
            alert('Please enter a paper title.');
        }
    } else if (request.action === 'getHighlightedText') {
        var highlightedText = window.getSelection().toString();
        console.log('highlightedText: ' + highlightedText);
        sendResponse({ highlightedText: highlightedText });
    }
    return true;
});
