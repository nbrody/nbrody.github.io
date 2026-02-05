// components.js - Track and musical component builders
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { metalMat, brassMat, copperMat } from './materials.js';

function canTriggerSound(body, minInterval = 140) {
    const now = performance.now();
    if (!body._lastSoundAt || now - body._lastSoundAt > minInterval) {
        body._lastSoundAt = now;
        return true;
    }
    return false;
}

export function createRamp(scene, world, start, end, width = 0.6) {
    const dir = new THREE.Vector3().subVectors(end, start);
    const length = dir.length();
    const center = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
    const wallHeight = 0.28;
    const wallThickness = 0.05;

    // Main ramp surface
    const geo = new THREE.BoxGeometry(length, 0.08, width);
    const mesh = new THREE.Mesh(geo, metalMat);
    mesh.position.copy(center);
    mesh.lookAt(end);
    mesh.rotateY(Math.PI / 2);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);

    // Side rails
    const railGeo = new THREE.BoxGeometry(length, 0.12, 0.04);
    const rail1 = new THREE.Mesh(railGeo, brassMat);
    rail1.position.copy(center);
    rail1.position.y += 0.14;
    rail1.lookAt(end);
    rail1.rotateY(Math.PI / 2);
    rail1.translateZ(width / 2 - 0.02);
    scene.add(rail1);

    const rail2 = new THREE.Mesh(railGeo, brassMat);
    rail2.position.copy(center);
    rail2.position.y += 0.14;
    rail2.lookAt(end);
    rail2.rotateY(Math.PI / 2);
    rail2.translateZ(-(width / 2 - 0.02));
    scene.add(rail2);

    // Guard walls
    const wallGeo = new THREE.BoxGeometry(length, wallHeight, wallThickness);
    const wall1 = new THREE.Mesh(wallGeo, brassMat);
    wall1.position.copy(center);
    wall1.position.y += wallHeight / 2;
    wall1.lookAt(end);
    wall1.rotateY(Math.PI / 2);
    wall1.translateZ(width / 2 + wallThickness / 2);
    scene.add(wall1);

    const wall2 = new THREE.Mesh(wallGeo, brassMat);
    wall2.position.copy(center);
    wall2.position.y += wallHeight / 2;
    wall2.lookAt(end);
    wall2.rotateY(Math.PI / 2);
    wall2.translateZ(-(width / 2 + wallThickness / 2));
    scene.add(wall2);

    // Physics body
    const body = new CANNON.Body({
        mass: 0,
        position: new CANNON.Vec3(center.x, center.y, center.z)
    });

    const q = new THREE.Quaternion();
    mesh.getWorldQuaternion(q);
    body.quaternion.set(q.x, q.y, q.z, q.w);

    // Main surface + rails
    body.addShape(new CANNON.Box(new CANNON.Vec3(length / 2, 0.04, width / 2)));
    body.addShape(new CANNON.Box(new CANNON.Vec3(length / 2, 0.12, 0.02)), new CANNON.Vec3(0, 0.14, width / 2 - 0.02));
    body.addShape(new CANNON.Box(new CANNON.Vec3(length / 2, 0.12, 0.02)), new CANNON.Vec3(0, 0.14, -(width / 2 - 0.02)));
    body.addShape(new CANNON.Box(new CANNON.Vec3(length / 2, wallHeight / 2, wallThickness / 2)), new CANNON.Vec3(0, wallHeight / 2, width / 2 + wallThickness / 2));
    body.addShape(new CANNON.Box(new CANNON.Vec3(length / 2, wallHeight / 2, wallThickness / 2)), new CANNON.Vec3(0, wallHeight / 2, -(width / 2 + wallThickness / 2)));

    world.addBody(body);
    return { mesh, body };
}

