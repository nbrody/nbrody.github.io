// render.js — all canvas drawing for the Long-Reid Racer.
//
// Visual system (v3 overhaul):
//   * Roads are perspective-correct ribbons: the half-width is computed in
//     disk space as ROAD_HALF·(1 − |z|²), so every road arriving at a node
//     has the same cross-section there, and a junction pad drawn over each
//     node merges them into one connected highway network.
//   * Signs are billboards on poles planted along the actual geodesic each
//     move would take, colored by height delta.
//   * Classic vaporwave ground grid, city skyline, sun with slits, parallax
//     mountains, and a detailed scenery kit (palms, columns, crystals, radio
//     towers, pyramids, cacti, floating gems, obelisks).
//
// The renderer never touches exact arithmetic during a frame: each node
// carries a cached complex matrix `relC` (position relative to the car);
// per-frame work is float Möbius maps + projection.

'use strict';

const Render = (() => {

    const W = 800, H = 600;
    const HORIZON_Y = H / 2 + 50;
    const FOV = 600;
    const ROAD_HALF = 0.055;      // road half-width in disk units at the origin
    const HEIGHT_UNIT = 0.15;     // world height per unit of arithmetic height

    let canvas = null, ctx = null;
    let game = null;

    // ---------- camera ----------

    const camera = { yaw: 0, pitch: 0.1, dist: 0.8, heightOffset: 0.1 };
    let cosY = 1, sinY = 0, cosP = 1, sinP = 0; // cached per frame

    function attachCameraControls() {
        let dragging = false, lastX = 0, lastY = 0;
        canvas.addEventListener('mousedown', e => {
            dragging = true;
            lastX = e.clientX;
            lastY = e.clientY;
        });
        window.addEventListener('mouseup', () => { dragging = false; });
        window.addEventListener('mousemove', e => {
            if (!dragging) return;
            camera.yaw -= (e.clientX - lastX) * 0.01;
            camera.pitch += (e.clientY - lastY) * 0.01;
            camera.pitch = Math.max(-1.0, Math.min(0.2, camera.pitch));
            lastX = e.clientX;
            lastY = e.clientY;
        });
        canvas.addEventListener('wheel', e => {
            e.preventDefault();
            camera.dist = Math.max(0.1, Math.min(5.0, camera.dist + e.deltaY * 0.001));
        }, { passive: false });
    }

    function projectWorld(wx, wy, wz) {
        const x1 = wx * cosY - wz * sinY;
        const z1 = wx * sinY + wz * cosY;
        const y2 = wy * cosP - z1 * sinP;
        const z2 = wy * sinP + z1 * cosP;
        const depth = z2 + camera.dist;
        const d = Math.max(0.1, depth);
        return {
            x: W / 2 + (x1 * FOV) / d,
            y: H / 2 - ((y2 - camera.heightOffset) * FOV) / d + 50,
            scale: FOV / d,
            depth
        };
    }

    function depthOf(wx, wy, wz) {
        const z1 = wx * sinY + wz * cosY;
        return wy * sinP + z1 * cosP + camera.dist;
    }

    // Disk point + arithmetic height -> screen. World axes: X right (diskY),
    // Y up (height), Z toward the camera (+diskX); the car sits at the origin.
    function project(diskX, diskY, height) {
        return projectWorld(diskY, (height - game.heightValue) * HEIGHT_UNIT, -diskX);
    }

    function onScreen(p, margin = 250) {
        return p.x > -margin && p.x < W + margin;
    }

    // Stroke a straight world-space segment, clipped to the near plane
    function strokeWorldLine(w1, w2, minDepth = 0.15) {
        let d1 = depthOf(w1[0], w1[1], w1[2]);
        let d2 = depthOf(w2[0], w2[1], w2[2]);
        if (d1 < minDepth && d2 < minDepth) return;
        let a = w1, b = w2;
        if (d1 < minDepth || d2 < minDepth) {
            const t = (minDepth - d1) / (d2 - d1);
            const c = [w1[0] + (w2[0] - w1[0]) * t, w1[1] + (w2[1] - w1[1]) * t, w1[2] + (w2[2] - w1[2]) * t];
            if (d1 < minDepth) a = c; else b = c;
        }
        const p1 = projectWorld(a[0], a[1], a[2]);
        const p2 = projectWorld(b[0], b[1], b[2]);
        if (!onScreen(p1, 400) && !onScreen(p2, 400)) return;
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
    }

    function roundedRect(x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
    }

    // ---------- background ----------

    const stars = (() => {
        const out = [];
        let s = 1234567;
        const r = () => { s = (s * 1103515245 + 12345) | 0; return ((s >>> 0) % 1000) / 1000; };
        for (let i = 0; i < 90; i++) {
            out.push({
                x: r() * W,
                y: r() * 240,
                size: r() < 0.85 ? 1 : 2,
                offset: r() * 6.28,
                color: r() < 0.6 ? '#ffffff' : (r() < 0.5 ? '#01cdfe' : '#ff71ce')
            });
        }
        return out;
    })();

    function drawSky(time) {
        const sky = ctx.createLinearGradient(0, 0, 0, HORIZON_Y);
        sky.addColorStop(0, '#070018');
        sky.addColorStop(0.4, '#22003a');
        sky.addColorStop(0.75, '#6e1360');
        sky.addColorStop(0.92, '#c22a7f');
        sky.addColorStop(1, '#ff71ce');
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, W, HORIZON_Y);

        // thin drifting haze bands
        ctx.globalAlpha = 0.12;
        for (let i = 0; i < 4; i++) {
            const y = 60 + i * 55 + Math.sin(time * 0.15 + i * 2.1) * 6;
            const grad = ctx.createLinearGradient(0, y, W, y);
            grad.addColorStop(0, 'rgba(255,113,206,0)');
            grad.addColorStop(0.5, i % 2 ? '#ff71ce' : '#01cdfe');
            grad.addColorStop(1, 'rgba(1,205,254,0)');
            ctx.fillStyle = grad;
            ctx.fillRect(0, y, W, 2 + i);
        }
        ctx.globalAlpha = 1;

        for (const star of stars) {
            ctx.globalAlpha = 0.4 + 0.5 * Math.sin(time * 2 + star.offset);
            ctx.fillStyle = star.color;
            ctx.fillRect(star.x, star.y, star.size, star.size);
        }
        ctx.globalAlpha = 1;
    }

    function drawSun() {
        const cx = W / 2, cy = HORIZON_Y - 52, r = 92;

        const halo = ctx.createRadialGradient(cx, cy, r * 0.6, cx, cy, r * 2.4);
        halo.addColorStop(0, 'rgba(255, 138, 60, 0.4)');
        halo.addColorStop(1, 'rgba(255, 138, 60, 0)');
        ctx.fillStyle = halo;
        ctx.fillRect(cx - r * 2.4, cy - r * 2.4, r * 4.8, r * 4.8);

        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        const grad = ctx.createLinearGradient(0, cy - r, 0, cy + r);
        grad.addColorStop(0, '#fff36b');
        grad.addColorStop(0.4, '#ff9a3c');
        grad.addColorStop(1, '#ff2a8d');
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.globalCompositeOperation = 'destination-out';
        for (let i = 0; i < 7; i++) {
            ctx.fillRect(cx - r, cy + 2 + i * 12, r * 2, 2.5 + i * 1.5);
        }
        ctx.restore();
    }

    function mountainLayer(offset, fill, rim, rimWidth, base, step, f1, f2, a1, a2) {
        const heightAt = x => base + Math.sin((x + offset) * f1) * a1 + Math.sin((x + offset) * f2) * a2;
        ctx.fillStyle = fill;
        ctx.beginPath();
        ctx.moveTo(-120, HORIZON_Y);
        for (let x = -120; x <= W + 120; x += step) ctx.lineTo(x, HORIZON_Y - heightAt(x));
        ctx.lineTo(W + 120, HORIZON_Y);
        ctx.fill();
        ctx.strokeStyle = rim;
        ctx.lineWidth = rimWidth;
        ctx.beginPath();
        for (let x = -120; x <= W + 120; x += step) {
            if (x === -120) ctx.moveTo(x, HORIZON_Y - heightAt(x));
            else ctx.lineTo(x, HORIZON_Y - heightAt(x));
        }
        ctx.stroke();
    }

    function drawSkyline(progress) {
        const P = LRMath.pseudoRandom;
        const span = W + 120;
        for (let i = 0; i < 34; i++) {
            const bw = 14 + P(i + 11) * 26;
            const bh = 10 + P(i + 13) * 36;
            let bx = (i * 61.3 + P(i + 7) * 40 - progress * 6) % span;
            bx = ((bx % span) + span) % span - 60;

            ctx.fillStyle = '#0d0022';
            ctx.fillRect(bx, HORIZON_Y - bh, bw, bh);
            ctx.fillStyle = 'rgba(255,113,206,0.5)';
            ctx.fillRect(bx, HORIZON_Y - bh, bw, 1);

            // lit windows
            ctx.fillStyle = 'rgba(255,217,122,0.55)';
            const rows = Math.floor(bh / 7), cols = Math.floor(bw / 6);
            for (let rr = 0; rr < rows; rr++) {
                for (let cc = 0; cc < cols; cc++) {
                    if (P(i * 131 + rr * 17 + cc * 29) > 0.74) {
                        ctx.fillRect(bx + 2 + cc * 6, HORIZON_Y - bh + 3 + rr * 7, 2, 2);
                    }
                }
            }
            // antenna on a few towers
            if (P(i + 51) > 0.8) {
                ctx.strokeStyle = 'rgba(255,113,206,0.6)';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(bx + bw / 2, HORIZON_Y - bh);
                ctx.lineTo(bx + bw / 2, HORIZON_Y - bh - 7);
                ctx.stroke();
                ctx.fillStyle = '#ff2a6d';
                ctx.fillRect(bx + bw / 2 - 1, HORIZON_Y - bh - 8, 2, 2);
            }
        }
    }

    function drawBackground(progress, time) {
        drawSky(time);
        drawSun();
        mountainLayer(progress * 4, '#3b0d4f', 'rgba(255, 113, 206, 0.45)', 1, 26, 30, 0.013, 0.041, 16, 7);
        drawSkyline(progress);
        mountainLayer(progress * 10, '#160028', 'rgba(255, 113, 206, 0.85)', 1.5, 38, 50, 0.011, 0.031, 22, 12);

        const ground = ctx.createLinearGradient(0, HORIZON_Y, 0, H);
        ground.addColorStop(0, '#1a002e');
        ground.addColorStop(1, '#050011');
        ctx.fillStyle = ground;
        ctx.fillRect(0, HORIZON_Y, W, H - HORIZON_Y);

        // sun reflection pooling on the desert floor
        const refl = ctx.createLinearGradient(0, HORIZON_Y, 0, HORIZON_Y + 110);
        refl.addColorStop(0, 'rgba(255, 138, 60, 0.22)');
        refl.addColorStop(1, 'rgba(255, 138, 60, 0)');
        ctx.fillStyle = refl;
        ctx.fillRect(W / 2 - 120, HORIZON_Y, 240, 110);

        const glow = ctx.createLinearGradient(0, HORIZON_Y - 4, 0, HORIZON_Y + 8);
        glow.addColorStop(0, 'rgba(255, 251, 150, 0)');
        glow.addColorStop(0.5, 'rgba(255, 251, 150, 0.35)');
        glow.addColorStop(1, 'rgba(255, 251, 150, 0)');
        ctx.fillStyle = glow;
        ctx.fillRect(0, HORIZON_Y - 4, W, 12);
    }

    // ---------- vaporwave ground grid ----------

    function drawGrid(progress) {
        const step = 0.24;
        const gy = (0 - game.heightValue) * HEIGHT_UNIT;
        const half = 16;
        const xNear = 1.0, xFar = -4.5;
        const scroll = ((progress * 0.5) % step + step) % step;

        ctx.save();
        ctx.beginPath();
        ctx.rect(0, HORIZON_Y - 2, W, H - HORIZON_Y + 2);
        ctx.clip();
        ctx.lineWidth = 1;

        // longitudinal lines (direction of travel)
        for (let k = -half; k <= half; k++) {
            const y = k * step;
            ctx.strokeStyle = `rgba(255, 113, 206, ${k % 4 === 0 ? 0.3 : 0.17})`;
            strokeWorldLine([y, gy, -xNear], [y, gy, -xFar]);
        }
        // cross lines, flowing toward the camera
        const spanX = xNear - xFar;
        for (let m = 0; m * step < spanX; m++) {
            const x = xFar + m * step + scroll;
            if (x > xNear) break;
            const u = (x - xFar) / spanX;
            ctx.strokeStyle = `rgba(1, 205, 254, ${0.04 + u * 0.2})`;
            strokeWorldLine([-half * step, gy, -x], [half * step, gy, -x]);
        }
        ctx.restore();
    }

    // ---------- scenery ----------

    function groundShadow(cx, y, w, alpha = 0.45) {
        ctx.fillStyle = `rgba(4, 0, 14, ${alpha})`;
        ctx.beginPath();
        ctx.ellipse(cx, y, w, Math.max(1.5, w * 0.22), 0, 0, Math.PI * 2);
        ctx.fill();
    }

    function drawPalm(cx, baseY, s, time, phase) {
        const trunkH = s * 0.085;
        const sway = Math.sin(time * 1.1 + phase) * trunkH * 0.05;
        const topX = cx + trunkH * 0.12 + sway, topY = baseY - trunkH;
        groundShadow(cx, baseY, s * 0.02);

        // trunk: dark core + pink rim + ring notches
        ctx.strokeStyle = '#1a0a18';
        ctx.lineWidth = Math.max(1.5, s * 0.009);
        ctx.beginPath();
        ctx.moveTo(cx, baseY);
        ctx.quadraticCurveTo(cx + trunkH * 0.05, baseY - trunkH * 0.55, topX, topY);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255, 113, 206, 0.85)';
        ctx.lineWidth = Math.max(1, s * 0.004);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255, 113, 206, 0.35)';
        for (let i = 1; i <= 4; i++) {
            const t = i / 5;
            const rx = cx + (topX - cx) * t * t, ry = baseY - trunkH * t;
            ctx.beginPath();
            ctx.moveTo(rx - s * 0.004, ry);
            ctx.lineTo(rx + s * 0.004, ry);
            ctx.stroke();
        }

        // fronds: dark underside + neon top stroke, drooping tips
        const frondLen = s * 0.052;
        for (const ang of [-1.25, -0.8, -0.35, 0.1, 0.55, 1.0, 1.4]) {
            const a = ang + sway * 0.02;
            const fx = topX + Math.sin(a) * frondLen;
            const fy = topY - Math.cos(a) * frondLen * 0.7 + Math.abs(Math.sin(a)) * frondLen * 0.35;
            const mx = topX + Math.sin(a) * frondLen * 0.5;
            const my = topY - Math.cos(a) * frondLen * 0.75;
            ctx.strokeStyle = 'rgba(2, 60, 40, 0.9)';
            ctx.lineWidth = Math.max(1.5, s * 0.006);
            ctx.beginPath();
            ctx.moveTo(topX, topY);
            ctx.quadraticCurveTo(mx, my, fx, fy);
            ctx.stroke();
            ctx.strokeStyle = 'rgba(5, 255, 161, 0.9)';
            ctx.lineWidth = Math.max(1, s * 0.0028);
            ctx.stroke();
        }
        ctx.fillStyle = 'rgba(255, 251, 150, 0.9)';
        ctx.beginPath();
        ctx.arc(topX, topY, Math.max(1.2, s * 0.005), 0, Math.PI * 2);
        ctx.fill();
    }

    function drawColumn(cx, baseY, s) {
        const w = s * 0.017, h = s * 0.085;
        const capH = h * 0.09;
        groundShadow(cx, baseY, w * 2.4);

        const grad = ctx.createLinearGradient(cx - w, 0, cx + w, 0);
        grad.addColorStop(0, '#c9b8f2');
        grad.addColorStop(0.5, '#8f76c9');
        grad.addColorStop(1, '#5b3f96');
        ctx.fillStyle = grad;
        ctx.fillRect(cx - w, baseY - h + capH, w * 2, h - capH * 2);

        // base and capital slabs
        ctx.fillStyle = '#d8ccf7';
        ctx.fillRect(cx - w * 1.5, baseY - capH, w * 3, capH);
        ctx.fillRect(cx - w * 1.5, baseY - h, w * 3, capH);
        ctx.fillStyle = '#9e86d6';
        ctx.fillRect(cx - w * 1.5, baseY - capH, w * 3, Math.max(1, capH * 0.35));
        ctx.fillRect(cx - w * 1.5, baseY - h + capH * 0.65, w * 3, Math.max(1, capH * 0.35));

        // flutes
        ctx.strokeStyle = 'rgba(40, 16, 80, 0.55)';
        ctx.lineWidth = Math.max(0.6, s * 0.0018);
        for (let i = -1; i <= 1; i++) {
            ctx.beginPath();
            ctx.moveTo(cx + i * w * 0.55, baseY - capH);
            ctx.lineTo(cx + i * w * 0.55, baseY - h + capH);
            ctx.stroke();
        }
        ctx.strokeStyle = 'rgba(1, 205, 254, 0.35)';
        ctx.lineWidth = Math.max(0.6, s * 0.0015);
        ctx.strokeRect(cx - w, baseY - h + capH, w * 2, h - capH * 2);
    }

    function drawCrystal(cx, baseY, s, time, phase) {
        const w = s * 0.022, h = s * 0.065;
        const pulse = 0.65 + 0.35 * Math.sin(time * 2 + phase);
        groundShadow(cx, baseY, w * 1.6);

        ctx.beginPath();
        ctx.moveTo(cx, baseY - h);
        ctx.lineTo(cx + w, baseY - h * 0.45);
        ctx.lineTo(cx + w * 0.4, baseY);
        ctx.lineTo(cx - w * 0.4, baseY);
        ctx.lineTo(cx - w, baseY - h * 0.45);
        ctx.closePath();
        const grad = ctx.createLinearGradient(cx - w, baseY - h, cx + w, baseY);
        grad.addColorStop(0, 'rgba(1, 205, 254, 0.75)');
        grad.addColorStop(0.55, 'rgba(120, 80, 220, 0.55)');
        grad.addColorStop(1, 'rgba(255, 113, 206, 0.65)');
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.strokeStyle = `rgba(220, 245, 255, ${0.5 + pulse * 0.5})`;
        ctx.lineWidth = Math.max(1, s * 0.0028);
        ctx.stroke();

        // facet lines
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.lineWidth = Math.max(0.6, s * 0.0015);
        ctx.beginPath();
        ctx.moveTo(cx, baseY - h);
        ctx.lineTo(cx - w * 0.15, baseY);
        ctx.moveTo(cx, baseY - h);
        ctx.lineTo(cx + w * 0.55, baseY - h * 0.45);
        ctx.stroke();
    }

    function drawTower(cx, baseY, s, time, phase) {
        const h = s * 0.11, w = s * 0.018;
        groundShadow(cx, baseY, w * 1.8);

        ctx.strokeStyle = 'rgba(180, 150, 220, 0.75)';
        ctx.lineWidth = Math.max(1, s * 0.0028);
        // legs
        ctx.beginPath();
        ctx.moveTo(cx - w, baseY);
        ctx.lineTo(cx - w * 0.18, baseY - h);
        ctx.moveTo(cx + w, baseY);
        ctx.lineTo(cx + w * 0.18, baseY - h);
        ctx.stroke();
        // cross braces
        ctx.lineWidth = Math.max(0.6, s * 0.0016);
        for (let i = 0; i < 4; i++) {
            const t0 = i / 4, t1 = (i + 1) / 4;
            const y0 = baseY - h * t0, y1 = baseY - h * t1;
            const w0 = w * (1 - t0 * 0.82), w1 = w * (1 - t1 * 0.82);
            ctx.beginPath();
            ctx.moveTo(cx - w0, y0);
            ctx.lineTo(cx + w1, y1);
            ctx.moveTo(cx + w0, y0);
            ctx.lineTo(cx - w1, y1);
            ctx.stroke();
        }
        // beacon
        const on = Math.sin(time * 2.5 + phase) > 0.2;
        ctx.strokeStyle = 'rgba(180, 150, 220, 0.75)';
        ctx.beginPath();
        ctx.moveTo(cx, baseY - h);
        ctx.lineTo(cx, baseY - h - s * 0.012);
        ctx.stroke();
        ctx.fillStyle = on ? '#ff2a6d' : 'rgba(255, 42, 109, 0.25)';
        if (on) {
            ctx.shadowBlur = 8;
            ctx.shadowColor = '#ff2a6d';
        }
        ctx.beginPath();
        ctx.arc(cx, baseY - h - s * 0.014, Math.max(1.4, s * 0.004), 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
    }

    function drawPyramid(cx, baseY, s) {
        const w = s * 0.055, h = s * 0.06;
        const apexY = baseY - h;
        groundShadow(cx, baseY, w * 1.1, 0.35);

        ctx.beginPath();
        ctx.moveTo(cx - w, baseY);
        ctx.lineTo(cx + w, baseY);
        ctx.lineTo(cx, apexY);
        ctx.closePath();
        const grad = ctx.createLinearGradient(0, apexY, 0, baseY);
        grad.addColorStop(0, 'rgba(50, 10, 90, 0.95)');
        grad.addColorStop(1, 'rgba(10, 0, 28, 0.95)');
        ctx.fillStyle = grad;
        ctx.fill();

        // horizontal contour scan-lines clipped to the face
        ctx.save();
        ctx.clip();
        ctx.strokeStyle = 'rgba(1, 205, 254, 0.3)';
        ctx.lineWidth = Math.max(0.5, s * 0.0014);
        for (let i = 1; i <= 5; i++) {
            const y = apexY + (h * i) / 6;
            ctx.beginPath();
            ctx.moveTo(cx - w, y);
            ctx.lineTo(cx + w, y);
            ctx.stroke();
        }
        ctx.restore();

        ctx.strokeStyle = 'rgba(1, 205, 254, 0.9)';
        ctx.lineWidth = Math.max(1, s * 0.0032);
        ctx.beginPath();
        ctx.moveTo(cx - w, baseY);
        ctx.lineTo(cx, apexY);
        ctx.lineTo(cx + w, baseY);
        ctx.stroke();
        ctx.fillStyle = 'rgba(255, 251, 150, 0.9)';
        ctx.beginPath();
        ctx.arc(cx, apexY, Math.max(1, s * 0.003), 0, Math.PI * 2);
        ctx.fill();
    }

    function drawCactus(cx, baseY, s) {
        const w = s * 0.008, h = s * 0.055;
        groundShadow(cx, baseY, w * 3);
        ctx.fillStyle = '#06180f';
        ctx.strokeStyle = 'rgba(5, 255, 161, 0.85)';
        ctx.lineWidth = Math.max(1, s * 0.0024);

        const limb = (x0, y0, x1, y1) => {
            ctx.beginPath();
            ctx.moveTo(x0, y0);
            ctx.lineTo(x1, y1);
            ctx.stroke();
        };
        // trunk
        ctx.lineCap = 'round';
        ctx.lineWidth = Math.max(2, w * 2);
        ctx.strokeStyle = '#06180f';
        limb(cx, baseY, cx, baseY - h);
        ctx.lineWidth = Math.max(1, s * 0.0024);
        ctx.strokeStyle = 'rgba(5, 255, 161, 0.85)';
        ctx.strokeRect(cx - w, baseY - h, w * 2, h);
        // arms
        const armY = baseY - h * 0.55;
        ctx.beginPath();
        ctx.moveTo(cx - w, armY);
        ctx.lineTo(cx - w * 3, armY);
        ctx.lineTo(cx - w * 3, armY - h * 0.3);
        ctx.moveTo(cx + w, armY + h * 0.15);
        ctx.lineTo(cx + w * 3, armY + h * 0.15);
        ctx.lineTo(cx + w * 3, armY - h * 0.18);
        ctx.stroke();
        ctx.lineCap = 'butt';
    }

    function drawGem(cx, baseY, s, time, phase) {
        const bob = Math.sin(time * 1.6 + phase) * s * 0.005;
        const cy = baseY - s * 0.05 - bob;
        const rx = s * 0.02, halfH = s * 0.024;
        const theta = time * 0.8 + phase;
        groundShadow(cx, baseY, rx * (0.8 - bob / (s * 0.02) * 0.2), 0.5);

        const eq = [];
        for (let k = 0; k < 4; k++) {
            const a = theta + (k * Math.PI) / 2;
            eq.push({ x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * rx * 0.32 });
        }
        const top = { x: cx, y: cy - halfH }, bot = { x: cx, y: cy + halfH };

        ctx.lineWidth = Math.max(0.8, s * 0.002);
        for (let k = 0; k < 4; k++) {
            ctx.strokeStyle = k % 2 ? 'rgba(255, 113, 206, 0.9)' : 'rgba(1, 205, 254, 0.9)';
            ctx.beginPath();
            ctx.moveTo(top.x, top.y);
            ctx.lineTo(eq[k].x, eq[k].y);
            ctx.lineTo(bot.x, bot.y);
            ctx.stroke();
            ctx.strokeStyle = 'rgba(220, 245, 255, 0.5)';
            ctx.beginPath();
            ctx.moveTo(eq[k].x, eq[k].y);
            ctx.lineTo(eq[(k + 1) % 4].x, eq[(k + 1) % 4].y);
            ctx.stroke();
        }
        ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
        ctx.beginPath();
        ctx.arc(cx, cy, Math.max(0.8, s * 0.0022), 0, Math.PI * 2);
        ctx.fill();
    }

    function drawObelisk(cx, baseY, s) {
        const w = s * 0.014, h = s * 0.09;
        const topY = baseY - h;
        const shoulderY = topY + h * 0.16;
        groundShadow(cx, baseY, w * 2);

        const grad = ctx.createLinearGradient(cx - w, 0, cx + w, 0);
        grad.addColorStop(0, 'rgba(30, 8, 60, 0.95)');
        grad.addColorStop(1, 'rgba(8, 0, 24, 0.95)');
        ctx.fillStyle = grad;
        ctx.fillRect(cx - w, shoulderY, w * 2, h * 0.84);
        ctx.beginPath();
        ctx.moveTo(cx - w, shoulderY);
        ctx.lineTo(cx + w, shoulderY);
        ctx.lineTo(cx, topY);
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = 'rgba(255, 113, 206, 0.95)';
        ctx.lineWidth = Math.max(1, s * 0.003);
        ctx.beginPath();
        ctx.moveTo(cx - w, shoulderY);
        ctx.lineTo(cx - w, baseY);
        ctx.moveTo(cx + w, shoulderY);
        ctx.lineTo(cx + w, baseY);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(1, 205, 254, 0.9)';
        ctx.beginPath();
        ctx.moveTo(cx - w, shoulderY);
        ctx.lineTo(cx + w, shoulderY);
        ctx.lineTo(cx, topY);
        ctx.closePath();
        ctx.stroke();
        ctx.fillStyle = 'rgba(255, 251, 150, 0.9)';
        ctx.beginPath();
        ctx.arc(cx, topY + h * 0.04, Math.max(1.2, s * 0.004), 0, Math.PI * 2);
        ctx.fill();
    }

    function sceneryType(r) {
        if (r < 0.22) return 'palm';
        if (r < 0.40) return 'column';
        if (r < 0.54) return 'crystal';
        if (r < 0.64) return 'tower';
        if (r < 0.76) return 'pyramid';
        if (r < 0.86) return 'cactus';
        if (r < 0.94) return 'gem';
        return 'obelisk';
    }

    function drawScenery(progress, time) {
        const P = LRMath.pseudoRandom;
        const scrollOffset = progress * 0.5;
        const rangeX = 4.0;
        const items = [];

        for (let i = 0; i < 64; i++) {
            const baseX = (P(i) * rangeX) - rangeX + 0.5;
            let baseY = (P(i + 100) * 4.4) - 2.2;
            if (Math.abs(baseY) < 0.75) baseY += baseY > 0 ? 0.75 : -0.75;
            const type = sceneryType(P(i + 200));
            const size = 0.7 + P(i + 300) * 0.8;
            const phase = P(i + 400) * 6.28;

            let x = (baseX + scrollOffset) % rangeX;
            if (x > 0.6) x -= rangeX;

            const proj = project(x, baseY, 0);
            if (proj.depth > 0.2 && onScreen(proj, 120)) items.push({ type, proj, size, phase });
        }
        items.sort((a, b) => b.proj.depth - a.proj.depth);

        for (const item of items) {
            const s = item.proj.scale * item.size;
            if (s < 40) continue;
            const fog = Math.max(0.25, Math.min(1, 1.7 - item.proj.depth * 0.55));
            ctx.globalAlpha = fog;
            const cx = item.proj.x, by = item.proj.y;
            switch (item.type) {
                case 'palm': drawPalm(cx, by, s, time, item.phase); break;
                case 'column': drawColumn(cx, by, s); break;
                case 'crystal': drawCrystal(cx, by, s, time, item.phase); break;
                case 'tower': drawTower(cx, by, s, time, item.phase); break;
                case 'pyramid': drawPyramid(cx, by, s); break;
                case 'cactus': drawCactus(cx, by, s); break;
                case 'gem': drawGem(cx, by, s, time, item.phase); break;
                default: drawObelisk(cx, by, s);
            }
            ctx.globalAlpha = 1;
        }
    }

    // ---------- highway supports ----------

    function drawSupports(placed) {
        for (const p of placed) {
            if (p.height === 0 || p.proj.depth < 0.12 || p.proj.scale < 12 || !onScreen(p.proj)) continue;
            const base = project(p.z.re, p.z.im, 0);
            if (base.depth < 0.12) continue;

            const opacity = Math.min(1, Math.max(0.08, p.hyp * 1.5));

            ctx.strokeStyle = `rgba(110, 80, 155, ${opacity})`;
            ctx.lineWidth = Math.max(1, base.scale * 0.01);
            ctx.beginPath();
            ctx.moveTo(base.x, base.y);
            ctx.lineTo(p.proj.x, p.proj.y);
            ctx.stroke();
            ctx.strokeStyle = `rgba(255, 113, 206, ${opacity * 0.5})`;
            ctx.lineWidth = Math.max(0.5, base.scale * 0.004);
            ctx.stroke();

            const notches = Math.min(p.height, 8);
            for (let h = 1; h <= notches; h++) {
                const notch = project(p.z.re, p.z.im, h);
                if (notch.depth < 0.12) continue;
                const nw = Math.max(2, notch.scale * 0.013);
                ctx.strokeStyle = `rgba(180, 160, 220, ${opacity * 0.9})`;
                ctx.lineWidth = Math.max(0.6, notch.scale * 0.0045);
                ctx.beginPath();
                ctx.moveTo(notch.x - nw, notch.y);
                ctx.lineTo(notch.x + nw, notch.y);
                ctx.stroke();
            }
        }
    }

    // ---------- roads ----------

    // Sample factory for an edge's geodesic: left/center/right screen points
    // with the half-width computed in disk space, so widths agree wherever
    // roads meet.
    function roadSampler(p1, p2) {
        return t => {
            const z = LRMath.geodesicPoint(p1.z, p2.z, t);
            const zp = LRMath.geodesicPoint(p1.z, p2.z, Math.max(0, t - 0.04));
            const zn = LRMath.geodesicPoint(p1.z, p2.z, Math.min(1, t + 0.04));
            let tx = zn.re - zp.re, ty = zn.im - zp.im;
            const tl = Math.hypot(tx, ty) || 1;
            tx /= tl;
            ty /= tl;
            const h = p1.height + (p2.height - p1.height) * t;
            const hyp = Math.max(0, 1 - z.absSq());
            const halfw = ROAD_HALF * Math.max(0.05, hyp);
            const C = project(z.re, z.im, h);
            return {
                C,
                L: project(z.re - ty * halfw, z.im + tx * halfw, h),
                R: project(z.re + ty * halfw, z.im - tx * halfw, h),
                hyp,
                depth: C.depth
            };
        };
    }

    const NEAR_PLANE = 0.16;

    // Split the road into contiguous runs in front of the near plane (with
    // interpolated boundary samples), then draw each run. Roads that sweep
    // past the camera get cut cleanly instead of streaking across the sky.
    function drawRoad(p1, p2, dashPhase) {
        const sampleAt = roadSampler(p1, p2);
        const steps = 12;
        const raw = [];
        for (let i = 0; i <= steps; i++) raw.push({ t: i / steps, s: sampleAt(i / steps) });

        const cutSample = (a, b) => {
            let f = (NEAR_PLANE * 1.02 - a.s.depth) / (b.s.depth - a.s.depth);
            f = Math.min(1, Math.max(0, f));
            return sampleAt(a.t + (b.t - a.t) * f);
        };

        const runs = [];
        let run = [];
        for (let i = 0; i <= steps; i++) {
            const cur = raw[i];
            if (cur.s.depth > NEAR_PLANE) {
                if (run.length === 0 && i > 0) run.push(cutSample(raw[i - 1], cur));
                run.push(cur.s);
            } else if (run.length > 0) {
                run.push(cutSample(raw[i - 1], cur));
                runs.push(run);
                run = [];
            }
        }
        if (run.length > 1) runs.push(run);

        for (const r of runs) {
            if (r.length > 1) drawRoadRun(r, dashPhase);
        }
    }

    function drawRoadRun(samples, dashPhase) {
        const steps = samples.length - 1;
        let maxScale = 0, visible = false;
        for (const s of samples) {
            maxScale = Math.max(maxScale, s.C.scale);
            if (onScreen(s.C)) visible = true;
        }
        if (maxScale < 11 || !visible) return;

        const avgDepth = samples.reduce((acc, s) => acc + s.depth, 0) / samples.length;
        const alpha = Math.max(0.15, Math.min(0.95, 1.5 - avgDepth * 0.4));

        // --- side skirts: give the slab visible thickness ---
        const thick = Math.max(1.5, Math.min(6, maxScale * 0.004));
        ctx.fillStyle = `rgba(52, 18, 92, ${alpha * 0.8})`;
        for (const side of ['L', 'R']) {
            ctx.beginPath();
            ctx.moveTo(samples[0][side].x, samples[0][side].y);
            for (let i = 1; i <= steps; i++) ctx.lineTo(samples[i][side].x, samples[i][side].y);
            for (let i = steps; i >= 0; i--) ctx.lineTo(samples[i][side].x, samples[i][side].y + thick);
            ctx.closePath();
            ctx.fill();
        }

        // --- asphalt surface ---
        ctx.fillStyle = `rgba(26, 10, 48, ${alpha})`;
        ctx.beginPath();
        ctx.moveTo(samples[0].L.x, samples[0].L.y);
        for (let i = 1; i <= steps; i++) ctx.lineTo(samples[i].L.x, samples[i].L.y);
        for (let i = steps; i >= 0; i--) ctx.lineTo(samples[i].R.x, samples[i].R.y);
        ctx.closePath();
        ctx.fill();

        // --- neon edge rails: soft glow pass + hot core ---
        for (let i = 0; i < steps; i++) {
            const s0 = samples[i], s1 = samples[i + 1];
            const segA = alpha * Math.min(1, Math.max(0.06, s0.hyp * 1.3));
            const sc = s0.C.scale;

            ctx.lineWidth = Math.min(16, Math.max(1.4, sc * 0.007));
            ctx.strokeStyle = `rgba(255, 113, 206, ${segA * 0.3})`;
            ctx.beginPath();
            ctx.moveTo(s0.L.x, s0.L.y);
            ctx.lineTo(s1.L.x, s1.L.y);
            ctx.moveTo(s0.R.x, s0.R.y);
            ctx.lineTo(s1.R.x, s1.R.y);
            ctx.stroke();

            ctx.lineWidth = Math.min(6, Math.max(0.7, sc * 0.0024));
            ctx.strokeStyle = `rgba(255, 220, 245, ${segA})`;
            ctx.beginPath();
            ctx.moveTo(s0.L.x, s0.L.y);
            ctx.lineTo(s1.L.x, s1.L.y);
            ctx.moveTo(s0.R.x, s0.R.y);
            ctx.lineTo(s1.R.x, s1.R.y);
            ctx.stroke();
        }

        // --- center lane dashes, perspective-correct and flowing ---
        const period = 2.4, dashLen = 1.3; // in sample units
        const at = t => {
            const i = Math.max(0, Math.min(steps, t));
            const i0 = Math.floor(i), i1 = Math.min(steps, i0 + 1), f = i - i0;
            return {
                x: samples[i0].C.x + (samples[i1].C.x - samples[i0].C.x) * f,
                y: samples[i0].C.y + (samples[i1].C.y - samples[i0].C.y) * f,
                depth: samples[i0].depth + (samples[i1].depth - samples[i0].depth) * f,
                hyp: samples[i0].hyp,
                scale: samples[i0].C.scale
            };
        };
        for (let start = -period + dashPhase * period; start < steps; start += period) {
            const s0 = Math.max(0, start), s1 = Math.min(steps, start + dashLen);
            if (s1 - s0 < 0.05) continue;
            const a0 = at(s0);
            const segA = alpha * Math.min(1, Math.max(0.06, a0.hyp * 1.3));
            ctx.strokeStyle = `rgba(1, 205, 254, ${segA * 0.9})`;
            ctx.lineWidth = Math.min(6, Math.max(0.7, a0.scale * 0.0022));
            ctx.beginPath();
            ctx.moveTo(a0.x, a0.y);
            for (let s = Math.ceil(s0); s <= Math.floor(s1); s++) {
                const p = at(s);
                ctx.lineTo(p.x, p.y);
            }
            const aEnd = at(s1);
            ctx.lineTo(aEnd.x, aEnd.y);
            ctx.stroke();
        }
    }

    // Junction pads: one disc per node, drawn over the road ends so the
    // network reads as connected interchanges.
    function drawNodePads(placed, time) {
        for (const p of placed) {
            if (p.proj.depth < 0.22 || p.proj.scale < 11 || !onScreen(p.proj)) continue;
            const r = ROAD_HALF * 1.28 * Math.max(0.05, p.hyp);
            const alpha = Math.max(0.15, Math.min(0.95, 1.5 - p.proj.depth * 0.4));

            const pts = [];
            for (let k = 0; k < 16; k++) {
                const a = (k / 16) * Math.PI * 2;
                pts.push(project(p.z.re + Math.cos(a) * r, p.z.im + Math.sin(a) * r, p.height));
            }
            ctx.fillStyle = `rgba(30, 12, 56, ${alpha})`;
            ctx.beginPath();
            ctx.moveTo(pts[0].x, pts[0].y);
            for (let k = 1; k < 16; k++) ctx.lineTo(pts[k].x, pts[k].y);
            ctx.closePath();
            ctx.fill();

            ctx.strokeStyle = `rgba(255, 113, 206, ${alpha * 0.4})`;
            ctx.lineWidth = Math.max(1.2, p.proj.scale * 0.005);
            ctx.stroke();
            ctx.strokeStyle = `rgba(255, 220, 245, ${alpha * 0.85})`;
            ctx.lineWidth = Math.max(0.6, p.proj.scale * 0.002);
            ctx.stroke();

            // node beacon
            const pulse = 0.55 + 0.45 * Math.sin(time * 2.2 + p.height);
            const beaconColor = p.height === 0 ? '5, 255, 161' : '1, 205, 254';
            ctx.fillStyle = `rgba(${beaconColor}, ${alpha * pulse})`;
            ctx.beginPath();
            ctx.arc(p.proj.x, p.proj.y, Math.max(1.2, p.proj.scale * 0.006), 0, Math.PI * 2);
            ctx.fill();
        }
    }

    // ---------- the hover car ----------

    function drawCar(x, y, scale, time) {
        ctx.save();
        ctx.translate(x, y + Math.sin(time * 2.1) * 2);
        const s = Math.max(0.05, scale * 0.002);
        ctx.scale(s, s);

        const glow = ctx.createRadialGradient(0, 8, 4, 0, 8, 70);
        glow.addColorStop(0, 'rgba(1, 205, 254, 0.55)');
        glow.addColorStop(1, 'rgba(1, 205, 254, 0)');
        ctx.fillStyle = glow;
        ctx.fillRect(-70, -10, 140, 40);

        ctx.fillStyle = '#0a1530';
        ctx.fillRect(-44, -4, 88, 12);

        ctx.shadowBlur = 18;
        ctx.shadowColor = '#01cdfe';
        ctx.fillStyle = '#01cdfe';
        ctx.fillRect(-40, -22, 80, 22);
        ctx.shadowBlur = 0;

        ctx.fillStyle = '#062a4d';
        ctx.fillRect(-28, -38, 56, 16);
        const glass = ctx.createLinearGradient(0, -36, 0, -22);
        glass.addColorStop(0, '#ff71ce');
        glass.addColorStop(1, '#732858');
        ctx.fillStyle = glass;
        ctx.fillRect(-24, -35, 48, 10);

        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1;
        ctx.strokeRect(-40, -22, 80, 22);
        ctx.strokeRect(-28, -38, 56, 16);

        ctx.fillStyle = '#ff71ce';
        ctx.fillRect(-40, -8, 80, 2);

        ctx.fillStyle = '#fffb96';
        ctx.fillRect(36, -16, 4, 6);
        ctx.fillRect(-40, -16, 4, 6);

        ctx.fillStyle = '#ff0055';
        ctx.fillRect(-36, -2, 8, 4);
        ctx.fillRect(28, -2, 8, 4);

        ctx.fillStyle = '#000';
        ctx.fillRect(-35, 4, 14, 6);
        ctx.fillRect(21, 4, 14, 6);

        ctx.strokeStyle = '#01cdfe';
        ctx.lineWidth = 1;
        for (let i = 0; i < 3; i++) {
            ctx.beginPath();
            ctx.moveTo(-33 + i * 4, 5);
            ctx.lineTo(-33 + i * 4, 9);
            ctx.moveTo(23 + i * 4, 5);
            ctx.lineTo(23 + i * 4, 9);
            ctx.stroke();
        }
        ctx.restore();
    }

    // ---------- move signposts (overhead highway gantry) ----------
    // A truss across the top of the view carries one panel per relative move
    // (◄ ▲ ►), colored by the height delta of that move. Screen-fixed so the
    // three choices are always legible, but drawn as world furniture.

    const GANTRY = { beamY: 46, beamH: 16, postX: 78, panelY: 94, panelW: 104, slotDX: 175 };

    function drawGantryTruss() {
        const g = GANTRY;
        const y0 = g.beamY, y1 = g.beamY + g.beamH;

        // side posts, fading toward the ground
        for (const x of [g.postX, W - g.postX]) {
            const grad = ctx.createLinearGradient(0, y0, 0, HORIZON_Y - 40);
            grad.addColorStop(0, 'rgba(170, 150, 215, 0.95)');
            grad.addColorStop(1, 'rgba(170, 150, 215, 0)');
            ctx.strokeStyle = grad;
            ctx.lineWidth = 5;
            ctx.beginPath();
            ctx.moveTo(x, y0);
            ctx.lineTo(x, HORIZON_Y - 40);
            ctx.stroke();
        }

        // twin chords + X lattice
        ctx.strokeStyle = 'rgba(170, 150, 215, 0.9)';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(g.postX, y0);
        ctx.lineTo(W - g.postX, y0);
        ctx.moveTo(g.postX, y1);
        ctx.lineTo(W - g.postX, y1);
        ctx.stroke();
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(170, 150, 215, 0.55)';
        ctx.beginPath();
        for (let x = g.postX; x + 32 <= W - g.postX; x += 32) {
            ctx.moveTo(x, y0);
            ctx.lineTo(x + 32, y1);
            ctx.moveTo(x + 32, y0);
            ctx.lineTo(x, y1);
        }
        ctx.stroke();

        // marker lights along the beam
        ctx.fillStyle = 'rgba(255, 251, 150, 0.8)';
        for (let x = g.postX; x <= W - g.postX; x += 64) ctx.fillRect(x - 1, y0 - 3, 2, 2);
    }

    function drawSignPanel(cx, sign, glyph) {
        const g = GANTRY;
        const pw = g.panelW, ph = pw * 0.78;
        const px = cx - pw / 2, py = g.panelY;
        const delta = sign.delta;
        const border = delta < 0 ? '#05ffa1' : (delta > 0 ? '#ff2a6d' : '#ff71ce');

        // hanger rods from the beam
        ctx.strokeStyle = 'rgba(170, 150, 215, 0.9)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(cx - pw * 0.3, g.beamY + g.beamH);
        ctx.lineTo(cx - pw * 0.3, py);
        ctx.moveTo(cx + pw * 0.3, g.beamY + g.beamH);
        ctx.lineTo(cx + pw * 0.3, py);
        ctx.stroke();

        // panel
        ctx.save();
        ctx.shadowBlur = 12 + Math.abs(delta) * 4;
        ctx.shadowColor = border;
        const grad = ctx.createLinearGradient(0, py, 0, py + ph);
        grad.addColorStop(0, '#1b0e3e');
        grad.addColorStop(1, '#0b0524');
        ctx.fillStyle = grad;
        roundedRect(px, py, pw, ph, pw * 0.08);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = border;
        ctx.lineWidth = Math.max(1.5, pw * 0.028);
        ctx.stroke();
        ctx.restore();

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // key hint strip
        ctx.fillStyle = '#fffb96';
        ctx.font = `${Math.round(pw * 0.13)}px "Press Start 2P", monospace`;
        ctx.fillText(glyph, px + pw / 2, py + ph * 0.17);

        // generator label (inverses get a superscript)
        const inverse = sign.label === 'A' || sign.label === 'B';
        const letter = sign.label.toLowerCase();
        ctx.fillStyle = '#ffffff';
        ctx.font = `${Math.round(pw * 0.3)}px "Press Start 2P", monospace`;
        if (inverse) {
            ctx.fillText(letter, px + pw * 0.4, py + ph * 0.5);
            ctx.font = `${Math.round(pw * 0.14)}px "Press Start 2P", monospace`;
            ctx.fillText('-1', px + pw * 0.68, py + ph * 0.38);
        } else {
            ctx.fillText(letter, px + pw / 2, py + ph * 0.5);
        }

        // height delta row
        ctx.font = `${Math.round(pw * 0.15)}px "Press Start 2P", monospace`;
        ctx.fillStyle = border;
        const deltaText = delta < 0 ? `▼${-delta}` : (delta > 0 ? `▲${delta}` : '0');
        ctx.fillText(deltaText, px + pw / 2, py + ph * 0.8);
    }

    function drawSigns() {
        if (!game.signs) return;
        drawGantryTruss();
        drawSignPanel(W / 2 - GANTRY.slotDX, game.signs.left, '◄');
        drawSignPanel(W / 2, game.signs.up, '▲');
        drawSignPanel(W / 2 + GANTRY.slotDX, game.signs.right, '►');
    }

    // ---------- victory screen ----------

    let victoryScrollX = W;

    function resetVictoryScroll() {
        victoryScrollX = W;
    }

    function drawVictory() {
        ctx.fillStyle = '#050011';
        ctx.fillRect(0, 0, W, H);

        const time = performance.now() / 1000;
        for (let i = 0; i < 50; i++) {
            const x = (i * 123.456) % W;
            const y = (i * 789.012 + time * 50) % H;
            ctx.fillStyle = `hsl(${(i * 30 + time * 50) % 360}, 100%, 70%)`;
            ctx.shadowBlur = 10;
            ctx.shadowColor = ctx.fillStyle;
            ctx.fillRect(x, y, (i % 3) + 1, (i % 3) + 1);
        }
        ctx.shadowBlur = 0;

        ctx.save();
        ctx.font = 'bold 64px "Press Start 2P", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const pulse = 1 + Math.sin(time * 3) * 0.1;
        ctx.translate(W / 2, H / 3);
        ctx.scale(pulse, pulse);
        const grad = ctx.createLinearGradient(-200, 0, 200, 0);
        grad.addColorStop(0, '#ff71ce');
        grad.addColorStop(0.5, '#01cdfe');
        grad.addColorStop(1, '#05ffa1');
        ctx.fillStyle = grad;
        ctx.shadowBlur = 30;
        ctx.shadowColor = '#ff71ce';
        ctx.fillText('VICTORY!', 0, 0);
        ctx.restore();

        const word = game.history.join(' ');
        ctx.font = '24px "Press Start 2P", monospace';
        const wordWidth = ctx.measureText(word).width;
        victoryScrollX -= 3;
        if (victoryScrollX < -wordWidth - 100) victoryScrollX = W;
        ctx.fillStyle = '#fffb96';
        ctx.shadowBlur = 15;
        ctx.shadowColor = '#fffb96';
        ctx.textAlign = 'left';
        ctx.fillText(word, victoryScrollX, H / 2 + 50);
        ctx.shadowBlur = 0;

        ctx.font = '20px "Press Start 2P", monospace';
        ctx.fillStyle = '#01cdfe';
        ctx.textAlign = 'center';
        ctx.fillText('Winning Matrix:', W / 2, H - 280);

        const [a, b, c, d] = game.current.factored().entries;
        const maxLen = Math.max(a.length, b.length, c.length, d.length);
        const fontSize = Math.max(10, Math.min(28, Math.floor(280 / maxLen)));
        const rowHeight = Math.max(20, fontSize + 5);
        const colGap = fontSize;

        ctx.font = `${fontSize}px "Press Start 2P", monospace`;
        const leftW = Math.max(ctx.measureText(a).width, ctx.measureText(c).width);
        const rightW = Math.max(ctx.measureText(b).width, ctx.measureText(d).width);
        const matrixWidth = leftW + colGap + rightW;
        const parenSize = Math.max(40, (rowHeight * 2 + fontSize) * 1.2);

        ctx.save();
        ctx.translate(W / 2, H - 160);
        ctx.font = `${parenSize}px "Press Start 2P", monospace`;
        ctx.fillStyle = '#ff71ce';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('(', -(matrixWidth / 2 + fontSize), 0);
        ctx.fillText(')', matrixWidth / 2 + fontSize, 0);

        ctx.font = `${fontSize}px "Press Start 2P", monospace`;
        ctx.fillStyle = '#fffb96';
        ctx.textAlign = 'right';
        ctx.fillText(a, -colGap / 2, -rowHeight);
        ctx.fillText(c, -colGap / 2, rowHeight);
        ctx.textAlign = 'left';
        ctx.fillText(b, colGap / 2, -rowHeight);
        ctx.fillText(d, colGap / 2, rowHeight);
        ctx.restore();

        ctx.font = '14px "Press Start 2P", monospace';
        ctx.fillStyle = '#05ffa1';
        ctx.textAlign = 'center';
        ctx.fillText('Press R to restart', W / 2, H - 50);
    }

    // ---------- main frame ----------

    function frame() {
        ctx.fillStyle = '#050011';
        ctx.fillRect(0, 0, W, H);

        if (game.hasWon) {
            drawVictory();
            requestAnimationFrame(frame);
            return;
        }

        cosY = Math.cos(camera.yaw);
        sinY = Math.sin(camera.yaw);
        cosP = Math.cos(camera.pitch);
        sinP = Math.sin(camera.pitch);

        const time = performance.now() / 1000;
        const progress = game.history.length + game.moveProgress;

        drawBackground(progress, time);
        drawGrid(progress);

        // Animation transform: slide the world from the pre-move view to the
        // post-move view by interpolating the last generator toward identity.
        let animT = LRMath.IDENTITY_C;
        if (game.isMoving && game.lastMoveLabel) {
            const g = LRMath.GEN[game.lastMoveLabel].toComplex();
            const t = game.moveProgress;
            const lerp = (from, to) => LRMath.C(from + (to - from) * t);
            animT = {
                a: lerp(g.a.re, 1), b: lerp(g.b.re, 0),
                c: lerp(g.c.re, 0), d: lerp(g.d.re, 1)
            };
        }

        // Place every node: cached relative matrix -> anim Möbius -> disk -> screen
        const placed = new Map();
        for (const node of game.graph.nodes) {
            const finalC = LRMath.composeC(animT, node.relC);
            const z = LRMath.nodeDiskPos(finalC);
            placed.set(node.key, {
                z,
                proj: project(z.re, z.im, node.height),
                height: node.height,
                hyp: Math.max(0, 1 - z.absSq())
            });
        }

        drawScenery(progress, time);
        drawSupports(placed.values());

        // roads, far to near
        const edges = [];
        for (const e of game.graph.edges) {
            const p1 = placed.get(e.from.key), p2 = placed.get(e.to.key);
            if (p1.proj.depth > 0.12 || p2.proj.depth > 0.12) {
                edges.push({ p1, p2, depth: (p1.proj.depth + p2.proj.depth) / 2 });
            }
        }
        edges.sort((x, y) => y.depth - x.depth);
        const dashPhase = (progress * 1.5) % 1;
        for (const e of edges) drawRoad(e.p1, e.p2, dashPhase);

        drawNodePads(placed.values(), time);

        const carProj = project(0, 0, game.heightValue);
        if (carProj.depth > 0.1) drawCar(carProj.x, carProj.y, carProj.scale, time);
        else drawCar(W / 2, H - 100, 600, time);

        if (!game.isMoving) drawSigns();

        requestAnimationFrame(frame);
    }

    function start(gameState) {
        game = gameState;
        canvas = document.getElementById('gameCanvas');
        ctx = canvas.getContext('2d');

        const dpr = window.devicePixelRatio || 1;
        canvas.width = W * dpr;
        canvas.height = H * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        attachCameraControls();
        requestAnimationFrame(frame);
    }

    return { start, resetVictoryScroll, W, H };
})();
