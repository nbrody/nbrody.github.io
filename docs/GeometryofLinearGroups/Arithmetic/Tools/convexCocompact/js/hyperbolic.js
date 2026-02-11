// =============================================================================
// hyperbolic.js — Hyperbolic Plane Visualization (Canvas 2D)
// =============================================================================
// Depends on math.js: SL2Z class with .fixedPoints(), .trace(), .toLatex()
// Depends on construct.js: constructGroup(p) returns group data
//
// Exports:
//   HyperbolicCanvas — class that renders the upper half-plane model of H^2
// =============================================================================

// ---------------------------------------------------------------------------
// Color scheme constants
// ---------------------------------------------------------------------------
var COLORS = {
    axisA:      '#3b82f6',   // blue
    axisB:      '#ef4444',   // red
    axisP:      '#10b981',   // green
    farey:      '#e2e8f0',   // light gray
    realLine:   '#94a3b8',   // slate gray
    background: '#ffffff'
};

// ---------------------------------------------------------------------------
// HyperbolicCanvas class
// ---------------------------------------------------------------------------

/**
 * Renders the upper half-plane model of H^2 on an HTML Canvas.
 *
 * The viewport maps H^2 coordinates to screen coordinates:
 *   - The real line (y=0) is at the bottom of the canvas.
 *   - Increasing y goes upward into the hyperbolic plane.
 *   - centerX, centerY control the viewport center (centerY is
 *     the world-y at the center of the canvas).
 *   - scale controls zoom in pixels per unit.
 *
 * @param {HTMLCanvasElement} canvas
 */
function HyperbolicCanvas(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');

    // Viewport parameters
    this.centerX = 2.0;
    this.centerY = 0;  // on the real line
    this.scale = 80;   // pixels per unit

    // Interaction state
    this._dragging = false;
    this._lastMouseX = 0;
    this._lastMouseY = 0;

    // Bind event handlers
    this._onMouseDown = this._onMouseDown.bind(this);
    this._onMouseMove = this._onMouseMove.bind(this);
    this._onMouseUp = this._onMouseUp.bind(this);
    this._onWheel = this._onWheel.bind(this);

    canvas.addEventListener('mousedown', this._onMouseDown);
    canvas.addEventListener('mousemove', this._onMouseMove);
    canvas.addEventListener('mouseup', this._onMouseUp);
    canvas.addEventListener('mouseleave', this._onMouseUp);
    canvas.addEventListener('wheel', this._onWheel, { passive: false });

    // Store current group data for re-rendering
    this._groupData = null;
}

// ---------------------------------------------------------------------------
// Coordinate transforms
// ---------------------------------------------------------------------------

/**
 * Map world coordinates (x, y) in H^2 to canvas pixel coordinates.
 *   screenX = (x - centerX) * scale + canvas.width / 2
 *   screenY = canvas.height - (y - centerY) * scale - canvas.height / 2
 * But since centerY = 0 means the real line is at the bottom:
 *   screenY = canvas.height - y * scale
 *
 * More precisely: the viewport is defined so that centerX is the world-x
 * at the horizontal center, and the real line (y=0) sits at the bottom.
 *
 * @param {number} x - world x
 * @param {number} y - world y
 * @returns {[number, number]} [screenX, screenY]
 */
HyperbolicCanvas.prototype.worldToScreen = function(x, y) {
    var sx = (x - this.centerX) * this.scale + this.canvas.width / 2;
    var sy = this.canvas.height - (y * this.scale);
    return [sx, sy];
};

/**
 * Map canvas pixel coordinates to world coordinates in H^2.
 *
 * @param {number} px - screen x
 * @param {number} py - screen y
 * @returns {[number, number]} [worldX, worldY]
 */
HyperbolicCanvas.prototype.screenToWorld = function(px, py) {
    var x = (px - this.canvas.width / 2) / this.scale + this.centerX;
    var y = (this.canvas.height - py) / this.scale;
    return [x, y];
};

// ---------------------------------------------------------------------------
// Drawing methods
// ---------------------------------------------------------------------------

/**
 * Clear the canvas with a white background.
 */
HyperbolicCanvas.prototype.clear = function() {
    this.ctx.fillStyle = COLORS.background;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
};

