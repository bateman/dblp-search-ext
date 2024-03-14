var browser = window.msBrowser || window.browser || window.chrome;
console.log("options.js loaded");

// ------------------------------------- Listeners -------------------------------------
document.addEventListener('DOMContentLoaded', function () {
    document.getElementById('saveButton').addEventListener('click', saveOptions);
    restoreOptions();
});

// ------------------------------------- Functions -------------------------------------

// Saves options to chrome.storage
function saveOptions() {
    var maxResults = document.getElementById('maxResults').value;
    var keyRenaming = document.getElementById('renamingCheckbox').checked;
    
    browser.storage.local.set({
        'options': {
            maxResults: maxResults,
            keyRenaming: keyRenaming
        }
    }, function() {
        // Update status to let user know options were saved.
        updateStatus('Saving options', 750);
    });
}

// Restores select box and checkbox state using the preferences stored in local storag
function restoreOptions() {
    browser.storage.local.get({
        'options': {
            maxResults: 30,
            keyRenaming: true
        }
    }, function(items) {
        document.getElementById('maxResults').value = items.options.maxResults;
        document.getElementById('renamingCheckbox').checked = items.options.keyRenaming;
    });
}