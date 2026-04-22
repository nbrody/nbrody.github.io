/**
 * UCSB Campus
 *
 * Layout (origin = base of Storke Tower):
 *   -Z is north, +Z is south (toward ocean), +X is east, -X is west.
 *
 *   UCSB's iconic N-S pedestrian spine: Library → Storke Plaza → Storke
 *   Tower → UCen → Campus Lagoon, all on the same axis.
 *
 *   Davidson Library       ─── (0, -95) — directly N of Storke, ~170m IRL
 *   South Hall             ─── (+55, -55) — NE, near the Library/bus circle
 *                               (real: ~170m N + ~65m E from Storke Tower)
 *   Storke Tower           ─── (0, 0, 0) — centerpiece carillon
 *   Storke Plaza           ─── (z ≈ +5, fountain + benches)
 *   Bike roundabout        ─── (0, +55)
 *   UCen                   ─── (+20, +80) — perched on north shore of
 *                               Lagoon ("situated with a view over the lagoon")
 *   Campus Lagoon          ─── (0, +150, ~95×55m ellipse)
 *   Coastal cliffs         ─── (z > +210, ~9m / 30ft drop to beach)
 *
 * Topography (researched, see Wikipedia "UCSB campus"):
 *   - Campus sits on a marine terrace / coastal mesa ~15m (50 ft) above
 *     sea level — remarkably flat throughout the academic core.
 *   - The sea cliffs at the campus edge are cut into late-Pleistocene
 *     marine terrace deposits (~45,000 years old), raised ~9–15m above
 *     the modern beach by tectonic uplift and eustatic sea-level drops.
 *   - The Campus Lagoon is a ~90-acre saltwater lagoon connected to the
 *     Pacific by a narrow inlet; the southern edge opens toward Campus
 *     Point and Goleta Beach.
 *   - Devereux Slough lies farther west (off-map).
 */

import * as THREE from 'three';

export class UCSBCampus {
    constructor(campusGroup, terrainHeightFn = null) {
        this.group = campusGroup;
        this.worldSize = 640;
        this.terrainResolution = 200;
        this.regionalTerrainFn = terrainHeightFn;
    }

    setTerrainFunction(fn) { this.regionalTerrainFn = fn; }

    async generate() {
        this.createTerrain();
        this.createBeach();
        this.createLagoon();
        this.createWalkways();
        this.createBikePaths();
        this.createStorkeTower();
        this.createStorkePlaza();
        this.createSouthHall();
        this.createUCen();
        this.createDavidsonLibrary();
        this.createPalmTrees();
        this.createEucalyptusRow();
        this.createBikeRacks();
        this.createParkedBikes();
        this.createBenches();
        this.createChalkboards();
        this.createSignage();
    }

    // ===== Lagoon geometry (used everywhere) =====
    get LAGOON() {
        return {
            cx: 0, cz: 150,
            radiusX: 95, radiusZ: 55,
            depth: 2.4,
            waterLevel: -0.6
        };
    }

    // Building origins — calibrated from real GPS deltas between each
    // building and Storke Tower, compressed ~50% so players can traverse
    // the campus on foot in a reasonable time while preserving bearings.
    get TOWER_ORIGIN() { return { x: 0, z: 0 }; }
    get LIBRARY_ORIGIN() { return { x: 0, z: -95 }; }       // due N of tower
    get SOUTH_HALL_ORIGIN() { return { x: 55, z: -55 }; }   // NE, near library
    get UCEN_ORIGIN() { return { x: 20, z: 80 }; }          // SE, on lagoon shore

    // ===== Local procedural terrain =====
    // UCSB sits on a flat coastal mesa. Gentle undulation, a shallow depression
    // where the lagoon sits, and a small cliff drop toward the ocean past z=200.
    localHeight(x, z) {
        let h = 0.6; // Base pad elevation above "sea level" for the campus mesa

        // Very gentle organic roll across the mesa
        h += Math.sin(x * 0.014) * Math.cos(z * 0.012) * 0.35;
        h += Math.sin(x * 0.04 + z * 0.03) * 0.18;

        // Lagoon depression — a shallow bowl
        const L = this.LAGOON;
        const dx = (x - L.cx) / L.radiusX;
        const dz = (z - L.cz) / L.radiusZ;
        const lagoonR = Math.sqrt(dx * dx + dz * dz);
        if (lagoonR < 1.0) {
            const bowl = 1 - lagoonR;
            h -= L.depth * (bowl * bowl * (3 - 2 * bowl));
        } else if (lagoonR < 1.25) {
            // Sandy rim — slight rise around the lagoon edge (like a berm)
            const t = 1 - (lagoonR - 1.0) / 0.25;
            h += t * 0.3;
        }

        // Coastal bluff drop past the mesa edge (real drop ~9m / 30ft).
        // The lagoon sits on the mesa itself; the cliff is further south
        // where the ocean begins, near Campus Point.
        if (z > 230) {
            const t = Math.min(1, (z - 230) / 40);
            h -= t * 9;
        }

        return h;
    }

