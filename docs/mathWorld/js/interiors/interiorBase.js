/**
 * Base class for interior scenes.
 *
 * An interior is a self-contained walkable space that takes over the
 * scene when the player presses E on an interior-entrance marker.
 * While inside:
 *   - The exterior `locationGroup` is hidden (+ regional terrain mesh)
 *   - The player's terrain function comes from this class
 *   - The player's `getInteractables()` comes from this class
 *   - An "exit" marker inside returns the player to where they were
 *
 * Conventions:
 *   - Origin (0, 0, 0) is the interior floor centre; Y = 0 is the floor.
 *   - `+Z` is still "south" / "forward out of the entrance".
 *   - The exit marker (`userData.exitInterior = true`) should be near
 *     the entrance spawn so there's no way to get lost inside.
 *   - Set `userData.noCollision = true` on decorative meshes so the
 *     player can walk through them without jittering.
 */

import * as THREE from 'three';

export class InteriorBase {
    constructor(group) {
        this.group = group;
        // Default spawn: origin, facing -Z (into the room)
        this.spawnX = 0;
        this.spawnY = 1.7;
        this.spawnZ = 0;
        this.spawnYaw = 0;
        this.name = 'Interior';
    }

    async generate() {
        // Subclasses must implement. Build geometry into this.group.
    }

    // Flat floor by default. Subclasses can override for steps / mezzanines.
    getTerrainHeight(x, z) { return 0; }

    getSpawnPoint() {
        return { x: this.spawnX, y: this.spawnY, z: this.spawnZ, yaw: this.spawnYaw };
    }

    getInteractables() {
        const out = [];
        this.group.traverse(obj => {
            if (obj.userData && obj.userData.isInteractable) out.push(obj);
        });
        return out;
    }

    // Optional per-frame update (animated displays, etc.)
    update(delta, time) {}

    // Called on exitInterior so the subclass can clean up anything
    // (audio, custom lights, etc.). Geometry is auto-disposed by main.js.
    dispose() {}

    // -----------------------------------------------------------
    //  Common building blocks — wall, floor, door frame, exit portal
    // -----------------------------------------------------------
    _buildFloor(W, D, mat) {
        const f = new THREE.Mesh(new THREE.BoxGeometry(W, 0.12, D), mat);
        f.position.y = -0.06;
        f.receiveShadow = true;
        return f;
    }

    _buildCeiling(W, D, H, mat) {
        const c = new THREE.Mesh(new THREE.BoxGeometry(W, 0.15, D), mat);
        c.position.y = H + 0.075;
        return c;
    }

    // A full solid wall along an axis.
    //   side = 'N' / 'S' / 'E' / 'W'
    _buildWall(side, W, D, H, mat, thickness = 0.2) {
        let geom, pos;
        switch (side) {
            case 'N':
                geom = new THREE.BoxGeometry(W, H, thickness);
                pos = [0, H / 2, -D / 2];
                break;
            case 'S':
                geom = new THREE.BoxGeometry(W, H, thickness);
                pos = [0, H / 2, +D / 2];
                break;
            case 'E':
                geom = new THREE.BoxGeometry(thickness, H, D);
                pos = [+W / 2, H / 2, 0];
                break;
            case 'W':
                geom = new THREE.BoxGeometry(thickness, H, D);
                pos = [-W / 2, H / 2, 0];
                break;
        }
        const w = new THREE.Mesh(geom, mat);
        w.position.set(...pos);
        w.receiveShadow = true;
        return w;
    }

