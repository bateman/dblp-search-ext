function updateStatus(message, timeout) {
    var status = document.getElementById('status');
    if (status) {
        // append the spinner gif to status, size 16x16
        status.innerHTML = message + '&nbsp;<img class="status" src="../images/spinner.gif" />&nbsp;';
        setTimeout(function() {
            status.textContent = '';
        }, timeout);
    }
}

function updateResultsCount(message, type = 'info') {
    var count = document.getElementById('count');
    if (count) {
        count.textContent = message;
        if (type === 'error') {
            count.classList.add('error');
        } else {
            count.classList.remove('error');
        }
    }
}