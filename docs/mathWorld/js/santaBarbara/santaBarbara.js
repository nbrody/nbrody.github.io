/**
 * Santa Barbara - Regional Terrain Generator
 * Covers the Santa Barbara area with topographically accurate terrain
 * Bounds: NW (34.48641, -119.90244) to SE (34.36017, -119.60151)
 */
import * as THREE from 'three';

// Geographic bounds
export const SB_BOUNDS = {
    north: 34.48641,
    south: 34.36017,
    west: -119.90244,
    east: -119.60151
};

// Calculate dimensions in meters (approximate)
const LAT_RANGE = SB_BOUNDS.north - SB_BOUNDS.south; // ~0.126 degrees
const LON_RANGE = SB_BOUNDS.east - SB_BOUNDS.west;   // ~0.301 degrees
const METERS_PER_LAT = 111000; // meters per degree latitude
const METERS_PER_LON = 111000 * Math.cos((SB_BOUNDS.north + SB_BOUNDS.south) / 2 * Math.PI / 180);

export const SB_SIZE = {
    width: LON_RANGE * METERS_PER_LON,   // ~27 km east-west
    height: LAT_RANGE * METERS_PER_LAT,  // ~14 km north-south
    scale: 1 // 1 unit = 1 meter
};

// Center point of the region
export const SB_CENTER = {
    lat: (SB_BOUNDS.north + SB_BOUNDS.south) / 2,
    lon: (SB_BOUNDS.east + SB_BOUNDS.west) / 2
};

/**
 * Convert GPS coordinates to local XZ coordinates within the Santa Barbara region
 */
export function gpsToLocal(lat, lon) {
    const x = (lon - SB_CENTER.lon) * METERS_PER_LON;
    const z = -(lat - SB_CENTER.lat) * METERS_PER_LAT;
    return { x, z };
}

/**
 * Convert local XZ coordinates back to GPS
 */
export function localToGps(x, z) {
    const lon = SB_CENTER.lon + x / METERS_PER_LON;
    const lat = SB_CENTER.lat - z / METERS_PER_LAT;
    return { lat, lon };
}

/**
 * Get elevation at a given GPS coordinate
 * Uses procedural approximation of Santa Barbara topography:
 * - Santa Ynez Mountains to the north (up to 1200m)
 * - Foothills and mesas
 * - Coastal plain and beaches
 * - Pacific Ocean to the south
 */
export function getElevation(lat, lon) {
    // Normalize to 0-1 within bounds
    const nx = (lon - SB_BOUNDS.west) / LON_RANGE;
    const ny = (lat - SB_BOUNDS.south) / LAT_RANGE;

    let elevation = 0;

    // Santa Ynez Mountains - dramatic rise in the north
    // Mountains run east-west behind the city
    const mountainFactor = Math.pow(Math.max(0, ny - 0.5) * 2, 1.8);
    elevation += mountainFactor * 800; // Peak around 800m in view area

    // Mountain ridges - running roughly east-west
    elevation += Math.sin(nx * 8 + ny * 2) * 100 * mountainFactor;
    elevation += Math.sin(nx * 15 + ny * 5) * 40 * mountainFactor;

    // Foothills zone (middle of map)
    const foothillFactor = Math.max(0, Math.min(1, (ny - 0.3) * 3)) * Math.max(0, 1 - (ny - 0.5) * 3);
    elevation += foothillFactor * 150;
    elevation += Math.sin(nx * 12) * Math.cos(ny * 10) * 30 * foothillFactor;

    // Mesa zones - flat elevated areas
    const mesaX1 = 0.3, mesaX2 = 0.6;
    if (nx > mesaX1 && nx < mesaX2 && ny > 0.25 && ny < 0.45) {
        elevation = Math.max(elevation, 80 + Math.random() * 10);
    }

    // UCSB campus area - coastal, relatively flat, slight elevation
    const ucsbLat = 34.4140;
    const ucsbLon = -119.8489;
    const ucsbNx = (ucsbLon - SB_BOUNDS.west) / LON_RANGE;
    const ucsbNy = (ucsbLat - SB_BOUNDS.south) / LAT_RANGE;
    const distToUcsb = Math.sqrt(Math.pow(nx - ucsbNx, 2) + Math.pow(ny - ucsbNy, 2));
    if (distToUcsb < 0.08) {
        elevation = Math.max(elevation, 10 + (0.08 - distToUcsb) * 100);
    }

    // Downtown Santa Barbara - low elevation coastal
    const downtownLat = 34.4208;
    const downtownLon = -119.6982;
    const dtNx = (downtownLon - SB_BOUNDS.west) / LON_RANGE;
    const dtNy = (downtownLat - SB_BOUNDS.south) / LAT_RANGE;
    const distToDowntown = Math.sqrt(Math.pow(nx - dtNx, 2) + Math.pow(ny - dtNy, 2));
    if (distToDowntown < 0.06) {
        elevation *= 0.3;
        elevation = Math.max(elevation, 5);
    }

    // Coastal zone - flatten near the coast
    const coastalZone = Math.max(0, 0.2 - ny) / 0.2;
    elevation *= (1 - coastalZone * 0.9);

    // Pacific Ocean - below sea level
    if (ny < 0.08) {
        elevation = -10;
    }

    // Channel Islands visible in distance (very south of map)
    if (ny < 0.05 && nx > 0.3 && nx < 0.5) {
        // Santa Cruz Island hint
        elevation = Math.max(-10, -5 + Math.sin(nx * 50) * 3);
    }

    // Natural terrain variation
    elevation += Math.sin(nx * 60) * Math.cos(ny * 50) * 3;
    elevation += Math.sin(nx * 120 + ny * 100) * 1.5;

    return Math.max(-10, elevation);
}

