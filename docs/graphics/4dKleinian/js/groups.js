/**
 * Group model: turns a preset (either explicit mirrors in R^3 or a Coxeter
 * Gram matrix) into a normalised list of mirrors for the shader, together
 * with the diagnostics that say what kind of group it actually is.
 */

import {
    realizeGram,
    gramFromMirrors,
    vectorToMirror,
    mirrorToVector,
    describePair,
    coxeterEntry,
    signature,
    isPositiveSemidefinite,
    isPositiveDefinite,
    boostToBasepoint,
    chamberPole,
    rotationSendingPoleToInfinity,
    solve,
    dot41
} from './inversive.js';

export const MAX_MIRRORS = 24;

/* ------------------------------------------------------------------ */
/* Gram matrices                                                       */
/* ------------------------------------------------------------------ */

export function gramFromLabels(labels) {
    const n = labels.length;
    return Array.from({ length: n }, (_, i) =>
        Array.from({ length: n }, (_, j) => (i === j ? 1 : coxeterEntry(labels[i][j])))
    );
}

/**
 * `relations` is a symmetric array of entries of the form
 *   { type: 'angle', m }        dihedral angle pi/m
 *   { type: 'tangent' }         tangent mirrors, m = infinity
 *   { type: 'disjoint', d }     ultraparallel, hyperbolic distance d
 */
export function gramFromRelations(relations) {
    const n = relations.length;
    return Array.from({ length: n }, (_, i) =>
        Array.from({ length: n }, (_, j) => {
            if (i === j) return 1;
            const rel = relations[i][j];
            if (!rel || rel.type === 'angle') return coxeterEntry(rel ? rel.m : 2);
            if (rel.type === 'tangent') return -1;
            if (rel.type === 'raw') return rel.value;
            return -Math.cosh(Math.max(0, rel.d));
        })
    );
}

export function relationsFromGram(gram) {
    const n = gram.length;
    return Array.from({ length: n }, (_, i) =>
        Array.from({ length: n }, (_, j) => {
            if (i === j) return null;
            const info = describePair(gram[i][j]);
            if (info.relation === 'intersecting' && info.isCoxeter) {
                return { type: 'angle', m: info.order };
            }
            if (info.relation === 'tangent') return { type: 'tangent' };
            if (info.relation === 'disjoint') return { type: 'disjoint', d: info.distance };
            return { type: 'raw', value: gram[i][j] };
        })
    );
}

/* ------------------------------------------------------------------ */
/* Normalisation                                                       */
/* ------------------------------------------------------------------ */

/** The point of H^4 equidistant from every mirror, when it exists. */
function chamberBasepoint(gram, vectors) {
    const n = gram.length;
    const candidates = [];

    const a = solve(gram, new Array(n).fill(-1));
    if (a) candidates.push(a);
    candidates.push(new Array(n).fill(-1));

    for (const coeffs of candidates) {
        const x = [0, 0, 0, 0, 0];
        coeffs.forEach((coefficient, i) => {
            for (let k = 0; k < 5; k++) x[k] += coefficient * vectors[i][k];
        });
        const norm2 = dot41(x, x);
        if (norm2 < -1e-9) {
            const scale = 1 / Math.sqrt(-norm2);
            const signed = x.map((value) => value * scale);
            return signed[4] > 0 ? signed : signed.map((value) => -value);
        }
    }
    return null;
}

/**
 * Put the chamber basepoint at the standard point of H^4 for conditioning,
 * then rotate so that the deepest boundary point of the chamber becomes the
 * point at infinity of R^3.
 */
function normalizeVectors(gram, vectors) {
    const basepoint = chamberBasepoint(gram, vectors);
    let out = vectors;
    if (basepoint) {
        const boost = boostToBasepoint(basepoint);
        out = out.map(boost);
    }
    let best = chamberPole(out);
    if (best.clearance <= 1e-4) {
        // The chamber has no boundary point, as happens for a cocompact group.
        // Send infinity deep inside a single mirror instead, so that one mirror
        // becomes the enclosing sphere and the rest sit inside it.
        for (let index = 0; index < out.length; index++) {
            const candidate = chamberPole(out, index);
            if (candidate.clearance > best.clearance) best = candidate;
        }
    }
    const rotate = rotationSendingPoleToInfinity(best.pole);
    return out.map(rotate);
}

