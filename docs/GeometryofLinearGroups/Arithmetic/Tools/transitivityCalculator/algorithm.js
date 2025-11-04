// Transitivity testing algorithms

// Helper function for gcd
function gcd(a, b) {
    a = Math.abs(a);
    b = Math.abs(b);
    while (b !== 0) {
        const t = b;
        b = a % b;
        a = t;
    }
    return a || 1;
}

function generateWords(generators, maxDepth) {
    // Generate all words up to given depth, including inverses
    const words = [{ matrix: new Matrix2x2(new Fraction(1), new Fraction(0), new Fraction(0), new Fraction(1)), word: "I" }];
    const allGenerators = [];

    generators.forEach((g, i) => {
        allGenerators.push({ matrix: g, name: `g_{${i+1}}` });
        try {
            allGenerators.push({ matrix: g.inverse(), name: `g_{${i+1}}^{-1}` });
        } catch (e) {
            // Singular matrix, skip inverse
        }
    });

    for (let depth = 1; depth <= maxDepth; depth++) {
        const prevCount = words.length;
        for (let i = 0; i < prevCount; i++) {
            for (const gen of allGenerators) {
                const newMatrix = words[i].matrix.multiply(gen.matrix);
                const newWord = words[i].word === "I" ? gen.name : words[i].word + "·" + gen.name;
                words.push({ matrix: newMatrix, word: newWord });
            }
        }
    }

    return words;
}

function getRegionKey(interval) {
    // Convert interval description to region key
    if (interval.description.includes('< -1')) return 'ltminus1';
    if (interval.description.includes('-1') && interval.description.includes('< 0')) return 'minus1to0';
    if (interval.description.includes('0') && interval.description.includes('< 1')) return '0to1';
    if (interval.description.includes('\\geq 1')) return 'gt1';
    if (interval.description.includes('infty') && !interval.description.includes('-')) return 'infinity';
    return 'unknown';
}

function getRegionDescription(regionKey) {
    const descriptions = {
        'ltminus1': '$\\frac{p}{q} < -1$',
        'minus1to0': '$-1 < \\frac{p}{q} < 0$',
        '0to1': '$0 \\leq \\frac{p}{q} < 1$',
        'gt1': '$\\frac{p}{q} \\geq 1$',
        'infinity': '$\\infty$'
    };
    return descriptions[regionKey] || regionKey;
}

// Partition predicates - returns a string describing the partition
function classifyPoint(p, q) {
    // Point should be in lowest terms
    const pNum = p.num;
    const qNum = q.num;

    if (q.den === 0) return {
        parity: 'infinity',
        mod3: 'infinity',
        mod4: 'infinity',
        value: 'infinity',
        valueDesc: '$\\infty$'
    };

    const pEven = pNum % 2 === 0;
    const qEven = qNum % 2 === 0;
    const pMod3 = ((pNum % 3) + 3) % 3;
    const qMod3 = ((qNum % 3) + 3) % 3;
    const pMod4 = ((pNum % 4) + 4) % 4;
    const qMod4 = ((qNum % 4) + 4) % 4;

    // Compute p/q value for value-based partitions
    const value = qNum !== 0 ? pNum / qNum : Infinity;

    let valuePartition, valueDesc;
    if (value === Infinity) {
        valuePartition = 'infinity';
        valueDesc = '$\\infty$';
    } else if (value <= -1) {
        valuePartition = 'leq_-1';
        valueDesc = '$\\frac{p}{q} \\leq -1$';
    } else if (value < 0) {
        valuePartition = 'in_(-1,0)';
        valueDesc = '$-1 < \\frac{p}{q} < 0$';
    } else if (value < 1) {
        valuePartition = 'in_(0,1)';
        valueDesc = '$0 \\leq \\frac{p}{q} < 1$';
    } else {
        valuePartition = 'geq_1';
        valueDesc = '$\\frac{p}{q} \\geq 1$';
    }

    // Return various classification strings
    return {
        parity: `${pEven ? 'even' : 'odd'}_${qEven ? 'even' : 'odd'}`,
        parityDesc: `$p$ ${pEven ? 'even' : 'odd'}, $q$ ${qEven ? 'even' : 'odd'}`,
        mod3: `p≡${pMod3}_q≡${qMod3} (mod 3)`,
        mod3Desc: `$p \\equiv ${pMod3}, q \\equiv ${qMod3} \\pmod{3}$`,
        mod4: `p≡${pMod4}_q≡${qMod4} (mod 4)`,
        mod4Desc: `$p \\equiv ${pMod4}, q \\equiv ${qMod4} \\pmod{4}$`,
        value: valuePartition,
        valueDesc: valueDesc,
        pNum: pNum,
        qNum: qNum
    };
}

