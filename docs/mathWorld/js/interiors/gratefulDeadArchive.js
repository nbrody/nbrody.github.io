/**
 * Grateful Dead Archive — interior scene.
 *
 * A fully walkable exhibit hall. Donated to UCSC's McHenry Library in
 * 2008, the real archive contains 600+ linear feet of materials —
 * concert tapes, setlists, stage gear, posters, correspondence, and
 * the band's business records.
 *
 * Layout (floor plan, looking down; origin at centre, +Z south):
 *
 *        N
 *     ┌─────────────────── 30 m ───────────────────┐
 *     │                                            │
 *     │  [Posters Gallery]   [Dead Central listen] │
 *     │                                            │
 *   W │        [Display Cases — centre]            │ E
 *   ▲ │                                            │
 *   22│  [Dancing Bears wall]  [Steal Your Face]   │
 *   m │                                            │
 *     │          [Reception]  [EXIT portal]        │
 *     │                                            │
 *     └────────────────────────────────────────────┘
 *        S (entrance / exit)
 *
 * Player enters at the south end near the reception / exit portal.
 */

import * as THREE from 'three';
import { InteriorBase } from './interiorBase.js';

export class GratefulDeadArchiveInterior extends InteriorBase {
    constructor(group) {
        super(group);
        this.name = 'Grateful Dead Archive';
        // Room dimensions
        this.W = 30;
        this.D = 22;
        this.H = 5;
        // Spawn: facing north into the exhibit, a couple of metres in from exit
        this.spawnX = 0;
        this.spawnZ = this.D / 2 - 2;
        this.spawnYaw = 0;   // forward = -Z (north, into the archive)
    }

    async generate() {
        this._buildMaterials();
        this._buildShell();
        this._buildReception();
        this._buildDisplayCases();
        this._buildStealYourFaceWall();
        this._buildDancingBearsWall();
        this._buildPosterGallery();
        this._buildDeadCentralBooth();
        this._buildCeilingBanners();
        this._buildExitPortal_();
    }

    _buildMaterials() {
        this.mat = {
            floor: new THREE.MeshStandardMaterial({ color: 0x7B2626, roughness: 0.88 }),
            tile:  new THREE.MeshStandardMaterial({ color: 0x1A1A1A, roughness: 0.9 }),
            wall:  new THREE.MeshStandardMaterial({ color: 0xEDE2CB, roughness: 0.88 }),
            trim:  new THREE.MeshStandardMaterial({ color: 0x2A1A10, roughness: 0.8 }),
            wood:  new THREE.MeshStandardMaterial({ color: 0x4A2E1A, roughness: 0.85 }),
            woodLight: new THREE.MeshStandardMaterial({ color: 0x5A3818, roughness: 0.85 }),
            caseGlass: new THREE.MeshStandardMaterial({
                color: 0x8AA8B8, roughness: 0.1, metalness: 0.3,
                transparent: true, opacity: 0.35
            }),
            ceiling: new THREE.MeshStandardMaterial({ color: 0x2A2A2A, roughness: 0.85 }),
            bulb: new THREE.MeshStandardMaterial({
                color: 0xFFE0A0, emissive: 0xFFB060, emissiveIntensity: 0.9
            }),
            ropePole: new THREE.MeshStandardMaterial({
                color: 0xB89A4A, roughness: 0.3, metalness: 0.8
            }),
            rope: new THREE.MeshStandardMaterial({ color: 0xA8001B, roughness: 0.7 })
        };
    }