export class SantaBarbaraTerrain {
    constructor(scene) {
        this.scene = scene;
        this.terrainMesh = null;
        this.oceanMesh = null;
        this.resolution = 256;
    }

    async generate() {
        this.createTerrain();
        this.createOcean();
        this.createCoastline();
        this.createSky();
        this.createLighting();
    }

    createTerrain() {
        const width = SB_SIZE.width;
        const height = SB_SIZE.height;

        const geometry = new THREE.PlaneGeometry(
            width, height,
            this.resolution, this.resolution
        );

        const positions = geometry.attributes.position;
        const colors = new Float32Array(positions.count * 3);

        for (let i = 0; i < positions.count; i++) {
            const x = positions.getX(i);
            const z = positions.getY(i);

            const gps = localToGps(x, -z);
            const elevation = getElevation(gps.lat, gps.lon);
            positions.setZ(i, elevation);

            // Vertex colors based on elevation
            let r, g, b;
            if (elevation < 0) {
                // Ocean
                r = 0.1; g = 0.35; b = 0.55;
            } else if (elevation < 5) {
                // Beach/sand
                r = 0.95; g = 0.9; b = 0.75;
            } else if (elevation < 30) {
                // Coastal scrub
                r = 0.55; g = 0.6; b = 0.4;
            } else if (elevation < 150) {
                // Chaparral
                r = 0.5; g = 0.55; b = 0.35;
            } else if (elevation < 400) {
                // Oak woodland
                r = 0.35; g = 0.45; b = 0.25;
            } else if (elevation < 700) {
                // Mixed forest
                r = 0.28; g = 0.4; b = 0.22;
            } else {
                // Mountain tops - rocky
                r = 0.5; g = 0.45; b = 0.4;
            }

            const noise = (Math.random() - 0.5) * 0.08;
            colors[i * 3] = Math.max(0, Math.min(1, r + noise));
            colors[i * 3 + 1] = Math.max(0, Math.min(1, g + noise));
            colors[i * 3 + 2] = Math.max(0, Math.min(1, b + noise));
        }

        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geometry.computeVertexNormals();

        const material = new THREE.MeshStandardMaterial({
            vertexColors: true,
            roughness: 0.9,
            metalness: 0,
            flatShading: false
        });

        this.terrainMesh = new THREE.Mesh(geometry, material);
        this.terrainMesh.rotation.x = -Math.PI / 2;
        this.terrainMesh.receiveShadow = true;
        this.terrainMesh.castShadow = true;

        this.scene.add(this.terrainMesh);
    }

