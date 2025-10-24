import { getNodeID, Rational } from './pAdic.js';
import { computeConvexHull } from './convexHull.js';
import { computeVoronoiCell } from './voronoiCell.js';

let currentTransform = null;
let selectedVertexId = null;

/**
 * Display information about a clicked vertex
 */
function displayVertexInfo(node, orbitMap, svg) {
    const vertexId = node.data.id;
    const k = node.data.k;
    const q = new Rational(node.data.q_num, node.data.q_den);

    // Update selected vertex
    selectedVertexId = vertexId;

    // Remove previous selection highlight
    svg.selectAll('.selection-ring').remove();

    // Add selection highlight
    const nodeElement = svg.selectAll('.node')
        .filter(d => d.data.id === vertexId);

    // Vertex size scaling by depth
    const VERTEX_SHRINK = 0.88;
    const vertexScale = (depth) => Math.pow(VERTEX_SHRINK, depth);

    nodeElement.insert('circle', ':first-child')
        .attr('class', 'selection-ring')
        .attr('r', 12 * vertexScale(node.depth))
        .style('fill', 'none')
        .style('stroke', '#fbbf24')
        .style('stroke-width', (2 * vertexScale(node.depth)) + 'px')
        .style('opacity', 0.8);

    let html = `<p class="mb-2"><strong>Vertex:</strong> $\\lfloor ${q.toString()} \\rfloor_{${k}}$</p>`;

    // Check if it's in the orbit
    if (orbitMap && orbitMap.has(vertexId)) {
        const orbitEntry = orbitMap.get(vertexId);
        const { words, minLength } = orbitEntry;

        // Sort words by length
        const sortedWords = [...words].sort((a, b) => {
            const lenA = a === 'e' ? 0 : a.split('*').length;
            const lenB = b === 'e' ? 0 : b.split('*').length;
            return lenA - lenB;
        });

        html += `<p class="mb-2 text-green-400"><strong>In orbit!</strong></p>`;
        html += `<p class="mb-1 text-sm text-gray-400">Reachable via ${sortedWords.length} word(s):</p>`;
        html += `<div class="text-xs space-y-1 max-h-32 overflow-y-auto">`;

        // Show first few words
        const maxShow = 10;
        for (let i = 0; i < Math.min(sortedWords.length, maxShow); i++) {
            const word = sortedWords[i];
            const wordLen = word === 'e' ? 0 : word.split('*').length;
            html += `<div class="flex items-center gap-2">`;
            html += `<span class="text-gray-500 w-6">${wordLen}</span>`;
            html += `<code class="text-gray-300">${word}</code>`;
            html += `</div>`;
        }

        if (sortedWords.length > maxShow) {
            html += `<p class="text-gray-500 text-xs mt-1">... and ${sortedWords.length - maxShow} more</p>`;
        }

        html += `</div>`;
    } else {
        html += `<p class="text-gray-400">Not in orbit of base vertex.</p>`;
    }

    const selectedVertexDiv = document.getElementById('selected-vertex');
    if (selectedVertexDiv) {
        selectedVertexDiv.innerHTML = html;

        // Render MathJax
        if (window.MathJax) {
            MathJax.typeset([selectedVertexDiv]);
        }
    }
}

