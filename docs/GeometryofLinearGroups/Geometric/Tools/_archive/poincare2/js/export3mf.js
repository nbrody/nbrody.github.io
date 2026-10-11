/**
 * 3MF export: triangulate the canonical domain boundary and download as .3mf.
 *
 * The domain is convex (intersection of half-spaces with the unit ball) and
 * contains the basepoint, so every ray from the basepoint crosses the boundary
 * exactly once — we project the vertices of a subdivided icosahedron radially
 * onto the boundary by bisection. This yields a watertight indexed mesh.
 */

import * as THREE from 'three';
import { wallSD } from './math.js';

// Signed distance to the domain: negative inside, positive outside.
function domainSDF(p, walls) {
    let d = p.length() - 1.0;
    for (const w of walls) {
        const dw = wallSD(p, w.geom);
        if (dw > d) d = dw;
    }
    return d;
}

// Find t > 0 with sdf(origin + t·dir) = 0 by expansion + bisection.
function projectToBoundary(origin, dir, walls) {
    const at = (t) => origin.clone().addScaledVector(dir, t);
    let lo = 0, hi = 0.25;
    while (domainSDF(at(hi), walls) < 0 && hi < 4.0) {
        lo = hi;
        hi *= 1.6;
    }
    for (let i = 0; i < 48; i++) {
        const mid = (lo + hi) / 2;
        if (domainSDF(at(mid), walls) < 0) lo = mid;
        else hi = mid;
    }
    return at((lo + hi) / 2);
}

// Unit icosahedron, subdivided `detail` times (midpoints reprojected to the
// sphere), with shared vertices so the projected mesh stays watertight.
function buildUnitSphereMesh(detail) {
    const t = (1 + Math.sqrt(5)) / 2;
    let verts = [
        [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
        [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
        [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]
    ].map(v => new THREE.Vector3(...v).normalize());
    let faces = [
        [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
        [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
        [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
        [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]
    ];

    for (let s = 0; s < detail; s++) {
        const cache = new Map();
        const midpoint = (a, b) => {
            const key = a < b ? `${a}_${b}` : `${b}_${a}`;
            if (cache.has(key)) return cache.get(key);
            const idx = verts.length;
            verts.push(verts[a].clone().add(verts[b]).normalize());
            cache.set(key, idx);
            return idx;
        };
        const next = [];
        for (const [a, b, c] of faces) {
            const ab = midpoint(a, b), bc = midpoint(b, c), ca = midpoint(c, a);
            next.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
        }
        faces = next;
    }
    return { verts, faces };
}

function meshTo3MFBlob(positions, faces, scale) {
    let verticesXML = '';
    for (const p of positions) {
        verticesXML += `<vertex x="${(p.x * scale).toFixed(5)}" y="${(p.y * scale).toFixed(5)}" z="${(p.z * scale).toFixed(5)}"/>\n`;
    }
    let trianglesXML = '';
    for (const [a, b, c] of faces) {
        trianglesXML += `<triangle v1="${a}" v2="${b}" v3="${c}"/>\n`;
    }

    const modelXML = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
  <resources>
    <object id="1" type="model">
      <mesh>
        <vertices>
${verticesXML}</vertices>
        <triangles>
${trianglesXML}</triangles>
      </mesh>
    </object>
  </resources>
  <build><item objectid="1"/></build>
</model>`;

    const contentTypesXML = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>
</Types>`;

    const relsXML = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>
</Relationships>`;

    const zip = new window.JSZip();
    zip.file('[Content_Types].xml', contentTypesXML);
    zip.folder('_rels').file('.rels', relsXML);
    zip.folder('3D').file('3dmodel.model', modelXML);
    return zip.generateAsync({ type: 'blob' });
}

function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

/**
 * Export the current domain as a .3mf file.
 * @param {object} domain - result of computeCanonicalDomain (walls, basepoint)
 * @param {object} opts - { detail (icosahedron subdivisions), scaleMM }
 */
export async function exportDomainAs3MF(domain, opts = {}) {
    if (!domain || !domain.walls || domain.walls.length === 0) {
        throw new Error('No domain to export — compute a domain first.');
    }
    if (!window.JSZip) {
        throw new Error('JSZip failed to load — check your network connection.');
    }
    const detail = opts.detail ?? 6;
    const scaleMM = opts.scaleMM ?? 50.0;

    const { verts, faces } = buildUnitSphereMesh(detail);

    // Project from the cone point (the perturbed basepoint): unlike the
    // basepoint itself, it is strictly interior to all walls, including the
    // stabilizer-cone walls that pass through the basepoint.
    const origin = (domain.conePoint || domain.basepoint).clone();
    const positions = verts.map(v => projectToBoundary(origin, v, domain.walls));

    const blob = await meshTo3MFBlob(positions, faces, scaleMM);
    downloadBlob(blob, 'canonical_domain.3mf');
    return { vertices: positions.length, triangles: faces.length };
}
