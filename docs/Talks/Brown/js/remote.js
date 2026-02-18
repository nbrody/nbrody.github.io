/**
 * Remote control logic for the presentation.
 * Handles Firebase synchronization, session generation, and QR code display.
 */

const firebaseConfig = {
    apiKey: "AIzaSyCzFggXRlNNaBpdcZAxwpGipZkShlS-D3c",
    authDomain: "mathtalks-84dad.firebaseapp.com",
    databaseURL: "https://mathtalks-84dad-default-rtdb.firebaseio.com",
    projectId: "mathtalks-84dad",
    storageBucket: "mathtalks-84dad.firebasestorage.app",
    messagingSenderId: "1054624515671",
    appId: "1:1054624515671:web:443553a24a59486f91c512",
    measurementId: "G-ML6GJP05FW"
};

let db;
let sessionRef;
const urlParams = new URLSearchParams(window.location.search);
const isRemote = urlParams.has('remote') || urlParams.get('mode') === 'remote';
const sessionId = urlParams.get('session') || 'presentation-session';

// Local Fallback for same-machine testing
const bc = new BroadcastChannel('presentation-sync');

if (firebaseConfig.apiKey !== "YOUR_API_KEY") {
    firebase.initializeApp(firebaseConfig);
    db = firebase.database();
    sessionRef = db.ref('sessions/' + sessionId);
} else {
    console.warn("Firebase not configured. Remote control will only work in same-browser/same-machine 'Demo' mode.");
}

// State Syncing
function updateRemoteState(state) {
    if (db && sessionRef) {
        sessionRef.child('state').update(state);
    }
}

function handleCommand(cmd) {
    const api = window.fp_api || window.fullpage_api;
    if (!api) {
        console.error("FullPage API not found for remote control.");
        return;
    }

    // Set a flag so onLeave knows this is a sequential 'remote' action
    window.isRemoteAction = true;

    switch (cmd) {
        case 'next':
        case 'smartNext': {
            const activeSection = document.querySelector('.section.active');
            const slides = activeSection.querySelectorAll('.slide');
            const activeSlide = activeSection.querySelector('.slide.active') || slides[0];

            if (slides.length > 0) {
                const activeIndex = Array.from(slides).indexOf(activeSlide);
                if (activeIndex < slides.length - 1) {
                    api.moveSlideRight();
                } else {
                    api.moveSectionDown();
                }
            } else {
                api.moveSectionDown();
            }
            break;
        }
        case 'prev':
        case 'smartPrev': {
            const activeSection = document.querySelector('.section.active');
            const slides = activeSection.querySelectorAll('.slide');
            const activeSlide = activeSection.querySelector('.slide.active') || slides[0];

            if (slides.length > 0) {
                const activeIndex = Array.from(slides).indexOf(activeSlide);
                if (activeIndex > 0) {
                    api.moveSlideLeft();
                } else {
                    api.moveSectionUp();
                }
            } else {
                api.moveSectionUp();
            }
            break;
        }
        case 'up': api.moveSectionUp(); break;
        case 'down': api.moveSectionDown(); break;
        case 'left': api.moveSlideLeft(); break;
        case 'right': api.moveSlideRight(); break;
        case 'toggle': {
            const activeSection = document.querySelector('.section.active');
            const activeSlide = activeSection.querySelector('.slide.active') || activeSection;
            const toggleBtn = activeSlide.querySelector('.viz-controls button');
            if (toggleBtn && (toggleBtn.innerText.includes("Play") || toggleBtn.innerText.includes("Pause"))) {
                toggleBtn.click();
            } else {
                const activeIframe = activeSlide.querySelector('iframe');
                if (activeIframe) {
                    activeIframe.contentWindow.postMessage('toggle', '*');
                }
            }
            break;
        }
        case 'isoA':
        case 'isoT':
        case 'isoS':
        case 'grow': {
            const activeSection = document.querySelector('.section.active');
            const activeSlide = activeSection.querySelector('.slide.active') || activeSection;
            const isoIframe = activeSlide.querySelector('iframe');
            if (isoIframe) {
                isoIframe.contentWindow.postMessage(cmd, '*');
            }
            break;
        }
    }

    // Reset the flag after a short delay to allow the event to propagate
    setTimeout(() => { window.isRemoteAction = false; }, 100);
}

function setupMasterListener() {
    if (sessionRef) {
        // Listen for commands
        sessionRef.child('command').on('value', (snapshot) => {
            const data = snapshot.val();
            if (data && data.command && Date.now() - data.timestamp < 2000) {
                handleCommand(data.command);
            }
        });

        // Listen for state (for remote UI)
        if (isRemote) {
            sessionRef.child('state').on('value', (snapshot) => {
                const state = snapshot.val();
                if (state) {
                    updateRemoteUI(state);
                }
            });
        }
    }

    // Local fallback listener
    bc.onmessage = (event) => {
        if (event.data && event.data.command) {
            console.log("Remote command received via BroadcastChannel:", event.data.command);
            handleCommand(event.data.command);
        }
    };
}

