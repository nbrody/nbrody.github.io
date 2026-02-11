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
    xMin: -2600, // East of West side (shifted east for gulchX=100)
    xMax: -2450, // West of East side
    zMin: -3020, // North edge
    zMax: -2780  // South edge
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
 * Hash-based value noise for natural-looking terrain
 * Uses integer lattice hashing with Hermite interpolation
 */
function hash2(ix, iy) {
    // Fast integer hash (no sin-based artifacts)
    // Use Math.imul for proper 32-bit integer multiplication
    let h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263)) | 0;
    h = Math.imul(h ^ (h >> 13), 1274126177);
    h = h ^ (h >> 16);
    return (h & 0x7fffffff) / 0x7fffffff; // 0..1
}

function smoothstep(t) {
    return t * t * (3 - 2 * t);
}

function smootherstep(t) {
    return t * t * t * (t * (t * 6 - 15) + 10);
}

function valueNoise(x, y) {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = smootherstep(x - ix);
    const fy = smootherstep(y - iy);

    const v00 = hash2(ix, iy);
    const v10 = hash2(ix + 1, iy);
    const v01 = hash2(ix, iy + 1);
    const v11 = hash2(ix + 1, iy + 1);

    const a = v00 + (v10 - v00) * fx;
    const b = v01 + (v11 - v01) * fx;
    return a + (b - a) * fy;
}

function fbm(x, y, octaves = 6, lacunarity = 2.0, gain = 0.5) {
    let val = 0;
    let amp = 1;
    let freq = 1;
    let maxAmp = 0;
    for (let i = 0; i < octaves; i++) {
        val += valueNoise(x * freq, y * freq) * amp;
        maxAmp += amp;
        amp *= gain;
        freq *= lacunarity;
    }
    return val / maxAmp; // normalize to 0..1
}

// Ridged noise - creates ridge-like features (good for mountain ridges)
function ridgedNoise(x, y, octaves = 5) {
    let val = 0;
    let amp = 1;
    let freq = 1;
    let maxAmp = 0;
    for (let i = 0; i < octaves; i++) {
        let n = valueNoise(x * freq, y * freq);
        n = 1.0 - Math.abs(n * 2 - 1); // fold into ridges
        n = n * n; // sharpen ridges
        val += n * amp;
        maxAmp += amp;
        amp *= 0.5;
        freq *= 2.0;
    }
    return val / maxAmp;
}

// Smooth blend between two values
function mix(a, b, t) {
    t = Math.max(0, Math.min(1, t));
    return a + (b - a) * t;
}

// Smoother distance-based blend factor
function smoothFalloff(dist, radius, sharpness = 2) {
    if (dist >= radius) return 0;
    const t = 1 - dist / radius;
    return Math.pow(smoothstep(t), sharpness);
}

/**
 * Get elevation at a given GPS coordinate
 * Uses procedural approximation of Santa Cruz topography with smooth, natural terrain.
 * Key geography: Santa Cruz Mtns to the north, coastal terraces, UCSC on a ridge,
 * San Lorenzo River valley through downtown, beach/boardwalk flats, West Cliff bluffs.
 */