    _buildShell() {
        const { W, D, H, mat } = { W: this.W, D: this.D, H: this.H, mat: this.mat };

        // Dark red floor
        this.group.add(this._buildFloor(W, D, mat.floor));
        // Checker accents on the floor
        for (let i = 0; i < 14; i++) {
            for (let j = 0; j < 10; j++) {
                if ((i + j) % 2) continue;
                const tile = new THREE.Mesh(
                    new THREE.PlaneGeometry(2, 2),
                    mat.tile
                );
                tile.rotation.x = -Math.PI / 2;
                tile.position.set(-W/2 + 1 + i * 2.1, 0.01, -D/2 + 1.2 + j * 2.1);
                tile.userData.noCollision = true;
                this.group.add(tile);
            }
        }

        // Walls (N, E, W solid; S has doorway where the exit lives)
        this.group.add(this._buildWall('N', W, D, H, mat.wall));
        this.group.add(this._buildWall('E', W, D, H, mat.wall));
        this.group.add(this._buildWall('W', W, D, H, mat.wall));
        // South wall with doorway (doorway is where the exit portal sits)
        this.group.add(this._buildWallWithDoorway('S', W, D, H, mat.wall, 3, 3.2));

        // Ceiling
        this.group.add(this._buildCeiling(W, D, H, mat.ceiling));

        // Ceiling grid of spotlight fixtures
        for (let gx = -2; gx <= 2; gx += 2) {
            for (let gz = -2; gz <= 2; gz += 2) {
                const fx = gx * 4;
                const fz = gz * 2.5;
                const fix = new THREE.Mesh(
                    new THREE.CylinderGeometry(0.14, 0.22, 0.35, 10), mat.trim
                );
                fix.position.set(fx, H - 0.18, fz);
                this.group.add(fix);
                const bulb = new THREE.Mesh(
                    new THREE.SphereGeometry(0.12, 10, 7), mat.bulb
                );
                bulb.position.set(fx, H - 0.45, fz);
                this.group.add(bulb);
            }
        }

        // Main marquee on north wall — "GRATEFUL DEAD ARCHIVE"
        const marquee = new THREE.Mesh(
            new THREE.PlaneGeometry(14, 1.6),
            new THREE.MeshBasicMaterial({
                map: this._makeDeadSignTex('GRATEFUL DEAD ARCHIVE'),
                transparent: true
            })
        );
        marquee.position.set(0, H - 1.0, -D/2 + 0.05);
        this.group.add(marquee);
    }

    _buildReception() {
        const desk = new THREE.Mesh(
            new THREE.BoxGeometry(4, 1.1, 0.9), this.mat.woodLight
        );
        desk.position.set(-6, 0.55, this.D/2 - 4);
        this.group.add(desk);
        // Monitor
        const monitor = new THREE.Mesh(
            new THREE.BoxGeometry(0.55, 0.4, 0.05),
            new THREE.MeshStandardMaterial({
                color: 0x1A1A1A, emissive: 0x2C3E50, emissiveIntensity: 0.35
            })
        );
        monitor.position.set(-6.6, 1.35, this.D/2 - 4);
        this.group.add(monitor);
        // Lamp
        const lampBase = new THREE.Mesh(
            new THREE.CylinderGeometry(0.1, 0.12, 0.05, 10),
            new THREE.MeshStandardMaterial({ color: 0x1A1A1A })
        );
        lampBase.position.set(-5.0, 1.13, this.D/2 - 4);
        this.group.add(lampBase);
        const lampShade = new THREE.Mesh(
            new THREE.CylinderGeometry(0.09, 0.14, 0.18, 10), this.mat.bulb
        );
        lampShade.position.set(-5.0, 1.35, this.D/2 - 4);
        this.group.add(lampShade);

        // Welcome placard behind reception
        const placard = new THREE.Mesh(
            new THREE.PlaneGeometry(3.2, 1.2),
            new THREE.MeshBasicMaterial({
                map: this._makeWelcomeTex(),
                transparent: true
            })
        );
        placard.position.set(-6, 2.6, this.D/2 - 4.55);
        this.group.add(placard);
    }

