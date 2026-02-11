import * as THREE from 'three';

export class Complex {
    constructor(re, im = 0) { this.re = re; this.im = im; }
    add(c) { return new Complex(this.re + c.re, this.im + c.im); }
    sub(c) { return new Complex(this.re - c.re, this.im - c.im); }
    mul(c) {
        if (typeof c === 'number') return new Complex(this.re * c, this.im * c);
        return new Complex(this.re * c.re - this.im * c.im, this.re * c.im + this.im * c.re);
    }
    div(c) {
        if (typeof c === 'number') return new Complex(this.re / c, this.im / c);
        const den = c.re * c.re + c.im * c.im;
        return new Complex((this.re * c.re + this.im * c.im) / den, (this.im * c.re - this.re * c.im) / den);
    }
    conj() { return new Complex(this.re, -this.im); }
    normSq() { return this.re * this.re + this.im * this.im; }
    static from(z) {
        if (z instanceof Complex) return z;
        if (typeof z === 'number') return new Complex(z);
        return new Complex(z.re || 0, z.im || 0);
    }
}

export class Matrix2x2 {
    constructor(a, b, c, d) {
        this.a = Complex.from(a);
        this.b = Complex.from(b);
        this.c = Complex.from(c);
        this.d = Complex.from(d);
    }
    mul(m) {
        return new Matrix2x2(
            this.a.mul(m.a).add(this.b.mul(m.c)), this.a.mul(m.b).add(this.b.mul(m.d)),
            this.c.mul(m.a).add(this.d.mul(m.c)), this.c.mul(m.b).add(this.d.mul(m.d))
        );
    }
    inv() {
        const det = this.a.mul(this.d).sub(this.b.mul(this.c));
        return new Matrix2x2(
            this.d.div(det), this.b.mul(-1).div(det),
            this.c.mul(-1).div(det), this.a.div(det)
        );
    }
    log() {
        let tr = this.a.add(this.d);
        // tr = 2*cosh(phi)
        // Use a simple complex acosh for log
        // For SL2C, log is defined except at -I
        // (M - I/2 tr) * (theta/sin(theta))
        const k2 = tr.div(2);
        const diff = new Matrix2x2(this.a.sub(k2), this.b, this.c, this.d.sub(k2));

        // Characteristic equation: lambda^2 - tr*lambda + 1 = 0
        // lambda = (tr +/- sqrt(tr^2 - 4)) / 2
        const tr2minus4 = tr.mul(tr).sub(new Complex(4));
        const sqrtTr2minus4 = Complex.sqrt(tr2minus4);
        const l1 = tr.add(sqrtTr2minus4).div(2);

        const phi = Complex.log(l1); // phi = i*theta
        const norm = phi.normSq();
        if (norm < 1e-10) return new Matrix2x2(0, 0, 0, 0);

        // sinh(phi) = (l1 - 1/l1)/2
        const sphi = l1.sub(new Complex(1).div(l1)).div(2);
        const factor = phi.div(sphi);

        return new Matrix2x2(
            diff.a.mul(factor), diff.b.mul(factor),
            diff.c.mul(factor), diff.d.mul(factor)
        );
    }
    static exp(X) {
        // X has trace 0. det(X) = -a^2 - bc.
        // lambda^2 = -det(X) = a^2 + bc.
        const detX = X.a.mul(X.a).add(X.b.mul(X.c)); // Trace 0 => d = -a, so -ad = a^2. -det = -ad-bc = a^2+bc
        const phi = Complex.sqrt(detX);
        const norm = phi.normSq();

        let s, c;
        if (norm < 1e-10) {
            s = new Complex(1);
            c = new Complex(1);
        } else {
            // exp(X) = cosh(phi)*I + (sinh(phi)/phi)*X
            // cosh(phi) = (exp(phi) + exp(-phi))/2
            const ep = Complex.exp(phi);
            const em = new Complex(1).div(ep);
            c = ep.add(em).div(2);
            s = ep.sub(em).div(2).div(phi);
        }

        return new Matrix2x2(
            c.add(X.a.mul(s)), X.b.mul(s),
            X.c.mul(s), c.add(X.d.mul(s))
        );
    }
}

