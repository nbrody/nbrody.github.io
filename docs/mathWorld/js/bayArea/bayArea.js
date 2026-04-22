/**
 * Bay Area - Regional Terrain Generator
 *
 * Covers the San Francisco Bay Area with topographically accurate terrain:
 *   - San Francisco Bay (water)
 *   - Pacific Ocean (west of the peninsulas)
 *   - San Francisco peninsula (hills: Twin Peaks, Mt. Davidson)
 *   - Marin peninsula (hills up to Mt. Tamalpais ~780m)
 *   - East Bay flatlands (Berkeley / Oakland / Emeryville)
 *   - Berkeley & Oakland Hills (rise to Grizzly Peak, SLMath on the hillside)
 *   - Santa Clara valley flats in the south
 *   - The Golden Gate channel between Marin and SF
 *
 * Sub-regions (future content hooks): SF, Berkeley, Oakland, Marin, etc.
 */

import * as THREE from 'three';

// ============================================================
// Bounds & Coordinate Conversions
// ============================================================

export const BA_BOUNDS = {
    north: 38.10,  // Northern Marin / Napa border
    south: 37.30,  // Half Moon Bay / Palo Alto
    west: -123.10, // Point Reyes / Pacific
    east: -121.75  // East of Mt. Diablo
};

const LAT_RANGE = BA_BOUNDS.north - BA_BOUNDS.south; // 0.80° (~89 km)
const LON_RANGE = BA_BOUNDS.east - BA_BOUNDS.west;   // 1.35° (~120 km)
const METERS_PER_LAT = 111000;
const METERS_PER_LON = 111000 * Math.cos((BA_BOUNDS.north + BA_BOUNDS.south) / 2 * Math.PI / 180);

export const BA_SIZE = {
    width: LON_RANGE * METERS_PER_LON,   // ~119 km east-west
    height: LAT_RANGE * METERS_PER_LAT,  // ~89 km north-south
    scale: 1
};

// Center near the Bay Bridge
export const BA_CENTER = {
    lat: 37.75,
    lon: -122.40
};

// High-detail sub-region patches (UC Berkeley campus content has its own local
// terrain plane; we sink the regional mesh inside this rect so it doesn't
// poke through the local plane). Analogous to UCSC_GULCH_OVERRIDE in SC.
export const UCB_CAMPUS_OVERRIDE = {
    // Matches the ~760 m UCBerkeleyCampus.worldSize plane centered on Campanile.
    latMin: 37.8685,
    latMax: 37.8753,
    lonMin: -122.2628,
    lonMax: -122.2542
};

export function gpsToLocal(lat, lon) {
    const x = (lon - BA_CENTER.lon) * METERS_PER_LON;
    const z = -(lat - BA_CENTER.lat) * METERS_PER_LAT;
    return { x, z };
}

export function localToGps(x, z) {
    const lon = BA_CENTER.lon + x / METERS_PER_LON;
    const lat = BA_CENTER.lat - z / METERS_PER_LAT;
    return { lat, lon };
}

// ============================================================
// Noise helpers (same as SC for consistency)
// ============================================================

function hash2(ix, iy) {
    let h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263)) | 0;
    h = Math.imul(h ^ (h >> 13), 1274126177);
    h = h ^ (h >> 16);
    return (h & 0x7fffffff) / 0x7fffffff;
}

function smoothstep(t) { return t * t * (3 - 2 * t); }
function smootherstep(t) { return t * t * t * (t * (t * 6 - 15) + 10); }

function valueNoise(x, y) {
    const ix = Math.floor(x), iy = Math.floor(y);
    const fx = smootherstep(x - ix), fy = smootherstep(y - iy);
    const v00 = hash2(ix, iy), v10 = hash2(ix + 1, iy);
    const v01 = hash2(ix, iy + 1), v11 = hash2(ix + 1, iy + 1);
    const a = v00 + (v10 - v00) * fx;
    const b = v01 + (v11 - v01) * fx;
    return a + (b - a) * fy;
}

