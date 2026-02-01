/**
 * Santa Cruz - Regional Terrain Generator
 * Covers the Santa Cruz area with topographically accurate terrain
 * Bounds: NW (37.01454, -122.08174) to SE (36.92946, -121.90707)
 */
import * as THREE from 'three';

// Geographic bounds
export const SC_BOUNDS = {
    north: 37.01454,
    south: 36.92946,
    west: -122.08174,
    east: -121.90707
};

// Calculate dimensions in meters (approximate)
const LAT_RANGE = SC_BOUNDS.north - SC_BOUNDS.south; // ~0.085 degrees
const LON_RANGE = SC_BOUNDS.east - SC_BOUNDS.west;   // ~0.174 degrees
const METERS_PER_LAT = 111000; // meters per degree latitude
const METERS_PER_LON = 111000 * Math.cos((SC_BOUNDS.north + SC_BOUNDS.south) / 2 * Math.PI / 180);

export const SC_SIZE = {
    width: LON_RANGE * METERS_PER_LON,   // ~15.5 km east-west
    height: LAT_RANGE * METERS_PER_LAT,  // ~9.4 km north-south
    scale: 1 // 1 unit = 1 meter
};

// Center point of the region
export const SC_CENTER = {
    lat: (SC_BOUNDS.north + SC_BOUNDS.south) / 2,
    lon: (SC_BOUNDS.east + SC_BOUNDS.west) / 2
};

/**
 * Convert GPS coordinates to local XZ coordinates within the Santa Cruz region
 * Returns position relative to center of the region
 */
export function gpsToLocal(lat, lon) {
    const x = (lon - SC_CENTER.lon) * METERS_PER_LON;
    const z = -(lat - SC_CENTER.lat) * METERS_PER_LAT; // Negative because Z increases south
    return { x, z };
}

/**
 * Convert local XZ coordinates back to GPS
 */
export function localToGps(x, z) {
    const lon = SC_CENTER.lon + x / METERS_PER_LON;
    const lat = SC_CENTER.lat - z / METERS_PER_LAT;
    return { lat, lon };
}

/**
 * Get elevation at a given GPS coordinate
 * Uses procedural approximation of Santa Cruz topography with accurate coastline
 */
export function getElevation(lat, lon) {
    // Normalize to 0-1 within bounds
    const nx = (lon - SC_BOUNDS.west) / LON_RANGE;
    const ny = (lat - SC_BOUNDS.south) / LAT_RANGE;

    // Check if point is in the ocean based on actual coastline
    if (isInOcean(lat, lon)) {
        return -10;
    }

    // Base elevation components
    let elevation = 0;

    // Santa Cruz Mountains - higher in the north
    const mountainFactor = Math.pow(ny, 1.5);
    elevation += mountainFactor * 400; // Peak around 400m

    // Ridge lines running NW-SE
    elevation += Math.sin((nx + ny) * 12) * 50 * mountainFactor;
    elevation += Math.sin((nx * 2 + ny) * 8) * 30 * mountainFactor;

    // UCSC area - moderately elevated (around 250-300m)
    const ucscLat = 36.9958;
    const ucscLon = -122.0595;
    const ucscNx = (ucscLon - SC_BOUNDS.west) / LON_RANGE;
    const ucscNy = (ucscLat - SC_BOUNDS.south) / LAT_RANGE;
    const distToUcsc = Math.sqrt(Math.pow(nx - ucscNx, 2) + Math.pow(ny - ucscNy, 2));
    if (distToUcsc < 0.15) {
        elevation = Math.max(elevation, 250 + (0.15 - distToUcsc) * 200);

        // Add the Chasm (East of McHenry)
        // McHenry local origin is at (ucscLat, ucscLon)
        // Chasm is at local X=65, local Z range around -35
        const chasmCenterLat = 36.9958 - (-35) / 111000; // buildingZ is -35
        const chasmCenterLon = -122.0595 + (65) / METERS_PER_LON;

        const dLat = (lat - chasmCenterLat) * 111000;
        const dLon = (lon - chasmCenterLon) * METERS_PER_LON;

        // Chasm bounds: 100m north-south, steep V-shape 30m wide
        if (Math.abs(dLat) < 60 && Math.abs(dLon) < 20) {
            const normalizedDist = Math.abs(dLon) / 15;
            const depthFactor = Math.max(0, 1.0 - Math.pow(normalizedDist, 0.4));
            elevation -= depthFactor * 60; // Deep 60m chasm
        }
    }

    // Coastal lowland zone - flatten near the actual coast
    const distToCoast = getDistanceToCoast(lat, lon);
    if (distToCoast < 0.02) { // About 2km from coast
        const coastalFactor = distToCoast / 0.02;
        elevation *= 0.1 + coastalFactor * 0.9; // Lower near coast
    }

    // Downtown Santa Cruz - gradual lowering
    const downtownLat = 36.9741;
    const downtownLon = -122.0308;
    const dtNx = (downtownLon - SC_BOUNDS.west) / LON_RANGE;
    const dtNy = (downtownLat - SC_BOUNDS.south) / LAT_RANGE;
    const distToDowntown = Math.sqrt(Math.pow(nx - dtNx, 2) + Math.pow(ny - dtNy, 2));
    if (distToDowntown < 0.1) {
        const blend = distToDowntown / 0.1;
        elevation *= 0.3 + 0.7 * blend;
    }

    // San Lorenzo River valley
    const riverLon = -122.025;
    const riverNx = (riverLon - SC_BOUNDS.west) / LON_RANGE;
    const distToRiver = Math.abs(nx - riverNx);
    if (distToRiver < 0.03 && ny < 0.5) {
        elevation *= 0.5 + distToRiver * 15;
    }

    // Add some noise for natural variation
    elevation += Math.sin(nx * 50) * Math.cos(ny * 50) * 5;
    elevation += Math.sin(nx * 100 + ny * 80) * 2;

    return Math.max(0, elevation);
}

