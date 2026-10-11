/**
 * engineNF.js — discreteness analysis over a number field K=ℚ(α) (Mat2NF generators).
 * Best-first ("beam") search for an orientation-preserving elliptic of INFINITE order
 * (Niven/Kronecker test in Mat2NF.classify) → non-discrete witness; frontier closure ⇒
 * finite ⇒ discrete. The discrete certificate itself is produced downstream by the shared
 * Dirichlet-domain + Poincaré code (which works on the Mat2NF interface).
 */
const ALPHA = 'abcdefghijklmnopqrstuvwxyz';
const genLabel = i => i < 26 ? ALPHA[i] : `g${i + 1}`;
const invLabel = i => i < 26 ? ALPHA[i].toUpperCase() : `g${i + 1}⁻¹`;

class MinHeap {
    constructor() { this.a = []; }
    size() { return this.a.length; }
    push(x) { const a = this.a; a.push(x); let i = a.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (a[p].score <= a[i].score) break;[a[p], a[i]] = [a[i], a[p]]; i = p; } }
    pop() { const a = this.a, top = a[0], last = a.pop(); if (a.length) { a[0] = last; let i = 0; for (; ;) { let l = 2 * i + 1, r = l + 1, s = i; if (l < a.length && a[l].score < a[s].score) s = l; if (r < a.length && a[r].score < a[s].score) s = r; if (s === i) break;[a[s], a[i]] = [a[i], a[s]]; i = s; } } return top; }
}

const pairIdx = k => (k % 2 === 0 ? k + 1 : k - 1);
const scoreOf = m => { const f = m.floats(); return Math.abs(f.a) + Math.abs(f.b) + Math.abs(f.c) + Math.abs(f.d); };

export function analyzeDiscretenessNF(mats, opts = {}) {
    const { maxElements = 9000, maxWord = 30, timeMs = 4000 } = opts;
    const generators = mats.map((m, i) => ({ index: i, label: genLabel(i), mat: m, cls: m.classify() }));

    for (const g of generators)
        if (g.cls.kind === 'elliptic' && g.cls.infiniteOrder)
            return finalize({ verdict: 'non-discrete', exact: true, kind: 'elliptic', reason: `Generator ${g.label} is an elliptic element of infinite order (t∉finite-order set over the field).`, witness: { word: [2 * g.index], mat: g.mat, cls: g.cls } }, generators, 0);

    const sym = [];
    mats.forEach((m, i) => { sym.push({ mat: m, label: genLabel(i) }); sym.push({ mat: m.inv(), label: invLabel(i) }); });
    const id = mats[0].mul(mats[0].inv()).key();
    const visited = new Set([id]);
    const heap = new MinHeap();
    let certificate = null;
    const wordStr = w => w.map(k => sym[k].label).join('');

    const consider = (m, word, last) => {
        const key = m.key();
        if (visited.has(key)) return false;
        visited.add(key);
        const cls = m.classify();
        if (cls.kind === 'elliptic' && cls.infiniteOrder) { certificate = { word, mat: m, cls, wordStr: wordStr(word) }; return true; }
        heap.push({ mat: m, word, last, score: scoreOf(m) });
        return false;
    };
    for (let k = 0; k < sym.length && !certificate; k++) consider(sym[k].mat, [k], k);

    let explored = 0, timedOut = false, hitBudget = false;
    const t0 = performance.now();
    while (!certificate && heap.size()) {
        if (visited.size > maxElements) { hitBudget = true; break; }
        if ((explored & 255) === 0 && performance.now() - t0 > timeMs) { timedOut = true; break; }
        const node = heap.pop(); explored++;
        if (node.word.length >= maxWord) continue;
        const pk = pairIdx(node.last);
        for (let k = 0; k < sym.length; k++) { if (k === pk) continue; if (consider(node.mat.mul(sym[k].mat), node.word.concat(k), k)) break; }
    }

    if (certificate)
        return finalize({ verdict: 'non-discrete', exact: true, kind: 'elliptic', reason: `Found a length-${certificate.word.length} word that is elliptic of infinite order over the field ⇒ not discrete.`, witness: certificate }, generators, explored, visited.size);
    if (heap.size() === 0 && !timedOut && !hitBudget)
        return finalize({ verdict: 'discrete', exact: true, kind: 'finite', reason: `The Cayley graph closed after ${visited.size} elements ⇒ finite ⇒ discrete.`, order: visited.size }, generators, explored, visited.size);
    return finalize({ verdict: 'inconclusive', exact: false, kind: 'budget', reason: `No non-discreteness certificate among ${visited.size} elements; a fundamental-domain / Poincaré certificate is attempted next.` }, generators, explored, visited.size);
}

function finalize(result, generators, explored, elementCount) {
    result.generators = generators;
    result.explored = explored;
    if (elementCount !== undefined) result.elementCount = elementCount;
    if (result.witness) {
        const w = result.witness, cls = w.cls;
        if (cls && cls.kind === 'elliptic' && cls.t) {
            const tre = cls.t.toNumber();
            const ang = Math.acos(Math.max(-1, Math.min(1, tre / 2 - 1)));
            w.angleRad = ang; w.angleDeg = ang * 180 / Math.PI; w.angleOverPi = ang / Math.PI;
        }
    }
    return result;
}
