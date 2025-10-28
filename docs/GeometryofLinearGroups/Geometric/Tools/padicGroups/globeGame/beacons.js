import * as THREE from 'three';

const earthRadius = 10;
const beaconOffset = 0.0;

export function addBeaconAtLatLon(earthMesh, latDeg, lonDeg, colorHex) {
    // Convert lat/lon in degrees to unit normal in the globe's coordinates
    const lat = THREE.MathUtils.degToRad(latDeg);
    const lon = THREE.MathUtils.degToRad(lonDeg);
    const phi = Math.PI / 2 - lat;
    const theta = lon + Math.PI;
    const n = new THREE.Vector3(
        -Math.sin(phi) * Math.cos(theta),
        Math.cos(phi),
        Math.sin(phi) * Math.sin(theta)
    ).normalize();

    // Group that rides with the Earth
    const g = new THREE.Group();
    earthMesh.add(g);
    g.position.copy(n.clone().multiplyScalar(earthRadius + beaconOffset));
    g.quaternion.copy(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), n));

    // Simple emissive material in the requested color
    const poleMat = new THREE.MeshStandardMaterial({ color: colorHex, emissive: colorHex, emissiveIntensity: 0.6, metalness: 0.1, roughness: 0.4 });
    const bulbMat = new THREE.MeshStandardMaterial({ color: colorHex, emissive: colorHex, emissiveIntensity: 1.2, metalness: 0.0, roughness: 0.2 });

    // Pole + bulb (compact, same size for all beacons)
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.7, 16), poleMat);
    pole.position.y = 0.35;
    g.add(pole);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 16), bulbMat);
    bulb.position.y = 0.7;
    g.add(bulb);

    // Light glow
    const light = new THREE.PointLight(colorHex, 2.5, 20, 2.0);
    light.position.set(0, 0.8, 0);
    g.add(light);
    return g;
}

export function addBeaconAtXYZ(earthMesh, vec3, colorHex) {
    // Normalize the input vector to ensure placement on the sphere surface
    const n = vec3.clone().normalize();

    // Group that rides with the Earth
    const g = new THREE.Group();
    earthMesh.add(g);
    g.position.copy(n.clone().multiplyScalar(earthRadius + beaconOffset));
    g.quaternion.copy(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), n));

    // Materials (match style used in addBeaconAtLatLon)
    const poleMat = new THREE.MeshStandardMaterial({ color: colorHex, emissive: colorHex, emissiveIntensity: 0.6, metalness: 0.1, roughness: 0.4 });
    const bulbMat = new THREE.MeshStandardMaterial({ color: colorHex, emissive: colorHex, emissiveIntensity: 1.2, metalness: 0.0, roughness: 0.2 });

    // Pole + bulb
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.7, 16), poleMat);
    pole.position.y = 0.35;
    g.add(pole);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 16), bulbMat);
    bulb.position.y = 0.7;
    g.add(bulb);

    // Light glow
    const light = new THREE.PointLight(colorHex, 2.5, 20, 2.0);
    light.position.set(0, 0.8, 0);
    g.add(light);
    return g;
}

export function addBeaconAtABC(earthMesh, a, b, c, colorHex, den = 105625) {
    // Map (a,b,c) to globe coords via (x,y,z) = (a, c, -b), then scale by denominator
    const x = a / den;
    const y = c / den;
    const z = (-b) / den;
    return addBeaconAtXYZ(earthMesh, new THREE.Vector3(x, y, z), colorHex);
}

export function createCharacter(SCBeacon) {
    // === Little character perched above the beacon (fixed in world space) ===
    const character = new THREE.Group();

    // Place him at the top of the beacon in *world* coordinates, then leave him there
    SCBeacon.updateWorldMatrix(true, true);
    const charLocal = new THREE.Vector3(0, 1.05, 0); // offset above beacon base (matches beacon geometry)
    const charWorld = SCBeacon.localToWorld(charLocal.clone());
    character.position.copy(charWorld);

    // Match initial orientation so +Y points along the outward normal at the beacon
    const charQuat = new THREE.Quaternion();
    SCBeacon.getWorldQuaternion(charQuat);
    character.quaternion.copy(charQuat);

    // Simple stylized figure: body (capsule-ish) + head
    const charBodyMat = new THREE.MeshStandardMaterial({ color: 0x3333ff, metalness: 0.05, roughness: 0.6 });
    const charHeadMat = new THREE.MeshStandardMaterial({ color: 0xffe0bd, metalness: 0.0, roughness: 0.9 });

    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.28, 12), charBodyMat);
    body.position.y = 0.14;
    character.add(body);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 16), charHeadMat);
    head.position.y = 0.34;
    character.add(head);

    // Tiny point light to make the character readable
    const charLight = new THREE.PointLight(0xffffff, 0.6, 2.0, 2.0);
    charLight.position.set(0, 0.4, 0);
    character.add(charLight);

    return character;
}
