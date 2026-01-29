/**
 * Berkeley - Regional Terrain Generator
 * Covers the Berkeley/Oakland area with topographically accurate terrain
 * Bounds: NW (37.90327, -122.34869) to SE (37.75565, -122.18235)
 */
import * as THREE from 'three';

// Geographic bounds
export const BERK_BOUNDS = {
    north: 37.90327,
    south: 37.75565,
    west: -122.34869,
    east: -122.18235
};

// Calculate dimensions in meters (approximate)
const LAT_RANGE = BERK_BOUNDS.north - BERK_BOUNDS.south; // ~0.148 degrees
const LON_RANGE = BERK_BOUNDS.east - BERK_BOUNDS.west;   // ~0.166 degrees
const METERS_PER_LAT = 111000; // meters per degree latitude
const METERS_PER_LON = 111000 * Math.cos((BERK_BOUNDS.north + BERK_BOUNDS.south) / 2 * Math.PI / 180);

export const BERK_SIZE = {
    width: LON_RANGE * METERS_PER_LON,   // ~14.6 km east-west
    height: LAT_RANGE * METERS_PER_LAT,  // ~16.4 km north-south
    scale: 1 // 1 unit = 1 meter
};

// Center point of the region
export const BERK_CENTER = {
    lat: (BERK_BOUNDS.north + BERK_BOUNDS.south) / 2,
    lon: (BERK_BOUNDS.east + BERK_BOUNDS.west) / 2
};

/**
 * Convert GPS coordinates to local XZ coordinates within the Berkeley region
 */
export function gpsToLocal(lat, lon) {
    const x = (lon - BERK_CENTER.lon) * METERS_PER_LON;
    const z = -(lat - BERK_CENTER.lat) * METERS_PER_LAT;
    return { x, z };
}

/**
 * Convert local XZ coordinates back to GPS
 */
export function localToGps(x, z) {
    const lon = BERK_CENTER.lon + x / METERS_PER_LON;
    const lat = BERK_CENTER.lat - z / METERS_PER_LAT;
    return { lat, lon };
}

/**
 * Get elevation at a given GPS coordinate
 * Uses procedural approximation of Berkeley/Oakland topography:
 * - Berkeley/Oakland Hills to the east (up to 500m)
 * - Flatlands near the bay
 * - San Francisco Bay to the west
 * - UC Berkeley campus in the foothills
 */
