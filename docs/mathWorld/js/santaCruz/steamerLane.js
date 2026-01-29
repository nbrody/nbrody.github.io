/**
 * Santa Cruz - Steamer Lane & Lighthouse Point
 * Mark Abbott Memorial Lighthouse (brick building with tower)
 * Lighthouse Field State Beach with grassy bluffs and West Cliff Drive path
 * Famous surf break with reef/point waves
 */
import * as THREE from 'three';

export class SteamerLane {
    constructor(locationGroup, terrainHeightFn = null) {
        this.group = locationGroup;
        this.terrainHeightFn = terrainHeightFn;
    }

    async generate() {
        this.createLighthouseField();
        this.createBluffs();
        this.createMarkAbbottLighthouse();
        this.createWestCliffPath();
        this.createParkingLot();
        this.createOcean();
        this.createSurfers();
        this.createBenches();
    }

    getTerrainHeight(x, z) {
        if (this.terrainHeightFn) {
            return this.terrainHeightFn(x, z);
        }
        return 0;
    }

    createLighthouseField() {
        // Large grassy field - Lighthouse Field State Beach
        const fieldGeo = new THREE.PlaneGeometry(250, 180, 60, 60);
        const pos = fieldGeo.attributes.position;
        const colors = new Float32Array(pos.count * 3);

        for (let i = 0; i < pos.count; i++) {
            const x = pos.getX(i), z = pos.getZ(i);

            // Gentle undulations for natural grass field
            let h = Math.sin(x * 0.02) * Math.cos(z * 0.025) * 2;
            h += Math.sin(x * 0.05 + z * 0.03) * 0.5;

            // Slope down toward the ocean (south)
            h += Math.max(0, -z * 0.03);

            pos.setZ(i, h);

            // Grass colors with variation
            const grassVar = 0.3 + Math.random() * 0.2;
            colors[i * 3] = 0.35 + Math.random() * 0.1;     // R
            colors[i * 3 + 1] = 0.5 + grassVar * 0.15;      // G
            colors[i * 3 + 2] = 0.2 + Math.random() * 0.1;  // B
        }

        fieldGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        fieldGeo.computeVertexNormals();

        const fieldMat = new THREE.MeshStandardMaterial({
            vertexColors: true,
            roughness: 0.9
        });

        const field = new THREE.Mesh(fieldGeo, fieldMat);
        field.rotation.x = -Math.PI / 2;
        field.position.set(0, 0, -50);
        field.receiveShadow = true;
        this.group.add(field);

        // Scattered coastal scrub and ice plant
        this.addCoastalVegetation();
    }

    addCoastalVegetation() {
        // Ice plant clusters (pink/purple succulents along coast)
        const icePlantMat = new THREE.MeshStandardMaterial({
            color: 0x9966AA, roughness: 0.8
        });

        for (let i = 0; i < 30; i++) {
            const cluster = new THREE.Group();
            const size = 1 + Math.random() * 2;

            for (let j = 0; j < 5 + Math.random() * 5; j++) {
                const tuft = new THREE.Mesh(
                    new THREE.SphereGeometry(size * 0.3, 6, 6),
                    icePlantMat
                );
                tuft.position.set(
                    (Math.random() - 0.5) * size * 2,
                    size * 0.15,
                    (Math.random() - 0.5) * size * 2
                );
                tuft.scale.y = 0.5;
                cluster.add(tuft);
            }

            // Place along the bluff edge
            cluster.position.set(
                (Math.random() - 0.5) * 180,
                0,
                15 + Math.random() * 25
            );
            this.group.add(cluster);
        }

        // Coastal cypress trees (twisted, wind-shaped)
        const cypressMat = new THREE.MeshStandardMaterial({
            color: 0x2A4A30, roughness: 0.85
        });
        const trunkMat = new THREE.MeshStandardMaterial({
            color: 0x4A3A2A, roughness: 0.9
        });

        for (let i = 0; i < 8; i++) {
            const tree = new THREE.Group();

            // Twisted trunk
            const trunk = new THREE.Mesh(
                new THREE.CylinderGeometry(0.15, 0.25, 3, 6),
                trunkMat
            );
            trunk.position.y = 1.5;
            trunk.rotation.z = (Math.random() - 0.5) * 0.3; // Lean from wind
            tree.add(trunk);

            // Windswept foliage (flattened, leaning)
            const foliage = new THREE.Mesh(
                new THREE.SphereGeometry(2, 8, 6),
                cypressMat
            );
            foliage.scale.set(1.5, 0.8, 1);
            foliage.position.set(0.5, 3.5, 0);
            tree.add(foliage);

            tree.position.set(
                -60 + Math.random() * 40,
                0,
                -80 + Math.random() * 40
            );
            tree.scale.setScalar(0.8 + Math.random() * 0.6);
            this.group.add(tree);
        }
    }