export function getElevation(lat, lon) {
    // Check if point is in the ocean based on actual coastline
    if (isInOcean(lat, lon)) {
        return -2;
    }

    // Normalize to 0-1 within expanded bounds
    const nx = (lon - SC_BOUNDS.west) / LON_RANGE;
    const ny = (lat - SC_BOUNDS.south) / LAT_RANGE;

    // Distance from coast (used for many blending operations)
    const coastDist = getDistanceToCoast(lat, lon);
    // Smooth 0..1 factor: 0 at coast, 1 well inland
    const inlandFactor = smoothstep(Math.min(1, coastDist / 0.08));

    // ===== 1. BASE TERRAIN: Santa Cruz Mountains =====
    // The SC Mtns run NW-SE. Peak elevations ~800-1100m, centered ~10-15km inland.
    // Use ridged noise for realistic mountain ridge structure.
    const mtAxis = (nx * 0.7 + ny * 0.5); // NW-SE axis
    const mtSpine = Math.exp(-Math.pow(mtAxis - 0.85, 2) * 8) * 1000;
    const mtRidges = ridgedNoise(nx * 8 + 0.3, ny * 8 + 0.7, 5) * 250;
    const mtDetail = (fbm(nx * 25, ny * 25, 4) - 0.5) * 60;
    let elevation = (mtSpine + mtRidges * (mtSpine / 1000) + mtDetail) * inlandFactor;

    // ===== 2. FOOTHILLS & ROLLING TERRAIN =====
    // Between the mountains and the coast - gentle rolling hills 50-200m
    const foothillZone = smoothFalloff(coastDist, 0.06, 1) * (1 - smoothFalloff(coastDist, 0.015, 1.5));
    const foothillBase = 40 + fbm(nx * 12 + 1.7, ny * 12 + 3.2, 5) * 120;
    elevation += foothillBase * foothillZone;

    // ===== 3. COASTAL PLAIN / MARINE TERRACES =====
    // Santa Cruz sits on uplifted marine terraces. Gentle, slightly undulating ground
    // rising from ~5m near coast to ~30-50m a couple km inland. Smooth, not stepped.
    const terraceBand = smoothFalloff(coastDist, 0.025, 0.8);
    const terraceBase = 5 + coastDist * 800 + fbm(nx * 30, ny * 30, 3) * 8;
    elevation = mix(elevation, terraceBase, terraceBand);

    // ===== 4. UCSC CAMPUS RIDGE =====
    // UCSC sits on a prominent ridge/plateau. Base campus ~120m, upper campus ~250m.
    // The terrain rises gradually from the west, with the campus nestled in redwoods.
    const ucscLat = 36.9958;
    const ucscLon = -122.0595;
    const ucscDist = Math.sqrt(Math.pow((lat - ucscLat) * 1.2, 2) + Math.pow(lon - ucscLon, 2));
    const ucscInfluence = smoothFalloff(ucscDist, 0.03, 1.2);
    if (ucscInfluence > 0) {
        // Gradual rise from south (campus entrance ~100m) to north (upper campus ~220m)
        const northing = (lat - ucscLat) / 0.02; // -1 (south) to +1 (north)
        const campusElev = 120 + Math.max(0, northing) * 100;
        // Gentle undulation across campus
        const campusDetail = fbm(nx * 60, ny * 60, 3) * 12;
        const targetElev = campusElev + campusDetail;
        elevation = mix(elevation, targetElev, ucscInfluence);

        // Chasm/Gulch detail — matches the campus-level ravine at gulchX=100
        const ucscLocal = gpsToLocal(ucscLat, ucscLon);
        const chasmX = ucscLocal.x + 100;
        const local = gpsToLocal(lat, lon);
        const dX = local.x - chasmX;
        const dZ = local.z - ucscLocal.z;
        if (dX > -25 && dX < 25 && dZ > -100 && dZ < 50) {
            // Smooth-sided gulch using a Gaussian cross-section
            const chasmWidth = 15;
            const crossSection = Math.exp(-Math.pow(dX / chasmWidth, 2) * 3);
            // Taper the gulch depth at its ends
            const lengthFactor = smoothstep(1 - Math.pow(Math.max(Math.abs(dZ - 5) - 40, 0) / 30, 2));
            const chasmDepth = crossSection * lengthFactor * 25;
            if (chasmDepth > 1) {
                return Math.max(elevation - chasmDepth, 80);
            }
        }
    }

    // ===== 5. SAN LORENZO RIVER VALLEY =====
    // Flows roughly N-S through Santa Cruz, creating a wide gentle valley.
    // The river meanders; the valley floor is 3-15m elevation downtown.
    const riverCenterLon = -122.025 - Math.sin((lat - 36.97) * 30) * 0.004
        - Math.sin((lat - 36.98) * 60) * 0.0015; // meandering
    const riverDist = Math.abs(lon - riverCenterLon);
    const riverValleyWidth = 0.008; // ~900m wide valley
    const riverChannelWidth = 0.0015; // narrow actual river
    const inRiverZone = lat > 36.93 && lat < 37.05;
    if (inRiverZone && riverDist < riverValleyWidth) {
        // Wide valley depression
        const valleyFactor = smoothFalloff(riverDist, riverValleyWidth, 1.0);
        const valleyFloor = 6 + fbm(nx * 80, ny * 80, 2) * 3;
        elevation = mix(elevation, valleyFloor, valleyFactor * 0.7);

        // Narrow river channel itself
        if (riverDist < riverChannelWidth) {
            const channelFactor = smoothFalloff(riverDist, riverChannelWidth, 1.5);
            elevation = mix(elevation, 1.5, channelFactor);
        }
    }

    // ===== 6. DOWNTOWN SANTA CRUZ =====
    // Relatively flat area around Pacific Ave, ~10-20m elevation
    const downtownLat = 36.974;
    const downtownLon = -122.030;
    const dtDist = Math.sqrt(Math.pow(lat - downtownLat, 2) + Math.pow(lon - downtownLon, 2));
    const dtInfluence = smoothFalloff(dtDist, 0.012, 1.0);
    if (dtInfluence > 0) {
        const dtElev = 12 + fbm(nx * 50, ny * 50, 2) * 4; // gently undulating
        elevation = mix(elevation, dtElev, dtInfluence);
    }

    // ===== 7. BOARDWALK / MAIN BEACH =====
    // Very flat, near sea level (~2-4m)
    const bwLat = 36.963;
    const bwLon = -122.018;
    const bwDist = Math.sqrt(Math.pow(lat - bwLat, 2) + Math.pow(lon - bwLon, 2));
    const bwInfluence = smoothFalloff(bwDist, 0.007, 1.2);
    if (bwInfluence > 0) {
        const beachElev = 2.5 + fbm(nx * 100, ny * 100, 2) * 1.5;
        elevation = mix(elevation, beachElev, bwInfluence);
    }

    // ===== 8. WEST CLIFF / COASTAL BLUFFS =====
    // From Natural Bridges to the Lighthouse: ~10-12m bluffs dropping to sea level.
    // Smooth but firm drop-off near the edge.
    if (coastDist < 0.006 && lon < -122.020) {
        const bluffHeight = 11 + fbm(nx * 40, ny * 40, 2) * 3;
        // Near the edge, the bluff drops
        if (coastDist < 0.0015) {
            const edgeFactor = coastDist / 0.0015; // 0 at coast, 1 at bluff top
            elevation = bluffHeight * smoothstep(edgeFactor);
        } else {
            // On top of the bluff - ensure minimum height
            elevation = Math.max(elevation, bluffHeight);
        }
    }

    // ===== 9. GENERAL COASTAL TRANSITION =====
    // Near the coast (not bluffs), terrain gently slopes toward sea level
    if (coastDist < 0.003 && lon >= -122.020) {
        const coastFade = smoothstep(coastDist / 0.003);
        elevation *= coastFade;
    }

    // ===== 10. FINE-SCALE TERRAIN DETAIL =====
    // Small bumps and undulations that make walking feel natural
    const fineDetail = (fbm(nx * 150, ny * 150, 3) - 0.5) * 2.5;
    const microDetail = (fbm(nx * 400, ny * 400, 2) - 0.5) * 0.8;
    elevation += fineDetail + microDetail;

    return Math.max(0.5, elevation);
}

