/**
 * Faculty Office 4-12 — interior scene.
 *
 * A small mathematics-faculty office on the 4th floor of McHenry,
 * with a glass wall facing the atrium (represented by a painted view
 * of the atrium / redwoods outside).
 */

import * as THREE from 'three';
import { InteriorBase } from './interiorBase.js';

export class FacultyOffice412Interior extends InteriorBase {
    constructor(group) {
        super(group);
        this.name = 'Faculty Office 4-12';
        this.W = 8;
        this.D = 8;
        this.H = 3.6;
        // Spawn: just inside the door, facing into the office
        this.spawnX = 0;
        this.spawnZ = this.D / 2 - 1.2;
        this.spawnYaw = 0; // -Z = away from door, into the room
    }

    async generate() {
        this._buildMaterials();
        this._buildShell();
        this._buildGlassWallWithView();
        this._buildDesk();
        this._buildChair();
        this._buildBookshelves();
        this._buildChalkboard();
        this._buildPlant();
        this._buildExitPortal_();
    }

    _buildMaterials() {
        this.mat = {
            floor: new THREE.MeshStandardMaterial({ color: 0x8B6A42, roughness: 0.85 }),
            wall: new THREE.MeshStandardMaterial({ color: 0xE4D9C0, roughness: 0.88 }),
            ceiling: new THREE.MeshStandardMaterial({ color: 0xF5F0DE, roughness: 0.85 }),
            wood: new THREE.MeshStandardMaterial({ color: 0x5A3818, roughness: 0.85 }),
            woodDark: new THREE.MeshStandardMaterial({ color: 0x3E2A1A, roughness: 0.85 }),
            glass: new THREE.MeshStandardMaterial({
                color: 0x8AB0C0, roughness: 0.08, metalness: 0.3,
                transparent: true, opacity: 0.35
            }),
            mullion: new THREE.MeshStandardMaterial({
                color: 0x3A3A3A, roughness: 0.5, metalness: 0.3
            }),
            bulb: new THREE.MeshStandardMaterial({
                color: 0xFFE6A8, emissive: 0xFFB060, emissiveIntensity: 0.65
            }),
            chalkboard: new THREE.MeshStandardMaterial({
                color: 0x14241A, roughness: 0.9
            })
        };
    }

    _buildShell() {
        const { W, D, H, mat } = { W: this.W, D: this.D, H: this.H, mat: this.mat };

        // Floor (wooden)
        this.group.add(this._buildFloor(W, D, mat.floor));

        // Walls — N (bookshelves), E (chalkboard), S (with doorway), W (glass, built separately)
        this.group.add(this._buildWall('N', W, D, H, mat.wall));
        this.group.add(this._buildWall('E', W, D, H, mat.wall));
        // South wall with doorway for exit portal
        this.group.add(this._buildWallWithDoorway('S', W, D, H, mat.wall, 2.2, 3.0));

        // Ceiling
        this.group.add(this._buildCeiling(W, D, H, mat.ceiling));

        // Ceiling light
        const light = new THREE.Mesh(
            new THREE.BoxGeometry(1.5, 0.08, 0.4), mat.bulb
        );
        light.position.set(0, H - 0.05, 0);
        this.group.add(light);

        // Floor rug (dark blue, in front of desk)
        const rug = new THREE.Mesh(
            new THREE.PlaneGeometry(3.5, 2.5),
            new THREE.MeshStandardMaterial({ color: 0x2C3E50, roughness: 0.92 })
        );
        rug.rotation.x = -Math.PI / 2;
        rug.position.set(0, 0.02, 0);
        rug.userData.noCollision = true;
        this.group.add(rug);
    }