    _buildDisplayCases() {
        // Six cases in two rows running east-west, centred
        const specs = [
            { x: -9, z: -3, title: 'Original Setlists',     color: 0xF1C40F },
            { x:  0, z: -3, title: 'Stage Costumes',        color: 0xC43D3D },
            { x:  9, z: -3, title: '"Wolf" — Jerry\'s Guitar', color: 0x8E44AD },
            { x: -9, z:  3, title: 'Rare Posters',          color: 0x3A7BA8 },
            { x:  0, z:  3, title: 'Band Correspondence',   color: 0x2ECC71 },
            { x:  9, z:  3, title: 'Master Tapes (Vault)',  color: 0xE8C440 }
        ];
        for (const s of specs) {
            const ped = new THREE.Mesh(
                new THREE.BoxGeometry(2.0, 0.9, 1.4), this.mat.wood
            );
            ped.position.set(s.x, 0.45, s.z);
            this.group.add(ped);
            const glass = new THREE.Mesh(
                new THREE.BoxGeometry(1.8, 1.3, 1.2), this.mat.caseGlass
            );
            glass.position.set(s.x, 1.55, s.z);
            this.group.add(glass);
            const item = new THREE.Mesh(
                new THREE.BoxGeometry(0.8, 0.55, 0.55),
                new THREE.MeshStandardMaterial({ color: s.color, roughness: 0.7 })
            );
            item.position.set(s.x, 1.2, s.z);
            this.group.add(item);
            // Plaque on front of pedestal
            const plaque = new THREE.Mesh(
                new THREE.PlaneGeometry(1.8, 0.3),
                new THREE.MeshBasicMaterial({
                    map: this._makePlaqueTex(s.title), transparent: true
                })
            );
            plaque.position.set(s.x, 0.7, s.z + 0.71);
            this.group.add(plaque);
        }

        // Velvet rope barriers around the case clusters (so it feels like a museum)
        for (const z of [-5.5, 5.5]) {
            for (let i = -5; i <= 5; i += 2.5) {
                const pole = new THREE.Mesh(
                    new THREE.CylinderGeometry(0.045, 0.045, 1.1, 8), this.mat.ropePole
                );
                pole.position.set(i, 0.55, z);
                this.group.add(pole);
                const ball = new THREE.Mesh(
                    new THREE.SphereGeometry(0.08, 10, 6), this.mat.ropePole
                );
                ball.position.set(i, 1.12, z);
                this.group.add(ball);
                if (i < 5) {
                    const rope = new THREE.Mesh(
                        new THREE.CylinderGeometry(0.03, 0.03, 2.5, 6), this.mat.rope
                    );
                    rope.rotation.z = Math.PI / 2;
                    rope.position.set(i + 1.25, 0.88, z);
                    this.group.add(rope);
                }
            }
        }
    }

    _buildStealYourFaceWall() {
        // East wall — big skull logo
        const skull = new THREE.Mesh(
            new THREE.PlaneGeometry(5.5, 5.5),
            new THREE.MeshBasicMaterial({
                map: this._makeStealYourFaceTex(),
                transparent: true
            })
        );
        skull.position.set(this.W/2 - 0.06, 2.5, 0);
        skull.rotation.y = -Math.PI / 2;
        this.group.add(skull);

        // Info placard below
        const placard = new THREE.Mesh(
            new THREE.PlaneGeometry(3, 0.8),
            new THREE.MeshBasicMaterial({
                map: this._makePlaqueTex('"Steal Your Face" — Owsley Stanley & Bob Thomas, 1969'),
                transparent: true
            })
        );
        placard.position.set(this.W/2 - 0.07, 0.8, -3);
        placard.rotation.y = -Math.PI / 2;
        this.group.add(placard);
    }

    _buildDancingBearsWall() {
        // West wall — six dancing bears in a row
        const bearColors = [0xE74C3C, 0xF39C12, 0xF1C40F, 0x2ECC71, 0x3498DB, 0x9B59B6];
        for (let i = 0; i < 6; i++) {
            const bear = this._buildBear(bearColors[i], 1.4);
            bear.position.set(-this.W/2 + 1.5, 0.2, -5 + i * 2);
            bear.rotation.y = Math.PI / 2 + Math.sin(i * 1.9) * 0.25;
            this.group.add(bear);
        }
        // Placard
        const placard = new THREE.Mesh(
            new THREE.PlaneGeometry(3, 0.8),
            new THREE.MeshBasicMaterial({
                map: this._makePlaqueTex('"Dancing Bears" — cover art for History of the Grateful Dead Vol. 1 (1973)'),
                transparent: true
            })
        );
        placard.position.set(-this.W/2 + 0.07, 3.5, 0);
        placard.rotation.y = Math.PI / 2;
        this.group.add(placard);
    }