// Extend Complex with sqrt, log, exp
Complex.sqrt = function (c) {
    const r = Math.sqrt(Math.sqrt(c.re * c.re + c.im * c.im));
    const theta = Math.atan2(c.im, c.re) / 2;
    return new Complex(r * Math.cos(theta), r * Math.sin(theta));
};
Complex.log = function (c) {
    const r = Math.sqrt(c.re * c.re + c.im * c.im);
    const theta = Math.atan2(c.im, c.re);
    return new Complex(Math.log(r), theta);
};
Complex.exp = function (c) {
    const r = Math.exp(c.re);
    return new Complex(r * Math.cos(c.im), r * Math.sin(c.im));
};

// Image of origin (0,0,1) in Upper Half Space
export function imageOfOriginUHS(m) {
    const denom = m.c.normSq() + m.d.normSq();
    const u = m.a.mul(m.c.conj()).add(m.b.mul(m.d.conj()));
    return { x: u.re / denom, y: u.im / denom, t: 1.0 / denom };
}

// Map UHS (x, y, t) to Poincare Ball (X, Y, Z)
export function uhsToBall(p) {
    const normSq = p.x * p.x + p.y * p.y;
    const denom = normSq + (p.t + 1) * (p.t + 1);
    return new THREE.Vector3(
        (2 * p.x) / denom,
        (2 * p.y) / denom,
        (normSq + p.t * p.t - 1) / denom
    );
}

// Poincare Ball (X, Y, Z) to Minkowski (x0, x1, x2, x3)
export function poincareToMinkowski(p) {
    const p2 = p.x * p.x + p.y * p.y + p.z * p.z;
    const factor = 1 / (1 - p2);
    return {
        x0: (1 + p2) * factor,
        x1: 2 * p.x * factor,
        x2: 2 * p.y * factor,
        x3: 2 * p.z * factor
    };
}

export function getBisectorSphere(p1, p2) {
    const v1 = poincareToMinkowski(p1);
    const v2 = poincareToMinkowski(p2);

    // Minkowski normal to the bisecting plane: n = v1 - v2
    const n0 = v1.x0 - v2.x0;
    const n = new THREE.Vector3(v1.x1 - v2.x1, v1.x2 - v2.x2, v1.x3 - v2.x3);

    // Plane in ball model: n0(1 + |p|^2) - 2 * n . p = 0
    // If n0 != 0: |p|^2 - 2 (n/n0) . p + 1 = 0
    // This is a sphere with center C = n/n0 and radius R = sqrt(|C|^2 - 1)

    // Smoothly handle the plane case (n0 approach 0)
    let safeN0 = n0;
    if (Math.abs(safeN0) < 1e-10) safeN0 = 1e-10;

    const center = n.clone().divideScalar(safeN0);
    const radSq = center.lengthSq() - 1;
    const radius = Math.sqrt(Math.max(0, radSq));

    // The side containing p1 is where n . v < 0 (if n = v1-v2)
    // Store orientation in radius sign (w)
    const sign = safeN0 > 0 ? 1 : -1;
    return new THREE.Vector4(center.x, center.y, center.z, sign * radius);
}

// --- Group Setup (Jorgensen Group n) ---
export function getGenerators(n, fiberOnly = false) {
    const psi = (1 + Math.sqrt(17 - 8 * Math.cos(Math.PI / n))) / 2;
    const theta = Math.PI / (2 * n);
    const lambda = new Complex(Math.cos(theta), Math.sin(theta));
    const lambdaInv = lambda.conj();
    const rho = (Math.sqrt(psi + 2) + Math.sqrt(psi - 2)) / 2;
    const denomX = 2 * Math.sqrt(psi - 2);
    const x = new Complex(Math.sqrt(3 - psi) / denomX, Math.sqrt(psi + 1) / denomX);

    const T = new Matrix2x2(rho, 0, 0, 1 / rho);
    const xSq = x.mul(x);
    const onePlusXSq = new Complex(1 + xSq.re, xSq.im);
    const X = new Matrix2x2(
        lambda.mul(x).mul(-1),
        onePlusXSq.mul(-1),
        1,
        lambdaInv.mul(x)
    );

    const Y = T.mul(X.inv()).mul(T.inv()).mul(X);

    if (fiberOnly) {
        return [X, X.inv(), Y, Y.inv()];
    }
    return [T, T.inv(), X, X.inv(), Y, Y.inv()];
}