export function getElevation(lat, lon) {
    // Normalize to 0-1 within bounds
    const nx = (lon - BERK_BOUNDS.west) / LON_RANGE;
    const ny = (lat - BERK_BOUNDS.south) / LAT_RANGE;

    let elevation = 0;

    // Berkeley/Oakland Hills - rise dramatically to the east
    // Hills run north-south along the eastern edge
    const hillFactor = Math.pow(Math.max(0, nx - 0.4) * 1.67, 1.5);
    elevation += hillFactor * 400; // Peak around 400m

    // Hill ridges - running north-south with some variation
    elevation += Math.sin(ny * 15 + nx * 3) * 60 * hillFactor;
    elevation += Math.sin(ny * 8 + nx * 6) * 30 * hillFactor;

    // Grizzly Peak area (high point)
    const grizzlyLat = 37.8756;
    const grizzlyLon = -122.2445;
    const grizzlyNx = (grizzlyLon - BERK_BOUNDS.west) / LON_RANGE;
    const grizzlyNy = (grizzlyLat - BERK_BOUNDS.south) / LAT_RANGE;
    const distToGrizzly = Math.sqrt(Math.pow(nx - grizzlyNx, 2) + Math.pow(ny - grizzlyNy, 2));
    if (distToGrizzly < 0.15) {
        elevation = Math.max(elevation, 350 + (0.15 - distToGrizzly) * 600);
    }

    // UC Berkeley campus - gentle slope from bay to hills
    const ucbLat = 37.8719;
    const ucbLon = -122.2585;
    const ucbNx = (ucbLon - BERK_BOUNDS.west) / LON_RANGE;
    const ucbNy = (ucbLat - BERK_BOUNDS.south) / LAT_RANGE;
    const distToUcb = Math.sqrt(Math.pow(nx - ucbNx, 2) + Math.pow(ny - ucbNy, 2));
    if (distToUcb < 0.08) {
        // Campus is on a gentle slope, around 50-150m
        const campusSlope = (nx - 0.3) * 200;
        elevation = Math.max(elevation, 50 + campusSlope);
    }

    // Downtown Berkeley - relatively flat, low elevation
    const downtownLat = 37.8716;
    const downtownLon = -122.2727;
    const dtNx = (downtownLon - BERK_BOUNDS.west) / LON_RANGE;
    const dtNy = (downtownLat - BERK_BOUNDS.south) / LAT_RANGE;
    const distToDowntown = Math.sqrt(Math.pow(nx - dtNx, 2) + Math.pow(ny - dtNy, 2));
    if (distToDowntown < 0.05) {
        elevation = Math.min(elevation, 20 + distToDowntown * 200);
    }

    // Oakland downtown - flat
    const oaklandLat = 37.8044;
    const oaklandLon = -122.2712;
    const oakNx = (oaklandLon - BERK_BOUNDS.west) / LON_RANGE;
    const oakNy = (oaklandLat - BERK_BOUNDS.south) / LAT_RANGE;
    const distToOakland = Math.sqrt(Math.pow(nx - oakNx, 2) + Math.pow(ny - oakNy, 2));
    if (distToOakland < 0.08) {
        elevation = Math.min(elevation, 10 + distToOakland * 100);
    }

    // Lake Merritt - slight depression
    const lakeMerrittLat = 37.8006;
    const lakeMerrittLon = -122.2558;
    const lakeNx = (lakeMerrittLon - BERK_BOUNDS.west) / LON_RANGE;
    const lakeNy = (lakeMerrittLat - BERK_BOUNDS.south) / LAT_RANGE;
    const distToLake = Math.sqrt(Math.pow(nx - lakeNx, 2) + Math.pow(ny - lakeNy, 2));
    if (distToLake < 0.02) {
        elevation = Math.min(elevation, 3);
    }

    // Flatlands near the bay - very low, gradual slope up
    const bayZone = Math.max(0, 0.3 - nx) / 0.3;
    elevation = elevation * (1 - bayZone * 0.95);

    // San Francisco Bay - water to the west
    if (nx < 0.08) {
        elevation = -5;
    }

    // Emeryville/Albany mudflats - very flat near water
    if (nx < 0.15 && ny > 0.6) {
        elevation = Math.max(-3, elevation * 0.2);
    }

    // Natural terrain variation
    elevation += Math.sin(nx * 80) * Math.cos(ny * 60) * 2;
    elevation += Math.sin(nx * 150 + ny * 120) * 1;

    return Math.max(-5, elevation);
}

export class BerkeleyTerrain {
    constructor(scene) {
        this.scene = scene;
        this.terrainMesh = null;
        this.oceanMesh = null;
        this.resolution = 256;
    }

    async generate() {
        this.createTerrain();
        this.createBay();
        this.createShoreline();
        this.createSky();
        this.createLighting();
    }

