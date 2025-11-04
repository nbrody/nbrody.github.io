// Farey tree visualization

// Build the path to a rational number in the Farey tree
function buildFareyPath(p, q) {
    // Start with base fractions
    let left = { p: 0, q: 1, word: 'L' };
    let right = { p: 1, q: 1, word: 'R' };

    // Check base cases
    if (p === 0 && q === 1) return [left];
    if (p === 1 && q === 1) return [right];

    // Build path by recursively finding ancestors
    // Returns array of {node, leftParent, rightParent}
    function findPath(target_p, target_q, left, right, depth = 0) {
        // Prevent infinite recursion (increased limit for larger fractions)
        if (depth > 50) {
            console.warn(`Farey path: depth limit reached for ${target_p}/${target_q}`);
            return null;
        }

        // Compute mediant (DO NOT REDUCE - Stern-Brocot tree uses unreduced mediants)
        const med_p = left.p + right.p;
        const med_q = left.q + right.q;

        const mediant = {
            p: med_p,
            q: med_q,
            word: left.word + right.word,
            leftParent: left,
            rightParent: right
        };

        // Found the target (check if mediant equals target after reduction)
        const g = gcd(med_p, med_q);
        const reduced_p = med_p / g;
        const reduced_q = med_q / g;

        if (reduced_p === target_p && reduced_q === target_q) {
            return [mediant];
        }

        // Determine which subtree to explore
        // target is in left subtree if target < mediant
        if (target_p * med_q < med_p * target_q) {
            // Search left subtree: between left and mediant
            const subpath = findPath(target_p, target_q, left, mediant, depth + 1);
            if (subpath) {
                return [mediant].concat(subpath);
            }
        } else {
            // Search right subtree: between mediant and right
            const subpath = findPath(target_p, target_q, mediant, right, depth + 1);
            if (subpath) {
                return [mediant].concat(subpath);
            }
        }

        return null;
    }

    const ancestors = findPath(p, q, left, right);
    if (!ancestors) {
        console.warn(`Farey path: Could not find path for ${p}/${q}`);
        return [left];
    }

    // Return all nodes on the path (for tree highlighting)
    const pathNodes = [left, right];
    for (const node of ancestors) {
        pathNodes.push(node);
    }

    return pathNodes;
}

