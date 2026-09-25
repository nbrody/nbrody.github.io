/**
 * The Domain tab and the status banner: certificate (clickable — each line
 * lights up what it refers to), Poincaré presentation, face-pairing
 * generators, stored elements and the current element.
 */
import { reduceWord, invertWord } from './math.js';
import { app, wordToMatrix } from './app.js';
import { standardGenerators } from './domain.js';
import { showCertRef, clearCertRef } from './inspector.js';
import { wordTex, matrixLatex, typeset, escapeHtml } from './format.js';

// ---------------- banner ----------------

let collapseTimer = null;

export function setBanner(state, text, { persist = false } = {}) {
    const banner = document.getElementById('status-banner');
    if (!banner) return;
    if (collapseTimer) { clearTimeout(collapseTimer); collapseTimer = null; }
    banner.className = 'status-banner ' + state;   // verified | warning | failed | pending | stale
    banner.removeAttribute('title');
    banner.innerHTML = '';
    if (text) {
        const span = document.createElement('span');
        span.className = 'status-banner-text';
        span.textContent = text;
        banner.appendChild(span);
        const close = document.createElement('button');
        close.className = 'status-banner-close';
        close.setAttribute('aria-label', 'Dismiss');
        close.textContent = '\u00d7';
        close.addEventListener('click', (e) => {
            e.stopPropagation();
            if (collapseTimer) { clearTimeout(collapseTimer); collapseTimer = null; }
            banner.style.display = 'none';
        });
        banner.appendChild(close);
        if (!persist) {
            collapseTimer = setTimeout(() => {
                banner.classList.add('collapsed');
                banner.title = text;
            }, 5000);
        }
    }
    banner.style.display = text ? 'flex' : 'none';
}

{
    const banner = document.getElementById('status-banner');
    banner?.addEventListener('click', () => {
        if (!banner.classList.contains('collapsed')) return;
        banner.classList.remove('collapsed');
        banner.removeAttribute('title');
    });
}

/** Banner text for a certificate report. */
export function bannerForReport(rep, faces, exactNote) {
    if (!rep) return;
    if (rep.status === 'full') {
        setBanner('warning', `Full Dirichlet domain — copies of a fundamental domain (symmetric view; Poincaré check disabled).`);
        return;
    }
    const mem = rep.membership || [];
    const memFail = mem.some(m => m.ok === false);
    if (rep.status === 'verified') {
        setBanner('verified', rep.exactUsed
            ? `✓ Discrete: all Poincaré conditions verified (${faces} faces).${exactNote}`
            : `✓ Discrete: all Poincaré conditions verified numerically (${faces} faces).`);
    } else if (rep.status === 'incomplete') {
        setBanner('warning', `✓ All resolvable Poincaré conditions pass (${faces} faces) — see the certificate for unresolved checks.${exactNote}`);
    } else if (memFail && rep.pairingChecks.every(p => p.ok)) {
        setBanner('failed', '✗ The domain is a fundamental domain for a PROPER subgroup — some generator is not a product of the face pairings. Raise the word length, or the group is not discrete.');
    } else {
        setBanner('failed', '✗ Discreteness NOT verified — see the certificate. Try a larger word length, or the group may be non-discrete.');
    }
}

// ---------------- certificate ----------------

export function renderCertificate(rep, stale = false) {
    const el = document.getElementById('cert-log');
    if (!el) return;
    el.innerHTML = '';
    el.classList.toggle('stale', !!stale);
    clearCertRef();
    if (!rep) { el.textContent = '(not yet run)'; return; }
    const entries = rep.entries && rep.entries.length ? rep.entries : (rep.log || []).map(text => ({ kind: 'info', text }));
    let active = null;
    for (const e of entries) {
        const line = document.createElement('div');
        line.className = `cert-line cert-${e.kind}`;
        line.textContent = e.text;
        if (e.ref && (e.ref.walls?.length || e.ref.edges?.length || e.ref.points?.length)) {
            line.classList.add('has-ref');
            line.title = 'Click to show this in the picture';
            line.addEventListener('click', () => {
                const on = showCertRef(e.ref);
                if (active) active.classList.remove('active');
                active = on ? line : null;
                if (on) line.classList.add('active');
            });
        }
        el.appendChild(line);
    }
}

