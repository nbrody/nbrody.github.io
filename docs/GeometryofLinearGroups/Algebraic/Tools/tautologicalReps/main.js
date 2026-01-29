const canvas = document.getElementById('mainCanvas');
const ctx = canvas.getContext('2d');
const reSlider = document.getElementById('param-re');
const imSlider = document.getElementById('param-im');
const reVal = document.getElementById('re-val');
const imVal = document.getElementById('im-val');
const matrixView = document.getElementById('rho-matrix');

let width, height;
let currentExample = 'torus';
let z = { re: 0.5, im: 1.0 };

// Resize handler
function resize() {
    const container = document.getElementById('viz-container');
    width = container.clientWidth;
    height = container.clientHeight;
    canvas.width = width * window.devicePixelRatio;
    canvas.height = height * window.devicePixelRatio;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
}

window.addEventListener('resize', resize);
resize();

// Complex math helpers
const C = {
    add: (a, b) => ({ re: a.re + b.re, im: a.im + b.im }),
    mul: (a, b) => ({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re }),
    div: (a, b) => {
        const d = b.re * b.re + b.im * b.im;
        return { re: (a.re * b.re + a.im * b.im) / d, im: (a.im * b.re - a.re * b.im) / d };
    }
};

// Matrix math (SL2)
const M = {
    apply: (m, p) => {
        // (az+b)/(cz+d)
        const num = C.add(C.mul(m.a, p), m.b);
        const den = C.add(C.mul(m.c, p), m.d);
        return C.div(num, den);
    },
    mul: (m1, m2) => ({
        a: C.add(C.mul(m1.a, m2.a), C.mul(m1.b, m2.c)),
        b: C.add(C.mul(m1.a, m2.b), C.mul(m1.b, m2.d)),
        c: C.add(C.mul(m1.c, m2.a), C.mul(m1.d, m2.c)),
        d: C.add(C.mul(m1.c, m2.b), C.mul(m1.d, m2.d))
    })
};

function getGenerators(mode, zParam) {
    const I = { re: 1, im: 0 };
    const O = { re: 0, im: 0 };

    if (mode === 'torus') {
        // Commuting parabolic generators
        // A = [1, 1; 0, 1], B = [1, z; 0, 1]
        return [
            { a: I, b: I, c: O, d: I }, // A
            { a: I, b: { re: -1, im: 0 }, c: O, d: I }, // Ai
            { a: I, b: zParam, c: O, d: I }, // B
            { a: I, b: { re: -zParam.re, im: -zParam.im }, c: O, d: I } // Bi
        ];
    } else {
        // Riley generators: A = [1, 1; 0, 1], B = [1, 0; z, 1]
        // Note: For Riley slice we often use a different normalization, 
        // but this is the "standard" one from many sources.
        return [
            { a: I, b: I, c: O, d: I }, // S
            { a: I, b: { re: -1, im: 0 }, c: O, d: I }, // Si
            { a: I, b: O, c: zParam, d: I }, // T
            { a: I, b: O, c: { re: -zParam.re, im: -zParam.im }, d: I } // Ti
        ];
    }
}

function updateMatrixDisplay() {
    const zStr = `${z.re.toFixed(2)} + ${z.im.toFixed(2)}i`;
    if (currentExample === 'torus') {
        matrixView.innerHTML = `\\[ \\rho(b) = \\begin{pmatrix} 1 & ${zStr} \\\\ 0 & 1 \\end{pmatrix} \\]`;
    } else {
        matrixView.innerHTML = `\\[ \\rho(t) = \\begin{pmatrix} 1 & 0 \\\\ ${zStr} & 1 \\end{pmatrix} \\]`;
    }
    if (window.MathJax) {
        MathJax.typesetPromise([matrixView]);
    }
}

function selectExample(mode) {
    currentExample = mode;
    document.querySelectorAll('.example-card').forEach(c => c.classList.remove('active'));
    document.getElementById(`ex-${mode}`).classList.add('active');

    document.getElementById('torus-details').style.display = mode === 'torus' ? 'block' : 'none';
    document.getElementById('knot-details').style.display = mode === 'knot' ? 'block' : 'none';

    // Set some defaults
    if (mode === 'knot') {
        z = { re: 0.5, im: 0.866 }; // Close to the figure eight point
        reSlider.value = 0.5;
        imSlider.value = 0.866;
    } else {
        z = { re: 0.5, im: 1.0 };
        reSlider.value = 0.5;
        imSlider.value = 1.0;
    }
    reVal.textContent = z.re.toFixed(2);
    imVal.textContent = z.im.toFixed(2);

    updateMatrixDisplay();
    render();
}

function toCanvas(p) {
    const scale = currentExample === 'torus' ? 100 : 150;
    return {
        x: width / 2 + p.re * scale,
        y: height / 2 - p.im * scale
    };
}

function render() {
    ctx.clearRect(0, 0, width, height);

    // Draw background grid for context
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = -10; i <= 10; i++) {
        const p1 = toCanvas({ re: i, im: -10 });
        const p2 = toCanvas({ re: i, im: 10 });
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        const p3 = toCanvas({ re: -10, im: i });
        const p4 = toCanvas({ re: 10, im: i });
        ctx.moveTo(p3.x, p3.y);
        ctx.lineTo(p4.x, p4.y);
    }
    ctx.stroke();

    const gens = getGenerators(currentExample, z);
    const points = [];
    const maxIters = currentExample === 'torus' ? 400 : 2000;

    let p = { re: 0.1, im: 0.1 };

    if (currentExample === 'torus') {
        // Draw the lattice
        ctx.fillStyle = '#60a5fa';
        for (let n = -10; n <= 10; n++) {
            for (let m = -10; m <= 10; m++) {
                const latticePoint = {
                    re: n + m * z.re,
                    im: m * z.im
                };
                const c = toCanvas(latticePoint);
                ctx.beginPath();
                ctx.arc(c.x, c.y, 2, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    } else {
        // For the Riley representation, draw the limit set orbit
        // This is a simple Brownian motion on the group
        ctx.fillStyle = 'rgba(96, 165, 250, 0.6)';
        for (let i = 0; i < maxIters; i++) {
            const gen = gens[Math.floor(Math.random() * gens.length)];
            p = M.apply(gen, p);

            // Check for stability
            if (isNaN(p.re) || Math.abs(p.re) > 100) p = { re: 0.1, im: 0.1 };

            const c = toCanvas(p);
            ctx.beginPath();
            ctx.arc(c.x, c.y, 1, 0, Math.PI * 2);
            ctx.fill();
        }
    }
}

// Input listeners
reSlider.addEventListener('input', (e) => {
    z.re = parseFloat(e.target.value);
    reVal.textContent = z.re.toFixed(2);
    updateMatrixDisplay();
    render();
});

imSlider.addEventListener('input', (e) => {
    z.im = parseFloat(e.target.value);
    imVal.textContent = z.im.toFixed(2);
    updateMatrixDisplay();
    render();
});

// Initial render
window.selectExample = selectExample;
updateMatrixDisplay();
render();