/**
 * Draw the hyperbolic geodesic between two points x1, x2 on the boundary
 * (the real line, including Infinity).
 *
 * If both are finite: draw a semicircular arc centered at (x1+x2)/2
 * with radius |x2-x1|/2 in the upper half-plane.
 *
 * If one is Infinity: draw a vertical line from the other point upward.
 *
 * @param {number} x1 - first endpoint on the real line (may be Infinity)
 * @param {number} x2 - second endpoint on the real line (may be Infinity)
 * @param {string} color - stroke color
 * @param {number} lineWidth - stroke width
 */
HyperbolicCanvas.prototype.drawGeodesic = function(x1, x2, color, lineWidth) {
    var ctx = this.ctx;
    color = color || '#000';
    lineWidth = lineWidth || 1;

    var bothInfinite = !isFinite(x1) && !isFinite(x2);
    if (bothInfinite) return;

    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;

    if (!isFinite(x1) || !isFinite(x2)) {
        // One endpoint at infinity: draw a vertical line
        var finiteX = isFinite(x1) ? x1 : x2;
        var screenPt = this.worldToScreen(finiteX, 0);
        var screenTop = this.worldToScreen(finiteX, this.canvas.height / this.scale + 10);

        // Viewport clipping check
        if (screenPt[0] < -10 || screenPt[0] > this.canvas.width + 10) return;

        ctx.beginPath();
        ctx.moveTo(screenPt[0], screenPt[1]);
        ctx.lineTo(screenTop[0], 0); // draw to top of canvas
        ctx.stroke();
        return;
    }

    // Both finite: draw semicircular arc
    var cx = (x1 + x2) / 2;
    var r = Math.abs(x2 - x1) / 2;

    if (r < 1e-12) return;

    // Viewport clipping: check if the semicircle intersects the visible area
    var screenLeft = this.worldToScreen(cx - r, 0);
    var screenRight = this.worldToScreen(cx + r, 0);
    var screenTop2 = this.worldToScreen(cx, r);

    // Bounding box check
    if (screenRight[0] < -5 || screenLeft[0] > this.canvas.width + 5) return;
    if (screenTop2[1] > this.canvas.height + 5) return;

    // Screen-space center and radius
    var screenCX = this.worldToScreen(cx, 0);
    var screenR = r * this.scale;

    // Skip geodesics that are too small to see
    if (screenR < 0.5) return;

    ctx.beginPath();
    // Arc from PI to 0 draws an upper semicircle (since y increases upward
    // in world coords but downward in screen coords, and the center is on
    // the real line at y=0 which is at the bottom of the canvas).
    // In canvas coords, the center is at (screenCX[0], screenCX[1]) which
    // is at the bottom (y = canvas.height), and we draw the semicircle going
    // upward, i.e., from angle PI to 0 in canvas coords (counterclockwise=false).
    ctx.arc(screenCX[0], screenCX[1], screenR, Math.PI, 0, false);
    ctx.stroke();
};

/**
 * Draw the Farey tessellation as thin gray geodesic lines.
 *
 * The Farey tessellation is built from the Stern-Brocot tree. For each pair
 * of Farey neighbors p/q and r/s (with |ps - qr| = 1), we draw the geodesic
 * between them.
 *
 * @param {number} maxDepth - maximum recursion depth (default: adaptive)
 */