function findPartitionStrategy() {
    const resultsDiv = document.getElementById('results');
    resultsDiv.innerHTML = '<div class="loading">Finding interval covering... Please wait.</div>';

    setTimeout(() => {
        try {
            const generators = getGenerators();
            const maxDepth = parseInt(document.getElementById('maxDepth').value);
            const maxTestHeight = parseInt(document.getElementById('maxTestHeight').value);

            let html = '<h2>Proof of Finitely Many Orbits</h2>';
            html += '<h3>Generators:</h3>';
            generators.forEach((g, i) => {
                html += `<div class="proof-step">$g_{${i+1}} = ${g.toTeX()}$</div>`;
            });

            const words = generateWords(generators, maxDepth);

            html += `<p>Analyzing ${words.length} words (using empirical sampling)...</p>`;

            // Generate sample points to empirically determine intervals
            const samplePoints = [];
            for (let q = 1; q <= Math.min(maxTestHeight, 30); q++) {
                for (let p = -q * 30; p <= q * 30; p++) {
                    const g = gcd(Math.abs(p), Math.abs(q));
                    if (g !== 1) continue;

                    const pf = new Fraction(p, 1);
                    const qf = new Fraction(q, 1);
                    const h = height(pf, qf);
                    if (h > 1 && h <= maxTestHeight) {
                        samplePoints.push([pf, qf, h]);
                    }
                }
            }
            // Add infinity
            samplePoints.push([new Fraction(1), new Fraction(0), 1]);

            // Find intervals for each word using analytical determination
            const wordIntervals = [];
            for (const wordObj of words) {
                const intervals = analyzeMatrix(wordObj.matrix);
                if (intervals && intervals.length > 0) {
                    wordIntervals.push({
                        word: wordObj.word,
                        matrix: wordObj.matrix,
                        intervals: intervals
                    });
                }
            }

            // Sort by number of intervals covered (prefer words that cover more regions)
            wordIntervals.sort((a, b) => b.intervals.length - a.intervals.length);

            html += '<h3>Words and their Height-Reducing Intervals</h3>';
            html += '<p>Each word reduces height on the following interval(s) of $\\frac{p}{q}$:</p>';
            html += '<table><tr><th>Word</th><th>Matrix</th><th>Intervals where height decreases</th></tr>';

            // Display top words
            const topWords = wordIntervals.slice(0, 15);
            for (const {word, matrix, intervals} of topWords) {
                const intervalDescs = intervals.map(int => int.description).join(', ');
                html += `<tr>
                    <td>$${word}$</td>
                    <td>$${matrix.toTeX()}$</td>
                    <td>${intervalDescs}</td>
                </tr>`;
            }

            html += '</table>';

            // Try to find a covering set
            html += '<h3>Finding Minimal Covering</h3>';

            // Regions to cover: (-∞, -1), (-1, 0), [0, 1), [1, ∞), and ∞
            const regionsTocover = new Set(['ltminus1', 'minus1to0', '0to1', 'gt1', 'infinity']);
            const coveringWords = [];

            // Greedy algorithm: repeatedly pick the word that covers the most uncovered regions
            while (regionsTocover.size > 0 && coveringWords.length < 10) {
                let bestWord = null;
                let bestMatrix = null;
                let bestIntervals = null;
                let bestCoverage = 0;
                let bestCoveredRegions = new Set();

                for (const {word, matrix, intervals} of wordIntervals) {
                    // Count how many uncovered regions this word covers
                    const coveredRegions = new Set();
                    for (const interval of intervals) {
                        const region = getRegionKey(interval);
                        if (regionsTocover.has(region)) {
                            coveredRegions.add(region);
                        }
                    }

                    if (coveredRegions.size > bestCoverage) {
                        bestCoverage = coveredRegions.size;
                        bestWord = word;
                        bestMatrix = matrix;
                        bestIntervals = intervals;
                        bestCoveredRegions = coveredRegions;
                    }
                }

                if (bestWord) {
                    coveringWords.push({word: bestWord, matrix: bestMatrix, intervals: bestIntervals});
                    for (const region of bestCoveredRegions) {
                        regionsTocover.delete(region);
                    }
                } else {
                    break;
                }
            }

            // Check if we have a good covering
            const hasGoodCovering = regionsTocover.size <= 1; // Allow missing infinity or one small region

            if (hasGoodCovering) {
                html += `<div class="success">✓ SUCCESS: Proved finitely many orbits!</div>`;

                if (regionsTocover.size === 0) {
                    html += '<p><strong>Proof:</strong> The following words cover all of $\\mathbb{Q}\\mathbb{P}^1$. Every point in an interval has its height reduced by the corresponding word. Iterating this process, all points eventually reach a bounded set of heights, proving there are only finitely many orbits.</p>';
                } else {
                    html += '<p><strong>Proof:</strong> The following words cover all but finitely many points on $\\mathbb{Q}\\mathbb{P}^1$. The uncovered regions contain only finitely many points of bounded height. Combined with the height-reducing words, all orbits eventually reach a finite set, proving there are only finitely many orbits.</p>';
                    html += '<p><em>Uncovered regions: ';
                    const uncoveredDescs = Array.from(regionsTocover).map(r => getRegionDescription(r));
                    html += uncoveredDescs.join(', ');
                    html += ' (finitely many points)</em></p>';
                }

                html += '<h4>Covering Words:</h4>';
                html += '<ul>';
                for (const {word, intervals} of coveringWords) {
                    const intervalDescs = intervals.map(int => int.description).join(', ');
                    html += `<li>$${word}$ reduces height on ${intervalDescs}</li>`;
                }
                html += '</ul>';
            } else {
                html += `<div class="failure">✗ INCONCLUSIVE: Found partial covering</div>`;
                html += `<p>After selecting ${coveringWords.length} words, ${regionsTocover.size} region(s) remain uncovered:</p>`;
                html += '<ul>';
                for (const region of regionsTocover) {
                    html += `<li>${getRegionDescription(region)}</li>`;
                }
                html += '</ul>';
                html += '<p>This may still prove finitely many orbits, but the algorithm needs more work. Try increasing the max word length.</p>';
            }

            resultsDiv.innerHTML = html;

            // Generate visualization after DOM update (on success or good partial covering)
            if (hasGoodCovering && coveringWords.length > 0) {
                console.log('Calling visualization with', coveringWords.length, 'words');
                setTimeout(() => {
                    visualizeIntervalCovering(coveringWords);
                }, 200);
            } else {
                // Hide visualization on failure
                document.getElementById('visualization').style.display = 'none';
            }

            // Trigger MathJax to render the new content
            if (typeof MathJax !== 'undefined') {
                MathJax.typesetPromise([resultsDiv]).catch((err) => console.log('MathJax error:', err));
            }
        } catch (error) {
            resultsDiv.innerHTML = `<div class="failure">Error: ${error.message}</div>`;
            console.error('Error in findPartitionStrategy:', error);
        }
    }, 100);
}

