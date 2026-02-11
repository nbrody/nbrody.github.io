// =============================================================================
// topology.js — SVG Surface Diagram Panel for Convex Core Topology
// =============================================================================
// Depends on construct.js: constructGroup()
//
// Exports:
//   TopologyPanel(container) — class that renders SVG topology visualization
// =============================================================================

// ---------------------------------------------------------------------------
// SVG namespace constant
// ---------------------------------------------------------------------------
var SVG_NS = 'http://www.w3.org/2000/svg';

// ---------------------------------------------------------------------------
// Color scheme
// ---------------------------------------------------------------------------
var TOPO_COLORS = {
    A: '#3b82f6',       // blue
    B: '#ef4444',       // red
    P: '#10b981',       // green
    surfaceFill: '#f0f7ff',
    border: '#64748b',
    background: '#ffffff',
    text: '#1e293b',
    lightGray: '#e2e8f0',
    fadedText: '#94a3b8'
};

// ---------------------------------------------------------------------------
// TopologyPanel class
// ---------------------------------------------------------------------------

/**
 * TopologyPanel renders an SVG visualization of the convex core surface topology.
 *
 * @param {HTMLElement} container - DOM element (div) that will contain the SVG
 */
function TopologyPanel(container) {
    this.container = container;
    this.width = 450;
    this.height = 450;
    this.svg = null;
}

/**
 * Render the topology visualization for the given group data.
 *
 * @param {Object} groupData - result from constructGroup(p)
 */
TopologyPanel.prototype.render = function(groupData) {
    this.container.innerHTML = '';

    this.svg = document.createElementNS(SVG_NS, 'svg');
    this.svg.setAttribute('width', this.width);
    this.svg.setAttribute('height', this.height);
    this.svg.setAttribute('viewBox', '0 0 ' + this.width + ' ' + this.height);
    this.svg.style.background = TOPO_COLORS.background;
    this.svg.style.borderRadius = '12px';
    this.svg.style.border = '1px solid ' + TOPO_COLORS.lightGray;
    this.container.appendChild(this.svg);

    // Define arrowhead markers
    this._defineMarkers();

    // Section 1: Punctured Torus fundamental polygon (top-left area)
    this._drawPuncturedTorus(20, 10);

    // Section 2: Extended surface (top-right area)
    this._drawExtendedSurface(240, 10);

    // Section 3: Fatgraph / Rose diagrams (middle area)
    this._drawFatgraphs(20, 220);

    // Section 4: Topological data table (bottom area)
    this._drawDataTable(20, 340, groupData);
};

// ---------------------------------------------------------------------------
// SVG marker definitions (arrowheads)
// ---------------------------------------------------------------------------

TopologyPanel.prototype._defineMarkers = function() {
    var defs = document.createElementNS(SVG_NS, 'defs');

    var colors = {
        'arrow-blue': TOPO_COLORS.A,
        'arrow-red': TOPO_COLORS.B,
        'arrow-green': TOPO_COLORS.P,
        'arrow-gray': TOPO_COLORS.border
    };

    for (var id in colors) {
        var marker = document.createElementNS(SVG_NS, 'marker');
        marker.setAttribute('id', id);
        marker.setAttribute('viewBox', '0 0 10 7');
        marker.setAttribute('refX', '10');
        marker.setAttribute('refY', '3.5');
        marker.setAttribute('markerWidth', '8');
        marker.setAttribute('markerHeight', '6');
        marker.setAttribute('orient', 'auto');

        var polygon = document.createElementNS(SVG_NS, 'polygon');
        polygon.setAttribute('points', '0,0 10,3.5 0,7');
        polygon.setAttribute('fill', colors[id]);
        marker.appendChild(polygon);
        defs.appendChild(marker);
    }

    this.svg.appendChild(defs);
};

// ---------------------------------------------------------------------------
// Helper: create SVG elements
// ---------------------------------------------------------------------------