export function createSpiralTrack(scene, world, cx, cy, cz, radius, height, turns, direction = 1) {
    const points = [];
    const segments = Math.max(20, Math.floor(turns * 40));

    for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        const angle = t * turns * Math.PI * 2 * direction;
        const y = cy + height * (1 - t);
        points.push(new THREE.Vector3(
            cx + Math.cos(angle) * radius,
            y,
            cz + Math.sin(angle) * radius
        ));
    }

    // Main track tube
    const curve = new THREE.CatmullRomCurve3(points);
    const tubeGeo = new THREE.TubeGeometry(curve, segments * 2, 0.14, 12, false);
    const mesh = new THREE.Mesh(tubeGeo, metalMat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);

    // Physics - segmented channel with walls
    const sampleCount = Math.max(60, segments * 2);
    const channelWidth = 0.52;
    const wallHeight = 0.26;
    const wallThickness = 0.05;
    const up = new THREE.Vector3(0, 1, 0);
    const basis = new THREE.Matrix4();
    const q = new THREE.Quaternion();

    for (let i = 0; i < sampleCount; i++) {
        const t0 = i / sampleCount;
        const t1 = (i + 1) / sampleCount;
        const p0 = curve.getPointAt(t0);
        const p1 = curve.getPointAt(t1);
        const dir = new THREE.Vector3().subVectors(p1, p0);
        const length = dir.length();
        if (length < 0.001) continue;
        const tangent = dir.normalize();
        let side = new THREE.Vector3().crossVectors(tangent, up);
        if (side.lengthSq() < 0.0001) {
            side = new THREE.Vector3(0, 0, 1);
        } else {
            side.normalize();
        }
        const trueUp = new THREE.Vector3().crossVectors(side, tangent).normalize();
        basis.makeBasis(tangent, trueUp, side);
        q.setFromRotationMatrix(basis);

        const center = new THREE.Vector3().addVectors(p0, p1).multiplyScalar(0.5);
        const body = new CANNON.Body({
            mass: 0,
            position: new CANNON.Vec3(center.x, center.y, center.z)
        });
        body.quaternion.set(q.x, q.y, q.z, q.w);
        body.addShape(new CANNON.Box(new CANNON.Vec3(length / 2, 0.05, channelWidth / 2)));
        body.addShape(
            new CANNON.Box(new CANNON.Vec3(length / 2, wallHeight / 2, wallThickness / 2)),
            new CANNON.Vec3(0, wallHeight / 2, channelWidth / 2 + wallThickness / 2)
        );
        body.addShape(
            new CANNON.Box(new CANNON.Vec3(length / 2, wallHeight / 2, wallThickness / 2)),
            new CANNON.Vec3(0, wallHeight / 2, -(channelWidth / 2 + wallThickness / 2))
        );
        world.addBody(body);
    }

    return mesh;
}

