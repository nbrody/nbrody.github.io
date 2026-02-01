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
        this.createGulchAndBridge();
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

        // ============================================
        // McHenry Library - UCSC (Refined Architectural Design)
        // - "9" shape in plan view
        // - Central atrium (surrounded on 3 sides)
        // - 4th floor bridge with support beams across atrium opening
        // - East side extends farther south (the "tail")
        // - Dense redwood grove integration
        // - 4 stories high
        // ============================================

        // Materials
        const concreteMat = new THREE.MeshStandardMaterial({
            color: 0xC9B896, emissive: 0x1A1610, roughness: 0.9, metalness: 0.02
        });
        const concreteSlabMat = new THREE.MeshStandardMaterial({
            color: 0xD4C4A4, emissive: 0x1C1814, roughness: 0.8
        });
        const glassMat = new THREE.MeshStandardMaterial({
            color: 0x88AAC0, roughness: 0.05, metalness: 0.3, transparent: true, opacity: 0.6
        });
        const copperMat = new THREE.MeshStandardMaterial({
            color: 0x5B8C6B, emissive: 0x0A1A0E, roughness: 0.7, metalness: 0.4
        });

        const baseY = 0;
        const buildingZ = -35;
        const floorHeight = 3.8;
        const numFloors = 4; // Refinement: 4 stories

        // Wing Dimensions
        const wingWidth = 12;
        const northWingLen = 42;
        const eastWingLen = 50;  // Long "tail" of the 9
        const westWingLen = 22;  // Shorter, forms the loop
        const bridgeWidth = wingWidth;

        // Atrium Dimensions (estimated from wing gaps)
        const atriumW = northWingLen - (wingWidth * 2);
        const atriumD = westWingLen - wingWidth;

        // Function to create a wing for each floor
        const createWing = (floor, w, h, d, x, z) => {
            const floorY = baseY + floor * floorHeight;
            const wingGroup = new THREE.Group();

            // Floor slab
            const slab = new THREE.Mesh(new THREE.BoxGeometry(w + 0.5, 0.5, d + 0.5), concreteSlabMat);
            slab.position.set(0, 0, 0);
            slab.castShadow = true; slab.receiveShadow = true;
            wingGroup.add(slab);

            // Facade walls (simple box for massing, plus grid logic)
            const walls = new THREE.Mesh(new THREE.BoxGeometry(w, h - 0.5, d), glassMat);
            walls.position.y = (h - 0.5) / 2 + 0.25;
            wingGroup.add(walls);

            // Add concrete grid lines (simplified vertical grid)
            const gridSpacing = 4;
            const numGridsX = Math.floor(w / gridSpacing);
            const numGridsZ = Math.floor(d / gridSpacing);

            // Vertical grid lines for X facades
            for (let i = 0; i <= numGridsX; i++) {
                const gx = -w / 2 + i * (w / numGridsX);
                const beam = new THREE.Mesh(new THREE.BoxGeometry(0.35, h - 0.5, 0.5), concreteMat);
                beam.position.set(gx, (h - 0.5) / 2 + 0.25, d / 2);
                wingGroup.add(beam);
                const beam2 = beam.clone();
                beam2.position.z = -d / 2;
                wingGroup.add(beam2);
            }
            // Vertical grid lines for Z facades
            for (let i = 0; i <= numGridsZ; i++) {
                const gz = -d / 2 + i * (d / numGridsZ);
                const beam = new THREE.Mesh(new THREE.BoxGeometry(0.5, h - 0.5, 0.35), concreteMat);
                beam.position.set(w / 2, (h - 0.5) / 2 + 0.25, gz);
                wingGroup.add(beam);
                const beam2 = beam.clone();
                beam2.position.x = -w / 2;
                wingGroup.add(beam2);
            }

            wingGroup.position.set(x, floorY, z);
            lib.add(wingGroup);
        };

        // Create the "9" shape floor by floor
        for (let f = 0; f < numFloors; f++) {
            // North Wing (Across the top)
            createWing(f, northWingLen, floorHeight, wingWidth, 0, buildingZ - westWingLen / 2);

            // East Wing (Right side, extensions)
            const eastX = northWingLen / 2 - wingWidth / 2;
            createWing(f, wingWidth, floorHeight, eastWingLen, eastX, buildingZ + (eastWingLen - westWingLen) / 2);

            // West Wing (Left side, shorter)
            const westX = -northWingLen / 2 + wingWidth / 2;
            createWing(f, wingWidth, floorHeight, westWingLen, westX, buildingZ);

            // 4th Floor Bridge (The "bar" across the middle-ish)
            if (f === 3) { // 4th floor (0-indexed: 3)
                const bridgeWidthNarrow = wingWidth * 0.4;
                const bridgeZ = westWingLen / 2 - bridgeWidthNarrow / 2;
                createWing(f, atriumW, floorHeight, bridgeWidthNarrow, 0, buildingZ + bridgeZ);

                // Support Beams for the bridge
                [-atriumW / 2 + 2, atriumW / 2 - 2].forEach(bx => {
                    const support = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, f * floorHeight, 8), concreteMat);
                    support.position.set(bx, (f * floorHeight) / 2, buildingZ + bridgeZ);
                    lib.add(support);
                });

                // Add covered roof specifically for the bridge
                const roof = new THREE.Mesh(new THREE.BoxGeometry(atriumW + 0.5, 0.4, bridgeWidthNarrow + 0.5), concreteSlabMat);
                roof.position.set(0, baseY + (f + 1) * floorHeight, buildingZ + bridgeZ);
                lib.add(roof);
            }
        }

        // Roof slabs for the wings
        const roofY = baseY + numFloors * floorHeight;
        const addRoof = (w, d, x, z) => {
            const r = new THREE.Mesh(new THREE.BoxGeometry(w + 1, 0.6, d + 1), concreteSlabMat);
            r.position.set(x, roofY, z);
            r.castShadow = true; lib.add(r);
        };
        addRoof(northWingLen, wingWidth, 0, buildingZ - westWingLen / 2);
        addRoof(wingWidth, eastWingLen, northWingLen / 2 - wingWidth / 2, buildingZ + (eastWingLen - westWingLen) / 2);
        addRoof(wingWidth, westWingLen, -northWingLen / 2 + wingWidth / 2, buildingZ);


        // Copper Stairwell Towers
        const towerHeight = numFloors * floorHeight + 2;
        const tower1 = new THREE.Mesh(new THREE.BoxGeometry(6, towerHeight, 6), copperMat);
        tower1.position.set(northWingLen / 2 + 2, towerHeight / 2, buildingZ - westWingLen / 2);
        lib.add(tower1);
        const tower2 = new THREE.Mesh(new THREE.BoxGeometry(6, towerHeight, 6), copperMat);
        tower2.position.set(-northWingLen / 2 - 2, towerHeight / 2, buildingZ - westWingLen / 2);
        lib.add(tower2);

        // Entrance (Cleaned up, no large staircase)
        const entryPlaza = new THREE.Mesh(new THREE.BoxGeometry(15, 0.4, 15), concreteSlabMat);
        entryPlaza.position.set(0, 0.2, buildingZ + westWingLen / 2 + 5);
        lib.add(entryPlaza);

        // Dense Redwood Cluster
        for (let i = 0; i < 60; i++) {
            const angle = Math.random() * Math.PI * 2;
            const dist = 35 + Math.random() * 40;
            const tx = Math.cos(angle) * dist;
            const tz = buildingZ + Math.sin(angle) * dist;
            // Don't place tree inside building
            if (Math.abs(tx) < northWingLen / 2 + 5 && Math.abs(tz - buildingZ) < eastWingLen / 2 + 5) continue;
            const tree = this.createRedwood();
            tree.position.set(tx, this.getTerrainHeight(tx, tz), tz);
            tree.scale.setScalar(0.6 + Math.random() * 1.2);
            this.group.add(tree);
        }

        lib.position.y = this.getTerrainHeight(0, buildingZ);
        this.group.add(lib);
    }

    createGulchAndBridge() {
        const buildingZ = -35;
        const gulchX = 65; // East of building
        const bridgeZ = buildingZ - 50; // Move bridge 50 units North
        const gulchWidth = 30; // Wider for better visibility
        const gulchLength = 120;
        const gulchDepth = 60;

        // Local high-detail chasm mesh to ground-level immersion
        // This overlaps the regional terrain with higher resolution
        const chasmGeo = new THREE.PlaneGeometry(gulchWidth + 20, gulchLength, 60, 60);
        const pos = chasmGeo.attributes.position;
        for (let i = 0; i < pos.count; i++) {
            const px = pos.getX(i);
            const distFromCenter = Math.abs(px);
            const normalizedDist = distFromCenter / (gulchWidth / 2);
            const depthFactor = Math.max(0, 1.0 - Math.pow(normalizedDist, 0.4));
            pos.setZ(i, -depthFactor * gulchDepth);
        }
        chasmGeo.computeVertexNormals();
        const chasmMat = new THREE.MeshStandardMaterial({
            color: 0x1A2A15,
            roughness: 1.0,
            flatShading: true
        });
        const chasmMesh = new THREE.Mesh(chasmGeo, chasmMat);
        chasmMesh.rotation.x = -Math.PI / 2;
        // Position at the rim height
        const rimHeight = this.getTerrainHeight(gulchX - 25, bridgeZ);
        chasmMesh.position.set(gulchX, rimHeight, buildingZ - 20); // Center of the north-south chasm
        this.group.add(chasmMesh);

        // Wooden Bridge
        const bridgeWidth = 4;
        const bridgeLength = gulchWidth + 10;
        const bridgeGroup = new THREE.Group();

        const woodMat = new THREE.MeshStandardMaterial({ color: 0x5D4037, roughness: 0.9 });

        // Planks
        for (let i = 0; i < bridgeLength; i += 0.8) {
            const plank = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.15, bridgeWidth), woodMat);
            plank.position.set(i - bridgeLength / 2, 0, 0);
            plank.castShadow = true; plank.receiveShadow = true;
            bridgeGroup.add(plank);
        }

        // Side rails
        const railLower = new THREE.Mesh(new THREE.BoxGeometry(bridgeLength, 0.1, 0.1), woodMat);
        railLower.position.set(0, 0.5, bridgeWidth / 2 - 0.1);
        bridgeGroup.add(railLower);
        const railLower1 = railLower.clone();
        railLower1.position.z = -bridgeWidth / 2 + 0.1;
        bridgeGroup.add(railLower1);

        const railUpper = new THREE.Mesh(new THREE.BoxGeometry(bridgeLength, 0.15, 0.15), woodMat);
        railUpper.position.set(0, 1.1, bridgeWidth / 2 - 0.1);
        bridgeGroup.add(railUpper);
        const railUpper1 = railUpper.clone();
        railUpper1.position.z = -bridgeWidth / 2 + 0.1;
        bridgeGroup.add(railUpper1);

        // Posts
        for (let i = 0; i < bridgeLength; i += 4) {
            const post = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.2, 0.2), woodMat);
            post.position.set(i - bridgeLength / 2, 0.6, bridgeWidth / 2 - 0.1);
            bridgeGroup.add(post);
            const post2 = post.clone();
            post2.position.z = -bridgeWidth / 2 + 0.1;
            bridgeGroup.add(post2);
        }

        // Important: Position bridge at RIM height so it spans the chasm
        bridgeGroup.position.set(gulchX, rimHeight + 0.1, bridgeZ);
        this.group.add(bridgeGroup);


        // Add some trees in and around the chasm
        for (let i = 0; i < 25; i++) {
            const tx = gulchX + (Math.random() - 0.5) * 40;
            const tz = buildingZ + (Math.random() - 0.5) * gulchLength;

            const tree = this.createRedwood();
            tree.position.set(tx, this.getTerrainHeight(tx, tz), tz);
            tree.scale.setScalar(0.4 + Math.random() * 0.9);
            this.group.add(tree);
        }
    }

    // Helper: Create grid facade typical of McHenry's design
    // Regular pattern of concrete grid with large glass panels
    addGridFacade(parent, width, height, depth, y, z, concreteMat, gridMat, glassMat, frameMat) {
        const gridSpacingH = 4;  // Horizontal spacing between grid lines
        const gridSpacingV = height;  // Vertical (full floor height)
        const gridThickness = 0.35;
        const glassInset = 0.2;

        // Create glass and grid for front and back facades
        [1, -1].forEach(side => {
            const facadeZ = z + side * (depth / 2);
            const numBays = Math.floor(width / gridSpacingH);

            for (let i = 0; i < numBays; i++) {
                const bayX = -width / 2 + gridSpacingH / 2 + i * gridSpacingH;

                // Large glass panel
                const glass = new THREE.Mesh(
                    new THREE.BoxGeometry(gridSpacingH - gridThickness * 2, height - gridThickness * 2, 0.12),
                    glassMat
                );
                glass.position.set(bayX, y, facadeZ + side * glassInset);
                parent.add(glass);

                // Vertical grid line (between bays)
                if (i > 0) {
                    const vGrid = new THREE.Mesh(
                        new THREE.BoxGeometry(gridThickness, height, 0.5),
                        gridMat
                    );
                    vGrid.position.set(bayX - gridSpacingH / 2, y, facadeZ);
                    parent.add(vGrid);
                }
            }

            // Edge vertical grid lines
            [-width / 2, width / 2].forEach(edgeX => {
                const edgeGrid = new THREE.Mesh(
                    new THREE.BoxGeometry(gridThickness * 1.5, height, 0.5),
                    concreteMat
                );
                edgeGrid.position.set(edgeX, y, facadeZ);
                parent.add(edgeGrid);
            });
        });

        // Side facades - fewer, larger windows
        [-1, 1].forEach(side => {
            const facadeX = side * (width / 2);
            const numSideBays = Math.floor(depth / gridSpacingH);

            for (let i = 0; i < numSideBays; i++) {
                const bayZ = z - depth / 2 + gridSpacingH / 2 + i * gridSpacingH;

                // Side glass panel
                const sideGlass = new THREE.Mesh(
                    new THREE.BoxGeometry(0.12, height - gridThickness * 2, gridSpacingH - gridThickness * 2),
                    glassMat
                );
                sideGlass.position.set(facadeX + side * glassInset, y, bayZ);
                parent.add(sideGlass);
            }
        });
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
