const canvas = document.getElementById('tilingCanvas');
const ctx = canvas.getContext('2d');
const levelInput = document.getElementById('level-n');
const updateBtn = document.getElementById('update-btn');
const resetBtn = document.getElementById('reset-view-btn');
const animateBtn = document.getElementById('animate-btn');
const currentPointLabel = document.getElementById('current-point');
const matrixInfoLabel = document.getElementById('matrix-info');
const maxTilesInput = document.getElementById('max-tiles');
const maxTilesVal = document.getElementById('max-tiles-val');
const showCirclesInput = document.getElementById('show-circles');

let width, height;
let scale = 200;
let offsetX, offsetY;
let n = parseInt(levelInput.value);
let viewMatrix = [1, 0, 0, 1];

// Camera state
let isDragging = false;
let lastX, lastY;
let animating = false;

/**
 * Complex Number Math Utilities
 */
const Comp = {
    add: (a, b) => ({ re: a.re + b.re, im: a.im + b.im }),
    sub: (a, b) => ({ re: a.re - b.re, im: a.im - b.im }),
    mul: (a, b) => ({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re }),
    div: (a, b) => {
        const den = b.re * b.re + b.im * b.im;
        return {
            re: (a.re * b.re + a.im * b.im) / den,
            im: (a.im * b.re - a.re * b.im) / den
        };
    },
    abs2: (a) => a.re * a.re + a.im * a.im
};

/**
 * SL(2, R) Matrix Utilities
 */
const M2 = {
    mul: (m1, m2) => [
        m1[0] * m2[0] + m1[1] * m2[2],
        m1[0] * m2[1] + m1[1] * m2[3],
        m1[2] * m2[0] + m1[3] * m2[2],
        m1[2] * m2[1] + m1[3] * m2[3]
    ],
    inv: (m) => {
        const det = m[0] * m[3] - m[1] * m[2];
        return [m[3] / det, -m[1] / det, -m[2] / det, m[0] / det];
    },
    log: (m) => {
        let tr = m[0] + m[3];
        let sign = 1;
        if (tr < 0) {
            sign = -1;
            tr = -tr;
        }

        const a = sign * m[0], b = sign * m[1], c = sign * m[2], d = sign * m[3];

        if (tr > 2.0001) {
            const phi = Math.acosh(tr / 2);
            const s = phi / Math.sinh(phi);
            return [(a - d) / 2 * s, b * s, c * s, (d - a) / 2 * s];
        } else if (tr < 1.9999) {
            const theta = Math.acos(tr / 2);
            const s = theta / Math.sin(theta);
            return [(a - d) / 2 * s, b * s, c * s, (d - a) / 2 * s];
        } else {
            return [a - 1, b, c, d - 1];
        }
    },
    exp: (X) => {
        const det = -(X[0] * X[3] + X[1] * X[2]); // Trace is 0, so d = -a
        // det(X) = -a^2 - bc. If det(X) > 0, it's elliptic. If det(X) < 0, it's hyperbolic.
        // Wait, characteristic equation is lambda^2 - tr*lambda + det = 0.
        // Here tr=0, so lambda^2 = -det.
        // Let D = -det = a^2 + bc.
        const D = X[0] * X[0] + X[1] * X[2];
        if (D > 0.0001) {
            const phi = Math.sqrt(D);
            const s = Math.sinh(phi) / phi;
            const c = Math.cosh(phi);
            return [c + X[0] * s, X[1] * s, X[2] * s, c - X[0] * s];
        } else if (D < -0.0001) {
            const theta = Math.sqrt(-D);
            const s = Math.sin(theta) / theta;
            const c = Math.cos(theta);
            return [c + X[0] * s, X[1] * s, X[2] * s, c - X[0] * s];
        } else {
            return [1 + X[0], X[1], X[2], 1 - X[0]];
        }
    }
};

function init() {
    resize();
    resetView();
    render();
}

function resize() {
    const dpr = window.devicePixelRatio || 1;
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    ctx.scale(dpr, dpr);
}

function resetView() {
    scale = Math.min(width, height) / 3;
    offsetX = width / 2;
    offsetY = height * 0.8;
    viewMatrix = [1, 0, 0, 1];
}

