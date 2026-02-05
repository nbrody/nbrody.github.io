// components.js - Track and musical component builders
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { metalMat, brassMat, copperMat } from './materials.js';

export function createRamp(scene, world, start, end, width = 0.6) {
    const dir = new THREE.Vector3().subVectors(end, start);
    const length = dir.length();
    const center = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);

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
    rail1.position.y += 0.08;
    rail1.lookAt(end);
    rail1.rotateY(Math.PI / 2);
    rail1.translateZ(width / 2 - 0.02);
    scene.add(rail1);

    const rail2 = new THREE.Mesh(railGeo, brassMat);
    rail2.position.copy(center);
    rail2.position.y += 0.08;
    rail2.lookAt(end);
    rail2.rotateY(Math.PI / 2);
    rail2.translateZ(-(width / 2 - 0.02));
    scene.add(rail2);

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
    body.addShape(new CANNON.Box(new CANNON.Vec3(length / 2, 0.06, 0.02)), new CANNON.Vec3(0, 0.08, width / 2 - 0.02));
    body.addShape(new CANNON.Box(new CANNON.Vec3(length / 2, 0.06, 0.02)), new CANNON.Vec3(0, 0.08, -(width / 2 - 0.02)));

    world.addBody(body);
    return { mesh, body };
}

export function createSpiralTrack(scene, world, cx, cy, cz, radius, height, turns, direction = 1) {
    const points = [];
    const segments = turns * 32;

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
    const tubeGeo = new THREE.TubeGeometry(curve, segments, 0.08, 8, false);
    const mesh = new THREE.Mesh(tubeGeo, metalMat);
    mesh.castShadow = true;
    scene.add(mesh);

    // Physics - spheres along the path
    const numBodies = Math.ceil(curve.getLength() / 0.4);
    for (let i = 0; i <= numBodies; i++) {
        const t = i / numBodies;
        const pt = curve.getPointAt(t);
        const body = new CANNON.Body({
            mass: 0,
            position: new CANNON.Vec3(pt.x, pt.y, pt.z),
            shape: new CANNON.Sphere(0.12)
        });
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
        if (e.contact.getImpactVelocityAlongNormal() > 0.5) {
            audioSystem.playChime(noteIndex);
            mesh.material.emissive.set(0x333333);
            setTimeout(() => mesh.material.emissive.set(0x000000), 100);
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
        if (e.contact.getImpactVelocityAlongNormal() > 0.3) {
            audioSystem.playBell(bellIndex);
            mesh.material.emissive.set(0x444400);
            setTimeout(() => mesh.material.emissive.set(0x000000), 200);
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
        if (e.contact.getImpactVelocityAlongNormal() > 0.5) {
            audioSystem.playDrum();
            mesh.material.emissive.set(0x331100);
            setTimeout(() => mesh.material.emissive.set(0x000000), 100);
        }
    });

    world.addBody(body);
    return { mesh, body };
}

export function createSpinner(scene, world, x, y, z, numArms, radius, speed) {
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

    return { mesh: spinnerGroup, body, speed, type: 'spinner' };
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