TopologyPanel.prototype._elem = function(tag, attrs) {
    var el = document.createElementNS(SVG_NS, tag);
    if (attrs) {
        for (var k in attrs) {
            el.setAttribute(k, attrs[k]);
        }
    }
    return el;
};

TopologyPanel.prototype._text = function(x, y, content, attrs) {
    var el = this._elem('text', Object.assign({
        x: x, y: y,
        'font-family': "'Outfit', sans-serif",
        'font-size': '12',
        fill: TOPO_COLORS.text,
        'text-anchor': 'middle'
    }, attrs || {}));
    el.textContent = content;
    return el;
};

// ---------------------------------------------------------------------------
// Section 1: Punctured Torus fundamental polygon
// ---------------------------------------------------------------------------

TopologyPanel.prototype._drawPuncturedTorus = function(ox, oy) {
    var g = this._elem('g', { transform: 'translate(' + ox + ',' + oy + ')' });

    // Title
    g.appendChild(this._text(95, 14, '\u27E8A,B\u27E9: Punctured Torus', {
        'font-size': '11', 'font-weight': '600'
    }));

    // Fundamental polygon: rectangle with identified sides
    var rx = 20, ry = 28, rw = 150, rh = 150;

    // Fill the polygon
    g.appendChild(this._elem('rect', {
        x: rx, y: ry, width: rw, height: rh,
        fill: TOPO_COLORS.surfaceFill,
        stroke: 'none'
    }));

    // Corner dots (all identified to the puncture)
    var corners = [
        [rx, ry], [rx + rw, ry],
        [rx, ry + rh], [rx + rw, ry + rh]
    ];
    for (var i = 0; i < corners.length; i++) {
        g.appendChild(this._elem('circle', {
            cx: corners[i][0], cy: corners[i][1], r: 3,
            fill: TOPO_COLORS.border, stroke: 'none'
        }));
    }

    // Bottom edge: A (left to right) -- blue
    this._drawArrowEdge(g, rx + 10, ry + rh, rx + rw - 10, ry + rh,
        TOPO_COLORS.A, 'arrow-blue');
    g.appendChild(this._text(rx + rw / 2, ry + rh + 14, 'A', {
        fill: TOPO_COLORS.A, 'font-size': '13', 'font-weight': '600'
    }));

    // Top edge: A (right to left, showing identification: same direction) -- blue
    this._drawArrowEdge(g, rx + rw - 10, ry, rx + 10, ry,
        TOPO_COLORS.A, 'arrow-blue');
    g.appendChild(this._text(rx + rw / 2, ry - 5, 'A', {
        fill: TOPO_COLORS.A, 'font-size': '13', 'font-weight': '600'
    }));

    // Left edge: B (bottom to top) -- red
    this._drawArrowEdge(g, rx, ry + rh - 10, rx, ry + 10,
        TOPO_COLORS.B, 'arrow-red');
    g.appendChild(this._text(rx - 10, ry + rh / 2, 'B', {
        fill: TOPO_COLORS.B, 'font-size': '13', 'font-weight': '600',
        'text-anchor': 'end'
    }));

    // Right edge: B (top to bottom, showing identification: same direction) -- red
    this._drawArrowEdge(g, rx + rw, ry + 10, rx + rw, ry + rh - 10,
        TOPO_COLORS.B, 'arrow-red');
    g.appendChild(this._text(rx + rw + 12, ry + rh / 2, 'B', {
        fill: TOPO_COLORS.B, 'font-size': '13', 'font-weight': '600',
        'text-anchor': 'start'
    }));

    // Label: g=1, b=1
    g.appendChild(this._text(95, ry + rh + 30, 'g=1, b=1, \u03C7=\u22121', {
        'font-size': '10', fill: TOPO_COLORS.fadedText
    }));

    // Boundary label at center
    g.appendChild(this._text(rx + rw / 2, ry + rh / 2, '[A,B]', {
        'font-size': '11', fill: TOPO_COLORS.border, 'font-style': 'italic'
    }));

    this.svg.appendChild(g);
};

