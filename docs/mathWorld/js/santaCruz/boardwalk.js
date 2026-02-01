/**
 * Santa Cruz - Beach Boardwalk
 * Historic beachfront amusement park featuring:
 * - Giant Dipper (classic 1924 wooden roller coaster)
 * - Sky Glider (cable car ride)
 * - Bumper Cars
 * - Looff Carousel (historic)
 * - Arcade buildings
 */
import * as THREE from 'three';

export class BeachBoardwalk {
    constructor(locationGroup) {
        this.group = locationGroup;
        this.animatedObjects = [];
    }

    async generate() {
        this.createBeach();
        this.createOcean();
        this.createBoardwalk();
        this.createGiantDipper();
        this.createSkyGlider();
        this.createBumperCars();
        this.createLooffCarousel();
        this.createNeptunesKingdom();
        this.createCoconutGrove();
        this.createArcadeBuildings();
        this.createSky();

        // Start animations
        this.startAnimations();
    }

    createBeach() {
        const geo = new THREE.PlaneGeometry(300, 100, 50, 20);
        const pos = geo.attributes.position;
        for (let i = 0; i < pos.count; i++) {
            const z = pos.getZ(i);
            pos.setZ(i, z * 0.02 + Math.random() * 0.1);
        }
        geo.computeVertexNormals();

        const mat = new THREE.MeshStandardMaterial({
            color: 0xF5DEB3, roughness: 0.95
        });
        const beach = new THREE.Mesh(geo, mat);
        beach.rotation.x = -Math.PI / 2;
        beach.position.set(0, 0, 30);
        beach.receiveShadow = true;
        this.group.add(beach);

        // Beach umbrellas
        const umbrellaColors = [0xFF6B6B, 0x4ECDC4, 0xFFE66D, 0x95E1D3];
        for (let i = 0; i < 15; i++) {
            const umbrella = new THREE.Group();
            const pole = new THREE.Mesh(
                new THREE.CylinderGeometry(0.05, 0.05, 3, 8),
                new THREE.MeshStandardMaterial({ color: 0x8B4513 })
            );
            pole.position.y = 1.5;
            umbrella.add(pole);

            const canopy = new THREE.Mesh(
                new THREE.ConeGeometry(1.5, 0.8, 8),
                new THREE.MeshStandardMaterial({
                    color: umbrellaColors[i % umbrellaColors.length],
                    side: THREE.DoubleSide
                })
            );
            canopy.position.y = 2.8;
            umbrella.add(canopy);

            umbrella.position.set(
                -60 + Math.random() * 120,
                0,
                40 + Math.random() * 30
            );
            this.group.add(umbrella);
        }
    }

    createOcean() {
        const oceanGeo = new THREE.PlaneGeometry(400, 150);
        const oceanMat = new THREE.MeshStandardMaterial({
            color: 0x2E86AB, roughness: 0.3, metalness: 0.1
        });
        const ocean = new THREE.Mesh(oceanGeo, oceanMat);
        ocean.rotation.x = -Math.PI / 2;
        ocean.position.set(0, -0.5, 120);
        this.group.add(ocean);

        // Waves/foam line
        const foamGeo = new THREE.PlaneGeometry(300, 3);
        const foamMat = new THREE.MeshStandardMaterial({
            color: 0xFFFFFF, transparent: true, opacity: 0.6
        });
        const foam = new THREE.Mesh(foamGeo, foamMat);
        foam.rotation.x = -Math.PI / 2;
        foam.position.set(0, 0.1, 75);
        this.group.add(foam);
    }

    createBoardwalk() {
        const boardwalkMat = new THREE.MeshStandardMaterial({
            color: 0xB8860B, roughness: 0.8
        });

        // Main platform
        const platform = new THREE.Mesh(
            new THREE.BoxGeometry(250, 0.5, 30),
            boardwalkMat
        );
        platform.position.set(0, 0.25, -20);
        platform.receiveShadow = true;
        this.group.add(platform);

        // Planking lines
        for (let i = -120; i <= 120; i += 3) {
            const plank = new THREE.Mesh(
                new THREE.BoxGeometry(0.1, 0.52, 30),
                new THREE.MeshStandardMaterial({ color: 0x8B7355 })
            );
            plank.position.set(i, 0.26, -20);
            this.group.add(plank);
        }

        // Railings along the beach side
        const railMat = new THREE.MeshStandardMaterial({ color: 0xFFFFFF });
        for (let x = -120; x <= 120; x += 5) {
            const post = new THREE.Mesh(
                new THREE.BoxGeometry(0.15, 1.2, 0.15),
                railMat
            );
            post.position.set(x, 1.1, -5);
            this.group.add(post);
        }
        // Top rail
        const topRail = new THREE.Mesh(
            new THREE.BoxGeometry(240, 0.1, 0.1),
            railMat
        );
        topRail.position.set(0, 1.6, -5);
        this.group.add(topRail);
    }

