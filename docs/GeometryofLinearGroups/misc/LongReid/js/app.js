/* LongReid — Magnus curve integral points: tabs, database viewer,
 * and an exact word calculator over Q[t]/(m) with BigInt rationals. */

'use strict';

/* ================================================================
 *  Tabs
 * ================================================================ */

document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(btn.dataset.tab).classList.add('active');
        if (window.MathJax && MathJax.typesetPromise) MathJax.typesetPromise();
    });
});

/* ================================================================
 *  Exact arithmetic: BigInt fractions and Q[t]/(m)
 * ================================================================ */

function bgcd(a, b) {
    a = a < 0n ? -a : a; b = b < 0n ? -b : b;
    while (b) { [a, b] = [b, a % b]; }
    return a;
}

class Frac {
    constructor(n, d = 1n) {
        n = BigInt(n); d = BigInt(d);
        if (d === 0n) throw new Error('division by zero');
        if (d < 0n) { n = -n; d = -d; }
        const g = bgcd(n, d) || 1n;
        this.n = n / g; this.d = d / g;
    }
    add(o) { return new Frac(this.n * o.d + o.n * this.d, this.d * o.d); }
    sub(o) { return new Frac(this.n * o.d - o.n * this.d, this.d * o.d); }
    mul(o) { return new Frac(this.n * o.n, this.d * o.d); }
    div(o) { return new Frac(this.n * o.d, this.d * o.n); }
    neg() { return new Frac(-this.n, this.d); }
    isZero() { return this.n === 0n; }
    isInt() { return this.d === 1n; }
    eq(o) { return this.n === o.n && this.d === o.d; }
    toString() { return this.d === 1n ? `${this.n}` : `${this.n}/${this.d}`; }
}
const F0 = new Frac(0n), F1 = new Frac(1n);

/* Number field K = Q[t]/(m), elements = arrays of d Fracs (power basis). */
class NF {
    constructor(coeffs) {            // integer coeffs, low -> high, monic
        if (coeffs[coeffs.length - 1] !== 1) throw new Error('m must be monic');
        this.c = coeffs.map(BigInt);
        this.d = coeffs.length - 1;
        if (this.d < 1) throw new Error('m must be non-constant');
        // reduction table for t^k, k = 0 .. 2d-2
        this.red = [];
        for (let k = 0; k < this.d; k++) {
            const v = Array(this.d).fill(F0).slice();
            v[k] = F1;
            this.red.push(v);
        }
        for (let k = this.d; k <= 2 * this.d - 2; k++) {
            const prev = this.red[k - 1];
            const v = [F0, ...prev.slice(0, this.d - 1)];
            const top = prev[this.d - 1];
            if (!top.isZero())
                for (let i = 0; i < this.d; i++)
                    v[i] = v[i].sub(top.mul(new Frac(this.c[i])));
            this.red.push(v);
        }
        this.zero = Array(this.d).fill(F0);
        this.one = this.fromInt(1n);
        this.t = this.d >= 2
            ? this.zero.map((_, i) => i === 1 ? F1 : F0)
            : this.fromInt(-this.c[0]);
    }
    fromInt(n) { const v = this.zero.slice(); v[0] = new Frac(n); return v; }
    add(a, b) { return a.map((x, i) => x.add(b[i])); }
    sub(a, b) { return a.map((x, i) => x.sub(b[i])); }
    neg(a) { return a.map(x => x.neg()); }
    mul(a, b) {
        const conv = Array(2 * this.d - 1).fill(F0);
        for (let i = 0; i < this.d; i++) if (!a[i].isZero())
            for (let j = 0; j < this.d; j++) if (!b[j].isZero())
                conv[i + j] = conv[i + j].add(a[i].mul(b[j]));
        const out = this.zero.slice();
        for (let k = 0; k < conv.length; k++) if (!conv[k].isZero())
            for (let i = 0; i < this.d; i++)
                out[i] = out[i].add(conv[k].mul(this.red[k][i]));
        return out;
    }
    inv(a) {
        const d = this.d;
        const cols = this.red.slice(0, d).map(tk => this.mul(a, tk));
        const M = [];
        for (let i = 0; i < d; i++) {
            M.push(cols.map(col => col[i]).concat([i === 0 ? F1 : F0]));
        }
        for (let col = 0; col < d; col++) {
            let piv = -1;
            for (let r = col; r < d; r++) if (!M[r][col].isZero()) { piv = r; break; }
            if (piv < 0) throw new Error('not invertible (m reducible?)');
            [M[col], M[piv]] = [M[piv], M[col]];
            const pv = M[col][col];
            M[col] = M[col].map(x => x.div(pv));
            for (let r = 0; r < d; r++) {
                if (r !== col && !M[r][col].isZero()) {
                    const f = M[r][col];
                    M[r] = M[r].map((x, j) => x.sub(f.mul(M[col][j])));
                }
            }
        }
        return M.map(row => row[d]);
    }
    isZeroEl(a) { return a.every(x => x.isZero()); }
    isRationalInteger(a) { return a[0].isInt() && a.slice(1).every(x => x.isZero()); }
    /* pretty-print an element as a polynomial in t */
    str(a) {
        const parts = [];
        for (let k = this.d - 1; k >= 0; k--) {
            const c = a[k];
            if (c.isZero()) continue;
            const tp = k === 0 ? '' : (k === 1 ? 't' : `t^{${k}}`);
            let cs = c.toString();
            if (k > 0 && (cs === '1' || cs === '-1')) cs = cs.replace('1', '');
            if (c.d !== 1n) cs = `\\tfrac{${c.n}}{${c.d}}`;
            parts.push((parts.length && !cs.startsWith('-') ? '+' : '') + cs + tp);
        }
        return parts.length ? parts.join('') : '0';
    }
}