    _buildGlassWallWithView() {
        const { W, D, H, mat } = { W: this.W, D: this.D, H: this.H, mat: this.mat };

        // West wall: glass pane taking most of the wall
        const glassW = new THREE.Mesh(
            new THREE.BoxGeometry(0.08, H, D), mat.glass
        );
        glassW.position.set(-W/2, H/2, 0);
        this.group.add(glassW);

        // Mullions (vertical black bars)
        for (let i = 0; i < 5; i++) {
            const t = i / 4;
            const mullion = new THREE.Mesh(
                new THREE.BoxGeometry(0.1, H, 0.12), mat.mullion
            );
            mullion.position.set(-W/2 + 0.01, H/2, -D/2 + D * t);
            this.group.add(mullion);
        }
        // Horizontal mid-rail
        const midRail = new THREE.Mesh(
            new THREE.BoxGeometry(0.12, 0.08, D), mat.mullion
        );
        midRail.position.set(-W/2 + 0.01, H * 0.55, 0);
        this.group.add(midRail);

        // "View" plane behind the glass — a canvas-painted view of the atrium
        // and the redwoods beyond. Feels like looking out the window.
        const view = new THREE.Mesh(
            new THREE.PlaneGeometry(D * 1.4, H * 1.2),
            new THREE.MeshBasicMaterial({
                map: this._makeAtriumViewTex()
            })
        );
        view.position.set(-W/2 - 0.4, H/2, 0);
        view.rotation.y = Math.PI / 2;
        view.userData.noCollision = true;
        this.group.add(view);

        // A small windowsill
        const sill = new THREE.Mesh(
            new THREE.BoxGeometry(0.25, 0.08, D - 0.3),
            this.mat.woodDark
        );
        sill.position.set(-W/2 + 0.15, 0.9, 0);
        this.group.add(sill);
    }

    _buildDesk() {
        const { mat } = this;
        const dx = 1.5, dz = -1.5;

        // Desk top
        const top = new THREE.Mesh(
            new THREE.BoxGeometry(2.6, 0.08, 1.2), mat.wood
        );
        top.position.set(dx, 0.8, dz);
        top.castShadow = true;
        this.group.add(top);
        // Legs
        for (const sx of [-1.15, 1.15]) {
            for (const sz of [-0.5, 0.5]) {
                const leg = new THREE.Mesh(
                    new THREE.BoxGeometry(0.08, 0.8, 0.08), mat.woodDark
                );
                leg.position.set(dx + sx, 0.4, dz + sz);
                this.group.add(leg);
            }
        }
        // Drawer unit
        const drawer = new THREE.Mesh(
            new THREE.BoxGeometry(1.1, 0.55, 1.0), mat.wood
        );
        drawer.position.set(dx + 0.7, 0.5, dz);
        this.group.add(drawer);
        // Drawer pulls
        for (let i = 0; i < 3; i++) {
            const pull = new THREE.Mesh(
                new THREE.BoxGeometry(0.2, 0.03, 0.04),
                new THREE.MeshStandardMaterial({
                    color: 0xC0A060, roughness: 0.3, metalness: 0.7
                })
            );
            pull.position.set(dx + 0.7, 0.25 + i * 0.18, dz + 0.51);
            this.group.add(pull);
        }

        // Laptop
        const laptopBase = new THREE.Mesh(
            new THREE.BoxGeometry(0.55, 0.03, 0.4),
            new THREE.MeshStandardMaterial({
                color: 0xB8B8B8, roughness: 0.3, metalness: 0.7
            })
        );
        laptopBase.position.set(dx - 0.4, 0.86, dz);
        this.group.add(laptopBase);
        const laptopScreen = new THREE.Mesh(
            new THREE.BoxGeometry(0.55, 0.4, 0.03),
            new THREE.MeshStandardMaterial({
                color: 0x2A3A55, emissive: 0x3A5A85, emissiveIntensity: 0.6
            })
        );
        laptopScreen.position.set(dx - 0.4, 1.08, dz - 0.18);
        laptopScreen.rotation.x = -0.2;
        this.group.add(laptopScreen);

        // Papers / book stack
        const stack = new THREE.Mesh(
            new THREE.BoxGeometry(0.45, 0.3, 0.32),
            new THREE.MeshStandardMaterial({ color: 0xE8E0C8, roughness: 0.9 })
        );
        stack.position.set(dx + 0.7, 0.98, dz - 0.2);
        this.group.add(stack);
        // Colored book on top
        const book = new THREE.Mesh(
            new THREE.BoxGeometry(0.38, 0.05, 0.28),
            new THREE.MeshStandardMaterial({ color: 0x8B2E2E, roughness: 0.85 })
        );
        book.position.set(dx + 0.7, 1.15, dz - 0.2);
        this.group.add(book);

        // Coffee mug
        const mugBody = new THREE.Mesh(
            new THREE.CylinderGeometry(0.055, 0.05, 0.11, 12),
            new THREE.MeshStandardMaterial({ color: 0xE8C440, roughness: 0.5 })
        );
        mugBody.position.set(dx + 0.9, 0.91, dz + 0.3);
        this.group.add(mugBody);
        const mugHandle = new THREE.Mesh(
            new THREE.TorusGeometry(0.045, 0.012, 6, 10, Math.PI),
            new THREE.MeshStandardMaterial({ color: 0xE8C440, roughness: 0.5 })
        );
        mugHandle.rotation.y = Math.PI / 2;
        mugHandle.position.set(dx + 0.96, 0.91, dz + 0.3);
        this.group.add(mugHandle);

        // Desk lamp
        const lampBase = new THREE.Mesh(
            new THREE.CylinderGeometry(0.1, 0.12, 0.05, 10),
            new THREE.MeshStandardMaterial({ color: 0x1A1A1A, roughness: 0.6 })
        );
        lampBase.position.set(dx - 1.05, 0.87, dz - 0.25);
        this.group.add(lampBase);
        const lampArm = new THREE.Mesh(
            new THREE.CylinderGeometry(0.018, 0.018, 0.5, 6),
            new THREE.MeshStandardMaterial({ color: 0x1A1A1A })
        );
        lampArm.rotation.z = -0.6;
        lampArm.position.set(dx - 0.92, 1.16, dz - 0.25);
        this.group.add(lampArm);
        const lampShade = new THREE.Mesh(
            new THREE.CylinderGeometry(0.09, 0.14, 0.16, 10), this.mat.bulb
        );
        lampShade.rotation.z = -0.6;
        lampShade.position.set(dx - 0.65, 1.37, dz - 0.25);
        this.group.add(lampShade);

        // Framed photo
        const photo = new THREE.Mesh(
            new THREE.BoxGeometry(0.28, 0.22, 0.03),
            new THREE.MeshStandardMaterial({ color: 0x8B6A42, roughness: 0.85 })
        );
        photo.position.set(dx + 1.05, 0.97, dz + 0.1);
        photo.rotation.x = 0.1;
        this.group.add(photo);

        // Pen holder
        const penHolder = new THREE.Mesh(
            new THREE.CylinderGeometry(0.05, 0.05, 0.12, 8),
            this.mat.woodDark
        );
        penHolder.position.set(dx - 0.4, 0.91, dz + 0.4);
        this.group.add(penHolder);
        for (let i = 0; i < 3; i++) {
            const penColors = [0x1A1A1A, 0x3A5B70, 0xC43D3D];
            const pen = new THREE.Mesh(
                new THREE.CylinderGeometry(0.008, 0.008, 0.15, 6),
                new THREE.MeshStandardMaterial({ color: penColors[i] })
            );
            pen.position.set(dx - 0.4 + (i-1)*0.02, 1.02, dz + 0.4);
            pen.rotation.z = (i - 1) * 0.1;
            this.group.add(pen);
        }
    }

