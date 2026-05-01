/**
 * Sedona - Red Rock Crossing
 *
 * Origin (0, 0, 0 local) = Oak Creek at Red Rock Crossing,
 * real GPS 34.8244629, -111.8062666, elevation 3,950 ft.
 *
 * Coordinate conventions:
 *   -Z is north along Oak Creek
 *   +Z is south toward Cathedral Rock
 *   +X is east toward the red-rock buttes
 *
 * Devil's Kitchen and Birthing Cave are compressed into the north/northwest
 * of this same tile so the Sedona route can start at Soldier Pass and still
 * keep the original Oak Creek/Cathedral Rock scene reachable on foot.
 * See refs/topography.md for the real-world anchors.
 */
import * as THREE from 'three';

const CREEK_X = -38;
const CREEK_W = 14;
const CROSSING_Z = 0;
const TRAIL_W = 4;
const DEVILS_KITCHEN = { x: 56, z: -320 };
const BIRTHING_CAVE = { x: -345, z: -470 };

export class RedRockCrossing {
    constructor(locationGroup, terrainHeightFn = null) {
        this.group = locationGroup;
        this.worldSize = 1200;
        this.terrainResolution = 220;
        this.regionalTerrainFn = terrainHeightFn;
        this._waterMeshes = [];
        this._time = 0;
    }

    setTerrainFunction(fn) { this.regionalTerrainFn = fn; }

    async generate() {
        this.createMaterials();
        this.createTerrain();
        this.createCreek();
        this.createTrails();
        this.createDevilsKitchen();
        this.createBirthingCaveTrail();
        this.createCathedralRock();
        this.createCrossing();
        this.createCottonwoods();
        this.createJunipers();
        this.createDesertShrubs();
        this.createOverlooks();
        this.createSignage();
    }

    createMaterials() {
        this.mat = {
            water: new THREE.MeshStandardMaterial({
                color: 0x2F6E79, roughness: 0.18, metalness: 0.15,
                transparent: true, opacity: 0.82
            }),
            wetSand: new THREE.MeshStandardMaterial({ color: 0x8D6B4A, roughness: 0.96 }),
            sandstone: new THREE.MeshStandardMaterial({ color: 0xB5482F, roughness: 0.92 }),
            sandstoneDark: new THREE.MeshStandardMaterial({ color: 0x7A2F25, roughness: 0.94 }),
            caprock: new THREE.MeshStandardMaterial({ color: 0x4A332B, roughness: 0.98 }),
            trail: new THREE.MeshStandardMaterial({ color: 0xB98255, roughness: 0.95 }),
            bridgeWood: new THREE.MeshStandardMaterial({ color: 0x654733, roughness: 0.88 }),
            bark: new THREE.MeshStandardMaterial({ color: 0x6D5540, roughness: 0.9 }),
            cottonwood: new THREE.MeshStandardMaterial({ color: 0x6E8A43, roughness: 0.82 }),
            juniper: new THREE.MeshStandardMaterial({ color: 0x3F5D3A, roughness: 0.86 }),
            shrub: new THREE.MeshStandardMaterial({ color: 0x6C6B38, roughness: 0.9 }),
            sign: new THREE.MeshStandardMaterial({ color: 0xE6C179, roughness: 0.75 }),
            dark: new THREE.MeshStandardMaterial({ color: 0x2E211A, roughness: 0.8 }),
            caveShadow: new THREE.MeshStandardMaterial({ color: 0x1C1512, roughness: 1.0 }),
            paleSandstone: new THREE.MeshStandardMaterial({ color: 0xC96A42, roughness: 0.9 })
        };
    }

