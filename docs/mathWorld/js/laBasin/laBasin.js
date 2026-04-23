/**
 * Los Angeles Basin - Regional Terrain Generator
 *
 * Covers the LA basin + Santa Monica Mountains, with just enough
 * topographic accuracy to give Topanga Canyon a plausible place to sit.
 * The Santa Monica Mountains run east-west across the middle of the
 * region, rising to 800+ m; the Pacific is to the south; the LA/San
 * Fernando basins sit on either side of the range.
 *
 * Bounds: NW (34.28, -118.80) to SE (33.80, -118.10)
 */
import * as THREE from 'three';

// Geographic bounds
export const LA_BOUNDS = {
    north: 34.28,   // San Fernando Valley north edge
    south: 33.80,   // Down-coast past LAX
    west: -118.80,  // Point Dume / Malibu coast
    east: -118.10   // Glendale / east LA
};

// Calculate dimensions in meters
const LAT_RANGE = LA_BOUNDS.north - LA_BOUNDS.south;   // ~0.48 deg
const LON_RANGE = LA_BOUNDS.east - LA_BOUNDS.west;     // ~0.70 deg
const METERS_PER_LAT = 111000;
const METERS_PER_LON = 111000 * Math.cos(
    ((LA_BOUNDS.north + LA_BOUNDS.south) / 2) * Math.PI / 180
);

export const LA_SIZE = {
    width: LON_RANGE * METERS_PER_LON,   // ~65 km E-W
    height: LAT_RANGE * METERS_PER_LAT,  // ~53 km N-S
    scale: 1
};

// Center of the region — roughly the spine of the Santa Monica Mountains.
export const LA_CENTER = {
    lat: (LA_BOUNDS.north + LA_BOUNDS.south) / 2,   // ~34.04
    lon: (LA_BOUNDS.east + LA_BOUNDS.west) / 2      // ~-118.45
};

export function gpsToLocal(lat, lon) {
    const x = (lon - LA_CENTER.lon) * METERS_PER_LON;
    const z = -(lat - LA_CENTER.lat) * METERS_PER_LAT;
    return { x, z };
}

// Bounds in world XZ for the Topanga Canyon high-detail patch. The
// regional terrain mesh gets smoothly sunk under this box during
// createTerrain() so it doesn't peek through the local canyon
// geometry. Sized to match topangaCanyon.js's local worldSize
// (820 m → half 410 m) so the override and the local mesh edge line
// up. Origin = Topanga Country Store GPS (34.0934, -118.6020).
export const TOPANGA_OVERRIDE = (() => {
    const c = gpsToLocal(34.0934, -118.6020);
    const half = 410;
    return {
        xMin: c.x - half, xMax: c.x + half,
        zMin: c.z - half, zMax: c.z + half
    };
})();

export function localToGps(x, z) {
    const lon = LA_CENTER.lon + x / METERS_PER_LON;
    const lat = LA_CENTER.lat - z / METERS_PER_LAT;
    return { lat, lon };
}

// Simple value noise for foothill detail
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

function fbm(x, y, octaves) {
    let v = 0, amp = 1, freq = 1, total = 0;
    for (let i = 0; i < octaves; i++) {
        v += amp * noise2(x * freq, y * freq);
        total += amp;
        amp *= 0.5;
        freq *= 2.0;
    }
    return v / total;
}

function smoothstep(t) {
    return t * t * (3 - 2 * t);
}

/**
 * Elevation at a GPS point.
 *
 * Structure:
 *   1. Santa Monica Mountains ridge running E-W across the middle
 *   2. Topanga Creek drainage — a narrow N-S valley through the ridge
 *   3. LA coastal plain to the south (flat, low)
 *   4. San Fernando Valley to the north (flat, ~200 m elevation)
 *   5. Pacific Ocean off the south/west
 */
