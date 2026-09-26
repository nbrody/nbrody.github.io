/**
 * Phone remote for the SO₃(ℚ) talks (reveal.js edition).
 *
 * Same architecture as the MathFest/Crepe/Boise talks: a Firebase Realtime
 * Database session relays commands from the phone (?mode=remote) to the
 * presenting machine, with a BroadcastChannel fallback for same-machine
 * testing (?remote=1 in a second window).  Navigation drives Reveal; the
 * visualization commands go to whichever full-bleed stage is showing.
 *
 * The Firebase SDK is fetched here, without blocking the page: the deck
 * paints at once even on bad venue wifi, and the phone link comes alive
 * whenever (if ever) the SDK arrives.
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
const FIREBASE_SDK = [
    'https://www.gstatic.com/firebasejs/9.22.1/firebase-app-compat.js',
    'https://www.gstatic.com/firebasejs/9.22.1/firebase-database-compat.js',
];

let db = null;
let sessionRef = null;
const urlParams = new URLSearchParams(window.location.search);
const isRemote = urlParams.has('remote') || urlParams.get('mode') === 'remote';
let sessionId = urlParams.get('session') || 'presentation-session';
// The speaker view (S) embeds copies of the deck with ?receiver; only the
// real deck may answer the remote.
const isReceiver = /receiver/i.test(window.location.search);

// Read by deck.js to skip Reveal.initialize on the phone.
window.IS_REMOTE = isRemote;

// Local fallback for same-machine testing
const bc = new BroadcastChannel('so3q-2-sync');

function loadScript(src) {
    return new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = src;
        s.onload = resolve;
        s.onerror = reject;
        document.head.appendChild(s);
    });
}
const firebaseReady = FIREBASE_SDK
    .reduce((p, src) => p.then(() => loadScript(src)), Promise.resolve())
    .then(() => {
        firebase.initializeApp(firebaseConfig);
        db = firebase.database();
    })
    .catch(() => console.warn('Firebase unavailable (offline?): phone remote disabled. The same-machine remote (?remote=1) still works.'));

// ── Master side: execute commands ───────────────────────────────

// A command can arrive twice when the phone and the deck share a machine
// (Firebase *and* the BroadcastChannel); each carries an id, run it once.
const seenCommands = new Set();
function firstTime(id) {
    if (!id) return true;
    if (seenCommands.has(id)) return false;
    seenCommands.add(id);
    if (seenCommands.size > 200) seenCommands.delete(seenCommands.values().next().value);
    return true;
}

function activeStageFrame() {
    const stage = document.querySelector('.stage.active');
    return stage ? stage.querySelector('iframe') : null;
}

function handleCommand(cmd) {
    if (typeof Reveal === 'undefined' || !Reveal.isReady()) return;

    switch (cmd) {
        case 'next': Reveal.next(); break;
        case 'prev': Reveal.prev(); break;
        case 'up': Reveal.prev(); break;
        case 'down': Reveal.next(); break;
        case 'left': Reveal.prev(); break;
        case 'right': Reveal.next(); break;
        case 'overview': Reveal.toggleOverview(); break;
        default: {
            const ifr = activeStageFrame();
            if (!ifr || !ifr.contentWindow) return;
            if (cmd.startsWith('orbit:')) {
                const [dx, dy] = cmd.slice(6).split(',').map(Number);
                if (Number.isFinite(dx) && Number.isFinite(dy)) {
                    ifr.contentWindow.postMessage({ type: 'orbit', dx, dy }, '*');
                }
            } else if (cmd === 'viz-toggle') {
                ifr.contentWindow.postMessage('toggle', '*');
            } else if (cmd === 'viz-reset') {
                ifr.contentWindow.postMessage('reset', '*');
            }
        }
    }
}

function slideTitle(slide) {
    if (!slide) return '';
    if (slide.dataset.title) return slide.dataset.title;
    const h = slide.querySelector('h1, h2');
    if (h) return h.textContent.trim().replace(/\s+/g, ' ');
    return slide.dataset.stage ? 'Visualization · ' + slide.dataset.stage : '';
}

function currentLocalState() {
    const indices = Reveal.getIndices();
    const slide = Reveal.getCurrentSlide();
    return {
        h: indices.h,
        v: indices.v || 0,
        f: indices.f == null ? -1 : indices.f,
        progress: Math.round(Reveal.getProgress() * 100),
        title: slideTitle(slide),
        hasViz: !!(slide && slide.dataset.stage),
        hasOrbit: !!(slide && slide.hasAttribute('data-orbit')),
    };
}

function publishState() {
    if (isRemote || isReceiver || typeof Reveal === 'undefined' || !Reveal.isReady()) return;
    const state = currentLocalState();
    if (sessionRef) sessionRef.child('state').update(state);
    bc.postMessage({ state });
}

/** (Re)bind to the current session: the deck listens for commands, the phone for state. */
function attachFirebase() {
    if (!db || isReceiver) return;
    if (sessionRef) sessionRef.off();
    sessionRef = db.ref('sessions/' + sessionId);
    if (isRemote) {
        sessionRef.child('state').on('value', (snapshot) => {
            const state = snapshot.val();
            if (state) updateRemoteUI(state);
        });
    } else {
        sessionRef.child('command').on('value', (snapshot) => {
            const data = snapshot.val();
            if (data && data.command && Date.now() - data.timestamp < 2000 && firstTime(data.id)) {
                handleCommand(data.command);
            }
        });
        publishState();
    }
}