/** Similarity of R^3 taking the configuration into a unit-ish ball. */
function recenterMirrors(mirrors) {
    const spheres = mirrors.filter((m) => m.kind === 'sphere');
    if (spheres.length === 0) return mirrors;

    const inner = spheres.filter((m) => m.r < 0);
    let center;
    let radius;

    if (inner.length > 0) {
        // the chamber sits inside these, so they bound everything of interest
        const pick = inner.reduce((best, m) => (Math.abs(m.r) < Math.abs(best.r) ? m : best));
        center = pick.c.slice();
        radius = Math.abs(pick.r);
    } else {
        const positive = spheres.filter((m) => m.r > 0);
        center = [0, 1, 2].map(
            (k) => positive.reduce((sum, m) => sum + m.c[k], 0) / Math.max(positive.length, 1)
        );
        radius = positive.reduce(
            (max, m) => Math.max(max, Math.hypot(...m.c.map((v, k) => v - center[k])) + m.r),
            0
        );
    }

    if (!(radius > 0) || !isFinite(radius)) return mirrors;
    const scale = 1 / radius;

    return mirrors.map((m) => {
        if (m.kind === 'plane') {
            return { kind: 'plane', n: m.n.slice(), h: (m.h - dot3(m.n, center)) * scale };
        }
        return {
            kind: 'sphere',
            c: m.c.map((value, k) => (value - center[k]) * scale),
            r: m.r * scale
        };
    });
}

function dot3(a, b) {
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/* ------------------------------------------------------------------ */
/* Diagnostics                                                         */
/* ------------------------------------------------------------------ */

function subGram(gram, keep) {
    return keep.map((i) => keep.map((j) => gram[i][j]));
}

/**
 * Poincare / Vinberg angle condition: every pair of mirrors either meets at
 * an angle pi/m with m an integer at least 2, or does not meet at all.
 * When it holds the reflections generate a discrete group with the chamber
 * as fundamental domain.
 */
export function analyzeGram(gram) {
    const n = gram.length;
    const sig = signature(gram);
    const pairs = [];
    let discrete = true;
    let cusped = false;
    let allSeparated = true;
    let minProduct = Infinity;

    for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
            const info = describePair(gram[i][j]);
            pairs.push({ i, j, ...info });
            minProduct = Math.min(minProduct, gram[i][j]);
            if (info.relation === 'intersecting') {
                allSeparated = false;
                if (!info.isCoxeter) discrete = false;
            } else if (info.relation === 'tangent') {
                cusped = true;
            } else if (info.relation === 'nested') {
                discrete = false;
                allSeparated = false;
            }
        }
    }

    const realizable = sig.positive <= 4 && sig.negative <= 1;
    const hyperbolic = sig.negative === 1;
    const rank = sig.positive + sig.negative;

    // covolume type from the facet subdiagrams (only meaningful for simplices)
    let volumeType = 'infinite';
    if (n === 5 && hyperbolic && sig.positive === 4) {
        let elliptic = true;
        let ok = true;
        for (let drop = 0; drop < n; drop++) {
            const keep = [0, 1, 2, 3, 4].filter((i) => i !== drop);
            const sub = subGram(gram, keep);
            if (!isPositiveSemidefinite(sub)) {
                ok = false;
                break;
            }
            if (!isPositiveDefinite(sub)) elliptic = false;
        }
        if (ok) volumeType = elliptic ? 'compact' : 'finite';
    }

    // The mirrors span a subspace of rank `rank` in R^{4,1}.  Rank 5 means the
    // group is genuinely four-dimensional; rank 4 means every mirror is
    // orthogonal to one common sphere, so the group is conjugate into
    // Isom(H^3) and its limit set lies on a 2-sphere; rank 3 gives a circle.
    const invariantSphere = rank <= 4 ? { dimension: rank - 2 } : null;

    return {
        signature: sig,
        rank,
        invariantSphere,
        realizable,
        hyperbolic,
        discrete,
        cusped,
        schottky: allSeparated,
        volumeType,
        minProduct,
        pairs
    };
}

/* ------------------------------------------------------------------ */
/* Building a renderable configuration                                 */
/* ------------------------------------------------------------------ */

function scaleMirrorRadii(mirrors, factor) {
    if (Math.abs(factor - 1) < 1e-9) return mirrors;
    return mirrors.map((m) => {
        if (m.kind === 'plane') return m;
        return { kind: 'sphere', c: m.c.slice(), r: m.r * factor };
    });
}

/**
 * Estimate where the limit set actually lives by playing the chaos game:
 * repeatedly apply a random generator (never the same one twice in a row,
 * since every generator is an involution).  The walk is attracted to the
 * limit set, so the cloud it leaves behind measures the extent of the object
 * we are really trying to look at, which is usually much smaller than the
 * mirror configuration itself.
 */
