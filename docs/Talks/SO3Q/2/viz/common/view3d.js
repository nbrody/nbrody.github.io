/**
 * view3d.js — a tiny orbit camera and depth-sorted draw list for canvas 2D.
 *
 * World axes: x = i, y = j, z = k, with z (k) up on screen.  The camera sits
 * at azimuth `yaw` (about z) and elevation `pitch`, looking at the origin;
 * `focal` (world units) sets the strength of the perspective.
 */
(function (root) {
    'use strict';

    class Camera {
        constructor({ yaw = 0.7, pitch = 0.35, focal = 14 } = {}) {
            this.yaw = yaw; this.pitch = pitch; this.focal = focal;
            this.k = 100; this.ox = 0; this.oy = 0;
            this.setup(0, 0, 100);
        }
        /** Per frame: screen centre (ox, oy) and pixels per world unit k. */
        setup(ox, oy, k) {
            this.ox = ox; this.oy = oy; this.k = k;
            const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw), cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
            this.b = [cp * cy, cp * sy, sp];             // toward the camera
            this.r = [-sy, cy, 0];                       // screen right
            this.u = [-sp * cy, -sp * sy, cp];           // screen up
        }
        /** → [X, Y, depth (toward camera), perspective scale]. */
        proj([x, y, z]) {
            const r = this.r, u = this.u, b = this.b;
            const xs = x * r[0] + y * r[1] + z * r[2];
            const ys = x * u[0] + y * u[1] + z * u[2];
            const d = x * b[0] + y * b[1] + z * b[2];
            const s = this.focal / Math.max(0.2, this.focal - d);
            return [this.ox + this.k * s * xs, this.oy - this.k * s * ys, d, s];
        }
        /** Is the direction n (a unit normal) facing the camera? */
        facing(n) { return n[0] * this.b[0] + n[1] * this.b[1] + n[2] * this.b[2] > 0; }
        depthOf(p) { return p[0] * this.b[0] + p[1] * this.b[1] + p[2] * this.b[2]; }
    }

    /** Collect drawing closures with a depth; run them back to front. */
    class DrawList {
        constructor() { this.items = []; }
        add(depth, fn) { this.items.push({ depth, fn }); }
        run() {
            this.items.sort((a, b) => a.depth - b.depth);
            for (const it of this.items) it.fn();
            this.items.length = 0;
        }
    }

    // small vector helpers
    const V = {
        add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
        sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
        scale: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
        dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
        cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
        len: (a) => Math.hypot(a[0], a[1], a[2]),
        norm: (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
        lerp: (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t],
    };

    // unit-quaternion helpers for orientations (float): [w, x, y, z]
    const UQ = {
        mul: (p, q) => [
            p[0] * q[0] - p[1] * q[1] - p[2] * q[2] - p[3] * q[3],
            p[0] * q[1] + p[1] * q[0] + p[2] * q[3] - p[3] * q[2],
            p[0] * q[2] - p[1] * q[3] + p[2] * q[0] + p[3] * q[1],
            p[0] * q[3] + p[1] * q[2] - p[2] * q[1] + p[3] * q[0],
        ],
        normalize: (q) => { const l = Math.hypot(...q) || 1; return q.map((v) => v / l); },
        fromAxisAngle: (ax, t) => { const s = Math.sin(t / 2); return [Math.cos(t / 2), ax[0] * s, ax[1] * s, ax[2] * s]; },
        slerp(a, b, t) {
            let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
            if (d < 0) { b = b.map((v) => -v); d = -d; }          // shortest way
            if (d > 0.9995) return UQ.normalize(a.map((v, i) => v + (b[i] - v) * t));
            const th = Math.acos(d), s = Math.sin(th);
            const wa = Math.sin((1 - t) * th) / s, wb = Math.sin(t * th) / s;
            return a.map((v, i) => wa * v + wb * b[i]);
        },
        /** The rotation matrix of a unit quaternion. */
        matrix([w, x, y, z]) {
            return [
                [1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y)],
                [2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x)],
                [2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y)],
            ];
        },
        apply: (M, v) => [
            M[0][0] * v[0] + M[0][1] * v[1] + M[0][2] * v[2],
            M[1][0] * v[0] + M[1][1] * v[1] + M[1][2] * v[2],
            M[2][0] * v[0] + M[2][1] * v[1] + M[2][2] * v[2],
        ],
    };

    /** Math-style label: italic base with a small subscript/superscript, centred at (X, Y). */
    function mathLabel(ctx, parts, X, Y, color, size = 20, align = 'center') {
        // parts: [{t, style: 'it'|'rm'|'sub'|'sup'}]
        const fontFor = (st) => st === 'sub' || st === 'sup'
            ? `${Math.round(size * 0.64)}px "Times New Roman", Times, serif`
            : `${st === 'it' ? 'italic ' : ''}${size}px "Times New Roman", Times, serif`;
        let w = 0;
        for (const p of parts) { ctx.font = fontFor(p.style); w += ctx.measureText(p.t).width + (p.style === 'sub' || p.style === 'sup' ? 1 : 0); }
        let x = align === 'center' ? X - w / 2 : align === 'right' ? X - w : X;
        ctx.fillStyle = color;
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        for (const p of parts) {
            ctx.font = fontFor(p.style);
            const dy = p.style === 'sub' ? size * 0.3 : p.style === 'sup' ? -size * 0.36 : 0;
            ctx.fillText(p.t, x + (p.style === 'sub' || p.style === 'sup' ? 1 : 0), Y + dy);
            x += ctx.measureText(p.t).width + (p.style === 'sub' || p.style === 'sup' ? 1 : 0);
        }
    }

    /** A quaternion label like "1+2i−j" in the talk's math font (units italic). */
    function quatLabel(ctx, q, X, Y, color, size = 16, align = 'center', halo = true) {
        const s = root.Quat ? root.Quat.str(q) : String(q);
        const parts = [];
        for (const ch of s) {
            const it = ch === 'i' || ch === 'j' || ch === 'k';
            const last = parts[parts.length - 1];
            if (last && last.style === (it ? 'it' : 'rm')) last.t += ch;
            else parts.push({ t: ch, style: it ? 'it' : 'rm' });
        }
        if (halo) {
            ctx.save();
            ctx.lineWidth = 4; ctx.lineJoin = 'round';
            ctx.strokeStyle = 'rgba(6,10,20,0.85)';
            // draw the halo by stroking each part
            const fontFor = (st) => `${st === 'it' ? 'italic ' : ''}${size}px "Times New Roman", Times, serif`;
            let w = 0;
            for (const p of parts) { ctx.font = fontFor(p.style); w += ctx.measureText(p.t).width; }
            let x = align === 'center' ? X - w / 2 : align === 'right' ? X - w : X;
            ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
            for (const p of parts) { ctx.font = fontFor(p.style); ctx.strokeText(p.t, x, Y); x += ctx.measureText(p.t).width; }
            ctx.restore();
        }
        mathLabel(ctx, parts, X, Y, color, size, align);
    }

    root.View3D = { Camera, DrawList, V, UQ, mathLabel, quatLabel };
})(window);
