// asteroid.js — Asteroid entities

import * as THREE from 'three';

const RADII  = { large: 3.5, medium: 2.0, small: 1.0 };
const SPEEDS = { large: 3,   medium: 5.5, small: 8 };
const SCORES = { large: 20,  medium: 50,  small: 100 };
const SPLIT  = { large: 3,   medium: 3 };

export class Asteroid {
    constructor(space, position, size = 'large', velocity = null) {
        this.space = space;
        this.position = position.clone();
        this.size = size;
        this.radius = RADII[size];
        this.score = SCORES[size];
        this.mesh = null;

        this.rotationAxis = new THREE.Vector3(
            Math.random() - 0.5,
            Math.random() - 0.5,
            Math.random() - 0.5
        ).normalize();
        this.rotationSpeed = (Math.random() * 1.5 + 0.5) *
                             (Math.random() < 0.5 ? 1 : -1);
        this.angle = Math.random() * Math.PI * 2;

        if (velocity) {
            this.velocity = velocity.clone();
        } else {
            this.velocity = new THREE.Vector3(
                Math.random() - 0.5,
                Math.random() - 0.5,
                Math.random() - 0.5
            ).normalize().multiplyScalar(SPEEDS[size] * (0.6 + Math.random() * 0.8));
        }
    }

    createMesh() {
        // Subdivision 1 for large, 0 for medium/small — cleaner retro wireframe
        const detail = this.size === 'large' ? 1 : 0;
        const baseGeom = new THREE.IcosahedronGeometry(this.radius, detail);
        const pos = baseGeom.attributes.position;

        // Deduplicate vertices by position, then displace consistently
        // so shared edges don't split apart
        const vertMap = new Map();
        const displacements = [];
        const tolerance = 0.001;

        for (let i = 0; i < pos.count; i++) {
            const x = pos.getX(i);
            const y = pos.getY(i);
            const z = pos.getZ(i);
            const key = `${Math.round(x / tolerance)},${Math.round(y / tolerance)},${Math.round(z / tolerance)}`;
            if (!vertMap.has(key)) {
                vertMap.set(key, (Math.random() - 0.5) * 0.5 * this.radius);
            }
            const displacement = vertMap.get(key);
            const len = Math.sqrt(x * x + y * y + z * z);
            const scale = (len + displacement) / len;
            pos.setXYZ(i, x * scale, y * scale, z * scale);
        }
        pos.needsUpdate = true;
        baseGeom.computeVertexNormals();

        // EdgesGeometry gives clean outline edges (no internal diagonals)
        const edges = new THREE.EdgesGeometry(baseGeom, 12);
        const material = new THREE.LineBasicMaterial({ color: 0xaaaaaa });
        this.mesh = new THREE.LineSegments(edges, material);
        return this.mesh;
    }

    update(dt) {
        this.space.move(this.position, this.velocity, dt);
        this.angle += this.rotationSpeed * dt;
        if (this.mesh) {
            this.mesh.position.copy(this.position);
            this.mesh.setRotationFromAxisAngle(this.rotationAxis, this.angle);
        }
    }

    split() {
        if (this.size === 'small') return [];
        const nextSize = this.size === 'large' ? 'medium' : 'small';
        const count = SPLIT[this.size];
        const children = [];
        for (let i = 0; i < count; i++) {
            const angle = (i / count) * Math.PI * 2;
            const offset = new THREE.Vector3(
                Math.cos(angle) * this.radius * 0.4,
                (Math.random() - 0.5) * this.radius * 0.4,
                Math.sin(angle) * this.radius * 0.4
            );
            const childVel = this.velocity.clone().add(
                offset.clone().normalize().multiplyScalar(SPEEDS[nextSize] * 0.6)
            );
            const childPos = this.position.clone().add(offset);
            this.space.wrap(childPos);
            children.push(new Asteroid(this.space, childPos, nextSize, childVel));
        }
        return children;
    }

    getBoundingRadius() {
        return this.radius * 0.75;
    }
}
