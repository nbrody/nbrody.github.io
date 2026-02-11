function matMul(m1, m2) {
    return [
        m1[0] * m2[0] + m1[1] * m2[2],
        m1[0] * m2[1] + m1[1] * m2[3],
        m1[2] * m2[0] + m1[3] * m2[2],
        m1[2] * m2[1] + m1[3] * m2[3]
    ];
}

function matInv(m) {
    const det = m[0] * m[3] - m[1] * m[2];
    if (det < -0.5) {
        // det = -1: Inv is [d, -b, -c, a] / -1 = [-d, b, c, -a]
        // But for reflections g, g^2 = I, so g^-1 = g.
        // Let's use the general formula: (1/det) * [d, -b, -c, a]
        return [-m[3], m[1], m[2], -m[0]];
    }
    return [m[3], -m[1], -m[2], m[0]];
}

function matDet(m) {
    return m[0] * m[3] - m[1] * m[2];
}

function intGcd(a, b) {
    a = Math.abs(Math.round(a));
    b = Math.abs(Math.round(b));
    while (b !== 0) {
        const t = a % b;
        a = b;
        b = t;
    }
    return a;
}

function sameMatrixUpToSign(m1, m2, tol = 1e-9) {
    let same = true;
    let negSame = true;
    for (let i = 0; i < 4; i += 1) {
        if (Math.abs(m1[i] - m2[i]) > tol) same = false;
        if (Math.abs(m1[i] + m2[i]) > tol) negSame = false;
    }
    return same || negSame;
}

function parseExtraMatrices(text) {
    const lines = text.split('\n');
    const parsed = [];
    const warnings = [];
    const seen = new Set();

    for (let i = 0; i < lines.length; i += 1) {
        const raw = lines[i];
        const stripped = raw.replace(/#.*/, '').trim();
        if (!stripped) continue;

        const matches = stripped.match(/[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/gi);
        if (!matches || matches.length !== 4) {
            warnings.push(`line ${i + 1}: expected exactly 4 numeric entries`);
            continue;
        }

        const m = matches.map(Number);
        if (m.some(x => !Number.isFinite(x))) {
            warnings.push(`line ${i + 1}: contains non-finite values`);
            continue;
        }

        if (m.some(x => Math.abs(x - Math.round(x)) > 1e-9)) {
            warnings.push(`line ${i + 1}: entries must be integers`);
            continue;
        }

        const mInt = m.map(x => Math.round(x));
        const det = matDet(mInt);
        if (Math.abs(det) < 1e-9) {
            warnings.push(`line ${i + 1}: det=0 (matrix must be invertible)`);
            continue;
        }

        const key = matrixKey(mInt);
        if (seen.has(key)) continue;
        seen.add(key);
        parsed.push(mInt);
    }

    const hasS = parsed.some(m => sameMatrixUpToSign(m, S));
    return { parsed, warnings, hasS };
}

function formatMatrixLine(m) {
    const n = normalizePSL(m).map(x => Math.round(x));
    return `[[${n[0]},${n[1]}],[${n[2]},${n[3]}]]`;
}

function setClickStatus(msg, isWarn = false) {
    clickStatusEl.textContent = msg;
    clickStatusEl.style.color = isWarn ? '#ffb3b3' : '#bdd9ec';
}

function appendExtraMatrixIfNew(m) {
    const n = normalizePSL(m).map(x => Math.round(x));
    const det = matDet(n);
    if (Math.abs(det) < 1e-9) {
        return { added: false, reason: 'singular', matrix: n };
    }

    const parsed = parseExtraMatrices(extraMatricesInput.value);
    const existing = new Set(parsed.parsed.map(matrixKey));
    const k = matrixKey(n);
    if (existing.has(k)) {
        return { added: false, reason: 'duplicate', matrix: n };
    }

    const line = formatMatrixLine(n);
    const text = extraMatricesInput.value.trim();
    extraMatricesInput.value = text ? `${text}\n${line}` : line;
    return { added: true, matrix: n };
}

function removeExtraMatrixIfPresent(m) {
    const n = normalizePSL(m).map(x => Math.round(x));
    const targetKey = matrixKey(n);
    const lines = extraMatricesInput.value.split('\n');
    const kept = [];
    let removed = false;

    for (const raw of lines) {
        const stripped = raw.replace(/#.*/, '').trim();
        if (!stripped) {
            kept.push(raw);
            continue;
        }

        const matches = stripped.match(/[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/gi);
        if (!matches || matches.length !== 4) {
            kept.push(raw);
            continue;
        }

        const vals = matches.map(Number);
        if (vals.some(x => !Number.isFinite(x))) {
            kept.push(raw);
            continue;
        }

        if (vals.some(x => Math.abs(x - Math.round(x)) > 1e-9)) {
            kept.push(raw);
            continue;
        }

        const mInt = vals.map(x => Math.round(x));
        if (Math.abs(matDet(mInt)) < 1e-9) {
            kept.push(raw);
            continue;
        }

        if (matrixKey(mInt) === targetKey) {
            removed = true;
            continue;
        }

        kept.push(raw);
    }

    if (removed) {
        extraMatricesInput.value = kept.join('\n').replace(/\n{3,}/g, '\n\n').trim();
    }
    return removed;
}

function normalizePSL(m) {
    let out = m.slice();
    const isIntegral = out.every(x => Number.isFinite(x) && Math.abs(x - Math.round(x)) < 1e-9);
    if (isIntegral) {
        out = out.map(x => Math.round(x));
        let g = 0;
        for (const x of out) {
            const ax = Math.abs(x);
            if (ax === 0) continue;
            g = g === 0 ? ax : intGcd(g, ax);
        }
        if (g > 1) {
            out = out.map(x => x / g);
        }
    }

    // Secondary normalization (e.g. for PSL representation)
    // For PGL, we still want a consistent representative.
    if (out[2] < -EPS || (Math.abs(out[2]) <= EPS && out[3] < -EPS) || (Math.abs(out[2]) <= EPS && Math.abs(out[3]) <= EPS && out[0] < -EPS)) {
        return out.map(x => -x);
    }
    return out;
}

function matrixKey(m) {
    const n = normalizePSL(m);
    return `${Math.round(n[0])},${Math.round(n[1])},${Math.round(n[2])},${Math.round(n[3])}`;
}

function matrixNorm(m) {
    return Math.max(Math.abs(m[0]), Math.abs(m[1]), Math.abs(m[2]), Math.abs(m[3]));
}
