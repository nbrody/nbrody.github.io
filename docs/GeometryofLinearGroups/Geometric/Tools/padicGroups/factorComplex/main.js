document.addEventListener('DOMContentLoaded', () => {
    const generateBtn = document.getElementById('generate-btn');
    const numberInput = document.getElementById('number-input');
    const svg = d3.select("#main-svg");
    const container = document.getElementById('graph-container');

    const getPrimeFactorization = (n) => {
        const factors = {};
        let d = 2;
        let num = n;
        while (d * d <= num) {
            while (num % d === 0) {
                factors[d] = (factors[d] || 0) + 1;
                num /= d;
            }
            d++;
        }
        if (num > 1) {
            factors[num] = (factors[num] || 0) + 1;
        }
        return factors;
    };

    const getDivisors = (n, primeFactors) => {
        const primes = Object.keys(primeFactors).map(Number);
        const divisors = new Set([1]);
        primes.forEach(p => {
            const currentDivisors = [...divisors];
            for (let i = 1; i <= primeFactors[p]; i++) {
                currentDivisors.forEach(d => {
                    divisors.add(d * Math.pow(p, i));
                });
            }
        });
        return Array.from(divisors).sort((a, b) => a - b);
    };

    const buildGraph = (n) => {
        if (!n || n < 2) return null;
        const primeFactors = getPrimeFactorization(n);
        const primes = Object.keys(primeFactors).map(Number).sort((a, b) => a - b);
        const divisors = getDivisors(n, primeFactors);

        const nodes = divisors.map(d => ({ id: d }));
        const edges = [];
        const nodeSet = new Set(divisors);

        nodes.forEach(node => {
            primes.forEach(p => {
                const targetId = node.id * p;
                if (nodeSet.has(targetId)) {
                    edges.push({ source: node.id, target: targetId, prime: p });
                }
            });
        });
        return { nodes, edges, primes };
    };

    const createVisualization = (graphData) => {
        svg.selectAll('*').remove();
        if (!graphData) return;

        const { nodes, edges, primes } = graphData;
        const width = container.clientWidth;
        const height = container.clientHeight;

        const g = svg.append('g');

        const colorScale = d3.scaleOrdinal(d3.schemeCategory10).domain(primes);

        let primeVectors = {};
        // Space vectors so that p1 is at angle 0 (pointing right),
        // and pk is at angle π(1 - 1/k). Ensure vertical order: p_i is beneath p_{i+1}
        const k = Math.max(1, primes.length);
        const thetaMax = Math.PI * (1 - 1 / k); // target angle for p_k
        const initialMagnitude = Math.min(width, height) / (k > 1 ? k + 1 : 4);
        primes.forEach((p, i) => {
            // i = 0..k-1
            const t = k === 1 ? 0 : i / (k - 1);
            const angle = t * thetaMax; // 0 ... π(1 - 1/k)
            primeVectors[p] = {
                x: initialMagnitude * Math.cos(angle),
                y: initialMagnitude * Math.sin(angle) // screen y grows downward; this makes larger i sit higher up to π/2, then arc toward left
            };
        });

        const nodeMap = new Map(nodes.map(n => [n.id, n]));

        const calculateNodePositions = () => {
            nodes.forEach(node => {
                const factors = getPrimeFactorization(node.id);
                node.x = 0;
                node.y = 0;
                for (const p in factors) {
                    node.x += factors[p] * primeVectors[p].x;
                    node.y += factors[p] * primeVectors[p].y;
                }
            });
        };

        calculateNodePositions();

        edges.sort((a, b) => primes.indexOf(a.prime) - primes.indexOf(b.prime));

        const edgeGroups = g.selectAll('.edge-group')
            .data(edges, d => `${d.source}-${d.target}`)
            .enter()
            .append('g')
            .attr('class', 'edge-group');

        // Casing for 3D effect
        edgeGroups.append('line').attr('class', 'edge-casing');
        // Actual colored line
        edgeGroups.append('line')
            .attr('class', 'edge-line')
            .style('stroke', d => colorScale(d.prime));

        const nodeGroups = g.selectAll('.node')
            .data(nodes, d => d.id)
            .enter()
            .append('g')
            .attr('class', 'node');

        // Add text first so we can measure and size the circle accordingly
        nodeGroups.append('text')
            .text(d => d.id)
            .attr('text-anchor', 'middle')
            .attr('dominant-baseline', 'middle')
            .attr('font-size', 14);

        nodeGroups.append('circle')
            .attr('class', 'node-circle');

        // Size circles to fit text with padding
        nodeGroups.each(function () {
            const gSel = d3.select(this);
            const text = gSel.select('text');
            const bbox = text.node().getBBox();
            const r = Math.max(12, 0.6 * Math.max(bbox.width, bbox.height)) + 6; // padding
            gSel.select('circle')
                .attr('r', r);
        });

        const updatePositions = () => {
            nodeGroups.attr('transform', d => `translate(${d.x}, ${d.y})`);
            edgeGroups.selectAll('line')
                .attr('x1', d => nodeMap.get(d.source).x)
                .attr('y1', d => nodeMap.get(d.source).y)
                .attr('x2', d => nodeMap.get(d.target).x)
                .attr('y2', d => nodeMap.get(d.target).y);
        };

        const drag = d3.drag()
            .on('start', function (event, d) {
                d3.select(this).raise();
                this.__originalVector = { ...primeVectors[d.prime] };
                this.__startPos = { x: event.x, y: event.y };
            })
            .on('drag', function (event, d) {
                const dx = event.x - this.__startPos.x;
                const dy = event.y - this.__startPos.y;
                primeVectors[d.prime].x = this.__originalVector.x + dx;
                primeVectors[d.prime].y = this.__originalVector.y + dy;
                calculateNodePositions();
                updatePositions();
            })
            .on('end', function () {
                delete this.__originalVector;
                delete this.__startPos;
            });

        edgeGroups.call(drag);

        const zoom = d3.zoom()
            .scaleExtent([0.1, 4])
            .on('zoom', (event) => {
                g.attr('transform', event.transform);
            });

        svg.call(zoom);

        // Compute positions first, then measure and fit
        updatePositions();

        // If graph is trivial (single node), center it nicely
        let bounds = g.node().getBBox();
        if (!isFinite(bounds.width) || !isFinite(bounds.height) || bounds.width === 0 || bounds.height === 0) {
            const fallbackScale = 1;
            const initialTransform = d3.zoomIdentity.translate(width / 2, height / 2).scale(fallbackScale);
            svg.call(zoom.transform, initialTransform);
        } else {
            const fullWidth = bounds.width;
            const fullHeight = bounds.height;
            const midX = bounds.x + fullWidth / 2;
            const midY = bounds.y + fullHeight / 2;
            const scale = Math.min(width / fullWidth, height / fullHeight) * 0.9; // slightly larger to ensure everything fits
            const translate = [width / 2 - scale * midX, height / 2 - scale * midY];
            const initialTransform = d3.zoomIdentity.translate(translate[0], translate[1]).scale(scale);
            svg.call(zoom.transform, initialTransform);
        }
    };

    const generate = () => {
        const n = parseInt(numberInput.value);
        const graphData = buildGraph(n);
        createVisualization(graphData);
    };

    generateBtn.addEventListener('click', generate);

    // Initial generation
    generate();
});