HyperbolicCanvas.prototype.drawFareyTessellation = function(maxDepth) {
    var self = this;
    var color = COLORS.farey;
    var lineWidth = 0.5;

    // Minimum pixel size for a geodesic to be drawn
    var minPixels = 2;

    // Draw the real line first
    this._drawRealLine();

    /**
     * Recursively draw Farey geodesics using Stern-Brocot mediant construction.
     * Each call draws the geodesic between a/b and c/d, then recurses on
     * (a/b, mediant) and (mediant, c/d).
     *
     * @param {number} a - numerator of left fraction
     * @param {number} b - denominator of left fraction
     * @param {number} c - numerator of right fraction
     * @param {number} d - denominator of right fraction
     * @param {number} depth - current recursion depth
     */
    function fareyStern(a, b, c, d, depth) {
        // Mediant: (a+c)/(b+d)
        var mn = a + c;
        var md = b + d;

        // The geodesic spans from a/b to c/d
        var left, right;

        if (b === 0) {
            left = Infinity;
        } else {
            left = a / b;
        }

        if (d === 0) {
            right = Infinity;
        } else {
            right = c / d;
        }

        // Check pixel size of this geodesic
        if (isFinite(left) && isFinite(right)) {
            var pixelSize = Math.abs(right - left) * self.scale;
            if (pixelSize < minPixels) return;
        }

        // Draw the geodesic from left to right
        self.drawGeodesic(left, right, color, lineWidth);

        // Recurse on left and right subtrees
        // Stop if mediant denominator is too large (geodesic would be tiny)
        var mediantVal = mn / md;

        // Check if mediant geodesics would be visible
        var leftPixels, rightPixels;
        if (isFinite(left)) {
            leftPixels = Math.abs(mediantVal - left) * self.scale;
        } else {
            leftPixels = minPixels + 1; // always draw toward infinity
        }
        if (isFinite(right)) {
            rightPixels = Math.abs(right - mediantVal) * self.scale;
        } else {
            rightPixels = minPixels + 1;
        }

        if (leftPixels >= minPixels) {
            fareyStern(a, b, mn, md, depth + 1);
        }
        if (rightPixels >= minPixels) {
            fareyStern(mn, md, c, d, depth + 1);
        }
    }

    // The Farey tessellation covers the entire real line.
    // We seed with several initial pairs to cover positive and negative reals.
    //
    // Standard Farey pairs (Stern-Brocot tree seeds):
    //   (0/1, 1/0) covers [0, +inf)
    //   (-1/1, 0/1) covers [-1, 0]
    //   (-1/0, -1/1) covers (-inf, -1]
    //
    // We also add integer-to-integer pairs for better coverage.

    // Positive reals: 0/1 to 1/0 (i.e., 0 to infinity)
    fareyStern(0, 1, 1, 0, 0);

    // Negative reals: -1/0 to 0/1 (i.e., -infinity to 0)
    // Note: -1/0 = -Infinity; mediant is (-1+0)/(0+1) = -1/1 = -1
    fareyStern(-1, 0, 0, 1, 0);

    // Additional integer pairs for more coverage in the visible range
    var viewLeft = this.screenToWorld(0, 0)[0];
    var viewRight = this.screenToWorld(this.canvas.width, 0)[0];
    var iMin = Math.floor(viewLeft) - 1;
    var iMax = Math.ceil(viewRight) + 1;

    // Draw geodesics between consecutive integers (these are part of the tessellation)
    for (var i = iMin; i <= iMax; i++) {
        // Geodesic from i to i+1 is already generated by the Stern-Brocot tree
        // for small integers, but for integers far from 0 we add them explicitly
        if (i < -1 || i > 0) {
            this.drawGeodesic(i, i + 1, color, lineWidth);
        }
        // Also draw vertical geodesic from each integer to infinity
        this.drawGeodesic(i, Infinity, color, lineWidth);
    }
};

/**
 * Draw the real line (x-axis) as a horizontal line at y=0.
 * @private
 */
HyperbolicCanvas.prototype._drawRealLine = function() {
    var ctx = this.ctx;
    var baseY = this.worldToScreen(0, 0)[1];

    // Only draw if the real line is visible
    if (baseY < 0 || baseY > this.canvas.height) return;

    ctx.strokeStyle = COLORS.realLine;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, baseY);
    ctx.lineTo(this.canvas.width, baseY);
    ctx.stroke();

    // Draw tick marks and labels for integer points on the real line
    var viewLeft = this.screenToWorld(0, 0)[0];
    var viewRight = this.screenToWorld(this.canvas.width, 0)[0];

    // Determine tick spacing based on scale
    var tickSpacing = 1;
    if (this.scale < 30) tickSpacing = 5;
    if (this.scale < 10) tickSpacing = 10;
    if (this.scale > 200) tickSpacing = 0.5;

    var iMin = Math.floor(viewLeft / tickSpacing) * tickSpacing;
    var iMax = Math.ceil(viewRight / tickSpacing) * tickSpacing;

    ctx.fillStyle = '#64748b';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';

    for (var x = iMin; x <= iMax; x += tickSpacing) {
        var sx = this.worldToScreen(x, 0)[0];
        ctx.beginPath();
        ctx.moveTo(sx, baseY - 3);
        ctx.lineTo(sx, baseY + 3);
        ctx.stroke();

        // Label (avoid clutter by not labeling if too close together)
        if (Math.abs(x) < 1e-10) {
            ctx.fillText('0', sx, baseY + 14);
        } else {
            var label = (tickSpacing < 1) ? x.toFixed(1) : x.toString();
            ctx.fillText(label, sx, baseY + 14);
        }
    }
};