    _buildPosterGallery() {
        // North wall — eight concert posters
        const venues = [
            { bg: 0xE74C3C, txt: 'FILLMORE AUD.' },
            { bg: 0x8B2E2E, txt: 'AVALON' },
            { bg: 0x3A7BA8, txt: 'WINTERLAND' },
            { bg: 0xF1C40F, txt: 'HAMPTON, VA' },
            { bg: 0x9B59B6, txt: 'MADISON SQ G.' },
            { bg: 0x2ECC71, txt: 'RED ROCKS' },
            { bg: 0xE67E22, txt: 'SOLDIER FIELD' },
            { bg: 0xC0392B, txt: 'CORNELL 5/8/77' }
        ];
        for (let i = 0; i < venues.length; i++) {
            const poster = new THREE.Mesh(
                new THREE.PlaneGeometry(1.7, 2.3),
                new THREE.MeshBasicMaterial({
                    map: this._makePosterTex(venues[i].txt, venues[i].bg),
                    transparent: true
                })
            );
            poster.position.set(-12 + i * 3.2, 2.5, -this.D/2 + 0.06);
            this.group.add(poster);
        }
    }

    _buildDeadCentralBooth() {
        // Small listening booth in the NE corner — Jerry's chair, headphones hanging,
        // a little side table with vinyl sleeves, vintage reel-to-reel.
        const boothX = 10, boothZ = -7;

        // Booth "walls" — half-height to suggest a private nook
        for (const side of ['N', 'E']) {
            const wW = side === 'N' ? 6 : 0.15;
            const wD = side === 'N' ? 0.15 : 5;
            const mesh = new THREE.Mesh(
                new THREE.BoxGeometry(wW, 2.2, wD), this.mat.trim
            );
            if (side === 'N') mesh.position.set(boothX, 1.1, boothZ - 2.5);
            else              mesh.position.set(boothX + 3, 1.1, boothZ);
            this.group.add(mesh);
        }

        // Jerry's armchair — leather-ish brown
        const chairMat = new THREE.MeshStandardMaterial({
            color: 0x5A3818, roughness: 0.7
        });
        const chairBase = new THREE.Mesh(
            new THREE.BoxGeometry(1.3, 0.4, 1.1), chairMat
        );
        chairBase.position.set(boothX, 0.25, boothZ);
        this.group.add(chairBase);
        const chairSeat = new THREE.Mesh(
            new THREE.BoxGeometry(1.3, 0.2, 1.1), chairMat
        );
        chairSeat.position.set(boothX, 0.55, boothZ);
        this.group.add(chairSeat);
        const chairBack = new THREE.Mesh(
            new THREE.BoxGeometry(1.3, 1.1, 0.25), chairMat
        );
        chairBack.position.set(boothX, 1.15, boothZ - 0.4);
        this.group.add(chairBack);
        // Arms
        for (const sx of [-0.65, 0.65]) {
            const arm = new THREE.Mesh(
                new THREE.BoxGeometry(0.25, 0.5, 0.9), chairMat
            );
            arm.position.set(boothX + sx, 0.85, boothZ - 0.1);
            this.group.add(arm);
        }

        // Side table
        const tbl = new THREE.Mesh(
            new THREE.BoxGeometry(0.9, 0.8, 0.6), this.mat.wood
        );
        tbl.position.set(boothX + 1.6, 0.4, boothZ);
        this.group.add(tbl);
        // Reel-to-reel tape machine on the table
        const reelBody = new THREE.Mesh(
            new THREE.BoxGeometry(0.7, 0.2, 0.45),
            new THREE.MeshStandardMaterial({
                color: 0x8A8A8A, roughness: 0.4, metalness: 0.5
            })
        );
        reelBody.position.set(boothX + 1.6, 0.9, boothZ);
        this.group.add(reelBody);
        for (const sx of [-0.18, 0.18]) {
            const reel = new THREE.Mesh(
                new THREE.CylinderGeometry(0.09, 0.09, 0.04, 16),
                new THREE.MeshStandardMaterial({ color: 0x1A1A1A, roughness: 0.6 })
            );
            reel.rotation.x = Math.PI / 2;
            reel.position.set(boothX + 1.6 + sx, 1.02, boothZ);
            this.group.add(reel);
        }

        // Headphones hanging from a hook (just a curved torus + band suggestion)
        const hpMat = new THREE.MeshStandardMaterial({
            color: 0x1A1A1A, roughness: 0.7
        });
        for (const sx of [-0.15, 0.15]) {
            const cup = new THREE.Mesh(
                new THREE.CylinderGeometry(0.09, 0.09, 0.06, 14), hpMat
            );
            cup.rotation.z = Math.PI / 2;
            cup.position.set(boothX + 1.6 + sx, 1.3, boothZ - 0.05);
            this.group.add(cup);
        }
        const band = new THREE.Mesh(
            new THREE.TorusGeometry(0.14, 0.018, 6, 12, Math.PI), hpMat
        );
        band.position.set(boothX + 1.6, 1.45, boothZ - 0.05);
        this.group.add(band);

        // Sign overhead
        const sign = new THREE.Mesh(
            new THREE.PlaneGeometry(3, 0.55),
            new THREE.MeshBasicMaterial({
                map: this._makeDeadSignTex('DEAD CENTRAL · LISTENING'),
                transparent: true, side: THREE.DoubleSide
            })
        );
        sign.position.set(boothX, 2.8, boothZ - 2.4);
        this.group.add(sign);
    }