function fbm(x, y, octaves = 5) {
    let val = 0, amp = 1, freq = 1, maxAmp = 0;
    for (let i = 0; i < octaves; i++) {
        val += valueNoise(x * freq, y * freq) * amp;
        maxAmp += amp;
        amp *= 0.5;
        freq *= 2.0;
    }
    return val / maxAmp;
}

function ridgedNoise(x, y, octaves = 4) {
    let val = 0, amp = 1, freq = 1, maxAmp = 0;
    for (let i = 0; i < octaves; i++) {
        let n = valueNoise(x * freq, y * freq);
        n = 1.0 - Math.abs(n * 2 - 1);
        n = n * n;
        val += n * amp;
        maxAmp += amp;
        amp *= 0.5;
        freq *= 2.0;
    }
    return val / maxAmp;
}

function mix(a, b, t) {
    t = Math.max(0, Math.min(1, t));
    return a + (b - a) * t;
}

function smoothFalloff(dist, radius, sharpness = 2) {
    if (dist >= radius) return 0;
    const t = 1 - dist / radius;
    return Math.pow(smoothstep(t), sharpness);
}

// ============================================================
// Water masks — the SF Bay is a simplified polygon, the Pacific
// is everything west of the coastal line.
// ============================================================

// The Bay is approximately enclosed by these shore lines (GPS):
//
//   West shore (inside edge):
//     Marin:          lat 37.88-38.0, lon ~ -122.50..-122.48
//     Golden Gate:    lat 37.80-37.88, lon ~ -122.47
//     SF east shore:  lat 37.70-37.80, lon ~ -122.38
//     South Bay west: lat 37.35-37.70, lon ~ -122.05..-122.15
//
//   East shore:
//     Richmond:       lat 37.93, lon ~ -122.37
//     Berkeley/Oak:   lat 37.76-37.90, lon ~ -122.29
//     Oakland/Alameda:lat 37.72-37.78, lon ~ -122.26
//     Hayward/Fremont:lat 37.50-37.70, lon ~ -122.08
//     South Bay end:  lat 37.45,       lon ~ -122.00
//
// We provide smooth shore curves that interpolate these.

function bayWestShoreLon(lat) {
    // Piecewise interpolation
    if (lat >= 37.88) {
        // Marin -> Golden Gate
        const t = Math.min(1, (lat - 37.88) / 0.10);
        return mix(-122.47, -122.50, t);
    } else if (lat >= 37.80) {
        // Golden Gate -> SF east shore
        const t = (lat - 37.80) / 0.08;
        return mix(-122.38, -122.47, t);
    } else if (lat >= 37.55) {
        // SF Bay south: west shore runs from SF down through peninsula
        const t = (lat - 37.55) / 0.25;
        return mix(-122.25, -122.38, t);
    } else {
        // South Bay tip: shore curves east toward Milpitas
        const t = (lat - 37.35) / 0.20;
        return mix(-122.00, -122.25, t);
    }
}

function bayEastShoreLon(lat) {
    // Anchors tuned to actual East Bay shoreline:
    //   lat 37.72 (San Leandro):     lon -122.16
    //   lat 37.80 (Oakland port):    lon -122.28
    //   lat 37.86 (Berkeley marina): lon -122.31
    //   lat 37.93 (Richmond harbor): lon -122.37
    //   lat 37.98 (San Pablo pt):    lon -122.32
    if (lat >= 37.98) {
        const t = Math.min(1, (lat - 37.98) / 0.12);
        return mix(-122.32, -122.23, t);
    } else if (lat >= 37.93) {
        const t = (lat - 37.93) / 0.05;
        return mix(-122.37, -122.32, t);
    } else if (lat >= 37.86) {
        const t = (lat - 37.86) / 0.07;
        return mix(-122.31, -122.37, t);
    } else if (lat >= 37.80) {
        const t = (lat - 37.80) / 0.06;
        return mix(-122.28, -122.31, t);
    } else if (lat >= 37.55) {
        const t = (lat - 37.55) / 0.25;
        return mix(-122.10, -122.28, t);
    } else {
        const t = (lat - 37.35) / 0.20;
        return mix(-121.97, -122.10, t);
    }
}

