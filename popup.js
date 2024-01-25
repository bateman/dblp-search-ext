document.addEventListener('DOMContentLoaded', function () {
    var searchButton = document.getElementById('searchButton');
    var paperTitleInput = document.getElementById('paperTitle');
    if (paperTitleInput) {
        paperTitleInput.focus();
    }

    // Get the highlighted text from the current tab
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        var tab = tabs[0];
        var url = tab.url;
        chrome.scripting.executeScript({
            target: { tabId: tab.id },
            function: function() {
                return window.getSelection().toString();
            }
        }).then(function (result) {
            if (result && result.length > 0 && result[0].result) {
                paperTitleInput.value = result[0].result;
            }
        }).catch(function (error) {
            if (!error.message.includes('Cannot access chrome:// and edge:// URLs')) {
                console.error('Error executing script:', error);
            }
        });
    });

    // Search DBLP when the search button is clicked
    searchButton.addEventListener('click', function () {
        searchDblp();
    });

    // Search DBLP when the user presses the Enter key
    paperTitleInput.addEventListener('keydown', function (event) {
        if (event.key === 'Enter') {
            searchDblp();
        }
    });

    function searchDblp() {
        var paperTitle = paperTitleInput.value.trim();
        if (paperTitle) {
            chrome.tabs.create({ url: 'https://dblp.org/search?q=' + encodeURIComponent(paperTitle) });
        }
    }
});