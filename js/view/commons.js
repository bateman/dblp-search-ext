// commons.js
console.log("commons.js loaded");

function updateStatus(message, timeout=2000, id='status') {
    var statusElement = document.getElementById(id);
    if (statusElement) {
        // append the spinner gif to status, size 16x16
        statusElement.innerHTML = `${message}&nbsp;<img class="status" src="../images/spinner.gif" />&nbsp;`;
        setTimeout(function () {
            statusElement.textContent = '';
        }, timeout);
    }
}