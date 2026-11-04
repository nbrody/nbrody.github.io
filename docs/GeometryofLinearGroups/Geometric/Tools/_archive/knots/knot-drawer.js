// Canvas setup
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

// State
let isDrawing = false;
let currentStroke = [];
let allStrokes = [];
let mode = 'draw';
let brushSize = 3;
let strokeColor = '#000000';
let showOrientations = false;
let knotDiagram = null;

// UI Elements
const drawBtn = document.getElementById('drawBtn');
const eraseBtn = document.getElementById('eraseBtn');
const brushSizeInput = document.getElementById('brushSize');
const brushSizeValue = document.getElementById('brushSizeValue');
const strokeColorInput = document.getElementById('strokeColor');
const clearBtn = document.getElementById('clearBtn');
const undoBtn = document.getElementById('undoBtn');
const exportBtn = document.getElementById('exportBtn');
const toggleOrientationBtn = document.getElementById('toggleOrientation');
const crossingCountEl = document.getElementById('crossingCount');
const arcCountEl = document.getElementById('arcCount');
const componentCountEl = document.getElementById('componentCount');

// Crossing class to store crossing data
class Crossing {
    constructor(point, stroke1Index, stroke2Index, segment1Index, segment2Index) {
        this.point = point;
        this.stroke1Index = stroke1Index;
        this.stroke2Index = stroke2Index;
        this.segment1Index = segment1Index;
        this.segment2Index = segment2Index;
        // Determine over/under: later stroke goes under by default
        this.overStroke = stroke1Index;
        this.underStroke = stroke2Index;
    }

    toggleOverUnder() {
        [this.overStroke, this.underStroke] = [this.underStroke, this.overStroke];
    }
}

// Arc class to represent a strand segment between crossings
class Arc {
    constructor(id, strokeIndex, startPoint, endPoint) {
        this.id = id;
        this.strokeIndex = strokeIndex;
        this.startPoint = startPoint;
        this.endPoint = endPoint;
    }
}

// Knot Diagram class to store combinatorial data
class KnotDiagram {
    constructor(strokes, crossings) {
        this.strokes = strokes;
        this.crossings = crossings;
        this.arcs = [];
        this.components = 0;

        this.computeArcs();
        this.computeComponents();
    }

    computeArcs() {
        // Each crossing creates arc endpoints
        // Simplified: count arcs as number of stroke segments minus self-crossings
        let arcCount = 0;
        for (let stroke of this.strokes) {
            // Each stroke contributes (number of segments) arcs initially
            arcCount += Math.max(0, stroke.points.length - 1);
        }
        // Crossings split arcs
        arcCount += this.crossings.length;

        this.arcs = Array(arcCount).fill(null).map((_, i) => ({
            id: i,
            startCrossing: null,
            endCrossing: null
        }));
    }

    computeComponents() {
        // Simplified component counting: each connected stroke is a component
        // In a real implementation, we'd trace connectivity through crossings
        this.components = this.strokes.length;
    }

    getCrossingCount() {
        return this.crossings.length;
    }

    getArcCount() {
        return this.arcs.length;
    }

    getComponentCount() {
        return this.components;
    }
}

// Stroke class to store drawing data
class Stroke {
    constructor(points, color, size) {
        this.points = points;
        this.color = color;
        this.size = size;
    }

