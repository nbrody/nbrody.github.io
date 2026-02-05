// lighting.js - Museum-quality lighting setup
import * as THREE from 'three';

export function setupLighting(scene, renderer) {
    // Soft ambient fill
    const ambient = new THREE.AmbientLight(0x2a2a40, 0.4);
    scene.add(ambient);

    // Hemisphere light for sky/ground gradient
    const hemi = new THREE.HemisphereLight(0x6688cc, 0x443322, 0.5);
    scene.add(hemi);

    // Key light - main dramatic spotlight
    const keyLight = new THREE.SpotLight(0xffffff, 300);
    keyLight.position.set(15, 35, 20);
    keyLight.angle = 0.5;
    keyLight.penumbra = 0.6;
    keyLight.decay = 1.5;
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 2048;
    keyLight.shadow.mapSize.height = 2048;
    keyLight.shadow.camera.near = 10;
    keyLight.shadow.camera.far = 80;
    keyLight.target.position.set(0, 8, 0);
    scene.add(keyLight);
    scene.add(keyLight.target);

    // Fill light - warm side
    const fillLight = new THREE.SpotLight(0xffeedd, 100);
    fillLight.position.set(-20, 20, 15);
    fillLight.angle = 0.7;
    fillLight.penumbra = 0.8;
    scene.add(fillLight);

    // Rim light - cool backlight
    const rimLight = new THREE.SpotLight(0x88ccff, 150);
    rimLight.position.set(-10, 25, -25);
    rimLight.angle = 0.5;
    rimLight.penumbra = 0.5;
    scene.add(rimLight);

    // Accent lights
    const accentGold = new THREE.PointLight(0xffaa44, 40);
    accentGold.position.set(8, 10, 5);
    scene.add(accentGold);

    const accentBlue = new THREE.PointLight(0x4488ff, 40);
    accentBlue.position.set(-8, 10, -5);
    scene.add(accentBlue);

    // Central glow
    const centerGlow = new THREE.PointLight(0x66aaff, 60);
    centerGlow.position.set(0, 10, 0);
    scene.add(centerGlow);
}