// ---------------- presentation ----------------

export function renderPresentation(pres, certified) {
    const grp = document.getElementById('presentation-group');
    const el = document.getElementById('presentation-display');
    if (!grp || !el) return;
    if (!pres || !pres.latex) { grp.style.display = 'none'; el.innerHTML = ''; return; }
    grp.style.display = '';
    const L = pres.latex;
    let html = `<div class="pres-group-line">\\[ ${L.group} \\]</div>`;
    html += '<div class="pres-dict"><div class="pres-dict-title">where</div>';
    for (const g of L.generators) {
        html += `<div class="pres-gen"><span class="pres-gen-tex">\\(${g.tex.length > 400 ? g.tex.slice(0, 400) + '\\cdots' : g.tex}\\)</span>` +
            `<span class="pres-note">${escapeHtml(g.note)}</span></div>`;
    }
    html += '</div>';
    if (!certified) html += '<div class="pres-caveat">not certified — see the discreteness certificate</div>';
    el.innerHTML = html;
    typeset(el);
}

// ---------------- stabilizer + generators ----------------

export function renderStabilizer() {
    const stabInfo = document.getElementById('stabilizer-info');
    const H = app.home && app.home.stabilizer;
    if (!stabInfo || !H) return;
    if (H.order <= 1) {
        stabInfo.innerHTML = '<span class="stab-trivial">Basepoint stabilizer: trivial</span>';
    } else {
        const capNote = H.capped ? ' <strong class="stab-warning">(did not close — likely non-discrete!)</strong>' : '';
        const note = app.fullDirichlet
            ? `Showing the full Dirichlet domain — ${H.order} copies of a fundamental domain (symmetric view).`
            : 'Domain = Dirichlet domain ∩ fundamental cone for the stabilizer.';
        stabInfo.innerHTML = `Basepoint stabilizer: order <strong>${H.order}</strong>${capNote}` +
            `<br><span class="stab-note">${note}</span>`;
    }
    const fullBtn = document.getElementById('toggle-full-domain');
    if (fullBtn) fullBtn.disabled = H.order <= 1 && !app.fullDirichlet;
}

export function renderStdGenerators(onApply) {
    const container = document.getElementById('std-generators-list');
    if (!container) return [];
    const gens = standardGenerators();
    container.innerHTML = '';
    if (!gens.length) {
        container.innerHTML = '<p class="empty-message">No faces — click Refresh to compute.</p>';
        return gens;
    }
    gens.forEach((gen) => {
        const item = document.createElement('div');
        item.className = 'std-gen-item' + (gen.kind === 'cone' ? ' stabilizer' : '') +
            (gen.isParabolic ? ' parabolic' : '') + (gen.unpaired ? ' unpaired' : '');
        const w = document.createElement('span');
        w.className = 'std-gen-word';
        w.innerHTML = `\\(${wordTex(gen.word, 24)}\\)`;
        const t = document.createElement('span');
        t.className = 'std-gen-type';
        const anti = gen.matrix && gen.matrix.anti;
        t.textContent = gen.unpaired ? 'unpaired!'
            : anti ? (gen.kind === 'cone' ? 'mirror' : 'reflection')
                : (gen.kind === 'cone' ? 'rotation' : (gen.isParabolic ? 'cusp' : 'face'));
        item.appendChild(w);
        item.appendChild(t);
        item.title = 'Click to apply (⌘/Ctrl-click for the inverse)';
        item.addEventListener('click', (e) => onApply(gen, e));
        container.appendChild(item);
    });
    typeset(container);
    return gens;
}