function isInOcean(lat, lon) {
    // Define the coastline with high resolution for the Santa Cruz city area
    const coastline = [
        { lat: 37.15, lon: -122.45 }, // Año Nuevo area
        { lat: 37.05, lon: -122.30 }, // Davenport
        { lat: 36.965, lon: -122.100 }, // Terrace Point (near Long Marine Lab)
        { lat: 36.958, lon: -122.066 }, // Wilder Ranch
        { lat: 36.951, lon: -122.058 }, // Natural Bridges
        { lat: 36.950, lon: -122.043 }, // Mitchell's Cove
        { lat: 36.950, lon: -122.027 }, // Steamer Lane (Lighthouse Point)
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
 * Get approximate distance to coastline using proper point-to-segment distances.
 * Uses a denser coastline for accurate bluff/beach transitions.
 */
function getDistanceToCoast(lat, lon) {
    const coastline = [
        { lat: 37.15, lon: -122.45 }, // Año Nuevo
        { lat: 37.05, lon: -122.30 }, // Davenport
        { lat: 36.965, lon: -122.100 }, // Terrace Point
        { lat: 36.958, lon: -122.066 }, // Wilder Ranch
        { lat: 36.952, lon: -122.058 }, // Natural Bridges
        { lat: 36.951, lon: -122.043 }, // Mitchell's Cove
        { lat: 36.951, lon: -122.027 }, // Steamer Lane
        { lat: 36.963, lon: -122.022 }, // Cowell Beach
        { lat: 36.963, lon: -122.018 }, // Main Beach / Boardwalk
        { lat: 36.964, lon: -122.012 }, // San Lorenzo River Mouth
        { lat: 36.964, lon: -122.008 }, // Seabright Beach
        { lat: 36.962, lon: -122.000 }, // SC Harbor
        { lat: 36.967, lon: -121.986 }, // Twin Lakes
        { lat: 36.974, lon: -121.956 }, // Capitola
        { lat: 36.950, lon: -121.900 }, // Rio Del Mar
        { lat: 36.850, lon: -121.800 }, // Moss Landing
    ];

    let minDist = Infinity;
    for (let i = 0; i < coastline.length - 1; i++) {
        const dist = pointToSegmentDist(lat, lon, coastline[i], coastline[i + 1]);
        minDist = Math.min(minDist, dist);
    }
    return minDist;
}

/**
 * Minimum distance from point (lat, lon) to line segment (a, b) in degree space.
 */
function pointToSegmentDist(lat, lon, a, b) {
    const dx = b.lon - a.lon;
    const dy = b.lat - a.lat;
    const lenSq = dx * dx + dy * dy;
    if (lenSq < 1e-12) {
        return Math.sqrt(Math.pow(lat - a.lat, 2) + Math.pow(lon - a.lon, 2));
    }
    let t = ((lon - a.lon) * dx + (lat - a.lat) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    const projLon = a.lon + t * dx;
    const projLat = a.lat + t * dy;
    return Math.sqrt(Math.pow(lat - projLat, 2) + Math.pow(lon - projLon, 2));
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
        this.coastlineFoam = null;
        this.skyMesh = null;
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
        const colors = new Float32Array(positions.count * 4); // RGBA for edge fading

        const halfW = width / 2;
        const halfH = height / 2;
        // Edge fade zone: 30% of each dimension fades from opaque to transparent
        const fadeZoneX = halfW * 0.35;
        const fadeZoneZ = halfH * 0.35;

        for (let i = 0; i < positions.count; i++) {
            const x = positions.getX(i);
            const yPlane = positions.getY(i);
            const worldZ = -yPlane; // Mapping Plane Y+ to World Z- (North)

            const gps = localToGps(x, worldZ);

            // OVERRIDE: Sink regional terrain under high-detail patches
            // Use a smooth blend margin so there's no visible seam
            const inGulch = (x > UCSC_GULCH_OVERRIDE.xMin && x < UCSC_GULCH_OVERRIDE.xMax &&
                worldZ > UCSC_GULCH_OVERRIDE.zMin && worldZ < UCSC_GULCH_OVERRIDE.zMax);

            // Smooth blend for shoreline patch: compute distance from the patch boundary
            const blendMargin = 200; // meters of blend zone
            const dxMin = x - SC_SHORELINE_PATCH.xMin;
            const dxMax = SC_SHORELINE_PATCH.xMax - x;
            const dzMin = worldZ - SC_SHORELINE_PATCH.zMin;
            const dzMax = SC_SHORELINE_PATCH.zMax - worldZ;
            const insidePatch = dxMin > 0 && dxMax > 0 && dzMin > 0 && dzMax > 0;
            const edgeDist = insidePatch ? Math.min(dxMin, dxMax, dzMin, dzMax) : 0;

            let elevation = getElevation(gps.lat, gps.lon);
            const vertexIsOcean = isInOcean(gps.lat, gps.lon);

            if (inGulch) {
                elevation = -500;
            } else if (insidePatch) {
                // Deep inside the patch: fully sunk. Near edge: blend smoothly to terrain.
                if (edgeDist >= blendMargin) {
                    elevation = -500;
                } else {
                    const t = edgeDist / blendMargin; // 0 at edge, 1 at margin depth
                    elevation = elevation * (1 - t) + (-500) * t;
                }
            }

            positions.setZ(i, elevation);
            const color = this.getVertexColor(gps, elevation, x, worldZ);

            // Edge fade: smoothly fade alpha near the terrain boundary
            const distFromEdgeX = halfW - Math.abs(x);
            const distFromEdgeZ = halfH - Math.abs(yPlane);
            const edgeFadeX = Math.min(1, distFromEdgeX / fadeZoneX);
            const edgeFadeZ = Math.min(1, distFromEdgeZ / fadeZoneZ);
            const alphaX = edgeFadeX * edgeFadeX * (3 - 2 * edgeFadeX);
            const alphaZ = edgeFadeZ * edgeFadeZ * (3 - 2 * edgeFadeZ);
            let alpha = alphaX * alphaZ;

            // Ocean transparency: make terrain transparent over ocean
            // so the ocean mesh underneath shows through
            if (vertexIsOcean) {
                // Use distance to coast for a smooth shore-to-ocean blend
                const coastDist = getDistanceToCoast(gps.lat, gps.lon);
                // Within ~200m of coast, smoothly fade from land to water
                const oceanFade = Math.min(1, coastDist / 0.002);
                alpha *= (1 - oceanFade);
            }

            colors[i * 4] = color.r;
            colors[i * 4 + 1] = color.g;
            colors[i * 4 + 2] = color.b;
            colors[i * 4 + 3] = alpha;
        }

        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 4));
        geometry.computeVertexNormals();

        this.terrainMesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
            vertexColors: true, roughness: 0.9, metalness: 0,
            transparent: true,
            alphaTest: 0.01,
            depthWrite: true
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
        const colors = new Float32Array(pos.count * 4); // RGBA for ocean transparency

        const centerX = (SC_SHORELINE_PATCH.xMin + SC_SHORELINE_PATCH.xMax) / 2;
        const centerZ = (SC_SHORELINE_PATCH.zMin + SC_SHORELINE_PATCH.zMax) / 2;

        for (let i = 0; i < pos.count; i++) {
            const lx = pos.getX(i);
            const ly = pos.getY(i);
            const worldX = centerX + lx;
            const worldZ = centerZ - ly; // Transform to World Z
            const gps = localToGps(worldX, worldZ);

            let elevation = getElevation(gps.lat, gps.lon);
            const vertexIsOcean = isInOcean(gps.lat, gps.lon);
            pos.setZ(i, elevation);

            const color = this.getVertexColor(gps, elevation, worldX, worldZ);
            colors[i * 4] = color.r;
            colors[i * 4 + 1] = color.g;
            colors[i * 4 + 2] = color.b;

            // Make ocean vertices transparent so ocean mesh shows through
            let alpha = 1.0;
            if (vertexIsOcean) {
                const coastDist = getDistanceToCoast(gps.lat, gps.lon);
                const oceanFade = Math.min(1, coastDist / 0.002);
                alpha = 1 - oceanFade;
            }
            colors[i * 4 + 3] = alpha;
        }

        geo.setAttribute('color', new THREE.BufferAttribute(colors, 4));
        geo.computeVertexNormals();

        this.shorelineMesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
            vertexColors: true, roughness: 0.85, metalness: 0,
            transparent: true,
            alphaTest: 0.01,
            depthWrite: true
        }));
        this.shorelineMesh.rotation.x = -Math.PI / 2;
        this.shorelineMesh.position.set(centerX, 0.1, centerZ);
        this.shorelineMesh.receiveShadow = true;
        this.shorelineMesh.castShadow = true;


        this.scene.add(this.shorelineMesh);
    }

    getVertexColor(gps, elevation, x, z) {
        const nx = (gps.lon - SC_BOUNDS.west) / LON_RANGE;
        const ny = (gps.lat - SC_BOUNDS.south) / LAT_RANGE;

        // Base color from elevation (smooth gradient, no hard bands)
        let r, g, b;
        if (elevation < 3) {
            // Beach / sand
            r = 0.82; g = 0.78; b = 0.62;
        } else if (elevation < 20) {
            const t = (elevation - 3) / 17;
            // Blend from sandy coastal to green
            r = mix(0.78, 0.45, t);
            g = mix(0.75, 0.55, t);
            b = mix(0.58, 0.35, t);
        } else if (elevation < 100) {
            const t = (elevation - 20) / 80;
            // Green grassland
            r = mix(0.45, 0.38, t);
            g = mix(0.55, 0.50, t);
            b = mix(0.35, 0.30, t);
        } else if (elevation < 300) {
            const t = (elevation - 100) / 200;
            // Darker forest green
            r = mix(0.38, 0.25, t);
            g = mix(0.50, 0.38, t);
            b = mix(0.30, 0.22, t);
        } else if (elevation < 700) {
            const t = (elevation - 300) / 400;
            // Dense forest to high chaparral
            r = mix(0.25, 0.35, t);
            g = mix(0.38, 0.40, t);
            b = mix(0.22, 0.28, t);
        } else {
            // High ridges - rocky/chaparral
            r = 0.45; g = 0.42; b = 0.38;
        }

        // Overlay: UCSC campus (lush meadow green)
        const ucscDist = Math.sqrt(Math.pow(gps.lat - 36.9958, 2) + Math.pow(gps.lon - -122.0595, 2));
        const ucscFade = smoothFalloff(ucscDist, 0.018, 1.0);
        if (ucscFade > 0) {
            r = mix(r, 0.28, ucscFade);
            g = mix(g, 0.48, ucscFade);
            b = mix(b, 0.18, ucscFade);
        }

        // Overlay: Boardwalk/beach (warm sand)
        const bwDist = Math.sqrt(Math.pow(gps.lat - 36.963, 2) + Math.pow(gps.lon - -122.018, 2));
        const bwFade = smoothFalloff(bwDist, 0.006, 1.2);
        if (bwFade > 0 && elevation < 20) {
            r = mix(r, 0.92, bwFade);
            g = mix(g, 0.88, bwFade);
            b = mix(b, 0.72, bwFade);
        }

        // Overlay: San Lorenzo River
        const riverLon = -122.025 - Math.sin((gps.lat - 36.97) * 30) * 0.004;
        const riverDist = Math.abs(gps.lon - riverLon);
        if (gps.lat < 37.05) {
            const riverFade = smoothFalloff(riverDist, 0.004, 1.5);
            if (riverFade > 0) {
                r = mix(r, 0.18, riverFade * 0.6);
                g = mix(g, 0.30, riverFade * 0.6);
                b = mix(b, 0.35, riverFade * 0.6);
            }
        }

        // Overlay: Downtown (slightly grey/urban)
        const dtDist = Math.sqrt(Math.pow(gps.lat - 36.974, 2) + Math.pow(gps.lon - -122.030, 2));
        const dtFade = smoothFalloff(dtDist, 0.010, 1.0);
        if (dtFade > 0 && elevation < 50) {
            r = mix(r, 0.52, dtFade * 0.5);
            g = mix(g, 0.50, dtFade * 0.5);
            b = mix(b, 0.47, dtFade * 0.5);
        }

        // Natural variation using noise (not sin/cos which creates stripes)
        const variation = (fbm(nx * 80 + 5.3, ny * 80 + 2.1, 2) - 0.5) * 0.08;
        return {
            r: Math.max(0.05, Math.min(0.95, r + variation)),
            g: Math.max(0.05, Math.min(0.95, g + variation)),
            b: Math.max(0.05, Math.min(0.95, b + variation))
        };
    }

    createOcean() {
        // Keep ocean large so it fills the view at ground level
        const oceanW = SC_SIZE.width * 10;
        const oceanH = SC_SIZE.height * 10;
        const oceanSegments = 64;
        const oceanGeometry = new THREE.PlaneGeometry(oceanW, oceanH, oceanSegments, oceanSegments);

        // Fade ocean edges to transparent (only outer 25% fades - center stays fully opaque)
        const oceanPos = oceanGeometry.attributes.position;
        const oceanColors = new Float32Array(oceanPos.count * 4);
        const halfOW = oceanW / 2;
        const halfOH = oceanH / 2;
        const oceanFadeX = halfOW * 0.25;
        const oceanFadeZ = halfOH * 0.25;

        for (let i = 0; i < oceanPos.count; i++) {
            const ox = oceanPos.getX(i);
            const oy = oceanPos.getY(i);
            const distX = halfOW - Math.abs(ox);
            const distZ = halfOH - Math.abs(oy);
            const fadeX = Math.min(1, distX / oceanFadeX);
            const fadeZ = Math.min(1, distZ / oceanFadeZ);
            const fX = fadeX * fadeX * (3 - 2 * fadeX);
            const fZ = fadeZ * fadeZ * (3 - 2 * fadeZ);
            const a = fX * fZ;
            // Ocean blue color
            oceanColors[i * 4] = 0.118;
            oceanColors[i * 4 + 1] = 0.376;
            oceanColors[i * 4 + 2] = 0.569;
            oceanColors[i * 4 + 3] = a;
        }

        oceanGeometry.setAttribute('color', new THREE.BufferAttribute(oceanColors, 4));

        const oceanMaterial = new THREE.MeshStandardMaterial({
            vertexColors: true, roughness: 0.1, metalness: 0.2,
            transparent: true, opacity: 0.8,
            depthWrite: false
        });
        this.oceanMesh = new THREE.Mesh(oceanGeometry, oceanMaterial);
        this.oceanMesh.rotation.x = -Math.PI / 2;
        this.oceanMesh.position.set(0, -1, 0);
        this.oceanMesh.renderOrder = -1; // Render before terrain for proper transparency
        this.scene.add(this.oceanMesh);
    }

    createCoastline() {
        const foamGeometry = new THREE.PlaneGeometry(20000, 100);
        const foamMaterial = new THREE.MeshStandardMaterial({
            color: 0xFFFFFF, transparent: true, opacity: 0.4, roughness: 1
        });
        this.coastlineFoam = new THREE.Mesh(foamGeometry, foamMaterial);
        this.coastlineFoam.rotation.x = -Math.PI / 2;
        this.coastlineFoam.position.set(-2000, 0.5, 2500);
        this.scene.add(this.coastlineFoam);
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
        this.skyMesh = new THREE.Mesh(skyGeo, skyMat);
        this.scene.add(this.skyMesh);
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
