/** A bounded tree of hyperbolic 3-spaces over Q(i) or Q(omega).
 * The cusp arithmetic is shared with the desktop 2dimFields viewer. Frames
 * follow its ball layout: u points at infinity, back toward the parent.
 */
import { FIELDS, cusps } from '../../../GeometryofLinearGroups/Algebraic/Tools/2dimFields/js/fieldK.js';
import { makeKEngine } from '../../../GeometryofLinearGroups/Algebraic/Tools/2dimFields/js/kengine.js';

const engines = new Map();
export function ballEngine(field) {
    if (!Object.hasOwn(FIELDS, field)) throw new Error(`Unsupported ball field: ${field}`);
    if (!engines.has(field)) engines.set(field, makeKEngine(field));
    return engines.get(field);
}
const add = (a, b) => a.map((v, i) => v + b[i]);
const scale = (a, s) => a.map(v => v * s);
const dot = (a, b) => a.reduce((sum, v, i) => sum + v * b[i], 0);
const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
export const ballDirection = (F, d) => add(add(scale(F.e1, d[0]), scale(F.e2, d[1])), scale(F.u, d[2]));
export const baseBall = () => ({ ball: true, c: [0,0,0], R: 1, u: [0,1,0], e1: [1,0,0], e2: [0,0,-1] });

function childFrame(F, cusp, settings, base) {
    const n = ballDirection(F, cusp.dir), u = scale(n, -1);
    const r = settings.lam * cusp.D / 2 * F.R;
    const ell = base ? Math.sqrt(cusp.D) : 1 / cusp.absq;
    const gap = settings.edges === 'zero' ? 0 : Math.abs(settings.h) * (settings.edges === 'levels' ? 1 : ell * F.R);
    let e1 = add(F.e1, scale(u, -dot(F.e1, u)));
    if (Math.hypot(...e1) < 1e-6) e1 = add(F.e2, scale(u, -dot(F.e2, u)));
    e1 = scale(e1, 1 / Math.hypot(...e1));
    return { F: { ball: true, c: add(F.c, scale(n, F.R + gap + r)), R: r, u, e1, e2: cross(u, e1) }, gap };
}

/** Frame at a path of exact K labels, including paths outside the displayed patch. */
export function getBallFrame(labels, settings) {
    const engine = ballEngine(settings.field);
    let out = { F: baseBall(), gap: 0 };
    labels.forEach((label, i) => { out = childFrame(out.F, engine.cuspOfLabel(label), settings, i === 0); });
    return out;
}

/** Build largest balls first to spend the finite rendering budget on visible geometry. */
export function buildBallTree(settings, cap = 1200, minRadius = .01) {
    const engine = ballEngine(settings.field), K = FIELDS[settings.field];
    const rootCusps = cusps(K, settings.N, true), childCusps = cusps(K, settings.N, false);
    const recs = [{ F: baseBall(), labels: [], parent: -1, gap: 0, depth: 0 }];
    const heap = [];
    // Each parent offers children in decreasing size. This bounds the frontier
    // while still keeping the largest candidates globally at the top.
    const offer = (parent, index) => {
        const p = recs[parent], list = p.depth === 0 ? rootCusps : childCusps, cusp = list[index];
        if (!cusp) return;
        const r = settings.lam * cusp.D / 2 * p.F.R;
        if (r < minRadius) return;
        const item = { parent, index, cusp, r };
        heap.push(item);
        for (let i = heap.length - 1; i > 0;) {
            const j = (i - 1) >> 1;
            if (heap[j].r >= item.r) break;
            heap[i] = heap[j]; i = j; heap[i] = item;
        }
    };
    const pop = () => {
        const top = heap[0], last = heap.pop();
        if (heap.length) {
            let i = 0;
            while (true) {
                const l = i * 2 + 1, r = l + 1;
                if (l >= heap.length) break;
                const j = r < heap.length && heap[r].r > heap[l].r ? r : l;
                if (heap[j].r <= last.r) break;
                heap[i] = heap[j]; i = j;
            }
            heap[i] = last;
        }
        return top;
    };
    if (settings.depth > 0) offer(0, 0);
    while (heap.length && recs.length < cap) {
        const item = pop(), p = recs[item.parent];
        offer(item.parent, item.index + 1);
        const { F, gap } = childFrame(p.F, item.cusp, settings, p.depth === 0);
        const rec = { F, gap, labels: [...p.labels, engine.labelOfCusp(item.cusp)], parent: item.parent, depth: p.depth + 1 };
        const index = recs.push(rec) - 1;
        if (rec.depth < settings.depth) offer(index, 0);
    }
    return { recs, truncated: heap.length > 0 };
}
