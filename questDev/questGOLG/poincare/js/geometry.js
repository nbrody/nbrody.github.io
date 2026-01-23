/**
 * Geometry module: CPU-side SDF functions and ray marching for picking
 */

import * as THREE from 'https://cdn.skypack.dev/three@0.136.0';

// Constants
const CPU_MAX_STEPS = 200;
const CPU_MAX_DIST = 10.0;
const CPU_HIT_THRESHOLD = 0.001;
const CPU_EPS = 0.00075;

// Ray-sphere intersection
export function raySphereIntersectCPU(ro, rd, r = 1.0) {
    const b = ro.dot(rd);
    const c = ro.dot(ro) - r * r;
    const h = b * b - c;
    if (h < 0) return null;
    const s = Math.sqrt(h);
    return { t0: -b - s, t1: -b + s };
}

// Scene SDF with face ID reporting
export function sceneSDFWithIdCPU(p, sphereCenters, sphereRadii, planeNormals) {
    let maxVal = -CPU_MAX_DIST;
    let faceId = -1;

    // 1) spheres
    for (let i = 0; i < sphereCenters.length; i++) {
        const c = sphereCenters[i];
        const r = sphereRadii[i];
        const dist_to_sphere = p.clone().sub(c).length() - r;
        const sdf = -dist_to_sphere; // inside > 0
        if (sdf > maxVal) { maxVal = sdf; faceId = i; }
    }

    // 2) planes
    for (let j = 0; j < planeNormals.length; j++) {
        const n = planeNormals[j];
        const sdf = p.dot(n);
        if (sdf > maxVal) { maxVal = sdf; faceId = sphereCenters.length + j; }
    }

    return { sdf: maxVal, id: faceId };
}

// Scene SDF returning top 2 faces
export function sceneSDFTop2CPU(p, sphereCenters, sphereRadii, planeNormals) {
    let bestVal = -CPU_MAX_DIST, bestId = -1;
    let secondVal = -CPU_MAX_DIST, secondId = -1;

    // spheres
    for (let i = 0; i < sphereCenters.length; i++) {
        const c = sphereCenters[i];
        const r = sphereRadii[i];
        const dist_to_sphere = p.clone().sub(c).length() - r;
        const sdf = -dist_to_sphere;
        if (sdf > bestVal) {
            secondVal = bestVal; secondId = bestId;
            bestVal = sdf; bestId = i;
        } else if (sdf > secondVal) {
            secondVal = sdf; secondId = i;
        }
    }

    // planes (IDs offset by spheres count)
    const offset = sphereCenters.length;
    for (let j = 0; j < planeNormals.length; j++) {
        const n = planeNormals[j];
        const sdf = p.dot(n);
        const fid = offset + j;
        if (sdf > bestVal) {
            secondVal = bestVal; secondId = bestId;
            bestVal = sdf; bestId = fid;
        } else if (sdf > secondVal) {
            secondVal = sdf; secondId = fid;
        }
    }

    return { bestVal, bestId, secondVal, secondId };
}

// Scene SDF returning top 3 faces
export function sceneSDFTop3CPU(p, sphereCenters, sphereRadii, planeNormals) {
    const vals = [];
    for (let i = 0; i < sphereCenters.length; i++) {
        const c = sphereCenters[i];
        const r = sphereRadii[i];
        const dist_to_sphere = p.clone().sub(c).length() - r;
        const sdf = -dist_to_sphere;
        vals.push({val:sdf, id:i});
    }
    const offset = sphereCenters.length;
    for (let j = 0; j < planeNormals.length; j++) {
        const n = planeNormals[j];
        const sdf = p.dot(n);
        vals.push({val:sdf, id:offset + j});
    }
    vals.sort((a,b) => b.val - a.val);
    const a = vals[0] || {val:-1e9, id:-1};
    const b = vals[1] || {val:-1e9, id:-1};
    const c = vals[2] || {val:-1e9, id:-1};
    return {bestVal:a.val, bestId:a.id, secondVal:b.val, secondId:b.id, thirdVal:c.val, thirdId:c.id};
}

// Compute normal at point p
export function getNormalCPU(p, sphereCenters, sphereRadii, planeNormals) {
    const ex = new THREE.Vector3(CPU_HIT_THRESHOLD, 0, 0);
    const ey = new THREE.Vector3(0, CPU_HIT_THRESHOLD, 0);
    const ez = new THREE.Vector3(0, 0, CPU_HIT_THRESHOLD);
    const d = sceneSDFWithIdCPU(p, sphereCenters, sphereRadii, planeNormals).sdf;
    const nx = d - sceneSDFWithIdCPU(p.clone().sub(ex), sphereCenters, sphereRadii, planeNormals).sdf;
    const ny = d - sceneSDFWithIdCPU(p.clone().sub(ey), sphereCenters, sphereRadii, planeNormals).sdf;
    const nz = d - sceneSDFWithIdCPU(p.clone().sub(ez), sphereCenters, sphereRadii, planeNormals).sdf;
    return new THREE.Vector3(nx, ny, nz).normalize();
}

// Compute ray from mouse position
export function computeRayFromMouse(clientX, clientY, renderer, camera) {
    const rect = renderer.domElement.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((clientY - rect.top) / rect.height) * 2 + 1;
    // replicate shader math: get world-space near/far points then rd
    const invViewProj = new THREE.Matrix4().multiplyMatrices(camera.matrixWorld, camera.projectionMatrixInverse);
    const pNear4 = new THREE.Vector4(x, y, -1, 1).applyMatrix4(invViewProj);
    const pFar4 = new THREE.Vector4(x, y, 1, 1).applyMatrix4(invViewProj);
    const pNear = new THREE.Vector3(pNear4.x / pNear4.w, pNear4.y / pNear4.w, pNear4.z / pNear4.w);
    const pFar = new THREE.Vector3(pFar4.x / pFar4.w, pFar4.y / pFar4.w, pFar4.z / pFar4.w);
    const ro = camera.position.clone();
    const rd = pFar.clone().sub(ro).normalize();
    return { ro, rd };
}

// Compute hyperbolic dihedral angle between two faces
export function computeDihedralAngle(faceA, faceB, sphereCenters, sphereRadii, planeNormals) {
    // Minkowski inner product with signature (+,+,+,-)
    function minkowskiDot(v1, v2) {
        return v1.x * v2.x + v1.y * v2.y + v1.z * v2.z - v1.w * v2.w;
    }

    const numSpheres = sphereCenters.length;
    function hyperbolicVector(fid) {
        if (fid < numSpheres) {
            const c = sphereCenters[fid];
            const r = sphereRadii[fid];
            const t = Math.sqrt(c.lengthSq() - r * r);
            return new THREE.Vector4(c.x, c.y, c.z, t);
        } else {
            const j = fid - numSpheres;
            const n = planeNormals[j];
            return new THREE.Vector4(n.x, n.y, n.z, 0);
        }
    }

    const v1 = hyperbolicVector(faceA);
    const v2 = hyperbolicVector(faceB);

    const g11 = minkowskiDot(v1, v1);
    const g22 = minkowskiDot(v2, v2);
    const g12 = minkowskiDot(v1, v2);

    // Hyperbolic dihedral angle formula:
    const cosTheta = -g12 / Math.sqrt(Math.abs(g11 * g22));
    const clamped = Math.min(1.0, Math.max(-1.0, cosTheta));
    return Math.acos(clamped); // radians
}
