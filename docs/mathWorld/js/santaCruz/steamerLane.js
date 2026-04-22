/**
 * Santa Cruz - Steamer Lane & Lighthouse Point
 *
 * Lighthouse Field State Beach sits on top of a ~12 m marine terrace
 * bluff. The field itself is flat grassland at bluff-top elevation, the
 * bluff drops vertically to rocks and the Pacific, and a wooden
 * switchback staircase descends to the rocky shoreline.
 *
 * Real-world notes:
 *   - Lighthouse Field is famous for its monarch butterfly overwintering
 *     grove — dense clusters hang in the eucalyptus trees Oct–Feb.
 *   - Mark Abbott Memorial Lighthouse (1967) sits at the southern tip
 *     of the peninsula, housing the Santa Cruz Surfing Museum.
 *   - West Cliff Drive is a bike/pedestrian route along the bluff top;
 *     public stairs access the water at several points.
 *
 * Scene coordinate conventions (group-local):
 *   -Z is north (inland), +Z is south (ocean)
 *   +X is east, -X is west
 *   FIELD_Y = 0 is the bluff-top grass surface
 *   OCEAN_Y = -12 is sea level
 */
import * as THREE from 'three';

// ---- Scene constants ----
const FIELD_Y = 0;
const OCEAN_Y = -12;
const CLIFF_HEIGHT = FIELD_Y - OCEAN_Y;   // = 12
const CLIFF_EDGE_Z = 35;     // Field extends up to this Z; cliff begins here
const CLIFF_BASE_Z = 48;     // Bottom of cliff face meets rocks at this Z
const WEST_CLIFF_PATH_Z = 26; // Path runs along here, just inland of the edge

// Staircase down to the rocks — top landing at path edge, two switchbacks to rocks
const STAIR = {
    topX: 68, topZ: 30, topY: FIELD_Y,
    midX: 82, midZ: 40, midY: FIELD_Y - CLIFF_HEIGHT / 2, // Mid-platform
    bottomX: 66, bottomZ: 50, bottomY: OCEAN_Y + 0.3,    // Bottom at rocks
    width: 2.2
};

// Eucalyptus grove centre (SW of lighthouse, inland on the field)
const EUCALYPTUS_GROVE = { cx: -55, cz: -45, radius: 28, count: 14 };

export class SteamerLane {
    constructor(locationGroup, terrainHeightFn = null) {
        this.group = locationGroup;
        this.terrainHeightFn = terrainHeightFn;
        // Butterflies that animate each frame
        this._flyingMonarchs = [];
        this._monarchClusters = [];
        this._time = 0;
    }

    async generate() {
        this.createLighthouseField();
        this.createEucalyptusGrove();
        this.createCliffFace();
        this.createCliffBaseRocks();
        this.createStaircase();
        this.createMarkAbbottLighthouse();
        this.createWestCliffPath();
        this.createParkingLot();
        this.createOcean();
        this.createWaveBreaks();
        this.createSurfers();
        this.createBenches();
        this.addCoastalVegetation();
        this.createMonarchs();
        this.createSignage();
    }

    // ----------------------------------------------------------
    //  Terrain Y: authoritative height for player / object placement
    // ----------------------------------------------------------
    //   Inside the field footprint → bluff-top + gentle undulation.
    //   Past the cliff edge → ocean level (player can't get there
    //     except via the staircase; cliff mesh blocks horizontal movement,
    //     staircase steps provide objectY raycast surfaces).
    getTerrainHeight(x, z) {
        // On staircase footprint: let the object-surface raycast handle Y.
        // But return something sensible as a floor.
        if (this._isInField(x, z)) {
            return FIELD_Y + this._fieldUndulation(x, z);
        }
        // Past cliff edge or off-field: return ocean surface minus a hair
        // so the player's feet don't end up exactly at water level if they
        // step off the staircase at the bottom.
        return OCEAN_Y;
    }

    _isInField(x, z) {
        // Field mesh extends from z=-140 to z=+40, x=-125 to +125.
        // We use the cliff edge as the effective southern boundary.
        return x > -125 && x < 125 && z > -140 && z < CLIFF_EDGE_Z;
    }

    _fieldUndulation(x, z) {
        // Gentle rolling grassland — ±0.8 m. Matches the vertex wiggle
        // in createLighthouseField so objects and mesh agree.
        let h = Math.sin(x * 0.025) * Math.cos(z * 0.02) * 0.5;
        h += Math.sin(x * 0.06 + z * 0.04) * 0.25;
        return h;
    }

    // ==========================================================
    //  Lighthouse Field — flat bluff-top grassland at y=0
    // ==========================================================
    createLighthouseField() {
        const fieldGeo = new THREE.PlaneGeometry(260, 180, 70, 55);
        const pos = fieldGeo.attributes.position;
        const colors = new Float32Array(pos.count * 3);

        for (let i = 0; i < pos.count; i++) {
            // Plane XY → world XZ after -π/2 rotation. Plane Y becomes -Z.
            const lx = pos.getX(i);
            const ly = pos.getY(i);
            const worldX = lx;
            const worldZ = -ly - 50; // Field mesh is positioned at z=-50

            // Use the same undulation function as getTerrainHeight
            const h = this._fieldUndulation(worldX, worldZ);
            pos.setZ(i, h);

            // Grass colouring with subtle variation and a slightly drier,
            // coastal hue near the cliff edge.
            const distFromEdge = Math.max(0, CLIFF_EDGE_Z - worldZ);
            const edgeFactor = Math.min(1, distFromEdge / 20);
            // Lush green inland → drier yellow-green near the bluff
            const r = (0.38 + (1 - edgeFactor) * 0.12) + (Math.random() - 0.5) * 0.04;
            const g = (0.56 + edgeFactor * 0.06) + (Math.random() - 0.5) * 0.05;
            const b = (0.24 + (1 - edgeFactor) * 0.04) + (Math.random() - 0.5) * 0.03;
            colors[i * 3] = r;
            colors[i * 3 + 1] = g;
            colors[i * 3 + 2] = b;
        }

        fieldGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        fieldGeo.computeVertexNormals();

        const fieldMat = new THREE.MeshStandardMaterial({
            vertexColors: true, roughness: 0.92, metalness: 0
        });
        const field = new THREE.Mesh(fieldGeo, fieldMat);
        field.rotation.x = -Math.PI / 2;
        field.position.set(0, FIELD_Y, -50);
        field.receiveShadow = true;
        // Walking on the field: let terrain function handle Y, not a raycast
        // collision with this mesh (avoids tiny step jitter when walking).
        field.userData.noCollision = true;
        this.group.add(field);
    }