    createBluffs() {
        // Rocky coastal bluffs dropping to the water
        const bluffMat = new THREE.MeshStandardMaterial({
            color: 0x6A5A4A,
            roughness: 0.95,
            flatShading: true
        });

        // Create main bluff edge
        const bluffGeo = new THREE.PlaneGeometry(200, 40, 40, 15);
        const pos = bluffGeo.attributes.position;
        const colors = new Float32Array(pos.count * 3);

        for (let i = 0; i < pos.count; i++) {
            const x = pos.getX(i), z = pos.getZ(i);

            // Steep cliff face with erosion patterns
            let h = z * 0.4; // Base slope
            h += Math.sin(x * 0.3) * 1.5; // Erosion gullies
            h += (Math.random() - 0.5) * 2; // Rocky texture

            pos.setZ(i, h);

            // Cliff colors - sandstone/mudstone mix
            const shade = 0.4 + Math.random() * 0.2;
            colors[i * 3] = shade * 1.2;
            colors[i * 3 + 1] = shade;
            colors[i * 3 + 2] = shade * 0.8;
        }

        bluffGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        bluffGeo.computeVertexNormals();

        const bluffMesh = new THREE.Mesh(bluffGeo, new THREE.MeshStandardMaterial({
            vertexColors: true,
            roughness: 0.95,
            flatShading: true
        }));
        bluffMesh.rotation.x = -Math.PI / 2 + 1.2; // Angled cliff face
        bluffMesh.position.set(0, -5, 50);
        this.group.add(bluffMesh);

        // Add rocky outcrops and tide pools at base
        this.addTidePoolRocks();
    }

    addTidePoolRocks() {
        const rockMat = new THREE.MeshStandardMaterial({
            color: 0x4A4040,
            roughness: 0.95,
            flatShading: true
        });

        // Point Santa Cruz - rocky point extending into water
        for (let i = 0; i < 25; i++) {
            const geo = new THREE.DodecahedronGeometry(1 + Math.random() * 2, 0);
            const rock = new THREE.Mesh(geo, rockMat);

            // Cluster around the point
            const angle = (Math.random() - 0.5) * 1.5;
            const dist = 20 + Math.random() * 30;

            rock.position.set(
                Math.sin(angle) * dist,
                -3 + Math.random() * 2,
                35 + Math.cos(angle) * dist * 0.5
            );
            rock.rotation.set(Math.random(), Math.random(), Math.random());
            rock.scale.y = 0.5 + Math.random() * 0.3;
            this.group.add(rock);
        }
    }

