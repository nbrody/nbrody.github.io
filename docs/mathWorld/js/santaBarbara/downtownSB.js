/**
 * Downtown Santa Barbara — Spanish Colonial Revival city centre
 *
 * Layout (origin = State St & Anapamu; +Z is south / ocean, +X is east):
 *
 *     Mountains (north)
 *          ↑ -Z
 *           |
 *   Victoria  ────────────────────────────  (-75)
 *           |                       [Public Library] [Courthouse]
 *   Anapamu ─── [Arlington Theatre] ●[origin]─────  (0)
 *           |   [SB Museum of Art]  | [La Arcada]
 *   Figueroa ──────────────────────────────  (+75)
 *           |                    [Granada Theatre]
 *   Carrillo ──────────────────────────────  (+150)
 *           |   [El Paseo arcade]
 *   Canon Perdido ─────────────────────────  (+225)
 *           |   [Paseo Nuevo mall + Nordstrom]
 *   De la Guerra ──────────────────────────  (+300)
 *           |                    [de la Guerra Plaza]
 *   Ortega ────────────────────────────────  (+375)
 *           |     … more Spanish Colonial blocks …
 *   Haley ─────────────────────────────────  (+525)
 *           |
 *   Gutierrez ─────────────────────────────  (+600)
 *           |     [Funk Zone]
 *   Yanonali ──────────────────────────────  (+675)
 *           |
 *   Cabrillo Blvd (beachfront) ────────────  (+750)
 *   Beach sand                              (+760 to +800)
 *   Stearns Wharf (pier)                    (+790 to +950)
 *   Ocean                                   (+800 onward)
 *
 * Harbor with sailboats sits off to the SW at (-400, +700).
 *
 * Style: Spanish Colonial Revival — white / cream / salmon stucco,
 * red terracotta tile roofs, arched windows, wrought-iron balconies,
 * fountains, palm-lined streets, bougainvillea climbing the walls.
 * See refs/downtownSB.md for the research behind the layout.
 */

import * as THREE from 'three';

export class DowntownSB {
    constructor(campusGroup, terrainHeightFn = null) {
        this.group = campusGroup;
        this.worldSize = 2000;
        this.terrainResolution = 300;
        this.regionalTerrainFn = terrainHeightFn;
    }

    setTerrainFunction(fn) { this.regionalTerrainFn = fn; }

    // ----- Street grid (local coords) -----
    get NS_STREETS() {
        return {
            DE_LA_VINA:    -200,
            CHAPALA:       -120,
            STATE:            0,
            ANACAPA:        +80,
            SANTA_BARBARA: +160,
            GARDEN:        +240
        };
    }
    get EW_STREETS() {
        return {
            SOLA:          -150,
            VICTORIA:       -75,
            ANAPAMU:          0,
            FIGUEROA:       +75,
            CARRILLO:      +150,
            CANON_PERDIDO: +225,
            DE_LA_GUERRA:  +300,
            ORTEGA:        +375,
            COTA:          +450,
            HALEY:         +525,
            GUTIERREZ:     +600,
            YANONALI:      +675,
            CABRILLO:      +750
        };
    }
    get ROAD_HALFWIDTH() { return 7; }
    get SIDEWALK_WIDTH() { return 4; }
    get BEACH_Z_START() { return 760; }
    get BEACH_Z_END()   { return 800; }
    get WHARF_START_Z() { return 790; }
    get WHARF_END_Z()   { return 950; }

    async generate() {
        // --- Shared material registry (huge perf win vs per-mesh mats) ---
        this._buildMaterialPalette();

        this.createTerrain();
        this.createRoads();
        this.createSidewalks();
        this.createCrosswalks();
        this.createStateStreetPromenade();

        // Fill every block with Spanish Colonial buildings
        this.createBlockFill();

        // Landmarks (override any generic block fill at their positions)
        this.createCourthouse();
        this.createArlingtonTheatre();
        this.createGranadaTheatre();
        this.createElPaseo();
        this.createPaseoNuevo();
        this.createLaArcada();
        this.createMuseumOfArt();
        this.createPublicLibrary();
        this.createDeLaGuerraPlaza();
        this.createFunkZone();

        // Beach + harbor + wharf
        this.createBeach();
        this.createOcean();
        this.createCabrilloBlvd();
        this.createStearnsWharf();
        this.createHarbor();

        // Plantings + furnishings
        this.createStreetPalms();
        this.createFountains();
        this.createBougainvillea();
        this.createStreetLamps();
        this.createBenches();
        this.createParkedCars();
        this.createPedestrians();
        this.createSignage();
    }