// Generate Stern-Brocot tree with highlighted path
function generateSternBrocotTree(p, q) {
    const reduced = reduceFraction(p, q);

    // Build the tree structure to sufficient depth
    // Calculate depth needed to reach the target fraction
    const path = buildFareyPath(reduced.p, reduced.q);
    const targetDepth = path.length;
    const maxDepth = Math.max(6, targetDepth + 2); // At least 6 levels, or target depth + 2

    const nodeRadius = 20;
    const levelHeight = 80;
    const width = 1200;
    const height = maxDepth * levelHeight + 100;

    // Track which nodes are on the path to target
    const pathSet = new Set();
    path.forEach(node => {
        pathSet.add(`${node.p}/${node.q}`);
    });

    let svg = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" style="max-width: 100%; height: auto; background: rgba(17, 24, 39, 0.6); border-radius: 8px; border: 1px solid rgba(255, 255, 255, 0.08);">`;

    // Build tree recursively
    function buildTreeStructure(leftBound, rightBound, depth) {
        if (depth > maxDepth) return null;

        const mediant = {
            p: leftBound.p + rightBound.p,
            q: leftBound.q + rightBound.q,
            word: (leftBound.word || '') + (rightBound.word || '')
        };

        // Check if this node is on the path using unreduced form
        const key = `${mediant.p}/${mediant.q}`;
        const onPath = pathSet.has(key);
        const nearPath = depth <= 4; // Show more context at shallow levels

        // Always expand nodes on path, regardless of depth
        if (onPath || nearPath || depth <= 3) {
            mediant.left = buildTreeStructure(leftBound, mediant, depth + 1);
            mediant.right = buildTreeStructure(mediant, rightBound, depth + 1);
        }

        return mediant;
    }

    const tree = buildTreeStructure({p: 0, q: 1, word: 'L'}, {p: 1, q: 1, word: 'R'}, 1);

    // Draw the tree
    const drawn = new Set();

    function drawNode(node, x, y, xSpan, depth) {
        if (!node || depth > maxDepth) return;

        const key = `${node.p}/${node.q}`;
        if (drawn.has(key)) return;
        drawn.add(key);

        // Reduce for comparison and display
        const g = gcd(node.p, node.q);
        const displayP = node.p / g;
        const displayQ = node.q / g;

        const isTarget = displayP === reduced.p && displayQ === reduced.q;
        const onPath = pathSet.has(key);
        const isBase = (node.p === 0 && node.q === 1) || (node.p === 1 && node.q === 1);

        // Draw edges to children first (so they appear behind nodes)
        if (node.left) {
            const childX = x - xSpan;
            const childY = y + levelHeight;
            const childKey = `${node.left.p}/${node.left.q}`;
            const childOnPath = pathSet.has(childKey);
            // Edge is highlighted only if both parent and child are on path
            const edgeColor = (onPath && childOnPath) ? '#007bff' : '#ddd';
            const edgeWidth = (onPath && childOnPath) ? 3 : 1;
            svg += `<line x1="${x}" y1="${y + nodeRadius}" x2="${childX}" y2="${childY - nodeRadius}" stroke="${edgeColor}" stroke-width="${edgeWidth}"/>`;
            drawNode(node.left, childX, childY, xSpan / 2, depth + 1);
        }

        if (node.right) {
            const childX = x + xSpan;
            const childY = y + levelHeight;
            const childKey = `${node.right.p}/${node.right.q}`;
            const childOnPath = pathSet.has(childKey);
            // Edge is highlighted only if both parent and child are on path
            const edgeColor = (onPath && childOnPath) ? '#007bff' : '#ddd';
            const edgeWidth = (onPath && childOnPath) ? 3 : 1;
            svg += `<line x1="${x}" y1="${y + nodeRadius}" x2="${childX}" y2="${childY - nodeRadius}" stroke="${edgeColor}" stroke-width="${edgeWidth}"/>`;
            drawNode(node.right, childX, childY, xSpan / 2, depth + 1);
        }

        // Draw node
        let fillColor, strokeColor, strokeWidth;
        if (isTarget) {
            fillColor = '#dc3545';
            strokeColor = '#721c24';
            strokeWidth = 3;
        } else if (onPath) {
            fillColor = '#007bff';
            strokeColor = '#0056b3';
            strokeWidth = 3;
        } else if (isBase) {
            fillColor = '#28a745';
            strokeColor = '#155724';
            strokeWidth = 2;
        } else {
            fillColor = '#e9ecef';
            strokeColor = '#adb5bd';
            strokeWidth = 1;
        }

        // Add click handler for interactive nodes
        const clickHandler = `onclick="updateFraction(${node.p}, ${node.q})"`;
        const cursorStyle = 'cursor: pointer;';

        svg += `<circle cx="${x}" cy="${y}" r="${nodeRadius}" fill="${fillColor}" stroke="${strokeColor}" stroke-width="${strokeWidth}" ${clickHandler} style="${cursorStyle}"/>`;

        // Text color based on node type
        const textColor = (isTarget || onPath || isBase) ? 'white' : '#495057';
        const fontSize = (isTarget || onPath) ? 13 : 11;
        svg += `<text x="${x}" y="${y + 4}" text-anchor="middle" fill="${textColor}" font-size="${fontSize}" font-weight="bold" ${clickHandler} style="${cursorStyle} pointer-events: none;">${displayP}/${displayQ}</text>`;
    }

    // Draw base nodes at top level
    const baseLeft = {p: 0, q: 1, word: 'L'};
    const baseRight = {p: 1, q: 1, word: 'R'};

    const baseY = 40;
    const baseLeftX = width / 2 - width / 4;
    const baseRightX = width / 2 + width / 4;

    // Draw edge between base nodes to root
    if (tree) {
        const treeKey = `${tree.p}/${tree.q}`;
        const treeOnPath = pathSet.has(treeKey);
        const baseLeftOnPath = pathSet.has('0/1');
        const baseRightOnPath = pathSet.has('1/1');

        // Left edge highlighted if both 0/1 and tree root are on path
        const leftEdgeColor = (baseLeftOnPath && treeOnPath) ? '#007bff' : '#ddd';
        const leftEdgeWidth = (baseLeftOnPath && treeOnPath) ? 3 : 1;
        svg += `<line x1="${baseLeftX}" y1="${baseY + nodeRadius}" x2="${width/2}" y2="${baseY + levelHeight - nodeRadius}" stroke="${leftEdgeColor}" stroke-width="${leftEdgeWidth}"/>`;

        // Right edge highlighted if both 1/1 and tree root are on path
        const rightEdgeColor = (baseRightOnPath && treeOnPath) ? '#007bff' : '#ddd';
        const rightEdgeWidth = (baseRightOnPath && treeOnPath) ? 3 : 1;
        svg += `<line x1="${baseRightX}" y1="${baseY + nodeRadius}" x2="${width/2}" y2="${baseY + levelHeight - nodeRadius}" stroke="${rightEdgeColor}" stroke-width="${rightEdgeWidth}"/>`;

        drawNode(tree, width / 2, baseY + levelHeight, width / 6, 1);
    }

    // Draw base nodes
    const baseOnPath = pathSet.has('0/1') || pathSet.has('1/1');
    svg += `<circle cx="${baseLeftX}" cy="${baseY}" r="${nodeRadius}" fill="#28a745" stroke="#155724" stroke-width="2" onclick="updateFraction(0, 1)" style="cursor: pointer;"/>`;
    svg += `<text x="${baseLeftX}" y="${baseY + 4}" text-anchor="middle" fill="white" font-size="13" font-weight="bold" onclick="updateFraction(0, 1)" style="cursor: pointer; pointer-events: none;">0/1</text>`;

    svg += `<circle cx="${baseRightX}" cy="${baseY}" r="${nodeRadius}" fill="#28a745" stroke="#155724" stroke-width="2" onclick="updateFraction(1, 1)" style="cursor: pointer;"/>`;
    svg += `<text x="${baseRightX}" y="${baseY + 4}" text-anchor="middle" fill="white" font-size="13" font-weight="bold" onclick="updateFraction(1, 1)" style="cursor: pointer; pointer-events: none;">1/1</text>`;

    svg += '</svg>';

    // Add legend
    let html = '<div style="margin: 20px 0;">';
    html += svg;
    html += '<div style="margin-top: 15px; display: flex; justify-content: center; gap: 30px; font-size: 14px;">';
    html += '<span><span style="display: inline-block; width: 15px; height: 15px; background: #28a745; border-radius: 50%; margin-right: 5px;"></span>Base (0/1, 1/1)</span>';
    html += '<span><span style="display: inline-block; width: 15px; height: 15px; background: #007bff; border-radius: 50%; margin-right: 5px; border: 3px solid #0056b3;"></span>Path to target</span>';
    html += '<span><span style="display: inline-block; width: 15px; height: 15px; background: #dc3545; border-radius: 50%; margin-right: 5px; border: 3px solid #721c24;"></span>Target fraction</span>';
    html += '<span><span style="display: inline-block; width: 15px; height: 15px; background: #e9ecef; border-radius: 50%; margin-right: 5px;"></span>Other fractions</span>';
    html += '</div>';
    html += '</div>';

    return html;
}

