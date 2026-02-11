function ensureTilingCache() {
    if (state.tilingCacheCount === state.tileCount) return;
    state.tilingCache = generatePSL2ZTiling(state.tileCount);
    state.tilingCacheCount = state.tileCount;
}

function buildPSLOrbitSample() {
    const points = [];
    const seen = new Set();
    let countI = 0;
    let countOmega = 0;

    for (const item of state.tilingCache) {
        const g = item.m;
        const depth = item.depth;

        const zi = mobiusComplex(g, I_BASE);
        if (Number.isFinite(zi.re) && Number.isFinite(zi.im) && zi.im > EPS) {
            const keyI = `i|${round6(zi.re)}|${round6(zi.im)}`;
            if (!seen.has(keyI)) {
                seen.add(keyI);
                points.push({ kind: 'i', z: zi, g, depth });
                countI += 1;
            }
        }

        const zo = mobiusComplex(g, OMEGA_BASE);
        if (Number.isFinite(zo.re) && Number.isFinite(zo.im) && zo.im > EPS) {
            const keyO = `omega|${round6(zo.re)}|${round6(zo.im)}`;
            if (!seen.has(keyO)) {
                seen.add(keyO);
                points.push({ kind: 'omega', z: zo, g, depth });
                countOmega += 1;
            }
        }
    }

    return { points, counts: { i: countI, omega: countOmega } };
}

function ensurePSLOrbitCache() {
    if (state.pslOrbitCacheCount === state.tileCount) return;
    ensureTilingCache();
    const sample = buildPSLOrbitSample();
    state.pslOrbitCache = sample.points;
    state.pslOrbitCounts = sample.counts;
    state.pslOrbitCacheCount = state.tileCount;
}

function findNearestPSLOrbitPoint(px, py, maxRadius = CLICK_RADIUS_PX) {
    ensurePSLOrbitCache();
    const maxD2 = maxRadius * maxRadius;
    let best = null;
    let bestD2 = maxD2;

    for (const point of state.pslOrbitCache) {
        const c = toCanvas(point.z);
        const dx = c.x - px;
        const dy = c.y - py;
        const d2 = dx * dx + dy * dy;
        if (d2 <= bestD2) {
            best = point;
            bestD2 = d2;
        }
    }

    return best;
}

function handleOrbitClick(clientX, clientY) {
    if (!state.showPSLOrbit) {
        setClickStatus('Enable the clickable PSL2(Z)-orbit sample first.', true);
        return;
    }

    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const hit = findNearestPSLOrbitPoint(x, y);
    if (!hit) {
        setClickStatus('No orbit point selected. Zoom in and click closer.', true);
        return;
    }

    const stabilizerBase = hit.kind === 'i' ? S : ST;
    const stabilizer = normalizePSL(matMul(matMul(hit.g, stabilizerBase), matInv(hit.g)));
    const appended = appendExtraMatrixIfNew(stabilizer);

    if (appended.added) {
        const label = hit.kind === 'i' ? 'i (order 2)' : 'omega (order 3)';
        setClickStatus(`Added stabilizer conjugate for orbit point in PSL2(Z)·${label}.`);
    } else if (appended.reason === 'duplicate') {
        const removed = removeExtraMatrixIfPresent(stabilizer);
        if (removed) {
            setClickStatus('Clicked accounted vertex: removed its stabilizer from extras.');
        } else {
            setClickStatus('Stabilizer already present in extras (up to sign).');
        }
    } else {
        setClickStatus('Computed stabilizer was not a valid SL2(Z) matrix after rounding.', true);
    }

    recomputeModel();
}