export function createXylophoneBar(scene, world, position, width, noteIndex, color, audioSystem) {
    const height = 0.12;
    const depth = 0.6;

    const geo = new THREE.BoxGeometry(width, height, depth);
    const mat = new THREE.MeshStandardMaterial({ color, metalness: 0.6, roughness: 0.4 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(position);
    mesh.castShadow = true;
    scene.add(mesh);

    const body = new CANNON.Body({
        mass: 0,
        position: new CANNON.Vec3(position.x, position.y, position.z),
        shape: new CANNON.Box(new CANNON.Vec3(width / 2, height / 2, depth / 2))
    });

    body.addEventListener('collide', (e) => {
        if (e.contact.getImpactVelocityAlongNormal() > 0.5 && canTriggerSound(body, 120)) {
            audioSystem.playChime(noteIndex);
            mesh.material.emissive.set(0x333333);
            setTimeout(() => mesh.material.emissive.set(0x000000), 120);
        }
    });

    world.addBody(body);
    return { mesh, body };
}

export function createBell(scene, world, position, bellIndex, audioSystem) {
    const geo = new THREE.SphereGeometry(0.25, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2);
    const mat = new THREE.MeshStandardMaterial({ color: 0xffd700, metalness: 0.95, roughness: 0.1 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(position);
    mesh.rotation.x = Math.PI;
    scene.add(mesh);

    const body = new CANNON.Body({
        mass: 0,
        position: new CANNON.Vec3(position.x, position.y, position.z),
        shape: new CANNON.Sphere(0.3)
    });

    body.addEventListener('collide', (e) => {
        if (e.contact.getImpactVelocityAlongNormal() > 0.3 && canTriggerSound(body, 200)) {
            audioSystem.playBell(bellIndex);
            mesh.material.emissive.set(0x444400);
            setTimeout(() => mesh.material.emissive.set(0x000000), 220);
        }
    });

    world.addBody(body);
    return { mesh, body };
}

export function createDrumPad(scene, world, position, radius, audioSystem) {
    const geo = new THREE.CylinderGeometry(radius, radius, 0.12, 24);
    const mat = new THREE.MeshStandardMaterial({ color: 0x8b4513, metalness: 0.3, roughness: 0.7 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(position);
    scene.add(mesh);

    const body = new CANNON.Body({
        mass: 0,
        position: new CANNON.Vec3(position.x, position.y, position.z),
        shape: new CANNON.Cylinder(radius, radius, 0.12, 16)
    });

    body.addEventListener('collide', (e) => {
        if (e.contact.getImpactVelocityAlongNormal() > 0.5 && canTriggerSound(body, 140)) {
            audioSystem.playDrum();
            mesh.material.emissive.set(0x331100);
            setTimeout(() => mesh.material.emissive.set(0x000000), 120);
        }
    });

    world.addBody(body);
    return { mesh, body };
}

export function createSpinner(scene, world, x, y, z, numArms, radius, speed, audioSystem = null) {
    const spinnerGroup = new THREE.Group();
    spinnerGroup.position.set(x, y, z);
    scene.add(spinnerGroup);

    // Center hub
    const hubGeo = new THREE.CylinderGeometry(0.25, 0.25, 0.3, 16);
    const hub = new THREE.Mesh(hubGeo, copperMat);
    spinnerGroup.add(hub);

    // Arms
    for (let i = 0; i < numArms; i++) {
        const angle = (i / numArms) * Math.PI * 2;
        const armGeo = new THREE.BoxGeometry(radius, 0.08, 0.25);
        const arm = new THREE.Mesh(armGeo, metalMat);
        arm.position.set(Math.cos(angle) * radius / 2, 0, Math.sin(angle) * radius / 2);
        arm.rotation.y = -angle;
        spinnerGroup.add(arm);
    }

    // Physics body
    const body = new CANNON.Body({
        mass: 0,
        type: CANNON.Body.KINEMATIC,
        position: new CANNON.Vec3(x, y, z)
    });

    for (let i = 0; i < numArms; i++) {
        const angle = (i / numArms) * Math.PI * 2;
        const q = new CANNON.Quaternion();
        q.setFromEuler(0, -angle, 0);
        body.addShape(
            new CANNON.Box(new CANNON.Vec3(radius / 2, 0.04, 0.125)),
            new CANNON.Vec3(Math.cos(angle) * radius / 2, 0, Math.sin(angle) * radius / 2),
            q
        );
    }

    world.addBody(body);

    if (audioSystem) {
        body.addEventListener('collide', (e) => {
            if (e.contact.getImpactVelocityAlongNormal() > 0.6 && canTriggerSound(body, 120)) {
                audioSystem.playClack();
            }
        });
    }

    return { mesh: spinnerGroup, body, speed, type: 'spinner' };
}

export function createChimeRod(scene, world, position, length, noteIndex, audioSystem, color = 0xbcd7ff) {
    const geo = new THREE.CylinderGeometry(0.045, 0.045, length, 10);
    const mat = new THREE.MeshStandardMaterial({
        color,
        metalness: 0.7,
        roughness: 0.25
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(position);
    mesh.castShadow = true;
    scene.add(mesh);

    const body = new CANNON.Body({
        mass: 0,
        position: new CANNON.Vec3(position.x, position.y, position.z),
        shape: new CANNON.Box(new CANNON.Vec3(0.05, length / 2, 0.05))
    });

    body.addEventListener('collide', (e) => {
        if (e.contact.getImpactVelocityAlongNormal() > 0.4 && canTriggerSound(body, 130)) {
            audioSystem.playChimeRod(noteIndex);
            mesh.material.emissive.set(0x334466);
            setTimeout(() => mesh.material.emissive.set(0x000000), 140);
        }
    });

    world.addBody(body);
    return { mesh, body };
}

export function createGong(scene, world, position, radius, audioSystem, gongIndex = 0) {
    const geo = new THREE.CylinderGeometry(radius, radius, 0.08, 32);
    const mat = new THREE.MeshStandardMaterial({
        color: 0xd9a441,
        metalness: 0.95,
        roughness: 0.25
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(position);
    mesh.rotation.x = Math.PI / 2;
    mesh.castShadow = true;
    scene.add(mesh);

    const body = new CANNON.Body({
        mass: 0,
        position: new CANNON.Vec3(position.x, position.y, position.z),
        shape: new CANNON.Box(new CANNON.Vec3(radius, 0.04, radius))
    });
    body.quaternion.setFromEuler(Math.PI / 2, 0, 0);

    body.addEventListener('collide', (e) => {
        if (e.contact.getImpactVelocityAlongNormal() > 0.6 && canTriggerSound(body, 280)) {
            audioSystem.playGong(gongIndex);
            mesh.material.emissive.set(0x553300);
            setTimeout(() => mesh.material.emissive.set(0x000000), 240);
        }
    });

    world.addBody(body);
    return { mesh, body };
}

export function createWobbleBeam(scene, world, position, length, width, amplitude, speed, axis = 'x') {
    const group = new THREE.Group();
    group.position.copy(position);

    const beamGeo = new THREE.BoxGeometry(length, 0.1, width);
    const beam = new THREE.Mesh(beamGeo, brassMat);
    beam.castShadow = true;
    beam.receiveShadow = true;
    group.add(beam);

    const capGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.3, 12);
    const capMat = new THREE.MeshStandardMaterial({ color: 0x666666, metalness: 0.6, roughness: 0.4 });
    const cap1 = new THREE.Mesh(capGeo, capMat);
    cap1.position.set(-length / 2 + 0.15, -0.2, 0);
    const cap2 = new THREE.Mesh(capGeo, capMat);
    cap2.position.set(length / 2 - 0.15, -0.2, 0);
    group.add(cap1, cap2);

    scene.add(group);

    const body = new CANNON.Body({
        mass: 0,
        type: CANNON.Body.KINEMATIC,
        position: new CANNON.Vec3(position.x, position.y, position.z)
    });
    body.addShape(new CANNON.Box(new CANNON.Vec3(length / 2, 0.05, width / 2)));
    world.addBody(body);

    const update = (time) => {
        const angle = Math.sin(time * speed) * amplitude;
        if (axis === 'x') {
            group.rotation.z = angle;
            const q = new CANNON.Quaternion();
            q.setFromEuler(0, 0, angle);
            body.quaternion = q;
        } else {
            group.rotation.x = angle;
            const q = new CANNON.Quaternion();
            q.setFromEuler(angle, 0, 0);
            body.quaternion = q;
        }
        body.position.set(position.x, position.y, position.z);
    };

    return { mesh: group, body, update };
}

export function createBall(scene, world, position, color) {
    const geo = new THREE.SphereGeometry(0.25, 24, 24);
    const mat = new THREE.MeshStandardMaterial({
        color,
        metalness: 0.9,
        roughness: 0.1
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(position);
    mesh.castShadow = true;
    scene.add(mesh);

    const body = new CANNON.Body({
        mass: 1,
        position: new CANNON.Vec3(position.x, position.y, position.z),
        shape: new CANNON.Sphere(0.25)
    });
    body.linearDamping = 0.1;
    body.angularDamping = 0.1;
    world.addBody(body);

    return { mesh, body, isBall: true };
}
