/**
 * Santa Cruz - UCSC Campus
 * McHenry Library and surrounding campus area
 * Local details only - terrain handled by regional santaCruz.js
 */
import * as THREE from 'three';

export class UCSCCampus {
    constructor(campusGroup, terrainHeightFn = null) {
        this.group = campusGroup;
        this.worldSize = 300;
        // Terrain height function provided by main.js to query regional terrain
        this.terrainHeightFn = terrainHeightFn;
    }

    // Set terrain height function after construction if needed
    setTerrainFunction(fn) {
        this.terrainHeightFn = fn;
    }

    async generate() {
        // Note: Sky and terrain now handled by regional SantaCruzTerrain
        // This module adds local campus details on top
        this.createRedwoods();
        this.createMeadowFlowers();
        this.createBoulders();
        this.createPaths();
        this.createMcHenryLibrary();
        this.createChalkboards();
        this.createStudyCabins();
        this.createBenches();
    }

    createLocalSky() {
        const skyGeo = new THREE.SphereGeometry(500, 32, 32);
        const skyMat = new THREE.ShaderMaterial({
            uniforms: {
                topColor: { value: new THREE.Color(0x0077ff) },
                horizonColor: { value: new THREE.Color(0xB4D7E8) },
                bottomColor: { value: new THREE.Color(0x87CEEB) }
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
                uniform vec3 bottomColor;
                varying vec3 vWorldPosition;
                void main() {
                    float h = normalize(vWorldPosition).y;
                    vec3 color;
                    if (h < 0.0) color = bottomColor;
                    else if (h < 0.25) color = mix(horizonColor, bottomColor, pow(1.0 - h * 4.0, 1.5));
                    else color = mix(horizonColor, topColor, pow((h - 0.25) / 0.75, 0.6));
                    gl_FragColor = vec4(color, 1.0);
                }
            `,
            side: THREE.BackSide
        });
        this.group.add(new THREE.Mesh(skyGeo, skyMat));
        this.createClouds();
    }

    createClouds() {
        const cloudMat = new THREE.MeshStandardMaterial({
            color: 0xffffff, transparent: true, opacity: 0.85, roughness: 1
        });
        const positions = [
            { x: -100, y: 80, z: -150, s: 1.5 }, { x: 50, y: 90, z: -180, s: 1.2 },
            { x: 120, y: 75, z: -140, s: 1.0 }, { x: -60, y: 85, z: -200, s: 1.3 }
        ];
        positions.forEach(p => {
            const cloud = new THREE.Group();
            [{ x: 0, y: 0, z: 0, r: 12 }, { x: 10, y: 3, z: 3, r: 9 },
            { x: -9, y: 2, z: -2, r: 10 }, { x: 6, y: -2, z: -3, r: 7 }].forEach(pf => {
                const mesh = new THREE.Mesh(new THREE.SphereGeometry(pf.r, 10, 8), cloudMat);
                mesh.position.set(pf.x, pf.y, pf.z);
                cloud.add(mesh);
            });
            cloud.position.set(p.x, p.y, p.z);
            cloud.scale.setScalar(p.s);
            this.group.add(cloud);
        });
    }

    createTerrain() {
        const geo = new THREE.PlaneGeometry(this.worldSize, this.worldSize, 150, 150);
        const pos = geo.attributes.position;
        for (let i = 0; i < pos.count; i++) {
            const x = pos.getX(i), z = pos.getZ(i);
            let h = Math.sin(x * 0.03) * Math.cos(z * 0.025) * 3;
            h += Math.sin(x * 0.01 + z * 0.015) * 5;
            h += Math.sin(x * 0.05) * Math.sin(z * 0.04) * 1.5;
            if (Math.sqrt(x * x + z * z) < 25) h *= 0.3;
            pos.setZ(i, h);
        }
        geo.computeVertexNormals();
        const mat = new THREE.MeshStandardMaterial({ color: 0x3A6B35, roughness: 0.9 });
        const terrain = new THREE.Mesh(geo, mat);
        terrain.rotation.x = -Math.PI / 2;
        terrain.receiveShadow = true;
        this.group.add(terrain);
    }

    createRedwoods() {
        for (let i = 0; i < 120; i++) {
            let x, z;
            do { x = (Math.random() - 0.5) * 280; z = (Math.random() - 0.5) * 280; }
            while (Math.sqrt(x * x + (z + 20) * (z + 20)) < 35);
            const tree = this.createRedwood();
            tree.position.set(x, this.getTerrainHeight(x, z), z);
            tree.scale.setScalar(0.6 + Math.random() * 0.8);
            this.group.add(tree);
        }
    }

    createRedwood() {
        const tree = new THREE.Group();
        const h = 15 + Math.random() * 8;
        const trunk = new THREE.Mesh(
            new THREE.CylinderGeometry(0.4, 0.8, h, 10),
            new THREE.MeshStandardMaterial({ color: 0x5C3D2E, roughness: 0.95 })
        );
        trunk.position.y = h / 2;
        trunk.castShadow = true;
        tree.add(trunk);

        const fm = new THREE.MeshStandardMaterial({
            color: new THREE.Color().setHSL(0.35, 0.7, 0.18 + Math.random() * 0.08), roughness: 0.85
        });
        [{ y: h * 0.5, r: 3.5, fh: 4 }, { y: h * 0.65, r: 3, fh: 3.5 }, { y: h * 0.8, r: 2.5, fh: 3 },
        { y: h * 0.95, r: 1.8, fh: 2.5 }, { y: h * 1.05, r: 1, fh: 2 }].forEach(l => {
            const f = new THREE.Mesh(new THREE.ConeGeometry(l.r, l.fh, 8), fm);
            f.position.y = l.y;
            f.castShadow = true;
            tree.add(f);
        });
        return tree;
    }

    getTerrainHeight(x, z) {
        // Use regional terrain height function if available
        if (this.terrainHeightFn) {
            return this.terrainHeightFn(x, z);
        }
        // Fallback to ground level
        return 0;
    }

    createMeadowFlowers() {
        const colors = [0xFFAA00, 0xFFD700, 0x9B59B6, 0xE74C3C, 0xFFFFFF];
        for (let i = 0; i < 300; i++) {
            const x = (Math.random() - 0.5) * 200, z = (Math.random() - 0.5) * 200;
            if (Math.sqrt(x * x + (z + 20) * (z + 20)) < 15 || Math.sqrt(x * x + (z + 20) * (z + 20)) > 60) continue;
            const flower = this.createFlower(colors[Math.floor(Math.random() * colors.length)]);
            flower.position.set(x, this.getTerrainHeight(x, z), z);
            flower.scale.setScalar(0.4 + Math.random() * 0.4);
            this.group.add(flower);
        }
    }

    createFlower(color) {
        const f = new THREE.Group();
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.02, 0.4, 5),
            new THREE.MeshStandardMaterial({ color: 0x228B22 }));
        stem.position.y = 0.2;
        f.add(stem);
        const pm = new THREE.MeshStandardMaterial({ color });
        for (let i = 0; i < 5; i++) {
            const p = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 5), pm);
            p.position.set(Math.cos((i / 5) * Math.PI * 2) * 0.1, 0.4, Math.sin((i / 5) * Math.PI * 2) * 0.1);
            f.add(p);
        }
        const c = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 5),
            new THREE.MeshStandardMaterial({ color: 0xFFD700 }));
        c.position.y = 0.4;
        f.add(c);
        return f;
    }

    createBoulders() {
        for (let i = 0; i < 25; i++) {
            const x = (Math.random() - 0.5) * 200, z = (Math.random() - 0.5) * 200;
            if (Math.sqrt(x * x + z * z) < 20) continue;
            const b = this.createBoulder();
            b.position.set(x, this.getTerrainHeight(x, z), z);
            b.scale.setScalar(0.5 + Math.random() * 1.5);
            this.group.add(b);
        }
    }

    createBoulder() {
        const geo = new THREE.IcosahedronGeometry(1, 1);
        const pos = geo.attributes.position;
        for (let i = 0; i < pos.count; i++) {
            const d = 0.7 + Math.random() * 0.5;
            pos.setXYZ(i, pos.getX(i) * d, pos.getY(i) * d * 0.7, pos.getZ(i) * d);
        }
        geo.computeVertexNormals();
        return new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
            color: new THREE.Color().setHSL(0.08, 0.15, 0.45 + Math.random() * 0.15),
            roughness: 0.95, flatShading: true
        }));
    }

    createPaths() {
        const mat = new THREE.MeshStandardMaterial({ color: 0x9B8B7A, roughness: 0.9 });
        [[{ x: 0, z: 20 }, { x: 5, z: 5 }, { x: 3, z: -10 }, { x: 0, z: -25 }],
        [{ x: 0, z: -10 }, { x: -15, z: -15 }, { x: -30, z: -20 }],
        [{ x: 0, z: -10 }, { x: 15, z: -18 }, { x: 35, z: -25 }]].forEach(path => {
            for (let i = 0; i < path.length - 1; i++) {
                const s = new THREE.Vector3(path[i].x, 0.05, path[i].z);
                const e = new THREE.Vector3(path[i + 1].x, 0.05, path[i + 1].z);
                const dir = new THREE.Vector3().subVectors(e, s);
                const len = dir.length();
                const ctr = new THREE.Vector3().addVectors(s, e).multiplyScalar(0.5);
                const seg = new THREE.Mesh(new THREE.PlaneGeometry(2.5, len), mat);
                seg.position.copy(ctr);
                seg.position.y = this.getTerrainHeight(ctr.x, ctr.z) + 0.05;
                seg.rotation.x = -Math.PI / 2;
                seg.rotation.z = Math.atan2(dir.x, dir.z);
                this.group.add(seg);
            }
        });
    }

    createMcHenryLibrary() {
        const lib = new THREE.Group();
        lib.userData = { name: 'McHenry Library', isInteractable: true, type: 'building', interactionType: 'Enter' };

        const cm = new THREE.MeshStandardMaterial({ color: 0xA89F91, roughness: 0.85 });
        const dm = new THREE.MeshStandardMaterial({ color: 0x7A7368, roughness: 0.9 });
        const gm = new THREE.MeshStandardMaterial({ color: 0x87CEEB, roughness: 0.1, transparent: true, opacity: 0.5 });

        // Building layers
        const base = new THREE.Mesh(new THREE.BoxGeometry(30, 4, 20), cm);
        base.position.set(0, 2, -30); base.castShadow = true; lib.add(base);
        const u1 = new THREE.Mesh(new THREE.BoxGeometry(26, 4, 18), cm);
        u1.position.set(0, 6, -30); u1.castShadow = true; lib.add(u1);
        const u2 = new THREE.Mesh(new THREE.BoxGeometry(22, 4, 16), cm);
        u2.position.set(0, 10, -30); u2.castShadow = true; lib.add(u2);
        const top = new THREE.Mesh(new THREE.BoxGeometry(18, 3, 14), dm);
        top.position.set(0, 13.5, -30); top.castShadow = true; lib.add(top);

        // Windows
        for (let f = 0; f < 3; f++) {
            const y = 2.5 + f * 4;
            for (let i = 0; i < 5; i++) {
                const w = new THREE.Mesh(new THREE.BoxGeometry(3, 2.5, 0.2), gm);
                w.position.set(-8 + i * 4, y, -20 - f);
                lib.add(w);
            }
        }

        // Entrance
        const portico = new THREE.Mesh(new THREE.BoxGeometry(12, 0.5, 6), dm);
        portico.position.set(0, 4.25, -18); lib.add(portico);
        [-4, 4].forEach(x => {
            const pillar = new THREE.Mesh(new THREE.BoxGeometry(1, 4, 1), cm);
            pillar.position.set(x, 2, -18); pillar.castShadow = true; lib.add(pillar);
        });

        // Steps
        for (let i = 0; i < 4; i++) {
            const step = new THREE.Mesh(new THREE.BoxGeometry(14, 0.25, 1.5), cm);
            step.position.set(0, 0.125 + i * 0.25, -14 + i * 1.2);
            lib.add(step);
        }

        this.group.add(lib);
    }

    createChalkboards() {
        const positions = [
            { x: -12, z: -5, ry: Math.PI / 5, name: 'Algebra' },
            { x: 12, z: -8, ry: -Math.PI / 4, name: 'Geometry' },
            { x: -18, z: -25, ry: Math.PI / 3, name: 'Calculus' },
            { x: 20, z: -35, ry: -Math.PI / 6, name: 'Linear Algebra' },
            { x: -8, z: 8, ry: Math.PI / 8, name: 'Number Theory' }
        ];
        positions.forEach(p => {
            const board = this.createChalkboard(p.name);
            board.position.set(p.x, 0, p.z);
            board.rotation.y = p.ry;
            this.group.add(board);
        });
    }

    createChalkboard(name) {
        const g = new THREE.Group();
        g.userData = { name, isInteractable: true, type: 'chalkboard', interactionType: 'Read' };
        const pm = new THREE.MeshStandardMaterial({ color: 0x654321, roughness: 0.9 });
        const fm = new THREE.MeshStandardMaterial({ color: 0x4A3728, roughness: 0.8 });
        const bm = new THREE.MeshStandardMaterial({ color: 0x1A4030, roughness: 0.75 });

        [-1.3, 1.3].forEach(x => {
            const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 2.5, 8), pm);
            post.position.set(x, 1.25, 0); post.castShadow = true; g.add(post);
        });
        const frame = new THREE.Mesh(new THREE.BoxGeometry(3, 2, 0.1), fm);
        frame.position.set(0, 1.8, 0); g.add(frame);
        const board = new THREE.Mesh(new THREE.BoxGeometry(2.7, 1.7, 0.05), bm);
        board.position.set(0, 1.8, 0.06); g.add(board);
        const tray = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.08, 0.12), fm);
        tray.position.set(0, 0.9, 0.12); g.add(tray);

        return g;
    }

    createStudyCabins() {
        [{ x: -35, z: 15, ry: Math.PI / 6, name: 'Quiet Study' },
        { x: 40, z: -20, ry: -Math.PI / 4, name: 'Group Study' }].forEach(p => {
            const cabin = this.createCabin(p.name);
            cabin.position.set(p.x, 0, p.z);
            cabin.rotation.y = p.ry;
            this.group.add(cabin);
        });
    }

    createCabin(name) {
        const g = new THREE.Group();
        g.userData = { name, isInteractable: true, type: 'cabin', interactionType: 'Enter' };
        const lm = new THREE.MeshStandardMaterial({ color: 0x8B6914, roughness: 0.9 });
        const rm = new THREE.MeshStandardMaterial({ color: 0x5C4033, roughness: 0.85 });

        const floor = new THREE.Mesh(new THREE.BoxGeometry(6, 0.3, 5), lm);
        floor.position.y = 0.15; g.add(floor);

        [[6, 3, 0.2, 0, 1.8, -2.4], [0.2, 3, 5, -2.9, 1.8, 0], [0.2, 3, 5, 2.9, 1.8, 0]].forEach(w => {
            const wall = new THREE.Mesh(new THREE.BoxGeometry(w[0], w[1], w[2]), lm);
            wall.position.set(w[3], w[4], w[5]); wall.castShadow = true; g.add(wall);
        });

        const roofGeo = new THREE.ConeGeometry(5, 2.5, 4);
        roofGeo.rotateY(Math.PI / 4);
        const roof = new THREE.Mesh(roofGeo, rm);
        roof.position.y = 4.5; roof.scale.set(1, 1, 0.7); roof.castShadow = true;
        g.add(roof);

        return g;
    }

    createBenches() {
        [{ x: -6, z: 3, ry: 0 }, { x: 6, z: 3, ry: 0 },
        { x: -15, z: -12, ry: Math.PI / 4 }, { x: 15, z: -15, ry: -Math.PI / 3 }].forEach(p => {
            const b = this.createBench();
            b.position.set(p.x, 0, p.z);
            b.rotation.y = p.ry;
            this.group.add(b);
        });
    }

    createBench() {
        const b = new THREE.Group();
        const wm = new THREE.MeshStandardMaterial({ color: 0x8B4513, roughness: 0.85 });
        const mm = new THREE.MeshStandardMaterial({ color: 0x3C3C3C, roughness: 0.4, metalness: 0.7 });
        for (let i = 0; i < 4; i++) {
            const slat = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.08, 0.2), wm);
            slat.position.set(0, 0.5, -0.3 + i * 0.22); b.add(slat);
        }
        [-0.75, 0.75].forEach(x => {
            const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.5, 0.6), mm);
            leg.position.set(x, 0.25, -0.15); b.add(leg);
        });
        return b;
    }

    getInteractables() {
        const interactables = [];
        this.group.traverse(obj => {
            if (obj.userData && obj.userData.isInteractable) {
                interactables.push(obj);
            }
        });
        return interactables;
    }
}
