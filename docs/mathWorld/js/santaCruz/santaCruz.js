/**
 * Santa Cruz - Regional Terrain Generator
 * Covers the Santa Cruz area with topographically accurate terrain
 * Bounds: NW (37.01454, -122.08174) to SE (36.92946, -121.90707)
 */
import * as THREE from 'three';

// Geographic bounds - expanded to cover the whole Monterey Bay and Santa Cruz Mountains
export const SC_BOUNDS = {
    north: 37.50, // Higher north into the mountains
    south: 36.50, // Further south into Monterey Bay
    west: -122.55, // Further west into the Pacific
    east: -121.65  // Further east into the Central Valley/Gilroy area
};

// Calculate dimensions in meters (approximate)
const LAT_RANGE = SC_BOUNDS.north - SC_BOUNDS.south; // 1.0 degrees (~111 km)
const LON_RANGE = SC_BOUNDS.east - SC_BOUNDS.west;   // 0.9 degrees (~80 km)
const METERS_PER_LAT = 111000; // meters per degree latitude
const METERS_PER_LON = 111000 * Math.cos((SC_BOUNDS.north + SC_BOUNDS.south) / 2 * Math.PI / 180);

export const SC_SIZE = {
    width: LON_RANGE * METERS_PER_LON,   // ~80 km east-west
    height: LAT_RANGE * METERS_PER_LAT,  // ~111 km north-south
    scale: 1 // 1 unit = 1 meter
};

// Center point of the region (Fixed near Santa Cruz)
export const SC_CENTER = {
    lat: 36.97,
    lon: -122.03
};


