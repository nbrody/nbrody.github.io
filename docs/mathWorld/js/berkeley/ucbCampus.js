/**
 * Berkeley - UC Berkeley Campus content
 *
 * Layout (origin = Sather Tower base / Campanile Esplanade):
 *   -Z is north, +Z is south, +X is east, -X is west.
 *
 *   Doe Library          ────── (z ≈ -58, north of Memorial Glade)
 *   Memorial Glade       ────── (z ≈ -25, open lawn)
 *   Sather Tower         ────── (0, 0, 0)  ← centerpiece, ~85m ASL IRL
 *   South Hall           ────── (x ≈ +32, z ≈ +32, SE of Campanile — real dist ~35m)
 *   Wheeler Hall         ────── (x ≈ +70, z ≈ +15, east of Campanile)
 *   Strawberry Creek     ────── (z ≈ +55, South Fork meanders west→east)
 *   Sather Gate          ────── (z ≈ +95, south end of main axis)
 *   Sproul Plaza         ────── (z ≈ +105, steps between Sather Gate and Telegraph)
 *   Bancroft Way         ────── (z ≈ +118, south campus boundary — E-W street)
 *   Telegraph Avenue     ────── (x ≈ 0, runs south from Bancroft through 4 blocks)
 *   Durant Ave / Channing / Haste — cross streets south of campus
 *   Dwight Way           ────── (z ≈ +320, southern end of the Telegraph district)
 *   SLMath               ────── Berkeley Hills, ~1.5km E of tower (compressed here)
 *
 * Topography (researched, see Wikipedia "Campus of UC Berkeley"):
 *   - West edge (Oxford St)         ≈  55 m above sea level
 *   - Sather Tower / main campus    ≈  85 m
 *   - East edge (Memorial Stadium)  ≈ 130 m — Hayward Fault runs here
 *   - SLMath / MSRI (Grizzly Peak)  ≈ 370 m
 *   - Bancroft/Telegraph            ≈  80 m
 *   - Dwight/Telegraph              ≈  65 m (campus slopes down ~20 m over 4 blocks)
 *   - Main campus slope W→E ≈ 3–4%; Berkeley Hills climb far steeper.
 *   - Strawberry Creek has two forks: South Fork emerges from culverts
 *     near the stadium and flows west through Faculty Glade before
 *     disappearing under West Crescent.
 *
 * All heights are queried through a local procedural terrain so objects
 * sit on the ground even when the Bay Area regional terrain is flat
 * or undefined at Berkeley's GPS offset.
 */

import * as THREE from 'three';

export class UCBerkeleyCampus {
    constructor(campusGroup, terrainHeightFn = null) {
        this.group = campusGroup;
        // Large enough to contain the full Berkeley Hills rise to SLMath
        // AND the four Telegraph blocks south of Bancroft down to Dwight Way.
        // Beyond this the regional Bay Area terrain takes over.
        this.worldSize = 900;
        this.terrainResolution = 260;
        this.regionalTerrainFn = terrainHeightFn;
    }

    // Cross-street Z positions for Telegraph Avenue, shared by terrain, paths,
    // and the district builder. +Z is south in world space.
    get TELEGRAPH() {
        return {
            X: 0,               // Telegraph Ave centerline
            ROAD_HALFWIDTH: 8,  // Road is 16m wide (4 lanes with parking)
            SIDEWALK_WIDTH: 6,
            BLOCK_DEPTH: 20,    // Depth of storefronts from road edge
            BANCROFT_Z: 118,
            DURANT_Z: 170,
            CHANNING_Z: 220,
            HASTE_Z: 270,
            DWIGHT_Z: 320,
            SOUTH_END_Z: 340    // A bit past Dwight so the road doesn't end abruptly
        };
    }

    setTerrainFunction(fn) { this.regionalTerrainFn = fn; }

    async generate() {
        this.createTerrain();
        this.createPaths();
        this.createMemorialGlade();
        this.createStrawberryCreek();
        this.createCampanile();
        this.createDoeLibrary();
        this.createSouthHall();
        this.createWheelerHall();
        this.createEvansHall();
        this.createSatherGate();
        this.createHillRoad();
        this.createSLMath();
        this.createTelegraphDistrict();
        this.createEucalyptusGrove();
        this.createOakTrees();
        this.createHillRedwoods();
        this.createBenches();
        this.createChalkboards();
        this.createGoldenBear();
    }

    // SLMath sits up in the Berkeley Hills — this is a real hillside that
    // climbs ~170 m above the main campus, mirroring the actual geography.
    // The regional Bay Area terrain continues this rise beyond the campus plane.
    get SLMATH_ORIGIN() { return { x: 150, z: -165 }; }
    get HILL_RADIUS() { return 150; }
    get HILL_PEAK() { return 170; }

    // ===== Local procedural terrain =====
    // Berkeley campus slopes up meaningfully from west to east toward the
    // Berkeley Hills. Real gradient is ~3–4% on the main campus core (50m
    // rise over ~300m of main quad) steepening dramatically in the hills.
    // Strawberry Creek's South Fork meanders east→west through the south
    // half of campus (Faculty Glade); we cut a shallow channel for it.
    localHeight(x, z) {
        // Eastward rise — ~3.5% grade across the central quad.
        // Inside the Telegraph district we flatten the cross-slope so the
        // storefronts (20 m deep) and the street don't visibly tilt across
        // their own width. Blend smoothly back to the main gradient just
        // past the back of the storefronts.
        const T = this.TELEGRAPH;
        const inTelegraphZ = (z > T.BANCROFT_Z - 6 && z < T.SOUTH_END_Z + 4);
        const clampedX = THREE.MathUtils.clamp(x, -120, 160);
        let h = clampedX * 0.035;
        if (inTelegraphZ) {
            // 36m from centerline covers sidewalk + 20m-deep storefronts;
            // fade back to full eastward slope over the next 8m.
            const ax = Math.abs(clampedX);
            let blend;
            if (ax < 36) blend = 0;
            else if (ax < 44) {
                const t = (ax - 36) / 8;
                blend = t * t * (3 - 2 * t);
            } else blend = 1;
            h = clampedX * 0.035 * blend;
        }
        // Memorial Glade is a slight bowl (drains toward creek)
        const gladeDist = Math.sqrt(x * x + (z + 22) * (z + 22));
        if (gladeDist < 35) h -= (1 - gladeDist / 35) * 0.8;
        // Strawberry Creek — South Fork, sinuous channel around z≈55
        const creekCenter = 55 + Math.sin(x * 0.04) * 6 + Math.sin(x * 0.11) * 2;
        const creekDist = Math.abs(z - creekCenter);
        if (creekDist < 5) h -= (1 - creekDist / 5) * 1.4;

        // Southward drop down Telegraph — ~5 m from Bancroft to Dwight.
        // Starts just south of Sather Gate so Sproul Plaza stays level.
        if (z > 100) {
            const southT = Math.min(1, (z - 100) / (T.DWIGHT_Z - 100));
            // Smoothstep-ish so the slope eases in/out
            const s = southT * southT * (3 - 2 * southT);
            h -= s * 5;
        }

        // Berkeley Hills — broad rise up to SLMath in the NE
        const h0 = this.SLMATH_ORIGIN;
        const hillDist = Math.sqrt(Math.pow(x - h0.x, 2) + Math.pow(z - h0.z, 2));
        if (hillDist < this.HILL_RADIUS) {
            const t = 1 - hillDist / this.HILL_RADIUS;
            // Smooth sigmoid-ish rise to HILL_PEAK metres at the summit.
            // IRL SLMath is ~285 m above the main campus; we compress to ~170 m
            // since the horizontal distance is also compressed (~150 m vs ~1.5 km).
            h += this.HILL_PEAK * (0.5 - 0.5 * Math.cos(Math.PI * t));
            // Flat plateau on the summit for SLMath to sit on
            if (hillDist < 22) {
                const plateauT = 1 - hillDist / 22;
                h += plateauT * 2.5;
            }
        }

        // Subtle organic variation
        h += Math.sin(x * 0.07) * Math.cos(z * 0.05) * 0.25;
        h += Math.sin(x * 0.21 + z * 0.17) * 0.12;
        return h;
    }

    getTerrainHeight(x, z) {
        // Inside the local campus plane we use the high-detail procedural
        // terrain. Outside, fall back to the regional Bay Area terrain so the
        // player can walk off campus and onto the broader hillside.
        const half = this.worldSize / 2;
        const margin = 30;
        const absX = Math.abs(x), absZ = Math.abs(z);
        if (absX < half - margin && absZ < half - margin) {
            return this.localHeight(x, z);
        }
        if (this.regionalTerrainFn) {
            if (absX < half && absZ < half) {
                // Blend zone: smoothly transition from local to regional
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
            // PlaneGeometry lives in the XY plane (Z=0) until we rotate it onto XZ.
            // After the -PI/2 X-rotation: world-X = local-X, world-Z = -local-Y,
            // world-Y (height) = local-Z. So to shape the terrain we read X/Y and
            // write Z (height).
            const x = pos.getX(i), y = pos.getY(i);
            const worldX = x, worldZ = -y;
            const h = this.localHeight(worldX, worldZ);
            pos.setZ(i, h);

            // Vertex coloring — grass lawns near Glade, tan paths, dirt near creek
            let r, g, b;
            const creekCenter = 55 + Math.sin(worldX * 0.04) * 6;
            const creekDist = Math.abs(worldZ - creekCenter);
            const gladeDist = Math.sqrt(worldX * worldX + (worldZ + 22) * (worldZ + 22));
            const h0 = this.SLMATH_ORIGIN;
            const hillDist = Math.sqrt(Math.pow(worldX - h0.x, 2) + Math.pow(worldZ - h0.z, 2));
            const onHill = hillDist < this.HILL_RADIUS;

            if (creekDist < 2.5) {
                // Creek bed - darker wet soil
                r = 0.28; g = 0.26; b = 0.2;
            } else if (creekDist < 5) {
                // Creek banks - sandy
                r = 0.55; g = 0.5; b = 0.38;
            } else if (onHill && hillDist < 25) {
                // Hilltop plateau around SLMath — gravelly duff
                r = 0.52; g = 0.5; b = 0.38;
            } else if (onHill) {
                // Hillside — Berkeley Hills chaparral/redwood floor
                const t = 1 - hillDist / this.HILL_RADIUS;
                r = 0.32 + (0.1 - t * 0.08);
                g = 0.42 - t * 0.1;
                b = 0.22;
            } else if (gladeDist < 28) {
                // Memorial Glade - bright lawn
                r = 0.38; g = 0.58; b = 0.28;
            } else if (worldX < -60) {
                // Eucalyptus grove floor - duff
                r = 0.38; g = 0.38; b = 0.22;
            } else if (Math.abs(worldX) < 14 && worldZ > -50 && worldZ < 50) {
                // Main campus lawn
                r = 0.4; g = 0.56; b = 0.3;
            } else {
                // Default grass / leaf litter
                r = 0.42; g = 0.52; b = 0.3;
            }

            const n = (Math.random() - 0.5) * 0.06;
            colors[i * 3] = Math.max(0, Math.min(1, r + n));
            colors[i * 3 + 1] = Math.max(0, Math.min(1, g + n));
            colors[i * 3 + 2] = Math.max(0, Math.min(1, b + n));
        }

        geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geo.computeVertexNormals();

        const mat = new THREE.MeshStandardMaterial({
            vertexColors: true, roughness: 0.95, metalness: 0
        });
        const terrain = new THREE.Mesh(geo, mat);
        terrain.rotation.x = -Math.PI / 2;
        terrain.receiveShadow = true;
        this.group.add(terrain);
    }

    // ===== Campus paths (concrete) =====
    createPaths() {
        const pathMat = new THREE.MeshStandardMaterial({
            color: 0xC8BFA8, roughness: 0.85, metalness: 0
        });

        // Waypoints connecting Bancroft / Sproul Plaza → Sather Gate →
        // Campanile → Doe Library. This is the full N-S spine a visitor
        // coming from Telegraph would follow.
        const mainPath = [
            { x: 0, z: 115 }, // Sproul Plaza south — meets Bancroft Way
            { x: 0, z: 105 }, // Sproul Plaza center
            { x: 0, z: 95 },  // Sather Gate
            { x: 0, z: 70 },
            { x: 0, z: 40 },  // Crosses Strawberry Creek
            { x: 0, z: 12 },
            { x: 0, z: -8 },  // Campanile esplanade south
            { x: 0, z: -22 }, // Campanile esplanade north
            { x: 0, z: -45 }  // Doe Library steps
        ];
        this.laySegmentedPath(mainPath, 4.5, pathMat);

        // East-west cross path at Campanile
        this.laySegmentedPath([
            { x: -55, z: 0 }, { x: -18, z: 0 }, { x: 18, z: 0 }, { x: 55, z: 0 }
        ], 3.5, pathMat);

        // Spur to Wheeler Hall (east)
        this.laySegmentedPath([
            { x: 18, z: 0 }, { x: 35, z: 10 }, { x: 50, z: 18 }
        ], 3, pathMat);

        // Spur to South Hall (SE of Campanile)
        this.laySegmentedPath([
            { x: 0, z: 12 }, { x: 18, z: 24 }, { x: 32, z: 32 }
        ], 3, pathMat);
    }

    laySegmentedPath(points, width, material) {
        for (let i = 0; i < points.length - 1; i++) {
            const s = points[i], e = points[i + 1];
            const dx = e.x - s.x, dz = e.z - s.z;
            const len = Math.sqrt(dx * dx + dz * dz);
            const cx = (s.x + e.x) / 2, cz = (s.z + e.z) / 2;
            const seg = new THREE.Mesh(
                new THREE.PlaneGeometry(width, len),
                material
            );
            seg.position.set(cx, this.getTerrainHeight(cx, cz) + 0.04, cz);
            seg.rotation.x = -Math.PI / 2;
            seg.rotation.z = Math.atan2(dx, dz);
            seg.receiveShadow = true;
            seg.userData.noCollision = true; // Walkable — no raycast blocker
            this.group.add(seg);
        }
    }

    // ===== Memorial Glade (open lawn between Campanile and Doe) =====
    createMemorialGlade() {
        // The lawn itself is part of the terrain coloring; we add a subtle border
        // and a few decorative elements.
        const borderMat = new THREE.MeshStandardMaterial({
            color: 0xA89868, roughness: 0.9
        });
        const border = new THREE.Mesh(
            new THREE.RingGeometry(34, 36, 48),
            borderMat
        );
        border.rotation.x = -Math.PI / 2;
        border.position.set(0, this.getTerrainHeight(0, -22) + 0.05, -22);
        border.userData.noCollision = true;
        this.group.add(border);
    }

    // ===== Strawberry Creek (winding water feature) =====
    createStrawberryCreek() {
        const waterMat = new THREE.MeshStandardMaterial({
            color: 0x3C6B7A, roughness: 0.2, metalness: 0.35,
            transparent: true, opacity: 0.85
        });
        const rockMat = new THREE.MeshStandardMaterial({
            color: 0x6B6050, roughness: 0.92, flatShading: true
        });
        const bankMat = new THREE.MeshStandardMaterial({
            color: 0x5A4A3A, roughness: 0.95
        });

        // Sample the creek centerline densely
        const segments = 50;
        for (let i = 0; i < segments; i++) {
            const t0 = i / segments;
            const t1 = (i + 1) / segments;
            const x0 = -160 + 320 * t0;
            const x1 = -160 + 320 * t1;
            const z0 = 55 + Math.sin(x0 * 0.04) * 6 + Math.sin(x0 * 0.11) * 2;
            const z1 = 55 + Math.sin(x1 * 0.04) * 6 + Math.sin(x1 * 0.11) * 2;

            const dx = x1 - x0, dz = z1 - z0;
            const len = Math.sqrt(dx * dx + dz * dz);
            const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;

            // Water ribbon (slightly below ground)
            const waterBaseY = this.getTerrainHeight(cx, cz) - 0.35;
            const water = new THREE.Mesh(
                new THREE.PlaneGeometry(len + 0.4, 2.2),
                waterMat
            );
            water.rotation.x = -Math.PI / 2;
            water.rotation.z = -Math.atan2(dz, dx);
            water.position.set(cx, waterBaseY, cz);
            water.userData.noCollision = true;
            this.group.add(water);

            // Dirt banks
            const bank = new THREE.Mesh(
                new THREE.PlaneGeometry(len + 0.4, 5),
                bankMat
            );
            bank.rotation.x = -Math.PI / 2;
            bank.rotation.z = -Math.atan2(dz, dx);
            bank.position.set(cx, waterBaseY - 0.05, cz);
            bank.userData.noCollision = true;
            this.group.add(bank);
        }

        // Scatter rocks along the creek
        for (let i = 0; i < 24; i++) {
            const x = -140 + Math.random() * 280;
            const z = 55 + Math.sin(x * 0.04) * 6 + (Math.random() - 0.5) * 2.5;
            const rock = new THREE.Mesh(
                new THREE.DodecahedronGeometry(0.4 + Math.random() * 0.5, 0),
                rockMat
            );
            rock.position.set(x, this.getTerrainHeight(x, z) - 0.1, z);
            rock.rotation.set(Math.random(), Math.random(), Math.random());
            rock.castShadow = true;
            this.group.add(rock);
        }

        // A stone footbridge where the main path crosses the creek
        this.createFootbridge(0, 55);
    }

    createFootbridge(cx, cz) {
        const g = new THREE.Group();
        const stoneMat = new THREE.MeshStandardMaterial({
            color: 0xB0A88E, roughness: 0.85
        });
        const deck = new THREE.Mesh(new THREE.BoxGeometry(6, 0.4, 4.8), stoneMat);
        deck.position.y = 0.5;
        deck.castShadow = true;
        deck.receiveShadow = true;
        g.add(deck);

        // Arched supports (stylized)
        for (const side of [-1, 1]) {
            const arch = new THREE.Mesh(
                new THREE.TorusGeometry(2.2, 0.25, 6, 16, Math.PI),
                stoneMat
            );
            arch.rotation.y = Math.PI / 2;
            arch.rotation.z = Math.PI;
            arch.position.set(0, 0.3, side * 2);
            g.add(arch);
        }

        // Low stone parapet walls
        for (const side of [-1, 1]) {
            const wall = new THREE.Mesh(
                new THREE.BoxGeometry(6, 0.8, 0.4),
                stoneMat
            );
            wall.position.set(0, 1.1, side * 2.4);
            wall.castShadow = true;
            g.add(wall);
        }

        g.position.set(cx, this.getTerrainHeight(cx, cz) + 0.1, cz);
        this.group.add(g);
    }

    // ===== Sather Tower (Campanile) =====
    createCampanile() {
        const camp = new THREE.Group();
        camp.userData = {
            name: 'Sather Tower', isInteractable: true,
            type: 'landmark', interactionType: 'Admire'
        };

        // Materials — weathered grey-buff granite
        const graniteMat = new THREE.MeshStandardMaterial({
            color: 0xD6D1C2, emissive: 0x120F0A, roughness: 0.7, metalness: 0.08
        });
        const graniteShadowMat = new THREE.MeshStandardMaterial({
            color: 0xB8B0A0, emissive: 0x0A0808, roughness: 0.75, metalness: 0.08
        });
        const clockFaceMat = new THREE.MeshStandardMaterial({
            color: 0xF0E8D4, emissive: 0x3A331C, emissiveIntensity: 0.6,
            roughness: 0.4, metalness: 0.05
        });
        const bronzeMat = new THREE.MeshStandardMaterial({
            color: 0x6B4E2A, roughness: 0.6, metalness: 0.7
        });
        const copperRoofMat = new THREE.MeshStandardMaterial({
            color: 0x5A8C6B, emissive: 0x0A1512, roughness: 0.7, metalness: 0.5
        });

        const baseSize = 10.5;
        const shaftSize = 9.0;
        const shaftHeight = 45;    // Up to clock band
        const clockBandHeight = 6;
        const belfryHeight = 8;
        const spireHeight = 14;
        const totalHeight = shaftHeight + clockBandHeight + belfryHeight + spireHeight;

        // Base plinth (wider, with steps)
        const plinth = new THREE.Mesh(
            new THREE.BoxGeometry(baseSize + 3, 1.2, baseSize + 3),
            graniteShadowMat
        );
        plinth.position.y = 0.6;
        plinth.castShadow = true; plinth.receiveShadow = true;
        camp.add(plinth);

        const plinthStep = new THREE.Mesh(
            new THREE.BoxGeometry(baseSize + 1.5, 0.6, baseSize + 1.5),
            graniteMat
        );
        plinthStep.position.y = 1.5;
        plinthStep.castShadow = true;
        camp.add(plinthStep);

        // Lower ornate base
        const base = new THREE.Mesh(
            new THREE.BoxGeometry(baseSize, 3, baseSize),
            graniteMat
        );
        base.position.y = 1.8 + 1.5;
        base.castShadow = true;
        camp.add(base);

        // Entrance arch on south face
        const archPort = new THREE.Mesh(
            new THREE.BoxGeometry(2.4, 2.6, 0.35),
            new THREE.MeshStandardMaterial({ color: 0x1A1814, roughness: 0.5 })
        );
        archPort.position.set(0, 2.5, baseSize / 2 + 0.05);
        camp.add(archPort);

        // Main shaft
        const shaft = new THREE.Mesh(
            new THREE.BoxGeometry(shaftSize, shaftHeight, shaftSize),
            graniteMat
        );
        shaft.position.y = 4.8 + shaftHeight / 2;
        shaft.castShadow = true;
        camp.add(shaft);

        // Vertical pilasters on each face for classical detail
        for (const [sx, sz] of [[shaftSize / 2, 0], [-shaftSize / 2, 0], [0, shaftSize / 2], [0, -shaftSize / 2]]) {
            for (const offset of [-shaftSize * 0.3, shaftSize * 0.3]) {
                const pil = new THREE.Mesh(
                    new THREE.BoxGeometry(
                        sx === 0 ? 0.8 : 0.35,
                        shaftHeight * 0.85,
                        sz === 0 ? 0.8 : 0.35
                    ),
                    graniteShadowMat
                );
                pil.position.set(
                    sx === 0 ? offset : sx * 1.02,
                    4.8 + shaftHeight * 0.45,
                    sz === 0 ? offset : sz * 1.02
                );
                camp.add(pil);
            }
        }

        // Small windows up the shaft
        const windowMat = new THREE.MeshStandardMaterial({
            color: 0x23292E, roughness: 0.3, metalness: 0.3
        });
        for (let floor = 0; floor < 5; floor++) {
            const wy = 10 + floor * 8;
            for (const [nx, nz, rot] of [
                [shaftSize / 2 + 0.02, 0, 0],
                [-shaftSize / 2 - 0.02, 0, 0],
                [0, shaftSize / 2 + 0.02, Math.PI / 2],
                [0, -shaftSize / 2 - 0.02, Math.PI / 2]
            ]) {
                const win = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 2.8), windowMat);
                win.position.set(nx, wy, nz);
                win.rotation.y = rot;
                camp.add(win);
            }
        }