/**
 * Accurate Santa Cruz coastline based on real GPS points
 * Returns true if the point is in Monterey Bay (ocean)
 */
function isInOcean(lat, lon) {
    // Coastline reference points (from west to east along the shore)
    // These define where land meets water
    const coastline = [
        { lat: 36.9519, lon: -122.0575 }, // Natural Bridges
        { lat: 36.9515, lon: -122.0256 }, // Steamer Lane / Lighthouse Point
        { lat: 36.9620, lon: -122.0177 }, // Main Beach / Boardwalk
        { lat: 36.9630, lon: -122.0070 }, // Seabright Beach
        { lat: 36.9680, lon: -121.9850 }, // Twin Lakes
        { lat: 36.9761, lon: -121.9530 }, // Capitola
        { lat: 36.9820, lon: -121.9200 }, // New Brighton (east edge)
    ];

    // For each segment of coastline, check if point is south of the line
    // (south = ocean for Santa Cruz which faces Monterey Bay)

    for (let i = 0; i < coastline.length - 1; i++) {
        const p1 = coastline[i];
        const p2 = coastline[i + 1];

        // Skip if lon is outside this segment
        if (lon < p1.lon || lon > p2.lon) continue;

        // Linear interpolation to find coastline latitude at this longitude
        const t = (lon - p1.lon) / (p2.lon - p1.lon);
        const coastLat = p1.lat + t * (p2.lat - p1.lat);

        // If point's latitude is south of coastline, it's in the ocean
        if (lat < coastLat - 0.002) { // Small buffer for beach
            return true;
        }
    }

    // West of Natural Bridges - ocean is south of ~36.95
    if (lon < -122.0575 && lat < 36.95) {
        return true;
    }

    // East of New Brighton - ocean is south of ~36.98
    if (lon > -121.92 && lat < 36.98) {
        return true;
    }

    return false;
}

/**
 * Get approximate distance to coastline (in normalized coordinates)
 */
function getDistanceToCoast(lat, lon) {
    const coastline = [
        { lat: 36.9519, lon: -122.0575 },
        { lat: 36.9515, lon: -122.0256 },
        { lat: 36.9620, lon: -122.0177 },
        { lat: 36.9630, lon: -122.0070 },
        { lat: 36.9680, lon: -121.9850 },
        { lat: 36.9761, lon: -121.9530 },
    ];

    let minDist = Infinity;
    for (const p of coastline) {
        const dist = Math.sqrt(Math.pow(lat - p.lat, 2) + Math.pow(lon - p.lon, 2));
        minDist = Math.min(minDist, dist);
    }
    return minDist;
}

export class SantaCruzTerrain {
    constructor(scene) {
        this.scene = scene;
        this.terrainMesh = null;
        this.oceanMesh = null;
        this.resolution = 256; // Grid resolution
    }

    async generate() {
        this.createTerrain();
        this.createOcean();
        this.createCoastline();
        this.createSky();
        this.createLighting();
    }

