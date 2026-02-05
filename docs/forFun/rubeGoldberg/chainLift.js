// chainLift.js - Bike chain style elevator with J-hook carriers
import * as THREE from 'three';
import * as CANNON from 'cannon-es';

export class ChainLift {
    constructor(scene, world, x, z, bottomY, topY, numHooks, speed) {
        this.scene = scene;
        this.world = world;
        this.x = x;
        this.z = z;
        this.bottomY = bottomY;
        this.topY = topY;
        this.height = topY - bottomY;
        this.numHooks = numHooks;
        this.speed = speed;

        this.hooks = [];
        this.wheelRotation = 0;
        this.ballOffset = new THREE.Vector3(0.65, 0.25, 0);

        this.createStructure();
        this.createHooks();
    }

    createStructure() {
        // Vertical frame rails
        const frameGeo = new THREE.BoxGeometry(0.1, this.height + 3, 0.1);
        const frameMat = new THREE.MeshStandardMaterial({
            color: 0x333333,
            metalness: 0.8,
            roughness: 0.3
        });

        // Two frame posts
        const leftFrame = new THREE.Mesh(frameGeo, frameMat);
        leftFrame.position.set(this.x - 0.8, this.bottomY + this.height / 2, this.z - 0.4);
        this.scene.add(leftFrame);

        const rightFrame = new THREE.Mesh(frameGeo, frameMat);
        rightFrame.position.set(this.x - 0.8, this.bottomY + this.height / 2, this.z + 0.4);
        this.scene.add(rightFrame);

        // Sprocket wheels
        const wheelGeo = new THREE.TorusGeometry(0.5, 0.08, 8, 16);
        const wheelMat = new THREE.MeshStandardMaterial({
            color: 0xd4af37,
            metalness: 0.9,
            roughness: 0.2
        });

        this.topWheel = new THREE.Mesh(wheelGeo, wheelMat);
        this.topWheel.position.set(this.x, this.topY + 0.5, this.z);
        this.topWheel.rotation.y = Math.PI / 2;
        this.scene.add(this.topWheel);

        this.bottomWheel = new THREE.Mesh(wheelGeo, wheelMat);
        this.bottomWheel.position.set(this.x, this.bottomY - 0.5, this.z);
        this.bottomWheel.rotation.y = Math.PI / 2;
        this.scene.add(this.bottomWheel);

        // Chain visual (vertical bar)
        const chainMat = new THREE.MeshStandardMaterial({ color: 0x555555, metalness: 0.8, roughness: 0.3 });
        const chainGeo = new THREE.BoxGeometry(0.06, this.height + 1, 0.06);

        // Front chain (carries hooks up)
        const frontChain = new THREE.Mesh(chainGeo, chainMat);
        frontChain.position.set(this.x + 0.45, this.bottomY + this.height / 2, this.z);
        this.scene.add(frontChain);

        // Back chain (hooks go down)
        const backChain = new THREE.Mesh(chainGeo, chainMat);
        backChain.position.set(this.x - 0.45, this.bottomY + this.height / 2, this.z);
        this.scene.add(backChain);
    }

    createHooks() {
        for (let i = 0; i < this.numHooks; i++) {
            const hook = this.createSingleHook(i);
            this.hooks.push(hook);
        }
    }

