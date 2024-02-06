var browser = window.msBrowser || window.browser || window.chrome;

// Saves options to chrome.storage
function save_options() {
    var corsUrl = document.getElementById('corsUrl').value;
    var keyRenaming = document.getElementById('renamingCheckbox').checked;
    
    browser.storage.local.set({
        corsApiUrl: corsUrl,
        keyRenaming: keyRenaming
    }, function() {
        // Update status to let user know options were saved.
        updateStatus('Saving options', 750);
    });
}

// Restores select box and checkbox state using the preferences
// stored in chrome.storage.
function restore_options() {
    // Use default value 'https://corsproxy.io/?'
    browser.storage.local.get({
        corsApiUrl: 'https://corsproxy.io/?',
        keyRenaming: false
    }, function(items) {
        document.getElementById('corsUrl').value = items.corsApiUrl;
        document.getElementById('renamingCheckbox').checked = items.keyRenaming;
    });
}

document.addEventListener('DOMContentLoaded', function() {
    document.getElementById('saveButton').addEventListener('click', save_options);
    restore_options();
});