    _buildCeilingBanners() {
        // Two tie-dye banners crossing the room from the ceiling
        for (const [zOff, xOff] of [[2, -5], [-4, 5]]) {
            const banner = new THREE.Mesh(
                new THREE.PlaneGeometry(7, 2.5),
                new THREE.MeshBasicMaterial({
                    map: this._makeTieDyeTex(),
                    transparent: true, side: THREE.DoubleSide
                })
            );
            banner.position.set(xOff, this.H - 1.5, zOff);
            banner.rotation.y = Math.PI / 5;
            this.group.add(banner);
            // Suspension strings
            for (const sx of [-3.3, 3.3]) {
                const str = new THREE.Mesh(
                    new THREE.CylinderGeometry(0.01, 0.01, 0.5, 4),
                    this.mat.trim
                );
                str.position.set(xOff + sx * Math.cos(Math.PI/5), this.H - 0.25, zOff + sx * Math.sin(Math.PI/5));
                this.group.add(str);
            }
        }
    }

    _buildExitPortal_() {
        const exit = this._buildExitPortal({
            name: 'Exit to McHenry Library',
            signText: 'EXIT',
            tint: 0x6FAEDC,
            x: 3, y: 0, z: this.D / 2 - 0.25,
            rotY: Math.PI
        });
        this.group.add(exit);
    }