    _buildChair() {
        const chair = new THREE.Group();
        const mat = new THREE.MeshStandardMaterial({ color: 0x1A1A1A, roughness: 0.7 });
        const stem = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.5, metalness: 0.5 });

        const seat = new THREE.Mesh(
            new THREE.CylinderGeometry(0.3, 0.32, 0.1, 16), mat
        );
        seat.position.y = 0.55;
        chair.add(seat);
        const back = new THREE.Mesh(
            new THREE.BoxGeometry(0.5, 0.9, 0.08), mat
        );
        back.position.set(0, 1.05, -0.25);
        chair.add(back);
        const stemMesh = new THREE.Mesh(
            new THREE.CylinderGeometry(0.04, 0.04, 0.45, 6), stem
        );
        stemMesh.position.y = 0.27;
        chair.add(stemMesh);
        for (let i = 0; i < 5; i++) {
            const a = (i / 5) * Math.PI * 2;
            const arm = new THREE.Mesh(
                new THREE.BoxGeometry(0.04, 0.04, 0.28), stem
            );
            arm.position.set(Math.cos(a) * 0.14, 0.08, Math.sin(a) * 0.14);
            arm.rotation.y = -a;
            chair.add(arm);
            const wheel = new THREE.Mesh(
                new THREE.CylinderGeometry(0.04, 0.04, 0.05, 10), stem
            );
            wheel.rotation.z = Math.PI / 2;
            wheel.position.set(Math.cos(a) * 0.28, 0.04, Math.sin(a) * 0.28);
            chair.add(wheel);
        }
        chair.position.set(1.3, 0, -0.2);
        chair.rotation.y = 0.4;
        this.group.add(chair);
    }

    _buildBookshelves() {
        // Three shelves on the north wall
        const shelfMat = this.mat.wood;
        const bookColors = [0x3A5B70, 0x8B2E2E, 0xE8C440, 0x2D5530, 0x4A2E1A,
                            0x6E3E7A, 0xA84E3A, 0x1C4E80];
        for (let s = 0; s < 4; s++) {
            const shelfY = 0.8 + s * 0.7;
            const shelf = new THREE.Mesh(
                new THREE.BoxGeometry(this.W - 1.4, 0.05, 0.3), shelfMat
            );
            shelf.position.set(0, shelfY, -this.D/2 + 0.22);
            this.group.add(shelf);
            // Books on shelf
            let bx = -(this.W - 1.6) / 2;
            while (bx < (this.W - 1.6) / 2 - 0.2) {
                const bw = 0.12 + Math.random() * 0.15;
                if (bx + bw > (this.W - 1.6) / 2) break;
                const book = new THREE.Mesh(
                    new THREE.BoxGeometry(bw, 0.5 + Math.random() * 0.12, 0.22),
                    new THREE.MeshStandardMaterial({
                        color: bookColors[Math.floor(Math.random() * bookColors.length)],
                        roughness: 0.85
                    })
                );
                book.position.set(bx + bw/2, shelfY + 0.3, -this.D/2 + 0.22);
                this.group.add(book);
                bx += bw + 0.01;
            }
        }

        // Side supports
        for (const sx of [-(this.W - 1.4)/2 - 0.05, (this.W - 1.4)/2 + 0.05]) {
            const side = new THREE.Mesh(
                new THREE.BoxGeometry(0.05, 3.0, 0.3), shelfMat
            );
            side.position.set(sx, 2.0, -this.D/2 + 0.22);
            this.group.add(side);
        }
    }

    _buildChalkboard() {
        // East wall — framed chalkboard with math on it
        const cbW = 0.08, cbH = 1.6, cbD = 2.4;
        const cb = new THREE.Mesh(
            new THREE.BoxGeometry(cbW, cbH, cbD),
            this.mat.chalkboard
        );
        cb.position.set(this.W/2 - 0.1, 1.95, 0);
        this.group.add(cb);
        // Frame
        const frame = new THREE.Mesh(
            new THREE.BoxGeometry(cbW * 0.8, cbH + 0.15, cbD + 0.15),
            this.mat.wood
        );
        frame.position.set(this.W/2 - 0.13, 1.95, 0);
        this.group.add(frame);

        // Chalked math (drawn on a plane slightly inside the board)
        const mathText = new THREE.Mesh(
            new THREE.PlaneGeometry(2.2, 1.4),
            new THREE.MeshBasicMaterial({
                map: this._makeChalkboardTex(),
                transparent: true
            })
        );
        mathText.position.set(this.W/2 - 0.15, 1.95, 0);
        mathText.rotation.y = -Math.PI / 2;
        this.group.add(mathText);

        // Chalk tray
        const tray = new THREE.Mesh(
            new THREE.BoxGeometry(0.1, 0.04, cbD * 0.9),
            this.mat.wood
        );
        tray.position.set(this.W/2 - 0.15, 1.95 - cbH/2 - 0.03, 0);
        this.group.add(tray);
        // Pieces of chalk
        for (let i = 0; i < 3; i++) {
            const chalk = new THREE.Mesh(
                new THREE.BoxGeometry(0.04, 0.04, 0.15),
                new THREE.MeshStandardMaterial({ color: 0xF5F0DE, roughness: 0.9 })
            );
            chalk.position.set(this.W/2 - 0.15, 1.95 - cbH/2, -0.5 + i * 0.5);
            this.group.add(chalk);
        }
    }

    _buildPlant() {
        // Potted plant near the window
        const pot = new THREE.Mesh(
            new THREE.CylinderGeometry(0.22, 0.17, 0.35, 10),
            new THREE.MeshStandardMaterial({ color: 0xCC5A3A, roughness: 0.85 })
        );
        pot.position.set(-this.W/2 + 0.8, 0.18, -this.D/2 + 1.2);
        this.group.add(pot);
        for (let i = 0; i < 5; i++) {
            const leaf = new THREE.Mesh(
                new THREE.SphereGeometry(0.28 + Math.random() * 0.12, 8, 6),
                new THREE.MeshStandardMaterial({
                    color: 0x2D5530 + (Math.random() - 0.5) * 0x1000,
                    roughness: 0.82
                })
            );
            leaf.position.set(
                -this.W/2 + 0.8 + (Math.random() - 0.5) * 0.3,
                0.55 + Math.random() * 0.35,
                -this.D/2 + 1.2 + (Math.random() - 0.5) * 0.3
            );
            this.group.add(leaf);
        }
    }

    _buildExitPortal_() {
        const exit = this._buildExitPortal({
            name: 'Exit to McHenry Library',
            signText: 'EXIT',
            tint: 0x6FAEDC,
            x: 0, y: 0, z: this.D / 2 - 0.25,
            rotY: Math.PI
        });
        this.group.add(exit);
    }

    _makeChalkboardTex() {
        const canvas = document.createElement('canvas');
        canvas.width = 1024; canvas.height = 640;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, 1024, 640);
        // Faint chalky dust
        ctx.fillStyle = 'rgba(245, 240, 222, 0.05)';
        for (let i = 0; i < 30; i++) {
            ctx.beginPath();
            ctx.arc(Math.random() * 1024, Math.random() * 640,
                40 + Math.random() * 80, 0, Math.PI * 2);
            ctx.fill();
        }
        // Handwritten-style math
        ctx.fillStyle = '#F5F0DE';
        ctx.font = '48px "Courier New", monospace';
        ctx.fillText('π₁(SL₃(ℤ)) = 1 ?', 60, 100);
        ctx.font = '42px "Courier New", monospace';
        ctx.fillText('Property (T) → rigidity', 60, 180);
        ctx.fillText('H¹(G,ℝ) = 0  ⇔  (T)', 60, 240);

        ctx.font = '32px "Courier New", monospace';
        ctx.fillText('reading group: Fri 3pm', 60, 340);
        ctx.fillText('prelim grading due', 60, 390);
        ctx.fillText('REU apps  —  5/1', 60, 440);

        ctx.font = 'italic 32px "Georgia", serif';
        ctx.fillStyle = '#FFE0A0';
        ctx.fillText('office hrs: T/Th 2–4', 60, 560);

        const tex = new THREE.CanvasTexture(canvas);
        tex.anisotropy = 4;
        return tex;
    }

    _makeAtriumViewTex() {
        const canvas = document.createElement('canvas');
        canvas.width = 512; canvas.height = 384;
        const ctx = canvas.getContext('2d');
        // Atrium interior: cool gray upper (skylight), concrete walls,
        // redwoods visible through the far window
        const sky = ctx.createLinearGradient(0, 0, 0, 160);
        sky.addColorStop(0, '#B8D0DC');
        sky.addColorStop(1, '#98B0BC');
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, 512, 160);
        // Skylight beams
        for (let i = 0; i < 5; i++) {
            ctx.fillStyle = 'rgba(255,255,255,0.15)';
            ctx.fillRect(i * 100 - 20, 0, 60, 160);
        }
        // Atrium walls — tan concrete (1968 Brutalist + 2008 addition)
        ctx.fillStyle = '#C0AD8A';
        ctx.fillRect(0, 120, 512, 180);
        // Concrete mullions/lines
        ctx.strokeStyle = 'rgba(100,80,60,0.5)';
        ctx.lineWidth = 2;
        for (let x = 0; x < 512; x += 36) {
            ctx.beginPath();
            ctx.moveTo(x, 120);
            ctx.lineTo(x, 300);
            ctx.stroke();
        }
        // Floor
        ctx.fillStyle = '#D4C4A4';
        ctx.fillRect(0, 260, 512, 124);
        // Redwoods through a distant window opening
        ctx.fillStyle = '#2A3F20';
        for (let i = 0; i < 18; i++) {
            const tx = 40 + i * 28;
            const th = 40 + Math.random() * 50;
            // Trunk
            ctx.fillStyle = '#5C3D2E';
            ctx.fillRect(tx - 2, 200 - th, 4, th);
            // Foliage
            ctx.fillStyle = ['#2A3F20', '#324A26', '#3D5A2E'][i % 3];
            ctx.beginPath();
            ctx.moveTo(tx, 200 - th - 50);
            ctx.lineTo(tx - 14, 200 - th);
            ctx.lineTo(tx + 14, 200 - th);
            ctx.closePath();
            ctx.fill();
        }
        // Sunlight dust motes
        for (let i = 0; i < 25; i++) {
            ctx.fillStyle = `rgba(255,240,200,${0.2 + Math.random() * 0.3})`;
            ctx.beginPath();
            ctx.arc(Math.random() * 512, Math.random() * 384, 1.5, 0, Math.PI * 2);
            ctx.fill();
        }
        const tex = new THREE.CanvasTexture(canvas);
        tex.anisotropy = 4;
        return tex;
    }
}