// Precise bounds for the UCSC Gulch area (to override regional terrain)
// Calculated relative to the new SC_CENTER
export const UCSC_GULCH_OVERRIDE = {
    xMin: -2630, // East of West side
    xMax: -2480, // West of East side
    zMin: -3050, // North edge
    zMax: -2750  // South edge
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
 * Helper: Procedural Noise
 */
function noise(nx, ny, octaves = 4) {
    let val = 0;
    let amp = 1;
    let freq = 1;
    for (let i = 0; i < octaves; i++) {
        val += Math.sin(nx * freq * 5 + ny * freq * 3) * Math.cos(nx * freq * 2 - ny * freq * 4) * amp;
        amp *= 0.5;
        freq *= 2.1;
    }
    return val;
}

/**
 * Get elevation at a given GPS coordinate
 * Uses procedural approximation of Santa Cruz topography with accurate coastline
 * Includes fine detail for local landmarks (UCSC, Boardwalk, River Mouth)
 */
export function getElevation(lat, lon) {
    // Check if point is in the ocean based on actual coastline
    if (isInOcean(lat, lon)) {
        return -20;
    }

    // Normalize to 0-1 within expanded bounds
    const nx = (lon - SC_BOUNDS.west) / LON_RANGE;
    const ny = (lat - SC_BOUNDS.south) / LAT_RANGE;

    // Base elevation components
    let elevation = 0;

    // 1. Primary Coastal Range (Santa Cruz Mountains)
    // Masked to only appear inland (further East/North)
    const coastDistFactor = Math.max(0, Math.min(1, getDistanceToCoast(lat, lon) * 15)); // Grows as we go inland
    const mountainAxis = (nx + ny * 0.8);
    const mountainSpine = Math.exp(-Math.pow(mountainAxis - 1.1, 2) * 5) * 1100; // Peak @ ~1100m
    elevation += mountainSpine * coastDistFactor;

    // 2. Secondary Ridges and Valleys
    elevation += noise(nx * 10, ny * 10, 3) * 80 * (0.3 + (mountainSpine / 1100));

    // 3. Marine Terraces
    const localDistToCoast = getDistanceToCoast(lat, lon);
    if (localDistToCoast < 0.04) {
        const terraceHeight = 25; // More subtle steps
        const t = elevation / terraceHeight;
        const terraceFrac = t % 1.0;
        const stepAdjustment = Math.pow(terraceFrac, 5) * terraceHeight;
        elevation = Math.floor(t) * terraceHeight + stepAdjustment;
    }

    // 4. San Lorenzo River Basin & Downtown
    const downtownLat = 36.974;
    const downtownLon = -122.030;
    const distToDowntown = Math.sqrt(Math.pow(lat - downtownLat, 2) + Math.pow(lon - downtownLon, 2));

    // San Lorenzo River path
    const riverLon = -122.025 - Math.sin((lat - 36.97) * 40) * 0.005;
    const riverDist = Math.abs(lon - riverLon);
    if (riverDist < 0.006 && lat < 37.1) {
        const depth = (1.0 - riverDist / 0.006) * 50;
        elevation -= depth;
    }

    // Downtown Basin - Bring it closer to real-world ~10-20m
    if (distToDowntown < 0.015) {
        const downtownFactor = 1.0 - distToDowntown / 0.015;
        elevation = elevation * (1.0 - downtownFactor * 0.85) + 8 * downtownFactor;
    }

    // 5. UCSC Plateau - Real world: Base @ 100m, Upper Campus @ 250m
    const ucscLat = 36.9958;
    const ucscLon = -122.0595;
    const distToUcsc = Math.sqrt(Math.pow(lat - ucscLat, 2) + Math.pow(lon - ucscLon, 2));
    if (distToUcsc < 0.025) {
        const lift = (1.0 - distToUcsc / 0.025) * 60;
        elevation = Math.max(elevation, 110 + lift); // Base lift to 110m (360ft)

        // Chasm Detail
        const ucscLocal = gpsToLocal(ucscLat, ucscLon);
        const chasmX = ucscLocal.x + 70;
        const local = gpsToLocal(lat, lon);
        const dX = local.x - chasmX;
        const dZ = local.z - ucscLocal.z;
        if (dX > -30 && dX < 30 && dZ > -120 && dZ < 60) {
            const depthFactor = Math.max(0, 1.0 - Math.pow(Math.abs(dX) / 20, 0.4));
            return Math.max(10, elevation - depthFactor * 80);
        }
    }

    // 6. Boardwalk / Main Beach
    const boardwalkLat = 36.963;
    const boardwalkLon = -122.018;
    const distToBoardwalk = Math.sqrt(Math.pow(lat - boardwalkLat, 2) + Math.pow(lon - boardwalkLon, 2));
    if (distToBoardwalk < 0.008) {
        const bwFactor = 1.0 - distToBoardwalk / 0.008;
        elevation = elevation * (1.0 - bwFactor) + 3 * bwFactor; // Fade to beach (3m)
    }

    // 7. Coastal Bluffs
    const coastDist = getDistanceToCoast(lat, lon);
    if (coastDist < 0.004) {
        const bluffFactor = coastDist / 0.004;
        if (lon < -122.025) {
            elevation = Math.max(11, elevation); // Standard 35ft bluffs
            if (coastDist < 0.0004) elevation *= (0.2 + 0.8 * (coastDist / 0.0004));
        } else {
            elevation *= Math.pow(bluffFactor, 0.4);
        }
    }

    // Fine texture noise
    elevation += noise(nx * 200, ny * 200, 2) * 3;

    return Math.max(1.5, elevation);
}

function isInOcean(lat, lon) {
    // Define the coastline with high resolution for the Santa Cruz city area
    const coastline = [
        { lat: 37.15, lon: -122.45 }, // Año Nuevo area
        { lat: 37.05, lon: -122.30 }, // Davenport
        { lat: 36.965, lon: -122.100 }, // Terrace Point (near Long Marine Lab)
        { lat: 36.958, lon: -122.066 }, // Wilder Ranch
        { lat: 36.952, lon: -122.058 }, // Natural Bridges
        { lat: 36.951, lon: -122.043 }, // Mitchell's Cove
        { lat: 36.951, lon: -122.027 }, // Steamer Lane (Lighthouse Point)
        { lat: 36.963, lon: -122.022 }, // Cowell Beach
        { lat: 36.964, lon: -122.018 }, // Main Beach (Boardwalk) - PROTECTED
        { lat: 36.964, lon: -122.012 }, // San Lorenzo River Mouth
        { lat: 36.964, lon: -122.008 }, // Seabright Beach
        { lat: 36.962, lon: -122.000 }, // Santa Cruz Harbor
        { lat: 36.967, lon: -121.986 }, // Twin Lakes
        { lat: 36.974, lon: -121.956 }, // Capitola
        { lat: 36.950, lon: -121.900 }, // Rio Del Mar
        { lat: 36.850, lon: -121.800 }, // Moss Landing
        { lat: 36.650, lon: -121.850 }, // Marina
        { lat: 36.620, lon: -121.940 }, // Monterey
        { lat: 36.600, lon: -121.990 }  // Pebble Beach
    ];

    // Find the segment the longitude falls into
    for (let i = 0; i < coastline.length - 1; i++) {
        const p1 = coastline[i];
        const p2 = coastline[i + 1];

        const minLon = Math.min(p1.lon, p2.lon);
        const maxLon = Math.max(p1.lon, p2.lon);

        if (lon >= minLon && lon <= maxLon) {
            const t = (lon - p1.lon) / (p2.lon - p1.lon);
            const coastLat = p1.lat + t * (p2.lat - p1.lat);
            if (lat < coastLat) return true;
        }
    }

    // Extremes
    if (lon < -122.45 && lat < 37.15) return true;
    if (lon > -122.00 && lat < 36.60) return true;

    return false;
}

/**
 * Get approximate distance to coastline
 */
function getDistanceToCoast(lat, lon) {
    const coastline = [
        { lat: 36.951, lon: -122.058 }, // Natural Bridges
        { lat: 36.951, lon: -122.027 }, // Steamer Lane
        { lat: 36.962, lon: -122.018 }, // Boardwalk
        { lat: 36.964, lon: -122.012 }, // River Mouth - TYPO FIXED
        { lat: 36.974, lon: -121.956 }  // Capitola
    ];

    let minDist = Infinity;
    for (const p of coastline) {
        const dist = Math.sqrt(Math.pow(lat - p.lat, 2) + Math.pow(lon - p.lon, 2));
        minDist = Math.min(minDist, dist);
    }
    return minDist;
}

// Bounds for the "Santa Cruz Shoreline Detail" patch in World Z (North = Negative)
const SC_SHORELINE_PATCH = {
    xMin: -6000,
    xMax: 6000,
    zMin: -4500, // 4.5km North of center
    zMax: 2000   // 2km South of center
};

/**
 * High-fidelity terrain renderer for Santa Cruz
 */
export class SantaCruzTerrain {
    constructor(scene) {
        this.scene = scene;
        this.terrainMesh = null;
        this.shorelineMesh = null;
        this.oceanMesh = null;
        this.resolution = 768; // Regional resolution
        this.patchResolution = 512; // High-density patch for city center
    }

    async generate() {
        this.createTerrain();
        this.createShorelinePatch();
        this.createOcean();
        this.createCoastline();
        this.createSky();
        this.createLighting();
    }

    createTerrain() {
        const width = SC_SIZE.width;
        const height = SC_SIZE.height;

        const geometry = new THREE.PlaneGeometry(width, height, this.resolution, this.resolution);
        const positions = geometry.attributes.position;
        const colors = new Float32Array(positions.count * 3);

        for (let i = 0; i < positions.count; i++) {
            const x = positions.getX(i);
            const yPlane = positions.getY(i);
            const worldZ = -yPlane; // Mapping Plane Y+ to World Z- (North)

            const gps = localToGps(x, worldZ);

            // OVERRIDE: Punch holes for high-detail local meshes
            const inGulch = (x > UCSC_GULCH_OVERRIDE.xMin && x < UCSC_GULCH_OVERRIDE.xMax &&
                worldZ > UCSC_GULCH_OVERRIDE.zMin && worldZ < UCSC_GULCH_OVERRIDE.zMax);
            const inShoreline = (x > SC_SHORELINE_PATCH.xMin && x < SC_SHORELINE_PATCH.xMax &&
                worldZ > SC_SHORELINE_PATCH.zMin && worldZ < SC_SHORELINE_PATCH.zMax);

            let elevation = getElevation(gps.lat, gps.lon);
            if (inGulch || inShoreline) {
                elevation = -500; // Sink regional terrain
            }

            positions.setZ(i, elevation);
            const color = this.getVertexColor(gps, elevation, x, worldZ);
            colors[i * 3] = color.r;
            colors[i * 3 + 1] = color.g;
            colors[i * 3 + 2] = color.b;
        }

        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geometry.computeVertexNormals();

        this.terrainMesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
            vertexColors: true, roughness: 0.9, metalness: 0
        }));
        this.terrainMesh.rotation.x = -Math.PI / 2;
        this.terrainMesh.receiveShadow = true;
        this.scene.add(this.terrainMesh);
    }

    createShorelinePatch() {
        const width = SC_SHORELINE_PATCH.xMax - SC_SHORELINE_PATCH.xMin;
        const height = SC_SHORELINE_PATCH.zMax - SC_SHORELINE_PATCH.zMin;

        const geo = new THREE.PlaneGeometry(width, height, this.patchResolution, this.patchResolution);
        const pos = geo.attributes.position;
        const colors = new Float32Array(pos.count * 3);

        const centerX = (SC_SHORELINE_PATCH.xMin + SC_SHORELINE_PATCH.xMax) / 2;
        const centerZ = (SC_SHORELINE_PATCH.zMin + SC_SHORELINE_PATCH.zMax) / 2;

        for (let i = 0; i < pos.count; i++) {
            const lx = pos.getX(i);
            const ly = pos.getY(i);
            const worldX = centerX + lx;
            const worldZ = centerZ - ly; // Transform to World Z
            const gps = localToGps(worldX, worldZ);

            let elevation = getElevation(gps.lat, gps.lon);
            pos.setZ(i, elevation);

            const color = this.getVertexColor(gps, elevation, worldX, worldZ);
            colors[i * 3] = color.r;
            colors[i * 3 + 1] = color.g;
            colors[i * 3 + 2] = color.b;
        }

        geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geo.computeVertexNormals();

        this.shorelineMesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
            vertexColors: true, roughness: 0.85, metalness: 0
        }));
        this.shorelineMesh.rotation.x = -Math.PI / 2;
        this.shorelineMesh.position.set(centerX, 0.1, centerZ);
        this.shorelineMesh.receiveShadow = true;
        this.shorelineMesh.castShadow = true;

        this.scene.add(this.shorelineMesh);
    }

    getVertexColor(gps, elevation, x, z) {
        let r, g, b;
        const boardwalkDist = Math.sqrt(Math.pow(gps.lat - 36.963, 2) + Math.pow(gps.lon - -122.018, 2));
        const downtownDist = Math.sqrt(Math.pow(gps.lat - 36.974, 2) + Math.pow(gps.lon - -122.030, 2));
        const ucscDist = Math.sqrt(Math.pow(gps.lat - 36.9958, 2) + Math.pow(gps.lon - -122.0595, 2));
        const riverLon = -122.025 - Math.sin((gps.lat - 36.97) * 40) * 0.005;
        const riverDist = Math.abs(gps.lon - riverLon);

        if (ucscDist < 0.02) {
            // Lush UCSC Meadow Green
            r = 0.25; g = 0.45; b = 0.15;
        } else if (boardwalkDist < 0.008 && elevation < 25) {
            r = 0.94; g = 0.90; b = 0.75;
        } else if (riverDist < 0.003 && gps.lat < 37.05 && elevation < 50) {
            r = 0.15; g = 0.25; b = 0.35;
        } else if (downtownDist < 0.015 && elevation < 70) {
            r = 0.55; g = 0.52; b = 0.48;
        } else {
            if (elevation < 1) {
                r = 0.75; g = 0.7; b = 0.55;
            } else if (elevation < 12) {
                r = 0.85; g = 0.82; b = 0.68;
            } else if (elevation < 80) {
                r = 0.42; g = 0.52; b = 0.35;
            } else if (elevation < 250) {
                r = 0.35; g = 0.48; b = 0.32;
            } else if (elevation < 600) {
                r = 0.22; g = 0.32; b = 0.2;
            } else {
                r = 0.48; g = 0.45; b = 0.42;
            }
        }
        const variation = (Math.sin(x * 0.02) * Math.cos(z * 0.02)) * 0.05;
        return {
            r: Math.max(0.05, Math.min(0.95, r + variation)),
            g: Math.max(0.05, Math.min(0.95, g + variation)),
            b: Math.max(0.05, Math.min(0.95, b + variation))
        };
    }

    createOcean() {
        const oceanGeometry = new THREE.PlaneGeometry(SC_SIZE.width * 10, SC_SIZE.height * 10);
        const oceanMaterial = new THREE.MeshStandardMaterial({
            color: 0x1E6091, roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.8
        });
        this.oceanMesh = new THREE.Mesh(oceanGeometry, oceanMaterial);
        this.oceanMesh.rotation.x = -Math.PI / 2;
        this.oceanMesh.position.set(0, 0, 0);
        this.scene.add(this.oceanMesh);
    }

    createCoastline() {
        const foamGeometry = new THREE.PlaneGeometry(20000, 100);
        const foamMaterial = new THREE.MeshStandardMaterial({
            color: 0xFFFFFF, transparent: true, opacity: 0.4, roughness: 1
        });
        const foam = new THREE.Mesh(foamGeometry, foamMaterial);
        foam.rotation.x = -Math.PI / 2;
        foam.position.set(-2000, 0.5, 2500);
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
        const sunLight = new THREE.DirectionalLight(0xFFFFF0, 1.5);
        // Position the sun at a planetary scale altitude (50,000km)
        sunLight.position.set(50000000, 50000000, -50000000);
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
        this.scene.add(new THREE.AmbientLight(0x6688AA, 0.5));
        this.scene.add(new THREE.HemisphereLight(0x87CEEB, 0x3A6B35, 0.4));
    }

    getElevationAtLocal(x, z) {
        const gps = localToGps(x, z);
        return getElevation(gps.lat, gps.lon);
    }

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