        // Clock band
        const clockBandY = 4.8 + shaftHeight + clockBandHeight / 2;
        const clockBand = new THREE.Mesh(
            new THREE.BoxGeometry(shaftSize + 0.6, clockBandHeight, shaftSize + 0.6),
            graniteShadowMat
        );
        clockBand.position.y = clockBandY;
        clockBand.castShadow = true;
        camp.add(clockBand);

        // Clock faces (one per side)
        const clockR = 2.0;
        for (const [nx, nz, rot] of [
            [0, (shaftSize + 0.6) / 2 + 0.05, 0],
            [0, -(shaftSize + 0.6) / 2 - 0.05, Math.PI],
            [(shaftSize + 0.6) / 2 + 0.05, 0, Math.PI / 2],
            [-(shaftSize + 0.6) / 2 - 0.05, 0, -Math.PI / 2]
        ]) {
            const face = new THREE.Mesh(new THREE.CircleGeometry(clockR, 32), clockFaceMat);
            face.position.set(nx, clockBandY, nz);
            face.rotation.y = rot;
            camp.add(face);

            const ring = new THREE.Mesh(
                new THREE.TorusGeometry(clockR, 0.12, 8, 32),
                bronzeMat
            );
            ring.position.copy(face.position);
            ring.rotation.copy(face.rotation);
            ring.rotateX(Math.PI / 2);
            camp.add(ring);

            // Hour marks
            for (let i = 0; i < 12; i++) {
                const a = i * Math.PI / 6;
                const mark = new THREE.Mesh(
                    new THREE.BoxGeometry(0.18, 0.04, 0.35),
                    bronzeMat
                );
                // Position on the face plane
                mark.position.copy(face.position);
                const ux = Math.sin(a) * clockR * 0.85;
                const uy = Math.cos(a) * clockR * 0.85;
                if (Math.abs(rot) < 0.01) mark.position.x += ux, mark.position.y += uy, mark.position.z += 0.04;
                else if (Math.abs(rot - Math.PI) < 0.01) mark.position.x -= ux, mark.position.y += uy, mark.position.z -= 0.04;
                else if (rot > 0) mark.position.z += ux, mark.position.y += uy, mark.position.x += 0.04;
                else mark.position.z -= ux, mark.position.y += uy, mark.position.x -= 0.04;
                camp.add(mark);
            }

            // Clock hands pointing roughly to 10:10 (a.k.a. watch photo pose)
            const hour = new THREE.Mesh(
                new THREE.BoxGeometry(0.12, clockR * 0.55, 0.06), bronzeMat
            );
            const minute = new THREE.Mesh(
                new THREE.BoxGeometry(0.09, clockR * 0.8, 0.06), bronzeMat
            );
            for (const [hand, angle] of [[hour, -Math.PI / 3], [minute, Math.PI / 3]]) {
                hand.position.copy(face.position);
                hand.rotation.copy(face.rotation);
                hand.translateY(clockR * (hand === hour ? 0.27 : 0.4));
                // Convert translateY to face-plane offset via pivot trick
                hand.position.copy(face.position);
                const hx = Math.sin(angle) * clockR * (hand === hour ? 0.27 : 0.4);
                const hy = Math.cos(angle) * clockR * (hand === hour ? 0.27 : 0.4);
                if (Math.abs(rot) < 0.01) hand.position.x += hx, hand.position.y += hy, hand.position.z += 0.06;
                else if (Math.abs(rot - Math.PI) < 0.01) hand.position.x -= hx, hand.position.y += hy, hand.position.z -= 0.06;
                else if (rot > 0) hand.position.z += hx, hand.position.y += hy, hand.position.x += 0.06;
                else hand.position.z -= hx, hand.position.y += hy, hand.position.x -= 0.06;
                hand.rotation.z = angle;
                hand.rotation.y = rot;
                camp.add(hand);
            }
        }

        // Belfry cornice
        const cornice = new THREE.Mesh(
            new THREE.BoxGeometry(shaftSize + 1.4, 0.8, shaftSize + 1.4),
            graniteMat
        );
        cornice.position.y = clockBandY + clockBandHeight / 2 + 0.4;
        camp.add(cornice);

        // Belfry (open arched level)
        const belfryY = clockBandY + clockBandHeight / 2 + 0.8 + belfryHeight / 2;
        const belfryFrameMat = graniteMat;

        // Four corner posts
        for (const sx of [-1, 1]) {
            for (const sz of [-1, 1]) {
                const post = new THREE.Mesh(
                    new THREE.BoxGeometry(1.2, belfryHeight, 1.2), belfryFrameMat
                );
                post.position.set(sx * shaftSize * 0.42, belfryY, sz * shaftSize * 0.42);
                post.castShadow = true;
                camp.add(post);
            }
        }
        // Belfry top slab
        const belfryTop = new THREE.Mesh(
            new THREE.BoxGeometry(shaftSize + 0.8, 0.8, shaftSize + 0.8),
            graniteMat
        );
        belfryTop.position.y = belfryY + belfryHeight / 2 + 0.4;
        belfryTop.castShadow = true;
        camp.add(belfryTop);

        // Suggested bells inside the belfry
        for (let i = 0; i < 3; i++) {
            const bell = new THREE.Mesh(
                new THREE.ConeGeometry(0.8, 1.4, 8, 1, true),
                bronzeMat
            );
            bell.position.set((i - 1) * 1.8, belfryY + 0.4, 0);
            bell.rotation.x = Math.PI;
            camp.add(bell);
        }

        // Pyramidal copper spire
        const spire = new THREE.Mesh(
            new THREE.ConeGeometry(shaftSize * 0.58, spireHeight, 4),
            copperRoofMat
        );
        spire.rotation.y = Math.PI / 4;
        spire.position.y = belfryY + belfryHeight / 2 + 0.8 + spireHeight / 2;
        spire.castShadow = true;
        camp.add(spire);

        // Finial
        const finial = new THREE.Mesh(
            new THREE.SphereGeometry(0.5, 12, 8),
            new THREE.MeshStandardMaterial({
                color: 0xD4AA44, emissive: 0x201808, roughness: 0.3, metalness: 0.9
            })
        );
        finial.position.y = belfryY + belfryHeight / 2 + 0.8 + spireHeight + 0.4;
        camp.add(finial);