    // A wall with a rectangular door cut out of it (via 4 sub-slabs).
    // Returns a Group.
    _buildWallWithDoorway(side, W, D, H, mat, doorW, doorH, doorOffset = 0) {
        const g = new THREE.Group();
        const T = 0.2;
        // Axis setup
        const axis = (side === 'N' || side === 'S') ? 'x' : 'z';
        const fullLen = axis === 'x' ? W : D;
        const wallZ = axis === 'x' ? (side === 'N' ? -D/2 : D/2) : 0;
        const wallX = axis === 'z' ? (side === 'W' ? -W/2 : W/2) : 0;
        const normal = (side === 'N' || side === 'W') ? -1 : 1;

        // Left segment (before door)
        const leftLen = fullLen / 2 - doorW / 2 + doorOffset;
        const rightLen = fullLen / 2 - doorW / 2 - doorOffset;
        if (leftLen > 0.05) {
            const l = new THREE.Mesh(
                axis === 'x'
                    ? new THREE.BoxGeometry(leftLen, H, T)
                    : new THREE.BoxGeometry(T, H, leftLen),
                mat
            );
            if (axis === 'x') l.position.set(-fullLen/2 + leftLen/2, H/2, wallZ);
            else              l.position.set(wallX, H/2, -fullLen/2 + leftLen/2);
            g.add(l);
        }
        if (rightLen > 0.05) {
            const r = new THREE.Mesh(
                axis === 'x'
                    ? new THREE.BoxGeometry(rightLen, H, T)
                    : new THREE.BoxGeometry(T, H, rightLen),
                mat
            );
            if (axis === 'x') r.position.set(fullLen/2 - rightLen/2, H/2, wallZ);
            else              r.position.set(wallX, H/2, fullLen/2 - rightLen/2);
            g.add(r);
        }
        // Header above door
        const headerH = H - doorH;
        if (headerH > 0.05) {
            const h = new THREE.Mesh(
                axis === 'x'
                    ? new THREE.BoxGeometry(doorW, headerH, T)
                    : new THREE.BoxGeometry(T, headerH, doorW),
                mat
            );
            if (axis === 'x') h.position.set(doorOffset, doorH + headerH/2, wallZ);
            else              h.position.set(wallX, doorH + headerH/2, doorOffset);
            g.add(h);
        }
        return g;
    }

    // The universal "press E to leave" marker. Place it in front of where
    // the player spawns so they can always find it.
    _buildExitPortal(opts = {}) {
        const g = new THREE.Group();
        g.userData = {
            name: opts.name || 'Exit',
            isInteractable: true,
            type: 'exit',
            interactionType: 'Exit',
            exitInterior: true
        };

        const tint = opts.tint ?? 0x6FAEDC;
        const frameMat = new THREE.MeshStandardMaterial({
            color: tint, emissive: tint, emissiveIntensity: 0.35,
            roughness: 0.45, metalness: 0.3
        });
        const doorMat = new THREE.MeshStandardMaterial({
            color: 0x1A1A1A, roughness: 0.85
        });
        const glowMat = new THREE.MeshBasicMaterial({
            color: tint, transparent: true, opacity: 0.42
        });

        const W = 2.2, H = 3.2, D = 0.22;
        // Glow halo behind the door (shows player where to go)
        const glow = new THREE.Mesh(new THREE.PlaneGeometry(W + 0.6, H + 0.6), glowMat);
        glow.position.set(0, H / 2, -0.12);
        glow.userData.noCollision = true;
        g.add(glow);
        // Frame
        const top = new THREE.Mesh(new THREE.BoxGeometry(W + 0.3, 0.2, D), frameMat);
        top.position.set(0, H + 0.1, 0);
        g.add(top);
        for (const sx of [-1, 1]) {
            const side = new THREE.Mesh(new THREE.BoxGeometry(0.2, H + 0.2, D), frameMat);
            side.position.set(sx * (W/2 + 0.15), H/2, 0);
            g.add(side);
        }
        // Door panel
        const door = new THREE.Mesh(new THREE.BoxGeometry(W, H, 0.08), doorMat);
        door.position.set(0, H/2, 0.07);
        g.add(door);
        // "Exit" sign above
        const sign = new THREE.Mesh(
            new THREE.PlaneGeometry(1.6, 0.5),
            new THREE.MeshBasicMaterial({
                map: this._makePortalSignTexture(opts.signText || 'EXIT', tint),
                transparent: true, side: THREE.DoubleSide
            })
        );
        sign.position.set(0, H + 0.65, 0.05);
        g.add(sign);

        g.position.set(opts.x || 0, opts.y || 0, opts.z || 0);
        g.rotation.y = opts.rotY || 0;
        return g;
    }

    _makePortalSignTexture(text, tint) {
        const canvas = document.createElement('canvas');
        canvas.width = 256; canvas.height = 80;
        const ctx = canvas.getContext('2d');
        const c = new THREE.Color(tint);
        c.multiplyScalar(0.22);
        ctx.fillStyle = `rgb(${Math.round(c.r*255)},${Math.round(c.g*255)},${Math.round(c.b*255)})`;
        ctx.fillRect(0, 0, 256, 80);
        ctx.strokeStyle = 'rgba(245,230,200,0.55)';
        ctx.lineWidth = 2.5;
        ctx.strokeRect(4, 4, 248, 72);
        ctx.fillStyle = '#F5EBD0';
        ctx.font = 'bold 38px "Georgia", serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, 128, 40);
        const tex = new THREE.CanvasTexture(canvas);
        tex.anisotropy = 4;
        return tex;
    }
}