window.addEventListener('resize', () => {
    resize();
    render();
});

// Coordinate conversion
function toCanvas(z) {
    return {
        x: offsetX + z.re * scale,
        y: offsetY - z.im * scale
    };
}

function fromCanvas(x, y) {
    return {
        re: (x - offsetX) / scale,
        im: (offsetY - y) / scale
    };
}

// Möbius transformation: (az+b)/(cz+d)
function apply(m, z) {
    const num = Comp.add(Comp.mul({ re: m[0], im: 0 }, z), { re: m[1], im: 0 });
    const den = Comp.add(Comp.mul({ re: m[2], im: 0 }, z), { re: m[3], im: 0 });
    return Comp.div(num, den);
}

// GCD for normalization in congruence quotients
function gcd(a, b) {
    a = Math.abs(a);
    b = Math.abs(b);
    while (b) {
        a %= b;
        [a, b] = [b, a];
    }
    return a;
}

// Normalize representative for P1(Z/nZ) using first column (a, c)
function getGamma0Rep(a, c, n) {
    a = (Math.round(a) % n + n) % n;
    c = (Math.round(c) % n + n) % n;

    let minA = a;
    let minC = c;

    for (let k = 1; k < n; k++) {
        if (gcd(k, n) === 1) {
            let na = (k * a) % n;
            let nc = (k * c) % n;
            if (na < minA || (na === minA && nc < minC)) {
                minA = na;
                minC = nc;
            }
        }
    }
    return `${minA},${minC}`;
}

function getGamma1Rep(a, c, n) {
    a = (Math.round(a) % n + n) % n;
    c = (Math.round(c) % n + n) % n;
    return `${a},${c}`;
}

const colorCache = new Map();
function getColor(rep) {
    if (colorCache.has(rep)) return colorCache.get(rep);
    let hash = 0;
    for (let i = 0; i < rep.length; i++) {
        hash = ((hash << 5) - hash) + rep.charCodeAt(i);
        hash |= 0;
    }
    const h = Math.abs(hash % 360);
    const s = 50 + (Math.abs(hash >> 8) % 30);
    const l = 35 + (Math.abs(hash >> 16) % 20);
    const color = `hsl(${h}, ${s}%, ${l}%)`;
    colorCache.set(rep, color);
    return color;
}

function drawHyperbolicLine(p1, p2) {
    if (Math.abs(p1.re - p2.re) < 1e-7) {
        const c2 = toCanvas(p2);
        ctx.lineTo(c2.x, c2.y);
    } else {
        const x1 = p1.re, y1 = p1.im;
        const x2 = p2.re, y2 = p2.im;
        const centerRe = (x1 * x1 + y1 * y1 - x2 * x2 - y2 * y2) / (2 * (x1 - x2));
        const radius = Math.sqrt((x1 - centerRe) * (x1 - centerRe) + y1 * y1);
        const centerCanvas = toCanvas({ re: centerRe, im: 0 });
        const startAngle = Math.atan2(-y1, x1 - centerRe);
        const endAngle = Math.atan2(-y2, x2 - centerRe);
        ctx.arc(centerCanvas.x, centerCanvas.y, radius * scale, startAngle, endAngle, x1 > x2);
    }
}

const INF = 200;
const F_VERTICES = [
    { re: -0.5, im: INF },
    { re: -0.5, im: Math.sqrt(3) / 2 },
    { re: 0.5, im: Math.sqrt(3) / 2 },
    { re: 0.5, im: INF }
];

function renderTile(m) {
    const combined = M2.mul(viewMatrix, m);
    const v = F_VERTICES.map(vert => apply(combined, vert));
    const rep = subgroupType === 'gamma0' ? getGamma0Rep(m[0], m[2], n) : getGamma1Rep(m[0], m[2], n);

    ctx.beginPath();
    const start = toCanvas(v[0]);
    ctx.moveTo(start.x, start.y);
    drawHyperbolicLine(v[0], v[1]);
    drawHyperbolicLine(v[1], v[2]);
    drawHyperbolicLine(v[2], v[3]);
    drawHyperbolicLine(v[3], v[0]);
    ctx.closePath();

    ctx.fillStyle = getColor(rep);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 0.5;
    ctx.stroke();
}

