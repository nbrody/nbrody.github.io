import { Act, getNodeID, Rational } from './pAdic.js';

/**
 * Multiply two rational matrices
 */
function multiplyMatrices(a, b) {
    // a and b are 2x2 matrices [[a11, a12], [a21, a22]]
    const [[a11, a12], [a21, a22]] = a;
    const [[b11, b12], [b21, b22]] = b;

    return [
        [a11.mul(b11).add(a12.mul(b21)), a11.mul(b12).add(a12.mul(b22))],
        [a21.mul(b11).add(a22.mul(b21)), a21.mul(b12).add(a22.mul(b22))]
    ];
}

/**
 * Generate all reduced group words up to given length
 * A word is reduced if it doesn't contain gi*gi⁻¹ or gi⁻¹*gi
 * Returns array of {matrix, word, lastLetter} where word is string like "g1", "g1*g2", etc.
 */
export function generateGroupWords(generators, maxLength) {
    const words = [];
    const n = generators.length;

    // Precompute inverses
    const inverses = generators.map(gen => {
        const [[a, b], [c, d]] = gen;
        const det = a.mul(d).sub(b.mul(c));
        const detInv = new Rational(det.den, det.num);
        const minusOne = new Rational(-1n, 1n);
        return [
            [d.mul(detInv), b.mul(detInv).mul(minusOne)],
            [c.mul(detInv).mul(minusOne), a.mul(detInv)]
        ];
    });

    // Add identity
    const identity = [
        [new Rational(1n, 1n), new Rational(0n, 1n)],
        [new Rational(0n, 1n), new Rational(1n, 1n)]
    ];
    words.push({ matrix: identity, word: 'e', length: 0, lastLetter: null });

    if (maxLength === 0 || n === 0) return words;

    // Add generators and their inverses
    for (let i = 0; i < n; i++) {
        words.push({
            matrix: generators[i],
            word: `g${i+1}`,
            length: 1,
            lastLetter: { index: i, inverse: false }
        });

        words.push({
            matrix: inverses[i],
            word: `g${i+1}⁻¹`,
            length: 1,
            lastLetter: { index: i, inverse: true }
        });
    }

    // Generate longer words (only reduced ones)
    let currentLength = 1;
    while (currentLength < maxLength) {
        const wordsAtLength = words.filter(w => w.length === currentLength);

        for (const w of wordsAtLength) {
            for (let i = 0; i < n; i++) {
                // Try to multiply by gi
                // This is reduced if the last letter is not gi⁻¹
                if (!w.lastLetter || !(w.lastLetter.index === i && w.lastLetter.inverse === true)) {
                    const newMatrix = multiplyMatrices(w.matrix, generators[i]);
                    const newWord = `${w.word}*g${i+1}`;
                    words.push({
                        matrix: newMatrix,
                        word: newWord,
                        length: currentLength + 1,
                        lastLetter: { index: i, inverse: false }
                    });
                }

                // Try to multiply by gi⁻¹
                // This is reduced if the last letter is not gi
                if (!w.lastLetter || !(w.lastLetter.index === i && w.lastLetter.inverse === false)) {
                    const newMatrixInv = multiplyMatrices(w.matrix, inverses[i]);
                    const newWordInv = `${w.word}*g${i+1}⁻¹`;
                    words.push({
                        matrix: newMatrixInv,
                        word: newWordInv,
                        length: currentLength + 1,
                        lastLetter: { index: i, inverse: true }
                    });
                }
            }
        }

        currentLength++;
    }

    return words;
}

/**
 * Compute orbit of base vertex under group words
 */
export function computeOrbit(baseVertex, generators, p, maxLength) {
    const words = generateGroupWords(generators, maxLength);
    const orbitMap = new Map();

    // For each group word, apply it to the base vertex
    for (const { matrix, word, length } of words) {
        const vertex = Act(matrix, baseVertex, p);
        const id = getNodeID(vertex.k, vertex.q);

        if (!orbitMap.has(id)) {
            orbitMap.set(id, {
                vertex,
                words: [word],
                minLength: length
            });
        } else {
            // Add this word as another way to reach this vertex
            const existing = orbitMap.get(id);
            existing.words.push(word);
            existing.minLength = Math.min(existing.minLength, length);
        }
    }

    return orbitMap;
}

/**
 * Format orbit information for display
 */
export function formatOrbitInfo(orbitMap) {
    const vertices = Array.from(orbitMap.values());
    vertices.sort((a, b) => a.minLength - b.minLength);

    let html = `<p class="mb-2"><strong>Orbit size:</strong> ${vertices.length} vertices</p>`;
    html += `<div class="text-xs max-h-60 overflow-y-auto">`;

    for (const { vertex, words, minLength } of vertices) {
        const shortestWords = words.filter(w => {
            const len = w === 'e' ? 0 : w.split('*').length;
            return len === minLength;
        });

        html += `<div class="mb-2 pb-2 border-b border-gray-700">`;
        html += `<div class="font-mono">$\\lfloor ${vertex.q.toString()} \\rfloor_{${vertex.k}}$</div>`;
        html += `<div class="text-gray-400 mt-1">via: ${shortestWords.slice(0, 3).join(', ')}${shortestWords.length > 3 ? '...' : ''}</div>`;
        html += `</div>`;
    }

    html += `</div>`;
    return html;
}

/**
 * Compute stabilizer elements (elements that fix the basepoint)
 */
export function computeStabilizer(baseVertex, orbitMap) {
    const baseId = getNodeID(baseVertex.k, baseVertex.q);
    const stabilizer = [];

    if (!orbitMap || !orbitMap.has(baseId)) {
        return stabilizer;
    }

    // Get all words that map to the base vertex
    const baseEntry = orbitMap.get(baseId);
    stabilizer.push(...baseEntry.words);

    return stabilizer;
}

/**
 * Format stabilizer information for display
 */
export function formatStabilizerInfo(stabilizer) {
    if (!stabilizer || stabilizer.length === 0) {
        return `<p class="text-gray-400">No stabilizer elements found (other than identity).</p>`;
    }

    // Sort by length
    const sortedStab = [...stabilizer].sort((a, b) => {
        const lenA = a === 'e' ? 0 : a.split('*').length;
        const lenB = b === 'e' ? 0 : b.split('*').length;
        return lenA - lenB;
    });

    let html = `<p class="mb-2"><strong>Stabilizer size:</strong> ${sortedStab.length} elements</p>`;
    html += `<div class="space-y-1">`;

    for (const word of sortedStab) {
        const wordLen = word === 'e' ? 0 : word.split('*').length;
        html += `<div class="flex items-center gap-2 py-1">`;
        html += `<span class="text-gray-500 text-xs w-6">${wordLen}</span>`;
        html += `<code class="text-gray-300 text-xs">${word}</code>`;
        html += `</div>`;
    }

    html += `</div>`;
    return html;
}
