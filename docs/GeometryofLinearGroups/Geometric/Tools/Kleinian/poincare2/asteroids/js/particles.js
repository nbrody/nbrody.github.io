// particles.js — Explosion and debris particle effects

import * as THREE from 'three';

export class ParticleSystem {
    constructor(scene) {
        this.scene = scene;
        this.bursts = [];
    }

    explode(position, count = 20, color = 0xffaa00, speed = 10) {
        const positions = new Float32Array(count * 3);
        const velocities = [];

        for (let i = 0; i < count; i++) {
            positions[i * 3]     = position.x;
            positions[i * 3 + 1] = position.y;
            positions[i * 3 + 2] = position.z;
            velocities.push(new THREE.Vector3(
                (Math.random() - 0.5) * speed,
                (Math.random() - 0.5) * speed,
                (Math.random() - 0.5) * speed
            ));
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position',
            new THREE.Float32BufferAttribute(positions, 3));

        const material = new THREE.PointsMaterial({
            color, size: 0.4, sizeAttenuation: true,
            transparent: true, opacity: 1
        });
        const points = new THREE.Points(geometry, material);
        this.scene.add(points);

        this.bursts.push({ points, geometry, velocities, material,
                           age: 0, lifetime: 0.8, count });
    }

    // Line-debris explosion (looks more retro)
    explodeLines(position, count = 12, color = 0xffaa00, speed = 12) {
        const positions = [];
        const velocities = [];
        const lengths = [];

        for (let i = 0; i < count; i++) {
            const dir = new THREE.Vector3(
                Math.random() - 0.5,
                Math.random() - 0.5,
                Math.random() - 0.5
            ).normalize();
            const vel = dir.clone().multiplyScalar(speed * (0.4 + Math.random() * 0.6));
            const len = 0.3 + Math.random() * 0.8;

            // Line: from pos to pos + dir * len
            positions.push(
                position.x, position.y, position.z,
                position.x + dir.x * len, position.y + dir.y * len, position.z + dir.z * len
            );
            velocities.push(vel);
            lengths.push(len);
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position',
            new THREE.Float32BufferAttribute(positions, 3));

        const material = new THREE.LineBasicMaterial({
            color, transparent: true, opacity: 1
        });
        const lines = new THREE.LineSegments(geometry, material);
        this.scene.add(lines);

        this.bursts.push({ points: lines, geometry, velocities, material,
                           age: 0, lifetime: 1.0, count, isLines: true, lengths });
    }

    update(dt) {
        for (let i = this.bursts.length - 1; i >= 0; i--) {
            const b = this.bursts[i];
            b.age += dt;

            if (b.age >= b.lifetime) {
                this.scene.remove(b.points);
                b.geometry.dispose();
                b.material.dispose();
                this.bursts.splice(i, 1);
                continue;
            }

            const arr = b.geometry.attributes.position.array;
            if (b.isLines) {
                for (let j = 0; j < b.count; j++) {
                    const vi = j * 6;
                    const vel = b.velocities[j];
                    // Move both endpoints
                    arr[vi]     += vel.x * dt;
                    arr[vi + 1] += vel.y * dt;
                    arr[vi + 2] += vel.z * dt;
                    arr[vi + 3] += vel.x * dt;
                    arr[vi + 4] += vel.y * dt;
                    arr[vi + 5] += vel.z * dt;
                }
            } else {
                for (let j = 0; j < b.count; j++) {
                    arr[j * 3]     += b.velocities[j].x * dt;
                    arr[j * 3 + 1] += b.velocities[j].y * dt;
                    arr[j * 3 + 2] += b.velocities[j].z * dt;
                }
            }
            b.geometry.attributes.position.needsUpdate = true;
            b.material.opacity = 1 - (b.age / b.lifetime);
        }
    }
}