        camp.position.set(0, this.getTerrainHeight(0, 0), 0);
        this.group.add(camp);
    }

    // ===== Doe Library (Beaux-Arts) =====
    createDoeLibrary() {
        const lib = new THREE.Group();
        lib.userData = {
            name: 'Doe Library', isInteractable: true,
            type: 'building', interactionType: 'Enter'
        };

        const stoneMat = new THREE.MeshStandardMaterial({
            color: 0xE0D8C4, emissive: 0x1A1810, roughness: 0.8, metalness: 0.03
        });
        const stoneDark = new THREE.MeshStandardMaterial({
            color: 0xC8C0A8, emissive: 0x100E08, roughness: 0.85
        });
        const roofMat = new THREE.MeshStandardMaterial({
            color: 0x5B6660, roughness: 0.75, metalness: 0.2
        });

        const w = 55, d = 22, h = 18;
        const cx = 0, cz = -58; // North of Campanile

        // Main massing
        const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), stoneMat);
        body.position.y = h / 2;
        body.castShadow = true; body.receiveShadow = true;
        lib.add(body);

        // Stepped base
        const base = new THREE.Mesh(new THREE.BoxGeometry(w + 3, 1.2, d + 3), stoneDark);
        base.position.y = 0.6;
        lib.add(base);

        // Grand entrance portico with six columns
        const columnCount = 6;
        const porticoDepth = 3.5;
        const colSpacing = (w - 8) / (columnCount - 1);
        for (let i = 0; i < columnCount; i++) {
            const col = new THREE.Mesh(
                new THREE.CylinderGeometry(0.85, 0.95, h * 0.75, 16), stoneMat
            );
            col.position.set(
                -w / 2 + 4 + i * colSpacing,
                (h * 0.75) / 2 + 1.2,
                d / 2 + porticoDepth - 0.5
            );
            col.castShadow = true;
            lib.add(col);

            // Capital
            const cap = new THREE.Mesh(
                new THREE.BoxGeometry(2, 0.6, 2), stoneMat
            );
            cap.position.set(col.position.x, col.position.y + (h * 0.75) / 2 + 0.3, col.position.z);
            lib.add(cap);
        }

        // Pediment (triangular gable above columns)
        const pedShape = new THREE.Shape();
        pedShape.moveTo(-w / 2 + 2, 0);
        pedShape.lineTo(w / 2 - 2, 0);
        pedShape.lineTo(0, 4);
        pedShape.lineTo(-w / 2 + 2, 0);
        const pedGeo = new THREE.ExtrudeGeometry(pedShape, { depth: 1, bevelEnabled: false });
        const pediment = new THREE.Mesh(pedGeo, stoneMat);
        pediment.rotation.y = 0;
        pediment.position.set(0, h * 0.75 + 1.5, d / 2 + porticoDepth + 0.4);
        pediment.castShadow = true;
        lib.add(pediment);

        // Entablature
        const entab = new THREE.Mesh(
            new THREE.BoxGeometry(w - 2, 1.5, porticoDepth + 1),
            stoneDark
        );
        entab.position.set(0, h * 0.75 + 0.75, d / 2 + porticoDepth / 2 + 0.2);
        lib.add(entab);

        // Windows — repeating rows
        const winMat = new THREE.MeshStandardMaterial({
            color: 0x34484E, roughness: 0.2, metalness: 0.35,
            transparent: true, opacity: 0.65
        });
        for (let floor = 0; floor < 3; floor++) {
            const wy = 3.5 + floor * 4.5;
            for (let i = 0; i < 9; i++) {
                const wx = -w / 2 + 4 + i * ((w - 8) / 8);
                // Front facing windows — above columns the portico blocks them,
                // so place on sides and back.
                if (floor === 0) continue;
                // Side (east) windows
                const ws = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 2.5), winMat);
                ws.position.set(w / 2 + 0.02, wy, -d / 2 + 2 + i * (d - 4) / 8);
                ws.rotation.y = Math.PI / 2;
                lib.add(ws);
                const ws2 = ws.clone();
                ws2.position.x = -w / 2 - 0.02;
                ws2.rotation.y = -Math.PI / 2;
                lib.add(ws2);
                // Back (north) windows
                const wb = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 2.5), winMat);
                wb.position.set(wx, wy, -d / 2 - 0.02);
                wb.rotation.y = Math.PI;
                lib.add(wb);
            }
        }

        // Flat gabled roof
        const roof = new THREE.Mesh(
            new THREE.BoxGeometry(w + 1, 0.6, d + 1), roofMat
        );
        roof.position.y = h + 0.3;
        roof.castShadow = true;
        lib.add(roof);

        // Copper dome on top (stylized reading room dome)
        const dome = new THREE.Mesh(
            new THREE.SphereGeometry(7, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2),
            new THREE.MeshStandardMaterial({
                color: 0x5A8C6B, roughness: 0.7, metalness: 0.5
            })
        );
        dome.position.set(0, h + 0.6, 0);
        dome.castShadow = true;
        lib.add(dome);

        const domeBase = new THREE.Mesh(
            new THREE.CylinderGeometry(7.3, 7.3, 1.2, 24), stoneMat
        );
        domeBase.position.set(0, h + 0.6, 0);
        lib.add(domeBase);

        // Lantern on dome
        const lantern = new THREE.Mesh(
            new THREE.CylinderGeometry(1, 1.2, 2, 12), stoneMat
        );
        lantern.position.set(0, h + 8, 0);
        lib.add(lantern);
        const lanternCap = new THREE.Mesh(
            new THREE.ConeGeometry(1.4, 1.5, 12),
            new THREE.MeshStandardMaterial({ color: 0x5A8C6B, metalness: 0.5, roughness: 0.6 })
        );
        lanternCap.position.set(0, h + 9.8, 0);
        lib.add(lanternCap);

        // Front stairs
        for (let i = 0; i < 5; i++) {
            const step = new THREE.Mesh(
                new THREE.BoxGeometry(w - 4 - i * 0.4, 0.3, 1),
                stoneDark
            );
            step.position.set(0, 0.15 + i * 0.25, d / 2 + porticoDepth + 1.5 + i * 1);
            lib.add(step);
        }

        lib.position.set(cx, this.getTerrainHeight(cx, cz), cz);
        this.group.add(lib);
    }

    // ===== South Hall (oldest building, Second Empire) =====
    createSouthHall() {
        const sh = new THREE.Group();
        sh.userData = {
            name: 'South Hall', isInteractable: true,
            type: 'building', interactionType: 'Enter'
        };

        const brickMat = new THREE.MeshStandardMaterial({
            color: 0xA85C3E, emissive: 0x2A1008, roughness: 0.85, metalness: 0.05
        });
        const trimMat = new THREE.MeshStandardMaterial({
            color: 0xE0D4B4, roughness: 0.7
        });
        const mansardMat = new THREE.MeshStandardMaterial({
            color: 0x3A2A22, roughness: 0.9
        });
        const windowMat = new THREE.MeshStandardMaterial({
            color: 0x2A3036, roughness: 0.3, metalness: 0.3,
            transparent: true, opacity: 0.7
        });

        const w = 28, d = 16, h = 13;
        // Real South Hall sits ~35m SE of Sather Tower (GPS delta: +35m E, +33m S).
        const cx = 32, cz = 32;

        const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), brickMat);
        body.position.y = h / 2;
        body.castShadow = true;
        sh.add(body);

        // Stone trim at each floor
        for (const trimY of [4.3, 8.3, h - 0.4]) {
            const trim = new THREE.Mesh(
                new THREE.BoxGeometry(w + 0.4, 0.4, d + 0.4),
                trimMat
            );
            trim.position.y = trimY;
            sh.add(trim);
        }

        // Stone base
        const base = new THREE.Mesh(new THREE.BoxGeometry(w + 0.4, 2, d + 0.4), trimMat);
        base.position.y = 1;
        sh.add(base);

        // Mansard roof — slanted sides
        const mansardH = 3.5;
        for (const [side, sign] of [['s', 1], ['n', -1]]) {
            const roof = new THREE.Mesh(
                new THREE.BoxGeometry(w + 0.8, mansardH, 0.4),
                mansardMat
            );
            roof.position.set(0, h + mansardH / 2, sign * (d / 2 + 0.2));
            roof.rotation.x = sign * -0.4;
            sh.add(roof);
        }
        for (const sign of [1, -1]) {
            const roof = new THREE.Mesh(
                new THREE.BoxGeometry(0.4, mansardH, d + 0.8),
                mansardMat
            );
            roof.position.set(sign * (w / 2 + 0.2), h + mansardH / 2, 0);
            roof.rotation.z = sign * 0.4;
            sh.add(roof);
        }
        // Flat top
        const flatTop = new THREE.Mesh(
            new THREE.BoxGeometry(w * 0.8, 0.3, d * 0.8), mansardMat
        );
        flatTop.position.y = h + mansardH;
        sh.add(flatTop);

        // Dormer windows in mansard (south side)
        for (let i = 0; i < 4; i++) {
            const dx = -w / 2 + 4 + i * ((w - 8) / 3);
            const dormer = new THREE.Mesh(
                new THREE.BoxGeometry(2, 1.8, 1.2), trimMat
            );
            dormer.position.set(dx, h + mansardH * 0.5, d / 2 + 0.5);
            sh.add(dormer);
            const dormerWin = new THREE.Mesh(
                new THREE.PlaneGeometry(1.2, 1.2), windowMat
            );
            dormerWin.position.set(dx, h + mansardH * 0.5, d / 2 + 1.11);
            sh.add(dormerWin);
        }

        // Regular windows
        for (let floor = 0; floor < 3; floor++) {
            const wy = 2.5 + floor * 4;
            for (let i = 0; i < 5; i++) {
                const wx = -w / 2 + 3 + i * ((w - 6) / 4);
                // South face
                const wS = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 2.2), windowMat);
                wS.position.set(wx, wy, d / 2 + 0.02);
                sh.add(wS);
                // North face
                const wN = wS.clone();
                wN.position.z = -d / 2 - 0.02;
                wN.rotation.y = Math.PI;
                sh.add(wN);
            }
        }

        // Front entrance with arch
        const doorway = new THREE.Mesh(
            new THREE.BoxGeometry(2.2, 3, 0.3),
            new THREE.MeshStandardMaterial({ color: 0x2A1810, roughness: 0.7 })
        );
        doorway.position.set(0, 1.5, d / 2 + 0.05);
        sh.add(doorway);

        const porch = new THREE.Mesh(
            new THREE.BoxGeometry(5, 0.4, 3), trimMat
        );
        porch.position.set(0, 0.2, d / 2 + 1.5);
        sh.add(porch);

        sh.position.set(cx, this.getTerrainHeight(cx, cz), cz);
        this.group.add(sh);
    }

    // ===== Wheeler Hall (classical, east of Campanile) =====
    createWheelerHall() {
        const wh = new THREE.Group();
        wh.userData = {
            name: 'Wheeler Hall', isInteractable: true,
            type: 'building', interactionType: 'Enter'
        };
        const stoneMat = new THREE.MeshStandardMaterial({
            color: 0xD8CFB8, emissive: 0x181510, roughness: 0.82
        });
        const roofMat = new THREE.MeshStandardMaterial({
            color: 0x8B5B2E, roughness: 0.75
        });
        const windowMat = new THREE.MeshStandardMaterial({
            color: 0x303840, roughness: 0.3, metalness: 0.3,
            transparent: true, opacity: 0.7
        });

        const w = 38, d = 18, h = 14;
        const cx = 70, cz = 15;

        const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), stoneMat);
        body.position.y = h / 2;
        body.castShadow = true;
        wh.add(body);

        // Four columns on west facade
        for (let i = 0; i < 4; i++) {
            const col = new THREE.Mesh(
                new THREE.CylinderGeometry(0.65, 0.75, h * 0.72, 12), stoneMat
            );
            col.position.set(-w / 2 - 0.5, h * 0.36 + 1, -d / 2 + 2.5 + i * ((d - 5) / 3));
            col.castShadow = true;
            wh.add(col);
        }

        // Windows on all facades
        for (let floor = 0; floor < 3; floor++) {
            const wy = 2.5 + floor * 4;
            for (let i = 0; i < 6; i++) {
                const zz = -d / 2 + 2 + i * ((d - 4) / 5);
                const wE = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 2.4), windowMat);
                wE.position.set(w / 2 + 0.02, wy, zz);
                wE.rotation.y = Math.PI / 2;
                wh.add(wE);
            }
            for (let i = 0; i < 10; i++) {
                const xx = -w / 2 + 2 + i * ((w - 4) / 9);
                const wN = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 2.4), windowMat);
                wN.position.set(xx, wy, -d / 2 - 0.02);
                wN.rotation.y = Math.PI;
                wh.add(wN);
                const wS = wN.clone();
                wS.position.z = d / 2 + 0.02;
                wS.rotation.y = 0;
                wh.add(wS);
            }
        }

        // Hipped tile roof
        const roof = new THREE.Mesh(
            new THREE.BoxGeometry(w + 1.5, 0.8, d + 1.5), roofMat
        );
        roof.position.y = h + 0.4;
        roof.castShadow = true;
        wh.add(roof);

        wh.position.set(cx, this.getTerrainHeight(cx, cz), cz);
        this.group.add(wh);
    }

    // ===== Evans Hall — the infamous 12-story Brutalist math tower =====
    createEvansHall() {
        const ev = new THREE.Group();
        ev.userData = {
            name: 'Evans Hall',
            isInteractable: true,
            type: 'building',
            interactionType: 'Enter'
        };

        // Materials — raw board-formed concrete, weathered and a little grim
        const concreteMat = new THREE.MeshStandardMaterial({
            color: 0x9E9686, emissive: 0x0E0C08, roughness: 0.92, metalness: 0.03
        });
        const concreteDark = new THREE.MeshStandardMaterial({
            color: 0x7B746A, emissive: 0x080706, roughness: 0.95
        });
        const windowMat = new THREE.MeshStandardMaterial({
            color: 0x2C3238, roughness: 0.3, metalness: 0.3,
            transparent: true, opacity: 0.7
        });
        const roofEquipMat = new THREE.MeshStandardMaterial({
            color: 0x5C5B56, roughness: 0.8, metalness: 0.2
        });

        // Dimensions (actual Evans Hall is ~55m tall, 12 stories; footprint ~40m x 24m)
        const floors = 12;
        const floorH = 3.9;
        const w = 36, d = 24;
        const totalH = floors * floorH;
        const cx = 75, cz = -65; // Northeast of Doe Library

        // Stepped plaza base (slightly wider than the tower)
        const plaza = new THREE.Mesh(
            new THREE.BoxGeometry(w + 8, 0.6, d + 6), concreteDark
        );
        plaza.position.y = 0.3;
        plaza.receiveShadow = true;
        ev.add(plaza);

        // Concrete tower body
        const body = new THREE.Mesh(
            new THREE.BoxGeometry(w, totalH, d), concreteMat
        );
        body.position.y = 0.6 + totalH / 2;
        body.castShadow = true;
        body.receiveShadow = true;
        ev.add(body);

        // Horizontal spandrel bands between each floor — the signature ribbed look
        for (let f = 0; f <= floors; f++) {
            const spY = 0.6 + f * floorH;
            const band = new THREE.Mesh(
                new THREE.BoxGeometry(w + 0.4, 0.7, d + 0.4), concreteDark
            );
            band.position.y = spY;
            band.castShadow = true;
            ev.add(band);
        }

        // Recessed ribbon windows on each floor (north & south long faces)
        const windowStripH = floorH - 1.2;
        for (let f = 0; f < floors; f++) {
            const wy = 0.6 + f * floorH + floorH / 2;
            for (const sz of [d / 2 + 0.02, -d / 2 - 0.02]) {
                const strip = new THREE.Mesh(
                    new THREE.PlaneGeometry(w - 2, windowStripH), windowMat
                );
                strip.position.set(0, wy, sz);
                strip.rotation.y = sz > 0 ? 0 : Math.PI;
                ev.add(strip);

                // Vertical concrete mullions breaking up the strip
                const mullionCount = 9;
                for (let m = 1; m < mullionCount; m++) {
                    const mullion = new THREE.Mesh(
                        new THREE.BoxGeometry(0.3, windowStripH + 0.4, 0.1),
                        concreteMat
                    );
                    mullion.position.set(
                        -w / 2 + 1 + m * ((w - 2) / mullionCount),
                        wy, sz + (sz > 0 ? 0.06 : -0.06)
                    );
                    ev.add(mullion);
                }
            }
            // Short (east & west) facades — narrower window bands
            for (const sx of [w / 2 + 0.02, -w / 2 - 0.02]) {
                const strip = new THREE.Mesh(
                    new THREE.PlaneGeometry(d - 2, windowStripH), windowMat
                );
                strip.position.set(sx, wy, 0);
                strip.rotation.y = sx > 0 ? Math.PI / 2 : -Math.PI / 2;
                ev.add(strip);
            }
        }

        // Vertical concrete pilasters at corners
        for (const sx of [-1, 1]) {
            for (const sz of [-1, 1]) {
                const pil = new THREE.Mesh(
                    new THREE.BoxGeometry(1.8, totalH + 0.4, 1.8), concreteMat
                );
                pil.position.set(sx * (w / 2), 0.6 + totalH / 2, sz * (d / 2));
                pil.castShadow = true;
                ev.add(pil);
            }
        }

        // Roof slab + mechanical penthouse + antennas
        const roofSlab = new THREE.Mesh(
            new THREE.BoxGeometry(w + 1.5, 0.9, d + 1.5), concreteDark
        );
        roofSlab.position.y = 0.6 + totalH + 0.45;
        ev.add(roofSlab);

        const penthouse = new THREE.Mesh(
            new THREE.BoxGeometry(w * 0.55, 4, d * 0.55), concreteMat
        );
        penthouse.position.y = 0.6 + totalH + 2.9;
        penthouse.castShadow = true;
        ev.add(penthouse);

        // HVAC boxes
        for (let i = 0; i < 3; i++) {
            const hvac = new THREE.Mesh(
                new THREE.BoxGeometry(3, 1.2, 4), roofEquipMat
            );
            hvac.position.set(-7 + i * 7, 0.6 + totalH + 1.5, 6);
            ev.add(hvac);
        }

        // Radio antenna on roof
        const mast = new THREE.Mesh(
            new THREE.CylinderGeometry(0.08, 0.08, 6, 6), roofEquipMat
        );
        mast.position.set(-w * 0.2, 0.6 + totalH + 7, 0);
        ev.add(mast);

        // Ground-floor entrance (recessed arcade)
        const arcadeMat = new THREE.MeshStandardMaterial({
            color: 0x2A2724, roughness: 0.85
        });
        const arcade = new THREE.Mesh(
            new THREE.BoxGeometry(w - 6, floorH - 0.6, 1.2), arcadeMat
        );
        arcade.position.set(0, 0.6 + floorH / 2, -d / 2 + 0.6);
        ev.add(arcade);

        // Building sign
        const signMat = new THREE.MeshStandardMaterial({
            color: 0x1F1F1F, emissive: 0x050505, roughness: 0.6
        });
        const sign = new THREE.Mesh(
            new THREE.BoxGeometry(8, 1.4, 0.15), signMat
        );
        sign.position.set(0, 0.6 + floorH - 1.2, -d / 2 - 0.1);
        ev.add(sign);

        ev.position.set(cx, this.getTerrainHeight(cx, cz), cz);
        // Orient long face north-south (matches the real building roughly)
        this.group.add(ev);
    }

    // ===== Winding road up the hill to SLMath =====
    createHillRoad() {
        const pathMat = new THREE.MeshStandardMaterial({
            color: 0xA49A82, roughness: 0.9
        });
        // A switchback trail from campus NE corner up to the summit
        const start = { x: 90, z: -80 };
        const end = this.SLMATH_ORIGIN;

        const points = [];
        const steps = 24;
        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            // Curve path with two switchbacks
            const bend = Math.sin(t * Math.PI * 2) * 12;
            const px = start.x + (end.x - start.x) * t + bend * Math.cos(t * Math.PI);
            const pz = start.z + (end.z - start.z) * t + bend * Math.sin(t * Math.PI);
            points.push({ x: px, z: pz });
        }
        this.laySegmentedPath(points, 3.2, pathMat);

        // Stone stair section approaching the summit
        const stairMat = new THREE.MeshStandardMaterial({
            color: 0xB8B0A0, roughness: 0.85
        });
        const last = points[points.length - 1];
        for (let i = 0; i < 10; i++) {
            const t = i / 10;
            const sx = last.x - 18 + t * 16;
            const sz = last.z + 14 - t * 12;
            const step = new THREE.Mesh(
                new THREE.BoxGeometry(4, 0.3, 1.4), stairMat
            );
            const h = this.getTerrainHeight(sx, sz);
            step.position.set(sx, h + 0.05 + i * 0.3, sz);
            step.rotation.y = Math.atan2(16, -12);
            step.receiveShadow = true;
            step.userData.noCollision = true;
            this.group.add(step);
        }
    }

    // ===== Redwoods & vegetation covering the hillside =====
    createHillRedwoods() {
        const trunkMat = new THREE.MeshStandardMaterial({
            color: 0x5C3D2E, roughness: 0.95
        });
        const foliageMatPool = [
            new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(0.32, 0.5, 0.2), roughness: 0.85 }),
            new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(0.34, 0.55, 0.22), roughness: 0.85 }),
            new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(0.3, 0.45, 0.18), roughness: 0.85 })
        ];

        const h0 = this.SLMATH_ORIGIN;
        for (let i = 0; i < 80; i++) {
            // Polar sampling around the hill
            const angle = Math.random() * Math.PI * 2;
            const dist = 26 + Math.random() * (this.HILL_RADIUS - 20);
            const x = h0.x + Math.cos(angle) * dist;
            const z = h0.z + Math.sin(angle) * dist;
            if (this.isOnPath(x, z)) continue;
            if (this.isNearBuilding(x, z)) continue;

            const tree = this.createRedwood(trunkMat, foliageMatPool[i % 3]);
            tree.position.set(x, this.getTerrainHeight(x, z), z);
            tree.scale.setScalar(0.7 + Math.random() * 0.9);
            this.group.add(tree);
        }
    }

    createRedwood(trunkMat, foliageMat) {
        const tree = new THREE.Group();
        const h = 16 + Math.random() * 10;
        const trunk = new THREE.Mesh(
            new THREE.CylinderGeometry(0.35, 0.7, h, 8), trunkMat
        );
        trunk.position.y = h / 2;
        trunk.castShadow = true;
        tree.add(trunk);

        const layers = [
            { y: h * 0.55, r: 3.2, fh: 3.8 },
            { y: h * 0.7, r: 2.7, fh: 3.2 },
            { y: h * 0.85, r: 2.1, fh: 2.6 },
            { y: h * 0.98, r: 1.4, fh: 2.2 }
        ];
        layers.forEach(l => {
            const cone = new THREE.Mesh(
                new THREE.ConeGeometry(l.r, l.fh, 8), foliageMat
            );
            cone.position.y = l.y;
            cone.castShadow = true;
            tree.add(cone);
        });
        return tree;
    }

    // ============================================================
    // ===== SLMath (Simons Laufer Mathematical Sciences Inst.) ===
    // ============================================================
    // A hilltop research institute with three distinct building volumes:
    //   1. Main wing    — wood-clad two-story block with horizontal ribbon
    //                    windows (original 1985 building, refurbished)
    //   2. Chern Hall   — glass-and-steel pavilion, 2015 addition
    //   3. Simons Auditorium — drum-shaped lecture theater with radial roof
    //   4. Eisenbud Aud. — smaller rectangular lecture room
    //   5. Central atrium with glass roof linking wings
    //   6. West-facing wooden terrace overlooking the Bay
    //   7. Entry plaza with bronze signage
    //   8. Solar array on the roof
    //   9. Landscaped planters and seating
    createSLMath() {
        const slmath = new THREE.Group();
        const origin = this.SLMATH_ORIGIN;

        // ---------- Shared Materials ----------
        const woodSidingMat = new THREE.MeshStandardMaterial({
            color: 0x8E5E3B, emissive: 0x150A05, roughness: 0.78, metalness: 0.02
        });
        const woodDarkMat = new THREE.MeshStandardMaterial({
            color: 0x6B432A, emissive: 0x0E0604, roughness: 0.82
        });
        const woodWarmMat = new THREE.MeshStandardMaterial({
            color: 0xA6784C, emissive: 0x1A0D06, roughness: 0.72
        });
        const steelMat = new THREE.MeshStandardMaterial({
            color: 0x37393C, roughness: 0.45, metalness: 0.7
        });
        const steelLightMat = new THREE.MeshStandardMaterial({
            color: 0x8A8F92, roughness: 0.4, metalness: 0.65
        });
        const glassMat = new THREE.MeshStandardMaterial({
            color: 0x9AB8C4, roughness: 0.05, metalness: 0.25,
            transparent: true, opacity: 0.5
        });
        const darkGlassMat = new THREE.MeshStandardMaterial({
            color: 0x3A5560, roughness: 0.1, metalness: 0.35,
            transparent: true, opacity: 0.75
        });
        const skylightMat = new THREE.MeshStandardMaterial({
            color: 0xB8D8E4, roughness: 0.08, metalness: 0.2,
            transparent: true, opacity: 0.45
        });
        const stoneMat = new THREE.MeshStandardMaterial({
            color: 0xC9C4B6, roughness: 0.82
        });
        const roofMat = new THREE.MeshStandardMaterial({
            color: 0x2E2E2E, roughness: 0.8
        });
        const solarMat = new THREE.MeshStandardMaterial({
            color: 0x1A2740, roughness: 0.25, metalness: 0.55
        });
        const deckMat = new THREE.MeshStandardMaterial({
            color: 0x7A4F30, roughness: 0.85
        });
        const railMat = new THREE.MeshStandardMaterial({
            color: 0x2D2D2D, roughness: 0.5, metalness: 0.7
        });
        const bronzeMat = new THREE.MeshStandardMaterial({
            color: 0x8B6F3E, emissive: 0x151008, roughness: 0.5, metalness: 0.85
        });

        // ================================================
        // 1. MAIN WING (two stories, wood-clad, flat roof)
        // ================================================
        const mainWing = new THREE.Group();
        mainWing.userData = {
            name: 'SLMath — Main Wing', isInteractable: true,
            type: 'building', interactionType: 'Enter'
        };
        const mw = 28, md = 14, mh = 8.5; // Two stories ~4.25m each
        const mainX = 0, mainZ = 0;

        // Base / foundation
        const mainBase = new THREE.Mesh(
            new THREE.BoxGeometry(mw + 0.6, 1, md + 0.6), stoneMat
        );
        mainBase.position.set(mainX, 0.5, mainZ);
        mainWing.add(mainBase);

        // Main body
        const mainBody = new THREE.Mesh(
            new THREE.BoxGeometry(mw, mh, md), woodSidingMat
        );
        mainBody.position.set(mainX, 1 + mh / 2, mainZ);
        mainBody.castShadow = true;
        mainBody.receiveShadow = true;
        mainWing.add(mainBody);

        // Vertical wood plank pattern (alternating shade strips)
        const plankCount = 18;
        for (let i = 0; i < plankCount; i++) {
            if (i % 3 !== 0) continue;
            const px = -mw / 2 + (i + 0.5) * (mw / plankCount);
            for (const sz of [md / 2 + 0.015, -md / 2 - 0.015]) {
                const plank = new THREE.Mesh(
                    new THREE.BoxGeometry(mw / plankCount * 0.9, mh - 0.4, 0.06),
                    woodDarkMat
                );
                plank.position.set(mainX + px, 1 + mh / 2, mainZ + sz);
                mainWing.add(plank);
            }
        }

        // Horizontal mid-band (between stories) — dark metal trim
        const midBand = new THREE.Mesh(
            new THREE.BoxGeometry(mw + 0.2, 0.25, md + 0.2), steelMat
        );
        midBand.position.set(mainX, 1 + mh / 2, mainZ);
        mainWing.add(midBand);

        // Ribbon windows — long horizontal strips on each floor, each facade
        for (let floor = 0; floor < 2; floor++) {
            const wy = 1 + 1.4 + floor * 4.25;
            // Long sides
            for (const sz of [md / 2 + 0.01, -md / 2 - 0.01]) {
                const ribbon = new THREE.Mesh(
                    new THREE.PlaneGeometry(mw - 2.5, 1.8), darkGlassMat
                );
                ribbon.position.set(mainX, wy, mainZ + sz);
                ribbon.rotation.y = sz > 0 ? 0 : Math.PI;
                mainWing.add(ribbon);

                // Vertical mullions dividing the ribbon into panels
                for (let m = 1; m < 6; m++) {
                    const mull = new THREE.Mesh(
                        new THREE.BoxGeometry(0.08, 1.85, 0.06), steelMat
                    );
                    mull.position.set(
                        mainX - mw / 2 + 1.25 + m * ((mw - 2.5) / 6),
                        wy, mainZ + sz + (sz > 0 ? 0.03 : -0.03)
                    );
                    mainWing.add(mull);
                }
            }
            // Short sides
            for (const sx of [mw / 2 + 0.01, -mw / 2 - 0.01]) {
                const side = new THREE.Mesh(
                    new THREE.PlaneGeometry(md - 2.5, 1.8), darkGlassMat
                );
                side.position.set(mainX + sx, wy, mainZ);
                side.rotation.y = sx > 0 ? Math.PI / 2 : -Math.PI / 2;
                mainWing.add(side);
            }
        }

        // Flat roof with cornice
        const mainRoof = new THREE.Mesh(
            new THREE.BoxGeometry(mw + 0.8, 0.5, md + 0.8), steelMat
        );
        mainRoof.position.set(mainX, 1 + mh + 0.25, mainZ);
        mainRoof.castShadow = true;
        mainWing.add(mainRoof);

        // Rooftop solar array
        for (let i = 0; i < 5; i++) {
            for (let j = 0; j < 3; j++) {
                const panel = new THREE.Mesh(
                    new THREE.BoxGeometry(3.6, 0.12, 1.8), solarMat
                );
                panel.position.set(
                    mainX - 9 + i * 4.5,
                    1 + mh + 0.7,
                    mainZ - 4 + j * 4
                );
                panel.rotation.x = -0.25; // Tilted south
                mainWing.add(panel);
            }
        }

        // Interior hint: visible bookshelves + chalkboard through ground-floor windows
        const bookShelfMat = new THREE.MeshStandardMaterial({
            color: 0x4A2E1E, roughness: 0.85
        });
        const chalkMat = new THREE.MeshStandardMaterial({
            color: 0x183C2E, roughness: 0.78
        });
        for (let i = 0; i < 4; i++) {
            const shelf = new THREE.Mesh(
                new THREE.BoxGeometry(2.2, 2.8, 0.4), bookShelfMat
            );
            shelf.position.set(mainX - 8 + i * 5, 1 + 1.5, mainZ - md / 2 + 1);
            mainWing.add(shelf);
            // Colorful book bindings on shelf
            for (let b = 0; b < 15; b++) {
                const book = new THREE.Mesh(
                    new THREE.BoxGeometry(0.1, 0.4, 0.28),
                    new THREE.MeshStandardMaterial({
                        color: new THREE.Color().setHSL(Math.random(), 0.5, 0.35),
                        roughness: 0.75
                    })
                );
                book.position.set(
                    shelf.position.x - 1 + b * 0.14,
                    1 + 2.5,
                    mainZ - md / 2 + 0.82
                );
                mainWing.add(book);
            }
        }
        const interiorChalk = new THREE.Mesh(
            new THREE.BoxGeometry(6, 2, 0.1), chalkMat
        );
        interiorChalk.position.set(mainX + 10, 1 + 2, mainZ - md / 2 + 0.8);
        mainWing.add(interiorChalk);

        slmath.add(mainWing);

        // ================================================
        // 2. CHERN HALL — glass + steel pavilion (2015)
        // ================================================
        const chern = new THREE.Group();
        chern.userData = {
            name: 'Chern Hall', isInteractable: true,
            type: 'building', interactionType: 'Enter'
        };
        const chw = 18, chd = 12, chh = 7;
        const chernX = mainX + mw / 2 + 2 + chw / 2;
        const chernZ = mainZ + 2;

        // Steel frame skeleton (corner columns)
        for (const sx of [-1, 1]) {
            for (const sz of [-1, 1]) {
                const col = new THREE.Mesh(
                    new THREE.BoxGeometry(0.4, chh + 1, 0.4), steelMat
                );
                col.position.set(chernX + sx * chw / 2, 1 + (chh + 1) / 2, chernZ + sz * chd / 2);
                col.castShadow = true;
                chern.add(col);
            }
        }
        // Horizontal beams
        for (const sz of [-1, 1]) {
            const beam = new THREE.Mesh(
                new THREE.BoxGeometry(chw + 0.4, 0.3, 0.3), steelMat
            );
            beam.position.set(chernX, 1 + chh, chernZ + sz * chd / 2);
            chern.add(beam);
            const beamT = beam.clone(); beamT.position.y = 1;
            chern.add(beamT);
        }
        for (const sx of [-1, 1]) {
            const beam = new THREE.Mesh(
                new THREE.BoxGeometry(0.3, 0.3, chd + 0.4), steelMat
            );
            beam.position.set(chernX + sx * chw / 2, 1 + chh, chernZ);
            chern.add(beam);
        }

        // Floor slab
        const chernFloor = new THREE.Mesh(
            new THREE.BoxGeometry(chw + 0.6, 0.4, chd + 0.6), stoneMat
        );
        chernFloor.position.set(chernX, 1, chernZ);
        chern.add(chernFloor);

        // Glass curtain walls — four sides
        for (const [sx, sz, rot] of [
            [0, chd / 2 + 0.01, 0],
            [0, -chd / 2 - 0.01, Math.PI],
            [chw / 2 + 0.01, 0, Math.PI / 2],
            [-chw / 2 - 0.01, 0, -Math.PI / 2]
        ]) {
            const wallLen = (rot === 0 || Math.abs(rot - Math.PI) < 0.01) ? chw : chd;
            const glass = new THREE.Mesh(
                new THREE.PlaneGeometry(wallLen - 0.5, chh - 0.5), glassMat
            );
            glass.position.set(chernX + sx, 1 + chh / 2, chernZ + sz);
            glass.rotation.y = rot;
            chern.add(glass);

            // Mullions
            const panels = Math.floor(wallLen / 2);
            for (let p = 1; p < panels; p++) {
                const mull = new THREE.Mesh(
                    new THREE.BoxGeometry(0.1, chh - 0.4, 0.1), steelMat
                );
                if (Math.abs(rot) < 0.01 || Math.abs(rot - Math.PI) < 0.01) {
                    mull.position.set(
                        chernX - wallLen / 2 + p * (wallLen / panels),
                        1 + chh / 2,
                        chernZ + sz
                    );
                } else {
                    mull.position.set(
                        chernX + sx,
                        1 + chh / 2,
                        chernZ - wallLen / 2 + p * (wallLen / panels)
                    );
                }
                chern.add(mull);
            }
            // Horizontal mid-mullion
            const hmull = new THREE.Mesh(
                new THREE.BoxGeometry(
                    (rot === 0 || Math.abs(rot - Math.PI) < 0.01) ? wallLen - 0.5 : 0.08,
                    0.08,
                    (rot === 0 || Math.abs(rot - Math.PI) < 0.01) ? 0.08 : wallLen - 0.5
                ),
                steelMat
            );
            hmull.position.set(chernX + sx, 1 + chh / 2, chernZ + sz);
            chern.add(hmull);
        }

        // Cantilevered flat roof with overhang
        const chernRoof = new THREE.Mesh(
            new THREE.BoxGeometry(chw + 3, 0.4, chd + 3), steelLightMat
        );
        chernRoof.position.set(chernX, 1 + chh + 1.2, chernZ);
        chernRoof.castShadow = true;
        chern.add(chernRoof);

        // Wood soffit under the overhang
        const soffit = new THREE.Mesh(
            new THREE.BoxGeometry(chw + 2.8, 0.08, chd + 2.8), woodWarmMat
        );
        soffit.position.set(chernX, 1 + chh + 1.0, chernZ);
        chern.add(soffit);

        // Interior: large table with chairs (collaboration room)
        const tableMat = new THREE.MeshStandardMaterial({
            color: 0x7A4E2E, roughness: 0.7
        });
        const table = new THREE.Mesh(
            new THREE.BoxGeometry(8, 0.15, 3), tableMat
        );
        table.position.set(chernX, 2, chernZ);
        chern.add(table);
        for (const x of [-3, -1, 1, 3]) {
            for (const sz of [-1.8, 1.8]) {
                const chairSeat = new THREE.Mesh(
                    new THREE.BoxGeometry(0.6, 0.08, 0.6), steelMat
                );
                chairSeat.position.set(chernX + x, 1.5, chernZ + sz);
                chern.add(chairSeat);
                const chairBack = new THREE.Mesh(
                    new THREE.BoxGeometry(0.6, 1.0, 0.08),
                    new THREE.MeshStandardMaterial({ color: 0xC82030, roughness: 0.6 })
                );
                chairBack.position.set(
                    chernX + x, 2.0,
                    chernZ + sz + (sz > 0 ? 0.3 : -0.3)
                );
                chern.add(chairBack);
            }
        }

        slmath.add(chern);

        // ================================================
        // 3. SIMONS AUDITORIUM — cylindrical drum
        // ================================================
        const sim = new THREE.Group();
        sim.userData = {
            name: 'Simons Auditorium', isInteractable: true,
            type: 'building', interactionType: 'Enter'
        };
        const simR = 8;      // Radius
        const simH = 9;      // Height
        const simX = mainX - mw / 2 - simR - 2;
        const simZ = mainZ - 4;

        const drum = new THREE.Mesh(
            new THREE.CylinderGeometry(simR, simR, simH, 32, 1, false),
            woodWarmMat
        );
        drum.position.set(simX, 1 + simH / 2, simZ);
        drum.castShadow = true;
        drum.receiveShadow = true;
        sim.add(drum);

        // Radial wooden fins around the drum (signature detail)
        for (let i = 0; i < 24; i++) {
            const a = (i / 24) * Math.PI * 2;
            const fin = new THREE.Mesh(
                new THREE.BoxGeometry(0.15, simH - 0.6, 0.4), woodDarkMat
            );
            fin.position.set(
                simX + Math.cos(a) * (simR + 0.22),
                1 + simH / 2,
                simZ + Math.sin(a) * (simR + 0.22)
            );
            fin.rotation.y = -a + Math.PI / 2;
            sim.add(fin);
        }

        // Clerestory band of small windows near the top
        for (let i = 0; i < 16; i++) {
            const a = (i / 16) * Math.PI * 2;
            const win = new THREE.Mesh(
                new THREE.PlaneGeometry(1.6, 0.9), darkGlassMat
            );
            win.position.set(
                simX + Math.cos(a) * (simR + 0.01),
                1 + simH - 1.2,
                simZ + Math.sin(a) * (simR + 0.01)
            );
            win.lookAt(new THREE.Vector3(simX, win.position.y, simZ));
            win.rotateY(Math.PI);
            sim.add(win);
        }

        // Conical slate-like roof with radial ribs
        const roof = new THREE.Mesh(
            new THREE.ConeGeometry(simR + 0.4, 3.5, 32), roofMat
        );
        roof.position.set(simX, 1 + simH + 1.75, simZ);
        roof.castShadow = true;
        sim.add(roof);

        // Skylight oculus at the roof apex
        const oculus = new THREE.Mesh(
            new THREE.CylinderGeometry(1.1, 1.1, 0.8, 16),
            skylightMat
        );
        oculus.position.set(simX, 1 + simH + 3.8, simZ);
        sim.add(oculus);
        const oculusRing = new THREE.Mesh(
            new THREE.TorusGeometry(1.2, 0.12, 8, 16), steelMat
        );
        oculusRing.rotation.x = Math.PI / 2;
        oculusRing.position.copy(oculus.position);
        sim.add(oculusRing);

        // Entrance from the main wing side
        const simDoor = new THREE.Mesh(
            new THREE.BoxGeometry(2.8, 3.2, 0.3),
            new THREE.MeshStandardMaterial({ color: 0x1E1A16, roughness: 0.6 })
        );
        const doorA = 0; // East side (toward main wing)
        simDoor.position.set(
            simX + Math.cos(doorA) * (simR + 0.05),
            1 + 1.6,
            simZ + Math.sin(doorA) * (simR + 0.05)
        );
        simDoor.lookAt(new THREE.Vector3(simX, simDoor.position.y, simZ));
        simDoor.rotateY(Math.PI);
        sim.add(simDoor);

        // Interior (faintly visible): raked auditorium seating
        const seatMat = new THREE.MeshStandardMaterial({
            color: 0x3A2620, roughness: 0.85
        });
        for (let row = 0; row < 4; row++) {
            const radius = simR * 0.35 + row * 1.2;
            const arcSegments = 10;
            for (let i = 0; i < arcSegments; i++) {
                const a = Math.PI * 0.25 + (i / arcSegments) * Math.PI * 1.5;
                const seat = new THREE.Mesh(
                    new THREE.BoxGeometry(0.7, 0.4, 0.7), seatMat
                );
                seat.position.set(
                    simX + Math.cos(a) * radius,
                    1 + 0.3 + row * 0.35,
                    simZ + Math.sin(a) * radius
                );
                sim.add(seat);
            }
        }

        slmath.add(sim);

        // ================================================
        // 4. EISENBUD AUDITORIUM — smaller rectangular lecture room
        // ================================================
        const eis = new THREE.Group();
        eis.userData = {
            name: 'Eisenbud Auditorium', isInteractable: true,
            type: 'building', interactionType: 'Enter'
        };
        const ew = 10, ed = 8, eh = 6;
        const eisX = mainX + mw / 2 + 4;
        const eisZ = mainZ - md / 2 - ed / 2 - 1;

        const eisBody = new THREE.Mesh(
            new THREE.BoxGeometry(ew, eh, ed), woodSidingMat
        );
        eisBody.position.set(eisX, 1 + eh / 2, eisZ);
        eisBody.castShadow = true;
        eis.add(eisBody);

        const eisRoof = new THREE.Mesh(
            new THREE.BoxGeometry(ew + 0.6, 0.3, ed + 0.6), steelMat
        );
        eisRoof.position.set(eisX, 1 + eh + 0.15, eisZ);
        eis.add(eisRoof);

        // Single tall clerestory window
        const eisWindow = new THREE.Mesh(
            new THREE.PlaneGeometry(ew - 2, 1.2), darkGlassMat
        );
        eisWindow.position.set(eisX, 1 + eh - 1.2, eisZ + ed / 2 + 0.01);
        eis.add(eisWindow);

        // Name sign
        const eisSign = new THREE.Mesh(
            new THREE.BoxGeometry(3, 0.4, 0.1), bronzeMat
        );
        eisSign.position.set(eisX, 1 + 4, eisZ + ed / 2 + 0.05);
        eis.add(eisSign);

        slmath.add(eis);

        // ================================================
        // 5. CENTRAL ATRIUM — glass-roofed link between Main & Chern
        // ================================================
        const atrium = new THREE.Group();
        const aw = 6, ad = 8, ah = 6.5;
        const atriumX = mainX + mw / 2 + 1;
        const atriumZ = mainZ;

        // Floor
        const atriumFloor = new THREE.Mesh(
            new THREE.BoxGeometry(aw, 0.3, ad), stoneMat
        );
        atriumFloor.position.set(atriumX, 1 + 0.15, atriumZ);
        atrium.add(atriumFloor);

        // Four corner posts
        for (const sx of [-1, 1]) {
            for (const sz of [-1, 1]) {
                const post = new THREE.Mesh(
                    new THREE.BoxGeometry(0.25, ah, 0.25), steelMat
                );
                post.position.set(
                    atriumX + sx * aw / 2, 1 + ah / 2, atriumZ + sz * ad / 2
                );
                atrium.add(post);
            }
        }

        // Glass roof (skylight)
        const atriumRoof = new THREE.Mesh(
            new THREE.PlaneGeometry(aw, ad), skylightMat
        );
        atriumRoof.rotation.x = -Math.PI / 2;
        atriumRoof.position.set(atriumX, 1 + ah + 0.05, atriumZ);
        atrium.add(atriumRoof);

        // Roof cross-bracing (skylight grid)
        for (let i = 1; i < 4; i++) {
            const bar = new THREE.Mesh(
                new THREE.BoxGeometry(aw, 0.08, 0.08), steelMat
            );
            bar.position.set(atriumX, 1 + ah + 0.1, atriumZ - ad / 2 + i * (ad / 4));
            atrium.add(bar);
        }

        // Feature: a hanging pendulum / math sculpture
        const sculptureMat = new THREE.MeshStandardMaterial({
            color: 0xCFA84A, emissive: 0x201808, roughness: 0.4, metalness: 0.85
        });
        const pendulumCord = new THREE.Mesh(
            new THREE.CylinderGeometry(0.02, 0.02, ah - 1.2, 6), steelMat
        );
        pendulumCord.position.set(atriumX, 1 + ah / 2 + 0.6, atriumZ);
        atrium.add(pendulumCord);
        const pendulumBob = new THREE.Mesh(
            new THREE.SphereGeometry(0.4, 16, 12), sculptureMat
        );
        pendulumBob.position.set(atriumX, 1 + 1.6, atriumZ);
        atrium.add(pendulumBob);

        // Sand tray underneath (Foucault pendulum trace)
        const tray = new THREE.Mesh(
            new THREE.CylinderGeometry(1.6, 1.6, 0.1, 24),
            new THREE.MeshStandardMaterial({ color: 0xE5DABA, roughness: 0.95 })
        );
        tray.position.set(atriumX, 1 + 0.35, atriumZ);
        atrium.add(tray);

        slmath.add(atrium);

        // ================================================
        // 6. WEST TERRACE — wooden deck with Bay view
        // ================================================
        const terrace = new THREE.Group();
        const tw = 16, td = 6;
        const terX = mainX - mw / 2 - simR * 2 - 8;
        const terZ = mainZ + md / 2 + td / 2 + 2;

        // Actually make terrace attached to the west side of the main wing
        const terraceX = mainX;
        const terraceZ = mainZ + md / 2 + td / 2 + 0.4;

        // Deck
        const deck = new THREE.Mesh(
            new THREE.BoxGeometry(tw, 0.3, td), deckMat
        );
        deck.position.set(terraceX, 1 + 0.15, terraceZ);
        deck.receiveShadow = true;
        terrace.add(deck);

        // Wood plank lines
        for (let i = 0; i < 18; i++) {
            if (i % 2 === 0) continue;
            const plank = new THREE.Mesh(
                new THREE.BoxGeometry(tw, 0.02, 0.18), woodDarkMat
            );
            plank.position.set(terraceX, 1 + 0.31, terraceZ - td / 2 + (i + 0.5) * (td / 18));
            terrace.add(plank);
        }

        // Glass railing (three sides, leaving the building side open)
        const railH = 1.1;
        const addRailSegment = (x0, z0, x1, z1) => {
            const dx = x1 - x0, dz = z1 - z0;
            const len = Math.sqrt(dx * dx + dz * dz);
            const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
            const glass = new THREE.Mesh(
                new THREE.PlaneGeometry(len, railH - 0.15), glassMat
            );
            glass.position.set(cx, 1 + 0.3 + railH / 2, cz);
            glass.rotation.y = Math.atan2(dx, dz) + Math.PI / 2;
            terrace.add(glass);
            const topRail = new THREE.Mesh(
                new THREE.BoxGeometry(len, 0.08, 0.08), railMat
            );
            topRail.position.set(cx, 1 + 0.3 + railH, cz);
            topRail.rotation.y = Math.atan2(dx, dz);
            terrace.add(topRail);
        };
        const tx0 = terraceX - tw / 2, tx1 = terraceX + tw / 2;
        const tz0 = terraceZ - td / 2, tz1 = terraceZ + td / 2;
        addRailSegment(tx0, tz1, tx1, tz1); // Far edge (west, the view side)
        addRailSegment(tx0, tz0, tx0, tz1); // North edge
        addRailSegment(tx1, tz0, tx1, tz1); // South edge

        // Railing posts
        for (let i = 0; i < 9; i++) {
            const px = terraceX - tw / 2 + i * (tw / 8);
            const post = new THREE.Mesh(
                new THREE.CylinderGeometry(0.06, 0.06, railH, 8), railMat
            );
            post.position.set(px, 1 + 0.3 + railH / 2, tz1);
            terrace.add(post);
        }

        // Terrace furniture — pair of wood benches and planters
        for (const [bx, bz] of [[-5, 0], [5, 0]]) {
            const benchSeat = new THREE.Mesh(
                new THREE.BoxGeometry(3, 0.15, 0.7), woodWarmMat
            );
            benchSeat.position.set(terraceX + bx, 1 + 0.8, terraceZ + bz - 1);
            terrace.add(benchSeat);
            for (const lx of [-1.3, 1.3]) {
                const leg = new THREE.Mesh(
                    new THREE.BoxGeometry(0.15, 0.7, 0.7), woodDarkMat
                );
                leg.position.set(terraceX + bx + lx, 1 + 0.4, terraceZ + bz - 1);
                terrace.add(leg);
            }
        }

        // Planter boxes with small greenery
        for (const px of [-7, 7]) {
            const planter = new THREE.Mesh(
                new THREE.BoxGeometry(1.4, 0.5, 1.4), woodDarkMat
            );
            planter.position.set(terraceX + px, 1 + 0.55, terraceZ + td / 2 - 1);
            terrace.add(planter);
            const shrub = new THREE.Mesh(
                new THREE.SphereGeometry(0.7, 10, 8),
                new THREE.MeshStandardMaterial({
                    color: new THREE.Color().setHSL(0.33, 0.55, 0.32), roughness: 0.9
                })
            );
            shrub.scale.set(1, 0.7, 1);
            shrub.position.set(terraceX + px, 1 + 1.1, terraceZ + td / 2 - 1);
            terrace.add(shrub);
        }

        // A small bronze telescope pointing west (symbolic bay view)
        const telescope = new THREE.Group();
        const tripod = new THREE.Mesh(
            new THREE.CylinderGeometry(0.04, 0.1, 1.2, 6), railMat
        );
        tripod.position.y = 0.6;
        telescope.add(tripod);
        const scope = new THREE.Mesh(
            new THREE.CylinderGeometry(0.08, 0.1, 0.9, 12), bronzeMat
        );
        scope.rotation.z = Math.PI / 2;
        scope.position.set(0, 1.25, 0);
        telescope.add(scope);
        telescope.position.set(terraceX, 1 + 0.3, terraceZ + td / 2 - 0.6);
        telescope.rotation.y = Math.PI; // Pointing west (away from building)
        terrace.add(telescope);

        slmath.add(terrace);

        // ================================================
        // 7. ENTRY PLAZA + SIGNAGE (east / approach side)
        // ================================================
        const plaza = new THREE.Group();
        const px = mainX + mw / 2 + 6;
        const pz = mainZ + md / 2 + 4;

        const plazaBase = new THREE.Mesh(
            new THREE.BoxGeometry(10, 0.25, 10), stoneMat
        );
        plazaBase.position.set(px, 0.6, pz);
        plazaBase.receiveShadow = true;
        plaza.add(plazaBase);

        // Signage monolith
        const monolith = new THREE.Mesh(
            new THREE.BoxGeometry(3.5, 1.4, 0.5),
            new THREE.MeshStandardMaterial({ color: 0x2A251F, roughness: 0.7 })
        );
        monolith.position.set(px + 3, 0.6 + 0.7, pz - 3);
        monolith.castShadow = true;
        plaza.add(monolith);

        // "SLMath" bronze letters on the monolith
        const letterY = 0.6 + 0.8;
        const letterWords = 'SLMath'.split('');
        letterWords.forEach((ch, i) => {
            const letter = new THREE.Mesh(
                new THREE.BoxGeometry(0.32, 0.5, 0.1), bronzeMat
            );
            letter.position.set(px + 3 - 1.1 + i * 0.4, letterY, pz - 3 + 0.3);
            plaza.add(letter);
        });

        // Concrete stepping-stones leading to the door
        for (let i = 0; i < 5; i++) {
            const step = new THREE.Mesh(
                new THREE.BoxGeometry(1.2, 0.1, 0.8), stoneMat
            );
            step.position.set(px - 1 - i * 1.3, 0.75, pz - 2 - i * 0.2);
            plaza.add(step);
        }

        // Entry canopy over the door
        const canopy = new THREE.Mesh(
            new THREE.BoxGeometry(4, 0.15, 3), steelMat
        );
        canopy.position.set(mainX + mw / 2 - 2, 1 + 3.2, mainZ + md / 2 + 1.5);
        canopy.castShadow = true;
        plaza.add(canopy);
        const canopyEdge = new THREE.Mesh(
            new THREE.BoxGeometry(4, 0.08, 3), woodWarmMat
        );
        canopyEdge.position.set(mainX + mw / 2 - 2, 1 + 3.15, mainZ + md / 2 + 1.5);
        plaza.add(canopyEdge);
        // Canopy posts
        for (const sx of [-1, 1]) {
            const post = new THREE.Mesh(
                new THREE.CylinderGeometry(0.1, 0.1, 3.1, 8), steelMat
            );
            post.position.set(mainX + mw / 2 - 2 + sx * 1.8, 1 + 1.6, mainZ + md / 2 + 3);
            plaza.add(post);
        }

        // Front door
        const frontDoor = new THREE.Mesh(
            new THREE.BoxGeometry(2.2, 3, 0.15),
            new THREE.MeshStandardMaterial({
                color: 0x101418, roughness: 0.25, metalness: 0.3,
                transparent: true, opacity: 0.8
            })
        );
        frontDoor.position.set(mainX + mw / 2 - 2, 1 + 1.5, mainZ + md / 2 + 0.05);
        plaza.add(frontDoor);

        slmath.add(plaza);

        // ================================================
        // 8. LANDSCAPE around the institute
        // ================================================
        // Boulder clusters
        const boulderMat = new THREE.MeshStandardMaterial({
            color: 0x7A7268, roughness: 0.95, flatShading: true
        });
        for (let i = 0; i < 10; i++) {
            const angle = Math.random() * Math.PI * 2;
            const r = 20 + Math.random() * 6;
            const bx = Math.cos(angle) * r;
            const bz = Math.sin(angle) * r;
            const boulder = new THREE.Mesh(
                new THREE.IcosahedronGeometry(0.6 + Math.random() * 0.8, 0),
                boulderMat
            );
            boulder.position.set(bx, 0.3, bz);
            boulder.rotation.set(Math.random(), Math.random(), Math.random());
            boulder.castShadow = true;
            slmath.add(boulder);
        }

        // Interactable rooftop exterior chalkboard near Chern Hall (favorite spot for scrawled proofs)
        const chalkboard = this.createChalkboard('SLMath Common Area');
        chalkboard.position.set(chernX, 1, chernZ + chd / 2 + 2);
        chalkboard.rotation.y = Math.PI;
        slmath.add(chalkboard);

        // ================================================
        // Position the whole institute on the hilltop
        // ================================================
        slmath.position.set(origin.x, this.getTerrainHeight(origin.x, origin.z), origin.z);
        // Rotate so the terrace faces west (toward the campus / bay)
        slmath.rotation.y = 0;

        this.group.add(slmath);
    }

    // ============================================================
    // ===== Telegraph Avenue district (south of campus) ==========
    // ============================================================
    // The four blocks between Bancroft Way and Dwight Way are the iconic
    // pedestrian strip south of UC Berkeley: street vendors, bookstores,
    // record shops, cafés, and People's Park. We compress each block to
    // ~50m (real is ~125m) to keep them walkable at player speed, but
    // preserve the full sequence of cross-streets and famous storefronts.
    createTelegraphDistrict() {
        const T = this.TELEGRAPH;
        const district = new THREE.Group();
        district.userData = { name: 'Telegraph Avenue', type: 'district' };

        // ---------- Materials (shared across district) ----------
        const asphaltMat = new THREE.MeshStandardMaterial({
            color: 0x2E2E30, roughness: 0.94, metalness: 0
        });
        const yellowStripeMat = new THREE.MeshBasicMaterial({ color: 0xE8D85C });
        const whiteStripeMat = new THREE.MeshBasicMaterial({ color: 0xDCDCD0 });
        const sidewalkMat = new THREE.MeshStandardMaterial({
            color: 0xB3ACA0, roughness: 0.88, metalness: 0
        });
        const curbMat = new THREE.MeshStandardMaterial({
            color: 0x6C6A64, roughness: 0.9
        });

        // ---------- Telegraph Avenue roadway ----------
        this._layRoadStrip(
            T.X - T.ROAD_HALFWIDTH, T.BANCROFT_Z - 4,
            T.X + T.ROAD_HALFWIDTH, T.SOUTH_END_Z + 4,
            asphaltMat, district
        );

        // ---------- Cross streets ----------
        const crossStreets = [
            { z: T.BANCROFT_Z, name: 'Bancroft Way' },
            { z: T.DURANT_Z, name: 'Durant Ave' },
            { z: T.CHANNING_Z, name: 'Channing Way' },
            { z: T.HASTE_Z, name: 'Haste St' },
            { z: T.DWIGHT_Z, name: 'Dwight Way' }
        ];
        const crossXStart = -55;
        const crossXEnd = 55;
        for (const cs of crossStreets) {
            this._layRoadStrip(
                crossXStart, cs.z - T.ROAD_HALFWIDTH,
                crossXEnd, cs.z + T.ROAD_HALFWIDTH,
                asphaltMat, district
            );
        }

        // ---------- Lane markings (dashed yellow double line) ----------
        this._addLaneStripes(T.X, T.BANCROFT_Z + 4, T.SOUTH_END_Z - 4, yellowStripeMat, district);

        // ---------- Crosswalks at each intersection ----------
        for (const cs of crossStreets) {
            this._addCrosswalk(T.X, cs.z, T.ROAD_HALFWIDTH, whiteStripeMat, district);
        }

        // ---------- Sidewalks on both sides of Telegraph ----------
        for (const side of [-1, 1]) {
            const innerX = side * (T.ROAD_HALFWIDTH + 0.15);
            const outerX = side * (T.ROAD_HALFWIDTH + T.SIDEWALK_WIDTH);
            this._laySidewalkStrip(
                Math.min(innerX, outerX), T.BANCROFT_Z - 4,
                Math.max(innerX, outerX), T.SOUTH_END_Z + 4,
                sidewalkMat, curbMat, side, district
            );
        }

        this.group.add(district);

        // ---------- Storefronts, block by block ----------
        const blocks = [
            { zN: T.BANCROFT_Z, zS: T.DURANT_Z, shops: {
                west: [
                    { name: "Caffé Strada",    facade: 0x8B5E3C, awning: 0xCE8C3E, stories: 2 },
                    { name: "Top Dog",         facade: 0xC43D3D, awning: 0xF1C843, stories: 1 },
                    { name: "Yali's Café",     facade: 0xC89957, awning: 0xA84E4A, stories: 2 }
                ],
                east: [
                    { name: "Pegasus Books",   facade: 0x3A5F7D, awning: 0x4A8A82, stories: 2 },
                    { name: "Henry's Pub",     facade: 0x6E4A2E, awning: 0x7D7557, stories: 2 },
                    { name: "Bear Deli",       facade: 0xA66C3D, awning: 0x7A6E3C, stories: 2 }
                ]
            }},
            { zN: T.DURANT_Z, zS: T.CHANNING_Z, shops: {
                west: [
                    { name: "Annapurna",       facade: 0xA85F3B, awning: 0xE2A752, stories: 2 },
                    { name: "Thai Basil",      facade: 0x6F8E5B, awning: 0xC9433A, stories: 2 },
                    { name: "Revival",         facade: 0x4D3F56, awning: 0x93725C, stories: 2 }
                ],
                east: [
                    { name: "Shakespeare & Co.", facade: 0x8B3A3A, awning: 0xDDC38C, stories: 2 },
                    { name: "Cream",           facade: 0xE0C9A0, awning: 0xB9453C, stories: 1 },
                    { name: "Raleigh's",       facade: 0x4A5A6B, awning: 0x6E8C4E, stories: 2 }
                ]
            }},
            { zN: T.CHANNING_Z, zS: T.HASTE_Z, shops: {
                west: [
                    { name: "Rasputin Music",  facade: 0x5E3C7B, awning: 0xC8AB52, stories: 2 },
                    { name: "Blondie's Pizza", facade: 0xD4A144, awning: 0xC3432B, stories: 1 },
                    { name: "Julie's Café",    facade: 0x8AA35F, awning: 0xD9D283, stories: 2 }
                ],
                east: [
                    { name: "Half-Price Books", facade: 0x8B4F2D, awning: 0xE8C75C, stories: 2 },
                    { name: "Walgreens",       facade: 0xD23939, awning: 0x2A3A6A, stories: 2 },
                    { name: "Herbal Wisdom",   facade: 0x4E6B3A, awning: 0x9E7A44, stories: 2 }
                ]
            }},
            { zN: T.HASTE_Z, zS: T.DWIGHT_Z, shops: {
                west: [
                    { name: "Amoeba Music",    facade: 0xC43D3D, awning: 0x202020, stories: 2 },
                    { name: "Moe's Books",     facade: 0x4D6E8A, awning: 0xC4A554, stories: 3 },
                    { name: "Caffè Mediterraneum", facade: 0x7E4F2E, awning: 0xD2B566, stories: 2 }
                ],
                east: [
                    { name: "Rasa Sayang",     facade: 0xB16A3A, awning: 0xE2C479, stories: 2 },
                    { name: "House of Curries", facade: 0xE6A23A, awning: 0xA84B33, stories: 2 },
                    { name: "People's Park ↗", facade: 0x8C9D5D, awning: 0x5F7548, stories: 1 }
                ]
            }}
        ];

        for (const block of blocks) this._populateBlockStorefronts(block);

        // ---------- Street trees in sidewalk tree-wells ----------
        this._addTelegraphStreetTrees();

        // ---------- Streetlights ----------
        this._addTelegraphStreetlights();

        // ---------- Sproul-adjacent Bancroft street cart (tip of the hat) ----------
        this._addCornerLandmark();
    }

    // Lay a flat road strip between (x1, z1) and (x2, z2). Assumes axis-aligned.
    // The strip is subdivided along its long axis so the surface follows terrain.
    _layRoadStrip(x1, z1, x2, z2, material, group) {
        const isNS = Math.abs(z2 - z1) > Math.abs(x2 - x1);
        const width = isNS ? Math.abs(x2 - x1) : Math.abs(z2 - z1);
        const length = isNS ? Math.abs(z2 - z1) : Math.abs(x2 - x1);
        const cx = (x1 + x2) / 2;
        const cz = (z1 + z2) / 2;

        // Subdivide the long axis so the road follows terrain
        const segments = Math.max(1, Math.ceil(length / 8));
        for (let i = 0; i < segments; i++) {
            const t = (i + 0.5) / segments;
            let segCx, segCz, segW, segL;
            if (isNS) {
                segCx = cx;
                segCz = z1 + (z2 - z1) * t;
                segW = width;
                segL = length / segments + 0.5;
            } else {
                segCx = x1 + (x2 - x1) * t;
                segCz = cz;
                segW = length / segments + 0.5;
                segL = width;
            }
            const plane = new THREE.Mesh(
                new THREE.PlaneGeometry(segW, segL),
                material
            );
            plane.rotation.x = -Math.PI / 2;
            plane.position.set(segCx, this.getTerrainHeight(segCx, segCz) + 0.05, segCz);
            plane.receiveShadow = true;
            plane.userData.noCollision = true;
            group.add(plane);
        }
    }

    _laySidewalkStrip(x1, z1, x2, z2, sidewalkMat, curbMat, side, group) {
        const cx = (x1 + x2) / 2;
        const length = z2 - z1;
        const width = Math.abs(x2 - x1);

        const segments = Math.ceil(length / 6);
        for (let i = 0; i < segments; i++) {
            const t = (i + 0.5) / segments;
            const segCz = z1 + length * t;
            const segL = length / segments + 0.2;
            const sw = new THREE.Mesh(
                new THREE.PlaneGeometry(width, segL),
                sidewalkMat
            );
            sw.rotation.x = -Math.PI / 2;
            sw.position.set(cx, this.getTerrainHeight(cx, segCz) + 0.15, segCz);
            sw.receiveShadow = true;
            sw.userData.noCollision = true;
            group.add(sw);
        }

        // Curb along the road edge (the side of the sidewalk nearest x=0)
        const T = this.TELEGRAPH;
        const curbX = side * (T.ROAD_HALFWIDTH + 0.15);
        const curbSegments = Math.ceil(length / 8);
        for (let i = 0; i < curbSegments; i++) {
            const t = (i + 0.5) / curbSegments;
            const segCz = z1 + length * t;
            const segL = length / curbSegments + 0.2;
            const curb = new THREE.Mesh(
                new THREE.BoxGeometry(0.3, 0.22, segL),
                curbMat
            );
            curb.position.set(curbX, this.getTerrainHeight(curbX, segCz) + 0.2, segCz);
            curb.userData.noCollision = true;
            group.add(curb);
        }
    }

    _addLaneStripes(xCenter, zStart, zEnd, mat, group) {
        // Dashed yellow center line (two lines, 0.3m apart, 3m dashes, 3m gaps)
        for (let z = zStart; z < zEnd; z += 6) {
            for (const dx of [-0.15, 0.15]) {
                const stripe = new THREE.Mesh(
                    new THREE.PlaneGeometry(0.15, 3),
                    mat
                );
                stripe.rotation.x = -Math.PI / 2;
                stripe.position.set(
                    xCenter + dx,
                    this.getTerrainHeight(xCenter, z + 1.5) + 0.08,
                    z + 1.5
                );
                stripe.userData.noCollision = true;
                group.add(stripe);
            }
        }
    }

    _addCrosswalk(xCenter, z, halfWidth, mat, group) {
        // Zebra crosswalk across Telegraph at this Z
        const stripeW = 0.55;
        const gapW = 0.55;
        const totalW = halfWidth * 2;
        const numStripes = Math.floor(totalW / (stripeW + gapW));
        for (let i = 0; i < numStripes; i++) {
            const offsetX = -halfWidth + 0.5 + i * (stripeW + gapW);
            for (const zOff of [-halfWidth + 1, halfWidth - 1]) {
                const stripe = new THREE.Mesh(
                    new THREE.PlaneGeometry(stripeW, 1.8),
                    mat
                );
                stripe.rotation.x = -Math.PI / 2;
                stripe.position.set(
                    xCenter + offsetX,
                    this.getTerrainHeight(xCenter + offsetX, z + zOff) + 0.08,
                    z + zOff
                );
                stripe.userData.noCollision = true;
                group.add(stripe);
            }
        }
    }

    _populateBlockStorefronts(block) {
        const T = this.TELEGRAPH;
        const zSpan = block.zS - block.zN;
        // Leave 5m buffer at each intersection corner
        const usableSpan = zSpan - 10;
        const zMid = (block.zN + block.zS) / 2;

        for (const side of ['west', 'east']) {
            const shops = block.shops[side];
            if (!shops || shops.length === 0) continue;
            const n = shops.length;
            const shopWidth = usableSpan / n;
            const xBase = side === 'west'
                ? -(T.ROAD_HALFWIDTH + T.SIDEWALK_WIDTH)
                :  (T.ROAD_HALFWIDTH + T.SIDEWALK_WIDTH);

            for (let i = 0; i < n; i++) {
                const shop = shops[i];
                const zCenter = block.zN + 5 + shopWidth * (i + 0.5);
                this._buildStorefront({
                    xFront: xBase,
                    z: zCenter,
                    width: shopWidth - 0.6, // narrow gap between shops
                    depth: T.BLOCK_DEPTH,
                    stories: shop.stories || 2,
                    facing: side === 'west' ? 'east' : 'west',
                    facadeColor: shop.facade,
                    awningColor: shop.awning,
                    name: shop.name
                });
            }
        }
    }

    _buildStorefront({ xFront, z, width, depth, stories, facing, facadeColor, awningColor, name }) {
        const group = new THREE.Group();
        group.userData = {
            name: `Telegraph · ${name}`,
            isInteractable: true,
            type: 'storefront',
            interactionType: 'Browse'
        };

        const storyHeight = 3.6;
        const totalH = stories * storyHeight;
        const half = depth / 2;

        // Convention: `inward` points from the front face INTO the building.
        //   west side of Telegraph → building extends further west → inward = -1
        //   east side of Telegraph → building extends further east → inward = +1
        const inward = facing === 'east' ? -1 : +1;
        const buildingCx = xFront + inward * half;
        const buildingCz = z;

        const facadeMat = new THREE.MeshStandardMaterial({
            color: facadeColor, roughness: 0.88, metalness: 0.02
        });
        const trimMat = new THREE.MeshStandardMaterial({
            color: 0x2B2A28, roughness: 0.7
        });
        const windowMat = new THREE.MeshStandardMaterial({
            color: 0x6F8FA6, emissive: 0x1A2634, roughness: 0.18, metalness: 0.5,
            transparent: true, opacity: 0.75
        });
        const glassDoorMat = new THREE.MeshStandardMaterial({
            color: 0x2E3A46, roughness: 0.1, metalness: 0.4,
            transparent: true, opacity: 0.7
        });
        const awningMat = new THREE.MeshStandardMaterial({
            color: awningColor, roughness: 0.82, side: THREE.DoubleSide
        });
        const roofMat = new THREE.MeshStandardMaterial({
            color: 0x3B3936, roughness: 0.9
        });

        // --- Body block ---
        const body = new THREE.Mesh(
            new THREE.BoxGeometry(depth, totalH, width),
            facadeMat
        );
        body.position.set(buildingCx, totalH / 2, buildingCz);
        body.castShadow = true;
        body.receiveShadow = true;
        group.add(body);

        // --- Flat roof cap ---
        const roof = new THREE.Mesh(
            new THREE.BoxGeometry(depth + 0.3, 0.4, width + 0.3),
            roofMat
        );
        roof.position.set(buildingCx, totalH + 0.2, buildingCz);
        group.add(roof);

        // --- Storefront window band (ground floor, ~2.6m tall) ---
        const winBandH = 2.6;
        const winBand = new THREE.Mesh(
            new THREE.BoxGeometry(0.15, winBandH, width - 1.5),
            windowMat
        );
        winBand.position.set(xFront + inward * 0.08, 0.3 + winBandH / 2, buildingCz);
        group.add(winBand);

        // Trim below storefront (kickplate)
        const kick = new THREE.Mesh(
            new THREE.BoxGeometry(0.25, 0.3, width - 1.2),
            trimMat
        );
        kick.position.set(xFront + inward * 0.07, 0.15, buildingCz);
        group.add(kick);

        // --- Door (offset to the side) ---
        const doorW = 1.2, doorH = 2.3;
        const doorZOff = (width / 2 - doorW / 2 - 0.5) * (Math.random() > 0.5 ? 1 : -1);
        const door = new THREE.Mesh(
            new THREE.BoxGeometry(0.08, doorH, doorW),
            glassDoorMat
        );
        door.position.set(xFront + inward * 0.04, doorH / 2 + 0.02, buildingCz + doorZOff);
        group.add(door);

        // --- Upper story windows ---
        for (let s = 1; s < stories; s++) {
            const yBase = s * storyHeight + 0.6;
            // 2 or 3 windows per floor, evenly spaced
            const winCount = width > 11 ? 3 : 2;
            const spacing = (width - 1.2) / winCount;
            for (let w = 0; w < winCount; w++) {
                const wz = buildingCz - (width - 1.2) / 2 + spacing * (w + 0.5);
                const upWin = new THREE.Mesh(
                    new THREE.BoxGeometry(0.12, 1.5, 1.4),
                    windowMat
                );
                upWin.position.set(xFront + inward * 0.08, yBase + 0.75, wz);
                group.add(upWin);

                // Window frame (trim)
                const frame = new THREE.Mesh(
                    new THREE.BoxGeometry(0.14, 1.7, 1.6),
                    trimMat
                );
                frame.position.set(xFront + inward * 0.09, yBase + 0.75, wz);
                group.add(frame);
            }
        }

        // --- Awning (flat slab, slightly tilted over the sidewalk) ---
        const awnProject = 1.6;  // How far it extends over the sidewalk
        const awnThickness = 0.14;
        const awnLen = width - 0.3;
        const awning = new THREE.Mesh(
            new THREE.BoxGeometry(awnProject, awnThickness, awnLen),
            awningMat
        );
        // Position: inner edge flush with front face, centered over sidewalk
        awning.position.set(
            xFront - inward * (awnProject / 2),
            storyHeight + 0.05,
            buildingCz
        );
        // Tilt the outer edge downward: rotate around Z so the OUTWARD side drops.
        // For west-side building, outward=+X, negative Z-rotation tilts +X down.
        // For east-side building, outward=-X, positive Z-rotation tilts -X down.
        awning.rotation.z = inward * 0.12;
        awning.castShadow = true;
        group.add(awning);

        // --- Awning support brackets (diagonal, at each end) ---
        const bracketMat = new THREE.MeshStandardMaterial({
            color: 0x1A1A1A, roughness: 0.6, metalness: 0.4
        });
        for (const bz of [buildingCz - width / 2 + 0.8, buildingCz + width / 2 - 0.8]) {
            const bracket = new THREE.Mesh(
                new THREE.BoxGeometry(awnProject + 0.1, 0.06, 0.06),
                bracketMat
            );
            bracket.position.set(
                xFront - inward * (awnProject / 2),
                storyHeight - 0.1,
                bz
            );
            group.add(bracket);
        }

        // --- Signboard above awning with shop name ---
        const signH = 1.3;
        const signW = width - 0.6;
        const signTex = this._makeShopSignTexture(name, facadeColor);
        const signMat = new THREE.MeshBasicMaterial({
            map: signTex, side: THREE.DoubleSide, transparent: true
        });
        const sign = new THREE.Mesh(
            new THREE.PlaneGeometry(signW, signH),
            signMat
        );
        // Mount the sign ABOVE the awning, slightly outside the facade so it reads clearly.
        sign.position.set(
            xFront - inward * 0.08,
            storyHeight + 0.6 + signH / 2,
            buildingCz
        );
        // Sign faces OUT (in the -inward direction). Rotation around Y:
        //   inward=-1 (west-side building, outward is +X) → face +X → rot.y = +π/2
        //   inward=+1 (east-side building, outward is -X) → face -X → rot.y = -π/2
        sign.rotation.y = -inward * Math.PI / 2;
        group.add(sign);

        // Place on the terrain at the front-face level.
        group.position.y = this.getTerrainHeight(xFront, buildingCz);
        this.group.add(group);
    }

    _makeShopSignTexture(name, accentColor) {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');

        // Background — dark plank with a subtle color wash
        const bg = new THREE.Color(accentColor);
        bg.multiplyScalar(0.35);
        ctx.fillStyle = `rgb(${Math.round(bg.r * 255)}, ${Math.round(bg.g * 255)}, ${Math.round(bg.b * 255)})`;
        ctx.fillRect(0, 0, 512, 128);

        // Thin border
        ctx.strokeStyle = 'rgba(255, 230, 190, 0.35)';
        ctx.lineWidth = 3;
        ctx.strokeRect(6, 6, 500, 116);

        // Shop name
        ctx.fillStyle = '#F5E9CE';
        ctx.font = 'bold 62px "Georgia", serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        // Shrink font if text too wide
        let fontSize = 62;
        ctx.font = `bold ${fontSize}px "Georgia", serif`;
        while (ctx.measureText(name).width > 470 && fontSize > 24) {
            fontSize -= 4;
            ctx.font = `bold ${fontSize}px "Georgia", serif`;
        }
        ctx.fillText(name, 256, 64);

        const tex = new THREE.CanvasTexture(canvas);
        tex.anisotropy = 4;
        tex.needsUpdate = true;
        return tex;
    }

    _addTelegraphStreetTrees() {
        const T = this.TELEGRAPH;
        const trunkMat = new THREE.MeshStandardMaterial({
            color: 0x5E4331, roughness: 0.9
        });
        const leafMat = new THREE.MeshStandardMaterial({
            color: new THREE.Color().setHSL(0.29, 0.4, 0.32), roughness: 0.82
        });

        // Trees in tree wells along both sidewalks, spaced every ~12m,
        // skipping spots too close to intersections.
        for (const side of [-1, 1]) {
            const xT = side * (T.ROAD_HALFWIDTH + 1.5); // Tree well just in from curb
            for (let z = T.BANCROFT_Z + 6; z < T.SOUTH_END_Z - 4; z += 12) {
                // Skip near intersections
                const nearCrossing = [T.BANCROFT_Z, T.DURANT_Z, T.CHANNING_Z, T.HASTE_Z, T.DWIGHT_Z]
                    .some(cz => Math.abs(z - cz) < T.ROAD_HALFWIDTH + 3);
                if (nearCrossing) continue;

                const tree = new THREE.Group();
                const h = 7 + Math.random() * 2;
                const trunk = new THREE.Mesh(
                    new THREE.CylinderGeometry(0.22, 0.3, h, 8), trunkMat
                );
                trunk.position.y = h / 2;
                trunk.castShadow = true;
                tree.add(trunk);

                const canopy = new THREE.Mesh(
                    new THREE.SphereGeometry(2.4, 10, 8), leafMat
                );
                canopy.position.y = h + 0.3;
                canopy.scale.set(1, 0.85, 1);
                canopy.castShadow = true;
                tree.add(canopy);

                // Tree-well: dark square on the sidewalk
                const well = new THREE.Mesh(
                    new THREE.PlaneGeometry(1.6, 1.6),
                    new THREE.MeshStandardMaterial({ color: 0x3C3630, roughness: 0.9 })
                );
                well.rotation.x = -Math.PI / 2;
                well.position.y = 0.16;
                well.userData.noCollision = true;
                tree.add(well);

                tree.position.set(xT, this.getTerrainHeight(xT, z), z);
                this.group.add(tree);
            }
        }
    }

    _addTelegraphStreetlights() {
        const T = this.TELEGRAPH;
        const poleMat = new THREE.MeshStandardMaterial({
            color: 0x1D1D1D, roughness: 0.55, metalness: 0.5
        });
        const lampMat = new THREE.MeshStandardMaterial({
            color: 0xFDF5D4, emissive: 0xD0A857, emissiveIntensity: 0.7, roughness: 0.4
        });

        // Streetlights every ~30m, on both sides, mid-block
        for (const side of [-1, 1]) {
            const xL = side * (T.ROAD_HALFWIDTH + 2);
            for (let z = T.BANCROFT_Z + 15; z < T.SOUTH_END_Z - 4; z += 30) {
                const g = new THREE.Group();
                const poleH = 6.5;
                const pole = new THREE.Mesh(
                    new THREE.CylinderGeometry(0.08, 0.12, poleH, 8), poleMat
                );
                pole.position.y = poleH / 2;
                pole.castShadow = true;
                g.add(pole);

                // Arm reaching toward road
                const arm = new THREE.Mesh(
                    new THREE.CylinderGeometry(0.05, 0.05, 1.4, 6), poleMat
                );
                arm.rotation.z = Math.PI / 2;
                arm.position.set(-side * 0.7, poleH, 0);
                g.add(arm);

                // Lamp head
                const head = new THREE.Mesh(
                    new THREE.BoxGeometry(0.45, 0.22, 0.32), poleMat
                );
                head.position.set(-side * 1.35, poleH - 0.05, 0);
                g.add(head);

                // Glowing lens
                const lens = new THREE.Mesh(
                    new THREE.BoxGeometry(0.4, 0.08, 0.28), lampMat
                );
                lens.position.set(-side * 1.35, poleH - 0.17, 0);
                g.add(lens);

                g.position.set(xL, this.getTerrainHeight(xL, z), z);
                this.group.add(g);
            }
        }
    }

    // A small corner ornament at Dwight/Telegraph — "Welcome to Telegraph"
    // style wayfinding post and a bench so the spawn area feels inhabited.
    _addCornerLandmark() {
        const T = this.TELEGRAPH;

        // ----- Wayfinding post at the Dwight corner -----
        const post = new THREE.Group();
        post.userData = { name: 'Dwight Way · Telegraph Ave', type: 'sign' };

        const postMat = new THREE.MeshStandardMaterial({
            color: 0x2A2A2A, roughness: 0.55, metalness: 0.5
        });
        const panelMat = new THREE.MeshStandardMaterial({
            color: 0x002850, roughness: 0.7
        });
        const trimMat = new THREE.MeshStandardMaterial({
            color: 0xFEBC11, emissive: 0x221808, roughness: 0.5
        });

        const shaft = new THREE.Mesh(
            new THREE.CylinderGeometry(0.1, 0.1, 3.2, 6), postMat
        );
        shaft.position.y = 1.6;
        post.add(shaft);

        // Upper panel — Telegraph Ave (pointing north toward campus)
        const upper = new THREE.Mesh(
            new THREE.BoxGeometry(2.4, 0.55, 0.08), panelMat
        );
        upper.position.set(0, 3.0, 0);
        post.add(upper);
        const upperText = new THREE.Mesh(
            new THREE.PlaneGeometry(2.3, 0.48),
            new THREE.MeshBasicMaterial({
                map: this._makeShopSignTexture('↑ Campus / Telegraph Ave', 0x002850),
                transparent: true
            })
        );
        upperText.position.set(0, 3.0, 0.05);
        post.add(upperText);
        const upperBack = upperText.clone();
        upperBack.position.z = -0.05;
        upperBack.rotation.y = Math.PI;
        post.add(upperBack);

        // Lower panel — Dwight Way
        const lower = new THREE.Mesh(
            new THREE.BoxGeometry(1.9, 0.45, 0.08), panelMat
        );
        lower.position.set(0, 2.35, 0);
        lower.rotation.y = Math.PI / 2;
        post.add(lower);
        const lowerText = new THREE.Mesh(
            new THREE.PlaneGeometry(1.8, 0.38),
            new THREE.MeshBasicMaterial({
                map: this._makeShopSignTexture('Dwight Way', 0x002850),
                transparent: true
            })
        );
        lowerText.position.set(0, 2.35, 0);
        lowerText.rotation.y = Math.PI / 2;
        lowerText.position.x = 0.05;
        post.add(lowerText);
        const lowerBack = lowerText.clone();
        lowerBack.position.x = -0.05;
        lowerBack.rotation.y = -Math.PI / 2;
        post.add(lowerBack);

        // Trim rings
        const ring = new THREE.Mesh(
            new THREE.TorusGeometry(0.15, 0.03, 6, 12), trimMat
        );
        ring.position.y = 3.25;
        ring.rotation.x = Math.PI / 2;
        post.add(ring);

        // Spawn corner is NW of the intersection: negative X, Dwight to the south
        const postX = -(T.ROAD_HALFWIDTH + T.SIDEWALK_WIDTH - 1.5);
        const postZ = T.DWIGHT_Z - 4;
        post.position.set(postX, this.getTerrainHeight(postX, postZ), postZ);
        this.group.add(post);

        // ----- A bench facing the street -----
        const bench = this._makeStreetBench();
        const bx = -(T.ROAD_HALFWIDTH + 2);
        const bz = T.DWIGHT_Z - 12;
        bench.position.set(bx, this.getTerrainHeight(bx, bz), bz);
        bench.rotation.y = Math.PI / 2; // Face east toward road
        this.group.add(bench);
    }

    _makeStreetBench() {
        const g = new THREE.Group();
        const woodMat = new THREE.MeshStandardMaterial({
            color: 0x6B4E32, roughness: 0.85
        });
        const ironMat = new THREE.MeshStandardMaterial({
            color: 0x1A1A1A, roughness: 0.55, metalness: 0.5
        });

        // Seat
        const seat = new THREE.Mesh(
            new THREE.BoxGeometry(1.8, 0.08, 0.45), woodMat
        );
        seat.position.y = 0.5;
        seat.castShadow = true;
        g.add(seat);

        // Backrest
        const back = new THREE.Mesh(
            new THREE.BoxGeometry(1.8, 0.6, 0.08), woodMat
        );
        back.position.set(0, 0.85, -0.2);
        back.castShadow = true;
        g.add(back);

        // Two iron end panels
        for (const sx of [-0.85, 0.85]) {
            const leg = new THREE.Mesh(
                new THREE.BoxGeometry(0.08, 1.0, 0.55), ironMat
            );
            leg.position.set(sx, 0.45, -0.05);
            g.add(leg);
        }
        return g;
    }

    // ===== Sather Gate (bronze entry arch) =====
    createSatherGate() {
        const g = new THREE.Group();
        g.userData = {
            name: 'Sather Gate', isInteractable: true,
            type: 'landmark', interactionType: 'Pass Through'
        };

        const stoneMat = new THREE.MeshStandardMaterial({
            color: 0xB8B0A0, roughness: 0.8
        });
        const bronzeMat = new THREE.MeshStandardMaterial({
            color: 0x6B4522, emissive: 0x080402, roughness: 0.55, metalness: 0.85
        });
        const bronzeAgedMat = new THREE.MeshStandardMaterial({
            color: 0x4A5D3A, roughness: 0.7, metalness: 0.6
        });

        // Two stone piers
        const pierW = 2.2, pierH = 6, pierD = 2.2;
        for (const sx of [-1, 1]) {
            const pier = new THREE.Mesh(
                new THREE.BoxGeometry(pierW, pierH, pierD), stoneMat
            );
            pier.position.set(sx * 6.5, pierH / 2, 0);
            pier.castShadow = true;
            g.add(pier);

            // Cap
            const cap = new THREE.Mesh(
                new THREE.BoxGeometry(pierW + 0.6, 0.5, pierD + 0.6),
                stoneMat
            );
            cap.position.set(sx * 6.5, pierH + 0.25, 0);
            g.add(cap);

            // Ornament ball
            const orb = new THREE.Mesh(
                new THREE.SphereGeometry(0.6, 16, 12),
                bronzeMat
            );
            orb.position.set(sx * 6.5, pierH + 0.9, 0);
            g.add(orb);
        }

        // Crown arch (horizontal beam with curve)
        const arch = new THREE.Mesh(
            new THREE.TorusGeometry(5.5, 0.35, 8, 24, Math.PI),
            bronzeMat
        );
        arch.rotation.z = Math.PI; // Opens downward
        arch.position.set(0, 8, 0);
        arch.rotation.x = Math.PI;
        g.add(arch);

        // Horizontal top bar
        const topBar = new THREE.Mesh(
            new THREE.BoxGeometry(12, 0.45, 0.45), bronzeMat
        );
        topBar.position.set(0, 8.8, 0);
        g.add(topBar);

        // Ornamental bronze UC seal medallion at center
        const seal = new THREE.Mesh(
            new THREE.CircleGeometry(0.8, 24), bronzeAgedMat
        );
        seal.position.set(0, 8.2, 0.02);
        g.add(seal);
        const sealRing = new THREE.Mesh(
            new THREE.TorusGeometry(0.85, 0.1, 6, 24), bronzeMat
        );
        sealRing.position.set(0, 8.2, 0.02);
        sealRing.rotation.x = Math.PI / 2;
        g.add(sealRing);

        // Vertical bronze bars (decorative fencing)
        for (let side = -1; side <= 1; side += 2) {
            for (let i = 0; i < 4; i++) {
                const bar = new THREE.Mesh(
                    new THREE.CylinderGeometry(0.08, 0.08, 5.5, 6), bronzeMat
                );
                bar.position.set(side * (2 + i * 1.1), 3.5, 0);
                g.add(bar);
            }
        }

        // Scrollwork spandrel (simplified — two curves)
        for (const side of [-1, 1]) {
            const scroll = new THREE.Mesh(
                new THREE.TorusGeometry(1.2, 0.08, 4, 12, Math.PI / 2),
                bronzeMat
            );
            scroll.position.set(side * 4.5, 7, 0);
            scroll.rotation.z = side > 0 ? Math.PI : Math.PI / 2;
            g.add(scroll);
        }

        g.position.set(0, this.getTerrainHeight(0, 95), 95);
        this.group.add(g);
    }

    // ===== Eucalyptus grove (west side) =====
    createEucalyptusGrove() {
        const trunkMat = new THREE.MeshStandardMaterial({
            color: 0x9B7E6A, roughness: 0.85
        });
        const leafMat = new THREE.MeshStandardMaterial({
            color: new THREE.Color().setHSL(0.28, 0.35, 0.45), roughness: 0.8
        });

        for (let i = 0; i < 55; i++) {
            const x = -160 + Math.random() * 80;
            const z = -120 + Math.random() * 240;
            if (this.isOnPath(x, z)) continue;
            const tree = this.createEucalyptus(trunkMat, leafMat);
            tree.position.set(x, this.getTerrainHeight(x, z), z);
            tree.scale.setScalar(0.8 + Math.random() * 0.7);
            this.group.add(tree);
        }

        // A few scattered eucalyptus elsewhere for variety
        for (let i = 0; i < 12; i++) {
            const x = -60 + Math.random() * 120;
            const z = -100 + Math.random() * 200;
            if (this.isNearBuilding(x, z) || this.isOnPath(x, z)) continue;
            const tree = this.createEucalyptus(trunkMat, leafMat);
            tree.position.set(x, this.getTerrainHeight(x, z), z);
            tree.scale.setScalar(0.7 + Math.random() * 0.6);
            this.group.add(tree);
        }
    }

    createEucalyptus(trunkMat, leafMat) {
        const tree = new THREE.Group();
        const th = 18 + Math.random() * 10;

        const trunk = new THREE.Mesh(
            new THREE.CylinderGeometry(0.35, 0.55, th, 8), trunkMat
        );
        trunk.position.y = th / 2;
        trunk.castShadow = true;
        tree.add(trunk);

        // Tall sparse leaf canopy (eucalyptus silhouette)
        const canopyCount = 3 + Math.floor(Math.random() * 3);
        for (let i = 0; i < canopyCount; i++) {
            const r = 2 + Math.random() * 2;
            const leaf = new THREE.Mesh(
                new THREE.SphereGeometry(r, 8, 6), leafMat
            );
            leaf.position.set(
                (Math.random() - 0.5) * 3,
                th * 0.6 + i * 3 + Math.random() * 2,
                (Math.random() - 0.5) * 3
            );
            leaf.scale.set(1, 0.7, 1);
            leaf.castShadow = true;
            tree.add(leaf);
        }
        return tree;
    }

    // ===== Scattered oak trees =====
    createOakTrees() {
        const trunkMat = new THREE.MeshStandardMaterial({
            color: 0x5A3C28, roughness: 0.92
        });
        const leafMat = new THREE.MeshStandardMaterial({
            color: new THREE.Color().setHSL(0.3, 0.55, 0.3), roughness: 0.85
        });

        for (let i = 0; i < 28; i++) {
            const x = (Math.random() - 0.5) * 300;
            const z = (Math.random() - 0.5) * 280;
            if (this.isNearBuilding(x, z) || this.isOnPath(x, z)) continue;
            if (Math.abs(z - 55) < 6) continue; // Stay out of creek

            const tree = this.createOak(trunkMat, leafMat);
            tree.position.set(x, this.getTerrainHeight(x, z), z);
            tree.scale.setScalar(0.7 + Math.random() * 0.7);
            this.group.add(tree);
        }
    }

    createOak(trunkMat, leafMat) {
        const tree = new THREE.Group();
        const th = 6 + Math.random() * 3;

        const trunk = new THREE.Mesh(
            new THREE.CylinderGeometry(0.5, 0.8, th, 8), trunkMat
        );
        trunk.position.y = th / 2;
        trunk.castShadow = true;
        tree.add(trunk);

        // Spreading canopy
        const canopy = new THREE.Mesh(
            new THREE.SphereGeometry(5, 12, 10), leafMat
        );
        canopy.scale.set(1.3, 0.85, 1.3);
        canopy.position.y = th + 1.5;
        canopy.castShadow = true;
        tree.add(canopy);

        return tree;
    }

    // ===== Benches =====
    createBenches() {
        const positions = [
            { x: -14, z: -22 }, { x: 14, z: -22 },
            { x: -14, z: 8 }, { x: 14, z: 8 },
            { x: -25, z: 40 }, { x: 25, z: 40 },
            { x: 0, z: 80 }, { x: -18, z: 80 }
        ];
        positions.forEach(p => {
            const b = this.createBench();
            b.position.set(p.x, this.getTerrainHeight(p.x, p.z), p.z);
            b.rotation.y = Math.atan2(-p.x, -p.z); // Face Campanile
            this.group.add(b);
        });
    }

    createBench() {
        const b = new THREE.Group();
        const woodMat = new THREE.MeshStandardMaterial({
            color: 0x7A4E2E, roughness: 0.85
        });
        const castIronMat = new THREE.MeshStandardMaterial({
            color: 0x222222, roughness: 0.5, metalness: 0.65
        });
        for (let i = 0; i < 4; i++) {
            const slat = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.08, 0.2), woodMat);
            slat.position.set(0, 0.5, -0.3 + i * 0.22);
            b.add(slat);
        }
        // Backrest
        for (let i = 0; i < 3; i++) {
            const back = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.08, 0.12), woodMat);
            back.position.set(0, 0.9 + i * 0.18, -0.35);
            b.add(back);
        }
        for (const x of [-0.8, 0.8]) {
            const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.5, 0.7), castIronMat);
            leg.position.set(x, 0.25, -0.15);
            b.add(leg);
            // Backrest post
            const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.8, 0.08), castIronMat);
            post.position.set(x, 0.9, -0.35);
            b.add(post);
        }
        return b;
    }

    // ===== Chalkboards with Berkeley-flavored math topics =====
    createChalkboards() {
        const topics = [
            { x: -22, z: -10, ry: Math.PI / 6, name: 'Differential Geometry' },
            { x: 22, z: -10, ry: -Math.PI / 6, name: 'Algebraic Geometry' },
            { x: -30, z: 30, ry: Math.PI / 4, name: 'Dynamical Systems' },
            { x: 30, z: 30, ry: -Math.PI / 4, name: 'Probability' },
            { x: -45, z: -30, ry: Math.PI / 3, name: 'Mathematical Logic' },
            { x: 45, z: -30, ry: -Math.PI / 3, name: 'Number Theory' }
        ];
        topics.forEach(p => {
            const b = this.createChalkboard(p.name);
            b.position.set(p.x, this.getTerrainHeight(p.x, p.z), p.z);
            b.rotation.y = p.ry;
            this.group.add(b);
        });
    }

    createChalkboard(name) {
        const g = new THREE.Group();
        g.userData = {
            name, isInteractable: true, type: 'chalkboard', interactionType: 'Read'
        };
        const postMat = new THREE.MeshStandardMaterial({ color: 0x5A3C28, roughness: 0.9 });
        const frameMat = new THREE.MeshStandardMaterial({ color: 0x3B2820, roughness: 0.8 });
        const slateMat = new THREE.MeshStandardMaterial({
            color: 0x183C2E, roughness: 0.78, metalness: 0.02
        });

        for (const x of [-1.3, 1.3]) {
            const post = new THREE.Mesh(
                new THREE.CylinderGeometry(0.09, 0.11, 2.6, 8), postMat
            );
            post.position.set(x, 1.3, 0);
            post.castShadow = true;
            g.add(post);
        }
        const frame = new THREE.Mesh(new THREE.BoxGeometry(3.1, 2.05, 0.1), frameMat);
        frame.position.set(0, 1.85, 0);
        g.add(frame);
        const slate = new THREE.Mesh(new THREE.BoxGeometry(2.8, 1.75, 0.05), slateMat);
        slate.position.set(0, 1.85, 0.06);
        g.add(slate);
        const tray = new THREE.Mesh(new THREE.BoxGeometry(2.55, 0.08, 0.14), frameMat);
        tray.position.set(0, 0.92, 0.12);
        g.add(tray);

        // A chalk piece
        const chalk = new THREE.Mesh(
            new THREE.CylinderGeometry(0.03, 0.03, 0.2, 6),
            new THREE.MeshStandardMaterial({ color: 0xEEEEEE, roughness: 0.95 })
        );
        chalk.position.set(0.3, 0.97, 0.15);
        chalk.rotation.z = Math.PI / 2;
        g.add(chalk);

        return g;
    }

    // ===== Golden Bear statue (Oski) =====
    createGoldenBear() {
        const g = new THREE.Group();
        g.userData = {
            name: 'Golden Bear', isInteractable: true,
            type: 'statue', interactionType: 'Admire'
        };

        const stoneMat = new THREE.MeshStandardMaterial({
            color: 0xC8C0A8, roughness: 0.85
        });
        const bronzeMat = new THREE.MeshStandardMaterial({
            color: 0x8B6F3E, emissive: 0x1A1208, roughness: 0.5, metalness: 0.85
        });

        // Pedestal
        const pedW = 3, pedH = 2.2, pedD = 2;
        const pedestal = new THREE.Mesh(
            new THREE.BoxGeometry(pedW, pedH, pedD), stoneMat
        );
        pedestal.position.y = pedH / 2;
        pedestal.castShadow = true; pedestal.receiveShadow = true;
        g.add(pedestal);
        // Pedestal cap
        const cap = new THREE.Mesh(
            new THREE.BoxGeometry(pedW + 0.3, 0.25, pedD + 0.3), stoneMat
        );
        cap.position.y = pedH + 0.125;
        g.add(cap);

        // Bear body (stylized)
        const bear = new THREE.Group();
        const body = new THREE.Mesh(
            new THREE.BoxGeometry(1.4, 1.0, 2.4), bronzeMat
        );
        body.position.y = 0.7;
        body.castShadow = true;
        bear.add(body);

        const head = new THREE.Mesh(
            new THREE.BoxGeometry(1.0, 0.85, 1.1), bronzeMat
        );
        head.position.set(0, 1.3, 1.3);
        bear.add(head);

        // Snout
        const snout = new THREE.Mesh(
            new THREE.BoxGeometry(0.55, 0.4, 0.5), bronzeMat
        );
        snout.position.set(0, 1.15, 1.9);
        bear.add(snout);

        // Ears
        for (const side of [-1, 1]) {
            const ear = new THREE.Mesh(
                new THREE.ConeGeometry(0.2, 0.3, 8), bronzeMat
            );
            ear.position.set(side * 0.3, 1.85, 1.25);
            bear.add(ear);
        }

        // Legs
        for (const [sx, sz] of [[-0.5, -0.9], [0.5, -0.9], [-0.5, 0.9], [0.5, 0.9]]) {
            const leg = new THREE.Mesh(
                new THREE.BoxGeometry(0.35, 0.6, 0.35), bronzeMat
            );
            leg.position.set(sx, 0.3, sz);
            leg.castShadow = true;
            bear.add(leg);
        }

        bear.position.y = pedH + 0.25;
        g.add(bear);

        const gx = -35, gz = 72;
        g.position.set(gx, this.getTerrainHeight(gx, gz), gz);
        g.rotation.y = Math.PI; // Face south toward Sather Gate
        this.group.add(g);
    }

    // ===== Helpers =====
    isNearBuilding(x, z) {
        // Campanile footprint
        if (Math.abs(x) < 8 && Math.abs(z) < 8) return true;
        // Doe Library
        if (Math.abs(x) < 30 && z > -75 && z < -40) return true;
        // South Hall — real location ~35m SE of the Campanile
        if (x > 17 && x < 48 && z > 24 && z < 42) return true;
        // Wheeler Hall
        if (x > 50 && x < 92 && z > 5 && z < 25) return true;
        // Evans Hall
        if (x > 55 && x < 95 && z > -80 && z < -50) return true;
        // SLMath complex up on the hill
        const h0 = this.SLMATH_ORIGIN;
        if (Math.abs(x - h0.x) < 30 && Math.abs(z - h0.z) < 20) return true;

        // Telegraph district storefronts (all blocks, both sides)
        const T = this.TELEGRAPH;
        const innerX = T.ROAD_HALFWIDTH + T.SIDEWALK_WIDTH;
        const outerX = innerX + T.BLOCK_DEPTH;
        if (z > T.BANCROFT_Z + 2 && z < T.DWIGHT_Z - 2) {
            if (x > innerX - 0.5 && x < outerX) return true;
            if (x < -innerX + 0.5 && x > -outerX) return true;
        }
        return false;
    }

    isOnPath(x, z) {
        // Main N-S path corridor (includes Sproul Plaza section)
        if (Math.abs(x) < 2.5 && z > -50 && z < 115) return true;
        // E-W path at Campanile
        if (Math.abs(z) < 2 && x > -55 && x < 55) return true;
        // Rough corridor following the hill road from campus NE to SLMath
        const start = { x: 90, z: -80 };
        const end = this.SLMATH_ORIGIN;
        const dx = end.x - start.x, dz = end.z - start.z;
        const len2 = dx * dx + dz * dz;
        if (len2 > 0) {
            const t = ((x - start.x) * dx + (z - start.z) * dz) / len2;
            if (t >= 0 && t <= 1) {
                const projX = start.x + dx * t;
                const projZ = start.z + dz * t;
                const d = Math.sqrt((x - projX) ** 2 + (z - projZ) ** 2);
                if (d < 14) return true; // Allow for switchback curvature
            }
        }

        // Telegraph district — the whole road + sidewalk corridor is "path"
        // so trees don't spawn inside it, and crossings too.
        const T = this.TELEGRAPH;
        const corridor = T.ROAD_HALFWIDTH + T.SIDEWALK_WIDTH + 0.5;
        if (Math.abs(x) < corridor && z > T.BANCROFT_Z - 4 && z < T.SOUTH_END_Z + 4) return true;
        // Cross streets
        for (const cz of [T.BANCROFT_Z, T.DURANT_Z, T.CHANNING_Z, T.HASTE_Z, T.DWIGHT_Z]) {
            if (Math.abs(z - cz) < T.ROAD_HALFWIDTH + 0.5 && Math.abs(x) < 56) return true;
        }
        return false;
    }

    getInteractables() {
        const out = [];
        this.group.traverse(obj => {
            if (obj.userData && obj.userData.isInteractable) out.push(obj);
        });
        return out;
    }
}
