// commons.js
console.log("commons.js loaded");

export function updateStatus(message, timeout = 2000, id = 'status') {
    // `${message}&nbsp;<img class="status" src="../images/spinner.gif" />&nbsp;`
    const statusElement = document.getElementById(id);
    if (statusElement) {
        // Clear existing content
        statusElement.textContent = '';

        // Create text node
        const textNode = document.createTextNode(message);
        statusElement.appendChild(textNode);

        // Create space element
        const space = document.createTextNode('\u00A0'); // Non-breaking space
        statusElement.appendChild(space);

        // Create and configure spinner image
        const spinner = document.createElement('img');
        spinner.className = 'status';
        spinner.src = '../images/spinner.gif';
        spinner.alt = 'Loading';
        spinner.width = 16;
        spinner.height = 16;
        statusElement.appendChild(spinner);

        // Add trailing space
        statusElement.appendChild(space.cloneNode());

        // Clear after timeout
        setTimeout(() => {
            statusElement.textContent = '';
        }, timeout);
    }
}