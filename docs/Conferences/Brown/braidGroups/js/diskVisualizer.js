/**
 * Disk Visualizer — Mapping Class of the n-Punctured Disk
 *
 * Canvas2D rendering of a disk with n punctures and arcs between
 * adjacent punctures.  Integrates with DiskAnimator for smooth
 * half-twist animations as braid generators are applied.
 */

import { DiskAnimator, getPuncturePositions, getDiskRadius, TWIST_R_OUTER } from './diskAnimation.js';
import { getStrandCount } from './burau.js';

// ============================================================
//  Visual constants
// ============================================================

/** Extended palette for puncture colors (wraps). */
const PUNCTURE_PALETTE = [
    '#00e5ff', '#b388ff', '#69f0ae', '#ffab40',
    '#ff6b6b', '#feca57', '#54a0ff', '#ff9ff3',
    '#1dd1a1', '#f368e0', '#ee5a24', '#0abde3'
];

/** Extended palette for arc colors (wraps). */
const ARC_PALETTE = [
    '#ff6b6b', '#feca57', '#54a0ff', '#ff9ff3',
    '#1dd1a1', '#f368e0', '#ee5a24', '#0abde3',
    '#00e5ff', '#b388ff', '#69f0ae'
];

const ARC_WIDTH = 2.8;
const PUNCTURE_RADIUS = 5;
const PUNCTURE_GLOW = 9;

// ============================================================
//  DiskVisualizer
// ============================================================

export class DiskVisualizer {
    constructor(container) {
        this.container = container;
        this.currentArcs = null;
        this.twistInfo = null;
        this.numStrands = getStrandCount();
        this.punctures = getPuncturePositions(this.numStrands);

        this._initCanvas();
        this.animator = new DiskAnimator(this);
        this._animate();
    }

    // --- Canvas setup ---

    _initCanvas() {
        this.canvas = document.createElement('canvas');
        this.canvas.style.display = 'block';
        this.canvas.style.width = '100%';
        this.canvas.style.height = '100%';
        this.container.appendChild(this.canvas);
        this.ctx = this.canvas.getContext('2d');

        this._resize();
        this._resizeObserver = new ResizeObserver(() => {
            this._resize();
            this._needsRedraw = true;
        });
        this._resizeObserver.observe(this.container);
        this._needsRedraw = true;
    }

    _resize() {
        const rect = this.container.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        this.canvas.width = rect.width * dpr;
        this.canvas.height = rect.height * dpr;
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        this.w = rect.width;
        this.h = rect.height;
        const diskR = getDiskRadius(this.numStrands);
        this.scale = Math.min(this.w, this.h) / (diskR * 2 + 1.2);
        this.cx = this.w / 2;
        this.cy = this.h / 2;
    }

    _toCanvas(wx, wy) {
        return [this.cx + wx * this.scale, this.cy - wy * this.scale];
    }

    // --- Public API ---

    setCrossings(symbols, transitionType = 'add') {
        this.animator.transitionTo(symbols, transitionType);
    }

    clear() {
        this.animator.reset();
    }

    /** Rebuild state when strand count changes. */
    setStrandCount(n) {
        this.numStrands = n;
        this.punctures = getPuncturePositions(n);
        this._resize();
        this.animator.setStrandCount(n);
    }

    dispose() {
        if (this._animId) cancelAnimationFrame(this._animId);
        if (this._resizeObserver) this._resizeObserver.disconnect();
    }

    /** Called by DiskAnimator to push new visual state. */
    setArcs(arcs, punctures, twistInfo) {
        this.currentArcs = arcs;
        this.currentPunctures = punctures;
        this.twistInfo = twistInfo;
        this._needsRedraw = true;
    }

    // --- Render loop ---

    _animate() {
        this._animId = requestAnimationFrame(() => this._animate());
        this.animator.update();
        if (this._needsRedraw) {
            this._render();
            this._needsRedraw = false;
        }
    }

    _render() {
        const ctx = this.ctx;
        if (!this.currentArcs) return;
        ctx.clearRect(0, 0, this.w, this.h);

        this._drawDisk();
        this._drawTwistDisk();
        this._drawArcs();
        this._drawPunctures();
    }

    // --- Drawing methods ---

