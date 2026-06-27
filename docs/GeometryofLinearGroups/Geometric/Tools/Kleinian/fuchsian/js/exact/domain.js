/**
 * domain.js — Dirichlet fundamental domain for a (presumed discrete) subgroup of PGL₂(ℚ).
 *
 * Build: enumerate group elements (closed under inverse), each gives a Dirichlet face
 * (covector half-plane in Klein coords). Intersect the half-planes ∩ unit disk by clipping
 * each face's line against all others → the convex polygon. Faces are labeled by the group
 * element that produced them; the pairing of face g is the face g⁻¹.
 */

import { faceOf, hyperToKlein, uhpToHyper, kleinToUhp, inner3 } from './geom-hyp.js';

// Cayley map UHP→disk, w=(z−i)/(z+i), matching view.js & diskMobius conventions.
function cayley(z) {
    const nr = z.x, ni = z.y - 1, dr = z.x, di = z.y + 1;
    const dd = dr * dr + di * di || 1e-300;
    return { re: (nr * dr + ni * di) / dd, im: (ni * dr - nr * di) / dd };
}

const ALPHA = 'abcdefghijklmnopqrstuvwxyz';
const lab = (g, inv) => (g < 26 ? (inv ? ALPHA[g].toUpperCase() : ALPHA[g]) : `g${g + 1}${inv ? '⁻¹' : ''}`);
const PAIR_COLORS = ['#38bdf8', '#f472b6', '#a78bfa', '#22c55e', '#fbbf24', '#fb7185', '#2dd4bf', '#c084fc', '#f59e0b', '#4ade80'];

/** BFS-enumerate the group, closed under inverse, returning Map key → {mat, word:number[]}. */
function enumerate(mats, maxWord, maxEl) {
    const sym = [];
    mats.forEach((m, i) => { sym.push({ mat: m, label: lab(i, false) }); sym.push({ mat: m.inv(), label: lab(i, true) }); });
    const pair = k => (k % 2 === 0 ? k + 1 : k - 1);
    const id = mats[0].mul(mats[0].inv()).key();   // identity key (works for Mat2Q and Mat2NF)
    const map = new Map();
    let frontier = [];
    for (let k = 0; k < sym.length; k++) {
        const key = sym[k].mat.key();
        if (key === id || map.has(key)) continue;
        map.set(key, { mat: sym[k].mat, word: [k] });
        frontier.push({ mat: sym[k].mat, word: [k], last: k });
    }
    let depth = 1;
    while (frontier.length && map.size < maxEl && depth < maxWord) {
        const next = [];
        for (const node of frontier) {
            const pk = pair(node.last);
            for (let k = 0; k < sym.length; k++) {
                if (k === pk) continue;
                const m = node.mat.mul(sym[k].mat);
                const key = m.key();
                if (key === id || map.has(key)) continue;
                const word = node.word.concat(k);
                map.set(key, { mat: m, word });
                next.push({ mat: m, word, last: k });
                if (map.size >= maxEl) break;
            }
            if (map.size >= maxEl) break;
        }
        frontier = next; depth++;
    }
    // close under inverse so every face has its pairing partner present
    for (const { mat, word } of [...map.values()]) {
        const inv = mat.inv(), ik = inv.key();
        if (!map.has(ik)) map.set(ik, { mat: inv, word: word.slice().reverse().map(pair) });
    }
    return { map, sym };
}

const wordStr = (word, sym) => word.map(k => sym[k].label).join('');

/**
 * Pick a basepoint that is not (near-)fixed by any element. Candidates are tried in order
 * of "niceness": points on the imaginary axis near i first (these give the canonical,
 * symmetric Dirichlet domain for symmetric groups like PSL₂(ℤ)), then small off-axis
 * perturbations. The first candidate comfortably away from every fixed point wins;
 * otherwise we fall back to the most generic (max–min distance) one.
 */
function pickBasepoint(elements, oUhp) {
    const candidates = oUhp ? [oUhp] : [
        { x: 0, y: 1 }, { x: 0, y: 1.2 }, { x: 0, y: 1.45 }, { x: 0, y: 0.8 },
        { x: 0, y: 1.8 }, { x: 0, y: 0.62 }, { x: 0, y: 2.4 },
        { x: 0.16, y: 1.1 }, { x: -0.16, y: 1.1 }, { x: 0.27, y: 1.5 }, { x: -0.134, y: 1.37 },
    ];
    const minDist = o => { let mn = Infinity; for (const e of elements) { const d = faceOf(e.mat, o).dist; if (d < mn) mn = d; } return mn; };
    let best = candidates[0], bestMin = -1, chosen = null;
    for (const o of candidates) {
        const mn = minDist(o);
        if (mn > bestMin) { bestMin = mn; best = o; }
        if (mn > 1.05 && !chosen) chosen = o;           // first "generic enough" (cosh > 1.05 ⇒ d ≳ 0.32)
    }
    const o = chosen || best;
    return { o, fixed: minDist(o) < 1 + 1e-6 };
}

