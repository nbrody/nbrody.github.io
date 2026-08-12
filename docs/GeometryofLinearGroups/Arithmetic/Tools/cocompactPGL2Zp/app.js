(function () {
    'use strict';

    const elements = {
        prime: document.getElementById('primeInput'),
        family: document.getElementById('familyInput'),
        view: document.getElementById('viewInput'),
        apply: document.getElementById('applyButton'),
        validation: document.getElementById('validationMessage'),
        tiling: document.getElementById('tilingInput'),
        labels: document.getElementById('labelsInput'),
        reset: document.getElementById('resetViewButton'),
        play: document.getElementById('playButton'),
        glue: document.getElementById('glueInput'),
        glueValue: document.getElementById('glueValue'),
        canvas: document.getElementById('geometryCanvas'),
        conjugatorSummary: document.getElementById('conjugatorSummary'),
        conjugatorContext: document.getElementById('conjugatorContext'),
        traceSummary: document.getElementById('traceSummary'),
        lengthSummary: document.getElementById('lengthSummary'),
        marginSummary: document.getElementById('marginSummary'),
        certificateSummary: document.getElementById('certificateSummary'),
        gammaBadge: document.getElementById('gammaBadge'),
        wordA: document.getElementById('wordA'),
        wordB: document.getElementById('wordB'),
        wordH: document.getElementById('wordH'),
        matrixA: document.getElementById('matrixA'),
        matrixB: document.getElementById('matrixB'),
        matrixH: document.getElementById('matrixH'),
        conjugacyCheck: document.getElementById('conjugacyCheck'),
        congruenceCheck: document.getElementById('congruenceCheck'),
        axisCheck: document.getElementById('axisCheck'),
        certificateBadge: document.getElementById('certificateBadge'),
        inequality: document.getElementById('inequalityText'),
        boundBar: document.getElementById('boundBar'),
        marginBar: document.getElementById('marginBar'),
        certificateDetail: document.getElementById('certificateDetail'),
        visualEyebrow: document.getElementById('visualEyebrow'),
        visualTitle: document.getElementById('visualTitle'),
        visualCaption: document.getElementById('visualCaption'),
        endpointsA: document.getElementById('endpointsA'),
        endpointsB: document.getElementById('endpointsB'),
        scalingDetail: document.getElementById('scalingDetail'),
        uniformDetail: document.getElementById('uniformDetail')
    };

    const ctx = elements.canvas.getContext('2d');
    const superscripts = { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };
    const state = {
        model: null,
        width: 0,
        height: 0,
        scale: 1,
        offsetX: 0,
        baseline: 0,
        dragging: false,
        dragDistance: 0,
        lastX: 0,
        lastY: 0,
        glueT: 0,
        animationId: 0,
        animationStart: 0,
        colors: {}
    };

    function isPrime(n) {
        if (!Number.isInteger(n) || n < 2) return false;
        if (n % 2 === 0) return n === 2;
        for (let d = 3; d * d <= n; d += 2) {
            if (n % d === 0) return false;
        }
        return true;
    }

    function gcd(a, b) {
        a = Math.abs(a);
        b = Math.abs(b);
        while (b) [a, b] = [b, a % b];
        return a;
    }

    function superscript(value) {
        return String(value).split('').map(ch => superscripts[ch] || ch).join('');
    }

    function word(a, b) {
        const r = a === 1 ? 'R' : `R${superscript(a)}`;
        const l = b === 1 ? 'L' : `L${superscript(b)}`;
        return `${r} ${l}`;
    }

    function familyParameters(p, family) {
        if (family === 'all-prime') {
            return {
                q: p * p,
                a: 1,
                b: 4 * p * p * p,
                context: 'uniform p² scaling; certified for every odd prime',
                shortName: 'uniform all-prime p² family'
            };
        }

        if (p === 3) {
            return {
                q: 9,
                a: 1,
                b: 108,
                context: 'p = 3 fallback uses the square of diag(3, 1)',
                shortName: 'p = 3 fallback'
            };
        }

        const multiplier = family === 'uniform' ? 6 : (p === 5 ? 6 : 2);
        return {
            q: p,
            a: 1,
            b: multiplier * p * p,
            context: family === 'uniform'
                ? 'uniform square-root family for p ≥ 5'
                : (p === 5 ? 'minimal certified p = 5 exception' : 'smallest CL-certified square-root family'),
            shortName: family === 'uniform' ? 'uniform square-root family' : 'smallest certified family'
        };
    }

    function axisEndpoints(a, b) {
        const positive = (a / 2) * (1 + Math.sqrt(1 + 4 / (a * b)));
        const negative = -a / (b * positive);
        return [negative, positive];
    }

    function buildModel(p, family) {
        const params = familyParameters(p, family);
        const { q, a, b } = params;
        const aB = q * a;
        const bB = b / q;
        const trace = 2 + a * b;
        const length = 2 * Math.acosh(trace / 2);
        const endpointsA = axisEndpoints(a, b);
        const endpointsB = endpointsA.map(x => q * x);

        const directN = aB;
        const directPrime = a + b + bB;
        const directBound = 3 * directPrime + 25;
        const dualN = b;
        const dualPrime = a + bB + aB;
        const dualBound = 3 * dualPrime + 25;
        const directMargin = directN - directBound;
        const dualMargin = dualN - dualBound;
        const certificate = dualMargin >= directMargin
            ? { mode: 'dual', N: dualN, NPrime: dualPrime, bound: dualBound, margin: dualMargin }
            : { mode: 'direct', N: directN, NPrime: directPrime, bound: directBound, margin: directMargin };

        return {
            p,
            family,
            q,
            a,
            b,
            aB,
            bB,
            trace,
            length,
            endpointsA,
            endpointsB,
            certificate,
            params,
            matrixA: [[1 + a * b, a], [b, 1]],
            matrixB: [[1 + aB * bB, aB], [bB, 1]],
            matrixH: [[q, 0], [0, 1]]
        };
    }

    function formatNumber(value, digits = 4) {
        if (Math.abs(value) >= 10000) return value.toExponential(3);
        if (Math.abs(value) >= 100) return value.toFixed(2).replace(/\.00$/, '');
        return value.toFixed(digits).replace(/0+$/, '').replace(/\.$/, '');
    }

    function renderMatrix(element, matrix) {
        element.replaceChildren();
        matrix.flat().forEach(value => {
            const cell = document.createElement('span');
            cell.textContent = value.toLocaleString('en-US');
            element.appendChild(cell);
        });
    }

    function updateText(model) {
        const { p, q, a, b, aB, bB, certificate } = model;
        const isSquareRoot = q === p;
        elements.conjugatorSummary.textContent = `h${subscriptText(p)} = diag(${q}, 1)`;
        elements.conjugatorContext.textContent = model.params.context;
        elements.traceSummary.textContent = model.trace.toLocaleString('en-US');
        elements.lengthSummary.textContent = `translation length ${model.length.toFixed(3)}`;
        elements.marginSummary.textContent = certificate.margin >= 0 ? `+${certificate.margin}` : `${certificate.margin}`;
        elements.certificateSummary.textContent = certificate.mode === 'dual'
            ? 'S-dual R-block certificate'
            : 'direct R-block certificate';
        elements.gammaBadge.textContent = `Γ₀(${2 * p})`;
        elements.wordA.textContent = word(a, b);
        elements.wordB.textContent = word(aB, bB);
        elements.wordH.textContent = `z ↦ ${q}z`;
        renderMatrix(elements.matrixA, model.matrixA);
        renderMatrix(elements.matrixB, model.matrixB);
        renderMatrix(elements.matrixH, model.matrixH);
        elements.conjugacyCheck.textContent = `h${subscriptText(p)} A${subscriptText(p)} h${subscriptText(p)}⁻¹ = B${subscriptText(p)}`;
        elements.congruenceCheck.textContent = `c(A), c(B) ≡ 0 mod ${2 * p}`;
        elements.axisCheck.textContent = `Ax(B) = ${q} · Ax(A)`;

        const certified = certificate.margin >= 0;
        elements.certificateBadge.textContent = certified ? 'certified' : 'not certified';
        elements.certificateBadge.className = `badge ${certified ? 'success' : 'failure'}`;
        elements.inequality.textContent = `${certificate.N.toLocaleString()} ≥ 3(${certificate.NPrime.toLocaleString()}) + 25 = ${certificate.bound.toLocaleString()}`;
        const total = Math.max(certificate.N, certificate.bound, 1);
        const boundPct = Math.min(100, (certificate.bound / total) * 100);
        elements.boundBar.style.width = `${boundPct}%`;
        elements.marginBar.style.width = `${Math.max(0, 100 - boundPct)}%`;
        elements.marginBar.style.display = certificate.margin >= 0 ? 'block' : 'none';

        if (certificate.mode === 'dual') {
            elements.certificateDetail.textContent = `Conjugating [B] − [A] by S produces the dominant block R${superscript(b)} in R${superscript(b)}L${a === 1 ? '' : superscript(a)}; all remaining block lengths sum to ${certificate.NPrime}.`;
        } else {
            elements.certificateDetail.textContent = `In B = R${superscript(aB)}L${superscript(bB)}, the R-block has length ${certificate.N}; all remaining block lengths sum to ${certificate.NPrime}.`;
        }

        elements.endpointsA.textContent = model.endpointsA.map(x => formatNumber(x, 6)).join(', ');
        elements.endpointsB.textContent = model.endpointsB.map(x => formatNumber(x, 6)).join(', ');
        elements.scalingDetail.textContent = `x ↦ ${q}x`;
        const uniformN = 4 * p * p * p;
        const uniformNPrime = p * p + 4 * p + 1;
        const uniformBound = 3 * uniformNPrime + 25;
        const uniformMargin = uniformN - uniformBound;
        elements.uniformDetail.textContent = `For p = ${p}, the uniform certificate is ${uniformN.toLocaleString()} ≥ 3(${uniformNPrime.toLocaleString()}) + 25 = ${uniformBound.toLocaleString()} (margin +${uniformMargin.toLocaleString()}). The formula works for every odd prime; the square-root family works from p = 5.`;

        if (elements.view.value === 'log') {
            elements.visualEyebrow.textContent = 'Logarithmic coordinates w = log z';
            elements.visualTitle.textContent = 'The side-pairing becomes a translation';
            elements.visualCaption.innerHTML = `In logarithmic coordinates, h<sub>p</sub> is the translation u ↦ u + log(${q}). The region between the two curves is a fundamental strip for ⟨h<sub>p</sub>⟩; the final lattice domain still depends on the marked compact core H<sub>p</sub>.`;
        } else {
            elements.visualEyebrow.textContent = 'Exact upper-half-plane geometry';
            elements.visualTitle.textContent = 'Nested axes and the paired strip';
            elements.visualCaption.innerHTML = `The shaded region is the exact strip between one axis and its h<sub>p</sub>-translate. It is a fundamental strip for ⟨h<sub>p</sub>⟩, not yet a Dirichlet domain for the final cocompact lattice.`;
        }

        elements.tiling.disabled = elements.view.value === 'log';
        elements.tiling.closest('label').style.opacity = elements.view.value === 'log' ? '0.45' : '1';
        elements.conjugatorContext.textContent += isSquareRoot ? '; h is the projective square root' : '';
    }

    function subscriptText(value) {
        const map = { '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉' };
        return String(value).split('').map(ch => map[ch] || ch).join('');
    }

    function readColors() {
        const css = getComputedStyle(document.documentElement);
        state.colors = {
            ink: css.getPropertyValue('--ink').trim(),
            muted: css.getPropertyValue('--muted').trim(),
            line: css.getPropertyValue('--line').trim(),
            navy: css.getPropertyValue('--navy').trim(),
            orange: css.getPropertyValue('--orange').trim(),
            orangeSoft: css.getPropertyValue('--orange-soft').trim(),
            green: css.getPropertyValue('--green').trim(),
            violet: css.getPropertyValue('--violet').trim()
        };
    }

    function resizeCanvas() {
        const rect = elements.canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        state.width = Math.max(1, Math.floor(rect.width));
        state.height = Math.max(1, Math.floor(rect.height));
        elements.canvas.width = Math.floor(state.width * dpr);
        elements.canvas.height = Math.floor(state.height * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        resetView();
    }

    function resetView() {
        if (!state.model || !state.width || !state.height) return;
        if (elements.view.value === 'log') fitLogView();
        else fitUHPView();
        draw();
    }

    function fitUHPView() {
        const [left, right] = state.model.endpointsB;
        const radius = (right - left) / 2;
        const center = (right + left) / 2;
        const padX = Math.min(72, state.width * 0.09);
        const padTop = 62;
        const padBottom = 35;
        const scaleX = (state.width - 2 * padX) / Math.max(right - left, 0.001);
        const scaleY = (state.height - padTop - padBottom) / Math.max(radius, 0.001);
        state.scale = Math.min(scaleX, scaleY) * 0.94;
        state.offsetX = state.width / 2 - center * state.scale;
        state.baseline = state.height - padBottom;
    }

    function logAxisSamples(scaleFactor, count = 180) {
        const [left, right] = state.model.endpointsA.map(x => x * scaleFactor);
        const center = (left + right) / 2;
        const radius = (right - left) / 2;
        const points = [];
        for (let i = 0; i <= count; i += 1) {
            const theta = Math.PI - (Math.PI * i / count);
            const x = center + radius * Math.cos(theta);
            const y = radius * Math.sin(theta);
            points.push({ x: Math.log(Math.max(1e-14, Math.hypot(x, y))), y: Math.atan2(y, x) });
        }
        return points;
    }

    function fitLogView() {
        const points = [...logAxisSamples(1), ...logAxisSamples(state.model.q)];
        const minX = Math.min(...points.map(p => p.x));
        const maxX = Math.max(...points.map(p => p.x));
        const padX = 58;
        const padY = 48;
        const scaleX = (state.width - 2 * padX) / Math.max(maxX - minX, 0.001);
        const scaleY = (state.height - 2 * padY) / Math.PI;
        state.scale = Math.min(scaleX, scaleY) * 0.96;
        state.offsetX = state.width / 2 - ((minX + maxX) / 2) * state.scale;
        state.baseline = state.height - padY;
    }

    function toCanvas(point) {
        return {
            x: state.offsetX + point.x * state.scale,
            y: state.baseline - point.y * state.scale
        };
    }

    function fromCanvas(x, y) {
        return {
            x: (x - state.offsetX) / state.scale,
            y: (state.baseline - y) / state.scale
        };
    }

    function clearCanvas() {
        const gradient = ctx.createLinearGradient(0, 0, 0, state.height);
        gradient.addColorStop(0, '#dfe9f2');
        gradient.addColorStop(0.62, '#eef0ec');
        gradient.addColorStop(1, '#f7f4ed');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, state.width, state.height);
    }

    function drawArc(left, right, options = {}) {
        if (!Number.isFinite(left) || !Number.isFinite(right) || right <= left) return;
        const center = (left + right) / 2;
        const radius = (right - left) / 2;
        const c = toCanvas({ x: center, y: 0 });
        const radiusPx = radius * state.scale;
        if (radiusPx < 0.25 || radiusPx > 100000) return;
        ctx.save();
        ctx.beginPath();
        ctx.arc(c.x, c.y, radiusPx, Math.PI, 2 * Math.PI);
        ctx.strokeStyle = options.color || state.colors.ink;
        ctx.lineWidth = options.width || 1;
        ctx.globalAlpha = options.alpha === undefined ? 1 : options.alpha;
        if (options.dash) ctx.setLineDash(options.dash);
        ctx.stroke();
        ctx.restore();
    }

    function drawFareyTessellation() {
        if (!elements.tiling.checked) return;
        const leftWorld = fromCanvas(0, state.baseline).x;
        const rightWorld = fromCanvas(state.width, state.baseline).x;
        const lo = Math.floor(Math.min(leftWorld, rightWorld)) - 1;
        const hi = Math.ceil(Math.max(leftWorld, rightWorld)) + 1;
        const range = hi - lo;
        const integerStride = Math.max(1, Math.ceil(range / 150));

        ctx.save();
        ctx.strokeStyle = 'rgba(30, 58, 95, 0.12)';
        ctx.lineWidth = 0.75;
        for (let n = lo; n <= hi; n += integerStride) {
            const p0 = toCanvas({ x: n, y: 0 });
            ctx.beginPath();
            ctx.moveTo(p0.x, p0.y);
            ctx.lineTo(p0.x, Math.max(-20, state.baseline - state.height * 1.4));
            ctx.stroke();
        }
        ctx.restore();

        const maxDen = range > 100 ? 2 : range > 35 ? 3 : 7;
        const fractions = [];
        const hardFractionLimit = 1800;
        for (let den = 1; den <= maxDen && fractions.length < hardFractionLimit; den += 1) {
            const start = Math.floor(lo * den) - 1;
            const end = Math.ceil(hi * den) + 1;
            const stride = Math.max(1, Math.ceil((end - start) / 450));
            for (let num = start; num <= end; num += stride) {
                if (gcd(num, den) === 1) fractions.push({ num, den, value: num / den });
            }
        }

        const seen = new Set();
        let arcs = 0;
        for (const f of fractions) {
            for (let den = 1; den <= maxDen; den += 1) {
                for (const sign of [-1, 1]) {
                    const numerator = f.num * den - sign;
                    if (numerator % f.den !== 0) continue;
                    const otherNum = numerator / f.den;
                    if (gcd(otherNum, den) !== 1) continue;
                    const other = otherNum / den;
                    const x1 = Math.min(f.value, other);
                    const x2 = Math.max(f.value, other);
                    if (x2 < lo || x1 > hi || x2 === x1) continue;
                    const key = `${Math.round(x1 * 1e8)}:${Math.round(x2 * 1e8)}`;
                    if (seen.has(key)) continue;
                    seen.add(key);
                    drawArc(x1, x2, { color: 'rgba(30, 58, 95, 0.13)', width: 0.8 });
                    arcs += 1;
                    if (arcs > 1500) return;
                }
            }
        }
    }

    function drawBand() {
        const outer = state.model.endpointsB;
        const inner = state.model.endpointsA;
        const outerCenter = (outer[0] + outer[1]) / 2;
        const outerRadius = (outer[1] - outer[0]) / 2;
        const innerCenter = (inner[0] + inner[1]) / 2;
        const innerRadius = (inner[1] - inner[0]) / 2;
        const steps = 100;

        ctx.save();
        ctx.beginPath();
        for (let i = 0; i <= steps; i += 1) {
            const theta = Math.PI + Math.PI * i / steps;
            const p = toCanvas({ x: outerCenter + outerRadius * Math.cos(theta), y: -outerRadius * Math.sin(theta) });
            if (i === 0) ctx.moveTo(p.x, p.y);
            else ctx.lineTo(p.x, p.y);
        }
        for (let i = steps; i >= 0; i -= 1) {
            const theta = Math.PI + Math.PI * i / steps;
            const p = toCanvas({ x: innerCenter + innerRadius * Math.cos(theta), y: -innerRadius * Math.sin(theta) });
            ctx.lineTo(p.x, p.y);
        }
        ctx.closePath();
        ctx.fillStyle = 'rgba(30, 58, 95, 0.075)';
        ctx.fill();
        ctx.restore();
    }

    function drawArrow(from, to, color) {
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const length = Math.hypot(dx, dy);
        if (length < 10) return;
        const ux = dx / length;
        const uy = dy / length;
        const head = 8;
        ctx.save();
        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(to.x, to.y);
        ctx.lineTo(to.x - head * ux + head * 0.55 * uy, to.y - head * uy - head * 0.55 * ux);
        ctx.lineTo(to.x - head * ux - head * 0.55 * uy, to.y - head * uy + head * 0.55 * ux);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    }

    function label(text, point, color, align = 'center') {
        if (!elements.labels.checked) return;
        ctx.save();
        ctx.font = '500 12px "IBM Plex Mono", monospace';
        ctx.textAlign = align;
        ctx.textBaseline = 'middle';
        const metrics = ctx.measureText(text);
        const padding = 5;
        const left = align === 'center' ? point.x - metrics.width / 2 : align === 'right' ? point.x - metrics.width : point.x;
        ctx.fillStyle = 'rgba(255, 253, 248, 0.9)';
        ctx.fillRect(left - padding, point.y - 10, metrics.width + 2 * padding, 20);
        ctx.fillStyle = color;
        ctx.fillText(text, point.x, point.y);
        ctx.restore();
    }

    function drawUHP() {
        drawFareyTessellation();
        drawBand();

        const a = state.model.endpointsA;
        const b = state.model.endpointsB;
        const factor = Math.pow(state.model.q, state.glueT);
        const mid = a.map(x => x * factor);

        drawArc(a[0], a[1], { color: state.colors.orange, width: 3.2 });
        drawArc(b[0], b[1], { color: state.colors.green, width: 3.2 });
        if (state.glueT > 0.005 && state.glueT < 0.995) {
            drawArc(mid[0], mid[1], { color: state.colors.violet, width: 2.5, dash: [7, 5] });
        }

        const baseLineLeft = toCanvas({ x: fromCanvas(0, state.baseline).x, y: 0 });
        const baseLineRight = toCanvas({ x: fromCanvas(state.width, state.baseline).x, y: 0 });
        ctx.save();
        ctx.strokeStyle = state.colors.ink;
        ctx.globalAlpha = 0.55;
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.moveTo(baseLineLeft.x, baseLineLeft.y);
        ctx.lineTo(baseLineRight.x, baseLineRight.y);
        ctx.stroke();
        ctx.restore();

        const aCenter = (a[0] + a[1]) / 2;
        const aRadius = (a[1] - a[0]) / 2;
        const midCenter = aCenter * factor;
        const midRadius = aRadius * factor;
        const from = toCanvas({ x: aCenter, y: aRadius });
        const to = toCanvas({ x: midCenter, y: midRadius });
        if (state.glueT > 0.03) drawArrow(from, to, state.colors.violet);

        const bCenter = (b[0] + b[1]) / 2;
        const bRadius = (b[1] - b[0]) / 2;
        label('Ax(Aₚ)', { x: from.x, y: from.y - 17 }, state.colors.orange);
        label('Ax(Bₚ)', { x: toCanvas({ x: bCenter, y: bRadius }).x, y: toCanvas({ x: bCenter, y: bRadius }).y - 17 }, state.colors.green);

        if (elements.labels.checked) {
            label(formatNumber(a[0], 3), { x: toCanvas({ x: a[0], y: 0 }).x, y: state.baseline + 16 }, state.colors.orange);
            label(formatNumber(a[1], 3), { x: toCanvas({ x: a[1], y: 0 }).x, y: state.baseline + 16 }, state.colors.orange);
            label(formatNumber(b[0], 3), { x: toCanvas({ x: b[0], y: 0 }).x, y: state.baseline + 16 }, state.colors.green);
            label(formatNumber(b[1], 3), { x: toCanvas({ x: b[1], y: 0 }).x, y: state.baseline + 16 }, state.colors.green);
        }
    }

    function tracePath(points, options = {}) {
        if (!points.length) return;
        ctx.save();
        ctx.beginPath();
        points.forEach((point, index) => {
            const c = toCanvas(point);
            if (index === 0) ctx.moveTo(c.x, c.y);
            else ctx.lineTo(c.x, c.y);
        });
        ctx.strokeStyle = options.color || state.colors.ink;
        ctx.lineWidth = options.width || 1;
        if (options.dash) ctx.setLineDash(options.dash);
        ctx.stroke();
        ctx.restore();
    }

    function drawLogView() {
        const aPath = logAxisSamples(1);
        const bPath = logAxisSamples(state.model.q);
        const shift = state.glueT * Math.log(state.model.q);
        const midPath = aPath.map(p => ({ x: p.x + shift, y: p.y }));

        ctx.save();
        ctx.beginPath();
        aPath.forEach((p, index) => {
            const c = toCanvas(p);
            if (index === 0) ctx.moveTo(c.x, c.y);
            else ctx.lineTo(c.x, c.y);
        });
        [...bPath].reverse().forEach(p => {
            const c = toCanvas(p);
            ctx.lineTo(c.x, c.y);
        });
        ctx.closePath();
        ctx.fillStyle = 'rgba(30, 58, 95, 0.08)';
        ctx.fill();
        ctx.restore();

        const left = fromCanvas(0, 0).x;
        const right = fromCanvas(state.width, 0).x;
        ctx.save();
        ctx.strokeStyle = 'rgba(30, 58, 95, 0.16)';
        ctx.lineWidth = 1;
        for (const angle of [0, Math.PI / 2, Math.PI]) {
            const p0 = toCanvas({ x: left, y: angle });
            const p1 = toCanvas({ x: right, y: angle });
            ctx.beginPath();
            ctx.moveTo(p0.x, p0.y);
            ctx.lineTo(p1.x, p1.y);
            ctx.stroke();
        }
        ctx.restore();

        tracePath(aPath, { color: state.colors.orange, width: 3.2 });
        tracePath(bPath, { color: state.colors.green, width: 3.2 });
        if (state.glueT > 0.005 && state.glueT < 0.995) {
            tracePath(midPath, { color: state.colors.violet, width: 2.5, dash: [7, 5] });
        }

        const sampleIndex = Math.floor(aPath.length * 0.52);
        const from = toCanvas(aPath[sampleIndex]);
        const to = toCanvas(midPath[sampleIndex]);
        if (state.glueT > 0.03) drawArrow(from, to, state.colors.violet);
        label('Ax(Aₚ)', { x: toCanvas(aPath[55]).x - 4, y: toCanvas(aPath[55]).y - 16 }, state.colors.orange);
        label('Ax(Bₚ)', { x: toCanvas(bPath[125]).x + 4, y: toCanvas(bPath[125]).y - 16 }, state.colors.green);
        label('arg z = π', { x: toCanvas({ x: left, y: Math.PI }).x + 8, y: toCanvas({ x: left, y: Math.PI }).y - 13 }, state.colors.muted, 'left');
        label('arg z = 0', { x: toCanvas({ x: left, y: 0 }).x + 8, y: toCanvas({ x: left, y: 0 }).y + 14 }, state.colors.muted, 'left');
        label(`translation log ${state.model.q}`, { x: (from.x + to.x) / 2, y: from.y - 18 }, state.colors.violet);
    }

    function draw() {
        if (!state.model || !state.width || !state.height) return;
        clearCanvas();
        if (elements.view.value === 'log') drawLogView();
        else drawUHP();
    }

    function setValidation(message) {
        elements.validation.textContent = message;
        elements.validation.classList.toggle('visible', Boolean(message));
    }

    function applyModel() {
        const p = Number(elements.prime.value);
        if (!isPrime(p) || p === 2) {
            setValidation('Choose an odd prime between 3 and 997.');
            return;
        }
        setValidation('');
        stopAnimation();
        state.model = buildModel(p, elements.family.value);
        state.glueT = Number(elements.glue.value) / 100;
        updateText(state.model);
        resetView();
    }

    function updateGlue(value) {
        state.glueT = Math.max(0, Math.min(1, value));
        elements.glue.value = String(Math.round(state.glueT * 100));
        elements.glueValue.value = `t = ${state.glueT.toFixed(2)}`;
        elements.glueValue.textContent = `t = ${state.glueT.toFixed(2)}`;
        draw();
    }

    function stopAnimation() {
        if (state.animationId) cancelAnimationFrame(state.animationId);
        state.animationId = 0;
        elements.play.textContent = '▶';
        elements.play.setAttribute('aria-label', 'Play the side pairing');
    }

    function animate(now) {
        if (!state.animationStart) state.animationStart = now - state.glueT * 2200;
        const elapsed = now - state.animationStart;
        const t = Math.min(1, elapsed / 2200);
        updateGlue(t);
        if (t >= 1) {
            stopAnimation();
            state.animationStart = 0;
            return;
        }
        state.animationId = requestAnimationFrame(animate);
    }

    function toggleAnimation() {
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            updateGlue(state.glueT < 0.99 ? 1 : 0);
            return;
        }
        if (state.animationId) {
            stopAnimation();
            return;
        }
        if (state.glueT >= 0.99) updateGlue(0);
        state.animationStart = 0;
        elements.play.textContent = 'Ⅱ';
        elements.play.setAttribute('aria-label', 'Pause the side pairing');
        state.animationId = requestAnimationFrame(animate);
    }

    elements.apply.addEventListener('click', applyModel);
    elements.prime.addEventListener('keydown', event => {
        if (event.key === 'Enter') applyModel();
    });
    elements.family.addEventListener('change', applyModel);
    elements.view.addEventListener('change', () => {
        if (!state.model) return;
        updateText(state.model);
        resetView();
    });
    elements.tiling.addEventListener('change', draw);
    elements.labels.addEventListener('change', draw);
    elements.reset.addEventListener('click', resetView);
    elements.glue.addEventListener('input', () => {
        stopAnimation();
        updateGlue(Number(elements.glue.value) / 100);
    });
    elements.play.addEventListener('click', toggleAnimation);

    elements.canvas.addEventListener('pointerdown', event => {
        state.dragging = true;
        state.dragDistance = 0;
        state.lastX = event.clientX;
        state.lastY = event.clientY;
        elements.canvas.setPointerCapture(event.pointerId);
    });
    elements.canvas.addEventListener('pointermove', event => {
        if (!state.dragging) return;
        const dx = event.clientX - state.lastX;
        const dy = event.clientY - state.lastY;
        state.dragDistance += Math.hypot(dx, dy);
        state.offsetX += dx;
        state.baseline += dy;
        state.lastX = event.clientX;
        state.lastY = event.clientY;
        draw();
    });
    const endDrag = () => { state.dragging = false; };
    elements.canvas.addEventListener('pointerup', endDrag);
    elements.canvas.addEventListener('pointercancel', endDrag);
    elements.canvas.addEventListener('pointerleave', endDrag);
    elements.canvas.addEventListener('wheel', event => {
        event.preventDefault();
        const rect = elements.canvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        const before = fromCanvas(x, y);
        const factor = event.deltaY < 0 ? 1.12 : 0.89;
        state.scale = Math.max(4, Math.min(2500, state.scale * factor));
        state.offsetX = x - before.x * state.scale;
        state.baseline = y + before.y * state.scale;
        draw();
    }, { passive: false });

    readColors();
    const resizeObserver = new ResizeObserver(resizeCanvas);
    resizeObserver.observe(elements.canvas);
    applyModel();
    updateGlue(0);
})();
