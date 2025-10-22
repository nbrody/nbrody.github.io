/**
 * 3MF Export module: Generate mesh from SDF and export to .3MF format
 */

import * as THREE from 'https://cdn.skypack.dev/three@0.136.0';
import { raySphereIntersectCPU, sceneSDFWithIdCPU } from './geometry.js';

// Import JSZip for creating .3MF archives
const JSZip = window.JSZip;

const CPU_MAX_STEPS = 200;
const CPU_MAX_DIST = 10.0;
const CPU_HIT_THRESHOLD = 0.001;

/**
 * Sample surface points by ray marching from many directions
 */
function sampleSurfacePoints(sphereCenters, sphereRadii, planeNormals, numSamples = 500) {
    const points = [];
    const phi = Math.PI * (3.0 - Math.sqrt(5.0)); // golden angle in radians

    for (let i = 0; i < numSamples; i++) {
        // Fibonacci sphere sampling
        const y = 1 - (i / (numSamples - 1)) * 2;
        const radius = Math.sqrt(1 - y * y);
        const theta = phi * i;
        const x = Math.cos(theta) * radius;
        const z = Math.sin(theta) * radius;

        const rd = new THREE.Vector3(x, y, z).normalize();
        const ro = new THREE.Vector3(0, 0, 0);

        // Ray march to find surface
        const span = raySphereIntersectCPU(ro, rd, 1.0);
        if (!span) continue;

        let t = Math.max(0, span.t0);
        let p = ro.clone().addScaledVector(rd, t);

        for (let step = 0; step < CPU_MAX_STEPS; step++) {
            if ((span.t1 > 0 && t > span.t1) || t > CPU_MAX_DIST) break;

            const { sdf } = sceneSDFWithIdCPU(p, sphereCenters, sphereRadii, planeNormals);

            if (Math.abs(sdf) < CPU_HIT_THRESHOLD) {
                points.push(p.clone());
                break;
            }

            const stepSize = Math.max(Math.abs(sdf), 0.001);
            t += stepSize;
            p.addScaledVector(rd, stepSize);
        }
    }

    return points;
}

/**
 * Manually subdivide a geometry by splitting each triangle into 4
 */
function subdivideGeometry(geometry) {
    const positions = geometry.attributes.position.array;
    const indices = geometry.index ? geometry.index.array : null;

    if (!indices) {
        console.error('Cannot subdivide non-indexed geometry');
        return geometry;
    }

    const newPositions = [];
    const newIndices = [];
    const midpointCache = new Map();

    // Helper to get or create midpoint vertex
    function getMidpoint(i1, i2) {
        const key = i1 < i2 ? `${i1}_${i2}` : `${i2}_${i1}`;
        if (midpointCache.has(key)) {
            return midpointCache.get(key);
        }

        const x1 = positions[i1 * 3], y1 = positions[i1 * 3 + 1], z1 = positions[i1 * 3 + 2];
        const x2 = positions[i2 * 3], y2 = positions[i2 * 3 + 1], z2 = positions[i2 * 3 + 2];

        // Midpoint
        let mx = (x1 + x2) / 2;
        let my = (y1 + y2) / 2;
        let mz = (z1 + z2) / 2;

        // Project onto unit sphere
        const len = Math.sqrt(mx * mx + my * my + mz * mz);
        mx /= len;
        my /= len;
        mz /= len;

        // Scale to original radius
        const radius = 0.8;
        mx *= radius;
        my *= radius;
        mz *= radius;

        const newIndex = newPositions.length / 3;
        newPositions.push(mx, my, mz);
        midpointCache.set(key, newIndex);
        return newIndex;
    }

    // Copy original vertices
    for (let i = 0; i < positions.length; i++) {
        newPositions.push(positions[i]);
    }

    // Subdivide each triangle
    for (let i = 0; i < indices.length; i += 3) {
        const v1 = indices[i];
        const v2 = indices[i + 1];
        const v3 = indices[i + 2];

        const m12 = getMidpoint(v1, v2);
        const m23 = getMidpoint(v2, v3);
        const m31 = getMidpoint(v3, v1);

        // Create 4 new triangles
        newIndices.push(v1, m12, m31);
        newIndices.push(v2, m23, m12);
        newIndices.push(v3, m31, m23);
        newIndices.push(m12, m23, m31);
    }

    const newGeometry = new THREE.BufferGeometry();
    newGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(newPositions), 3));
    newGeometry.setIndex(newIndices);

    return newGeometry;
}

/**
 * Create a triangulated mesh by starting with an icosahedron and projecting to surface
 */
