/**
 * Roadblocks — Canvas Board Renderer
 *
 * A self-contained, animated canvas renderer shared by the Play view and the
 * Solver view. It owns:
 *   • A continuous requestAnimationFrame draw loop (tiles animate even when idle)
 *   • Detailed tile art — 3D walls, glassy mirrors, swirling portals, a starfield
 *     abyss, glowing jump pads, and a stippled sand patch.
 *   • A glowing player orb with a face, squash/stretch, and a motion trail.
 *   • A particle system (sparks, dust, confetti, portal swirls).
 *   • Screen shake + a path tweener with a Promise-based API.
 *
 * The renderer is intentionally decoupled from game rules: callers feed it the
 * static grid + a path (array of segments from simulateSlide) and it plays the
 * animation back, resolving with the final segment status.
 */

(function (global) {
    'use strict';

    const TWO_PI = Math.PI * 2;

    // ── Palette ─────────────────────────────────────────────
    const COLORS = {
        voidA: '#05060d',
        voidB: '#0b0d1c',
        floorTop: '#20243a',
        floorBot: '#161a2c',
        floorEdge: 'rgba(150,170,255,0.10)',
        floorLedge: 'rgba(0,0,0,0.55)',
        wallTop: '#5b6478',
        wallBot: '#2f3543',
        wallLight: 'rgba(255,255,255,0.22)',
        wallDark: 'rgba(0,0,0,0.45)',
        mirrorNW: '#f5a60b',     // backslash \  (warm amber)
        mirrorNE: '#06b6d4',     // slash /       (cyan)
        jump: '#10b981',
        portal: '#8b5cf6',
        sand: '#c9a36b',
        goal: '#f5c518',
        player: '#7c83ff',
        playerB: '#a855f7',
        star: 'rgba(180,200,255,'
    };

    function lerp(a, b, t) { return a + (b - a) * t; }
    function easeOut(t) { return 1 - Math.pow(1 - t, 3); }
    function easeInOut(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
    function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

    function rrect(ctx, x, y, w, h, r) {
        r = Math.min(r, w / 2, h / 2);
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
    }

    class BoardRenderer {
        constructor(container, options = {}) {
            this.container = container;
            this.cell = options.cellSize || 46;
            this.gap = options.gap || 5;
            this.dpr = Math.min(global.devicePixelRatio || 1, 2);

            this.canvas = document.createElement('canvas');
            this.canvas.className = 'rb-canvas';
            this.ctx = this.canvas.getContext('2d');
            container.appendChild(this.canvas);

            this.grid = [[0]];
            this.rows = 1; this.cols = 1;
            this.goal = null;
            this.stars = [];

            // Player visual state (pixel coords = center of orb)
            this.player = { x: 0, y: 0, scale: 1, alpha: 1, dir: { dr: 0, dc: 1 }, sx: 1, sy: 1 };
            this.playerVisible = true;
            this.trail = [];

            this.particles = [];
            this.shakeMag = 0;
            this.goalPulse = 0;     // 0..1 burst on win
            this.ripples = [];

            // Tween machinery
            this.subQueue = [];
            this.activeSub = null;
            this.subStart = 0;
            this.tweenResolve = null;
            this.finalStatus = null;

            this._t = 0;
            this._last = 0;
            this._running = true;
            this._loop = this._loop.bind(this);
            global.requestAnimationFrame(this._loop);
        }

        // ── Geometry ────────────────────────────────────────
        get step() { return this.cell + this.gap; }
        tileXY(r, c) { return { x: this.gap + c * this.step, y: this.gap + r * this.step }; }
        cellCenter(r, c) {
            return {
                x: this.gap + c * this.step + this.cell / 2,
                y: this.gap + r * this.step + this.cell / 2
            };
        }

        setGrid(grid) {
            this.grid = grid.map(row => row.slice());
            this.rows = grid.length;
            this.cols = grid[0].length;
            this.goal = null;
            this.portals = [];
            for (let r = 0; r < this.rows; r++) {
                for (let c = 0; c < this.cols; c++) {
                    const v = this.grid[r][c];
                    if (v === 3) this.goal = { r, c };
                    if (v === 7) this.portals.push({ r, c });
                    if (v === 2) this.grid[r][c] = 0; // draw start cell as floor
                }
            }
            this._resize();
            this._seedStars();
            this.trail = [];
            this.particles = [];
        }

        _resize() {
            const w = this.cols * this.step + this.gap;
            const h = this.rows * this.step + this.gap;
            this.w = w; this.h = h;
            this.canvas.style.width = w + 'px';
            this.canvas.style.height = h + 'px';
            this.canvas.width = Math.round(w * this.dpr);
            this.canvas.height = Math.round(h * this.dpr);
        }

        _seedStars() {
            this.stars = [];
            const n = Math.round((this.w * this.h) / 1400);
            for (let i = 0; i < n; i++) {
                this.stars.push({
                    x: Math.random() * this.w,
                    y: Math.random() * this.h,
                    r: Math.random() * 1.3 + 0.2,
                    tw: Math.random() * TWO_PI,
                    sp: Math.random() * 2 + 0.5
                });
            }
        }

        setPlayerCell(r, c) {
            const p = this.cellCenter(r, c);
            this.player.x = p.x; this.player.y = p.y;
            this.player.scale = 1; this.player.alpha = 1;
            this.player.sx = 1; this.player.sy = 1;
            this.playerVisible = true;
            this.trail = [];
            this.subQueue = []; this.activeSub = null;
            // Level changes / resets interrupt an in-flight tweenPath. Resolve
            // the pending promise so engine.isProcessingQueue (and solver
            // isAnimating) cannot stick true forever.
            const pending = this.tweenResolve;
            this.tweenResolve = null;
            if (pending) pending('stop');
        }

        // ── Tween a full path; resolves with final status string ──
        tweenPath(path) {
            return new Promise(resolve => {
                this.subQueue = [];
                this.finalStatus = 'stop';
                for (const seg of path) {
                    const center = this.cellCenter(seg.target.r, seg.target.c);
                    const dist = Math.max(seg.distance || 1, 1);
                    this.finalStatus = seg.status;
                    switch (seg.status) {
                        case 'teleport':
                            this.subQueue.push({ kind: 'move', to: center, dur: Math.max(dist * 52, 70) });
                            this.subQueue.push({ kind: 'shrink', at: center, dur: 150 });
                            break;
                        case 'teleport_end':
                            this.subQueue.push({ kind: 'snap', to: center, dur: 0 });
                            this.subQueue.push({ kind: 'grow', at: center, dur: 170 });
                            break;
                        case 'jump':
                            this.subQueue.push({ kind: 'move', to: center, dur: 260, arc: true, dust: true });
                            break;
                        case 'reflect':
                            this.subQueue.push({ kind: 'move', to: center, dur: Math.max(dist * 52, 90), spark: true });
                            break;
                        case 'lost':
                            this.subQueue.push({ kind: 'move', to: center, dur: Math.max(dist * 50, 90) });
                            break;
                        case 'win':
                            this.subQueue.push({ kind: 'move', to: center, dur: Math.max(dist * 50, 70), win: true });
                            break;
                        default:
                            this.subQueue.push({ kind: 'move', to: center, dur: Math.max(dist * 52, 70), land: seg.status === 'stop' });
                    }
                }
                this.tweenResolve = resolve;
                this._nextSub();
            });
        }

        _nextSub() {
            if (this.subQueue.length === 0) {
                this.activeSub = null;
                const r = this.tweenResolve; this.tweenResolve = null;
                if (r) r(this.finalStatus);
                return;
            }
            this.activeSub = this.subQueue.shift();
            this.activeSub.from = { x: this.player.x, y: this.player.y };
            this.subStart = this._t;
            if (this.activeSub.kind === 'snap') {
                this.player.x = this.activeSub.to.x;
                this.player.y = this.activeSub.to.y;
                this.player.alpha = 0; this.player.scale = 0.1;
                this._spawnPortalBurst(this.activeSub.to, COLORS.portal);
                this._nextSub();
            }
        }

        _updateTween(dt) {
            const s = this.activeSub;
            if (!s) return;
            const elapsed = this._t - this.subStart;        // seconds
            const k = s.dur > 0 ? clamp(elapsed / (s.dur / 1000), 0, 1) : 1; // s.dur is ms

            if (s.kind === 'move') {
                const e = easeOut(k);
                this.player.x = lerp(s.from.x, s.to.x, e);
                this.player.y = lerp(s.from.y, s.to.y, e);
                if (s.arc) this.player.y -= Math.sin(k * Math.PI) * this.cell * 0.85;
                // squash by velocity direction
                const dx = s.to.x - s.from.x, dy = s.to.y - s.from.y;
                const horiz = Math.abs(dx) >= Math.abs(dy);
                const stretch = 1 + 0.18 * Math.sin(k * Math.PI);
                this.player.sx = horiz ? stretch : 1 / stretch;
                this.player.sy = horiz ? 1 / stretch : stretch;
                if (dx || dy) this.player.dir = { dr: Math.sign(dy), dc: Math.sign(dx) };
                // trail
                this.trail.push({ x: this.player.x, y: this.player.y, life: 0.32, max: 0.32 });
                if (this.trail.length > 26) this.trail.shift();
                if (k >= 1) {
                    this.player.sx = 1; this.player.sy = 1;
                    if (s.spark) this._spawnSpark(s.to);
                    if (s.dust) this._spawnDust(s.to);
                    if (s.land) this._spawnLandPuff(s.to);
                    this._nextSub();
                }
            } else if (s.kind === 'shrink') {
                this.player.scale = lerp(1, 0.05, easeInOut(k));
                this.player.alpha = lerp(1, 0, k);
                this.player.x = s.at.x; this.player.y = s.at.y;
                if (elapsed < 0.05) this._spawnPortalBurst(s.at, COLORS.portal);
                if (k >= 1) this._nextSub();
            } else if (s.kind === 'grow') {
                this.player.scale = lerp(0.1, 1, easeOut(k));
                this.player.alpha = lerp(0, 1, easeOut(k));
                if (k >= 1) { this.player.scale = 1; this.player.alpha = 1; this._nextSub(); }
            }
        }

        // ── Terminal effects (called by the game after tween) ──
        playDeath() {
            const { x, y } = this.player;
            this.shake(16);
            for (let i = 0; i < 30; i++) {
                const a = Math.random() * TWO_PI, sp = Math.random() * 160 + 40;
                this.particles.push({
                    x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 30,
                    life: 0.7, max: 0.7, size: Math.random() * 3 + 1.5,
                    color: i % 2 ? COLORS.player : COLORS.playerB, g: 220
                });
            }
            // orb spirals into the void
            this.subQueue = [];
            this.activeSub = { kind: 'death', from: { x, y }, spin: 0 };
            this.subStart = this._t;
            this._deathAnim = true;
        }

        playWin() {
            const c = this.goal ? this.cellCenter(this.goal.r, this.goal.c) : { x: this.player.x, y: this.player.y };
            this.goalPulse = 1;
            this.ripples.push({ x: c.x, y: c.y, life: 0.7, max: 0.7 });
            this.shake(7);
            const cols = [COLORS.goal, COLORS.player, COLORS.jump, COLORS.mirrorNE, COLORS.portal];
            for (let i = 0; i < 46; i++) {
                const a = Math.random() * TWO_PI, sp = Math.random() * 220 + 60;
                this.particles.push({
                    x: c.x, y: c.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60,
                    life: 1.1, max: 1.1, size: Math.random() * 3.5 + 2,
                    color: cols[i % cols.length], g: 260, spin: Math.random() * 10, rot: Math.random() * TWO_PI,
                    confetti: true
                });
            }
        }

        shake(mag) { this.shakeMag = Math.max(this.shakeMag, mag); }

        // ── Particle spawners ───────────────────────────────
        _spawnSpark(p) {
            for (let i = 0; i < 12; i++) {
                const a = Math.random() * TWO_PI, sp = Math.random() * 130 + 30;
                this.particles.push({
                    x: p.x, y: p.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
                    life: 0.4, max: 0.4, size: Math.random() * 2 + 1,
                    color: Math.random() < 0.5 ? COLORS.mirrorNW : '#fff', g: 40
                });
            }
        }
        _spawnDust(p) {
            for (let i = 0; i < 10; i++) {
                const a = Math.random() * TWO_PI, sp = Math.random() * 70 + 20;
                this.particles.push({
                    x: p.x, y: p.y + this.cell * 0.25, vx: Math.cos(a) * sp, vy: -Math.abs(Math.sin(a) * sp) * 0.6,
                    life: 0.5, max: 0.5, size: Math.random() * 3 + 2, color: 'rgba(180,210,190,0.8)', g: 60
                });
            }
        }
        _spawnLandPuff(p) {
            for (let i = 0; i < 8; i++) {
                const dir = i < 4 ? -1 : 1;
                this.particles.push({
                    x: p.x, y: p.y + this.cell * 0.22, vx: dir * (Math.random() * 60 + 30), vy: -Math.random() * 20,
                    life: 0.4, max: 0.4, size: Math.random() * 2.5 + 1.5, color: 'rgba(200,210,255,0.6)', g: 30
                });
            }
        }
        _spawnPortalBurst(p, color) {
            for (let i = 0; i < 14; i++) {
                const a = (i / 14) * TWO_PI, sp = 90;
                this.particles.push({
                    x: p.x, y: p.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
                    life: 0.5, max: 0.5, size: Math.random() * 2 + 1.5, color, g: 0, swirl: 1
                });
            }
        }

        _updateParticles(dt) {
            for (let i = this.particles.length - 1; i >= 0; i--) {
                const p = this.particles[i];
                p.life -= dt;
                if (p.life <= 0) { this.particles.splice(i, 1); continue; }
                if (p.swirl) { const a = Math.atan2(p.vy, p.vx) + dt * 6; const sp = Math.hypot(p.vx, p.vy) * (1 - dt); p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp; }
                p.x += p.vx * dt; p.y += p.vy * dt;
                p.vy += (p.g || 0) * dt;
                if (p.confetti) p.rot += p.spin * dt;
            }
            for (let i = this.trail.length - 1; i >= 0; i--) {
                this.trail[i].life -= dt;
                if (this.trail[i].life <= 0) this.trail.splice(i, 1);
            }
            for (let i = this.ripples.length - 1; i >= 0; i--) {
                this.ripples[i].life -= dt;
                if (this.ripples[i].life <= 0) this.ripples.splice(i, 1);
            }
            if (this.goalPulse > 0) this.goalPulse = Math.max(0, this.goalPulse - dt * 1.6);
        }

        // ── Main loop ───────────────────────────────────────
        _loop(ts) {
            if (!this._running) return;
            if (!this._last) this._last = ts;
            let dt = (ts - this._last) / 1000;
            this._last = ts;
            dt = Math.max(0, Math.min(dt, 0.05)); // guard against backwards/huge clocks
            this._t += dt;

            this._updateParticles(dt);
            if (this.activeSub && this.activeSub.kind === 'death') this._updateDeath(dt);
            else this._updateTween(dt);

            this._draw(dt);
            global.requestAnimationFrame(this._loop);
        }

        _updateDeath(dt) {
            const s = this.activeSub;
            const k = clamp((this._t - this.subStart) / 0.55, 0, 1);
            s.spin += dt * 14;
            this.player.scale = lerp(1, 0, easeInOut(k));
            this.player.y = lerp(s.from.y, s.from.y + this.cell * 0.4, k);
            this.player.alpha = lerp(1, 0, k * k);
            if (k >= 1) { this.activeSub = null; this.playerVisible = false; }
        }

        _draw(dt) {
            const ctx = this.ctx;
            ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
            ctx.clearRect(0, 0, this.w, this.h);

            // screen shake
            if (this.shakeMag > 0.2) {
                const sx = (Math.random() - 0.5) * this.shakeMag;
                const sy = (Math.random() - 0.5) * this.shakeMag;
                ctx.translate(sx, sy);
                this.shakeMag *= 0.86;
            } else this.shakeMag = 0;

            this._drawVoid(ctx);
            this._drawStars(ctx);

            // tiles
            for (let r = 0; r < this.rows; r++) {
                for (let c = 0; c < this.cols; c++) {
                    this._drawTile(ctx, r, c, this.grid[r][c]);
                }
            }

            this._drawTrail(ctx);
            this._drawParticles(ctx, false);
            if (this.playerVisible) this._drawPlayer(ctx);
            this._drawParticles(ctx, true);
            this._drawRipples(ctx);
        }

        _drawVoid(ctx) {
            const g = ctx.createLinearGradient(0, 0, this.w, this.h);
            g.addColorStop(0, COLORS.voidA);
            g.addColorStop(1, COLORS.voidB);
            ctx.fillStyle = g;
            ctx.fillRect(0, 0, this.w, this.h);
        }

        _drawStars(ctx) {
            for (const s of this.stars) {
                const a = 0.35 + 0.35 * Math.sin(this._t * s.sp + s.tw);
                ctx.fillStyle = COLORS.star + a.toFixed(3) + ')';
                ctx.beginPath();
                ctx.arc(s.x, s.y, s.r, 0, TWO_PI);
                ctx.fill();
            }
        }

        _drawTile(ctx, r, c, type) {
            const { x, y } = this.tileXY(r, c);
            const s = this.cell;
            const t = this._t;

            if (type === 8) return; // void — show background

            // Floor base under most non-void tiles
            const floorTypes = (type === 0 || type === 3 || type === 4 || type === 5 || type === 6 || type === 7 || type === 9);
            if (floorTypes) {
                // ledge shadow for depth
                ctx.fillStyle = COLORS.floorLedge;
                rrect(ctx, x + 1.5, y + 3, s, s, 9); ctx.fill();
                const g = ctx.createLinearGradient(0, y, 0, y + s);
                g.addColorStop(0, COLORS.floorTop);
                g.addColorStop(1, COLORS.floorBot);
                ctx.fillStyle = g;
                rrect(ctx, x, y, s, s, 9); ctx.fill();
                ctx.strokeStyle = COLORS.floorEdge;
                ctx.lineWidth = 1;
                rrect(ctx, x + 0.5, y + 0.5, s - 1, s - 1, 8.5); ctx.stroke();
            }

            switch (type) {
                case 1: this._drawWall(ctx, x, y, s, r, c); break;
                case 3: this._drawGoal(ctx, x, y, s, t); break;
                case 4: this._drawMirror(ctx, x, y, s, t, true); break;
                case 5: this._drawMirror(ctx, x, y, s, t, false); break;
                case 6: this._drawJump(ctx, x, y, s, t); break;
                case 7: this._drawPortal(ctx, x, y, s, t); break;
                case 9: this._drawSand(ctx, x, y, s); break;
            }
        }

        _drawWall(ctx, x, y, s, r, c) {
            const g = ctx.createLinearGradient(0, y, 0, y + s);
            g.addColorStop(0, COLORS.wallTop);
            g.addColorStop(1, COLORS.wallBot);
            ctx.fillStyle = g;
            rrect(ctx, x, y, s, s, 7); ctx.fill();
            // bevel
            ctx.strokeStyle = COLORS.wallLight; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(x + 3, y + s - 4); ctx.lineTo(x + 3, y + 3); ctx.lineTo(x + s - 4, y + 3); ctx.stroke();
            ctx.strokeStyle = COLORS.wallDark; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(x + s - 3, y + 4); ctx.lineTo(x + s - 3, y + s - 3); ctx.lineTo(x + 4, y + s - 3); ctx.stroke();
            // rivets
            ctx.fillStyle = 'rgba(0,0,0,0.3)';
            const rv = 1.6;
            [[x + 7, y + 7], [x + s - 7, y + 7], [x + 7, y + s - 7], [x + s - 7, y + s - 7]].forEach(p => {
                ctx.beginPath(); ctx.arc(p[0], p[1], rv, 0, TWO_PI); ctx.fill();
            });
        }

        _drawGoal(ctx, x, y, s, t) {
            const cx = x + s / 2, cy = y + s / 2;
            const pulse = 0.5 + 0.5 * Math.sin(t * 3);
            const burst = this.goalPulse;
            ctx.save();
            ctx.translate(cx, cy);
            // rotating rings
            for (let i = 0; i < 2; i++) {
                ctx.save();
                ctx.rotate(t * (i ? -1.2 : 1.6) + i);
                ctx.strokeStyle = `rgba(245,197,24,${0.5 - i * 0.18 + burst * 0.4})`;
                ctx.lineWidth = 2;
                const rad = s * (0.30 + i * 0.08) + burst * s * 0.3;
                ctx.beginPath();
                for (let a = 0; a < TWO_PI; a += TWO_PI / 6) {
                    const px = Math.cos(a) * rad, py = Math.sin(a) * rad;
                    a === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
                }
                ctx.closePath(); ctx.stroke();
                ctx.restore();
            }
            // glowing core star
            ctx.shadowColor = COLORS.goal;
            ctx.shadowBlur = 14 + pulse * 8 + burst * 20;
            ctx.fillStyle = COLORS.goal;
            this._star(ctx, 0, 0, s * (0.20 + pulse * 0.03), s * 0.1, 5, -Math.PI / 2);
            ctx.fill();
            ctx.restore();
        }

        _star(ctx, cx, cy, outer, inner, points, rot) {
            ctx.beginPath();
            for (let i = 0; i < points * 2; i++) {
                const rad = i % 2 === 0 ? outer : inner;
                const a = rot + (i * Math.PI) / points;
                const px = cx + Math.cos(a) * rad, py = cy + Math.sin(a) * rad;
                i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
            }
            ctx.closePath();
        }

        _drawMirror(ctx, x, y, s, t, isNW) {
            const color = isNW ? COLORS.mirrorNW : COLORS.mirrorNE;
            const shimmer = 0.6 + 0.4 * Math.sin(t * 4 + (isNW ? 0 : 1.5));
            // glass triangle tint
            ctx.save();
            rrect(ctx, x, y, s, s, 9); ctx.clip();
            const grad = ctx.createLinearGradient(x, y, x + s, y + s);
            grad.addColorStop(0, isNW ? `rgba(245,166,11,0.22)` : 'rgba(6,182,212,0.05)');
            grad.addColorStop(1, isNW ? 'rgba(245,166,11,0.05)' : 'rgba(6,182,212,0.22)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            if (isNW) { ctx.moveTo(x, y); ctx.lineTo(x + s, y + s); ctx.lineTo(x, y + s); }
            else { ctx.moveTo(x + s, y); ctx.lineTo(x, y + s); ctx.lineTo(x + s, y + s); }
            ctx.closePath(); ctx.fill();
            ctx.restore();
            // the reflective bar
            ctx.save();
            ctx.shadowColor = color; ctx.shadowBlur = 10 * shimmer;
            ctx.strokeStyle = color; ctx.lineCap = 'round'; ctx.lineWidth = 3.5;
            ctx.beginPath();
            if (isNW) { ctx.moveTo(x + 5, y + 5); ctx.lineTo(x + s - 5, y + s - 5); }
            else { ctx.moveTo(x + s - 5, y + 5); ctx.lineTo(x + 5, y + s - 5); }
            ctx.stroke();
            // bright glint
            ctx.strokeStyle = `rgba(255,255,255,${0.5 * shimmer})`; ctx.lineWidth = 1.2;
            ctx.stroke();
            ctx.restore();
        }

        _drawJump(ctx, x, y, s, t) {
            const cx = x + s / 2;
            const bob = Math.sin(t * 4) * 2;
            ctx.save();
            ctx.shadowColor = COLORS.jump; ctx.shadowBlur = 8;
            ctx.strokeStyle = COLORS.jump; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
            for (let i = 0; i < 3; i++) {
                const off = i * (s * 0.18) - bob;
                const a = 0.9 - i * 0.25;
                ctx.globalAlpha = a;
                ctx.beginPath();
                ctx.moveTo(cx - s * 0.22, y + s * 0.62 + off);
                ctx.lineTo(cx, y + s * 0.42 + off);
                ctx.lineTo(cx + s * 0.22, y + s * 0.62 + off);
                ctx.stroke();
            }
            ctx.restore();
        }

        _drawPortal(ctx, x, y, s, t) {
            const cx = x + s / 2, cy = y + s / 2;
            ctx.save();
            ctx.translate(cx, cy);
            ctx.shadowColor = COLORS.portal; ctx.shadowBlur = 14;
            // swirling arcs
            for (let i = 0; i < 4; i++) {
                const rad = s * (0.12 + i * 0.07);
                const start = t * (1.8 + i * 0.5) + i;
                ctx.strokeStyle = `rgba(168,85,247,${0.8 - i * 0.15})`;
                ctx.lineWidth = 2.4;
                ctx.beginPath();
                ctx.arc(0, 0, rad, start, start + Math.PI * 1.3);
                ctx.stroke();
            }
            // bright core
            const cg = ctx.createRadialGradient(0, 0, 0, 0, 0, s * 0.16);
            cg.addColorStop(0, '#fff');
            cg.addColorStop(0.5, COLORS.portal);
            cg.addColorStop(1, 'rgba(139,92,246,0)');
            ctx.fillStyle = cg;
            ctx.beginPath(); ctx.arc(0, 0, s * 0.16, 0, TWO_PI); ctx.fill();
            ctx.restore();
        }

        _drawSand(ctx, x, y, s) {
            ctx.save();
            rrect(ctx, x, y, s, s, 9); ctx.clip();
            ctx.fillStyle = 'rgba(201,163,107,0.30)';
            ctx.fillRect(x, y, s, s);
            // stipple grains (deterministic by position)
            ctx.fillStyle = 'rgba(201,163,107,0.7)';
            let seed = (x * 13 + y * 7) % 97;
            for (let i = 0; i < 24; i++) {
                seed = (seed * 31 + 17) % 101;
                const gx = x + (seed / 101) * s;
                seed = (seed * 31 + 17) % 101;
                const gy = y + (seed / 101) * s;
                ctx.fillRect(gx, gy, 1.6, 1.6);
            }
            ctx.restore();
            ctx.strokeStyle = 'rgba(201,163,107,0.4)'; ctx.lineWidth = 1;
            rrect(ctx, x + 0.5, y + 0.5, s - 1, s - 1, 8.5); ctx.stroke();
        }

        _drawTrail(ctx) {
            for (const p of this.trail) {
                const a = (p.life / p.max);
                ctx.fillStyle = `rgba(124,131,255,${(a * 0.32).toFixed(3)})`;
                ctx.beginPath();
                ctx.arc(p.x, p.y, this.cell * 0.30 * a, 0, TWO_PI);
                ctx.fill();
            }
        }

        _drawParticles(ctx, confettiOnly) {
            for (const p of this.particles) {
                if (!!p.confetti !== confettiOnly) continue;
                const a = clamp(p.life / p.max, 0, 1);
                ctx.globalAlpha = a;
                if (p.confetti) {
                    ctx.save();
                    ctx.translate(p.x, p.y); ctx.rotate(p.rot || 0);
                    ctx.fillStyle = p.color;
                    ctx.fillRect(-p.size, -p.size * 0.5, p.size * 2, p.size);
                    ctx.restore();
                } else {
                    ctx.fillStyle = p.color;
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, p.size, 0, TWO_PI);
                    ctx.fill();
                }
            }
            ctx.globalAlpha = 1;
        }

        _drawRipples(ctx) {
            for (const rp of this.ripples) {
                const k = 1 - rp.life / rp.max;
                ctx.strokeStyle = `rgba(245,197,24,${(1 - k).toFixed(3)})`;
                ctx.lineWidth = 3 * (1 - k) + 0.5;
                ctx.beginPath();
                ctx.arc(rp.x, rp.y, k * this.cell * 2.4, 0, TWO_PI);
                ctx.stroke();
            }
        }

        _drawPlayer(ctx) {
            const p = this.player;
            const baseR = this.cell * 0.34;
            const R = baseR * p.scale;
            if (R <= 0.4 || p.alpha <= 0.01) return;
            ctx.save();
            ctx.globalAlpha = p.alpha;
            ctx.translate(p.x, p.y);
            ctx.scale(p.sx, p.sy);

            // outer glow
            ctx.shadowColor = COLORS.player;
            ctx.shadowBlur = 16;
            const g = ctx.createRadialGradient(-R * 0.3, -R * 0.4, R * 0.1, 0, 0, R);
            g.addColorStop(0, '#c7caff');
            g.addColorStop(0.5, COLORS.player);
            g.addColorStop(1, COLORS.playerB);
            ctx.fillStyle = g;
            ctx.beginPath(); ctx.arc(0, 0, R, 0, TWO_PI); ctx.fill();
            ctx.shadowBlur = 0;

            // specular highlight
            ctx.fillStyle = 'rgba(255,255,255,0.55)';
            ctx.beginPath(); ctx.ellipse(-R * 0.32, -R * 0.4, R * 0.28, R * 0.18, -0.6, 0, TWO_PI); ctx.fill();

            // face — eyes look toward travel direction
            const dc = p.dir.dc || 0, dr = p.dir.dr || 0;
            const ex = dc * R * 0.18, ey = dr * R * 0.18;
            const eyeOff = R * 0.30;
            ctx.fillStyle = '#11132a';
            [[-eyeOff, -R * 0.05], [eyeOff, -R * 0.05]].forEach(e => {
                ctx.beginPath(); ctx.arc(e[0] + ex, e[1] + ey, R * 0.16, 0, TWO_PI); ctx.fill();
            });
            ctx.fillStyle = '#fff';
            [[-eyeOff, -R * 0.05], [eyeOff, -R * 0.05]].forEach(e => {
                ctx.beginPath(); ctx.arc(e[0] + ex + R * 0.05, e[1] + ey - R * 0.05, R * 0.05, 0, TWO_PI); ctx.fill();
            });
            ctx.restore();
        }

        destroy() {
            this._running = false;
            if (this.canvas && this.canvas.parentNode) this.canvas.parentNode.removeChild(this.canvas);
        }
    }

    global.BoardRenderer = BoardRenderer;
})(window);
