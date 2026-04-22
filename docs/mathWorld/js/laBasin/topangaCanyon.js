/**
 * Topanga Canyon — the legendary S-curve town in the Santa Monica
 * Mountains. A tight valley floor with Topanga Creek on one side and
 * Topanga Canyon Boulevard (CA-27) on the other, flanked by steep
 * oak-covered slopes that rise into chaparral ridges.
 *
 * Origin (0, 0, 0 local) = Topanga Country Store, a 1930s red-painted
 * wooden landmark. +X is east, -X is west, -Z is north (up-canyon),
 * +Z is south (toward the Pacific).
 *
 * Layout (group-local coords, metres):
 *   Topanga Country Store   (0,   0,   0)       origin
 *   Art Gallery (W side)    (-22, 0,  15)
 *   Rustic cabins           various lower-slope positions
 *   Theatricum Botanicum    (+8,  0, -80)       ~600 m N in reality
 *   Topanga Creek axis      x ≈ -12, running N-S
 *   Topanga Canyon Blvd     x ≈ +10 (road), shoulder to +17
 *   Oak woodland            lower slopes, x ∈ ±(30, 120), z ∈ ±160
 *   Chaparral               upper slopes, x ∈ ±(120, 380)
 *
 * Topography (see refs/topography.md):
 *   Valley floor  ≈ 0 m local  (≈ 110 m world via laBasin regional)
 *   Creek bed     ≈ -3 m local
 *   Toe of slope  ≈ ±80 m (x), +15 m elevation
 *   Ridge line    ≈ ±380 m (x), +160 m elevation (compressed from real)
 */

import * as THREE from 'three';

// ---- Canyon constants ----
const FLOOR_Y = 0;
const CREEK_X = -12;
const CREEK_Y = -3;
const ROAD_CENTER_X = 10;
const ROAD_HALF_WIDTH = 3.5;   // 7 m asphalt total
const SHOULDER_HALF = 4.5;     // 9 m total including shoulders
const VALLEY_FLOOR_HALFWIDTH = 28; // ±28 m = valley floor
const SLOPE_TOE_HALFWIDTH = 80;    // ±80 m = base of steep slope
const RIDGE_HALFWIDTH = 380;       // ±380 m = ridge line

export class TopangaCanyon {
    constructor(campusGroup, terrainHeightFn = null) {
        this.group = campusGroup;
        this.worldSize = 820;
        this.terrainResolution = 220;
        this.regionalTerrainFn = terrainHeightFn;
    }

    setTerrainFunction(fn) { this.regionalTerrainFn = fn; }

    async generate() {
        this.createTerrain();
        this.createCreek();
        this.createRoad();
        this.createCountryStore();
        this.createArtGallery();
        this.createTheatricumBotanicum();
        this.createRusticCabins();
        this.createOakWoodland();
        this.createSycamoreRiparian();
        this.createChaparralShrubs();
        this.createRoadsideFeatures();
        this.createSignage();
    }

    // ==========================================================
    //  Local terrain
    // ==========================================================
    //
    // Canyon cross-section sculpted from Math.abs(x):
    //   |x| <= VALLEY_FLOOR_HALFWIDTH       : flat valley floor
    //   VALLEY_FLOOR to SLOPE_TOE          : gentle rise (toe of slope)
    //   SLOPE_TOE to RIDGE                 : steep rise to the ridges
    //
    // Plus a creek carved along CREEK_X, and sinuous ridge noise for
    // natural feel.
    localHeight(x, z) {
        const absX = Math.abs(x);
        let h = 0;

        // Main canyon profile (symmetric-ish)
        if (absX <= VALLEY_FLOOR_HALFWIDTH) {
            h = 0; // flat floor
        } else if (absX <= SLOPE_TOE_HALFWIDTH) {
            const t = (absX - VALLEY_FLOOR_HALFWIDTH) /
                      (SLOPE_TOE_HALFWIDTH - VALLEY_FLOOR_HALFWIDTH);
            // Gentle rise to +15 m over this zone (toe of slope)
            h = 15 * (t * t * (3 - 2 * t));
        } else if (absX <= RIDGE_HALFWIDTH) {
            const t = (absX - SLOPE_TOE_HALFWIDTH) /
                      (RIDGE_HALFWIDTH - SLOPE_TOE_HALFWIDTH);
            // Steep rise from +15 m to +160 m
            const s = t * t * (3 - 2 * t);
            h = 15 + (160 - 15) * s;
        } else {
            // Past the ridge: keep climbing gently
            h = 160 + (absX - RIDGE_HALFWIDTH) * 0.08;
        }

        // Ridge noise — side drainages, ridgelets, small spurs
        const ridgePhase = (absX / 50) + (z / 60);
        h += Math.sin(ridgePhase) * 4 * Math.min(1, (absX - 30) / 100);
        h += Math.sin(x * 0.025 + z * 0.018) * 3 *
             Math.min(1, Math.max(0, (absX - 40) / 80));

        // Creek carving — cuts a narrow trench down the canyon
        const creekMeander = CREEK_X + Math.sin(z * 0.018) * 2.5
                           + Math.sin(z * 0.04) * 0.8;
        const creekDist = Math.abs(x - creekMeander);
        if (creekDist < 8) {
            // V-shaped cross-section, bottom at CREEK_Y
            const t = creekDist / 8;
            const depth = CREEK_Y * (1 - t * t);
            h = Math.min(h, depth);
        }

        // Small path cuts along the road (road is ~0 m high, sits on fill)
        // Leave this out — the road mesh sits on top.

        // Subtle everywhere variation
        h += Math.sin(x * 0.05) * Math.cos(z * 0.04) * 0.35;
        h += Math.sin(x * 0.14 + z * 0.09) * 0.2;

        return h;
    }

    // Returns terrain height blended with the regional terrain at the edges
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
            const worldX = lx;
            const worldZ = -ly;
            const h = this.localHeight(worldX, worldZ);
            pos.setZ(i, h);

            // Vertex colors — zonal SoCal palette
            let r, g, b;
            const absX = Math.abs(worldX);
            const creekMeander = CREEK_X + Math.sin(worldZ * 0.018) * 2.5;
            const creekDist = Math.abs(worldX - creekMeander);

