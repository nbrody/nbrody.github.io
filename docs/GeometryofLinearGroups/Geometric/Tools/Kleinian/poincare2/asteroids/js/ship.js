// ship.js — Player ship

import * as THREE from 'three';

export class Ship {
    constructor(space) {
        this.space = space;
        this.position = new THREE.Vector3(
            space.size / 2, space.size / 2, space.size / 2
        );
        this.quaternion = new THREE.Quaternion();
        this.velocity = new THREE.Vector3();
        this.mesh = null;

        this.thrustPower = 30;
        this.maxSpeed = 25;
        this.drag = 0.985;
        this.isThrusting = false;
        this.isInvulnerable = false;
        this.invulnerableTimer = 0;
        this.lives = 3;
    }

    createMesh() {
        const group = new THREE.Group();

        // Classic arrow/dart shape — 3D wireframe
        const v = [
            [0, 0, -2.0],     // 0 nose
            [-1.0, 0.5, 1.0], // 1 left-top
            [1.0, 0.5, 1.0],  // 2 right-top
            [-1.0, -0.5, 1.0],// 3 left-bottom
            [1.0, -0.5, 1.0], // 4 right-bottom
            [0, 0, 0.5],      // 5 tail indent
        ];

        const edges = [
            [0,1],[0,2],[0,3],[0,4],  // nose to corners
            [1,2],[3,4],              // top pair, bottom pair
            [1,3],[2,4],              // left pair, right pair
            [1,5],[2,5],[3,5],[4,5],  // corners to tail
        ];

        const positions = [];
        for (const [a, b] of edges) {
            positions.push(...v[a], ...v[b]);
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position',
            new THREE.Float32BufferAttribute(positions, 3));

        const material = new THREE.LineBasicMaterial({ color: 0xffffff });
        group.add(new THREE.LineSegments(geometry, material));

        this.mesh = group;
        return group;
    }

    // Create thrust flame mesh (toggled on/off)
    createThrustMesh() {
        const positions = [
            -0.4, 0, 0.9,   0, 0, 2.2,
             0.4, 0, 0.9,   0, 0, 2.2,
             0, 0.2, 0.9,   0, 0, 1.8,
             0, -0.2, 0.9,  0, 0, 1.8,
        ];
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position',
            new THREE.Float32BufferAttribute(positions, 3));
        const material = new THREE.LineBasicMaterial({ color: 0xff4400 });
        const flame = new THREE.LineSegments(geometry, material);
        flame.visible = false;
        this.thrustMesh = flame;
        this.mesh.add(flame);
        return flame;
    }

    rotate(pitchRate, yawRate, rollRate, dt) {
        const euler = new THREE.Euler(pitchRate * dt, yawRate * dt, rollRate * dt, 'YXZ');
        const dq = new THREE.Quaternion().setFromEuler(euler);
        this.quaternion.multiply(dq);
        this.quaternion.normalize();
    }

    thrust(dt) {
        const forward = this.getForward();
        this.velocity.addScaledVector(forward, this.thrustPower * dt);
        if (this.velocity.length() > this.maxSpeed) {
            this.velocity.setLength(this.maxSpeed);
        }
        this.isThrusting = true;
    }

    update(dt) {
        this.velocity.multiplyScalar(this.drag);
        this.space.move(this.position, this.velocity, dt);

        if (this.mesh) {
            this.mesh.position.copy(this.position);
            this.mesh.quaternion.copy(this.quaternion);
        }

        // Thrust flame flicker
        if (this.thrustMesh) {
            this.thrustMesh.visible = this.isThrusting;
            if (this.isThrusting) {
                const scale = 0.7 + Math.random() * 0.6;
                this.thrustMesh.scale.set(1, 1, scale);
            }
        }

        // Invulnerability blink
        if (this.isInvulnerable) {
            this.invulnerableTimer -= dt;
            if (this.invulnerableTimer <= 0) {
                this.isInvulnerable = false;
                if (this.mesh) this.mesh.visible = true;
            } else if (this.mesh) {
                this.mesh.visible = Math.floor(this.invulnerableTimer * 8) % 2 === 0;
            }
        }

        this.isThrusting = false;
    }

    respawn() {
        this.position.set(
            this.space.size / 2, this.space.size / 2, this.space.size / 2
        );
        this.velocity.set(0, 0, 0);
        this.quaternion.identity();
        this.isInvulnerable = true;
        this.invulnerableTimer = 3.0;
    }

    getForward() {
        return new THREE.Vector3(0, 0, -1).applyQuaternion(this.quaternion);
    }

    getUp() {
        return new THREE.Vector3(0, 1, 0).applyQuaternion(this.quaternion);
    }

    getBoundingRadius() {
        return 1.2;
    }
}
