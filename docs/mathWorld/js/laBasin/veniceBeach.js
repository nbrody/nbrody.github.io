/**
 * Venice Beach & Santa Monica Pier
 *
 * The iconic 3 km stretch of LA coast compressed into one walkable
 * scene: Ocean Front Walk promenade with its street performers and
 * graffiti walls, Muscle Beach on the sand, the Venice Skatepark, and
 * — at the north end — the Santa Monica Pier with Pacific Park's
 * Ferris wheel, roller coaster, Looff Hippodrome carousel, and the
 * "End of Route 66" sign.
 *
 * Origin (0, 0, 0) = Venice boardwalk at the player's spawn point
 * (real GPS 33.9850, -118.4695).
 *
 * Coordinate conventions:
 *   -Z is north   (toward Santa Monica)
 *   +Z is south
 *   -X is west    (ocean)
 *   +X is east    (inland: shops, streets)
 *
 * Real-world compression:
 *   Venice boardwalk → SM Pier is 3 km in reality, 370 m in game.
 *   Pier length 490 m → ~400 m in game.
 *   See refs/topography.md for the full table.
 */
import * as THREE from 'three';

// ---------- Scene constants ----------
const WATER_EDGE_X = -60;           // Where sand meets ocean
const BEACH_INNER_X = 0;            // Boardwalk inside edge
const BOARDWALK_CENTER_X = 3;       // Ocean Front Walk centerline
const BOARDWALK_HALFWIDTH = 3;      // 6 m wide promenade
const BIKE_PATH_CENTER_X = 10;      // Parallel bike path
const BIKE_PATH_HALFWIDTH = 1.7;    // 3.4 m wide
const STOREFRONT_CENTER_X = 19;     // East-side shops (building centers)
const STOREFRONT_WEST_FACE = 14;    // Building fronts

const BEACH_Y = 0;
const WATER_Y = -1.4;
const BOARDWALK_Y = 0.25;           // Slightly raised concrete
const BIKE_PATH_Y = 0.22;

// Santa Monica Pier: extends west into the Pacific from a shore-side base.
const PIER_BASE_Z = -315;           // Where pier meets shore
const PIER_HALFWIDTH = 9;           // 18 m wide pier deck
const PIER_LENGTH = 380;            // West-extending length
const PIER_WEST_X = WATER_EDGE_X - PIER_LENGTH;
const PIER_DECK_Y = 6;              // Deck height above sea level
const PIER_WIDE_X = WATER_EDGE_X - 150;  // Pacific Park starts here (pier widens)

export class VeniceBeach {
    constructor(locationGroup, terrainHeightFn = null) {
        this.group = locationGroup;
        this.worldSize = 1000;
        this.terrainResolution = 180;
        this.regionalTerrainFn = terrainHeightFn;
        // Animated bits
        this._ferrisWheel = null;
        this._ferrisSpeed = 0.12;
        this._waveTime = 0;
        this._waveMeshes = [];
        this._coasterCars = [];
        this._time = 0;
    }

    setTerrainFunction(fn) { this.regionalTerrainFn = fn; }

    async generate() {
        this.createTerrain();
        this.createOcean();
        this.createBoardwalk();
        this.createBikePath();
        this.createPalms();
        this.createStorefronts();
        this.createMuscleBeach();
        this.createSkatepark();
        this.createBasketballCourt();
        this.createGraffitiWalls();
        this.createBeachPeople();
        this.createStreetVendors();
        // Santa Monica Pier
        this.createPier();
        this.createCarousel();
        this.createArcade();
        this.createFerrisWheel();
        this.createRollerCoaster();
        this.createPierSignage();
        this.createSignage();
    }

    // ==========================================================
    //  Local terrain — flat beach and strip, dropping to water west
    // ==========================================================
    //
    //   west                                                east
    //   ocean ── sand beach ── boardwalk/bike-path ── storefronts/inland
    //   slope                 (flat at BEACH_Y)           gentle rise
    //
    // The boardwalk and bike path are visual overlays sitting just above
    // the flat beach surface, so the player walks smoothly across all of
    // them without step jitter.
    localHeight(x, z) {
        // Ocean: gently drops off
        if (x < WATER_EDGE_X) {
            return WATER_Y - Math.min(3, (WATER_EDGE_X - x) / 40);
        }
        // Sandy beach: slight slope toward water + subtle undulation
        if (x < BEACH_INNER_X) {
            const t = (x - WATER_EDGE_X) / (BEACH_INNER_X - WATER_EDGE_X);
            let h = BEACH_Y - (1 - t) * 0.9;
            h += Math.sin(x * 0.12 + z * 0.08) * 0.12;
            h += Math.sin(z * 0.04) * 0.15;
            return h;
        }
        // Inland beyond the storefronts: gentle rise
        if (x > STOREFRONT_WEST_FACE + 10) {
            return BEACH_Y + Math.min((x - STOREFRONT_WEST_FACE - 10) * 0.025, 2.0);
        }
        // Boardwalk + bike path + sidewalk zone: flat at BEACH_Y
        return BEACH_Y;
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

            // Vertex coloring
            let r, g, b;
            if (worldX < WATER_EDGE_X - 3) {
                // Offshore water: darker blue
                r = 0.12; g = 0.32; b = 0.48;
            } else if (worldX < WATER_EDGE_X + 3) {
                // Wet sand / waterline
                r = 0.75; g = 0.72; b = 0.60;
            } else if (worldX < BEACH_INNER_X - 1) {
                // Dry sand
                r = 0.93; g = 0.88; b = 0.72;
            } else if (worldX < STOREFRONT_WEST_FACE - 2) {
                // Boardwalk / bike path strip — paved
                r = 0.58; g = 0.56; b = 0.52;
            } else {
                // Inland: dry grass / sidewalk
                r = 0.66; g = 0.62; b = 0.50;
            }
            const n = (Math.random() - 0.5) * 0.05;
            colors[i * 3]     = Math.max(0, Math.min(1, r + n));
            colors[i * 3 + 1] = Math.max(0, Math.min(1, g + n));
            colors[i * 3 + 2] = Math.max(0, Math.min(1, b + n));
        }

        geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geo.computeVertexNormals();