            if (creekDist < 1.6 && h < 0) {
                // Creek bed (gravel / wet)
                r = 0.45; g = 0.42; b = 0.35;
            } else if (creekDist < 4) {
                // Creek banks — moist soil, riparian
                r = 0.38; g = 0.40; b = 0.28;
            } else if (absX < VALLEY_FLOOR_HALFWIDTH) {
                // Valley floor — dry grass/trail
                r = 0.56; g = 0.53; b = 0.36;
            } else if (absX < SLOPE_TOE_HALFWIDTH) {
                // Lower slope — oak woodland duff
                r = 0.42; g = 0.42; b = 0.26;
            } else if (h < 80) {
                // Mid slope — oak/chaparral transition
                r = 0.48; g = 0.48; b = 0.30;
            } else if (h < 140) {
                // Upper slope — chaparral
                r = 0.55; g = 0.52; b = 0.36;
            } else {
                // Ridges — sandstone bedrock
                r = 0.64; g = 0.56; b = 0.44;
            }
            const n = (Math.random() - 0.5) * 0.07;
            colors[i * 3]     = Math.max(0, Math.min(1, r + n));
            colors[i * 3 + 1] = Math.max(0, Math.min(1, g + n));
            colors[i * 3 + 2] = Math.max(0, Math.min(1, b + n));
        }

        geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geo.computeVertexNormals();

        const mat = new THREE.MeshStandardMaterial({
            vertexColors: true, roughness: 0.94, metalness: 0
        });
        const terrain = new THREE.Mesh(geo, mat);
        terrain.rotation.x = -Math.PI / 2;
        terrain.receiveShadow = true;
        terrain.userData.noCollision = true;  // player uses getTerrainHeight
        this.group.add(terrain);
    }

    // ==========================================================
    //  Topanga Creek — shallow sinuous water ribbon
    // ==========================================================
    createCreek() {
        const waterMat = new THREE.MeshStandardMaterial({
            color: 0x415E52, roughness: 0.25, metalness: 0.3,
            transparent: true, opacity: 0.85
        });
        const rockMat = new THREE.MeshStandardMaterial({
            color: 0x6E685C, roughness: 0.92, flatShading: true
        });
        const bankMat = new THREE.MeshStandardMaterial({
            color: 0x4A4A2C, roughness: 0.92
        });

        const segments = 60;
        const zMin = -380, zMax = 380;
        for (let i = 0; i < segments; i++) {
            const t0 = i / segments;
            const t1 = (i + 1) / segments;
            const z0 = zMin + (zMax - zMin) * t0;
            const z1 = zMin + (zMax - zMin) * t1;
            const x0 = CREEK_X + Math.sin(z0 * 0.018) * 2.5 + Math.sin(z0 * 0.04) * 0.8;
            const x1 = CREEK_X + Math.sin(z1 * 0.018) * 2.5 + Math.sin(z1 * 0.04) * 0.8;
            const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
            const dx = x1 - x0, dz = z1 - z0;
            const segLen = Math.sqrt(dx * dx + dz * dz);

            // Water ribbon — follows the deepest part of the V
            const waterY = this.localHeight(cx, cz) + 0.15;
            const water = new THREE.Mesh(
                new THREE.PlaneGeometry(1.8, segLen + 0.2), waterMat
            );
            water.rotation.x = -Math.PI / 2;
            water.rotation.z = Math.atan2(dx, dz);
            water.position.set(cx, waterY, cz);
            water.userData.noCollision = true;
            this.group.add(water);
        }

        // Rocks in the creek bed
        for (let i = 0; i < 90; i++) {
            const z = zMin + Math.random() * (zMax - zMin);
            const meander = CREEK_X + Math.sin(z * 0.018) * 2.5;
            const x = meander + (Math.random() - 0.5) * 3;
            const rock = new THREE.Mesh(
                new THREE.DodecahedronGeometry(0.2 + Math.random() * 0.6, 0),
                rockMat
            );
            rock.position.set(x, this.localHeight(x, z) + 0.05, z);
            rock.rotation.set(Math.random(), Math.random(), Math.random());
            rock.scale.y = 0.5 + Math.random() * 0.4;
            this.group.add(rock);
        }

        // Wet banks — dark moist soil strips along the creek
        for (let i = 0; i < 30; i++) {
            const z = zMin + Math.random() * (zMax - zMin);
            const meander = CREEK_X + Math.sin(z * 0.018) * 2.5;
            const side = Math.random() > 0.5 ? 1.4 : -1.4;
            const bank = new THREE.Mesh(
                new THREE.PlaneGeometry(0.9, 2.5 + Math.random() * 2),
                bankMat
            );
            bank.rotation.x = -Math.PI / 2;
            bank.position.set(
                meander + side,
                this.localHeight(meander + side, z) + 0.04,
                z
            );
            bank.userData.noCollision = true;
            this.group.add(bank);
        }
    }

    // ==========================================================
    //  Topanga Canyon Boulevard (CA-27)
    // ==========================================================
    createRoad() {
        const asphaltMat = new THREE.MeshStandardMaterial({
            color: 0x262628, roughness: 0.93, metalness: 0
        });
        const shoulderMat = new THREE.MeshStandardMaterial({
            color: 0x78725D, roughness: 0.9
        });
        const stripeMat = new THREE.MeshBasicMaterial({ color: 0xE8C440 });
        const edgeLineMat = new THREE.MeshBasicMaterial({ color: 0xDCDCDC });

        const segments = 50;
        const zMin = -380, zMax = 380;
        for (let i = 0; i < segments; i++) {
            const t0 = i / segments;
            const t1 = (i + 1) / segments;
            const z0 = zMin + (zMax - zMin) * t0;
            const z1 = zMin + (zMax - zMin) * t1;
            // Road curves gently — a subtle S through the canyon
            const xOff0 = Math.sin(z0 * 0.008) * 2.5 + Math.sin(z0 * 0.02) * 0.8;
            const xOff1 = Math.sin(z1 * 0.008) * 2.5 + Math.sin(z1 * 0.02) * 0.8;
            const x0 = ROAD_CENTER_X + xOff0;
            const x1 = ROAD_CENTER_X + xOff1;
            const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
            const dx = x1 - x0, dz = z1 - z0;
            const segLen = Math.sqrt(dx * dx + dz * dz) + 0.1;
            const angle = Math.atan2(dx, dz);

            // Shoulder (wider, underneath)
            const shoulder = new THREE.Mesh(
                new THREE.PlaneGeometry(SHOULDER_HALF * 2, segLen + 0.2),
                shoulderMat
            );
            shoulder.rotation.x = -Math.PI / 2;
            shoulder.rotation.z = angle;
            shoulder.position.set(cx, this.localHeight(cx, cz) + 0.04, cz);
            shoulder.userData.noCollision = true;
            shoulder.receiveShadow = true;
            this.group.add(shoulder);

            // Asphalt strip on top
            const asphalt = new THREE.Mesh(
                new THREE.PlaneGeometry(ROAD_HALF_WIDTH * 2, segLen + 0.1),
                asphaltMat
            );
            asphalt.rotation.x = -Math.PI / 2;
            asphalt.rotation.z = angle;
            asphalt.position.set(cx, this.localHeight(cx, cz) + 0.08, cz);
            asphalt.userData.noCollision = true;
            asphalt.receiveShadow = true;
            this.group.add(asphalt);

            // White edge lines (both sides)
            for (const side of [-1, 1]) {
                const edge = new THREE.Mesh(
                    new THREE.PlaneGeometry(0.14, segLen),
                    edgeLineMat
                );
                edge.rotation.x = -Math.PI / 2;
                edge.rotation.z = angle;
                const offsetX = side * (ROAD_HALF_WIDTH - 0.1) * Math.cos(angle);
                const offsetZ = -side * (ROAD_HALF_WIDTH - 0.1) * Math.sin(angle);
                edge.position.set(
                    cx + offsetX,
                    this.localHeight(cx, cz) + 0.10,
                    cz + offsetZ
                );
                edge.userData.noCollision = true;
                this.group.add(edge);
            }
        }

        // Dashed yellow center stripes
        const dashLen = 3.0;
        const gapLen = 6.0;
        let z = zMin + 2;
        while (z < zMax - 2) {
            const xOff = Math.sin(z * 0.008) * 2.5 + Math.sin(z * 0.02) * 0.8;
            const xOffEnd = Math.sin((z + dashLen) * 0.008) * 2.5
                          + Math.sin((z + dashLen) * 0.02) * 0.8;
            const cx = ROAD_CENTER_X + (xOff + xOffEnd) / 2;
            const cz = z + dashLen / 2;
            const angle = Math.atan2(xOffEnd - xOff, dashLen);
            const stripe = new THREE.Mesh(
                new THREE.PlaneGeometry(0.16, dashLen), stripeMat
            );
            stripe.rotation.x = -Math.PI / 2;
            stripe.rotation.z = angle;
            stripe.position.set(cx, this.localHeight(cx, cz) + 0.11, cz);
            stripe.userData.noCollision = true;
            this.group.add(stripe);
            z += dashLen + gapLen;
        }
    }

    // ==========================================================
    //  Topanga Country Store — the origin landmark
    // ==========================================================
    createCountryStore() {
        const store = new THREE.Group();
        store.userData = {
            name: 'Topanga Country Store',
            description: '1930s wooden general store — the heart of the canyon town.',
            isInteractable: true,
            type: 'landmark',
            interactionType: 'Enter'
        };

        const redWoodMat = new THREE.MeshStandardMaterial({
            color: 0x9B2E26, roughness: 0.85  // Classic barn red
        });
        const darkRedMat = new THREE.MeshStandardMaterial({
            color: 0x6E1F1A, roughness: 0.88
        });
        const roofMat = new THREE.MeshStandardMaterial({
            color: 0x403B36, roughness: 0.9
        });
        const woodTrimMat = new THREE.MeshStandardMaterial({
            color: 0xC9B688, roughness: 0.8
        });
        const glassMat = new THREE.MeshStandardMaterial({
            color: 0x6B7D86, roughness: 0.2, metalness: 0.3,
            transparent: true, opacity: 0.7
        });

        const W = 14, D = 10, H = 4.5;

        // Foundation (concrete plinth)
        const foundation = new THREE.Mesh(
            new THREE.BoxGeometry(W + 0.4, 0.4, D + 0.4),
            new THREE.MeshStandardMaterial({ color: 0x807970, roughness: 0.85 })
        );
        foundation.position.y = 0.2;
        foundation.receiveShadow = true;
        store.add(foundation);

        // Main body
        const body = new THREE.Mesh(
            new THREE.BoxGeometry(W, H, D), redWoodMat
        );
        body.position.y = 0.4 + H / 2;
        body.castShadow = true;
        body.receiveShadow = true;
        store.add(body);

        // Pitched roof (two slanted planes)
        const roofH = 2.0;
        const roofOverhang = 0.6;
        for (const side of [-1, 1]) {
            const roof = new THREE.Mesh(
                new THREE.BoxGeometry(W + roofOverhang * 2,
                    0.2, D / 2 + roofOverhang + 0.1),
                roofMat
            );
            roof.position.set(
                0, 0.4 + H + roofH / 2,
                side * ((D / 2 + roofOverhang) / 2)
            );
            // Tilt to form the pitch
            roof.rotation.x = side * Math.atan2(roofH, D / 2);
            roof.castShadow = true;
            store.add(roof);
        }

        // Gable ends (triangle fill)
        for (const face of [-1, 1]) {
            const gableShape = new THREE.Shape();
            gableShape.moveTo(-W / 2, 0);
            gableShape.lineTo(W / 2, 0);
            gableShape.lineTo(0, roofH);
            gableShape.lineTo(-W / 2, 0);
            const gable = new THREE.Mesh(
                new THREE.ShapeGeometry(gableShape), redWoodMat
            );
            gable.position.set(0, 0.4 + H, face * D / 2);
            gable.rotation.y = face > 0 ? 0 : Math.PI;
            store.add(gable);
        }

        // Front porch (covered, on south face = +Z)
        const porchDepth = 2.5;
        const porchDeck = new THREE.Mesh(
            new THREE.BoxGeometry(W, 0.15, porchDepth),
            new THREE.MeshStandardMaterial({ color: 0x7A5838, roughness: 0.85 })
        );
        porchDeck.position.set(0, 0.5, D / 2 + porchDepth / 2);
        porchDeck.receiveShadow = true;
        store.add(porchDeck);

        const porchRoof = new THREE.Mesh(
            new THREE.BoxGeometry(W + 0.6, 0.15, porchDepth + 0.3),
            roofMat
        );
        porchRoof.position.set(0, 0.4 + H + 0.2, D / 2 + porchDepth / 2);
        porchRoof.rotation.x = -0.1;
        store.add(porchRoof);

        // Porch posts
        for (const px of [-W / 2 + 0.5, -W / 4, W / 4, W / 2 - 0.5]) {
            const post = new THREE.Mesh(
                new THREE.BoxGeometry(0.2, H, 0.2), woodTrimMat
            );
            post.position.set(px, 0.4 + H / 2 + 0.25,
                D / 2 + porchDepth - 0.3);
            store.add(post);
        }

        // Porch rail
        const rail = new THREE.Mesh(
            new THREE.BoxGeometry(W, 0.1, 0.1), woodTrimMat
        );
        rail.position.set(0, 1.3, D / 2 + porchDepth - 0.3);
        store.add(rail);

        // Front door + windows (on south side)
        const door = new THREE.Mesh(
            new THREE.BoxGeometry(1.3, 2.3, 0.1),
            new THREE.MeshStandardMaterial({ color: 0x3A2818, roughness: 0.8 })
        );
        door.position.set(0, 0.4 + 1.15, D / 2 + 0.06);
        store.add(door);

        // Large storefront windows
        for (const wx of [-4, 4]) {
            const win = new THREE.Mesh(
                new THREE.BoxGeometry(2.4, 1.8, 0.1), glassMat
            );
            win.position.set(wx, 0.4 + 2.0, D / 2 + 0.06);
            store.add(win);
            // Trim
            const winTrim = new THREE.Mesh(
                new THREE.BoxGeometry(2.6, 0.08, 0.12), woodTrimMat
            );
            winTrim.position.set(wx, 0.4 + 2.95, D / 2 + 0.07);
            store.add(winTrim);
        }

        // Hand-painted storefront sign above porch
        const signBoard = new THREE.Mesh(
            new THREE.BoxGeometry(W - 1, 0.9, 0.08), darkRedMat
        );
        signBoard.position.set(0, 0.4 + H + 0.4, D / 2 + porchDepth + 0.1);
        signBoard.rotation.x = -0.15;
        store.add(signBoard);

        const signText = new THREE.Mesh(
            new THREE.PlaneGeometry(W - 1.4, 0.7),
            new THREE.MeshBasicMaterial({
                map: this._makePaintedSignTexture('Topanga Country Store', 0x6E1F1A),
                transparent: true
            })
        );
        signText.position.set(0, 0.4 + H + 0.4, D / 2 + porchDepth + 0.15);
        signText.rotation.x = -0.15;
        store.add(signText);

        // Coca-Cola style metal sign on the wall (character!)
        const cokeSign = new THREE.Mesh(
            new THREE.PlaneGeometry(1.2, 0.9),
            new THREE.MeshBasicMaterial({
                map: this._makePaintedSignTexture('Coca-Cola', 0xD0362B),
                transparent: true
            })
        );
        cokeSign.position.set(W / 2 - 0.5, 3.0, D / 2 + 0.1);
        store.add(cokeSign);

        // Rocking chair on porch
        this._addRockingChair(store, -W / 2 + 2.5, 0.5, D / 2 + porchDepth - 0.8);

        // Position: origin of the level
        store.position.set(0, this.localHeight(0, 0), 0);
        this.group.add(store);
    }

    _addRockingChair(parent, x, y, z) {
        const woodMat = new THREE.MeshStandardMaterial({
            color: 0x6B4E32, roughness: 0.85
        });
        const chair = new THREE.Group();
        const seat = new THREE.Mesh(
            new THREE.BoxGeometry(0.55, 0.06, 0.5), woodMat
        );
        seat.position.y = 0.45;
        chair.add(seat);
        const back = new THREE.Mesh(
            new THREE.BoxGeometry(0.55, 0.8, 0.06), woodMat
        );
        back.position.set(0, 0.82, -0.22);
        back.rotation.x = -0.15;
        chair.add(back);
        // Rockers
        for (const side of [-1, 1]) {
            const rocker = new THREE.Mesh(
                new THREE.TorusGeometry(0.35, 0.03, 6, 12,
                    Math.PI / 2),
                woodMat
            );
            rocker.rotation.y = Math.PI / 2;
            rocker.rotation.z = Math.PI + Math.PI / 4;
            rocker.position.set(side * 0.22, 0.1, 0);
            chair.add(rocker);
        }
        chair.position.set(x, y, z);
        chair.rotation.y = Math.PI;
        parent.add(chair);
    }

    _makePaintedSignTexture(text, bgColor) {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 192;
        const ctx = canvas.getContext('2d');
        const bg = new THREE.Color(bgColor);
        ctx.fillStyle =
            `rgb(${Math.round(bg.r * 255)}, ${Math.round(bg.g * 255)}, ${Math.round(bg.b * 255)})`;
        ctx.fillRect(0, 0, 512, 192);
        ctx.strokeStyle = 'rgba(245, 230, 200, 0.5)';
        ctx.lineWidth = 4;
        ctx.strokeRect(8, 8, 496, 176);
        ctx.fillStyle = '#F5E6B8';
        ctx.font = 'bold 72px "Georgia", serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        let fontSize = 72;
        ctx.font = `bold ${fontSize}px "Georgia", serif`;
        while (ctx.measureText(text).width > 460 && fontSize > 24) {
            fontSize -= 4;
            ctx.font = `bold ${fontSize}px "Georgia", serif`;
        }
        ctx.fillText(text, 256, 96);
        const tex = new THREE.CanvasTexture(canvas);
        tex.anisotropy = 4;
        tex.needsUpdate = true;
        return tex;
    }

    // ==========================================================
    //  Art gallery / general store cluster west of the Country Store
    // ==========================================================
    createArtGallery() {
        const gallery = new THREE.Group();
        gallery.userData = {
            name: 'Topanga Art Gallery',
            description: 'A small co-op gallery in a cedar-sided cottage.',
            isInteractable: true,
            type: 'building',
            interactionType: 'Browse'
        };

        const cedarMat = new THREE.MeshStandardMaterial({
            color: 0x8B6A47, roughness: 0.85
        });
        const trimMat = new THREE.MeshStandardMaterial({
            color: 0xDCCFA8, roughness: 0.75
        });
        const roofMat = new THREE.MeshStandardMaterial({
            color: 0x525046, roughness: 0.9
        });
        const glassMat = new THREE.MeshStandardMaterial({
            color: 0x7E8E97, roughness: 0.2, metalness: 0.3,
            transparent: true, opacity: 0.65
        });

        const W = 9, D = 7, H = 3.6;
        const body = new THREE.Mesh(
            new THREE.BoxGeometry(W, H, D), cedarMat
        );
        body.position.y = H / 2;
        body.castShadow = true;
        gallery.add(body);

        // Pitched roof
        const roof = new THREE.Mesh(
            new THREE.ConeGeometry(Math.hypot(W, D) * 0.6, 1.6, 4), roofMat
        );
        roof.rotation.y = Math.PI / 4;
        roof.position.y = H + 0.7;
        roof.scale.set(1, 1, D / W);
        gallery.add(roof);

        // Large display window (facing east toward the road)
        const displayWin = new THREE.Mesh(
            new THREE.BoxGeometry(0.1, 2.4, 4.5), glassMat
        );
        displayWin.position.set(W / 2 + 0.05, 1.5, 0);
        gallery.add(displayWin);

        const winTrim = new THREE.Mesh(
            new THREE.BoxGeometry(0.12, 0.12, 4.7), trimMat
        );
        winTrim.position.set(W / 2 + 0.06, 2.8, 0);
        gallery.add(winTrim);

        // Door
        const door = new THREE.Mesh(
            new THREE.BoxGeometry(0.1, 2.1, 1.0),
            new THREE.MeshStandardMaterial({ color: 0x4A2E1A, roughness: 0.8 })
        );
        door.position.set(W / 2 + 0.05, 1.05, -2.8);
        gallery.add(door);

        // Hand-painted sign
        const sign = new THREE.Mesh(
            new THREE.PlaneGeometry(3.5, 0.8),
            new THREE.MeshBasicMaterial({
                map: this._makePaintedSignTexture('Art Gallery', 0x3A2818),
                transparent: true
            })
        );
        sign.position.set(W / 2 + 0.08, 3.3, 0);
        sign.rotation.y = -Math.PI / 2;
        gallery.add(sign);

        // Position west of the Country Store, across the valley
        gallery.position.set(-22, this.localHeight(-22, 15), 15);
        gallery.rotation.y = 0.1;
        this.group.add(gallery);
    }

    // ==========================================================
    //  Theatricum Botanicum — outdoor amphitheatre
    // ==========================================================
    createTheatricumBotanicum() {
        const theatre = new THREE.Group();
        theatre.userData = {
            name: 'Theatricum Botanicum',
            description: 'Outdoor Shakespeare theatre founded 1973 by Will Geer.',
            isInteractable: true,
            type: 'landmark',
            interactionType: 'Explore'
        };

        const benchMat = new THREE.MeshStandardMaterial({
            color: 0x6B4E32, roughness: 0.87
        });
        const postMat = new THREE.MeshStandardMaterial({
            color: 0x2A1F12, roughness: 0.85
        });
        const stageMat = new THREE.MeshStandardMaterial({
            color: 0x7A5838, roughness: 0.82
        });

        // Round stage in the middle
        const stage = new THREE.Mesh(
            new THREE.CylinderGeometry(5, 5, 0.4, 24), stageMat
        );
        stage.position.y = 0.2;
        stage.receiveShadow = true;
        theatre.add(stage);

        // Stage backdrop (back wall, 3 panels)
        for (let i = -1; i <= 1; i++) {
            const panel = new THREE.Mesh(
                new THREE.BoxGeometry(3.5, 4.5, 0.2),
                new THREE.MeshStandardMaterial({
                    color: 0x7A3F2A, roughness: 0.85
                })
            );
            panel.position.set(i * 3.2, 2.25, -5);
            panel.rotation.y = -i * 0.18;
            panel.castShadow = true;
            theatre.add(panel);
        }

        // Tiered wooden bench seating, in an arc around the stage
        const tiers = 6;
        const tierDepth = 1.6;
        const tierRise = 0.35;
        for (let t = 0; t < tiers; t++) {
            const tierRadius = 8 + t * tierDepth;
            const tierY = 0.2 + t * tierRise;
            // Bench seat arc
            const benchGeo = new THREE.RingGeometry(
                tierRadius - 0.1, tierRadius + 0.35,
                32, 1, Math.PI * 0.15, Math.PI * 0.7
            );
            const bench = new THREE.Mesh(benchGeo, benchMat);
            bench.rotation.x = -Math.PI / 2;
            bench.position.y = tierY + 0.3;
            theatre.add(bench);

            // Riser (vertical board)
            const riser = new THREE.Mesh(
                new THREE.RingGeometry(
                    tierRadius - 0.05, tierRadius,
                    32, 1, Math.PI * 0.15, Math.PI * 0.7
                ),
                benchMat
            );
            riser.rotation.x = -Math.PI / 2;
            riser.position.y = tierY;
            theatre.add(riser);
        }

        // Posts between tiers to give structural feel
        for (let t = 0; t < tiers; t++) {
            const r = 8 + t * tierDepth;
            const angles = [Math.PI * 0.18, Math.PI * 0.42,
                            Math.PI * 0.66, Math.PI * 0.82];
            for (const a of angles) {
                const post = new THREE.Mesh(
                    new THREE.CylinderGeometry(0.08, 0.08, 0.6, 6), postMat
                );
                post.position.set(
                    Math.cos(a) * r,
                    0.2 + t * tierRise + 0.3,
                    Math.sin(a) * r
                );
                theatre.add(post);
            }
        }

        // Position: ~80 m north of the Country Store, off the main road
        const tx = 8, tz = -80;
        theatre.position.set(tx, this.localHeight(tx, tz), tz);
        // Orient stage so audience faces roughly NE (toward the road)
        theatre.rotation.y = Math.PI;
        this.group.add(theatre);

        // Entrance sign
        const sign = new THREE.Group();
        sign.userData = { name: 'Theatricum Botanicum', type: 'sign' };
        const post = new THREE.Mesh(
            new THREE.CylinderGeometry(0.08, 0.08, 2.4, 6), postMat
        );
        post.position.y = 1.2;
        sign.add(post);
        const board = new THREE.Mesh(
            new THREE.PlaneGeometry(2.2, 0.8),
            new THREE.MeshBasicMaterial({
                map: this._makePaintedSignTexture('Theatricum Botanicum', 0x2D3E1F),
                transparent: true, side: THREE.DoubleSide
            })
        );
        board.position.y = 2.2;
        sign.add(board);
        sign.position.set(tx + 12, this.localHeight(tx + 12, tz + 8), tz + 8);
        this.group.add(sign);
    }

    // ==========================================================
    //  Rustic cabins scattered on the lower slopes
    // ==========================================================
    createRusticCabins() {
        const cabinSpecs = [
            { x: 35, z: -35, rotY: -0.5, palette: 0 },
            { x: -38, z: -55, rotY: 0.4, palette: 1 },
            { x: 48, z: 45, rotY: -0.3, palette: 2 },
            { x: -50, z: 60, rotY: 0.25, palette: 0 },
            { x: 60, z: -110, rotY: -0.6, palette: 1 },
            { x: -68, z: -130, rotY: 0.5, palette: 2 },
            { x: 70, z: 130, rotY: -0.4, palette: 0 },
            { x: -55, z: 165, rotY: 0.3, palette: 1 }
        ];

        const palettes = [
            { body: 0x6E553A, roof: 0x3D3A32, trim: 0xC4A876 },  // cedar + dark shingle
            { body: 0x8B6F4F, roof: 0x4A4238, trim: 0xD4B88A },  // warm wood
            { body: 0x5A4C3A, roof: 0x2E2A24, trim: 0xA89070 }   // weathered grey-brown
        ];

        cabinSpecs.forEach((spec, idx) => {
            const p = palettes[spec.palette];
            const cabin = this._buildCabin(p);
            cabin.userData.name = `Canyon Cabin #${idx + 1}`;
            cabin.position.set(
                spec.x, this.localHeight(spec.x, spec.z), spec.z
            );
            cabin.rotation.y = spec.rotY;
            this.group.add(cabin);

            // Mailbox near the road side
            this._addMailbox(cabin.position.x, cabin.position.z, spec.rotY);
        });
    }

    _buildCabin(palette) {
        const bodyMat = new THREE.MeshStandardMaterial({
            color: palette.body, roughness: 0.88
        });
        const roofMat = new THREE.MeshStandardMaterial({
            color: palette.roof, roughness: 0.92
        });
        const trimMat = new THREE.MeshStandardMaterial({
            color: palette.trim, roughness: 0.8
        });
        const winMat = new THREE.MeshStandardMaterial({
            color: 0x6F8290, roughness: 0.2, metalness: 0.3,
            transparent: true, opacity: 0.7
        });

        const cabin = new THREE.Group();
        cabin.userData = { isInteractable: false, type: 'building' };

        const W = 6.5, D = 5, H = 3.2;
        const body = new THREE.Mesh(
            new THREE.BoxGeometry(W, H, D), bodyMat
        );
        body.position.y = H / 2;
        body.castShadow = true;
        body.receiveShadow = true;
        cabin.add(body);

        // Pitched A-frame-ish roof
        const roofH = 1.5;
        for (const side of [-1, 1]) {
            const roof = new THREE.Mesh(
                new THREE.BoxGeometry(W + 0.5, 0.12, D / 2 + 0.5), roofMat
            );
            roof.position.set(0, H + roofH / 2, side * (D / 4 + 0.1));
            roof.rotation.x = side * Math.atan2(roofH, D / 2);
            roof.castShadow = true;
            cabin.add(roof);
        }

        // Gables
        for (const face of [-1, 1]) {
            const shape = new THREE.Shape();
            shape.moveTo(-W / 2, 0);
            shape.lineTo(W / 2, 0);
            shape.lineTo(0, roofH);
            shape.lineTo(-W / 2, 0);
            const gable = new THREE.Mesh(
                new THREE.ShapeGeometry(shape), bodyMat
            );
            gable.position.set(0, H, face * D / 2);
            gable.rotation.y = face > 0 ? 0 : Math.PI;
            cabin.add(gable);
        }

        // Door + two windows (front = +Z)
        const door = new THREE.Mesh(
            new THREE.BoxGeometry(0.9, 2.0, 0.1),
            new THREE.MeshStandardMaterial({ color: 0x3A2818, roughness: 0.85 })
        );
        door.position.set(-W / 4, 1.0, D / 2 + 0.05);
        cabin.add(door);

        for (const wx of [W / 4, W / 2 - 1]) {
            const win = new THREE.Mesh(
                new THREE.BoxGeometry(0.9, 0.9, 0.08), winMat
            );
            win.position.set(wx, 1.8, D / 2 + 0.06);
            cabin.add(win);
            const winTrim = new THREE.Mesh(
                new THREE.BoxGeometry(1.0, 1.0, 0.1), trimMat
            );
            winTrim.position.set(wx, 1.8, D / 2 + 0.055);
            cabin.add(winTrim);
        }

        // Small porch step
        const step = new THREE.Mesh(
            new THREE.BoxGeometry(1.5, 0.2, 0.6), trimMat
        );
        step.position.set(-W / 4, 0.1, D / 2 + 0.4);
        cabin.add(step);

        // Chimney
        const chimney = new THREE.Mesh(
            new THREE.BoxGeometry(0.6, 1.8, 0.6),
            new THREE.MeshStandardMaterial({ color: 0x605A50, roughness: 0.9 })
        );
        chimney.position.set(W / 3, H + 1.1, 0);
        cabin.add(chimney);

        return cabin;
    }

    _addMailbox(cabinX, cabinZ, cabinRotY) {
        // Place mailbox at the roadside (always toward the road, +X side)
        const mailboxMat = new THREE.MeshStandardMaterial({
            color: 0x888880, roughness: 0.5, metalness: 0.5
        });
        const postMat = new THREE.MeshStandardMaterial({
            color: 0x4A3A28, roughness: 0.85
        });

        const mb = new THREE.Group();
        const post = new THREE.Mesh(
            new THREE.CylinderGeometry(0.06, 0.06, 1.1, 6), postMat
        );
        post.position.y = 0.55;
        mb.add(post);
        const box = new THREE.Mesh(
            new THREE.CylinderGeometry(0.18, 0.18, 0.45, 8,
                1, false, 0, Math.PI),
            mailboxMat
        );
        box.rotation.z = Math.PI / 2;
        box.position.y = 1.2;
        mb.add(box);
        const backPlate = new THREE.Mesh(
            new THREE.PlaneGeometry(0.36, 0.4),
            mailboxMat
        );
        backPlate.position.set(-0.22, 1.2, 0);
        backPlate.rotation.y = Math.PI / 2;
        mb.add(backPlate);

        // Position between cabin and road (ROAD_CENTER_X ≈ +10)
        const dxToRoad = (ROAD_CENTER_X - SHOULDER_HALF) - cabinX;
        const towardRoadX = cabinX + (Math.sign(dxToRoad) || 1) *
            Math.min(Math.abs(dxToRoad), 8);
        const mbZ = cabinZ + 3;
        mb.position.set(towardRoadX, this.localHeight(towardRoadX, mbZ), mbZ);
        this.group.add(mb);
    }

    // ==========================================================
    //  Coast live oak woodland on the lower slopes
    // ==========================================================
    createOakWoodland() {
        const trunkMat = new THREE.MeshStandardMaterial({
            color: 0x3A2A1E, roughness: 0.92
        });
        const leafMatPool = [
            new THREE.MeshStandardMaterial({
                color: new THREE.Color().setHSL(0.32, 0.55, 0.22), roughness: 0.85
            }),
            new THREE.MeshStandardMaterial({
                color: new THREE.Color().setHSL(0.34, 0.48, 0.25), roughness: 0.85
            }),
            new THREE.MeshStandardMaterial({
                color: new THREE.Color().setHSL(0.3, 0.5, 0.20), roughness: 0.85
            })
        ];

        // Dense oak scatter on both sides of the canyon
        const count = 75;
        for (let i = 0; i < count; i++) {
            // Pick a slope position (positive or negative x)
            const side = Math.random() > 0.5 ? 1 : -1;
            const slopeR = 35 + Math.random() * 85; // 35-120 from center
            const x = side * slopeR;
            const z = -200 + Math.random() * 400;
            // Skip spots near the road, buildings, or creek
            if (this._nearBuilding(x, z) || this._onRoad(x, z)) continue;
            const tree = this._buildOak(trunkMat, leafMatPool[i % 3]);
            tree.position.set(x, this.localHeight(x, z), z);
            tree.scale.setScalar(0.75 + Math.random() * 0.55);
            tree.rotation.y = Math.random() * Math.PI * 2;
            this.group.add(tree);
        }

        // A few "specimen" oaks on the valley floor itself — Topanga
        // is famous for its sheltering oaks at the roadside.
        for (let i = 0; i < 10; i++) {
            const x = -20 + Math.random() * 40;
            const z = -200 + Math.random() * 400;
            if (this._nearBuilding(x, z) || this._onRoad(x, z)) continue;
            if (Math.abs(x - CREEK_X) < 6) continue;
            const tree = this._buildOak(trunkMat, leafMatPool[i % 3]);
            tree.position.set(x, this.localHeight(x, z), z);
            tree.scale.setScalar(0.9 + Math.random() * 0.4);
            this.group.add(tree);
        }
    }

    _buildOak(trunkMat, leafMat) {
        const tree = new THREE.Group();
        const h = 7 + Math.random() * 4;  // 7-11 m
        const trunk = new THREE.Mesh(
            new THREE.CylinderGeometry(0.35, 0.55, h * 0.55, 7), trunkMat
        );
        trunk.position.y = h * 0.55 / 2;
        trunk.rotation.z = (Math.random() - 0.5) * 0.25; // Oak lean
        trunk.castShadow = true;
        tree.add(trunk);

        // Several overlapping crowns — coast live oaks have dense,
        // wide, rounded silhouettes.
        const crownY = h * 0.55;
        const clumpCount = 3 + Math.floor(Math.random() * 3);
        for (let i = 0; i < clumpCount; i++) {
            const r = 2.2 + Math.random() * 1.6;
            const clump = new THREE.Mesh(
                new THREE.SphereGeometry(r, 8, 6), leafMat
            );
            clump.position.set(
                (Math.random() - 0.5) * 2.2,
                crownY + i * 0.6 + Math.random() * 0.5,
                (Math.random() - 0.5) * 2.2
            );
            clump.scale.y = 0.7 + Math.random() * 0.3;
            clump.castShadow = true;
            tree.add(clump);
        }

        // A couple of exposed branches
        for (let b = 0; b < 2; b++) {
            const branch = new THREE.Mesh(
                new THREE.CylinderGeometry(0.08, 0.15,
                    1.5 + Math.random() * 1.5, 5),
                trunkMat
            );
            branch.position.y = crownY * (0.7 + Math.random() * 0.3);
            branch.rotation.z = Math.PI / 2 + (Math.random() - 0.5) * 0.6;
            branch.rotation.y = Math.random() * Math.PI * 2;
            branch.position.x = Math.cos(branch.rotation.y) * 0.8;
            branch.position.z = Math.sin(branch.rotation.y) * 0.8;
            tree.add(branch);
        }
        return tree;
    }

    // ==========================================================
    //  California sycamore along the creek
    // ==========================================================
    createSycamoreRiparian() {
        const trunkMat = new THREE.MeshStandardMaterial({
            color: 0xD6CDB4, roughness: 0.78  // Pale mottled bark
        });
        const trunkDarkMat = new THREE.MeshStandardMaterial({
            color: 0x9E8F6E, roughness: 0.84
        });
        const leafMat = new THREE.MeshStandardMaterial({
            color: new THREE.Color().setHSL(0.25, 0.45, 0.42), roughness: 0.8
        });

        // Sycamores along the creek — taller, crooked, creek-hugging
        const count = 18;
        for (let i = 0; i < count; i++) {
            const z = -350 + i * (700 / count) + (Math.random() - 0.5) * 20;
            const meander = CREEK_X + Math.sin(z * 0.018) * 2.5;
            // Stagger on either bank
            const bankSide = (i % 2 === 0) ? 1 : -1;
            const x = meander + bankSide * (2.5 + Math.random() * 2.5);
            if (this._onRoad(x, z)) continue;

            const tree = this._buildSycamore(
                Math.random() > 0.5 ? trunkMat : trunkDarkMat, leafMat
            );
            tree.position.set(x, this.localHeight(x, z), z);
            tree.scale.setScalar(0.85 + Math.random() * 0.5);
            tree.rotation.y = Math.random() * Math.PI * 2;
            this.group.add(tree);
        }
    }

    _buildSycamore(trunkMat, leafMat) {
        const tree = new THREE.Group();
        const h = 14 + Math.random() * 6;  // 14-20 m
        // Main trunk — crooked, with a noticeable bend
        const trunkSegs = 3;
        let py = 0;
        for (let s = 0; s < trunkSegs; s++) {
            const segH = h * 0.35 / trunkSegs * 2;
            const r0 = 0.6 * (1 - s / trunkSegs * 0.5);
            const r1 = 0.55 * (1 - (s + 1) / trunkSegs * 0.5);
            const seg = new THREE.Mesh(
                new THREE.CylinderGeometry(r1, r0, segH, 7), trunkMat
            );
            seg.position.y = py + segH / 2;
            seg.rotation.z = (Math.random() - 0.5) * 0.4; // Crooked
            seg.castShadow = true;
            tree.add(seg);
            py += segH;
        }

        // Several branching limbs spreading outward
        for (let b = 0; b < 4; b++) {
            const limbLen = 3 + Math.random() * 2;
            const limb = new THREE.Mesh(
                new THREE.CylinderGeometry(0.15, 0.35, limbLen, 6), trunkMat
            );
            limb.position.y = py;
            limb.rotation.z = (Math.PI / 3) + (Math.random() - 0.5) * 0.6;
            limb.rotation.y = b * (Math.PI / 2) + Math.random() * 0.4;
            limb.position.x = Math.cos(limb.rotation.y) * 0.6;
            limb.position.z = Math.sin(limb.rotation.y) * 0.6;
            tree.add(limb);
        }

        // Sparse, upper-canopy leaf clusters
        const crownCount = 5 + Math.floor(Math.random() * 3);
        for (let c = 0; c < crownCount; c++) {
            const angle = Math.random() * Math.PI * 2;
            const spread = 3 + Math.random() * 2;
            const clump = new THREE.Mesh(
                new THREE.SphereGeometry(2.4 + Math.random() * 0.9, 8, 6),
                leafMat
            );
            clump.position.set(
                Math.cos(angle) * spread,
                py + Math.random() * 3,
                Math.sin(angle) * spread
            );
            clump.scale.y = 0.7;
            clump.castShadow = true;
            tree.add(clump);
        }
        return tree;
    }

    // ==========================================================
    //  Chaparral on the upper slopes
    // ==========================================================
    createChaparralShrubs() {
        const shrubMats = [
            new THREE.MeshStandardMaterial({
                color: 0x6E7B52, roughness: 0.9
            }), // ceanothus / dusty green
            new THREE.MeshStandardMaterial({
                color: 0x8A8358, roughness: 0.9
            }), // chamise / yellow-green
            new THREE.MeshStandardMaterial({
                color: 0x5E6A42, roughness: 0.9
            }), // sage / grey-green
        ];

        // Dense scatter on upper slopes
        const count = 180;
        for (let i = 0; i < count; i++) {
            const side = Math.random() > 0.5 ? 1 : -1;
            const slopeR = 110 + Math.random() * 240; // 110-350 from center
            const x = side * slopeR;
            const z = -380 + Math.random() * 760;
            if (Math.abs(z) > this.worldSize / 2 - 10) continue;

            const shrub = new THREE.Mesh(
                new THREE.SphereGeometry(
                    0.6 + Math.random() * 0.7, 6, 5
                ),
                shrubMats[i % 3]
            );
            shrub.scale.y = 0.55 + Math.random() * 0.2;
            shrub.position.set(x, this.localHeight(x, z) + 0.35, z);
            shrub.rotation.y = Math.random() * Math.PI * 2;
            this.group.add(shrub);
        }

        // A few small rock outcrops on upper slopes
        const rockMat = new THREE.MeshStandardMaterial({
            color: 0x7A6E5A, roughness: 0.95, flatShading: true
        });
        for (let i = 0; i < 22; i++) {
            const side = Math.random() > 0.5 ? 1 : -1;
            const x = side * (150 + Math.random() * 200);
            const z = -380 + Math.random() * 760;
            const rock = new THREE.Mesh(
                new THREE.DodecahedronGeometry(
                    0.8 + Math.random() * 2.2, 0
                ),
                rockMat
            );
            rock.position.set(x, this.localHeight(x, z) - 0.2, z);
            rock.rotation.set(Math.random(), Math.random(), Math.random());
            rock.castShadow = true;
            this.group.add(rock);
        }
    }

    // ==========================================================
    //  Roadside furniture: guard rails, roadside boulders, signs
    // ==========================================================
    createRoadsideFeatures() {
        const railPostMat = new THREE.MeshStandardMaterial({
            color: 0x4F453A, roughness: 0.8, metalness: 0.15
        });
        const railMat = new THREE.MeshStandardMaterial({
            color: 0x7A756E, roughness: 0.5, metalness: 0.5
        });

        // Metal guard rail on the creek-facing (west) side of the road,
        // where the road runs closest to the creek.
        for (let z = -350; z < 350; z += 30) {
            const xOff = Math.sin(z * 0.008) * 2.5 + Math.sin(z * 0.02) * 0.8;
            const railX = ROAD_CENTER_X + xOff - ROAD_HALF_WIDTH - 0.6;

            // Skip segments where the road is far enough from creek
            if (Math.abs(xOff) < 1.5) continue;

            // Post
            const post = new THREE.Mesh(
                new THREE.BoxGeometry(0.12, 0.9, 0.12), railPostMat
            );
            post.position.set(railX, this.localHeight(railX, z) + 0.45, z);
            this.group.add(post);
        }
        // Continuous rail (run it as a thin beam)
        const railBeam = new THREE.Mesh(
            new THREE.BoxGeometry(0.2, 0.25, 700), railMat
        );
        railBeam.position.set(ROAD_CENTER_X - ROAD_HALF_WIDTH - 0.6, 0.7, 0);
        this.group.add(railBeam);

        // A couple of large roadside boulders (uplifted by ancient fill)
        const bigRockMat = new THREE.MeshStandardMaterial({
            color: 0x7C7066, roughness: 0.94, flatShading: true
        });
        const boulderSpots = [
            { x: 20, z: -40 }, { x: 22, z: 90 },
            { x: -28, z: -155 }, { x: 26, z: 200 }
        ];
        for (const b of boulderSpots) {
            const boulder = new THREE.Mesh(
                new THREE.IcosahedronGeometry(1.6 + Math.random() * 0.8, 0),
                bigRockMat
            );
            boulder.position.set(b.x, this.localHeight(b.x, b.z) + 0.5, b.z);
            boulder.rotation.set(Math.random(), Math.random(), Math.random());
            boulder.scale.y = 0.8;
            boulder.castShadow = true;
            this.group.add(boulder);
        }
    }

    // ==========================================================
    //  Signage — highway sign + a few place markers
    // ==========================================================
    createSignage() {
        // California highway shield for CA-27 Topanga Canyon Blvd
        const shield = new THREE.Group();
        shield.userData = {
            name: 'CA-27 Topanga Canyon Blvd',
            type: 'sign'
        };
        const postMat = new THREE.MeshStandardMaterial({
            color: 0x2A2A2A, roughness: 0.5, metalness: 0.5
        });
        const post = new THREE.Mesh(
            new THREE.CylinderGeometry(0.07, 0.07, 2.8, 6), postMat
        );
        post.position.y = 1.4;
        shield.add(post);

        // Shield plate (rounded square)
        const plate = new THREE.Mesh(
            new THREE.BoxGeometry(0.9, 0.9, 0.06),
            new THREE.MeshBasicMaterial({
                map: this._makeHighwayShieldTexture('CA 27'),
                transparent: true
            })
        );
        plate.position.y = 2.5;
        shield.add(plate);

        shield.position.set(17, this.localHeight(17, -8), -8);
        this.group.add(shield);

        // "Welcome to Topanga" style sign
        const welcome = new THREE.Group();
        welcome.userData = {
            name: 'Welcome to Topanga',
            type: 'sign'
        };
        const wPost = new THREE.Mesh(
            new THREE.CylinderGeometry(0.09, 0.09, 2.3, 6), postMat
        );
        wPost.position.y = 1.15;
        welcome.add(wPost);
        const wBoard = new THREE.Mesh(
            new THREE.BoxGeometry(2.8, 0.9, 0.08),
            new THREE.MeshStandardMaterial({
                color: 0x3A2A1A, roughness: 0.85
            })
        );
        wBoard.position.y = 2.1;
        welcome.add(wBoard);
        const wText = new THREE.Mesh(
            new THREE.PlaneGeometry(2.7, 0.82),
            new THREE.MeshBasicMaterial({
                map: this._makePaintedSignTexture('Topanga', 0x3A2A1A),
                transparent: true, side: THREE.DoubleSide
            })
        );
        wText.position.set(0, 2.1, 0.05);
        welcome.add(wText);
        const wTextBack = wText.clone();
        wTextBack.position.z = -0.05;
        wTextBack.rotation.y = Math.PI;
        welcome.add(wTextBack);

        welcome.position.set(-2, this.localHeight(-2, 200), 200);
        welcome.rotation.y = Math.PI;
        this.group.add(welcome);
    }

    _makeHighwayShieldTexture(text) {
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 256;
        const ctx = canvas.getContext('2d');
        // CA highway spade shape — white fill, black border
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.moveTo(128, 10);
        ctx.lineTo(240, 80);
        ctx.lineTo(220, 200);
        ctx.quadraticCurveTo(128, 260, 36, 200);
        ctx.lineTo(16, 80);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 6;
        ctx.stroke();
        // Text
        ctx.fillStyle = '#000000';
        ctx.font = 'bold 80px "Helvetica", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, 128, 140);
        const tex = new THREE.CanvasTexture(canvas);
        tex.anisotropy = 4;
        tex.needsUpdate = true;
        return tex;
    }

    // ==========================================================
    //  Helpers
    // ==========================================================
    _nearBuilding(x, z) {
        // Country Store footprint
        if (Math.abs(x) < 8 && Math.abs(z) < 8) return true;
        // Art Gallery
        if (Math.abs(x + 22) < 6 && Math.abs(z - 15) < 5) return true;
        // Theatricum Botanicum
        if (Math.abs(x - 8) < 16 && Math.abs(z + 80) < 16) return true;
        // Cabin footprints
        const cabins = [
            [35, -35], [-38, -55], [48, 45], [-50, 60],
            [60, -110], [-68, -130], [70, 130], [-55, 165]
        ];
        for (const [cx, cz] of cabins) {
            if (Math.abs(x - cx) < 5 && Math.abs(z - cz) < 4) return true;
        }
        return false;
    }

    _onRoad(x, z) {
        // Road corridor — any x near the road center through canyon
        const xOff = Math.sin(z * 0.008) * 2.5 + Math.sin(z * 0.02) * 0.8;
        return Math.abs(x - (ROAD_CENTER_X + xOff)) < SHOULDER_HALF + 1;
    }

    getInteractables() {
        const out = [];
        this.group.traverse(obj => {
            if (obj.userData && obj.userData.isInteractable) out.push(obj);
        });
        return out;
    }
}