    createMarkAbbottLighthouse() {
        // Mark Abbott Memorial Lighthouse - brick building with attached tower
        // Houses the Santa Cruz Surfing Museum
        const lighthouse = new THREE.Group();
        lighthouse.userData = {
            name: 'Mark Abbott Memorial Lighthouse',
            description: 'Home of the Santa Cruz Surfing Museum. Built in 1967 as a memorial.',
            isInteractable: true,
            type: 'landmark',
            interactionType: 'Explore'
        };

        // Brick materials
        const brickMat = new THREE.MeshStandardMaterial({
            color: 0x8B4513,  // Reddish-brown brick
            roughness: 0.85
        });
        const darkBrickMat = new THREE.MeshStandardMaterial({
            color: 0x654321,
            roughness: 0.85
        });
        const concreteMat = new THREE.MeshStandardMaterial({
            color: 0x888888,
            roughness: 0.7
        });

        // Main building - rectangular brick structure
        const buildingWidth = 8;
        const buildingDepth = 6;
        const buildingHeight = 4;

        const building = new THREE.Mesh(
            new THREE.BoxGeometry(buildingWidth, buildingHeight, buildingDepth),
            brickMat
        );
        building.position.set(0, buildingHeight / 2, 0);
        building.castShadow = true;
        lighthouse.add(building);

        // Building roof - low pitch
        const roofGeo = new THREE.BoxGeometry(buildingWidth + 0.5, 0.5, buildingDepth + 0.5);
        const roof = new THREE.Mesh(roofGeo, darkBrickMat);
        roof.position.set(0, buildingHeight + 0.25, 0);
        lighthouse.add(roof);

        // Attached brick tower - square, shorter than typical lighthouse
        const towerSize = 3;
        const towerHeight = 8;

        const tower = new THREE.Mesh(
            new THREE.BoxGeometry(towerSize, towerHeight, towerSize),
            brickMat
        );
        tower.position.set(-buildingWidth / 2 + towerSize / 2, towerHeight / 2, 0);
        tower.castShadow = true;
        lighthouse.add(tower);

        // Tower cornice/trim
        const cornice = new THREE.Mesh(
            new THREE.BoxGeometry(towerSize + 0.3, 0.4, towerSize + 0.3),
            concreteMat
        );
        cornice.position.set(-buildingWidth / 2 + towerSize / 2, towerHeight + 0.2, 0);
        lighthouse.add(cornice);

        // Lantern room - octagonal cast iron (from Oakland Harbor Lighthouse)
        const lanternBase = new THREE.Mesh(
            new THREE.CylinderGeometry(1.3, 1.4, 0.5, 8),
            new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.3 })
        );
        lanternBase.position.set(-buildingWidth / 2 + towerSize / 2, towerHeight + 0.65, 0);
        lighthouse.add(lanternBase);

        // Glass lantern enclosure
        const lanternGlass = new THREE.Mesh(
            new THREE.CylinderGeometry(1.1, 1.2, 1.8, 8),
            new THREE.MeshStandardMaterial({
                color: 0xFFFFDD,
                transparent: true,
                opacity: 0.5,
                emissive: 0xFFFFAA,
                emissiveIntensity: 0.2
            })
        );
        lanternGlass.position.set(-buildingWidth / 2 + towerSize / 2, towerHeight + 1.8, 0);
        lighthouse.add(lanternGlass);

        // Lantern roof - dome
        const lanternRoof = new THREE.Mesh(
            new THREE.SphereGeometry(1.2, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2),
            new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.3 })
        );
        lanternRoof.position.set(-buildingWidth / 2 + towerSize / 2, towerHeight + 2.7, 0);
        lighthouse.add(lanternRoof);

        // Vent ball on top
        const ventBall = new THREE.Mesh(
            new THREE.SphereGeometry(0.2, 8, 8),
            new THREE.MeshStandardMaterial({ color: 0x1a1a1a })
        );
        ventBall.position.set(-buildingWidth / 2 + towerSize / 2, towerHeight + 3.3, 0);
        lighthouse.add(ventBall);

        // Windows on building (museum windows)
        const windowMat = new THREE.MeshStandardMaterial({
            color: 0x4477AA,
            roughness: 0.2,
            metalness: 0.3
        });

        // Front windows
        for (let i = 0; i < 3; i++) {
            const win = new THREE.Mesh(
                new THREE.BoxGeometry(1, 1.5, 0.1),
                windowMat
            );
            win.position.set(-2 + i * 2, 2.5, buildingDepth / 2 + 0.05);
            lighthouse.add(win);
        }

        // Entry door
        const doorMat = new THREE.MeshStandardMaterial({ color: 0x3A2A1A });
        const door = new THREE.Mesh(
            new THREE.BoxGeometry(1.2, 2.2, 0.1),
            doorMat
        );
        door.position.set(2.5, 1.1, buildingDepth / 2 + 0.05);
        lighthouse.add(door);

        // Small signage area for "Surfing Museum"
        const signMat = new THREE.MeshStandardMaterial({ color: 0xEEDDBB });
        const sign = new THREE.Mesh(
            new THREE.BoxGeometry(3, 0.6, 0.05),
            signMat
        );
        sign.position.set(0, 3.8, buildingDepth / 2 + 0.06);
        lighthouse.add(sign);

        // Position the lighthouse on the point
        lighthouse.position.set(0, 2, 20);
        this.group.add(lighthouse);

        // Add the memorial plaque area
        this.addMemorialPlaque(lighthouse.position);
    }

    addMemorialPlaque(lighthousePos) {
        // Mark Abbott memorial - ashes interred beneath tower
        const plaqueMat = new THREE.MeshStandardMaterial({
            color: 0xCD7F32,  // Bronze color
            roughness: 0.4,
            metalness: 0.5
        });

        const plaqueBase = new THREE.Mesh(
            new THREE.BoxGeometry(1.5, 0.1, 0.8),
            new THREE.MeshStandardMaterial({ color: 0x555555 })
        );
        plaqueBase.position.set(lighthousePos.x - 6, 0.5, lighthousePos.z + 4);
        this.group.add(plaqueBase);

        const plaque = new THREE.Mesh(
            new THREE.BoxGeometry(1.2, 0.8, 0.05),
            plaqueMat
        );
        plaque.position.set(lighthousePos.x - 6, 0.9, lighthousePos.z + 4);
        plaque.rotation.x = -0.3;
        this.group.add(plaque);
    }

    createWestCliffPath() {
        // Paved path along West Cliff Drive - popular for biking/walking
        const pathMat = new THREE.MeshStandardMaterial({
            color: 0x666666,
            roughness: 0.8
        });

        // Main path curve along the bluff
        const pathGeo = new THREE.PlaneGeometry(3, 200, 1, 50);
        const pos = pathGeo.attributes.position;

        for (let i = 0; i < pos.count; i++) {
            const z = pos.getY(i); // Y in plane geo becomes Z
            // Gentle curve following coastline
            const curve = Math.sin(z * 0.01) * 5;
            pos.setX(i, pos.getX(i) + curve);
        }
        pathGeo.computeVertexNormals();

        const path = new THREE.Mesh(pathGeo, pathMat);
        path.rotation.x = -Math.PI / 2;
        path.position.set(60, 0.1, -50);
        this.group.add(path);

        // Path stripe markings
        const stripeMat = new THREE.MeshStandardMaterial({ color: 0xCCCC00 });
        for (let i = 0; i < 20; i++) {
            const stripe = new THREE.Mesh(
                new THREE.BoxGeometry(0.2, 0.02, 2),
                stripeMat
            );
            stripe.position.set(60 + Math.sin(i * 0.3) * 5, 0.12, -100 + i * 10);
            this.group.add(stripe);
        }
    }

    createParkingLot() {
        // Small parking area near the lighthouse
        const lotMat = new THREE.MeshStandardMaterial({
            color: 0x444444,
            roughness: 0.9
        });

        const lot = new THREE.Mesh(
            new THREE.BoxGeometry(30, 0.1, 20),
            lotMat
        );
        lot.position.set(-40, 0.05, -30);
        this.group.add(lot);

        // Parking lines
        const lineMat = new THREE.MeshStandardMaterial({ color: 0xFFFFFF });
        for (let i = 0; i < 8; i++) {
            const line = new THREE.Mesh(
                new THREE.BoxGeometry(0.15, 0.02, 4),
                lineMat
            );
            line.position.set(-52 + i * 3.5, 0.12, -30);
            this.group.add(line);
        }
    }

    createOcean() {
        // Pacific Ocean with wave action at Steamer Lane break
        // Ocean should be at sea level (below the bluff edge)
        const oceanGeo = new THREE.PlaneGeometry(800, 400, 80, 40);
        const pos = oceanGeo.attributes.position;

        // Add gentle wave undulation
        for (let i = 0; i < pos.count; i++) {
            const x = pos.getX(i), y = pos.getY(i);
            const wave = Math.sin(x * 0.05) * Math.cos(y * 0.03) * 0.5;
            pos.setZ(i, wave);
        }
        oceanGeo.computeVertexNormals();

        const oceanMat = new THREE.MeshStandardMaterial({
            color: 0x1E6091,
            roughness: 0.15,
            metalness: 0.1,
            transparent: true,
            opacity: 0.9
        });

        const ocean = new THREE.Mesh(oceanGeo, oceanMat);
        ocean.rotation.x = -Math.PI / 2;
        // Position ocean at sea level - below the bluff but visible
        ocean.position.set(0, -15, 150);
        this.group.add(ocean);

        // Wave breaks - foam lines at the surf zone
        this.createWaveBreaks();
    }

    createWaveBreaks() {
        // Steamer Lane is famous for its right-hand point break
        const foamMat = new THREE.MeshStandardMaterial({
            color: 0xFFFFFF,
            transparent: true,
            opacity: 0.7
        });

        // Main wave line at "The Point"
        const waveGeo = new THREE.PlaneGeometry(60, 8, 30, 4);
        const pos = waveGeo.attributes.position;

        for (let i = 0; i < pos.count; i++) {
            const x = pos.getX(i);
            // Curving wave face
            const curve = Math.sin(x * 0.1) * 2;
            pos.setZ(i, curve + Math.random() * 0.5);
        }
        waveGeo.computeVertexNormals();

        const wave = new THREE.Mesh(waveGeo, foamMat);
        wave.rotation.x = -Math.PI / 2;
        wave.position.set(-10, -12, 100);  // Closer to bluff edge
        wave.rotation.z = 0.3; // Angled wave
        this.group.add(wave);

        // Secondary foam patches
        for (let i = 0; i < 15; i++) {
            const patch = new THREE.Mesh(
                new THREE.CircleGeometry(2 + Math.random() * 3, 8),
                foamMat
            );
            patch.rotation.x = -Math.PI / 2;
            patch.position.set(
                -30 + Math.random() * 60,
                -13 + Math.random(),
                80 + Math.random() * 50  // Spread through surf zone
            );
            this.group.add(patch);
        }
    }

    createSurfers() {
        // Surfers in the lineup at Steamer Lane
        const surferMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
        const boardColors = [0xFFFFFF, 0xFF6600, 0x00AAFF, 0xFFFF00, 0x222222];

        for (let i = 0; i < 12; i++) {
            const surfer = new THREE.Group();

            // Surfboard
            const boardMat = new THREE.MeshStandardMaterial({
                color: boardColors[Math.floor(Math.random() * boardColors.length)]
            });
            const board = new THREE.Mesh(
                new THREE.CapsuleGeometry(0.2, 1.8, 4, 8),
                boardMat
            );
            board.rotation.x = Math.PI / 2;
            board.scale.y = 0.15;
            surfer.add(board);

            // Person
            const body = new THREE.Mesh(
                new THREE.CapsuleGeometry(0.12, 0.5, 4, 8),
                surferMat
            );
            body.position.y = 0.25;

            // Some sitting, some paddling
            if (Math.random() > 0.5) {
                body.rotation.x = 0.3;
            } else {
                body.rotation.z = Math.PI / 6;
                body.position.y = 0.2;
            }
            surfer.add(body);

            // Position in the lineup (beyond the wave break)
            surfer.position.set(
                -25 + Math.random() * 50,
                -13,  // At ocean level
                90 + Math.random() * 40  // In the lineup area
            );

            // Face the waves
            surfer.rotation.y = Math.PI + (Math.random() - 0.5) * 0.5;

            this.group.add(surfer);
        }
    }

    createBenches() {
        // Viewing benches overlooking the surf
        const benchMat = new THREE.MeshStandardMaterial({
            color: 0x5A4030,
            roughness: 0.8
        });
        const metalMat = new THREE.MeshStandardMaterial({
            color: 0x333333,
            roughness: 0.5
        });

        for (let i = 0; i < 4; i++) {
            const bench = new THREE.Group();

            // Seat
            const seat = new THREE.Mesh(
                new THREE.BoxGeometry(1.8, 0.1, 0.5),
                benchMat
            );
            seat.position.y = 0.5;
            bench.add(seat);

            // Backrest
            const back = new THREE.Mesh(
                new THREE.BoxGeometry(1.8, 0.5, 0.08),
                benchMat
            );
            back.position.set(0, 0.8, -0.2);
            back.rotation.x = -0.15;
            bench.add(back);

            // Metal legs
            for (let j = 0; j < 2; j++) {
                const leg = new THREE.Mesh(
                    new THREE.BoxGeometry(0.08, 0.5, 0.4),
                    metalMat
                );
                leg.position.set(-0.7 + j * 1.4, 0.25, 0);
                bench.add(leg);
            }

            // Position along the bluff overlook
            bench.position.set(20 + i * 12, 0.5, 10);
            bench.rotation.y = Math.PI; // Face the ocean
            this.group.add(bench);
        }
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