const INV = { A: 'a', a: 'A', B: 'b', b: 'B' };

function bigintSqrt(n) {
    if (n < 0n) return null;
    if (n < 2n) return n;
    let x = n, y = (x + 1n) / 2n;
    while (y < x) { x = y; y = (x + n / x) / 2n; }
    return x * x === n ? x : null;
}

/* At a rational specialization (deg 1) with t a perfect square, the
 * generators normalize into PSL2: a = A/sqrt(t), b = B/(t-1) — the
 * Long-Reid setup (arXiv:2512.19760). Returns null otherwise. */
function rationalSqrt(fr) {
    const sn = bigintSqrt(fr.n), sd = bigintSqrt(fr.d);
    return (sn !== null && sd !== null) ? new Frac(sn, sd) : null;
}

function magnusGens(K) {
    const t = K.t, one = K.one, zero = K.zero;
    const t2p1 = K.add(K.mul(t, t), one);
    const two = K.fromInt(2n);
    let A = [[t, zero], [zero, one]];
    let B = [[t2p1, two], [t, one]];
    let normalized = false;
    if (K.d === 1) {
        const tv = t[0];
        const s = rationalSqrt(tv);
        const tm1v = tv.sub(F1);
        if (s && !s.isZero() && !tm1v.isZero()) {
            const scaleA = [new Frac(s.d, s.n)];               // 1/s
            const scaleB = [new Frac(tm1v.d, tm1v.n)];         // 1/(t-1)
            A = A.map(row => row.map(e => K.mul(e, scaleA)));
            B = B.map(row => row.map(e => K.mul(e, scaleB)));
            normalized = true;
        }
    }
    const a = [[K.inv(A[0][0]), zero], [zero, K.inv(A[1][1])]];
    const detB = K.sub(K.mul(B[0][0], B[1][1]), K.mul(B[0][1], B[1][0]));
    const dinv = K.inv(detB);
    const b = [[K.mul(B[1][1], dinv), K.neg(K.mul(B[0][1], dinv))],
               [K.neg(K.mul(B[1][0], dinv)), K.mul(B[0][0], dinv)]];
    return { A, a, B, b, normalized };
}

function matMul(K, M, N) {
    return [
        [K.add(K.mul(M[0][0], N[0][0]), K.mul(M[0][1], N[1][0])),
         K.add(K.mul(M[0][0], N[0][1]), K.mul(M[0][1], N[1][1]))],
        [K.add(K.mul(M[1][0], N[0][0]), K.mul(M[1][1], N[1][0])),
         K.add(K.mul(M[1][0], N[0][1]), K.mul(M[1][1], N[1][1]))],
    ];
}