    createOcean() {
        const oceanGeometry = new THREE.PlaneGeometry(SB_SIZE.width * 1.5, SB_SIZE.height * 0.4);
        const oceanMaterial = new THREE.MeshStandardMaterial({
            color: 0x1A5F8A,
            roughness: 0.2,
            metalness: 0.3,
            transparent: true,
            opacity: 0.85
        });

        this.oceanMesh = new THREE.Mesh(oceanGeometry, oceanMaterial);
        this.oceanMesh.rotation.x = -Math.PI / 2;
        this.oceanMesh.position.set(0, -2, SB_SIZE.height * 0.4);

        this.scene.add(this.oceanMesh);
    }

    createCoastline() {
        const foamGeometry = new THREE.PlaneGeometry(SB_SIZE.width * 1.2, 40);
        const foamMaterial = new THREE.MeshStandardMaterial({
            color: 0xFFFFFF,
            transparent: true,
            opacity: 0.5,
            roughness: 1
        });

        const foam = new THREE.Mesh(foamGeometry, foamMaterial);
        foam.rotation.x = -Math.PI / 2;
        foam.position.set(0, 1, SB_SIZE.height * 0.42);

        this.scene.add(foam);
    }

    createSky() {
        const skyGeo = new THREE.SphereGeometry(60000, 32, 32);
        const skyMat = new THREE.ShaderMaterial({
            uniforms: {
                topColor: { value: new THREE.Color(0x0055BB) },
                horizonColor: { value: new THREE.Color(0xA8D8EA) },
                fogColor: { value: new THREE.Color(0xE8E8E8) }
            },
            vertexShader: `
                varying vec3 vWorldPosition;
                void main() {
                    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
                    vWorldPosition = worldPosition.xyz;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform vec3 topColor;
                uniform vec3 horizonColor;
                uniform vec3 fogColor;
                varying vec3 vWorldPosition;
                void main() {
                    float h = normalize(vWorldPosition).y;
                    vec3 color;
                    if (h < 0.0) {
                        color = fogColor;
                    } else if (h < 0.1) {
                        color = mix(fogColor, horizonColor, h * 10.0);
                    } else {
                        color = mix(horizonColor, topColor, pow((h - 0.1) / 0.9, 0.5));
                    }
                    gl_FragColor = vec4(color, 1.0);
                }
            `,
            side: THREE.BackSide
        });

        this.scene.add(new THREE.Mesh(skyGeo, skyMat));
    }

    createLighting() {
        // Warm California sun
        const sunLight = new THREE.DirectionalLight(0xFFFAE0, 1.6);
        sunLight.position.set(SB_SIZE.width * 0.5, 6000, -SB_SIZE.height * 0.3);
        sunLight.castShadow = true;
        sunLight.shadow.mapSize.width = 4096;
        sunLight.shadow.mapSize.height = 4096;
        sunLight.shadow.camera.near = 100;
        sunLight.shadow.camera.far = 25000;
        sunLight.shadow.camera.left = -15000;
        sunLight.shadow.camera.right = 15000;
        sunLight.shadow.camera.top = 15000;
        sunLight.shadow.camera.bottom = -15000;
        this.scene.add(sunLight);

        this.scene.add(new THREE.AmbientLight(0x7799BB, 0.5));
        this.scene.add(new THREE.HemisphereLight(0x87CEEB, 0x8B7355, 0.4));
    }

    getElevationAtLocal(x, z) {
        const gps = localToGps(x, z);
        return getElevation(gps.lat, gps.lon);
    }

    getLocalPosition(locationId) {
        const locations = {
            ucsb: { lat: 34.4140, lon: -119.8489 },
            downtown: { lat: 34.4208, lon: -119.6982 },
            stateStreet: { lat: 34.4189, lon: -119.7014 },
            stearnWharf: { lat: 34.4083, lon: -119.6854 },
            sbHarbor: { lat: 34.4033, lon: -119.6925 }
        };

        const loc = locations[locationId];
        if (!loc) return null;

        const local = gpsToLocal(loc.lat, loc.lon);
        const elevation = getElevation(loc.lat, loc.lon);

        return new THREE.Vector3(local.x, elevation, local.z);
    }
}
