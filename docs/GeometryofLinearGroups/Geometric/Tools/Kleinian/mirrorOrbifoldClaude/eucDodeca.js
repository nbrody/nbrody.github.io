/**
 * Euclidean Dodecahedron Geometry Module
 * 
 * Generates the geometry for a standard Euclidean regular dodecahedron.
 * Faces are flat planes.
 */

import { getFaceNormals, getFaceAdjacency, getEdges } from './dodecahedron.js';

/**
 * Generate regular Euclidean dodecahedron face data
 * 
 * @param {number} inradius - Distance from origin to each face center
 */
export function getEuclideanDodecahedron(inradius = 1.0) {
    const normals = getFaceNormals();

    return normals.map((n, index) => {
        // For Euclidean planes, we store:
        // center: the point on the plane closest to the origin (normal * inradius)
        // radius: -1.0 (flag for the shader to treat this as a flat plane)
        const center = [n[0] * inradius, n[1] * inradius, n[2] * inradius];

        return {
            index,
            normal: n,
            center,
            radius: -1.0, // Special value for flat plane
            inradius: inradius
        };
    });
}

export default {
    getEuclideanDodecahedron
};
