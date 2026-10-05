/**
 * frames.js — the two tools, live, in iframes.
 *
 * Nothing of poincare or trees is copied: each place opens the tool's own
 * page with the group in its permalink (#s=, base64url JSON, as both tools
 * write it) and ?hosted, so any change to either tool shows up here.
 *
 * In hosted mode the tool hides the inputs that define the group (they live
 * in this page) and keeps its own settings and views. trees implements
 * ?hosted itself; for poincare the same is done from here, by a small
 * stylesheet added to its same-origin document, until it does.
 */

export const TOOLS = {
    poincare: { path: '../Kleinian/poincare/index.html', title: 'Poincaré — canonical Dirichlet domains' },
    trees: { path: '../padicGroups/trees/index.html', title: 'Bruhat–Tits tree' },
};

function toB64(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = '';
    for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** The tool's URL for a state; `hosted` adds ?hosted and a nonce so a new state always reloads. */
export function toolURL(tool, state, { hosted = true, nonce = 0 } = {}) {
    const u = new URL(TOOLS[tool].path, location.href);
    if (hosted) { u.searchParams.set('hosted', '1'); u.searchParams.set('n', String(nonce)); }
    u.hash = `s=${toB64(JSON.stringify({ v: 1, ...state }))}`;
    return u.href;
}

// poincare: hide what defines the group; the walkthrough popup has no place in a frame.
const POINCARE_HOSTED_CSS = `
html.hosted-mode #tab-group > div:has(> .panel-title),
html.hosted-mode #tab-group > .control-group:has(#matrixInputs),
html.hosted-mode #constants-group,
html.hosted-mode #tab-group .control-row:has(#load-example-btn),
html.hosted-mode #tab-group > .control-group:has(#copy-link),
html.hosted-mode #wt-help,
html.hosted-mode #wt-backdrop { display: none !important; }
html.hosted-mode .da-hosted-note { margin: 0 0 4px; font-size: 12px; line-height: 1.5; color: var(--ink-dim, #9aa5bd); }
`;

function hostPoincare(doc) {
    doc.documentElement.classList.add('hosted-mode');
    if (!doc.getElementById('da-hosted-style')) {
        const st = doc.createElement('style');
        st.id = 'da-hosted-style';
        st.textContent = POINCARE_HOSTED_CSS;
        doc.head.appendChild(st);
    }
    const tab = doc.getElementById('tab-group');
    if (tab && !tab.querySelector('.da-hosted-note')) {
        const p = doc.createElement('p');
        p.className = 'da-hosted-note';
        p.textContent = 'The generators and constants are set in the Discreteness panel. The settings here belong to this view.';
        tab.prepend(p);
    }
    // The first-visit walkthrough opens a moment after load: remove it if it does.
    const kill = () => doc.getElementById('wt-backdrop')?.remove();
    kill();
    const obs = new MutationObserver(kill);
    obs.observe(doc.body, { childList: true });
    setTimeout(() => obs.disconnect(), 8000);
}

export class ToolFrames {
    /** host: the element the iframes fill. */
    constructor(host) {
        this.host = host;
        this.frames = {};
        this.nonce = 0;
        this.current = null;
    }

    frame(tool) {
        if (this.frames[tool]) return this.frames[tool];
        const f = document.createElement('iframe');
        f.className = 'tool-frame';
        f.title = TOOLS[tool].title;
        f.setAttribute('allow', 'fullscreen; clipboard-write');
        f.hidden = true;
        f.addEventListener('load', () => {
            if (tool !== 'poincare') return;
            try { hostPoincare(f.contentDocument); } catch (e) { /* not same-origin (file://): leave it as is */ }
        });
        this.host.appendChild(f);
        this.frames[tool] = f;
        return f;
    }

    /** Show `tool` with `state`; returns the standalone URL (for "open in a new tab"). */
    show(tool, state) {
        const f = this.frame(tool);
        f.src = toolURL(tool, state, { nonce: ++this.nonce });
        for (const [name, g] of Object.entries(this.frames)) g.hidden = name !== tool;
        this.current = tool;
        return toolURL(tool, state, { hosted: false });
    }

    hide() {
        for (const g of Object.values(this.frames)) g.hidden = true;
        this.current = null;
    }
}