function generatePSL2ZTiling(maxTiles) {
    const gens = [
        { name: 'T', inv: 't', m: T },
        { name: 't', inv: 'T', m: T_INV },
        { name: 'S', inv: 'S', m: S }
    ];

    const queue = [{ m: I, depth: 0, last: null }];
    const visited = new Set([matrixKey(I)]);
    const out = [];
    const normBound = Math.max(6000, 8 * maxTiles);

    while (queue.length > 0 && out.length < maxTiles) {
        const item = queue.shift();
        out.push(item);

        for (const g of gens) {
            if (item.last && g.name === item.last.inv) continue;

            const nm = normalizePSL(matMul(item.m, g.m));
            const key = matrixKey(nm);
            if (visited.has(key)) continue;

            const q = nm[2] * nm[2] + nm[3] * nm[3];
            if (q > normBound) continue;

            const next = { m: nm, depth: item.depth + 1, last: g };
            visited.add(key);
            queue.push(next);
        }
    }

    return out;
}

function buildSubgroupModel() {
    const p = state.p;
    const a = [1 + 2 * p, p, 2, 1];
    const b = [1 + 2 * p, 1, 2 * p, 1];

    const baseGenerators = [];
    const baseSeen = new Set();

    function addBaseGenerator(name, m) {
        const key = matrixKey(m);
        if (baseSeen.has(key)) return false;
        baseSeen.add(key);
        baseGenerators.push({ name, m });
        return true;
    }

    function inverseNameFor(name) {
        if (name === 'a') return 'A';
        if (name === 'b') return 'B';
        if (name === 'd') return 'D';
        if (name.startsWith('g')) return `G${name.slice(1)}`;
        return `${name}Inv`;
    }

    if (state.includeAB) {
        addBaseGenerator('a', a);
        addBaseGenerator('b', b);
    }
    if (state.includeDiagP) {
        addBaseGenerator('d', [p, 0, 0, 1]);
    }
    for (let i = 0; i < state.extraMatrices.length; i += 1) {
        addBaseGenerator(`g${i + 1}`, state.extraMatrices[i]);
    }

    const gens = [];
    for (const g of baseGenerators) {
        const invM = matInv(g.m);
        const selfInverse = matrixKey(invM) === matrixKey(g.m);
        const invName = selfInverse ? g.name : inverseNameFor(g.name);

        gens.push({ name: g.name, inverse: invName, m: g.m });
        if (!selfInverse) {
            gens.push({ name: invName, inverse: g.name, m: invM });
        }
    }

    const invName = {};
    for (const g of gens) {
        invName[g.name] = g.inverse;
    }

    const queue = [{ m: I, depth: 0, last: null, word: 'e' }];
    const visited = new Set([matrixKey(I)]);
    const elements = [queue[0]];

    while (queue.length > 0) {
        const item = queue.shift();
        if (item.depth >= state.depth) continue;

        for (const g of gens) {
            if (item.last && g.name === invName[item.last]) continue;

            const nm = normalizePSL(matMul(item.m, g.m));
            if (!Number.isFinite(matrixNorm(nm))) continue;
            if (matrixNorm(nm) > 1e9) continue;

            const key = matrixKey(nm);
            if (visited.has(key)) continue;

            const next = {
                m: nm,
                depth: item.depth + 1,
                last: g.name,
                word: item.word === 'e' ? g.name : `${item.word}${g.name}`
            };

            visited.add(key);
            elements.push(next);
            queue.push(next);

            if (elements.length >= MAX_SUBGROUP_ELEMENTS) {
                queue.length = 0;
                break;
            }
        }
    }

    const axisA = axisFromMatrix(a);
    const axisB = axisFromMatrix(b);

    const orbitAxes = [];
    const seenAxes = new Set();

    for (const element of elements) {
        if (element.depth === 0) continue;
        if (state.includeAB) {
            const mappedA = axisA ? mapAxisByMatrix(element.m, axisA) : null;
            const mappedB = axisB ? mapAxisByMatrix(element.m, axisB) : null;

            if (mappedA) {
                const key = axisSignature(mappedA, 'a');
                if (!seenAxes.has(key)) {
                    seenAxes.add(key);
                    orbitAxes.push({ axis: mappedA, depth: element.depth, source: 'a' });
                }
            }

            if (mappedB) {
                const key = axisSignature(mappedB, 'b');
                if (!seenAxes.has(key)) {
                    seenAxes.add(key);
                    orbitAxes.push({ axis: mappedB, depth: element.depth, source: 'b' });
                }
            }
        }

        if (orbitAxes.length >= MAX_ORBIT_AXES) break;
    }

    const orbitI = [];
    const seenI = new Set();
    const iBase = { re: 0, im: 1 };

    for (const element of elements) {
        const zi = mobiusComplex(element.m, iBase);
        if (!Number.isFinite(zi.re) || !Number.isFinite(zi.im)) continue;
        if (zi.im <= EPS || zi.im > 1e8 || Math.abs(zi.re) > 1e8) continue;

        const key = `${round6(zi.re)}|${round6(zi.im)}`;
        if (seenI.has(key)) continue;

        seenI.add(key);
        orbitI.push({ z: zi, depth: element.depth, m: element.m });

        if (orbitI.length >= MAX_ORBIT_I_POINTS) break;
    }

    const orbitIHull = computeOrbitIHyperbolicHull(orbitI);
    const convexCore = computeConvexCore(orbitI, orbitIHull);
    const topologicalType = computeTopologicalType(convexCore, orbitI, elements);
    const typeStats = { hyperbolic: 0, elliptic: 0, parabolic: 0, reflection: 0 };
    for (const el of elements) {
        const t = classifyElement(el.m);
        typeStats[t] += 1;
    }

    return {
        a,
        b,
        elements,
        orbitAxes,
        orbitI,
        orbitIHull,
        convexCore,
        topologicalType,
        axisA,
        axisB,
        typeStats,
        baseGenerators
    };
}