    // --- Bear builder (compact silhouette) ---
    _buildBear(color, scale = 1) {
        const bear = new THREE.Group();
        const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.78 });
        const s = scale;
        const head = new THREE.Mesh(
            new THREE.SphereGeometry(0.16 * s, 10, 7), mat
        );
        head.position.y = 0.62 * s;
        bear.add(head);
        for (const sx of [-0.1, 0.1]) {
            const ear = new THREE.Mesh(
                new THREE.SphereGeometry(0.05 * s, 6, 5), mat
            );
            ear.position.set(sx * s, 0.75 * s, 0);
            bear.add(ear);
        }
        const body = new THREE.Mesh(
            new THREE.SphereGeometry(0.22 * s, 10, 7), mat
        );
        body.position.y = 0.38 * s;
        body.scale.set(1, 1.25, 0.9);
        bear.add(body);
        const lLeg = new THREE.Mesh(
            new THREE.CylinderGeometry(0.06 * s, 0.06 * s, 0.25 * s, 7), mat
        );
        lLeg.position.set(-0.1 * s, 0.12 * s, 0);
        bear.add(lLeg);
        const rLeg = new THREE.Mesh(
            new THREE.CylinderGeometry(0.06 * s, 0.06 * s, 0.25 * s, 7), mat
        );
        rLeg.position.set(0.1 * s, 0.17 * s, 0);
        rLeg.rotation.z = -0.35;
        bear.add(rLeg);
        const lArm = new THREE.Mesh(
            new THREE.CylinderGeometry(0.04 * s, 0.04 * s, 0.2 * s, 6), mat
        );
        lArm.position.set(-0.22 * s, 0.48 * s, 0);
        lArm.rotation.z = 0.7;
        bear.add(lArm);
        const rArm = new THREE.Mesh(
            new THREE.CylinderGeometry(0.04 * s, 0.04 * s, 0.2 * s, 6), mat
        );
        rArm.position.set(0.22 * s, 0.48 * s, 0);
        rArm.rotation.z = -0.5;
        bear.add(rArm);
        return bear;
    }

    // ----- Canvas textures -----
    _makeDeadSignTex(text) {
        const canvas = document.createElement('canvas');
        canvas.width = 1024; canvas.height = 160;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#1A1A1A';
        ctx.fillRect(0, 0, 1024, 160);
        const grad = ctx.createLinearGradient(20, 142, 1004, 142);
        grad.addColorStop(0, '#E74C3C');
        grad.addColorStop(0.2, '#F39C12');
        grad.addColorStop(0.4, '#F1C40F');
        grad.addColorStop(0.6, '#2ECC71');
        grad.addColorStop(0.8, '#3498DB');
        grad.addColorStop(1, '#9B59B6');
        ctx.strokeStyle = grad;
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.moveTo(30, 140);
        ctx.lineTo(994, 140);
        ctx.stroke();
        ctx.fillStyle = '#F5F0DE';
        ctx.font = 'bold 62px "Georgia", serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, 512, 66);
        const tex = new THREE.CanvasTexture(canvas);
        tex.anisotropy = 4;
        return tex;
    }

    _makeStealYourFaceTex() {
        const canvas = document.createElement('canvas');
        canvas.width = 512; canvas.height = 512;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, 512, 512);
        // Skull
        ctx.beginPath();
        ctx.arc(256, 256, 230, 0, Math.PI * 2);
        ctx.fillStyle = '#F5F0DE';
        ctx.fill();
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 10;
        ctx.stroke();
        // Bolt
        ctx.save();
        ctx.translate(256, 256);
        ctx.rotate(-Math.PI / 6);
        ctx.fillStyle = '#C43D3D';
        ctx.fillRect(-210, -20, 420, 20);
        ctx.fillStyle = '#3498DB';
        ctx.fillRect(-210, 0, 420, 20);
        ctx.restore();
        // Eyes
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.arc(192, 216, 24, 0, Math.PI * 2);
        ctx.arc(320, 216, 24, 0, Math.PI * 2);
        ctx.fill();
        // Nose / mouth
        ctx.beginPath();
        ctx.moveTo(256, 300);
        ctx.lineTo(240, 340);
        ctx.lineTo(272, 340);
        ctx.closePath();
        ctx.fill();
        const tex = new THREE.CanvasTexture(canvas);
        tex.anisotropy = 4;
        return tex;
    }

    _makeTieDyeTex() {
        const canvas = document.createElement('canvas');
        canvas.width = 512; canvas.height = 256;
        const ctx = canvas.getContext('2d');
        const colors = ['#E74C3C', '#F39C12', '#F1C40F', '#2ECC71', '#3498DB', '#9B59B6'];
        for (let i = 70; i >= 0; i--) {
            ctx.fillStyle = colors[i % colors.length];
            const cx = 256 + Math.cos(i * 0.4) * i * 3;
            const cy = 128 + Math.sin(i * 0.4) * i * 1.4;
            const rad = 16 + i * 1.6;
            ctx.beginPath();
            ctx.arc(cx, cy, rad, 0, Math.PI * 2);
            ctx.fill();
        }
        const tex = new THREE.CanvasTexture(canvas);
        tex.anisotropy = 4;
        return tex;
    }

    _makePosterTex(venue, bgColor) {
        const canvas = document.createElement('canvas');
        canvas.width = 256; canvas.height = 384;
        const ctx = canvas.getContext('2d');
        const hex = '#' + bgColor.toString(16).padStart(6, '0');
        ctx.fillStyle = hex;
        ctx.fillRect(0, 0, 256, 384);
        // Target rings
        ctx.strokeStyle = 'rgba(255,255,255,0.3)';
        ctx.lineWidth = 6;
        for (let i = 0; i < 6; i++) {
            ctx.beginPath();
            ctx.arc(128, 200, 30 + i * 18, 0, Math.PI * 2);
            ctx.stroke();
        }
        // Central skull shape
        ctx.fillStyle = '#F5F0DE';
        ctx.beginPath();
        ctx.arc(128, 200, 22, 0, Math.PI * 2);
        ctx.fill();
        // Text
        ctx.fillStyle = '#F5F0DE';
        ctx.font = 'bold 32px "Georgia", serif';
        ctx.textAlign = 'center';
        ctx.fillText('GRATEFUL', 128, 46);
        ctx.fillText('DEAD', 128, 84);
        ctx.font = 'bold 18px "Georgia", serif';
        ctx.fillText(venue, 128, 340);
        ctx.font = '12px "Georgia", serif';
        ctx.fillText('— live —', 128, 362);
        const tex = new THREE.CanvasTexture(canvas);
        tex.anisotropy = 4;
        return tex;
    }

    _makePlaqueTex(text) {
        const canvas = document.createElement('canvas');
        canvas.width = 512; canvas.height = 96;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#17100A';
        ctx.fillRect(0, 0, 512, 96);
        ctx.strokeStyle = 'rgba(245,230,200,0.35)';
        ctx.lineWidth = 2;
        ctx.strokeRect(4, 4, 504, 88);
        ctx.fillStyle = '#F5EBD0';
        let fs = 24;
        ctx.font = `${fs}px "Georgia", serif`;
        while (ctx.measureText(text).width > 470 && fs > 12) {
            fs -= 2;
            ctx.font = `${fs}px "Georgia", serif`;
        }
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, 256, 48);
        const tex = new THREE.CanvasTexture(canvas);
        tex.anisotropy = 4;
        return tex;
    }

    _makeWelcomeTex() {
        const canvas = document.createElement('canvas');
        canvas.width = 512; canvas.height = 192;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#1A1A1A';
        ctx.fillRect(0, 0, 512, 192);
        ctx.fillStyle = '#F5EBD0';
        ctx.font = 'bold 28px "Georgia", serif';
        ctx.textAlign = 'center';
        ctx.fillText('Welcome to the Archive', 256, 42);
        ctx.font = '16px "Georgia", serif';
        ctx.fillText('600+ linear feet of materials', 256, 76);
        ctx.fillText('Tapes · Posters · Setlists · Stage gear', 256, 104);
        ctx.fillText('Letters · Business records · Photos', 256, 130);
        ctx.font = 'italic 14px "Georgia", serif';
        ctx.fillStyle = '#FFE0A0';
        ctx.fillText('Donated by the band, 2008', 256, 162);
        const tex = new THREE.CanvasTexture(canvas);
        tex.anisotropy = 4;
        return tex;
    }
}
