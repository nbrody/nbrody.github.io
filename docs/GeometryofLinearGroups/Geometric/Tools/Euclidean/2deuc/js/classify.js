// classify.js — Classification of discrete subgroups of Isom(ℝ²)
const TOL = 1e-4;
const PI = Math.PI;

function matDet(A) { return A[0][0] * A[1][1] - A[0][1] * A[1][0]; }

function matEq(A, B) {
    return Math.abs(A[0][0] - B[0][0]) < TOL && Math.abs(A[0][1] - B[0][1]) < TOL &&
        Math.abs(A[1][0] - B[1][0]) < TOL && Math.abs(A[1][1] - B[1][1]) < TOL;
}

function isoKey(f) {
    const r = v => Math.round(v * 500);
    return `${r(f.A[0][0])},${r(f.A[0][1])},${r(f.A[1][0])},${r(f.A[1][1])},${r(f.b[0])},${r(f.b[1])}`;
}

function compose(f, g) {
    return {
        A: [
            [f.A[0][0] * g.A[0][0] + f.A[0][1] * g.A[1][0], f.A[0][0] * g.A[0][1] + f.A[0][1] * g.A[1][1]],
            [f.A[1][0] * g.A[0][0] + f.A[1][1] * g.A[1][0], f.A[1][0] * g.A[0][1] + f.A[1][1] * g.A[1][1]]
        ],
        b: [
            f.A[0][0] * g.b[0] + f.A[0][1] * g.b[1] + f.b[0],
            f.A[1][0] * g.b[0] + f.A[1][1] * g.b[1] + f.b[1]
        ]
    };
}

function inv(f) {
    const At = [[f.A[0][0], f.A[1][0]], [f.A[0][1], f.A[1][1]]];
    return { A: At, b: [-(At[0][0] * f.b[0] + At[0][1] * f.b[1]), -(At[1][0] * f.b[0] + At[1][1] * f.b[1])] };
}

function idIso() { return { A: [[1, 0], [0, 1]], b: [0, 0] }; }

function isOrthogonal(A) {
    const a = A[0][0], b = A[0][1], c = A[1][0], d = A[1][1];
    return Math.abs(a * a + c * c - 1) < TOL && Math.abs(a * b + c * d) < TOL && Math.abs(b * b + d * d - 1) < TOL;
}

function rotAngle(A) {
    if (matDet(A) < 0) return null;
    return Math.atan2(A[1][0], A[0][0]);
}

function rationalOrder(angle) {
    const a = ((angle % (2 * PI)) + 2 * PI) % (2 * PI);
    if (a < TOL || Math.abs(a - 2 * PI) < TOL) return 1;
    for (let n = 2; n <= 24; n++) {
        for (let k = 1; k < n; k++) {
            if (Math.abs(a - 2 * PI * k / n) < TOL) return n;
        }
    }
    return null;
}

function generateElements(gens, maxDepth = 10, maxEl = 800) {
    const allG = [];
    gens.forEach(g => { allG.push(g); allG.push(inv(g)); });
    const els = [idIso()];
    const seen = new Set([isoKey(idIso())]);
    let frontier = [idIso()];
    for (let d = 0; d < maxDepth && els.length < maxEl; d++) {
        const next = [];
        for (const iso of frontier) {
            for (const g of allG) {
                const c = compose(g, iso);
                const k = isoKey(c);
                if (!seen.has(k)) {
                    seen.add(k); els.push(c); next.push(c);
                    if (els.length >= maxEl) break;
                }
            }
            if (els.length >= maxEl) break;
        }
        frontier = next;
        if (!frontier.length) break;
    }
    return { elements: els, saturated: frontier.length === 0 };
}

// Mirror axis angle θ from reflection matrix A
function mirrorAxisAngle(A) {
    return Math.atan2(A[1][0], A[0][0]) / 2;
}

// Glide component of an orientation-reversing element
function glideComponent(e) {
    const th = mirrorAxisAngle(e.A);
    return e.b[0] * Math.cos(th) + e.b[1] * Math.sin(th);
}

// Count distinct mirror directions (mod π) among pure reflections
function mirrorDirections(elements) {
    const dirs = new Set();
    for (const e of elements) {
        if (matDet(e.A) >= 0) continue;
        if (Math.abs(glideComponent(e)) > TOL) continue; // glide, not mirror
        const th = ((mirrorAxisAngle(e.A) % PI) + PI) % PI;
        dirs.add(Math.round(th * 1000));
    }
    return dirs.size;
}

export function parseMatrix(entries) {
    const [a, b, tx, c, d, ty] = entries.map(Number);
    if (entries.some(v => isNaN(Number(v)))) return null;
    return { A: [[a, b], [c, d]], b: [tx, ty] };
}