    _drawDisk() {
        const ctx = this.ctx;
        const [cx, cy] = this._toCanvas(0, 0);
        const r = getDiskRadius(this.numStrands) * this.scale;

        // Subtle fill
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        grad.addColorStop(0, 'rgba(255,255,255,0.02)');
        grad.addColorStop(0.85, 'rgba(255,255,255,0.01)');
        grad.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.fill();

        // Border
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,255,255,0.12)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
    }

    _drawTwistDisk() {
        const info = this.twistInfo;
        if (!info) return;
        const ctx = this.ctx;
        const [cx, cy] = this._toCanvas(info.center.x, info.center.y);
        const r = TWIST_R_OUTER * this.scale;
        const alpha = 0.45 * Math.sin(info.progress * Math.PI);

        // Dashed twist circle
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255,171,64,${alpha})`;
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.stroke();
        ctx.setLineDash([]);

        // Rotation arrow
        const arrowAngle = info.angle;
        const arrowR = r * 0.75;
        const startA = -Math.PI / 3;
        const endA = startA + Math.sign(arrowAngle) * Math.PI * 0.7;

        ctx.beginPath();
        ctx.arc(cx, cy, arrowR, startA, endA, arrowAngle < 0);
        ctx.strokeStyle = `rgba(255,171,64,${alpha * 1.5})`;
        ctx.lineWidth = 1.8;
        ctx.stroke();

        // Arrowhead
        const tipX = cx + Math.cos(endA) * arrowR;
        const tipY = cy + Math.sin(endA) * arrowR;
        const headAngle = endA + (arrowAngle > 0 ? Math.PI / 2 : -Math.PI / 2);
        const hs = 7;
        ctx.beginPath();
        ctx.moveTo(tipX, tipY);
        ctx.lineTo(tipX + Math.cos(headAngle - 0.5) * hs, tipY + Math.sin(headAngle - 0.5) * hs);
        ctx.lineTo(tipX + Math.cos(headAngle + 0.5) * hs, tipY + Math.sin(headAngle + 0.5) * hs);
        ctx.closePath();
        ctx.fillStyle = `rgba(255,171,64,${alpha * 1.8})`;
        ctx.fill();

        ctx.restore();
    }

    _drawArcs() {
        const ctx = this.ctx;
        const arcs = this.currentArcs;

        for (let a = 0; a < arcs.length; a++) {
            const arc = arcs[a];
            const color = ARC_PALETTE[a % ARC_PALETTE.length];

            // Glow pass
            ctx.beginPath();
            for (let i = 0; i < arc.length; i++) {
                const [px, py] = this._toCanvas(arc[i].x, arc[i].y);
                i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
            }
            ctx.strokeStyle = color.replace(')', ',0.2)').replace('rgb', 'rgba');
            ctx.lineWidth = ARC_WIDTH + 4;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.stroke();

            // Main stroke
            ctx.beginPath();
            for (let i = 0; i < arc.length; i++) {
                const [px, py] = this._toCanvas(arc[i].x, arc[i].y);
                i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
            }
            ctx.strokeStyle = color;
            ctx.lineWidth = ARC_WIDTH;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.stroke();
        }
    }

    _drawPunctures() {
        const ctx = this.ctx;
        const puncts = this.currentPunctures || this.punctures;

        for (let i = 0; i < puncts.length; i++) {
            const [px, py] = this._toCanvas(puncts[i].x, puncts[i].y);
            const color = PUNCTURE_PALETTE[i % PUNCTURE_PALETTE.length];

            // Glow
            const r = parseInt(color.slice(1, 3), 16);
            const g = parseInt(color.slice(3, 5), 16);
            const b = parseInt(color.slice(5, 7), 16);
            ctx.beginPath();
            ctx.arc(px, py, PUNCTURE_GLOW, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(${r},${g},${b},0.25)`;
            ctx.fill();

            // Solid dot
            ctx.beginPath();
            ctx.arc(px, py, PUNCTURE_RADIUS, 0, Math.PI * 2);
            ctx.fillStyle = color;
            ctx.fill();

            // Label
            ctx.font = '600 10px "JetBrains Mono", monospace';
            ctx.fillStyle = 'rgba(255,255,255,0.5)';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.fillText(`${i + 1}`, px, py + PUNCTURE_GLOW + 3);
        }
    }
}
