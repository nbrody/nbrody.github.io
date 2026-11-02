/**
 * The finite piece of the Bruhat–Tits tree that gets drawn: the convex hull
 * of the orbit together with the ray to ⌊0⌋ (so everything hangs from one
 * root), thickened by a ball of radius `radius` about every orbit vertex.
 *
 * A (q+1)-regular tree grows fast, so the thickening shrinks until the
 * picture fits in `budget` vertices; the radius actually used is reported.
 */

/** The level at which vt's ancestors meet the ray of balls ⌊0⌋_j. */
const meetLevel = (vt) => (vt.d.length ? vt.lo : vt.k);

export function generateTree(place, orbitVertices, { radius = 2, budget = 2400, hullBudget = 6000 } = {}) {
    let verts = orbitVertices.slice();
    let orbitTruncated = false;
    // The hull alone must fit: keep the orbit points nearest the first one.
    const hullOf = (vs, rootK) => {
        const ids = new Map();
        for (const v of vs) {
            for (let u = v; ; u = place.parent(u)) {
                const id = place.id(u);
                if (ids.has(id)) break;
                ids.set(id, u);
                if (u.k <= rootK) break;
            }
        }
        return ids;
    };
    const minMeet = (vs) => { let m = Infinity; for (const v of vs) m = Math.min(m, meetLevel(v)); return m; };
    const rootLevel = (vs, r) => minMeet(vs) - r;

    let rootK = rootLevel(verts, radius);
    let hull = hullOf(verts, rootK);
    if (hull.size > hullBudget && verts.length > 1) {
        const base = verts[0];
        verts.sort((a, b) => place.dist(base, a) - place.dist(base, b));
        let lo = 1, hi = verts.length;
        while (lo < hi) {                       // largest prefix whose hull fits
            const mid = Math.ceil((lo + hi) / 2);
            const vs = verts.slice(0, mid);
            if (hullOf(vs, rootLevel(vs, radius)).size <= hullBudget) lo = mid; else hi = mid - 1;
        }
        verts = verts.slice(0, lo);
        orbitTruncated = true;
        rootK = rootLevel(verts, radius);
        hull = hullOf(verts, rootK);
    }

    // Thicken by balls, shrinking the radius until it fits: everything within distance r of
    // the orbit, by one breadth-first search from all of it at once. The search runs through
    // hull vertices too (marking them as already drawn must not stop it, or the branches
    // beyond them, such as the way up towards ∞, stay bare).
    let used = radius, included = null;
    for (let r = radius; r >= 0; r--) {
        const inc = new Map(hull);
        const seen = new Set();
        let frontier = [];
        for (const v of verts) {
            const id = place.id(v);
            if (!seen.has(id)) { seen.add(id); frontier.push(v); }
        }
        let ok = true;
        for (let s = 0; s < r && ok; s++) {
            const next = [];
            for (const u of frontier) {
                for (const w of place.neighbors(u)) {
                    if (w.k < rootK) continue;
                    const id = place.id(w);
                    if (seen.has(id)) continue;
                    seen.add(id);
                    next.push(w);
                    if (!inc.has(id)) inc.set(id, w);
                }
                if (inc.size > budget) { ok = false; break; }
            }
            frontier = next;
        }
        if (ok || r === 0) { used = r; included = inc; break; }
    }
    // A shorter thickening does not need levels as far up.
    const top = minMeet(verts) - used;
    if (top > rootK) {
        for (const [id, u] of included) if (u.k < top) included.delete(id);
        rootK = top;
    }

    const root = { k: rootK, lo: rootK, d: [] };
    const build = (vt) => {
        const node = { id: place.id(vt), k: vt.k, vt, children: [] };
        for (const c of place.children(vt)) {
            const cid = place.id(c);
            if (included.has(cid)) node.children.push(build(included.get(cid)));
        }
        return node;
    };
    return {
        root: build(root),
        size: included.size,
        radius: used,
        requestedRadius: radius,
        orbitShown: verts.length,
        orbitTruncated,
    };
}
