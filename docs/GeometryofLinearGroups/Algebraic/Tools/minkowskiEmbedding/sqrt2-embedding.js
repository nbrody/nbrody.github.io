// Z[√2] Minkowski Embedding Visualization
function initSqrt2Embedding() {
    const canvas = document.getElementById('sqrt2Canvas');
    const ctx = canvas.getContext('2d');
    const animateBtn = document.getElementById('sqrt2AnimateBtn');

    // Configuration
    const range = 16;
    const sqrt2 = Math.sqrt(2);
    const animationDuration = 3000;
    let animationFrameId;

    const labelColor = '#374151';
    const axisColor = '#9ca3af';
    const gridColor = '#e5e7eb';
    const pointRadius = 4;

    const negColor = { r: 59, g: 130, b: 246 };
    const posColor = { r: 239, g: 68, b: 68 };
    const zeroColor = { r: 209, g: 213, b: 219 };

    let points = [];
    let scale;
    let origin;
    let minNorm = 0, maxNorm = 0;

    const lerpColor = (c1, c2, t) => {
        const r = Math.round(c1.r * (1 - t) + c2.r * t);
        const g = Math.round(c1.g * (1 - t) + c2.g * t);
        const b = Math.round(c1.b * (1 - t) + c2.b * t);
        return `rgb(${r}, ${g}, ${b})`;
    };

    const getColorForNorm = (norm) => {
        if (norm === 0) return `rgb(${zeroColor.r}, ${zeroColor.g}, ${zeroColor.b})`;
        if (norm > 0) {
            return lerpColor(zeroColor, posColor, Math.sqrt(norm / maxNorm));
        } else {
            return lerpColor(zeroColor, negColor, Math.sqrt(norm / minNorm));
        }
    }

    const generatePoints = () => {
        points = [];
        for (let a = -range; a <= range; a++) {
            for (let b = -range; b <= range; b++) {
                const x = a + b * sqrt2;
                const yFinal = a - b * sqrt2;
                const norm = a * a - 2 * b * b;
                let label;
                if (b === 0) label = `${a}`;
                else if (a === 0) label = `${b}√2`;
                else label = `${a} ${b > 0 ? '+' : '-'} ${Math.abs(b)}√2`;

                points.push({ a, b, x, yInitial: 0, yFinal, norm, label });
            }
        }
        const norms = points.map(p => p.norm);
        maxNorm = Math.max(...norms.filter(n => n > 0));
        minNorm = Math.min(...norms.filter(n => n < 0));
    };

    const setupCanvas = () => {
        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        const maxCoord = 10;
        scale = Math.min(canvas.clientWidth / (2 * maxCoord), canvas.clientHeight / (2 * maxCoord));
        origin = { x: canvas.clientWidth / 2, y: canvas.clientHeight / 2 };
    }

    const drawGridAndAxes = () => {
        ctx.strokeStyle = gridColor;
        ctx.lineWidth = 1;

        for (let i = -Math.floor(range * 2.5); i <= Math.floor(range * 2.5); i++) {
            if (i === 0) continue;
            const x = origin.x + i * scale * 2;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, canvas.clientHeight);
            ctx.stroke();
        }

        for (let i = -Math.floor(range * 2.5); i <= Math.floor(range * 2.5); i++) {
            if (i === 0) continue;
            const y = origin.y + i * scale * 2;
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(canvas.clientWidth, y);
            ctx.stroke();
        }

        ctx.strokeStyle = axisColor;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, origin.y);
        ctx.lineTo(canvas.clientWidth, origin.y);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(origin.x, 0);
        ctx.lineTo(origin.x, canvas.clientHeight);
        ctx.stroke();
    };

    const drawPoint = (p, y, color) => {
        const canvasX = origin.x + p.x * scale;
        const canvasY = origin.y - y * scale;

        ctx.beginPath();
        ctx.arc(canvasX, canvasY, pointRadius, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();

        if (Math.abs(p.x) < 5 && Math.abs(y) < 5 && (Math.abs(p.a) <= 2 && Math.abs(p.b) <= 2)) {
            ctx.fillStyle = labelColor;
            ctx.font = '12px Inter';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText(p.label, canvasX + 8, canvasY);
        }
    };

    const draw = (progress) => {
        ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
        drawGridAndAxes();

        points.forEach(p => {
            const currentY = p.yInitial + (p.yFinal - p.yInitial) * progress;
            const color = getColorForNorm(p.norm);
            drawPoint(p, currentY, color);
        });
    };

    const startAnimation = () => {
        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
        }
        let startTime = null;

        const animate = (timestamp) => {
            if (!startTime) startTime = timestamp;
            const elapsed = timestamp - startTime;
            const progress = Math.min(elapsed / animationDuration, 1);

            draw(progress);

            if (progress < 1) {
                animationFrameId = requestAnimationFrame(animate);
            } else {
                animateBtn.textContent = 'Restart Animation';
            }
        };

        animateBtn.textContent = 'Animating...';
        animationFrameId = requestAnimationFrame(animate);
    };

    const initialize = () => {
        setupCanvas();
        generatePoints();
        draw(0);
    }

    animateBtn.addEventListener('click', startAnimation);
    window.addEventListener('resize', initialize);

    initialize();
}