function axisSignature(axis, tag) {
    if (axis.type === 'vertical') {
        return `${tag}|v|${round6(axis.x)}`;
    }
    return `${tag}|a|${round6(axis.x1)}|${round6(axis.x2)}`;
}

function round6(x) {
    return Math.round(x * 1e6) / 1e6;
}

function isPrime(n) {
    if (n < 2) return false;
    if (n === 2) return true;
    if (n % 2 === 0) return false;
    const r = Math.floor(Math.sqrt(n));
    for (let k = 3; k <= r; k += 2) {
        if (n % k === 0) return false;
    }
    return true;
}

function fmt(x, digits = 6) {
    if (!Number.isFinite(x)) return 'inf';
    const abs = Math.abs(x);
    if (abs >= 1e4 || (abs > 0 && abs < 1e-4)) return x.toExponential(3);
    return Number(x.toFixed(digits)).toString();
}

function fmtMatrix(m) {
    return `[[${fmt(m[0], 0)}, ${fmt(m[1], 0)}], [${fmt(m[2], 0)}, ${fmt(m[3], 0)}]]`;
}

function fmtAxis(axis) {
    if (!axis) return 'none (not hyperbolic)';
    if (axis.type === 'vertical') {
        return `x = ${fmt(axis.x)}`;
    }
    return `[${fmt(axis.x1)}, ${fmt(axis.x2)}]`;
}


