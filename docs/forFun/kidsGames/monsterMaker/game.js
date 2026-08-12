/* Monster Maker — mix and match silly SVG monster parts */
(() => {
    'use strict';

    const $ = id => document.getElementById(id);
    const wrap = $('monster-wrap'), svg = $('monster');
    const gBody = $('g-body'), gEyes = $('g-eyes'), gMouth = $('g-mouth');
    const gTop = $('g-top'), gExtra = $('g-extra');
    const nameEl = $('monster-name'), optionName = $('option-name'), dotsEl = $('dots');
    const LSKEY = 'kidsGames.monsterMaker.config';

    const O = 'stroke="#2d3436" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"';
    const COLORS = ['#ff8fa3', '#ffb26b', '#ffe66d', '#7bed9f', '#4ecdc4', '#74b9ff', '#a29bfe', '#dfe6e9'];

    /* ── part library ── */
    const eye = (x, y, r) =>
        `<circle cx="${x}" cy="${y}" r="${r}" fill="#fff" ${O}/>` +
        `<circle cx="${x}" cy="${y + r * .12}" r="${r * .38}" fill="#2d3436"/>` +
        `<circle cx="${x + r * .12}" cy="${y - r * .12}" r="${r * .13}" fill="#fff"/>`;
    const star = (x, y) => {
        let p = '';
        for (let i = 0; i < 10; i++) {
            const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 10 : 24;
            p += (i ? 'L' : 'M') + (x + Math.cos(a) * r).toFixed(1) + ',' + (y + Math.sin(a) * r).toFixed(1);
        }
        return `<path d="${p}Z" fill="#ffe66d" ${O}/>`;
    };

    const PARTS = {
        body: [
            { n: 'Blob', s: c => `<path d="M200,135 C275,132 322,182 314,252 C322,315 298,376 200,378 C102,376 78,315 86,252 C78,182 125,132 200,135 Z" fill="${c}" ${O}/>` },
            { n: 'Round', s: c => `<circle cx="200" cy="255" r="120" fill="${c}" ${O}/>` },
            { n: 'Egg', s: c => `<path d="M200,130 C272,130 310,215 310,292 C310,352 262,380 200,380 C138,380 90,352 90,292 C90,215 128,130 200,130 Z" fill="${c}" ${O}/>` },
            { n: 'Jelly', s: c => `<path d="M95,268 C95,172 145,128 200,128 C255,128 305,172 305,268 L305,342 Q290,326 276,346 Q261,366 247,346 Q232,326 216,346 Q201,366 186,346 Q171,326 155,346 Q140,366 124,346 Q110,326 95,342 Z" fill="${c}" ${O}/>` },
            { n: 'Bean', s: c => `<path d="M172,136 C262,118 320,190 306,266 C293,332 242,382 176,378 C116,374 86,330 100,284 C110,250 148,256 160,216 C169,186 142,142 172,136 Z" fill="${c}" ${O}/>` }
        ],
        eyes: [
            { n: 'Googly', s: eye(158, 212, 26) + eye(242, 212, 26) },
            { n: 'Cyclops', s: eye(200, 206, 40) },
            {
                n: 'Stalks', s:
                    `<path d="M155,180 C150,150 138,135 140,112" fill="none" ${O}/>` +
                    `<path d="M200,172 C200,145 200,125 200,100" fill="none" ${O}/>` +
                    `<path d="M245,180 C250,150 262,135 260,112" fill="none" ${O}/>` +
                    eye(140, 105, 16) + eye(200, 93, 16) + eye(260, 105, 16)
            },
            {
                n: 'Sleepy', s:
                    `<path d="M132,214 Q158,234 184,214" fill="none" ${O}/>` +
                    `<path d="M216,214 Q242,234 268,214" fill="none" ${O}/>` +
                    `<path d="M148,228 l-5,9 M168,230 l0,10 M232,230 l0,10 M252,228 l5,9" fill="none" ${O}/>`
            },
            { n: 'Stars', s: star(158, 212) + star(242, 212) },
            {
                n: 'Dots', s:
                    `<circle cx="163" cy="212" r="9" fill="#2d3436"/><circle cx="166" cy="209" r="3" fill="#fff"/>` +
                    `<circle cx="237" cy="212" r="9" fill="#2d3436"/><circle cx="240" cy="209" r="3" fill="#fff"/>`
            }
        ],
        mouth: [
            {
                n: 'Big Grin', s:
                    `<path d="M145,285 Q200,352 255,285 Q200,306 145,285 Z" fill="#8d3b3b" ${O}/>` +
                    `<path d="M168,290 q4,12 14,10 M232,290 q-4,12 -14,10" fill="none" stroke="#fff" stroke-width="8" stroke-linecap="round"/>`
            },
            {
                n: 'Laugh', s:
                    `<path d="M148,286 Q200,356 252,286 Z" fill="#8d3b3b" ${O}/>` +
                    `<ellipse cx="200" cy="322" rx="22" ry="13" fill="#ff8fa3" ${O}/>`
            },
            { n: 'Wavy', s: `<path d="M148,300 Q161,286 174,300 Q187,314 200,300 Q213,286 226,300 Q239,314 252,300" fill="none" ${O}/>` },
            { n: 'Tiny O', s: `<circle cx="200" cy="302" r="12" fill="#8d3b3b" ${O}/>` },
            {
                n: 'Fangs', s:
                    `<path d="M150,290 Q200,330 250,290" fill="none" ${O}/>` +
                    `<path d="M163,296 l9,22 l11,-16 Z M237,296 l-9,22 l-11,-16 Z" fill="#fff" ${O}/>`
            },
            {
                n: 'Mustache', s:
                    `<path d="M200,290 Q185,278 172,286 Q152,298 138,288 Q152,312 176,302 Q192,296 200,290 Q208,296 224,302 Q248,312 262,288 Q248,298 228,286 Q215,278 200,290 Z" fill="#2d3436" stroke="#2d3436" stroke-width="3" stroke-linejoin="round"/>` +
                    `<path d="M178,312 Q200,326 222,312" fill="none" ${O}/>`
            }
        ],
        top: [
            {
                n: 'Horns', s:
                    `<path d="M152,152 C130,118 132,92 152,72 C150,104 160,124 178,142 Z" fill="#ffe66d" ${O}/>` +
                    `<path d="M248,152 C270,118 268,92 248,72 C250,104 240,124 222,142 Z" fill="#ffe66d" ${O}/>`
            },
            {
                n: 'Antennae', s:
                    `<path d="M172,145 C165,115 155,100 150,82" fill="none" ${O}/>` +
                    `<path d="M228,145 C235,115 245,100 250,82" fill="none" ${O}/>` +
                    `<circle cx="148" cy="74" r="11" fill="#ff6b6b" ${O}/><circle cx="252" cy="74" r="11" fill="#ff6b6b" ${O}/>`
            },
            { n: 'Curly Tuft', s: `<path d="M198,142 C192,110 212,92 228,102 C242,111 234,132 218,128 C208,125 210,112 220,112" fill="none" ${O}/>` },
            {
                n: 'Bunny Ears', s:
                    `<ellipse cx="160" cy="90" rx="20" ry="55" transform="rotate(-14 160 90)" fill="#fff" ${O}/>` +
                    `<ellipse cx="160" cy="96" rx="9" ry="38" transform="rotate(-14 160 96)" fill="#ff8fa3"/>` +
                    `<ellipse cx="240" cy="90" rx="20" ry="55" transform="rotate(14 240 90)" fill="#fff" ${O}/>` +
                    `<ellipse cx="240" cy="96" rx="9" ry="38" transform="rotate(14 240 96)" fill="#ff8fa3"/>`
            },
            {
                n: 'Unicorn Horn', s:
                    `<path d="M200,58 L182,140 L218,140 Z" fill="#ffe66d" ${O}/>` +
                    `<path d="M191,98 l21,-6 M187,118 l25,-7" fill="none" stroke="#e17055" stroke-width="4" stroke-linecap="round"/>`
            }
        ],
        extra: [
            { n: 'None', s: '' },
            {
                n: 'Bow Tie', s:
                    `<path d="M200,362 L162,342 L162,382 Z" fill="#ff6b6b" ${O}/>` +
                    `<path d="M200,362 L238,342 L238,382 Z" fill="#ff6b6b" ${O}/>` +
                    `<circle cx="200" cy="362" r="9" fill="#ffe66d" ${O}/>`
            },
            {
                n: 'Glasses', s:
                    `<circle cx="158" cy="214" r="33" fill="rgba(116,185,255,.25)" ${O}/>` +
                    `<circle cx="242" cy="214" r="33" fill="rgba(116,185,255,.25)" ${O}/>` +
                    `<path d="M191,210 Q200,202 209,210 M125,208 L108,198 M275,208 L292,198" fill="none" ${O}/>`
            },
            {
                n: 'Party Hat', s:
                    `<path d="M200,52 L168,138 L232,138 Z" fill="#4ecdc4" ${O}/>` +
                    `<path d="M186,90 L222,110 M177,113 L228,128" fill="none" stroke="#ffe66d" stroke-width="6" stroke-linecap="round"/>` +
                    `<circle cx="200" cy="52" r="10" fill="#ff6b6b" ${O}/>`
            },
            {
                n: 'Crown', s:
                    `<path d="M158,138 L152,84 L178,106 L200,72 L222,106 L248,84 L242,138 Z" fill="#ffe66d" ${O}/>` +
                    `<circle cx="200" cy="120" r="7" fill="#ff6b6b" ${O}/>`
            }
        ]
    };
    const CATS = ['body', 'eyes', 'mouth', 'top', 'extra'];

    /* ── audio ── */
    let actx = null, master = null;
    let muted = localStorage.getItem('kidsGames.muted') === '1';
    const soundBtn = $('sound-btn');
    const updateSoundBtn = () => { soundBtn.textContent = muted ? '🔇' : '🔊'; if (master) master.gain.value = muted ? 0 : 1; };
    updateSoundBtn();
    soundBtn.addEventListener('click', () => {
        muted = !muted;
        localStorage.setItem('kidsGames.muted', muted ? '1' : '0');
        updateSoundBtn();
    });
    function ensureAudio() {
        if (!actx) {
            const AC = window.AudioContext || window.webkitAudioContext;
            if (!AC) return;
            actx = new AC();
            master = actx.createGain();
            master.gain.value = muted ? 0 : 1;
            master.connect(actx.destination);
        }
        if (actx.state === 'suspended') actx.resume();
    }
    document.addEventListener('pointerdown', ensureAudio, { capture: true });
    function tone(freq, dur, type, vol, when) {
        if (!actx) return;
        const t = actx.currentTime + (when || 0);
        const o = actx.createOscillator(), g = actx.createGain();
        o.type = type || 'sine';
        o.frequency.value = freq;
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(vol || .25, t + .015);
        g.gain.exponentialRampToValueAtTime(.001, t + dur);
        o.connect(g).connect(master);
        o.start(t);
        o.stop(t + dur + .05);
    }
    const boop = when => tone(280 + Math.random() * 320, .1, 'square', .12, when || 0);

    /* ── state ── */
    let cfg = { body: 0, eyes: 0, mouth: 0, top: 0, extra: 0, color: 4, name: '' };
    try {
        const saved = JSON.parse(localStorage.getItem(LSKEY) || 'null');
        if (saved) cfg = Object.assign(cfg, saved);
    } catch (e) { /* fresh start */ }
    let cat = 'body';

    function save() { localStorage.setItem(LSKEY, JSON.stringify(cfg)); }

    function render() {
        const c = COLORS[cfg.color % COLORS.length];
        gBody.innerHTML = PARTS.body[cfg.body % 5].s(c);
        gEyes.innerHTML = PARTS.eyes[cfg.eyes % 6].s;
        gMouth.innerHTML = PARTS.mouth[cfg.mouth % 6].s;
        gTop.innerHTML = PARTS.top[cfg.top % 5].s;
        gExtra.innerHTML = PARTS.extra[cfg.extra % 5].s;
        nameEl.textContent = cfg.name || ' ';
    }

    function renderControls() {
        const list = PARTS[cat];
        optionName.textContent = list[cfg[cat] % list.length].n;
        dotsEl.innerHTML = list.map((_, i) =>
            `<span class="dot${i === cfg[cat] % list.length ? ' on' : ''}"></span>`).join('');
        $('swatches').innerHTML = cat === 'body' ? COLORS.map((c, i) =>
            `<button class="swatch${i === cfg.color ? ' selected' : ''}" data-i="${i}" style="background:${c}" type="button" aria-label="Color ${i + 1}"></button>`).join('') : '';
    }

    function wobble() {
        wrap.classList.remove('wobble');
        void wrap.offsetWidth;
        wrap.classList.add('wobble');
    }

    function change(delta) {
        const list = PARTS[cat];
        cfg[cat] = ((cfg[cat] % list.length) + delta + list.length) % list.length;
        boop();
        wobble();
        render(); renderControls(); save();
    }

    /* ── wiring ── */
    document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach(b => b.classList.remove('selected'));
        t.classList.add('selected');
        cat = t.dataset.cat;
        boop();
        renderControls();
    }));
    $('prev-btn').addEventListener('click', () => change(-1));
    $('next-btn').addEventListener('click', () => change(1));
    $('swatches').addEventListener('click', e => {
        const sw = e.target.closest('.swatch');
        if (!sw) return;
        cfg.color = +sw.dataset.i;
        boop(); wobble();
        render(); renderControls(); save();
    });

    $('random-btn').addEventListener('click', () => {
        for (let i = 0; i < 6; i++) boop(i * .09);
        let n = 0;
        const roll = setInterval(() => {
            CATS.forEach(k => cfg[k] = Math.floor(Math.random() * PARTS[k].length));
            cfg.color = Math.floor(Math.random() * COLORS.length);
            render();
            if (++n >= 6) {
                clearInterval(roll);
                wobble();
                renderControls(); save();
            }
        }, 90);
    });

    const PRE = ['Professor', 'Captain', 'Sir', 'Princess', 'Doctor', 'Baron', 'Ziggy', 'Madame', 'Lil’', 'King'];
    const MID = ['Wiggle', 'Snuggle', 'Boop', 'Fuzzy', 'Gloop', 'Bumble', 'Squish', 'Noodle', 'Twinkle', 'Wobble'];
    const SUF = ['snort', 'bottom', 'pants', 'muffin', 'toes', 'whistle', 'zoom', 'berry', 'fluff', 'sprout'];
    const pick = a => a[Math.floor(Math.random() * a.length)];
    $('name-btn').addEventListener('click', () => {
        cfg.name = `${pick(PRE)} ${pick(MID)}${pick(SUF)}`;
        boop(); boop(.1);
        render(); save();
    });

    $('save-btn').addEventListener('click', () => {
        const clone = svg.cloneNode(true);
        clone.setAttribute('width', '800');
        clone.setAttribute('height', '880');
        const data = new XMLSerializer().serializeToString(clone);
        const img = new Image();
        img.onload = () => {
            const cv = document.createElement('canvas');
            cv.width = 800; cv.height = 880;
            const cx = cv.getContext('2d');
            cx.fillStyle = '#fff';
            cx.fillRect(0, 0, 800, 880);
            cx.drawImage(img, 0, 0, 800, 880);
            const a = document.createElement('a');
            a.download = (cfg.name || 'my-monster').replace(/[^\w’-]+/g, '-') + '.png';
            a.href = cv.toDataURL('image/png');
            a.click();
        };
        img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(data);
        tone(660, .2, 'triangle', .2);
    });

    /* ── blinking ── */
    function scheduleBlink() {
        setTimeout(() => {
            gEyes.classList.add('blink');
            setTimeout(() => gEyes.classList.remove('blink'), 140);
            scheduleBlink();
        }, 2000 + Math.random() * 3000);
    }

    /* ── init ── */
    render();
    renderControls();
    scheduleBlink();
})();
