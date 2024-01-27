function updateStatus(message, timeout) {
    var status = document.getElementById('status');
    if (status) {
        status.textContent = message;
        setTimeout(function() {
            status.textContent = '';
        }, timeout);
    }
}