function updateStats() {
    const model = state.model;
    if (!model) return;

    const warnings = [];
    if (!isPrime(state.p)) {
        warnings.push('p is not prime.');
    }
    if (state.p !== 2 && state.p % 2 === 0) {
        warnings.push('p is even (statement assumes odd prime p).');
    }
    if (state.p === 2 && !state.hasExtraS) {
        warnings.push('p=2: extras do not currently include S=((0,-1),(1,0)).');
    }
    if (state.extraMatrixWarnings.length > 0) {
        const maxShown = Math.min(6, state.extraMatrixWarnings.length);
        for (let i = 0; i < maxShown; i += 1) {
            warnings.push(`extra matrix parse warning: ${state.extraMatrixWarnings[i]}`);
        }
        if (state.extraMatrixWarnings.length > maxShown) {
            warnings.push(`... ${state.extraMatrixWarnings.length - maxShown} more parse warnings`);
        }
    }

    const trA = model.a[0] + model.a[3];
    const trB = model.b[0] + model.b[3];
    const lenA = translationLength(model.a);
    const lenB = translationLength(model.b);

    const axisCross = axesIntersect(model.axisA, model.axisB);

    const detA = matDet(model.a);
    const detB = matDet(model.b);
    let html = '';
    if (warnings.length > 0) {
        html += `<div class="warn">${warnings.map(w => `* ${w}`).join('<br>')}</div><br>`;
    }

    html += `p = ${state.p}\n`;
    html += `include a, b: ${state.includeAB ? 'yes' : 'no'}\n`;
    html += `include D=[[p,0],[0,1]]: ${state.includeDiagP ? 'yes' : 'no'}\n`;
    html += `extra generators accepted: ${state.extraMatrices.length}\n`;
    html += `contains S among extras: ${state.hasExtraS ? 'yes' : 'no'}\n`;
    html += `total base generators (a,b plus extras, dedup PSL): ${model.baseGenerators.length}\n\n`;
    html += `a = ${fmtMatrix(model.a)}   det(a)=${fmt(detA, 0)}\n`;
    html += `b = ${fmtMatrix(model.b)}   det(b)=${fmt(detB, 0)}\n\n`;
    html += `trace(a) = ${fmt(trA, 0)}, length(a) = ${fmt(lenA, 5)}\n`;
    html += `trace(b) = ${fmt(trB, 0)}, length(b) = ${fmt(lenB, 5)}\n\n`;
    html += `axis(a) endpoints: ${fmtAxis(model.axisA)}\n`;
    html += `axis(b) endpoints: ${fmtAxis(model.axisB)}\n`;
    html += `axes intersect: ${axisCross ? 'yes (endpoints interleave)' : 'no (disjoint or tangent)'}\n\n`;
    html += `generated elements (<= depth ${state.depth}): ${model.elements.length}\n`;
    html += `hyperbolic: ${model.typeStats.hyperbolic}\n`;
    html += `elliptic: ${model.typeStats.elliptic}\n`;
    html += `parabolic: ${model.typeStats.parabolic}\n`;
    if (model.typeStats.reflection > 0) {
        html += `reflection: ${model.typeStats.reflection}\n`;
    }
    html += `orbit axes shown: ${state.showOrbit ? model.orbitAxes.length : 0}\n`;
    html += `orbit(i) points shown: ${state.showIOrbit ? model.orbitI.length : 0}\n`;
    html += `hull(i) vertices shown: ${state.showIHull ? model.orbitIHull.length : 0}\n`;
    html += `convex core vertices: ${state.showConvexCore ? model.convexCore.length : 0}\n`;

    if (model.topologicalType) {
        const tt = model.topologicalType;
        html += `\n── quotient orbifold type ──\n`;
        html += `(g, n₂, n₃, b) = (${tt.genus}, ${tt.n_2}, ${tt.n_3}, ${tt.b})\n`;
        // Build description
        const parts = [];
        if (tt.genus === 0) parts.push('genus 0 (sphere)');
        else if (tt.genus === 1) parts.push('genus 1 (torus)');
        else parts.push(`genus ${tt.genus}`);
        if (tt.n_2 > 0) parts.push(`${tt.n_2} cone pt${tt.n_2 > 1 ? 's' : ''} of order 2`);
        if (tt.n_3 > 0) parts.push(`${tt.n_3} cone pt${tt.n_3 > 1 ? 's' : ''} of order 3`);
        if (tt.b > 0) parts.push(`${tt.b} boundary component${tt.b > 1 ? 's' : ''}`);
        else parts.push('closed (no boundary)');
        html += parts.join(', ') + '\n';
        // Euler characteristic check
        const chi_orb = 2 - 2 * tt.genus - tt.b - tt.n_2 * 0.5 - tt.n_3 * (2 / 3);
        html += `χ_orb = ${fmt(chi_orb, 4)}\n`;
        html += `area = ${fmt(-2 * Math.PI * chi_orb, 4)}\n`;
    } else if (model.convexCore.length >= 3) {
        html += `\ntopological type: computing...\n`;
    }

    html += `\nPSL2(Z)-orbit sample shown: ${state.showPSLOrbit ? state.pslOrbitCache.length : 0} (i:${state.pslOrbitCounts.i}, omega:${state.pslOrbitCounts.omega})`;

    statsEl.innerHTML = html;
}

