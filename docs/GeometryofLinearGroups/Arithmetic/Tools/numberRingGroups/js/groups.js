// Names for the finite stabilizers. A finite subgroup of PGL_2(K) (char 0) is cyclic, dihedral, A_4,
// S_4 or A_5, and is determined by its order and element orders.

/** The image in PGL_2 of a finite S ⊂ GL_2(O) containing the roots of unity: { order, name, tex } */
export function identifyGroup(space, S, w) {
    const K = space.nf;
    const pkey = (g) => { let best = null; for (const z of K.mu) { const k = space.matKey(space.matMul(space.scalar(z), g)); if (best === null || k < best) best = k; } return best; };
    const classes = new Map();
    for (const g of S) { const k = pkey(g); if (!classes.has(k)) classes.set(k, g); }
    const reps = [...classes.values()];
    const n = reps.length;
    const isScalar = (g) => K.isZero(g[0][1]) && K.isZero(g[1][0]) && K.eq(g[0][0], g[1][1]);
    const order = (g) => { let p = g, k = 1; while (!isScalar(p)) { p = space.matMul(p, g); k++; if (k > 1000) return Infinity; } return k; };
    const ords = reps.map(order);
    const maxOrd = Math.max(...ords);
    let name, tex;
    if (maxOrd === n) { name = `C${n}`; tex = n === 1 ? '1' : `C_{${n}}`; }
    else if (n === 4) { name = 'V4'; tex = 'C_2 \\times C_2'; }
    else if (n === 12 && maxOrd === 3) { name = 'A4'; tex = 'A_4'; }
    else if (n === 24 && maxOrd === 4) { name = 'S4'; tex = 'S_4'; }
    else if (n === 60 && maxOrd === 5) { name = 'A5'; tex = 'A_5'; }
    else { name = `D${n / 2}`; tex = n === 6 ? 'S_3' : `D_{${n / 2}}`; }
    void w;
    return { order: n, name, tex };
}