// ---------------------------------------------------------------------------
// Section 2: Extended surface (genus-1, 2 boundary components)
// ---------------------------------------------------------------------------

TopologyPanel.prototype._drawExtendedSurface = function(ox, oy) {
    var g = this._elem('g', { transform: 'translate(' + ox + ',' + oy + ')' });

    // Title
    g.appendChild(this._text(95, 14, '\u27E8A,B,P\u27E9: Genus-1 Surface', {
        'font-size': '11', 'font-weight': '600'
    }));

    // Draw a torus-like shape viewed from above with two holes
    var cx = 95, cy = 110;

    // Outer rounded rectangle (the surface)
    g.appendChild(this._elem('rect', {
        x: 10, y: 30, width: 170, height: 130, rx: 30, ry: 30,
        fill: TOPO_COLORS.surfaceFill,
        stroke: TOPO_COLORS.border,
        'stroke-width': '2',
        'stroke-dasharray': '6,3'
    }));

    // Handle representation: a curved band across the top
    var handlePath = 'M 50,42 Q 95,20 140,42';
    g.appendChild(this._elem('path', {
        d: handlePath,
        fill: 'none',
        stroke: TOPO_COLORS.border,
        'stroke-width': '1.5',
        'stroke-dasharray': '4,2',
        opacity: '0.5'
    }));

    // Label the handle
    g.appendChild(this._text(cx, 25, 'handle', {
        'font-size': '9', fill: TOPO_COLORS.fadedText, 'font-style': 'italic'
    }));

    // Boundary component 1 (A-related): blue ellipse on the left
    var b1x = 58, b1y = cy;
    g.appendChild(this._elem('ellipse', {
        cx: b1x, cy: b1y, rx: 22, ry: 28,
        fill: TOPO_COLORS.background,
        stroke: TOPO_COLORS.A,
        'stroke-width': '2.5'
    }));

    // Arrow on boundary A (clockwise indicator)
    this._drawSmallArrow(g, b1x - 22, b1y - 5, b1x - 20, b1y + 8, TOPO_COLORS.A);

    g.appendChild(this._text(b1x, b1y + 2, 'A', {
        fill: TOPO_COLORS.A, 'font-size': '13', 'font-weight': '600'
    }));

    // Boundary component 2 (B-related): red ellipse on the right
    var b2x = 132, b2y = cy;
    g.appendChild(this._elem('ellipse', {
        cx: b2x, cy: b2y, rx: 22, ry: 28,
        fill: TOPO_COLORS.background,
        stroke: TOPO_COLORS.B,
        'stroke-width': '2.5'
    }));

    // Arrow on boundary B (clockwise indicator)
    this._drawSmallArrow(g, b2x + 22, b2y + 5, b2x + 20, b2y - 8, TOPO_COLORS.B);

    g.appendChild(this._text(b2x, b2y + 2, 'B', {
        fill: TOPO_COLORS.B, 'font-size': '13', 'font-weight': '600'
    }));

    // Labels
    g.appendChild(this._text(cx, 180, 'g=1, b=2, \u03C7=\u22122', {
        'font-size': '10', fill: TOPO_COLORS.fadedText
    }));

    this.svg.appendChild(g);
};

// ---------------------------------------------------------------------------
// Section 3: Fatgraph (Rose diagrams)
// ---------------------------------------------------------------------------

TopologyPanel.prototype._drawFatgraphs = function(ox, oy) {
    var g = this._elem('g', { transform: 'translate(' + ox + ',' + oy + ')' });

    // Title
    g.appendChild(this._text(215, 10, 'Fatgraphs (Ribbon Graphs)', {
        'font-size': '11', 'font-weight': '600'
    }));

    // -- 2-rose (left): single vertex, 2 loop edges A and B --
    this._drawRose2(g, 90, 75);

    // Label
    g.appendChild(this._text(90, 120, '2-rose \u27E8A,B\u27E9', {
        'font-size': '10', fill: TOPO_COLORS.fadedText
    }));

    // -- 3-rose (right): single vertex, 3 loop edges A, B, P --
    this._drawRose3(g, 330, 75);

    // Label
    g.appendChild(this._text(330, 120, '3-rose \u27E8A,B,P\u27E9', {
        'font-size': '10', fill: TOPO_COLORS.fadedText
    }));

    this.svg.appendChild(g);
};