export function classifyGroup(generators) {
    // Validate
    for (let i = 0; i < generators.length; i++) {
        if (!isOrthogonal(generators[i].A)) {
            return { success: false, reason: `Generator ${i + 1}: linear part is not in O(2). Columns must be orthonormal.` };
        }
        const d = matDet(generators[i].A);
        if (Math.abs(Math.abs(d) - 1) > TOL) {
            return { success: false, reason: `Generator ${i + 1}: det = ${d.toFixed(4)}, must be ±1.` };
        }
    }

    // Check rotation discreteness
    for (let i = 0; i < generators.length; i++) {
        const ang = rotAngle(generators[i].A);
        if (ang !== null && rationalOrder(ang) === null) {
            return {
                success: true, discrete: false,
                reason: `Generator ${i + 1} rotates by ${(ang * 180 / PI).toFixed(2)}°, which is not a rational multiple of 360°. The point group is dense in SO(2), so the group is not discrete.`
            };
        }
    }

    // Generate elements
    const { elements, saturated } = generateElements(generators);

    // Extract translations
    const I2 = [[1, 0], [0, 1]];
    const trans = elements.filter(e => matEq(e.A, I2) && (Math.abs(e.b[0]) > TOL || Math.abs(e.b[1]) > TOL));

    // Determine rank
    let rank = 0, basis = [];
    if (trans.length > 0) {
        // Find shortest non-zero translation
        trans.sort((a, b) => (a.b[0] ** 2 + a.b[1] ** 2) - (b.b[0] ** 2 + b.b[1] ** 2));
        basis = [trans[0].b];
        rank = 1;
        for (const t of trans) {
            const cross = basis[0][0] * t.b[1] - basis[0][1] * t.b[0];
            if (Math.abs(cross) > TOL) { rank = 2; basis.push(t.b); break; }
        }
        // Check translation discreteness (no accumulation near 0)
        if (rank === 1) {
            const minLen = Math.sqrt(basis[0][0] ** 2 + basis[0][1] ** 2);
            for (const t of trans) {
                const len = Math.sqrt(t.b[0] ** 2 + t.b[1] ** 2);
                if (len < minLen * 0.4 && len > TOL) {
                    return { success: true, discrete: false, reason: `Translations accumulate near zero (found translations of length ${minLen.toFixed(4)} and ${len.toFixed(4)}). The group is not discrete.` };
                }
            }
        }
    }

    if (!saturated && elements.length >= 800) {
        // Possibly infinite without periodicity
        if (rank === 0) {
            return { success: true, discrete: false, reason: `Generated 800+ elements without saturating and found no translations. The group may be non-discrete (dense rotations or infinite point group).` };
        }
    }

    // Point group (distinct linear parts)
    const ptMats = [];
    const ptSeen = new Set();
    for (const e of elements) {
        const k = `${Math.round(e.A[0][0] * 1000)},${Math.round(e.A[0][1] * 1000)},${Math.round(e.A[1][0] * 1000)},${Math.round(e.A[1][1] * 1000)}`;
        if (!ptSeen.has(k)) { ptSeen.add(k); ptMats.push(e.A); }
    }
    const rots = ptMats.filter(A => matDet(A) > 0);
    const refls = ptMats.filter(A => matDet(A) < 0);
    const hasRefl = refls.length > 0;

    let maxOrd = 1;
    for (const A of rots) {
        const a = rotAngle(A);
        if (a !== null) { const n = rationalOrder(a); if (n && n > maxOrd) maxOrd = n; }
    }

    // Analyze mirrors vs glides
    let hasMirrors = false, hasGlides = false;
    for (const e of elements) {
        if (matDet(e.A) >= 0) continue;
        if (Math.abs(glideComponent(e)) < TOL) hasMirrors = true;
        else hasGlides = true;
    }

    // Classify
    let groupId, groupName;
    if (rank === 0) {
        const n = rots.length;
        if (hasRefl) { groupId = `D${n}`; groupName = `D${n} (Dihedral, order ${2 * n})`; }
        else { groupId = `C${n}`; groupName = n === 1 ? `C1 (Trivial)` : `C${n} (Cyclic, order ${n})`; }
    } else if (rank === 1) {
        groupId = classifyFrieze(elements, basis[0], hasRefl, hasMirrors, hasGlides);
        groupName = FRIEZE[groupId] || groupId;
    } else {
        groupId = classifyWallpaper(elements, maxOrd, hasRefl, hasMirrors, hasGlides, basis);
        groupName = WALLPAPER[groupId] || groupId;
    }

    // Build isometry type labels
    const genLabels = generators.map(g => {
        const d = matDet(g.A);
        if (d > 0) {
            if (matEq(g.A, I2)) return `translation (${g.b[0].toFixed(2)}, ${g.b[1].toFixed(2)})`;
            const ang = rotAngle(g.A);
            return `rotation ${(ang * 180 / PI).toFixed(1)}°`;
        } else {
            if (Math.abs(glideComponent(g)) < TOL) return `reflection`;
            return `glide reflection`;
        }
    });

    return {
        success: true, discrete: true, groupId, groupName,
        rank, maxRotationOrder: maxOrd, ptGroupOrder: ptMats.length,
        numRotations: rots.length, numReflections: refls.length,
        generators: generators.map((g, i) => ({ ...g, type: genLabels[i].split(' ')[0] })),
        genLabels,
        details: `Rank ${rank} · Point group order ${ptMats.length} · Max rotation order ${maxOrd}` +
            (hasMirrors ? ' · Has mirrors' : '') + (hasGlides ? ' · Has glide reflections' : '')
    };
}