    localHeight(x, z) {
        let h = 0;

        // Gentle eastward rise from the creek toward the buttes.
        h += Math.max(0, x + 40) * 0.035;
        h += Math.max(0, Math.abs(z) - 160) * 0.025;

        // Oak Creek channel, meandering north-south.
        const creekCenter = CREEK_X + Math.sin(z * 0.018) * 7 + Math.sin(z * 0.043) * 2;
        const creekDist = Math.abs(x - creekCenter);
        if (creekDist < 34) {
            const t = 1 - creekDist / 34;
            h -= 7 * t * t;
        }

        // Cathedral Rock apron and sandstone shelves to the east/southeast.
        h += this.bump(x, z, 180, 110, 180, 110, 18);
        h += this.bump(x, z, 260, 140, 120, 90, 28);
        h += this.bump(x, z, 300, 0, 170, 160, 14);

        // Soldier Pass upland around Devil's Kitchen.
        h += this.bump(x, z, DEVILS_KITCHEN.x, DEVILS_KITCHEN.z, 260, 190, 18);
        const sinkDist = Math.hypot(x - DEVILS_KITCHEN.x, z - DEVILS_KITCHEN.z);
        if (sinkDist < 58) {
            const t = 1 - sinkDist / 58;
            h -= 28 * t * t;
        }

        // Long Canyon / Birthing Cave branch climbs northwest.
        const caveClimb = this.bump(x, z, BIRTHING_CAVE.x, BIRTHING_CAVE.z, 150, 115, 36);
        h += caveClimb;

        // Trail and crossing are kept walkably smooth.
        if (Math.abs(z - CROSSING_Z) < 16 && x > -115 && x < 35) {
            h = Math.min(h, 1.2);
        }
        const trailDist = Math.abs((x * 0.35) - (z + 18));
        if (trailDist < 10 && x > -80 && x < 230) {
            h = h * 0.65 + 1.0 * 0.35;
        }
        const soldierPassTrail = this.distanceToSegment(
            x, z,
            DEVILS_KITCHEN.x + 28, DEVILS_KITCHEN.z + 24,
            -70, -350
        );
        const longCanyonTrail = this.distanceToSegment(
            x, z,
            -70, -350,
            BIRTHING_CAVE.x + 32, BIRTHING_CAVE.z + 46
        );
        if ((soldierPassTrail < 10 || longCanyonTrail < 10) && z < -250) {
            h = h * 0.7 + 7.0 * 0.3;
        }

        h += Math.sin(x * 0.045 + z * 0.025) * 0.45;
        h += Math.sin(x * 0.12 - z * 0.07) * 0.18;
        return h;
    }

    bump(x, z, cx, cz, rx, rz, height) {
        const dx = (x - cx) / rx;
        const dz = (z - cz) / rz;
        return Math.exp(-(dx * dx + dz * dz)) * height;
    }

    distanceToSegment(x, z, x0, z0, x1, z1) {
        const dx = x1 - x0;
        const dz = z1 - z0;
        const lenSq = dx * dx + dz * dz;
        if (lenSq === 0) return Math.hypot(x - x0, z - z0);
        const t = Math.max(0, Math.min(1, ((x - x0) * dx + (z - z0) * dz) / lenSq));
        return Math.hypot(x - (x0 + dx * t), z - (z0 + dz * t));
    }

