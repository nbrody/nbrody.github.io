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
        // Prevent infinite recursion
        if (depth > 20) return null;

        // Compute mediant
        const med_p = left.p + right.p;
        const med_q = left.q + right.q;
        const g = gcd(med_p, med_q);
        const reduced_p = med_p / g;
        const reduced_q = med_q / g;

        const mediant = {
            p: reduced_p,
            q: reduced_q,
            word: left.word + right.word,
            leftParent: left,
            rightParent: right
        };

        // Found the target
        if (reduced_p === target_p && reduced_q === target_q) {
            return [mediant];
        }

        // Determine which subtree to explore
        // target is in left subtree if target < mediant
        if (target_p * reduced_q < reduced_p * target_q) {
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
    if (!ancestors) return [left, right];

    // Build the full path showing construction from left to right
    // Start with the two base fractions
    const fullPath = [left, right];

    // Add all ancestors in reverse order (from earliest to latest)
    for (let i = ancestors.length - 1; i >= 0; i--) {
        fullPath.push(ancestors[i]);
    }

    return fullPath;
}

// Generate Stern-Brocot tree with highlighted path
function generateSternBrocotTree(p, q) {
    const reduced = reduceFraction(p, q);

    // Build the tree structure to sufficient depth
    const maxDepth = 6; // Show up to 6 levels
    const nodeRadius = 20;
    const levelHeight = 80;
    const width = 1200;
    const height = maxDepth * levelHeight + 100;

    // Track which nodes are on the path to target
    const pathSet = new Set();
    const path = buildFareyPath(reduced.p, reduced.q);
    path.forEach(node => {
        pathSet.add(`${node.p}/${node.q}`);
    });

    let svg = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" style="max-width: 100%; height: auto; background: #fafafa; border-radius: 8px;">`;

    // Build tree recursively
    function buildTreeStructure(leftBound, rightBound, depth) {
        if (depth > maxDepth) return null;

        const mediant = {
            p: leftBound.p + rightBound.p,
            q: leftBound.q + rightBound.q,
            word: (leftBound.word || '') + (rightBound.word || '')
        };

        const g = gcd(mediant.p, mediant.q);
        mediant.p /= g;
        mediant.q /= g;

        // Only expand nodes that are on the path or nearby
        const key = `${mediant.p}/${mediant.q}`;
        const onPath = pathSet.has(key);
        const nearPath = depth <= 4; // Show more context at shallow levels

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

        const isTarget = node.p === reduced.p && node.q === reduced.q;
        const onPath = pathSet.has(key);
        const isBase = (node.p === 0 && node.q === 1) || (node.p === 1 && node.q === 1);

        // Draw edges to children first (so they appear behind nodes)
        if (node.left) {
            const childX = x - xSpan;
            const childY = y + levelHeight;
            const edgeColor = onPath ? '#007bff' : '#ddd';
            const edgeWidth = onPath ? 3 : 1;
            svg += `<line x1="${x}" y1="${y + nodeRadius}" x2="${childX}" y2="${childY - nodeRadius}" stroke="${edgeColor}" stroke-width="${edgeWidth}"/>`;
            drawNode(node.left, childX, childY, xSpan / 2, depth + 1);
        }

        if (node.right) {
            const childX = x + xSpan;
            const childY = y + levelHeight;
            const edgeColor = onPath ? '#007bff' : '#ddd';
            const edgeWidth = onPath ? 3 : 1;
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

        svg += `<circle cx="${x}" cy="${y}" r="${nodeRadius}" fill="${fillColor}" stroke="${strokeColor}" stroke-width="${strokeWidth}"/>`;

        // Text color based on node type
        const textColor = (isTarget || onPath || isBase) ? 'white' : '#495057';
        const fontSize = (isTarget || onPath) ? 13 : 11;
        svg += `<text x="${x}" y="${y + 4}" text-anchor="middle" fill="${textColor}" font-size="${fontSize}" font-weight="bold">${node.p}/${node.q}</text>`;
    }

    // Draw base nodes at top level
    const baseLeft = {p: 0, q: 1, word: 'L'};
    const baseRight = {p: 1, q: 1, word: 'R'};

    const baseY = 40;
    const baseLeftX = width / 2 - width / 4;
    const baseRightX = width / 2 + width / 4;

    // Draw edge between base nodes to root
    if (tree) {
        svg += `<line x1="${baseLeftX}" y1="${baseY + nodeRadius}" x2="${width/2}" y2="${baseY + levelHeight - nodeRadius}" stroke="#007bff" stroke-width="3"/>`;
        svg += `<line x1="${baseRightX}" y1="${baseY + nodeRadius}" x2="${width/2}" y2="${baseY + levelHeight - nodeRadius}" stroke="#007bff" stroke-width="3"/>`;
        drawNode(tree, width / 2, baseY + levelHeight, width / 6, 1);
    }

    // Draw base nodes
    const baseOnPath = pathSet.has('0/1') || pathSet.has('1/1');
    svg += `<circle cx="${baseLeftX}" cy="${baseY}" r="${nodeRadius}" fill="#28a745" stroke="#155724" stroke-width="2"/>`;
    svg += `<text x="${baseLeftX}" y="${baseY + 4}" text-anchor="middle" fill="white" font-size="13" font-weight="bold">0/1</text>`;

    svg += `<circle cx="${baseRightX}" cy="${baseY}" r="${nodeRadius}" fill="#28a745" stroke="#155724" stroke-width="2"/>`;
    svg += `<text x="${baseRightX}" y="${baseY + 4}" text-anchor="middle" fill="white" font-size="13" font-weight="bold">1/1</text>`;

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

// Simpler linear path diagram
function generateFareyPathDiagram(p, q) {
    const reduced = reduceFraction(p, q);

    // Build the full path through the Farey tree
    const path = buildFareyPath(reduced.p, reduced.q);

    if (!path || path.length === 0) {
        return '<p>Could not build Farey tree path.</p>';
    }

    // Create a linear diagram showing the construction
    const width = 800;
    const height = 150;
    const nodeRadius = 30;
    const spacing = path.length === 1 ? 0 : Math.min(180, (width - 100) / (path.length - 1));

    let svg = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" style="max-width: 100%; height: auto; background: #f8f9fa; border-radius: 8px;">`;

    // Define arrowhead marker
    svg += `<defs><marker id="arrowhead" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto"><polygon points="0 0, 10 3, 0 6" fill="#666"/></marker></defs>`;

    // Calculate starting x position to center the diagram
    const totalWidth = (path.length - 1) * spacing;
    const startX = (width - totalWidth) / 2;

    // Draw path
    for (let i = 0; i < path.length; i++) {
        const x = startX + i * spacing;
        const y = height / 2;
        const node = path[i];

        // Draw arrow to next node
        if (i < path.length - 1) {
            const nextX = startX + (i + 1) * spacing;
            svg += `<line x1="${x + nodeRadius}" y1="${y}" x2="${nextX - nodeRadius}" y2="${y}" stroke="#666" stroke-width="2" marker-end="url(#arrowhead)"/>`;

            // Add operation label
            if (i === path.length - 2 && path.length > 2) {
                svg += `<text x="${(x + nextX) / 2}" y="${y - 20}" text-anchor="middle" fill="#dc3545" font-size="12" font-weight="bold">mediant</text>`;
            }
        }

        // Draw node
        const isTarget = (i === path.length - 1);
        const isBase = (i === 0 || i === 1) && path.length > 1;
        const fillColor = isTarget ? '#dc3545' : (isBase ? '#28a745' : '#007bff');
        const strokeColor = isTarget ? '#721c24' : (isBase ? '#155724' : '#0056b3');

        svg += `<circle cx="${x}" cy="${y}" r="${nodeRadius}" fill="${fillColor}" stroke="${strokeColor}" stroke-width="3"/>`;
        svg += `<text x="${x}" y="${y + 5}" text-anchor="middle" fill="white" font-size="16" font-weight="bold">${node.p}/${node.q}</text>`;

        // Add word label
        if (node.word) {
            svg += `<text x="${x}" y="${y + nodeRadius + 20}" text-anchor="middle" fill="#333" font-size="13" font-family="monospace" font-weight="bold">${node.word}</text>`;
        }
    }

    svg += '</svg>';

    // Add legend and explanation
    let html = '<div style="margin: 20px 0;">';
    html += svg;
    if (path.length > 1) {
        html += '<div style="margin-top: 15px; display: flex; justify-content: center; gap: 30px; font-size: 14px;">';
        html += '<span><span style="display: inline-block; width: 15px; height: 15px; background: #28a745; border-radius: 50%; margin-right: 5px;"></span>Base fractions (0/1 = L, 1/1 = R)</span>';
        if (path.length > 2) {
            html += '<span><span style="display: inline-block; width: 15px; height: 15px; background: #dc3545; border-radius: 50%; margin-right: 5px;"></span>Target fraction</span>';
        }
        html += '</div>';

        // Add mediant explanation for non-base fractions
        if (path.length >= 3) {
            html += '<div style="margin-top: 20px; padding: 15px; background: #e7f3ff; border-radius: 8px; border-left: 4px solid #007bff;">';
            html += `<p style="margin: 0 0 10px 0; font-size: 14px; color: #004085;">`;
            html += `The <strong>mediant</strong> of two fractions \\(\\frac{a}{c}\\) and \\(\\frac{b}{d}\\) is \\(\\frac{a+b}{c+d}\\).`;
            html += `</p>`;

            // Show each step of the construction
            html += `<p style="margin: 0; font-size: 13px; color: #004085;"><strong>Construction steps:</strong></p>`;
            html += `<ul style="margin: 5px 0; padding-left: 20px; font-size: 13px; color: #004085;">`;

            for (let i = 2; i < path.length; i++) {
                const node = path[i];

                // Use the parent information if available
                let parent1, parent2;
                if (node.leftParent && node.rightParent) {
                    parent1 = node.leftParent;
                    parent2 = node.rightParent;
                } else {
                    // Fallback: use previous two
                    parent1 = path[i - 2];
                    parent2 = path[i - 1];
                }

                const sum_p = parent1.p + parent2.p;
                const sum_q = parent1.q + parent2.q;

                html += `<li>\\(\\frac{${parent1.p}}{${parent1.q}} \\oplus \\frac{${parent2.p}}{${parent2.q}} = \\frac{${sum_p}}{${sum_q}}`;

                // Show reduction if needed
                const g = gcd(sum_p, sum_q);
                if (g > 1) {
                    html += ` = \\frac{${node.p}}{${node.q}}`;
                }
                html += `\\)</li>`;
            }

            html += `</ul></div>`;
        }
    }
    html += '</div>';

    return html;
}