/**
 * Draw a 2-rose: single vertex with 2 loop edges (A and B).
 */
TopologyPanel.prototype._drawRose2 = function(parent, cx, cy) {
    // Loop A: goes up-left and curves back (blue)
    var loopA = 'M ' + cx + ',' + cy +
        ' C ' + (cx - 55) + ',' + (cy - 15) +
        ' ' + (cx - 55) + ',' + (cy - 70) +
        ' ' + (cx - 10) + ',' + (cy - 55) +
        ' C ' + (cx + 5) + ',' + (cy - 50) +
        ' ' + (cx + 5) + ',' + (cy - 20) +
        ' ' + cx + ',' + cy;
    parent.appendChild(this._elem('path', {
        d: loopA, fill: 'none',
        stroke: TOPO_COLORS.A, 'stroke-width': '3',
        'stroke-linecap': 'round'
    }));
    parent.appendChild(this._text(cx - 38, cy - 55, 'A', {
        fill: TOPO_COLORS.A, 'font-size': '13', 'font-weight': '600'
    }));

    // Arrow indicator on A loop
    this._drawTinyArrow(parent, cx - 42, cy - 40, 0, -1, TOPO_COLORS.A);

    // Loop B: goes up-right and curves back (red)
    var loopB = 'M ' + cx + ',' + cy +
        ' C ' + (cx + 55) + ',' + (cy - 15) +
        ' ' + (cx + 55) + ',' + (cy - 70) +
        ' ' + (cx + 10) + ',' + (cy - 55) +
        ' C ' + (cx - 5) + ',' + (cy - 50) +
        ' ' + (cx - 5) + ',' + (cy - 20) +
        ' ' + cx + ',' + cy;
    parent.appendChild(this._elem('path', {
        d: loopB, fill: 'none',
        stroke: TOPO_COLORS.B, 'stroke-width': '3',
        'stroke-linecap': 'round'
    }));
    parent.appendChild(this._text(cx + 40, cy - 55, 'B', {
        fill: TOPO_COLORS.B, 'font-size': '13', 'font-weight': '600'
    }));

    // Arrow indicator on B loop
    this._drawTinyArrow(parent, cx + 42, cy - 40, 0, -1, TOPO_COLORS.B);

    // Central vertex
    parent.appendChild(this._elem('circle', {
        cx: cx, cy: cy, r: 5,
        fill: TOPO_COLORS.text, stroke: 'none'
    }));
};

/**
 * Draw a 3-rose: single vertex with 3 loop edges (A, B, P).
 */
