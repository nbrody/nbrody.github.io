/**
 * Sedona - Regional Terrain Generator
 *
 * A compact red-rock basin around Oak Creek, Cathedral Rock, Airport Mesa,
 * and uptown Sedona. Elevations are relative to the regional origin; the
 * real anchor elevations are recorded in refs/topography.md.
 */
import * as THREE from 'three';

export const SEDONA_BOUNDS = {
    north: 34.91,
    south: 34.78,
    west: -111.86,
    east: -111.72
};

const LAT_RANGE = SEDONA_BOUNDS.north - SEDONA_BOUNDS.south;
const LON_RANGE = SEDONA_BOUNDS.east - SEDONA_BOUNDS.west;
const METERS_PER_LAT = 111000;
const METERS_PER_LON = 111000 * Math.cos(
    ((SEDONA_BOUNDS.north + SEDONA_BOUNDS.south) / 2) * Math.PI / 180
);

export const SEDONA_SIZE = {
    width: LON_RANGE * METERS_PER_LON,
    height: LAT_RANGE * METERS_PER_LAT,
    scale: 1
};

export const SEDONA_CENTER = {
    lat: (SEDONA_BOUNDS.north + SEDONA_BOUNDS.south) / 2,
    lon: (SEDONA_BOUNDS.east + SEDONA_BOUNDS.west) / 2
};

export function gpsToLocal(lat, lon) {
    const x = (lon - SEDONA_CENTER.lon) * METERS_PER_LON;
    const z = -(lat - SEDONA_CENTER.lat) * METERS_PER_LAT;
    return { x, z };
}

export function localToGps(x, z) {
    const lon = SEDONA_CENTER.lon + x / METERS_PER_LON;
    const lat = SEDONA_CENTER.lat - z / METERS_PER_LAT;
    return { lat, lon };
}

function hash2(ix, iy) {
    let h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263)) | 0;
    h = Math.imul(h ^ (h >> 13), 1274126177);
    h = h ^ (h >> 16);
    return (h & 0x7fffffff) / 0x7fffffff;
}

function noise2(x, y) {
    const ix = Math.floor(x), iy = Math.floor(y);
    const fx = x - ix, fy = y - iy;
    const a = hash2(ix, iy);
    const b = hash2(ix + 1, iy);
    const c = hash2(ix, iy + 1);
    const d = hash2(ix + 1, iy + 1);
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    return a * (1 - sx) * (1 - sy)
         + b * sx * (1 - sy)
         + c * (1 - sx) * sy
         + d * sx * sy;
}

function fbm(x, y, octaves = 4) {
    let v = 0, amp = 1, freq = 1, total = 0;
    for (let i = 0; i < octaves; i++) {
        v += amp * noise2(x * freq, y * freq);
        total += amp;
        amp *= 0.5;
        freq *= 2;
    }
    return v / total;
}

function smoothstep(t) {
    t = Math.max(0, Math.min(1, t));
    return t * t * (3 - 2 * t);
}

function gaussian(x, z, cx, cz, rx, rz, height) {
    const dx = (x - cx) / rx;
    const dz = (z - cz) / rz;
    return Math.exp(-(dx * dx + dz * dz)) * height;
}

export function getElevation(lat, lon) {
    const { x, z } = gpsToLocal(lat, lon);
    const nx = (lon - SEDONA_BOUNDS.west) / LON_RANGE;
    const nz = (SEDONA_BOUNDS.north - lat) / LAT_RANGE;

    // Base high-desert floor, relative to Red Rock Crossing's 1204 m anchor.
    let elevation = 45 + (nz - 0.55) * 140 + (nx - 0.5) * 20;

    // Oak Creek trough, running north-south with a light east-west meander.
    const creekX = -1600 + Math.sin(z * 0.00055) * 420;
    const creekDist = Math.abs(x - creekX);
    if (creekDist < 780) {
        elevation -= (1 - creekDist / 780) * 85;
    }

    // Cathedral Rock and the nearby red-rock buttes.
    const cathedral = gpsToLocal(34.82002, -111.79321);
    elevation += gaussian(x, z, cathedral.x, cathedral.z, 1150, 820, 300);
    elevation += gaussian(x, z, cathedral.x + 1300, cathedral.z - 1200, 900, 1100, 210);
    elevation += gaussian(x, z, cathedral.x - 1800, cathedral.z + 1300, 1300, 900, 170);

    // Airport Mesa, a high tabletop southwest of town.
    const airport = gpsToLocal(34.8500, -111.7900);
    const mesa = gaussian(x, z, airport.x, airport.z, 1250, 720, 230);
    elevation += mesa * 0.85;

    // Upland shelves and dry washes.
    elevation += Math.sin(x * 0.0009 + z * 0.0004) * 18;
    elevation += Math.sin(x * 0.0018 - z * 0.0011) * 10;
    elevation += (fbm(nx * 8, nz * 8, 4) - 0.5) * 46;
    elevation += (fbm(nx * 30 + 9, nz * 30 - 4, 3) - 0.5) * 10;

    return elevation;
}

