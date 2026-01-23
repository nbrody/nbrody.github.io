/**
 * Utility functions for complex numbers, matrix operations, and angle formatting
 */

// Complex number operations
export function parseComplexToken(tok) {
    // Accept forms like: "a", "a+b*i", "a-bi", "bi", "-bi"
    if (!tok && tok !== 0) return null;
    const s = String(tok).trim().replace(/\s+/g, '');
    // Handle pure imaginary like "bi" or "-bi"
    if (/^[+-]?\d*\.?\d*(?:e[+-]?\d+)?i$/i.test(s)) {
        const c = s.replace(/i$/i, '');
        const im = (c === '' || c === '+' ? 1 : (c === '-' ? -1 : parseFloat(c)));
        return { re: 0, im };
    }
    // a + b i  OR  a - b i  OR just a
    const m = s.match(/^([+-]?\d*\.?\d*(?:e[+-]?\d+)?)?(?:([+-]\d*\.?\d*(?:e[+-]?\d+)?)i)?$/i);
    if (m) {
        const re = (m[1] && m[1] !== '' ? parseFloat(m[1]) : 0);
        const im = (m[2] && m[2] !== '' ? parseFloat(m[2]) : 0);
        return { re, im };
    }
    // Fallback simple real number
    const re = parseFloat(s);
    if (!Number.isNaN(re)) return { re, im: 0 };
    return null;
}

export function cAdd(a, b) {
    return { re: a.re + b.re, im: a.im + b.im };
}

export function cSub(a, b) {
    return { re: a.re - b.re, im: a.im - b.im };
}

export function cMul(a, b) {
    return { re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re };
}

export function cAbs(a) {
    return Math.hypot(a.re, a.im);
}

// 2x2 Complex matrix operations
export function parseMatrixFromMetaString(s) {
    // Expect something like "(a11 a12 a21 a22)" or "a11 a12 a21 a22" or comma-separated
    if (!s || typeof s !== 'string') return null;
    const inner = s.trim().replace(/[()\[\]]/g, ' ').trim();
    const parts = inner.split(/[\s,]+/).filter(Boolean);
    if (parts.length !== 4) return null;
    const c = parts.map(parseComplexToken);
    if (c.some(x => !x)) return null;
    return [ [c[0], c[1]], [c[2], c[3]] ];
}

export function matMul2(A, B) {
    return [
        [ cAdd(cMul(A[0][0], B[0][0]), cMul(A[0][1], B[1][0])), cAdd(cMul(A[0][0], B[0][1]), cMul(A[0][1], B[1][1])) ],
        [ cAdd(cMul(A[1][0], B[0][0]), cMul(A[1][1], B[1][0])), cAdd(cMul(A[1][0], B[0][1]), cMul(A[1][1], B[1][1])) ]
    ];
}

export function matInv2(A) {
    const a=A[0][0], b=A[0][1], c=A[1][0], d=A[1][1];
    const det = cSub(cMul(a,d), cMul(b,c));
    const det2 = det.re*det.re + det.im*det.im;
    if (det2 === 0) return null;
    const invDet = { re: det.re/det2, im: -det.im/det2 };
    return [
        [ cMul( d, invDet), cMul({re:-b.re, im:-b.im}, invDet) ],
        [ cMul({re:-c.re, im:-c.im}, invDet), cMul( a, invDet) ]
    ];
}

export function isIdentity2(A, eps=1e-6) {
    // Projective normalization by a11 if possible
    const a11 = A[0][0];
    const s = cAbs(a11);
    let B = A;
    if (s > eps) {
        const inv = { re: a11.re/(s*s), im: -a11.im/(s*s) };
        B = [
            [ cMul(A[0][0], inv), cMul(A[0][1], inv) ],
            [ cMul(A[1][0], inv), cMul(A[1][1], inv) ]
        ];
    }
    const id = [ [{re:1,im:0},{re:0,im:0}], [{re:0,im:0},{re:1,im:0}] ];
    return cAbs(cSub(B[0][0], id[0][0]))<eps && cAbs(cSub(B[0][1], id[0][1]))<eps &&
           cAbs(cSub(B[1][0], id[1][0]))<eps && cAbs(cSub(B[1][1], id[1][1]))<eps;
}