export function isInBay(lat, lon) {
    // Outside lat range the bay doesn't exist
    if (lat < 37.35 || lat > 38.10) return false;
    const west = bayWestShoreLon(lat);
    const east = bayEastShoreLon(lat);
    return lon > west && lon < east;
}

// Pacific coast: west of the peninsulas. A simplified curving line.
function pacificCoastLon(lat) {
    if (lat >= 37.95) {
        // Northern Marin coast — curves west-northwest
        const t = Math.min(1, (lat - 37.95) / 0.15);
        return mix(-122.58, -122.85, t);
    } else if (lat >= 37.82) {
        // Marin Headlands
        const t = (lat - 37.82) / 0.13;
        return mix(-122.53, -122.58, t);
    } else if (lat >= 37.70) {
        // SF ocean beach / Sutro Heights
        const t = (lat - 37.70) / 0.12;
        return mix(-122.51, -122.53, t);
    } else {
        // Pacifica / Half Moon Bay — coast trends slightly east going south
        const t = (lat - 37.30) / 0.40;
        return mix(-122.44, -122.51, t);
    }
}

export function isInPacific(lat, lon) {
    return lon < pacificCoastLon(lat);
}

// San Pablo Bay (north of Richmond) - a separate water body we treat as extension of bay
function isInSanPablo(lat, lon) {
    // Roughly north of Richmond Bridge
    if (lat < 37.96 || lat > 38.10) return false;
    // Wider water body
    return lon > -122.48 && lon < -122.20;
}

