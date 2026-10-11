/**
 * poincare.js — Poincaré polygon theorem certificate for a Dirichlet domain.
 *
 * Given the domain (paired sides + vertices), walk the vertex cycles. Each cycle's
 * transformation P is an EXACT product of side-pairing elements (Mat2Q). Poincaré's
 * theorem certifies the group is discrete (with this fundamental domain) when:
 *   • every side is paired with another side (or itself, for an involution);
 *   • every finite-vertex cycle has P elliptic of finite order m (or identity, m=1)
 *     and interior angles summing to 2π/m;
 *   • every ideal-vertex (cusp) cycle has P parabolic (angle sum 0).
 * The cycle relations P^m = 1 then give a presentation of the group.
 */

import { diskMobius, faceAngle } from './geom-hyp.js';

const dist2 = (p, q) => (p.re - q.re) ** 2 + (p.im - q.im) ** 2;

export function poincareCertify(domain) {
    const { sides, vertices } = domain;
    const reasons = [];
    if (!sides.length) return fail('No sides found — the group may be elementary or the radius too small.');
    if (!domain.allPaired) return fail('Not every side is paired within the search radius (try a larger word length).');

    const sideByKey = new Map(); sides.forEach((s, i) => sideByKey.set(s.key, i));
    const partnerOf = si => { const j = sideByKey.get(sides[si].partnerKey); return j === undefined ? -1 : j; };

    // incident sides per vertex
    const incident = vertices.map(() => []);
    sides.forEach((s, si) => { incident[s.vtxA].push(si); incident[s.vtxB].push(si); });

    // interior angle at each vertex = angle between its two incident face covectors
    const angleAt = v => {
        const inc = incident[v];
        if (inc.length < 2) return vertices[v].ideal ? 0 : Math.PI;
        return faceAngle(sides[inc[0]].v, sides[inc[1]].v);
    };
    const otherSideAt = (v, si) => { const inc = incident[v]; return inc.find(x => x !== si) ?? inc[0]; };

    // image of vertex v under pairing of side si, matched to the partner side's endpoints
    const nextVertex = (v, si) => {
        const T = sides[si].mat.inv();                 // pairing transformation g_s⁻¹
        const img = diskMobius(T, vertices[v].wDisk);
        const sp = partnerOf(si); if (sp < 0) return -1;
        const cand = [sides[sp].vtxA, sides[sp].vtxB];
        let best = -1, bd = Infinity;
        for (const c of cand) { const dd = dist2(img, vertices[c].wDisk); if (dd < bd) { bd = dd; best = c; } }
        return bd < 2.5e-3 ? best : -1;                // matched (loose tol on disk)
    };

    // walk all dart cycles
    const seen = new Set();
    let cycles = [];
    let ok = true;
    const ID = () => sides[0].mat.mul(sides[0].mat.inv());   // identity (Mat2Q/Mat2NF); scale-invariant for classify
    for (let s0 = 0; s0 < sides.length && ok; s0++) {
        for (const vStart of [sides[s0].vtxA, sides[s0].vtxB]) {
            const startKey = `${vStart},${s0}`;
            if (seen.has(startKey)) continue;
            let v = vStart, si = s0, P = ID(), angleSum = 0, steps = 0;
            const verts = [], ideal = vertices[vStart].ideal;
            let broke = false;
            do {
                seen.add(`${v},${si}`);
                angleSum += angleAt(v); verts.push(v);
                const v2 = nextVertex(v, si);
                if (v2 < 0) { broke = true; break; }
                P = sides[si].mat.inv().mul(P);          // accumulate P = T_{s_k}···T_{s_1}
                const sp = partnerOf(si);
                si = otherSideAt(v2, sp);
                v = v2;
                if (++steps > 2000) { broke = true; break; }
            } while (`${v},${si}` !== startKey);
            if (broke) { ok = false; reasons.push('A vertex cycle failed to close (domain construction incomplete).'); break; }
            cycles.push({ verts: verts.slice(), P, angleSum, ideal });
        }
    }
    if (!ok) return { certified: false, reasons, cycles };

    // each vertex cycle is walked in both orientations — dedup by its set of corners so
    // a single cone/cusp is reported once.
    const uniq = [], seenSets = new Set();
    for (const c of cycles) {
        const key = [...new Set(c.verts)].sort((a, b) => a - b).join('|');
        if (seenSets.has(key)) continue;
        seenSets.add(key); uniq.push(c);
    }
    cycles = uniq;

    // verify Poincaré conditions per cycle (exact order of P + numeric angle sum)
    const relations = [];
    for (const cyc of cycles) {
        const cls = cyc.P.classify();
        cyc.hasIdeal = cyc.verts.some(vi => vertices[vi].ideal);
        if (cyc.hasIdeal) {
            // cusp or free-boundary (infinite-covolume) corner — no finite-angle condition
            cyc.order = Infinity; cyc.expected = 0;
            cyc.valid = (cls.kind === 'parabolic' || cls.kind === 'identity');
            cyc.kindLabel = cls.kind === 'parabolic' ? 'cusp' : 'free';
            if (cls.kind === 'parabolic') relations.push({ order: Infinity, kind: 'cusp' });
            if (!cyc.valid) reasons.push(`An ideal-vertex cycle gave a ${cls.kind} transformation (expected parabolic) — domain not exact.`);
        } else if (cls.kind === 'identity') {
            cyc.order = 1; cyc.expected = 2 * Math.PI; cyc.kindLabel = 'regular';
            cyc.valid = Math.abs(cyc.angleSum - 2 * Math.PI) < 0.06;
        } else if (cls.kind === 'elliptic' && !cls.infiniteOrder) {
            cyc.order = cls.order; cyc.expected = 2 * Math.PI / cls.order; cyc.kindLabel = 'cone';
            cyc.valid = Math.abs(cyc.angleSum - cyc.expected) < 0.06;
            relations.push({ order: cls.order, kind: 'cone' });
        } else {
            cyc.order = null; cyc.valid = false; cyc.kindLabel = cls.kind;
            reasons.push(`A finite-vertex cycle gave a ${cls.kind} transformation — not a valid fundamental domain at this radius.`);
        }
    }
    const certified = cycles.every(c => c.valid);
    if (!certified && reasons.length === 0) reasons.push('Some vertex-cycle angle sums did not match 2π/order — domain not yet exact.');

    return {
        certified, reasons, cycles, relations,
        presentation: certified ? buildPresentation(domain, cycles) : null,
    };

    function fail(msg) { return { certified: false, reasons: [msg], cycles: [] }; }
}

function buildPresentation(domain, cycles) {
    // generators: one per side-pairing class
    const { sides } = domain;
    const seen = new Set(); const gens = [];
    for (const s of sides) {
        if (seen.has(s.key) || seen.has(s.partnerKey)) continue;
        seen.add(s.key); seen.add(s.partnerKey);
        gens.push({ word: domain.wordStr(s.word), self: s.selfPaired });
    }
    const relations = [];
    for (const g of gens) if (g.self) relations.push(`(${g.word})² = 1`);
    for (const c of cycles) {
        if (c.order && c.order !== 1 && c.order !== Infinity) relations.push(`cycle of order ${c.order}`);
    }
    return { generators: gens.map(g => g.word), relations, genCount: gens.length };
}
