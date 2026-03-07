// bullet.js — Projectile

import * as THREE from 'three';

export class Bullet {
    constructor(space, position, direction, speed = 45) {
        this.space = space;
        this.position = position.clone();
        this.velocity = direction.clone().normalize().multiplyScalar(speed);
        this.lifetime = 2.0;
        this.age = 0;
        this.mesh = null;
    }

    createMesh() {
        const len = 0.8;
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute([
            0, 0, 0,
            0, 0, -len
        ], 3));
        const material = new THREE.LineBasicMaterial({ color: 0x00ffff });
        this.mesh = new THREE.Line(geometry, material);
        return this.mesh;
    }

    update(dt) {
        this.age += dt;
        this.space.move(this.position, this.velocity, dt);
        if (this.mesh) {
            this.mesh.position.copy(this.position);
            this.mesh.quaternion.setFromUnitVectors(
                new THREE.Vector3(0, 0, -1),
                this.velocity.clone().normalize()
            );
        }
    }

    isExpired() {
        return this.age >= this.lifetime;
    }

    getBoundingRadius() {
        return 0.3;
    }
}