    createTerrain() {
        const width = SC_SIZE.width;
        const height = SC_SIZE.height;

        // Create high-resolution terrain geometry
        const geometry = new THREE.PlaneGeometry(
            width, height,
            this.resolution, this.resolution
        );

        const positions = geometry.attributes.position;
        const colors = new Float32Array(positions.count * 3);

        for (let i = 0; i < positions.count; i++) {
            const x = positions.getX(i);
            const z = positions.getY(i); // Y in PlaneGeometry becomes Z when rotated

            // Convert to GPS
            const gps = localToGps(x, -z);

            // Get elevation
            const elevation = getElevation(gps.lat, gps.lon);
            positions.setZ(i, elevation);

            // Set vertex colors based on elevation and type
            let r, g, b;
            if (elevation < 0) {
                // Ocean
                r = 0.1; g = 0.3; b = 0.5;
            } else if (elevation < 5) {
                // Beach/sand
                r = 0.9; g = 0.85; b = 0.7;
            } else if (elevation < 50) {
                // Coastal lowland - grassland
                r = 0.4; g = 0.55; b = 0.3;
            } else if (elevation < 200) {
                // Foothills - mixed
                r = 0.35; g = 0.5; b = 0.28;
            } else if (elevation < 350) {
                // Forest - darker green (redwoods)
                r = 0.2; g = 0.35; b = 0.18;
            } else {
                // Mountain tops - slightly brown/rocky
                r = 0.45; g = 0.4; b = 0.35;
            }

            // Add some variation
            const noise = (Math.random() - 0.5) * 0.1;
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
        // Monterey Bay water surface - positioned to match actual coastline
        // The coastline runs roughly from NW to SE, so ocean is to the south
        const oceanGeometry = new THREE.PlaneGeometry(SC_SIZE.width * 2.5, SC_SIZE.height * 2);
        const oceanMaterial = new THREE.MeshStandardMaterial({
            color: 0x1E6091,
            roughness: 0.2,
            metalness: 0.3,
            transparent: true,
            opacity: 0.85
        });

        this.oceanMesh = new THREE.Mesh(oceanGeometry, oceanMaterial);
        this.oceanMesh.rotation.x = -Math.PI / 2;
        // Position: The coastline is roughly at Z = +2000 to +3500 (positive Z = south)
        // So ocean center needs to be well south of that
        this.oceanMesh.position.set(0, -3, SC_SIZE.height * 0.7);

        this.scene.add(this.oceanMesh);
    }

    createCoastline() {
        // Add white foam/surf line along the coast
        const foamGeometry = new THREE.PlaneGeometry(SC_SIZE.width * 1.2, 50);
        const foamMaterial = new THREE.MeshStandardMaterial({
            color: 0xFFFFFF,
            transparent: true,
            opacity: 0.6,
            roughness: 1
        });

        const foam = new THREE.Mesh(foamGeometry, foamMaterial);
        foam.rotation.x = -Math.PI / 2;
        foam.position.set(0, 1, SC_SIZE.height * 0.42);

        this.scene.add(foam);
    }

    createSky() {
        const skyGeo = new THREE.SphereGeometry(50000, 32, 32);
        const skyMat = new THREE.ShaderMaterial({
            uniforms: {
                topColor: { value: new THREE.Color(0x0066CC) },
                horizonColor: { value: new THREE.Color(0xAAD4E6) },
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
                        color = mix(horizonColor, topColor, pow((h - 0.1) / 0.9, 0.6));
                    }
                    gl_FragColor = vec4(color, 1.0);
                }
            `,
            side: THREE.BackSide
        });

        this.scene.add(new THREE.Mesh(skyGeo, skyMat));
    }

    createLighting() {
        // Sun
        const sunLight = new THREE.DirectionalLight(0xFFFFF0, 1.5);
        sunLight.position.set(SC_SIZE.width, 5000, -SC_SIZE.height / 2);
        sunLight.castShadow = true;
        sunLight.shadow.mapSize.width = 4096;
        sunLight.shadow.mapSize.height = 4096;
        sunLight.shadow.camera.near = 100;
        sunLight.shadow.camera.far = 20000;
        sunLight.shadow.camera.left = -10000;
        sunLight.shadow.camera.right = 10000;
        sunLight.shadow.camera.top = 10000;
        sunLight.shadow.camera.bottom = -10000;
        this.scene.add(sunLight);

        // Ambient light
        this.scene.add(new THREE.AmbientLight(0x6688AA, 0.5));

        // Hemisphere light for natural sky/ground color
        this.scene.add(new THREE.HemisphereLight(0x87CEEB, 0x3A6B35, 0.4));
    }

    /**
     * Get the elevation at local coordinates
     */
    getElevationAtLocal(x, z) {
        const gps = localToGps(x, z);
        return getElevation(gps.lat, gps.lon);
    }

    /**
     * Get local coordinates for a known location
     */
    getLocalPosition(locationId) {
        const locations = {
            mchenryLibrary: { lat: 36.9958, lon: -122.0595 },
            steamerLane: { lat: 36.9515, lon: -122.0256 },
            boardwalk: { lat: 36.9643, lon: -122.0177 },
            downtown: { lat: 36.9741, lon: -122.0308 },
            naturalBridges: { lat: 36.9519, lon: -122.0575 }
        };

        const loc = locations[locationId];
        if (!loc) return null;

        const local = gpsToLocal(loc.lat, loc.lon);
        const elevation = getElevation(loc.lat, loc.lon);

        return new THREE.Vector3(local.x, elevation, local.z);
    }
}