export function renderCurrentElement() {
    const display = document.getElementById('current-element-display');
    const matBox = document.getElementById('current-element-matrix');
    if (display) display.innerHTML = `\\(${wordTex(reduceWord(app.cumulativeWord), 30)}\\)`;
    if (matBox) matBox.innerHTML = matrixLatex(app.viewMatrix);
    typeset([display, matBox]);
}

// ---------------- stored elements ----------------

export const userElements = [];

/**
 * Parse a word in the generators: lower case for a generator and upper case
 * for its inverse (`a b A B`), or explicit `g1`, `g2`, …, with optional `'`
 * and `^n` / `^{-n}` exponents. Separators are optional.
 */
export function parseWord(str, nGens) {
    const s = String(str || '');
    const out = [];
    let i = 0;
    while (i < s.length) {
        const ch = s[i];
        if (/[\s*,.·]/.test(ch)) { i++; continue; }
        let idx, sign = 1;
        if (ch === 'g' || ch === 'G') {
            const m = /^[gG]_?\{?(\d+)\}?/.exec(s.slice(i));
            if (!m) throw new Error(`expected a generator number after “${ch}”`);
            idx = parseInt(m[1], 10);
            i += m[0].length;
        } else if (/[a-z]/.test(ch)) { idx = ch.charCodeAt(0) - 96; i++; }
        else if (/[A-Z]/.test(ch)) { idx = ch.charCodeAt(0) - 64; sign = -1; i++; }
        else throw new Error(`unexpected character “${ch}”`);
        if (!(idx >= 1 && idx <= nGens)) throw new Error(`g${idx} is not a generator of this group (it has ${nGens})`);
        while (s[i] === "'" || s[i] === '′') { sign = -sign; i++; }
        let exp = 1;
        if (s[i] === '^') {
            i++;
            const m = /^\s*\{?\s*(-?\d+)\s*\}?/.exec(s.slice(i));
            if (!m) throw new Error('expected an integer exponent after “^”');
            exp = parseInt(m[1], 10);
            i += m[0].length;
        }
        const total = sign * exp;
        for (let k = 0; k < Math.abs(total); k++) out.push(total >= 0 ? idx : -idx);
    }
    return out;
}

export function renderUserElements(onApply) {
    const list = document.getElementById('user-elements-list');
    if (!list) return;
    list.innerHTML = '';
    if (!userElements.length) {
        list.innerHTML = '<p class="empty-message">No stored elements yet.</p>';
        return;
    }
    userElements.forEach((el, idx) => {
        const item = document.createElement('div');
        item.className = 'std-gen-item user-elem';
        let M = null, err = null;
        try { M = wordToMatrix(el.word); } catch (e) { err = e.message; }
        const head = document.createElement('div');
        head.className = 'user-elem-head';
        const w = document.createElement('span');
        w.className = 'std-gen-word';
        w.innerHTML = `\\(w_{${idx + 1}} = ${wordTex(el.word, 24)}\\)`;
        head.appendChild(w);
        const del = document.createElement('button');
        del.className = 'user-elem-del';
        del.textContent = '✕';
        del.title = 'Remove this element';
        del.addEventListener('click', (e) => { e.stopPropagation(); userElements.splice(idx, 1); renderUserElements(onApply); });
        head.appendChild(del);
        item.appendChild(head);
        const mat = document.createElement('div');
        mat.className = 'element-matrix';
        mat.innerHTML = err ? `<span class="elem-error">${escapeHtml(err)}</span>` : matrixLatex(M);
        item.appendChild(mat);
        if (M) {
            item.title = 'Click to apply this element (⌘/Ctrl-click for its inverse)';
            item.addEventListener('click', (e) => {
                const inv = e.metaKey || e.ctrlKey;
                onApply(inv ? M.inv().normalized() : M, inv ? invertWord(el.word) : [...el.word]);
            });
        }
        list.appendChild(item);
    });
    typeset(list);
}
