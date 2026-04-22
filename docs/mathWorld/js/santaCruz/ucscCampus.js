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
        // Create local high-detail terrain for the campus area
        this.createTerrain();

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
            // PlaneGeometry lives in XY plane; after the -π/2 rotation, local
            // Y becomes world -Z, and local Z becomes world Y (height). So we
            // read X/Y to pick a horizontal vertex and write Z for height.
            const localX = pos.getX(i);
            const localY = pos.getY(i);
            // Convert plane-coords to group-local world XZ: +X stays +X,
            // but the plane's +Y maps to world -Z.
            const worldX = localX;
            const worldZ = -localY;
            pos.setZ(i, this._combinedHeight(worldX, worldZ));
        }
        geo.computeVertexNormals();
        const mat = new THREE.MeshStandardMaterial({ color: 0x4B7D3A, roughness: 0.95 }); // Lush Meadow Green
        const terrain = new THREE.Mesh(geo, mat);
        terrain.rotation.x = -Math.PI / 2;
        terrain.receiveShadow = true;
        this.group.add(terrain);
    }

    // Local procedural detail on top of the regional heightmap.
    // Kept small (~±1 m) so the campus still "reads" as procedurally
    // varied without fighting the real topography beneath it.
    _campusDetail(x, z) {
        let h = Math.sin(x * 0.03) * Math.cos(z * 0.025) * 0.6;
        h += Math.sin(x * 0.05) * Math.sin(z * 0.04) * 0.3;
        h += Math.sin(x * 0.11 + z * 0.07) * 0.15;
        return h;
    }

    // Edge blend: detail contribution fades to zero as we approach the
    // patch boundary, so the local mesh meets the regional terrain
    // exactly at the edge with no visible seam/dip.
    _edgeBlend(x, z) {
        const half = this.worldSize / 2;
        const margin = 80; // Wide fade so any residual mismatch disperses smoothly
        const edgeDist = Math.min(half - Math.abs(x), half - Math.abs(z));
        if (edgeDist >= margin) return 1;
        if (edgeDist <= 0) return 0;
        const t = edgeDist / margin;
        return t * t * (3 - 2 * t); // smoothstep
    }

    // Bilinearly-interpolated version of the regional heightmap, sampled at
    // the regional mesh's own grid spacing. Reproduces what the surrounding
    // regional mesh surface *actually renders* at a given point — i.e., a
    // low-pass-filtered version of the analytical elevation function.
    //
    // Why we need this: the local patch samples `terrainHeightFn` (the raw
    // analytical function) at 2 m, but the regional terrain around it
    // samples at ~23 m and interpolates linearly. The difference at any
    // single point is the "sub-grid" detail the regional mesh can't
    // represent — typically 1-3 m. At the patch boundary that manifests
    // as a visible step/ridge. By making the edge base match this
    // low-pass version, the seam closes cleanly.
    _regionalRenderedHeight(x, z) {
        if (!this.terrainHeightFn) return 0;
        // 24 m spacing matches the Santa Cruz shoreline patch grid (~23×13).
        // Exact alignment to the regional grid isn't critical — any spacing
        // coarser than the highest-frequency detail wavelength works, because
        // what we need is just a low-pass version of the function.
        const gx = 24, gz = 24;
        const x0 = Math.floor(x / gx) * gx;
        const z0 = Math.floor(z / gz) * gz;
        const x1 = x0 + gx;
        const z1 = z0 + gz;
        const h00 = this.terrainHeightFn(x0, z0);
        const h10 = this.terrainHeightFn(x1, z0);
        const h01 = this.terrainHeightFn(x0, z1);
        const h11 = this.terrainHeightFn(x1, z1);
        const tx = (x - x0) / gx;
        const tz = (z - z0) / gz;
        const hx0 = h00 * (1 - tx) + h10 * tx;
        const hx1 = h01 * (1 - tx) + h11 * tx;
        return hx0 * (1 - tz) + hx1 * tz;
    }

    // The ONE authoritative height function for the local patch. Used
    // both to shape the terrain mesh and to place objects, so they
    // always line up.
    //
    // Edge (blend=0): height = regional-rendered → matches the surrounding
    //   regional terrain mesh surface at that exact point, no seam.
    // Interior (blend=1): height = raw analytical + campus detail
    //   → full high-frequency detail, sharp gulch, etc.
    // Between: smoothstep transition over an 80 m margin.
    _combinedHeight(x, z) {
        if (!this.terrainHeightFn) return 0;
        const blend = this._edgeBlend(x, z);
        // Interior fast path: most vertices have blend=1 and the
        // rendered/residual math collapses to (analytical + detail).
        if (blend >= 1) {
            return this.terrainHeightFn(x, z) + this._campusDetail(x, z);
        }
        const rendered = this._regionalRenderedHeight(x, z);
        if (blend <= 0) return rendered;
        const analytical = this.terrainHeightFn(x, z);
        const highFreqResidual = analytical - rendered;
        return rendered + highFreqResidual * blend + this._campusDetail(x, z) * blend;
    }

    createRedwoods() {
        for (let i = 0; i < 120; i++) {
            let x, z;
            do { x = (Math.random() - 0.5) * 280; z = (Math.random() - 0.5) * 280; }
            while (this.isNearBuilding(x, z));
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
        // Returns the same value that `createTerrain` sculpts into the mesh,
        // so every tree/building placed via this function sits on the ground
        // exactly instead of floating above it or sinking below.
        return this._combinedHeight(x, z);
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
        // McHenry Library - UCSC
        // Original 1968 Brutalist building (Warnecke) + 2008 Addition (Bora)
        //
        // Plan view: L / "9" shape
        //   - Original building: North/west portion, heavy concrete grid
        //   - 2008 Addition: South/east extension, more glass, lighter
        //   - Central courtyard / atrium between wings
        //   - Entrance from south, leading to commons
        //   - Stairwell towers with copper/patina cladding
        //   - 4 stories, flat roof with mechanical penthouse
        // ============================================

        // --- Materials ---
        // Original 1968 — warm raw concrete, heavier
        const concreteMat = new THREE.MeshStandardMaterial({
            color: 0xC0AD8A, emissive: 0x151008, roughness: 0.92, metalness: 0.02
        });
        // Horizontal spandrels — slightly darker concrete bands
        const spandrelMat = new THREE.MeshStandardMaterial({
            color: 0xB09A78, emissive: 0x100C06, roughness: 0.85, metalness: 0.03
        });
        // 2008 Addition — lighter, smoother concrete
        const additionConcreteMat = new THREE.MeshStandardMaterial({
            color: 0xD0C4A8, emissive: 0x181410, roughness: 0.8, metalness: 0.02
        });
        // Floor slab concrete
        const concreteSlabMat = new THREE.MeshStandardMaterial({
            color: 0xD4C4A4, emissive: 0x1C1814, roughness: 0.8
        });
        // Glass — dark tinted, reflective
        const glassMat = new THREE.MeshStandardMaterial({
            color: 0x6B99B0, roughness: 0.05, metalness: 0.35, transparent: true, opacity: 0.55
        });
        // Addition glass — lighter, more transparent (40% fenestration)
        const additionGlassMat = new THREE.MeshStandardMaterial({
            color: 0x88B8D0, roughness: 0.05, metalness: 0.3, transparent: true, opacity: 0.5
        });
        // Copper/patina for stairwell towers
        const copperMat = new THREE.MeshStandardMaterial({
            color: 0x5B8C6B, emissive: 0x0A1A0E, roughness: 0.7, metalness: 0.4
        });
        // Dark window frame
        const frameMat = new THREE.MeshStandardMaterial({
            color: 0x3A3A3A, roughness: 0.6, metalness: 0.5
        });

        const baseY = 0;
        const buildingZ = -35;
        const floorHeight = 4.0;
        const numFloors = 4;
        const roofY = baseY + numFloors * floorHeight;

        // --- Wing Dimensions ---
        const wingWidth = 13;
        const eastWingWidth = 26;  // East wing is twice as wide (2008 addition)
        const northWingLen = 46;
        const eastWingLen = 52;
        const westWingLen = 24;

        // --- Helper: create a Brutalist wing (original 1968 style) ---
        const createBrutalistWing = (w, h, d, x, y, z) => {
            const wing = new THREE.Group();

            // Core glass box (recessed behind grid)
            const core = new THREE.Mesh(new THREE.BoxGeometry(w - 0.6, h - 0.3, d - 0.6), glassMat);
            core.position.set(0, h / 2 + 0.15, 0);
            wing.add(core);

            // Thick horizontal spandrels at floor and ceiling
            [0.15, h - 0.1].forEach(spY => {
                const spandrel = new THREE.Mesh(
                    new THREE.BoxGeometry(w + 0.3, 0.55, d + 0.3), spandrelMat
                );
                spandrel.position.set(0, spY, 0);
                spandrel.castShadow = true;
                wing.add(spandrel);
            });

            // Vertical concrete mullions — front & back
            const mullionSpacing = 3.8;
            const numMullions = Math.floor(w / mullionSpacing);
            for (let i = 0; i <= numMullions; i++) {
                const mx = -w / 2 + i * (w / numMullions);
                const mullion = new THREE.Mesh(new THREE.BoxGeometry(0.4, h, 0.45), concreteMat);
                mullion.position.set(mx, h / 2, d / 2);
                wing.add(mullion);
                const m2 = mullion.clone();
                m2.position.z = -d / 2;
                wing.add(m2);
            }
            // Side mullions
            const sideMullions = Math.floor(d / mullionSpacing);
            for (let i = 0; i <= sideMullions; i++) {
                const mz = -d / 2 + i * (d / sideMullions);
                const sm = new THREE.Mesh(new THREE.BoxGeometry(0.45, h, 0.4), concreteMat);
                sm.position.set(w / 2, h / 2, mz);
                wing.add(sm);
                const sm2 = sm.clone();
                sm2.position.x = -w / 2;
                wing.add(sm2);
            }

            wing.position.set(x, y, z);
            return wing;
        };

        // --- Helper: create an Addition wing (2008 style) ---
        const createAdditionWing = (w, h, d, x, y, z) => {
            const wing = new THREE.Group();

            // More prominent glass
            const core = new THREE.Mesh(
                new THREE.BoxGeometry(w - 0.4, h - 0.2, d - 0.4), additionGlassMat
            );
            core.position.set(0, h / 2 + 0.1, 0);
            wing.add(core);

            // Thinner spandrels
            [0.1, h - 0.05].forEach(spY => {
                const spandrel = new THREE.Mesh(
                    new THREE.BoxGeometry(w + 0.2, 0.35, d + 0.2), additionConcreteMat
                );
                spandrel.position.set(0, spY, 0);
                spandrel.castShadow = true;
                wing.add(spandrel);
            });

            // Thinner mullions
            const mullionSpacing = 4.5;
            const numMullions = Math.floor(w / mullionSpacing);
            for (let i = 0; i <= numMullions; i++) {
                const mx = -w / 2 + i * (w / numMullions);
                const mullion = new THREE.Mesh(new THREE.BoxGeometry(0.25, h, 0.3), additionConcreteMat);
                mullion.position.set(mx, h / 2, d / 2);
                wing.add(mullion);
                const m2 = mullion.clone();
                m2.position.z = -d / 2;
                wing.add(m2);
            }
            const sideMullions = Math.floor(d / mullionSpacing);
            for (let i = 0; i <= sideMullions; i++) {
                const mz = -d / 2 + i * (d / sideMullions);
                const sm = new THREE.Mesh(new THREE.BoxGeometry(0.3, h, 0.25), additionConcreteMat);
                sm.position.set(w / 2, h / 2, mz);
                wing.add(sm);
                const sm2 = sm.clone();
                sm2.position.x = -w / 2;
                wing.add(sm2);
            }

            wing.position.set(x, y, z);
            return wing;
        };

        // ===== BUILD FLOOR BY FLOOR =====
        const northZ = buildingZ - westWingLen / 2;
        const eastX = northWingLen / 2 + eastWingWidth / 2 - wingWidth;  // Adjusted for wider wing
        const westX = -northWingLen / 2 + wingWidth / 2;

        for (let f = 0; f < numFloors; f++) {
            const floorY = baseY + f * floorHeight;

            // North Wing — original 1968 Brutalist
            lib.add(createBrutalistWing(
                northWingLen, floorHeight, wingWidth,
                0, floorY, northZ
            ));

            // West Wing — original 1968
            lib.add(createBrutalistWing(
                wingWidth, floorHeight, westWingLen,
                westX, floorY, buildingZ
            ));

            // East Wing — 2008 Addition (wider, longer, more glass)
            lib.add(createAdditionWing(
                eastWingWidth, floorHeight, eastWingLen,
                eastX, floorY, buildingZ + (eastWingLen - westWingLen) / 2
            ));

            // 4th Floor Bridge across atrium
            if (f === 3) {
                const atriumW = northWingLen - wingWidth * 2;
                const bridgeDepth = wingWidth * 0.35;
                const bridgeZ = buildingZ + westWingLen / 2 - bridgeDepth / 2;
                lib.add(createBrutalistWing(
                    atriumW, floorHeight, bridgeDepth,
                    0, floorY, bridgeZ
                ));

                // Support columns
                const colSpacing = atriumW / 3;
                for (let c = 0; c <= 3; c++) {
                    const col = new THREE.Mesh(
                        new THREE.CylinderGeometry(0.5, 0.6, f * floorHeight, 8), concreteMat
                    );
                    col.position.set(-atriumW / 2 + c * colSpacing, (f * floorHeight) / 2, bridgeZ);
                    col.castShadow = true;
                    lib.add(col);
                }
            }
        }

        // ===== ROOF =====
        const addRoof = (w, d, x, z) => {
            const r = new THREE.Mesh(new THREE.BoxGeometry(w + 1, 0.6, d + 1), concreteSlabMat);
            r.position.set(x, roofY, z);
            r.castShadow = true;
            lib.add(r);
        };
        addRoof(northWingLen, wingWidth, 0, northZ);
        addRoof(eastWingWidth, eastWingLen, eastX, buildingZ + (eastWingLen - westWingLen) / 2);
        addRoof(wingWidth, westWingLen, westX, buildingZ);

        // Rooftop mechanical penthouse
        const penthouse = new THREE.Mesh(new THREE.BoxGeometry(8, 2.5, 6), concreteMat);
        penthouse.position.set(0, roofY + 1.25, northZ);
        lib.add(penthouse);

        // ===== COPPER/PATINA STAIRWELL TOWERS =====
        const towerHeight = numFloors * floorHeight + 3;
        [
            { x: northWingLen / 2 + 3, z: northZ },
            { x: -northWingLen / 2 - 3, z: northZ },
            { x: eastX, z: buildingZ + eastWingLen / 2 + 3 }
        ].forEach(tp => {
            const tower = new THREE.Mesh(new THREE.BoxGeometry(5, towerHeight, 5), copperMat);
            tower.position.set(tp.x, towerHeight / 2, tp.z);
            tower.castShadow = true;
            lib.add(tower);
            const cap = new THREE.Mesh(new THREE.BoxGeometry(5.5, 0.4, 5.5), frameMat);
            cap.position.set(tp.x, towerHeight, tp.z);
            lib.add(cap);
        });

        // ===== SOUTH ENTRY PLAZA & READING GARDEN =====
        const entryZ = buildingZ + westWingLen / 2 + 3;

        // Entry plaza
        const plaza = new THREE.Mesh(new THREE.BoxGeometry(24, 0.3, 12), concreteSlabMat);
        plaza.position.set(0, 0.15, entryZ + 4);
        lib.add(plaza);

        // Entry canopy
        const canopy = new THREE.Mesh(
            new THREE.BoxGeometry(16, 0.3, 6),
            new THREE.MeshStandardMaterial({ color: 0xD8CDB0, roughness: 0.7, metalness: 0.05 })
        );
        canopy.position.set(0, floorHeight * 0.8, entryZ + 2);
        canopy.castShadow = true;
        lib.add(canopy);

        // Canopy support columns
        [-6, 6].forEach(cx => {
            const col = new THREE.Mesh(
                new THREE.CylinderGeometry(0.35, 0.35, floorHeight * 0.8, 8), concreteMat
            );
            col.position.set(cx, floorHeight * 0.4, entryZ + 4);
            lib.add(col);
        });

        // Reading garden benches
        for (let i = 0; i < 4; i++) {
            const bench = new THREE.Mesh(new THREE.BoxGeometry(3, 0.5, 0.8), concreteSlabMat);
            bench.position.set(-8 + i * 5, 0.25, entryZ + 10);
            lib.add(bench);
        }

        // ===== DENSE REDWOOD CLUSTER =====
        for (let i = 0; i < 60; i++) {
            const angle = Math.random() * Math.PI * 2;
            const dist = 35 + Math.random() * 40;
            const tx = Math.cos(angle) * dist;
            const tz = buildingZ + Math.sin(angle) * dist;
            if (this.isNearBuilding(tx, tz)) continue;
            const tree = this.createRedwood();
            tree.position.set(tx, this.getTerrainHeight(tx, tz), tz);
            tree.scale.setScalar(0.6 + Math.random() * 1.2);
            this.group.add(tree);
        }

        lib.position.y = this.getTerrainHeight(0, buildingZ);
        this.group.add(lib);
    }


    // Helper: Exact footprint check for McHenry Library to prevent overlaps
    isNearBuilding(x, z) {
        const buildingZ = -35;
        const xMin = -23 - 5;    // West side
        const xMax = 36 + 5;     // East side (wider east wing)
        const zMin = buildingZ - 12 - 6 - 5;
        const zMax = buildingZ + 26 + 5;

        return x > xMin && x < xMax && z > zMin && z < zMax;
    }

    createGulchAndBridge() {
        const buildingZ = -35;
        const gulchX = 100;      // Due east of McHenry (moved east to clear wider library)
        const gulchWidth = 30;   // Ravine width
        const gulchLength = 140; // Ravine running N-S
        const gulchDepth = 25;   // Realistic depth (~25m, matching UCSC gulch)

        // Sample ground height at the ravine location
        const groundHeight = this.getTerrainHeight(gulchX, buildingZ - 30);

        // ===== RAVINE FLOOR =====
        // V-shaped trench cut into the terrain
        const chasmGeo = new THREE.PlaneGeometry(gulchWidth + 10, gulchLength, 80, 80);
        const pos = chasmGeo.attributes.position;
        const chasmColors = new Float32Array(pos.count * 3);

        for (let i = 0; i < pos.count; i++) {
            const px = pos.getX(i);
            const py = pos.getY(i);
            const distFromCenter = Math.abs(px);
            const normalizedDist = distFromCenter / (gulchWidth / 2);
            // V-shape: edges at ground level, center sinks below
            const depthFactor = Math.max(0, 1.0 - Math.pow(normalizedDist, 0.5));
            // Small terrain noise
            const noise = Math.sin(px * 0.3 + py * 0.2) * 1.5 + Math.sin(px * 0.7) * 1;
            // Edges should be at 0 (ground level), center sinks DOWN
            pos.setZ(i, -depthFactor * gulchDepth + noise * depthFactor);

            // Color: dark forest floor with moss in deep areas
            const t = depthFactor;
            chasmColors[i * 3] = 0.08 + t * 0.05;
            chasmColors[i * 3 + 1] = 0.12 + t * 0.08;
            chasmColors[i * 3 + 2] = 0.06 + t * 0.02;
        }
        chasmGeo.setAttribute('color', new THREE.BufferAttribute(chasmColors, 3));
        chasmGeo.computeVertexNormals();

        const chasmMat = new THREE.MeshStandardMaterial({
            vertexColors: true,
            roughness: 1.0,
            flatShading: true
        });
        const chasmMesh = new THREE.Mesh(chasmGeo, chasmMat);
        chasmMesh.rotation.x = -Math.PI / 2;

        // Position at ground level — the geometry already sinks below via negative Z values
        chasmMesh.position.set(gulchX, groundHeight, buildingZ - 30);
        this.group.add(chasmMesh);

        // ===== RAVINE WALLS =====
        // Vertical earth walls to hide the underside
        const wallMat = new THREE.MeshStandardMaterial({
            color: 0x2A2215, roughness: 1.0, side: THREE.DoubleSide
        });
        [-1, 1].forEach(side => {
            const wall = new THREE.Mesh(
                new THREE.PlaneGeometry(gulchLength, gulchDepth * 1.5), wallMat
            );
            wall.position.set(
                gulchX + side * (gulchWidth / 2 + 3),
                groundHeight - gulchDepth * 0.5,
                buildingZ - 30
            );
            wall.rotation.y = side * Math.PI / 2;
            this.group.add(wall);
        });

        // ===== HAHN-MCHENRY PEDESTRIAN BRIDGE (VIADUCT) =====
        // A long, substantial concrete-and-wood pedestrian bridge
        const bridgeZ = buildingZ - 20;  // Path from McHenry heading east
        const bridgeDeckWidth = 4.5;     // Wide enough for two-way pedestrian traffic
        const bridgeLength = gulchWidth + 14; // Spans the gulch plus short approaches
        const bridgeGroup = new THREE.Group();

        // Materials
        const concreteViaductMat = new THREE.MeshStandardMaterial({
            color: 0xB8A890, roughness: 0.8, metalness: 0.05
        });
        const woodDeckMat = new THREE.MeshStandardMaterial({
            color: 0x6D4C3D, roughness: 0.85
        });
        const railingMat = new THREE.MeshStandardMaterial({
            color: 0x4A3A2E, roughness: 0.75
        });
        const metalRailMat = new THREE.MeshStandardMaterial({
            color: 0x555555, roughness: 0.4, metalness: 0.6
        });

        // --- Concrete support piers ---
        // Tall tapered piers descending into the ravine
        const numPiers = 5;
        const pierSpacing = (bridgeLength - 4) / (numPiers - 1);
        for (let i = 0; i < numPiers; i++) {
            const px = -bridgeLength / 2 + 2 + i * pierSpacing;
            // Pier height depends on position (taller in center of ravine)
            const distFromGulchCenter = Math.abs(px);
            const normalizedPierDist = distFromGulchCenter / (gulchWidth / 2);
            const pierDepth = Math.max(3, gulchDepth * Math.max(0, 1 - Math.pow(normalizedPierDist, 0.4)));

            const pier = new THREE.Mesh(
                new THREE.BoxGeometry(1.2, pierDepth, 1.8),
                concreteViaductMat
            );
            pier.position.set(px, -pierDepth / 2, 0);
            pier.castShadow = true;
            bridgeGroup.add(pier);

            // Pier cap (wider concrete pad at top)
            const pierCap = new THREE.Mesh(
                new THREE.BoxGeometry(2.0, 0.4, bridgeDeckWidth + 0.5),
                concreteViaductMat
            );
            pierCap.position.set(px, 0.2, 0);
            bridgeGroup.add(pierCap);
        }

        // --- Bridge deck (wooden planks) ---
        // Main deck structure (concrete base)
        const deckBase = new THREE.Mesh(
            new THREE.BoxGeometry(bridgeLength, 0.35, bridgeDeckWidth),
            concreteViaductMat
        );
        deckBase.position.set(0, 0, 0);
        deckBase.castShadow = true;
        deckBase.receiveShadow = true;
        bridgeGroup.add(deckBase);

        // Wooden plank surface
        for (let i = 0; i < bridgeLength; i += 0.6) {
            const plank = new THREE.Mesh(
                new THREE.BoxGeometry(0.5, 0.08, bridgeDeckWidth - 0.4),
                woodDeckMat
            );
            plank.position.set(i - bridgeLength / 2, 0.22, 0);
            plank.receiveShadow = true;
            bridgeGroup.add(plank);
        }

        // --- Railings ---
        // Substantial wooden railings with metal top rail
        [-1, 1].forEach(side => {
            const railZ = side * (bridgeDeckWidth / 2 - 0.15);

            // Vertical posts (every 2.5m)
            for (let i = 0; i < bridgeLength; i += 2.5) {
                const post = new THREE.Mesh(
                    new THREE.BoxGeometry(0.15, 1.2, 0.15),
                    railingMat
                );
                post.position.set(i - bridgeLength / 2, 0.6 + 0.22, railZ);
                post.castShadow = true;
                bridgeGroup.add(post);
            }

            // Horizontal rails (lower and upper)
            const lowerRail = new THREE.Mesh(
                new THREE.BoxGeometry(bridgeLength, 0.08, 0.12),
                railingMat
            );
            lowerRail.position.set(0, 0.65, railZ);
            bridgeGroup.add(lowerRail);

            // Metal top rail
            const topRail = new THREE.Mesh(
                new THREE.BoxGeometry(bridgeLength, 0.06, 0.08),
                metalRailMat
            );
            topRail.position.set(0, 1.32, railZ);
            bridgeGroup.add(topRail);

            // Mid rail (horizontal bar for safety)
            const midRail = new THREE.Mesh(
                new THREE.BoxGeometry(bridgeLength, 0.06, 0.06),
                metalRailMat
            );
            midRail.position.set(0, 0.95, railZ);
            bridgeGroup.add(midRail);
        });

        // Position bridge at ground level spanning the ravine
        bridgeGroup.position.set(gulchX, groundHeight + 0.1, bridgeZ);
        this.group.add(bridgeGroup);

        // ===== TREES IN AND AROUND THE RAVINE =====
        // Dense redwoods growing up from the ravine floor
        for (let i = 0; i < 40; i++) {
            const tx = gulchX + (Math.random() - 0.5) * 40;
            const tz = (buildingZ - 30) + (Math.random() - 0.5) * gulchLength;

            const tree = this.createRedwood();
            tree.position.set(tx, this.getTerrainHeight(tx, tz), tz);
            tree.scale.setScalar(0.5 + Math.random() * 1.5);
            this.group.add(tree);
        }
    }


    createChalkboards() {
        const positions = [
            { x: -35, z: 25, ry: Math.PI / 5, name: 'Algebra' },
            { x: 45, z: -5, ry: -Math.PI / 4, name: 'Geometry' },
            { x: -28, z: 50, ry: Math.PI / 3, name: 'Calculus' },
            { x: 40, z: 35, ry: -Math.PI / 6, name: 'Linear Algebra' },
            { x: -50, z: -15, ry: Math.PI / 8, name: 'Number Theory' }
        ];
        positions.forEach(p => {
            const board = this.createChalkboard(p.name);
            const h = this.getTerrainHeight(p.x, p.z);
            board.position.set(p.x, h, p.z);
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

