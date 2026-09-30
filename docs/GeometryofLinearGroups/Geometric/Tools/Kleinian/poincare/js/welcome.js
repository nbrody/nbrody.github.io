// First-visit tutorial popup. Shown once (localStorage flag); reopen with the ? button.
const KEY = 'poincare.welcome.v1';
const STEPS = [
    {
        title: 'Welcome to the Dirichlet domain explorer',
        tab: 'group',
        body: `This tool draws a <b>Kleinian group</b> — a discrete subgroup of PSL₂(ℂ) acting on hyperbolic 3-space — by computing its <b>Dirichlet domain</b> (the set of points closer to a chosen basepoint than to any of its images) and the tiling it generates.<br><br>This quick tour takes about a minute.`
    },
    {
        title: '1 · Enter generators',
        tab: 'group',
        body: `On the <b>Group</b> tab, type 2×2 complex matrices as generators. Use <b>+ Add Matrix</b> for more, or <b>Load Example…</b> to start from a known group (figure-eight knot, Bianchi groups, …).<br><br>Turn on <b>Exact Arithmetic</b> to enter entries in a number field like ℚ(ω); the certifier can then verify the group relations exactly.`
    },
    {
        title: '2 · Look at the domain',
        tab: 'polyhedron',
        body: `The <b>Domain</b> tab shows the canonical polyhedron, its face pairings, a presentation of the group, and a <b>discreteness certificate</b>. You can also move the basepoint, or switch to a cusp view (Ford domain) with horoballs.`
    },
    {
        title: '3 · Move around',
        tab: null,
        body: `<b>Drag</b> to rotate, <b>scroll</b> to zoom. <b>Click a face</b> to inspect its pairing element. The buttons at the bottom of the screen apply the generators as isometries — <kbd>⌘</kbd>/<kbd>Ctrl</kbd>-click applies the inverse — so you can watch the domain get carried to its neighbors.`
    },
    {
        title: '4 · Change what you see',
        tab: 'graphics',
        body: `The <b>View</b> tab controls the picture: fade the polyhedron into its bisector walls, show the tiling, Cayley graph, limit set, or hyperbolic dust, view the upper half-space, or step <b>inside</b> the domain in first person.<br><br>The <b>Invariants</b> tab lists volume and other computed data. <b>Copy link</b> on the Group tab saves your group in a shareable URL.`
    },
    {
        title: 'You’re set',
        tab: 'group',
        body: `Try loading an example and poking at it. You can reopen this tour any time with the <b>?</b> button in the corner.`
    }
];

const css = `
#wt-backdrop{position:fixed;inset:0;z-index:1000;background:rgba(3,5,12,.55);backdrop-filter:blur(3px);display:flex;align-items:center;justify-content:center;padding:16px;animation:wt-in .25s ease-out}
@keyframes wt-in{from{opacity:0}to{opacity:1}}
#wt-card{width:min(460px,100%);background:rgba(12,16,30,.96);color:var(--ink,#eef1f8);border:1px solid var(--hairline-strong,rgba(255,255,255,.14));border-radius:18px;padding:24px 26px 18px;box-shadow:0 20px 60px rgba(0,0,0,.55);font-family:var(--font,system-ui,sans-serif)}
#wt-card h2{margin:0 0 10px;font-size:19px;font-weight:600}
#wt-card .wt-body{font-size:14px;line-height:1.55;color:var(--ink-dim,#9aa5bd);min-height:130px}
#wt-card .wt-body b{color:var(--ink,#eef1f8)}
#wt-card kbd{font-family:var(--mono,monospace);font-size:11px;padding:1px 5px;border:1px solid var(--hairline-strong,#444);border-radius:4px}
#wt-foot{display:flex;align-items:center;gap:8px;margin-top:16px}
#wt-dots{display:flex;gap:6px;flex:1}
#wt-dots i{width:7px;height:7px;border-radius:50%;background:var(--w12,rgba(255,255,255,.12))}
#wt-dots i.on{background:var(--accent,#818cf8)}
#wt-card button{font:inherit;font-size:13px;cursor:pointer;border-radius:8px;padding:7px 14px;border:1px solid var(--hairline-strong,#444);background:transparent;color:var(--ink,#eee)}
#wt-card button.wt-primary{background:var(--accent,#818cf8);border-color:var(--accent,#818cf8);color:#0a0d1a;font-weight:600}
#wt-card button:hover{filter:brightness(1.15)}
#wt-skip{border:none!important;color:var(--ink-faint,#5e6880)!important;padding:7px 6px!important}
#wt-help{position:fixed;right:14px;bottom:14px;z-index:90;width:30px;height:30px;border-radius:50%;padding:0;font:600 14px var(--font,sans-serif);cursor:pointer;color:var(--ink-dim,#9aa5bd);background:var(--glass,rgba(10,14,26,.72));border:1px solid var(--hairline-strong,#444)}
#wt-help:hover{color:var(--ink,#fff)}
`;

function remember() { try { localStorage.setItem(KEY, '1'); } catch (e) { /* private mode */ } }
function seen() { try { return localStorage.getItem(KEY) === '1'; } catch (e) { return false; } }

function open() {
    if (document.getElementById('wt-backdrop')) return;
    let i = 0;
    const back = document.createElement('div');
    back.id = 'wt-backdrop';
    back.innerHTML = `<div id="wt-card" role="dialog" aria-modal="true" aria-labelledby="wt-title">
        <h2 id="wt-title"></h2><div class="wt-body"></div>
        <div id="wt-foot"><button id="wt-skip">Skip</button><div id="wt-dots"></div>
        <button id="wt-prev">Back</button><button id="wt-next" class="wt-primary">Next</button></div></div>`;
    document.body.appendChild(back);
    const $ = (s) => back.querySelector(s);
    const close = () => { remember(); back.remove(); document.removeEventListener('keydown', onKey, true); };
    const render = () => {
        const s = STEPS[i];
        $('#wt-title').textContent = s.title;
        $('.wt-body').innerHTML = s.body;
        $('#wt-dots').innerHTML = STEPS.map((_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('');
        $('#wt-prev').style.visibility = i ? 'visible' : 'hidden';
        $('#wt-next').textContent = i === STEPS.length - 1 ? 'Start exploring' : 'Next';
        $('#wt-skip').style.display = i === STEPS.length - 1 ? 'none' : '';
        if (s.tab) document.querySelector(`.tab-btn[data-tab="${s.tab}"]`)?.click();
    };
    const next = () => { if (i === STEPS.length - 1) close(); else { i++; render(); } };
    const prev = () => { if (i) { i--; render(); } };
    const onKey = (e) => {
        if (e.key === 'Escape') close();
        else if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); next(); }
        else if (e.key === 'ArrowLeft') prev();
        e.stopPropagation();
    };
    document.addEventListener('keydown', onKey, true);
    $('#wt-next').onclick = next; $('#wt-prev').onclick = prev; $('#wt-skip').onclick = close;
    back.addEventListener('mousedown', (e) => { if (e.target === back) close(); });
    render();
    $('#wt-next').focus();
}

const root = document.documentElement.classList;
if (!root.contains('embed-mode') && !root.contains('tutorial-mode')) {
    const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    const help = document.createElement('button');
    help.id = 'wt-help'; help.textContent = '?'; help.title = 'Show the tutorial'; help.setAttribute('aria-label', 'Show the tutorial');
    help.onclick = open;
    document.body.appendChild(help);
    if (!seen()) setTimeout(open, 600);
}