function renderCircle(m) {
    // A circle tangent to R at x0 with diameter 1/c^2
    // is the image of {Im(z)=1} under some SL2 element.
    // The image of {Im(z) > 1} under 'combined = View * m' is our disk.
    const combined = M2.mul(viewMatrix, m);
    const A = combined[0], B = combined[1], C = combined[2], D = combined[3];
    const rep = subgroupType === 'gamma0' ? getGamma0Rep(m[0], m[2], n) : getGamma1Rep(m[0], m[2], n);

    if (Math.abs(C) < 1e-9) {
        // Line case (image of infinity)
        ctx.beginPath();
        const yValue = A / D; // Im(z) height
        const canvasY = offsetY - yValue * scale;

        ctx.fillStyle = getColor(rep);
        ctx.globalAlpha = 0.6;
        ctx.fillRect(0, 0, width, canvasY);
        ctx.globalAlpha = 1.0;

        ctx.beginPath();
        ctx.moveTo(0, canvasY);
        ctx.lineTo(width, canvasY);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.lineWidth = 1;
        ctx.stroke();
    } else {
        const xCenter = A / C;
        const radius = 1 / (2 * C * C);
        const yCenter = radius;

        const canvasPos = toCanvas({ re: xCenter, im: yCenter });

        ctx.beginPath();
        ctx.arc(canvasPos.x, canvasPos.y, radius * scale, 0, Math.PI * 2);
        ctx.fillStyle = getColor(rep);
        ctx.globalAlpha = 0.6;
        ctx.fill();
        ctx.globalAlpha = 1.0;
        ctx.strokeStyle = 'rgba(255,255,255,0.2)';
        ctx.lineWidth = 0.5;
        ctx.stroke();
    }
}


function render() {
    ctx.clearRect(0, 0, width, height);
    ctx.beginPath();
    ctx.moveTo(0, offsetY);
    ctx.lineTo(width, offsetY);
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 2;
    ctx.stroke();

    const queue = [[1, 0, 0, 1]];
    const visited = new Set(['1,0,0,1']);
    let count = 0;
    const maxCount = parseInt(maxTilesInput.value);

    while (queue.length > 0 && count < maxCount) {
        const m = queue.shift();
        if (showCirclesInput.checked) {
            renderCircle(m);
        } else {
            renderTile(m);
        }
        count++;

        const neighbors = [
            [0, -1, 1, 0], [1, 1, 0, 1], [1, -1, 0, 1]
        ];

        for (const gen of neighbors) {
            const nm = M2.mul(m, gen);
            let sn = 1;
            if (nm[2] < 0 || (nm[2] === 0 && nm[3] < 0)) sn = -1;
            const snm = nm.map(x => x * sn);
            const key = snm.join(',');

            if (!visited.has(key)) {
                const combined = M2.mul(viewMatrix, snm);
                const det_approx = combined[2] * combined[2] + combined[3] * combined[3];
                if (det_approx < 4000) {
                    visited.add(key);
                    queue.push(snm);
                }
            }
        }
    }
}

function reduceToDomain(zInit) {
    const invView = M2.inv(viewMatrix);
    let z = apply(invView, zInit);
    let a = 1, b = 0, c = 0, d = 1;
    let iterations = 0;

    while (iterations < 100 && z.im > 1e-10) {
        const k = Math.round(z.re);
        if (k !== 0) {
            z.re -= k;
            a = a - k * c;
            b = b - k * d;
        }
        if (Comp.abs2(z) >= 0.99999) break;
        const den = Comp.abs2(z);
        z = { re: -z.re / den, im: z.im / den };
        const nextA = -c; const nextB = -d;
        c = a; d = b; a = nextA; b = nextB;
        iterations++;
    }

    let M = [a, b, c, d];
    let g = M2.mul(viewMatrix, M2.inv(M));
    if (g[2] < 0 || (g[2] === 0 && g[3] < 0)) g = g.map(x => -x);
    return g;
}