    createGiantDipper() {
        // Classic 1924 wooden roller coaster - National Historic Landmark
        const coaster = new THREE.Group();
        coaster.userData = {
            name: 'Giant Dipper Roller Coaster',
            isInteractable: true,
            type: 'attraction',
            interactionType: 'Ride the Giant Dipper!'
        };

        const woodMat = new THREE.MeshStandardMaterial({ color: 0x8B4513, roughness: 0.9 });
        const whiteMat = new THREE.MeshStandardMaterial({ color: 0xFFFFFF, roughness: 0.5 });
        const redMat = new THREE.MeshStandardMaterial({ color: 0xCC0000 });
        const trackMat = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.5 });

        // Create the iconic lift hill (first big climb)
        const liftHillHeight = 30;
        const liftHillLength = 40;

        // Lift hill support structure
        for (let i = 0; i <= 10; i++) {
            const progress = i / 10;
            const height = progress * liftHillHeight;
            const x = -30 + progress * liftHillLength;

            // Main vertical posts
            for (let z of [-8, -4, 0, 4, 8]) {
                const post = new THREE.Mesh(
                    new THREE.BoxGeometry(0.4, height + 2, 0.4),
                    woodMat
                );
                post.position.set(x, height / 2 + 1, z);
                post.castShadow = true;
                coaster.add(post);
            }

            // Cross bracing X pattern
            if (i > 0) {
                const braceHeight = height;
                const brace1 = new THREE.Mesh(
                    new THREE.BoxGeometry(0.15, braceHeight * 0.7, 0.15),
                    woodMat
                );
                brace1.position.set(x - 2, height / 2 + 1, 0);
                brace1.rotation.z = 0.3;
                coaster.add(brace1);

                const brace2 = new THREE.Mesh(
                    new THREE.BoxGeometry(0.15, braceHeight * 0.7, 0.15),
                    woodMat
                );
                brace2.position.set(x - 2, height / 2 + 1, 0);
                brace2.rotation.z = -0.3;
                coaster.add(brace2);
            }

            // Horizontal stringers
            const stringer = new THREE.Mesh(
                new THREE.BoxGeometry(4, 0.3, 20),
                woodMat
            );
            stringer.position.set(x, height + 2, 0);
            coaster.add(stringer);
        }

        // Lift hill track (angled)
        const liftTrack = new THREE.Mesh(
            new THREE.BoxGeometry(2, 0.2, 45),
            trackMat
        );
        liftTrack.position.set(-10, 17, 0);
        liftTrack.rotation.x = Math.PI / 2;
        liftTrack.rotation.z = Math.atan2(liftHillHeight, liftHillLength);
        coaster.add(liftTrack);

        // First drop - the iconic 65-foot plunge
        const dropHeight = 28;

        // Drop support structure  
        for (let i = 0; i <= 6; i++) {
            const height = liftHillHeight - (i / 6) * (dropHeight - 5);
            const x = 10 + i * 5;

            for (let z of [-6, 0, 6]) {
                const post = new THREE.Mesh(
                    new THREE.BoxGeometry(0.4, height + 2, 0.4),
                    woodMat
                );
                post.position.set(x, height / 2 + 1, z);
                post.castShadow = true;
                coaster.add(post);
            }
        }

        // The rest of the coaster structure (turns and hills)
        const trackPoints = [];
        // After drop, several hills and turns
        for (let t = 0; t <= 1; t += 0.05) {
            const angle = t * Math.PI * 3;
            const radius = 25 + t * 10;
            const x = 40 + Math.cos(angle) * radius;
            const z = Math.sin(angle) * radius;
            const y = 5 + Math.sin(t * Math.PI * 6) * 8 * (1 - t);
            trackPoints.push(new THREE.Vector3(x, y, z));
        }

        // Track supports for the turns
        trackPoints.forEach((pt, i) => {
            if (i % 3 === 0 && pt.y > 2) {
                const post = new THREE.Mesh(
                    new THREE.BoxGeometry(0.3, pt.y, 0.3),
                    woodMat
                );
                post.position.set(pt.x, pt.y / 2, pt.z);
                coaster.add(post);
            }
        });

        // Track rails along the path
        for (let i = 0; i < trackPoints.length - 1; i++) {
            const start = trackPoints[i];
            const end = trackPoints[i + 1];
            const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
            const len = start.distanceTo(end);

            const rail = new THREE.Mesh(
                new THREE.BoxGeometry(0.15, 0.15, len),
                trackMat
            );
            rail.position.copy(mid);
            rail.lookAt(end);
            coaster.add(rail);
        }

        // Coaster train (simplified)
        const trainCar = new THREE.Mesh(
            new THREE.BoxGeometry(2, 1, 3),
            redMat
        );
        trainCar.position.set(-20, 12, 0);
        coaster.add(trainCar);

        // Entrance building
        const entrance = new THREE.Mesh(
            new THREE.BoxGeometry(15, 6, 10),
            new THREE.MeshStandardMaterial({ color: 0xDEB887 })
        );
        entrance.position.set(-45, 3, 0);
        coaster.add(entrance);

        // Classic GIANT DIPPER sign arch
        const signArch = new THREE.Mesh(
            new THREE.BoxGeometry(20, 3, 1),
            redMat
        );
        signArch.position.set(-45, 8, 5.5);
        coaster.add(signArch);

        // White letters would be here
        const letterPlate = new THREE.Mesh(
            new THREE.BoxGeometry(18, 2, 0.2),
            whiteMat
        );
        letterPlate.position.set(-45, 8, 6);
        coaster.add(letterPlate);

        coaster.position.set(-30, 0.5, -55);
        this.group.add(coaster);
    }

    createSkyGlider() {
        // The iconic cable car ride running the length of the boardwalk
        const skyGlider = new THREE.Group();
        skyGlider.userData = {
            name: 'Sky Glider',
            isInteractable: true,
            type: 'attraction',
            interactionType: 'Ride the Sky Glider!'
        };

        const metalMat = new THREE.MeshStandardMaterial({
            color: 0x666666, roughness: 0.3, metalness: 0.7
        });
        const cableMat = new THREE.MeshStandardMaterial({ color: 0x333333 });

        // Support towers along the boardwalk
        const towerPositions = [-100, -50, 0, 50, 100];
        const towerHeight = 25;

        towerPositions.forEach(x => {
            // Main tower poles (A-frame style)
            const pole1 = new THREE.Mesh(
                new THREE.CylinderGeometry(0.3, 0.4, towerHeight, 8),
                metalMat
            );
            pole1.position.set(x - 2, towerHeight / 2, -35);
            pole1.rotation.z = 0.1;
            skyGlider.add(pole1);

            const pole2 = new THREE.Mesh(
                new THREE.CylinderGeometry(0.3, 0.4, towerHeight, 8),
                metalMat
            );
            pole2.position.set(x + 2, towerHeight / 2, -35);
            pole2.rotation.z = -0.1;
            skyGlider.add(pole2);

            // Cross beam at top
            const beam = new THREE.Mesh(
                new THREE.BoxGeometry(6, 0.5, 0.5),
                metalMat
            );
            beam.position.set(x, towerHeight, -35);
            skyGlider.add(beam);

            // Cable wheel/pulley
            const wheel = new THREE.Mesh(
                new THREE.TorusGeometry(0.8, 0.15, 8, 16),
                metalMat
            );
            wheel.position.set(x, towerHeight + 0.5, -35);
            wheel.rotation.y = Math.PI / 2;
            skyGlider.add(wheel);
        });

        // Main cable line
        const cableGeo = new THREE.CylinderGeometry(0.05, 0.05, 220, 8);
        const cable = new THREE.Mesh(cableGeo, cableMat);
        cable.rotation.z = Math.PI / 2;
        cable.position.set(0, towerHeight + 0.5, -35);
        skyGlider.add(cable);

        // Gondola cars (colorful)
        const gondolaColors = [0xFF6B6B, 0x4ECDC4, 0xFFE66D, 0x95E1D3, 0xA8E6CF];
        for (let i = 0; i < 8; i++) {
            const gondola = new THREE.Group();

            // Hanger bar
            const hanger = new THREE.Mesh(
                new THREE.CylinderGeometry(0.05, 0.05, 3, 8),
                metalMat
            );
            gondola.add(hanger);

            // Car body (rounded box-ish)
            const carBody = new THREE.Mesh(
                new THREE.BoxGeometry(1.5, 1.2, 2),
                new THREE.MeshStandardMaterial({
                    color: gondolaColors[i % gondolaColors.length]
                })
            );
            carBody.position.y = -2;
            gondola.add(carBody);

            // Roof
            const roof = new THREE.Mesh(
                new THREE.BoxGeometry(1.7, 0.2, 2.2),
                new THREE.MeshStandardMaterial({ color: 0x333333 })
            );
            roof.position.y = -1.3;
            gondola.add(roof);

            // Store for animation
            gondola.position.set(-100 + i * 28, towerHeight + 0.5, -35);
            gondola.userData.baseX = -100 + i * 28;
            this.animatedObjects.push({ type: 'gondola', obj: gondola });
            skyGlider.add(gondola);
        }

        this.group.add(skyGlider);
    }

    createBumperCars() {
        // Classic bumper car pavilion
        const bumperCars = new THREE.Group();
        bumperCars.userData = {
            name: 'Bumper Cars',
            isInteractable: true,
            type: 'attraction',
            interactionType: 'Drive Bumper Cars!'
        };

        // Pavilion building
        const buildingMat = new THREE.MeshStandardMaterial({ color: 0xE8DCC8 });

        // Floor/arena
        const floor = new THREE.Mesh(
            new THREE.BoxGeometry(30, 0.3, 25),
            new THREE.MeshStandardMaterial({
                color: 0x444444,
                metalness: 0.3,
                roughness: 0.4
            })
        );
        floor.position.y = 0.15;
        bumperCars.add(floor);

        // Walls (open front)
        const wallMat = new THREE.MeshStandardMaterial({ color: 0xDEB887 });

        // Back wall
        const backWall = new THREE.Mesh(
            new THREE.BoxGeometry(30, 8, 0.5),
            wallMat
        );
        backWall.position.set(0, 4, -12.5);
        bumperCars.add(backWall);

        // Side walls
        const sideWall1 = new THREE.Mesh(
            new THREE.BoxGeometry(0.5, 8, 25),
            wallMat
        );
        sideWall1.position.set(-15, 4, 0);
        bumperCars.add(sideWall1);

        const sideWall2 = sideWall1.clone();
        sideWall2.position.set(15, 4, 0);
        bumperCars.add(sideWall2);

        // Roof
        const roof = new THREE.Mesh(
            new THREE.BoxGeometry(32, 0.5, 27),
            new THREE.MeshStandardMaterial({ color: 0x8B0000 })
        );
        roof.position.y = 8;
        bumperCars.add(roof);

        // Ceiling grid for electrical pickup
        const gridMat = new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.5 });
        for (let x = -12; x <= 12; x += 4) {
            const gridBar = new THREE.Mesh(
                new THREE.BoxGeometry(0.1, 0.1, 23),
                gridMat
            );
            gridBar.position.set(x, 7.5, 0);
            bumperCars.add(gridBar);
        }
        for (let z = -10; z <= 10; z += 4) {
            const gridBar = new THREE.Mesh(
                new THREE.BoxGeometry(28, 0.1, 0.1),
                gridMat
            );
            gridBar.position.set(0, 7.5, z);
            bumperCars.add(gridBar);
        }

        // Bumper cars!
        const carColors = [0xFF0000, 0x0066FF, 0x00CC00, 0xFFCC00, 0xFF6600, 0x9933FF];
        const carPositions = [
            [-8, -5], [-8, 3], [0, -6], [0, 2], [8, -4], [8, 4],
            [-4, -1], [4, 0], [-6, 6], [6, -7]
        ];

        carPositions.forEach((pos, i) => {
            const car = this.createBumperCar(carColors[i % carColors.length]);
            car.position.set(pos[0], 0.8, pos[1]);
            car.rotation.y = Math.random() * Math.PI * 2;
            bumperCars.add(car);
        });

        // Entrance sign
        const sign = new THREE.Mesh(
            new THREE.BoxGeometry(12, 2, 0.3),
            new THREE.MeshStandardMaterial({ color: 0xFFCC00 })
        );
        sign.position.set(0, 6, 12.5);
        bumperCars.add(sign);

        // Neon-style lights around entrance
        const neonMat = new THREE.MeshBasicMaterial({ color: 0xFF00FF });
        for (let x = -14; x <= 14; x += 3) {
            const light = new THREE.Mesh(
                new THREE.SphereGeometry(0.2, 8, 8),
                neonMat
            );
            light.position.set(x, 8.3, 12);
            bumperCars.add(light);
        }

        bumperCars.position.set(80, 0.5, -50);
        this.group.add(bumperCars);
    }

    createBumperCar(color) {
        const car = new THREE.Group();

        // Body (rounded)
        const body = new THREE.Mesh(
            new THREE.CylinderGeometry(1.2, 1.4, 0.8, 16),
            new THREE.MeshStandardMaterial({ color: color, metalness: 0.3 })
        );
        body.position.y = 0.4;
        car.add(body);

        // Rubber bumper ring
        const bumper = new THREE.Mesh(
            new THREE.TorusGeometry(1.5, 0.15, 8, 24),
            new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.9 })
        );
        bumper.rotation.x = Math.PI / 2;
        bumper.position.y = 0.3;
        car.add(bumper);

        // Seat
        const seat = new THREE.Mesh(
            new THREE.BoxGeometry(0.8, 0.4, 0.6),
            new THREE.MeshStandardMaterial({ color: 0x333333 })
        );
        seat.position.set(0, 0.7, -0.2);
        car.add(seat);

        // Steering wheel
        const wheel = new THREE.Mesh(
            new THREE.TorusGeometry(0.2, 0.03, 8, 12),
            new THREE.MeshStandardMaterial({ color: 0x111111 })
        );
        wheel.position.set(0, 1, 0.3);
        wheel.rotation.x = -0.5;
        car.add(wheel);

        // Pole (for electrical contact)
        const pole = new THREE.Mesh(
            new THREE.CylinderGeometry(0.05, 0.05, 3, 8),
            new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.7 })
        );
        pole.position.y = 2;
        car.add(pole);

        // Spark collector at top
        const collector = new THREE.Mesh(
            new THREE.CylinderGeometry(0.3, 0.3, 0.1, 8),
            new THREE.MeshStandardMaterial({ color: 0xCCCCCC, metalness: 0.8 })
        );
        collector.position.y = 3.5;
        car.add(collector);

        return car;
    }

    createLooffCarousel() {
        // Historic 1911 Looff Carousel
        const carousel = new THREE.Group();
        carousel.userData = {
            name: 'Looff Carousel',
            isInteractable: true,
            type: 'attraction',
            interactionType: 'Ride the Carousel!'
        };

        // Platform base
        const base = new THREE.Mesh(
            new THREE.CylinderGeometry(12, 12, 1, 32),
            new THREE.MeshStandardMaterial({ color: 0x8B4513 })
        );
        base.position.y = 0.5;
        carousel.add(base);

        // Rotating platform
        const platform = new THREE.Mesh(
            new THREE.CylinderGeometry(10, 10, 0.3, 32),
            new THREE.MeshStandardMaterial({ color: 0xDEB887 })
        );
        platform.position.y = 1.2;
        platform.userData.rotates = true;
        this.animatedObjects.push({ type: 'carousel', obj: platform });
        carousel.add(platform);

        // Center pole
        const centerPole = new THREE.Mesh(
            new THREE.CylinderGeometry(0.5, 0.5, 10, 16),
            new THREE.MeshStandardMaterial({ color: 0xFFD700, metalness: 0.6 })
        );
        centerPole.position.y = 6;
        carousel.add(centerPole);

        // Ornate top
        const top = new THREE.Mesh(
            new THREE.ConeGeometry(11, 4, 32),
            new THREE.MeshStandardMaterial({ color: 0xCC0000 })
        );
        top.position.y = 12;
        carousel.add(top);

        // Carousel horses (simplified)
        const horseColors = [0xFFFFFF, 0x8B4513, 0x000000, 0xD2691E];
        for (let i = 0; i < 24; i++) {
            const angle = (i / 24) * Math.PI * 2;
            const radius = i % 2 === 0 ? 8 : 6;

            const horse = new THREE.Group();

            // Body
            const body = new THREE.Mesh(
                new THREE.BoxGeometry(0.5, 0.8, 1.2),
                new THREE.MeshStandardMaterial({ color: horseColors[i % horseColors.length] })
            );
            body.position.y = 2;
            horse.add(body);

            // Head
            const head = new THREE.Mesh(
                new THREE.BoxGeometry(0.3, 0.4, 0.5),
                new THREE.MeshStandardMaterial({ color: horseColors[i % horseColors.length] })
            );
            head.position.set(0, 2.4, 0.6);
            horse.add(head);

            // Pole
            const pole = new THREE.Mesh(
                new THREE.CylinderGeometry(0.05, 0.05, 4, 8),
                new THREE.MeshStandardMaterial({ color: 0xFFD700, metalness: 0.7 })
            );
            pole.position.y = 3;
            horse.add(pole);

            horse.position.set(
                Math.cos(angle) * radius,
                1.2 + (i % 2) * 0.5,
                Math.sin(angle) * radius
            );
            horse.rotation.y = angle + Math.PI / 2;
            carousel.add(horse);
        }

        carousel.position.set(-80, 0.5, -50);
        this.group.add(carousel);
    }

    createNeptunesKingdom() {
        // Neptune's Kingdom - indoor arcade and mini bowling
        const arcade = new THREE.Group();
        arcade.userData = {
            name: "Neptune's Kingdom",
            isInteractable: true,
            type: 'attraction',
            interactionType: 'Play Arcade Games!'
        };

        // Main building - distinctive blue/teal color
        const buildingMat = new THREE.MeshStandardMaterial({ color: 0x1E90FF });
        const main = new THREE.Mesh(
            new THREE.BoxGeometry(40, 12, 30),
            buildingMat
        );
        main.position.y = 6;
        main.castShadow = true;
        arcade.add(main);

        // Ornate roof with Neptune theme
        const roofMat = new THREE.MeshStandardMaterial({ color: 0x008B8B });
        const roof = new THREE.Mesh(
            new THREE.BoxGeometry(42, 2, 32),
            roofMat
        );
        roof.position.y = 13;
        arcade.add(roof);

        // Peaked center section
        const peak = new THREE.Mesh(
            new THREE.ConeGeometry(8, 6, 4),
            roofMat
        );
        peak.position.y = 17;
        peak.rotation.y = Math.PI / 4;
        arcade.add(peak);

        // Large entrance
        const entranceMat = new THREE.MeshStandardMaterial({
            color: 0x4169E1,
            transparent: true,
            opacity: 0.7
        });
        const entrance = new THREE.Mesh(
            new THREE.BoxGeometry(12, 8, 1),
            entranceMat
        );
        entrance.position.set(0, 4, 15.5);
        arcade.add(entrance);

        // "NEPTUNE'S KINGDOM" sign area
        const signMat = new THREE.MeshStandardMaterial({ color: 0xFFD700 });
        const sign = new THREE.Mesh(
            new THREE.BoxGeometry(25, 3, 0.5),
            signMat
        );
        sign.position.set(0, 10, 15.5);
        arcade.add(sign);

        // Decorative trident on top
        const tridentMat = new THREE.MeshStandardMaterial({ color: 0xFFD700, metalness: 0.7 });
        const tridentPole = new THREE.Mesh(
            new THREE.CylinderGeometry(0.2, 0.2, 8, 8),
            tridentMat
        );
        tridentPole.position.y = 22;
        arcade.add(tridentPole);

        // Trident prongs
        for (let dx of [-1.5, 0, 1.5]) {
            const prong = new THREE.Mesh(
                new THREE.ConeGeometry(0.3, 2, 8),
                tridentMat
            );
            prong.position.set(dx, 27, 0);
            arcade.add(prong);
        }

        // Interior visible through entrance - game cabinets
        const cabinetMat = new THREE.MeshStandardMaterial({ color: 0x2F4F4F });
        for (let x = -12; x <= 12; x += 4) {
            for (let z = -8; z <= 6; z += 5) {
                if (Math.abs(x) < 6 && z > 4) continue; // Leave entrance clear
                const cabinet = new THREE.Mesh(
                    new THREE.BoxGeometry(1.5, 4, 2),
                    cabinetMat
                );
                cabinet.position.set(x, 2, z);
                arcade.add(cabinet);

                // Screen glow
                const screen = new THREE.Mesh(
                    new THREE.BoxGeometry(1.2, 2, 0.1),
                    new THREE.MeshBasicMaterial({
                        color: Math.random() > 0.5 ? 0x00FF00 : 0x0088FF
                    })
                );
                screen.position.set(x, 2.5, z + 1.05);
                arcade.add(screen);
            }
        }

        // Mini bowling lanes in the back
        const laneMat = new THREE.MeshStandardMaterial({ color: 0xDEB887 });
        for (let x = -15; x <= 15; x += 6) {
            const lane = new THREE.Mesh(
                new THREE.BoxGeometry(4, 0.1, 12),
                laneMat
            );
            lane.position.set(x, 0.1, -8);
            arcade.add(lane);

            // Pins at end
            for (let row = 0; row < 4; row++) {
                for (let col = 0; col <= row; col++) {
                    const pin = new THREE.Mesh(
                        new THREE.CylinderGeometry(0.1, 0.15, 0.6, 8),
                        new THREE.MeshStandardMaterial({ color: 0xFFFFFF })
                    );
                    pin.position.set(
                        x - row * 0.25 + col * 0.5,
                        0.4,
                        -13 - row * 0.4
                    );
                    arcade.add(pin);
                }
            }
        }

        arcade.position.set(0, 0.5, -75);
        this.group.add(arcade);
    }

    createCoconutGrove() {
        // Historic Coconut Grove ballroom - Art Deco style
        const grove = new THREE.Group();
        grove.userData = {
            name: 'Coconut Grove',
            isInteractable: true,
            type: 'venue',
            interactionType: 'Visit the Coconut Grove!'
        };

        // Main ballroom building - elegant cream/white
        const buildingMat = new THREE.MeshStandardMaterial({ color: 0xFFFAF0 });
        const main = new THREE.Mesh(
            new THREE.BoxGeometry(50, 15, 35),
            buildingMat
        );
        main.position.y = 7.5;
        main.castShadow = true;
        grove.add(main);

        // Art Deco stepped roof
        const roofMat = new THREE.MeshStandardMaterial({ color: 0x8B0000 });
        for (let i = 0; i < 3; i++) {
            const roofStep = new THREE.Mesh(
                new THREE.BoxGeometry(46 - i * 8, 2, 31 - i * 6),
                roofMat
            );
            roofStep.position.y = 16 + i * 2;
            grove.add(roofStep);
        }

        // Central dome
        const dome = new THREE.Mesh(
            new THREE.SphereGeometry(6, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2),
            roofMat
        );
        dome.position.y = 22;
        grove.add(dome);

        // Art Deco facade details - vertical lines
        const detailMat = new THREE.MeshStandardMaterial({ color: 0xDAA520 });
        for (let x = -20; x <= 20; x += 5) {
            const stripe = new THREE.Mesh(
                new THREE.BoxGeometry(0.5, 14, 0.5),
                detailMat
            );
            stripe.position.set(x, 7, 17.8);
            grove.add(stripe);
        }

        // Grand entrance with columns
        const columnMat = new THREE.MeshStandardMaterial({ color: 0xFFFACD });
        for (let x of [-8, -4, 4, 8]) {
            const column = new THREE.Mesh(
                new THREE.CylinderGeometry(0.6, 0.8, 10, 12),
                columnMat
            );
            column.position.set(x, 5, 18);
            grove.add(column);
        }

        // Entrance canopy
        const canopy = new THREE.Mesh(
            new THREE.BoxGeometry(20, 1, 4),
            detailMat
        );
        canopy.position.set(0, 10.5, 19);
        grove.add(canopy);

        // "COCONUT GROVE" sign
        const signMat = new THREE.MeshStandardMaterial({ color: 0x228B22 });
        const sign = new THREE.Mesh(
            new THREE.BoxGeometry(18, 2.5, 0.3),
            signMat
        );
        sign.position.set(0, 12.5, 18);
        grove.add(sign);

        // Decorative palm trees at entrance
        for (let x of [-12, 12]) {
            const palm = this.createPalmTree();
            palm.position.set(x, 0, 20);
            grove.add(palm);
        }

        // Large windows with warm glow
        const windowMat = new THREE.MeshBasicMaterial({
            color: 0xFFE4B5,
            transparent: true,
            opacity: 0.8
        });
        for (let x = -18; x <= 18; x += 9) {
            const window = new THREE.Mesh(
                new THREE.BoxGeometry(6, 8, 0.2),
                windowMat
            );
            window.position.set(x, 7, 17.7);
            grove.add(window);
        }

        // Interior dance floor visible through entrance
        const floorMat = new THREE.MeshStandardMaterial({
            color: 0x8B4513,
            metalness: 0.3
        });
        const danceFloor = new THREE.Mesh(
            new THREE.BoxGeometry(30, 0.1, 20),
            floorMat
        );
        danceFloor.position.set(0, 0.1, 0);
        grove.add(danceFloor);

        // Stage at the back
        const stage = new THREE.Mesh(
            new THREE.BoxGeometry(25, 1.5, 8),
            new THREE.MeshStandardMaterial({ color: 0x4A4A4A })
        );
        stage.position.set(0, 0.75, -12);
        grove.add(stage);

        // Chandelier suggestion (represented by glowing sphere)
        const chandelier = new THREE.Mesh(
            new THREE.SphereGeometry(2, 16, 16),
            new THREE.MeshBasicMaterial({ color: 0xFFD700 })
        );
        chandelier.position.y = 12;
        grove.add(chandelier);

        grove.position.set(-60, 0.5, -100);
        this.group.add(grove);
    }

    createPalmTree() {
        const palm = new THREE.Group();

        // Trunk
        const trunk = new THREE.Mesh(
            new THREE.CylinderGeometry(0.3, 0.5, 8, 8),
            new THREE.MeshStandardMaterial({ color: 0x8B7355 })
        );
        trunk.position.y = 4;
        palm.add(trunk);

        // Fronds
        const frondMat = new THREE.MeshStandardMaterial({
            color: 0x228B22,
            side: THREE.DoubleSide
        });
        for (let i = 0; i < 8; i++) {
            const angle = (i / 8) * Math.PI * 2;
            const frond = new THREE.Mesh(
                new THREE.ConeGeometry(0.5, 4, 4),
                frondMat
            );
            frond.position.set(
                Math.cos(angle) * 1.5,
                8,
                Math.sin(angle) * 1.5
            );
            frond.rotation.x = Math.PI / 2 + 0.5;
            frond.rotation.z = angle;
            palm.add(frond);
        }

        // Coconuts
        const coconutMat = new THREE.MeshStandardMaterial({ color: 0x8B4513 });
        for (let i = 0; i < 3; i++) {
            const coconut = new THREE.Mesh(
                new THREE.SphereGeometry(0.2, 8, 8),
                coconutMat
            );
            coconut.position.set(
                (Math.random() - 0.5) * 0.8,
                7.5,
                (Math.random() - 0.5) * 0.8
            );
            palm.add(coconut);
        }

        return palm;
    }

    createArcadeBuildings() {
        const buildingMat = new THREE.MeshStandardMaterial({
            color: 0xE8DCC8, roughness: 0.6
        });
        const roofMat = new THREE.MeshStandardMaterial({ color: 0x8B0000 });

        // Row of arcade buildings
        for (let x = -80; x <= 80; x += 25) {
            // Skip positions where rides are
            if (Math.abs(x - 80) < 20 || Math.abs(x + 80) < 20 || Math.abs(x + 30) < 25) continue;

            const building = new THREE.Group();

            const main = new THREE.Mesh(
                new THREE.BoxGeometry(20, 8, 15),
                buildingMat
            );
            main.position.y = 4;
            main.castShadow = true;
            building.add(main);

            const roof = new THREE.Mesh(
                new THREE.BoxGeometry(22, 1, 17),
                roofMat
            );
            roof.position.y = 8.5;
            building.add(roof);

            // Windows/doors
            const glassMat = new THREE.MeshStandardMaterial({
                color: 0x87CEEB, transparent: true, opacity: 0.5
            });
            for (let i = -6; i <= 6; i += 4) {
                const window = new THREE.Mesh(
                    new THREE.BoxGeometry(3, 4, 0.2),
                    glassMat
                );
                window.position.set(i, 4, 7.6);
                building.add(window);
            }

            // Awning
            const awning = new THREE.Mesh(
                new THREE.BoxGeometry(22, 0.2, 3),
                new THREE.MeshStandardMaterial({ color: 0xFF6B6B })
            );
            awning.position.set(0, 6.5, 9);
            awning.rotation.x = 0.2;
            building.add(awning);

            building.position.set(x, 0.5, -50);
            this.group.add(building);
        }
    }

    createSky() {
        const skyGeo = new THREE.SphereGeometry(400, 32, 32);
        const skyMat = new THREE.ShaderMaterial({
            uniforms: {
                topColor: { value: new THREE.Color(0x0088FF) },
                horizonColor: { value: new THREE.Color(0xFFEEDD) }
            },
            vertexShader: `
                varying vec3 vPos;
                void main() {
                    vPos = position;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform vec3 topColor, horizonColor;
                varying vec3 vPos;
                void main() {
                    float h = normalize(vPos).y;
                    vec3 color = mix(horizonColor, topColor, max(0.0, pow(h, 0.5)));
                    gl_FragColor = vec4(color, 1.0);
                }
            `,
            side: THREE.BackSide
        });
        this.group.add(new THREE.Mesh(skyGeo, skyMat));
    }

    startAnimations() {
        // Animation loop for moving parts
        const animate = () => {
            const time = Date.now() * 0.001;

            this.animatedObjects.forEach(item => {
                if (item.type === 'gondola') {
                    // Move gondolas along the cable
                    const baseX = item.obj.userData.baseX;
                    item.obj.position.x = baseX + Math.sin(time * 0.2) * 80;
                    // Gentle sway
                    item.obj.rotation.z = Math.sin(time * 2) * 0.05;
                } else if (item.type === 'carousel') {
                    // Rotate carousel platform
                    item.obj.rotation.y = time * 0.3;
                }
            });

            requestAnimationFrame(animate);
        };
        animate();
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