/**
 * Draw the axis (invariant geodesic) of a hyperbolic SL2Z matrix.
 *
 * The axis connects the two fixed points of M on the real line.
 *
 * @param {SL2Z} M - a hyperbolic element of SL(2,Z)
 * @param {string} color - stroke color
 * @param {number} lineWidth - stroke width
 * @param {string} [label] - optional text label
 */
HyperbolicCanvas.prototype.drawAxis = function(M, color, lineWidth, label) {
    if (!M.isHyperbolic()) return;

    var fps = M.fixedPoints();
    var xMinus = fps[0]; // repelling
    var xPlus = fps[1];  // attracting

    this.drawGeodesic(xMinus, xPlus, color, lineWidth);

    // Draw small directional arrows toward the attracting fixed point
    this._drawAxisArrow(xMinus, xPlus, color, lineWidth);

    // Draw label at the top of the geodesic arc
    if (label) {
        this._drawGeodesicLabel(xMinus, xPlus, label, color);
    }
};

/**
 * Draw a small arrow on the axis indicating direction of translation
 * (toward the attracting fixed point).
 * @private
 */
HyperbolicCanvas.prototype._drawAxisArrow = function(xMinus, xPlus, color, lineWidth) {
    var ctx = this.ctx;

    if (!isFinite(xMinus) || !isFinite(xPlus)) {
        // Vertical geodesic: draw arrow pointing upward
        var finiteX = isFinite(xMinus) ? xMinus : xPlus;
        var arrowY = 1.5; // world y for the arrow position
        var sp = this.worldToScreen(finiteX, arrowY);

        if (sp[0] < 0 || sp[0] > this.canvas.width) return;
        if (sp[1] < 0 || sp[1] > this.canvas.height) return;

        var arrowSize = 6;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(sp[0], sp[1] - arrowSize);
        ctx.lineTo(sp[0] - arrowSize * 0.5, sp[1] + arrowSize * 0.3);
        ctx.lineTo(sp[0] + arrowSize * 0.5, sp[1] + arrowSize * 0.3);
        ctx.closePath();
        ctx.fill();
        return;
    }

    // Semicircular arc: place arrow at ~60 degrees along the arc
    var cx = (xMinus + xPlus) / 2;
    var r = Math.abs(xPlus - xMinus) / 2;

    // Angle on the arc (measured from the center of the semicircle)
    // Place arrow at roughly 60 degrees from one end
    var angle = Math.PI * 0.35; // about 63 degrees from the right endpoint
    var arrowWorldX = cx + r * Math.cos(angle);
    var arrowWorldY = r * Math.sin(angle);

    var sp2 = this.worldToScreen(arrowWorldX, arrowWorldY);

    if (sp2[0] < 0 || sp2[0] > this.canvas.width) return;
    if (sp2[1] < 0 || sp2[1] > this.canvas.height) return;

    // Arrow tangent direction on the semicircle (toward attracting fixed point)
    // The tangent at angle theta on the upper semicircle is (-sin(theta), cos(theta))
    // in world coords, which translates to (-sin, -cos) in screen coords (y inverted).
    // Direction toward xPlus (attracting) is from left to right on the arc
    // when xPlus > xMinus.
    var dir = (xPlus > xMinus) ? -1 : 1;
    var tx = dir * (-Math.sin(angle));
    var ty = dir * (-Math.cos(angle)); // screen y is inverted

    // Normalize
    var tLen = Math.sqrt(tx * tx + ty * ty);
    tx /= tLen;
    ty /= tLen;

    var arrowSize = 7;
    var perpX = -ty;
    var perpY = tx;

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(sp2[0] + tx * arrowSize, sp2[1] + ty * arrowSize);
    ctx.lineTo(sp2[0] - tx * arrowSize * 0.3 + perpX * arrowSize * 0.5,
               sp2[1] - ty * arrowSize * 0.3 + perpY * arrowSize * 0.5);
    ctx.lineTo(sp2[0] - tx * arrowSize * 0.3 - perpX * arrowSize * 0.5,
               sp2[1] - ty * arrowSize * 0.3 - perpY * arrowSize * 0.5);
    ctx.closePath();
    ctx.fill();
};