export function getElevation(lat, lon) {
    const nx = (lon - LA_BOUNDS.west) / LON_RANGE;    // 0 W, 1 E
    const ny = (lat - LA_BOUNDS.south) / LAT_RANGE;   // 0 S, 1 N

    // ---- Pacific ocean (south/west sliver) ----
    // Coastline runs roughly NW→SE through the region. A simple linear
    // approximation that threads through the real Malibu, Santa Monica
    // and Venice coastal positions. Points south of this line are ocean.
    const coastNy = 0.52 - nx * 0.367;
    if (ny < coastNy) {
        return -4;
    }

    // ---- Santa Monica Mountains spine (E-W ridge centred at ny ≈ 0.55) ----
    // Narrow Gaussian so the ridge doesn't dominate the coast or valley.
    const spineNy = 0.55;   // ~lat 34.06, which is roughly the SM Mtns spine
    const distToSpine = Math.abs(ny - spineNy);
    const ridgeFactor = Math.exp(-Math.pow(distToSpine / 0.08, 2));
    let elevation = ridgeFactor * 650;

    // Secondary ridges / side canyons
    elevation += Math.sin(nx * 14) * 70 * ridgeFactor;
    elevation += Math.sin(nx * 28 + ny * 8) * 22 * ridgeFactor;
    elevation += (fbm(nx * 8, ny * 8, 4) - 0.5) * 120 * ridgeFactor;

    // ---- LA coastal plain (south of spine) ----
    // Pure plain near the coast (ny < spineNy - 0.14); smoothly ramps
    // back to the mountain contribution as we approach the foothills.
    // Venice (ny ≈ 0.385) is firmly in the plain → near sea level.
    const plainEdge = spineNy - 0.14;   // Where foothills begin
    let plainFactor;
    if (ny < plainEdge) {
        plainFactor = 1;
    } else if (ny < plainEdge + 0.12) {
        const t = (ny - plainEdge) / 0.12;
        plainFactor = 1 - smoothstep(t);
    } else {
        plainFactor = 0;
    }
    // Basin rises gently from near sea level at the coast up to ~45 m
    // at the foothills. Venice Beach sits at distInland ≈ 0.04 → ~1.5 m
    // above sea level; LA basin proper rises to a few metres.
    const distInland = Math.max(0, ny - coastNy);
    const basinElev = Math.max(0.8, distInland * 90 - 2)
                       + (fbm(nx * 6, ny * 6, 3) - 0.5) * 6;
    elevation = elevation * (1 - plainFactor) + basinElev * plainFactor;

    // ---- San Fernando Valley (north of spine) ----
    const valleyFactor = smoothstep(
        Math.max(0, Math.min(1, (ny - spineNy - 0.09) / 0.20))
    );
    const valleyElev = 200 + (fbm(nx * 5 + 11, ny * 5 + 7, 3) - 0.5) * 30;
    elevation = elevation * (1 - valleyFactor) + valleyElev * valleyFactor;

    // ---- Topanga Creek drainage ----
    // A narrow N-S canyon cutting through the ridge. The creek exits
    // near the coast at Topanga Beach (34.038, -118.582) and climbs
    // north past the town (34.094, -118.602) into the saddle.
    const topangaBeachNx = (-118.582 - LA_BOUNDS.west) / LON_RANGE;
    const topangaTownNx = (-118.602 - LA_BOUNDS.west) / LON_RANGE;
    // Creek axis: linear between beach and SF valley entrance
    const creekAxisNy = (ny - 0.05) / 0.85; // 0 at coast, 1 at SF Valley
    const creekNx = topangaBeachNx + creekAxisNy * (topangaTownNx - topangaBeachNx);
    const canyonHalfWidth = 0.02;
    const distToCanyon = Math.abs(nx - creekNx);
    if (distToCanyon < canyonHalfWidth && ny > 0.05 && ny < spineNy + 0.08) {
        // Inside the canyon — drop elevation
        const t = 1 - distToCanyon / canyonHalfWidth;
        const s = t * t * (3 - 2 * t);
        // Creek elevation profile: 0 at coast, ~400 m at the top of canyon
        const creekElev = 0 + creekAxisNy * 400;
        elevation = elevation * (1 - s * 0.95) + creekElev * (s * 0.95);
    }

    // ---- Fine variation everywhere ----
    elevation += (fbm(nx * 40, ny * 40, 3) - 0.5) * 8;
    elevation += (fbm(nx * 120, ny * 120, 2) - 0.5) * 2;

    return Math.max(-4, elevation);
}

export class LABasinTerrain {
    constructor(scene) {
        this.scene = scene;
        this.terrainMesh = null;
        this.oceanMesh = null;
        this.skyMesh = null;
        this.resolution = 256;
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
        this.createOcean();
        this.createSky();
        this.createLighting();
    }

