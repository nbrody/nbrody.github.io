/**
 * Santa Cruz - Beach Boardwalk
 * Historic beachfront amusement park
 */
import * as THREE from 'three';

export class BeachBoardwalk {
    constructor(locationGroup) {
        this.group = locationGroup;
    }

    async generate() {
        this.createBeach();
        this.createOcean();
        this.createBoardwalk();
        this.createGiantDipper();
        this.createFerrisWheel();
        this.createArcadeBuildings();
        this.createSky();
    }

    createBeach() {
        const geo = new THREE.PlaneGeometry(300, 100, 50, 20);
        const pos = geo.attributes.position;
        for (let i = 0; i < pos.count; i++) {
            const z = pos.getZ(i);
            // Gentle slope toward ocean
            pos.setZ(i, z * 0.02 + Math.random() * 0.1);
        }
        geo.computeVertexNormals();

        const mat = new THREE.MeshStandardMaterial({
            color: 0xF5DEB3, roughness: 0.95 // Sandy color
        });
        const beach = new THREE.Mesh(geo, mat);
        beach.rotation.x = -Math.PI / 2;
        beach.position.set(0, 0, 30);
        beach.receiveShadow = true;
        this.group.add(beach);
    }

    createOcean() {
        const oceanGeo = new THREE.PlaneGeometry(400, 150);
        const oceanMat = new THREE.MeshStandardMaterial({
            color: 0x2980B9, roughness: 0.3, metalness: 0.1
        });
        const ocean = new THREE.Mesh(oceanGeo, oceanMat);
        ocean.rotation.x = -Math.PI / 2;
        ocean.position.set(0, -0.5, 120);
        this.group.add(ocean);
    }

    createBoardwalk() {
        // Main wooden boardwalk
        const boardwalkMat = new THREE.MeshStandardMaterial({
            color: 0xB8860B, roughness: 0.8 // Weathered wood
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
    }

    createGiantDipper() {
        // Classic wooden roller coaster structure
        const coaster = new THREE.Group();
        coaster.userData = {
            name: 'Giant Dipper Roller Coaster',
            isInteractable: true,
            type: 'attraction',
            interactionType: 'Ride'
        };

        const woodMat = new THREE.MeshStandardMaterial({ color: 0x8B4513, roughness: 0.9 });
        const whiteMat = new THREE.MeshStandardMaterial({ color: 0xFFFFFF, roughness: 0.5 });
        const redMat = new THREE.MeshStandardMaterial({ color: 0xCC0000 });

        // Main structure posts
        for (let x = -40; x <= 40; x += 8) {
            for (let z = -30; z <= 0; z += 10) {
                const height = 15 + Math.sin(x * 0.1) * 10;
                const post = new THREE.Mesh(
                    new THREE.BoxGeometry(0.5, height, 0.5),
                    woodMat
                );
                post.position.set(x, height / 2, z);
                post.castShadow = true;
                coaster.add(post);

                // Cross braces
                if (z < 0) {
                    const brace = new THREE.Mesh(
                        new THREE.BoxGeometry(0.2, 0.2, 10),
                        woodMat
                    );
                    brace.position.set(x, height * 0.5, z + 5);
                    coaster.add(brace);
                }
            }
        }

        // Track (simplified as a curved path)
        const trackPath = [];
        for (let t = 0; t <= 1; t += 0.02) {
            const x = Math.sin(t * Math.PI * 4) * 35;
            const y = 10 + Math.sin(t * Math.PI * 8) * 8;
            const z = -15 + t * 2;
            trackPath.push(new THREE.Vector3(x, y, z));
        }

        // Track rails
        const trackMat = new THREE.MeshStandardMaterial({ color: 0x444444 });
        for (let i = 0; i < trackPath.length - 1; i++) {
            const start = trackPath[i];
            const end = trackPath[i + 1];
            const dir = new THREE.Vector3().subVectors(end, start);
            const len = dir.length();
            const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);

            const rail = new THREE.Mesh(
                new THREE.BoxGeometry(0.1, 0.1, len),
                trackMat
            );
            rail.position.copy(mid);
            rail.lookAt(end);
            coaster.add(rail);
        }

        // Entrance arch
        const arch = new THREE.Mesh(
            new THREE.BoxGeometry(15, 4, 1),
            redMat
        );
        arch.position.set(0, 2, 5);
        coaster.add(arch);

        // "GIANT DIPPER" sign would go here
        const sign = new THREE.Mesh(
            new THREE.BoxGeometry(12, 2, 0.2),
            whiteMat
        );
        sign.position.set(0, 5, 5);
        coaster.add(sign);

        coaster.position.set(-50, 0.5, -40);
        this.group.add(coaster);
    }

    createFerrisWheel() {
        const wheel = new THREE.Group();
        wheel.userData = {
            name: 'Ferris Wheel',
            isInteractable: true,
            type: 'attraction',
            interactionType: 'Ride'
        };

        const metalMat = new THREE.MeshStandardMaterial({
            color: 0xCCCCCC, roughness: 0.3, metalness: 0.7
        });
        const redMat = new THREE.MeshStandardMaterial({ color: 0xCC0000 });

        // Main wheel ring
        const ring = new THREE.Mesh(
            new THREE.TorusGeometry(15, 0.3, 8, 32),
            metalMat
        );
        ring.rotation.y = Math.PI / 2;
        ring.position.y = 18;
        wheel.add(ring);

        // Spokes
        for (let i = 0; i < 12; i++) {
            const angle = (i / 12) * Math.PI * 2;
            const spoke = new THREE.Mesh(
                new THREE.CylinderGeometry(0.1, 0.1, 15, 8),
                metalMat
            );
            spoke.rotation.z = angle;
            spoke.position.y = 18;
            wheel.add(spoke);

            // Gondolas
            const gondola = new THREE.Mesh(
                new THREE.BoxGeometry(2, 2, 2),
                redMat
            );
            gondola.position.set(
                0,
                18 + Math.sin(angle) * 14,
                Math.cos(angle) * 14
            );
            wheel.add(gondola);
        }

        // Support structure
        const support1 = new THREE.Mesh(
            new THREE.BoxGeometry(1, 20, 1),
            metalMat
        );
        support1.position.set(0, 10, -8);
        support1.rotation.x = -0.2;
        wheel.add(support1);

        const support2 = new THREE.Mesh(
            new THREE.BoxGeometry(1, 20, 1),
            metalMat
        );
        support2.position.set(0, 10, 8);
        support2.rotation.x = 0.2;
        wheel.add(support2);

        wheel.position.set(50, 0.5, -40);
        this.group.add(wheel);
    }

    createArcadeBuildings() {
        const buildingMat = new THREE.MeshStandardMaterial({
            color: 0xE8DCC8, roughness: 0.6
        });
        const roofMat = new THREE.MeshStandardMaterial({ color: 0x8B0000 });

        // Row of arcade buildings
        for (let x = -80; x <= 80; x += 25) {
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