    // ==========================================================
    //  Cliff face — vertical rocky drop from field to rocks
    // ==========================================================
    //  The face is built in two segments that leave a natural notch at
    //  the staircase position — a real wave-cut cliff often has such a
    //  ravine, and it means the stairs don't visibly clip through the
    //  cliff mesh on the way down.
    createCliffFace() {
        // Stair notch spans roughly x ∈ [62, 85]. Two segments either side.
        this._createCliffSegment(-125, 60);
        this._createCliffSegment(86, 125);

        // Inside the notch: a recessed slot of bare rock (no flat face)
        // so the gap doesn't look like a hole in a wall.
        this._createCliffNotch(60, 86);

        // Thin warm-soil cap along the whole cliff edge (east-west band)
        // painted on top of the field mesh, for the dirt/grass transition.
        const capGeo = new THREE.PlaneGeometry(250, 2.2, 50, 1);
        const capMat = new THREE.MeshStandardMaterial({
            color: 0x6B5A3E, roughness: 0.9
        });
        const cap = new THREE.Mesh(capGeo, capMat);
        cap.rotation.x = -Math.PI / 2;
        cap.position.set(0, FIELD_Y + 0.04, CLIFF_EDGE_Z + 0.5);
        cap.userData.noCollision = true;
        this.group.add(cap);
    }

    _createCliffSegment(xStart, xEnd) {
        const width = xEnd - xStart;
        const centerX = (xStart + xEnd) / 2;
        const cliffGeo = new THREE.PlaneGeometry(width, CLIFF_HEIGHT + 2,
            Math.max(24, Math.round(width / 3)), 12);
        const pos = cliffGeo.attributes.position;
        const colors = new Float32Array(pos.count * 3);

        for (let i = 0; i < pos.count; i++) {
            const x = pos.getX(i);
            const y = pos.getY(i);
            let erosion = Math.sin(x * 0.28) * 0.7;
            erosion += Math.sin(y * 0.5) * 0.35;
            erosion += (Math.random() - 0.5) * 0.9;
            if (y > (CLIFF_HEIGHT + 2) / 2 - 1) erosion *= 0.2;
            pos.setZ(i, erosion);

            const relY = (y + (CLIFF_HEIGHT + 2) / 2) / (CLIFF_HEIGHT + 2);
            const base = 0.42 + relY * 0.15;
            const variance = (Math.random() - 0.5) * 0.12;
            colors[i * 3]     = base * 1.18 + variance;
            colors[i * 3 + 1] = base * 0.92 + variance;
            colors[i * 3 + 2] = base * 0.72 + variance;
        }

        cliffGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        cliffGeo.computeVertexNormals();

        const cliff = new THREE.Mesh(cliffGeo, new THREE.MeshStandardMaterial({
            vertexColors: true, roughness: 0.96, flatShading: true
        }));
        cliff.rotation.x = 0.09;
        cliff.position.set(centerX, FIELD_Y - CLIFF_HEIGHT / 2, CLIFF_EDGE_Z + 3);
        cliff.castShadow = true;
        cliff.receiveShadow = true;
        this.group.add(cliff);
    }

    // Recessed rocky slot between the two cliff segments — makes the
    // cliff look like it has a natural ravine rather than a square hole.
    _createCliffNotch(xStart, xEnd) {
        const rockMat = new THREE.MeshStandardMaterial({
            color: 0x5A534A, roughness: 0.96, flatShading: true
        });
        // Two back walls angled inward, meeting at the cliff base behind
        // the staircase, forming a little "alcove"
        const width = xEnd - xStart;
        const centerX = (xStart + xEnd) / 2;
        const backZ = CLIFF_EDGE_Z + 10; // Recessed behind the normal cliff plane
        const backWallGeo = new THREE.PlaneGeometry(width * 0.9, CLIFF_HEIGHT + 2, 10, 6);
        const backPos = backWallGeo.attributes.position;
        for (let i = 0; i < backPos.count; i++) {
            const x = backPos.getX(i);
            const y = backPos.getY(i);
            const e = Math.sin(x * 0.3) * 0.4 + (Math.random() - 0.5) * 0.7;
            backPos.setZ(i, e);
        }
        backWallGeo.computeVertexNormals();
        const backWall = new THREE.Mesh(backWallGeo, rockMat);
        backWall.position.set(centerX, FIELD_Y - CLIFF_HEIGHT / 2, backZ);
        backWall.castShadow = true;
        this.group.add(backWall);

        // Side walls (angled, closing off the alcove on left and right)
        for (const side of [-1, 1]) {
            const sideGeo = new THREE.PlaneGeometry(
                Math.abs(backZ - CLIFF_EDGE_Z - 3), CLIFF_HEIGHT + 2, 6, 8
            );
            const sp = sideGeo.attributes.position;
            for (let i = 0; i < sp.count; i++) {
                sp.setZ(i, (Math.random() - 0.5) * 0.6);
            }
            sideGeo.computeVertexNormals();
            const sideWall = new THREE.Mesh(sideGeo, rockMat);
            sideWall.rotation.y = -side * Math.PI / 2;
            sideWall.position.set(
                centerX + side * (width / 2 - 0.5),
                FIELD_Y - CLIFF_HEIGHT / 2,
                (CLIFF_EDGE_Z + 3 + backZ) / 2
            );
            sideWall.castShadow = true;
            this.group.add(sideWall);
        }
    }

    createCliffBaseRocks() {
        // Chunky boulders and intertidal rocks at the base of the cliff —
        // the kind of terrain you'd hop across to get to a tide pool.
        const rockMat = new THREE.MeshStandardMaterial({
            color: 0x4A443C, roughness: 0.95, flatShading: true
        });
        const kelpMat = new THREE.MeshStandardMaterial({
            color: 0x2F4030, roughness: 0.9
        });

        // Rocks along the full cliff-base line
        for (let i = 0; i < 60; i++) {
            const geo = new THREE.DodecahedronGeometry(1 + Math.random() * 2.5, 0);
            const rock = new THREE.Mesh(geo, rockMat);
            const rx = -115 + Math.random() * 230;
            const rz = CLIFF_BASE_Z + (Math.random() - 0.3) * 18;
            rock.position.set(
                rx,
                OCEAN_Y + 0.4 + Math.random() * 1.4,
                rz
            );
            rock.rotation.set(Math.random(), Math.random(), Math.random());
            rock.scale.y = 0.5 + Math.random() * 0.6;
            rock.castShadow = true;
            this.group.add(rock);
        }

        // A small outcrop point at the southern tip (under lighthouse)
        for (let i = 0; i < 20; i++) {
            const geo = new THREE.DodecahedronGeometry(1.2 + Math.random() * 2.8, 0);
            const rock = new THREE.Mesh(geo, rockMat);
            const angle = (Math.random() - 0.5) * 1.2;
            const dist = 10 + Math.random() * 20;
            rock.position.set(
                Math.sin(angle) * dist,
                OCEAN_Y + Math.random() * 1.8,
                CLIFF_BASE_Z + 8 + Math.cos(angle) * dist * 0.5
            );
            rock.rotation.set(Math.random(), Math.random(), Math.random());
            rock.scale.y = 0.45 + Math.random() * 0.5;
            this.group.add(rock);
        }

        // Scattered kelp/seaweed patches on the wetter rocks
        for (let i = 0; i < 18; i++) {
            const kelp = new THREE.Mesh(
                new THREE.SphereGeometry(0.45 + Math.random() * 0.4, 6, 5),
                kelpMat
            );
            kelp.scale.set(1.3, 0.3, 1.3);
            kelp.position.set(
                -100 + Math.random() * 200,
                OCEAN_Y + 0.1,
                CLIFF_BASE_Z + Math.random() * 15
            );
            kelp.userData.noCollision = true;
            this.group.add(kelp);
        }
    }