function setupBroadcast() {
    bc.onmessage = (event) => {
        const d = event.data;
        if (d && d.command) {
            if (isRemote) return; // remotes send, masters receive
            if (firstTime(d.id)) handleCommand(d.command);
        } else if (d && d.state && isRemote) {
            updateRemoteUI(d.state);
        }
    };
}

// ── Remote side: UI ─────────────────────────────────────────────

function updateRemoteUI(state) {
    const viz = document.getElementById('viz-controls');
    if (viz) viz.style.display = state.hasViz ? 'grid' : 'none';
    const joy = document.getElementById('orbit-joystick');
    if (joy) joy.style.display = state.hasOrbit ? 'flex' : 'none';
    const title = document.getElementById('remote-slide-title');
    if (title) title.textContent = state.title || '';
    const bar = document.getElementById('remote-status-bar');
    if (bar) bar.textContent = `Connected • Slide ${state.h + 1}.${(state.v || 0) + 1} • ${state.progress}%`;
}

function sendRemoteCommand(cmd) {
    if (!isRemote) return;
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    if (sessionRef) sessionRef.child('command').set({ command: cmd, timestamp: Date.now(), id });
    bc.postMessage({ command: cmd, id });
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

    // Sticky URL so a reload keeps the session (and the slide)
    window.history.replaceState({ sessionId: newId }, '', baseUrl + '?session=' + newId + window.location.hash);
    sessionId = newId;

    const linkDisplay = document.getElementById('remote-link-text');
    if (linkDisplay) linkDisplay.innerText = remoteUrl;
    updateQRCode(remoteUrl);
    showLiveIndicator(newId);

    const modal = document.getElementById('present-modal');
    if (modal) modal.classList.add('active');

    document.body.classList.add('presentation-mode');
    attachFirebase();   // a no-op until the SDK arrives; firebaseReady attaches then
}

function closePresentModal() {
    const modal = document.getElementById('present-modal');
    if (modal) modal.classList.remove('active');
}

// ── Orbit joystick (remote side) ────────────────────────────────
// While the knob is held off-centre, stream small orbit deltas (~11 Hz).
function initJoystick() {
    const base = document.getElementById('joy-base');
    const knob = document.getElementById('joy-knob');
    if (!base || !knob) return;
    let active = false, dx = 0, dy = 0, timer = null;

    const setKnob = () => { knob.style.transform = `translate(${dx}px, ${dy}px)`; };
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
    if (isReceiver) return;
    setupBroadcast();

    if (isRemote) {
        document.body.classList.add('remote-mode');
        const sessDisplay = document.getElementById('sess-display');
        if (sessDisplay) sessDisplay.innerText = sessionId;
        initJoystick();
    } else {
        if (sessionId !== 'presentation-session') {
            showLiveIndicator(sessionId);
            document.body.classList.add('presentation-mode');
        }
        // Publish state whenever the deck moves (Reveal initializes in deck.js)
        const wireReveal = () => {
            if (typeof Reveal !== 'undefined' && Reveal.isReady && Reveal.isReady()) {
                Reveal.on('slidechanged', publishState);
                Reveal.on('fragmentshown', publishState);
                Reveal.on('fragmenthidden', publishState);
                publishState();
            } else {
                setTimeout(wireReveal, 200);
            }
        };
        wireReveal();
    }

    firebaseReady.then(() => {
        attachFirebase();
        if (!isRemote && document.getElementById('live-indicator')) showLiveIndicator(sessionId);
        if (isRemote && !db) {
            const bar = document.getElementById('remote-status-bar');
            if (bar) bar.textContent = 'Cloud sync unavailable — same-machine mode only';
        }
    });
});
