// Words in generators 1 … m (negative = inverse) as TeX and as GAP / Magma input.

/** the shortest u with w = u^k (cyclically as a word) */
function period(w) {
    const n = w.length;
    for (let p = 1; p <= n / 2; p++) {
        if (n % p) continue;
        let ok = true;
        for (let i = p; i < n && ok; i++) if (w[i] !== w[i - p]) ok = false;
        if (ok) return p;
    }
    return n;
}
/** runs of a letter: [[letter, exponent], …] */
function runs(w) {
    const out = [];
    for (const x of w) {
        const g = Math.abs(x), s = Math.sign(x);
        const last = out[out.length - 1];
        if (last && last[0] === g) last[1] += s; else out.push([g, s]);
    }
    return out.filter(([, e]) => e !== 0);
}

/** TeX for a word; name(k) gives the TeX of generator k */
export function wordTeX(w, name = (k) => `g_{${k}}`) {
    if (!w.length) return '1';
    const p = period(w);
    if (p < w.length && w.length / p > 1) {
        const u = w.slice(0, p), k = w.length / p;
        const inner = runs(u);
        if (inner.length === 1) { const [g, e] = inner[0]; return `${name(g)}^{${e * k}}`; }
        return `(${wordTeX(u, name)})^{${k}}`;
    }
    // a commutator [x, y] = x y x⁻¹ y⁻¹ of two letters
    if (w.length === 4 && w[2] === -w[0] && w[3] === -w[1] && Math.abs(w[0]) !== Math.abs(w[1])) return `[${letterTeX(w[0], name)}, ${letterTeX(w[1], name)}]`;
    return runs(w).map(([g, e]) => (e === 1 ? name(g) : `${name(g)}^{${e}}`)).join(' ');
}
const letterTeX = (x, name) => (x > 0 ? name(x) : `${name(-x)}^{-1}`);

/** plain text for GAP / Magma: g1^2*g3^-1 … */
export function wordPlain(w, prefix = 'g') {
    if (!w.length) return 'One(F)';
    return runs(w).map(([g, e]) => (e === 1 ? `${prefix}${g}` : `${prefix}${g}^${e}`)).join('*');
}

export function gapExport(m, relators, { prefix = 'g', comment = '' } = {}) {
    const names = Array.from({ length: m }, (_, i) => `"${prefix}${i + 1}"`).join(', ');
    const lines = [];
    if (comment) lines.push(`# ${comment}`);
    lines.push(`F := FreeGroup(${names});`);
    if (m) lines.push(Array.from({ length: m }, (_, i) => `${prefix}${i + 1} := F.${i + 1};`).join(' '));
    lines.push(`G := F / [`);
    relators.forEach((r, i) => lines.push(`  ${wordPlain(r, prefix)}${i < relators.length - 1 ? ',' : ''}`));
    lines.push('];');
    return lines.join('\n');
}

export function magmaExport(m, relators, { prefix = 'g', comment = '' } = {}) {
    const names = Array.from({ length: m }, (_, i) => `${prefix}${i + 1}`).join(', ');
    const lines = [];
    if (comment) lines.push(`// ${comment}`);
    lines.push(`F<${names}> := FreeGroup(${m});`);
    lines.push(`G<${names}> := quo< F |`);
    relators.forEach((r, i) => lines.push(`  ${wordPlain(r, prefix)}${i < relators.length - 1 ? ',' : ''}`));
    lines.push('>;');
    return lines.join('\n');
}

/** H_1 as TeX: Z^r ⊕ Z/d₁ ⊕ … */
export function abelianTeX({ rank, torsion }) {
    const parts = [];
    if (rank === 1) parts.push('\\mathbb{Z}');
    else if (rank > 1) parts.push(`\\mathbb{Z}^{${rank}}`);
    // group equal torsion factors
    const counts = new Map();
    for (const t of torsion) counts.set(t, (counts.get(t) || 0) + 1);
    for (const [t, c] of counts) parts.push(c === 1 ? `\\mathbb{Z}/${t}` : `(\\mathbb{Z}/${t})^{${c}}`);
    return parts.length ? parts.join(' \\oplus ') : '0';
}