/**
 * Draw a text label near the top of a geodesic arc.
 * @private
 */
HyperbolicCanvas.prototype._drawGeodesicLabel = function(x1, x2, label, color) {
    var ctx = this.ctx;

    var sx, sy;
    if (!isFinite(x1) || !isFinite(x2)) {
        // Vertical geodesic: label near the finite endpoint
        var finiteX = isFinite(x1) ? x1 : x2;
        var sp = this.worldToScreen(finiteX, 2.0);
        sx = sp[0] + 8;
        sy = sp[1];
    } else {
        // Semicircular arc: label at the top
        var cx = (x1 + x2) / 2;
        var r = Math.abs(x2 - x1) / 2;
        var sp2 = this.worldToScreen(cx, r);
        sx = sp2[0];
        sy = sp2[1] - 8;
    }

    // Check bounds
    if (sx < 0 || sx > this.canvas.width) return;
    if (sy < 0 || sy > this.canvas.height) return;

    ctx.fillStyle = color;
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(label, sx, sy);
};

/**
 * Draw the isometric circle of an SL2Z matrix M = [[a,b],[c,d]].
 *
 * The isometric circle has center -d/c and radius 1/|c| on the real line.
 * We draw the upper semicircle (the portion in the upper half-plane).
 *
 * @param {SL2Z} M - an element of SL(2,Z)
 * @param {string} color - fill/stroke color
 * @param {number} [alpha=0.1] - fill opacity
 */
HyperbolicCanvas.prototype.drawIsometricCircle = function(M, color, alpha) {
    if (M.c === 0) return; // no isometric circle for parabolic/upper-triangular

    alpha = (alpha !== undefined) ? alpha : 0.1;

    var centerWorld = -M.d / M.c;
    var radiusWorld = 1 / Math.abs(M.c);

    // Transform to screen coords
    var screenCenter = this.worldToScreen(centerWorld, 0);
    var screenRadius = radiusWorld * this.scale;

    // Viewport clipping
    if (screenCenter[0] + screenRadius < -5) return;
    if (screenCenter[0] - screenRadius > this.canvas.width + 5) return;
    if (screenRadius < 0.5) return;

    var ctx = this.ctx;

    // Fill the semicircle with semi-transparent color
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(screenCenter[0], screenCenter[1], screenRadius, Math.PI, 0, false);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Stroke the semicircle border
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(screenCenter[0], screenCenter[1], screenRadius, Math.PI, 0, false);
    ctx.stroke();
};

/**
 * Draw the convex hull region. For a Schottky group, the excluded regions are
 * inside the isometric circles of the generators and their inverses. We draw
 * these as shaded disks.
 *
 * @param {Object} groupData - output of constructGroup(p)
 * @param {string} [fillColor] - override fill color (not typically used)
 */
HyperbolicCanvas.prototype.drawConvexHull = function(groupData, fillColor) {
    var A = groupData.A;
    var B = groupData.B;
    var P = groupData.P;

    // Draw isometric circles of A, A^{-1}, B, B^{-1}
    this.drawIsometricCircle(A, COLORS.axisA, 0.1);
    this.drawIsometricCircle(A.inv(), COLORS.axisA, 0.1);
    this.drawIsometricCircle(B, COLORS.axisB, 0.1);
    this.drawIsometricCircle(B.inv(), COLORS.axisB, 0.1);

    // Draw isometric circles of P, P^{-1} if P exists
    if (P) {
        this.drawIsometricCircle(P, COLORS.axisP, 0.1);
        this.drawIsometricCircle(P.inv(), COLORS.axisP, 0.1);
    }
};

