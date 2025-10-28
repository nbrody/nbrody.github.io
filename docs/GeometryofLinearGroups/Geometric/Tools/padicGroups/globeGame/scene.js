import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { addBeaconAtABC, createCharacter } from './beacons.js';

export function setupScene() {
    const canvasWrapper = document.getElementById('canvas-wrapper');

    // 1. Scene Setup
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setSize(window.innerWidth, window.innerHeight);
    canvasWrapper.appendChild(renderer.domElement);

    camera.position.z = 20;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;

    // 2. Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
    scene.add(ambientLight);

    const pointLight = new THREE.PointLight(0xffffff, 2.5, 500);
    pointLight.position.set(20, 10, 25);
    scene.add(pointLight);

    const backLight = new THREE.PointLight(0xffffff, 2.0, 500);
    backLight.position.set(-20, -10, -25);
    scene.add(backLight);

    // 3. Create the Earth
    const textureLoader = new THREE.TextureLoader();
    const earthTexture = textureLoader.load('https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg');
    earthTexture.colorSpace = THREE.SRGBColorSpace;
    const earthMaterial = new THREE.MeshBasicMaterial({ map: earthTexture });
    const earthGeometry = new THREE.SphereGeometry(10, 64, 64);
    const earthMesh = new THREE.Mesh(earthGeometry, earthMaterial);
    scene.add(earthMesh);

    // Initialize view so Santa Cruz, CA is at the center
    const lat = THREE.MathUtils.degToRad(36.9741);
    const lon = THREE.MathUtils.degToRad(-122.0308);
    const phi = Math.PI / 2 - lat;
    const theta = lon + Math.PI;
    const v = new THREE.Vector3(
        -Math.sin(phi) * Math.cos(theta),
        Math.cos(phi),
        Math.sin(phi) * Math.sin(theta)
    ).normalize();
    const qCenter = new THREE.Quaternion().setFromUnitVectors(v, new THREE.Vector3(0, 0, 1));
    earthMesh.quaternion.copy(qCenter);
    camera.lookAt(0, 0, 0);
    controls.target.set(0, 0, 0);

    // 4. Add beacons
    const SCBeacon = addBeaconAtABC(earthMesh, -44568, -71676, 63505, 0x00ff66, 105625);
    const NashBeacon = addBeaconAtABC(earthMesh, 4644, -85175, 62292, 0xff8800, 105625);

    // 5. Add character
    const character = createCharacter(SCBeacon);
    scene.add(character);

    return {
        scene,
        camera,
        renderer,
        controls,
        earthMesh,
        SCBeacon,
        NashBeacon,
        character
    };
}

export function computeGeodesicMiles(earthMesh, character, NashBeacon) {
    const R_miles = 3958.7613;
    const center = new THREE.Vector3();
    earthMesh.getWorldPosition(center);
    const uChar = character.position.clone().sub(center).normalize();
    const pTargetWorld = new THREE.Vector3();
    NashBeacon.getWorldPosition(pTargetWorld);
    const uTarget = pTargetWorld.sub(center).normalize();
    const dot = THREE.MathUtils.clamp(uChar.dot(uTarget), -1, 1);
    const angle = Math.acos(dot);
    return R_miles * angle;
}
