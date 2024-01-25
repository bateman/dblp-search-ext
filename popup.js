document.addEventListener('DOMContentLoaded', function () {
    var searchButton = document.getElementById('searchButton');
    var paperTitleInput = document.getElementById('paperTitle');

    // Focus on the input field when the extension button is clicked
    searchButton.addEventListener('click', function () {
        paperTitleInput.focus();
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
