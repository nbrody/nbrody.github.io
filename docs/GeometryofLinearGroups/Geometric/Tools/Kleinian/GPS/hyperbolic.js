import * as THREE from 'three';

// ── Geodesic arc in Poincaré disk (returns array of [x,y] pairs) ──
export function geodesicArc2D(x1, y1, x2, y2, n = 48) {
    const cross = x1 * y2 - x2 * y1;
    const pts = [];
    if (Math.abs(cross) < 1e-8) {
        for (let i = 0; i <= n; i++) {
            const t = i / n;
            pts.push([x1 + t * (x2 - x1), y1 + t * (y2 - y1)]);
        }
        return pts;
    }
    const r1sq = x1 * x1 + y1 * y1, r2sq = x2 * x2 + y2 * y2;
    const A = x1, B = y1, C = (1 + r1sq) / 2;
    const D = x2 - x1, E = y2 - y1, F = (r2sq - r1sq) / 2;
    const det = A * E - B * D;
    const cx = (C * E - B * F) / det, cy = (A * F - C * D) / det;
    const R = Math.sqrt(cx * cx + cy * cy - 1);
    const a1 = Math.atan2(y1 - cy, x1 - cx);
    let da = Math.atan2(y2 - cy, x2 - cx) - a1;
    while (da > Math.PI) da -= 2 * Math.PI;
    while (da < -Math.PI) da += 2 * Math.PI;
    for (let i = 0; i <= n; i++) {
        const a = a1 + (i / n) * da;
        pts.push([cx + R * Math.cos(a), cy + R * Math.sin(a)]);
    }
    return pts;
}

// ── Reflection in the Poincaré disk ──
// Reflect point (x,y) in a geodesic.
// Geodesic specified as {type:'diameter', angle} or {type:'circle', cx, cy, R}
export function reflectPoint(x, y, wall) {
    if (wall.type === 'diameter') {
        const c2 = Math.cos(2 * wall.angle), s2 = Math.sin(2 * wall.angle);
        return [x * c2 + y * s2, x * s2 - y * c2];
    }
    const dx = x - wall.cx, dy = y - wall.cy;
    const d2 = dx * dx + dy * dy;
    if (d2 < 1e-14) return [x, y];
    const f = wall.R * wall.R / d2;
    return [wall.cx + dx * f, wall.cy + dy * f];
}

// ── Compute the geodesic wall (circle orthogonal to unit circle) through two points ──
export function wallThrough(x1, y1, x2, y2) {
    const cross = x1 * y2 - x2 * y1;
    if (Math.abs(cross) < 1e-8) {
        return { type: 'diameter', angle: Math.atan2(y1, x1) };
    }
    const r1sq = x1 * x1 + y1 * y1, r2sq = x2 * x2 + y2 * y2;
    const A = x1, B = y1, C = (1 + r1sq) / 2;
    const D = x2 - x1, E = y2 - y1, F = (r2sq - r1sq) / 2;
    const det = A * E - B * D;
    const cx = (C * E - B * F) / det, cy = (A * F - C * D) / det;
    const R = Math.sqrt(cx * cx + cy * cy - 1);
    return { type: 'circle', cx, cy, R };
}

// ── Reflect an entire polygon (array of [x,y]) in a wall ──
export function reflectPolygon(verts, wall) {
    return verts.map(([x, y]) => reflectPoint(x, y, wall));
}