    // ========================================================
    //  MATERIAL PALETTE — reused across landmarks
    // ========================================================
    _buildMaterialPalette() {
        this.mat = {
            // Stucco walls (four Spanish Colonial stucco hues)
            stuccoWhite:  new THREE.MeshStandardMaterial({ color: 0xF2EEE2, roughness: 0.88 }),
            stuccoCream:  new THREE.MeshStandardMaterial({ color: 0xE8DCBA, roughness: 0.88 }),
            stuccoYellow: new THREE.MeshStandardMaterial({ color: 0xDFC99C, roughness: 0.88 }),
            stuccoSalmon: new THREE.MeshStandardMaterial({ color: 0xD8A885, roughness: 0.88 }),
            stuccoTan:    new THREE.MeshStandardMaterial({ color: 0xCBB693, roughness: 0.88 }),
            stuccoRose:   new THREE.MeshStandardMaterial({ color: 0xD9B6A6, roughness: 0.88 }),

            // Red terracotta roof tiles (three tones — darker creates shadow edges)
            tileRed:      new THREE.MeshStandardMaterial({ color: 0xB24A32, roughness: 0.82 }),
            tileRedDark:  new THREE.MeshStandardMaterial({ color: 0x8B4A36, roughness: 0.86 }),
            tileRedLight: new THREE.MeshStandardMaterial({ color: 0xCC5A3A, roughness: 0.82 }),

            // Supporting materials
            wrought:      new THREE.MeshStandardMaterial({ color: 0x2A1A10, roughness: 0.6, metalness: 0.55 }),
            darkWood:     new THREE.MeshStandardMaterial({ color: 0x3E2A1A, roughness: 0.85 }),
            lightWood:    new THREE.MeshStandardMaterial({ color: 0x7A5A3A, roughness: 0.85 }),
            sandstone:    new THREE.MeshStandardMaterial({ color: 0xC6B089, roughness: 0.88 }),
            concrete:     new THREE.MeshStandardMaterial({ color: 0xCBC3B4, roughness: 0.88 }),
            glass:        new THREE.MeshStandardMaterial({
                color: 0x6F8AA3, roughness: 0.18, metalness: 0.4,
                transparent: true, opacity: 0.72
            }),
            glassDark:    new THREE.MeshStandardMaterial({
                color: 0x2F4050, roughness: 0.12, metalness: 0.5,
                transparent: true, opacity: 0.82
            }),
            asphalt:      new THREE.MeshStandardMaterial({ color: 0x2E2E30, roughness: 0.94 }),
            sand:         new THREE.MeshStandardMaterial({ color: 0xE8D7A6, roughness: 0.96 }),

            // Palm parts
            palmTrunk:    new THREE.MeshStandardMaterial({ color: 0x6B5238, roughness: 0.88 }),
            palmFrond:    new THREE.MeshStandardMaterial({
                color: 0x3F6B2A, roughness: 0.82, side: THREE.DoubleSide
            }),
            palmFrondL:   new THREE.MeshStandardMaterial({
                color: 0x4A7A35, roughness: 0.82, side: THREE.DoubleSide
            }),

            // Bougainvillea leaf tones
            bougMagenta:  new THREE.MeshStandardMaterial({ color: 0xB82A6E, roughness: 0.72 }),
            bougPink:     new THREE.MeshStandardMaterial({ color: 0xD04B8C, roughness: 0.72 }),
            bougRed:      new THREE.MeshStandardMaterial({ color: 0xC92A2A, roughness: 0.72 }),
            bougLightPink:new THREE.MeshStandardMaterial({ color: 0xF07298, roughness: 0.72 }),

            // Water / wharf-specific
            water:        new THREE.MeshStandardMaterial({
                color: 0x1E5F82, roughness: 0.18, metalness: 0.2,
                transparent: true, opacity: 0.9
            }),
            foam:         new THREE.MeshStandardMaterial({
                color: 0xFFFFFF, roughness: 0.8, transparent: true, opacity: 0.55
            }),
            wharfPlank:   new THREE.MeshStandardMaterial({ color: 0x8B6A42, roughness: 0.88 }),
            wharfPlankD:  new THREE.MeshStandardMaterial({ color: 0x6A4C2E, roughness: 0.9 }),
            wharfPile:    new THREE.MeshStandardMaterial({ color: 0x3E2E1E, roughness: 0.9 }),

            // Car body colors
            carRed:   new THREE.MeshStandardMaterial({ color: 0xC43D3D, roughness: 0.4, metalness: 0.55 }),
            carBlue:  new THREE.MeshStandardMaterial({ color: 0x2F5DA8, roughness: 0.4, metalness: 0.55 }),
            carWhite: new THREE.MeshStandardMaterial({ color: 0xEFEFE8, roughness: 0.4, metalness: 0.55 }),
            carSilver:new THREE.MeshStandardMaterial({ color: 0xB5B5B5, roughness: 0.35, metalness: 0.65 }),
            carBlack: new THREE.MeshStandardMaterial({ color: 0x1A1A1A, roughness: 0.4, metalness: 0.55 }),
            carWindow:new THREE.MeshStandardMaterial({
                color: 0x1A2834, roughness: 0.15, metalness: 0.5,
                transparent: true, opacity: 0.85
            }),
            tire:     new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.92 })
        };

        // Grouped palettes for variety in block fill / cabins
        this.stuccoPool = [
            this.mat.stuccoWhite, this.mat.stuccoCream, this.mat.stuccoYellow,
            this.mat.stuccoSalmon, this.mat.stuccoTan, this.mat.stuccoRose
        ];
        this.roofPool = [
            this.mat.tileRed, this.mat.tileRedDark, this.mat.tileRedLight
        ];
        this.bougPool = [
            this.mat.bougMagenta, this.mat.bougPink, this.mat.bougRed, this.mat.bougLightPink
        ];
        this.carPool = [
            this.mat.carRed, this.mat.carBlue, this.mat.carWhite,
            this.mat.carSilver, this.mat.carBlack
        ];
    }

    // ========================================================
    //  TERRAIN
    // ========================================================
    localHeight(x, z) {
        // Downtown is nearly flat. Gentle 3% rise from beach to foothills.
        const northRise = Math.max(0, -z + this.BEACH_Z_START) * 0.012;
        let h = northRise;
        // Beach drops gently from 4 m at its north edge to 1 m at water
        if (z > this.BEACH_Z_START && z < this.BEACH_Z_END) {
            const t = (z - this.BEACH_Z_START) / (this.BEACH_Z_END - this.BEACH_Z_START);
            h = 4 - t * 3;
        }
        // Ocean (south of beach) — sloping sea floor
        if (z >= this.BEACH_Z_END) {
            h = 1 - Math.min(4, (z - this.BEACH_Z_END) / 60);
        }
        // Micro-undulation on the street grid so paving looks lived-in
        if (z < this.BEACH_Z_START) {
            h += Math.sin(x * 0.06) * Math.cos(z * 0.05) * 0.15;
            h += Math.sin(x * 0.13 + z * 0.09) * 0.08;
        }
        return h;
    }

    getTerrainHeight(x, z) {
        const half = this.worldSize / 2;
        const margin = 60;
        const absX = Math.abs(x), absZ = Math.abs(z);
        if (absX < half - margin && absZ < half - margin) {
            return this.localHeight(x, z);
        }
        if (this.regionalTerrainFn) {
            if (absX < half && absZ < half) {
                const edgeDist = Math.min(half - absX, half - absZ);
                const t = Math.max(0, Math.min(1, edgeDist / margin));
                const local = this.localHeight(x, z);
                const regional = this.regionalTerrainFn(x, z);
                return local * t + regional * (1 - t);
            }
            return this.regionalTerrainFn(x, z);
        }
        return this.localHeight(x, z);
    }

    createTerrain() {
        const geo = new THREE.PlaneGeometry(
            this.worldSize, this.worldSize,
            this.terrainResolution, this.terrainResolution
        );
        const pos = geo.attributes.position;
        const colors = new Float32Array(pos.count * 3);

        for (let i = 0; i < pos.count; i++) {
            const lx = pos.getX(i);
            const ly = pos.getY(i);
            const worldX = lx, worldZ = -ly;
            const h = this.localHeight(worldX, worldZ);
            pos.setZ(i, h);

            // Zone-based vertex coloring
            let r, g, b;
            if (worldZ >= this.BEACH_Z_END) {
                // Underwater / sea floor — won't usually be seen
                r = 0.18; g = 0.36; b = 0.44;
            } else if (worldZ >= this.BEACH_Z_START) {
                // Sand beach
                r = 0.90; g = 0.83; b = 0.65;
            } else if (worldZ >= this.BEACH_Z_START - 10) {
                // Thin berm / promenade grass strip
                r = 0.65; g = 0.68; b = 0.40;
            } else {
                // Urban substrate under streets/buildings. Color is
                // mostly hidden by overlaid meshes, but visible at
                // open plazas and edges.
                r = 0.72; g = 0.66; b = 0.52;
            }
            const noise = (Math.random() - 0.5) * 0.04;
            colors[i*3]     = Math.max(0, Math.min(1, r + noise));
            colors[i*3 + 1] = Math.max(0, Math.min(1, g + noise));
            colors[i*3 + 2] = Math.max(0, Math.min(1, b + noise));
        }

        geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geo.computeVertexNormals();

        const mat = new THREE.MeshStandardMaterial({
            vertexColors: true, roughness: 0.94, metalness: 0
        });
        const terrain = new THREE.Mesh(geo, mat);
        terrain.rotation.x = -Math.PI / 2;
        terrain.receiveShadow = true;
        terrain.userData.noCollision = true;
        this.group.add(terrain);
    }

    // ========================================================
    //  STREETS — asphalt grid
    // ========================================================
    createRoads() {
        const S = this.NS_STREETS, E = this.EW_STREETS;
        const half = this.worldSize / 2 - 40;

        // N-S streets — run along Z axis
        for (const [name, x] of Object.entries(S)) {
            // Skip State St south of promenade entry; pedestrianised there
            const zStart = -half;
            const zEnd = name === 'STATE' ? E.YANONALI + 40 : half;
            this._layRoadRect(
                x - this.ROAD_HALFWIDTH, zStart,
                x + this.ROAD_HALFWIDTH, zEnd
            );
        }

        // E-W streets — run along X axis. Cabrillo is its own 4-lane boulevard
        // (handled separately for its wider profile + palm median)
        for (const [name, z] of Object.entries(E)) {
            if (name === 'CABRILLO') continue;
            this._layRoadRect(
                -half, z - this.ROAD_HALFWIDTH,
                half,  z + this.ROAD_HALFWIDTH
            );
        }

        // Lane stripes — dashed yellow on the bigger streets
        this._addLaneStripes(0, -half + 10, E.YANONALI, 'NS');        // State (pre-promenade)
        this._addLaneStripes(S.ANACAPA, -half + 10, half - 10, 'NS');
        this._addLaneStripes(S.CHAPALA, -half + 10, half - 10, 'NS');
        this._addLaneStripes(E.ANAPAMU, -half + 10, half - 10, 'EW');
        this._addLaneStripes(E.CARRILLO, -half + 10, half - 10, 'EW');
        this._addLaneStripes(E.HALEY, -half + 10, half - 10, 'EW');
    }

    _layRoadRect(x1, z1, x2, z2) {
        const cx = (x1 + x2) / 2, cz = (z1 + z2) / 2;
        const w = Math.abs(x2 - x1), d = Math.abs(z2 - z1);
        const isNS = d > w;
        const longAxis = isNS ? d : w;
        const segCount = Math.max(1, Math.ceil(longAxis / 40));

        for (let i = 0; i < segCount; i++) {
            const t = (i + 0.5) / segCount;
            let scx, scz, sw, sd;
            if (isNS) {
                scx = cx;
                scz = z1 + d * t;
                sw = w;
                sd = d / segCount + 0.1;
            } else {
                scx = x1 + w * t;
                scz = cz;
                sw = w / segCount + 0.1;
                sd = d;
            }
            const slab = new THREE.Mesh(
                new THREE.PlaneGeometry(sw, sd),
                this.mat.asphalt
            );
            slab.rotation.x = -Math.PI / 2;
            slab.position.set(scx, this.localHeight(scx, scz) + 0.04, scz);
            slab.userData.noCollision = true;
            slab.receiveShadow = true;
            this.group.add(slab);
        }
    }

    _addLaneStripes(axis, start, end, orientation) {
        const stripeMat = new THREE.MeshBasicMaterial({ color: 0xE8C440 });
        const dashLen = 3.0, gapLen = 4.5;
        let p = start + 2;
        while (p < end - 2) {
            const stripe = new THREE.Mesh(
                new THREE.PlaneGeometry(0.16, dashLen),
                stripeMat
            );
            stripe.rotation.x = -Math.PI / 2;
            if (orientation === 'NS') {
                stripe.position.set(axis, this.localHeight(axis, p + dashLen/2) + 0.08, p + dashLen/2);
            } else {
                stripe.rotation.z = Math.PI / 2;
                stripe.position.set(p + dashLen/2, this.localHeight(p + dashLen/2, axis) + 0.08, axis);
            }
            stripe.userData.noCollision = true;
            this.group.add(stripe);
            p += dashLen + gapLen;
        }
    }

    // ========================================================
    //  SIDEWALKS
    // ========================================================
    createSidewalks() {
        const S = this.NS_STREETS, E = this.EW_STREETS;
        const half = this.worldSize / 2 - 40;
        const swMat = this.mat.concrete;

        // Sidewalks run along both sides of every street
        for (const [, x] of Object.entries(S)) {
            for (const side of [-1, 1]) {
                const inner = side * this.ROAD_HALFWIDTH;
                const outer = side * (this.ROAD_HALFWIDTH + this.SIDEWALK_WIDTH);
                this._layFlatRect(
                    x + Math.min(inner, outer), -half,
                    x + Math.max(inner, outer), half,
                    swMat
                );
            }
        }
        for (const [, z] of Object.entries(E)) {
            for (const side of [-1, 1]) {
                const inner = side * this.ROAD_HALFWIDTH;
                const outer = side * (this.ROAD_HALFWIDTH + this.SIDEWALK_WIDTH);
                this._layFlatRect(
                    -half, z + Math.min(inner, outer),
                    half, z + Math.max(inner, outer),
                    swMat
                );
            }
        }
    }

    _layFlatRect(x1, z1, x2, z2, material, yOffset = 0.06) {
        const cx = (x1 + x2) / 2, cz = (z1 + z2) / 2;
        const w = Math.abs(x2 - x1), d = Math.abs(z2 - z1);
        // Sub-divide so the plane follows terrain subtly
        const longAxis = Math.max(w, d);
        const segCount = Math.max(1, Math.ceil(longAxis / 40));
        const isNS = d > w;
        for (let i = 0; i < segCount; i++) {
            const t = (i + 0.5) / segCount;
            let scx, scz, sw, sd;
            if (isNS) {
                scx = cx; scz = z1 + d * t;
                sw = w;   sd = d / segCount + 0.1;
            } else {
                scx = x1 + w * t; scz = cz;
                sw = w / segCount + 0.1; sd = d;
            }
            const slab = new THREE.Mesh(
                new THREE.PlaneGeometry(sw, sd), material
            );
            slab.rotation.x = -Math.PI / 2;
            slab.position.set(scx, this.localHeight(scx, scz) + yOffset, scz);
            slab.userData.noCollision = true;
            slab.receiveShadow = true;
            this.group.add(slab);
        }
    }

    createCrosswalks() {
        const S = this.NS_STREETS, E = this.EW_STREETS;
        const stripeMat = new THREE.MeshBasicMaterial({ color: 0xDCDCD0 });
        // At every intersection, zebra stripes on all four approaches
        for (const [, x] of Object.entries(S)) {
            for (const [, z] of Object.entries(E)) {
                this._addCrosswalk(x, z, 'NS', stripeMat);
                this._addCrosswalk(x, z, 'EW', stripeMat);
            }
        }
    }

    _addCrosswalk(cx, cz, direction, mat) {
        // direction = 'NS' → crossing a N-S road (stripes run E-W)
        // direction = 'EW' → crossing an E-W road (stripes run N-S)
        const stripeW = 0.5, gap = 0.5;
        const n = 6;
        const offDir = direction === 'NS' ? 'x' : 'z';
        const spanOff = this.ROAD_HALFWIDTH + this.SIDEWALK_WIDTH * 0.4;
        for (let side of [-1, 1]) {
            for (let i = 0; i < n; i++) {
                const t = (i - (n-1)/2) * (stripeW + gap);
                const stripe = new THREE.Mesh(
                    new THREE.PlaneGeometry(stripeW, 2.6), mat
                );
                stripe.rotation.x = -Math.PI / 2;
                let sx, sz;
                if (direction === 'NS') {
                    sx = cx + t;
                    sz = cz + side * spanOff;
                } else {
                    stripe.rotation.z = Math.PI / 2;
                    sx = cx + side * spanOff;
                    sz = cz + t;
                }
                stripe.position.set(sx, this.localHeight(sx, sz) + 0.07, sz);
                stripe.userData.noCollision = true;
                this.group.add(stripe);
            }
        }
    }

    // ========================================================
    //  STATE STREET PROMENADE — pedestrianised central blocks
    // ========================================================
    createStateStreetPromenade() {
        // Five blocks of pedestrian promenade on State — from Figueroa
        // to Ortega. Replace the asphalt with a decorative tile-pattern
        // paving. Add planter beds, palms in the middle, string lights.
        const zStart = this.EW_STREETS.ANAPAMU + 40;
        const zEnd = this.EW_STREETS.ORTEGA + 40;
        const paveMat = new THREE.MeshStandardMaterial({
            color: 0xCEB995, roughness: 0.9
        });

        // Base pavement
        this._layFlatRect(
            -this.ROAD_HALFWIDTH - 0.4, zStart,
            this.ROAD_HALFWIDTH + 0.4, zEnd,
            paveMat, 0.05
        );

        // Decorative tile strip down the middle
        const accentMat = new THREE.MeshStandardMaterial({
            color: 0xB24A32, roughness: 0.85
        });
        const accentMat2 = new THREE.MeshStandardMaterial({
            color: 0x3A5B70, roughness: 0.85
        });
        for (let z = zStart + 5; z < zEnd - 2; z += 3) {
            const useAlt = Math.floor(z) % 9 < 3;
            const tile = new THREE.Mesh(
                new THREE.PlaneGeometry(1.4, 0.8),
                useAlt ? accentMat2 : accentMat
            );
            tile.rotation.x = -Math.PI / 2;
            tile.position.set(0, this.localHeight(0, z) + 0.07, z);
            tile.userData.noCollision = true;
            this.group.add(tile);
        }

        // Central planter beds with palms, every 30 m
        const planterMat = new THREE.MeshStandardMaterial({
            color: 0xC6B089, roughness: 0.85
        });
        for (let z = zStart + 15; z < zEnd - 10; z += 30) {
            // Raised stone planter box
            const planter = new THREE.Mesh(
                new THREE.BoxGeometry(5, 0.7, 2.4), planterMat
            );
            planter.position.set(0, this.localHeight(0, z) + 0.35, z);
            planter.castShadow = true;
            this.group.add(planter);
            // Palm at centre
            const palm = this._buildFanPalm(8 + Math.random() * 3);
            palm.position.set(0, this.localHeight(0, z) + 0.7, z);
            palm.rotation.y = Math.random() * Math.PI;
            this.group.add(palm);
            // Flowers on each end
            for (const sx of [-1.8, 1.8]) {
                const flower = new THREE.Mesh(
                    new THREE.SphereGeometry(0.5, 7, 5),
                    this.bougPool[(Math.floor(z / 30)) % 4]
                );
                flower.scale.y = 0.5;
                flower.position.set(sx, this.localHeight(sx, z) + 0.95, z);
                this.group.add(flower);
            }
        }

        // Outdoor café seating on the east sidewalk near Figueroa
        this._addCafeSeating(+this.ROAD_HALFWIDTH + this.SIDEWALK_WIDTH * 0.4, zStart + 20, 6);
        this._addCafeSeating(-this.ROAD_HALFWIDTH - this.SIDEWALK_WIDTH * 0.4, zStart + 60, 4);
        this._addCafeSeating(+this.ROAD_HALFWIDTH + this.SIDEWALK_WIDTH * 0.4, zStart + 140, 5);
    }

    _addCafeSeating(centerX, centerZ, count) {
        const woodMat = this.mat.darkWood;
        const umbrellaColors = [0xE8C440, 0xCC5A3A, 0x3A7BA8, 0x9E6FAF];
        for (let i = 0; i < count; i++) {
            const px = centerX;
            const pz = centerZ + i * 3.5;
            const tbl = new THREE.Group();
            // Table
            const top = new THREE.Mesh(
                new THREE.CylinderGeometry(0.45, 0.45, 0.06, 14), woodMat
            );
            top.position.y = 0.7;
            tbl.add(top);
            const stem = new THREE.Mesh(
                new THREE.CylinderGeometry(0.04, 0.04, 0.7, 6), this.mat.wrought
            );
            stem.position.y = 0.35;
            tbl.add(stem);
            const foot = new THREE.Mesh(
                new THREE.CylinderGeometry(0.3, 0.35, 0.05, 10), this.mat.wrought
            );
            foot.position.y = 0.03;
            tbl.add(foot);
            // Two chairs
            for (const sx of [-0.7, 0.7]) {
                const chair = new THREE.Mesh(
                    new THREE.BoxGeometry(0.38, 0.06, 0.38),
                    woodMat
                );
                chair.position.set(sx, 0.48, 0);
                tbl.add(chair);
                const back = new THREE.Mesh(
                    new THREE.BoxGeometry(0.38, 0.45, 0.05),
                    woodMat
                );
                back.position.set(sx, 0.72, -0.17 * Math.sign(sx));
                tbl.add(back);
            }
            // Umbrella
            const umColor = umbrellaColors[i % umbrellaColors.length];
            const umbrellaMat = new THREE.MeshStandardMaterial({
                color: umColor, roughness: 0.85, side: THREE.DoubleSide
            });
            const umbrella = new THREE.Mesh(
                new THREE.ConeGeometry(1.3, 0.7, 8),
                umbrellaMat
            );
            umbrella.position.y = 2.0;
            tbl.add(umbrella);
            const pole = new THREE.Mesh(
                new THREE.CylinderGeometry(0.03, 0.03, 1.8, 6), this.mat.wrought
            );
            pole.position.y = 1.2;
            tbl.add(pole);

            tbl.position.set(px, this.localHeight(px, pz), pz);
            tbl.rotation.y = Math.random() * 0.6;
            this.group.add(tbl);
        }
    }

    // ========================================================
    //  BLOCK FILL — generic Spanish Colonial buildings
    // ========================================================
    createBlockFill() {
        const S = this.NS_STREETS, E = this.EW_STREETS;
        const nsX = Object.values(S).sort((a, b) => a - b);
        const ewZ = Object.values(E).sort((a, b) => a - b);

        // For each block (x interval × z interval), fill with buildings
        // unless the block is reserved for a landmark.
        const reserved = this._reservedBlocks();

        for (let i = 0; i < nsX.length - 1; i++) {
            for (let j = 0; j < ewZ.length - 1; j++) {
                const x1 = nsX[i] + this.ROAD_HALFWIDTH + this.SIDEWALK_WIDTH;
                const x2 = nsX[i+1] - this.ROAD_HALFWIDTH - this.SIDEWALK_WIDTH;
                const z1 = ewZ[j] + this.ROAD_HALFWIDTH + this.SIDEWALK_WIDTH;
                const z2 = ewZ[j+1] - this.ROAD_HALFWIDTH - this.SIDEWALK_WIDTH;
                if (x2 - x1 < 20 || z2 - z1 < 20) continue;

                // Cabrillo-adjacent strip → skip (beach handles it)
                if (ewZ[j+1] > this.BEACH_Z_START) continue;

                const blockKey = `${i}:${j}`;
                if (reserved.has(blockKey)) continue;

                this._fillBlock(x1, z1, x2, z2);
            }
        }
    }

    _reservedBlocks() {
        // Map of (NS-street-index, EW-street-index) that we build by hand.
        // NS index order: DE_LA_VINA(0), CHAPALA(1), STATE(2), ANACAPA(3),
        //                 SANTA_BARBARA(4), GARDEN(5)
        // EW index order: SOLA(0), VICTORIA(1), ANAPAMU(2), FIGUEROA(3),
        //                 CARRILLO(4), CANON_PERDIDO(5), DE_LA_GUERRA(6),
        //                 ORTEGA(7), COTA(8), HALEY(9), GUTIERREZ(10),
        //                 YANONALI(11), CABRILLO(12)
        return new Set([
            // Courthouse block: Anacapa-SB × Victoria-Anapamu
            '3:1',
            // Arlington / Museum of Art: State-Anacapa × Victoria-Anapamu
            '2:1',
            // La Arcada: Chapala-State × Victoria-Anapamu
            '1:1',
            // Public Library: Anacapa-SB × Anapamu-Figueroa (share block with courthouse annex)
            '3:2',
            // Granada Theatre: State-Anacapa × Figueroa-Carrillo
            '2:3',
            // El Paseo arcade: State-Anacapa × Carrillo-Canon Perdido
            '2:4',
            // Paseo Nuevo mall: Chapala-State × Canon Perdido-De la Guerra
            '1:5',
            // Paseo Nuevo south half: Chapala-State × De la Guerra-Ortega
            '1:6',
            // de la Guerra Plaza: State-Anacapa × De la Guerra-Ortega
            '2:6',
            // Funk Zone East of downtown: SantaBarbara-Garden × Gutierrez-Yanonali
            '4:10'
        ]);
    }

    _fillBlock(x1, z1, x2, z2) {
        // Divide the block footprint into 1-3 buildings along the long axis.
        // Small gaps between for alleys / courtyards.
        const blockW = x2 - x1;
        const blockD = z2 - z1;
        const longDir = blockW > blockD ? 'x' : 'z';
        const longLen = Math.max(blockW, blockD);
        const buildingCount = longLen > 110 ? 3 : (longLen > 65 ? 2 : 1);

        for (let b = 0; b < buildingCount; b++) {
            const t0 = b / buildingCount + 0.02;
            const t1 = (b + 1) / buildingCount - 0.02;
            let bx1, bx2, bz1, bz2;
            if (longDir === 'x') {
                bx1 = x1 + blockW * t0;
                bx2 = x1 + blockW * t1;
                bz1 = z1;
                bz2 = z2;
            } else {
                bx1 = x1;
                bx2 = x2;
                bz1 = z1 + blockD * t0;
                bz2 = z1 + blockD * t1;
            }
            this._buildSpanishColonial(bx1, bz1, bx2, bz2);
        }
    }

    // Build one Spanish Colonial Revival storefront/midrise
    _buildSpanishColonial(x1, z1, x2, z2) {
        const cx = (x1 + x2) / 2;
        const cz = (z1 + z2) / 2;
        const w = x2 - x1;
        const d = z2 - z1;
        const stories = 2 + (Math.random() < 0.35 ? 1 : 0); // mostly 2-story
        const storyH = 3.6;
        const H = stories * storyH;

        const g = new THREE.Group();
        const stucco = this.stuccoPool[Math.floor(Math.random() * this.stuccoPool.length)];
        const roof = this.roofPool[Math.floor(Math.random() * this.roofPool.length)];

        // Foundation plinth (slightly darker)
        const plinth = new THREE.Mesh(
            new THREE.BoxGeometry(w, 0.3, d),
            this.mat.sandstone
        );
        plinth.position.y = 0.15;
        plinth.receiveShadow = true;
        g.add(plinth);

        // Body
        const body = new THREE.Mesh(
            new THREE.BoxGeometry(w, H, d),
            stucco
        );
        body.position.y = 0.3 + H / 2;
        body.castShadow = true;
        body.receiveShadow = true;
        g.add(body);

        // Red tile hip roof (four triangular faces on a trapezoidal hip)
        this._addHipTileRoof(g, w, d, H + 0.3, roof);

        // Windows — upper stories, arched on first story
        const faceZp = +d/2;
        const faceZn = -d/2;
        const faceXp = +w/2;
        const faceXn = -w/2;

        // Choose which face is "front" — the one facing the street (the
        // face with largest dimension is typically along the street)
        const frontFace = w > d ? 'north' : 'east';
        // Add windows to all four facades, more on the front one
        this._addFacadeWindows(g, 'n', w, H, faceZn, faceXn, faceXp, frontFace === 'north', stucco);
        this._addFacadeWindows(g, 's', w, H, faceZp, faceXn, faceXp, false, stucco);
        this._addFacadeWindows(g, 'e', d, H, faceXp, faceZn, faceZp, frontFace === 'east', stucco);
        this._addFacadeWindows(g, 'w', d, H, faceXn, faceZn, faceZp, false, stucco);

        // Rooftop penthouse / chimney accent (sometimes)
        if (Math.random() < 0.4) {
            const chimney = new THREE.Mesh(
                new THREE.BoxGeometry(1.2, 1.2, 1.2),
                stucco
            );
            const cxOff = (Math.random() - 0.5) * w * 0.5;
            const czOff = (Math.random() - 0.5) * d * 0.5;
            chimney.position.set(cxOff, 0.3 + H + 1.2, czOff);
            g.add(chimney);
            const cap = new THREE.Mesh(
                new THREE.BoxGeometry(1.4, 0.15, 1.4),
                roof
            );
            cap.position.set(cxOff, 0.3 + H + 1.8, czOff);
            g.add(cap);
        }

        // Optional wrought-iron balcony on the front face, story 2
        if (stories >= 2 && Math.random() < 0.5) {
            const balconyW = Math.min(w, d) * 0.5;
            const balcony = this._buildWroughtBalcony(balconyW);
            if (frontFace === 'north') {
                balcony.position.set(
                    (Math.random() - 0.5) * (w - balconyW - 0.6),
                    0.3 + storyH,
                    -d/2 - 0.3
                );
            } else {
                balcony.rotation.y = -Math.PI / 2;
                balcony.position.set(
                    w/2 + 0.3,
                    0.3 + storyH,
                    (Math.random() - 0.5) * (d - balconyW - 0.6)
                );
            }
            g.add(balcony);
        }

        // Bougainvillea creeping up the side facade (sometimes)
        if (Math.random() < 0.45) {
            const boug = new THREE.Mesh(
                new THREE.SphereGeometry(1.2, 9, 6),
                this.bougPool[Math.floor(Math.random() * this.bougPool.length)]
            );
            boug.scale.set(1.6, 2.0, 0.4);
            const side = Math.random() < 0.5 ? 'east' : 'west';
            if (side === 'east') boug.position.set(w/2 + 0.1, 2.2, (Math.random() - 0.5) * d * 0.6);
            else                 boug.position.set(-w/2 - 0.1, 2.2, (Math.random() - 0.5) * d * 0.6);
            g.add(boug);
        }

        g.position.set(cx, this.localHeight(cx, cz), cz);
        this.group.add(g);
    }

    // Hip roof: the classic red-tile pyramid common to SB
    _addHipTileRoof(g, w, d, baseY, roofMat) {
        const peakY = Math.min(w, d) * 0.22;
        const eaveOverhang = 0.5;
        const wE = w + eaveOverhang * 2;
        const dE = d + eaveOverhang * 2;

        // Use four triangles meeting at a central ridge
        // For w > d we get a rectangular ridge; for w == d a pyramid.
        const ridgeLen = Math.abs(w - d);
        const ridgeAxis = w > d ? 'x' : 'z';
        const hLen = ridgeAxis === 'x' ? ridgeLen : ridgeLen;

        // Simple approach: construct from 4 trapezoidal/triangular faces as BufferGeometries
        const geom = new THREE.BufferGeometry();
        const hw = wE / 2, hd = dE / 2;
        // Ridge endpoints
        let r1, r2;
        if (ridgeAxis === 'x') {
            r1 = [-hLen/2, baseY + peakY, 0];
            r2 = [ hLen/2, baseY + peakY, 0];
        } else {
            r1 = [0, baseY + peakY, -hLen/2];
            r2 = [0, baseY + peakY,  hLen/2];
        }
        // Eave corners
        const c_nw = [-hw, baseY, -hd];
        const c_ne = [ hw, baseY, -hd];
        const c_se = [ hw, baseY,  hd];
        const c_sw = [-hw, baseY,  hd];

        // Tris: For ridge along X, hip faces are:
        //   north: c_nw, r1, r2, c_ne  (trapezoid → 2 tris)
        //   south: c_sw, c_se, r2, r1  (trapezoid)
        //   east:  c_ne, r2, c_se       (triangle)
        //   west:  c_nw, c_sw, r1       (triangle)
        const tris = [];
        const addTri = (a, b, c) => { tris.push(...a, ...b, ...c); };
        const addQuad = (a, b, c, d) => { addTri(a, b, c); addTri(a, c, d); };

        if (ridgeAxis === 'x') {
            addQuad(c_nw, r1, r2, c_ne);    // N slope
            addQuad(c_se, r2, r1, c_sw);    // S slope (reverse winding)
            addTri(c_ne, r2, c_se);         // E hip
            addTri(c_sw, r1, c_nw);         // W hip
        } else {
            addQuad(c_ne, r1, r2, c_se);    // E slope
            addQuad(c_sw, r2, r1, c_nw);    // W slope
            addTri(c_nw, r1, c_ne);         // N hip
            addTri(c_se, r2, c_sw);         // S hip
        }

        const verts = new Float32Array(tris);
        geom.setAttribute('position', new THREE.BufferAttribute(verts, 3));
        geom.computeVertexNormals();
        const roof = new THREE.Mesh(geom, roofMat);
        roof.castShadow = true;
        roof.receiveShadow = true;
        g.add(roof);

        // Eave rim — a thin box just inside the eave line for depth
        const rim = new THREE.Mesh(
            new THREE.BoxGeometry(wE, 0.2, dE),
            roofMat
        );
        rim.position.y = baseY + 0.1;
        rim.castShadow = true;
        g.add(rim);
    }

    _addFacadeWindows(g, side, facadeLen, facadeH, faceOffset, spanStart, spanEnd, isFront, stucco) {
        const winMat = this.mat.glassDark;
        const trimMat = this.mat.darkWood;
        const storyH = 3.6;
        const nStories = Math.floor(facadeH / storyH);
        const winCount = Math.max(2, Math.floor(facadeLen / 4.5));

        for (let s = 0; s < nStories; s++) {
            const yBase = 0.3 + s * storyH + 0.6;
            for (let w = 0; w < winCount; w++) {
                const t = (w + 0.5) / winCount;
                const pos = spanStart + (spanEnd - spanStart) * t;

                // Frame dimensions
                const winW = 1.1, winH = (s === 0 && isFront) ? 2.4 : 1.5;
                const dirSign = (side === 'n' || side === 'w') ? -1 : 1;

                let wx, wz, rotY = 0;
                if (side === 'n' || side === 's') {
                    wx = pos;
                    wz = faceOffset + dirSign * 0.02;
                } else {
                    wx = faceOffset + dirSign * 0.02;
                    wz = pos;
                    rotY = Math.PI / 2;
                }

                // Glass pane
                const glass = new THREE.Mesh(
                    new THREE.BoxGeometry(winW, winH, 0.06),
                    winMat
                );
                glass.position.set(wx, yBase + winH/2, wz);
                glass.rotation.y = rotY;
                g.add(glass);

                // Wooden frame
                const frame = new THREE.Mesh(
                    new THREE.BoxGeometry(winW + 0.2, winH + 0.2, 0.1),
                    trimMat
                );
                frame.position.set(
                    wx - dirSign * 0.02,
                    yBase + winH/2,
                    wz - (side === 'e' || side === 'w' ? dirSign * 0.02 : 0)
                );
                frame.rotation.y = rotY;
                g.add(frame);

                // If ground story + front, add an arched top
                if (s === 0 && isFront) {
                    const arch = new THREE.Mesh(
                        new THREE.CylinderGeometry(winW/2 + 0.1, winW/2 + 0.1, 0.1, 14, 1, false, 0, Math.PI),
                        trimMat
                    );
                    arch.rotation.z = Math.PI / 2;
                    arch.rotation.y = rotY + Math.PI / 2;
                    if (side === 'n' || side === 's') {
                        arch.position.set(wx, yBase + winH + 0.05, wz - dirSign * 0.05);
                    } else {
                        arch.position.set(wx - dirSign * 0.05, yBase + winH + 0.05, wz);
                    }
                    g.add(arch);
                }
            }
        }

        // Front-door for front facades (ground story)
        if (isFront) {
            const doorW = 1.4, doorH = 2.4;
            const doorPos = spanStart + (spanEnd - spanStart) * (0.3 + Math.random() * 0.4);
            const dirSign = (side === 'n' || side === 'w') ? -1 : 1;
            let dx, dz, rotY = 0;
            if (side === 'n' || side === 's') {
                dx = doorPos;
                dz = faceOffset + dirSign * 0.03;
            } else {
                dx = faceOffset + dirSign * 0.03;
                dz = doorPos;
                rotY = Math.PI / 2;
            }
            const door = new THREE.Mesh(
                new THREE.BoxGeometry(doorW, doorH, 0.1),
                this.mat.darkWood
            );
            door.position.set(dx, 0.3 + doorH/2, dz);
            door.rotation.y = rotY;
            g.add(door);
        }
    }

    _buildWroughtBalcony(w) {
        const g = new THREE.Group();
        // Floor
        const deck = new THREE.Mesh(
            new THREE.BoxGeometry(w, 0.1, 0.5),
            this.mat.sandstone
        );
        deck.position.set(0, 0.05, -0.25);
        g.add(deck);
        // Railing top/bottom
        for (const y of [0.35, 0.9]) {
            const rail = new THREE.Mesh(
                new THREE.BoxGeometry(w, 0.04, 0.04),
                this.mat.wrought
            );
            rail.position.set(0, y, -0.5);
            g.add(rail);
        }
        // Balusters
        const n = Math.max(4, Math.floor(w / 0.2));
        for (let i = 0; i < n; i++) {
            const t = (i + 0.5) / n;
            const bx = -w/2 + w * t;
            const baluster = new THREE.Mesh(
                new THREE.BoxGeometry(0.03, 0.55, 0.03),
                this.mat.wrought
            );
            baluster.position.set(bx, 0.65, -0.5);
            g.add(baluster);
        }
        return g;
    }

    // ========================================================
    //  SANTA BARBARA COURTHOUSE (1929) — iconic U-shape + tower
    // ========================================================
    createCourthouse() {
        const courthouse = new THREE.Group();
        courthouse.userData = {
            name: 'Santa Barbara Courthouse',
            description: '1929 Spanish-Moorish landmark. Climb El Mirador for the best view in town.',
            isInteractable: true,
            type: 'landmark',
            interactionType: 'Visit'
        };

        const stucco = this.mat.stuccoWhite;
        const roof = this.mat.tileRed;
        const trim = this.mat.sandstone;

        // U-shape: three wings enclosing a sunken garden on the south
        // Layout centred at (+80, 0) [Anacapa & Anapamu]
        // West wing (2-story, with El Mirador tower on SW corner)
        const westW = 10, westD = 50, westH = 9;
        const wWing = new THREE.Mesh(
            new THREE.BoxGeometry(westW, westH, westD), stucco
        );
        wWing.position.set(-18, westH/2, 0);
        wWing.castShadow = true; wWing.receiveShadow = true;
        courthouse.add(wWing);
        this._addHipTileRoof(courthouse, westW, westD, westH, roof);

        // North wing (main entry on south face, 3 stories)
        const nW = 56, nD = 12, nH = 12;
        const nWing = new THREE.Mesh(
            new THREE.BoxGeometry(nW, nH, nD), stucco
        );
        nWing.position.set(0, nH/2, -28);
        nWing.castShadow = true; nWing.receiveShadow = true;
        courthouse.add(nWing);
        const nRoof = new THREE.Mesh(
            new THREE.BoxGeometry(nW + 1, 0.4, nD + 1), roof
        );
        nRoof.position.set(0, nH + 0.2, -28);
        courthouse.add(nRoof);

        // East wing (2-story)
        const eW = 10, eD = 50, eH = 9;
        const eWing = new THREE.Mesh(
            new THREE.BoxGeometry(eW, eH, eD), stucco
        );
        eWing.position.set(18, eH/2, 0);
        eWing.castShadow = true; eWing.receiveShadow = true;
        courthouse.add(eWing);
        const eRoof = new THREE.Mesh(
            new THREE.BoxGeometry(eW + 1, 0.4, eD + 1), roof
        );
        eRoof.position.set(18, eH + 0.2, 0);
        courthouse.add(eRoof);
        const wRoofCap = eRoof.clone();
        wRoofCap.position.set(-18, eH + 0.2, 0);
        courthouse.add(wRoofCap);

        // Arched main entry — a tall arched opening in the N wing centre
        const archMat = trim;
        const archW = 5, archH = 7;
        const archPortal = new THREE.Mesh(
            new THREE.BoxGeometry(archW, archH, 0.6),
            archMat
        );
        archPortal.position.set(0, archH/2, -28 + nD/2 + 0.3);
        courthouse.add(archPortal);
        const archTop = new THREE.Mesh(
            new THREE.CylinderGeometry(archW/2 + 0.3, archW/2 + 0.3, 0.6, 16, 1, false, 0, Math.PI),
            archMat
        );
        archTop.rotation.z = Math.PI / 2;
        archTop.rotation.y = Math.PI;
        archTop.position.set(0, archH, -28 + nD/2 + 0.3);
        courthouse.add(archTop);

        // Loggia of arches on south face of north wing, facing the garden
        for (let i = 0; i < 7; i++) {
            const px = -24 + i * 8;
            const col = new THREE.Mesh(
                new THREE.CylinderGeometry(0.6, 0.6, 5, 10), trim
            );
            col.position.set(px, 2.5, -28 + nD/2 + 0.4);
            courthouse.add(col);
            if (i < 6) {
                const arch = new THREE.Mesh(
                    new THREE.CylinderGeometry(3.5, 3.5, 0.5, 14, 1, false, 0, Math.PI),
                    trim
                );
                arch.rotation.z = Math.PI / 2;
                arch.rotation.y = Math.PI;
                arch.position.set(px + 4, 5.2, -28 + nD/2 + 0.4);
                courthouse.add(arch);
            }
        }

        // Arched windows on all wings (decorative)
        for (let i = 0; i < 6; i++) {
            const py = 3 + (i >= 3 ? 3.5 : 0);
            const pz = -22 + (i % 3) * 16;
            const winE = new THREE.Mesh(
                new THREE.BoxGeometry(0.2, 2.2, 1.5),
                this.mat.glassDark
            );
            winE.position.set(18 + eW/2 + 0.01, py + 1.1, pz);
            courthouse.add(winE);
            const winW = winE.clone();
            winW.position.set(-18 - westW/2 - 0.01, py + 1.1, pz);
            courthouse.add(winW);
        }

        // El Mirador bell tower — tall, stepped, pyramidal red-tile cap.
        const tower = new THREE.Group();
        // Base section
        const bSize = 9, bH = 16;
        const base = new THREE.Mesh(
            new THREE.BoxGeometry(bSize, bH, bSize), stucco
        );
        base.position.y = bH/2;
        base.castShadow = true; base.receiveShadow = true;
        tower.add(base);
        // Mid step
        const mSize = 7.5, mH = 6;
        const mid = new THREE.Mesh(
            new THREE.BoxGeometry(mSize, mH, mSize), stucco
        );
        mid.position.y = bH + mH/2;
        tower.add(mid);
        // Bell chamber (arched openings on each side)
        const bcSize = 6.5, bcH = 4.5;
        const bc = new THREE.Mesh(
            new THREE.BoxGeometry(bcSize, bcH, bcSize), stucco
        );
        bc.position.y = bH + mH + bcH/2;
        tower.add(bc);
        // Arched openings on all 4 sides of bell chamber
        for (let i = 0; i < 4; i++) {
            const open = new THREE.Mesh(
                new THREE.BoxGeometry(2.2, 3.2, 0.7),
                new THREE.MeshStandardMaterial({ color: 0x15202C, roughness: 0.9 })
            );
            open.position.y = bH + mH + bcH/2;
            open.rotation.y = i * Math.PI / 2;
            if (i === 0)   open.position.set(0, open.position.y, bcSize/2 + 0.2);
            if (i === 1)   open.position.set(bcSize/2 + 0.2, open.position.y, 0);
            if (i === 2)   open.position.set(0, open.position.y, -bcSize/2 - 0.2);
            if (i === 3)   open.position.set(-bcSize/2 - 0.2, open.position.y, 0);
            tower.add(open);
        }
        // Tile cap — stepped pyramid
        const capGeo = new THREE.ConeGeometry(bcSize/2 * Math.SQRT2 + 0.3, 4.5, 4);
        const cap = new THREE.Mesh(capGeo, roof);
        cap.rotation.y = Math.PI / 4;
        cap.position.y = bH + mH + bcH + 2.25;
        cap.castShadow = true;
        tower.add(cap);
        // Finial
        const finial = new THREE.Mesh(
            new THREE.CylinderGeometry(0.12, 0.12, 2.5, 6),
            this.mat.wrought
        );
        finial.position.y = bH + mH + bcH + 4.5 + 1.25;
        tower.add(finial);
        const orb = new THREE.Mesh(
            new THREE.SphereGeometry(0.35, 12, 8),
            this.mat.wrought
        );
        orb.position.y = bH + mH + bcH + 4.5 + 2.5;
        tower.add(orb);

        tower.position.set(-18 - westW/2 + 2, 0, -15);
        courthouse.add(tower);

        // ----- Sunken garden (south of U) -----
        // The 'Mirador Gardens' — a grass lawn with palms and paths
        const lawnMat = new THREE.MeshStandardMaterial({
            color: 0x4A7A35, roughness: 0.92
        });
        const garden = new THREE.Mesh(
            new THREE.BoxGeometry(52, 0.2, 40),
            lawnMat
        );
        garden.position.set(0, 0.1, 12);
        garden.receiveShadow = true;
        garden.userData.noCollision = true;
        courthouse.add(garden);

        // Paths criss-cross lawn
        const pathMat = this.mat.concrete;
        const pathNS = new THREE.Mesh(
            new THREE.BoxGeometry(3, 0.22, 40), pathMat
        );
        pathNS.position.set(0, 0.11, 12);
        pathNS.userData.noCollision = true;
        courthouse.add(pathNS);
        const pathEW = new THREE.Mesh(
            new THREE.BoxGeometry(52, 0.22, 3), pathMat
        );
        pathEW.position.set(0, 0.11, 12);
        pathEW.userData.noCollision = true;
        courthouse.add(pathEW);

        // Central fountain
        const fountain = this._buildFountain(2.8);
        fountain.position.set(0, 0, 12);
        courthouse.add(fountain);

        // Palms scattered in the garden
        for (let i = 0; i < 10; i++) {
            const px = -22 + Math.random() * 44;
            const pz = -2 + Math.random() * 28;
            if (Math.abs(px) < 4 && Math.abs(pz - 12) < 4) continue;  // skip fountain
            if (Math.abs(px) < 2 || Math.abs(pz - 12) < 2) continue;  // skip paths
            const palm = this._buildFanPalm(10 + Math.random() * 4);
            palm.position.set(px, 0.2, pz);
            palm.rotation.y = Math.random() * Math.PI;
            courthouse.add(palm);
        }

        // Wrought-iron gate on the north side (back)
        const gate = new THREE.Mesh(
            new THREE.BoxGeometry(10, 4, 0.2), this.mat.wrought
        );
        gate.position.set(0, 2, -34.2);
        courthouse.add(gate);

        courthouse.position.set(80, this.localHeight(80, 0), 0);
        this.group.add(courthouse);
    }

    _buildFountain(radius) {
        const f = new THREE.Group();
        // Outer basin
        const basin = new THREE.Mesh(
            new THREE.CylinderGeometry(radius, radius, 0.8, 24),
            this.mat.sandstone
        );
        basin.position.y = 0.4;
        basin.castShadow = true;
        f.add(basin);
        // Water surface
        const water = new THREE.Mesh(
            new THREE.CircleGeometry(radius - 0.25, 24),
            this.mat.water
        );
        water.rotation.x = -Math.PI / 2;
        water.position.y = 0.75;
        f.add(water);
        // Central column
        const col = new THREE.Mesh(
            new THREE.CylinderGeometry(0.3, 0.4, 1.8, 10),
            this.mat.sandstone
        );
        col.position.y = 1.6;
        f.add(col);
        // Upper basin
        const upper = new THREE.Mesh(
            new THREE.CylinderGeometry(0.9, 0.9, 0.3, 16),
            this.mat.sandstone
        );
        upper.position.y = 2.5;
        f.add(upper);
        // Decorative tiles around the basin
        for (let i = 0; i < 12; i++) {
            const a = (i / 12) * Math.PI * 2;
            const tile = new THREE.Mesh(
                new THREE.BoxGeometry(0.35, 0.3, 0.05),
                i % 2 ? new THREE.MeshStandardMaterial({ color: 0x3A5B70, roughness: 0.9 })
                      : new THREE.MeshStandardMaterial({ color: 0xE8C440, roughness: 0.9 })
            );
            tile.position.set(Math.cos(a) * (radius + 0.03), 0.3, Math.sin(a) * (radius + 0.03));
            tile.rotation.y = -a + Math.PI/2;
            f.add(tile);
        }
        return f;
    }

    // ========================================================
    //  ARLINGTON THEATRE — 1931 Spanish Colonial, bell tower
    // ========================================================
    createArlingtonTheatre() {
        const arl = new THREE.Group();
        arl.userData = {
            name: 'Arlington Theatre',
            description: '1931 Spanish Colonial Revival movie palace. 2018 seats inside.',
            isInteractable: true,
            type: 'landmark',
            interactionType: 'Enter'
        };

        const stucco = this.mat.stuccoWhite;
        const roof = this.mat.tileRed;

        // Main auditorium block — set back from State Street
        const W = 28, D = 40, H = 14;
        const body = new THREE.Mesh(
            new THREE.BoxGeometry(W, H, D), stucco
        );
        body.position.set(0, H/2, -D/2 - 6);
        body.castShadow = true;
        body.receiveShadow = true;
        arl.add(body);
        const roofCap = new THREE.Mesh(
            new THREE.BoxGeometry(W + 1, 0.5, D + 1), roof
        );
        roofCap.position.set(0, H + 0.25, -D/2 - 6);
        arl.add(roofCap);

        // Forecourt — Moorish plaza with fountain (street-facing)
        const plazaMat = new THREE.MeshStandardMaterial({
            color: 0xC9B08F, roughness: 0.88
        });
        const plaza = new THREE.Mesh(
            new THREE.BoxGeometry(W, 0.15, 12),
            plazaMat
        );
        plaza.position.set(0, 0.08, -6);
        plaza.userData.noCollision = true;
        arl.add(plaza);

        // Front lobby wing (street-facing, 2-story) with blade sign
        const lobbyW = 18, lobbyD = 8, lobbyH = 8;
        const lobby = new THREE.Mesh(
            new THREE.BoxGeometry(lobbyW, lobbyH, lobbyD), stucco
        );
        lobby.position.set(0, lobbyH/2, 6);
        lobby.castShadow = true;
        arl.add(lobby);
        const lobbyRoof = new THREE.Mesh(
            new THREE.BoxGeometry(lobbyW + 0.6, 0.4, lobbyD + 0.6), roof
        );
        lobbyRoof.position.set(0, lobbyH + 0.2, 6);
        arl.add(lobbyRoof);

        // Marquee — under lobby second floor
        const marqueeMat = new THREE.MeshStandardMaterial({
            color: 0xE8C440, emissive: 0x302A12, roughness: 0.5
        });
        const marquee = new THREE.Mesh(
            new THREE.BoxGeometry(lobbyW + 2, 1.4, 0.6),
            marqueeMat
        );
        marquee.position.set(0, 4.8, 6 + lobbyD/2 + 0.5);
        arl.add(marquee);
        const marqueeText = new THREE.Mesh(
            new THREE.PlaneGeometry(lobbyW + 1.6, 1.0),
            new THREE.MeshBasicMaterial({
                map: this._makeSignTexture('ARLINGTON', 0x9B1B2A),
                transparent: true
            })
        );
        marqueeText.position.set(0, 4.8, 6 + lobbyD/2 + 0.85);
        arl.add(marqueeText);

        // Vertical blade sign — tall neon-style "ARLINGTON" on the tower side
        const bladeSign = new THREE.Mesh(
            new THREE.BoxGeometry(1.6, 10, 0.4),
            new THREE.MeshStandardMaterial({
                color: 0xB22A3F, emissive: 0x6B1020, emissiveIntensity: 0.7
            })
        );
        bladeSign.position.set(-lobbyW/2 - 1.2, lobbyH + 4, 6 + lobbyD/2 + 0.5);
        arl.add(bladeSign);
        const bladeText = new THREE.Mesh(
            new THREE.PlaneGeometry(1.5, 9.5),
            new THREE.MeshBasicMaterial({
                map: this._makeVerticalSignTexture('ARLINGTON'),
                transparent: true
            })
        );
        bladeText.position.set(-lobbyW/2 - 1.2, lobbyH + 4, 6 + lobbyD/2 + 0.72);
        arl.add(bladeText);

        // Bell tower — tall, prominent, off to the right
        const tower = this._buildBellTower(6, 20, stucco, roof);
        tower.position.set(lobbyW/2 + 4, 0, 3);
        arl.add(tower);

        // Arched entrance doors on front of lobby
        for (const sx of [-5, 0, 5]) {
            const door = new THREE.Mesh(
                new THREE.BoxGeometry(2, 3.2, 0.2),
                this.mat.darkWood
            );
            door.position.set(sx, 1.6, 6 + lobbyD/2 + 0.1);
            arl.add(door);
            const archTop = new THREE.Mesh(
                new THREE.CylinderGeometry(1.1, 1.1, 0.2, 14, 1, false, 0, Math.PI),
                this.mat.sandstone
            );
            archTop.rotation.z = Math.PI / 2;
            archTop.rotation.y = Math.PI;
            archTop.position.set(sx, 3.3, 6 + lobbyD/2 + 0.1);
            arl.add(archTop);
        }

        // Forecourt fountain
        const fnt = this._buildFountain(1.4);
        fnt.position.set(0, 0.08, -2);
        arl.add(fnt);

        arl.position.set(0, this.localHeight(0, -30), -30);
        this.group.add(arl);
    }

    _buildBellTower(baseSize, totalH, stucco, roof) {
        const t = new THREE.Group();
        const bodyH = totalH * 0.72;
        const body = new THREE.Mesh(
            new THREE.BoxGeometry(baseSize, bodyH, baseSize), stucco
        );
        body.position.y = bodyH / 2;
        body.castShadow = true;
        t.add(body);

        // Bell chamber
        const bcH = totalH * 0.14;
        const bcSize = baseSize * 0.85;
        const bc = new THREE.Mesh(
            new THREE.BoxGeometry(bcSize, bcH, bcSize), stucco
        );
        bc.position.y = bodyH + bcH/2;
        t.add(bc);
        for (let i = 0; i < 4; i++) {
            const op = new THREE.Mesh(
                new THREE.BoxGeometry(bcSize * 0.45, bcH * 0.7, 0.3),
                new THREE.MeshStandardMaterial({ color: 0x1A2028, roughness: 0.9 })
            );
            op.position.y = bodyH + bcH/2;
            op.rotation.y = i * Math.PI / 2;
            if (i === 0) op.position.z = bcSize/2 + 0.1;
            if (i === 1) op.position.x = bcSize/2 + 0.1;
            if (i === 2) op.position.z = -bcSize/2 - 0.1;
            if (i === 3) op.position.x = -bcSize/2 - 0.1;
            t.add(op);
        }

        // Tiled cap
        const cap = new THREE.Mesh(
            new THREE.ConeGeometry(bcSize/2 * Math.SQRT2 + 0.3, totalH * 0.14, 4),
            roof
        );
        cap.rotation.y = Math.PI / 4;
        cap.position.y = bodyH + bcH + (totalH * 0.14)/2;
        t.add(cap);
        return t;
    }

    // ========================================================
    //  GRANADA THEATRE — 8 stories of Spanish Colonial
    // ========================================================
    createGranadaTheatre() {
        const g = new THREE.Group();
        g.userData = {
            name: 'Granada Theatre',
            description: '1924 Spanish Colonial performing arts venue — at 8 stories it was SB\'s tallest building for decades.',
            isInteractable: true,
            type: 'landmark',
            interactionType: 'Enter'
        };

        const stucco = this.mat.stuccoCream;
        const roof = this.mat.tileRedDark;

        // Tower block — 8 stories
        const W = 22, D = 30, H = 28;
        const body = new THREE.Mesh(
            new THREE.BoxGeometry(W, H, D), stucco
        );
        body.position.set(0, H/2, 0);
        body.castShadow = true;
        body.receiveShadow = true;
        g.add(body);
        const roofCap = new THREE.Mesh(
            new THREE.BoxGeometry(W + 0.6, 0.4, D + 0.6), roof
        );
        roofCap.position.y = H + 0.2;
        g.add(roofCap);

        // Street-facing lobby — projecting forward
        const lobbyW = 16, lobbyD = 6, lobbyH = 7;
        const lobby = new THREE.Mesh(
            new THREE.BoxGeometry(lobbyW, lobbyH, lobbyD), stucco
        );
        lobby.position.set(0, lobbyH/2, D/2 + lobbyD/2);
        g.add(lobby);

        // Marquee over entrance
        const marq = new THREE.Mesh(
            new THREE.BoxGeometry(lobbyW + 1.5, 1.2, 0.6),
            new THREE.MeshStandardMaterial({
                color: 0xE8C440, emissive: 0x302A12, roughness: 0.5
            })
        );
        marq.position.set(0, 5.0, D/2 + lobbyD + 0.3);
        g.add(marq);
        const marqText = new THREE.Mesh(
            new THREE.PlaneGeometry(lobbyW, 0.9),
            new THREE.MeshBasicMaterial({
                map: this._makeSignTexture('THE GRANADA', 0x3A2010),
                transparent: true
            })
        );
        marqText.position.set(0, 5.0, D/2 + lobbyD + 0.61);
        g.add(marqText);

        // Vertical sign — rising up the front of the tower
        const blade = new THREE.Mesh(
            new THREE.BoxGeometry(1.8, 18, 0.4),
            new THREE.MeshStandardMaterial({
                color: 0xB22A3F, emissive: 0x6B1020, emissiveIntensity: 0.8
            })
        );
        blade.position.set(W/2 - 3, 15, D/2 + 0.1);
        g.add(blade);
        const bladeText = new THREE.Mesh(
            new THREE.PlaneGeometry(1.7, 17.5),
            new THREE.MeshBasicMaterial({
                map: this._makeVerticalSignTexture('GRANADA'),
                transparent: true
            })
        );
        bladeText.position.set(W/2 - 3, 15, D/2 + 0.32);
        g.add(bladeText);

        // Arched entrance doors
        for (const sx of [-4, 0, 4]) {
            const door = new THREE.Mesh(
                new THREE.BoxGeometry(2, 3, 0.15), this.mat.darkWood
            );
            door.position.set(sx, 1.5, D/2 + lobbyD + 0.08);
            g.add(door);
            const tp = new THREE.Mesh(
                new THREE.CylinderGeometry(1.1, 1.1, 0.15, 14, 1, false, 0, Math.PI),
                this.mat.sandstone
            );
            tp.rotation.z = Math.PI / 2;
            tp.rotation.y = Math.PI;
            tp.position.set(sx, 3.1, D/2 + lobbyD + 0.08);
            g.add(tp);
        }

        // Rows of arched windows on front face (story bands)
        for (let s = 1; s < 7; s++) {
            const y = s * 3.6 + 1.2;
            for (const sx of [-8, -4, 0, 4, 8]) {
                const win = new THREE.Mesh(
                    new THREE.BoxGeometry(2.2, 2.0, 0.2),
                    this.mat.glassDark
                );
                win.position.set(sx, y, D/2 + 0.1);
                g.add(win);
            }
        }

        // Parapet/belfry at roofline — distinctive crown
        const parapet = new THREE.Mesh(
            new THREE.BoxGeometry(W + 0.6, 1.2, D + 0.6), stucco
        );
        parapet.position.y = H + 0.6;
        g.add(parapet);
        const parapetCrown = new THREE.Mesh(
            new THREE.BoxGeometry(W, 0.4, D), roof
        );
        parapetCrown.position.y = H + 1.4;
        g.add(parapetCrown);
        // Corner finials
        for (const sx of [-1, 1]) {
            for (const sz of [-1, 1]) {
                const finial = new THREE.Mesh(
                    new THREE.ConeGeometry(0.6, 2.4, 4), roof
                );
                finial.rotation.y = Math.PI / 4;
                finial.position.set(sx * (W/2 - 0.5), H + 1.7 + 1.2, sz * (D/2 - 0.5));
                g.add(finial);
            }
        }

        g.position.set(0, this.localHeight(0, 110), 110);
        this.group.add(g);
    }

    // ========================================================
    //  EL PASEO — 1922 arcaded shopping plaza with courtyard
    // ========================================================
    createElPaseo() {
        const el = new THREE.Group();
        el.userData = {
            name: 'El Paseo',
            description: '"The Street in Spain" — 1922 arcaded shopping courtyard with tile fountain.',
            isInteractable: true,
            type: 'landmark',
            interactionType: 'Wander'
        };
        const stucco = this.mat.stuccoCream;
        const roof = this.mat.tileRed;

        // L-shape: N/S wing + E wing, enclosing a courtyard on west/south
        const W1 = 10, D1 = 40, H1 = 7;
        const wingN = new THREE.Mesh(
            new THREE.BoxGeometry(W1, H1, D1), stucco
        );
        wingN.position.set(6, H1/2, 0);
        wingN.castShadow = true;
        el.add(wingN);
        const roofN = new THREE.Mesh(
            new THREE.BoxGeometry(W1 + 0.6, 0.3, D1 + 0.6), roof
        );
        roofN.position.set(6, H1 + 0.15, 0);
        el.add(roofN);

        // E wing
        const W2 = 20, D2 = 10, H2 = 7;
        const wingE = new THREE.Mesh(
            new THREE.BoxGeometry(W2, H2, D2), stucco
        );
        wingE.position.set(-4, H2/2, 14);
        wingE.castShadow = true;
        el.add(wingE);
        const roofE = new THREE.Mesh(
            new THREE.BoxGeometry(W2 + 0.6, 0.3, D2 + 0.6), roof
        );
        roofE.position.set(-4, H2 + 0.15, 14);
        el.add(roofE);

        // Arcade colonnade along wing-N's courtyard face
        for (let i = 0; i < 9; i++) {
            const pz = -18 + i * 4.5;
            const col = new THREE.Mesh(
                new THREE.CylinderGeometry(0.35, 0.35, 4, 10),
                this.mat.sandstone
            );
            col.position.set(0.5, 2, pz);
            el.add(col);
            if (i < 8) {
                const arch = new THREE.Mesh(
                    new THREE.CylinderGeometry(2.15, 2.15, 0.4, 14, 1, false, 0, Math.PI),
                    this.mat.sandstone
                );
                arch.rotation.z = Math.PI / 2;
                arch.rotation.y = Math.PI;
                arch.position.set(0.5, 4.2, pz + 2.25);
                el.add(arch);
            }
        }
        // Upper arcade (2nd story loggia)
        for (let i = 0; i < 5; i++) {
            const pz = -16 + i * 8;
            const col = new THREE.Mesh(
                new THREE.CylinderGeometry(0.28, 0.28, 2.8, 8),
                this.mat.sandstone
            );
            col.position.set(0.5, 5.5, pz);
            el.add(col);
        }

        // Courtyard floor — tiled
        const court = new THREE.Mesh(
            new THREE.BoxGeometry(22, 0.15, 30),
            new THREE.MeshStandardMaterial({ color: 0xC9B08F, roughness: 0.9 })
        );
        court.position.set(-8, 0.08, 0);
        court.receiveShadow = true;
        court.userData.noCollision = true;
        el.add(court);
        // Checker tile accent
        for (let i = 0; i < 12; i++) {
            for (let j = 0; j < 14; j++) {
                if ((i + j) % 3 !== 0) continue;
                const mini = new THREE.Mesh(
                    new THREE.PlaneGeometry(1.2, 1.2),
                    i % 2 ? new THREE.MeshStandardMaterial({ color: 0xB24A32, roughness: 0.9 })
                          : new THREE.MeshStandardMaterial({ color: 0x3A5B70, roughness: 0.9 })
                );
                mini.rotation.x = -Math.PI / 2;
                mini.position.set(-16 + i * 1.6, 0.17, -12 + j * 1.9);
                mini.userData.noCollision = true;
                el.add(mini);
            }
        }

        // Central fountain
        const fnt = this._buildFountain(1.8);
        fnt.position.set(-8, 0.1, 0);
        el.add(fnt);

        // Bougainvillea climbing some arcade columns
        for (let i = 0; i < 3; i++) {
            const boug = new THREE.Mesh(
                new THREE.SphereGeometry(1.2, 9, 6),
                this.bougPool[i % this.bougPool.length]
            );
            boug.scale.set(0.8, 1.4, 0.5);
            boug.position.set(0.5, 4.5, -14 + i * 12);
            el.add(boug);
        }

        // Seating in courtyard
        for (let i = 0; i < 3; i++) {
            const bench = this._buildBench(1.6);
            bench.position.set(-15, 0.1, -8 + i * 8);
            bench.rotation.y = Math.PI / 2;
            el.add(bench);
        }

        el.position.set(35, this.localHeight(35, 190), 190);
        el.rotation.y = Math.PI / 2;
        this.group.add(el);
    }

    _buildBench(width) {
        const b = new THREE.Group();
        const seat = new THREE.Mesh(
            new THREE.BoxGeometry(width, 0.08, 0.45),
            this.mat.darkWood
        );
        seat.position.y = 0.5;
        b.add(seat);
        const back = new THREE.Mesh(
            new THREE.BoxGeometry(width, 0.5, 0.08),
            this.mat.darkWood
        );
        back.position.set(0, 0.8, -0.2);
        b.add(back);
        for (const sx of [-width/2 + 0.1, width/2 - 0.1]) {
            const leg = new THREE.Mesh(
                new THREE.BoxGeometry(0.1, 0.5, 0.4), this.mat.wrought
            );
            leg.position.set(sx, 0.25, 0);
            b.add(leg);
        }
        return b;
    }

    // ========================================================
    //  PASEO NUEVO — outdoor shopping mall
    // ========================================================
    createPaseoNuevo() {
        const pn = new THREE.Group();
        pn.userData = {
            name: 'Paseo Nuevo',
            description: 'Open-air shopping mall — Nordstrom anchor + palm-lined courtyards.',
            isInteractable: true,
            type: 'landmark',
            interactionType: 'Shop'
        };

        const stucco = this.mat.stuccoYellow;
        const roof = this.mat.tileRed;

        // Spans two blocks: Chapala-State × Canon Perdido to Ortega
        // Four bar-building wings around two courtyards
        const wings = [
            { cx: -55, cy: 9/2, cz:  40, W: 50, D: 12, H: 9 },   // north bar
            { cx: -55, cy: 9/2, cz: 100, W: 50, D: 12, H: 9 },   // south bar
            { cx: -10, cy: 9/2, cz:  70, W: 15, D: 80, H: 9 },   // east divider
            { cx:-100, cy: 9/2, cz:  70, W: 15, D: 80, H: 9 }    // west divider
        ];
        for (const w of wings) {
            const b = new THREE.Mesh(
                new THREE.BoxGeometry(w.W, w.H, w.D), stucco
            );
            b.position.set(w.cx, w.cy, w.cz);
            b.castShadow = true; b.receiveShadow = true;
            pn.add(b);
            const rf = new THREE.Mesh(
                new THREE.BoxGeometry(w.W + 0.6, 0.35, w.D + 0.6), roof
            );
            rf.position.set(w.cx, w.H + 0.18, w.cz);
            pn.add(rf);
        }

        // Nordstrom anchor block (3-story) at the west end
        const nordW = 40, nordD = 35, nordH = 14;
        const nord = new THREE.Mesh(
            new THREE.BoxGeometry(nordW, nordH, nordD), this.mat.stuccoCream
        );
        nord.position.set(-125, nordH/2, 150);
        nord.castShadow = true;
        pn.add(nord);
        const nordRoof = new THREE.Mesh(
            new THREE.BoxGeometry(nordW + 0.8, 0.4, nordD + 0.8), roof
        );
        nordRoof.position.set(-125, nordH + 0.2, 150);
        pn.add(nordRoof);
        // Nordstrom name on front
        const nordSign = new THREE.Mesh(
            new THREE.PlaneGeometry(16, 2),
            new THREE.MeshBasicMaterial({
                map: this._makeSignTexture('NORDSTROM', 0x1A1A1A),
                transparent: true
            })
        );
        nordSign.position.set(-125, 11, 150 + nordD/2 + 0.1);
        pn.add(nordSign);

        // Courtyards — paved with palms
        const courtyardMat = new THREE.MeshStandardMaterial({
            color: 0xCEB995, roughness: 0.9
        });
        const court1 = new THREE.Mesh(
            new THREE.BoxGeometry(40, 0.15, 45),
            courtyardMat
        );
        court1.position.set(-55, 0.08, 70);
        court1.userData.noCollision = true;
        pn.add(court1);

        // Palms in courtyards
        for (let i = 0; i < 6; i++) {
            const px = -75 + (i % 3) * 20;
            const pz = 55 + Math.floor(i / 3) * 30;
            const palm = this._buildFanPalm(8 + Math.random() * 2);
            palm.position.set(px, 0.15, pz);
            palm.rotation.y = Math.random() * Math.PI;
            pn.add(palm);
        }

        // Second floor balcony fronts
        for (let i = 0; i < 8; i++) {
            const pz = 35 + i * 10;
            const bal = this._buildWroughtBalcony(2);
            bal.position.set(-46, 4.5, pz);
            pn.add(bal);
            const bal2 = this._buildWroughtBalcony(2);
            bal2.position.set(-63, 4.5, pz);
            bal2.rotation.y = Math.PI;
            pn.add(bal2);
        }

        // Decorative fountains in courtyards
        const f1 = this._buildFountain(1.6);
        f1.position.set(-55, 0.1, 70);
        pn.add(f1);

        pn.position.set(0, this.localHeight(-50, 250), 0);
        this.group.add(pn);
    }

    // ========================================================
    //  LA ARCADA — small arcaded passage with fountain + shops
    // ========================================================
    createLaArcada() {
        const la = new THREE.Group();
        la.userData = {
            name: 'La Arcada',
            description: '1920s Spanish passage with fountains, whimsical bronze sculptures, and mural.',
            isInteractable: true,
            type: 'landmark',
            interactionType: 'Wander'
        };

        const stucco = this.mat.stuccoSalmon;
        const roof = this.mat.tileRedLight;

        // Flanking walls creating a passage
        const wallW = 3, wallD = 30, wallH = 8;
        for (const sx of [-7, 7]) {
            const wall = new THREE.Mesh(
                new THREE.BoxGeometry(wallW, wallH, wallD), stucco
            );
            wall.position.set(sx, wallH/2, 0);
            wall.castShadow = true;
            la.add(wall);
            const rf = new THREE.Mesh(
                new THREE.BoxGeometry(wallW + 0.4, 0.3, wallD + 0.4), roof
            );
            rf.position.set(sx, wallH + 0.15, 0);
            la.add(rf);
        }

        // Archway at the entrance (street side)
        const entryArch = new THREE.Mesh(
            new THREE.TorusGeometry(5, 0.6, 10, 20, Math.PI),
            this.mat.sandstone
        );
        entryArch.rotation.z = Math.PI;
        entryArch.rotation.x = Math.PI / 2;
        entryArch.position.set(0, 5, -15);
        la.add(entryArch);

        // Passage floor — terracotta tile
        const floor = new THREE.Mesh(
            new THREE.BoxGeometry(12, 0.15, 30),
            new THREE.MeshStandardMaterial({ color: 0xB24A32, roughness: 0.9 })
        );
        floor.position.set(0, 0.08, 0);
        floor.userData.noCollision = true;
        la.add(floor);

        // Small central fountain
        const fnt = this._buildFountain(1.2);
        fnt.position.set(0, 0.1, 0);
        la.add(fnt);

        // Bronze "whimsical" turtle sculpture by the fountain
        const turtle = new THREE.Group();
        const shell = new THREE.Mesh(
            new THREE.SphereGeometry(0.4, 12, 6),
            new THREE.MeshStandardMaterial({
                color: 0x6B4A28, roughness: 0.4, metalness: 0.7
            })
        );
        shell.scale.y = 0.5;
        shell.position.y = 0.25;
        turtle.add(shell);
        const head = new THREE.Mesh(
            new THREE.SphereGeometry(0.14, 8, 6),
            new THREE.MeshStandardMaterial({
                color: 0x6B4A28, roughness: 0.4, metalness: 0.7
            })
        );
        head.position.set(0.45, 0.25, 0);
        turtle.add(head);
        turtle.position.set(2, 0.1, 2.4);
        la.add(turtle);

        // Wrought iron lamps on walls
        for (const sz of [-8, 0, 8]) {
            for (const sx of [-5.2, 5.2]) {
                const lamp = this._buildWallLamp();
                lamp.position.set(sx, 5, sz);
                lamp.rotation.y = sx > 0 ? Math.PI / 2 : -Math.PI / 2;
                la.add(lamp);
            }
        }

        la.position.set(-35, this.localHeight(-35, -30), -30);
        la.rotation.y = Math.PI / 2;
        this.group.add(la);
    }

    _buildWallLamp() {
        const lamp = new THREE.Group();
        const arm = new THREE.Mesh(
            new THREE.BoxGeometry(0.6, 0.06, 0.06),
            this.mat.wrought
        );
        arm.position.x = 0.3;
        lamp.add(arm);
        const shade = new THREE.Mesh(
            new THREE.CylinderGeometry(0.18, 0.12, 0.3, 8),
            this.mat.wrought
        );
        shade.position.set(0.6, -0.15, 0);
        lamp.add(shade);
        const bulb = new THREE.Mesh(
            new THREE.SphereGeometry(0.1, 8, 6),
            new THREE.MeshStandardMaterial({
                color: 0xFFE0A0, emissive: 0xFFB060, emissiveIntensity: 0.9
            })
        );
        bulb.position.set(0.6, -0.15, 0);
        lamp.add(bulb);
        return lamp;
    }

    // ========================================================
    //  SB MUSEUM OF ART — Spanish-style, neoclassical front
    // ========================================================
    createMuseumOfArt() {
        const m = new THREE.Group();
        m.userData = {
            name: 'Santa Barbara Museum of Art',
            description: 'Intimate regional museum with strong California & Asian collections.',
            isInteractable: true,
            type: 'landmark',
            interactionType: 'Enter'
        };

        const stucco = this.mat.stuccoWhite;
        const roof = this.mat.tileRedDark;
        const W = 24, D = 20, H = 10;
        const body = new THREE.Mesh(
            new THREE.BoxGeometry(W, H, D), stucco
        );
        body.position.y = H/2;
        body.castShadow = true;
        m.add(body);
        const roofCap = new THREE.Mesh(
            new THREE.BoxGeometry(W + 0.5, 0.4, D + 0.5), roof
        );
        roofCap.position.y = H + 0.2;
        m.add(roofCap);

        // Neoclassical front: 4 tall columns, classical pediment
        for (const sx of [-8, -2.7, 2.7, 8]) {
            const col = new THREE.Mesh(
                new THREE.CylinderGeometry(0.5, 0.5, 7.5, 14),
                this.mat.sandstone
            );
            col.position.set(sx, 3.75, D/2 + 1);
            m.add(col);
        }
        // Pediment
        const ped = new THREE.Mesh(
            new THREE.BoxGeometry(W + 0.5, 1.8, 2.5),
            this.mat.sandstone
        );
        ped.position.set(0, 8.5, D/2 + 1);
        m.add(ped);

        // Entry steps
        for (let i = 0; i < 3; i++) {
            const step = new THREE.Mesh(
                new THREE.BoxGeometry(W - 4 - i * 1, 0.2, 1 + i * 0.3),
                this.mat.sandstone
            );
            step.position.set(0, 0.1 + i * 0.2, D/2 + 1.5 + i * 0.3);
            m.add(step);
        }

        // Banners advertising current show
        for (const sx of [-6, 6]) {
            const banner = new THREE.Mesh(
                new THREE.PlaneGeometry(1.2, 3.5),
                new THREE.MeshStandardMaterial({
                    color: 0x9B1B2A, roughness: 0.8, side: THREE.DoubleSide
                })
            );
            banner.position.set(sx, 5, D/2 + 1.2);
            m.add(banner);
        }

        m.position.set(0, this.localHeight(0, -50), -50);
        this.group.add(m);
    }

    // ========================================================
    //  PUBLIC LIBRARY — low Spanish Colonial block
    // ========================================================
    createPublicLibrary() {
        const lib = new THREE.Group();
        lib.userData = {
            name: 'Santa Barbara Public Library',
            description: 'Main branch — stately 1917 Spanish Colonial beside the courthouse.',
            isInteractable: true,
            type: 'landmark',
            interactionType: 'Enter'
        };
        const stucco = this.mat.stuccoCream;
        const roof = this.mat.tileRed;
        const W = 30, D = 24, H = 8;
        const body = new THREE.Mesh(
            new THREE.BoxGeometry(W, H, D), stucco
        );
        body.position.y = H/2;
        body.castShadow = true;
        lib.add(body);
        const rcap = new THREE.Mesh(
            new THREE.BoxGeometry(W + 0.6, 0.4, D + 0.6), roof
        );
        rcap.position.y = H + 0.2;
        lib.add(rcap);

        // Central arched portal
        const archPortal = new THREE.Mesh(
            new THREE.BoxGeometry(4, 5.5, 0.4), this.mat.sandstone
        );
        archPortal.position.set(0, 2.75, D/2 + 0.2);
        lib.add(archPortal);
        const atop = new THREE.Mesh(
            new THREE.CylinderGeometry(2.2, 2.2, 0.4, 14, 1, false, 0, Math.PI),
            this.mat.sandstone
        );
        atop.rotation.z = Math.PI / 2;
        atop.rotation.y = Math.PI;
        atop.position.set(0, 5.5, D/2 + 0.2);
        lib.add(atop);

        // Sign
        const sign = new THREE.Mesh(
            new THREE.PlaneGeometry(7, 0.9),
            new THREE.MeshBasicMaterial({
                map: this._makeSignTexture('PUBLIC LIBRARY', 0x1F1109),
                transparent: true
            })
        );
        sign.position.set(0, 6.8, D/2 + 0.21);
        lib.add(sign);

        lib.position.set(30, this.localHeight(30, 0), 0);
        this.group.add(lib);
    }

    // ========================================================
    //  DE LA GUERRA PLAZA — small historic plaza with fountain
    // ========================================================
    createDeLaGuerraPlaza() {
        const p = new THREE.Group();
        p.userData = {
            name: 'de la Guerra Plaza',
            description: 'The original 1820s town plaza — still the civic heart.',
            type: 'landmark'
        };

        const plazaMat = new THREE.MeshStandardMaterial({
            color: 0xC9B08F, roughness: 0.9
        });
        const plaza = new THREE.Mesh(
            new THREE.BoxGeometry(50, 0.15, 60), plazaMat
        );
        plaza.position.y = 0.08;
        plaza.receiveShadow = true;
        plaza.userData.noCollision = true;
        p.add(plaza);

        // Central lawn
        const lawn = new THREE.Mesh(
            new THREE.BoxGeometry(30, 0.2, 40),
            new THREE.MeshStandardMaterial({ color: 0x4A7A35, roughness: 0.92 })
        );
        lawn.position.y = 0.12;
        lawn.userData.noCollision = true;
        p.add(lawn);

        // Fountain
        const f = this._buildFountain(2.2);
        f.position.y = 0.15;
        p.add(f);

        // Old adobe-style city hall on north side
        const hallW = 42, hallD = 10, hallH = 7;
        const hall = new THREE.Mesh(
            new THREE.BoxGeometry(hallW, hallH, hallD),
            this.mat.stuccoCream
        );
        hall.position.set(0, hallH/2, -35);
        hall.castShadow = true;
        p.add(hall);
        const hallRoof = new THREE.Mesh(
            new THREE.BoxGeometry(hallW + 0.5, 0.3, hallD + 0.5),
            this.mat.tileRed
        );
        hallRoof.position.set(0, hallH + 0.15, -35);
        p.add(hallRoof);
        // Flag pole with CA bear flag
        const flagpole = new THREE.Mesh(
            new THREE.CylinderGeometry(0.08, 0.08, 12, 6),
            this.mat.wrought
        );
        flagpole.position.set(0, 6, 25);
        p.add(flagpole);
        const flag = new THREE.Mesh(
            new THREE.PlaneGeometry(2.4, 1.5),
            new THREE.MeshStandardMaterial({
                color: 0xEFEFE8, roughness: 0.8, side: THREE.DoubleSide
            })
        );
        flag.position.set(1.2, 10, 25);
        p.add(flag);

        // Trees around edges
        for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2;
            const palm = this._buildFanPalm(9);
            palm.position.set(Math.cos(a) * 18, 0.1, Math.sin(a) * 22 + 0);
            p.add(palm);
        }

        p.position.set(35, this.localHeight(35, 340), 340);
        this.group.add(p);
    }

    // ========================================================
    //  FUNK ZONE — industrial-style converted warehouses
    // ========================================================
    createFunkZone() {
        const fz = new THREE.Group();
        fz.userData = {
            name: 'Funk Zone',
            description: 'Former industrial district → artist lofts, tasting rooms, street art.',
            type: 'district'
        };

        // Concrete/brick warehouses — more angular than Spanish Colonial
        const brickMat = new THREE.MeshStandardMaterial({
            color: 0x8B4436, roughness: 0.92
        });
        const concMat = new THREE.MeshStandardMaterial({
            color: 0x9E9684, roughness: 0.92
        });
        const metalRoof = new THREE.MeshStandardMaterial({
            color: 0x4A4A4A, roughness: 0.7, metalness: 0.5
        });

        const buildings = [
            { cx: 0,  cz: 0,   W: 18, D: 14, H: 6, mat: brickMat },
            { cx: 22, cz: 0,   W: 16, D: 14, H: 6.5, mat: concMat },
            { cx: 0,  cz: 18,  W: 18, D: 12, H: 7, mat: brickMat },
            { cx: 22, cz: 18,  W: 16, D: 12, H: 5.5, mat: concMat },
            { cx: 44, cz: 8,   W: 20, D: 24, H: 8, mat: brickMat }
        ];
        for (const b of buildings) {
            const body = new THREE.Mesh(
                new THREE.BoxGeometry(b.W, b.H, b.D), b.mat
            );
            body.position.set(b.cx, b.H/2, b.cz);
            body.castShadow = true; body.receiveShadow = true;
            fz.add(body);
            const rf = new THREE.Mesh(
                new THREE.BoxGeometry(b.W + 0.3, 0.2, b.D + 0.3), metalRoof
            );
            rf.position.set(b.cx, b.H + 0.1, b.cz);
            fz.add(rf);
            // Large industrial windows
            for (let s = 0; s < 2; s++) {
                for (let i = 0; i < Math.floor(b.W / 3); i++) {
                    const wx = b.cx - b.W/2 + 1.5 + i * 3;
                    const win = new THREE.Mesh(
                        new THREE.BoxGeometry(2.2, 1.6, 0.1),
                        this.mat.glassDark
                    );
                    win.position.set(wx, 1.5 + s * 3, b.cz + b.D/2 + 0.05);
                    fz.add(win);
                }
            }
        }

        // Mural on end wall — big colorful abstract
        const muralMat = new THREE.MeshBasicMaterial({
            map: this._makeMuralTexture()
        });
        const mural = new THREE.Mesh(
            new THREE.PlaneGeometry(18, 6),
            muralMat
        );
        mural.position.set(-9.1, 3, 0);
        mural.rotation.y = Math.PI / 2;
        fz.add(mural);

        // Outdoor wine-tasting patio at east-most building
        const patio = new THREE.Mesh(
            new THREE.BoxGeometry(14, 0.1, 10),
            new THREE.MeshStandardMaterial({ color: 0x6B4E32, roughness: 0.9 })
        );
        patio.position.set(44, 0.05, -8);
        patio.userData.noCollision = true;
        fz.add(patio);
        for (let i = 0; i < 3; i++) {
            this._addCafeSeating(44 - 4 + i * 4, -8, 1);
        }

        fz.position.set(160, this.localHeight(160, 635), 635);
        this.group.add(fz);
    }

    _makeMuralTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 512; canvas.height = 170;
        const ctx = canvas.getContext('2d');
        // Bold abstract shapes
        const colors = ['#B82A6E', '#F39C12', '#2ECC71', '#3498DB', '#E8C440', '#9B59B6'];
        ctx.fillStyle = '#F5EED3';
        ctx.fillRect(0, 0, 512, 170);
        for (let i = 0; i < 40; i++) {
            ctx.fillStyle = colors[i % colors.length];
            const x = Math.random() * 512, y = Math.random() * 170;
            const s = 20 + Math.random() * 80;
            ctx.beginPath();
            if (Math.random() < 0.4) ctx.arc(x, y, s / 2, 0, Math.PI * 2);
            else                     ctx.rect(x - s/2, y - s/4, s, s/2);
            ctx.fill();
        }
        ctx.fillStyle = '#1A1A1A';
        ctx.font = 'bold 36px "Helvetica", sans-serif';
        ctx.fillText('FUNK ZONE', 20, 50);
        const tex = new THREE.CanvasTexture(canvas);
        tex.anisotropy = 4;
        return tex;
    }

    // ========================================================
    //  BEACH + CABRILLO BOULEVARD
    // ========================================================
    createBeach() {
        // Sand strip already vertex-colored on the terrain mesh.
        // Add scattered beach elements: umbrellas, towels, a few figures
        const umColors = [0xE8C440, 0xCC5A3A, 0x3A7BA8, 0x9E6FAF, 0xEFEFE8];
        for (let i = 0; i < 22; i++) {
            const px = -350 + Math.random() * 700;
            const pz = 765 + Math.random() * 30;
            // Towel
            const towel = new THREE.Mesh(
                new THREE.PlaneGeometry(1.8, 0.9),
                new THREE.MeshStandardMaterial({
                    color: umColors[i % umColors.length], roughness: 0.9
                })
            );
            towel.rotation.x = -Math.PI / 2;
            towel.position.set(px, this.localHeight(px, pz) + 0.04, pz);
            towel.rotation.z = Math.random() * Math.PI;
            towel.userData.noCollision = true;
            this.group.add(towel);
            // Sometimes an umbrella
            if (Math.random() < 0.5) {
                const ugroup = new THREE.Group();
                const pole = new THREE.Mesh(
                    new THREE.CylinderGeometry(0.03, 0.03, 1.8, 6), this.mat.wrought
                );
                pole.position.y = 0.9;
                ugroup.add(pole);
                const canopy = new THREE.Mesh(
                    new THREE.ConeGeometry(1, 0.5, 8),
                    new THREE.MeshStandardMaterial({
                        color: umColors[(i + 2) % umColors.length],
                        roughness: 0.85, side: THREE.DoubleSide
                    })
                );
                canopy.position.y = 1.85;
                ugroup.add(canopy);
                ugroup.position.set(px + 0.6, this.localHeight(px, pz), pz);
                this.group.add(ugroup);
            }
        }

        // Palm-lined pathway just north of the sand (on Cabrillo inner side)
        for (let i = 0; i < 30; i++) {
            const px = -400 + i * 30;
            const palm = this._buildFanPalm(10 + Math.random() * 3);
            palm.position.set(px, this.localHeight(px, this.EW_STREETS.CABRILLO - 14), this.EW_STREETS.CABRILLO - 14);
            palm.rotation.y = Math.random() * Math.PI;
            this.group.add(palm);
        }
    }

    createCabrilloBlvd() {
        const E = this.EW_STREETS;
        const half = this.worldSize / 2 - 40;
        // 4-lane boulevard with palm median
        // Two asphalt lanes on each side of a narrow median
        const laneW = 12;
        const medianW = 3;
        const zCenter = E.CABRILLO;
        // North lanes
        this._layRoadRect(-half, zCenter - medianW/2 - laneW, half, zCenter - medianW/2);
        // South lanes
        this._layRoadRect(-half, zCenter + medianW/2, half, zCenter + medianW/2 + laneW);
        // Median (grass + palms)
        const medianMat = new THREE.MeshStandardMaterial({
            color: 0x4A7A35, roughness: 0.92
        });
        this._layFlatRect(
            -half, zCenter - medianW/2,
            half, zCenter + medianW/2,
            medianMat, 0.08
        );
        // Palms in median
        for (let x = -half + 30; x < half - 30; x += 25) {
            const palm = this._buildFanPalm(11 + Math.random() * 2);
            palm.position.set(x, this.localHeight(x, zCenter), zCenter);
            palm.rotation.y = Math.random() * Math.PI;
            this.group.add(palm);
        }
        // Lane stripes
        this._addLaneStripes(zCenter - medianW/2 - laneW/2, -half + 10, half - 10, 'EW');
        this._addLaneStripes(zCenter + medianW/2 + laneW/2, -half + 10, half - 10, 'EW');
    }

    // ========================================================
    //  STEARNS WHARF — 120m pier into the Pacific
    // ========================================================
    createStearnsWharf() {
        const wharf = new THREE.Group();
        wharf.userData = {
            name: 'Stearns Wharf',
            description: '1872 wooden pier. Oldest working wharf in California.',
            isInteractable: true,
            type: 'landmark',
            interactionType: 'Walk'
        };

        const plankMat = this.mat.wharfPlank;
        const plankMatD = this.mat.wharfPlankD;
        const pileMat = this.mat.wharfPile;

        const startZ = this.WHARF_START_Z;
        const endZ = this.WHARF_END_Z;
        const wharfX = 20;
        const halfW = 9;
        const deckY = 2.5;
        const segCount = 14;

        // Deck in segments (alternating planks for visual texture)
        for (let i = 0; i < segCount; i++) {
            const t0 = i / segCount;
            const t1 = (i + 1) / segCount;
            const z0 = startZ + (endZ - startZ) * t0;
            const z1 = startZ + (endZ - startZ) * t1;
            const cz = (z0 + z1) / 2;
            const len = z1 - z0 + 0.1;

            const widen = i >= segCount - 3 ? 6 : 0;  // widen at far end

            const plank = new THREE.Mesh(
                new THREE.BoxGeometry((halfW + widen) * 2, 0.4, len),
                i % 2 ? plankMat : plankMatD
            );
            plank.position.set(wharfX, deckY, cz);
            plank.receiveShadow = true;
            wharf.add(plank);
        }

        // Pilings along both sides + center
        const pileSpacing = 12;
        for (let z = startZ - 6; z < endZ + 2; z += pileSpacing) {
            const widen = z > endZ - 25 ? 6 : 0;
            for (const xOff of [-halfW + 0.6, 0, halfW - 0.6,
                                 -halfW - widen + 0.6, halfW + widen - 0.6]) {
                if (xOff === 0 && Math.random() < 0.5) continue;
                if ((Math.abs(xOff) > halfW + 1) && widen === 0) continue;
                const pile = new THREE.Mesh(
                    new THREE.CylinderGeometry(0.3, 0.3, 4.5, 7), pileMat
                );
                pile.position.set(wharfX + xOff, 0.25, z);
                pile.castShadow = true;
                wharf.add(pile);
            }
        }

        // Railings on both long sides
        for (const side of [-1, 1]) {
            const rail = new THREE.Mesh(
                new THREE.BoxGeometry(0.08, 0.08, endZ - startZ),
                this.mat.lightWood
            );
            rail.position.set(wharfX + side * halfW, deckY + 1.1, (startZ + endZ)/2);
            wharf.add(rail);
            const railMid = rail.clone();
            railMid.position.y = deckY + 0.55;
            wharf.add(railMid);
            // Posts
            for (let z = startZ; z <= endZ; z += 4) {
                const post = new THREE.Mesh(
                    new THREE.BoxGeometry(0.1, 1.2, 0.1), this.mat.lightWood
                );
                post.position.set(wharfX + side * halfW, deckY + 0.6, z);
                wharf.add(post);
            }
        }

        // Ramp/causeway from shore up to deck
        const ramp = new THREE.Mesh(
            new THREE.BoxGeometry(halfW * 2, 0.3, 16),
            plankMatD
        );
        ramp.rotation.x = -Math.atan2(deckY, 16);
        ramp.position.set(wharfX, deckY/2, startZ - 8);
        ramp.receiveShadow = true;
        wharf.add(ramp);

        // Shops at the end
        const shopSpecs = [
            { cx: wharfX - 8, cz: endZ - 15, name: 'Sea Center', color: 0x3A7BA8 },
            { cx: wharfX,     cz: endZ - 8,  name: 'Moby Dick',  color: 0xE8C440 },
            { cx: wharfX + 8, cz: endZ - 15, name: 'Candy Co.',  color: 0xCC5A3A }
        ];
        for (const s of shopSpecs) {
            const shop = new THREE.Group();
            const body = new THREE.Mesh(
                new THREE.BoxGeometry(7, 4, 7),
                new THREE.MeshStandardMaterial({
                    color: s.color, roughness: 0.85
                })
            );
            body.position.y = 2;
            body.castShadow = true;
            shop.add(body);
            const rf = new THREE.Mesh(
                new THREE.BoxGeometry(8, 0.3, 8),
                this.mat.tileRed
            );
            rf.position.y = 4.15;
            shop.add(rf);
            const sign = new THREE.Mesh(
                new THREE.PlaneGeometry(5, 0.8),
                new THREE.MeshBasicMaterial({
                    map: this._makeSignTexture(s.name, s.color),
                    transparent: true, side: THREE.DoubleSide
                })
            );
            sign.position.set(0, 4.7, 3.6);
            shop.add(sign);
            shop.position.set(s.cx, deckY + 0.2, s.cz);
            wharf.add(shop);
        }

        // Fishermen / pedestrian figures on the deck
        for (let i = 0; i < 5; i++) {
            const fig = this._buildSimpleFigure();
            const z = startZ + 20 + Math.random() * (endZ - startZ - 30);
            const x = wharfX + (Math.random() - 0.5) * (halfW * 1.4);
            fig.position.set(x, deckY + 0.25, z);
            fig.rotation.y = Math.random() * Math.PI * 2;
            wharf.add(fig);
        }

        // Welcoming arch sign at wharf entrance
        const archPosts = [];
        for (const sx of [-halfW, halfW]) {
            const post = new THREE.Mesh(
                new THREE.BoxGeometry(0.6, 6, 0.6), this.mat.lightWood
            );
            post.position.set(wharfX + sx, 3, startZ - 1);
            wharf.add(post);
            archPosts.push(post);
        }
        const archBeam = new THREE.Mesh(
            new THREE.BoxGeometry(halfW * 2 + 1, 1.2, 0.4), this.mat.lightWood
        );
        archBeam.position.set(wharfX, 6.5, startZ - 1);
        wharf.add(archBeam);
        const archText = new THREE.Mesh(
            new THREE.PlaneGeometry(halfW * 2, 1),
            new THREE.MeshBasicMaterial({
                map: this._makeSignTexture('STEARNS WHARF', 0x3E2A1A),
                transparent: true, side: THREE.DoubleSide
            })
        );
        archText.position.set(wharfX, 6.5, startZ - 0.79);
        wharf.add(archText);

        this.group.add(wharf);
    }

    _buildSimpleFigure() {
        const g = new THREE.Group();
        const shirtColors = [0xE74C3C, 0x3498DB, 0xE8C040, 0x2ECC71, 0x8E44AD];
        const shirt = new THREE.MeshStandardMaterial({
            color: shirtColors[Math.floor(Math.random() * shirtColors.length)],
            roughness: 0.85
        });
        const skin = new THREE.MeshStandardMaterial({
            color: 0xD7A77C, roughness: 0.85
        });
        const pants = new THREE.MeshStandardMaterial({
            color: 0x2A2A2A, roughness: 0.8
        });
        const head = new THREE.Mesh(
            new THREE.SphereGeometry(0.15, 8, 6), skin
        );
        head.position.y = 1.6;
        g.add(head);
        const torso = new THREE.Mesh(
            new THREE.BoxGeometry(0.4, 0.6, 0.22), shirt
        );
        torso.position.y = 1.2;
        g.add(torso);
        const legs = new THREE.Mesh(
            new THREE.BoxGeometry(0.36, 0.7, 0.2), pants
        );
        legs.position.y = 0.55;
        g.add(legs);
        return g;
    }

    // ========================================================
    //  OCEAN — local water around the pier
    // ========================================================
    createOcean() {
        const oceanGeo = new THREE.PlaneGeometry(900, 420, 40, 20);
        const pos = oceanGeo.attributes.position;
        for (let i = 0; i < pos.count; i++) {
            const x = pos.getX(i), y = pos.getY(i);
            pos.setZ(i, Math.sin(x * 0.04) * Math.cos(y * 0.03) * 0.3);
        }
        oceanGeo.computeVertexNormals();
        const ocean = new THREE.Mesh(oceanGeo, this.mat.water);
        ocean.rotation.x = -Math.PI / 2;
        ocean.position.set(0, -2, this.BEACH_Z_END + 200);
        ocean.userData.noCollision = true;
        this.group.add(ocean);

        // Foam near the shore
        for (let i = 0; i < 20; i++) {
            const foam = new THREE.Mesh(
                new THREE.PlaneGeometry(2 + Math.random() * 5, 6 + Math.random() * 3),
                this.mat.foam
            );
            foam.rotation.x = -Math.PI / 2;
            foam.position.set(
                -400 + Math.random() * 800,
                -1.6,
                this.BEACH_Z_END + Math.random() * 20
            );
            foam.userData.noCollision = true;
            this.group.add(foam);
        }
    }

    // ========================================================
    //  HARBOR — sailboats, breakwater
    // ========================================================
    createHarbor() {
        const harbor = new THREE.Group();
        harbor.userData = {
            name: 'Santa Barbara Harbor',
            description: 'Sheltered harbor with sailboats, fishing fleet & the Maritime Museum.',
            type: 'landmark'
        };

        // Breakwater — stone berm extending into the ocean
        const bwMat = new THREE.MeshStandardMaterial({
            color: 0x706356, roughness: 0.95, flatShading: true
        });
        for (let i = 0; i < 14; i++) {
            const t = i / 13;
            const bx = -140 * (1 - t);
            const bz = 60 + t * 120;
            const chunk = new THREE.Mesh(
                new THREE.DodecahedronGeometry(3 + Math.random() * 1.5, 0), bwMat
            );
            chunk.position.set(bx, -1 + Math.random(), bz);
            chunk.rotation.set(Math.random(), Math.random(), Math.random());
            chunk.castShadow = true;
            harbor.add(chunk);
        }

        // Docks
        const dockMat = this.mat.lightWood;
        for (let row = 0; row < 3; row++) {
            const dz = -20 + row * 20;
            const dock = new THREE.Mesh(
                new THREE.BoxGeometry(80, 0.3, 3),
                dockMat
            );
            dock.position.set(0, 0.15, dz);
            dock.userData.noCollision = true;
            harbor.add(dock);

            // Sailboats along the dock
            const boatCount = 10;
            for (let i = 0; i < boatCount; i++) {
                const bx = -38 + i * 8;
                const boat = this._buildSailboat(i);
                boat.position.set(bx, 0, dz + (row % 2 ? -4 : 4));
                boat.rotation.y = (row % 2 ? Math.PI : 0) + (Math.random() - 0.5) * 0.2;
                harbor.add(boat);
            }
        }

        // Harbor water (slightly different color than open ocean)
        const harborWater = new THREE.Mesh(
            new THREE.PlaneGeometry(200, 180),
            new THREE.MeshStandardMaterial({
                color: 0x2A5870, roughness: 0.2, metalness: 0.15,
                transparent: true, opacity: 0.92
            })
        );
        harborWater.rotation.x = -Math.PI / 2;
        harborWater.position.set(0, -1.8, 10);
        harborWater.userData.noCollision = true;
        harbor.add(harborWater);

        // Maritime Museum — small building at the harbor entrance
        const mus = new THREE.Mesh(
            new THREE.BoxGeometry(14, 6, 10),
            this.mat.stuccoWhite
        );
        mus.position.set(60, 3, -28);
        mus.castShadow = true;
        harbor.add(mus);
        const musRoof = new THREE.Mesh(
            new THREE.BoxGeometry(15, 0.3, 11), this.mat.tileRed
        );
        musRoof.position.set(60, 6.2, -28);
        harbor.add(musRoof);
        const musSign = new THREE.Mesh(
            new THREE.PlaneGeometry(5, 0.7),
            new THREE.MeshBasicMaterial({
                map: this._makeSignTexture('Maritime Museum', 0x1A1A1A),
                transparent: true
            })
        );
        musSign.position.set(60, 4.8, -28 + 5.01);
        harbor.add(musSign);

        harbor.position.set(-400, this.localHeight(-400, 700), 700);
        this.group.add(harbor);
    }

    _buildSailboat(seed) {
        const b = new THREE.Group();
        const hullColors = [0xEFEFE8, 0xEFEFE8, 0xEFEFE8, 0xE8C440, 0x3A7BA8, 0xC43D3D];
        const hullMat = new THREE.MeshStandardMaterial({
            color: hullColors[seed % hullColors.length], roughness: 0.55
        });
        // Hull (elongated half-ellipsoid)
        const hull = new THREE.Mesh(
            new THREE.CylinderGeometry(0.7, 0.3, 4.5, 12, 1, false, 0, Math.PI),
            hullMat
        );
        hull.rotation.z = Math.PI / 2;
        hull.position.y = 0.5;
        hull.scale.set(1, 1, 1.6);
        hull.castShadow = true;
        b.add(hull);
        // Deck
        const deck = new THREE.Mesh(
            new THREE.BoxGeometry(4.3, 0.1, 1.8),
            this.mat.lightWood
        );
        deck.position.y = 0.85;
        b.add(deck);
        // Cabin
        const cabin = new THREE.Mesh(
            new THREE.BoxGeometry(1.8, 0.7, 1.3),
            this.mat.stuccoWhite
        );
        cabin.position.set(0.4, 1.2, 0);
        b.add(cabin);
        // Mast
        const mastH = 7 + (seed % 3);
        const mast = new THREE.Mesh(
            new THREE.CylinderGeometry(0.06, 0.04, mastH, 6),
            this.mat.stuccoWhite
        );
        mast.position.set(-0.4, 0.85 + mastH/2, 0);
        b.add(mast);
        // Furled sail hint — pale triangle
        if (seed % 3 === 0) {
            const sailGeo = new THREE.ConeGeometry(0.2, mastH * 0.85, 6);
            const sail = new THREE.Mesh(
                sailGeo,
                new THREE.MeshStandardMaterial({
                    color: 0xEFEFE8, roughness: 0.9, side: THREE.DoubleSide
                })
            );
            sail.position.set(-0.4, 0.85 + mastH * 0.5, 0);
            b.add(sail);
        }
        return b;
    }

    // ========================================================
    //  PALMS — lining State Street, Cabrillo, State Promenade
    // ========================================================
    createStreetPalms() {
        // Palms at most intersections on sidewalks + along boulevards
        const S = this.NS_STREETS, E = this.EW_STREETS;
        const spacing = 15;
        // Along State Street (skip pedestrianised zone — handled by promenade)
        for (let z = -200; z < -30; z += spacing) {
            this._addStreetPalm(S.STATE, z);
        }
        for (let z = 410; z < this.EW_STREETS.CABRILLO; z += spacing) {
            this._addStreetPalm(S.STATE, z);
        }
        // Anacapa (courthouse side)
        for (let z = -300; z < E.CABRILLO - 40; z += spacing) {
            this._addStreetPalm(S.ANACAPA, z);
        }
        // Chapala
        for (let z = -300; z < E.CABRILLO - 40; z += spacing * 1.2) {
            this._addStreetPalm(S.CHAPALA, z);
        }
        // A thicker tropical fringe along the inside of Cabrillo (beach palms)
        for (let x = -400; x < 400; x += 18) {
            const palm = this._buildDatePalm(13 + Math.random() * 3);
            palm.position.set(x, this.localHeight(x, E.CABRILLO - 20), E.CABRILLO - 20);
            palm.rotation.y = Math.random() * Math.PI;
            this.group.add(palm);
        }
    }

    _addStreetPalm(streetX, z) {
        // Sidewalk palm — tree well just off the curb
        const side = z < 0 ? 1 : (Math.random() < 0.5 ? 1 : -1);
        const px = streetX + side * (this.ROAD_HALFWIDTH + this.SIDEWALK_WIDTH + 1);
        const palm = this._buildFanPalm(10 + Math.random() * 2);
        palm.position.set(px, this.localHeight(px, z), z);
        palm.rotation.y = Math.random() * Math.PI;
        this.group.add(palm);
    }

    // Mexican Fan Palm — thin trunk, round tufted crown
    _buildFanPalm(h) {
        const p = new THREE.Group();
        const segs = 7;
        for (let s = 0; s < segs; s++) {
            const segH = h / segs;
            const r = 0.25 - s * 0.01;
            const seg = new THREE.Mesh(
                new THREE.CylinderGeometry(Math.max(0.12, r - 0.02), Math.max(0.15, r), segH, 7),
                this.mat.palmTrunk
            );
            seg.position.y = s * segH + segH/2;
            seg.castShadow = true;
            p.add(seg);
        }
        // Crown — 12 radiating fronds
        const frondCount = 12;
        for (let f = 0; f < frondCount; f++) {
            const angle = (f / frondCount) * Math.PI * 2;
            const droop = 0.55 + Math.random() * 0.15;
            const shape = new THREE.Shape();
            shape.moveTo(0, 0);
            shape.lineTo(0.18, 0.6);
            shape.lineTo(0, 3.5);
            shape.lineTo(-0.18, 0.6);
            shape.lineTo(0, 0);
            const frond = new THREE.Mesh(
                new THREE.ShapeGeometry(shape),
                Math.random() < 0.5 ? this.mat.palmFrond : this.mat.palmFrondL
            );
            frond.position.y = h;
            frond.rotation.y = angle;
            frond.rotation.x = Math.PI / 2 - droop;
            frond.castShadow = true;
            p.add(frond);
        }
        // Fruit tuft hint
        const knob = new THREE.Mesh(
            new THREE.SphereGeometry(0.4, 8, 6), this.mat.palmTrunk
        );
        knob.position.y = h - 0.15;
        knob.scale.y = 0.7;
        p.add(knob);
        return p;
    }

    // Canary Island Date Palm — thick trunk, flat-top crown
    _buildDatePalm(h) {
        const p = new THREE.Group();
        const trunkH = h * 0.75;
        const trunk = new THREE.Mesh(
            new THREE.CylinderGeometry(0.5, 0.8, trunkH, 10),
            this.mat.palmTrunk
        );
        trunk.position.y = trunkH / 2;
        trunk.castShadow = true;
        p.add(trunk);
        // Crown — 14 arching fronds
        const frondCount = 14;
        for (let f = 0; f < frondCount; f++) {
            const angle = (f / frondCount) * Math.PI * 2;
            const shape = new THREE.Shape();
            shape.moveTo(0, 0);
            shape.lineTo(0.3, 0.8);
            shape.lineTo(0, 5);
            shape.lineTo(-0.3, 0.8);
            shape.lineTo(0, 0);
            const frond = new THREE.Mesh(
                new THREE.ShapeGeometry(shape),
                Math.random() < 0.5 ? this.mat.palmFrond : this.mat.palmFrondL
            );
            frond.position.y = trunkH;
            frond.rotation.y = angle;
            frond.rotation.x = Math.PI / 2 - 0.5;
            frond.castShadow = true;
            p.add(frond);
        }
        return p;
    }

    // ========================================================
    //  BOUGAINVILLEA / PLANTER ACCENTS
    // ========================================================
    createBougainvillea() {
        // Random splashes along sidewalks — more along State and courthouse
        const locations = [];
        const S = this.NS_STREETS, E = this.EW_STREETS;
        for (let z = -200; z < 700; z += 24) {
            if (Math.random() < 0.4) locations.push([S.STATE + (Math.random() < 0.5 ? 1 : -1) * 12, z]);
            if (Math.random() < 0.3) locations.push([S.ANACAPA + (Math.random() < 0.5 ? 1 : -1) * 12, z]);
        }
        for (const [x, z] of locations) {
            const cluster = new THREE.Group();
            const colorMat = this.bougPool[Math.floor(Math.random() * 4)];
            for (let j = 0; j < 3 + Math.floor(Math.random() * 3); j++) {
                const ball = new THREE.Mesh(
                    new THREE.SphereGeometry(0.4 + Math.random() * 0.3, 8, 6),
                    colorMat
                );
                ball.position.set(
                    (Math.random() - 0.5) * 1.2,
                    1.5 + Math.random() * 2.5,
                    (Math.random() - 0.5) * 1.2
                );
                cluster.add(ball);
            }
            // Trellis hint — wooden stakes
            for (let s = 0; s < 2; s++) {
                const stake = new THREE.Mesh(
                    new THREE.CylinderGeometry(0.04, 0.04, 3, 4),
                    this.mat.darkWood
                );
                stake.position.set((s - 0.5) * 0.6, 1.5, 0);
                cluster.add(stake);
            }
            cluster.position.set(x, this.localHeight(x, z), z);
            this.group.add(cluster);
        }
    }

    // ========================================================
    //  FOUNTAINS — a couple extra street fountains
    // ========================================================
    createFountains() {
        // Fountain at Anapamu / Chapala plaza corner
        const f1 = this._buildFountain(1.5);
        f1.position.set(-110, this.localHeight(-110, -30), -30);
        this.group.add(f1);

        // Fountain at State & Ortega intersection corner
        const f2 = this._buildFountain(1.3);
        f2.position.set(-18, this.localHeight(-18, 380), 380);
        this.group.add(f2);
    }

    // ========================================================
    //  STREET LAMPS — classic wrought-iron every ~30m
    // ========================================================
    createStreetLamps() {
        const S = this.NS_STREETS, E = this.EW_STREETS;
        const spacing = 30;
        // Along State Street (both sides)
        for (let z = -300; z < 720; z += spacing) {
            for (const sx of [-this.ROAD_HALFWIDTH - 2, this.ROAD_HALFWIDTH + 2]) {
                const lamp = this._buildStreetLamp();
                lamp.position.set(S.STATE + sx, this.localHeight(S.STATE + sx, z), z);
                this.group.add(lamp);
            }
        }
        // Along Cabrillo
        for (let x = -380; x < 380; x += spacing) {
            for (const dz of [-18, 18]) {
                const lamp = this._buildStreetLamp();
                lamp.position.set(x, this.localHeight(x, E.CABRILLO + dz), E.CABRILLO + dz);
                this.group.add(lamp);
            }
        }
        // Along Anapamu by courthouse
        for (let x = -300; x < 300; x += spacing) {
            for (const dz of [-this.ROAD_HALFWIDTH - 2, this.ROAD_HALFWIDTH + 2]) {
                const lamp = this._buildStreetLamp();
                lamp.position.set(x, this.localHeight(x, dz), dz);
                this.group.add(lamp);
            }
        }
    }

    _buildStreetLamp() {
        const lamp = new THREE.Group();
        const poleH = 4.5;
        const pole = new THREE.Mesh(
            new THREE.CylinderGeometry(0.08, 0.11, poleH, 8), this.mat.wrought
        );
        pole.position.y = poleH / 2;
        pole.castShadow = true;
        lamp.add(pole);
        // Decorative base
        const base = new THREE.Mesh(
            new THREE.CylinderGeometry(0.22, 0.3, 0.4, 8), this.mat.wrought
        );
        base.position.y = 0.2;
        lamp.add(base);
        // Arm
        const arm = new THREE.Mesh(
            new THREE.CylinderGeometry(0.05, 0.05, 0.6, 6), this.mat.wrought
        );
        arm.rotation.z = Math.PI / 2;
        arm.position.set(0.35, poleH - 0.1, 0);
        lamp.add(arm);
        // Lantern
        const lantern = new THREE.Mesh(
            new THREE.BoxGeometry(0.3, 0.45, 0.3),
            new THREE.MeshStandardMaterial({
                color: 0xFDF5D4, emissive: 0xD0A857, emissiveIntensity: 0.7
            })
        );
        lantern.position.set(0.7, poleH - 0.1, 0);
        lamp.add(lantern);
        // Lantern cap
        const cap = new THREE.Mesh(
            new THREE.ConeGeometry(0.22, 0.25, 4), this.mat.wrought
        );
        cap.rotation.y = Math.PI / 4;
        cap.position.set(0.7, poleH + 0.2, 0);
        lamp.add(cap);
        return lamp;
    }

    // ========================================================
    //  BENCHES
    // ========================================================
    createBenches() {
        const E = this.EW_STREETS;
        // Cabrillo oceanside benches
        for (let x = -380; x < 380; x += 35) {
            const b = this._buildBench(2);
            b.position.set(x, this.localHeight(x, E.CABRILLO - 12), E.CABRILLO - 12);
            b.rotation.y = Math.PI; // face the ocean
            this.group.add(b);
        }
        // Scattered benches downtown
        const downtownSpots = [
            [30, -70], [-35, 80], [50, 160], [-60, 260], [25, 340],
            [80, 440], [-25, 540]
        ];
        for (const [x, z] of downtownSpots) {
            const b = this._buildBench(1.8);
            b.position.set(x, this.localHeight(x, z), z);
            b.rotation.y = Math.random() * Math.PI;
            this.group.add(b);
        }
    }

    // ========================================================
    //  PARKED CARS
    // ========================================================
    createParkedCars() {
        const S = this.NS_STREETS, E = this.EW_STREETS;
        // Parallel-parked along Anacapa, Chapala, Anapamu, Carrillo
        const carStreets = [
            { axis: 'NS', coord: S.ANACAPA,       range: [-280, 720], direction: 'NS' },
            { axis: 'NS', coord: S.CHAPALA,       range: [-280, 720], direction: 'NS' },
            { axis: 'NS', coord: S.SANTA_BARBARA, range: [-280, 720], direction: 'NS' },
            { axis: 'EW', coord: E.ANAPAMU,       range: [-300, 300], direction: 'EW' },
            { axis: 'EW', coord: E.CARRILLO,      range: [-300, 300], direction: 'EW' },
            { axis: 'EW', coord: E.HALEY,         range: [-300, 300], direction: 'EW' }
        ];
        for (const s of carStreets) {
            for (let side of [-1, 1]) {
                const offset = side * (this.ROAD_HALFWIDTH - 1.2);
                const step = 8;
                for (let p = s.range[0]; p < s.range[1]; p += step) {
                    if (Math.random() < 0.35) continue; // gaps
                    const car = this._buildCar();
                    if (s.direction === 'NS') {
                        car.position.set(s.coord + offset, this.localHeight(s.coord + offset, p), p);
                        car.rotation.y = side < 0 ? 0 : Math.PI;
                    } else {
                        car.position.set(p, this.localHeight(p, s.coord + offset), s.coord + offset);
                        car.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2;
                    }
                    this.group.add(car);
                }
            }
        }
    }

    _buildCar() {
        const car = new THREE.Group();
        const body = this.carPool[Math.floor(Math.random() * this.carPool.length)];
        // Main body
        const bodyMesh = new THREE.Mesh(
            new THREE.BoxGeometry(1.8, 0.9, 4.4), body
        );
        bodyMesh.position.y = 0.75;
        bodyMesh.castShadow = true;
        car.add(bodyMesh);
        // Cabin / greenhouse
        const cabin = new THREE.Mesh(
            new THREE.BoxGeometry(1.65, 0.7, 2.4), this.mat.carWindow
        );
        cabin.position.y = 1.4;
        cabin.position.z = -0.2;
        car.add(cabin);
        // Bumpers / trim
        const bumperMat = new THREE.MeshStandardMaterial({
            color: 0x2A2A2A, roughness: 0.6, metalness: 0.4
        });
        for (const zSign of [-1, 1]) {
            const bumper = new THREE.Mesh(
                new THREE.BoxGeometry(1.82, 0.25, 0.12), bumperMat
            );
            bumper.position.set(0, 0.5, zSign * 2.2);
            car.add(bumper);
        }
        // Wheels
        for (const sx of [-0.85, 0.85]) {
            for (const sz of [-1.5, 1.5]) {
                const wheel = new THREE.Mesh(
                    new THREE.CylinderGeometry(0.35, 0.35, 0.25, 16), this.mat.tire
                );
                wheel.rotation.z = Math.PI / 2;
                wheel.position.set(sx, 0.35, sz);
                car.add(wheel);
            }
        }
        return car;
    }

    // ========================================================
    //  PEDESTRIANS — scattered figures
    // ========================================================
    createPedestrians() {
        // Along the State Street promenade
        for (let i = 0; i < 30; i++) {
            const fig = this._buildSimpleFigure();
            const x = (Math.random() - 0.5) * 10;
            const z = 30 + Math.random() * 400;
            fig.position.set(x, this.localHeight(x, z) + 0.05, z);
            fig.rotation.y = Math.random() * Math.PI * 2;
            this.group.add(fig);
        }
        // Around the courthouse gardens
        for (let i = 0; i < 12; i++) {
            const fig = this._buildSimpleFigure();
            const x = 60 + Math.random() * 40;
            const z = -10 + Math.random() * 35;
            fig.position.set(x, this.localHeight(x, z) + 0.05, z);
            fig.rotation.y = Math.random() * Math.PI * 2;
            this.group.add(fig);
        }
        // On the beach
        for (let i = 0; i < 14; i++) {
            const fig = this._buildSimpleFigure();
            const x = -350 + Math.random() * 700;
            const z = 770 + Math.random() * 25;
            fig.position.set(x, this.localHeight(x, z) + 0.05, z);
            fig.rotation.y = Math.random() * Math.PI * 2;
            this.group.add(fig);
        }
    }

    // ========================================================
    //  SIGNAGE — street-name poles at each intersection
    // ========================================================
    createSignage() {
        const S = this.NS_STREETS, E = this.EW_STREETS;
        for (const [xName, x] of Object.entries(S)) {
            for (const [zName, z] of Object.entries(E)) {
                // Only on key intersections to avoid clutter
                if (!['STATE', 'ANACAPA', 'CHAPALA'].includes(xName)) continue;
                if (['SOLA', 'MICHELTORENA'].includes(zName)) continue;
                const post = new THREE.Group();
                const pole = new THREE.Mesh(
                    new THREE.CylinderGeometry(0.04, 0.04, 3, 6), this.mat.wrought
                );
                pole.position.y = 1.5;
                post.add(pole);
                const s1 = new THREE.Mesh(
                    new THREE.PlaneGeometry(1.5, 0.3),
                    new THREE.MeshBasicMaterial({
                        map: this._makeStreetNameTexture(this._friendlyStreetName(xName)),
                        transparent: true, side: THREE.DoubleSide
                    })
                );
                s1.position.set(0, 2.9, 0);
                post.add(s1);
                const s2 = s1.clone();
                s2.material = new THREE.MeshBasicMaterial({
                    map: this._makeStreetNameTexture(this._friendlyStreetName(zName)),
                    transparent: true, side: THREE.DoubleSide
                });
                s2.position.set(0, 2.6, 0);
                s2.rotation.y = Math.PI / 2;
                post.add(s2);
                post.position.set(
                    x + this.ROAD_HALFWIDTH + this.SIDEWALK_WIDTH - 1.5,
                    this.localHeight(x, z),
                    z + this.ROAD_HALFWIDTH + this.SIDEWALK_WIDTH - 1.5
                );
                this.group.add(post);
            }
        }

        // "Welcome to Santa Barbara" sign by State & Cabrillo
        const welcome = new THREE.Group();
        welcome.userData = { name: 'Welcome to Santa Barbara', type: 'sign' };
        const pillar1 = new THREE.Mesh(
            new THREE.BoxGeometry(0.8, 4, 0.8), this.mat.stuccoWhite
        );
        pillar1.position.set(-4, 2, 0);
        welcome.add(pillar1);
        const pillar2 = pillar1.clone();
        pillar2.position.x = 4;
        welcome.add(pillar2);
        const plaque = new THREE.Mesh(
            new THREE.BoxGeometry(9, 1.4, 0.2), this.mat.stuccoCream
        );
        plaque.position.y = 4.5;
        welcome.add(plaque);
        const plaqueText = new THREE.Mesh(
            new THREE.PlaneGeometry(8.7, 1.3),
            new THREE.MeshBasicMaterial({
                map: this._makeSignTexture('SANTA BARBARA', 0x9B1B2A),
                transparent: true, side: THREE.DoubleSide
            })
        );
        plaqueText.position.set(0, 4.5, 0.11);
        welcome.add(plaqueText);
        const textBack = plaqueText.clone();
        textBack.position.z = -0.11;
        textBack.rotation.y = Math.PI;
        welcome.add(textBack);
        welcome.position.set(-20, this.localHeight(-20, 720), 720);
        this.group.add(welcome);
    }

    _friendlyStreetName(slug) {
        return {
            DE_LA_VINA:    'De la Vina',
            CHAPALA:       'Chapala',
            STATE:         'State St',
            ANACAPA:       'Anacapa',
            SANTA_BARBARA: 'Santa Barbara',
            GARDEN:        'Garden',
            SOLA:          'Sola',
            VICTORIA:      'Victoria',
            ANAPAMU:       'Anapamu',
            FIGUEROA:      'Figueroa',
            CARRILLO:      'Carrillo',
            CANON_PERDIDO: 'Canon Perdido',
            DE_LA_GUERRA:  'De la Guerra',
            ORTEGA:        'Ortega',
            COTA:          'Cota',
            HALEY:         'Haley',
            GUTIERREZ:     'Gutierrez',
            YANONALI:      'Yanonali',
            CABRILLO:      'Cabrillo Blvd'
        }[slug] || slug;
    }

    _makeStreetNameTexture(text) {
        const canvas = document.createElement('canvas');
        canvas.width = 256; canvas.height = 48;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#1E3A5F';
        ctx.fillRect(0, 0, 256, 48);
        ctx.strokeStyle = '#DCDCD0';
        ctx.lineWidth = 2;
        ctx.strokeRect(2, 2, 252, 44);
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 24px "Helvetica", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, 128, 24);
        const tex = new THREE.CanvasTexture(canvas);
        tex.anisotropy = 4;
        return tex;
    }

    _makeSignTexture(text, accentColor) {
        const canvas = document.createElement('canvas');
        canvas.width = 512; canvas.height = 128;
        const ctx = canvas.getContext('2d');
        const bg = new THREE.Color(accentColor);
        bg.multiplyScalar(0.35);
        ctx.fillStyle = `rgb(${Math.round(bg.r * 255)}, ${Math.round(bg.g * 255)}, ${Math.round(bg.b * 255)})`;
        ctx.fillRect(0, 0, 512, 128);
        ctx.strokeStyle = 'rgba(255, 235, 190, 0.4)';
        ctx.lineWidth = 3;
        ctx.strokeRect(6, 6, 500, 116);
        ctx.fillStyle = '#F5E6B8';
        let fontSize = 62;
        ctx.font = `bold ${fontSize}px "Georgia", serif`;
        while (ctx.measureText(text).width > 470 && fontSize > 22) {
            fontSize -= 4;
            ctx.font = `bold ${fontSize}px "Georgia", serif`;
        }
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, 256, 64);
        const tex = new THREE.CanvasTexture(canvas);
        tex.anisotropy = 4;
        return tex;
    }

    _makeVerticalSignTexture(text) {
        const canvas = document.createElement('canvas');
        canvas.width = 128; canvas.height = 512;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = 'rgba(0,0,0,0)';
        ctx.fillRect(0, 0, 128, 512);
        ctx.fillStyle = '#FFE5B0';
        ctx.font = 'bold 56px "Georgia", serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const letters = text.split('');
        const step = 500 / letters.length;
        letters.forEach((ch, i) => {
            ctx.fillText(ch, 64, 16 + step * (i + 0.5));
        });
        const tex = new THREE.CanvasTexture(canvas);
        tex.anisotropy = 4;
        return tex;
    }

    getInteractables() {
        const out = [];
        this.group.traverse(obj => {
            if (obj.userData && obj.userData.isInteractable) out.push(obj);
        });
        return out;
    }
}