    draw(context, crossings = []) {
        if (this.points.length < 2) return;

        context.strokeStyle = this.color;
        context.lineWidth = this.size;
        context.lineCap = 'round';
        context.lineJoin = 'round';

        // Draw the stroke in segments, creating gaps at crossings
        const strokeIndex = allStrokes.indexOf(this);

        for (let i = 0; i < this.points.length - 1; i++) {
            const p1 = this.points[i];
            const p2 = this.points[i + 1];

            // Find crossings on this segment
            const segmentCrossings = crossings.filter(c =>
                (c.stroke1Index === strokeIndex && c.segment1Index === i) ||
                (c.stroke2Index === strokeIndex && c.segment2Index === i)
            );

            if (segmentCrossings.length === 0) {
                // No crossings, draw normally
                context.beginPath();
                context.moveTo(p1.x, p1.y);
                context.lineTo(p2.x, p2.y);
                context.stroke();
            } else {
                // Draw segment with gaps at crossings where this stroke goes under
                const points = [p1];

                for (let crossing of segmentCrossings) {
                    if (crossing.underStroke === strokeIndex) {
                        points.push(crossing.point);
                    }
                }

                points.push(p2);
                points.sort((a, b) => {
                    const distA = Math.hypot(a.x - p1.x, a.y - p1.y);
                    const distB = Math.hypot(b.x - p1.x, b.y - p1.y);
                    return distA - distB;
                });

                // Draw segments with gaps
                for (let j = 0; j < points.length - 1; j++) {
                    const start = points[j];
                    const end = points[j + 1];

                    // Check if this segment crosses a point where we go under
                    let drawSegment = true;
                    for (let crossing of segmentCrossings) {
                        if (crossing.underStroke === strokeIndex) {
                            const distToStart = Math.hypot(crossing.point.x - start.x, crossing.point.y - start.y);
                            const distToEnd = Math.hypot(crossing.point.x - end.x, crossing.point.y - end.y);
                            if (distToStart < 0.1 || distToEnd < 0.1) {
                                drawSegment = false;
                                break;
                            }
                        }
                    }

                    if (drawSegment) {
                        // Apply gap by shortening the segment slightly at crossing points
                        const gapSize = this.size * 1.5;
                        let drawStart = start;
                        let drawEnd = end;

                        for (let crossing of segmentCrossings) {
                            if (crossing.underStroke === strokeIndex) {
                                const dist = Math.hypot(crossing.point.x - start.x, crossing.point.y - start.y);
                                if (dist < gapSize * 2) {
                                    const dx = end.x - start.x;
                                    const dy = end.y - start.y;
                                    const len = Math.hypot(dx, dy);
                                    if (len > 0) {
                                        const t = gapSize / len;
                                        drawStart = {
                                            x: start.x + dx * t,
                                            y: start.y + dy * t
                                        };
                                    }
                                }

                                const dist2 = Math.hypot(crossing.point.x - end.x, crossing.point.y - end.y);
                                if (dist2 < gapSize * 2) {
                                    const dx = start.x - end.x;
                                    const dy = start.y - end.y;
                                    const len = Math.hypot(dx, dy);
                                    if (len > 0) {
                                        const t = gapSize / len;
                                        drawEnd = {
                                            x: end.x + dx * t,
                                            y: end.y + dy * t
                                        };
                                    }
                                }
                            }
                        }

                        context.beginPath();
                        context.moveTo(drawStart.x, drawStart.y);
                        context.lineTo(drawEnd.x, drawEnd.y);
                        context.stroke();
                    }
                }
            }
        }
    }

    drawOrientation(context) {
        if (this.points.length < 2) return;

        // Draw arrow at midpoint
        const midIndex = Math.floor(this.points.length / 2);
        const p1 = this.points[Math.max(0, midIndex - 1)];
        const p2 = this.points[Math.min(this.points.length - 1, midIndex + 1)];

        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const len = Math.hypot(dx, dy);

        if (len === 0) return;

        const ux = dx / len;
        const uy = dy / len;

        const arrowSize = 12;
        const midX = (p1.x + p2.x) / 2;
        const midY = (p1.y + p2.y) / 2;

        context.fillStyle = this.color;
        context.beginPath();
        context.moveTo(midX + ux * arrowSize, midY + uy * arrowSize);
        context.lineTo(midX - ux * arrowSize + uy * arrowSize * 0.5,
                       midY - uy * arrowSize - ux * arrowSize * 0.5);
        context.lineTo(midX - ux * arrowSize - uy * arrowSize * 0.5,
                       midY - uy * arrowSize + ux * arrowSize * 0.5);
        context.closePath();
        context.fill();
    }
}

// Get mouse position relative to canvas
function getMousePos(e) {
    const rect = canvas.getBoundingClientRect();
    return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
    };
}

// Mouse event handlers
canvas.addEventListener('mousedown', (e) => {
    isDrawing = true;
    const pos = getMousePos(e);
    currentStroke = [pos];
});

canvas.addEventListener('mousemove', (e) => {
    if (!isDrawing) return;

    const pos = getMousePos(e);
    currentStroke.push(pos);

    // Redraw everything
    redrawCanvas();

    // Draw current stroke in progress
    if (currentStroke.length > 1) {
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = brushSize;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        ctx.beginPath();
        ctx.moveTo(currentStroke[0].x, currentStroke[0].y);

        for (let i = 1; i < currentStroke.length; i++) {
            ctx.lineTo(currentStroke[i].x, currentStroke[i].y);
        }

        ctx.stroke();
    }
});

canvas.addEventListener('mouseup', () => {
    if (isDrawing && currentStroke.length > 1) {
        const stroke = new Stroke([...currentStroke], strokeColor, brushSize);
        allStrokes.push(stroke);
        currentStroke = [];
        updateKnotDiagram();
        redrawCanvas();
    }
    isDrawing = false;
});

canvas.addEventListener('mouseleave', () => {
    if (isDrawing && currentStroke.length > 1) {
        const stroke = new Stroke([...currentStroke], strokeColor, brushSize);
        allStrokes.push(stroke);
        currentStroke = [];
        updateKnotDiagram();
        redrawCanvas();
    }
    isDrawing = false;
});

// Touch support for mobile
canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    const touch = e.touches[0];
    const mouseEvent = new MouseEvent('mousedown', {
        clientX: touch.clientX,
        clientY: touch.clientY
    });
    canvas.dispatchEvent(mouseEvent);
});

canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    const touch = e.touches[0];
    const mouseEvent = new MouseEvent('mousemove', {
        clientX: touch.clientX,
        clientY: touch.clientY
    });
    canvas.dispatchEvent(mouseEvent);
});