function createMeshFromSurface(sphereCenters, sphereRadii, planeNormals) {
    console.log('Creating base icosahedron...');

    // Start with a basic icosahedron (Three.js only supports up to ~level 3-4)
    let baseGeometry = new THREE.IcosahedronGeometry(0.8, 3);

    console.log(`Initial geometry: ${baseGeometry.attributes.position.count} vertices`);

    // Manually subdivide MANY times to get ultra-high detail
    const manualSubdivisions = 4; // Each subdivision multiplies triangles by 4
    console.log(`Performing ${manualSubdivisions} manual subdivisions...`);

    for (let i = 0; i < manualSubdivisions; i++) {
        // Ensure geometry has indices before subdivision
        if (!baseGeometry.index) {
            const numVertices = baseGeometry.attributes.position.count;
            const indices = new Uint32Array(numVertices); // Use Uint32Array for large meshes
            for (let j = 0; j < numVertices; j++) {
                indices[j] = j;
            }
            baseGeometry.setIndex(new THREE.BufferAttribute(indices, 1));
        }

        baseGeometry = subdivideGeometry(baseGeometry);
        const vertCount = baseGeometry.attributes.position.count;
        const triCount = baseGeometry.index.count / 3;
        console.log(`  Subdivision ${i + 1}/${manualSubdivisions}: ${vertCount.toLocaleString()} vertices, ${triCount.toLocaleString()} triangles`);
    }

    console.log(`Base geometry created: ${baseGeometry.attributes.position.count} vertices`);
    console.log(`Base geometry has index: ${!!baseGeometry.index}`);

    if (baseGeometry.index) {
        console.log(`Base geometry indices: ${baseGeometry.index.count} (${baseGeometry.index.count / 3} triangles)`);
    } else {
        // Non-indexed geometry - vertices are in groups of 3 forming triangles
        console.log(`Non-indexed geometry: ${baseGeometry.attributes.position.count / 3} triangles`);
        console.log('Creating indices for non-indexed geometry...');

        // Create sequential indices: 0,1,2, 3,4,5, 6,7,8, ...
        const numVertices = baseGeometry.attributes.position.count;
        const indices = new Uint16Array(numVertices);
        for (let i = 0; i < numVertices; i++) {
            indices[i] = i;
        }
        baseGeometry.setIndex(new THREE.BufferAttribute(indices, 1));
        console.log(`Created ${indices.length} indices (${indices.length / 3} triangles)`);
    }

    const positions = baseGeometry.attributes.position.array;
    console.log(`Starting projection of ${positions.length / 3} vertices...`);

    // Project each vertex onto the polyhedron surface
    const projectedPositions = [];
    let successCount = 0;
    let fallbackCount = 0;
    const totalVertices = positions.length / 3;

    for (let i = 0; i < positions.length; i += 3) {
        // Progress logging every 10%
        const vertexIndex = i / 3;
        if (vertexIndex % Math.floor(totalVertices / 10) === 0) {
            const percent = Math.round((vertexIndex / totalVertices) * 100);
            console.log(`Projection progress: ${percent}% (${vertexIndex.toLocaleString()} / ${totalVertices.toLocaleString()} vertices)`);
        }

        const direction = new THREE.Vector3(
            positions[i],
            positions[i + 1],
            positions[i + 2]
        ).normalize();

        // Ray march from origin in this direction to find surface
        const ro = new THREE.Vector3(0, 0, 0);
        const rd = direction;

        const span = raySphereIntersectCPU(ro, rd, 1.0);
        if (!span) {
            // Fallback to original position
            projectedPositions.push(positions[i], positions[i + 1], positions[i + 2]);
            fallbackCount++;
            continue;
        }

        let t = Math.max(0.01, span.t0);
        let p = ro.clone().addScaledVector(rd, t);
        let found = false;

        for (let step = 0; step < CPU_MAX_STEPS; step++) {
            if ((span.t1 > 0 && t > span.t1) || t > CPU_MAX_DIST) break;

            const { sdf } = sceneSDFWithIdCPU(p, sphereCenters, sphereRadii, planeNormals);

            if (Math.abs(sdf) < CPU_HIT_THRESHOLD) {
                projectedPositions.push(p.x, p.y, p.z);
                found = true;
                successCount++;
                break;
            }

            const stepSize = Math.max(Math.abs(sdf), 0.001);
            t += stepSize;
            p.addScaledVector(rd, stepSize);
        }

        if (!found) {
            // Use a point closer to the surface
            const fallback = rd.clone().multiplyScalar(0.5);
            projectedPositions.push(fallback.x, fallback.y, fallback.z);
            fallbackCount++;
        }
    }

    console.log(`Projection complete: ${successCount} successful, ${fallbackCount} fallbacks, ${projectedPositions.length / 3} total vertices`);

    // Create new geometry with projected positions
    console.log('Creating new BufferGeometry...');
    const geometry = new THREE.BufferGeometry();

    console.log('Setting position attribute...');
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(projectedPositions), 3));
    console.log(`Position attribute set: ${geometry.attributes.position.count} vertices`);

    // Copy the indices from the icosahedron (already properly triangulated or generated)
    // We ensure baseGeometry has indices above, so this should never fail
    console.log('Cloning index from base geometry...');
    try {
        geometry.setIndex(baseGeometry.index.clone());
        console.log(`Copied ${baseGeometry.index.count} indices (${baseGeometry.index.count / 3} triangles) from base geometry`);
    } catch (e) {
        console.error('Failed to clone index:', e);
        console.error(e.stack);
        return null;
    }

    console.log('Computing vertex normals...');
    geometry.computeVertexNormals();

    const finalVertexCount = geometry.attributes.position.count;
    const finalTriangleCount = geometry.index.count / 3;
    console.log(`═══════════════════════════════════════════════`);
    console.log(`FINAL MESH STATISTICS:`);
    console.log(`  Vertices: ${finalVertexCount.toLocaleString()}`);
    console.log(`  Triangles: ${finalTriangleCount.toLocaleString()}`);
    console.log(`  Estimated file size: ~${Math.round(finalVertexCount * 0.05)}kb`);
    console.log(`═══════════════════════════════════════════════`);
    console.log('Returning geometry from createMeshFromSurface');

    return geometry;
}