    // ==========================================================
    //  Staircase down the cliff (wooden switchback)
    // ==========================================================
    createStaircase() {
        const woodMat = new THREE.MeshStandardMaterial({
            color: 0x7A5A3A, roughness: 0.85
        });
        const railMat = new THREE.MeshStandardMaterial({
            color: 0x2A2A2A, roughness: 0.5, metalness: 0.5
        });
        const concreteMat = new THREE.MeshStandardMaterial({
            color: 0x8C8680, roughness: 0.9
        });

        const S = STAIR;
        const staircase = new THREE.Group();
        staircase.userData = {
            name: 'West Cliff Drive Stairs',
            type: 'stairs'
        };

        // ---- Top landing: square platform flush with the field ----
        const topLanding = new THREE.Mesh(
            new THREE.BoxGeometry(S.width + 0.4, 0.25, 2.2),
            concreteMat
        );
        topLanding.position.set(S.topX, S.topY - 0.125, S.topZ);
        topLanding.receiveShadow = true;
        staircase.add(topLanding);

        // Opening in the cliff-top fence to mark the entry to the stairs
        // (we draw railings on either side of the landing to "frame" it)

        // ---- Flight 1: top landing → mid platform (east-southward descent) ----
        this._buildStairFlight(
            staircase, woodMat, railMat,
            S.topX, S.topY, S.topZ,
            S.midX, S.midY, S.midZ,
            S.width
        );

        // ---- Mid platform ----
        const midPlatform = new THREE.Mesh(
            new THREE.BoxGeometry(S.width + 0.4, 0.2, S.width + 0.4),
            concreteMat
        );
        midPlatform.position.set(S.midX, S.midY - 0.1, S.midZ);
        midPlatform.receiveShadow = true;
        midPlatform.castShadow = true;
        staircase.add(midPlatform);

        // Mid-platform railings (U-shape on the ocean side)
        const midRailH = 1.1;
        for (const sx of [-0.5, 0.5]) {
            const post = new THREE.Mesh(
                new THREE.CylinderGeometry(0.04, 0.04, midRailH, 6),
                railMat
            );
            post.position.set(
                S.midX + sx * (S.width + 0.2),
                S.midY + midRailH / 2,
                S.midZ + (S.width / 2 + 0.1)
            );
            staircase.add(post);
        }
        // Horizontal rail on the ocean-facing edge
        const midRail = new THREE.Mesh(
            new THREE.BoxGeometry(S.width + 0.6, 0.06, 0.06),
            railMat
        );
        midRail.position.set(S.midX, S.midY + 1.0, S.midZ + (S.width / 2 + 0.1));
        staircase.add(midRail);

        // ---- Flight 2: mid platform → bottom (west-southward descent) ----
        this._buildStairFlight(
            staircase, woodMat, railMat,
            S.midX, S.midY, S.midZ,
            S.bottomX, S.bottomY, S.bottomZ,
            S.width
        );

        // ---- Bottom landing on the rocks ----
        const bottom = new THREE.Mesh(
            new THREE.BoxGeometry(S.width + 0.6, 0.2, 2.0),
            concreteMat
        );
        bottom.position.set(S.bottomX, S.bottomY - 0.1, S.bottomZ);
        bottom.receiveShadow = true;
        staircase.add(bottom);

        this.group.add(staircase);
    }

    // Build one flight of stairs as a sequence of tread boxes between
    // two endpoints, each tread sitting on the stringer at the right Y.
    _buildStairFlight(parent, woodMat, railMat, x1, y1, z1, x2, y2, z2, width) {
        const dx = x2 - x1, dy = y2 - y1, dz = z2 - z1;
        const len = Math.sqrt(dx * dx + dz * dz);
        const numSteps = Math.max(6, Math.round(-dy / 0.3));
        const stepRiser = dy / numSteps;    // Negative (going down)
        const stepTread = len / numSteps;
        // Heading (in XZ plane) of the flight
        const heading = Math.atan2(dx, dz);
        const cosH = Math.cos(heading), sinH = Math.sin(heading);

        for (let s = 0; s < numSteps; s++) {
            const t = (s + 0.5) / numSteps;
            const cx = x1 + dx * t;
            const cz = z1 + dz * t;
            const cy = y1 + dy * t - 0.02; // top of tread sits at desired Y

            // Tread (wooden plank)
            const tread = new THREE.Mesh(
                new THREE.BoxGeometry(width, 0.1, stepTread + 0.05),
                woodMat
            );
            tread.position.set(cx, cy, cz);
            tread.rotation.y = heading;
            tread.castShadow = true;
            tread.receiveShadow = true;
            parent.add(tread);

            // Riser (small dark panel below the tread front)
            if (s > 0) {
                const riser = new THREE.Mesh(
                    new THREE.BoxGeometry(width, Math.abs(stepRiser) + 0.02, 0.04),
                    new THREE.MeshStandardMaterial({ color: 0x3A2818, roughness: 0.9 })
                );
                riser.position.set(
                    cx - sinH * stepTread / 2,
                    cy - Math.abs(stepRiser) / 2 - 0.05,
                    cz - cosH * stepTread / 2
                );
                riser.rotation.y = heading;
                parent.add(riser);
            }
        }

        // Stringers (diagonal beams under the stairs)
        const stringerLen = Math.sqrt(len * len + dy * dy);
        for (const sw of [-width / 2, width / 2]) {
            const stringer = new THREE.Mesh(
                new THREE.BoxGeometry(0.15, 0.4, stringerLen),
                woodMat
            );
            const mx = (x1 + x2) / 2, mz = (z1 + z2) / 2, my = (y1 + y2) / 2;
            // Lateral offset for left/right stringer
            stringer.position.set(mx + cosH * sw, my - 0.35, mz - sinH * sw);
            stringer.rotation.y = heading;
            // Tilt the stringer to match the stair slope
            stringer.rotation.x = -Math.atan2(dy, len);
            parent.add(stringer);
        }

        // Railing posts + top rail on both sides
        const railH = 1.0;
        const nPosts = 4;
        for (const sw of [-1, 1]) {
            for (let p = 0; p <= nPosts; p++) {
                const t = p / nPosts;
                const px = x1 + dx * t + cosH * (sw * (width / 2 + 0.08));
                const pz = z1 + dz * t - sinH * (sw * (width / 2 + 0.08));
                const py = y1 + dy * t;
                const post = new THREE.Mesh(
                    new THREE.CylinderGeometry(0.04, 0.04, railH, 6),
                    railMat
                );
                post.position.set(px, py + railH / 2, pz);
                parent.add(post);
            }
            // Top rail (one long tube)
            const rail = new THREE.Mesh(
                new THREE.BoxGeometry(0.05, 0.05, stringerLen),
                railMat
            );
            const mx = (x1 + x2) / 2, mz = (z1 + z2) / 2, my = (y1 + y2) / 2;
            rail.position.set(
                mx + cosH * (sw * (width / 2 + 0.08)),
                my + railH,
                mz - sinH * (sw * (width / 2 + 0.08))
            );
            rail.rotation.y = heading;
            rail.rotation.x = -Math.atan2(dy, len);
            parent.add(rail);
        }
    }

