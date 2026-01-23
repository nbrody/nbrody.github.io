/**
 * Upper Half-Space View Module: Cayley transform for half-space model
 *
 * Transforms the Poincaré ball model to the upper half-space model using:
 * (x,y,z) in ball → (x',y',z') in half-space where
 * x' = 2x/(1-z), y' = 2y/(1-z), z' = (1+z)/(1-z)
 *
 * The inverse transform (half-space → ball) is:
 * x = 2x'/(1+x'²+y'²+z'²), y = 2y'/(1+x'²+y'²+z'²), z = (-1+x'²+y'²+z'²)/(1+x'²+y'²+z'²)
 */

import * as THREE from 'https://cdn.skypack.dev/three@0.136.0';
import { transformCayleyGraphToHalfSpace, restoreCayleyGraphToBall } from './cayleyGraph.js';

// State
let upperHalfSpaceActive = false;
let savedCameraPosition = null;
let savedCameraRotation = null;
let savedControlsState = null;
let savedBallGeometry = null; // Store original ball model geometry
let groundPlane = null; // Visual boundary plane at z=0
let debugSpheres = []; // Debug visualization spheres

/**
 * Cayley transform: Ball → Upper Half-Space
 * Maps (x,y,z) with x²+y²+z²<1 to (x',y',z') with z'>0
 */
