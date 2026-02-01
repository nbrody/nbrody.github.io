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

        // Materials - Warm Brutalist concrete aesthetic (tan/beige like the real building)
        // Using brighter colors + subtle emissive so the warm tone shows even in shadow
        const concreteMat = new THREE.MeshStandardMaterial({
            color: 0xD8C8A8, // Bright warm tan/beige concrete - the real McHenry color
            emissive: 0x2A2418, // Subtle warm emissive to show color in shadow
            roughness: 0.8,
            metalness: 0.02
        });
        const concreteAccentMat = new THREE.MeshStandardMaterial({
            color: 0xCCBB99, // Lighter accent for slabs
            emissive: 0x221E14, // Subtle warm emissive
            roughness: 0.85
        });
        const concreteBandMat = new THREE.MeshStandardMaterial({
            color: 0xAA9B80, // Darker bands for horizontal lines
            emissive: 0x1A1610,
            roughness: 0.9
        });
        const glassMat = new THREE.MeshStandardMaterial({
            color: 0x6BA3BE, // Blueish reflective glass
            roughness: 0.1,
            metalness: 0.4,
            transparent: true,
            opacity: 0.7
        });
        const glassFrameMat = new THREE.MeshStandardMaterial({
            color: 0x4A4A4A,
            roughness: 0.3,
            metalness: 0.6
        });

        // ============================================
        // MAIN BUILDING - Dramatic Horizontal Cantilevers
        // The key feature: each floor extends SIGNIFICANTLY beyond the one below
        // Creating the iconic "inverted pyramid" brutalist look
        // ============================================

        const baseY = 0;

        // GROUND LEVEL - Recessed base with thick support columns
        // This level is set back, mostly open with columns
        const groundWidth = 24;
        const groundDepth = 20;

        // Heavy concrete support columns (the building appears to float on these)
        const columnPositions = [
            [-9, -7], [-9, 0], [-9, 7],
            [-3, -7], [-3, 7],
            [3, -7], [3, 7],
            [9, -7], [9, 0], [9, 7]
        ];

        columnPositions.forEach(([x, z]) => {
            const column = new THREE.Mesh(
                new THREE.BoxGeometry(1.8, 5, 1.8),
                concreteMat
            );
            column.position.set(x, baseY + 2.5, z - 30);
            column.castShadow = true;
            lib.add(column);
        });

        // Ground floor slab
        const groundSlab = new THREE.Mesh(
            new THREE.BoxGeometry(groundWidth, 0.6, groundDepth),
            concreteAccentMat
        );
        groundSlab.position.set(0, baseY + 5.3, -30);
        groundSlab.castShadow = true;
        lib.add(groundSlab);

        // FIRST FLOOR - Extends beyond ground columns
        const floor1Width = groundWidth + 8;  // 32 wide
        const floor1Depth = groundDepth + 6;  // 26 deep
        const floor1Height = 4.5;

        // First floor solid mass
        const floor1 = new THREE.Mesh(
            new THREE.BoxGeometry(floor1Width, floor1Height, floor1Depth),
            concreteMat
        );
        floor1.position.set(0, baseY + 5.6 + floor1Height / 2, -30);
        floor1.castShadow = true;
        lib.add(floor1);

        // First floor horizontal band (dark concrete stripe)
        const band1 = new THREE.Mesh(
            new THREE.BoxGeometry(floor1Width + 0.4, 0.5, floor1Depth + 0.4),
            concreteBandMat
        );
        band1.position.set(0, baseY + 10.3, -30);
        lib.add(band1);

        // First floor windows - ribbon windows typical of brutalism
        this.addRibbonWindows(lib, floor1Width, floor1Height, floor1Depth, baseY + 7.8, -30, glassMat, glassFrameMat);

        // SECOND FLOOR - Even more dramatic cantilever
        const floor2Width = floor1Width + 6;  // 38 wide
        const floor2Depth = floor1Depth + 4;  // 30 deep
        const floor2Height = 4.5;

        const floor2 = new THREE.Mesh(
            new THREE.BoxGeometry(floor2Width, floor2Height, floor2Depth),
            concreteMat
        );
        floor2.position.set(0, baseY + 10.6 + floor2Height / 2, -30);
        floor2.castShadow = true;
        lib.add(floor2);

        // Second floor band
        const band2 = new THREE.Mesh(
            new THREE.BoxGeometry(floor2Width + 0.4, 0.5, floor2Depth + 0.4),
            concreteBandMat
        );
        band2.position.set(0, baseY + 15.3, -30);
        lib.add(band2);

        // Second floor windows
        this.addRibbonWindows(lib, floor2Width, floor2Height, floor2Depth, baseY + 12.8, -30, glassMat, glassFrameMat);

        // THIRD FLOOR (TOP) - Maximum cantilever, most dramatic
        const floor3Width = floor2Width + 4;  // 42 wide
        const floor3Depth = floor2Depth + 3;  // 33 deep
        const floor3Height = 4;

        const floor3 = new THREE.Mesh(
            new THREE.BoxGeometry(floor3Width, floor3Height, floor3Depth),
            concreteMat
        );
        floor3.position.set(0, baseY + 15.6 + floor3Height / 2, -30);
        floor3.castShadow = true;
        lib.add(floor3);

        // Third floor windows
        this.addRibbonWindows(lib, floor3Width, floor3Height, floor3Depth, baseY + 17.6, -30, glassMat, glassFrameMat);

        // ROOF with parapet
        const roof = new THREE.Mesh(
            new THREE.BoxGeometry(floor3Width + 1, 0.8, floor3Depth + 1),
            concreteAccentMat
        );
        roof.position.set(0, baseY + 20, -30);
        lib.add(roof);

        // Roof parapet
        const parapetHeight = 1.2;
        // Front parapet
        const parapetFront = new THREE.Mesh(
            new THREE.BoxGeometry(floor3Width + 1, parapetHeight, 0.4),
            concreteMat
        );
        parapetFront.position.set(0, baseY + 20.8, -30 + floor3Depth / 2 + 0.3);
        lib.add(parapetFront);
        // Back parapet
        const parapetBack = new THREE.Mesh(
            new THREE.BoxGeometry(floor3Width + 1, parapetHeight, 0.4),
            concreteMat
        );
        parapetBack.position.set(0, baseY + 20.8, -30 - floor3Depth / 2 - 0.3);
        lib.add(parapetBack);
        // Side parapets
        [-1, 1].forEach(side => {
            const parapetSide = new THREE.Mesh(
                new THREE.BoxGeometry(0.4, parapetHeight, floor3Depth + 1),
                concreteMat
            );
            parapetSide.position.set(side * (floor3Width / 2 + 0.3), baseY + 20.8, -30);
            lib.add(parapetSide);
        });

        // ============================================
        // ENTRANCE - Recessed entry at ground level
        // ============================================

        // Entrance canopy extending forward
        const entranceCanopy = new THREE.Mesh(
            new THREE.BoxGeometry(14, 0.6, 10),
            concreteAccentMat
        );
        entranceCanopy.position.set(0, baseY + 5, -15);
        entranceCanopy.castShadow = true;
        lib.add(entranceCanopy);

        // Entrance support columns
        [-5, 5].forEach(x => {
            const entryCol = new THREE.Mesh(
                new THREE.BoxGeometry(1.2, 5, 1.2),
                concreteMat
            );
            entryCol.position.set(x, baseY + 2.5, -12);
            entryCol.castShadow = true;
            lib.add(entryCol);
        });

        // Glass entrance doors
        const entranceDoors = new THREE.Mesh(
            new THREE.BoxGeometry(8, 4, 0.2),
            glassMat
        );
        entranceDoors.position.set(0, baseY + 2.5, -17);
        lib.add(entranceDoors);

        // Door frames
        [-4, 0, 4].forEach(x => {
            const doorFrame = new THREE.Mesh(
                new THREE.BoxGeometry(0.15, 4, 0.3),
                glassFrameMat
            );
            doorFrame.position.set(x, baseY + 2.5, -16.9);
            lib.add(doorFrame);
        });

        // Entry steps
        for (let i = 0; i < 5; i++) {
            const step = new THREE.Mesh(
                new THREE.BoxGeometry(12 - i * 0.3, 0.25, 1.4),
                concreteMat
            );
            step.position.set(0, baseY + 0.15 + i * 0.25, -8 + i * 1.4);
            step.receiveShadow = true;
            lib.add(step);
        }

        // ============================================
        // ROOFTOP EQUIPMENT - Mechanical penthouse
        // ============================================

        const mechRoom = new THREE.Mesh(
            new THREE.BoxGeometry(10, 3, 8),
            concreteAccentMat
        );
        mechRoom.position.set(-8, baseY + 22.5, -35);
        lib.add(mechRoom);

        const mechRoom2 = new THREE.Mesh(
            new THREE.BoxGeometry(6, 2.5, 5),
            concreteAccentMat
        );
        mechRoom2.position.set(10, baseY + 22, -28);
        lib.add(mechRoom2);

        // HVAC vents
        for (let i = 0; i < 3; i++) {
            const vent = new THREE.Mesh(
                new THREE.CylinderGeometry(0.8, 0.8, 1.5, 12),
                new THREE.MeshStandardMaterial({ color: 0x666666, metalness: 0.5 })
            );
            vent.position.set(5 + i * 4, baseY + 21.5, -40);
            lib.add(vent);
        }

        // Position library on terrain
        lib.position.y = this.getTerrainHeight(0, -30);

        this.group.add(lib);
    }

    // Helper method to add ribbon windows (horizontal strips typical of Brutalism)
    addRibbonWindows(parent, width, height, depth, y, z, glassMat, frameMat) {
        const windowHeight = height * 0.5;
        const windowInset = 0.3;

        // Front facade - large ribbon window
        const frontWindow = new THREE.Mesh(
            new THREE.BoxGeometry(width - 6, windowHeight, 0.15),
            glassMat
        );
        frontWindow.position.set(0, y, z + depth / 2 - windowInset);
        parent.add(frontWindow);

        // Horizontal mullions
        [-windowHeight / 3, 0, windowHeight / 3].forEach(offset => {
            const hMullion = new THREE.Mesh(
                new THREE.BoxGeometry(width - 6, 0.12, 0.2),
                frameMat
            );
            hMullion.position.set(0, y + offset, z + depth / 2 - windowInset + 0.05);
            parent.add(hMullion);
        });

        // Vertical mullions
        const numVMullions = Math.floor((width - 6) / 5);
        for (let i = 0; i <= numVMullions; i++) {
            const vMullion = new THREE.Mesh(
                new THREE.BoxGeometry(0.12, windowHeight, 0.2),
                frameMat
            );
            vMullion.position.set(-(width - 6) / 2 + i * ((width - 6) / numVMullions), y, z + depth / 2 - windowInset + 0.05);
            parent.add(vMullion);
        }

        // Side windows (smaller strips)
        [-1, 1].forEach(side => {
            const sideWindow = new THREE.Mesh(
                new THREE.BoxGeometry(0.15, windowHeight * 0.8, depth - 8),
                glassMat
            );
            sideWindow.position.set(side * (width / 2 - windowInset), y, z);
            parent.add(sideWindow);
        });
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