    createSingleHook(index) {
        const group = new THREE.Group();

        const hookMat = new THREE.MeshStandardMaterial({
            color: 0x4488bb,
            metalness: 0.75,
            roughness: 0.3
        });

        // J-HOOK DESIGN:
        // Vertical arm connects to chain
        // Horizontal arm sticks out
        // Curved cradle at the end holds the ball

        // Vertical arm (connects to chain)
        const armGeo = new THREE.BoxGeometry(0.08, 0.6, 0.08);
        const arm = new THREE.Mesh(armGeo, hookMat);
        arm.position.set(0, 0.3, 0);
        group.add(arm);

        // Horizontal extension
        const extGeo = new THREE.BoxGeometry(0.5, 0.08, 0.08);
        const ext = new THREE.Mesh(extGeo, hookMat);
        ext.position.set(0.25, 0, 0);
        group.add(ext);

        // Cradle - curved piece to hold ball (made of multiple small boxes)
        // Back wall of cradle
        const backGeo = new THREE.BoxGeometry(0.08, 0.35, 0.5);
        const back = new THREE.Mesh(backGeo, hookMat);
        back.position.set(0.5, 0.15, 0);
        group.add(back);

        // Bottom of cradle
        const bottomGeo = new THREE.BoxGeometry(0.35, 0.08, 0.5);
        const bottom = new THREE.Mesh(bottomGeo, hookMat);
        bottom.position.set(0.65, 0, 0);
        group.add(bottom);

        // Front lip (small, so ball can roll out at top)
        const lipGeo = new THREE.BoxGeometry(0.08, 0.15, 0.5);
        const lip = new THREE.Mesh(lipGeo, hookMat);
        lip.position.set(0.8, 0.05, 0);
        group.add(lip);

        // Side walls
        const sideGeo = new THREE.BoxGeometry(0.35, 0.3, 0.06);
        const side1 = new THREE.Mesh(sideGeo, hookMat);
        side1.position.set(0.65, 0.12, 0.22);
        group.add(side1);
        const side2 = new THREE.Mesh(sideGeo, hookMat);
        side2.position.set(0.65, 0.12, -0.22);
        group.add(side2);

        this.scene.add(group);

        // Physics body - the cradle shape
        const body = new CANNON.Body({
            mass: 0,
            type: CANNON.Body.KINEMATIC
        });

        // Bottom of cradle
        body.addShape(
            new CANNON.Box(new CANNON.Vec3(0.175, 0.04, 0.25)),
            new CANNON.Vec3(0.65, 0, 0)
        );
        // Back wall
        body.addShape(
            new CANNON.Box(new CANNON.Vec3(0.04, 0.175, 0.25)),
            new CANNON.Vec3(0.5, 0.15, 0)
        );
        // Front lip
        body.addShape(
            new CANNON.Box(new CANNON.Vec3(0.04, 0.075, 0.25)),
            new CANNON.Vec3(0.8, 0.05, 0)
        );
        // Side walls
        body.addShape(
            new CANNON.Box(new CANNON.Vec3(0.175, 0.15, 0.03)),
            new CANNON.Vec3(0.65, 0.12, 0.22)
        );
        body.addShape(
            new CANNON.Box(new CANNON.Vec3(0.175, 0.15, 0.03)),
            new CANNON.Vec3(0.65, 0.12, -0.22)
        );

        this.world.addBody(body);

        const progress = index / this.numHooks;
        return { mesh: group, body, progress, ball: null };
    }

    getPositionOnChain(progress) {
        // Chain path (racetrack):
        // 0.00 - 0.45: Going UP on the right (hooks facing outward, carrying balls)
        // 0.45 - 0.55: Going over TOP (hooks tip, balls roll off)
        // 0.55 - 0.95: Going DOWN on the left (hooks facing inward, empty)
        // 0.95 - 1.00: Going around BOTTOM (ready to scoop new balls)

        const halfWidth = 0.45;
        let x, y, rotation = 0;

        if (progress < 0.45) {
            // Moving UP - hooks point outward (positive X from chain)
            const t = progress / 0.45;
            x = halfWidth;
            y = this.bottomY + t * this.height;
            rotation = 0;
        } else if (progress < 0.55) {
            // Rounding TOP - hooks tip forward, dumping balls
            const t = (progress - 0.45) / 0.1;
            const angle = t * Math.PI;
            x = Math.cos(angle) * halfWidth;
            y = this.topY + Math.sin(angle) * 0.4;
            rotation = angle;  // Rotates from 0 to PI (tips forward)
        } else if (progress < 0.95) {
            // Moving DOWN - hooks point inward (empty return)
            const t = (progress - 0.55) / 0.4;
            x = -halfWidth;
            y = this.topY - t * this.height;
            rotation = Math.PI;  // Upside down
        } else {
            // Rounding BOTTOM - hooks scoop up new balls
            const t = (progress - 0.95) / 0.05;
            const angle = Math.PI + t * Math.PI;
            x = Math.cos(angle) * halfWidth;
            y = this.bottomY + (Math.sin(angle) + 1) * 0.3;
            rotation = angle;  // Rotates from PI to 2PI (back to upright)
        }

        return { x: this.x + x, y, z: this.z, rotation };
    }