// Edge cycle computation via alternating side pairings
export function computeEdgeCycleByPairings(faceA, faceB, facesMetaById) {
    const metaA = (facesMetaById && facesMetaById[faceA]) ? facesMetaById[faceA] : null;
    const metaB = (facesMetaById && facesMetaById[faceB]) ? facesMetaById[faceB] : null;
    if (!metaA || !metaB || !metaA.matrix || !metaB.matrix) {
        return { length: 1, ok: false, reason: 'missing matrices' };
    }
    const gA = parseMatrixFromMetaString(metaA.matrix);
    const gB = parseMatrixFromMetaString(metaB.matrix);
    if (!gA || !gB) return { length: 1, ok: false, reason: 'parse failed' };

    const MAX_STEPS = 200;
    function findLen(G1, G2) {
        let prod = [ [{re:1,im:0},{re:0,im:0}], [{re:0,im:0},{re:1,im:0}] ];
        for (let k=1; k<=MAX_STEPS; k++) {
            const M = (k % 2 === 1) ? G1 : G2;
            prod = matMul2(prod, M);
            // check projective identity
            if (isIdentity2([ [ {...prod[0][0] }, { ...prod[0][1] } ], [ { ...prod[1][0] }, { ...prod[1][1] } ] ])) {
                return k;
            }
        }
        return null;
    }
    const invA = matInv2(gA), invB = matInv2(gB);
    const combos = [ [gA,gB], [gA,invB], [invA,gB], [invA,invB] ].filter(x => x[0] && x[1]);
    const lens = [];
    for (const [G1,G2] of combos) {
        const L = findLen(G1, G2);
        if (L) lens.push(L);
    }
    if (!lens.length) return { length: 1, ok: false, reason: 'no return ≤200' };
    return { length: Math.min(...lens), ok: true };
}

// Angle formatting
export function formatAngle(theta) {
    const ratio = theta / Math.PI;
    // Candidate denominators commonly appearing in hyperbolic/polyhedral angles
    const dens = [1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 16, 18, 20, 24, 30, 36, 48, 60];
    const EPS = 2e-3; // tolerance in ratio-space

    for (const d of dens) {
        const nFloat = Math.round(ratio * d);
        const approx = nFloat / d;
        if (Math.abs(approx - ratio) < EPS) {
            // Reduce fraction n/d
            const n = Math.abs(nFloat);
            const gcd = (a, b) => (b ? gcd(b, a % b) : a);
            const g = gcd(n, d);
            const rn = (nFloat < 0 ? -1 : 1) * (n / g);
            const rd = d / g;
            // If denominator is 1, just return "π" or "0"
            if (rd === 1) {
                if (rn === 0) return "0 radians";
                if (rn === 1) return "π radians";
                if (rn === -1) return "-π radians";
                return `${rn} π radians`;
            }
            // pπ/q form, omit p=1
            return `${rn === 1 ? '' : rn}π/${rd} radians`;
        }
    }

    // Fallback: degrees
    const deg = theta * 180 / Math.PI;
    return `${deg.toFixed(2)}°`;
}

// Easing function
export function easeInOutQuad(t) {
    return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

// External payload detection
export function getExternalVectorsPayload() {
    // Prefer explicit URL param ?vectors= (Base64-encoded text)
    try {
        const params = new URLSearchParams(window.location.search);
        const vParam = params.get('vectors');
        if (vParam) {
            try {
                const decoded = atob(decodeURIComponent(vParam));
                if (decoded && decoded.trim().length > 0) return decoded;
            } catch (e) {
                console.warn('Failed to decode vectors param:', e);
            }
        }
    } catch (e) {
        console.warn('URL parsing failed:', e);
    }
    // Fallback: localStorage key written by other pages
    try {
        const ls = localStorage.getItem('poincare_input');
        if (ls && ls.trim().length > 0) return ls;
    } catch (e) {
        // ignore storage access errors
    }
    return null;
}

export function getExternalFacesPayload() {
    // Prefer explicit URL param ?faces= (Base64-encoded JSON)
    try {
        const params = new URLSearchParams(window.location.search);
        const fParam = params.get('faces');
        if (fParam) {
            try {
                const decoded = atob(decodeURIComponent(fParam));
                const obj = JSON.parse(decoded);
                if (obj && typeof obj === 'object') return obj;
            } catch (e) {
                console.warn('Failed to decode faces param:', e);
            }
        }
    } catch (e) {
        console.warn('URL parsing failed (faces):', e);
    }
    // Fallback: localStorage key written by PSL2CtoSO31.html
    try {
        const ls = localStorage.getItem('poincare_faces');
        if (ls && ls.trim().length > 0) {
            const obj = JSON.parse(ls);
            if (obj && typeof obj === 'object') return obj;
        }
    } catch (e) { /* ignore storage errors */ }
    return null;
}

export function normalizeFacesMeta(obj) {
    if (!obj || !Array.isArray(obj.faces)) return [];
    const byId = [];
    obj.faces.forEach((f, i) => {
        const id = (typeof f.index === 'number' ? (f.index - 1) : i);
        byId[id] = {
            word: (typeof f.word === 'string' ? f.word : ''),
            matrix: (typeof f.matrix === 'string' ? f.matrix : ''),
            sdf: Array.isArray(f.sdf) ? f.sdf : null
        };
    });
    return byId;
}

export function vectorsToTextarea(vectors) {
    return vectors.map(v => v.join(', ')).join('\n');
}