export function getDirichletFaces(n = 2, viewMat = new Matrix2x2(1, 0, 0, 1), maxFaces = 100, fiberOnly = false) {
    const generators = getGenerators(n, fiberOnly);
    const queue = [viewMat];
    const faces = [];
    const seen = new Set();

    // Origin translated by viewMat
    const startQ = uhsToBall(imageOfOriginUHS(viewMat));
    seen.add(startQ.x.toFixed(6) + startQ.y.toFixed(6) + startQ.z.toFixed(6));

    for (let d = 0; d < 8; d++) {
        const len = queue.length;
        if (len === 0) break;
        for (let i = 0; i < len; i++) {
            const curr = queue.shift();
            for (const g of generators) {
                const next = curr.mul(g);
                const q = uhsToBall(imageOfOriginUHS(next));
                const key = q.x.toFixed(6) + q.y.toFixed(6) + q.z.toFixed(6);
                if (!seen.has(key)) {
                    seen.add(key);
                    queue.push(next);

                    // We want the Voronoi cell of the basepoint startQ
                    const distSq = q.clone().sub(startQ).lengthSq();
                    if (distSq > 1e-8) {
                        faces.push(getBisectorSphere(startQ, q));
                    }
                }
            }
        }
    }

    // Sort by geodesic distance to the basepoint
    const v1 = poincareToMinkowski(startQ);
    faces.sort((f1, f2) => {
        const c1 = new THREE.Vector3(f1.x, f1.y, f1.z);
        const r1 = Math.abs(f1.w);
        const d1 = Math.abs(c1.distanceTo(startQ) - r1);

        const c2 = new THREE.Vector3(f2.x, f2.y, f2.z);
        const r2 = Math.abs(f2.w);
        const d2 = Math.abs(c2.distanceTo(startQ) - r2);

        return d1 - d2;
    });

    const totalBuffer = 256;
    const actualCount = Math.min(maxFaces, faces.length);
    const result = faces.slice(0, actualCount);

    while (result.length < totalBuffer) {
        result.push(new THREE.Vector4(10, 0, 0, 0.1));
    }
    return { faces: result, count: actualCount };
}

export function getCayleyGraph(n = 2, maxDepth = 4, viewMat = new Matrix2x2(1, 0, 0, 1), fiberOnly = false) {
    const generators = getGenerators(n, fiberOnly);
    const queue = [{ matrix: viewMat, depth: 0, index: 0 }];
    const points = [uhsToBall(imageOfOriginUHS(viewMat))];
    const edges = [];

    const seenPoints = new Map();
    const seenEdges = new Set();
    const pointKey = (q) => q.x.toFixed(6) + q.y.toFixed(6) + q.z.toFixed(6);
    seenPoints.set(pointKey(points[0]), 0);

    let head = 0;
    while (head < queue.length) {
        const { matrix, depth, index: uIdx } = queue[head++];
        if (depth >= maxDepth) continue;

        for (let genIdx = 0; genIdx < generators.length; genIdx++) {
            const g = generators[genIdx];
            const nextMat = matrix.mul(g);
            const q = uhsToBall(imageOfOriginUHS(nextMat));
            const k = pointKey(q);

            let vIdx;
            if (seenPoints.has(k)) {
                vIdx = seenPoints.get(k);
            } else {
                vIdx = points.length;
                points.push(q);
                seenPoints.set(k, vIdx);
                queue.push({ matrix: nextMat, depth: depth + 1, index: vIdx });
            }

            if (uIdx !== vIdx) {
                const edgeKey = uIdx < vIdx ? `${uIdx}-${vIdx}` : `${vIdx}-${uIdx}`;
                if (!seenEdges.has(edgeKey)) {
                    seenEdges.add(edgeKey);
                    // 0:T, 1:X, 2:Y
                    edges.push({ u: uIdx, v: vIdx, type: Math.floor(genIdx / 2) });
                }
            }
        }
    }
    return { points, edges };
}