function matIdentity(K) { return [[K.one, K.zero], [K.zero, K.one]]; }

function mat12pow(Z) {
    let P = [[1n, 0n], [0n, 1n]];
    for (let k = 0; k < 12; k++) {
        P = [
            [P[0][0] * Z[0][0] + P[0][1] * Z[1][0], P[0][0] * Z[0][1] + P[0][1] * Z[1][1]],
            [P[1][0] * Z[0][0] + P[1][1] * Z[1][0], P[1][0] * Z[0][1] + P[1][1] * Z[1][1]],
        ];
    }
    return P;
}

function hasInfiniteOrderZ(Z) {       // Z: 2x2 BigInt matrix
    const det = Z[0][0] * Z[1][1] - Z[0][1] * Z[1][0];
    if (det === 0n) return false;
    if (det !== 1n && det !== -1n) return true;
    const P = mat12pow(Z);
    return !(P[0][0] === 1n && P[0][1] === 0n && P[1][0] === 0n && P[1][1] === 1n);
}

function hasInfiniteOrderPGL2(Z) {    // finite in PGL2 <=> Z^12 = ±I
    const P = mat12pow(Z);
    const isScalar = (s) => P[0][0] === s && P[1][1] === s && P[0][1] === 0n && P[1][0] === 0n;
    return !(isScalar(1n) || isScalar(-1n));
}

/* parse 't^2-3t+1' (or comma coeffs) -> [1,-3,1] low->high */
function parsePoly(s) {
    s = s.trim().replace(/\s+/g, '').replace(/\*\*/g, '^').replace(/x/g, 't').replace(/\*/g, '');
    if (!s) return null;
    if (s.includes(',')) return s.split(',').map(Number);
    const terms = s.match(/[+-]?[^+-]+/g);
    if (!terms) return null;
    let deg = 0;
    const parsed = [];
    for (const term of terms) {
        const m = term.match(/^([+-]?)(\d*)(?:t(?:\^(\d+))?)?$/);
        if (!m || (m[2] === '' && !term.includes('t'))) return null;
        const sign = m[1] === '-' ? -1 : 1;
        const coef = sign * (m[2] === '' ? 1 : parseInt(m[2], 10));
        const k = m[3] ? parseInt(m[3], 10) : (term.includes('t') ? 1 : 0);
        parsed.push([k, coef]);
        deg = Math.max(deg, k);
    }
    const cs = Array(deg + 1).fill(0);
    for (const [k, coef] of parsed) cs[k] += coef;
    return cs;
}

/* ================================================================
 *  Database viewer
 * ================================================================ */

let DB = null;

function texEntry(s) {
    // huge integers (Long-Reid witnesses): show mantissa × 10^k
    if (s.replace('-', '').length > 14) {
        const neg = s.startsWith('-') ? '-' : '';
        const digits = s.replace('-', '');
        return `${neg}${digits[0]}.${digits.slice(1, 4)}{\\times}10^{${digits.length - 1}}`;
    }
    return s;
}

function texMatrix(m) {
    return `\\(\\begin{pmatrix} ${texEntry(m[0][0])} & ${texEntry(m[0][1])} \\\\ ` +
        `${texEntry(m[1][0])} & ${texEntry(m[1][1])} \\end{pmatrix}\\)`;
}

function texPoly(key) {
    return `\\(${key.replace(/\^(\d+)/g, '^{$1}')}\\)`;
}