    update() {
        // Rotate sprocket wheels
        this.wheelRotation += this.speed * 2.5;
        this.topWheel.rotation.x = this.wheelRotation;
        this.bottomWheel.rotation.x = this.wheelRotation;

        // Update each hook
        this.hooks.forEach(hook => {
            hook.progress = (hook.progress + this.speed) % 1;

            const pos = this.getPositionOnChain(hook.progress);

            // Position and rotation
            hook.body.position.set(pos.x, pos.y, pos.z);
            hook.mesh.position.set(pos.x, pos.y, pos.z);

            hook.mesh.rotation.z = pos.rotation;
            const q = new CANNON.Quaternion();
            q.setFromEuler(0, 0, pos.rotation);
            hook.body.quaternion = q;

            if (hook.ball) {
                const offset = this.ballOffset.clone().applyAxisAngle(new THREE.Vector3(0, 0, 1), pos.rotation);
                hook.ball.body.position.set(pos.x + offset.x, pos.y + offset.y, pos.z + offset.z);
                hook.ball.body.velocity.set(0, 0, 0);
                hook.ball.body.angularVelocity.set(0, 0, 0);

                if (hook.progress > 0.47 && hook.progress < 0.6) {
                    hook.ball.body.type = CANNON.Body.DYNAMIC;
                    hook.ball.body.velocity.set(1.5, 0.2, 0);
                    hook.ball._justReleasedUntil = performance.now() + 500;
                    hook.ball = null;
                }
            }
        });
    }

    captureBalls(balls) {
        const now = performance.now();
        for (const hook of this.hooks) {
            if (hook.ball) continue;
            if (hook.progress < 0.03 || hook.progress > 0.42) continue;

            const pos = this.getPositionOnChain(hook.progress);
            const offset = this.ballOffset.clone();
            const target = new THREE.Vector3(pos.x + offset.x, pos.y + offset.y, pos.z + offset.z);

            for (const ball of balls) {
                if (ball._justReleasedUntil && now < ball._justReleasedUntil) continue;
                if (ball.body.type !== CANNON.Body.DYNAMIC) continue;
                const dx = ball.body.position.x - target.x;
                const dy = ball.body.position.y - target.y;
                const dz = ball.body.position.z - target.z;
                const distSq = dx * dx + dy * dy + dz * dz;
                if (distSq < 0.18) {
                    hook.ball = ball;
                    ball.body.type = CANNON.Body.KINEMATIC;
                    ball.body.velocity.set(0, 0, 0);
                    ball.body.angularVelocity.set(0, 0, 0);
                    break;
                }
            }
        }
    }

    // Get positions for balls to start on hooks
    getStartPositions(numBalls) {
        const positions = [];
        for (let i = 0; i < numBalls; i++) {
            // Evenly space on the upward section (0 to 0.4 progress)
            const progress = (i / numBalls) * 0.38 + 0.03;
            const pos = this.getPositionOnChain(progress);
            // Ball sits in the cradle, offset outward from the hook attachment point
            positions.push(new THREE.Vector3(pos.x + 0.65, pos.y + 0.25, pos.z));
        }
        return positions;
    }
}
