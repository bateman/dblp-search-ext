var browser = window.msBrowser || window.browser || window.chrome;
console.log("options.js loaded");

// Saves options to chrome.storage
function save_options() {
    var maxResults = document.getElementById('maxResults').value;
    var keyRenaming = document.getElementById('renamingCheckbox').checked;
    
    browser.storage.local.set({
        maxResults: maxResults,
        keyRenaming: keyRenaming
    }, function() {
        // Update status to let user know options were saved.
        updateStatus('Saving options', 750);
    });
}

// Restores select box and checkbox state using the preferences
// stored in chrome.storage.
function restore_options() {
    browser.storage.local.get({
        maxResults: 30,
        keyRenaming: true
    }, function(items) {
        document.getElementById('maxResults').value = items.maxResults;
        document.getElementById('renamingCheckbox').checked = items.keyRenaming;
    });
}

document.addEventListener('DOMContentLoaded', function() {
    document.getElementById('saveButton').addEventListener('click', save_options);
    restore_options();
});