function updateRemoteUI(state) {
    const vizBtn = document.getElementById('remote-viz-btn');
    const vizText = document.getElementById('viz-btn-text');
    const isoButtons = document.getElementById('remote-iso-buttons');

    if (vizBtn) {
        vizBtn.style.display = state.hasViz ? 'flex' : 'none';
        if (vizText) {
            vizText.innerText = state.isPlaying ? 'Pause' : 'Play';
            const svg = vizBtn.querySelector('svg');
            if (svg) {
                if (state.isPlaying) {
                    svg.innerHTML = '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>';
                } else {
                    svg.innerHTML = '<polygon points="5 3 19 12 5 21 5 3"/>';
                }
            }
        }
    }

    if (isoButtons) {
        isoButtons.style.display = state.isTower ? 'flex' : 'none';
    }
}

/**
 * Generates a persistent QR code using a reliable service.
 */
function updateQRCode(url) {
    const qrImg = document.getElementById('qr-img');
    if (qrImg) {
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(url)}`;
        qrImg.src = qrUrl;
        qrImg.onerror = () => {
            qrImg.src = `https://chart.googleapis.com/chart?cht=qr&chs=250x250&chl=${encodeURIComponent(url)}`;
        };
    }
}

function showLiveIndicator(id) {
    let indicator = document.getElementById('live-indicator');
    if (!indicator) {
        indicator = document.createElement('div');
        indicator.id = 'live-indicator';
        indicator.style.cssText = `
            position: fixed;
            bottom: 2rem;
            left: 2rem;
            padding: 0.5rem 1rem;
            background: rgba(16, 185, 129, 0.2);
            border: 1px solid rgba(16, 185, 129, 0.3);
            border-radius: 50px;
            font-family: 'Outfit', sans-serif;
            font-size: 0.75rem;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.1em;
            z-index: 9999;
            backdrop-filter: blur(10px);
            display: flex;
            align-items: center;
            gap: 0.5rem;
            pointer-events: none;
            box-shadow: 0 4px 12px rgba(0,0,0,0.2);
            transition: all 0.3s ease;
        `;
        document.body.appendChild(indicator);
    }
    const isCloud = !!db;
    const statusColor = isCloud ? '#10b981' : '#f59e0b';
    const statusText = isCloud ? 'Cloud Sync' : 'Direct Sync (Local)';
    indicator.style.color = statusColor;
    indicator.style.borderColor = isCloud ? 'rgba(16, 185, 129, 0.3)' : 'rgba(245, 158, 11, 0.3)';
    indicator.innerHTML = `<span style="width: 8px; height: 8px; background: ${statusColor}; border-radius: 50%; display: inline-block; animation: pulse 2s infinite;"></span> ${statusText}: ${id}`;
}

function startPresentation() {
    const newId = Math.random().toString(36).substring(2, 8).toUpperCase();
    const baseUrl = window.location.href.split('?')[0].split('#')[0];
    const remoteUrl = baseUrl + '?mode=remote&session=' + newId;

    // Sticky URL
    const localUrl = baseUrl + '?session=' + newId;
    window.history.replaceState({ sessionId: newId }, '', localUrl);

    // Update UI
    const linkDisplay = document.getElementById('remote-link-text');
    if (linkDisplay) linkDisplay.innerText = remoteUrl;

    updateQRCode(remoteUrl);
    showLiveIndicator(newId);

    const modal = document.getElementById('present-modal');
    if (modal) modal.classList.add('active');

    document.body.classList.add('presentation-mode');
    const presentBtn = document.querySelector('.present-btn');
    if (presentBtn) presentBtn.style.display = 'none';

    // Switch Firebase listener
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

function sendRemoteCommand(cmd) {
    if (isRemote) {
        console.log("Sending remote command:", cmd);
        // Sync to Firebase
        if (db && sessionRef) {
            sessionRef.child('command').set({
                command: cmd,
                timestamp: Date.now()
            });
        }
        // Sync locally (fallback)
        bc.postMessage({ command: cmd });
    }
}

// Global helper for the presentation to update remote UI
window.syncRemoteState = function () {
    if (isRemote || !window.fp_api) return;
    const activeSection = document.querySelector('.section.active');
    const activeSlide = activeSection.querySelector('.slide.active') || activeSection;
    const hasViz = !!activeSlide.querySelector('iframe');
    const isTower = activeSlide.getAttribute('data-anchor') === 'padic-tower';

    updateRemoteState({
        hasViz: hasViz,
        isPlaying: window.isVizPlaying || false,
        isTower: isTower
    });
};

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
    if (isRemote) {
        const remoteUi = document.getElementById('remote-ui');
        if (remoteUi) remoteUi.classList.add('active');

        const fp = document.getElementById('fullpage');
        if (fp) fp.style.display = 'none';

        document.body.style.overflow = 'hidden';

        const sessDisplay = document.getElementById('sess-display');
        if (sessDisplay) sessDisplay.innerText = sessionId;

        if (!db) {
            const warning = document.createElement('div');
            warning.style.cssText = "background: rgba(245, 158, 11, 0.1); color: #f59e0b; padding: 10px; border-radius: 8px; font-size: 0.8rem; margin: 10px; border: 1px solid rgba(245, 158, 11, 0.2);";
            warning.innerHTML = "<strong>Cloud Sync Disabled</strong><br>Firebase is not configured. This remote will only work in 'Local Demo' mode (on the same machine).";
            remoteUi.prepend(warning);
        }
        setupMasterListener();
    } else {
        if (sessionId && sessionId !== 'presentation-session') {
            showLiveIndicator(sessionId);
            document.body.classList.add('presentation-mode');
            const presentBtn = document.querySelector('.present-btn');
            if (presentBtn) presentBtn.style.display = 'none';
        }
        setupMasterListener();
    }
});