        const terrain = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
            vertexColors: true, roughness: 0.94, metalness: 0
        }));
        terrain.rotation.x = -Math.PI / 2;
        terrain.receiveShadow = true;
        terrain.userData.noCollision = true; // player uses getTerrainHeight
        this.group.add(terrain);
    }

    // ==========================================================
    //  Pacific Ocean with subtle wave animation
    // ==========================================================
    createOcean() {
        const oceanGeo = new THREE.PlaneGeometry(900, 900, 60, 60);
        const pos = oceanGeo.attributes.position;
        for (let i = 0; i < pos.count; i++) {
            const x = pos.getX(i), y = pos.getY(i);
            const wave = Math.sin(x * 0.03) * Math.cos(y * 0.025) * 0.25;
            pos.setZ(i, wave);
        }
        oceanGeo.computeVertexNormals();
        const oceanMat = new THREE.MeshStandardMaterial({
            color: 0x1F6CA0, roughness: 0.18, metalness: 0.15,
            transparent: true, opacity: 0.9
        });
        const ocean = new THREE.Mesh(oceanGeo, oceanMat);
        ocean.rotation.x = -Math.PI / 2;
        ocean.position.set(-350, WATER_Y + 0.1, -50);
        ocean.userData.noCollision = true;
        this.group.add(ocean);

        // Foam line where waves break near the shore
        const foamMat = new THREE.MeshStandardMaterial({
            color: 0xFFFFFF, transparent: true, opacity: 0.55
        });
        for (let i = 0; i < 30; i++) {
            const z = -400 + Math.random() * 600;
            const foam = new THREE.Mesh(
                new THREE.PlaneGeometry(2 + Math.random() * 4, 8 + Math.random() * 6),
                foamMat
            );
            foam.rotation.x = -Math.PI / 2;
            foam.position.set(
                WATER_EDGE_X - 2 + Math.random() * 4,
                WATER_Y + 0.25,
                z
            );
            foam.userData.noCollision = true;
            foam.scale.z = 0.3;
            this.group.add(foam);
            this._waveMeshes.push(foam);
        }
    }

    // ==========================================================
    //  Ocean Front Walk — concrete promenade
    // ==========================================================
    createBoardwalk() {
        const concreteMat = new THREE.MeshStandardMaterial({
            color: 0xC7BFB2, roughness: 0.88, metalness: 0
        });
        // A long flat strip of concrete panels lying just above the sand,
        // segmented so colour/tone vary naturally along its length.
        const segCount = 34;
        const zMin = -330, zMax = 380;
        for (let i = 0; i < segCount; i++) {
            const t0 = i / segCount;
            const t1 = (i + 1) / segCount;
            const z0 = zMin + (zMax - zMin) * t0;
            const z1 = zMin + (zMax - zMin) * t1;
            const cz = (z0 + z1) / 2;
            const segLen = z1 - z0 + 0.1;
            const slab = new THREE.Mesh(
                new THREE.PlaneGeometry(BOARDWALK_HALFWIDTH * 2, segLen),
                concreteMat
            );
            slab.rotation.x = -Math.PI / 2;
            slab.position.set(BOARDWALK_CENTER_X, BEACH_Y + 0.06, cz);
            slab.userData.noCollision = true;
            slab.receiveShadow = true;
            this.group.add(slab);

            // Darker score line between slabs
            if (i < segCount - 1) {
                const seam = new THREE.Mesh(
                    new THREE.PlaneGeometry(BOARDWALK_HALFWIDTH * 2, 0.08),
                    new THREE.MeshBasicMaterial({ color: 0x6B6459 })
                );
                seam.rotation.x = -Math.PI / 2;
                seam.position.set(BOARDWALK_CENTER_X, BEACH_Y + 0.08, z1);
                seam.userData.noCollision = true;
                this.group.add(seam);
            }
        }
    }

    createBikePath() {
        const asphaltMat = new THREE.MeshStandardMaterial({
            color: 0x3A3A3E, roughness: 0.92
        });
        const stripeMat = new THREE.MeshBasicMaterial({ color: 0xE8C440 });

        const zMin = -330, zMax = 380;
        const segLen = zMax - zMin;
        const path = new THREE.Mesh(
            new THREE.PlaneGeometry(BIKE_PATH_HALFWIDTH * 2, segLen),
            asphaltMat
        );
        path.rotation.x = -Math.PI / 2;
        path.position.set(BIKE_PATH_CENTER_X, BEACH_Y + 0.05, (zMin + zMax) / 2);
        path.userData.noCollision = true;
        path.receiveShadow = true;
        this.group.add(path);

        // Dashed yellow centerline
        for (let z = zMin + 2; z < zMax - 2; z += 8) {
            const stripe = new THREE.Mesh(
                new THREE.PlaneGeometry(0.12, 2.5),
                stripeMat
            );
            stripe.rotation.x = -Math.PI / 2;
            stripe.position.set(BIKE_PATH_CENTER_X, BEACH_Y + 0.09, z);
            stripe.userData.noCollision = true;
            this.group.add(stripe);
        }

        // Bike-lane icons (small white rectangles) every so often
        for (let z = zMin + 30; z < zMax - 30; z += 50) {
            const icon = new THREE.Mesh(
                new THREE.PlaneGeometry(0.8, 1.2),
                new THREE.MeshBasicMaterial({ color: 0xEDECE4 })
            );
            icon.rotation.x = -Math.PI / 2;
            icon.position.set(
                BIKE_PATH_CENTER_X + 0.7, BEACH_Y + 0.10, z
            );
            icon.userData.noCollision = true;
            this.group.add(icon);
        }
    }

    // ==========================================================
    //  Palm trees — Canary Island palms line the boardwalk
    // ==========================================================
    createPalms() {
        const trunkMat = new THREE.MeshStandardMaterial({
            color: 0x665041, roughness: 0.85
        });
        const frondMat = new THREE.MeshStandardMaterial({
            color: 0x436A2A, roughness: 0.82, side: THREE.DoubleSide
        });

        // Palms between boardwalk and bike path, spaced every ~18 m
        for (let z = -320; z < 370; z += 18) {
            const xJitter = 6.8 + (Math.random() - 0.5) * 0.6;
            const h = 9 + Math.random() * 5;
            const palm = this._buildPalm(trunkMat, frondMat, h);
            palm.position.set(xJitter, this.localHeight(xJitter, z), z);
            palm.rotation.y = Math.random() * Math.PI * 2;
            this.group.add(palm);
        }

        // A few larger palms scattered on the beach
        for (let i = 0; i < 10; i++) {
            const x = WATER_EDGE_X + 10 + Math.random() * 50;
            const z = -300 + Math.random() * 600;
            if (this._onPier(x, z)) continue;
            const palm = this._buildPalm(trunkMat, frondMat,
                10 + Math.random() * 6);
            palm.position.set(x, this.localHeight(x, z), z);
            palm.rotation.y = Math.random() * Math.PI * 2;
            this.group.add(palm);
        }
    }

    _buildPalm(trunkMat, frondMat, h) {
        const palm = new THREE.Group();
        // Slightly curved trunk — use several tilted segments
        const segs = 6;
        const segH = h / segs;
        let px = 0, pz = 0;
        for (let s = 0; s < segs; s++) {
            const r0 = 0.45 - s * 0.04;
            const r1 = 0.42 - (s + 1) * 0.04;
            const seg = new THREE.Mesh(
                new THREE.CylinderGeometry(Math.max(0.15, r1),
                    Math.max(0.18, r0), segH, 7),
                trunkMat
            );
            const tilt = (s - segs / 2) * 0.02;
            seg.position.y = segH * (s + 0.5);
            seg.position.x = px + Math.sin(s * 0.7) * 0.04;
            seg.rotation.z = tilt;
            seg.castShadow = true;
            palm.add(seg);
        }
        // Crown of fronds — ~10 radiating long triangular shapes
        const frondCount = 12;
        for (let f = 0; f < frondCount; f++) {
            const angle = (f / frondCount) * Math.PI * 2;
            const droop = 0.35 + Math.random() * 0.2;
            const frondShape = new THREE.Shape();
            frondShape.moveTo(0, 0);
            frondShape.lineTo(0.2, 0.8);
            frondShape.lineTo(0, 4);
            frondShape.lineTo(-0.2, 0.8);
            frondShape.lineTo(0, 0);
            const frond = new THREE.Mesh(
                new THREE.ShapeGeometry(frondShape), frondMat
            );
            frond.position.y = h;
            frond.rotation.y = angle;
            frond.rotation.x = Math.PI / 2 - droop;
            frond.castShadow = true;
            palm.add(frond);
        }
        // Trunk cap (fruit cluster hint)
        const crown = new THREE.Mesh(
            new THREE.SphereGeometry(0.55, 8, 6), trunkMat
        );
        crown.position.y = h - 0.3;
        crown.scale.y = 0.7;
        palm.add(crown);
        return palm;
    }

    // ==========================================================
    //  Colourful boardwalk storefronts
    // ==========================================================
    createStorefronts() {
        const shops = [
            { name: 'Henna Tattoo',        facade: 0xE08D36, z: -280 },
            { name: 'Surf Shack',          facade: 0x36B7CA, z: -240 },
            { name: 'Fortune Teller',      facade: 0x8A2F68, z: -200 },
            { name: 'Pizza Slice',         facade: 0xD53B3B, z: -160 },
            { name: 'Vinyl Records',       facade: 0x3A4D8A, z: -120 },
            { name: 'Venice Juice Bar',    facade: 0x6AA243, z: -80  },
            { name: 'Boho Threads',        facade: 0xB26AB0, z: -40  },
            { name: 'Dogtown Skate Co.',   facade: 0x2B2B2B, z:   0  },
            { name: 'Taco Stand',          facade: 0xF1A830, z:  40  },
            { name: 'Venice Ink',          facade: 0x4B3A2A, z:  80  },
            { name: 'Sunglass Hut',        facade: 0xE8C034, z: 120  },
            { name: 'Souvenirs',           facade: 0xDD5E3E, z: 160  },
            { name: 'Coffee & Board',      facade: 0x7A5A3A, z: 200  },
            { name: 'Art Gallery',         facade: 0xC4B078, z: 240  }
        ];

        for (const shop of shops) {
            const bldg = this._buildShopfront(shop);
            bldg.position.set(
                STOREFRONT_CENTER_X, this.localHeight(STOREFRONT_CENTER_X, shop.z), shop.z
            );
            bldg.rotation.y = -Math.PI / 2; // Face west, toward boardwalk
            this.group.add(bldg);
        }
    }

    _buildShopfront(shop) {
        const g = new THREE.Group();
        g.userData = {
            name: `Venice · ${shop.name}`,
            isInteractable: true,
            type: 'storefront',
            interactionType: 'Browse'
        };

        const facadeMat = new THREE.MeshStandardMaterial({
            color: shop.facade, roughness: 0.85
        });
        const roofMat = new THREE.MeshStandardMaterial({
            color: 0x2D2B28, roughness: 0.9
        });
        const windowMat = new THREE.MeshStandardMaterial({
            color: 0x5B7488, roughness: 0.22, metalness: 0.35,
            transparent: true, opacity: 0.7
        });

        const W = 12, D = 10, H = 5;
        // Body
        const body = new THREE.Mesh(
            new THREE.BoxGeometry(W, H, D), facadeMat
        );
        body.position.y = H / 2;
        body.castShadow = true;
        body.receiveShadow = true;
        g.add(body);
        // Roof
        const roof = new THREE.Mesh(
            new THREE.BoxGeometry(W + 0.3, 0.3, D + 0.3), roofMat
        );
        roof.position.y = H + 0.15;
        g.add(roof);

        // Large shopfront window + door on the WEST face (boardwalk side).
        // In the shop's local coords the west face is at z = -D/2 (because
        // after rotation.y = -π/2 that becomes world -X).
        const storefrontWin = new THREE.Mesh(
            new THREE.BoxGeometry(W - 2.4, 2.6, 0.1), windowMat
        );
        storefrontWin.position.set(0, 1.7, -D / 2 - 0.03);
        g.add(storefrontWin);

        const doorMat = new THREE.MeshStandardMaterial({
            color: 0x1A1A1A, roughness: 0.7
        });
        const door = new THREE.Mesh(
            new THREE.BoxGeometry(1.1, 2.2, 0.1), doorMat
        );
        door.position.set(W / 2 - 1.2, 1.1, -D / 2 - 0.03);
        g.add(door);

        // Sign
        const signTex = this._makeSignTexture(shop.name, shop.facade);
        const sign = new THREE.Mesh(
            new THREE.PlaneGeometry(W - 0.8, 1.0),
            new THREE.MeshBasicMaterial({
                map: signTex, side: THREE.DoubleSide, transparent: true
            })
        );
        sign.position.set(0, H - 0.6, -D / 2 - 0.08);
        g.add(sign);

        // Awning (striped or solid)
        const awnColors = [0xEFE0C0, 0xC2D1E0, 0xF2C7C7];
        const awnMat = new THREE.MeshStandardMaterial({
            color: awnColors[Math.floor(Math.random() * 3)],
            roughness: 0.82, side: THREE.DoubleSide
        });
        const awning = new THREE.Mesh(
            new THREE.BoxGeometry(W - 0.6, 0.1, 1.6), awnMat
        );
        awning.position.set(0, H - 1.5, -D / 2 - 0.9);
        awning.rotation.x = 0.2;
        g.add(awning);

        // Awning brackets
        for (const bx of [-W / 2 + 0.8, W / 2 - 0.8]) {
            const bracket = new THREE.Mesh(
                new THREE.BoxGeometry(1.6, 0.05, 0.05),
                new THREE.MeshStandardMaterial({ color: 0x1A1A1A })
            );
            bracket.position.set(bx, H - 1.7, -D / 2 - 0.55);
            bracket.rotation.y = -Math.PI / 2;
            g.add(bracket);
        }

        return g;
    }

    _makeSignTexture(text, accentColor) {
        const canvas = document.createElement('canvas');
        canvas.width = 512; canvas.height = 128;
        const ctx = canvas.getContext('2d');
        const bg = new THREE.Color(accentColor);
        bg.multiplyScalar(0.32);
        ctx.fillStyle = `rgb(${Math.round(bg.r * 255)}, ${Math.round(bg.g * 255)}, ${Math.round(bg.b * 255)})`;
        ctx.fillRect(0, 0, 512, 128);
        ctx.strokeStyle = 'rgba(255, 235, 190, 0.4)';
        ctx.lineWidth = 3;
        ctx.strokeRect(6, 6, 500, 116);
        ctx.fillStyle = '#F7ECCC';
        let fontSize = 60;
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
        tex.needsUpdate = true;
        return tex;
    }

    // ==========================================================
    //  Muscle Beach — outdoor gym on the sand
    // ==========================================================
    createMuscleBeach() {
        const g = new THREE.Group();
        g.userData = {
            name: 'Muscle Beach Venice',
            description: 'Outdoor gym where Arnold trained. Open since 1951.',
            isInteractable: true,
            type: 'landmark',
            interactionType: 'Workout'
        };

        const sandPadMat = new THREE.MeshStandardMaterial({
            color: 0x8A7452, roughness: 0.94
        });
        const steelMat = new THREE.MeshStandardMaterial({
            color: 0x2A2A2A, roughness: 0.55, metalness: 0.6
        });
        const yellowMat = new THREE.MeshStandardMaterial({
            color: 0xE8C040, roughness: 0.7, metalness: 0.2
        });
        const blueMat = new THREE.MeshStandardMaterial({
            color: 0x2A5DB0, roughness: 0.7
        });

        // Raised rubberized sand pad (a little darker than the beach)
        const pad = new THREE.Mesh(
            new THREE.BoxGeometry(28, 0.15, 18), sandPadMat
        );
        pad.position.y = 0.08;
        pad.receiveShadow = true;
        pad.userData.noCollision = true;
        g.add(pad);

        // Perimeter fence — chain-link posts around the gym pen
        for (let i = 0; i < 14; i++) {
            const a = (i / 14) * Math.PI * 2;
            const fx = Math.cos(a) * 14, fz = Math.sin(a) * 9;
            const post = new THREE.Mesh(
                new THREE.CylinderGeometry(0.06, 0.06, 2, 6), steelMat
            );
            post.position.set(fx, 1, fz);
            g.add(post);
        }

        // Pull-up bar rig
        const pullupRig = new THREE.Group();
        for (const sx of [-3, 0, 3]) {
            const post = new THREE.Mesh(
                new THREE.CylinderGeometry(0.08, 0.08, 2.6, 8), steelMat
            );
            post.position.set(sx, 1.3, 0);
            pullupRig.add(post);
        }
        const topBar = new THREE.Mesh(
            new THREE.CylinderGeometry(0.07, 0.07, 7, 8), steelMat
        );
        topBar.rotation.z = Math.PI / 2;
        topBar.position.set(0, 2.6, 0);
        pullupRig.add(topBar);
        pullupRig.position.set(-7, 0, -4);
        g.add(pullupRig);

        // Parallel bars
        const pbRig = new THREE.Group();
        for (const sx of [-0.5, 0.5]) {
            const pbPost = new THREE.Mesh(
                new THREE.CylinderGeometry(0.06, 0.06, 1.3, 6), steelMat
            );
            pbPost.position.set(sx, 0.65, -1);
            pbRig.add(pbPost);
            const pbPost2 = pbPost.clone();
            pbPost2.position.z = 1;
            pbRig.add(pbPost2);
            const bar = new THREE.Mesh(
                new THREE.CylinderGeometry(0.05, 0.05, 2.4, 6), steelMat
            );
            bar.position.set(sx, 1.3, 0);
            pbRig.add(bar);
        }
        pbRig.position.set(4, 0, -4);
        g.add(pbRig);

        // Flat bench press rig with yellow frame
        const bench = new THREE.Mesh(
            new THREE.BoxGeometry(1.8, 0.15, 0.45),
            new THREE.MeshStandardMaterial({ color: 0x4A1818, roughness: 0.8 })
        );
        bench.position.set(-4, 0.45, 4);
        g.add(bench);
        // Uprights
        for (const sx of [-5.0, -3.0]) {
            const up = new THREE.Mesh(
                new THREE.CylinderGeometry(0.08, 0.08, 1.2, 6), yellowMat
            );
            up.position.set(sx, 0.7, 4);
            g.add(up);
        }
        const barbell = new THREE.Mesh(
            new THREE.CylinderGeometry(0.05, 0.05, 2.5, 6), steelMat
        );
        barbell.rotation.z = Math.PI / 2;
        barbell.position.set(-4, 1.3, 4);
        g.add(barbell);
        // Plates on the barbell
        for (const sx of [-5.3, -2.7]) {
            const plate = new THREE.Mesh(
                new THREE.CylinderGeometry(0.32, 0.32, 0.08, 14),
                new THREE.MeshStandardMaterial({ color: 0x1A1A1A, roughness: 0.7 })
            );
            plate.rotation.z = Math.PI / 2;
            plate.position.set(sx, 1.3, 4);
            g.add(plate);
        }

        // Dumbbell rack
        const rack = new THREE.Mesh(
            new THREE.BoxGeometry(4, 0.6, 0.6), steelMat
        );
        rack.position.set(6, 0.4, 3);
        g.add(rack);
        for (let d = 0; d < 5; d++) {
            const db = new THREE.Mesh(
                new THREE.BoxGeometry(0.5, 0.12, 0.12), yellowMat
            );
            db.position.set(4.3 + d * 0.7, 0.75, 3);
            g.add(db);
        }

        // Iconic blue & yellow Muscle Beach Venice sign
        const signBack = new THREE.Mesh(
            new THREE.BoxGeometry(4, 1.2, 0.15), blueMat
        );
        signBack.position.set(0, 3.1, -9);
        g.add(signBack);
        const signText = new THREE.Mesh(
            new THREE.PlaneGeometry(3.9, 1.1),
            new THREE.MeshBasicMaterial({
                map: this._makeSignTexture('Muscle Beach', 0x2A5DB0),
                transparent: true, side: THREE.DoubleSide
            })
        );
        signText.position.set(0, 3.1, -8.91);
        g.add(signText);
        // Yellow trim on sign
        const trim = new THREE.Mesh(
            new THREE.BoxGeometry(4.2, 0.12, 0.17), yellowMat
        );
        trim.position.set(0, 3.77, -9);
        g.add(trim);
        const trimB = trim.clone();
        trimB.position.y = 2.47;
        g.add(trimB);

        // Place on the sand, north of spawn
        g.position.set(-30, this.localHeight(-30, -70), -70);
        this.group.add(g);
    }

    // ==========================================================
    //  Venice Skatepark — concrete bowls
    // ==========================================================
    createSkatepark() {
        const g = new THREE.Group();
        g.userData = {
            name: 'Venice Skatepark',
            description: '16,000 sq ft of concrete bowls — former "Dogtown" spot.',
            isInteractable: true,
            type: 'landmark',
            interactionType: 'Skate'
        };

        const concreteMat = new THREE.MeshStandardMaterial({
            color: 0xC6C1B4, roughness: 0.82
        });
        const concreteDarkMat = new THREE.MeshStandardMaterial({
            color: 0x999482, roughness: 0.85
        });
        const chainMat = new THREE.MeshStandardMaterial({
            color: 0x807B72, roughness: 0.5, metalness: 0.6
        });

        // Base pad
        const pad = new THREE.Mesh(
            new THREE.BoxGeometry(30, 0.35, 20), concreteMat
        );
        pad.position.y = 0.17;
        pad.receiveShadow = true;
        pad.userData.noCollision = true;
        g.add(pad);

        // Two bowls (shallow tori for the lip)
        const bowlSpots = [
            { x: -7, z: 2, r: 4.5 },
            { x: 7, z: -3, r: 3.8 }
        ];
        for (const b of bowlSpots) {
            // Bowl floor (darker)
            const floor = new THREE.Mesh(
                new THREE.CylinderGeometry(b.r - 0.3, b.r - 0.3, 0.05, 24),
                concreteDarkMat
            );
            floor.position.set(b.x, 0.05, b.z);
            floor.userData.noCollision = true;
            g.add(floor);
            // Lip — torus half-ring to suggest the curved bowl edge
            const lip = new THREE.Mesh(
                new THREE.TorusGeometry(b.r, 0.3, 8, 20),
                concreteMat
            );
            lip.rotation.x = Math.PI / 2;
            lip.position.set(b.x, 0.3, b.z);
            g.add(lip);
        }

        // A quarter-pipe ramp along one side
        const rampShape = new THREE.Shape();
        rampShape.moveTo(0, 0);
        rampShape.quadraticCurveTo(0, 1.8, 2, 1.8);
        rampShape.lineTo(2, 0);
        rampShape.lineTo(0, 0);
        const rampGeo = new THREE.ExtrudeGeometry(rampShape, {
            depth: 6, bevelEnabled: false
        });
        const ramp = new THREE.Mesh(rampGeo, concreteMat);
        ramp.rotation.y = -Math.PI / 2;
        ramp.position.set(-13.5, 0.2, 3);
        ramp.castShadow = true;
        g.add(ramp);

        // Rails (grind rails)
        const railMat = new THREE.MeshStandardMaterial({
            color: 0x4A4A4A, roughness: 0.4, metalness: 0.7
        });
        const rail = new THREE.Mesh(
            new THREE.CylinderGeometry(0.05, 0.05, 5, 8), railMat
        );
        rail.rotation.z = Math.PI / 2;
        rail.position.set(4, 0.6, 7);
        g.add(rail);

        // Perimeter fence (simplified)
        for (let i = 0; i < 20; i++) {
            const a = (i / 20) * Math.PI * 2;
            const fx = Math.cos(a) * 16, fz = Math.sin(a) * 11;
            const post = new THREE.Mesh(
                new THREE.CylinderGeometry(0.05, 0.05, 2, 6), chainMat
            );
            post.position.set(fx, 1, fz);
            g.add(post);
        }

        // A couple of static skateboards lying around
        const boardMat = new THREE.MeshStandardMaterial({
            color: 0xD84030, roughness: 0.6
        });
        for (const spot of [{ x: 2, z: 6 }, { x: -10, z: -5 }]) {
            const deck = new THREE.Mesh(
                new THREE.BoxGeometry(0.85, 0.06, 0.2), boardMat
            );
            deck.position.set(spot.x, 0.3, spot.z);
            deck.rotation.y = Math.random() * Math.PI;
            g.add(deck);
        }

        g.position.set(-40, this.localHeight(-40, -135), -135);
        this.group.add(g);
    }

    // ==========================================================
    //  Basketball courts
    // ==========================================================
    createBasketballCourt() {
        const g = new THREE.Group();
        const courtMat = new THREE.MeshStandardMaterial({
            color: 0x7A5A3A, roughness: 0.85
        });
        const lineMat = new THREE.MeshBasicMaterial({ color: 0xE8E5D8 });
        const poleMat = new THREE.MeshStandardMaterial({
            color: 0x2A2A2A, roughness: 0.5, metalness: 0.6
        });

        // Court surface
        const court = new THREE.Mesh(
            new THREE.BoxGeometry(28, 0.12, 15), courtMat
        );
        court.position.y = 0.06;
        court.receiveShadow = true;
        court.userData.noCollision = true;
        g.add(court);

        // Perimeter line
        for (const side of [-1, 1]) {
            const line = new THREE.Mesh(
                new THREE.PlaneGeometry(28, 0.12), lineMat
            );
            line.rotation.x = -Math.PI / 2;
            line.position.set(0, 0.14, side * 7.4);
            line.userData.noCollision = true;
            g.add(line);
            const sideLine = new THREE.Mesh(
                new THREE.PlaneGeometry(0.12, 15), lineMat
            );
            sideLine.rotation.x = -Math.PI / 2;
            sideLine.position.set(side * 13.9, 0.14, 0);
            sideLine.userData.noCollision = true;
            g.add(sideLine);
        }
        // Center line
        const mid = new THREE.Mesh(
            new THREE.PlaneGeometry(0.12, 15), lineMat
        );
        mid.rotation.x = -Math.PI / 2;
        mid.position.set(0, 0.14, 0);
        mid.userData.noCollision = true;
        g.add(mid);
        // Center circle
        const circle = new THREE.Mesh(
            new THREE.RingGeometry(1.7, 1.85, 24), lineMat
        );
        circle.rotation.x = -Math.PI / 2;
        circle.position.y = 0.15;
        circle.userData.noCollision = true;
        g.add(circle);

        // Hoops on both ends
        for (const side of [-1, 1]) {
            const hoop = new THREE.Group();
            const pole = new THREE.Mesh(
                new THREE.CylinderGeometry(0.12, 0.12, 3.2, 8), poleMat
            );
            pole.position.y = 1.6;
            hoop.add(pole);
            const board = new THREE.Mesh(
                new THREE.BoxGeometry(1.5, 1.0, 0.08),
                new THREE.MeshStandardMaterial({
                    color: 0xF0EADF, roughness: 0.65
                })
            );
            board.position.set(0, 2.9, side * 0.35);
            hoop.add(board);
            const rim = new THREE.Mesh(
                new THREE.TorusGeometry(0.45, 0.05, 6, 16),
                new THREE.MeshStandardMaterial({
                    color: 0xD85A30, roughness: 0.4, metalness: 0.4
                })
            );
            rim.rotation.x = Math.PI / 2;
            rim.position.set(0, 2.5, side * 0.75);
            hoop.add(rim);

            hoop.position.set(0, 0.12, side * 6.5);
            g.add(hoop);
        }

        g.position.set(-35, this.localHeight(-35, -100), -100);
        g.rotation.y = Math.PI / 2;
        this.group.add(g);
    }

    // ==========================================================
    //  Public Art Walls — colourful painted concrete walls
    // ==========================================================
    createGraffitiWalls() {
        const g = new THREE.Group();
        g.userData = {
            name: 'Venice Public Art Walls',
            description: 'Sanctioned legal graffiti. Murals change constantly.',
            isInteractable: true,
            type: 'landmark',
            interactionType: 'Look'
        };

        // Palette of bright colours
        const palette = [
            0xE74C3C, 0xF39C12, 0xF1C40F, 0x2ECC71, 0x1ABC9C,
            0x3498DB, 0x9B59B6, 0xE67E22, 0xD35400, 0x16A085,
            0xE84393, 0x00CEC9, 0xFFEAA7
        ];

        // Three walls with painted "panels" each
        const wallSpecs = [
            { len: 16, z: 0 },
            { len: 14, z: 10 },
            { len: 12, z: -8 }
        ];
        for (const w of wallSpecs) {
            const wall = new THREE.Group();
            // Base wall (dark concrete)
            const base = new THREE.Mesh(
                new THREE.BoxGeometry(w.len, 3.2, 0.4),
                new THREE.MeshStandardMaterial({
                    color: 0x3A3A3A, roughness: 0.95
                })
            );
            base.position.y = 1.6;
            base.castShadow = true;
            wall.add(base);
            // Randomly painted "panels"
            const panels = 6;
            for (let i = 0; i < panels; i++) {
                const panelW = w.len / panels - 0.1;
                const panelX = -w.len / 2 + panelW / 2 + i * (panelW + 0.1);
                const panel = new THREE.Mesh(
                    new THREE.PlaneGeometry(panelW, 2.6),
                    new THREE.MeshBasicMaterial({
                        color: palette[(i * 3 + w.z * 7) % palette.length]
                    })
                );
                panel.position.set(panelX, 1.6, 0.21);
                wall.add(panel);
                // Bold overlay "tag" — a smaller contrasting rectangle
                const tag = new THREE.Mesh(
                    new THREE.PlaneGeometry(panelW * 0.6, 0.8),
                    new THREE.MeshBasicMaterial({
                        color: palette[(i * 5 + 3) % palette.length]
                    })
                );
                tag.position.set(panelX, 1.2 + (i % 2) * 0.8, 0.22);
                wall.add(tag);
                // Back side — simple gray
                const back = new THREE.Mesh(
                    new THREE.PlaneGeometry(panelW, 2.6),
                    new THREE.MeshBasicMaterial({ color: 0x4A4A4A })
                );
                back.position.set(panelX, 1.6, -0.21);
                back.rotation.y = Math.PI;
                wall.add(back);
            }
            wall.position.set(0, 0, w.z);
            g.add(wall);
        }

        g.position.set(-30, this.localHeight(-30, -175), -175);
        g.rotation.y = Math.PI / 2;
        this.group.add(g);
    }

    // ==========================================================
    //  Simple beach-goer figures (decorative)
    // ==========================================================
    createBeachPeople() {
        const colors = [0xE74C3C, 0x3498DB, 0xE8C040, 0x2ECC71,
            0x8E44AD, 0xF39C12, 0xFFFFFF, 0x2C3E50];
        // A few figures scattered on the sand
        for (let i = 0; i < 14; i++) {
            const fig = this._buildFigure(colors[i % colors.length]);
            const x = WATER_EDGE_X + 6 + Math.random() * 50;
            const z = -300 + Math.random() * 600;
            if (this._onPier(x, z)) continue;
            fig.position.set(x, this.localHeight(x, z), z);
            fig.rotation.y = Math.random() * Math.PI * 2;
            this.group.add(fig);
        }
        // Some towels on the sand
        const towelColors = [0xE74C3C, 0x1ABC9C, 0xFFFFFF, 0xF39C12];
        for (let i = 0; i < 10; i++) {
            const towel = new THREE.Mesh(
                new THREE.PlaneGeometry(1.8, 0.9),
                new THREE.MeshStandardMaterial({
                    color: towelColors[i % 4], roughness: 0.9
                })
            );
            towel.rotation.x = -Math.PI / 2;
            const x = WATER_EDGE_X + 10 + Math.random() * 40;
            const z = -300 + Math.random() * 600;
            if (this._onPier(x, z)) continue;
            towel.position.set(x, this.localHeight(x, z) + 0.04, z);
            towel.rotation.z = Math.random() * Math.PI;
            towel.userData.noCollision = true;
            this.group.add(towel);
        }
    }

    _buildFigure(shirtColor) {
        const g = new THREE.Group();
        const skinMat = new THREE.MeshStandardMaterial({
            color: 0xD7A77C, roughness: 0.85
        });
        const shirtMat = new THREE.MeshStandardMaterial({
            color: shirtColor, roughness: 0.85
        });
        const shortsMat = new THREE.MeshStandardMaterial({
            color: 0x2A2A2A, roughness: 0.8
        });

        const head = new THREE.Mesh(
            new THREE.SphereGeometry(0.15, 8, 6), skinMat
        );
        head.position.y = 1.6;
        g.add(head);
        const torso = new THREE.Mesh(
            new THREE.BoxGeometry(0.4, 0.6, 0.22), shirtMat
        );
        torso.position.y = 1.2;
        g.add(torso);
        const legs = new THREE.Mesh(
            new THREE.BoxGeometry(0.36, 0.7, 0.2), shortsMat
        );
        legs.position.y = 0.55;
        g.add(legs);
        return g;
    }

    // ==========================================================
    //  Street vendors — small tents along the boardwalk
    // ==========================================================
    createStreetVendors() {
        const tentColors = [0xE8C040, 0xE74C3C, 0x3498DB,
            0x2ECC71, 0xE67E22];
        const tentSpots = [
            { z: -260 }, { z: -180 }, { z: -60 }, { z: 60 }, { z: 140 }
        ];
        for (let i = 0; i < tentSpots.length; i++) {
            const t = this._buildTent(tentColors[i % tentColors.length]);
            t.position.set(0, this.localHeight(0, tentSpots[i].z), tentSpots[i].z);
            this.group.add(t);
        }
    }

    _buildTent(color) {
        const g = new THREE.Group();
        const canopyMat = new THREE.MeshStandardMaterial({
            color, roughness: 0.85, side: THREE.DoubleSide
        });
        const poleMat = new THREE.MeshStandardMaterial({
            color: 0x1A1A1A, roughness: 0.6, metalness: 0.5
        });
        const tableMat = new THREE.MeshStandardMaterial({
            color: 0x6E553A, roughness: 0.88
        });
        // Four poles
        for (const dx of [-1.2, 1.2]) {
            for (const dz of [-1.2, 1.2]) {
                const p = new THREE.Mesh(
                    new THREE.CylinderGeometry(0.04, 0.04, 2.4, 6), poleMat
                );
                p.position.set(dx, 1.2, dz);
                g.add(p);
            }
        }
        // Canopy
        const canopy = new THREE.Mesh(
            new THREE.BoxGeometry(2.6, 0.08, 2.6), canopyMat
        );
        canopy.position.y = 2.4;
        g.add(canopy);
        // Slight peaked top — a smaller rotated square on top
        const peak = new THREE.Mesh(
            new THREE.ConeGeometry(1.9, 0.4, 4), canopyMat
        );
        peak.rotation.y = Math.PI / 4;
        peak.position.y = 2.6;
        g.add(peak);
        // Display table
        const table = new THREE.Mesh(
            new THREE.BoxGeometry(2.2, 0.1, 0.9), tableMat
        );
        table.position.set(0, 0.9, 0.7);
        g.add(table);
        return g;
    }

    // ==========================================================
    //  SANTA MONICA PIER
    // ==========================================================
    createPier() {
        const pier = new THREE.Group();
        pier.userData = { name: 'Santa Monica Pier', type: 'landmark' };

        const plankMat = new THREE.MeshStandardMaterial({
            color: 0x8B6A42, roughness: 0.88
        });
        const plankDarkMat = new THREE.MeshStandardMaterial({
            color: 0x6A4C2E, roughness: 0.9
        });
        const pileMat = new THREE.MeshStandardMaterial({
            color: 0x3E2E1E, roughness: 0.9
        });
        const railMat = new THREE.MeshStandardMaterial({
            color: 0xC0B59A, roughness: 0.8
        });

        // Main deck — a long rectangle from shore westward.
        // Split into segments so plank pattern reads.
        const deckSegments = 20;
        const deckStartX = WATER_EDGE_X + 5;      // Overlaps shoreline a bit
        const deckEndX = PIER_WEST_X;
        for (let i = 0; i < deckSegments; i++) {
            const t = i / deckSegments;
            const nextT = (i + 1) / deckSegments;
            const x0 = deckStartX + (deckEndX - deckStartX) * t;
            const x1 = deckStartX + (deckEndX - deckStartX) * nextT;
            const cx = (x0 + x1) / 2;
            const segLen = Math.abs(x1 - x0);

            // Widened "Pacific Park" section — pier bulges out for rides
            let localHalfWidth = PIER_HALFWIDTH;
            if (cx < PIER_WIDE_X && cx > PIER_WIDE_X - 90) {
                localHalfWidth = PIER_HALFWIDTH + 10;
            }

            const plank = new THREE.Mesh(
                new THREE.BoxGeometry(segLen + 0.1, 0.4, localHalfWidth * 2),
                (i % 2 === 0) ? plankMat : plankDarkMat
            );
            plank.position.set(cx, PIER_DECK_Y, PIER_BASE_Z);
            plank.receiveShadow = true;
            pier.add(plank);
        }

        // Wooden piles under the pier (dip into water)
        const pileSpacing = 14;
        for (let x = deckStartX - 6; x >= deckEndX; x -= pileSpacing) {
            for (const zOff of [-PIER_HALFWIDTH + 1, 0, PIER_HALFWIDTH - 1]) {
                // For wider Pacific Park section, add extra side piles
                const isWide = x < PIER_WIDE_X && x > PIER_WIDE_X - 90;
                const zOffsets = isWide
                    ? [-PIER_HALFWIDTH - 9, -PIER_HALFWIDTH + 1, 0,
                       PIER_HALFWIDTH - 1, PIER_HALFWIDTH + 9]
                    : [-PIER_HALFWIDTH + 1, 0, PIER_HALFWIDTH - 1];
                for (const zo of zOffsets) {
                    const pile = new THREE.Mesh(
                        new THREE.CylinderGeometry(0.35, 0.35,
                            PIER_DECK_Y + 4, 7),
                        pileMat
                    );
                    pile.position.set(
                        x, PIER_DECK_Y / 2 - 2.5, PIER_BASE_Z + zo
                    );
                    pile.castShadow = true;
                    pier.add(pile);
                }
                // Only once per pile spacing (break out of inner loop)
                break;
            }
        }

        // Railings on both sides of the pier
        // (skip the wide Pacific Park section where the rides sit)
        const railingCount = 45;
        for (let i = 0; i < railingCount; i++) {
            const x = deckStartX - i * (Math.abs(deckStartX - deckEndX) / railingCount);
            // Skip where the pier is wide
            if (x < PIER_WIDE_X && x > PIER_WIDE_X - 90) continue;
            for (const side of [-1, 1]) {
                const post = new THREE.Mesh(
                    new THREE.BoxGeometry(0.15, 1.1, 0.15),
                    railMat
                );
                post.position.set(
                    x, PIER_DECK_Y + 0.75,
                    PIER_BASE_Z + side * PIER_HALFWIDTH
                );
                pier.add(post);
            }
        }
        // Continuous top rail
        for (const side of [-1, 1]) {
            const rail = new THREE.Mesh(
                new THREE.BoxGeometry(PIER_LENGTH, 0.08, 0.08), railMat
            );
            rail.position.set(
                (deckStartX + deckEndX) / 2, PIER_DECK_Y + 1.3,
                PIER_BASE_Z + side * PIER_HALFWIDTH
            );
            pier.add(rail);
        }

        // Shore-side ramp from the beach up onto the pier deck
        const ramp = new THREE.Mesh(
            new THREE.BoxGeometry(10, 0.4, PIER_HALFWIDTH * 2),
            plankMat
        );
        ramp.position.set(
            deckStartX + 5, PIER_DECK_Y / 2, PIER_BASE_Z
        );
        ramp.rotation.z = Math.atan2(PIER_DECK_Y, 10);
        ramp.castShadow = true;
        pier.add(ramp);

        // Fishing railing at the far west end (extra low rail)
        for (const side of [-1, 1]) {
            const endRail = new THREE.Mesh(
                new THREE.BoxGeometry(0.08, 0.08, PIER_HALFWIDTH * 2),
                railMat
            );
            endRail.position.set(
                deckEndX + 0.1, PIER_DECK_Y + 1.3,
                PIER_BASE_Z + side * 0
            );
            if (side === -1) {
                endRail.position.z = PIER_BASE_Z;
                pier.add(endRail);
                break;
            }
        }
        // End-of-pier rail (crossing the pier at the end)
        const endRail = new THREE.Mesh(
            new THREE.BoxGeometry(0.15, 1.1, PIER_HALFWIDTH * 2),
            railMat
        );
        endRail.position.set(deckEndX, PIER_DECK_Y + 0.55, PIER_BASE_Z);
        pier.add(endRail);

        this.group.add(pier);
    }

    // ==========================================================
    //  Looff Hippodrome Carousel building — red octagonal landmark
    // ==========================================================
    createCarousel() {
        const g = new THREE.Group();
        g.userData = {
            name: 'Looff Hippodrome Carousel',
            description: '1916 carousel building — National Historic Landmark.',
            isInteractable: true,
            type: 'landmark',
            interactionType: 'Enter'
        };

        const redMat = new THREE.MeshStandardMaterial({
            color: 0xB8322A, roughness: 0.82
        });
        const creamMat = new THREE.MeshStandardMaterial({
            color: 0xEBDEB3, roughness: 0.85
        });
        const roofMat = new THREE.MeshStandardMaterial({
            color: 0x6E2A24, roughness: 0.88
        });
        const windowMat = new THREE.MeshStandardMaterial({
            color: 0x4A6A78, roughness: 0.2, metalness: 0.3,
            transparent: true, opacity: 0.7
        });

        // Octagonal body
        const r = 7;
        const bodyH = 6;
        const body = new THREE.Mesh(
            new THREE.CylinderGeometry(r, r, bodyH, 8), redMat
        );
        body.position.y = bodyH / 2;
        body.castShadow = true;
        g.add(body);

        // Cream-colored trim band near the top
        const trim = new THREE.Mesh(
            new THREE.CylinderGeometry(r + 0.1, r + 0.1, 0.6, 8), creamMat
        );
        trim.position.y = bodyH - 0.8;
        g.add(trim);

        // Arched windows on each face
        for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2;
            const win = new THREE.Mesh(
                new THREE.BoxGeometry(2.5, 2.8, 0.1), windowMat
            );
            win.position.set(
                Math.cos(a) * (r + 0.05), 3,
                Math.sin(a) * (r + 0.05)
            );
            win.rotation.y = -a;
            g.add(win);
        }

        // Pyramidal roof
        const roof = new THREE.Mesh(
            new THREE.ConeGeometry(r + 0.5, 4, 8), roofMat
        );
        roof.position.y = bodyH + 2;
        roof.castShadow = true;
        g.add(roof);

        // Spire on top
        const spire = new THREE.Mesh(
            new THREE.CylinderGeometry(0.15, 0.15, 2, 6),
            new THREE.MeshStandardMaterial({ color: 0xE8B830, roughness: 0.5 })
        );
        spire.position.y = bodyH + 5.2;
        g.add(spire);
        const finial = new THREE.Mesh(
            new THREE.SphereGeometry(0.4, 12, 8),
            new THREE.MeshStandardMaterial({
                color: 0xE8B830, roughness: 0.3, metalness: 0.7
            })
        );
        finial.position.y = bodyH + 6.3;
        g.add(finial);

        // "CAROUSEL" sign on front
        const signBoard = new THREE.Mesh(
            new THREE.BoxGeometry(4, 0.8, 0.15), creamMat
        );
        signBoard.position.set(0, bodyH + 0.4, r + 0.1);
        g.add(signBoard);
        const signText = new THREE.Mesh(
            new THREE.PlaneGeometry(3.9, 0.7),
            new THREE.MeshBasicMaterial({
                map: this._makeSignTexture('Carousel', 0xB8322A),
                transparent: true, side: THREE.DoubleSide
            })
        );
        signText.position.set(0, bodyH + 0.4, r + 0.2);
        g.add(signText);

        // Position at the shore-end of the pier, on the deck
        g.position.set(
            WATER_EDGE_X - 15, PIER_DECK_Y + 0.2, PIER_BASE_Z + 14
        );
        this.group.add(g);
    }

    // ==========================================================
    //  Pacific Park arcade — simple open pavilion
    // ==========================================================
    createArcade() {
        const g = new THREE.Group();
        g.userData = {
            name: 'Pacific Park Arcade',
            description: 'Pier amusement arcade — games and rides.',
            isInteractable: true,
            type: 'building',
            interactionType: 'Play'
        };

        const colorMats = [
            new THREE.MeshStandardMaterial({ color: 0xE74C3C, roughness: 0.85 }),
            new THREE.MeshStandardMaterial({ color: 0xF39C12, roughness: 0.85 }),
            new THREE.MeshStandardMaterial({ color: 0x3498DB, roughness: 0.85 })
        ];
        const roofMat = new THREE.MeshStandardMaterial({
            color: 0x3A3A3A, roughness: 0.88
        });

        const W = 18, D = 14, H = 5;
        const body = new THREE.Mesh(
            new THREE.BoxGeometry(W, H, D), colorMats[0]
        );
        body.position.y = H / 2;
        body.castShadow = true;
        g.add(body);
        // Decorative stripes
        for (let i = 0; i < 3; i++) {
            const stripe = new THREE.Mesh(
                new THREE.BoxGeometry(W + 0.1, 0.4, D + 0.1),
                colorMats[i]
            );
            stripe.position.y = H - 0.4 - i * 0.6;
            g.add(stripe);
        }

        const roof = new THREE.Mesh(
            new THREE.BoxGeometry(W + 1, 0.3, D + 1), roofMat
        );
        roof.position.y = H + 0.2;
        g.add(roof);

        // Big "ARCADE" sign over entrance
        const signBoard = new THREE.Mesh(
            new THREE.BoxGeometry(8, 1.4, 0.2),
            new THREE.MeshStandardMaterial({
                color: 0xE8C040, roughness: 0.6
            })
        );
        signBoard.position.set(0, H + 0.9, D / 2 + 0.05);
        g.add(signBoard);
        const signText = new THREE.Mesh(
            new THREE.PlaneGeometry(7.8, 1.2),
            new THREE.MeshBasicMaterial({
                map: this._makeSignTexture('PACIFIC PARK', 0xE8C040),
                transparent: true, side: THREE.DoubleSide
            })
        );
        signText.position.set(0, H + 0.9, D / 2 + 0.18);
        g.add(signText);

        // Place on the widened pier section
        g.position.set(
            PIER_WIDE_X - 30, PIER_DECK_Y + 0.2, PIER_BASE_Z + 8
        );
        this.group.add(g);
    }

    // ==========================================================
    //  Pacific Wheel — the iconic Ferris wheel
    // ==========================================================
    createFerrisWheel() {
        const g = new THREE.Group();
        g.userData = { name: 'Pacific Wheel', type: 'landmark' };

        const frameMat = new THREE.MeshStandardMaterial({
            color: 0xE0E0E0, roughness: 0.5, metalness: 0.6
        });
        const hubMat = new THREE.MeshStandardMaterial({
            color: 0xDD2D2D, roughness: 0.5, metalness: 0.4
        });
        const gondolaColors = [0xE74C3C, 0x3498DB, 0xF1C40F, 0x2ECC71,
            0x9B59B6, 0xE67E22, 0x1ABC9C, 0xE84393, 0x34495E,
            0xF39C12, 0xE8C040, 0x8E44AD];

        const wheelR = 14;
        const wheelCenterY = wheelR + 6; // Hub height above deck
        const spokeCount = 12;

        // Central hub (rotating wheel, attached to the rotor)
        const rotor = new THREE.Group();
        // Hub
        const hub = new THREE.Mesh(
            new THREE.CylinderGeometry(1.1, 1.1, 1.5, 16), hubMat
        );
        hub.rotation.x = Math.PI / 2;
        rotor.add(hub);
        // Outer rim (double ring)
        for (const zOff of [-0.6, 0.6]) {
            const rim = new THREE.Mesh(
                new THREE.TorusGeometry(wheelR, 0.15, 8, 48), frameMat
            );
            rim.position.z = zOff;
            rotor.add(rim);
        }
        // Spokes
        for (let i = 0; i < spokeCount; i++) {
            const a = (i / spokeCount) * Math.PI * 2;
            const spoke = new THREE.Mesh(
                new THREE.CylinderGeometry(0.08, 0.08, wheelR, 6), frameMat
            );
            spoke.rotation.z = a + Math.PI / 2;
            spoke.position.x = Math.cos(a) * wheelR / 2;
            spoke.position.y = Math.sin(a) * wheelR / 2;
            rotor.add(spoke);
        }
        // Gondolas
        for (let i = 0; i < spokeCount; i++) {
            const a = (i / spokeCount) * Math.PI * 2;
            const gondola = new THREE.Group();
            // Support arm hanging from spoke end
            const arm = new THREE.Mesh(
                new THREE.CylinderGeometry(0.04, 0.04, 1.2, 6), frameMat
            );
            arm.position.y = -0.6;
            gondola.add(arm);
            // Car body
            const car = new THREE.Mesh(
                new THREE.BoxGeometry(1.8, 1.2, 1.4),
                new THREE.MeshStandardMaterial({
                    color: gondolaColors[i % gondolaColors.length],
                    roughness: 0.6
                })
            );
            car.position.y = -1.8;
            car.castShadow = true;
            gondola.add(car);
            // Roof dome
            const roof = new THREE.Mesh(
                new THREE.CylinderGeometry(1.0, 1.0, 0.15, 8),
                new THREE.MeshStandardMaterial({
                    color: gondolaColors[(i + 3) % gondolaColors.length],
                    roughness: 0.6
                })
            );
            roof.position.y = -1.15;
            gondola.add(roof);
            // Position on rim — gondolas hang freely (they swing) but
            // we freeze them and rely on wheel rotation + gondola
            // counter-rotation for an upright look.
            gondola.position.x = Math.cos(a) * wheelR;
            gondola.position.y = Math.sin(a) * wheelR;
            gondola.userData.gondola = true;
            gondola.userData.baseAngle = a;
            rotor.add(gondola);
        }

        // Orient the rotor so its flat face is perpendicular to the pier axis.
        // Pier runs in X; wheel plane should span Y-Z (rotating around X).
        rotor.rotation.y = Math.PI / 2;
        // Lift the rotor to the hub position
        rotor.position.y = wheelCenterY;
        g.add(rotor);

        // Support A-frame legs
        for (const side of [-1, 1]) {
            for (const sx of [-2, 2]) {
                const leg = new THREE.Mesh(
                    new THREE.CylinderGeometry(0.2, 0.3, wheelCenterY, 7),
                    frameMat
                );
                leg.position.set(sx, wheelCenterY / 2,
                    side * 3);
                // Tilt legs so they converge at the hub
                leg.rotation.z = -Math.sign(sx) * 0.05;
                leg.rotation.x = -side * 0.3;
                g.add(leg);
            }
        }
        // Bases
        const baseMat = new THREE.MeshStandardMaterial({
            color: 0xB8B8B8, roughness: 0.7
        });
        for (const side of [-1, 1]) {
            const base = new THREE.Mesh(
                new THREE.BoxGeometry(6, 0.6, 2), baseMat
            );
            base.position.set(0, 0.3, side * 4);
            g.add(base);
        }

        // Position on the widened Pacific Park section
        g.position.set(
            PIER_WIDE_X - 55, PIER_DECK_Y + 0.2, PIER_BASE_Z - 2
        );
        this.group.add(g);

        // Remember the rotor so we can spin it in update()
        this._ferrisWheel = rotor;
    }

    // ==========================================================
    //  West Coaster — simplified roller coaster
    // ==========================================================
    createRollerCoaster() {
        const g = new THREE.Group();
        g.userData = { name: 'West Coaster', type: 'landmark' };

        const trackMat = new THREE.MeshStandardMaterial({
            color: 0xE0E5E8, roughness: 0.5, metalness: 0.6
        });
        const supportMat = new THREE.MeshStandardMaterial({
            color: 0x3A3D48, roughness: 0.7, metalness: 0.5
        });

        // Oval track path — parametric around the widened pier section
        const radiusX = 22, radiusZ = 9;
        const points = [];
        const N = 60;
        for (let i = 0; i <= N; i++) {
            const t = (i / N) * Math.PI * 2;
            const x = Math.cos(t) * radiusX;
            const z = Math.sin(t) * radiusZ;
            // Coaster has a small hill midway
            const y = 4 + Math.sin(t * 2) * 3 + Math.sin(t * 3) * 1;
            points.push(new THREE.Vector3(x, y, z));
        }
        const curve = new THREE.CatmullRomCurve3(points, true);

        // Track rails — a tubeGeometry following the curve
        const trackGeo = new THREE.TubeGeometry(curve, 120, 0.12, 6, true);
        const track = new THREE.Mesh(trackGeo, trackMat);
        g.add(track);

        // Second parallel rail (offset slightly)
        const pointsB = points.map(p => p.clone().add(new THREE.Vector3(0, 0.3, 0)));
        const curveB = new THREE.CatmullRomCurve3(pointsB, true);
        const trackGeoB = new THREE.TubeGeometry(curveB, 120, 0.12, 6, true);
        const trackB = new THREE.Mesh(trackGeoB, trackMat);
        g.add(trackB);

        // Cross ties
        const tieMat = new THREE.MeshStandardMaterial({
            color: 0x7A7572, roughness: 0.7
        });
        for (let i = 0; i < 40; i++) {
            const t = i / 40;
            const pt = curve.getPoint(t);
            const tie = new THREE.Mesh(
                new THREE.BoxGeometry(0.4, 0.08, 0.08), tieMat
            );
            tie.position.copy(pt);
            tie.position.y += 0.15;
            g.add(tie);
        }

        // Support pillars at intervals
        for (let i = 0; i < 18; i++) {
            const t = i / 18;
            const pt = curve.getPoint(t);
            const pillar = new THREE.Mesh(
                new THREE.CylinderGeometry(0.18, 0.25, pt.y, 7),
                supportMat
            );
            pillar.position.set(pt.x, pt.y / 2, pt.z);
            pillar.castShadow = true;
            g.add(pillar);
        }

        // A couple of coaster cars that travel along the track
        for (let c = 0; c < 3; c++) {
            const car = new THREE.Mesh(
                new THREE.BoxGeometry(1.5, 0.8, 0.9),
                new THREE.MeshStandardMaterial({
                    color: 0xE63A1E, roughness: 0.6
                })
            );
            car.userData.coasterCar = true;
            car.userData.offset = c * 0.15;  // Phase offset along curve
            g.add(car);
            this._coasterCars.push({ mesh: car, curve, offset: c * 0.08 });
        }

        g.position.set(
            PIER_WIDE_X - 55, PIER_DECK_Y + 2, PIER_BASE_Z + 12
        );
        this.group.add(g);
    }

    createPierSignage() {
        // Entrance archway sign — the iconic "SANTA MONICA / YACHT HARBOR /
        // SPORT FISHING / BOATING / CAFES" arched sign at the shore-side
        // entrance to the pier.
        const g = new THREE.Group();
        g.userData = { name: 'Santa Monica Pier entrance', type: 'sign' };

        const postMat = new THREE.MeshStandardMaterial({
            color: 0xE7E1D4, roughness: 0.82
        });
        const signMat = new THREE.MeshStandardMaterial({
            color: 0x1B355A, roughness: 0.7
        });

        // Two vertical posts
        for (const sx of [-8, 8]) {
            const post = new THREE.Mesh(
                new THREE.BoxGeometry(0.5, 6, 0.5), postMat
            );
            post.position.set(sx, 3, 0);
            g.add(post);
        }
        // Arched sign panel
        const arch = new THREE.Mesh(
            new THREE.BoxGeometry(17, 2.4, 0.4), signMat
        );
        arch.position.y = 5.5;
        g.add(arch);
        // Curved decorative top (half-torus)
        const curve = new THREE.Mesh(
            new THREE.TorusGeometry(8, 0.2, 8, 30, Math.PI),
            postMat
        );
        curve.position.y = 6.8;
        curve.rotation.z = Math.PI;
        g.add(curve);

        // Sign text
        const text = new THREE.Mesh(
            new THREE.PlaneGeometry(16, 2.0),
            new THREE.MeshBasicMaterial({
                map: this._makeSignTexture('Santa Monica Pier', 0x1B355A),
                transparent: true, side: THREE.DoubleSide
            })
        );
        text.position.set(0, 5.5, 0.21);
        g.add(text);
        const textBack = text.clone();
        textBack.position.z = -0.21;
        textBack.rotation.y = Math.PI;
        g.add(textBack);

        // Position at the shore-side pier entrance, straddling it
        g.position.set(
            WATER_EDGE_X + 8, PIER_DECK_Y, PIER_BASE_Z
        );
        g.rotation.y = -Math.PI / 2; // Face down the pier
        this.group.add(g);

        // "End of Route 66" sign — classic shield on a post at the pier entrance
        const route66 = new THREE.Group();
        route66.userData = {
            name: 'End of Route 66',
            description: 'Santa Monica Pier — symbolic western end of US Route 66.',
            isInteractable: true,
            type: 'sign',
            interactionType: 'Photo Op'
        };
        const rPost = new THREE.Mesh(
            new THREE.CylinderGeometry(0.07, 0.07, 3.2, 7),
            new THREE.MeshStandardMaterial({
                color: 0x2A2A2A, roughness: 0.5, metalness: 0.5
            })
        );
        rPost.position.y = 1.6;
        route66.add(rPost);
        const shield = new THREE.Mesh(
            new THREE.PlaneGeometry(1.4, 1.4),
            new THREE.MeshBasicMaterial({
                map: this._makeRoute66ShieldTexture(),
                transparent: true
            })
        );
        shield.position.y = 3.1;
        route66.add(shield);
        const shieldBack = shield.clone();
        shieldBack.rotation.y = Math.PI;
        route66.add(shieldBack);

        route66.position.set(
            WATER_EDGE_X + 5, PIER_DECK_Y + 0.2, PIER_BASE_Z + PIER_HALFWIDTH + 3
        );
        this.group.add(route66);
    }

    _makeRoute66ShieldTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 256; canvas.height = 256;
        const ctx = canvas.getContext('2d');
        // Shield shape (white fill)
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.moveTo(128, 6);
        ctx.lineTo(245, 55);
        ctx.lineTo(230, 200);
        ctx.quadraticCurveTo(128, 260, 26, 200);
        ctx.lineTo(11, 55);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 8;
        ctx.stroke();

        // "US" at top
        ctx.fillStyle = '#000000';
        ctx.font = 'bold 32px "Helvetica", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('END OF', 128, 64);
        ctx.font = 'bold 28px "Helvetica", sans-serif';
        ctx.fillText('THE TRAIL', 128, 92);
        // Big 66
        ctx.font = 'bold 88px "Helvetica", sans-serif';
        ctx.fillText('66', 128, 165);

        const tex = new THREE.CanvasTexture(canvas);
        tex.anisotropy = 4;
        tex.needsUpdate = true;
        return tex;
    }

    // ==========================================================
    //  Location signage — Welcome to Venice, etc.
    // ==========================================================
    createSignage() {
        const g = new THREE.Group();
        g.userData = { name: 'Welcome to Venice Beach', type: 'sign' };

        const postMat = new THREE.MeshStandardMaterial({
            color: 0x2A2A2A, roughness: 0.5, metalness: 0.5
        });
        const boardMat = new THREE.MeshStandardMaterial({
            color: 0x3A2A1A, roughness: 0.85
        });

        for (const sx of [-3, 3]) {
            const post = new THREE.Mesh(
                new THREE.BoxGeometry(0.3, 5, 0.3), postMat
            );
            post.position.set(sx, 2.5, 0);
            g.add(post);
        }
        const board = new THREE.Mesh(
            new THREE.BoxGeometry(7.2, 1.6, 0.2), boardMat
        );
        board.position.y = 4.4;
        g.add(board);
        const text = new THREE.Mesh(
            new THREE.PlaneGeometry(6.8, 1.3),
            new THREE.MeshBasicMaterial({
                map: this._makeSignTexture('Venice', 0x3A2A1A),
                transparent: true, side: THREE.DoubleSide
            })
        );
        text.position.set(0, 4.4, 0.11);
        g.add(text);
        const textBack = text.clone();
        textBack.position.z = -0.11;
        textBack.rotation.y = Math.PI;
        g.add(textBack);

        g.position.set(7, this.localHeight(7, 250), 250);
        g.rotation.y = Math.PI;
        this.group.add(g);
    }

    // ==========================================================
    //  Per-frame animation — Ferris wheel spin, coaster, wave foam
    // ==========================================================
    update(delta, time) {
        this._time = time !== undefined ? time : this._time + delta;

        // Spin the Ferris wheel rotor
        if (this._ferrisWheel) {
            this._ferrisWheel.rotation.z -= this._ferrisSpeed * delta;
            // Keep gondolas upright: counter-rotate each one by -this.rotation
            for (const child of this._ferrisWheel.children) {
                if (child.userData && child.userData.gondola) {
                    // Gondola is at angle baseAngle relative to rotor;
                    // to keep car upright it must rotate opposite to the rotor.
                    child.rotation.z = -this._ferrisWheel.rotation.z;
                }
            }
        }

        // Move coaster cars along the curve
        const lapSpeed = 0.08; // laps per second
        const progress = (this._time * lapSpeed) % 1;
        for (const car of this._coasterCars) {
            let t = (progress + car.offset) % 1;
            const pt = car.curve.getPoint(t);
            const tangent = car.curve.getTangent(t);
            car.mesh.position.copy(pt);
            car.mesh.position.y += 0.2;
            car.mesh.rotation.y = Math.atan2(tangent.x, tangent.z);
        }

        // Gentle foam pulsing
        for (const f of this._waveMeshes) {
            f.scale.z = 0.25 + 0.1 * Math.sin(this._time * 2 + f.position.z * 0.05);
        }
    }

    // ==========================================================
    //  Helpers
    // ==========================================================
    _onPier(x, z) {
        // Is this point under or on the pier deck?
        if (z < PIER_BASE_Z - PIER_HALFWIDTH - 5) return false;
        if (z > PIER_BASE_Z + PIER_HALFWIDTH + 5) return false;
        if (x > WATER_EDGE_X + 10) return false;
        if (x < PIER_WEST_X - 5) return false;
        return true;
    }

    getInteractables() {
        const out = [];
        this.group.traverse(obj => {
            if (obj.userData && obj.userData.isInteractable) out.push(obj);
        });
        return out;
    }
}
