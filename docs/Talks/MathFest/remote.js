/**
 * Phone-remote logic for the MathFest talk (reveal.js edition).
 *
 * Same architecture as the Crepe/Boise/Brown talks: a Firebase Realtime
 * Database session relays commands from the phone (?mode=remote) to the
 * presenting machine, with a BroadcastChannel fallback for same-machine
 * testing. Here the commands drive the Reveal API instead of fullPage,
 * and tutorial commands are forwarded into the active slide's iframe.
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

// Read by the inline init script to skip Reveal.initialize on the phone.
window.IS_REMOTE = isRemote;

// Local fallback for same-machine testing
const bc = new BroadcastChannel('mathfest-sync');

if (typeof firebase !== 'undefined' && firebaseConfig.apiKey !== "YOUR_API_KEY") {
    firebase.initializeApp(firebaseConfig);
    db = firebase.database();
    sessionRef = db.ref('sessions/' + sessionId);
} else {
    console.warn("Firebase unavailable or not configured. Remote control will only work in same-browser/same-machine mode (BroadcastChannel).");
}

// ── Master side: execute commands ───────────────────────────────

function activeBackgroundFrame() {
    // Embedded tools live in one of three places: a body-level .viz-stage
    // overlay the slide has revealed (data-viz-show fragment), an inline
    // iframe on the slide, or the slide's background iframe.
    const slide = Reveal.getCurrentSlide();
    if (!slide) return null;
    const trig = slide.querySelector('.fragment.visible[data-viz-show]');
    if (trig) {
        const stage = document.getElementById(trig.dataset.vizShow);
        const f = stage && stage.querySelector('iframe');
        if (f) return f;
    }
    const inline = slide.querySelector('iframe');
    if (inline) return inline;
    const bg = slide.slideBackgroundElement;
    return bg ? bg.querySelector('iframe') : null;
}

function handleCommand(cmd) {
    if (typeof Reveal === 'undefined' || !Reveal.isReady()) return;

    switch (cmd) {
        case 'next': Reveal.next(); break;
        case 'prev': Reveal.prev(); break;
        case 'up': Reveal.up(); break;
        case 'down': Reveal.down(); break;
        case 'left': Reveal.left(); break;
        case 'right': Reveal.right(); break;
        case 'overview': Reveal.toggleOverview(); break;
        default: {
            const ifr = activeBackgroundFrame();
            if (!ifr || !ifr.contentWindow) return;
            // Tutorial commands (tut-next, tut-prev, tut-reset) go to the
            // tutorial iframe; viz commands go to the Boise-style animations,
            // which listen for plain strings ('toggle', 'toggle-link').
            if (cmd.startsWith('tut-')) {
                ifr.contentWindow.postMessage({ type: 'tutorial', cmd: cmd.replace('tut-', '') }, '*');
            } else if (cmd.startsWith('orbit:')) {
                const [dx, dy] = cmd.slice(6).split(',').map(Number);
                if (Number.isFinite(dx) && Number.isFinite(dy)) {
                    ifr.contentWindow.postMessage({ type: 'orbit', dx, dy }, '*');
                }
            } else if (cmd === 'viz-toggle') {
                ifr.contentWindow.postMessage('toggle', '*');
            } else if (cmd === 'viz-link') {
                ifr.contentWindow.postMessage('toggle-link', '*');
            }
        }
    }
}

function publishState() {
    if (!db || !sessionRef || isRemote) return;
    if (typeof Reveal === 'undefined' || !Reveal.isReady()) return;
    const indices = Reveal.getIndices();
    const slide = Reveal.getCurrentSlide();
    sessionRef.child('state').update({
        h: indices.h,
        v: indices.v || 0,
        progress: Math.round(Reveal.getProgress() * 100),
        hasTutorial: !!(slide && slide.hasAttribute('data-tutorial')),
        hasViz: !!(slide && slide.hasAttribute('data-viz')),
        hasOrbit: !!(slide && slide.hasAttribute('data-orbit')),
    });
}

function setupMasterListener() {
    if (sessionRef) {
        sessionRef.child('command').on('value', (snapshot) => {
            const data = snapshot.val();
            if (data && data.command && Date.now() - data.timestamp < 2000) {
                handleCommand(data.command);
            }
        });
        if (isRemote) {
            sessionRef.child('state').on('value', (snapshot) => {
                const state = snapshot.val();
                if (state) updateRemoteUI(state);
            });
        }
    }

    bc.onmessage = (event) => {
        if (event.data && event.data.command) {
            if (isRemote) return; // remotes send, masters receive
            handleCommand(event.data.command);
        } else if (event.data && event.data.state && isRemote) {
            updateRemoteUI(event.data.state);
        }
    };
}

// ── Remote side: UI ─────────────────────────────────────────────

function updateRemoteUI(state) {
    const tut = document.getElementById('tutorial-controls');
    if (tut) tut.style.display = state.hasTutorial ? 'grid' : 'none';
    const viz = document.getElementById('viz-controls');
    if (viz) viz.style.display = state.hasViz ? 'grid' : 'none';
    const joy = document.getElementById('orbit-joystick');
    if (joy) joy.style.display = state.hasOrbit ? 'flex' : 'none';

    const bar = document.getElementById('remote-status-bar');
    if (bar) {
        bar.textContent = `Connected • Slide ${state.h + 1}.${(state.v || 0) + 1} • ${state.progress}%`;
    }
}

function sendRemoteCommand(cmd) {
    if (!isRemote) return;
    if (db && sessionRef) {
        sessionRef.child('command').set({ command: cmd, timestamp: Date.now() });
    }
    bc.postMessage({ command: cmd });
    if (navigator.vibrate) navigator.vibrate(10);
}

// ── Presentation setup (QR + session) ───────────────────────────

function updateQRCode(url) {
    const qrImg = document.getElementById('qr-img');
    if (qrImg) {
        qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(url)}`;
    }
}

function showLiveIndicator(id) {
    let indicator = document.getElementById('live-indicator');
    if (!indicator) {
        indicator = document.createElement('div');
        indicator.id = 'live-indicator';
        indicator.addEventListener('click', () => indicator.classList.toggle('expanded'));
        document.body.appendChild(indicator);
    }
    const isCloud = !!db;
    const statusColor = isCloud ? '#10b981' : '#f59e0b';
    const statusText = isCloud ? 'Cloud Sync' : 'Direct Sync';
    indicator.style.color = statusColor;
    indicator.style.borderColor = isCloud ? 'rgba(16, 185, 129, 0.25)' : 'rgba(245, 158, 11, 0.25)';
    indicator.style.background = isCloud ? 'rgba(16, 185, 129, 0.1)' : 'rgba(245, 158, 11, 0.1)';
    const cloudSvg = `<svg class="live-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${statusColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/></svg>`;
    indicator.innerHTML = `${cloudSvg}<span class="live-detail">${statusText}: ${id}</span>`;
}

function startPresentation() {
    const newId = Math.random().toString(36).substring(2, 8).toUpperCase();
    const baseUrl = window.location.href.split('?')[0].split('#')[0];
    const remoteUrl = baseUrl + '?mode=remote&session=' + newId;

    // Sticky URL so a reload keeps the session
    window.history.replaceState({ sessionId: newId }, '', baseUrl + '?session=' + newId);

    const linkDisplay = document.getElementById('remote-link-text');
    if (linkDisplay) linkDisplay.innerText = remoteUrl;
    updateQRCode(remoteUrl);
    showLiveIndicator(newId);

    const modal = document.getElementById('present-modal');
    if (modal) modal.classList.add('active');

    document.body.classList.add('presentation-mode');

    if (db) {
        if (sessionRef) sessionRef.off();
        sessionRef = db.ref('sessions/' + newId);
        setupMasterListener();
        publishState();
    }
}

function closePresentModal() {
    const modal = document.getElementById('present-modal');
    if (modal) modal.classList.remove('active');
}

// ── Orbit joystick (remote side) ────────────────────────────────
// While the knob is held off-centre, stream small orbit deltas to the
// deck (~11 Hz — coarse but plenty for wiggling a scene around).
function initJoystick() {
    const base = document.getElementById('joy-base');
    const knob = document.getElementById('joy-knob');
    if (!base || !knob) return;
    let active = false, dx = 0, dy = 0, timer = null;

    const setKnob = () => {
        knob.style.transform = `translate(${dx}px, ${dy}px)`;
    };
    const update = (e) => {
        const t = e.touches ? e.touches[0] : e;
        const r = base.getBoundingClientRect();
        const max = r.width / 2 - 18;
        dx = t.clientX - (r.left + r.width / 2);
        dy = t.clientY - (r.top + r.height / 2);
        const len = Math.hypot(dx, dy);
        if (len > max) { dx *= max / len; dy *= max / len; }
        setKnob();
    };
    const start = (e) => {
        e.preventDefault();
        active = true;
        update(e);
        if (!timer) {
            timer = setInterval(() => {
                if (active && (dx || dy)) sendRemoteCommand(`orbit:${Math.round(dx)},${Math.round(dy)}`);
            }, 90);
        }
    };
    const end = () => {
        active = false;
        dx = 0; dy = 0;
        setKnob();
        if (timer) { clearInterval(timer); timer = null; }
    };
    base.addEventListener('touchstart', start, { passive: false });
    base.addEventListener('touchmove', (e) => { if (active) { e.preventDefault(); update(e); } }, { passive: false });
    base.addEventListener('touchend', end);
    base.addEventListener('touchcancel', end);
    base.addEventListener('mousedown', start);
    window.addEventListener('mousemove', (e) => { if (active) update(e); });
    window.addEventListener('mouseup', end);
}

// ── Init ────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
    if (isRemote) {
        document.body.classList.add('remote-mode');
        const sessDisplay = document.getElementById('sess-display');
        if (sessDisplay) sessDisplay.innerText = sessionId;
        if (!db) {
            const bar = document.getElementById('remote-status-bar');
            if (bar) bar.textContent = 'Cloud sync disabled — same-machine mode only';
        }
        initJoystick();
        setupMasterListener();
    } else {
        if (sessionId && sessionId !== 'presentation-session') {
            showLiveIndicator(sessionId);
            document.body.classList.add('presentation-mode');
        }
        setupMasterListener();

        // Publish state whenever the deck moves (Reveal loads after this file)
        const wireReveal = () => {
            if (typeof Reveal !== 'undefined' && Reveal.isReady && Reveal.isReady()) {
                Reveal.on('slidechanged', () => {
                    publishState();
                    bc.postMessage({ state: currentLocalState() });
                });
                Reveal.on('fragmentshown', publishState);
                Reveal.on('fragmenthidden', publishState);
                publishState();
            } else {
                setTimeout(wireReveal, 200);
            }
        };
        wireReveal();
    }
});

function currentLocalState() {
    const indices = Reveal.getIndices();
    const slide = Reveal.getCurrentSlide();
    return {
        h: indices.h,
        v: indices.v || 0,
        progress: Math.round(Reveal.getProgress() * 100),
        hasTutorial: !!(slide && slide.hasAttribute('data-tutorial')),
        hasViz: !!(slide && slide.hasAttribute('data-viz')),
    };
}