function classifyFrieze(elements, dir, hasRefl, hasMirrors, hasGlides) {
    const len = Math.sqrt(dir[0] ** 2 + dir[1] ** 2);
    const d = [dir[0] / len, dir[1] / len];
    let has180 = false;
    for (const e of elements) {
        if (matDet(e.A) > 0) {
            const a = rotAngle(e.A);
            if (a !== null && Math.abs(Math.abs(a) - PI) < TOL) has180 = true;
        }
    }
    if (!hasRefl && !has180) return 'p1_frieze';
    if (has180 && !hasRefl) return 'p2_frieze';
    if (hasMirrors && !has180 && !hasGlides) return 'p11m';
    if (!hasMirrors && hasGlides && !has180) return 'p11g';
    if (hasMirrors && has180) {
        const md = mirrorDirections(elements);
        if (md >= 2) return 'p2mm_frieze';
        return 'p2gm_frieze';
    }
    if (has180 && hasGlides) return 'p2mg_frieze';
    return 'p1_frieze';
}

function classifyWallpaper(elements, maxOrd, hasRefl, hasMirrors, hasGlides, basis) {
    if (maxOrd === 1 && !hasRefl) return 'p1';
    if (maxOrd === 2 && !hasRefl) return 'p2';
    if (maxOrd === 3 && !hasRefl) return 'p3';
    if (maxOrd === 4 && !hasRefl) return 'p4';
    if (maxOrd === 6 && !hasRefl) return 'p6';
    if (maxOrd === 6) return 'p6mm';

    if (maxOrd === 1) {
        if (hasMirrors && hasGlides) return 'cm';
        if (hasMirrors) return 'pm';
        return 'pg';
    }
    if (maxOrd === 2) {
        if (!hasMirrors) return 'p2gg';
        const md = mirrorDirections(elements);
        if (md >= 2 && hasGlides) return 'c2mm';
        if (md >= 2) return 'p2mm';
        return 'p2mg';
    }
    if (maxOrd === 4) {
        const md = mirrorDirections(elements);
        return md >= 3 ? 'p4mm' : 'p4gm';
    }
    if (maxOrd === 3) {
        // p3m1 vs p31m: check if mirrors align with lattice vectors
        for (const e of elements) {
            if (matDet(e.A) >= 0) continue;
            const th = mirrorAxisAngle(e.A);
            const v1a = Math.atan2(basis[0][1], basis[0][0]);
            const diff = Math.abs(((th - v1a) % PI + PI) % PI);
            if (diff < TOL || Math.abs(diff - PI) < TOL) return 'p3m1';
            return 'p31m';
        }
    }
    return 'p1';
}

const FRIEZE = {
    p1_frieze: 'p1 — Hop', p11m: 'p11m — Jump', p11g: 'p11g — Sidle',
    p2_frieze: 'p2 — Spinning hop', p2mm_frieze: 'p2mm — Spinning sidle',
    p2mg_frieze: 'p2mg — Spinning jump', p2gm_frieze: 'p2gm — Step'
};

const WALLPAPER = {
    p1: 'p1', p2: 'p2', pm: 'pm', pg: 'pg', cm: 'cm',
    p2mm: 'p2mm', p2mg: 'p2mg', p2gg: 'p2gg', c2mm: 'c2mm',
    p4: 'p4', p4mm: 'p4mm', p4gm: 'p4gm',
    p3: 'p3', p3m1: 'p3m1', p31m: 'p31m', p6: 'p6', p6mm: 'p6mm'
};