    // ==========================================================
    //  Mark Abbott Memorial Lighthouse (1967)
    // ==========================================================
    createMarkAbbottLighthouse() {
        const lighthouse = new THREE.Group();
        lighthouse.userData = {
            name: 'Mark Abbott Memorial Lighthouse',
            description: 'Home of the Santa Cruz Surfing Museum. Built in 1967 as a memorial.',
            isInteractable: true,
            type: 'landmark',
            interactionType: 'Explore'
        };

        const brickMat = new THREE.MeshStandardMaterial({ color: 0x8B4513, roughness: 0.85 });
        const darkBrickMat = new THREE.MeshStandardMaterial({ color: 0x654321, roughness: 0.85 });
        const concreteMat = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.7 });

        const buildingWidth = 8, buildingDepth = 6, buildingHeight = 4;
        const building = new THREE.Mesh(
            new THREE.BoxGeometry(buildingWidth, buildingHeight, buildingDepth), brickMat
        );
        building.position.set(0, buildingHeight / 2, 0);
        building.castShadow = true;
        lighthouse.add(building);

        const roof = new THREE.Mesh(
            new THREE.BoxGeometry(buildingWidth + 0.5, 0.5, buildingDepth + 0.5),
            darkBrickMat
        );
        roof.position.set(0, buildingHeight + 0.25, 0);
        lighthouse.add(roof);

        const towerSize = 3, towerHeight = 8;
        const tower = new THREE.Mesh(
            new THREE.BoxGeometry(towerSize, towerHeight, towerSize), brickMat
        );
        tower.position.set(-buildingWidth / 2 + towerSize / 2, towerHeight / 2, 0);
        tower.castShadow = true;
        lighthouse.add(tower);

        const cornice = new THREE.Mesh(
            new THREE.BoxGeometry(towerSize + 0.3, 0.4, towerSize + 0.3), concreteMat
        );
        cornice.position.set(-buildingWidth / 2 + towerSize / 2, towerHeight + 0.2, 0);
        lighthouse.add(cornice);

        const lanternBase = new THREE.Mesh(
            new THREE.CylinderGeometry(1.3, 1.4, 0.5, 8),
            new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.3 })
        );
        lanternBase.position.set(-buildingWidth / 2 + towerSize / 2, towerHeight + 0.65, 0);
        lighthouse.add(lanternBase);

        const lanternGlass = new THREE.Mesh(
            new THREE.CylinderGeometry(1.1, 1.2, 1.8, 8),
            new THREE.MeshStandardMaterial({
                color: 0xFFFFDD, transparent: true, opacity: 0.5,
                emissive: 0xFFFFAA, emissiveIntensity: 0.35
            })
        );
        lanternGlass.position.set(-buildingWidth / 2 + towerSize / 2, towerHeight + 1.8, 0);
        lighthouse.add(lanternGlass);

        const lanternRoof = new THREE.Mesh(
            new THREE.SphereGeometry(1.2, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2),
            new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.3 })
        );
        lanternRoof.position.set(-buildingWidth / 2 + towerSize / 2, towerHeight + 2.7, 0);
        lighthouse.add(lanternRoof);

        const ventBall = new THREE.Mesh(
            new THREE.SphereGeometry(0.2, 8, 8),
            new THREE.MeshStandardMaterial({ color: 0x1a1a1a })
        );
        ventBall.position.set(-buildingWidth / 2 + towerSize / 2, towerHeight + 3.3, 0);
        lighthouse.add(ventBall);

        // Windows
        const windowMat = new THREE.MeshStandardMaterial({
            color: 0x4477AA, roughness: 0.2, metalness: 0.3
        });
        for (let i = 0; i < 3; i++) {
            const win = new THREE.Mesh(
                new THREE.BoxGeometry(1, 1.5, 0.1), windowMat
            );
            win.position.set(-2 + i * 2, 2.5, buildingDepth / 2 + 0.05);
            lighthouse.add(win);
        }

        // Door
        const door = new THREE.Mesh(
            new THREE.BoxGeometry(1.2, 2.2, 0.1),
            new THREE.MeshStandardMaterial({ color: 0x3A2A1A })
        );
        door.position.set(2.5, 1.1, buildingDepth / 2 + 0.05);
        lighthouse.add(door);

        // Sign
        const sign = new THREE.Mesh(
            new THREE.BoxGeometry(3, 0.6, 0.05),
            new THREE.MeshStandardMaterial({ color: 0xEEDDBB })
        );
        sign.position.set(0, 3.8, buildingDepth / 2 + 0.06);
        lighthouse.add(sign);

        // Position the lighthouse on the southern tip of the point,
        // right at the cliff edge above the rocks. Building extends
        // from z=29 to z=35 — north face is past the West Cliff path,
        // south face sits exactly at the cliff edge.
        lighthouse.position.set(0, FIELD_Y, 32);
        this.group.add(lighthouse);

        this.addMemorialPlaque(lighthouse.position);
    }

    addMemorialPlaque(lighthousePos) {
        const plaqueBase = new THREE.Mesh(
            new THREE.BoxGeometry(1.5, 0.1, 0.8),
            new THREE.MeshStandardMaterial({ color: 0x555555 })
        );
        plaqueBase.position.set(lighthousePos.x - 6, FIELD_Y + 0.5, lighthousePos.z + 4);
        this.group.add(plaqueBase);

        const plaque = new THREE.Mesh(
            new THREE.BoxGeometry(1.2, 0.8, 0.05),
            new THREE.MeshStandardMaterial({
                color: 0xCD7F32, roughness: 0.4, metalness: 0.5
            })
        );
        plaque.position.set(lighthousePos.x - 6, FIELD_Y + 0.9, lighthousePos.z + 4);
        plaque.rotation.x = -0.3;
        this.group.add(plaque);
    }

    // ==========================================================
    //  West Cliff Drive — paved bike path along the bluff top
    // ==========================================================
    createWestCliffPath() {
        const pathMat = new THREE.MeshStandardMaterial({
            color: 0x6E6B66, roughness: 0.82
        });
        // Sampled path that gently curves to follow the (local) shoreline
        const pathSegments = 40;
        const pathWidth = 3.2;
        const xStart = -120, xEnd = 120;
        for (let i = 0; i < pathSegments; i++) {
            const t0 = i / pathSegments;
            const t1 = (i + 1) / pathSegments;
            const x0 = xStart + (xEnd - xStart) * t0;
            const x1 = xStart + (xEnd - xStart) * t1;
            // A slight sinuous curve
            const z0 = WEST_CLIFF_PATH_Z + Math.sin(x0 * 0.02) * 1.5;
            const z1 = WEST_CLIFF_PATH_Z + Math.sin(x1 * 0.02) * 1.5;
            const cx = (x0 + x1) / 2;
            const cz = (z0 + z1) / 2;
            const dx = x1 - x0, dz = z1 - z0;
            const len = Math.sqrt(dx * dx + dz * dz);
            const seg = new THREE.Mesh(
                new THREE.PlaneGeometry(pathWidth, len),
                pathMat
            );
            seg.rotation.x = -Math.PI / 2;
            seg.rotation.z = Math.atan2(dx, dz);
            seg.position.set(cx, FIELD_Y + 0.03 + this._fieldUndulation(cx, cz), cz);
            seg.receiveShadow = true;
            seg.userData.noCollision = true;
            this.group.add(seg);
        }

        // Dashed yellow centre stripe
        const stripeMat = new THREE.MeshBasicMaterial({ color: 0xE8C440 });
        for (let i = 0; i < 30; i++) {
            const px = -110 + i * 7.5;
            const pz = WEST_CLIFF_PATH_Z + Math.sin(px * 0.02) * 1.5;
            const stripe = new THREE.Mesh(
                new THREE.PlaneGeometry(0.15, 2),
                stripeMat
            );
            stripe.rotation.x = -Math.PI / 2;
            stripe.position.set(px, FIELD_Y + 0.08 + this._fieldUndulation(px, pz), pz);
            stripe.userData.noCollision = true;
            this.group.add(stripe);
        }

        // A spur connecting the main path to the staircase top landing
        const spurMat = pathMat;
        const spurSegs = 5;
        for (let i = 0; i < spurSegs; i++) {
            const t0 = i / spurSegs;
            const t1 = (i + 1) / spurSegs;
            const sx = 70, px = STAIR.topX;
            const sz = WEST_CLIFF_PATH_Z, pz = STAIR.topZ;
            const x0 = sx + (px - sx) * t0;
            const x1 = sx + (px - sx) * t1;
            const z0 = sz + (pz - sz) * t0;
            const z1 = sz + (pz - sz) * t1;
            const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
            const len = Math.sqrt((x1 - x0) ** 2 + (z1 - z0) ** 2);
            const seg = new THREE.Mesh(
                new THREE.PlaneGeometry(2.0, len), spurMat
            );
            seg.rotation.x = -Math.PI / 2;
            seg.rotation.z = Math.atan2(x1 - x0, z1 - z0);
            seg.position.set(cx, FIELD_Y + 0.03, cz);
            seg.userData.noCollision = true;
            this.group.add(seg);
        }

        // Cliff-edge fence between path and cliff, broken open at the stairs.
        this._addCliffFence();
    }

    _addCliffFence() {
        const postMat = new THREE.MeshStandardMaterial({
            color: 0x1E1E1E, roughness: 0.55, metalness: 0.5
        });
        const cableMat = new THREE.MeshStandardMaterial({
            color: 0x888888, roughness: 0.4, metalness: 0.8
        });
        const fenceZ = CLIFF_EDGE_Z - 1.5;
        const fenceTopY = FIELD_Y + 1.05;
        // Skip posts inside the staircase notch (cliff-face gap x ∈ [60, 86])
        const NOTCH_W = 60, NOTCH_E = 86;
        // Posts every ~5 m along the cliff edge
        for (let x = -115; x <= 115; x += 5) {
            if (x > NOTCH_W && x < NOTCH_E) continue;
            const post = new THREE.Mesh(
                new THREE.CylinderGeometry(0.05, 0.05, 1.1, 6),
                postMat
            );
            post.position.set(x, FIELD_Y + 0.55, fenceZ);
            post.castShadow = true;
            this.group.add(post);
        }
        // Two horizontal cables — west half and east half, broken at the notch
        const segments = [
            { x1: -115, x2: NOTCH_W },
            { x1: NOTCH_E, x2: 115 }
        ];
        for (const seg of segments) {
            const len = seg.x2 - seg.x1;
            if (len <= 0) continue;
            for (const cy of [fenceTopY, fenceTopY - 0.45]) {
                const cable = new THREE.Mesh(
                    new THREE.CylinderGeometry(0.015, 0.015, len, 4),
                    cableMat
                );
                cable.rotation.z = Math.PI / 2;
                cable.position.set((seg.x1 + seg.x2) / 2, cy, fenceZ);
                this.group.add(cable);
            }
        }
    }

    createParkingLot() {
        const lotMat = new THREE.MeshStandardMaterial({
            color: 0x3A3A3A, roughness: 0.9
        });
        const lot = new THREE.Mesh(
            new THREE.BoxGeometry(30, 0.12, 20), lotMat
        );
        lot.position.set(-40, FIELD_Y + 0.06, -100);
        lot.userData.noCollision = true;
        this.group.add(lot);

        // Parking lines
        const lineMat = new THREE.MeshStandardMaterial({ color: 0xEFEAD8 });
        for (let i = 0; i < 8; i++) {
            const line = new THREE.Mesh(
                new THREE.BoxGeometry(0.12, 0.02, 4), lineMat
            );
            line.position.set(-52 + i * 3.5, FIELD_Y + 0.14, -100);
            line.userData.noCollision = true;
            this.group.add(line);
        }
    }

    createOcean() {
        const oceanGeo = new THREE.PlaneGeometry(800, 400, 80, 40);
        const pos = oceanGeo.attributes.position;
        for (let i = 0; i < pos.count; i++) {
            const x = pos.getX(i), y = pos.getY(i);
            const wave = Math.sin(x * 0.05) * Math.cos(y * 0.03) * 0.4;
            pos.setZ(i, wave);
        }
        oceanGeo.computeVertexNormals();
        const oceanMat = new THREE.MeshStandardMaterial({
            color: 0x1E6091, roughness: 0.15, metalness: 0.1,
            transparent: true, opacity: 0.92
        });
        const ocean = new THREE.Mesh(oceanGeo, oceanMat);
        ocean.rotation.x = -Math.PI / 2;
        ocean.position.set(0, OCEAN_Y, 180);
        ocean.userData.noCollision = true;
        this.group.add(ocean);
    }

    createWaveBreaks() {
        const foamMat = new THREE.MeshStandardMaterial({
            color: 0xFFFFFF, transparent: true, opacity: 0.7
        });
        const waveGeo = new THREE.PlaneGeometry(60, 8, 30, 4);
        const pos = waveGeo.attributes.position;
        for (let i = 0; i < pos.count; i++) {
            const x = pos.getX(i);
            pos.setZ(i, Math.sin(x * 0.1) * 2 + Math.random() * 0.5);
        }
        waveGeo.computeVertexNormals();

        const wave = new THREE.Mesh(waveGeo, foamMat);
        wave.rotation.x = -Math.PI / 2;
        wave.position.set(-10, OCEAN_Y + 1.2, 95);
        wave.rotation.z = 0.3;
        wave.userData.noCollision = true;
        this.group.add(wave);

        for (let i = 0; i < 15; i++) {
            const patch = new THREE.Mesh(
                new THREE.CircleGeometry(2 + Math.random() * 3, 8), foamMat
            );
            patch.rotation.x = -Math.PI / 2;
            patch.position.set(
                -30 + Math.random() * 60,
                OCEAN_Y + 0.8 + Math.random() * 0.4,
                80 + Math.random() * 50
            );
            patch.userData.noCollision = true;
            this.group.add(patch);
        }
    }

    createSurfers() {
        const surferMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
        const boardColors = [0xFFFFFF, 0xFF6600, 0x00AAFF, 0xFFFF00, 0x222222];

        for (let i = 0; i < 12; i++) {
            const surfer = new THREE.Group();
            const boardMat = new THREE.MeshStandardMaterial({
                color: boardColors[Math.floor(Math.random() * boardColors.length)]
            });
            const board = new THREE.Mesh(
                new THREE.CapsuleGeometry(0.2, 1.8, 4, 8), boardMat
            );
            board.rotation.x = Math.PI / 2;
            board.scale.y = 0.15;
            surfer.add(board);

            const body = new THREE.Mesh(
                new THREE.CapsuleGeometry(0.12, 0.5, 4, 8), surferMat
            );
            body.position.y = 0.25;
            if (Math.random() > 0.5) body.rotation.x = 0.3;
            else { body.rotation.z = Math.PI / 6; body.position.y = 0.2; }
            surfer.add(body);

            surfer.position.set(
                -25 + Math.random() * 50,
                OCEAN_Y + 0.4,
                90 + Math.random() * 40
            );
            surfer.rotation.y = Math.PI + (Math.random() - 0.5) * 0.5;
            this.group.add(surfer);
        }
    }

    createBenches() {
        const benchMat = new THREE.MeshStandardMaterial({
            color: 0x5A4030, roughness: 0.8
        });
        const metalMat = new THREE.MeshStandardMaterial({
            color: 0x333333, roughness: 0.5
        });

        // Benches along the cliff edge, facing the ocean
        const benchXs = [-75, -45, -15, 20, 50, 85];
        for (const bx of benchXs) {
            const bench = new THREE.Group();
            const seat = new THREE.Mesh(
                new THREE.BoxGeometry(1.8, 0.1, 0.5), benchMat
            );
            seat.position.y = 0.5;
            bench.add(seat);

            const back = new THREE.Mesh(
                new THREE.BoxGeometry(1.8, 0.5, 0.08), benchMat
            );
            back.position.set(0, 0.8, -0.2);
            back.rotation.x = -0.15;
            bench.add(back);

            for (let j = 0; j < 2; j++) {
                const leg = new THREE.Mesh(
                    new THREE.BoxGeometry(0.08, 0.5, 0.4), metalMat
                );
                leg.position.set(-0.7 + j * 1.4, 0.25, 0);
                bench.add(leg);
            }

            bench.position.set(bx, FIELD_Y + this._fieldUndulation(bx, 20), 20);
            bench.rotation.y = Math.PI; // Face +Z (ocean)
            this.group.add(bench);
        }
    }

    addCoastalVegetation() {
        // Ice plant clusters along the cliff edge
        const icePlantMat = new THREE.MeshStandardMaterial({
            color: 0x9966AA, roughness: 0.8
        });
        for (let i = 0; i < 28; i++) {
            const cluster = new THREE.Group();
            const size = 1 + Math.random() * 1.8;
            for (let j = 0; j < 5 + Math.random() * 5; j++) {
                const tuft = new THREE.Mesh(
                    new THREE.SphereGeometry(size * 0.3, 6, 6), icePlantMat
                );
                tuft.position.set(
                    (Math.random() - 0.5) * size * 2, size * 0.15,
                    (Math.random() - 0.5) * size * 2
                );
                tuft.scale.y = 0.5;
                cluster.add(tuft);
            }
            const cx = (Math.random() - 0.5) * 210;
            const cz = CLIFF_EDGE_Z - 4 + Math.random() * 6;
            cluster.position.set(cx, FIELD_Y + this._fieldUndulation(cx, cz), cz);
            this.group.add(cluster);
        }

        // A few windswept coastal cypress away from the eucalyptus grove
        const cypressMat = new THREE.MeshStandardMaterial({
            color: 0x2A4A30, roughness: 0.85
        });
        const trunkMat = new THREE.MeshStandardMaterial({
            color: 0x4A3A2A, roughness: 0.9
        });
        for (let i = 0; i < 6; i++) {
            const tree = new THREE.Group();
            const trunk = new THREE.Mesh(
                new THREE.CylinderGeometry(0.15, 0.25, 3, 6), trunkMat
            );
            trunk.position.y = 1.5;
            trunk.rotation.z = (Math.random() - 0.5) * 0.3;
            tree.add(trunk);

            const foliage = new THREE.Mesh(
                new THREE.SphereGeometry(2, 8, 6), cypressMat
            );
            foliage.scale.set(1.5, 0.8, 1);
            foliage.position.set(0.5, 3.5, 0);
            tree.add(foliage);

            const tx = 55 + Math.random() * 35;
            const tz = -110 + Math.random() * 35;
            tree.position.set(tx, FIELD_Y + this._fieldUndulation(tx, tz), tz);
            tree.scale.setScalar(0.8 + Math.random() * 0.6);
            this.group.add(tree);
        }
    }

    // ==========================================================
    //  Eucalyptus grove — the famous monarch overwintering site
    // ==========================================================
    createEucalyptusGrove() {
        const G = EUCALYPTUS_GROVE;
        const trunkMat = new THREE.MeshStandardMaterial({
            color: 0xB5A490, roughness: 0.75  // Pale patchy bark
        });
        const trunkDarkMat = new THREE.MeshStandardMaterial({
            color: 0x7E6A52, roughness: 0.85
        });
        const leafMat = new THREE.MeshStandardMaterial({
            color: new THREE.Color().setHSL(0.28, 0.3, 0.33), roughness: 0.8
        });
        const leafMat2 = new THREE.MeshStandardMaterial({
            color: new THREE.Color().setHSL(0.3, 0.25, 0.38), roughness: 0.8
        });

        // Remember the two largest trees so we can hang monarch clusters on them
        this._monarchTrees = [];

        for (let i = 0; i < G.count; i++) {
            const tree = new THREE.Group();
            // Cluster density: tighter near centre
            const angle = Math.random() * Math.PI * 2;
            const r = Math.pow(Math.random(), 0.7) * G.radius;
            const x = G.cx + Math.cos(angle) * r;
            const z = G.cz + Math.sin(angle) * r;

            const treeH = 18 + Math.random() * 10;  // 18-28 m
            const trunkR = 0.55 + Math.random() * 0.3;

            // Trunk — tall, slightly curved (eucalyptus characteristic lean)
            const trunk = new THREE.Mesh(
                new THREE.CylinderGeometry(trunkR * 0.5, trunkR, treeH, 8),
                Math.random() > 0.5 ? trunkMat : trunkDarkMat
            );
            trunk.position.y = treeH / 2;
            trunk.rotation.z = (Math.random() - 0.5) * 0.12; // Slight lean
            trunk.castShadow = true;
            tree.add(trunk);

            // Subordinate branches at mid-height — just short stubs
            for (let b = 0; b < 3 + Math.floor(Math.random() * 3); b++) {
                const bh = treeH * (0.45 + Math.random() * 0.35);
                const branch = new THREE.Mesh(
                    new THREE.CylinderGeometry(0.08, 0.15, 2.5 + Math.random() * 2, 5),
                    trunkDarkMat
                );
                branch.position.y = bh;
                branch.rotation.z = Math.PI / 2 + (Math.random() - 0.5) * 0.5;
                branch.rotation.y = b * (Math.PI * 2 / 4) + Math.random() * 0.6;
                branch.position.x = Math.cos(branch.rotation.y) * 1.2;
                branch.position.z = Math.sin(branch.rotation.y) * 1.2;
                tree.add(branch);
            }

            // Elongated crown — several overlapping ellipsoids for a
            // drapery-like eucalyptus silhouette
            const crownBaseY = treeH * 0.65;
            const crownCount = 4 + Math.floor(Math.random() * 3);
            for (let c = 0; c < crownCount; c++) {
                const cy = crownBaseY + c * (treeH * 0.08);
                const cr = 3.2 - c * 0.3;
                const leaf = new THREE.Mesh(
                    new THREE.SphereGeometry(cr, 8, 6),
                    Math.random() > 0.5 ? leafMat : leafMat2
                );
                leaf.position.set(
                    (Math.random() - 0.5) * 1.2,
                    cy,
                    (Math.random() - 0.5) * 1.2
                );
                leaf.scale.set(1.0, 0.7, 1.0);
                leaf.castShadow = true;
                tree.add(leaf);
            }

            // Place on the field surface
            tree.position.set(x, FIELD_Y + this._fieldUndulation(x, z), z);
            tree.scale.setScalar(0.9 + Math.random() * 0.2);
            this.group.add(tree);

            // Record the two biggest trees for monarchs
            if (this._monarchTrees.length < 2 || treeH > this._monarchTrees[0].h) {
                this._monarchTrees.push({
                    x, z, h: treeH, group: tree, scale: tree.scale.x
                });
                this._monarchTrees.sort((a, b) => b.h - a.h);
                if (this._monarchTrees.length > 2) this._monarchTrees.pop();
            }
        }

        // Shady understory — fallen leaves + soft shadow circle
        const duffMat = new THREE.MeshStandardMaterial({
            color: 0x5A4A32, roughness: 0.95, transparent: true, opacity: 0.75
        });
        const duff = new THREE.Mesh(
            new THREE.CircleGeometry(G.radius * 1.1, 32), duffMat
        );
        duff.rotation.x = -Math.PI / 2;
        duff.position.set(G.cx, FIELD_Y + 0.03, G.cz);
        duff.userData.noCollision = true;
        this.group.add(duff);

        // Info sign about the monarchs
        this._addMonarchInfoSign(G.cx + G.radius - 4, G.cz + G.radius + 3);
    }

    _addMonarchInfoSign(x, z) {
        const post = new THREE.Group();
        post.userData = { name: 'Monarch Butterfly Grove', type: 'sign' };

        const postMat = new THREE.MeshStandardMaterial({
            color: 0x3A2A1A, roughness: 0.85
        });
        const panelMat = new THREE.MeshStandardMaterial({
            color: 0xE2A23A, roughness: 0.7
        });
        const trimMat = new THREE.MeshStandardMaterial({
            color: 0x2A1808, roughness: 0.8
        });

        const p = new THREE.Mesh(
            new THREE.CylinderGeometry(0.07, 0.07, 2.2, 6), postMat
        );
        p.position.y = 1.1;
        post.add(p);

        const panel = new THREE.Mesh(
            new THREE.BoxGeometry(1.6, 0.7, 0.06), panelMat
        );
        panel.position.y = 1.95;
        post.add(panel);

        const trim = new THREE.Mesh(
            new THREE.BoxGeometry(1.65, 0.09, 0.08), trimMat
        );
        trim.position.y = 2.38;
        post.add(trim);

        post.position.set(x, FIELD_Y + this._fieldUndulation(x, z), z);
        post.rotation.y = -Math.PI / 3;
        this.group.add(post);
    }

    // ==========================================================
    //  Monarch butterflies — clusters in eucalyptus + free fliers
    // ==========================================================
    createMonarchs() {
        // Hanging clusters: many small monarch-orange leaves tightly packed
        if (this._monarchTrees && this._monarchTrees.length) {
            for (const tree of this._monarchTrees) {
                this._hangMonarchCluster(tree);
            }
        }

        // Free-flying monarchs over the grove and field
        const flyCount = 22;
        for (let i = 0; i < flyCount; i++) {
            const monarch = this._makeMonarch();
            // Starting position — inside or just above the grove
            const G = EUCALYPTUS_GROVE;
            const angle = Math.random() * Math.PI * 2;
            const r = Math.random() * (G.radius + 15);
            const baseX = G.cx + Math.cos(angle) * r;
            const baseZ = G.cz + Math.sin(angle) * r;
            const baseY = FIELD_Y + 2 + Math.random() * 8;
            monarch.position.set(baseX, baseY, baseZ);
            this.group.add(monarch);

            this._flyingMonarchs.push({
                obj: monarch,
                baseX, baseY, baseZ,
                phase: Math.random() * Math.PI * 2,
                flapPhase: Math.random() * Math.PI * 2,
                speed: 0.4 + Math.random() * 0.6,
                radius: 4 + Math.random() * 8,
                bob: 0.6 + Math.random() * 1.2,
                wings: monarch.userData.wings
            });
        }
    }

    _hangMonarchCluster(tree) {
        // Hang ~120 small monarch-coloured triangles from the crown region.
        // One "bunch" per side of the tree, clustered on a few branches.
        const cluster = new THREE.Group();
        const n = 110;
        const crownCenterY = tree.h * 0.68;
        const crownRadius = 3.0;
        for (let i = 0; i < n; i++) {
            const theta = Math.random() * Math.PI * 2;
            const r = Math.pow(Math.random(), 0.6) * crownRadius;
            const hy = crownCenterY + (Math.random() - 0.3) * tree.h * 0.15;
            const petal = this._makeMonarchPetal();
            petal.position.set(
                Math.cos(theta) * r,
                hy,
                Math.sin(theta) * r
            );
            // Drape downward: rotate around X so the wings point down
            petal.rotation.x = Math.PI / 2 + (Math.random() - 0.5) * 0.4;
            petal.rotation.y = theta + (Math.random() - 0.5) * 0.3;
            petal.scale.setScalar(0.6 + Math.random() * 0.5);
            cluster.add(petal);
        }
        // Attach the cluster to the tree group so it moves with the tree
        tree.group.add(cluster);
        this._monarchClusters.push(cluster);
    }

    // A small static monarch used inside the hanging cluster
    _makeMonarchPetal() {
        const g = new THREE.Group();
        const wingMat = new THREE.MeshBasicMaterial({
            color: 0xE27026, side: THREE.DoubleSide
        });
        const bodyMat = new THREE.MeshBasicMaterial({ color: 0x1A1A1A });

        // Two wings as flat triangles
        const shape = new THREE.Shape();
        shape.moveTo(0, 0);
        shape.lineTo(0.35, 0.12);
        shape.lineTo(0.5, 0.4);
        shape.lineTo(0.25, 0.35);
        shape.lineTo(0, 0);
        const geo = new THREE.ShapeGeometry(shape);
        const left = new THREE.Mesh(geo, wingMat);
        left.scale.x = -1; // Mirror for left wing
        const right = new THREE.Mesh(geo, wingMat);
        g.add(left);
        g.add(right);

        // Body
        const body = new THREE.Mesh(
            new THREE.BoxGeometry(0.05, 0.05, 0.35), bodyMat
        );
        body.position.set(0, 0.02, 0.12);
        g.add(body);

        g.userData.noCollision = true;
        return g;
    }

    // A free-flying monarch — like the petal but with animatable wings
    _makeMonarch() {
        const g = new THREE.Group();
        const wingMat = new THREE.MeshBasicMaterial({
            color: 0xE27026, side: THREE.DoubleSide
        });
        const wingEdgeMat = new THREE.MeshBasicMaterial({
            color: 0x1A1A1A, side: THREE.DoubleSide
        });
        const bodyMat = new THREE.MeshBasicMaterial({ color: 0x1A1A1A });

        const shape = new THREE.Shape();
        shape.moveTo(0, 0);
        shape.lineTo(0.5, 0.18);
        shape.lineTo(0.7, 0.55);
        shape.lineTo(0.3, 0.5);
        shape.lineTo(0, 0);
        const wingGeo = new THREE.ShapeGeometry(shape);

        // Wings pivot around body (x=0). We put them as children with
        // their origin offset so rotating around Y flaps them up/down.
        const leftPivot = new THREE.Group();
        const rightPivot = new THREE.Group();
        g.add(leftPivot);
        g.add(rightPivot);

        const left = new THREE.Mesh(wingGeo, wingMat);
        left.scale.x = -1;
        leftPivot.add(left);

        const right = new THREE.Mesh(wingGeo, wingMat);
        rightPivot.add(right);

        // Dark wing trim (edge)
        const edgeShape = new THREE.Shape();
        edgeShape.moveTo(0, 0);
        edgeShape.lineTo(0.7, 0.55);
        edgeShape.lineTo(0.68, 0.58);
        edgeShape.lineTo(-0.01, 0.01);
        edgeShape.lineTo(0, 0);
        const edgeGeo = new THREE.ShapeGeometry(edgeShape);
        const leftEdge = new THREE.Mesh(edgeGeo, wingEdgeMat);
        leftEdge.scale.x = -1;
        leftPivot.add(leftEdge);
        const rightEdge = new THREE.Mesh(edgeGeo, wingEdgeMat);
        rightPivot.add(rightEdge);

        // Body
        const body = new THREE.Mesh(
            new THREE.BoxGeometry(0.06, 0.06, 0.45), bodyMat
        );
        body.position.set(0, 0, 0.18);
        g.add(body);

        g.scale.setScalar(0.7);
        g.userData.noCollision = true;
        g.userData.wings = { left: leftPivot, right: rightPivot };
        return g;
    }

    // ==========================================================
    //  Signage — points of interest
    // ==========================================================
    createSignage() {
        const signs = [
            { x: 0, z: -45, name: 'Lighthouse Field\nState Beach' },
            { x: STAIR.topX - 4, z: STAIR.topZ - 1, name: '↓ Stairs to Beach' }
        ];
        const postMat = new THREE.MeshStandardMaterial({
            color: 0x2A2A2A, roughness: 0.5, metalness: 0.5
        });
        const panelMat = new THREE.MeshStandardMaterial({
            color: 0x234E1E, roughness: 0.8  // California state-parks green
        });
        const trimMat = new THREE.MeshStandardMaterial({
            color: 0xEFE4C6, roughness: 0.7
        });
        signs.forEach(s => {
            const g = new THREE.Group();
            g.userData = { name: s.name.replace('\n', ' · '), type: 'sign' };

            const post = new THREE.Mesh(
                new THREE.CylinderGeometry(0.07, 0.07, 2.3, 6), postMat
            );
            post.position.y = 1.15;
            g.add(post);

            const panel = new THREE.Mesh(
                new THREE.BoxGeometry(1.9, 0.55, 0.06), panelMat
            );
            panel.position.y = 2.1;
            g.add(panel);

            const trim = new THREE.Mesh(
                new THREE.BoxGeometry(1.95, 0.06, 0.08), trimMat
            );
            trim.position.y = 2.4;
            g.add(trim);

            g.position.set(s.x, FIELD_Y + this._fieldUndulation(s.x, s.z), s.z);
            this.group.add(g);
        });
    }

    // ==========================================================
    //  Per-frame update — flap wings, drift butterflies around grove
    // ==========================================================
    update(delta, time) {
        if (!this._flyingMonarchs || !this._flyingMonarchs.length) return;
        this._time += delta;
        const t = this._time;

        for (const m of this._flyingMonarchs) {
            // Gentle orbit around a home point, with random bob
            const orbitT = t * m.speed + m.phase;
            const ox = Math.cos(orbitT) * m.radius;
            const oz = Math.sin(orbitT * 1.3) * m.radius * 0.8;
            const oy = Math.sin(orbitT * 0.7) * m.bob;

            m.obj.position.set(
                m.baseX + ox,
                m.baseY + oy,
                m.baseZ + oz
            );

            // Face direction of travel
            m.obj.rotation.y = Math.atan2(
                -Math.sin(orbitT) * m.radius,
                Math.cos(orbitT * 1.3) * m.radius * 0.8 * 1.3
            );

            // Wing flap
            const flapAngle = Math.sin((t * 18) + m.flapPhase) * 0.9;
            if (m.wings) {
                m.wings.left.rotation.y = flapAngle;
                m.wings.right.rotation.y = -flapAngle;
            }
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