    createTerrain() {
        const width = BERK_SIZE.width;
        const height = BERK_SIZE.height;

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

            // Vertex colors based on elevation and zone
            let r, g, b;
            if (elevation < 0) {
                // Bay water
                r = 0.2; g = 0.35; b = 0.45;
            } else if (elevation < 3) {
                // Mudflats/wetlands
                r = 0.45; g = 0.5; b = 0.4;
            } else if (elevation < 20) {
                // Urban flatlands - gray-green
                r = 0.5; g = 0.52; b = 0.48;
            } else if (elevation < 80) {
                // Lower hills - grass
                r = 0.45; g = 0.55; b = 0.35;
            } else if (elevation < 200) {
                // Mid hills - mixed vegetation
                r = 0.35; g = 0.5; b = 0.3;
            } else if (elevation < 350) {
                // Upper hills - eucalyptus/redwood zone
                r = 0.25; g = 0.4; b = 0.25;
            } else {
                // Ridgetops - slightly dry grass
                r = 0.5; g = 0.55; b = 0.4;
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

    createBay() {
        // San Francisco Bay (west side of map)
        const bayGeometry = new THREE.PlaneGeometry(BERK_SIZE.width * 0.4, BERK_SIZE.height * 1.2);
        const bayMaterial = new THREE.MeshStandardMaterial({
            color: 0x2E5A6B,
            roughness: 0.15,
            metalness: 0.4,
            transparent: true,
            opacity: 0.85
        });

        this.oceanMesh = new THREE.Mesh(bayGeometry, bayMaterial);
        this.oceanMesh.rotation.x = -Math.PI / 2;
        this.oceanMesh.position.set(-BERK_SIZE.width * 0.4, -2, 0);

        this.scene.add(this.oceanMesh);
    }

    createShoreline() {
        // Shoreline along the bay
        const shoreGeometry = new THREE.PlaneGeometry(30, BERK_SIZE.height * 1.1);
        const shoreMaterial = new THREE.MeshStandardMaterial({
            color: 0xC4B89A,
            transparent: true,
            opacity: 0.7,
            roughness: 1
        });

        const shore = new THREE.Mesh(shoreGeometry, shoreMaterial);
        shore.rotation.x = -Math.PI / 2;
        shore.position.set(-BERK_SIZE.width * 0.38, 1.5, 0);

        this.scene.add(shore);
    }

    createSky() {
        const skyGeo = new THREE.SphereGeometry(50000, 32, 32);
        const skyMat = new THREE.ShaderMaterial({
            uniforms: {
                topColor: { value: new THREE.Color(0x3366AA) },
                horizonColor: { value: new THREE.Color(0xB0C8D8) },
                fogColor: { value: new THREE.Color(0xD8D8D8) }
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
                    } else if (h < 0.15) {
                        // Bay Area often has fog at horizon
                        color = mix(fogColor, horizonColor, h / 0.15);
                    } else {
                        color = mix(horizonColor, topColor, pow((h - 0.15) / 0.85, 0.6));
                    }
                    gl_FragColor = vec4(color, 1.0);
                }
            `,
            side: THREE.BackSide
        });

        this.scene.add(new THREE.Mesh(skyGeo, skyMat));
    }

    createLighting() {
        // Bay Area light - slightly cool/foggy
        const sunLight = new THREE.DirectionalLight(0xFFF8F0, 1.4);
        sunLight.position.set(BERK_SIZE.width * 0.3, 5000, -BERK_SIZE.height * 0.4);
        sunLight.castShadow = true;
        sunLight.shadow.mapSize.width = 4096;
        sunLight.shadow.mapSize.height = 4096;
        sunLight.shadow.camera.near = 100;
        sunLight.shadow.camera.far = 20000;
        sunLight.shadow.camera.left = -12000;
        sunLight.shadow.camera.right = 12000;
        sunLight.shadow.camera.top = 12000;
        sunLight.shadow.camera.bottom = -12000;
        this.scene.add(sunLight);

        this.scene.add(new THREE.AmbientLight(0x8899AA, 0.55));
        this.scene.add(new THREE.HemisphereLight(0xA0B8C8, 0x5A6B5A, 0.45));
    }

    getElevationAtLocal(x, z) {
        const gps = localToGps(x, z);
        return getElevation(gps.lat, gps.lon);
    }

    getLocalPosition(locationId) {
        const locations = {
            ucbCampus: { lat: 37.8719, lon: -122.2585 },
            satherGate: { lat: 37.8703, lon: -122.2595 },
            campanile: { lat: 37.8722, lon: -122.2578 },
            downtownBerkeley: { lat: 37.8716, lon: -122.2727 },
            grizzlyPeak: { lat: 37.8756, lon: -122.2445 },
            oaklandDowntown: { lat: 37.8044, lon: -122.2712 },
            lakeMerritt: { lat: 37.8006, lon: -122.2558 },
            berkeleyMarina: { lat: 37.8651, lon: -122.3150 }
        };

        const loc = locations[locationId];
        if (!loc) return null;

        const local = gpsToLocal(loc.lat, loc.lon);
        const elevation = getElevation(loc.lat, loc.lon);

        return new THREE.Vector3(local.x, elevation, local.z);
    }
}
