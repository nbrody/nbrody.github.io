// render.js — canvas renderer for the interbred tiling.
//
// Math coordinates: Σ is the real axis, piece 1 tiles the upper half-disk,
// piece 2 the lower.  For display everything is rotated −90° so that Σ is
// vertical: piece 1 on the right, piece 2 on the left.  A "separation" offset
// pulls the two pieces apart along the horizontal axis to expose the cut.

import { sampleEdge, reflect } from './geometry.js';

const ROT = ([x, y]) => [y, -x];          // −90° rotation: upper half → right half

export class Renderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.scale = 1;                    // set on first resize
        this.pan = [0, 0];                 // screen px
        this.separation = 0;               // world units between the pieces
        this.opacity = 0.75;
        this.showWalls = true;
        this.showSigma = true;
        this.pieces = [null, null];        // { tiles, chamber, label }
        this.palette = [
            { hue: 268, sat: 72 },         // piece 1: violet
            { hue: 199, sat: 80 },         // piece 2: sky
        ];
        this.sigmaColor = '#f0abfc';
        this.time = 0;
        this._resize();
    }

    _resize() {
        const dpr = Math.min(devicePixelRatio || 1, 2);
        this.canvas.width = innerWidth * dpr;
        this.canvas.height = innerHeight * dpr;
        this.dpr = dpr;
        // the window can report 0×0 during embed startup — keep trying until real
        if (!this._sized && Math.min(innerWidth, innerHeight) > 0) {
            this.scale = 0.42 * Math.min(innerWidth, innerHeight);
            this._sized = true;
        }
    }

    resetView() {
        this.pan = [0, 0];
        this.scale = 0.42 * Math.max(200, Math.min(innerWidth, innerHeight));
    }

    setPiece(i, tiles, chamber, label) {
        this.pieces[i] = tiles ? { tiles, chamber, label, paths: null } : null;
        if (this.pieces[i]) this._buildPaths(this.pieces[i], i);
    }

    // Pre-build Path2D objects grouped by depth (world display coordinates).
    _buildPaths(piece, idx) {
        const groups = new Map();
        for (const tile of piece.tiles) {
            let g = groups.get(tile.depth);
            if (!g) { g = new Path2D(); groups.set(tile.depth, g); }
            this._tilePath(g, tile);
        }
        piece.paths = [...groups.entries()].sort((a, b) => a[0] - b[0]);
        // chamber outline (depth-0 tile) gets its own path
        piece.chamberPath = new Path2D();
        this._tilePath(piece.chamberPath, piece.tiles[0]);
    }

    _tilePath(path, tile) {
        const n = tile.verts.length;
        let first = true;
        for (let i = 0; i < n; i++) {
            const from = tile.verts[(i + n - 1) % n];
            const to = tile.verts[i];
            const pts = sampleEdge(tile.walls[i], from, to);
            for (let j = first ? 0 : 1; j < pts.length; j++) {
                const [x, y] = ROT(pts[j]);
                if (first) { path.moveTo(x, y); first = false; }
                else path.lineTo(x, y);
            }
        }
        path.closePath();
    }

    // world(display) → canvas px transform for piece i (±separation/2 shift)
    _applyTransform(shiftX) {
        const { ctx, dpr } = this;
        const cx = this.canvas.width / 2 + this.pan[0] * dpr;
        const cy = this.canvas.height / 2 + this.pan[1] * dpr;
        const s = this.scale * dpr;
        ctx.setTransform(s, 0, 0, s, cx + shiftX * s, cy);
    }

    screenToWorld(px, py) {
        const cx = innerWidth / 2 + this.pan[0], cy = innerHeight / 2 + this.pan[1];
        return [(px - cx) / this.scale, (py - cy) / this.scale];
    }

    draw() {
        if (!this._sized) this._resize();
        const { ctx, canvas, dpr } = this;
        this.time += 1 / 60;
        ctx.setTransform(1, 0, 0, 1, 0, 0);

        // background
        const g = ctx.createRadialGradient(
            canvas.width / 2, canvas.height / 2, 0,
            canvas.width / 2, canvas.height / 2, Math.max(canvas.width, canvas.height) * 0.7);
        g.addColorStop(0, '#0b0b1c');
        g.addColorStop(1, '#040409');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const sep = this.separation / 2;
        for (let i = 0; i < 2; i++) {
            const piece = this.pieces[i];
            if (!piece) continue;
            const shift = (i === 0 ? 1 : -1) * sep;
            this._applyTransform(shift);
            this._drawDiskBackdrop(i, sep > 0);
            this._drawPiece(piece, i);
            if (this.showSigma) this._drawSigma(i);
        }
        ctx.setTransform(1, 0, 0, 1, 0, 0);
    }

    _drawDiskBackdrop(i, separated) {
        const { ctx } = this;
        // boundary circle: full circle when glued, half-circle per piece when separated
        ctx.beginPath();
        const a0 = -Math.PI / 2, a1 = Math.PI / 2;
        if (i === 0) ctx.arc(0, 0, 1, a0, a1);            // right half
        else ctx.arc(0, 0, 1, a1, a0 + 2 * Math.PI);      // left half
        ctx.lineWidth = 1.2 / this.scale;
        ctx.strokeStyle = 'rgba(120,120,180,0.35)';
        ctx.stroke();
    }

    _drawPiece(piece, idx) {
        const { ctx } = this;
        const pal = this.palette[idx];
        const maxDepth = Math.max(1, ...piece.paths.map(([d]) => d));
        for (const [depth, path] of piece.paths) {
            const t = depth / maxDepth;
            const light = 62 - 34 * t;
            const alpha = this.opacity * (0.85 - 0.45 * t);
            ctx.fillStyle = `hsla(${pal.hue}, ${pal.sat}%, ${light}%, ${alpha})`;
            ctx.fill(path);
            ctx.strokeStyle = `hsla(${pal.hue}, ${pal.sat + 8}%, ${Math.min(80, light + 22)}%, ${0.55 - 0.35 * t})`;
            ctx.lineWidth = 0.8 / this.scale;
            ctx.stroke(path);
        }
        if (this.showWalls && piece.chamberPath) {
            ctx.strokeStyle = `hsla(${pal.hue}, 90%, 82%, 0.95)`;
            ctx.lineWidth = 2.2 / this.scale;
            ctx.stroke(piece.chamberPath);
        }
        // ideal vertices of the chamber
        if (piece.chamber.vertData) {
            ctx.fillStyle = `hsla(${pal.hue}, 95%, 85%, 0.9)`;
            piece.chamber.vertData.forEach((v, k) => {
                if (!v.ideal) return;
                let p = piece.chamber.verts[k];
                if (idx === 1) p = [p[0], -p[1]];
                const [x, y] = ROT(p);
                ctx.beginPath();
                ctx.arc(x, y, 3.5 / this.scale, 0, 2 * Math.PI);
                ctx.fill();
            });
        }
    }

    _drawSigma(i) {
        const { ctx } = this;
        const pulse = 0.55 + 0.25 * Math.sin(this.time * 2.2);
        ctx.beginPath();
        ctx.moveTo(0, -1);
        ctx.lineTo(0, 1);
        ctx.strokeStyle = this.sigmaColor;
        ctx.globalAlpha = pulse;
        ctx.lineWidth = 2.6 / this.scale;
        ctx.shadowColor = this.sigmaColor;
        ctx.shadowBlur = 14;
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
    }
}