export function limitSetBounds(mirrors, seed = 12345) {
    const spheres = mirrors.filter((m) => m.kind === 'sphere');
    if (spheres.length < 2) return null;

    // deterministic generator so the framing does not jitter between reloads
    let rngState = seed >>> 0;
    const random = () => {
        rngState = (rngState * 1664525 + 1013904223) >>> 0;
        return rngState / 4294967296;
    };

    const cloud = [];
    const limit = 40;

    for (let run = 0; run < 8; run++) {
        let p = [random() * 2 - 1, random() * 2 - 1, random() * 2 - 1];
        let previous = -1;
        for (let step = 0; step < 900; step++) {
            let index = Math.floor(random() * spheres.length);
            if (index === previous) index = (index + 1) % spheres.length;
            previous = index;
            const m = spheres[index];
            const diff = [p[0] - m.c[0], p[1] - m.c[1], p[2] - m.c[2]];
            const d2 = Math.max(diff[0] ** 2 + diff[1] ** 2 + diff[2] ** 2, 1e-12);
            const scale = (m.r * m.r) / d2;
            p = [m.c[0] + diff[0] * scale, m.c[1] + diff[1] * scale, m.c[2] + diff[2] * scale];
            if (!isFinite(p[0]) || !isFinite(p[1]) || !isFinite(p[2])) break;
            if (Math.hypot(...p) > limit) break;
            if (step > 60) cloud.push(p);
        }
    }

    if (cloud.length < 100) return null;

    const center = [0, 1, 2].map((k) => cloud.reduce((sum, q) => sum + q[k], 0) / cloud.length);
    const radii = cloud
        .map((q) => Math.hypot(q[0] - center[0], q[1] - center[1], q[2] - center[2]))
        .sort((a, b) => a - b);
    const radius = radii[Math.min(radii.length - 1, Math.floor(radii.length * 0.995))];
    if (!(radius > 1e-6) || !isFinite(radius)) return null;
    return { center, radius, samples: cloud.length };
}

function similarity(mirrors, center, scale) {
    return mirrors.map((m) => {
        if (m.kind === 'plane') {
            return { kind: 'plane', n: m.n.slice(), h: (m.h - dot3(m.n, center)) * scale };
        }
        return {
            kind: 'sphere',
            c: m.c.map((value, k) => (value - center[k]) * scale),
            r: m.r * scale
        };
    });
}

/**
 * Bounding sphere for the part of R^3 the renderer needs to visit.
 * Mirrors whose chamber is their interior bound everything; otherwise the
 * limit set sits inside the union of the mirror balls.
 */
export function boundingSphere(mirrors) {
    const spheres = mirrors.filter((m) => m.kind === 'sphere');
    const inner = spheres.filter((m) => m.r < 0);
    if (inner.length > 0) {
        const pick = inner.reduce((best, m) => (Math.abs(m.r) < Math.abs(best.r) ? m : best));
        return { center: pick.c.slice(), radius: Math.abs(pick.r) * 1.001 };
    }

    const positive = spheres.filter((m) => m.r > 0);
    if (positive.length === 0 || mirrors.some((m) => m.kind === 'plane')) {
        return { center: [0, 0, 0], radius: 6 };
    }

    const center = [0, 1, 2].map(
        (k) => positive.reduce((sum, m) => sum + m.c[k], 0) / positive.length
    );
    const radius = positive.reduce(
        (max, m) => Math.max(max, Math.hypot(...m.c.map((v, k) => v - center[k])) + m.r),
        0
    );
    return { center, radius: radius * 1.001 };
}

/**
 * A point deep inside the fundamental chamber, used as the centre of the
 * inscribed-ball trap.  We take the boundary point that maximises the
 * minimum distance to the mirrors, found by a short multi-start search.
 */
