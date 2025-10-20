/**
 * 2D Canvas Renderer for Poincaré Disk Model
 */

export class PoincareRenderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.width = canvas.width;
        this.height = canvas.height;
        this.centerX = this.width / 2;
        this.centerY = this.height / 2;
        this.scale = Math.min(this.width, this.height) * 0.4; // Disk radius in pixels

        this.sphereCenters = [];
        this.sphereRadii = [];
        this.planeNormals = [];
        this.faceMatrices = []; // Store matrix for each face
        this.vertices = []; // Store vertices of fundamental domain
        this.vertexCycles = []; // Store vertex equivalence classes
        this.vertexAngleSums = []; // Store angle sums for each cycle
        this.selectedFaceId = -1;
        this.hoveredFaceId = -1;
        this.mappedFaceId = -1; // Face that the selected face maps to
        this.selectedVertexId = -1; // Selected vertex
        this.hoveredVertexId = -1; // Hovered vertex
        this.paletteMode = 0;
        this.showBoundary = true;
        this.showDomainOrbit = false; // Show orbit coloring
        this.showCayleyGraph = false; // Show Cayley graph
        this.selectedEdgeFaces = [-1, -1];
        this.shiftClickedFaceId = -1; // For angle calculation

        // Animation state
        this.popFaceId = -1;
        this.popStrength = 0;
        this.popStartTime = 0;
        this.popDuration = 600;

        this.setupEventListeners();
    }

    setupEventListeners() {
        this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        this.canvas.addEventListener('click', (e) => this.handleClick(e));
    }

    resize(width, height) {
        this.width = width;
        this.height = height;
        this.canvas.width = width;
        this.canvas.height = height;
        this.centerX = width / 2;
        this.centerY = height / 2;
        this.scale = Math.min(width, height) * 0.4;
        this.render();
    }

    setGeometry(sphereCenters, sphereRadii, planeNormals, faceMatrices = []) {
        this.sphereCenters = sphereCenters;
        this.sphereRadii = sphereRadii;
        this.planeNormals = planeNormals;
        this.faceMatrices = faceMatrices;
    }

    setVertices(vertices, cycles, angleSums) {
        this.vertices = vertices || [];
        this.vertexCycles = cycles || [];
        this.vertexAngleSums = angleSums || [];
    }

    // Convert from Poincaré disk coordinates to screen coordinates
    // Rotated 90° counterclockwise so infinity is at the top
    diskToScreen(x, y) {
        // Apply 90° counterclockwise rotation: (x, y) → (-y, x)
        const rotatedX = -y;
        const rotatedY = x;
        return {
            x: this.centerX + rotatedX * this.scale,
            y: this.centerY - rotatedY * this.scale // Flip y for screen coordinates
        };
    }

    // Convert from screen coordinates to Poincaré disk coordinates
    // Inverse of 90° counterclockwise rotation
    screenToDisk(screenX, screenY) {
        const rotatedX = (screenX - this.centerX) / this.scale;
        const rotatedY = -(screenY - this.centerY) / this.scale;
        // Inverse rotation: (-y, x) → (y, -x)
        return {
            x: rotatedY,
            y: -rotatedX
        };
    }

    // Get color for a face ID based on palette
    getFaceColor(faceId, alpha = 1.0) {
        const palettes = [
            // Colorful
            ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E2'],
            // Vaporwave
            ['#FF71CE', '#01CDFE', '#05FFA1', '#B967FF', '#FFFB96', '#FF6AD5', '#C774E8', '#94D0FF'],
            // UC colors
            ['#003262', '#FDB515', '#3B7EA1', '#FDB515', '#003262', '#C4820E', '#003262', '#FDB515'],
            // Halloween
            ['#FF6600', '#000000', '#9D00FF', '#FF6600', '#000000', '#9D00FF', '#FF6600', '#000000'],
            // Tie-dye
            ['#FF1493', '#00CED1', '#FFD700', '#9370DB', '#FF6347', '#20B2AA', '#FF69B4', '#4169E1'],
            // Sunset
            ['#FF6B35', '#F7931E', '#FDC830', '#F37335', '#C06C84', '#6C5B7B', '#355C7D', '#2A9D8F']
        ];

        const palette = palettes[this.paletteMode % palettes.length];
        const color = palette[faceId % palette.length];

        // Convert hex to rgba
        const r = parseInt(color.slice(1, 3), 16);
        const g = parseInt(color.slice(3, 5), 16);
        const b = parseInt(color.slice(5, 7), 16);

        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    // Draw a geodesic circle in the Poincaré disk
    drawGeodesicCircle(center, radius, faceId, isSelected = false, isHovered = false, isMapped = false, isShiftClicked = false) {
        const ctx = this.ctx;
        const screenCenter = this.diskToScreen(center.x, center.y);
        const screenRadius = radius * this.scale;

        // Determine stroke width and style
        let strokeWidth = 2;
        let alpha = 0.8;
        let dashPattern = [];

        if (isSelected) {
            strokeWidth = 4;
            alpha = 1.0;
        } else if (isMapped) {
            strokeWidth = 4;
            alpha = 1.0;
            dashPattern = [10, 5]; // Dashed line for mapped geodesic
        } else if (isShiftClicked) {
            strokeWidth = 4;
            alpha = 1.0;
            dashPattern = [5, 5]; // Different dash pattern for shift-clicked
        } else if (isHovered) {
            strokeWidth = 3;
            alpha = 0.9;
        }

        // Add pop effect
        if (this.popFaceId === faceId && this.popStrength > 0) {
            const popScale = 1 + this.popStrength * 0.05;
            strokeWidth *= popScale;
            ctx.save();
        }

        // Draw only the stroke (geodesic boundary)
        ctx.strokeStyle = this.getFaceColor(faceId, alpha);
        ctx.lineWidth = strokeWidth;
        ctx.setLineDash(dashPattern);
        ctx.beginPath();
        ctx.arc(screenCenter.x, screenCenter.y, screenRadius, 0, 2 * Math.PI);
        ctx.stroke();
        ctx.setLineDash([]); // Reset dash pattern

        if (this.popFaceId === faceId && this.popStrength > 0) {
            ctx.restore();
        }
    }

    // Draw a geodesic line through origin in the Poincaré disk
    drawGeodesicLine(normal, faceId, isSelected = false, isHovered = false, isMapped = false, isShiftClicked = false) {
        const ctx = this.ctx;

        // Line through origin with normal (nx, ny) is perpendicular to normal
        // Direction along line: (-ny, nx)
        const dx = -normal.y;
        const dy = normal.x;

        // Find intersection with unit disk boundary
        // Parametric line: (t*dx, t*dy)
        // At boundary: t^2(dx^2 + dy^2) = 1
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len < 1e-9) return;

        const t = 1.0 / len;
        const p1 = this.diskToScreen(t * dx, t * dy);
        const p2 = this.diskToScreen(-t * dx, -t * dy);

        // Determine stroke style
        let strokeWidth = 2;
        let alpha = 0.8;
        let dashPattern = [];

        if (isSelected) {
            strokeWidth = 4;
            alpha = 1.0;
        } else if (isMapped) {
            strokeWidth = 4;
            alpha = 1.0;
            dashPattern = [10, 5]; // Dashed line for mapped geodesic
        } else if (isShiftClicked) {
            strokeWidth = 4;
            alpha = 1.0;
            dashPattern = [5, 5]; // Different dash pattern for shift-clicked
        } else if (isHovered) {
            strokeWidth = 3;
            alpha = 0.9;
        }

        // Add pop effect
        if (this.popFaceId === faceId && this.popStrength > 0) {
            const popScale = 1 + this.popStrength * 0.05;
            strokeWidth *= popScale;
        }

        // Draw line
        ctx.strokeStyle = this.getFaceColor(faceId, alpha);
        ctx.lineWidth = strokeWidth;
        ctx.setLineDash(dashPattern);
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
        ctx.setLineDash([]); // Reset dash pattern
    }

    // Find which vertex is at a given screen position
    getVertexAtScreen(screenX, screenY) {
        if (!this.vertices || this.vertices.length === 0) return -1;

        const clickRadius = 10; // pixels

        for (let i = 0; i < this.vertices.length; i++) {
            const vertex = this.vertices[i];
            const screen = this.diskToScreen(vertex.point.x, vertex.point.y);

            const dx = screenX - screen.x;
            const dy = screenY - screen.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist <= clickRadius) {
                return i;
            }
        }

        return -1;
    }

    // Find which face is at a given point in the disk
    getFaceAtPoint(diskX, diskY) {
        // Check if point is inside unit disk
        const r = Math.sqrt(diskX * diskX + diskY * diskY);
        if (r >= 1.0) return -1;

        let closestFaceId = -1;
        let minDist = Infinity;

        // Check circles (sphere geodesics)
        for (let i = 0; i < this.sphereCenters.length; i++) {
            const center = this.sphereCenters[i];
            const radius = this.sphereRadii[i];

            const dx = diskX - center.x;
            const dy = diskY - center.y;
            const distToCenter = Math.sqrt(dx * dx + dy * dy);
            const distToBoundary = Math.abs(distToCenter - radius);

            if (distToBoundary < minDist) {
                minDist = distToBoundary;
                closestFaceId = i;
            }
        }

        // Check lines (plane geodesics through origin)
        const numSpheres = this.sphereCenters.length;
        for (let i = 0; i < this.planeNormals.length; i++) {
            const normal = this.planeNormals[i];
            const distToLine = Math.abs(diskX * normal.x + diskY * normal.y);

            if (distToLine < minDist) {
                minDist = distToLine;
                closestFaceId = numSpheres + i;
            }
        }

        // Return face if we're close enough to a boundary
        return minDist < 0.05 ? closestFaceId : -1;
    }

    handleMouseMove(e) {
        const rect = this.canvas.getBoundingClientRect();
        const screenX = e.clientX - rect.left;
        const screenY = e.clientY - rect.top;

        // Check for vertex hover first
        const vertexId = this.getVertexAtScreen(screenX, screenY);

        if (vertexId >= 0) {
            // Hovering over a vertex
            if (vertexId !== this.hoveredVertexId || this.hoveredFaceId !== -1) {
                this.hoveredVertexId = vertexId;
                this.hoveredFaceId = -1;
                this.render();
            }
        } else {
            // Check for face hover
            const disk = this.screenToDisk(screenX, screenY);
            const faceId = this.getFaceAtPoint(disk.x, disk.y);

            if (faceId !== this.hoveredFaceId || this.hoveredVertexId !== -1) {
                this.hoveredFaceId = faceId;
                this.hoveredVertexId = -1;
                this.render();
            }
        }
    }

    // Apply a PSL(2,R) matrix to a point in Minkowski space
    applyMatrixToPoint(matrix, point) {
        if (!matrix || !point) return null;

        const [x, y, t] = point;

        // Matrix elements
        const a = matrix.a?.re ?? matrix.a;
        const b = matrix.b?.re ?? matrix.b;
        const c = matrix.c?.re ?? matrix.c;
        const d = matrix.d?.re ?? matrix.d;

        // Apply SO(2,1) action via symmetric matrix conjugation
        // H = [[t+x, y], [y, t-x]]
        // g H g^T maps (x,y,t) to (x',y',t')

        const h11 = t + x;
        const h12 = y;
        const h22 = t - x;

        // Compute g H
        const gh11 = a * h11 + b * h12;
        const gh12 = a * h12 + b * h22;
        const gh21 = c * h11 + d * h12;
        const gh22 = c * h12 + d * h22;

        // Compute g H g^T
        const result11 = gh11 * a + gh12 * c;
        const result12 = gh11 * b + gh12 * d;
        const result22 = gh21 * b + gh22 * d;

        // Extract (x',y',t') from H' = [[t'+x', y'], [y', t'-x']]
        const tPrime = (result11 + result22) / 2;
        const xPrime = (result11 - result22) / 2;
        const yPrime = result12;

        return [xPrime, yPrime, tPrime];
    }

    // Find which geodesic is closest to the given covector
    findClosestGeodesic(covector) {
        if (!covector) return -1;

        const [vx, vy, vw] = covector;
        let minDist = Infinity;
        let closestId = -1;

        const numSpheres = this.sphereCenters.length;

        // Check all circle geodesics
        for (let i = 0; i < this.sphereCenters.length; i++) {
            const center = this.sphereCenters[i];
            const radius = this.sphereRadii[i];

            // Expected center and radius from covector
            const nSq = vx * vx + vy * vy;
            const wSq = vw * vw;

            if (Math.abs(vw) > 1e-6 && nSq > wSq) {
                const expectedCx = vx / vw;
                const expectedCy = vy / vw;
                const expectedR = Math.sqrt(nSq / wSq - 1);

                const dcx = center.x - expectedCx;
                const dcy = center.y - expectedCy;
                const dr = radius - expectedR;

                const dist = Math.sqrt(dcx * dcx + dcy * dcy + dr * dr);

                if (dist < minDist) {
                    minDist = dist;
                    closestId = i;
                }
            }
        }

        // Check all line geodesics
        for (let i = 0; i < this.planeNormals.length; i++) {
            const normal = this.planeNormals[i];

            if (Math.abs(vw) < 1e-6) {
                const nSq = vx * vx + vy * vy;
                if (nSq > 1e-12) {
                    const norm = Math.sqrt(nSq);
                    const expectedNx = vx / norm;
                    const expectedNy = vy / norm;

                    const dnx = normal.x - expectedNx;
                    const dny = normal.y - expectedNy;
                    const dist = Math.sqrt(dnx * dnx + dny * dny);

                    if (dist < minDist) {
                        minDist = dist;
                        closestId = numSpheres + i;
                    }
                }
            }
        }

        return minDist < 0.1 ? closestId : -1;
    }

    // Compute which geodesic this face maps to under side-pairing
    // For a face corresponding to generator g, it pairs with the face for g⁻¹
    computeMappedGeodesic(faceId) {
        if (faceId < 0 || faceId >= this.faceMatrices.length) return -1;
        if (!this.faceMatrices[faceId]) return -1;

        const matrix = this.faceMatrices[faceId];

        // Compute the inverse matrix
        const invMatrix = this.invertMatrix(matrix);
        if (!invMatrix) return -1;

        // Find which face has a matrix closest to the inverse
        return this.findFaceWithMatrix(invMatrix);
    }

    // Invert a 2x2 matrix
    invertMatrix(matrix) {
        if (!matrix) return null;

        const a = matrix.a?.re ?? matrix.a;
        const b = matrix.b?.re ?? matrix.b;
        const c = matrix.c?.re ?? matrix.c;
        const d = matrix.d?.re ?? matrix.d;

        const det = a * d - b * c;
        if (Math.abs(det) < 1e-10) return null;

        // For PSL(2,R), we can also consider -M as the same element
        // So the inverse is either [[d, -b], [-c, a]] / det or its negative

        return {
            a: d / det,
            b: -b / det,
            c: -c / det,
            d: a / det
        };
    }

    // Find which face has a matrix closest to the given matrix
    findFaceWithMatrix(targetMatrix) {
        if (!targetMatrix) return -1;

        const ta = targetMatrix.a?.re ?? targetMatrix.a;
        const tb = targetMatrix.b?.re ?? targetMatrix.b;
        const tc = targetMatrix.c?.re ?? targetMatrix.c;
        const td = targetMatrix.d?.re ?? targetMatrix.d;

        let minDist = Infinity;
        let closestFaceId = -1;

        for (let faceId = 0; faceId < this.faceMatrices.length; faceId++) {
            const matrix = this.faceMatrices[faceId];
            if (!matrix) continue;

            const a = matrix.a?.re ?? matrix.a;
            const b = matrix.b?.re ?? matrix.b;
            const c = matrix.c?.re ?? matrix.c;
            const d = matrix.d?.re ?? matrix.d;

            // Compute distance (also check negative since PSL(2,R) = SL(2,R)/{±I})
            const dist1 = Math.sqrt(
                (a - ta) ** 2 + (b - tb) ** 2 + (c - tc) ** 2 + (d - td) ** 2
            );
            const dist2 = Math.sqrt(
                (a + ta) ** 2 + (b + tb) ** 2 + (c + tc) ** 2 + (d + td) ** 2
            );

            const dist = Math.min(dist1, dist2);

            if (dist < minDist) {
                minDist = dist;
                closestFaceId = faceId;
            }
        }

        return minDist < 0.1 ? closestFaceId : -1;
    }

    handleClick(e) {
        const rect = this.canvas.getBoundingClientRect();
        const screenX = e.clientX - rect.left;
        const screenY = e.clientY - rect.top;

        // Check for vertex click first
        const vertexId = this.getVertexAtScreen(screenX, screenY);

        if (vertexId >= 0) {
            // Vertex click
            this.selectedVertexId = vertexId;
            this.selectedFaceId = -1;
            this.shiftClickedFaceId = -1;
            this.mappedFaceId = -1;

            // Dispatch custom event for vertex selection
            this.canvas.dispatchEvent(new CustomEvent('vertexSelected', {
                detail: { vertexId }
            }));

            this.render();
            return;
        }

        // Check for face click
        const disk = this.screenToDisk(screenX, screenY);
        const faceId = this.getFaceAtPoint(disk.x, disk.y);

        if (e.shiftKey && faceId >= 0) {
            // Shift+click: select for angle calculation
            if (this.selectedFaceId >= 0 && this.selectedFaceId !== faceId) {
                this.shiftClickedFaceId = faceId;

                // Dispatch custom event for angle calculation
                this.canvas.dispatchEvent(new CustomEvent('angleBetweenFaces', {
                    detail: { faceId1: this.selectedFaceId, faceId2: faceId }
                }));
            }
        } else if (faceId >= 0) {
            // Normal click: select face and find mapped geodesic
            this.selectedFaceId = faceId;
            this.selectedVertexId = -1;
            this.shiftClickedFaceId = -1;
            this.triggerPop(faceId);

            // Compute which geodesic this one maps to
            this.mappedFaceId = this.computeMappedGeodesic(faceId);

            // Dispatch custom event for main.js to handle
            this.canvas.dispatchEvent(new CustomEvent('faceSelected', {
                detail: { faceId, mappedFaceId: this.mappedFaceId }
            }));
        } else {
            this.selectedFaceId = -1;
            this.selectedVertexId = -1;
            this.shiftClickedFaceId = -1;
            this.mappedFaceId = -1;
        }

        this.render();
    }

    triggerPop(faceId) {
        this.popFaceId = faceId;
        this.popStrength = 1.0;
        this.popStartTime = Date.now();
    }

    updateAnimation() {
        if (this.popStrength > 0) {
            const elapsed = Date.now() - this.popStartTime;
            const t = Math.min(1, elapsed / this.popDuration);
            this.popStrength = 1.0 - t;

            if (t >= 1) {
                this.popStrength = 0;
                this.popFaceId = -1;
            }

            return true; // Animation in progress
        }
        return false;
    }

    render() {
        const ctx = this.ctx;

        // Clear canvas
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(0, 0, this.width, this.height);

        // Save context state
        ctx.save();

        // Create clipping region for unit disk
        ctx.beginPath();
        ctx.arc(this.centerX, this.centerY, this.scale, 0, 2 * Math.PI);
        ctx.clip();

        // Fill interior of disk with slightly lighter background
        ctx.fillStyle = '#2a2a2a';
        ctx.fill();

        // Draw and fill fundamental domain or orbit
        if (this.showDomainOrbit && this.faceMatrices.length > 0) {
            this.drawDomainOrbit();
        } else {
            this.drawFundamentalDomain();
        }

        // Draw Cayley graph if enabled
        if (this.showCayleyGraph && this.faceMatrices.length > 0) {
            this.drawCayleyGraph();
        }

        // Draw boundary circle
        if (this.showBoundary) {
            ctx.strokeStyle = 'rgba(136, 170, 255, 0.8)';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(this.centerX, this.centerY, this.scale, 0, 2 * Math.PI);
            ctx.stroke();
        }

        // Draw all geodesics
        // Draw circles
        for (let i = 0; i < this.sphereCenters.length; i++) {
            const isSelected = this.selectedFaceId === i || this.selectedEdgeFaces[0] === i || this.selectedEdgeFaces[1] === i;
            const isMapped = this.mappedFaceId === i;
            const isShiftClicked = this.shiftClickedFaceId === i;
            const isHovered = this.hoveredFaceId === i;
            this.drawGeodesicCircle(this.sphereCenters[i], this.sphereRadii[i], i, isSelected, isHovered, isMapped, isShiftClicked);
        }

        // Draw lines
        const numSpheres = this.sphereCenters.length;
        for (let i = 0; i < this.planeNormals.length; i++) {
            const faceId = numSpheres + i;
            const isSelected = this.selectedFaceId === faceId || this.selectedEdgeFaces[0] === faceId || this.selectedEdgeFaces[1] === faceId;
            const isMapped = this.mappedFaceId === faceId;
            const isShiftClicked = this.shiftClickedFaceId === faceId;
            const isHovered = this.hoveredFaceId === faceId;
            this.drawGeodesicLine(this.planeNormals[i], faceId, isSelected, isHovered, isMapped, isShiftClicked);
        }

        // Draw vertices
        this.drawVertices();

        // Restore context state (removes clipping)
        ctx.restore();

        // Update animation and request next frame if needed
        if (this.updateAnimation()) {
            requestAnimationFrame(() => this.render());
        }
    }

    // Check if a point in the disk is inside the fundamental domain
    // (positive on all SDFs)
    isInFundamentalDomain(diskX, diskY) {
        const eps = 1e-6;

        // Check circle geodesics (must be outside all circles)
        for (let i = 0; i < this.sphereCenters.length; i++) {
            const center = this.sphereCenters[i];
            const radius = this.sphereRadii[i];

            const dx = diskX - center.x;
            const dy = diskY - center.y;
            const distSq = dx * dx + dy * dy;
            const radiusSq = radius * radius;

            // Inside the circle means NOT in fundamental domain
            if (distSq < radiusSq - eps) {
                return false;
            }
        }

        // Check line geodesics (must be on correct side of all lines)
        for (let i = 0; i < this.planeNormals.length; i++) {
            const normal = this.planeNormals[i];

            // The fundamental domain is on the side where normal·point <= 0
            // (origin is at (0,0) which satisfies this)
            const dot = normal.x * diskX + normal.y * diskY;
            if (dot > eps) {
                return false;
            }
        }

        return true;
    }

    // Draw domain orbit using raytracing algorithm
    // Colors each G-translate of the domain based on which generator brings it back
    drawDomainOrbit() {
        const ctx = this.ctx;
        const imageData = ctx.createImageData(this.width, this.height);
        const data = imageData.data;

        const maxIterations = 20;

        for (let screenY = 0; screenY < this.height; screenY++) {
            for (let screenX = 0; screenX < this.width; screenX++) {
                const disk = this.screenToDisk(screenX, screenY);
                const r = Math.sqrt(disk.x * disk.x + disk.y * disk.y);

                const idx = (screenY * this.width + screenX) * 4;

                // Skip points outside the disk
                if (r >= 1.0) {
                    continue; // Transparent
                }

                // Trace the point to the fundamental domain by repeatedly applying generators
                let point = { x: disk.x, y: disk.y };
                let firstGeneratorUsed = -1;
                let wordLength = 0;

                for (let iter = 0; iter < maxIterations; iter++) {
                    const violatedFace = this.findMostViolatedSDF(point);

                    if (violatedFace === -1) {
                        break;
                    }

                    if (violatedFace >= this.faceMatrices.length || !this.faceMatrices[violatedFace]) {
                        break;
                    }

                    if (firstGeneratorUsed === -1) {
                        firstGeneratorUsed = violatedFace;
                    }

                    const newPoint = this.applyTransformation(point, violatedFace, true);

                    if (!newPoint) {
                        break;
                    }

                    point = newPoint;
                    wordLength++;
                }

                let color;
                if (firstGeneratorUsed === -1) {
                    // In fundamental domain
                    color = { r: 255, g: 255, b: 255, a: 180 };
                } else {
                    // Color based on the final point in the fundamental domain
                    const hue = (Math.atan2(point.y, point.x) / (2 * Math.PI) + 0.5) * 360;
                    const saturation = 70;
                    const lightness = 60;
                    color = this.hslToRgb(hue, saturation, lightness);
                    color.a = 200;
                }
                data[idx] = color.r;
                data[idx + 1] = color.g;
                data[idx + 2] = color.b;
                data[idx + 3] = color.a;
            }
        }

        ctx.putImageData(imageData, 0, 0);
    }

    drawCayleyGraph() {
        const ctx = this.ctx;
        const basepoint = { x: 0, y: 0 };
        const maxDepth = 3;

        const generators = this.faceMatrices.filter(m => m);
        if (generators.length === 0) return;

        let orbit = new Map();
        const originKey = `${basepoint.x.toFixed(12)},${basepoint.y.toFixed(12)}`;
        orbit.set(originKey, { point: basepoint, from: null, faceId: -1, depth: 0 });

        let queue = [originKey];
        
        let head = 0;
        while(head < queue.length) {
            const currentKey = queue[head++];
            const currentElement = orbit.get(currentKey);

            if (currentElement.depth >= maxDepth) continue;

            for (let j = 0; j < generators.length; j++) {
                const generator = generators[j];
                const faceId = this.faceMatrices.indexOf(generator);
                const newPoint = this.applyTransformation(currentElement.point, faceId, false);

                if (newPoint) {
                    const newKey = `${newPoint.x.toFixed(12)},${newPoint.y.toFixed(12)}`;
                    if (!orbit.has(newKey)) {
                        orbit.set(newKey, { point: newPoint, from: currentElement.point, faceId: faceId, depth: currentElement.depth + 1 });
                        queue.push(newKey);
                    }
                }
            }
        }

        // Draw edges
        for (const element of orbit.values()) {
            if (element.from && element.faceId !== -1) {
                const p1 = this.diskToScreen(element.from.x, element.from.y);
                const p2 = this.diskToScreen(element.point.x, element.point.y);
                ctx.beginPath();
                ctx.moveTo(p1.x, p1.y);
                ctx.lineTo(p2.x, p2.y);
                ctx.strokeStyle = this.getFaceColor(element.faceId);
                ctx.lineWidth = 2;
                ctx.stroke();
            }
        }

        // Draw points
        for (const element of orbit.values()) {
            const screenPoint = this.diskToScreen(element.point.x, element.point.y);
            ctx.beginPath();
            ctx.arc(screenPoint.x, screenPoint.y, 5, 0, 2 * Math.PI);
            ctx.fillStyle = 'white';
            ctx.fill();
        }
    }

    // Evaluate SDF at a point for a given face
    evaluateSDF(point, faceId) {
        const { x, y } = point;
        const numSpheres = this.sphereCenters.length;

        if (faceId < numSpheres) {
            // Circle: SDF is distance to center minus radius
            const center = this.sphereCenters[faceId];
            const radius = this.sphereRadii[faceId];
            const dx = x - center.x;
            const dy = y - center.y;
            const distToCenter = Math.sqrt(dx * dx + dy * dy);
            return distToCenter - radius; // Positive outside, negative inside
        } else {
            // Line: SDF is -normal·point
            const normal = this.planeNormals[faceId - numSpheres];
            return -(normal.x * x + normal.y * y); // Positive on correct side
        }
    }

    // Find the most violated SDF (most negative)
    findMostViolatedSDF(point) {
        const numFaces = this.sphereCenters.length + this.planeNormals.length;
        let mostViolatedFace = -1;
        let minSDF = 0; // We want the most negative

        for (let faceId = 0; faceId < numFaces; faceId++) {
            const sdf = this.evaluateSDF(point, faceId);
            if (sdf < minSDF) {
                minSDF = sdf;
                mostViolatedFace = faceId;
            }
        }

        return mostViolatedFace;
    }

    // Count how many SDFs are violated at a point (how many constraints are not satisfied)
    countViolations(point) {
        const numFaces = this.sphereCenters.length + this.planeNormals.length;
        let count = 0;
        const eps = 1e-6;

        for (let faceId = 0; faceId < numFaces; faceId++) {
            const sdf = this.evaluateSDF(point, faceId);
            if (sdf < -eps) {
                count++;
            }
        }

        return count;
    }

    // Apply the generator transformation for a face to bring point toward fundamental domain
    // When a point violates the SDF for faceId (is negative on it), we apply the generator
    // itself to iteratively move toward the fundamental domain
    applyTransformation(point, faceId, useInverse = false) {
        if (faceId < 0 || faceId >= this.faceMatrices.length) return null;
        const matrix = this.faceMatrices[faceId];
        if (!matrix) return null;

        const { x, y } = point;
        const rSq = x * x + y * y;
        if (rSq >= 1.0) return null;

        // Get matrix elements
        let a = matrix.a?.re ?? matrix.a;
        let b = matrix.b?.re ?? matrix.b;
        let c = matrix.c?.re ?? matrix.c;
        let d = matrix.d?.re ?? matrix.d;

        // If useInverse is true, compute the inverse matrix
        if (useInverse) {
            const det = a * d - b * c;
            if (Math.abs(det) < 1e-10) return null;
            const invA = d / det;
            const invB = -b / det;
            const invC = -c / det;
            const invD = a / det;
            a = invA; b = invB; c = invC; d = invD;
        }

        // Convert disk point to Minkowski space
        const denom = 1 - rSq;
        const mx = 2 * x / denom;
        const my = 2 * y / denom;
        const mt = (1 + rSq) / denom;

        // Apply matrix via SO(2,1) action: (x,y,t) represented as H = [[t+x,y],[y,t-x]]
        // Transform as g H g^T
        const h11 = mt + mx;
        const h12 = my;
        const h22 = mt - mx;

        const gh11 = a * h11 + b * h12;
        const gh12 = a * h12 + b * h22;
        const gh21 = c * h11 + d * h12;
        const gh22 = c * h12 + d * h22;

        const result11 = gh11 * a + gh12 * c;
        const result12 = gh11 * b + gh12 * d;
        const result22 = gh21 * b + gh22 * d;

        const tPrime = (result11 + result22) / 2;
        const xPrime = (result11 - result22) / 2;
        const yPrime = result12;

        // Convert back to disk coordinates
        const diskX = xPrime / (1 + tPrime);
        const diskY = yPrime / (1 + tPrime);

        return { x: diskX, y: diskY };
    }

    // Get color based on word length (number of generators applied)
    // Using simple alternating colors to make the tiling pattern visible
    getWordLengthColor(wordLength, maxIterations) {
        if (wordLength === 0) {
            // In fundamental domain - white
            return { r: 255, g: 255, b: 255, a: 180 };
        }

        // Alternate between two contrasting colors
        if (wordLength % 2 === 0) {
            // Even: Blue
            return { r: 80, g: 120, b: 220, a: 150 };
        } else {
            // Odd: Orange
            return { r: 255, g: 140, b: 60, a: 150 };
        }
    }

    // Get color based on which generator was used to bring point to fundamental domain
    getGeneratorColor(generatorId, wordLength) {
        if (generatorId === -1) {
            // In fundamental domain - white
            return { r: 255, g: 255, b: 255, a: 180 };
        }

        // Use the same color palette as the geodesic, but with transparency based on word length
        const baseColor = this.getFaceColor(generatorId, 1.0);

        // Extract RGB from the color string
        const match = baseColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*[\d.]+)?\)/);
        if (!match) {
            return { r: 100, g: 150, b: 200, a: 120 };
        }

        const r = parseInt(match[1]);
        const g = parseInt(match[2]);
        const b = parseInt(match[3]);

        // Vary the alpha based on word length
        const alpha = Math.min(220, 100 + wordLength * 20);

        return {
            r: r,
            g: g,
            b: b,
            a: alpha
        };
    }

    // Get color for orbit iteration count (kept for backward compatibility)
    getOrbitColor(iterations, maxIterations) {
        if (iterations === 0) {
            // In fundamental domain - bright color
            return { r: 100, g: 150, b: 200, a: 180 };
        }

        // Color gradient based on iteration count
        const t = iterations / maxIterations;

        // Create a nice color gradient
        const hue = (240 - t * 200) % 360; // Blue to red
        const saturation = 70;
        const lightness = 30 + t * 40;

        const { r, g, b } = this.hslToRgb(hue, saturation, lightness);
        return { r, g, b, a: 100 + Math.floor(t * 100) };
    }

    // Convert HSL to RGB
    hslToRgb(h, s, l) {
        h = h / 360;
        s = s / 100;
        l = l / 100;

        let r, g, b;

        if (s === 0) {
            r = g = b = l;
        } else {
            const hue2rgb = (p, q, t) => {
                if (t < 0) t += 1;
                if (t > 1) t -= 1;
                if (t < 1/6) return p + (q - p) * 6 * t;
                if (t < 1/2) return q;
                if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
                return p;
            };

            const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
            const p = 2 * l - q;

            r = hue2rgb(p, q, h + 1/3);
            g = hue2rgb(p, q, h);
            b = hue2rgb(p, q, h - 1/3);
        }

        return {
            r: Math.round(r * 255),
            g: Math.round(g * 255),
            b: Math.round(b * 255)
        };
    }

    // Draw vertices of the fundamental domain
    drawVertices() {
        if (!this.vertices || this.vertices.length === 0) return;

        const ctx = this.ctx;

        for (let i = 0; i < this.vertices.length; i++) {
            const vertex = this.vertices[i];
            const screen = this.diskToScreen(vertex.point.x, vertex.point.y);

            const isSelected = this.selectedVertexId === i;
            const isHovered = this.hoveredVertexId === i;

            // Draw vertex as a circle
            ctx.beginPath();
            ctx.arc(screen.x, screen.y, isSelected ? 8 : (isHovered ? 6 : 4), 0, 2 * Math.PI);

            if (isSelected) {
                ctx.fillStyle = '#FFD700'; // Gold for selected
                ctx.strokeStyle = '#FF6B35';
                ctx.lineWidth = 2;
            } else if (isHovered) {
                ctx.fillStyle = '#FFA07A'; // Light salmon for hover
                ctx.strokeStyle = '#FF6B35';
                ctx.lineWidth = 2;
            } else {
                ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
                ctx.strokeStyle = '#333';
                ctx.lineWidth = 1;
            }

            ctx.fill();
            ctx.stroke();
        }
    }

    // Draw the fundamental domain (intersection of all half-spaces)
    drawFundamentalDomain() {
        const ctx = this.ctx;

        // Create an offscreen canvas for pixel-perfect rendering
        const imageData = ctx.createImageData(this.width, this.height);
        const data = imageData.data;

        // Sample and fill pixels
        for (let screenY = 0; screenY < this.height; screenY++) {
            for (let screenX = 0; screenX < this.width; screenX++) {
                // Convert to disk coordinates
                const disk = this.screenToDisk(screenX, screenY);
                const r = Math.sqrt(disk.x * disk.x + disk.y * disk.y);

                // Check if inside unit disk and fundamental domain
                if (r < 1.0 && this.isInFundamentalDomain(disk.x, disk.y)) {
                    const idx = (screenY * this.width + screenX) * 4;
                    data[idx] = 100;      // R
                    data[idx + 1] = 150;  // G
                    data[idx + 2] = 200;  // B
                    data[idx + 3] = 38;   // A (0.15 * 255)
                }
            }
        }

        ctx.putImageData(imageData, 0, 0);
    }
}
