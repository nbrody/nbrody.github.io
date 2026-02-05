// physics.js - Physics world setup and utilities
import * as CANNON from 'cannon-es';

export function createWorld() {
    const world = new CANNON.World();
    world.gravity.set(0, -9.82, 0);
    world.broadphase = new CANNON.SAPBroadphase(world);

    // Default contact material
    world.defaultContactMaterial.friction = 0.2;
    world.defaultContactMaterial.restitution = 0.35;

    return world;
}

export function createBallBody(position, radius = 0.25) {
    const body = new CANNON.Body({
        mass: 1,
        position: new CANNON.Vec3(position.x, position.y, position.z),
        shape: new CANNON.Sphere(radius)
    });
    body.linearDamping = 0.1;
    body.angularDamping = 0.1;
    return body;
}

export function createStaticBox(position, halfExtents, rotation = null) {
    const body = new CANNON.Body({
        mass: 0,
        position: new CANNON.Vec3(position.x, position.y, position.z),
        shape: new CANNON.Box(new CANNON.Vec3(halfExtents.x, halfExtents.y, halfExtents.z))
    });
    if (rotation) {
        body.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);
    }
    return body;
}