TopologyPanel.prototype._drawRose3 = function(parent, cx, cy) {
    // Loop A: upper-left (blue)
    var loopA = 'M ' + cx + ',' + cy +
        ' C ' + (cx - 50) + ',' + (cy - 10) +
        ' ' + (cx - 55) + ',' + (cy - 60) +
        ' ' + (cx - 15) + ',' + (cy - 50) +
        ' C ' + (cx) + ',' + (cy - 45) +
        ' ' + (cx + 3) + ',' + (cy - 18) +
        ' ' + cx + ',' + cy;
    parent.appendChild(this._elem('path', {
        d: loopA, fill: 'none',
        stroke: TOPO_COLORS.A, 'stroke-width': '3',
        'stroke-linecap': 'round'
    }));
    parent.appendChild(this._text(cx - 40, cy - 48, 'A', {
        fill: TOPO_COLORS.A, 'font-size': '12', 'font-weight': '600'
    }));

    // Loop B: upper-right (red)
    var loopB = 'M ' + cx + ',' + cy +
        ' C ' + (cx + 50) + ',' + (cy - 10) +
        ' ' + (cx + 55) + ',' + (cy - 60) +
        ' ' + (cx + 15) + ',' + (cy - 50) +
        ' C ' + (cx) + ',' + (cy - 45) +
        ' ' + (cx - 3) + ',' + (cy - 18) +
        ' ' + cx + ',' + cy;
    parent.appendChild(this._elem('path', {
        d: loopB, fill: 'none',
        stroke: TOPO_COLORS.B, 'stroke-width': '3',
        'stroke-linecap': 'round'
    }));
    parent.appendChild(this._text(cx + 42, cy - 48, 'B', {
        fill: TOPO_COLORS.B, 'font-size': '12', 'font-weight': '600'
    }));

    // Loop P: downward (green)
    var loopP = 'M ' + cx + ',' + cy +
        ' C ' + (cx - 15) + ',' + (cy + 15) +
        ' ' + (cx - 40) + ',' + (cy + 50) +
        ' ' + (cx - 5) + ',' + (cy + 55) +
        ' C ' + (cx + 20) + ',' + (cy + 58) +
        ' ' + (cx + 15) + ',' + (cy + 15) +
        ' ' + cx + ',' + cy;
    parent.appendChild(this._elem('path', {
        d: loopP, fill: 'none',
        stroke: TOPO_COLORS.P, 'stroke-width': '3',
        'stroke-linecap': 'round'
    }));
    parent.appendChild(this._text(cx - 5, cy + 70, 'P', {
        fill: TOPO_COLORS.P, 'font-size': '12', 'font-weight': '600'
    }));

    // Arrow indicators
    this._drawTinyArrow(parent, cx - 40, cy - 32, 0, -1, TOPO_COLORS.A);
    this._drawTinyArrow(parent, cx + 40, cy - 32, 0, -1, TOPO_COLORS.B);
    this._drawTinyArrow(parent, cx - 28, cy + 42, 0, 1, TOPO_COLORS.P);

    // Central vertex
    parent.appendChild(this._elem('circle', {
        cx: cx, cy: cy, r: 5,
        fill: TOPO_COLORS.text, stroke: 'none'
    }));
};

// ---------------------------------------------------------------------------
// Section 4: Topological data table
// ---------------------------------------------------------------------------

TopologyPanel.prototype._drawDataTable = function(ox, oy, groupData) {
    var g = this._elem('g', { transform: 'translate(' + ox + ',' + oy + ')' });

    var fontSize = 11;
    var rowH = 16;
    var col0 = 5;    // Property name
    var col1 = 115;  // <A,B> value
    var col2 = 195;  // <A,B,P> value

    // Table header background
    g.appendChild(this._elem('rect', {
        x: 0, y: 0, width: 410, height: rowH + 4,
        fill: TOPO_COLORS.lightGray, rx: 3, ry: 3
    }));

    // Header row
    var headerY = 13;
    g.appendChild(this._text(col0, headerY, 'Property', {
        'font-size': fontSize, 'font-weight': '600', 'text-anchor': 'start'
    }));
    g.appendChild(this._text(col1, headerY, '\u27E8A,B\u27E9', {
        'font-size': fontSize, 'font-weight': '600'
    }));
    g.appendChild(this._text(col2, headerY, '\u27E8A,B,P\u27E9', {
        'font-size': fontSize, 'font-weight': '600'
    }));

    // Data rows
    var pt = groupData.puncturedTorus.topology;
    var es = groupData.extendedSurface.topology;

    var rows = [
        ['Rank',       '2',                             '3'],
        ['Genus',      String(pt.genus),                 String(es.genus)],
        ['Boundaries', String(pt.boundaries),            String(es.boundaries)],
        ['\u03C7',     String(pt.eulerCharacteristic),   String(es.eulerCharacteristic)],
        ['Boundary',   '[A,B]',                          this._boundaryLabel(groupData)]
    ];

    for (var i = 0; i < rows.length; i++) {
        var y = headerY + (i + 1) * rowH + 4;

        // Alternating row background
        if (i % 2 === 0) {
            g.appendChild(this._elem('rect', {
                x: 0, y: y - rowH + 5, width: 410, height: rowH,
                fill: '#f8fafc', rx: 2, ry: 2
            }));
        }

        g.appendChild(this._text(col0, y, rows[i][0], {
            'font-size': fontSize, 'text-anchor': 'start',
            fill: TOPO_COLORS.border
        }));
        g.appendChild(this._text(col1, y, rows[i][1], {
            'font-size': fontSize
        }));
        g.appendChild(this._text(col2, y, rows[i][2], {
            'font-size': fontSize
        }));
    }

    this.svg.appendChild(g);
};

