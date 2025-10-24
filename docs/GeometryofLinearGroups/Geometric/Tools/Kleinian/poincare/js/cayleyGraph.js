/**
 * Cayley Graph Visualization
 * Displays the Cayley graph of the group with respect to the standard generators
 */

import * as THREE from 'https://cdn.skypack.dev/three@0.136.0';
import { generateGroupElements } from './dirichletUtils.js';
import { computeHyperbolicGeodesic } from './hypGeom.js';

// Global state for Cayley graph visualization
let cayleyGraphGroup = null;
let cayleyGraphVisible = false;
let originalVertexPositions = []; // Store original ball coordinates for restoration

/**
 * Apply a PSL(2,C) matrix to a point in the Poincaré ball model
 * using the SO(3,1) isometry representation
 */
function applyMatrixToPoint(matrix, point, PSL2CtoSDF) {
    const A = PSL2CtoSDF.C(matrix.a.re, matrix.a.im);
    const B = PSL2CtoSDF.C(matrix.b.re, matrix.b.im);
    const C = PSL2CtoSDF.C(matrix.c.re, matrix.c.im);
    const D = PSL2CtoSDF.C(matrix.d.re, matrix.d.im);

    const so31 = PSL2CtoSDF.PSL2CtoSO31(A, B, C, D);

    // Convert Poincaré point to Minkowski coordinates
    // Poincaré: (x,y,z) with x²+y²+z² < 1
    // Minkowski: (x,y,z,w) with x²+y²+z²-w² = -1, w > 0
    const r2 = point.x * point.x + point.y * point.y + point.z * point.z;
    if (r2 >= 1) {
        // Point outside ball, clamp it
        const scale = 0.99 / Math.sqrt(r2);
        point = point.clone().multiplyScalar(scale);
    }

    const factor = 1 - r2;
    const minkowskiPoint = [
        2 * point.x / factor,
        2 * point.y / factor,
        2 * point.z / factor,
        (1 + r2) / factor
    ];

    // Apply SO(3,1) matrix to Minkowski point
    let transformed = [0, 0, 0, 0];
    if (Array.isArray(so31) && so31.length === 4 && Array.isArray(so31[0])) {
        // 4x4 matrix format
        for (let i = 0; i < 4; i++) {
            for (let j = 0; j < 4; j++) {
                transformed[i] += so31[i][j] * minkowskiPoint[j];
            }
        }
    } else if (Array.isArray(so31) && so31.length === 16) {
        // Flat array format (column-major or row-major)
        for (let i = 0; i < 4; i++) {
            for (let j = 0; j < 4; j++) {
                transformed[i] += so31[i * 4 + j] * minkowskiPoint[j];
            }
        }
    } else {
        console.warn('Unexpected SO(3,1) matrix format');
        return point.clone();
    }

    // Convert back to Poincaré coordinates
    const [x, y, z, w] = transformed;
    if (w <= 0) {
        console.warn('Invalid transformation: w <= 0');
        return point.clone();
    }

    return new THREE.Vector3(
        x / (1 + w),
        y / (1 + w),
        z / (1 + w)
    );
}

/**
 * HSV to RGB conversion (matching shader)
 */