canvas.addEventListener('touchend', (e) => {
    e.preventDefault();
    const mouseEvent = new MouseEvent('mouseup', {});
    canvas.dispatchEvent(mouseEvent);
});

// Find all crossing points between strokes
function findCrossings() {
    const crossings = [];

    for (let i = 0; i < allStrokes.length; i++) {
        for (let j = i + 1; j < allStrokes.length; j++) {
            const stroke1 = allStrokes[i];
            const stroke2 = allStrokes[j];

            for (let a = 0; a < stroke1.points.length - 1; a++) {
                for (let b = 0; b < stroke2.points.length - 1; b++) {
                    const intersection = getLineIntersection(
                        stroke1.points[a],
                        stroke1.points[a + 1],
                        stroke2.points[b],
                        stroke2.points[b + 1]
                    );

                    if (intersection) {
                        crossings.push(new Crossing(intersection, i, j, a, b));
                    }
                }
            }
        }
    }

    return crossings;
}

// Calculate line segment intersection
function getLineIntersection(p1, p2, p3, p4) {
    const x1 = p1.x, y1 = p1.y;
    const x2 = p2.x, y2 = p2.y;
    const x3 = p3.x, y3 = p3.y;
    const x4 = p4.x, y4 = p4.y;

    const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);

    if (Math.abs(denom) < 0.0001) return null;

    const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
    const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;

    if (t > 0.05 && t < 0.95 && u > 0.05 && u < 0.95) {
        return {
            x: x1 + t * (x2 - x1),
            y: y1 + t * (y2 - y1)
        };
    }

    return null;
}

// Update knot diagram data structure
function updateKnotDiagram() {
    const crossings = findCrossings();
    knotDiagram = new KnotDiagram(allStrokes, crossings);
    updateDataPanel();
}

// Update data panel with current statistics
function updateDataPanel() {
    if (knotDiagram) {
        crossingCountEl.textContent = knotDiagram.getCrossingCount();
        arcCountEl.textContent = knotDiagram.getArcCount();
        componentCountEl.textContent = knotDiagram.getComponentCount();
    } else {
        crossingCountEl.textContent = '0';
        arcCountEl.textContent = '0';
        componentCountEl.textContent = '0';
    }
}

// Redraw all strokes
function redrawCanvas() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (allStrokes.length === 0) return;

    const crossings = knotDiagram ? knotDiagram.crossings : [];

    // Draw all strokes with crossing gaps
    for (let stroke of allStrokes) {
        stroke.draw(ctx, crossings);
    }

    // Draw orientations if enabled
    if (showOrientations) {
        for (let stroke of allStrokes) {
            stroke.drawOrientation(ctx);
        }
    }

    // Draw crossing points for debugging
    if (crossings.length > 0) {
        ctx.fillStyle = 'rgba(255, 0, 0, 0.3)';
        for (let crossing of crossings) {
            ctx.beginPath();
            ctx.arc(crossing.point.x, crossing.point.y, 4, 0, Math.PI * 2);
            ctx.fill();
        }
    }
}

// UI Event Handlers
drawBtn.addEventListener('click', () => {
    mode = 'draw';
    drawBtn.classList.add('active');
    eraseBtn.classList.remove('active');
    canvas.style.cursor = 'crosshair';
});

eraseBtn.addEventListener('click', () => {
    mode = 'erase';
    eraseBtn.classList.add('active');
    drawBtn.classList.remove('active');
    canvas.style.cursor = 'pointer';
    strokeColor = '#ffffff';
    strokeColorInput.value = '#ffffff';
});

brushSizeInput.addEventListener('input', (e) => {
    brushSize = parseInt(e.target.value);
    brushSizeValue.textContent = brushSize;
});

strokeColorInput.addEventListener('input', (e) => {
    strokeColor = e.target.value;
    if (mode === 'erase') {
        mode = 'draw';
        drawBtn.classList.add('active');
        eraseBtn.classList.remove('active');
        canvas.style.cursor = 'crosshair';
    }
});

clearBtn.addEventListener('click', () => {
    if (confirm('Clear the entire canvas?')) {
        allStrokes = [];
        knotDiagram = null;
        updateDataPanel();
        redrawCanvas();
    }
});

undoBtn.addEventListener('click', () => {
    if (allStrokes.length > 0) {
        allStrokes.pop();
        updateKnotDiagram();
        redrawCanvas();
    }
});

exportBtn.addEventListener('click', () => {
    const link = document.createElement('a');
    link.download = 'knot-drawing.png';
    link.href = canvas.toDataURL();
    link.click();
});

toggleOrientationBtn.addEventListener('click', () => {
    showOrientations = !showOrientations;
    toggleOrientationBtn.textContent = showOrientations ? 'Hide Orientations' : 'Show Orientations';
    redrawCanvas();
});

// Initial draw
updateDataPanel();
redrawCanvas();