    getTerrainHeight(x, z) {
        const half = this.worldSize / 2;
        const margin = 40;
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

        const L = this.LAGOON;

        for (let i = 0; i < pos.count; i++) {
            const x = pos.getX(i), y = pos.getY(i);
            const worldX = x, worldZ = -y;
            const h = this.localHeight(worldX, worldZ);
            pos.setZ(i, h);

            // Vertex coloring
            let r, g, b;
            const dx = (worldX - L.cx) / L.radiusX;
            const dz = (worldZ - L.cz) / L.radiusZ;
            const lagoonR = Math.sqrt(dx * dx + dz * dz);

            if (lagoonR < 0.95) {
                // Submerged / mud / algae
                r = 0.25; g = 0.28; b = 0.22;
            } else if (lagoonR < 1.15) {
                // Sandy lagoon shore
                r = 0.85; g = 0.78; b = 0.6;
            } else if (worldZ > 210) {
                // Sandy cliff / beach
                r = 0.9; g = 0.82; b = 0.65;
            } else if (Math.abs(worldX) < 120 && worldZ > -90 && worldZ < 60) {
                // Central campus lawn — irrigated green
                r = 0.4; g = 0.58; b = 0.3;
            } else {
                // Coastal sage / chaparral
                r = 0.55; g = 0.6; b = 0.38;
            }

            const n = (Math.random() - 0.5) * 0.07;
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

    // ===== Beach strip south of the cliff =====
    createBeach() {
        const sandMat = new THREE.MeshStandardMaterial({
            color: 0xE8D8A8, roughness: 1, metalness: 0
        });
        const beach = new THREE.Mesh(
            new THREE.PlaneGeometry(this.worldSize, 40), sandMat
        );
        beach.rotation.x = -Math.PI / 2;
        beach.position.set(0, -8.5, 280);
        beach.receiveShadow = true;
        beach.userData.noCollision = true;
        this.group.add(beach);

        // Pacific Ocean plate (stylized) beyond the beach
        const oceanMat = new THREE.MeshStandardMaterial({
            color: 0x256A8C, roughness: 0.25, metalness: 0.35,
            transparent: true, opacity: 0.88
        });
        const ocean = new THREE.Mesh(
            new THREE.PlaneGeometry(this.worldSize * 1.2, 180), oceanMat
        );
        ocean.rotation.x = -Math.PI / 2;
        ocean.position.set(0, -9.2, 390);
        ocean.userData.noCollision = true;
        this.group.add(ocean);
    }

    // ===== Campus Lagoon =====
    createLagoon() {
        const L = this.LAGOON;

        // Water surface — slightly below the lowest lagoon terrain so we see water
        const water = new THREE.Mesh(
            new THREE.CircleGeometry(1, 64),
            new THREE.MeshStandardMaterial({
                color: 0x4E7A70, roughness: 0.22, metalness: 0.35,
                transparent: true, opacity: 0.88
            })
        );
        water.scale.set(L.radiusX * 0.98, L.radiusZ * 0.98, 1);
        water.rotation.x = -Math.PI / 2;
        water.position.set(L.cx, L.waterLevel, L.cz);
        water.userData.noCollision = true;
        this.group.add(water);

        // Shoreline foam / lighter water at the very edge
        const foam = new THREE.Mesh(
            new THREE.RingGeometry(0.92, 1.0, 64),
            new THREE.MeshStandardMaterial({
                color: 0xBFD8C9, transparent: true, opacity: 0.55, roughness: 0.9
            })
        );
        foam.scale.set(L.radiusX, L.radiusZ, 1);
        foam.rotation.x = -Math.PI / 2;
        foam.position.set(L.cx, L.waterLevel + 0.04, L.cz);
        foam.userData.noCollision = true;
        this.group.add(foam);

        // Small island near the center — nesting spot for waterbirds
        this.createLagoonIsland(L.cx + 10, L.cz - 4, 8);

        // Reeds and cattails around the edges
        this.scatterReeds(L);

        // Observation deck extending out from the north shore
        this.createObservationDeck(L.cx - 22, L.cz - L.radiusZ - 3);

        // Footbridge at the western narrow of the lagoon
        this.createLagoonFootbridge(L.cx - L.radiusX * 0.85, L.cz + 6);
    }

    createLagoonIsland(x, z, radius) {
        const g = new THREE.Group();
        const groundMat = new THREE.MeshStandardMaterial({
            color: 0x6E8B50, roughness: 0.9
        });
        const island = new THREE.Mesh(
            new THREE.CylinderGeometry(radius, radius * 1.2, 0.8, 20),
            groundMat
        );
        island.position.y = -0.15;
        g.add(island);

        // Driftwood log
        const logMat = new THREE.MeshStandardMaterial({
            color: 0x6B5236, roughness: 0.95
        });
        const log = new THREE.Mesh(
            new THREE.CylinderGeometry(0.25, 0.25, 3.5, 8), logMat
        );
        log.rotation.z = Math.PI / 2;
        log.position.set(0.5, 0.35, 1);
        g.add(log);

        // A few tufts of grass
        const grassMat = new THREE.MeshStandardMaterial({
            color: 0x7D9A4A, roughness: 0.9
        });
        for (let i = 0; i < 6; i++) {
            const tuft = new THREE.Mesh(
                new THREE.ConeGeometry(0.4, 0.9, 5), grassMat
            );
            const a = Math.random() * Math.PI * 2;
            const r = Math.random() * radius * 0.7;
            tuft.position.set(Math.cos(a) * r, 0.65, Math.sin(a) * r);
            g.add(tuft);
        }

        g.position.set(x, this.LAGOON.waterLevel, z);
        this.group.add(g);
    }

    scatterReeds(L) {
        const stalkMat = new THREE.MeshStandardMaterial({
            color: 0x6D8A34, roughness: 0.9
        });
        const tuftMat = new THREE.MeshStandardMaterial({
            color: 0x8A6B3A, roughness: 0.9
        });

        const count = 180;
        for (let i = 0; i < count; i++) {
            // Sample near the shoreline (lagoonR ~1)
            const a = Math.random() * Math.PI * 2;
            const rJitter = 0.92 + Math.random() * 0.18;
            const x = L.cx + Math.cos(a) * L.radiusX * rJitter;
            const z = L.cz + Math.sin(a) * L.radiusZ * rJitter;
            const groundY = this.localHeight(x, z);
            const reed = new THREE.Group();

            const stalk = new THREE.Mesh(
                new THREE.CylinderGeometry(0.04, 0.06, 1.2 + Math.random() * 0.8, 5),
                stalkMat
            );
            stalk.position.y = 0.6;
            reed.add(stalk);

            if (Math.random() < 0.4) {
                const tuft = new THREE.Mesh(
                    new THREE.CylinderGeometry(0.07, 0.11, 0.35, 6), tuftMat
                );
                tuft.position.y = 1.3;
                reed.add(tuft);
            }

            reed.position.set(x, groundY, z);
            reed.rotation.y = Math.random() * Math.PI * 2;
            reed.userData.noCollision = true;
            this.group.add(reed);
        }
    }

    createObservationDeck(cx, cz) {
        const g = new THREE.Group();
        g.userData = {
            name: 'Lagoon Observation Deck', isInteractable: true,
            type: 'landmark', interactionType: 'Look'
        };
        const deckMat = new THREE.MeshStandardMaterial({
            color: 0x8A6540, roughness: 0.85
        });
        const railMat = new THREE.MeshStandardMaterial({
            color: 0x3C2E20, roughness: 0.8
        });

        // Deck boards stretching toward the water
        const dw = 5, dl = 10;
        for (let i = 0; i < 8; i++) {
            const plank = new THREE.Mesh(
                new THREE.BoxGeometry(dw, 0.12, dl / 8 - 0.05), deckMat
            );
            plank.position.set(0, 0.6, -dl / 2 + (i + 0.5) * (dl / 8));
            plank.castShadow = true;
            plank.receiveShadow = true;
            g.add(plank);
        }

        // Support posts
        for (const sx of [-dw / 2 + 0.25, dw / 2 - 0.25]) {
            for (const sz of [-dl / 2 + 0.4, dl / 2 - 0.4, 0]) {
                const post = new THREE.Mesh(
                    new THREE.BoxGeometry(0.25, 2, 0.25), railMat
                );
                post.position.set(sx, -0.2, sz);
                g.add(post);
            }
        }

        // Handrails
        for (const sx of [-dw / 2 + 0.25, dw / 2 - 0.25]) {
            const rail = new THREE.Mesh(
                new THREE.BoxGeometry(0.12, 0.12, dl), railMat
            );
            rail.position.set(sx, 1.45, 0);
            g.add(rail);
        }

        g.position.set(cx, this.localHeight(cx, cz), cz);
        this.group.add(g);
    }

    createLagoonFootbridge(cx, cz) {
        const g = new THREE.Group();
        const woodMat = new THREE.MeshStandardMaterial({
            color: 0x8A6540, roughness: 0.85
        });
        const railMat = new THREE.MeshStandardMaterial({
            color: 0x2C2C2C, roughness: 0.5, metalness: 0.4
        });

        const len = 12, width = 2.4;
        // Deck
        const deck = new THREE.Mesh(
            new THREE.BoxGeometry(len, 0.25, width), woodMat
        );
        deck.position.y = 0.65;
        deck.castShadow = true;
        g.add(deck);

        // Arch below
        for (const side of [-1, 1]) {
            const arch = new THREE.Mesh(
                new THREE.TorusGeometry(3.5, 0.25, 6, 16, Math.PI),
                woodMat
            );
            arch.rotation.y = Math.PI / 2;
            arch.rotation.z = Math.PI;
            arch.position.set(0, 0.65, side * (width / 2 - 0.1));
            g.add(arch);
        }

        // Handrails
        for (const side of [-1, 1]) {
            for (let i = 0; i <= 6; i++) {
                const post = new THREE.Mesh(
                    new THREE.CylinderGeometry(0.06, 0.06, 1, 6), railMat
                );
                post.position.set(-len / 2 + i * (len / 6), 1.2, side * (width / 2));
                g.add(post);
            }
            const rail = new THREE.Mesh(
                new THREE.BoxGeometry(len, 0.1, 0.1), railMat
            );
            rail.position.set(0, 1.7, side * (width / 2));
            g.add(rail);
        }

        // Orient along the path approaching the lagoon
        g.rotation.y = Math.PI / 2;
        g.position.set(cx, this.localHeight(cx, cz) + 0.15, cz);
        this.group.add(g);
    }

    // ===== Concrete walkways =====
    createWalkways() {
        const concreteMat = new THREE.MeshStandardMaterial({
            color: 0xCCC4B0, roughness: 0.88, metalness: 0
        });

        // Main N-S pedestrian spine: Davidson Library → Storke Plaza →
        // Storke Tower → UCen → observation deck on the Lagoon.
        this.laySegmentedPath([
            { x: 0, z: -95 },
            { x: 0, z: -55 },
            { x: 0, z: -15 },
            { x: 0, z: 0 },
            { x: 0, z: 30 },
            { x: 0, z: 55 },
            { x: 10, z: 80 },
            { x: -10, z: 95 }
        ], 5, concreteMat);

        // E-W cross path at Storke plaza
        this.laySegmentedPath([
            { x: -90, z: 5 }, { x: -30, z: 5 }, { x: 0, z: 5 },
            { x: 30, z: 5 }, { x: 90, z: 5 }
        ], 4, concreteMat);

        // Spur to South Hall (NE, near the Library / bus circle)
        this.laySegmentedPath([
            { x: 10, z: -10 }, { x: 30, z: -30 }, { x: 50, z: -55 }
        ], 3.5, concreteMat);

        // Spur to UCen (SE, on the lagoon's north shore)
        this.laySegmentedPath([
            { x: 0, z: 55 }, { x: 12, z: 70 }, { x: 20, z: 80 }
        ], 3.5, concreteMat);

        // Plaza slab around Storke Tower base
        const plaza = new THREE.Mesh(
            new THREE.CircleGeometry(14, 32),
            new THREE.MeshStandardMaterial({
                color: 0xB8AE98, roughness: 0.9
            })
        );
        plaza.rotation.x = -Math.PI / 2;
        plaza.position.set(0, this.localHeight(0, 0) + 0.04, 0);
        plaza.receiveShadow = true;
        plaza.userData.noCollision = true;
        this.group.add(plaza);
    }

    laySegmentedPath(points, width, material) {
        for (let i = 0; i < points.length - 1; i++) {
            const s = points[i], e = points[i + 1];
            const dx = e.x - s.x, dz = e.z - s.z;
            const len = Math.sqrt(dx * dx + dz * dz);
            const cx = (s.x + e.x) / 2, cz = (s.z + e.z) / 2;
            const seg = new THREE.Mesh(
                new THREE.PlaneGeometry(width, len), material
            );
            seg.position.set(cx, this.getTerrainHeight(cx, cz) + 0.04, cz);
            seg.rotation.x = -Math.PI / 2;
            seg.rotation.z = Math.atan2(dx, dz);
            seg.receiveShadow = true;
            seg.userData.noCollision = true;
            this.group.add(seg);
        }
    }

    // ===== Bike paths — UCSB's famous red-pigmented bike routes =====
    createBikePaths() {
        const bikeMat = new THREE.MeshStandardMaterial({
            color: 0xB45A3C, emissive: 0x1A0A06, roughness: 0.9
        });
        const stripeMat = new THREE.MeshStandardMaterial({
            color: 0xF8EEDC, roughness: 0.8
        });

        // Outer loop bike path that circumnavigates the central quad.
        // Widened north to clear the Library at z=-95, pulled back from the
        // south so it doesn't run through the lagoon.
        const loop = [
            { x: -110, z: -60 }, { x: -110, z: 35 },
            { x: -80, z: 60 }, { x: -55, z: 75 },
            { x: 55, z: 72 }, { x: 95, z: 45 },
            { x: 110, z: -30 }, { x: 95, z: -80 },
            { x: 45, z: -115 }, { x: -45, z: -115 },
            { x: -95, z: -80 }, { x: -110, z: -60 }
        ];
        this.layBikePath(loop, 3.2, bikeMat, stripeMat);

        // North spur between the bike loop and Davidson Library
        this.layBikePath([
            { x: -70, z: -95 }, { x: -40, z: -100 }, { x: -18, z: -105 }
        ], 2.8, bikeMat, stripeMat);

        // SW spur down the west side of the lagoon, toward the footbridge
        this.layBikePath([
            { x: -40, z: 35 }, { x: -60, z: 50 }, { x: -80, z: 65 }
        ], 2.8, bikeMat, stripeMat);

        // Roundabout in front of UCen — trademark UCSB traffic circle
        this.createBikeRoundabout(0, 50, 8);
    }

    layBikePath(points, width, surface, stripe) {
        for (let i = 0; i < points.length - 1; i++) {
            const s = points[i], e = points[i + 1];
            const dx = e.x - s.x, dz = e.z - s.z;
            const len = Math.sqrt(dx * dx + dz * dz);
            const cx = (s.x + e.x) / 2, cz = (s.z + e.z) / 2;

            const seg = new THREE.Mesh(
                new THREE.PlaneGeometry(width, len), surface
            );
            seg.position.set(cx, this.getTerrainHeight(cx, cz) + 0.05, cz);
            seg.rotation.x = -Math.PI / 2;
            seg.rotation.z = Math.atan2(dx, dz);
            seg.receiveShadow = true;
            seg.userData.noCollision = true;
            this.group.add(seg);

            // Center dashed lane divider
            const dashCount = Math.max(1, Math.floor(len / 2.2));
            for (let d = 0; d < dashCount; d++) {
                const tDash = (d + 0.5) / dashCount;
                const px = s.x + dx * tDash;
                const pz = s.z + dz * tDash;
                const dash = new THREE.Mesh(
                    new THREE.PlaneGeometry(0.12, 0.9), stripe
                );
                dash.position.set(px, this.getTerrainHeight(px, pz) + 0.06, pz);
                dash.rotation.x = -Math.PI / 2;
                dash.rotation.z = Math.atan2(dx, dz);
                dash.userData.noCollision = true;
                this.group.add(dash);
            }
        }
    }

    createBikeRoundabout(cx, cz, radius) {
        const bikeMat = new THREE.MeshStandardMaterial({
            color: 0xB45A3C, emissive: 0x1A0A06, roughness: 0.9
        });
        // Donut-shaped bike lane
        const ring = new THREE.Mesh(
            new THREE.RingGeometry(radius, radius + 3.2, 48), bikeMat
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(cx, this.getTerrainHeight(cx, cz) + 0.045, cz);
        ring.receiveShadow = true;
        ring.userData.noCollision = true;
        this.group.add(ring);

        // Dashed center line on the ring
        const stripeMat = new THREE.MeshStandardMaterial({
            color: 0xF8EEDC, roughness: 0.8
        });
        const dashes = 28;
        for (let i = 0; i < dashes; i += 2) {
            const a = (i / dashes) * Math.PI * 2;
            const dash = new THREE.Mesh(
                new THREE.PlaneGeometry(0.9, 0.12), stripeMat
            );
            const r = radius + 1.6;
            dash.position.set(
                cx + Math.cos(a) * r,
                this.getTerrainHeight(cx, cz) + 0.055,
                cz + Math.sin(a) * r
            );
            dash.rotation.x = -Math.PI / 2;
            dash.rotation.z = a + Math.PI / 2;
            dash.userData.noCollision = true;
            this.group.add(dash);
        }

        // Central landscaped island with a small tree
        const islandMat = new THREE.MeshStandardMaterial({
            color: 0x6B8A3E, roughness: 0.95
        });
        const island = new THREE.Mesh(
            new THREE.CylinderGeometry(radius - 0.4, radius - 0.4, 0.4, 32),
            islandMat
        );
        island.position.set(cx, this.getTerrainHeight(cx, cz) + 0.2, cz);
        island.receiveShadow = true;
        this.group.add(island);

        // Small decorative palm in the middle
        const palm = this.createPalmTree(5 + Math.random() * 1.5);
        palm.position.set(cx, this.getTerrainHeight(cx, cz) + 0.4, cz);
        this.group.add(palm);
    }

    // ===== Storke Tower — carillon bell tower, 175 ft =====
    createStorkeTower() {
        const g = new THREE.Group();
        g.userData = {
            name: 'Storke Tower', isInteractable: true,
            type: 'landmark', interactionType: 'Admire'
        };

        const concreteMat = new THREE.MeshStandardMaterial({
            color: 0xCEC6B2, emissive: 0x141210, roughness: 0.82, metalness: 0.05
        });
        const concreteShadow = new THREE.MeshStandardMaterial({
            color: 0xA9A295, emissive: 0x0A0908, roughness: 0.9
        });
        const bronzeMat = new THREE.MeshStandardMaterial({
            color: 0x6B4E2A, roughness: 0.55, metalness: 0.75
        });
        const darkMat = new THREE.MeshStandardMaterial({
            color: 0x1A1A1A, roughness: 0.6
        });

        // Storke is slender and tall — strong vertical proportions.
        const base = 6.2;
        const shaftTop = 7.4; // slight taper outward at the top
        const shaftHeight = 44;
        const belfryHeight = 8;
        const capHeight = 1.4;

        // Low pedestal
        const pedestal = new THREE.Mesh(
            new THREE.BoxGeometry(base + 1.8, 1, base + 1.8), concreteShadow
        );
        pedestal.position.y = 0.5;
        pedestal.castShadow = true; pedestal.receiveShadow = true;
        g.add(pedestal);

        const plinth = new THREE.Mesh(
            new THREE.BoxGeometry(base + 0.8, 0.6, base + 0.8), concreteMat
        );
        plinth.position.y = 1.3;
        g.add(plinth);

        // Main shaft — board-formed concrete with shallow vertical fluting
        const shaftY = 1.6 + shaftHeight / 2;
        const shaft = new THREE.Mesh(
            new THREE.BoxGeometry(base, shaftHeight, base), concreteMat
        );
        shaft.position.y = shaftY;
        shaft.castShadow = true;
        g.add(shaft);

        // Vertical fluting strips on each face (signature look)
        const fluteCount = 7;
        for (const [nx, nz, axisX] of [
            [0, base / 2 + 0.01, true],
            [0, -base / 2 - 0.01, true],
            [base / 2 + 0.01, 0, false],
            [-base / 2 - 0.01, 0, false]
        ]) {
            for (let f = 0; f < fluteCount; f++) {
                const span = base - 1.0;
                const p = -span / 2 + (f + 0.5) * (span / fluteCount);
                const flute = new THREE.Mesh(
                    new THREE.BoxGeometry(
                        axisX ? span / fluteCount * 0.45 : 0.08,
                        shaftHeight - 2,
                        axisX ? 0.08 : span / fluteCount * 0.45
                    ),
                    concreteShadow
                );
                flute.position.set(
                    axisX ? p : nx,
                    shaftY,
                    axisX ? nz : p
                );
                g.add(flute);
            }
        }

        // A few slit windows up the shaft (stair and service)
        for (let s = 0; s < 6; s++) {
            const sy = 4 + s * 6.5;
            const slit = new THREE.Mesh(
                new THREE.PlaneGeometry(0.6, 2.8), darkMat
            );
            slit.position.set(0, sy, base / 2 + 0.02);
            g.add(slit);
        }

        // Belfry (open arched top where the carillon bells sit)
        const belfryY = 1.6 + shaftHeight + belfryHeight / 2;
        // Four corner piers
        for (const sx of [-1, 1]) {
            for (const sz of [-1, 1]) {
                const pier = new THREE.Mesh(
                    new THREE.BoxGeometry(0.9, belfryHeight, 0.9), concreteMat
                );
                pier.position.set(
                    sx * (shaftTop / 2 - 0.45),
                    belfryY,
                    sz * (shaftTop / 2 - 0.45)
                );
                pier.castShadow = true;
                g.add(pier);
            }
        }
        // Belfry floor and lintel
        const belfryFloor = new THREE.Mesh(
            new THREE.BoxGeometry(shaftTop + 0.4, 0.5, shaftTop + 0.4), concreteShadow
        );
        belfryFloor.position.y = 1.6 + shaftHeight + 0.25;
        g.add(belfryFloor);
        const belfryLintel = new THREE.Mesh(
            new THREE.BoxGeometry(shaftTop + 0.6, 0.7, shaftTop + 0.6), concreteShadow
        );
        belfryLintel.position.y = 1.6 + shaftHeight + belfryHeight - 0.35;
        belfryLintel.castShadow = true;
        g.add(belfryLintel);

        // 61-bell carillon (we don't need 61 — suggest with a 4x4 grid of bells)
        for (let i = 0; i < 4; i++) {
            for (let j = 0; j < 4; j++) {
                const bell = new THREE.Mesh(
                    new THREE.ConeGeometry(0.45, 0.8, 8, 1, true),
                    bronzeMat
                );
                bell.rotation.x = Math.PI;
                bell.position.set(
                    -2.1 + i * 1.4,
                    belfryY + 0.6 + (i + j) % 2 * 0.3,
                    -2.1 + j * 1.4
                );
                g.add(bell);
                // Clapper
                const clapper = new THREE.Mesh(
                    new THREE.SphereGeometry(0.1, 6, 6), darkMat
                );
                clapper.position.set(bell.position.x, bell.position.y - 0.45, bell.position.z);
                g.add(clapper);
            }
        }

        // Top cap — concrete slab
        const cap = new THREE.Mesh(
            new THREE.BoxGeometry(shaftTop + 1, capHeight, shaftTop + 1), concreteMat
        );
        cap.position.y = 1.6 + shaftHeight + belfryHeight + capHeight / 2;
        cap.castShadow = true;
        g.add(cap);

        // Small pyramidal pinnacle with flagpole
        const pinnacle = new THREE.Mesh(
            new THREE.ConeGeometry(0.8, 1.4, 4),
            concreteShadow
        );
        pinnacle.rotation.y = Math.PI / 4;
        pinnacle.position.y = 1.6 + shaftHeight + belfryHeight + capHeight + 0.7;
        g.add(pinnacle);

        const pole = new THREE.Mesh(
            new THREE.CylinderGeometry(0.05, 0.05, 3, 6),
            new THREE.MeshStandardMaterial({ color: 0xE6E6E6, roughness: 0.3, metalness: 0.5 })
        );
        pole.position.y = 1.6 + shaftHeight + belfryHeight + capHeight + 2.8;
        g.add(pole);

        // Entry doorway on the south face
        const door = new THREE.Mesh(
            new THREE.BoxGeometry(1.6, 2.4, 0.2),
            new THREE.MeshStandardMaterial({ color: 0x1F1410, roughness: 0.7 })
        );
        door.position.set(0, 2.8, base / 2 + 0.02);
        g.add(door);

        // Dedication plaque
        const plaque = new THREE.Mesh(
            new THREE.BoxGeometry(1.2, 0.5, 0.08), bronzeMat
        );
        plaque.position.set(1.8, 3.2, base / 2 + 0.06);
        g.add(plaque);

        g.position.set(0, this.getTerrainHeight(0, 0), 0);
        this.group.add(g);
    }

    // ===== Storke Plaza (around the base) =====
    createStorkePlaza() {
        // Concrete stepped plinths flanking the plaza
        const concreteMat = new THREE.MeshStandardMaterial({
            color: 0xC0B7A0, roughness: 0.88
        });
        for (const side of [-1, 1]) {
            const bench = new THREE.Mesh(
                new THREE.BoxGeometry(8, 0.4, 1.2), concreteMat
            );
            bench.position.set(side * 9, this.getTerrainHeight(side * 9, 8) + 0.24, 8);
            bench.castShadow = true;
            bench.receiveShadow = true;
            this.group.add(bench);
        }

        // Decorative planters
        for (const pos of [{ x: -11, z: -6 }, { x: 11, z: -6 }]) {
            const planter = new THREE.Mesh(
                new THREE.CylinderGeometry(1.2, 1.4, 0.8, 16),
                new THREE.MeshStandardMaterial({ color: 0x9A8F72, roughness: 0.9 })
            );
            planter.position.set(pos.x, this.getTerrainHeight(pos.x, pos.z) + 0.4, pos.z);
            planter.castShadow = true;
            this.group.add(planter);

            const shrub = new THREE.Mesh(
                new THREE.SphereGeometry(1.1, 10, 8),
                new THREE.MeshStandardMaterial({ color: 0x4F7A38, roughness: 0.9 })
            );
            shrub.scale.set(1, 0.7, 1);
            shrub.position.set(pos.x, this.getTerrainHeight(pos.x, pos.z) + 1.4, pos.z);
            shrub.castShadow = true;
            this.group.add(shrub);
        }

        // Brass UCSB seal medallion set into the plaza
        const sealMat = new THREE.MeshStandardMaterial({
            color: 0x8B6F3E, emissive: 0x14100A, roughness: 0.4, metalness: 0.85
        });
        const seal = new THREE.Mesh(
            new THREE.CircleGeometry(1.6, 32), sealMat
        );
        seal.rotation.x = -Math.PI / 2;
        seal.position.set(0, this.getTerrainHeight(0, 5) + 0.06, 5);
        seal.userData.noCollision = true;
        this.group.add(seal);
    }

    // ===== South Hall — brutalist math building =====
    createSouthHall() {
        const sh = new THREE.Group();
        sh.userData = {
            name: 'South Hall', isInteractable: true,
            type: 'building', interactionType: 'Enter'
        };

        const concreteMat = new THREE.MeshStandardMaterial({
            color: 0xBDB4A0, emissive: 0x100E0A, roughness: 0.9, metalness: 0.04
        });
        const concreteShadow = new THREE.MeshStandardMaterial({
            color: 0x9A9285, roughness: 0.95
        });
        const windowMat = new THREE.MeshStandardMaterial({
            color: 0x2E383E, roughness: 0.3, metalness: 0.35,
            transparent: true, opacity: 0.72
        });
        const doorMat = new THREE.MeshStandardMaterial({
            color: 0x27201A, roughness: 0.7
        });
        const trimMat = new THREE.MeshStandardMaterial({
            color: 0x7A7368, roughness: 0.8
        });

        const floors = 6;
        const floorH = 3.8;
        const w = 32, d = 22;
        const totalH = floors * floorH;
        const origin = this.SOUTH_HALL_ORIGIN;

        // Plaza base
        const plaza = new THREE.Mesh(
            new THREE.BoxGeometry(w + 5, 0.5, d + 5), concreteShadow
        );
        plaza.position.y = 0.25;
        plaza.receiveShadow = true;
        sh.add(plaza);

        // Stairs up to the main entry (south face)
        for (let i = 0; i < 3; i++) {
            const step = new THREE.Mesh(
                new THREE.BoxGeometry(w - 8, 0.3, 0.8), concreteShadow
            );
            step.position.set(0, 0.5 + i * 0.3, d / 2 + 1.5 - i * 0.8);
            sh.add(step);
        }

        // Main mass
        const body = new THREE.Mesh(
            new THREE.BoxGeometry(w, totalH, d), concreteMat
        );
        body.position.y = 0.5 + totalH / 2;
        body.castShadow = true;
        body.receiveShadow = true;
        sh.add(body);

        // Deep concrete sunshades between floors (signature brutalist look)
        for (let f = 1; f <= floors; f++) {
            const sy = 0.5 + f * floorH;
            const shade = new THREE.Mesh(
                new THREE.BoxGeometry(w + 1.4, 0.5, d + 1.4), concreteShadow
            );
            shade.position.y = sy;
            shade.castShadow = true;
            sh.add(shade);
        }

        // Ribbon windows on north/south facades
        for (let f = 0; f < floors; f++) {
            const wy = 0.5 + f * floorH + floorH / 2;
            for (const sz of [d / 2 + 0.02, -d / 2 - 0.02]) {
                const ribbon = new THREE.Mesh(
                    new THREE.PlaneGeometry(w - 3.5, floorH - 1.6), windowMat
                );
                ribbon.position.set(0, wy, sz);
                ribbon.rotation.y = sz > 0 ? 0 : Math.PI;
                sh.add(ribbon);

                // Vertical concrete mullions
                for (let m = 1; m < 7; m++) {
                    const mull = new THREE.Mesh(
                        new THREE.BoxGeometry(0.22, floorH - 1.2, 0.1), concreteMat
                    );
                    mull.position.set(
                        -w / 2 + 1.75 + m * ((w - 3.5) / 7),
                        wy, sz + (sz > 0 ? 0.05 : -0.05)
                    );
                    sh.add(mull);
                }
            }
        }

        // Short facades — smaller windows
        for (let f = 0; f < floors; f++) {
            const wy = 0.5 + f * floorH + floorH / 2;
            for (const sx of [w / 2 + 0.02, -w / 2 - 0.02]) {
                const win = new THREE.Mesh(
                    new THREE.PlaneGeometry(d - 5, floorH - 1.8), windowMat
                );
                win.position.set(sx, wy, 0);
                win.rotation.y = sx > 0 ? Math.PI / 2 : -Math.PI / 2;
                sh.add(win);
            }
        }

        // Recessed ground-floor arcade
        const arcade = new THREE.Mesh(
            new THREE.BoxGeometry(w - 8, floorH - 0.4, 1.2),
            new THREE.MeshStandardMaterial({ color: 0x2A2420, roughness: 0.8 })
        );
        arcade.position.set(0, 0.5 + floorH / 2, d / 2 - 0.5);
        sh.add(arcade);

        // Entry double doors
        const door = new THREE.Mesh(
            new THREE.BoxGeometry(3.2, 2.6, 0.2), doorMat
        );
        door.position.set(0, 0.5 + 1.3, d / 2 + 0.05);
        sh.add(door);

        // Concrete building sign
        const sign = new THREE.Mesh(
            new THREE.BoxGeometry(5, 1, 0.08), trimMat
        );
        sign.position.set(0, 0.5 + floorH - 0.7, d / 2 + 0.05);
        sh.add(sign);

        // Roof slab + penthouse
        const roofSlab = new THREE.Mesh(
            new THREE.BoxGeometry(w + 1.8, 0.6, d + 1.8), concreteShadow
        );
        roofSlab.position.y = 0.5 + totalH + 0.3;
        sh.add(roofSlab);
        const penthouse = new THREE.Mesh(
            new THREE.BoxGeometry(w * 0.5, 3, d * 0.55), concreteMat
        );
        penthouse.position.y = 0.5 + totalH + 2.1;
        penthouse.castShadow = true;
        sh.add(penthouse);

        sh.position.set(origin.x, this.getTerrainHeight(origin.x, origin.z), origin.z);
        this.group.add(sh);
    }

    // ===== UCen — University Center student union =====
    createUCen() {
        const uc = new THREE.Group();
        uc.userData = {
            name: 'University Center (UCen)', isInteractable: true,
            type: 'building', interactionType: 'Enter'
        };

        const stuccoMat = new THREE.MeshStandardMaterial({
            color: 0xE8DCC0, emissive: 0x1E1A14, roughness: 0.82
        });
        const accentMat = new THREE.MeshStandardMaterial({
            color: 0xC94A3A, roughness: 0.7  // Terracotta accent
        });
        const woodMat = new THREE.MeshStandardMaterial({
            color: 0x8A6540, roughness: 0.85
        });
        const windowMat = new THREE.MeshStandardMaterial({
            color: 0x384048, roughness: 0.3, metalness: 0.3,
            transparent: true, opacity: 0.65
        });
        const steelMat = new THREE.MeshStandardMaterial({
            color: 0x3A3A3A, roughness: 0.4, metalness: 0.6
        });
        const tileRoofMat = new THREE.MeshStandardMaterial({
            color: 0xB25A3D, roughness: 0.8
        });

        const origin = this.UCEN_ORIGIN;

        // Two-wing L-shaped complex — dining wing + bookstore wing
        // ---- Main wing (dining / lounge) ----
        const mw = 34, md = 18, mh = 10;
        const mainBody = new THREE.Mesh(
            new THREE.BoxGeometry(mw, mh, md), stuccoMat
        );
        mainBody.position.set(0, mh / 2, 0);
        mainBody.castShadow = true; mainBody.receiveShadow = true;
        uc.add(mainBody);

        // Terracotta belt-course
        const belt = new THREE.Mesh(
            new THREE.BoxGeometry(mw + 0.3, 0.3, md + 0.3), accentMat
        );
        belt.position.set(0, mh * 0.55, 0);
        uc.add(belt);

        // Large curtain-wall glazing on the south (plaza) face
        for (let floor = 0; floor < 2; floor++) {
            const wy = 2.2 + floor * 4.5;
            const curtain = new THREE.Mesh(
                new THREE.PlaneGeometry(mw - 4, 3.6), windowMat
            );
            curtain.position.set(0, wy, md / 2 + 0.02);
            uc.add(curtain);
            // Mullions
            for (let m = 1; m < 8; m++) {
                const mull = new THREE.Mesh(
                    new THREE.BoxGeometry(0.12, 3.8, 0.08), steelMat
                );
                mull.position.set(-mw / 2 + 2 + m * ((mw - 4) / 8), wy, md / 2 + 0.06);
                uc.add(mull);
            }
            // Horizontal transom
            const transom = new THREE.Mesh(
                new THREE.BoxGeometry(mw - 4, 0.1, 0.08), steelMat
            );
            transom.position.set(0, wy, md / 2 + 0.06);
            uc.add(transom);
        }

        // Windows on back + sides
        for (const [sx, sz, rot] of [
            [0, -md / 2 - 0.02, Math.PI],
            [mw / 2 + 0.02, 0, Math.PI / 2],
            [-mw / 2 - 0.02, 0, -Math.PI / 2]
        ]) {
            for (let f = 0; f < 2; f++) {
                const wy = 2.5 + f * 4.5;
                const win = new THREE.Mesh(
                    new THREE.PlaneGeometry(
                        (rot === Math.PI) ? mw - 6 : md - 6, 2.2
                    ),
                    windowMat
                );
                win.position.set(sx, wy, sz);
                win.rotation.y = rot;
                uc.add(win);
            }
        }

        // Low-pitched red tile roof over the main wing
        const roof = new THREE.Mesh(
            new THREE.BoxGeometry(mw + 1.2, 0.6, md + 1.2), tileRoofMat
        );
        roof.position.y = mh + 0.3;
        roof.castShadow = true;
        uc.add(roof);
        // Suggestion of tile ridges
        for (let i = 0; i < 10; i++) {
            const ridge = new THREE.Mesh(
                new THREE.BoxGeometry(mw + 1.4, 0.15, 0.3), accentMat
            );
            ridge.position.set(0, mh + 0.6, -md / 2 - 0.5 + i * (md + 1.2) / 9);
            uc.add(ridge);
        }

        // Cantilevered awning over entrance
        const awning = new THREE.Mesh(
            new THREE.BoxGeometry(10, 0.2, 4), woodMat
        );
        awning.position.set(0, 3.8, md / 2 + 2);
        awning.castShadow = true;
        uc.add(awning);
        for (let i = -1; i <= 1; i++) {
            const strut = new THREE.Mesh(
                new THREE.CylinderGeometry(0.1, 0.1, 3.8, 8), steelMat
            );
            strut.rotation.z = -0.25;
            strut.position.set(i * 4.2, 1.9, md / 2 + 2);
            uc.add(strut);
        }

        // ---- Bookstore wing (perpendicular, to the west) ----
        const bw = 18, bd = 12, bh = 8;
        const bookstore = new THREE.Mesh(
            new THREE.BoxGeometry(bw, bh, bd), stuccoMat
        );
        bookstore.position.set(-mw / 2 - bw / 2 + 2, bh / 2, -md / 2 + bd / 2);
        bookstore.castShadow = true;
        uc.add(bookstore);

        const bRoof = new THREE.Mesh(
            new THREE.BoxGeometry(bw + 1.2, 0.5, bd + 1.2), tileRoofMat
        );
        bRoof.position.set(-mw / 2 - bw / 2 + 2, bh + 0.25, -md / 2 + bd / 2);
        uc.add(bRoof);

        // Signage: "UCen" lettering on main facade
        const signPanel = new THREE.Mesh(
            new THREE.BoxGeometry(5, 0.9, 0.12), accentMat
        );
        signPanel.position.set(0, mh - 1.2, md / 2 + 0.06);
        uc.add(signPanel);

        // Outdoor patio with tables on the south side
        const patioMat = new THREE.MeshStandardMaterial({
            color: 0xB8A98A, roughness: 0.92
        });
        const patio = new THREE.Mesh(
            new THREE.BoxGeometry(mw, 0.2, 10), patioMat
        );
        patio.position.set(0, 0.1, md / 2 + 5);
        patio.receiveShadow = true;
        uc.add(patio);

        // Patio umbrellas with small bistro tables
        for (let i = 0; i < 4; i++) {
            const tx = -mw / 2 + 4 + i * ((mw - 8) / 3);
            const tz = md / 2 + 5;

            const table = new THREE.Mesh(
                new THREE.CylinderGeometry(0.7, 0.7, 0.08, 16), steelMat
            );
            table.position.set(tx, 0.9, tz);
            uc.add(table);
            const pole = new THREE.Mesh(
                new THREE.CylinderGeometry(0.04, 0.04, 0.9, 6), steelMat
            );
            pole.position.set(tx, 0.45, tz);
            uc.add(pole);

            // Umbrella
            const mast = new THREE.Mesh(
                new THREE.CylinderGeometry(0.04, 0.04, 3, 6), steelMat
            );
            mast.position.set(tx, 2.4, tz);
            uc.add(mast);
            const umbrella = new THREE.Mesh(
                new THREE.ConeGeometry(1.6, 0.6, 8, 1, true),
                new THREE.MeshStandardMaterial({
                    color: 0x2F5F7A, roughness: 0.85, side: THREE.DoubleSide
                })
            );
            umbrella.position.set(tx, 3.9, tz);
            uc.add(umbrella);

            // Chairs around the table
            for (const a of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
                const chair = new THREE.Mesh(
                    new THREE.BoxGeometry(0.5, 0.08, 0.5), steelMat
                );
                chair.position.set(tx + Math.cos(a) * 1.2, 0.55, tz + Math.sin(a) * 1.2);
                uc.add(chair);
                const leg = new THREE.Mesh(
                    new THREE.CylinderGeometry(0.03, 0.03, 0.5, 6), steelMat
                );
                leg.position.set(chair.position.x, 0.25, chair.position.z);
                uc.add(leg);
            }
        }

        uc.position.set(origin.x, this.getTerrainHeight(origin.x, origin.z), origin.z);
        this.group.add(uc);
    }

    // ===== Davidson Library =====
    createDavidsonLibrary() {
        const lib = new THREE.Group();
        lib.userData = {
            name: 'Davidson Library', isInteractable: true,
            type: 'building', interactionType: 'Enter'
        };

        const concreteMat = new THREE.MeshStandardMaterial({
            color: 0xCAC2AE, emissive: 0x121010, roughness: 0.88
        });
        const concreteShadow = new THREE.MeshStandardMaterial({
            color: 0xA89F8C, roughness: 0.92
        });
        const windowMat = new THREE.MeshStandardMaterial({
            color: 0x2C3440, roughness: 0.3, metalness: 0.35,
            transparent: true, opacity: 0.7
        });
        const glassAtriumMat = new THREE.MeshStandardMaterial({
            color: 0x9DBACC, roughness: 0.1, metalness: 0.35,
            transparent: true, opacity: 0.45
        });
        const steelMat = new THREE.MeshStandardMaterial({
            color: 0x3E3E3E, roughness: 0.4, metalness: 0.65
        });

        const origin = this.LIBRARY_ORIGIN;

        // Two massings — tall 8-story tower + low-rise reading-room wing
        // Tower
        const tw = 26, td = 18, th = 34;
        const tower = new THREE.Mesh(
            new THREE.BoxGeometry(tw, th, td), concreteMat
        );
        tower.position.set(0, th / 2, 0);
        tower.castShadow = true;
        tower.receiveShadow = true;
        lib.add(tower);

        // Floor spandrels every story
        const lfloors = 8;
        const lfloorH = th / lfloors;
        for (let f = 1; f < lfloors; f++) {
            const sy = f * lfloorH;
            const band = new THREE.Mesh(
                new THREE.BoxGeometry(tw + 0.4, 0.4, td + 0.4), concreteShadow
            );
            band.position.y = sy;
            lib.add(band);
        }
        // Window strips on all sides
        for (let f = 0; f < lfloors; f++) {
            const wy = f * lfloorH + lfloorH / 2;
            for (const [sx, sz, rot, len] of [
                [0, td / 2 + 0.02, 0, tw - 2.5],
                [0, -td / 2 - 0.02, Math.PI, tw - 2.5],
                [tw / 2 + 0.02, 0, Math.PI / 2, td - 2.5],
                [-tw / 2 - 0.02, 0, -Math.PI / 2, td - 2.5]
            ]) {
                const win = new THREE.Mesh(
                    new THREE.PlaneGeometry(len, lfloorH - 1.2), windowMat
                );
                win.position.set(sx, wy, sz);
                win.rotation.y = rot;
                lib.add(win);
            }
        }

        // Pyramidal glass atrium roof peak in one corner (library reading room skylight)
        const atrium = new THREE.Mesh(
            new THREE.ConeGeometry(6, 5, 4), glassAtriumMat
        );
        atrium.rotation.y = Math.PI / 4;
        atrium.position.set(tw / 2 - 6, th + 2.5, -td / 2 + 6);
        lib.add(atrium);

        // Low reading-room wing (west)
        const lw = 22, ld = 14, lh = 7;
        const wing = new THREE.Mesh(
            new THREE.BoxGeometry(lw, lh, ld), concreteMat
        );
        wing.position.set(-tw / 2 - lw / 2 + 2, lh / 2, -2);
        wing.castShadow = true;
        lib.add(wing);
        // Ribbon of tall glass
        const wingGlass = new THREE.Mesh(
            new THREE.PlaneGeometry(lw - 3, lh - 2), windowMat
        );
        wingGlass.position.set(-tw / 2 - lw / 2 + 2, lh / 2, ld / 2 - 2 + 0.02);
        lib.add(wingGlass);

        // Entry portico with steel frame
        for (const sx of [-3, 3]) {
            const post = new THREE.Mesh(
                new THREE.BoxGeometry(0.35, 5, 0.35), steelMat
            );
            post.position.set(sx, 2.5, td / 2 + 3);
            lib.add(post);
        }
        const canopy = new THREE.Mesh(
            new THREE.BoxGeometry(10, 0.3, 5), concreteShadow
        );
        canopy.position.set(0, 5.1, td / 2 + 3);
        canopy.castShadow = true;
        lib.add(canopy);
        // Double doors
        const doorMat = new THREE.MeshStandardMaterial({
            color: 0x1E1814, roughness: 0.6
        });
        const doors = new THREE.Mesh(
            new THREE.BoxGeometry(4, 3, 0.1), doorMat
        );
        doors.position.set(0, 1.5, td / 2 + 0.06);
        lib.add(doors);

        // Roof slab
        const roof = new THREE.Mesh(
            new THREE.BoxGeometry(tw + 1.2, 0.6, td + 1.2), concreteShadow
        );
        roof.position.y = th + 0.3;
        lib.add(roof);

        lib.position.set(origin.x, this.getTerrainHeight(origin.x, origin.z), origin.z);
        this.group.add(lib);
    }

    // ===== Palm trees — UCSB's signature =====
    createPalmTrees() {
        // Rows of palms flanking the extended N-S spine (Library → Lagoon)
        const positions = [];
        for (let i = 0; i < 10; i++) {
            const z = -80 + i * 14;
            positions.push({ x: -14, z });
            positions.push({ x: 14, z });
        }
        // Palms around the lagoon
        const L = this.LAGOON;
        for (let i = 0; i < 14; i++) {
            const a = (i / 14) * Math.PI * 2;
            positions.push({
                x: L.cx + Math.cos(a) * (L.radiusX + 10),
                z: L.cz + Math.sin(a) * (L.radiusZ + 8)
            });
        }
        // Scatter across outer lawn
        for (let i = 0; i < 20; i++) {
            positions.push({
                x: (Math.random() - 0.5) * 240,
                z: (Math.random() - 0.5) * 220 - 20
            });
        }

        positions.forEach(p => {
            if (this.isNearBuilding(p.x, p.z)) return;
            if (this.isInLagoon(p.x, p.z, 0.95)) return;
            const palm = this.createPalmTree(8 + Math.random() * 5);
            palm.position.set(p.x, this.getTerrainHeight(p.x, p.z), p.z);
            palm.rotation.y = Math.random() * Math.PI * 2;
            this.group.add(palm);
        });
    }

    createPalmTree(height) {
        const g = new THREE.Group();

        const trunkMat = new THREE.MeshStandardMaterial({
            color: 0x8D6E4A, roughness: 0.9
        });
        const ringMat = new THREE.MeshStandardMaterial({
            color: 0x5E432A, roughness: 0.95
        });
        const frondMat = new THREE.MeshStandardMaterial({
            color: new THREE.Color().setHSL(0.28, 0.55, 0.35),
            roughness: 0.85, side: THREE.DoubleSide
        });

        const segments = Math.max(4, Math.floor(height * 0.6));
        for (let i = 0; i < segments; i++) {
            const t = i / segments;
            const segY = (i + 0.5) * (height / segments);
            // Slight sway / lean
            const leanX = Math.sin(t * Math.PI * 0.4) * 0.3;
            const r = 0.25 + (1 - t) * 0.15;
            const seg = new THREE.Mesh(
                new THREE.CylinderGeometry(r, r + 0.02, height / segments + 0.05, 8),
                trunkMat
            );
            seg.position.set(leanX, segY, 0);
            seg.castShadow = true;
            g.add(seg);

            // Ring scar every few segments
            if (i % 2 === 0) {
                const ring = new THREE.Mesh(
                    new THREE.TorusGeometry(r + 0.02, 0.04, 4, 10), ringMat
                );
                ring.position.set(leanX, segY, 0);
                ring.rotation.x = Math.PI / 2;
                g.add(ring);
            }
        }

        // Fronds at the top
        const topX = Math.sin(Math.PI * 0.4) * 0.3;
        const frondCount = 11;
        for (let i = 0; i < frondCount; i++) {
            const a = (i / frondCount) * Math.PI * 2;
            const droop = 0.7 + Math.random() * 0.3;
            const frond = new THREE.Mesh(
                new THREE.PlaneGeometry(0.6, 4 + Math.random() * 1.2),
                frondMat
            );
            frond.position.set(
                topX + Math.cos(a) * 0.3,
                height - 0.2,
                Math.sin(a) * 0.3
            );
            frond.rotation.y = a + Math.PI / 2;
            frond.rotation.x = -0.6 * droop;
            // Swing the frond outward & downward
            frond.translateY(-1.2);
            frond.castShadow = true;
            g.add(frond);
        }

        // Coconut cluster
        const coconutMat = new THREE.MeshStandardMaterial({
            color: 0x3D2A18, roughness: 0.85
        });
        for (let i = 0; i < 5; i++) {
            const a = (i / 5) * Math.PI * 2;
            const nut = new THREE.Mesh(
                new THREE.SphereGeometry(0.22, 8, 6), coconutMat
            );
            nut.position.set(
                topX + Math.cos(a) * 0.35,
                height - 0.6,
                Math.sin(a) * 0.35
            );
            g.add(nut);
        }

        return g;
    }

    // ===== A row of eucalyptus along the west side =====
    createEucalyptusRow() {
        const trunkMat = new THREE.MeshStandardMaterial({
            color: 0xA88B72, roughness: 0.85
        });
        const leafMat = new THREE.MeshStandardMaterial({
            color: new THREE.Color().setHSL(0.29, 0.35, 0.4), roughness: 0.85
        });
        for (let i = 0; i < 18; i++) {
            const x = -150 + (Math.random() - 0.5) * 12;
            const z = -100 + i * 12 + (Math.random() - 0.5) * 5;
            if (this.isNearBuilding(x, z)) continue;
            const tree = this.createEucalyptus(trunkMat, leafMat);
            tree.position.set(x, this.getTerrainHeight(x, z), z);
            tree.scale.setScalar(0.8 + Math.random() * 0.5);
            this.group.add(tree);
        }
    }

    createEucalyptus(trunkMat, leafMat) {
        const g = new THREE.Group();
        const h = 14 + Math.random() * 6;
        const trunk = new THREE.Mesh(
            new THREE.CylinderGeometry(0.3, 0.5, h, 8), trunkMat
        );
        trunk.position.y = h / 2;
        trunk.castShadow = true;
        g.add(trunk);

        const canopies = 3 + Math.floor(Math.random() * 2);
        for (let i = 0; i < canopies; i++) {
            const r = 1.8 + Math.random() * 1.6;
            const leaf = new THREE.Mesh(
                new THREE.SphereGeometry(r, 8, 6), leafMat
            );
            leaf.position.set(
                (Math.random() - 0.5) * 2.2,
                h * 0.65 + i * 2 + Math.random(),
                (Math.random() - 0.5) * 2.2
            );
            leaf.scale.set(1, 0.7, 1);
            leaf.castShadow = true;
            g.add(leaf);
        }
        return g;
    }

    // ===== Bike racks clustered outside every major building =====
    createBikeRacks() {
        const clusters = [
            { x: 40, z: -40, n: 6, ry: 0 },        // South Hall (NE)
            { x: 20, z: 66, n: 8, ry: Math.PI / 2 }, // UCen (SE, lagoon shore)
            { x: -12, z: -80, n: 10, ry: 0 },      // Davidson Library (N)
            { x: 0, z: 20, n: 5, ry: Math.PI / 2 } // Storke Plaza
        ];
        clusters.forEach(c => {
            for (let i = 0; i < c.n; i++) {
                const rack = this.createBikeRack();
                const spacing = 0.9;
                const offset = (i - (c.n - 1) / 2) * spacing;
                const localDX = Math.cos(c.ry) * offset;
                const localDZ = Math.sin(c.ry) * offset;
                rack.position.set(
                    c.x + localDX,
                    this.getTerrainHeight(c.x + localDX, c.z + localDZ),
                    c.z + localDZ
                );
                rack.rotation.y = c.ry;
                this.group.add(rack);
            }
        });
    }

    createBikeRack() {
        const g = new THREE.Group();
        const mat = new THREE.MeshStandardMaterial({
            color: 0x5E6368, roughness: 0.55, metalness: 0.65
        });
        // Inverted-U bike rack
        const arc = new THREE.Mesh(
            new THREE.TorusGeometry(0.4, 0.04, 6, 16, Math.PI), mat
        );
        arc.rotation.x = Math.PI / 2;
        arc.rotation.z = Math.PI;
        arc.position.y = 0.45;
        g.add(arc);
        for (const side of [-1, 1]) {
            const leg = new THREE.Mesh(
                new THREE.CylinderGeometry(0.04, 0.04, 0.5, 6), mat
            );
            leg.position.set(side * 0.4, 0.25, 0);
            g.add(leg);
        }
        return g;
    }

    createParkedBikes() {
        // A few bikes parked around campus (matches the rack clusters)
        const spots = [
            { x: 40.4, z: -40, ry: 0.05, c: 0x2B6FBA },
            { x: 41.5, z: -40, ry: -0.1, c: 0xC92C45 },
            { x: 20, z: 66.5, ry: Math.PI / 2, c: 0x1F9C4E },
            { x: 20, z: 65.2, ry: Math.PI / 2 + 0.05, c: 0xFDD835 },
            { x: -12, z: -80, ry: 0, c: 0xE47A1F },
            { x: -10.5, z: -80, ry: 0.1, c: 0x653A92 }
        ];
        spots.forEach(s => {
            const bike = this.createBike(s.c);
            bike.position.set(s.x, this.getTerrainHeight(s.x, s.z), s.z);
            bike.rotation.y = s.ry;
            this.group.add(bike);
        });
    }

    createBike(frameColor) {
        const g = new THREE.Group();
        const frameMat = new THREE.MeshStandardMaterial({
            color: frameColor, roughness: 0.5, metalness: 0.4
        });
        const tireMat = new THREE.MeshStandardMaterial({
            color: 0x151515, roughness: 0.9
        });

        // Two wheels
        for (const sx of [-0.55, 0.55]) {
            const wheel = new THREE.Mesh(
                new THREE.TorusGeometry(0.33, 0.06, 6, 18), tireMat
            );
            wheel.rotation.y = Math.PI / 2;
            wheel.position.set(sx, 0.33, 0);
            g.add(wheel);
            const hub = new THREE.Mesh(
                new THREE.CylinderGeometry(0.04, 0.04, 0.08, 6), frameMat
            );
            hub.rotation.z = Math.PI / 2;
            hub.position.set(sx, 0.33, 0);
            g.add(hub);
        }

        // Frame tubes
        const tubes = [
            { len: 0.85, pos: [0, 0.55, 0], rot: [0, 0, Math.PI / 2] },  // top tube
            { len: 0.55, pos: [-0.35, 0.48, 0], rot: [0, 0, -0.9] },      // seat tube
            { len: 0.7, pos: [0.15, 0.48, 0], rot: [0, 0, 0.7] }          // down tube
        ];
        tubes.forEach(t => {
            const tube = new THREE.Mesh(
                new THREE.CylinderGeometry(0.03, 0.03, t.len, 6), frameMat
            );
            tube.position.set(...t.pos);
            tube.rotation.set(...t.rot);
            g.add(tube);
        });

        // Handlebars
        const bar = new THREE.Mesh(
            new THREE.CylinderGeometry(0.025, 0.025, 0.45, 6), frameMat
        );
        bar.rotation.x = Math.PI / 2;
        bar.position.set(0.55, 0.85, 0);
        g.add(bar);

        // Seat
        const seat = new THREE.Mesh(
            new THREE.BoxGeometry(0.22, 0.04, 0.09),
            new THREE.MeshStandardMaterial({ color: 0x1E1E1E, roughness: 0.7 })
        );
        seat.position.set(-0.55, 0.78, 0);
        g.add(seat);

        return g;
    }

    // ===== Benches =====
    createBenches() {
        const positions = [
            { x: -7, z: 8, ry: 0 }, { x: 7, z: 8, ry: 0 },        // plaza south
            { x: -7, z: -10, ry: Math.PI }, { x: 7, z: -10, ry: Math.PI }, // plaza north
            { x: -30, z: -6, ry: Math.PI / 2 },
            { x: 30, z: -6, ry: -Math.PI / 2 },
            { x: -22, z: 92, ry: 0 },                              // near observation deck
            { x: 30, z: 70, ry: Math.PI }                          // UCen patio edge
        ];
        positions.forEach(p => {
            const b = this.createBench();
            b.position.set(p.x, this.getTerrainHeight(p.x, p.z), p.z);
            b.rotation.y = p.ry;
            this.group.add(b);
        });
    }

    createBench() {
        const b = new THREE.Group();
        const woodMat = new THREE.MeshStandardMaterial({
            color: 0x8A6540, roughness: 0.85
        });
        const metalMat = new THREE.MeshStandardMaterial({
            color: 0x333333, roughness: 0.5, metalness: 0.65
        });
        for (let i = 0; i < 4; i++) {
            const slat = new THREE.Mesh(
                new THREE.BoxGeometry(1.9, 0.08, 0.2), woodMat
            );
            slat.position.set(0, 0.5, -0.3 + i * 0.22);
            b.add(slat);
        }
        for (let i = 0; i < 3; i++) {
            const back = new THREE.Mesh(
                new THREE.BoxGeometry(1.9, 0.08, 0.12), woodMat
            );
            back.position.set(0, 0.9 + i * 0.18, -0.35);
            b.add(back);
        }
        for (const x of [-0.8, 0.8]) {
            const leg = new THREE.Mesh(
                new THREE.BoxGeometry(0.08, 0.5, 0.7), metalMat
            );
            leg.position.set(x, 0.25, -0.15);
            b.add(leg);
            const post = new THREE.Mesh(
                new THREE.BoxGeometry(0.08, 0.8, 0.08), metalMat
            );
            post.position.set(x, 0.9, -0.35);
            b.add(post);
        }
        return b;
    }

    // ===== Chalkboards with UCSB-flavored math topics =====
    createChalkboards() {
        const topics = [
            { x: -14, z: 20, ry: Math.PI / 6, name: 'Geometric Topology' },
            { x: 14, z: 20, ry: -Math.PI / 6, name: 'Operator Algebras' },
            { x: -20, z: -40, ry: Math.PI / 4, name: 'Conformal Field Theory' },
            { x: 25, z: -35, ry: -Math.PI / 4, name: 'Mirror Symmetry' },
            { x: -18, z: 88, ry: Math.PI, name: 'Ergodic Theory' },
            { x: 35, z: 65, ry: Math.PI, name: 'Partial Differential Equations' }
        ];
        topics.forEach(t => {
            const cb = this.createChalkboard(t.name);
            cb.position.set(t.x, this.getTerrainHeight(t.x, t.z), t.z);
            cb.rotation.y = t.ry;
            this.group.add(cb);
        });
    }

    createChalkboard(name) {
        const g = new THREE.Group();
        g.userData = {
            name, isInteractable: true, type: 'chalkboard', interactionType: 'Read'
        };
        const postMat = new THREE.MeshStandardMaterial({
            color: 0x5A3C28, roughness: 0.9
        });
        const frameMat = new THREE.MeshStandardMaterial({
            color: 0x3B2820, roughness: 0.8
        });
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
        const frame = new THREE.Mesh(
            new THREE.BoxGeometry(3.1, 2.05, 0.1), frameMat
        );
        frame.position.set(0, 1.85, 0);
        g.add(frame);
        const slate = new THREE.Mesh(
            new THREE.BoxGeometry(2.8, 1.75, 0.05), slateMat
        );
        slate.position.set(0, 1.85, 0.06);
        g.add(slate);
        const tray = new THREE.Mesh(
            new THREE.BoxGeometry(2.55, 0.08, 0.14), frameMat
        );
        tray.position.set(0, 0.92, 0.12);
        g.add(tray);
        const chalk = new THREE.Mesh(
            new THREE.CylinderGeometry(0.03, 0.03, 0.2, 6),
            new THREE.MeshStandardMaterial({ color: 0xEEEEEE, roughness: 0.95 })
        );
        chalk.position.set(0.3, 0.97, 0.15);
        chalk.rotation.z = Math.PI / 2;
        g.add(chalk);

        return g;
    }

    // ===== Way-finding signs with the UCSB gold accent =====
    createSignage() {
        const posts = [
            { x: 6, z: 5, name: 'Storke Plaza' },
            { x: 0, z: 40, name: 'Campus Lagoon ↓' },
            { x: -22, z: -50, name: '↑ Davidson Library' },
            { x: 26, z: -12, name: 'South Hall ↗' }
        ];
        const postMat = new THREE.MeshStandardMaterial({
            color: 0x3A3A3A, roughness: 0.5, metalness: 0.55
        });
        const panelMat = new THREE.MeshStandardMaterial({
            color: 0x003660, roughness: 0.6
        });
        const trimMat = new THREE.MeshStandardMaterial({
            color: 0xFEBC11, emissive: 0x221808, roughness: 0.5
        });

        posts.forEach(p => {
            const g = new THREE.Group();
            g.userData = {
                name: p.name, isInteractable: false, type: 'sign'
            };
            const post = new THREE.Mesh(
                new THREE.CylinderGeometry(0.08, 0.08, 2.4, 6), postMat
            );
            post.position.y = 1.2;
            g.add(post);
            const panel = new THREE.Mesh(
                new THREE.BoxGeometry(1.6, 0.45, 0.08), panelMat
            );
            panel.position.y = 2.1;
            g.add(panel);
            const trim = new THREE.Mesh(
                new THREE.BoxGeometry(1.65, 0.1, 0.1), trimMat
            );
            trim.position.y = 2.38;
            g.add(trim);

            g.position.set(p.x, this.getTerrainHeight(p.x, p.z), p.z);
            this.group.add(g);
        });
    }

    // ===== Helpers =====
    isNearBuilding(x, z) {
        // Storke Tower
        if (Math.abs(x) < 6 && Math.abs(z) < 6) return true;
        // Library
        const lib = this.LIBRARY_ORIGIN;
        if (Math.abs(x - lib.x) < 28 && Math.abs(z - lib.z) < 20) return true;
        // South Hall
        const sh = this.SOUTH_HALL_ORIGIN;
        if (Math.abs(x - sh.x) < 20 && Math.abs(z - sh.z) < 14) return true;
        // UCen (includes bookstore wing + patio)
        const uc = this.UCEN_ORIGIN;
        if (x > uc.x - 28 && x < uc.x + 20 && z > uc.z - 15 && z < uc.z + 16) return true;
        return false;
    }

    isInLagoon(x, z, scale = 1.0) {
        const L = this.LAGOON;
        const dx = (x - L.cx) / (L.radiusX * scale);
        const dz = (z - L.cz) / (L.radiusZ * scale);
        return dx * dx + dz * dz < 1.0;
    }

    getInteractables() {
        const out = [];
        this.group.traverse(obj => {
            if (obj.userData && obj.userData.isInteractable) out.push(obj);
        });
        return out;
    }
}
