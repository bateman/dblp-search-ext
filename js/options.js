// Saves options to chrome.storage
function save_options() {
    var corsUrl = document.getElementById('corsUrl').value;
    chrome.storage.sync.set({
        corsApiUrl: corsUrl
    }, function() {
        // Update status to let user know options were saved.
        updateStatus('Options saved.', 750);
    });
}

// Restores select box and checkbox state using the preferences
// stored in chrome.storage.
function restore_options() {
    // Use default value corsApiUrl = 'http://localhost:7979/'
    chrome.storage.sync.get({
        corsApiUrl: 'http://localhost:7979/'
    }, function(items) {
        document.getElementById('corsUrl').value = items.corsApiUrl;
    });
}
document.addEventListener('DOMContentLoaded', function() {
    document.getElementById('saveButton').addEventListener('click', save_options);
});
document.addEventListener('DOMContentLoaded', restore_options);