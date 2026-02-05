// teleporter.js - Ball teleportation system for infinite loop
import * as THREE from 'three';
import * as CANNON from 'cannon-es';

export class Teleporter {
    constructor(scene, bottomY = 1.5, topY = 18) {
        this.scene = scene;
        this.bottomY = bottomY;
        this.topY = topY;
        this.centerX = 0;
        this.centerZ = 0;
        this.teleportingBalls = [];
        this.teleportSpeed = 0.02;

        this.createVisuals();
    }

    createVisuals() {
        const height = this.topY - this.bottomY;

        // Glowing transparent tube
        const tubeGeo = new THREE.CylinderGeometry(0.7, 0.7, height + 1, 32, 1, true);
        const tubeMat = new THREE.MeshPhysicalMaterial({
            color: 0x4488ff,
            transparent: true,
            opacity: 0.12,
            metalness: 0.1,
            roughness: 0.1,
            side: THREE.DoubleSide
        });
        const tube = new THREE.Mesh(tubeGeo, tubeMat);
        tube.position.set(this.centerX, (this.bottomY + this.topY) / 2, this.centerZ);
        this.scene.add(tube);

        // Glowing rings
        const ringCount = Math.floor(height / 2.5);
        for (let i = 0; i < ringCount; i++) {
            const ringGeo = new THREE.TorusGeometry(0.75, 0.04, 8, 32);
            const ringMat = new THREE.MeshStandardMaterial({
                color: 0x66aaff,
                emissive: 0x2244aa,
                emissiveIntensity: 0.5
            });
            const ring = new THREE.Mesh(ringGeo, ringMat);
            ring.position.set(this.centerX, this.bottomY + i * 2.5 + 1, this.centerZ);
            ring.rotation.x = Math.PI / 2;
            this.scene.add(ring);
        }

        // Top and bottom caps
        const capGeo = new THREE.TorusGeometry(0.7, 0.12, 16, 32);
        const capMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.9, roughness: 0.2 });

        const topCap = new THREE.Mesh(capGeo, capMat);
        topCap.position.set(this.centerX, this.topY + 0.3, this.centerZ);
        topCap.rotation.x = Math.PI / 2;
        this.scene.add(topCap);

        const bottomCap = new THREE.Mesh(capGeo, capMat);
        bottomCap.position.set(this.centerX, this.bottomY - 0.3, this.centerZ);
        bottomCap.rotation.x = Math.PI / 2;
        this.scene.add(bottomCap);

        // Central core
        const coreGeo = new THREE.CylinderGeometry(0.08, 0.08, height, 16);
        const coreMat = new THREE.MeshBasicMaterial({ color: 0x88ccff });
        const core = new THREE.Mesh(coreGeo, coreMat);
        core.position.set(this.centerX, (this.bottomY + this.topY) / 2, this.centerZ);
        this.scene.add(core);
    }

    tryCapture(ballObj) {
        // Check if already teleporting
        if (this.teleportingBalls.some(tb => tb.obj === ballObj)) {
            return false;
        }

        const pos = ballObj.body.position;
        const dx = pos.x - this.centerX;
        const dz = pos.z - this.centerZ;
        const dist = Math.sqrt(dx * dx + dz * dz);

        // Capture if near center and at bottom
        if (dist < 1.2 && pos.y < this.bottomY + 0.8 && pos.y > 0) {
            ballObj.body.type = CANNON.Body.STATIC;
            ballObj.body.velocity.set(0, 0, 0);
            ballObj.body.angularVelocity.set(0, 0, 0);

            this.teleportingBalls.push({
                obj: ballObj,
                progress: 0,
                startAngle: Math.random() * Math.PI * 2
            });
            return true;
        }
        return false;
    }

    update() {
        for (let i = this.teleportingBalls.length - 1; i >= 0; i--) {
            const tb = this.teleportingBalls[i];
            tb.progress += this.teleportSpeed;

            if (tb.progress >= 1) {
                // Release at top
                const releaseAngle = Math.random() * Math.PI * 2;
                const releaseRadius = 1.2;

                tb.obj.body.position.set(
                    this.centerX + Math.cos(releaseAngle) * releaseRadius,
                    this.topY + 0.5,
                    this.centerZ + Math.sin(releaseAngle) * releaseRadius
                );
                tb.obj.body.velocity.set(
                    Math.cos(releaseAngle) * 2,
                    0.5,
                    Math.sin(releaseAngle) * 2
                );
                tb.obj.body.angularVelocity.set(0, 0, 0);
                tb.obj.body.type = CANNON.Body.DYNAMIC;
                tb.obj.mesh.visible = true;

                this.teleportingBalls.splice(i, 1);
            } else {
                // Animate spiral upward
                const y = this.bottomY + (this.topY - this.bottomY) * tb.progress;
                const spiralAngle = tb.progress * Math.PI * 6 + tb.startAngle;
                const spiralRadius = 0.25;

                tb.obj.mesh.position.set(
                    this.centerX + Math.cos(spiralAngle) * spiralRadius,
                    y,
                    this.centerZ + Math.sin(spiralAngle) * spiralRadius
                );
            }
        }
    }

    isTeleporting(ballObj) {
        return this.teleportingBalls.some(tb => tb.obj === ballObj);
    }
}
