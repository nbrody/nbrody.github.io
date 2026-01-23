/**
 * Hyperbolic Geometry Utilities for the Poincaré Ball Model
 *
 * This module provides functions for computing hyperbolic geodesics and other
 * geometric operations in the Poincaré ball model of hyperbolic 3-space.
 */

import * as THREE from 'https://cdn.skypack.dev/three@0.136.0';

/**
 * Compute hyperbolic geodesic between two points in the Poincaré ball model
 *
 * In the Poincaré ball model, geodesics are:
 * - Straight line segments through the origin (if both points and origin are collinear)
 * - Circular arcs orthogonal to the boundary sphere (in all other cases)
 *
 * @param {THREE.Vector3} p1 - First point in the ball
 * @param {THREE.Vector3} p2 - Second point in the ball
 * @param {number} numSegments - Number of line segments to approximate the geodesic (default: 32)
 * @returns {THREE.Vector3[]} Array of points along the geodesic
 */
export function computeHyperbolicGeodesic(p1, p2, numSegments = 32) {
    const points = [];

    // Check if points are too close
    const dist = p1.distanceTo(p2);
    if (dist < 1e-6) {
        return [p1.clone(), p2.clone()];
    }

    // Check if points and origin are collinear (geodesic is a straight line)
    const cross = new THREE.Vector3().crossVectors(p1, p2);
    const crossLen = cross.length();

    if (crossLen < 1e-6) {
        // Collinear with origin - geodesic is a straight line
        for (let i = 0; i <= numSegments; i++) {
            const t = i / numSegments;
            points.push(new THREE.Vector3().lerpVectors(p1, p2, t));
        }
        return points;
    }

    // Non-collinear case: geodesic is a circular arc orthogonal to boundary sphere
    // The geodesic lies on a circle that is orthogonal to the unit sphere at infinity

    // For a circle with center c and radius r to be orthogonal to the unit sphere,
    // it must satisfy: |c|² = r² + 1
    // Combined with |c - p1| = r (p1 lies on circle), we get:
    // c·p1 = (1 + |p1|²)/2
    // c·p2 = (1 + |p2|²)/2

    // The center c lies in the plane spanned by p1 and p2
    // (since the geodesic arc, p1, p2, and center are coplanar)
    // So we can write: c = α*p1 + β*p2

    const p1Len2 = p1.lengthSq();
    const p2Len2 = p2.lengthSq();
    const p1DotP2 = p1.dot(p2);

    // Solve the 2x2 linear system:
    // α*|p1|² + β*(p1·p2) = (1 + |p1|²)/2
    // α*(p1·p2) + β*|p2|² = (1 + |p2|²)/2

    const rhs1 = (1 + p1Len2) / 2;
    const rhs2 = (1 + p2Len2) / 2;

    // Determinant of the coefficient matrix
    const det = p1Len2 * p2Len2 - p1DotP2 * p1DotP2;

    if (Math.abs(det) < 1e-10) {
        // Singular matrix - points might be collinear or other degenerate case
        // Fall back to straight line
        console.warn('Geodesic computation: singular matrix, using straight line');
        for (let i = 0; i <= numSegments; i++) {
            const t = i / numSegments;
            points.push(new THREE.Vector3().lerpVectors(p1, p2, t));
        }
        return points;
    }

    // Solve using Cramer's rule
    const alpha = (rhs1 * p2Len2 - rhs2 * p1DotP2) / det;
    const beta = (p1Len2 * rhs2 - p1DotP2 * rhs1) / det;

    const center = new THREE.Vector3()
        .addScaledVector(p1, alpha)
        .addScaledVector(p2, beta);

    return createArcPoints(p1, p2, center, numSegments);
}

/**
 * Create points along a circular arc from p1 to p2 with given center
 *
 * @param {THREE.Vector3} p1 - Start point
 * @param {THREE.Vector3} p2 - End point
 * @param {THREE.Vector3} center - Center of the circle
 * @param {number} numSegments - Number of segments
 * @returns {THREE.Vector3[]} Array of points along the arc
 */
function createArcPoints(p1, p2, center, numSegments) {
    const points = [];
    const radius = center.distanceTo(p1);

    // Verify that p2 is also at the same distance (for numerical stability check)
    const radius2 = center.distanceTo(p2);
    const radiusError = Math.abs(radius - radius2) / radius;

    if (radiusError > 0.1) {
        // Significant error - fall back to linear interpolation
        console.warn('Geodesic computation: large radius error, falling back to linear interpolation');
        for (let i = 0; i <= numSegments; i++) {
            const t = i / numSegments;
            points.push(new THREE.Vector3().lerpVectors(p1, p2, t));
        }
        return points;
    }

    // Vectors from center to p1 and p2
    const v1 = new THREE.Vector3().subVectors(p1, center).normalize();
    const v2 = new THREE.Vector3().subVectors(p2, center).normalize();

    // Compute angle between v1 and v2
    const cosAngle = Math.max(-1, Math.min(1, v1.dot(v2)));
    const angle = Math.acos(cosAngle);

    // Axis of rotation (perpendicular to the plane containing v1 and v2)
    const axis = new THREE.Vector3().crossVectors(v1, v2);

    if (axis.lengthSq() < 1e-12) {
        // Vectors are parallel or anti-parallel
        if (cosAngle > 0) {
            // Same direction - shouldn't happen but handle gracefully
            return [p1.clone(), p2.clone()];
        } else {
            // Opposite directions - need to choose an axis
            // Use any perpendicular direction
            const arbitraryAxis = Math.abs(v1.x) < 0.9
                ? new THREE.Vector3(1, 0, 0)
                : new THREE.Vector3(0, 1, 0);
            axis.crossVectors(v1, arbitraryAxis).normalize();
        }
    } else {
        axis.normalize();
    }

    // Generate points along the arc
    for (let i = 0; i <= numSegments; i++) {
        const t = i / numSegments;
        const currentAngle = angle * t;

        // Rotate v1 around axis by currentAngle
        const rotated = v1.clone().applyAxisAngle(axis, currentAngle);
        const point = center.clone().addScaledVector(rotated, radius);

        points.push(point);
    }

    return points;
}

/**
 * Compute the hyperbolic distance between two points in the Poincaré ball
 *
 * The hyperbolic distance formula in the Poincaré ball model is:
 * d(p1, p2) = arcosh(1 + 2|p1 - p2|² / ((1 - |p1|²)(1 - |p2|²)))
 *
 * @param {THREE.Vector3} p1 - First point
 * @param {THREE.Vector3} p2 - Second point
 * @returns {number} Hyperbolic distance
 */
export function hyperbolicDistance(p1, p2) {
    const diff = new THREE.Vector3().subVectors(p1, p2);
    const diffLen2 = diff.lengthSq();
    const p1Len2 = p1.lengthSq();
    const p2Len2 = p2.lengthSq();

    const denom = (1 - p1Len2) * (1 - p2Len2);

    if (denom <= 0) {
        // Points at or outside boundary
        return Infinity;
    }

    const arg = 1 + 2 * diffLen2 / denom;

    return Math.acosh(Math.max(1, arg));
}

/**
 * Check if a point is inside the Poincaré ball (with optional margin)
 *
 * @param {THREE.Vector3} p - Point to check
 * @param {number} margin - Safety margin from boundary (default: 0.01)
 * @returns {boolean} True if point is inside the ball
 */
export function isInsideBall(p, margin = 0.01) {
    return p.lengthSq() < (1 - margin) * (1 - margin);
}
