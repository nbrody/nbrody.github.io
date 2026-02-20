(() => {
    'use strict';
    const PI = Math.PI, TAU = 2 * PI;
    const $ = id => document.getElementById(id);

    let n = 6, vectors = [], tiles = [], currentWord = [], flipCount = 0, animating = false;
    let vx = 0, vy = 0, vs = 1, dragging = false, dsx = 0, dsy = 0, dvx = 0, dvy = 0;
    const canvas = $('zonotope-canvas'), ctx = canvas.getContext('2d');
    let dpr = 1, flippableVerts = [], flipAnim = null, onFlipDone = null, pathAnimActive = false, hoveredVert = null;

    // Morph state: 0 = full tiling, 1 = full arc diagram
    let morphProgress = 0;
    let morphTarget = 0;
    let morphAnim = null;

    // Offscreen canvas for blending
    const arcCanvas = document.createElement('canvas');
    const arcCtx = arcCanvas.getContext('2d');

    function strandHue(k) { return (k / n) * 330 + 30; }

    function tileHSL(i, j) {
        const mode = $('color-mode').value;
        const a = Math.min(i, j), b = Math.max(i, j);
        const k = a * (2 * n - a - 1) / 2 + (b - a - 1);
        if (mode === 'monochrome') return [230, 12, 25 + (k % 5) * 8];
        if (mode === 'depth') {
            const t = (b - a) / (n - 1);
            return [210 + t * 140, 45 + t * 30, 28 + t * 18];
        }
        const h = (k / (n * (n - 1) / 2)) * 330 + 195;
        return [h % 360, 55 + 15 * Math.sin(k * 1.2), 34 + 8 * Math.cos(k * 0.7)];
    }

    function tileColor(i, j, alpha = 1) {
        const [h, s, l] = tileHSL(i, j);
        return `hsla(${h}, ${s}%, ${l * (($('show-walls').checked || $('show-zones').checked) ? 0.8 : 1)}%, ${alpha})`;
    }
    function tileColorBright(i, j) {
        const [h, s, l] = tileHSL(i, j);
        return `hsl(${h}, ${Math.min(95, s + 20)}%, ${Math.min(70, l + 20)}%)`;
    }

    function computeVectors() {
        vectors = [];
        for (let k = 0; k < n; k++) vectors.push([Math.cos(PI * k / n), Math.sin(PI * k / n)]);
    }

    function topWord() {
        const w = [];
        for (let k = 0; k < n - 1; k++) for (let j = k; j >= 0; j--) w.push(j);
        return w;
    }
    function bottomWord() {
        const w = [];
        for (let k = n - 2; k >= 0; k--) for (let j = k; j <= n - 2; j++) w.push(j);
        return w;
    }

    function computeTiles(w) {
        currentWord = [...w];
        const res = [], wireAt = Array.from({ length: n }, (_, i) => i);
        let cx = 0, cy = 0; for (let k = 0; k < n; k++) { cx += vectors[k][0]; cy += vectors[k][1]; }
        cx /= 2; cy /= 2;
        const front = new Array(n + 1); front[0] = [-cx, -cy];
        for (let k = 0; k < n; k++) front[k + 1] = [front[k][0] + vectors[wireAt[k]][0], front[k][1] + vectors[wireAt[k]][1]];
        for (const s of w) {
            const a = wireAt[s], b = wireAt[s + 1], f = front[s];
            const va = vectors[a], vb = vectors[b];
            res.push({ i: Math.min(a, b), j: Math.max(a, b), verts: [[f[0], f[1]], [f[0] + va[0], f[1] + va[1]], [f[0] + va[0] + vb[0], f[1] + va[1] + vb[1]], [f[0] + vb[0], f[1] + vb[1]]] });
            front[s + 1] = [f[0] + vb[0], f[1] + vb[1]];
            wireAt[s] = b; wireAt[s + 1] = a;
        }
        return res;
    }

    function vkey(x, y) { return `${Math.round(x * 2000)},${Math.round(y * 2000)}`; }
    function detectFillType(V, threeTiles, dirs) {
        let count = 0;
        for (const d of dirs) {
            const vd = vectors[d], tx = V[0] + vd[0], ty = V[1] + vd[1];
            for (const t of threeTiles) for (const p of t.verts) if (Math.abs(p[0] - tx) < 0.005 && Math.abs(p[1] - ty) < 0.005) { count++; break; }
        }
        return count === 3 ? 'A' : 'B';
    }

    function findFlippable(list) {
        const res = [], vMap = new Map();
        for (let ti = 0; ti < list.length; ti++) for (const v of list[ti].verts) {
            const k = vkey(v[0], v[1]); if (!vMap.has(k)) vMap.set(k, new Set()); vMap.get(k).add(ti);
        }
        let bx = 0, by = 0; for (let k = 0; k < n; k++) { bx -= vectors[k][0] / 2; by -= vectors[k][1] / 2; }
        const bv = new Set();
        for (let k = 0; k < n; k++) { bv.add(vkey(bx, by)); bx += vectors[k][0]; by += vectors[k][1]; }
        for (let k = 0; k < n; k++) { bv.add(vkey(bx, by)); bx -= vectors[k][0]; by -= vectors[k][1]; }
        for (const [key, tSet] of vMap) {
            if (bv.has(key)) continue;
            const unique = [...tSet]; if (unique.length !== 3) continue;
            const dSet = new Set(); for (const ti of unique) { dSet.add(list[ti].i); dSet.add(list[ti].j); }
            if (dSet.size !== 3) continue;
            const d = [...dSet].sort((a, b) => a - b), pts = key.split(','), px = parseFloat(pts[0]) / 2000, py = parseFloat(pts[1]) / 2000;
            res.push({ x: px, y: py, key, tileIndices: unique, dirs: d, fillType: detectFillType([px, py], unique.map(ti => list[ti]), d) });
        }
        return res;
    }

    function computeFlipResult(V, threeTiles) {
        const vk = vkey(V[0], V[1]), bnd = new Map();
        for (const t of threeTiles) for (const p of t.verts) if (vkey(p[0], p[1]) !== vk) bnd.set(vkey(p[0], p[1]), p);
        const P = [...bnd.values()];
        let mx = 0, my = 0; for (const p of P) { mx += p[0]; my += p[1]; } mx /= 6; my /= 6;
        P.sort((a, b) => Math.atan2(a[1] - my, a[0] - mx) - Math.atan2(b[1] - my, b[0] - mx));
        const isN = new Array(6).fill(false);
        for (const t of threeTiles) for (let i = 0; i < 4; i++) {
            const c = t.verts[i]; if (Math.abs(c[0] - V[0]) > 0.005 || Math.abs(c[1] - V[1]) > 0.005) continue;
            const n1 = t.verts[(i + 1) % 4], n2 = t.verts[(i + 3) % 4];
            for (let bi = 0; bi < 6; bi++) {
                if (Math.abs(P[bi][0] - n1[0]) < 0.005 && Math.abs(P[bi][1] - n1[1]) < 0.005) isN[bi] = true;
                if (Math.abs(P[bi][0] - n2[0]) < 0.005 && Math.abs(P[bi][1] - n2[1]) < 0.005) isN[bi] = true;
            }
        }
        let off = 0; for (let i = 0; i < 6; i++) if (isN[i] && !isN[(i + 5) % 6]) { off = i; break; }
        const SortedP = []; for (let i = 0; i < 6; i++) SortedP.push(P[(i + off) % 6]);
        const Vp = [SortedP[0][0] + SortedP[3][0] - V[0], SortedP[0][1] + SortedP[3][1] - V[1]];
        const newTiles = [];
        for (let k = 0; k < 3; k++) {
            const p1 = SortedP[(2 * k + 5) % 6], p2 = SortedP[2 * k], p3 = SortedP[2 * k + 1], p4 = Vp;
            const e1 = [p2[0] - p1[0], p2[1] - p1[1]], e2 = [p3[0] - p2[0], p3[1] - p2[1]];
            let ti = -1, tj = -1;
            for (let d = 0; d < n; d++) {
                const vk = vectors[d];
                if (Math.abs(e1[0] * vk[1] - e1[1] * vk[0]) < 0.001 && (e1[0] * vk[0] + e1[1] * vk[1]) !== 0) { if (ti < 0) ti = d; else tj = d; }
                if (Math.abs(e2[0] * vk[1] - e2[1] * vk[0]) < 0.001 && (e2[0] * vk[0] + e2[1] * vk[1]) !== 0) { if (ti < 0) ti = d; else if (tj < 0 && d !== ti) tj = d; }
            }
            if (ti > tj) [ti, tj] = [tj, ti];
            newTiles.push({ i: ti, j: tj, verts: [p1, p2, p3, p4] });
        }
        return { newTiles, center: [(V[0] + Vp[0]) / 2, (V[1] + Vp[1]) / 2] };
    }

    function performFlip(fv, animate, cb) {
        if (animating) return;
        const { newTiles, center } = computeFlipResult([fv.x, fv.y], fv.tileIndices.map(ti => tiles[ti]));
        if (animate) {
            animating = true;
            flipAnim = { progress: 0, duration: 450 / parseFloat($('anim-speed').value), oldTiles: fv.tileIndices.map(ti => ({ i: tiles[ti].i, j: tiles[ti].j, verts: tiles[ti].verts })), newTiles, tileIndices: [...fv.tileIndices].sort((a, b) => b - a), center, startTime: performance.now(), fv };
            onFlipDone = cb;
        } else {
            const sorted = [...fv.tileIndices].sort((a, b) => b - a);
            for (const i of sorted) tiles.splice(i, 1);
            tiles.push(...newTiles);
            updateWordOnFlip(fv);
            flipCount++; refreshFlippable(); updateInfo(); if (cb) cb();
        }
    }

    function updateWordOnFlip(fv) {
        const sortedTi = [...fv.tileIndices].sort((a, b) => a - b);
        const s1 = currentWord[sortedTi[0]], s2 = currentWord[sortedTi[1]];
        currentWord[sortedTi[0]] = s2;
        currentWord[sortedTi[1]] = s1;
        currentWord[sortedTi[2]] = s2;
    }

    function finishFlipAnim() {
        if (!flipAnim) return;
        for (const i of flipAnim.tileIndices) tiles.splice(i, 1);
        tiles.push(...flipAnim.newTiles);
        if (flipAnim.fv) updateWordOnFlip(flipAnim.fv);
        flipAnim = null; animating = false; flipCount++; refreshFlippable(); updateInfo();
        if (onFlipDone) { const c = onFlipDone; onFlipDone = null; c(); }
    }

    function randomWord() {
        let w = topWord(); for (let m = 0; m < n * n * 10; m++) {
            const p = Math.floor(Math.random() * (w.length - 1));
            if (p < w.length - 2 && w[p] === w[p + 2] && Math.abs(w[p] - w[p + 1]) === 1) { const a = w[p], b = w[p + 1]; w[p] = b; w[p + 1] = a; w[p + 2] = b; }
            else if (Math.abs(w[p] - w[p + 1]) >= 2) [w[p], w[p + 1]] = [w[p + 1], w[p]];
        }
        return w;
    }

    function refreshFlippable() { flippableVerts = findFlippable(tiles); }
    function updateInfo() {
        $('flip-count').textContent = `Flips: ${flipCount}`;
        $('polygon-info').textContent = `${2 * n}-gon · ${n * (n - 1) / 2} rhombi`;
        if ($('show-zones').checked) {
            const wordStr = currentWord.map(w => `s<sub>${w + 1}</sub>`).join(' ');
            $('tiling-info').innerHTML = `w₀ = ${wordStr}`;
        } else {
            $('tiling-info').textContent = `Flippable: ${flippableVerts.length}`;
        }
    }
    function autoScale() {
        let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
        for (const t of tiles) for (const v of t.verts) { x0 = Math.min(x0, v[0]); x1 = Math.max(x1, v[0]); y0 = Math.min(y0, v[1]); y1 = Math.max(y1, v[1]); }
        const w = x1 - x0 || 1, h = y1 - y0 || 1, cw = canvas.width / dpr, ch = canvas.height / dpr;
        vs = Math.min(cw / (w + 0.3), ch / (h + 0.3)) * 0.82; vx = 0; vy = 0;
    }
    function init(fn) { n = parseInt($('n-param').value); computeVectors(); tiles = computeTiles(fn ? fn() : topWord()); flipCount = 0; refreshFlippable(); updateInfo(); autoScale(); }
    function resize() {
        dpr = window.devicePixelRatio || 1;
        canvas.width = innerWidth * dpr; canvas.height = innerHeight * dpr;
        canvas.style.width = innerWidth + 'px'; canvas.style.height = innerHeight + 'px';
        arcCanvas.width = canvas.width; arcCanvas.height = canvas.height;
    }

    // --- ARC DIAGRAM LAYOUT ---
    // The arc diagram lives in screen space (px).
    // n strands are horizontal lines; each s_i in currentWord is a colored semicircle arc.

    function arcLayout() {
        const W = canvas.width / dpr, H = canvas.height / dpr;
        const padX = 60, padY = 80;
        const strandSpacing = Math.max(28, Math.min(64, (H - 2 * padY) / (n - 1)));
        const totalH = strandSpacing * (n - 1);
        const baseY = H / 2 + totalH / 2;  // strands go upward from baseY

        const totalLetters = currentWord.length || 1;
        const letterSpacing = Math.max(10, Math.min(40, (W - 2 * padX) / (totalLetters + 1)));
        const startX = padX + letterSpacing * 0.5;

        // y position of strand k (k=0 at bottom = strand 1 in 1-indexed)
        const sy = k => baseY - k * strandSpacing;
        const sx = idx => startX + idx * letterSpacing;

        return { W, H, padX, padY, strandSpacing, baseY, totalLetters, letterSpacing, startX, sx, sy };
    }

    function drawArcDiagram(c, alpha) {
        if (currentWord.length === 0) return;
        const { W, H, padX, strandSpacing, baseY, totalLetters, letterSpacing, startX, sx, sy } = arcLayout();

        c.save();
        c.globalAlpha = alpha;

        // Background shimmer gradient
        const bg = c.createLinearGradient(0, 0, 0, H);
        bg.addColorStop(0, `rgba(8,8,30,${alpha})`);
        bg.addColorStop(1, `rgba(15,5,35,${alpha})`);
        if (alpha >= 1) { c.fillStyle = '#08081a'; c.fillRect(0, 0, W, H); }

        // Track strand positions as permutation evolves
        const perm = Array.from({ length: n }, (_, i) => i); // perm[pos] = strand id

        // Pre-pass: collect arc geometry per letter
        const arcs = currentWord.map((s, idx) => {
            const strandLo = perm[s];       // lower strand (smaller index)
            const strandHi = perm[s + 1];   // higher strand
            const yLo = sy(s);
            const yHi = sy(s + 1);
            const cx = sx(idx + 1);
            const cy = (yLo + yHi) / 2;
            const rx = letterSpacing * 0.46;
            const ry = Math.abs(yLo - yHi) / 2;
            const colorIdx = Math.min(strandLo, strandHi);
            // swap in permutation
            [perm[s], perm[s + 1]] = [perm[s + 1], perm[s]];
            return { cx, cy, rx, ry, yLo, yHi, strandLo, strandHi, colorIdx };
        });

        // Draw horizontal strand lines
        for (let k = 0; k < n; k++) {
            const y = sy(k);
            const hue = strandHue(k);
            c.beginPath();
            c.moveTo(padX * 0.4, y);
            c.lineTo(W - padX * 0.4, y);
            c.strokeStyle = `hsla(${hue}, 60%, 50%, 0.22)`;
            c.lineWidth = 1.5;
            c.setLineDash([4, 6]);
            c.stroke();
            c.setLineDash([]);

            // Strand labels on left
            c.fillStyle = `hsla(${hue}, 80%, 70%, 0.85)`;
            c.font = `bold ${Math.min(14, strandSpacing * 0.38)}px Inter, sans-serif`;
            c.textAlign = 'right';
            c.textBaseline = 'middle';
            c.fillText(`${k + 1}`, padX * 0.35, y);

            // Strand labels on right (showing permuted order)
        }

        // Draw strand labels on right (final permutation = reverse)
        const finalPerm = Array.from({ length: n }, (_, i) => i);
        for (const s of currentWord) { [finalPerm[s], finalPerm[s + 1]] = [finalPerm[s + 1], finalPerm[s]]; }
        for (let k = 0; k < n; k++) {
            const y = sy(k);
            const strandId = finalPerm[k];
            const hue = strandHue(strandId);
            c.fillStyle = `hsla(${hue}, 85%, 72%, 0.85)`;
            c.font = `bold ${Math.min(14, strandSpacing * 0.38)}px Inter, sans-serif`;
            c.textAlign = 'left';
            c.textBaseline = 'middle';
            c.fillText(`${strandId + 1}`, W - padX * 0.3, y);
        }

        // Draw arcs (semicircular, above the strands line)
        for (const arc of arcs) {
            const { cx, cy, rx, ry, colorIdx } = arc;
            const hue = strandHue(colorIdx);
            // Glow pass
            c.shadowBlur = 12;
            c.shadowColor = `hsla(${hue}, 90%, 65%, 0.6)`;
            c.beginPath();
            c.ellipse(cx, cy, rx, ry, 0, 0, TAU);
            c.strokeStyle = `hsla(${hue}, 88%, 68%, 0.85)`;
            c.lineWidth = 2.4;
            c.stroke();
            c.shadowBlur = 0;

            // Fill with subtle gradient
            const grad = c.createRadialGradient(cx, cy, 0, cx, cy, Math.max(rx, ry));
            grad.addColorStop(0, `hsla(${hue}, 80%, 55%, 0.18)`);
            grad.addColorStop(1, `hsla(${hue}, 80%, 45%, 0.04)`);
            c.beginPath();
            c.ellipse(cx, cy, rx, ry, 0, 0, TAU);
            c.fillStyle = grad;
            c.fill();

            // Crossing dot
            c.beginPath();
            c.arc(cx, cy, 3.5, 0, TAU);
            c.fillStyle = `hsla(${hue}, 90%, 80%, 0.9)`;
            c.fill();
        }

        // x-axis labels (generator indices below)
        for (let idx = 0; idx < currentWord.length; idx++) {
            const s = currentWord[idx];
            const x = sx(idx + 1);
            const y = baseY + 18;
            c.fillStyle = `hsla(${strandHue(s)}, 75%, 65%, 0.7)`;
            c.font = `${Math.min(11, strandSpacing * 0.28)}px Inter, sans-serif`;
            c.textAlign = 'center';
            c.textBaseline = 'top';
            c.fillText(`s${s + 1}`, x, y);
        }

        // Title label
        c.fillStyle = `rgba(160,170,255,${0.7 * alpha})`;
        c.font = `600 14px Inter, sans-serif`;
        c.textAlign = 'center';
        c.textBaseline = 'bottom';
        c.fillText(`Reduced word for w₀ ∈ S${n}  ·  ${currentWord.length} crossings`, W / 2, H - 12);

        c.restore();
    }

    // ---- TILING DRAW HELPERS ----
    function drawStrands() {
        ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; const lw = 3.8 / vs;
        for (let k = 0; k < n; k++) {
            const vk = vectors[k], hue = strandHue(k); ctx.strokeStyle = `hsla(${hue},85%,65%,0.85)`; ctx.lineWidth = lw; ctx.shadowBlur = 8; ctx.shadowColor = `hsla(${hue},85%,65%,0.4)`;
            for (const t of tiles) {
                if (t.i !== k && t.j !== k) continue;
                const m = []; for (let i = 0; i < 4; i++) {
                    const p1 = t.verts[i], p2 = t.verts[(i + 1) % 4], dx = p2[0] - p1[0], dy = p2[1] - p1[1];
                    if (Math.abs(dx * vk[1] - dy * vk[0]) > 0.01) m.push([(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2]);
                }
                if (m.length >= 2) { ctx.beginPath(); ctx.moveTo(m[0][0], m[0][1]); ctx.lineTo(m[1][0], m[1][1]); ctx.stroke(); }
            }
        }
        ctx.restore();
    }
    function drawSkeleton() {
        ctx.save(); const ed = new Map();
        for (const t of tiles) for (let k = 0; k < 4; k++) {
            const p1 = t.verts[k], p2 = t.verts[(k + 1) % 4], key = [vkey(p1[0], p1[1]), vkey(p2[0], p2[1])].sort().join('|');
            if (!ed.has(key)) ed.set(key, [p1, p2]);
        }
        ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 1.3 / vs;
        for (const [p1, p2] of ed.values()) { ctx.beginPath(); ctx.moveTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); ctx.stroke(); }
        ctx.restore();
    }
    function drawBoundary() {
        let bx = 0, by = 0; for (let k = 0; k < n; k++) { bx -= vectors[k][0] / 2; by -= vectors[k][1] / 2; }
        ctx.beginPath(); ctx.moveTo(bx, by);
        for (let k = 0; k < n; k++) { bx += vectors[k][0]; by += vectors[k][1]; ctx.lineTo(bx, by); }
        for (let k = 0; k < n; k++) { bx -= vectors[k][0]; by -= vectors[k][1]; ctx.lineTo(bx, by); }
        ctx.closePath(); ctx.strokeStyle = 'rgba(110,142,251,0.6)'; ctx.lineWidth = 2.5 / vs; ctx.stroke();
    }

    function renderTiling(alpha) {
        if (alpha <= 0.001) return;
        const W = canvas.width, H = canvas.height;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(W / 2, H / 2); ctx.scale(dpr, dpr); ctx.translate(vx, vy); ctx.scale(vs, -vs);
        const aSet = flipAnim ? new Set(flipAnim.tileIndices) : null;
        for (let i = 0; i < tiles.length; i++) if (!aSet || !aSet.has(i)) {
            const t = tiles[i]; ctx.beginPath(); ctx.moveTo(t.verts[0][0], t.verts[0][1]); ctx.lineTo(t.verts[1][0], t.verts[1][1]); ctx.lineTo(t.verts[2][0], t.verts[2][1]); ctx.lineTo(t.verts[3][0], t.verts[3][1]); ctx.closePath();
            ctx.fillStyle = tileColor(t.i, t.j); ctx.fill();
            ctx.strokeStyle = 'rgba(160,170,255,0.2)'; ctx.lineWidth = 0.8 / vs; ctx.stroke();
        }
        if (flipAnim) {
            const e = flipAnim.progress < 0.5 ? 2 * flipAnim.progress ** 2 : 1 - (-2 * flipAnim.progress + 2) ** 2 / 2;
            const sa = Math.sin(e * PI), ca = Math.cos(e * PI), cx = flipAnim.center[0], cy = flipAnim.center[1];
            for (const t of flipAnim.oldTiles) {
                ctx.beginPath(); for (let i = 0; i < 4; i++) {
                    const dx = t.verts[i][0] - cx, dy = t.verts[i][1] - cy, rx = cx + dx * ca - dy * sa, ry = cy + dx * sa + dy * ca;
                    if (i === 0) ctx.moveTo(rx, ry); else ctx.lineTo(rx, ry);
                }
                ctx.closePath(); ctx.fillStyle = tileColorBright(t.i, t.j); ctx.fill(); ctx.strokeStyle = 'rgba(225,230,255,0.6)'; ctx.lineWidth = 1.8 / vs; ctx.stroke();
            }
        }
        if ($('show-walls').checked) drawStrands();
        if ($('show-zones').checked) drawSkeleton();
        drawBoundary();
        if ($('show-flippable').checked && !animating) {
            for (const f of flippableVerts) {
                const isH = hoveredVert === f, r = (isH ? 8 : 5.5) / vs; ctx.beginPath(); ctx.arc(f.x, f.y, r * 2.5, 0, TAU); ctx.fillStyle = isH ? 'rgba(110,142,251,0.25)' : 'rgba(110,142,251,0.1)'; ctx.fill();
                ctx.beginPath(); ctx.arc(f.x, f.y, r, 0, TAU); ctx.fillStyle = f.fillType === 'A' ? (isH ? 'rgba(130,160,255,1)' : 'rgba(100,135,245,0.85)') : (isH ? 'rgba(255,185,80,1)' : 'rgba(230,160,60,0.85)'); ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1.2 / vs; ctx.stroke();
            }
        }
        ctx.restore();
    }

    function render() {
        const W = canvas.width, H = canvas.height;
        ctx.fillStyle = '#08081a'; ctx.fillRect(0, 0, W, H);
        const g = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.5);
        g.addColorStop(0, 'rgba(60,50,120,0.1)'); g.addColorStop(1, 'rgba(8,8,26,0)');
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

        // Ease the morph
        const mp = morphProgress;

        // Draw tiling (fades out as mp -> 1)
        const tilingAlpha = mp < 0.5 ? 1 : 1 - (mp - 0.5) * 2;
        renderTiling(tilingAlpha);

        // Draw arc diagram (fades in as mp -> 1)
        if (mp > 0.01) {
            const arcAlpha = mp < 0.5 ? mp * 2 : 1;
            // Draw arc diagram directly into ctx (screen space, no transform needed)
            ctx.save();
            drawArcDiagram(ctx, arcAlpha);
            ctx.restore();
        }
    }

    // --- MORPH ANIMATION ---
    function startMorph(toArc) {
        morphTarget = toArc ? 1 : 0;
        morphAnim = { startTime: null, from: morphProgress, to: morphTarget, duration: 700 };
        $('arc-btn').textContent = toArc ? '⊞ Show Tiling' : '⌒ Arc Diagram';
    }

    function updateMorph(now) {
        if (!morphAnim) return;
        if (!morphAnim.startTime) morphAnim.startTime = now;
        const t = Math.min(1, (now - morphAnim.startTime) / morphAnim.duration);
        // ease in-out cubic
        const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        morphProgress = morphAnim.from + (morphAnim.to - morphAnim.from) * e;
        if (t >= 1) { morphProgress = morphAnim.to; morphAnim = null; }
    }

    // --- PATH ANIMATION ---
    let pathFlipType = null;
    function startPath() {
        stopPath(); init(); if (flippableVerts.length === 0) return;
        pathFlipType = flippableVerts[0].fillType; pathAnimActive = true; $('animate-path-btn').textContent = '⏹ Stop';
        $('top-btn').disabled = $('bottom-btn').disabled = $('random-btn').disabled = $('n-param').disabled = true;
        setTimeout(pathStep, 300);
    }
    function pathStep() {
        if (!pathAnimActive) return;
        const targets = flippableVerts.filter(v => v.fillType === pathFlipType);
        if (targets.length === 0) { stopPath(); return; }
        targets.sort((a, b) => (a.x * a.x + a.y * a.y) - (b.x * b.x + b.y * b.y));
        performFlip(targets[0], true, () => { if (pathAnimActive) setTimeout(pathStep, Math.max(50, 200 / parseFloat($('anim-speed').value))); });
    }
    function stopPath() { pathAnimActive = false; $('animate-path-btn').textContent = '▶ Animate Top → Bottom'; $('top-btn').disabled = $('bottom-btn').disabled = $('random-btn').disabled = $('n-param').disabled = false; }

    function screenToWorld(sx, sy) {
        const r = canvas.getBoundingClientRect(); let wx = sx - r.left - r.width / 2 - vx, wy = sy - r.top - r.height / 2 - vy;
        return [wx / vs, wy / -vs];
    }
    canvas.addEventListener('mousedown', e => { if (morphProgress > 0.5) return; dragging = true; dsx = e.clientX; dsy = e.clientY; dvx = vx; dvy = vy; });
    canvas.addEventListener('mousemove', e => {
        if (morphProgress > 0.5) { hoveredVert = null; return; }
        if (dragging) { vx = dvx + e.clientX - dsx; vy = dvy + e.clientY - dsy; return; }
        if (animating) { hoveredVert = null; return; }
        const [wx, wy] = screenToWorld(e.clientX, e.clientY); let best = null, dMin = 12 / vs;
        for (const f of flippableVerts) { const d = Math.hypot(f.x - wx, f.y - wy); if (d < dMin) { dMin = d; best = f; } }
        hoveredVert = best; canvas.style.cursor = best ? 'pointer' : 'crosshair';
    });
    canvas.addEventListener('mouseup', e => {
        const drag = Math.abs(e.clientX - dsx) > 3 || Math.abs(e.clientY - dsy) > 3; dragging = false;
        if (morphProgress > 0.5) return;
        if (!drag && !animating) { const [wx, wy] = screenToWorld(e.clientX, e.clientY); let b = null, dm = 12 / vs; for (const f of flippableVerts) { const d = Math.hypot(f.x - wx, f.y - wy); if (d < dm) { dm = d; b = f; } } if (b) performFlip(b, true); }
    });
    canvas.addEventListener('wheel', e => {
        if (morphProgress > 0.5) return;
        e.preventDefault(); const f = e.deltaY > 0 ? 0.9 : 1.1, old = vs; vs = Math.max(0.1, Math.min(300, vs * f));
        const r = canvas.getBoundingClientRect(), cx = e.clientX - r.left - r.width / 2, cy = e.clientY - r.top - r.height / 2;
        vx = cx - (cx - vx) * (vs / old); vy = cy - (cy - vy) * (vs / old);
    }, { passive: false });

    $('n-param').addEventListener('input', () => { $('n-val').textContent = $('n-param').value; stopPath(); init(); });
    $('top-btn').addEventListener('click', () => { stopPath(); init(topWord); });
    $('bottom-btn').addEventListener('click', () => { stopPath(); init(bottomWord); });
    $('random-btn').addEventListener('click', () => { stopPath(); init(randomWord); });
    $('anim-speed').addEventListener('input', () => $('speed-val').textContent = parseFloat($('anim-speed').value).toFixed(1) + '×');
    $('animate-path-btn').addEventListener('click', () => { if (pathAnimActive) stopPath(); else startPath(); });
    $('controls-toggle').addEventListener('click', () => $('controls-panel').classList.toggle('hidden'));
    $('show-zones').addEventListener('change', updateInfo);
    $('show-walls').addEventListener('change', () => { });
    $('arc-btn').addEventListener('click', () => { startMorph(morphTarget < 0.5); });

    window.addEventListener('resize', () => { resize(); autoScale(); });
    resize(); init();
    requestAnimationFrame(function L(t) {
        updateMorph(t);
        if (flipAnim) {
            flipAnim.progress = Math.min(1, (t - flipAnim.startTime) / flipAnim.duration);
            if (flipAnim.progress >= 1) finishFlipAnim();
        }
        render();
        requestAnimationFrame(L);
    });
})();