function cayleyTransform(p) {
    const x = p.x, y = p.y, z = p.z;
    const denom = 1 - z;

    // Handle singularity at south pole (z=1)
    if (Math.abs(denom) < 1e-10) {
        // Point at south pole maps to infinity
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
 * Transform a sphere from ball model to half-space model
 * A sphere in the ball may become a sphere or a plane in half-space
 */
function transformSphere(center, radius) {
    // Transform the sphere center
    const centerHS = cayleyTransform(center);

    // For a sphere in the ball model, we need to transform it properly
    // A sphere with center c and radius r in the ball becomes:
    // - Another sphere in half-space if it doesn't pass through the south pole
    // - A plane if it passes through the south pole

    // Check if sphere intersects south pole (0,0,1)
    const southPole = new THREE.Vector3(0, 0, 1);
    const distToSouthPole = center.distanceTo(southPole);

    if (Math.abs(distToSouthPole - radius) < 1e-6) {
        // Sphere passes through south pole → becomes a plane in half-space
        // The plane's normal is derived from the sphere center
        const normal = center.clone().normalize();
        const transformedNormal = new THREE.Vector3(
            normal.x,
            normal.y,
            normal.z
        );
        return { type: 'plane', normal: transformedNormal };
    } else {
        // Transform sphere by transforming several points on it
        // and fitting a new sphere to them in half-space

        // Sample points on the sphere
        const points = [];
        for (let i = 0; i < 8; i++) {
            const theta = (i / 8) * 2 * Math.PI;
            const phi = Math.PI / 4;
            const offset = new THREE.Vector3(
                radius * Math.sin(phi) * Math.cos(theta),
                radius * Math.sin(phi) * Math.sin(theta),
                radius * Math.cos(phi)
            );
            const p = center.clone().add(offset);
            // Clamp to inside ball
            if (p.length() < 0.999) {
                points.push(cayleyTransform(p));
            }
        }

        // Compute bounding sphere of transformed points
        if (points.length > 0) {
            let sumX = 0, sumY = 0, sumZ = 0;
            for (const p of points) {
                sumX += p.x; sumY += p.y; sumZ += p.z;
            }
            const newCenter = new THREE.Vector3(
                sumX / points.length,
                sumY / points.length,
                sumZ / points.length
            );

            let maxDist = 0;
            for (const p of points) {
                maxDist = Math.max(maxDist, newCenter.distanceTo(p));
            }

            return { type: 'sphere', center: newCenter, radius: maxDist * 1.1 };
        }
    }

    // Fallback
    return { type: 'sphere', center: centerHS, radius: radius * 2 };
}

/**
 * Transform a plane from ball model to half-space model
 * A plane through origin in ball becomes a plane in half-space
 */
function transformPlane(normal) {
    // A plane through the origin with normal n remains a plane
    // through the origin in half-space, but with transformed normal
    // The transformation is complex, so we approximate by transforming
    // points on the plane

    // Get two points on the plane
    const perp1 = new THREE.Vector3();
    const perp2 = new THREE.Vector3();

    if (Math.abs(normal.z) < 0.9) {
        perp1.crossVectors(normal, new THREE.Vector3(0, 0, 1)).normalize();
    } else {
        perp1.crossVectors(normal, new THREE.Vector3(0, 1, 0)).normalize();
    }
    perp2.crossVectors(normal, perp1).normalize();

    // Transform points on the plane
    const p1 = perp1.clone().multiplyScalar(0.5);
    const p2 = perp2.clone().multiplyScalar(0.5);
    const p1HS = cayleyTransform(p1);
    const p2HS = cayleyTransform(p2);

    // Compute new normal from transformed points
    // (both pass through origin in half-space too)
    const newNormal = new THREE.Vector3();
    newNormal.crossVectors(p1HS, p2HS).normalize();

    return newNormal;
}

/**
 * Enable upper half-space view mode
 */
export function enableUpperHalfSpace(
    camera,
    controls,
    uniforms,
    currentSphereCenters,
    currentSphereRadii,
    currentPlaneNormals,
    scene
) {
    if (upperHalfSpaceActive) return;

    console.log('Enabling upper half-space view...');
    upperHalfSpaceActive = true;

    // Save current camera state
    savedCameraPosition = camera.position.clone();
    savedCameraRotation = camera.rotation.clone();
    savedControlsState = {
        enabled: controls.enabled,
        autoRotate: controls.autoRotate,
        target: controls.target.clone()
    };

    // Save original ball geometry
    savedBallGeometry = {
        sphereCenters: currentSphereCenters.map(v => v.clone()),
        sphereRadii: currentSphereRadii.slice(),
        planeNormals: currentPlaneNormals.map(v => v.clone())
    };

    // Transform geometry to half-space
    const transformedSpheres = [];
    const transformedPlanes = [];

    // Transform each sphere
    for (let i = 0; i < currentSphereCenters.length; i++) {
        const result = transformSphere(currentSphereCenters[i], currentSphereRadii[i]);
        if (result.type === 'sphere') {
            transformedSpheres.push({
                center: result.center,
                radius: result.radius
            });
        } else if (result.type === 'plane') {
            transformedPlanes.push(result.normal);
        }
    }

    // Transform each plane
    for (const normal of currentPlaneNormals) {
        const newNormal = transformPlane(normal);
        transformedPlanes.push(newNormal);
    }

    // Update uniforms with transformed geometry
    uniforms.u_num_sphere_planes.value = transformedSpheres.length;
    for (let i = 0; i < transformedSpheres.length; i++) {
        uniforms.u_sphere_centers.value[i].copy(transformedSpheres[i].center);
        uniforms.u_sphere_radii.value[i] = transformedSpheres[i].radius;
    }

    uniforms.u_num_euclidean_planes.value = transformedPlanes.length;
    for (let i = 0; i < transformedPlanes.length; i++) {
        uniforms.u_plane_normals.value[i].copy(transformedPlanes[i]);
    }

    // Set view mode uniform
    if (uniforms.u_view_mode) {
        uniforms.u_view_mode.value = 1; // 1 = half-space
    }

    // Position camera to look down at half-space from above
    camera.position.set(0, 8, 12);
    controls.target.set(0, 0, 2);
    camera.lookAt(controls.target);

    // Re-enable controls for half-space navigation
    controls.enabled = true;
    controls.autoRotate = false;

    // Create and add ground plane at z=0 to visualize the boundary
    const planeGeometry = new THREE.PlaneGeometry(20, 20);
    const planeMaterial = new THREE.MeshPhongMaterial({
        color: 0x444444,
        transparent: true,
        opacity: 0.5,
        side: THREE.DoubleSide,
        depthWrite: false
    });
    groundPlane = new THREE.Mesh(planeGeometry, planeMaterial);

    // Rotate plane to be horizontal (XY plane becomes XY at z=0)
    // By default, PlaneGeometry is in XY plane, we want it horizontal
    groundPlane.rotation.x = 0; // Already horizontal in default orientation
    groundPlane.position.set(0, 0, 0);

    // Add grid helper on the ground plane
    const gridHelper = new THREE.GridHelper(20, 20, 0x888888, 0x444444);
    gridHelper.rotation.x = Math.PI / 2; // Rotate to be in XY plane at z=0
    groundPlane.add(gridHelper);

    scene.add(groundPlane);

    // Add debug spheres to visualize transformed sphere centers
    debugSpheres = [];
    for (let i = 0; i < Math.min(transformedSpheres.length, 10); i++) {
        const debugGeom = new THREE.SphereGeometry(0.2, 16, 16);
        const debugMat = new THREE.MeshBasicMaterial({
            color: 0xff0000,
            wireframe: true
        });
        const debugSphere = new THREE.Mesh(debugGeom, debugMat);
        debugSphere.position.copy(transformedSpheres[i].center);
        scene.add(debugSphere);
        debugSpheres.push(debugSphere);

        console.log(`Debug sphere ${i} at:`, transformedSpheres[i].center, `radius:`, transformedSpheres[i].radius);
    }

    // Add debug markers for original ball centers (before transform)
    console.log('Original ball geometry (first 5):');
    for (let i = 0; i < Math.min(currentSphereCenters.length, 5); i++) {
        console.log(`  Sphere ${i}: center =`, currentSphereCenters[i], `radius =`, currentSphereRadii[i]);
    }

    // Add origin marker
    const originGeom = new THREE.SphereGeometry(0.3, 16, 16);
    const originMat = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
    const originMarker = new THREE.Mesh(originGeom, originMat);
    originMarker.position.set(0, 0, 0);
    scene.add(originMarker);
    debugSpheres.push(originMarker);

    // Add a tall axis helper to show z-axis direction
    const axesHelper = new THREE.AxesHelper(5);
    scene.add(axesHelper);
    debugSpheres.push(axesHelper);

    // Transform Cayley graph if it exists
    transformCayleyGraphToHalfSpace();

    console.log('Upper half-space view enabled.');
    console.log(`Transformed ${transformedSpheres.length} spheres and ${transformedPlanes.length} planes`);
}

/**
 * Disable upper half-space view and restore ball model
 */
export function disableUpperHalfSpace(camera, controls, uniforms, scene) {
    if (!upperHalfSpaceActive) return;

    console.log('Disabling upper half-space view...');
    upperHalfSpaceActive = false;

    // Remove ground plane if it exists
    if (groundPlane && scene) {
        scene.remove(groundPlane);
        groundPlane.geometry.dispose();
        groundPlane.material.dispose();
        groundPlane = null;
    }

    // Remove debug spheres
    for (const sphere of debugSpheres) {
        if (scene) scene.remove(sphere);
        sphere.geometry.dispose();
        sphere.material.dispose();
    }
    debugSpheres = [];

    // Restore camera state
    if (savedCameraPosition) {
        camera.position.copy(savedCameraPosition);
    }
    if (savedCameraRotation) {
        camera.rotation.copy(savedCameraRotation);
    }

    // Restore controls
    if (savedControlsState) {
        controls.enabled = savedControlsState.enabled;
        controls.autoRotate = savedControlsState.autoRotate;
        controls.target.copy(savedControlsState.target);
    }

    // Restore original ball geometry
    if (savedBallGeometry) {
        uniforms.u_num_sphere_planes.value = savedBallGeometry.sphereCenters.length;
        for (let i = 0; i < savedBallGeometry.sphereCenters.length; i++) {
            uniforms.u_sphere_centers.value[i].copy(savedBallGeometry.sphereCenters[i]);
            uniforms.u_sphere_radii.value[i] = savedBallGeometry.sphereRadii[i];
        }

        uniforms.u_num_euclidean_planes.value = savedBallGeometry.planeNormals.length;
        for (let i = 0; i < savedBallGeometry.planeNormals.length; i++) {
            uniforms.u_plane_normals.value[i].copy(savedBallGeometry.planeNormals[i]);
        }
    }

    // Set view mode back to ball
    if (uniforms.u_view_mode) {
        uniforms.u_view_mode.value = 0; // 0 = ball
    }

    // Restore Cayley graph to ball coordinates
    restoreCayleyGraphToBall();

    console.log('Upper half-space view disabled.');
}

/**
 * Check if upper half-space view is currently active
 */
export function isUpperHalfSpaceActive() {
    return upperHalfSpaceActive;
}