export function drawTree(rootData, v_reduced, v_acted, p, orbitMap, onVertexClick) {
    const svg = d3.select("#tree-vis");
    svg.selectAll("*").remove();

    const container = document.getElementById('container');
    const width = container.clientWidth;
    const height = container.clientHeight;
    const margin = { top: 50, right: 20, bottom: 50, left: 80 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const g = svg.attr("width", width).attr("height", height).append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);

    // Apply previous transform if exists
    if (currentTransform) {
        g.attr("transform", currentTransform);
    }

    const treemap = d3.tree().size([innerWidth, innerHeight]);
    const root = d3.hierarchy(rootData, d => d.children);
    treemap(root);

    // Create set of orbit vertex IDs
    const orbitVertices = new Set();
    if (orbitMap) {
        for (const [id, _] of orbitMap) {
            orbitVertices.add(id);
        }
    }

    // Compute convex hull of orbit
    const { vertices: hullVertices, edges: hullEdges } = computeConvexHull(orbitMap, root);

    // Compute Voronoi cell of [0]_0
    const { vertices: voronoiVertices, halfEdges: voronoiHalfEdges, fullEdges: voronoiFullEdges } = computeVoronoiCell(orbitMap, root, p);

    // Vertical shrink per depth
    const BASE_Y = 120;
    const SHRINK_Y = 0.82;
    const depthToY = (depth) => {
        let s = 0;
        let step = BASE_Y;
        for (let i = 0; i < depth; i++) { s += step; step *= SHRINK_Y; }
        return s;
    };
    const scaledY = d => depthToY(d.depth);

    const kToY = new Map();
    root.descendants().forEach(d => {
        if (!kToY.has(d.data.k)) {
            kToY.set(d.data.k, scaledY(d));
        }
    });

    // Add k-level labels
    g.selectAll('.k-label').remove();
    const kEntries = Array.from(kToY.entries()).sort((a, b) => a[0] - b[0]);
    g.selectAll('.k-label')
        .data(kEntries)
        .enter()
        .append('text')
        .attr('class', 'k-label')
        .attr('x', -8)
        .attr('y', d => d[1])
        .attr('dy', '.35em')
        .attr('text-anchor', 'end')
        .style('fill', '#9ca3af')
        .style('font-family', 'Helvetica, Arial, sans-serif')
        .style('font-size', '13px')
        .text(d => `k=${d[0]}`);

    const v1_id = getNodeID(v_reduced.k, v_reduced.q);
    const v2_id = getNodeID(v_acted.k, v_acted.q);

    // Compute path between vertices
    const pathNodes = new Set();
    const pathEdges = new Set();

    function collectAncestors(node) {
        const set = new Set();
        for (let curr = node; curr; curr = curr.parent) set.add(curr);
        return set;
    }

    function addPathUp(from, toExclusive) {
        for (let curr = from; curr && curr !== toExclusive; curr = curr.parent) {
            pathNodes.add(curr.data.id);
            if (curr.parent) {
                const key = `${curr.parent.data.id}->${curr.data.id}`;
                pathEdges.add(key);
            }
        }
        if (toExclusive) pathNodes.add(toExclusive.data.id);
    }

    const n1 = root.find(node => node.data.id === v1_id);
    const n2 = root.find(node => node.data.id === v2_id);
    if (n1 && n2) {
        const anc1 = collectAncestors(n1);
        let lca = n2;
        while (lca && !anc1.has(lca)) lca = lca.parent;
        addPathUp(n1, lca);
        addPathUp(n2, lca);
    }

    // Draw edges
    g.selectAll(".link")
        .data(root.links())
        .enter()
        .append("line")
        .attr("class", "link")
        .attr("x1", d => d.source.x)
        .attr("y1", d => scaledY(d.source))
        .attr("x2", d => d.target.x)
        .attr("y2", d => scaledY(d.target))
        .style("stroke", d => {
            const edgeKey = `${d.source.data.id}->${d.target.data.id}`;
            if (hullEdges.has(edgeKey)) return "#60a5fa"; // Blue for convex hull
            return "#4b5563"; // Gray for other edges
        })
        .style("stroke-width", d => {
            const edgeKey = `${d.source.data.id}->${d.target.data.id}`;
            if (hullEdges.has(edgeKey)) return "2.5px";
            return "1.5px";
        })
        .style("opacity", d => {
            const edgeKey = `${d.source.data.id}->${d.target.data.id}`;
            if (hullEdges.has(edgeKey)) return 0.6;
            return 1.0;
        });

    // Draw half-edges for Voronoi cell boundary
    const halfEdgeData = [];
    root.links().forEach(link => {
        const edgeKey = `${link.source.data.id}->${link.target.data.id}`;
        if (voronoiHalfEdges.has(edgeKey)) {
            const sourceInCell = voronoiVertices.has(link.source.data.id);
            const x1 = link.source.x;
            const y1 = scaledY(link.source);
            const x2 = link.target.x;
            const y2 = scaledY(link.target);
            const midX = (x1 + x2) / 2;
            const midY = (y1 + y2) / 2;

            if (sourceInCell) {
                halfEdgeData.push({ x1, y1, x2: midX, y2: midY });
            } else {
                halfEdgeData.push({ x1: midX, y1: midY, x2, y2 });
            }
        }
    });

    g.selectAll(".voronoi-half-edge")
        .data(halfEdgeData)
        .enter()
        .append("line")
        .attr("class", "voronoi-half-edge")
        .attr("x1", d => d.x1)
        .attr("y1", d => d.y1)
        .attr("x2", d => d.x2)
        .attr("y2", d => d.y2)
        .style("stroke", "#fbbf24")
        .style("stroke-width", "3px")
        .style("opacity", 0.5);

    // Draw full edges for Voronoi cell (both endpoints in cell)
    const fullEdgeData = [];
    root.links().forEach(link => {
        const edgeKey = `${link.source.data.id}->${link.target.data.id}`;
        if (voronoiFullEdges.has(edgeKey)) {
            fullEdgeData.push({
                x1: link.source.x,
                y1: scaledY(link.source),
                x2: link.target.x,
                y2: scaledY(link.target)
            });
        }
    });

    g.selectAll(".voronoi-full-edge")
        .data(fullEdgeData)
        .enter()
        .append("line")
        .attr("class", "voronoi-full-edge")
        .attr("x1", d => d.x1)
        .attr("y1", d => d.y1)
        .attr("x2", d => d.x2)
        .attr("y2", d => d.y2)
        .style("stroke", "#fbbf24")
        .style("stroke-width", "3.5px")
        .style("opacity", 0.6);

    const node = g.selectAll(".node").data(root.descendants()).enter().append("g")
        .attr("class", "node").attr("transform", d => `translate(${d.x},${scaledY(d)})`);

    // Draw top stub edge
    const topMost = root.descendants().reduce((best, d) => {
        const y = scaledY(d);
        if (!best || y < best.y) return { node: d, y };
        return best;
    }, null);
    if (topMost) {
        const xTop = topMost.node.x;
        const yTop = topMost.y;
        const stubLen = BASE_Y * 0.8;
        const dx = stubLen / Math.SQRT2;
        const dy = stubLen / Math.SQRT2;
        g.append("line")
            .attr("class", "top-stub")
            .attr("x1", xTop)
            .attr("y1", yTop)
            .attr("x2", xTop + dx)
            .attr("y2", yTop - dy)
            .style("stroke", "#4b5563")
            .style("stroke-width", "1.5px");
    }

    node.style("cursor", "pointer")
        .on("click", (event, d) => {
            // Display vertex information
            displayVertexInfo(d, orbitMap, svg);

            // Also populate inputs if handler provided
            if (onVertexClick) {
                onVertexClick(Number(d.data.k), d.data.q_num, d.data.q_den);
            }
        });

    // Vertex size scaling by depth
    const VERTEX_SHRINK = 0.88;
    const vertexScale = (depth) => Math.pow(VERTEX_SHRINK, depth);

    // Add background halo for vertices in Voronoi cell
    node.filter(d => voronoiVertices.has(d.data.id))
        .append("circle")
        .attr("class", "voronoi-halo")
        .attr("r", d => 14 * vertexScale(d.depth))
        .style("fill", "#fbbf24")
        .style("opacity", 0.15);

    node.append("circle")
        .attr("r", d => {
            let baseRadius;
            if (d.data.id === v1_id || d.data.id === v2_id) baseRadius = 8;
            else if (orbitVertices.has(d.data.id)) baseRadius = 6.5;
            else if (hullVertices.has(d.data.id)) baseRadius = 6;
            else baseRadius = 5;
            return baseRadius * vertexScale(d.depth);
        })
        .style("fill", d => {
            if (d.data.id === v1_id) return "#1d4ed8"; // Dark blue for base vertex
            if (d.data.id === v2_id) return "#059669"; // Dark green for g1*v
            if (orbitVertices.has(d.data.id)) return "#10b981"; // Green for orbit vertices
            if (hullVertices.has(d.data.id)) return "#93c5fd"; // Light blue for convex hull (not in orbit)
            return "#1f2937"; // Dark gray for other vertices
        })
        .style("stroke", d => {
            if (d.data.id === v1_id) return "#2563eb";
            if (d.data.id === v2_id) return "#34d399";
            if (orbitVertices.has(d.data.id)) return "#34d399";
            if (hullVertices.has(d.data.id)) return "#bfdbfe";
            return "#6366f1";
        })
        .style("stroke-width", d => {
            let baseWidth;
            if (d.data.id === v1_id || d.data.id === v2_id) baseWidth = 3;
            else if (orbitVertices.has(d.data.id)) baseWidth = 2.5;
            else if (hullVertices.has(d.data.id)) baseWidth = 2;
            else baseWidth = 2;
            return (baseWidth * vertexScale(d.depth)) + "px";
        })
        .style("cursor", "pointer");

    // Label base vertex and g1*v
    const labeled = node.filter(d => d.data.id === v1_id || d.data.id === v2_id);
    labeled.append("foreignObject")
        .attr("x", -40)
        .attr("y", d => d.children ? -32 : 10)
        .attr("width", 80)
        .attr("height", 30)
        .append("xhtml:div")
        .style("font-family", "'Inter', 'Segoe UI', 'Helvetica Neue', Arial, sans-serif")
        .style("font-size", "13px")
        .style("text-align", "center")
        .style("cursor", "pointer")
        .style("pointer-events", "auto")
        .style("color", "#e5e7eb")
        .html(d => d.data.name);

    // Always highlight [0]_0 vertex with yellow ring
    const zero_zero_id = getNodeID(0, new Rational(0n, 1n));
    const zeroZeroVertex = node.filter(d => d.data.id === zero_zero_id);
    zeroZeroVertex.insert('circle', ':first-child')
        .attr('class', 'zero-zero-ring')
        .attr('r', d => 12 * vertexScale(d.depth))
        .style('fill', 'none')
        .style('stroke', '#fbbf24')
        .style('stroke-width', d => (2 * vertexScale(d.depth)) + 'px')
        .style('opacity', 0.8);

    // Set up zoom behavior
    const zoom = d3.zoom()
        .scaleExtent([0.1, 4])
        .on("zoom", ({ transform }) => {
            g.attr("transform", transform);
            currentTransform = transform;
        });

    svg.call(zoom);

    // Export reset function
    return () => {
        currentTransform = null;
        svg.transition().duration(750).call(
            zoom.transform,
            d3.zoomIdentity
        );
    };
}

export function resetZoom() {
    currentTransform = null;
}