// ============================================================
// Elevation function
// ============================================================
export function getElevation(lat, lon) {
    if (isInBay(lat, lon) || isInPacific(lat, lon) || isInSanPablo(lat, lon)) {
        return -3;
    }

    const nx = (lon - BA_BOUNDS.west) / LON_RANGE; // 0..1 west->east
    const ny = (lat - BA_BOUNDS.south) / LAT_RANGE; // 0..1 south->north

    let elevation = 0;

    // ===== 1. MARIN HILLS — dramatic north of Golden Gate =====
    // Marin has rugged hills, with Mt. Tamalpais the highest peak
    if (lat >= 37.82) {
        const marinFactor = smoothstep(Math.min(1, (lat - 37.82) / 0.12));
        const westFactor = Math.max(0, 1 - Math.abs(nx - 0.25) / 0.18);
        const marinBase = marinFactor * westFactor * 280;
        elevation += marinBase;

        // Mt. Tamalpais peak (785m)
        const tamDist = Math.sqrt(
            Math.pow((lon - -122.58) * 2, 2) + Math.pow(lat - 37.923, 2)
        );
        if (tamDist < 0.10) {
            const tamFactor = smoothFalloff(tamDist, 0.10, 1.5);
            elevation = Math.max(elevation, 40 + tamFactor * 760);
        }

        // Marin Headlands (cliff ridge just north of Golden Gate)
        const headlandDist = Math.sqrt(
            Math.pow((lon - -122.52) * 2, 2) + Math.pow(lat - 37.83, 2)
        );
        if (headlandDist < 0.05) {
            elevation = Math.max(elevation, 30 + smoothFalloff(headlandDist, 0.05, 1) * 260);
        }

        // Marin ridge texture
        elevation += marinFactor * ridgedNoise(nx * 14 + 5.2, ny * 14 + 2.1, 4) * 100;
    }

    // ===== 2. SF PENINSULA HILLS =====
    // SF spans roughly lat 37.71-37.82, lon -122.51 to -122.36
    // Twin Peaks at ~280m, rolling hills otherwise
    if (lat >= 37.70 && lat <= 37.82) {
        const sfEast = bayWestShoreLon(lat);
        const sfWest = pacificCoastLon(lat);
        if (lon > sfWest && lon < sfEast) {
            // Base SF elevation
            elevation += 30 + fbm(nx * 18 + 1.3, ny * 18 + 4.7, 4) * 60;

            // Twin Peaks (280m)
            const twinDist = Math.sqrt(
                Math.pow((lon - -122.447) * 2, 2) + Math.pow(lat - 37.751, 2)
            );
            if (twinDist < 0.04) {
                elevation = Math.max(elevation, 80 + smoothFalloff(twinDist, 0.04, 1.2) * 200);
            }
            // Mt. Davidson (283m)
            const davDist = Math.sqrt(
                Math.pow((lon - -122.454) * 2, 2) + Math.pow(lat - 37.738, 2)
            );
            if (davDist < 0.03) {
                elevation = Math.max(elevation, 60 + smoothFalloff(davDist, 0.03, 1.2) * 220);
            }
            // Mt. Sutro (254m)
            const sutroDist = Math.sqrt(
                Math.pow((lon - -122.456) * 2, 2) + Math.pow(lat - 37.760, 2)
            );
            if (sutroDist < 0.025) {
                elevation = Math.max(elevation, 40 + smoothFalloff(sutroDist, 0.025, 1) * 200);
            }
        }
    }

    // South peninsula (San Bruno Mountain, etc.)
    if (lat < 37.70 && lat >= 37.45) {
        const swLon = Math.max(pacificCoastLon(lat), -122.55);
        const seLon = bayWestShoreLon(lat);
        if (lon > swLon && lon < seLon) {
            const baseHills = 40 + fbm(nx * 12 + 8.3, ny * 12 + 1.1, 4) * 80;
            // San Bruno Mountain (~400m, near lat 37.70, lon -122.43)
            const sbmDist = Math.sqrt(
                Math.pow((lon - -122.43) * 2, 2) + Math.pow(lat - 37.69, 2)
            );
            if (sbmDist < 0.045) {
                elevation = Math.max(elevation, 80 + smoothFalloff(sbmDist, 0.045, 1.3) * 320);
            }
            // Montara Mountain / Sweeney Ridge (~580m)
            const montaraDist = Math.sqrt(
                Math.pow((lon - -122.47) * 2, 2) + Math.pow(lat - 37.55, 2)
            );
            if (montaraDist < 0.06) {
                elevation = Math.max(elevation, 100 + smoothFalloff(montaraDist, 0.06, 1.3) * 480);
            }
            elevation = Math.max(elevation, baseHills);
        }
    }

    // ===== 3. EAST BAY =====
    // Cross-section east of the bay: flatlands (Berkeley, Oakland, Emeryville)
    // → foothills → Berkeley/Oakland Hills crest (~500m at Grizzly Peak) →
    // Orinda/Lafayette valley → Mt. Diablo (1173m).
    const eastShore = bayEastShoreLon(lat);
    if (lon > eastShore && !isInSanPablo(lat, lon)) {
        const eastDeg = lon - eastShore; // degrees east of shore (~87 km/°)

        // Real East Bay cross-section (anchored to actual elevations at UCB & SLMath):
        //   0.000–0.040°  urban flats (marina → West Berkeley)   3 → 30 m
        //   0.040–0.062°  urban hill edge (campus west side)    30 → 100 m
        //   0.062–0.078°  steep rise (campus → SLMath)         100 → 320 m
        //   0.078–0.095°  upper hills (SLMath → Grizzly Peak)  320 → 520 m
        //   0.095–0.130°  drop into Orinda/Lafayette valley    520 → 180 m
        //   beyond        rolling toward Diablo range
        let base;
        if (eastDeg < 0.040) {
            base = 3 + (eastDeg / 0.040) * 27;
            base += fbm(nx * 40 + 2.1, ny * 40 + 7.3, 3) * 5;
        } else if (eastDeg < 0.062) {
            const t = (eastDeg - 0.040) / 0.022;
            base = 30 + smootherstep(t) * 70;
            base += fbm(nx * 28 + 4.1, ny * 28 + 3.2, 3) * 10;
        } else if (eastDeg < 0.078) {
            const t = (eastDeg - 0.062) / 0.016;
            base = 100 + smootherstep(t) * 220;
            base += ridgedNoise(nx * 18 + 3.3, ny * 18 + 9.1, 4) * 40;
        } else if (eastDeg < 0.095) {
            const t = (eastDeg - 0.078) / 0.017;
            base = 320 + smootherstep(t) * 200;
            base += ridgedNoise(nx * 14 + 5.3, ny * 14 + 2.1, 4) * 60;
        } else if (eastDeg < 0.130) {
            const t = (eastDeg - 0.095) / 0.035;
            base = 520 - smootherstep(t) * 340;
            base += fbm(nx * 12 + 1.1, ny * 12 + 5.7, 4) * 60;
        } else {
            base = 180 + fbm(nx * 10 + 4.3, ny * 10 + 1.7, 4) * 150;
        }
        elevation = base;

        // Mt. Diablo (1173 m at 37.881, -121.914)
        const diabloDist = Math.sqrt(
            Math.pow((lon - -121.914) * 2, 2) + Math.pow(lat - 37.881, 2)
        );
        if (diabloDist < 0.14) {
            const f = smoothFalloff(diabloDist, 0.14, 1.8);
            elevation = Math.max(elevation, 200 + f * 970);
        }

        // Grizzly Peak (~524 m at 37.876, -122.245)
        const grizzlyDist = Math.sqrt(
            Math.pow((lon - -122.245) * 2, 2) + Math.pow(lat - 37.876, 2)
        );
        if (grizzlyDist < 0.018) {
            elevation = Math.max(elevation, 340 + smoothFalloff(grizzlyDist, 0.018, 1.2) * 180);
        }

        // Claremont / Oakland Hills (~500 m at 37.818, -122.195)
        const oakHillDist = Math.sqrt(
            Math.pow((lon - -122.195) * 2, 2) + Math.pow(lat - 37.818, 2)
        );
        if (oakHillDist < 0.025) {
            elevation = Math.max(elevation, 320 + smoothFalloff(oakHillDist, 0.025, 1.2) * 180);
        }

        // SLMath plateau at 37.8795, -122.2442 (~300 m)
        const slmathDist = Math.sqrt(
            Math.pow((lon - -122.2442) * 2, 2) + Math.pow(lat - 37.8795, 2)
        );
        if (slmathDist < 0.012) {
            const f = smoothFalloff(slmathDist, 0.012, 1.0);
            elevation = Math.max(elevation, 280 + f * 50);
        }
    }

    // ===== 4. SANTA CLARA VALLEY & SOUTH BAY FLATS =====
    // Flatlands south of the bay, east of SF peninsula
    if (lat < 37.55 && !isInBay(lat, lon)) {
        const eastShore = bayEastShoreLon(lat);
        const westShore = bayWestShoreLon(lat);
        if (lon > westShore && lon < eastShore) {
            elevation = Math.min(elevation || 999, 5 + fbm(nx * 25, ny * 25, 3) * 8);
        }
    }

    // ===== 5. CONTRA COSTA valleys, Diablo east =====
    // Already partially handled above. Add general rolling hills.
    if (nx > 0.9 && !isInSanPablo(lat, lon)) {
        const rolling = 100 + fbm(nx * 8, ny * 8, 4) * 120;
        elevation = Math.max(elevation, rolling);
    }

    // ===== 6. Natural micro-variation =====
    elevation += (fbm(nx * 80 + 5.3, ny * 80 + 2.1, 3) - 0.5) * 6;

    return Math.max(-3, elevation);
}