export function chamberPoint(mirrors, bound) {
    // Rebuilding the same configuration must preserve its orbit seed.
    let rngState = 67890;
    const random = () => {
        rngState = (rngState * 1664525 + 1013904223) >>> 0;
        return rngState / 4294967296;
    };
    // The chamber usually runs off to infinity, and a seed placed out there
    // dominates the picture, so the search is confined to the region the
    // limit set actually occupies.
    const searchRadius = bound.radius;
    const clearance = (p) => {
        let best = searchRadius - Math.hypot(
            p[0] - bound.center[0],
            p[1] - bound.center[1],
            p[2] - bound.center[2]
        );
        for (const m of mirrors) {
            if (m.kind === 'plane') {
                best = Math.min(best, m.h - dot3(m.n, p));
            } else {
                const d = Math.hypot(p[0] - m.c[0], p[1] - m.c[1], p[2] - m.c[2]);
                best = Math.min(best, m.r > 0 ? d - m.r : -m.r - d);
            }
        }
        return best;
    };

    const inside = (p) =>
        Math.hypot(p[0] - bound.center[0], p[1] - bound.center[1], p[2] - bound.center[2]) <=
        searchRadius;

    let best = bound.center.slice();
    let bestValue = clearance(best);

    const samples = 900;
    for (let s = 0; s < samples; s++) {
        const u = 2 * random() - 1;
        const phi = 2 * Math.PI * random();
        const rho = searchRadius * Math.cbrt(random());
        const p = [
            bound.center[0] + rho * Math.sqrt(1 - u * u) * Math.cos(phi),
            bound.center[1] + rho * Math.sqrt(1 - u * u) * Math.sin(phi),
            bound.center[2] + rho * u
        ];
        const value = clearance(p);
        if (value > bestValue) {
            bestValue = value;
            best = p;
        }
    }

    // local refinement
    let step = searchRadius * 0.25;
    for (let round = 0; round < 60; round++) {
        let improved = false;
        for (const axis of [0, 1, 2]) {
            for (const sign of [1, -1]) {
                const p = best.slice();
                p[axis] += sign * step;
                if (!inside(p)) continue;
                const value = clearance(p);
                if (value > bestValue) {
                    bestValue = value;
                    best = p;
                    improved = true;
                }
            }
        }
        if (!improved) step *= 0.6;
        if (step < searchRadius * 1e-4) break;
    }

    return { point: best, clearance: bestValue };
}

/**
 * Build everything the renderer and the UI need from a preset plus the
 * live parameter values.
 */
export function buildConfiguration(preset, params = {}) {
    const radiusScale = params.radiusScale ?? 1;
    let mirrors;
    let baseGram;
    let realized = true;

    if (preset.relations) {
        const relations = params.relations || preset.relations;
        baseGram = gramFromRelations(relations);
        const vectors = realizeGram(baseGram);
        if (!vectors) {
            realized = false;
            mirrors = [];
        } else {
            mirrors = normalizeVectors(baseGram, vectors).map(vectorToMirror);
            mirrors = recenterMirrors(mirrors);
        }
    } else {
        mirrors = preset.mirrors.map((m) =>
            m.kind === 'plane'
                ? { kind: 'plane', n: m.n.slice(), h: m.h }
                : { kind: 'sphere', c: m.c.slice(), r: m.r }
        );
        mirrors = recenterMirrors(mirrors);
        baseGram = gramFromMirrors(mirrors);
    }

    let deformed = scaleMirrorRadii(mirrors, radiusScale);

    // Frame on the limit set rather than on the mirrors, so that every preset
    // arrives at the same apparent size.  When the limit set is the whole
    // 3-sphere, as it is for a cocompact group, the chaos game spreads out
    // past the mirrors and there is nothing to frame on, so we keep the
    // mirror configuration as the reference instead.
    const mirrorBound = deformed.length
        ? boundingSphere(deformed)
        : { center: [0, 0, 0], radius: 1 };
    const limitBounds = limitSetBounds(deformed);
    const framed = Boolean(limitBounds) && limitBounds.radius < mirrorBound.radius;
    if (framed) {
        deformed = similarity(deformed, limitBounds.center, 1 / limitBounds.radius);
    }
    const gram = deformed.length ? gramFromMirrors(deformed) : baseGram;
    const analysis = analyzeGram(gram);

    const raw = deformed.length ? boundingSphere(deformed) : { center: [0, 0, 0], radius: 1 };
    const frame = framed
        ? { center: [0, 0, 0], radius: 1 }
        : { center: raw.center.slice(), radius: raw.radius };
    // the marching clip has to contain both the limit set and the mirrors
    const bound = {
        center: framed ? [0, 0, 0] : raw.center.slice(),
        radius: Math.max(
            raw.radius + (framed ? Math.hypot(...raw.center) : 0),
            frame.radius * 1.05
        )
    };
    const trap = deformed.length ? chamberPoint(deformed, frame) : { point: [0, 0, 0], clearance: 0.2 };

    return {
        realized,
        mirrors: deformed,
        baseGram,
        gram,
        analysis,
        bound,
        frame,
        framed,
        trapCenter: trap.point,
        trapClearance: Math.max(trap.clearance, 1e-3)
    };
}

export { describePair };