export function buildDomain(mats, opts = {}) {
    const maxWord = opts.maxWord ?? 9, maxEl = opts.maxEl ?? 600;
    const { map, sym } = enumerate(mats, maxWord, maxEl);
    const elements = [...map.values()];
    const { o: oUhp, fixed } = pickBasepoint(elements, opts.basepoint);
    const oKlein = hyperToKlein(uhpToHyper(oUhp));

    // faces (skip elements that fix the basepoint)
    const faces = [];
    for (const e of elements) {
        const f = faceOf(e.mat, oUhp);
        if (f.dist < 1 + 1e-9) continue;
        const nn = f.n[0] * f.n[0] + f.n[1] * f.n[1];
        if (nn < 1e-14) continue;
        faces.push({ mat: e.mat, word: e.word, key: e.mat.key(), v: f.v, n: f.n, d: f.d, nn });
    }

    // active faces: clip each face's line by all other half-planes and the unit disk
    const active = [];
    for (let i = 0; i < faces.length; i++) {
        const F = faces[i], nlen = Math.sqrt(F.nn);
        const p0 = [F.d * F.n[0] / F.nn, F.d * F.n[1] / F.nn];        // closest point on line to origin
        const r2 = 1 - (p0[0] * p0[0] + p0[1] * p0[1]);
        if (r2 <= 1e-9) continue;                                     // line misses the disk
        const T = Math.sqrt(r2);
        const dir = [-F.n[1] / nlen, F.n[0] / nlen];
        let tmin = -T, tmax = T, endMin = { ideal: true }, endMax = { ideal: true }, ok = true;
        for (let j = 0; j < faces.length && ok; j++) {
            if (j === i) continue;
            const G = faces[j];
            const aa = G.n[0] * p0[0] + G.n[1] * p0[1], bb = G.n[0] * dir[0] + G.n[1] * dir[1];
            const rhs = G.d - aa;                                     // need bb·t ≥ rhs
            if (Math.abs(bb) < 1e-13) { if (rhs > 1e-12) ok = false; continue; }
            const tb = rhs / bb;
            if (bb > 0) { if (tb > tmin + 1e-12) { tmin = tb; endMin = { face: j }; } }
            else { if (tb < tmax - 1e-12) { tmax = tb; endMax = { face: j }; } }
        }
        if (!ok || tmax - tmin < 1e-6) continue;
        const at = t => [p0[0] + t * dir[0], p0[1] + t * dir[1]];
        active.push({
            ...F, faceIndex: i,
            e0: { p: at(tmin), ...endMin }, e1: { p: at(tmax), ...endMax },
        });
    }

    // dedup corners by Klein position; tag finite/ideal
    const verts = [];
    const findVert = (p, ideal) => {
        for (let k = 0; k < verts.length; k++) if (Math.hypot(verts[k].p[0] - p[0], verts[k].p[1] - p[1]) < 1e-6) return k;
        const uhp = ideal ? boundaryUhp(p) : kleinToUhp(p);
        verts.push({ p, ideal, uhp, wDisk: cayley(uhp) });   // disk position in the view's w=(z−i)/(z+i) convention
        return verts.length - 1;
    };
    const sides = active.map(a => {
        const ai = findVert(a.e0.p, !!a.e0.ideal), bi = findVert(a.e1.p, !!a.e1.ideal);
        return { mat: a.mat, word: a.word, key: a.key, v: a.v, vtxA: ai, vtxB: bi, paired: false };
    });

    // pairings: face g ↔ face g⁻¹
    const sideByKey = new Map(); sides.forEach((s, i) => sideByKey.set(s.key, i));
    let colorIdx = 0;
    sides.forEach((s) => {
        if (s.color) return;
        const own = sideByKey.get(s.key), partnerKey = s.mat.inv().key(), pj = sideByKey.get(partnerKey);
        const color = PAIR_COLORS[colorIdx++ % PAIR_COLORS.length];
        s.color = color; s.partnerKey = partnerKey; s.paired = pj !== undefined; s.selfPaired = pj === own;
        if (pj !== undefined && pj !== own) { sides[pj].color = color; sides[pj].paired = true; sides[pj].partnerKey = s.key; }
    });

    // order vertices CCW around basepoint for a fill boundary
    const order = verts.map((v, i) => i).sort((a, b) =>
        Math.atan2(verts[a].p[1] - oKlein[1], verts[a].p[0] - oKlein[0]) -
        Math.atan2(verts[b].p[1] - oKlein[1], verts[b].p[0] - oKlein[0]));
    const boundary = order.map(i => verts[i].uhp);

    const allPaired = sides.length > 0 && sides.every(s => s.paired);
    const tileMats = [...map.values()].sort((a, b) => a.word.length - b.word.length).slice(0, 60).map(e => e.mat);
    return {
        basepointUhp: oUhp, basepointFixed: fixed,
        vertices: verts, sides, boundary, boundaryIdx: order, sym, tileMats,
        wordStr: w => wordStr(w, sym),
        allPaired, faceCount: sides.length, elementCount: map.size,
    };
}

function boundaryUhp(pKlein) {
    // Ideal Klein point p (|p|=1) lifts to the null direction [1,p1,p2]; its UHP boundary
    // value is the |p|→1 limit of kleinToUhp:  x = p2 / (1 − p1)  (∞ when p1→1).
    if (1 - pKlein[0] < 1e-9) return { x: 1e9, y: 0, ideal: true };
    return { x: pKlein[1] / (1 - pKlein[0]), y: 0, ideal: true };
}