// ============================================================
// Terrain Class
// ============================================================
export class BayAreaTerrain {
    constructor(scene) {
        this.scene = scene;
        // 512 → ~230 m per vertex over the 120 km region, enough resolution
        // for the UCB_CAMPUS_OVERRIDE patch to resolve cleanly while keeping
        // vertex count manageable (~260k).
        this.resolution = 512;
        this.addedObjects = [];
        this.terrainMesh = null;
        this.bayMesh = null;
        this.pacificMesh = null;
        this.skyMesh = null;
    }

    async generate() {
        this.createTerrain();
        this.createBayWater();
        this.createPacific();
        this.createSky();
        this.createLighting();
    }

    _track(obj) {
        this.scene.add(obj);
        this.addedObjects.push(obj);
    }

    createTerrain() {
        const geometry = new THREE.PlaneGeometry(
            BA_SIZE.width, BA_SIZE.height,
            this.resolution, this.resolution
        );
        const positions = geometry.attributes.position;
        const colors = new Float32Array(positions.count * 4);

        const halfW = BA_SIZE.width / 2;
        const halfH = BA_SIZE.height / 2;
        const fadeZoneX = halfW * 0.18;
        const fadeZoneZ = halfH * 0.18;

        for (let i = 0; i < positions.count; i++) {
            const x = positions.getX(i);
            const yPlane = positions.getY(i);
            const worldZ = -yPlane;
            const gps = localToGps(x, worldZ);

            let elevation = getElevation(gps.lat, gps.lon);
            const isWater = isInBay(gps.lat, gps.lon) ||
                isInPacific(gps.lat, gps.lon) ||
                isInSanPablo(gps.lat, gps.lon);

            if (isWater) elevation = -3;

            // Sink the regional terrain under the UCB campus detail patch so
            // its own local plane renders unobstructed. Use a smooth blend
            // margin so there's no visible seam at the patch boundary.
            const inUCB = gps.lat > UCB_CAMPUS_OVERRIDE.latMin &&
                gps.lat < UCB_CAMPUS_OVERRIDE.latMax &&
                gps.lon > UCB_CAMPUS_OVERRIDE.lonMin &&
                gps.lon < UCB_CAMPUS_OVERRIDE.lonMax;
            if (inUCB) {
                // Sink the regional terrain well below the local campus plane
                // so there's no risk of poke-through.
                elevation = -500;
            }

            positions.setZ(i, elevation);

            const color = this.getVertexColor(gps, elevation);
            let alpha = 1.0;

            if (isWater) alpha = 0.0;
            if (inUCB) alpha = 0.0;

            // Edge fade so the plane doesn't have a hard boundary
            const distFromEdgeX = halfW - Math.abs(x);
            const distFromEdgeZ = halfH - Math.abs(yPlane);
            const edgeFadeX = Math.min(1, distFromEdgeX / fadeZoneX);
            const edgeFadeZ = Math.min(1, distFromEdgeZ / fadeZoneZ);
            const fX = smoothstep(edgeFadeX);
            const fZ = smoothstep(edgeFadeZ);
            alpha *= fX * fZ;

            colors[i * 4] = color.r;
            colors[i * 4 + 1] = color.g;
            colors[i * 4 + 2] = color.b;
            colors[i * 4 + 3] = alpha;
        }

        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 4));
        geometry.computeVertexNormals();

        this.terrainMesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
            vertexColors: true,
            roughness: 0.9, metalness: 0,
            transparent: true,
            alphaTest: 0.02,
            depthWrite: true
        }));
        this.terrainMesh.rotation.x = -Math.PI / 2;
        this.terrainMesh.receiveShadow = true;
        this._track(this.terrainMesh);
    }

    getVertexColor(gps, elevation) {
        const { lat, lon } = gps;

        if (elevation < 0) {
            // Underwater — will be covered by water mesh; give it a dark tone
            return { r: 0.08, g: 0.14, b: 0.20 };
        }

        let r, g, b;
        if (elevation < 5) {
            // Urban flats / bay-edge mudflats
            r = 0.45; g = 0.48; b = 0.4;
        } else if (elevation < 30) {
            // Urban / low elevation
            const t = (elevation - 5) / 25;
            r = mix(0.48, 0.42, t);
            g = mix(0.5, 0.52, t);
            b = mix(0.42, 0.34, t);
        } else if (elevation < 120) {
            const t = (elevation - 30) / 90;
            r = mix(0.42, 0.35, t);
            g = mix(0.52, 0.47, t);
            b = mix(0.34, 0.28, t);
        } else if (elevation < 300) {
            const t = (elevation - 120) / 180;
            r = mix(0.35, 0.28, t);
            g = mix(0.47, 0.40, t);
            b = mix(0.28, 0.22, t);
        } else if (elevation < 600) {
            const t = (elevation - 300) / 300;
            r = mix(0.28, 0.38, t);
            g = mix(0.40, 0.40, t);
            b = mix(0.22, 0.28, t);
        } else {
            // High ridges — dry chaparral / rocky
            r = 0.45; g = 0.42; b = 0.35;
        }

        // Overlay: SF urban fabric (slightly grey)
        if (lat >= 37.70 && lat <= 37.82 && lon >= -122.51 && lon <= -122.36) {
            const urbanBlend = 0.35;
            r = mix(r, 0.52, urbanBlend);
            g = mix(g, 0.50, urbanBlend);
            b = mix(b, 0.47, urbanBlend);
        }

        // Overlay: Berkeley/Oakland urban (bay flats east of shore)
        if (lat >= 37.72 && lat <= 37.95 && lon >= -122.30 && lon <= -122.23 && elevation < 50) {
            const urbanBlend = 0.30;
            r = mix(r, 0.50, urbanBlend);
            g = mix(g, 0.48, urbanBlend);
            b = mix(b, 0.44, urbanBlend);
        }

        // Overlay: Presidio / Golden Gate Park (green)
        const presidioDist = Math.sqrt(
            Math.pow((lon - -122.47) * 2, 2) + Math.pow(lat - 37.798, 2)
        );
        if (presidioDist < 0.015) {
            const f = smoothFalloff(presidioDist, 0.015, 1.2);
            r = mix(r, 0.30, f * 0.6);
            g = mix(g, 0.48, f * 0.6);
            b = mix(b, 0.22, f * 0.6);
        }

        // Overlay: UC Berkeley campus (bright lawn)
        const ucbDist = Math.sqrt(
            Math.pow((lon - -122.2585) * 2, 2) + Math.pow(lat - 37.8719, 2)
        );
        if (ucbDist < 0.008) {
            const f = smoothFalloff(ucbDist, 0.008, 1.2);
            r = mix(r, 0.32, f * 0.6);
            g = mix(g, 0.54, f * 0.6);
            b = mix(b, 0.26, f * 0.6);
        }

        // Noise variation
        const nx = (lon - BA_BOUNDS.west) / LON_RANGE;
        const ny = (lat - BA_BOUNDS.south) / LAT_RANGE;
        const variation = (fbm(nx * 80 + 5.3, ny * 80 + 2.1, 2) - 0.5) * 0.07;
        return {
            r: Math.max(0.05, Math.min(0.95, r + variation)),
            g: Math.max(0.05, Math.min(0.95, g + variation)),
            b: Math.max(0.05, Math.min(0.95, b + variation))
        };
    }

    // Bay water — a large horizontal plane at y = -1
    createBayWater() {
        const w = BA_SIZE.width * 1.2;
        const h = BA_SIZE.height * 1.2;
        const geo = new THREE.PlaneGeometry(w, h, 32, 32);
        const mat = new THREE.MeshStandardMaterial({
            color: 0x3A6B85,
            roughness: 0.15,
            metalness: 0.5,
            transparent: true,
            opacity: 0.85
        });
        this.bayMesh = new THREE.Mesh(geo, mat);
        this.bayMesh.rotation.x = -Math.PI / 2;
        this.bayMesh.position.y = -1.0;
        this.bayMesh.renderOrder = -1;
        this._track(this.bayMesh);
    }

    // Pacific — a second plane slightly lower so the terrain's transparent
    // pacific zone shows water beneath
    createPacific() {
        const w = BA_SIZE.width * 8;
        const h = BA_SIZE.height * 8;
        const geo = new THREE.PlaneGeometry(w, h, 16, 16);
        const mat = new THREE.MeshStandardMaterial({
            color: 0x1E4466,
            roughness: 0.1,
            metalness: 0.3,
            transparent: true,
            opacity: 0.92
        });
        this.pacificMesh = new THREE.Mesh(geo, mat);
        this.pacificMesh.rotation.x = -Math.PI / 2;
        this.pacificMesh.position.y = -1.5;
        this.pacificMesh.renderOrder = -2;
        this._track(this.pacificMesh);
    }

    createSky() {
        const skyGeo = new THREE.SphereGeometry(60000, 32, 32);
        const skyMat = new THREE.ShaderMaterial({
            uniforms: {
                topColor: { value: new THREE.Color(0x3A70AA) },
                horizonColor: { value: new THREE.Color(0xB0C8D8) },
                fogColor: { value: new THREE.Color(0xD8D8DC) }
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
                    } else if (h < 0.12) {
                        color = mix(fogColor, horizonColor, h / 0.12);
                    } else {
                        color = mix(horizonColor, topColor, pow((h - 0.12) / 0.88, 0.6));
                    }
                    gl_FragColor = vec4(color, 1.0);
                }
            `,
            side: THREE.BackSide
        });
        this.skyMesh = new THREE.Mesh(skyGeo, skyMat);
        this._track(this.skyMesh);
    }

    createLighting() {
        this.sunLight = new THREE.DirectionalLight(0xFFF5E0, 1.4);
        this.sunLight.position.set(50000000, 50000000, -50000000);
        this.sunLight.castShadow = true;
        this.sunLight.shadow.mapSize.width = 4096;
        this.sunLight.shadow.mapSize.height = 4096;
        this.sunLight.shadow.camera.near = 100;
        this.sunLight.shadow.camera.far = 20000;
        this.sunLight.shadow.camera.left = -12000;
        this.sunLight.shadow.camera.right = 12000;
        this.sunLight.shadow.camera.top = 12000;
        this.sunLight.shadow.camera.bottom = -12000;
        this._track(this.sunLight);

        this.ambientLight = new THREE.AmbientLight(0x8899AA, 0.55);
        this._track(this.ambientLight);

        this.hemiLight = new THREE.HemisphereLight(0xA0B8C8, 0x4A6B5A, 0.45);
        this._track(this.hemiLight);
    }

    getElevationAtLocal(x, z) {
        const gps = localToGps(x, z);
        return getElevation(gps.lat, gps.lon);
    }

    /** Look up known Bay Area landmarks → local THREE.Vector3 */
    getLocalPosition(locationId) {
        const locations = {
            // UC Berkeley landmarks
            campanile:     { lat: 37.8719, lon: -122.2585 },
            satherGate:    { lat: 37.8703, lon: -122.2595 },
            doeLibrary:    { lat: 37.8725, lon: -122.2586 },
            evansHall:     { lat: 37.8737, lon: -122.2577 },
            slmath:        { lat: 37.8795, lon: -122.2442 },

            // Cities
            ucBerkeleyCampus: { lat: 37.8719, lon: -122.2585 },
            downtownSF:     { lat: 37.7935, lon: -122.3960 },
            oaklandDowntown:{ lat: 37.8044, lon: -122.2712 },
            sausalito:      { lat: 37.8590, lon: -122.4852 },
            saintBridge:    { lat: 37.8199, lon: -122.4783 }, // Golden Gate Bridge

            // Peaks
            grizzlyPeak:    { lat: 37.876,  lon: -122.245 },
            mtTamalpais:    { lat: 37.923,  lon: -122.580 },
            twinPeaks:      { lat: 37.751,  lon: -122.447 },
            mtDiablo:       { lat: 37.881,  lon: -121.914 }
        };
        const loc = locations[locationId];
        if (!loc) return null;
        const local = gpsToLocal(loc.lat, loc.lon);
        const elevation = getElevation(loc.lat, loc.lon);
        return new THREE.Vector3(local.x, elevation, local.z);
    }

    /** Remove everything this terrain added to the scene */
    dispose() {
        for (const obj of this.addedObjects) {
            this.scene.remove(obj);
            if (obj.geometry) obj.geometry.dispose();
            if (obj.material) {
                if (Array.isArray(obj.material)) {
                    obj.material.forEach(m => m.dispose());
                } else {
                    obj.material.dispose();
                }
            }
        }
        this.addedObjects = [];
    }
}