    createTerrain() {
        const width = LA_SIZE.width;
        const height = LA_SIZE.height;
        const geo = new THREE.PlaneGeometry(
            width, height, this.resolution, this.resolution
        );
        const pos = geo.attributes.position;
        const colors = new Float32Array(pos.count * 3);

        // Blend margin for the Topanga override — how far inside the
        // override box we ramp the regional mesh from normal elevation
        // down to the fully-sunk -500 m floor. Needs to be comfortably
        // larger than the regional grid cell (~254 m at the current
        // resolution) so the linearly-interpolated rendered surface
        // descends smoothly rather than in one coarse step.
        const TOPANGA_BLEND = 180;

        for (let i = 0; i < pos.count; i++) {
            const x = pos.getX(i);
            const y = pos.getY(i);
            const worldX = x, worldZ = -y;
            const gps = localToGps(worldX, worldZ);
            let elev = getElevation(gps.lat, gps.lon);

            // --- Sink regional terrain under the Topanga local mesh ---
            // so it doesn't poke through the canyon geometry.
            const dxMin = worldX - TOPANGA_OVERRIDE.xMin;
            const dxMax = TOPANGA_OVERRIDE.xMax - worldX;
            const dzMin = worldZ - TOPANGA_OVERRIDE.zMin;
            const dzMax = TOPANGA_OVERRIDE.zMax - worldZ;
            const insideTopanga =
                dxMin > 0 && dxMax > 0 && dzMin > 0 && dzMax > 0;
            if (insideTopanga) {
                const edgeDist = Math.min(dxMin, dxMax, dzMin, dzMax);
                if (edgeDist >= TOPANGA_BLEND) {
                    elev = -500;
                } else {
                    // Smoothstep fade from normal at the edge down to
                    // -500 at blend-margin depth.
                    const t = edgeDist / TOPANGA_BLEND;
                    const s = t * t * (3 - 2 * t);
                    elev = elev * (1 - s) + (-500) * s;
                }
            }

            pos.setZ(i, elev);

            // Palette — dry SoCal chaparral and urban basin
            let r, g, b;
            if (elev < 0) {
                // Ocean
                r = 0.10; g = 0.28; b = 0.48;
            } else if (elev < 15) {
                // Beach / coastal flats
                r = 0.86; g = 0.78; b = 0.58;
            } else if (elev < 100) {
                // LA basin / low flats — dry grass / urban
                r = 0.60; g = 0.58; b = 0.42;
            } else if (elev < 250) {
                // Chaparral / oak foothills
                r = 0.50; g = 0.52; b = 0.34;
            } else if (elev < 500) {
                // Upper chaparral / bare hills
                r = 0.60; g = 0.52; b = 0.36;
            } else {
                // High ridges — tan/grey bedrock
                r = 0.66; g = 0.58; b = 0.48;
            }
            const n = (Math.random() - 0.5) * 0.08;
            colors[i * 3]     = Math.max(0, Math.min(1, r + n));
            colors[i * 3 + 1] = Math.max(0, Math.min(1, g + n));
            colors[i * 3 + 2] = Math.max(0, Math.min(1, b + n));
        }

        geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geo.computeVertexNormals();

        this.terrainMesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
            vertexColors: true, roughness: 0.92, metalness: 0
        }));
        this.terrainMesh.rotation.x = -Math.PI / 2;
        this.terrainMesh.receiveShadow = true;
        this.terrainMesh.castShadow = true;
        this._track(this.terrainMesh);
    }

    createOcean() {
        const oceanGeo = new THREE.PlaneGeometry(
            LA_SIZE.width * 1.5, LA_SIZE.height * 0.4
        );
        const oceanMat = new THREE.MeshStandardMaterial({
            color: 0x1A5C82, roughness: 0.22, metalness: 0.25,
            transparent: true, opacity: 0.88
        });
        this.oceanMesh = new THREE.Mesh(oceanGeo, oceanMat);
        this.oceanMesh.rotation.x = -Math.PI / 2;
        // Place ocean south of the mountains
        this.oceanMesh.position.set(0, -3, LA_SIZE.height * 0.42);
        this._track(this.oceanMesh);
    }

    createSky() {
        const skyGeo = new THREE.SphereGeometry(60000, 32, 32);
        const skyMat = new THREE.ShaderMaterial({
            uniforms: {
                topColor: { value: new THREE.Color(0x2E6FB0) },
                horizonColor: { value: new THREE.Color(0xC2B9A0) }, // SoCal smoggy haze
                fogColor: { value: new THREE.Color(0xD8CEB4) }
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
                        color = mix(horizonColor, topColor, pow((h - 0.1) / 0.9, 0.55));
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
        // Late-afternoon SoCal sun — warm, low in the west
        const sun = new THREE.DirectionalLight(0xFFE4B3, 1.7);
        sun.position.set(-LA_SIZE.width * 0.4, 6000, LA_SIZE.height * 0.2);
        sun.castShadow = true;
        sun.shadow.mapSize.width = 4096;
        sun.shadow.mapSize.height = 4096;
        sun.shadow.camera.near = 100;
        sun.shadow.camera.far = 25000;
        sun.shadow.camera.left = -15000;
        sun.shadow.camera.right = 15000;
        sun.shadow.camera.top = 15000;
        sun.shadow.camera.bottom = -15000;
        this._trackLight(sun);

        this._trackLight(new THREE.AmbientLight(0x9AA0A8, 0.45));
        this._trackLight(new THREE.HemisphereLight(0xA7C4E0, 0xA0906B, 0.4));
    }

    getElevationAtLocal(x, z) {
        const gps = localToGps(x, z);
        return getElevation(gps.lat, gps.lon);
    }
}