/**
 * Create proper .3MF archive (ZIP file) with all required files
 */
async function geometryTo3MF(geometry) {
    const positions = geometry.attributes.position.array;
    const indices = geometry.index ? geometry.index.array : null;

    if (!indices || indices.length === 0) {
        console.error('No indices in geometry');
        return null;
    }

    // Scale factor to make the model a reasonable size (in millimeters)
    const scale = 50.0;

    // Build vertex list
    let verticesXML = '';
    for (let i = 0; i < positions.length; i += 3) {
        const x = (positions[i] * scale).toFixed(6);
        const y = (positions[i + 1] * scale).toFixed(6);
        const z = (positions[i + 2] * scale).toFixed(6);
        verticesXML += `          <vertex x="${x}" y="${y}" z="${z}" />\n`;
    }

    // Build triangle list
    let trianglesXML = '';
    for (let i = 0; i < indices.length; i += 3) {
        const v1 = indices[i];
        const v2 = indices[i + 1];
        const v3 = indices[i + 2];
        trianglesXML += `          <triangle v1="${v1}" v2="${v2}" v3="${v3}" />\n`;
    }

    // Create the 3D model XML
    const modelXML = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
  <resources>
    <object id="1" type="model">
      <mesh>
        <vertices>
${verticesXML}        </vertices>
        <triangles>
${trianglesXML}        </triangles>
      </mesh>
    </object>
  </resources>
  <build>
    <item objectid="1" />
  </build>
</model>`;

    // Create [Content_Types].xml
    const contentTypesXML = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml" />
  <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml" />
</Types>`;

    // Create _rels/.rels
    const relsXML = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel" />
</Relationships>`;

    // Check if JSZip is available
    if (!JSZip) {
        console.error('JSZip is not loaded!');
        return null;
    }

    // Create ZIP archive
    const zip = new JSZip();
    zip.file('[Content_Types].xml', contentTypesXML);
    zip.folder('_rels').file('.rels', relsXML);
    zip.folder('3D').file('3dmodel.model', modelXML);

    // Generate ZIP as blob
    const blob = await zip.generateAsync({ type: 'blob' });
    return blob;
}

/**
 * Trigger browser download of blob
 */
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
 * Main export function
 */
export async function exportPolyhedronAs3MF(sphereCenters, sphereRadii, planeNormals) {
    try {
        console.log('═══════════════════════════════════════════════');
        console.log('STARTING 3MF EXPORT');
        console.log('═══════════════════════════════════════════════');
        console.log('Creating mesh from polyhedron surface...');
        let geometry;

        try {
            geometry = createMeshFromSurface(sphereCenters, sphereRadii, planeNormals);
        } catch (e) {
            console.error('Error creating mesh from surface:', e);
            console.log('Falling back to ultra-high-res icosahedron...');
            // Fallback to an ultra-high-res icosahedron
            geometry = new THREE.IcosahedronGeometry(0.5, 7);
            // Ensure it has indices
            if (!geometry.index) {
                const numVertices = geometry.attributes.position.count;
                const indices = new Uint16Array(numVertices);
                for (let i = 0; i < numVertices; i++) {
                    indices[i] = i;
                }
                geometry.setIndex(new THREE.BufferAttribute(indices, 1));
            }
        }

        if (!geometry) {
            console.log('Geometry creation returned null, using fallback icosahedron...');
            geometry = new THREE.IcosahedronGeometry(0.5, 7);
            // Ensure it has indices
            if (!geometry.index) {
                const numVertices = geometry.attributes.position.count;
                const indices = new Uint16Array(numVertices);
                for (let i = 0; i < numVertices; i++) {
                    indices[i] = i;
                }
                geometry.setIndex(new THREE.BufferAttribute(indices, 1));
            }
        }

        // Validate geometry
        const positions = geometry.attributes.position;
        const indices = geometry.index;

        if (!positions || positions.count === 0) {
            alert('Mesh has no vertices.');
            return;
        }

        if (!indices || indices.count === 0) {
            alert('Mesh has no triangles.');
            return;
        }

        console.log(`Mesh created: ${positions.count} vertices, ${indices.count / 3} triangles`);
        console.log('Converting to .3MF format (creating ZIP archive)...');

        const blob = await geometryTo3MF(geometry);

        if (!blob) {
            alert('Failed to generate .3MF file.');
            return;
        }

        console.log('Downloading file...');
        downloadBlob(blob, 'hyperbolic_polyhedron.3mf');

        console.log('Export complete!');
    } catch (error) {
        console.error('Export error:', error);
        alert('Export failed: ' + error.message);
    }
}