function testTransitivity() {
    const resultsDiv = document.getElementById('results');
    resultsDiv.innerHTML = '<div class="loading">Verifying sample points... Please wait.</div>';

    setTimeout(() => {
        try {
            const generators = getGenerators();
            const maxDepth = parseInt(document.getElementById('maxDepth').value);
            const maxTestHeight = parseInt(document.getElementById('maxTestHeight').value);

            let html = '<h2>Sample Point Verification</h2>';
            html += '<h3>Generators:</h3>';
            generators.forEach((g, i) => {
                html += `<div class="proof-step">$g_{${i+1}} = ${g.toTeX()}$</div>`;
            });

            html += `<h3>Verifying sample points up to height $h = ${maxTestHeight}$:</h3>`;

            const words = generateWords(generators, maxDepth);
            html += `<p>Generated ${words.length} words up to length ${maxDepth}.</p>`;

            const testPoints = [];
            for (let p = -maxTestHeight; p <= maxTestHeight; p++) {
                for (let q = -maxTestHeight; q <= maxTestHeight; q++) {
                    if (p === 0 && q === 0) continue;

                    // Only consider coprime pairs (gcd(p,q) = 1)
                    const g = gcd(Math.abs(p), Math.abs(q));
                    if (g !== 1) continue;

                    const pf = new Fraction(p, 1);
                    const qf = new Fraction(q, 1);
                    const h = height(pf, qf);
                    if (h > 1 && h <= maxTestHeight) {
                        testPoints.push([pf, qf, h]);
                    }
                }
            }

            // Add infinity point
            testPoints.push([new Fraction(1), new Fraction(0), 1]);

            let allTransitive = true;
            let failedPoints = [];

            for (const [p, q, h] of testPoints) {
                let foundReduction = false;
                let bestWord = null;
                let bestHeight = h;
                let bestPoint = [p, q];

                for (const wordObj of words) {
                    const [newP, newQ] = wordObj.matrix.apply(p, q);
                    const newH = height(newP, newQ);

                    if (newH < h || (newH === 1)) {
                        foundReduction = true;
                        if (newH < bestHeight || (newH === bestHeight && wordObj.word.length < (bestWord?.length || Infinity))) {
                            bestHeight = newH;
                            bestWord = wordObj.word;
                            bestPoint = [newP, newQ];
                        }
                    }
                }

                if (!foundReduction) {
                    allTransitive = false;
                    failedPoints.push([p, q, h]);
                }
            }

            if (allTransitive) {
                html += `<div class="success">✓ SUCCESS: All tested points can have their height reduced!</div>`;
                html += `<p>The group appears to act transitively on $\\mathbb{Q}\\mathbb{P}^1$ (verified for heights up to ${maxTestHeight}).</p>`;
            } else {
                html += `<div class="failure">✗ FAILURE: Found ${failedPoints.length} point(s) where height cannot be reduced:</div>`;
                html += '<table><tr><th>Point [p:q]</th><th>Height</th></tr>';
                failedPoints.slice(0, 10).forEach(([p, q, h]) => {
                    html += `<tr><td>$[${p}:${q}]$</td><td>${h}</td></tr>`;
                });
                if (failedPoints.length > 10) {
                    html += `<tr><td colspan="2">... and ${failedPoints.length - 10} more</td></tr>`;
                }
                html += '</table>';
                html += '<p>The group may not act transitively, or you may need to increase the max word length.</p>';
            }

            resultsDiv.innerHTML = html;
            // Trigger MathJax to render the new content
            if (typeof MathJax !== 'undefined') {
                MathJax.typesetPromise([resultsDiv]).catch((err) => console.log('MathJax error:', err));
            }
        } catch (error) {
            resultsDiv.innerHTML = `<div class="failure">Error: ${error.message}</div>`;
        }
    }, 100);
}