export class SedonaTerrain {
    constructor(scene) {
        this.scene = scene;
        this.resolution = 220;
        this.addedObjects = [];
        this.addedLights = [];
    }

    _track(obj) {
        this.scene.add(obj);
        this.addedObjects.push(obj);
    }

    _trackLight(light) {
        this.scene.add(light);
        this.addedLights.push(light);
    }

    dispose() {
        for (const obj of this.addedObjects) {
            this.scene.remove(obj);
            if (obj.geometry) obj.geometry.dispose();
            if (obj.material) {
                if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
                else obj.material.dispose();
            }
        }
        for (const light of this.addedLights) {
            this.scene.remove(light);
            if (light.dispose) light.dispose();
        }
        this.addedObjects = [];
        this.addedLights = [];
    }

    async generate() {
        this.createTerrain();
        this.createSky();
        this.createLighting();
    }

    createTerrain() {
        const geo = new THREE.PlaneGeometry(
            SEDONA_SIZE.width, SEDONA_SIZE.height,
            this.resolution, this.resolution
        );
        const pos = geo.attributes.position;
        const colors = new Float32Array(pos.count * 3);

        for (let i = 0; i < pos.count; i++) {
            const x = pos.getX(i);
            const y = pos.getY(i);
            const worldZ = -y;
            const gps = localToGps(x, worldZ);
            const elev = getElevation(gps.lat, gps.lon);
            pos.setZ(i, elev);

            let r, g, b;
            if (elev < 25) {
                r = 0.35; g = 0.43; b = 0.33; // creek corridor
            } else if (elev < 85) {
                r = 0.66; g = 0.43; b = 0.27; // red sandy flats
            } else if (elev < 180) {
                r = 0.72; g = 0.36; b = 0.22; // sandstone shelves
            } else if (elev < 300) {
                r = 0.58; g = 0.28; b = 0.18; // red cliffs
            } else {
                r = 0.50; g = 0.31; b = 0.23; // dark caprock
            }
            const n = (Math.random() - 0.5) * 0.07;
            colors[i * 3] = Math.max(0, Math.min(1, r + n));
            colors[i * 3 + 1] = Math.max(0, Math.min(1, g + n));
            colors[i * 3 + 2] = Math.max(0, Math.min(1, b + n));
        }

        geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geo.computeVertexNormals();

        const terrain = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
            vertexColors: true, roughness: 0.95, metalness: 0
        }));
        terrain.rotation.x = -Math.PI / 2;
        terrain.receiveShadow = true;
        terrain.castShadow = true;
        this._track(terrain);
    }

    createSky() {
        const skyGeo = new THREE.SphereGeometry(50000, 32, 32);
        const skyMat = new THREE.MeshBasicMaterial({
            color: 0xC98A5B,
            side: THREE.BackSide
        });
        this._track(new THREE.Mesh(skyGeo, skyMat));
    }

    createLighting() {
        const sun = new THREE.DirectionalLight(0xFFD0A0, 1.85);
        sun.position.set(-6000, 9000, 3500);
        sun.castShadow = true;
        sun.shadow.mapSize.width = 4096;
        sun.shadow.mapSize.height = 4096;
        sun.shadow.camera.near = 100;
        sun.shadow.camera.far = 22000;
        sun.shadow.camera.left = -9000;
        sun.shadow.camera.right = 9000;
        sun.shadow.camera.top = 9000;
        sun.shadow.camera.bottom = -9000;
        this._trackLight(sun);
        this._trackLight(new THREE.AmbientLight(0xA7988C, 0.45));
        this._trackLight(new THREE.HemisphereLight(0x8FB7E6, 0x8B4A2A, 0.45));
    }

    getElevationAtLocal(x, z) {
        const gps = localToGps(x, z);
        return getElevation(gps.lat, gps.lon);
    }
}