function renderDB() {
    const root = document.getElementById('db-root');
    if (!DB) return;
    const infOnly = document.getElementById('db-inf-only').checked;
    const hideGP = document.getElementById('db-hide-genpowers').checked;

    const fields = Object.entries(DB.fields || {});
    let totalShown = 0, totalInf = 0;
    const cards = fields.map(([key, f]) => {
        let mats = f.matrices || [];
        const infCount = mats.filter(r => r.infinite_order).length;
        totalInf += infCount;
        if (infOnly) mats = mats.filter(r => r.infinite_order);
        if (hideGP) mats = mats.filter(r => !r.power_of_generator);
        totalShown += mats.length;

        const badges = [
            f.mode === 'psl2_normalized'
                ? '<span class="badge found">PSL₂-normalized</span>' : '',
            f.unit_t && f.unit_t_minus_1
                ? '<span class="badge unit">t, t−1 units</span>'
                : (f.unit_t ? '<span class="badge unit">t unit</span>'
                    : (f.unit_t_minus_1 ? '<span class="badge unit">t−1 unit</span>' : '')),
            infCount > 0
                ? `<span class="badge found">${infCount} infinite-order</span>`
                : '<span class="badge none">torsion only</span>',
        ].join('');

        const rows = mats.map(r => `
            <tr>
                <td class="word-cell" title="${r.word}">${
                    r.word.length > 24
                        ? `${r.word.slice(0, 21)}<span style="color:var(--text-muted)">…(${r.word.length})</span>`
                        : r.word}</td>
                <td class="mat-cell">${texMatrix(r.matrix)}</td>
                <td>${r.trace}</td>
                <td>${r.det}</td>
                <td class="${r.infinite_order ? 'order-inf' : 'order-fin'}">
                    ${r.infinite_order ? '∞' : 'finite'}</td>
                <td style="font-size:0.72rem;color:var(--text-muted)">${r.found_by || ''}</td>
            </tr>`).join('');

        const searchMeta = [];
        if (f.search && f.search.exhaustive_len)
            searchMeta.push(`exhaustive ≤ ${f.search.exhaustive_len}`);
        if (f.search && f.search.beam && f.search.beam.length) {
            const b = f.search.beam[f.search.beam.length - 1];
            searchMeta.push(`beam d=${b.depth} w=${b.width} (${b.score})`);
        }
        if (typeof f.total_distinct === 'number')
            searchMeta.push(`${f.total_distinct} distinct matrices found`);

        return `
        <div class="field-card">
            <div class="field-card-header">
                <span class="field-poly">${texPoly(key)}</span>
                <span class="field-label">${f.label || ''}
                    ${f.t_numeric ? ` · t ≈ ${Number(f.t_numeric).toFixed(6)}` : ''}</span>
                <span class="field-badges">${badges}</span>
            </div>
            ${mats.length ? `
            <table class="matrix-table">
                <thead><tr>
                    <th>word</th><th>matrix</th><th>tr</th><th>det</th>
                    <th>order</th><th>found by</th>
                </tr></thead>
                <tbody>${rows}</tbody>
            </table>` : `<div class="empty-state" style="padding:0.6rem 0">
                no matrices match the current filters</div>`}
            <div class="search-meta">${searchMeta.join(' · ')}</div>
        </div>`;
    });

    root.innerHTML = cards.join('') ||
        '<div class="empty-state">database is empty — run the python scripts</div>';
    document.getElementById('db-summary').textContent =
        `${fields.length} fields · ${totalShown} shown · ${totalInf} infinite-order in DB`;
    if (window.MathJax && MathJax.typesetPromise) MathJax.typesetPromise([root]);
}

async function loadDB() {
    const root = document.getElementById('db-root');
    try {
        const resp = await fetch('data/integer_matrix_db.json');
        if (!resp.ok) throw new Error(resp.statusText);
        DB = await resp.json();
        renderDB();
        populateFieldSelect();
    } catch (e) {
        root.innerHTML = `<div class="empty-state">
            could not load <code>data/integer_matrix_db.json</code> (${e.message}).<br>
            If you opened this page from disk, serve it instead:
            <code>python3 -m http.server</code></div>`;
        populateFieldSelect();
    }
}

document.getElementById('db-inf-only').addEventListener('change', renderDB);
document.getElementById('db-hide-genpowers').addEventListener('change', renderDB);

/* ================================================================
 *  Word calculator
 * ================================================================ */

function populateFieldSelect() {
    const sel = document.getElementById('calc-field');
    sel.innerHTML = '';
    const keys = DB ? Object.keys(DB.fields || {}) : [];
    if (!keys.length) keys.push('t^2-t-1', 't^2-3t+1', 't^2-2', 't^3-t-1');
    for (const k of keys) {
        const opt = document.createElement('option');
        opt.value = k;
        const lab = DB && DB.fields[k] && DB.fields[k].label;
        opt.textContent = lab ? `${k}   (${lab})` : k;
        sel.appendChild(opt);
    }
    sel.addEventListener('change', () => {
        document.getElementById('calc-custom').value = '';
        evalWord();
    });
}