/**
 * Build a readable label for the extended surface boundary words.
 */
TopologyPanel.prototype._boundaryLabel = function(groupData) {
    var bds = groupData.extendedSurface.boundaries;
    if (!bds || bds.length === 0) return '?';
    // Show shortened form
    var words = [];
    for (var i = 0; i < bds.length; i++) {
        var reduced = groupData.extendedSurface.reducedWords[i];
        if (reduced.length <= 2) {
            words.push(reduced.join(''));
        } else {
            words.push('len ' + reduced.length);
        }
    }
    return words.join(', ');
};

// ---------------------------------------------------------------------------
// Drawing helpers
// ---------------------------------------------------------------------------

/**
 * Draw a line with an arrowhead marker at the end.
 */
TopologyPanel.prototype._drawArrowEdge = function(parent, x1, y1, x2, y2, color, markerId) {
    parent.appendChild(this._elem('line', {
        x1: x1, y1: y1, x2: x2, y2: y2,
        stroke: color, 'stroke-width': '2.5',
        'marker-end': 'url(#' + markerId + ')'
    }));
};

/**
 * Draw a small directional arrow indicator (for boundary direction on ellipses).
 */
TopologyPanel.prototype._drawSmallArrow = function(parent, x1, y1, x2, y2, color) {
    // A short line segment with a tiny triangle head
    var dx = x2 - x1, dy = y2 - y1;
    var len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1) return;
    var ux = dx / len, uy = dy / len;
    // Perpendicular
    var px = -uy, py = ux;

    var tipX = x2, tipY = y2;
    var baseL_X = tipX - ux * 5 + px * 3;
    var baseL_Y = tipY - uy * 5 + py * 3;
    var baseR_X = tipX - ux * 5 - px * 3;
    var baseR_Y = tipY - uy * 5 - py * 3;

    var tri = this._elem('polygon', {
        points: tipX + ',' + tipY + ' ' + baseL_X + ',' + baseL_Y + ' ' + baseR_X + ',' + baseR_Y,
        fill: color
    });
    parent.appendChild(tri);
};

/**
 * Draw a tiny directional arrow (for fatgraph loop indicators).
 */
TopologyPanel.prototype._drawTinyArrow = function(parent, x, y, dx, dy, color) {
    var len = Math.sqrt(dx * dx + dy * dy);
    if (len < 0.01) { dx = 0; dy = -1; len = 1; }
    var ux = dx / len, uy = dy / len;
    var px = -uy, py = ux;

    var tipX = x + ux * 5, tipY = y + uy * 5;
    var baseL_X = tipX - ux * 6 + px * 3;
    var baseL_Y = tipY - uy * 6 + py * 3;
    var baseR_X = tipX - ux * 6 - px * 3;
    var baseR_Y = tipY - uy * 6 - py * 3;

    parent.appendChild(this._elem('polygon', {
        points: tipX + ',' + tipY + ' ' + baseL_X + ',' + baseL_Y + ' ' + baseR_X + ',' + baseR_Y,
        fill: color
    }));
};