canvas.addEventListener('mousedown', e => {
    isDragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
});

window.addEventListener('mouseup', () => isDragging = false);

window.addEventListener('mousemove', e => {
    const z = fromCanvas(e.clientX, e.clientY);
    if (z.im < 0) {
        currentPointLabel.textContent = "Outside H";
        matrixInfoLabel.textContent = "N/A";
        return;
    }

    currentPointLabel.textContent = `${z.re.toFixed(3)} + ${z.im.toFixed(3)}i`;
    const m = reduceToDomain(z);
    const invView = M2.inv(viewMatrix);
    const mod_g = M2.mul(invView, m);

    const a_val = Math.round(mod_g[0]), c_val = Math.round(mod_g[2]);
    const a_mod = (a_val % n + n) % n;
    const c_mod = (c_val % n + n) % n;

    let infoStr;
    if (subgroupType === 'gamma0') {
        infoStr = `P¹ rep: (${getGamma0Rep(a_val, c_val, n)})`;
    } else {
        infoStr = `First column: (${a_mod}, ${c_mod})`;
    }
    matrixInfoLabel.textContent = `${infoStr} mod ${n}`;

    if (isDragging) {
        offsetX += e.clientX - lastX;
        offsetY += e.clientY - lastY;
        lastX = e.clientX;
        lastY = e.clientY;
        render();
    }
});

canvas.addEventListener('wheel', e => {
    e.preventDefault();
    const zoom = e.deltaY < 0 ? 1.1 : 0.9;
    const mx = e.clientX, my = e.clientY;
    offsetX = mx - zoom * (mx - offsetX);
    offsetY = my - zoom * (my - offsetY);
    scale *= zoom;
    render();
}, { passive: false });

animateBtn.addEventListener('click', () => {
    if (animating) return;
    const a = parseFloat(document.getElementById('mat-a').value);
    const b = parseFloat(document.getElementById('mat-b').value);
    const c = parseFloat(document.getElementById('mat-c').value);
    const d = parseFloat(document.getElementById('mat-d').value);
    const det = a * d - b * c;
    if (Math.abs(det) < 1e-6) return;
    const s = Math.sqrt(Math.abs(det));
    const target = [a / s, b / s, c / s, d / s];

    const X = M2.log(target);
    const startView = [...viewMatrix];
    const duration = 2000;
    const startTime = performance.now();
    animating = true;

    function step(now) {
        const t = Math.min((now - startTime) / duration, 1);
        const eased = t * t * (3 - 2 * t);
        const g_t = M2.exp(X.map(x => x * eased));
        viewMatrix = M2.mul(g_t, startView);
        render();
        if (t < 1) requestAnimationFrame(step);
        else animating = false;
    }
    requestAnimationFrame(step);
});

// Subgroup state management
const toggleBtn = document.getElementById('subgroup-toggle');
let subgroupType = 'gamma0';

toggleBtn.addEventListener('click', () => {
    subgroupType = subgroupType === 'gamma0' ? 'gamma1' : 'gamma0';
    const label = subgroupType === 'gamma0' ? '\\Gamma_0(\\,' : '\\Gamma_1(\\,';
    toggleBtn.textContent = `\\[${label}\\]`;

    // Clear cache and re-render
    colorCache.clear();
    render();

    // Trigger MathJax re-render for the toggle specifically
    if (window.MathJax) {
        MathJax.typesetPromise([toggleBtn]);
    }
});

levelInput.addEventListener('change', () => {
    n = parseInt(levelInput.value) || 1;
    colorCache.clear();
    render();
});

levelInput.addEventListener('input', () => {
    n = parseInt(levelInput.value) || 1;
    colorCache.clear();
    render();
});

updateBtn.addEventListener('click', () => {
    n = parseInt(levelInput.value) || 1;
    colorCache.clear();
    render();
});

resetBtn.addEventListener('click', () => {
    resetView();
    render();
});

maxTilesInput.addEventListener('input', () => {
    maxTilesVal.textContent = maxTilesInput.value;
    render();
});

showCirclesInput.addEventListener('change', () => {
    render();
});

init();
