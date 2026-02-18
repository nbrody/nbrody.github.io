// ─────────────────────────────────────────────────
// Pure geometry: octagon, folding, creasing
// ─────────────────────────────────────────────────

import * as THREE from 'three';

// ── Octagon from unit square ─────────────────────

export function getOctagonVertices(corners, a, b, c, d) {
    const params = [a, b, c, d];
    const octagon = [];

    for (let i = 0; i < 4; i++) {
        const v1 = corners[i];
        const v2 = corners[(i + 1) % 4];

        // Corner vertex
        octagon.push([v1[0], v1[1]]);

        // Midpoint
        const mx = (v1[0] + v2[0]) / 2;
        const my = (v1[1] + v2[1]) / 2;

        // Inward normal (assuming CCW corners)
        const dx = v2[0] - v1[0];
        const dy = v2[1] - v1[1];
        const len = Math.sqrt(dx * dx + dy * dy);

        // Unit inward normal n = (-dy/len, dx/len)
        const nx = -dy / len;
        const ny = dx / len;

        // Interior point Pa, Pb, Pc, Pd
        octagon.push([
            mx + params[i] * nx,
            my + params[i] * ny
        ]);
    }

    return octagon;
}

export function getEdgePairs(colors) {
    return [
        { edges: [0, 1], color: colors[0] },
        { edges: [2, 3], color: colors[1] },
        { edges: [4, 5], color: colors[2] },
        { edges: [6, 7], color: colors[3] },
    ];
}

// Flap i: triangle at corner i, hinged on edge between adjacent interior pts
export const FLAP_DEFS = [
    { corner: 0, h1: 3, h2: 0 }, // V0: hinge Pd→Pa
    { corner: 1, h1: 0, h2: 1 }, // V1: hinge Pa→Pb
    { corner: 2, h1: 1, h2: 2 }, // V2: hinge Pb→Pc
    { corner: 3, h1: 2, h2: 3 }, // V3: hinge Pc→Pd
];

// ── Coordinate transforms ────────────────────────

// 2D [x,y] in unit square → centered 3D (x→X, y→−Z, Y=0)
export function to3D(p) {
    return new THREE.Vector3(p[0] - 0.5, 0, -(p[1] - 0.5));
}

// ── Rodrigues rotation ───────────────────────────

export function rodrigues(v, k, theta) {
    const c = Math.cos(theta), s = Math.sin(theta);
    const dot = v.dot(k);
    const cross = new THREE.Vector3().crossVectors(k, v);
    return v.clone().multiplyScalar(c)
        .add(cross.multiplyScalar(s))
        .add(k.clone().multiplyScalar(dot * (1 - c)));
}

// ── Fold a corner about a hinge edge ─────────────

export function foldCorner(cornerFlat, h1, h2, angle) {
    const axis = new THREE.Vector3().subVectors(h2, h1).normalize();
    const rel = new THREE.Vector3().subVectors(cornerFlat, h1);
    const along = axis.clone().multiplyScalar(rel.dot(axis));
    const perp = new THREE.Vector3().subVectors(rel, along);

    const up = new THREE.Vector3().crossVectors(axis, perp);
    const sign = up.y >= 0 ? 1 : -1;

    const rotPerp = rodrigues(perp, axis, sign * angle);
    return h1.clone().add(along).add(rotPerp);
}

// ── Apply diagonal crease to interior points ─────
//
// creaseType 'ac': fold along Pa–Pc diagonal; Pd moves
// creaseType 'bd': fold along Pb–Pd diagonal; Pc moves
//
// Returns new array of 4 interior points (cloned).

export function applyCrease(interior, creaseType, creaseAngle) {
    const result = interior.map(p => p.clone());
    if (creaseType === 'none' || Math.abs(creaseAngle) < 1e-6) return result;

    if (creaseType === 'ac') {
        // Crease axis: Pa(0) → Pc(2). Move Pd(3).
        const pa = result[0], pc = result[2], pd = result[3];
        const axis = new THREE.Vector3().subVectors(pc, pa).normalize();
        const rel = new THREE.Vector3().subVectors(pd, pa);
        const rotRel = rodrigues(rel, axis, creaseAngle);
        result[3] = pa.clone().add(rotRel);
    } else if (creaseType === 'bd') {
        // Crease axis: Pb(1) → Pd(3). Move Pc(2).
        const pb = result[1], pd = result[3], pc = result[2];
        const axis = new THREE.Vector3().subVectors(pd, pb).normalize();
        const rel = new THREE.Vector3().subVectors(pc, pb);
        const rotRel = rodrigues(rel, axis, creaseAngle);
        result[2] = pb.clone().add(rotRel);
    }

    return result;
}

// Which flaps are on the "moving" side of a crease?
// These flaps' hinge edges involve the moved interior point,
// so they naturally follow the crease.
//
// 'ac' crease moves Pd(3): flaps with h1=3 or h2=3 → flaps 0 (h1=3) and 3 (h2=3)
// 'bd' crease moves Pc(2): flaps with h1=2 or h2=2 → flaps 2 (h1=1,h2=2) and 3 (h1=2,h2=3)
//   Actually flap 2 has h2=2, flap 3 has h1=2. So both.
//
// The flap corners on the moving side also need to move with the crease.

export function creaseCorner(cornerFlat, creaseType, creaseAngle, interior) {
    // For flaps on the moving side, the corner's "flat" position
    // also needs to be rotated by the crease.
    if (creaseType === 'ac') {
        const pa = interior[0], pc = interior[2];
        const axis = new THREE.Vector3().subVectors(pc, pa).normalize();
        const rel = new THREE.Vector3().subVectors(cornerFlat, pa);
        return pa.clone().add(rodrigues(rel, axis, creaseAngle));
    } else if (creaseType === 'bd') {
        const pb = interior[1], pd = interior[3];
        const axis = new THREE.Vector3().subVectors(pd, pb).normalize();
        const rel = new THREE.Vector3().subVectors(cornerFlat, pb);
        return pb.clone().add(rodrigues(rel, axis, creaseAngle));
    }
    return cornerFlat.clone();
}

// Determine if a flap is on the moving side of the crease
export function isFlapOnMovingSide(flapIdx, creaseType) {
    if (creaseType === 'ac') {
        // Pd(3) moves. Flaps touching index 3: flap 0 (h1=3), flap 3 (h2=3)
        return flapIdx === 0 || flapIdx === 3;
    } else if (creaseType === 'bd') {
        // Pc(2) moves. Flaps touching index 2: flap 2 (h2=2), flap 3 (h1=2)
        return flapIdx === 2 || flapIdx === 3;
    }
    return false;
}