function hsv2rgb(h, s, v) {
    const c = v * s;
    const x = c * (1 - Math.abs(((h * 6) % 2) - 1));
    const m = v - c;
    let r, g, b;
    if (h < 1/6) { r = c; g = x; b = 0; }
    else if (h < 2/6) { r = x; g = c; b = 0; }
    else if (h < 3/6) { r = 0; g = c; b = x; }
    else if (h < 4/6) { r = 0; g = x; b = c; }
    else if (h < 5/6) { r = x; g = 0; b = c; }
    else { r = c; g = 0; b = x; }
    return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

/**
 * Get face color matching the shader's faceColor function
 */
function getFaceColor(faceId, paletteMode) {
    const id = Math.floor(faceId);

    if (paletteMode === 0) {
        // colorful: golden-ratio hue stepping
        const h = (id * 0.61803398875) % 1;
        const [r, g, b] = hsv2rgb(h, 0.6, 0.9);
        return (r << 16) | (g << 8) | b;
    } else if (paletteMode === 1) {
        // vaporwave palette
        const colors = [
            0xFC_BD_F5, 0xC6_B4_FC, 0x99_CC_FC, 0x86_E5_D6,
            0xFC_D7_99, 0xF2_99_BD, 0xAD_AD_FC, 0x83_DD_FC
        ];
        return colors[id % 8];
    } else if (paletteMode === 3) {
        // halloween palette
        const colors = [0xFF_6E_00, 0x5C_00_9D, 0x8F_D4_00, 0x1A_1A_1F];
        return colors[id % 4];
    } else if (paletteMode === 4) {
        // tie-dye
        const h = (0.5 + 0.5 * Math.sin(id * 2.399)) % 1;
        const s = Math.max(0.55, Math.min(1.0, 0.70 + 0.30 * Math.sin(id * 1.113 + 1.0)));
        const v = Math.max(0.75, Math.min(1.0, 0.90 + 0.10 * Math.sin(id * 0.713 + 2.0)));
        const [r, g, b] = hsv2rgb(h, s, v);
        return (r << 16) | (g << 8) | b;
    } else if (paletteMode === 5) {
        // sunset palette (16 colors with randomization)
        const colors = [
            0xF6_D7_A5, 0xEE_D4_AB, 0xEE_AF_61, 0xF0_A0_6E,
            0xFB_90_62, 0xFA_7B_5E, 0xF2_6A_66, 0xEE_5D_6C,
            0xD8_54_87, 0xCE_49_93, 0xB6_39_A9, 0x8F_1F_A4,
            0x6A_0D_83, 0x4F_02_70, 0x3A_00_5B, 0x1E_00_3F
        ];
        const k = Math.floor((Math.sin(id * 12.9898) * 43758.5453 % 1) * 16);
        return colors[k];
    } else {
        // uc colors: alternate blue & gold
        return (id % 2 === 0) ? 0x00_33_66 : 0xFF_BC_00;
    }
}

/**
 * Build and display the Cayley graph
 */
export function buildCayleyGraph(matrices, wordLength, scene, PSL2CtoSDF, facesMetaById, paletteMode) {
    // Remove existing Cayley graph if present
    if (cayleyGraphGroup) {
        scene.remove(cayleyGraphGroup);
        cayleyGraphGroup = null;
    }

    if (!matrices || matrices.length === 0) {
        console.warn('No matrices provided for Cayley graph');
        return;
    }

    if (!PSL2CtoSDF) {
        console.error('PSL2CtoSDF not available for Cayley graph');
        return;
    }

    // Generate all group elements
    console.log(`Generating Cayley graph with word length ${wordLength}...`);
    const groupElements = generateGroupElements(matrices, wordLength);
    console.log(`Generated ${groupElements.length} group elements`);

    // Base point (center of Poincaré ball)
    const basePoint = new THREE.Vector3(0, 0, 0);

    // Map: word string -> {point, element}
    const vertexMap = new Map();
    vertexMap.set('', { point: basePoint.clone(), element: null });

    // Apply each group element to the base point
    for (const element of groupElements) {
        if (element.word === '') continue; // Skip identity (already added)
        try {
            const transformedPoint = applyMatrixToPoint(element.m, basePoint, PSL2CtoSDF);
            vertexMap.set(element.word, { point: transformedPoint, element: element.m });
        } catch (e) {
            console.warn(`Failed to transform point for word ${element.word}:`, e);
        }
    }

    console.log(`Cayley graph: ${vertexMap.size} vertices`);

    // Create Three.js group for Cayley graph
    cayleyGraphGroup = new THREE.Group();

    // Material for vertices - opaque with depth testing/writing
    const vertexMaterial = new THREE.MeshBasicMaterial({
        color: 0xffff00,
        transparent: false,
        depthTest: true,
        depthWrite: true
    });

    // Build map from generator word to face ID
    const generatorToFaceId = new Map();
    if (facesMetaById && Array.isArray(facesMetaById)) {
        for (let faceId = 0; faceId < facesMetaById.length; faceId++) {
            const meta = facesMetaById[faceId];
            if (meta && meta.word) {
                generatorToFaceId.set(meta.word, faceId);
            }
        }
    }

    console.log(`Generator to face ID map:`, Array.from(generatorToFaceId.entries()));

    // Add vertices (spheres with constant hyperbolic radius)
    for (const [word, data] of vertexMap) {
        // Calculate Euclidean distance from origin (center of ball)
        const r = data.point.length();

        // Hyperbolic metric in Poincaré ball: ds² = 4/(1-r²)² dx²
        // Conformal factor: λ(r) = 2/(1-r²)
        // To maintain constant hyperbolic radius R_h, Euclidean radius should be:
        // R_e(r) = R_h * (1-r²) / 2

        const hyperbolicRadius = 0.06; // Constant hyperbolic size
        const r2 = r * r;
        const conformalFactor = (1 - r2) / 2;
        const euclideanRadius = hyperbolicRadius * conformalFactor;

        // Clamp to prevent vertices from becoming invisibly small near boundary
        const vertexRadius = Math.max(0.002, euclideanRadius);

        const vertexGeometry = new THREE.SphereGeometry(vertexRadius, 16, 16);
        const vertex = new THREE.Mesh(vertexGeometry, vertexMaterial);
        vertex.position.copy(data.point);
        vertex.renderOrder = 10; // Render after polyhedron
        cayleyGraphGroup.add(vertex);

        if (word.length <= 10) { // Log first few for debugging
            console.log(`Vertex "${word}" at r=${r.toFixed(3)}, conformal=${conformalFactor.toFixed(3)}, euclidean_radius=${vertexRadius.toFixed(4)}`);
        }
    }

    // Add edges using word structure
    let edgeCount = 0;
    console.log(`Building edges for ${vertexMap.size} vertices with ${matrices.length} generators...`);

    // Debug: show first few words
    const wordSample = Array.from(vertexMap.keys()).slice(0, 10);
    console.log('Sample words:', wordSample);

    // Generator labels in LaTeX format: g_{1}, g_{2}, etc.
    const genLabels = Array.from({ length: matrices.length }, (_, i) => `g_{${i + 1}}`);
    const genLabelsInv = Array.from({ length: matrices.length }, (_, i) => `g_{${i + 1}}^{-1}`);
    console.log('Generator labels:', genLabels);

    for (const [word, data] of vertexMap) {
        // For each generator and its inverse, check if right-multiplying gives us another vertex
        for (let genIdx = 0; genIdx < matrices.length; genIdx++) {
            // Try both forward and inverse generators
            for (const genLabel of [genLabels[genIdx], genLabelsInv[genIdx]]) {
                let newWord;
                if (word === '') {
                    // Identity case
                    newWord = genLabel;
                } else {
                    // Right multiplication: word \, generator
                    newWord = word + '\\, ' + genLabel;
                }

                if (vertexMap.has(newWord)) {
                    const targetData = vertexMap.get(newWord);

                    // Determine edge color based on the face corresponding to this generator
                    // For inverse generators g_{i}^{-1}, use the same face as g_{i}
                    let edgeColor = 0xffffff; // default white
                    let faceId = generatorToFaceId.get(genLabel);
                    if (faceId === undefined) {
                        // Try the forward generator (strip the ^{-1})
                        const forwardGenLabel = genLabels[genIdx];
                        faceId = generatorToFaceId.get(forwardGenLabel);
                    }
                    if (faceId !== undefined) {
                        edgeColor = getFaceColor(faceId, paletteMode || 0);
                    }

                    const edgeMaterial = new THREE.LineBasicMaterial({
                        color: edgeColor,
                        transparent: false,
                        linewidth: 2,
                        depthTest: true,
                        depthWrite: true
                    });

                    // Compute hyperbolic geodesic between the two points
                    const geodesicPoints = computeHyperbolicGeodesic(data.point, targetData.point, 32);
                    const edgeGeometry = new THREE.BufferGeometry().setFromPoints(geodesicPoints);
                    const edge = new THREE.Line(edgeGeometry, edgeMaterial);
                    edge.renderOrder = 9; // Render edges before vertices
                    cayleyGraphGroup.add(edge);
                    edgeCount++;

                    if (edgeCount <= 10) {
                        console.log(`Edge ${edgeCount}: "${word}" --[${genLabel}]--> "${newWord}", faceId=${faceId}, color=#${edgeColor.toString(16).padStart(6, '0')}`);
                    }
                }
            }
        }
    }

    console.log(`Cayley graph built: ${vertexMap.size} vertices, ${edgeCount} edges`);

    cayleyGraphGroup.visible = true; // Always start visible when built
    cayleyGraphVisible = true; // Update state
    cayleyGraphGroup.renderOrder = 10; // Render well after polyhedron (polyhedron is 1)
    scene.add(cayleyGraphGroup);

    console.log(`Cayley graph added to scene. Visible: true, Children: ${cayleyGraphGroup.children.length}`);

    return cayleyGraphGroup;
}

/**
 * Show or hide the Cayley graph
 */
export function toggleCayleyGraph(visible) {
    cayleyGraphVisible = visible;
    if (cayleyGraphGroup) {
        cayleyGraphGroup.visible = visible;
    }
}

/**
 * Get current visibility state
 */
export function isCayleyGraphVisible() {
    return cayleyGraphVisible;
}

/**
 * Clear the Cayley graph from the scene
 */
export function clearCayleyGraph(scene) {
    if (cayleyGraphGroup) {
        scene.remove(cayleyGraphGroup);
        cayleyGraphGroup = null;
        originalVertexPositions = [];
    }
}

/**
 * Cayley transform: Ball → Upper Half-Space
 * Maps (x,y,z) with x²+y²+z²<1 to (x',y',z') with z'>0
 */
function cayleyTransform(p) {
    const x = p.x, y = p.y, z = p.z;
    const denom = 1 - z;

    // Handle singularity at south pole (z=1)
    if (Math.abs(denom) < 1e-10) {
        return new THREE.Vector3(0, 0, 1e6);
    }

    return new THREE.Vector3(
        2 * x / denom,
        2 * y / denom,
        (1 + z) / denom
    );
}

/**
 * Inverse Cayley transform: Upper Half-Space → Ball
 */
function inverseCayleyTransform(p) {
    const x = p.x, y = p.y, z = p.z;
    const rSq = x*x + y*y + z*z;
    const denom = 1 + rSq;

    return new THREE.Vector3(
        2 * x / denom,
        2 * y / denom,
        (rSq - 1) / denom
    );
}

/**
 * Transform Cayley graph to upper half-space coordinates
 */
export function transformCayleyGraphToHalfSpace() {
    if (!cayleyGraphGroup) return;

    console.log('Transforming Cayley graph to upper half-space...');

    // Save original positions if not already saved
    if (originalVertexPositions.length === 0) {
        cayleyGraphGroup.children.forEach(child => {
            if (child instanceof THREE.Mesh) {
                originalVertexPositions.push(child.position.clone());
            }
        });
        console.log(`Saved ${originalVertexPositions.length} original vertex positions`);
    }

    // Transform all vertices and scale according to half-space metric
    let vertexIndex = 0;
    const hyperbolicRadius = 0.06; // Same constant hyperbolic size
    cayleyGraphGroup.children.forEach(child => {
        if (child instanceof THREE.Mesh) {
            const ballPos = originalVertexPositions[vertexIndex];
            const halfSpacePos = cayleyTransform(ballPos);
            child.position.copy(halfSpacePos);

            // Upper half-space metric: ds² = (dx² + dy² + dz²) / z²
            // Conformal factor: λ(z) = 1/z
            // To maintain constant hyperbolic radius R_h, Euclidean radius should be:
            // R_e(z) = R_h * z
            const euclideanRadius = hyperbolicRadius * halfSpacePos.z;
            const vertexRadius = Math.max(0.002, euclideanRadius);

            // Update sphere geometry by rescaling
            child.scale.setScalar(vertexRadius / child.geometry.parameters.radius);

            vertexIndex++;
        } else if (child instanceof THREE.Line) {
            // Transform edge geometry points
            const positions = child.geometry.attributes.position;
            for (let i = 0; i < positions.count; i++) {
                const ballPos = new THREE.Vector3(
                    positions.getX(i),
                    positions.getY(i),
                    positions.getZ(i)
                );
                const halfSpacePos = cayleyTransform(ballPos);
                positions.setXYZ(i, halfSpacePos.x, halfSpacePos.y, halfSpacePos.z);
            }
            positions.needsUpdate = true;
        }
    });

    console.log(`Transformed ${vertexIndex} vertices to half-space`);
}

/**
 * Restore Cayley graph to ball coordinates
 */
export function restoreCayleyGraphToBall() {
    if (!cayleyGraphGroup || originalVertexPositions.length === 0) return;

    console.log('Restoring Cayley graph to ball coordinates...');

    // Restore vertex positions and scaling
    let vertexIndex = 0;
    const hyperbolicRadius = 0.06; // Same constant hyperbolic size
    cayleyGraphGroup.children.forEach(child => {
        if (child instanceof THREE.Mesh && vertexIndex < originalVertexPositions.length) {
            const ballPos = originalVertexPositions[vertexIndex];
            child.position.copy(ballPos);

            // Restore ball model scaling
            const r = ballPos.length();
            const r2 = r * r;
            const conformalFactor = (1 - r2) / 2;
            const euclideanRadius = hyperbolicRadius * conformalFactor;
            const vertexRadius = Math.max(0.002, euclideanRadius);

            // Restore scale
            child.scale.setScalar(vertexRadius / child.geometry.parameters.radius);

            vertexIndex++;
        } else if (child instanceof THREE.Line) {
            // For edges, we need to recompute geodesics or transform back
            // For simplicity, just transform the points back using inverse Cayley
            const positions = child.geometry.attributes.position;
            for (let i = 0; i < positions.count; i++) {
                const halfSpacePos = new THREE.Vector3(
                    positions.getX(i),
                    positions.getY(i),
                    positions.getZ(i)
                );
                const ballPos = inverseCayleyTransform(halfSpacePos);
                positions.setXYZ(i, ballPos.x, ballPos.y, ballPos.z);
            }
            positions.needsUpdate = true;
        }
    });

    console.log(`Restored ${vertexIndex} vertices to ball coordinates`);
}