/**
 * Draw a fixed point as a small filled circle on the real line.
 *
 * @param {number} x - x-coordinate on the real line
 * @param {string} color - fill color
 * @param {number} [radius=4] - radius in pixels
 */
HyperbolicCanvas.prototype.drawFixedPoint = function(x, color, radius) {
    if (!isFinite(x)) return;

    radius = radius || 4;
    var sp = this.worldToScreen(x, 0);

    // Viewport clipping
    if (sp[0] < -radius || sp[0] > this.canvas.width + radius) return;
    if (sp[1] < -radius || sp[1] > this.canvas.height + radius) return;

    var ctx = this.ctx;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(sp[0], sp[1], radius, 0, 2 * Math.PI);
    ctx.fill();

    // Thin border for visibility
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.stroke();
};

/**
 * Main render function. Draws all layers of the visualization for a given
 * group construction.
 *
 * Layer order (back to front):
 *   1. White background
 *   2. Farey tessellation (thin gray lines)
 *   3. Isometric circles / convex hull (semi-transparent)
 *   4. Axes of generators (prominent colored arcs)
 *   5. Fixed points (dots on the real line)
 *   6. Labels
 *
 * @param {Object} groupData - output of constructGroup(p)
 */
HyperbolicCanvas.prototype.render = function(groupData) {
    this._groupData = groupData;

    var A = groupData.A;
    var B = groupData.B;
    var P = groupData.P;

    // Layer 1: Clear
    this.clear();

    // Layer 2: Farey tessellation (background)
    this.drawFareyTessellation();

    // Layer 3: Convex hull / isometric circles (mid layer)
    this.drawConvexHull(groupData);

    // Layer 4: Axes of generators (foreground, prominent)
    this.drawAxis(A, COLORS.axisA, 3, 'A');
    this.drawAxis(B, COLORS.axisB, 3, 'B');

    if (P) {
        this.drawAxis(P, COLORS.axisP, 2, 'P');
    }

    // Layer 5: Fixed points as dots on the real line
    if (A.isHyperbolic()) {
        var fpsA = A.fixedPoints();
        this.drawFixedPoint(fpsA[0], COLORS.axisA, 4);
        this.drawFixedPoint(fpsA[1], COLORS.axisA, 4);
    }

    if (B.isHyperbolic()) {
        var fpsB = B.fixedPoints();
        this.drawFixedPoint(fpsB[0], COLORS.axisB, 4);
        this.drawFixedPoint(fpsB[1], COLORS.axisB, 4);
    }

    if (P && P.isHyperbolic()) {
        var fpsP = P.fixedPoints();
        this.drawFixedPoint(fpsP[0], COLORS.axisP, 4);
        this.drawFixedPoint(fpsP[1], COLORS.axisP, 4);
    }

    // Layer 6: Draw boundary axes if present
    if (groupData.extendedSurface && groupData.extendedSurface.boundaryMatrices) {
        var bdMats = groupData.extendedSurface.boundaryMatrices;
        for (var i = 0; i < bdMats.length; i++) {
            if (bdMats[i].isHyperbolic()) {
                // Draw boundary axes as dashed lines in a muted version of the colors
                this._drawDashedAxis(bdMats[i], i === 0 ? COLORS.axisA : COLORS.axisB, 1.5);
            }
        }
    }
};

/**
 * Draw a dashed geodesic axis for a matrix (used for boundary component axes).
 * @private
 * @param {SL2Z} M
 * @param {string} color
 * @param {number} lineWidth
 */
HyperbolicCanvas.prototype._drawDashedAxis = function(M, color, lineWidth) {
    if (!M.isHyperbolic()) return;

    var fps = M.fixedPoints();
    var x1 = fps[0];
    var x2 = fps[1];

    if (!isFinite(x1) && !isFinite(x2)) return;

    var ctx = this.ctx;
    ctx.save();
    ctx.setLineDash([6, 4]);
    ctx.globalAlpha = 0.5;
    this.drawGeodesic(x1, x2, color, lineWidth);
    ctx.setLineDash([]);
    ctx.restore();
};