// ── Build filled polygon geometry from vertices (in z=0 plane) ──
export function filledGeodesicPolygon(verts, arcSegs = 24) {
    const boundary = [];
    for (let i = 0; i < verts.length; i++) {
        const [x1, y1] = verts[i];
        const [x2, y2] = verts[(i + 1) % verts.length];
        const arc = geodesicArc2D(x1, y1, x2, y2, arcSegs);
        for (let j = 0; j < arc.length - 1; j++) boundary.push(arc[j]);
    }
    // Centroid
    let cx = 0, cy = 0;
    for (const [x, y] of boundary) { cx += x; cy += y; }
    cx /= boundary.length; cy /= boundary.length;
    // Fan triangulation
    const pos = [];
    for (let i = 0; i < boundary.length; i++) {
        const j = (i + 1) % boundary.length;
        pos.push(cx, cy, 0, boundary[i][0], boundary[i][1], 0, boundary[j][0], boundary[j][1], 0);
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geom.computeVertexNormals();
    return geom;
}

// ── Build geodesic polygon edges as a LineLoop ──
export function geodesicPolygonEdges(verts, arcSegs = 24) {
    const points = [];
    for (let i = 0; i < verts.length; i++) {
        const [x1, y1] = verts[i];
        const [x2, y2] = verts[(i + 1) % verts.length];
        const arc = geodesicArc2D(x1, y1, x2, y2, arcSegs);
        for (const [x, y] of arc) points.push(new THREE.Vector3(x, y, 0));
    }
    return new THREE.BufferGeometry().setFromPoints(points);
}

// ── Generate tiling by BFS reflections ──
export function generateTiling(seedVerts, walls, maxDepth = 5, clipFn = null) {
    const tiles = [seedVerts];
    const seen = new Set();
    seen.add(tileKey(seedVerts));
    let frontier = [seedVerts];

    for (let depth = 0; depth < maxDepth; depth++) {
        const next = [];
        for (const tile of frontier) {
            for (const wall of walls) {
                const reflected = reflectPolygon(tile, wall);
                // Check tile is inside unit disk
                const c = tileCentroid(reflected);
                if (c[0] * c[0] + c[1] * c[1] > 0.98) continue;
                if (clipFn && !clipFn(c[0], c[1])) continue;
                const key = tileKey(reflected);
                if (seen.has(key)) continue;
                seen.add(key);
                tiles.push(reflected);
                next.push(reflected);
            }
        }
        frontier = next;
        if (frontier.length === 0) break;
    }
    return tiles;
}

function tileCentroid(verts) {
    let x = 0, y = 0;
    for (const [vx, vy] of verts) { x += vx; y += vy; }
    return [x / verts.length, y / verts.length];
}

function tileKey(verts) {
    const c = tileCentroid(verts);
    return `${Math.round(c[0] * 1000)},${Math.round(c[1] * 1000)}`;
}

// ── Build boundary circle ──
export function buildBoundaryCircle() {
    const pts = [];
    for (let i = 0; i <= 128; i++) {
        const t = (i / 128) * Math.PI * 2;
        pts.push(new THREE.Vector3(Math.cos(t), Math.sin(t), 0));
    }
    return new THREE.BufferGeometry().setFromPoints(pts);
}

// ── Build a geodesic line across the full disk ──
export function buildGeodesicLine(wall) {
    const pts = [];
    if (wall.type === 'diameter') {
        const c = Math.cos(wall.angle), s = Math.sin(wall.angle);
        pts.push(new THREE.Vector3(-c, -s, 0));
        pts.push(new THREE.Vector3(c, s, 0));
    } else {
        // Intersect circle (cx,cy,R) with unit disk
        for (let i = 0; i <= 128; i++) {
            const t = (i / 128) * Math.PI * 2;
            const x = wall.cx + wall.R * Math.cos(t);
            const y = wall.cy + wall.R * Math.sin(t);
            if (x * x + y * y <= 1.001) {
                pts.push(new THREE.Vector3(x, y, 0));
            }
        }
    }
    return new THREE.BufferGeometry().setFromPoints(pts);
}

// ── 3D: Build Poincaré ball boundary sphere ──
export function buildBoundarySphere() {
    const geom = new THREE.SphereGeometry(1, 64, 64);
    const mat = new THREE.MeshPhysicalMaterial({
        color: 0x2a2a40, transparent: true, opacity: 0.05,
        roughness: 0.1, metalness: 0.3, side: THREE.BackSide, depthWrite: false,
    });
    return new THREE.Mesh(geom, mat);
}

// ── 3D: Build a totally geodesic plane (flat through origin) ──
export function buildTotallyGeodesicPlane(normal, color, radius = 1) {
    const group = new THREE.Group();
    const diskGeom = new THREE.CircleGeometry(radius, 64);
    const diskMat = new THREE.MeshPhysicalMaterial({
        color, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false,
    });
    const disk = new THREE.Mesh(diskGeom, diskMat);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
    disk.quaternion.copy(q);
    // Edge ring
    const ringPts = [];
    for (let i = 0; i <= 128; i++) {
        const t = (i / 128) * Math.PI * 2;
        ringPts.push(new THREE.Vector3(radius * Math.cos(t), radius * Math.sin(t), 0));
    }
    const ring = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(ringPts),
        new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.4 })
    );
    ring.quaternion.copy(q);
    group.add(disk); group.add(ring);
    return group;
}

// ── 3D: geodesic arc in Poincaré ball ──
export function geodesicArc3D(p1, p2, n = 32) {
    const pts = [];
    // For points in Poincaré ball, geodesic is part of circle orthogonal to boundary sphere
    // Simple approach: Möbius-correct interpolation
    for (let i = 0; i <= n; i++) {
        const t = i / n;
        // Use the Klein model interpolation then convert back
        // Klein coords: k = 2p/(1+|p|²)
        const r1sq = p1.lengthSq(), r2sq = p2.lengthSq();
        const k1 = p1.clone().multiplyScalar(2 / (1 + r1sq));
        const k2 = p2.clone().multiplyScalar(2 / (1 + r2sq));
        // Linear interpolation in Klein model (geodesics are straight lines there)
        const kLerp = k1.clone().multiplyScalar(1 - t).add(k2.clone().multiplyScalar(t));
        // Convert back to Poincaré: p = k/(1 + sqrt(1 - |k|²))
        const kLenSq = kLerp.lengthSq();
        if (kLenSq >= 1) { pts.push(kLerp.normalize().multiplyScalar(0.999)); continue; }
        const denom = 1 + Math.sqrt(Math.max(0, 1 - kLenSq));
        pts.push(kLerp.divideScalar(denom));
    }
    return pts;
}