    getTerrainHeight(x, z) {
        const half = this.worldSize / 2;
        const margin = 70;
        const absX = Math.abs(x), absZ = Math.abs(z);
        if (absX < half - margin && absZ < half - margin) {
            return this.localHeight(x, z);
        }
        if (this.regionalTerrainFn) {
            if (absX < half && absZ < half) {
                const edgeDist = Math.min(half - absX, half - absZ);
                const t = Math.max(0, Math.min(1, edgeDist / margin));
                return this.localHeight(x, z) * t + this.regionalTerrainFn(x, z) * (1 - t);
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
            const x = pos.getX(i);
            const z = -pos.getY(i);
            const h = this.localHeight(x, z);
            pos.setZ(i, h);

            const creekCenter = CREEK_X + Math.sin(z * 0.018) * 7;
            const creekDist = Math.abs(x - creekCenter);
            let r, g, b;
            if (creekDist < CREEK_W + 3 && h < -2.5) {
                r = 0.43; g = 0.37; b = 0.28;
            } else if (creekDist < 42) {
                r = 0.46; g = 0.48; b = 0.30;
            } else if (h > 22) {
                r = 0.62; g = 0.24; b = 0.16;
            } else if (h > 9) {
                r = 0.76; g = 0.38; b = 0.22;
            } else {
                r = 0.70; g = 0.47; b = 0.30;
            }
            const n = (Math.random() - 0.5) * 0.08;
            colors[i * 3] = Math.max(0, Math.min(1, r + n));
            colors[i * 3 + 1] = Math.max(0, Math.min(1, g + n));
            colors[i * 3 + 2] = Math.max(0, Math.min(1, b + n));
        }

        geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geo.computeVertexNormals();

        const terrain = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
            vertexColors: true, roughness: 0.95, metalness: 0
        }));
        terrain.rotation.x = -Math.PI / 2;
        terrain.receiveShadow = true;
        terrain.userData.noCollision = true;
        this.group.add(terrain);
    }

    createCreek() {
        const segments = 70;
        const zMin = -430, zMax = 430;
        for (let i = 0; i < segments; i++) {
            const z0 = zMin + (zMax - zMin) * (i / segments);
            const z1 = zMin + (zMax - zMin) * ((i + 1) / segments);
            const x0 = CREEK_X + Math.sin(z0 * 0.018) * 7 + Math.sin(z0 * 0.043) * 2;
            const x1 = CREEK_X + Math.sin(z1 * 0.018) * 7 + Math.sin(z1 * 0.043) * 2;
            const cx = (x0 + x1) / 2;
            const cz = (z0 + z1) / 2;
            const dx = x1 - x0;
            const dz = z1 - z0;
            const len = Math.sqrt(dx * dx + dz * dz);
            const water = new THREE.Mesh(new THREE.PlaneGeometry(CREEK_W, len + 0.3), this.mat.water);
            water.rotation.x = -Math.PI / 2;
            water.rotation.z = Math.atan2(dx, dz);
            water.position.set(cx, this.localHeight(cx, cz) + 0.35, cz);
            water.userData.noCollision = true;
            water.userData.baseY = water.position.y;
            this.group.add(water);
            this._waterMeshes.push(water);
        }
    }

    createTrails() {
        this.addTrailSegment(-120, 0, 140, 0, TRAIL_W);
        this.addTrailSegment(-10, 0, 220, 135, TRAIL_W);
        this.addTrailSegment(40, -50, 260, -145, TRAIL_W * 0.8);
        this.addTrailSegment(84, -296, -70, -350, TRAIL_W);
    }

    addTrailSegment(x0, z0, x1, z1, width) {
        const dx = x1 - x0;
        const dz = z1 - z0;
        const len = Math.sqrt(dx * dx + dz * dz);
        const cx = (x0 + x1) / 2;
        const cz = (z0 + z1) / 2;
        const trail = new THREE.Mesh(new THREE.PlaneGeometry(width, len), this.mat.trail);
        trail.rotation.x = -Math.PI / 2;
        trail.rotation.z = Math.atan2(dx, dz);
        trail.position.set(cx, this.localHeight(cx, cz) + 0.08, cz);
        trail.userData.noCollision = true;
        this.group.add(trail);
    }

    createDevilsKitchen() {
        const rimY = this.localHeight(DEVILS_KITCHEN.x, DEVILS_KITCHEN.z);
        const sinkhole = new THREE.Group();
        sinkhole.position.set(DEVILS_KITCHEN.x, rimY, DEVILS_KITCHEN.z);
        sinkhole.userData = {
            name: "Devil's Kitchen Sinkhole",
            description: 'Soldier Pass sinkhole, modeled from the 4,510 ft rim and compressed into the Sedona tile.',
            isInteractable: true,
            type: 'landmark',
            interactionType: 'Inspect'
        };

        const shadow = new THREE.Mesh(
            new THREE.CylinderGeometry(23, 33, 4, 40),
            this.mat.caveShadow
        );
        shadow.position.y = -11;
        shadow.scale.y = 0.15;
        shadow.receiveShadow = true;
        sinkhole.add(shadow);

        const rim = new THREE.Mesh(
            new THREE.TorusGeometry(38, 2.2, 8, 56),
            this.mat.sandstoneDark
        );
        rim.rotation.x = Math.PI / 2;
        rim.position.y = 0.25;
        rim.castShadow = true;
        sinkhole.add(rim);

        for (let i = 0; i < 22; i++) {
            const a = (i / 22) * Math.PI * 2;
            const r = 32 + Math.random() * 18;
            const rock = new THREE.Mesh(
                new THREE.DodecahedronGeometry(1.2 + Math.random() * 2.2, 0),
                i % 3 === 0 ? this.mat.caprock : this.mat.sandstoneDark
            );
            rock.position.set(Math.cos(a) * r, 0.5, Math.sin(a) * r);
            rock.scale.y = 0.55 + Math.random() * 0.45;
            rock.castShadow = true;
            sinkhole.add(rock);
        }

        this.group.add(sinkhole);
    }

    createBirthingCaveTrail() {
        const trailPoints = [
            [DEVILS_KITCHEN.x + 28, DEVILS_KITCHEN.z + 24],
            [-70, -350],
            [-190, -395],
            [BIRTHING_CAVE.x + 32, BIRTHING_CAVE.z + 46]
        ];
        for (let i = 0; i < trailPoints.length - 1; i++) {
            const [x0, z0] = trailPoints[i];
            const [x1, z1] = trailPoints[i + 1];
            this.addTrailSegment(x0, z0, x1, z1, TRAIL_W * (i === 2 ? 0.75 : 0.95));
        }

        // Small switchback climb into the alcove.
        this.addTrailSegment(-313, -424, -340, -452, TRAIL_W * 0.7);

        const cave = new THREE.Group();
        cave.position.set(BIRTHING_CAVE.x, this.localHeight(BIRTHING_CAVE.x, BIRTHING_CAVE.z), BIRTHING_CAVE.z);
        cave.rotation.y = -0.45;
        cave.userData = {
            name: 'Birthing Cave',
            description: 'A shallow red sandstone alcove above Long Canyon, reached by a short side trail.',
            isInteractable: true,
            type: 'landmark',
            interactionType: 'Enter'
        };

        const backWall = new THREE.Mesh(
            new THREE.CylinderGeometry(46, 58, 24, 28, 1, true, Math.PI * 0.08, Math.PI * 0.84),
            this.mat.paleSandstone
        );
        backWall.rotation.z = Math.PI / 2;
        backWall.position.set(0, 18, 0);
        backWall.scale.z = 0.55;
        backWall.castShadow = true;
        backWall.receiveShadow = true;
        cave.add(backWall);

        const mouth = new THREE.Mesh(
            new THREE.PlaneGeometry(48, 22),
            this.mat.caveShadow
        );
        mouth.position.set(0, 15, -5.4);
        mouth.rotation.y = Math.PI;
        cave.add(mouth);

        const floor = new THREE.Mesh(
            new THREE.CylinderGeometry(34, 44, 2, 28, 1, false, Math.PI * 0.1, Math.PI * 0.8),
            this.mat.sandstone
        );
        floor.rotation.z = Math.PI / 2;
        floor.position.set(0, 2.5, 4);
        floor.scale.z = 0.55;
        floor.receiveShadow = true;
        cave.add(floor);

        for (let i = 0; i < 10; i++) {
            const step = new THREE.Mesh(
                new THREE.BoxGeometry(8 - i * 0.35, 0.7, 2.8),
                this.mat.sandstoneDark
            );
            step.position.set(-25 + i * 5.5, 0.35 + i * 0.45, 22 - i * 2.6);
            step.rotation.y = -0.2;
            step.receiveShadow = true;
            cave.add(step);
        }

        this.group.add(cave);
    }

    createCathedralRock() {
        const base = new THREE.Group();
        base.position.set(238, this.localHeight(238, 95), 95);
        base.userData = {
            name: 'Cathedral Rock',
            description: 'Red sandstone spires above Oak Creek, compressed from the real summit east of Red Rock Crossing.',
            isInteractable: true,
            type: 'landmark',
            interactionType: 'Observe'
        };

        const spires = [
            { x: -38, z: 10, r: 24, h: 118 },
            { x: 0, z: -12, r: 30, h: 152 },
            { x: 36, z: 8, r: 22, h: 128 },
            { x: 72, z: 28, r: 17, h: 84 }
        ];
        for (const s of spires) {
            const spire = new THREE.Mesh(
                new THREE.CylinderGeometry(s.r * 0.42, s.r, s.h, 7),
                this.mat.sandstone
            );
            spire.position.set(s.x, s.h / 2, s.z);
            spire.rotation.y = s.x * 0.04;
            spire.castShadow = true;
            spire.receiveShadow = true;
            base.add(spire);

            const cap = new THREE.Mesh(
                new THREE.CylinderGeometry(s.r * 0.46, s.r * 0.5, 5, 7),
                this.mat.caprock
            );
            cap.position.set(s.x, s.h + 2.5, s.z);
            cap.castShadow = true;
            base.add(cap);
        }

        const shelf = new THREE.Mesh(
            new THREE.BoxGeometry(170, 16, 76),
            this.mat.sandstoneDark
        );
        shelf.position.set(12, 12, 12);
        shelf.rotation.y = -0.12;
        shelf.castShadow = true;
        shelf.receiveShadow = true;
        base.add(shelf);
        this.group.add(base);
    }

    createCrossing() {
        const deck = new THREE.Mesh(new THREE.BoxGeometry(86, 1.2, 5.5), this.mat.bridgeWood);
        deck.position.set(-40, this.localHeight(-40, CROSSING_Z) + 1.0, CROSSING_Z);
        deck.castShadow = true;
        deck.receiveShadow = true;
        deck.userData = {
            name: 'Red Rock Crossing',
            description: 'A shallow Oak Creek crossing with the classic Cathedral Rock view.',
            isInteractable: true,
            type: 'landmark',
            interactionType: 'Cross'
        };
        this.group.add(deck);

        for (let i = 0; i < 9; i++) {
            const x = -78 + i * 9.5;
            const stone = new THREE.Mesh(
                new THREE.DodecahedronGeometry(2.2 + (i % 3) * 0.35, 0),
                this.mat.wetSand
            );
            stone.position.set(x, this.localHeight(x, 8) + 0.25, 8 + Math.sin(i) * 1.7);
            stone.scale.y = 0.35;
            stone.castShadow = true;
            this.group.add(stone);
        }
    }

    createCottonwoods() {
        const positions = [];
        for (let i = 0; i < 42; i++) {
            const z = -390 + Math.random() * 780;
            const x = CREEK_X + Math.sin(z * 0.018) * 7 + (Math.random() - 0.5) * 70;
            if (Math.abs(z) < 24 && x > -90 && x < 0) continue;
            positions.push({ x, z, s: 0.8 + Math.random() * 0.7 });
        }
        for (const p of positions) this.addTree(p.x, p.z, p.s, true);
    }

    createJunipers() {
        for (let i = 0; i < 70; i++) {
            const x = 20 + Math.random() * 360;
            const z = -380 + Math.random() * 760;
            if (x > 170 && z > 20 && z < 190) continue;
            this.addTree(x, z, 0.55 + Math.random() * 0.55, false);
        }
    }

    addTree(x, z, scale, cottonwood) {
        const y = this.localHeight(x, z);
        const trunk = new THREE.Mesh(
            new THREE.CylinderGeometry(0.45 * scale, 0.7 * scale, 7 * scale, 7),
            this.mat.bark
        );
        trunk.position.set(x, y + 3.5 * scale, z);
        trunk.castShadow = true;
        this.group.add(trunk);

        const crown = new THREE.Mesh(
            cottonwood
                ? new THREE.SphereGeometry(4.8 * scale, 8, 6)
                : new THREE.ConeGeometry(4.0 * scale, 8.5 * scale, 7),
            cottonwood ? this.mat.cottonwood : this.mat.juniper
        );
        crown.position.set(x, y + (cottonwood ? 8.2 : 7.2) * scale, z);
        crown.castShadow = true;
        this.group.add(crown);
    }

    createDesertShrubs() {
        for (let i = 0; i < 140; i++) {
            const x = -180 + Math.random() * 570;
            const z = -410 + Math.random() * 820;
            if (Math.abs(x - CREEK_X) < 35) continue;
            const shrub = new THREE.Mesh(
                new THREE.SphereGeometry(1.1 + Math.random() * 1.4, 6, 4),
                this.mat.shrub
            );
            shrub.scale.y = 0.45;
            shrub.position.set(x, this.localHeight(x, z) + 0.55, z);
            shrub.castShadow = true;
            this.group.add(shrub);
        }
    }

    createOverlooks() {
        const platform = new THREE.Group();
        platform.position.set(86, this.localHeight(86, -84) + 0.25, -84);
        platform.userData = {
            name: 'Oak Creek Overlook',
            description: 'A quiet pullout above the cottonwoods and creek bend.',
            isInteractable: true,
            type: 'viewpoint',
            interactionType: 'Look'
        };
        const deck = new THREE.Mesh(new THREE.BoxGeometry(22, 0.8, 12), this.mat.bridgeWood);
        deck.position.y = 0.4;
        deck.castShadow = true;
        deck.receiveShadow = true;
        platform.add(deck);
        for (const x of [-10, 10]) {
            const rail = new THREE.Mesh(new THREE.BoxGeometry(1, 3, 12), this.mat.dark);
            rail.position.set(x, 2, 0);
            rail.castShadow = true;
            platform.add(rail);
        }
        this.group.add(platform);
    }

    createSignage() {
        this.addSign(98, -276, "Devil's Kitchen", 'Soldier Pass sinkhole');
        this.addSign(-92, -356, 'Birthing Cave Trail', 'Long Canyon branch');
        this.addSign(-304, -426, 'Birthing Cave', 'Sandstone alcove');
        this.addSign(-115, -18, 'Red Rock Crossing', 'Oak Creek');
        this.addSign(72, -106, 'Cathedral Rock View', 'Follow the red trail');
        this.addSign(170, 66, 'Cathedral Rock', '4,921 ft summit');
    }

    addSign(x, z, title, subtitle) {
        const sign = new THREE.Group();
        sign.position.set(x, this.localHeight(x, z), z);
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 4, 6), this.mat.dark);
        post.position.y = 2;
        sign.add(post);

        const board = new THREE.Mesh(new THREE.PlaneGeometry(12, 5), this.mat.sign);
        board.position.y = 5.1;
        board.rotation.y = Math.PI;
        board.userData = {
            name: title,
            description: subtitle,
            isInteractable: true,
            type: 'sign',
            interactionType: 'Read'
        };
        sign.add(board);

        const label = new THREE.Mesh(
            new THREE.PlaneGeometry(11.4, 4.4),
            new THREE.MeshBasicMaterial({
                map: this.makeLabelTexture(title, subtitle),
                transparent: true
            })
        );
        label.position.set(0, 5.12, -0.03);
        label.rotation.y = Math.PI;
        sign.add(label);
        this.group.add(sign);
    }

    makeLabelTexture(title, subtitle) {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 256;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#e6c179';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = '#3a2417';
        ctx.lineWidth = 14;
        ctx.strokeRect(10, 10, canvas.width - 20, canvas.height - 20);
        ctx.fillStyle = '#3a2417';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = 'bold 48px Georgia, serif';
        ctx.fillText(title, 256, 104);
        ctx.font = '28px Georgia, serif';
        ctx.fillText(subtitle, 256, 162);
        const tex = new THREE.CanvasTexture(canvas);
        tex.anisotropy = 4;
        tex.needsUpdate = true;
        return tex;
    }

    update(delta, elapsed) {
        this._time += delta;
        for (let i = 0; i < this._waterMeshes.length; i++) {
            const mesh = this._waterMeshes[i];
            mesh.position.y = mesh.userData.baseY + Math.sin(elapsed * 1.7 + i * 0.6) * 0.035;
        }
    }

    getInteractables() {
        const out = [];
        this.group.traverse(obj => {
            if (obj.userData && obj.userData.isInteractable) out.push(obj);
        });
        return out;
    }
}
