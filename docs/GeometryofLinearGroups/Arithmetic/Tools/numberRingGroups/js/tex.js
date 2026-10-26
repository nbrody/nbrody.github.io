// KaTeX for all mathematics on the page (prose is set in KaTeX_Main); figure labels go in an HTML
// layer over the SVG so they are real LaTeX. Adapted from pgl2Z1p/js/tex.js.

export const MACROS = {
    '\\Z': '\\mathbb{Z}', '\\Q': '\\mathbb{Q}', '\\R': '\\mathbb{R}', '\\C': '\\mathbb{C}', '\\F': '\\mathbb{F}', '\\H': '\\mathbb{H}',
    '\\O': '\\mathcal{O}', '\\PGL': '\\mathrm{PGL}', '\\PSL': '\\mathrm{PSL}', '\\GL': '\\mathrm{GL}', '\\SL': '\\mathrm{SL}',
    '\\Stab': '\\mathrm{Stab}', '\\Tr': '\\mathrm{Tr}', '\\tr': '\\mathrm{tr}', '\\Min': '\\mathrm{Min}', '\\cone': '\\mathrm{cone}',
};

const prep = (s) => s
    .replace(/\\begin\{psmallmatrix\}/g, '\\left(\\begin{smallmatrix}')
    .replace(/\\end\{psmallmatrix\}/g, '\\end{smallmatrix}\\right)');

const cache = new Map();
export function tex(s, display = false) {
    if (!window.katex) return s;
    const key = (display ? 'D' : 'I') + s;
    let out = cache.get(key);
    if (out === undefined) {
        out = katex.renderToString(prep(s), { displayMode: display, throwOnError: false, macros: MACROS, trust: (ctx) => ctx.command === '\\htmlClass', strict: (code) => (code === 'htmlExtension' ? 'ignore' : 'warn') });
        if (cache.size > 6000) cache.clear();
        cache.set(key, out);
    }
    return out;
}
/** "$…$" and "$$…$$" inside a string of HTML */
export function rich(str) {
    return str.replace(/\$\$([\s\S]+?)\$\$|\$([^$]+?)\$/g, (_, d, i) => (d !== undefined ? tex(d, true) : tex(i, false)));
}
export function renderStaticMath(root = document) {
    root.querySelectorAll('.tex').forEach((n) => {
        if (n.dataset.raw === undefined) n.dataset.raw = n.textContent;
        n.innerHTML = rich(n.dataset.raw);
    });
}

const AX = { start: 0, middle: 0.5, end: 1 };
const AY = { top: 0, middle: 0.5, bottom: 1 };
export class TexLayer {
    constructor(host, cls = '') {
        if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
        this.el = document.createElement('div');
        this.el.className = 'tex-layer ' + cls;
        host.appendChild(this.el);
    }
    clear() { this.el.replaceChildren(); }
    add(src, x, y, { anchor = 'middle', baseline = 'middle', cls = '' } = {}) {
        const s = document.createElement('span');
        s.className = 'tex-lab ' + cls;
        s.innerHTML = tex(src);
        s.style.left = x + 'px'; s.style.top = y + 'px';
        s.style.transform = `translate(${-100 * AX[anchor]}%, ${-100 * AY[baseline]}%)`;
        this.el.appendChild(s);
        return s;
    }
}