// ---------------------------------------------------------------------------
// Interactive controls
// ---------------------------------------------------------------------------

/**
 * Handle mouse down: begin dragging to pan.
 * @private
 */
HyperbolicCanvas.prototype._onMouseDown = function(e) {
    this._dragging = true;
    this._lastMouseX = e.offsetX;
    this._lastMouseY = e.offsetY;
    this.canvas.style.cursor = 'grabbing';
};

/**
 * Handle mouse move: pan viewport if dragging.
 * @private
 */
HyperbolicCanvas.prototype._onMouseMove = function(e) {
    if (!this._dragging) return;

    var dx = e.offsetX - this._lastMouseX;
    var dy = e.offsetY - this._lastMouseY;

    // Convert pixel deltas to world deltas
    this.centerX -= dx / this.scale;
    // Don't pan centerY (keep real line at bottom), but allow vertical pan:
    // Actually, we should allow vertical panning too for exploring H^2
    // centerY += dy / this.scale; // uncomment if vertical pan desired

    this._lastMouseX = e.offsetX;
    this._lastMouseY = e.offsetY;

    // Re-render
    if (this._groupData) {
        this.render(this._groupData);
    }
};

/**
 * Handle mouse up: stop dragging.
 * @private
 */
HyperbolicCanvas.prototype._onMouseUp = function(e) {
    this._dragging = false;
    this.canvas.style.cursor = 'grab';
};

/**
 * Handle scroll wheel: zoom in/out centered on mouse position.
 * @private
 */
HyperbolicCanvas.prototype._onWheel = function(e) {
    e.preventDefault();

    // Zoom factor
    var zoomFactor = 1.1;
    if (e.deltaY > 0) {
        zoomFactor = 1 / zoomFactor; // zoom out
    }

    // Get world position under the mouse before zoom
    var worldBefore = this.screenToWorld(e.offsetX, e.offsetY);

    // Apply zoom
    this.scale *= zoomFactor;

    // Clamp scale to reasonable range
    if (this.scale < 5) this.scale = 5;
    if (this.scale > 10000) this.scale = 10000;

    // Get world position under the mouse after zoom
    var worldAfter = this.screenToWorld(e.offsetX, e.offsetY);

    // Adjust center so the point under the mouse stays fixed
    this.centerX += worldBefore[0] - worldAfter[0];
    // We could also adjust centerY here if we had vertical panning

    // Re-render
    if (this._groupData) {
        this.render(this._groupData);
    }
};

/**
 * Set the viewport to nicely frame the axes of the generators.
 *
 * @param {Object} groupData - output of constructGroup(p)
 */
HyperbolicCanvas.prototype.fitToGroup = function(groupData) {
    var A = groupData.A;
    var B = groupData.B;
    var P = groupData.P;

    // Collect all finite fixed points
    var points = [];

    if (A.isHyperbolic()) {
        var fpsA = A.fixedPoints();
        if (isFinite(fpsA[0])) points.push(fpsA[0]);
        if (isFinite(fpsA[1])) points.push(fpsA[1]);
    }
    if (B.isHyperbolic()) {
        var fpsB = B.fixedPoints();
        if (isFinite(fpsB[0])) points.push(fpsB[0]);
        if (isFinite(fpsB[1])) points.push(fpsB[1]);
    }
    if (P && P.isHyperbolic()) {
        var fpsP = P.fixedPoints();
        if (isFinite(fpsP[0])) points.push(fpsP[0]);
        if (isFinite(fpsP[1])) points.push(fpsP[1]);
    }

    if (points.length === 0) {
        this.centerX = 0;
        this.scale = 80;
        return;
    }

    var minX = Math.min.apply(null, points);
    var maxX = Math.max.apply(null, points);
    var rangeX = maxX - minX;

    // Center on the midpoint of the fixed points
    this.centerX = (minX + maxX) / 2;

    // Set scale so the range fills about 70% of the canvas width
    if (rangeX > 0) {
        this.scale = (this.canvas.width * 0.7) / rangeX;
    } else {
        this.scale = 80;
    }

    // Clamp scale
    if (this.scale < 5) this.scale = 5;
    if (this.scale > 10000) this.scale = 10000;
};
