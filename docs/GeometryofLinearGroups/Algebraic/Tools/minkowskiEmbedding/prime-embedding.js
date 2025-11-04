// Z[1/3] Minkowski Embedding Visualization
function initPrimeEmbedding() {
    const Q = {
        gcd: (a, b) => {
            a = Math.abs(a);
            b = Math.abs(b);
            while (b) {
                [a, b] = [b, a % b];
            }
            return a;
        },
        simplify: (num, den) => {
            if (den === 0) throw new Error("Denominator cannot be zero.");
            if (den < 0) {
                num = -num;
                den = -den;
            }
            const common = Q.gcd(num, den);
            return { num: num / common, den: den / common };
        }
    };

    function integerExponent(n, p) {
        if (n === 0 || p <= 1) return Infinity;
        n = Math.abs(n);
        let count = 0;
        while (n > 0 && n % p === 0) {
            count++;
            n /= p;
        }
        return count;
    }

    function v3(q) {
        return integerExponent(q.num, 3) - integerExponent(q.den, 3);
    }

    const canvas = document.getElementById('primeCanvas');
    const ctx = canvas.getContext('2d');
    const animateBtn = document.getElementById('primeAnimateBtn');

    let VIEW_W = 800;
    let VIEW_H = 500;

    function setupHiDPI() {
        const DPR = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();
        VIEW_W = Math.round(rect.width) || 800;
        VIEW_H = Math.round(rect.height) || 500;
        canvas.style.width = VIEW_W + 'px';
        canvas.style.height = VIEW_H + 'px';
        canvas.width = Math.round(VIEW_W * DPR);
        canvas.height = Math.round(VIEW_H * DPR);
        ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    }
    setupHiDPI();
    window.addEventListener('resize', () => {
        setupHiDPI();
    });

    const X_RANGE = [-5, 5];
    const NUMERATOR_MAX = 60;
    const DENOMINATOR_POWER_MAX = 5;
    const BASE_RADIUS = 5;
    const RADIUS_SCALE_FACTOR = 1.7;

    let points = [];
    let isAnimating = false;
    let animationProgress = 0;
    const ANIMATION_SPEED = 0.02;

    function generatePoints() {
        const generated = new Map();
        for (let k = 0; k <= DENOMINATOR_POWER_MAX; k++) {
            const den = Math.pow(3, k);
            for (let num = -5 * den; num <= 5 * den; num++) {
                const val = num / den;
                if (val > X_RANGE[0] && val < X_RANGE[1]) {
                    const rational = Q.simplify(num, den);
                    const valuation = v3(rational);
                    generated.set(`${rational.num}/${rational.den}`, {
                        x: val,
                        y: 0,
                        targetY: Math.pow(3, valuation),
                        valuation,
                        radius: BASE_RADIUS * Math.pow(RADIUS_SCALE_FACTOR, valuation),
                        label: `${rational.num}/${rational.den}`
                    });
                }
            }
        }
        points = Array.from(generated.values()).sort((a, b) => a.x - b.x);
    }

    function mapCoords(x, y) {
        const canvasX = (x - X_RANGE[0]) / (X_RANGE[1] - X_RANGE[0]) * VIEW_W;
        const Y_VAL_RANGE = [-.2, 3.2];
        const canvasY = VIEW_H - ((y - Y_VAL_RANGE[0]) / (Y_VAL_RANGE[1] - Y_VAL_RANGE[0]) * VIEW_H);
        return { x: canvasX, y: canvasY };
    }

    function drawAxes() {
        ctx.strokeStyle = '#cbd5e1';
        ctx.lineWidth = 1;

        const zeroValLine = mapCoords(0, 0);
        ctx.beginPath();
        ctx.moveTo(0, zeroValLine.y);
        ctx.lineTo(VIEW_W, zeroValLine.y);
        ctx.stroke();

        ctx.fillStyle = '#64748b';
        ctx.font = '12px Inter';
        ctx.textAlign = 'center';

        for (let i = Math.ceil(X_RANGE[0]); i <= Math.floor(X_RANGE[1]); i++) {
            if (i === 0) continue;
            const pos = mapCoords(i, 0);
            ctx.fillText(i, pos.x, pos.y + 15);
        }
    }

    function draw() {
        ctx.clearRect(0, 0, VIEW_W, VIEW_H);
        drawAxes();

        if (isAnimating && animationProgress < 1) {
            animationProgress += ANIMATION_SPEED;
            if (animationProgress > 1) animationProgress = 1;
        }

        points.forEach(p => {
            const easedProgress = 0.5 - 0.5 * Math.cos(animationProgress * Math.PI);
            p.y = p.targetY * easedProgress;

            const pos = mapCoords(p.x, p.y);

            ctx.beginPath();
            ctx.arc(pos.x, pos.y, p.radius, 0, 2 * Math.PI);

            const hue = 180 + p.valuation * 30;
            ctx.fillStyle = `hsla(${hue}, 80%, 50%, 0.7)`;
            ctx.fill();
            ctx.strokeStyle = `hsla(${hue}, 90%, 30%, 0.9)`;
            ctx.stroke();
        });

        requestAnimationFrame(draw);
    }

    animateBtn.addEventListener('click', () => {
        if (animationProgress >= 1) {
            animationProgress = 0;
        }
        isAnimating = true;
    });

    generatePoints();
    draw();
}
