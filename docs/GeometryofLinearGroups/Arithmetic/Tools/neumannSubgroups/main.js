const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const wordInput = document.getElementById('word-input');
const decompOutput = document.getElementById('decomposition-output');
const orbitLog = document.getElementById('orbit-log');

let scale = 120;
let offsetX = 0;
let width, height;

// Permutation state
// L(n) is the permutation for ST
// f(n) = L(n) - 1
// Condition: L(L(n)-1) = n+1
let L = new Map();
let orbits = [];

function resetSolver() {
    L.clear();
    orbits = [];
    const b = parseInt(document.getElementById('seed-input').value) || 2;

    // Initial orbit for S in Gamma: L(-1)=0, L(0)=b, L(b)=-1
    addOrbit([-1, 0, b]);

    // Greedily complete around 0
    completePermutation(0, 100);
    updateViz();
}

function addOrbit(vals) {
    orbits.push(vals);
    L.set(vals[0], vals[1]);
    L.set(vals[1], vals[2]);
    L.set(vals[2], vals[0]);
}

function completePermutation(start, depth) {
    // Satisfy the condition L(L(n)-1) = n+1 for a range of n
    let range = 20;
    for (let tries = 0; tries < 2; tries++) { // Multiple passes
        for (let n = -range; n <= range; n++) {
            satisfy(n);
        }
    }
}

function satisfy(n) {
    if (!L.has(n)) {
        // Pick a new orbit for n
        let b = findFree();
        let c = findFree();
        if (b === null || c === null) return;
        addOrbit([n, b, c]);
    }

    // Check condition L(L(n)-1) = n+1
    let ln = L.get(n);
    let target = ln - 1;
    let result = n + 1;

    if (!L.has(target)) {
        // We must have L(target) = result
        // This means target and result are in an orbit: {target, result, k}
        let k = findFree();
        if (k !== null) addOrbit([target, result, k]);
    }
}

function findFree() {
    for (let i = 0; i < 500; i++) {
        if (!L.has(i) && i !== 0) return i;
        if (!L.has(-i) && -i !== 0) return -i;
    }
    return null;
}

function runDecomposition() {
    const word = wordInput.value.toLowerCase();
    let n = 0;
    let gamma = [];

    for (let char of word) {
        if (char === 't') {
            n++;
        } else if (char === 'i') {
            n--;
        } else if (char === 's') {
            let ln = L.get(n);
            if (ln === undefined) {
                // Force definition
                satisfy(n);
                ln = L.get(n);
            }
            let fn = ln - 1;
            gamma.push(`T^{${n}} S T^{-${fn}}`);
            n = fn;
        }
    }

    decompOutput.innerHTML = `$$g = (${gamma.length ? gamma.join(' \\cdot ') : 'I'}) \\cdot T^{${n}}$$`;
    if (window.MathJax) MathJax.typesetPromise();
}

function resize() {
    width = canvas.width = canvas.parentElement.clientWidth;
    height = canvas.height = canvas.parentElement.clientHeight;
    if (offsetX === 0) offsetX = width / 2;
}

function updateViz() {
    let log = "";
    orbits.sort((a, b) => Math.min(...a) - Math.min(...b)).forEach(o => {
        log += `(${o.join(',')})<br>`;
    });
    orbitLog.innerHTML = log;
}

let isDragging = false;
let lastX;
canvas.addEventListener('mousedown', e => { isDragging = true; lastX = e.clientX; });
window.addEventListener('mouseup', () => isDragging = false);
window.addEventListener('mousemove', e => {
    if (!isDragging) return;
    offsetX += e.clientX - lastX;
    lastX = e.clientX;
});
canvas.addEventListener('wheel', e => {
    e.preventDefault();
    const zoom = e.deltaY < 0 ? 1.05 : 0.95;
    const mx = e.clientX;
    offsetX = mx - zoom * (mx - offsetX);
    scale *= zoom;
});

function draw() {
    ctx.clearRect(0, 0, width, height);
    const yc = height / 2;

    // Axis
    ctx.strokeStyle = '#30363d';
    ctx.beginPath(); ctx.moveTo(0, yc); ctx.lineTo(width, yc); ctx.stroke();

    const xMin = Math.floor((-offsetX) / scale) - 2;
    const xMax = Math.ceil((width - offsetX) / scale) + 2;

    // Draw f arcs (blue)
    ctx.lineWidth = 1.5;
    L.forEach((val, n) => {
        const fn = val - 1;
        if (n < fn) {
            const x1 = offsetX + n * scale;
            const x2 = offsetX + fn * scale;
            const r = Math.abs(x2 - x1) / 2;
            ctx.strokeStyle = 'rgba(88, 166, 255, 0.6)';
            ctx.beginPath(); ctx.arc((x1 + x2) / 2, yc, r, Math.PI, 0); ctx.stroke();
        } else if (n === fn) {
            const x = offsetX + n * scale;
            ctx.strokeStyle = 'var(--accent-color)';
            ctx.beginPath(); ctx.arc(x, yc - 12, 6, 0, Math.PI * 2); ctx.stroke();
        }
    });

    // Draw L orbits (green semicircles below the real line)
    ctx.lineWidth = 1;
    orbits.forEach((o, idx) => {
        ctx.strokeStyle = 'rgba(126, 231, 135, 0.4)';
        for (let i = 0; i < 3; i++) {
            const x1 = offsetX + o[i] * scale;
            const x2 = offsetX + o[(i + 1) % 3] * scale;
            const cx = (x1 + x2) / 2;
            const r = Math.abs(x2 - x1) / 2;
            ctx.beginPath();
            // Semicircle below the line: 0 to PI
            ctx.arc(cx, yc, r, 0, Math.PI);
            ctx.stroke();
        }
    });

    // Points
    for (let i = xMin; i <= xMax; i++) {
        const x = offsetX + i * scale;
        if (x < -20 || x > width + 20) continue;
        ctx.fillStyle = (i === 0) ? 'var(--accent-color)' : '#8b949e';
        ctx.beginPath(); ctx.arc(x, yc, 3.5, 0, Math.PI * 2); ctx.fill();
        ctx.font = '11px Inter';
        ctx.textAlign = 'center';
        ctx.fillText(i.toString(), x, yc + 18);
    }

    requestAnimationFrame(draw);
}

window.addEventListener('resize', resize);
resize();
resetSolver();
requestAnimationFrame(draw);

// Expose functions to window
window.resetSolver = resetSolver;
window.runDecomposition = runDecomposition;
window.satisfy = satisfy;
