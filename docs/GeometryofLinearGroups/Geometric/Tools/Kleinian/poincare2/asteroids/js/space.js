// space.js — Euclidean 3-Torus geometry
// Swappable module: replace with HyperbolicManifoldSpace for curved quotients.

import * as THREE from 'three';

export class TorusSpace {
    constructor(size = 50) {
        this.size = size;
        this.halfSize = size / 2;
    }

    // Wrap position into [0, L)^3
    wrap(position) {
        const L = this.size;
        position.x = ((position.x % L) + L) % L;
        position.y = ((position.y % L) + L) % L;
        position.z = ((position.z % L) + L) % L;
        return position;
    }

    // Shortest displacement from a to b on the torus
    displacement(a, b) {
        const h = this.halfSize;
        const L = this.size;
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let dz = b.z - a.z;
        if (dx > h) dx -= L; else if (dx < -h) dx += L;
        if (dy > h) dy -= L; else if (dy < -h) dy += L;
        if (dz > h) dz -= L; else if (dz < -h) dz += L;
        return new THREE.Vector3(dx, dy, dz);
    }

    // Shortest distance on the torus
    distance(a, b) {
        return this.displacement(a, b).length();
    }

    // Linear motion + wrap (geodesic in flat torus)
    move(position, velocity, dt) {
        position.addScaledVector(velocity, dt);
        this.wrap(position);
        return position;
    }

    // Ghost copy offsets for objects near boundaries.
    // Returns Vector3 offsets for neighbor cells where copies should render.
    getGhostOffsets(position, radius) {
        const offsets = [];
        const L = this.size;
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                for (let dz = -1; dz <= 1; dz++) {
                    if (dx === 0 && dy === 0 && dz === 0) continue;
                    const needX = dx === 0 || (dx === -1 && position.x < radius) ||
                                  (dx === 1 && position.x > L - radius);
                    const needY = dy === 0 || (dy === -1 && position.y < radius) ||
                                  (dy === 1 && position.y > L - radius);
                    const needZ = dz === 0 || (dz === -1 && position.z < radius) ||
                                  (dz === 1 && position.z > L - radius);
                    if (needX && needY && needZ &&
                        (dx !== 0 || dy !== 0 || dz !== 0)) {
                        offsets.push(new THREE.Vector3(dx * L, dy * L, dz * L));
                    }
                }
            }
        }
        return offsets;
    }
}