let calcCache = { key: null, K: null, gens: null };

function currentField() {
    const custom = document.getElementById('calc-custom').value.trim();
    const key = custom || document.getElementById('calc-field').value;
    if (calcCache.key === key) return calcCache;
    const coeffs = parsePoly(key);
    if (!coeffs || coeffs[coeffs.length - 1] !== 1 || coeffs.length < 2)
        return { key, K: null, gens: null, err: 'minimal polynomial must be monic with integer coefficients' };
    let K, gens;
    try {
        K = new NF(coeffs);
        gens = magnusGens(K);
    } catch (e) {
        return { key, K: null, gens: null, err: e.message };
    }
    calcCache = { key, K, gens };
    return calcCache;
}

function evalWord() {
    const out = document.getElementById('calc-result');
    const word = document.getElementById('calc-word').value.replace(/\s+/g, '');
    const { K, gens, err } = currentField();
    if (err) { out.innerHTML = `<div class="empty-state">${err}</div>`; return; }
    if (!word) { out.innerHTML = '<div class="empty-state">enter a word above…</div>'; return; }
    if (/[^ABab]/.test(word)) {
        out.innerHTML = '<div class="empty-state">words use only the letters A, B, a, b</div>';
        return;
    }
    let M = matIdentity(K);
    for (const s of word) M = matMul(K, M, gens[s]);

    const integral = M.every(row => row.every(e => K.isRationalInteger(e)));
    const tr = K.add(M[0][0], M[1][1]);
    const det = K.sub(K.mul(M[0][0], M[1][1]), K.mul(M[0][1], M[1][0]));

    let verdicts = '';
    if (integral) {
        const Z = M.map(row => row.map(e => e[0].n));
        if (gens.normalized) {
            const inf = hasInfiniteOrderPGL2(Z);
            verdicts = `<span class="verdict yes">∈ PSL₂(ℤ) ✓</span>` +
                (inf ? `<span class="verdict yes">infinite order in PGL₂ ✓ — non-properness witness</span>`
                     : `<span class="verdict no">finite order in PGL₂</span>`);
        } else {
            const inf = hasInfiniteOrderZ(Z);
            verdicts = `<span class="verdict yes">integer matrix ✓</span>` +
                (inf ? `<span class="verdict yes">infinite order ✓</span>`
                     : `<span class="verdict no">finite order</span>`);
        }
    } else {
        verdicts = `<span class="verdict no">not an integer matrix</span>`;
    }
    const normNote = gens.normalized
        ? `<p style="font-size:0.78rem;color:var(--text-muted)">
             rational square t: generators PSL₂-normalized,
             \\(a = A/\\sqrt{t}\\), \\(b = B/(t-1)\\) (Long–Reid setup)</p>`
        : '';

    out.innerHTML = `
        <div>${verdicts}</div>
        ${normNote}
        <div class="math-block">
            \\[ w = \\texttt{${word}} \\;\\longmapsto\\;
            \\begin{pmatrix}
                ${K.str(M[0][0])} & ${K.str(M[0][1])} \\\\
                ${K.str(M[1][0])} & ${K.str(M[1][1])}
            \\end{pmatrix} \\]
        </div>
        <p style="font-size:0.9rem">
            \\(\\operatorname{tr} = ${K.str(tr)}\\),&emsp;
            \\(\\det = ${K.str(det)}\\),&emsp; length ${word.length}
        </p>`;
    if (window.MathJax && MathJax.typesetPromise) MathJax.typesetPromise([out]);
}

document.getElementById('calc-word').addEventListener('input', evalWord);
document.getElementById('calc-custom').addEventListener('input', () => {
    calcCache = { key: null, K: null, gens: null };
    evalWord();
});
document.querySelectorAll('.calc-genbtns [data-letter]').forEach(btn => {
    btn.addEventListener('click', () => {
        const inp = document.getElementById('calc-word');
        inp.value += btn.dataset.letter;
        evalWord();
    });
});
document.getElementById('calc-clear').addEventListener('click', () => {
    document.getElementById('calc-word').value = '';
    evalWord();
});

/* ================================================================ */
loadDB();
