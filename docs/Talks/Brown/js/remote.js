/**
 * Remote control logic for the presentation.
 * Handles Firebase synchronization, session generation, and QR code display.
 */

const firebaseConfig = {
    // Placeholder: User must fill this in
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_AUTH_DOMAIN",
    databaseURL: "YOUR_DATABASE_URL",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_STORAGE_BUCKET",
    messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
    appId: "YOUR_APP_ID"
};

let db;
let sessionRef;
const urlParams = new URLSearchParams(window.location.search);
const isRemote = urlParams.has('remote');
const sessionId = urlParams.get('session') || 'presentation-session';

if (firebaseConfig.apiKey !== "YOUR_API_KEY") {
    firebase.initializeApp(firebaseConfig);
    db = firebase.database();
    sessionRef = db.ref('sessions/' + sessionId);
}

function setupMasterListener() {
    if (!sessionRef) return;
    sessionRef.on('value', (snapshot) => {
        const data = snapshot.val();
        if (data && data.command && Date.now() - data.timestamp < 2000) {
            switch (data.command) {
                case 'next':
                    if (window.fp_api) fp_api.moveSectionDown();
                    break;
                case 'prev':
                    if (window.fp_api) fp_api.moveSectionUp();
                    break;
                case 'toggle':
                    const activeIframe = document.querySelector('.section.active iframe');
                    if (activeIframe) {
                        activeIframe.contentWindow.postMessage('toggle', '*');
                    }
                    break;
            }
        }
    });
}

/**
 * Generates a persistent QR code using a reliable service.
 * We use a more robust URL format to ensure it pops up.
 */
function updateQRCode(url) {
    const qrImg = document.getElementById('qr-img');
    if (qrImg) {
        // Using a different QR service for better reliability on local files
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(url)}`;
        qrImg.src = qrUrl;

        // Ensure the image actually loads or show an error
        qrImg.onerror = () => {
            console.error('Failed to load QR code. Trying fallback...');
            qrImg.src = `https://chart.googleapis.com/chart?cht=qr&chs=250x250&chl=${encodeURIComponent(url)}`;
        };
    }
}

function startPresentation() {
    const newId = Math.random().toString(36).substring(2, 8).toUpperCase();
    const baseUrl = window.location.href.split('?')[0].split('#')[0];
    const remoteUrl = baseUrl + '?remote&session=' + newId;

    // Update the local browser URL so it's "sticky" if refreshed
    const localUrl = baseUrl + '?session=' + newId;
    window.history.replaceState({ sessionId: newId }, '', localUrl);

    // Update display
    const linkDisplay = document.getElementById('remote-link-text');
    if (linkDisplay) linkDisplay.innerText = remoteUrl;

    updateQRCode(remoteUrl);

    const modal = document.getElementById('present-modal');
    if (modal) modal.classList.add('active');

    // Switch listener to new session
    if (db) {
        if (sessionRef) sessionRef.off();
        sessionRef = db.ref('sessions/' + newId);
        setupMasterListener();
    }
}

function closePresentModal() {
    const modal = document.getElementById('present-modal');
    if (modal) modal.classList.remove('active');
}

/**
 * Sends a command to Firebase. Used only in 'remote' mode.
 */
function sendRemoteCommand(cmd) {
    if (sessionRef && isRemote) {
        sessionRef.set({
            command: cmd,
            timestamp: Date.now()
        });
    }
}

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
    if (isRemote) {
        const remoteUi = document.getElementById('remote-ui');
        if (remoteUi) remoteUi.classList.add('active');
        document.body.style.overflow = 'hidden';

        const sessDisplay = document.getElementById('sess-display');
        if (sessDisplay) sessDisplay.innerText = sessionId;
    } else if (sessionRef) {
        setupMasterListener();
    }
});
