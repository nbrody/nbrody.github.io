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
        this.showFundamentalDomain = true; // Show fundamental domain and geodesics
        this.showDomainOrbit = false; // Show orbit coloring
        this.showCayleyGraph = false; // Show Cayley graph
        this.selectedEdgeFaces = [-1, -1];
        this.shiftClickedFaceId = -1; // For angle calculation

        // Animation state
        this.popFaceId = -1;
        this.popStrength = 0;
        this.popStartTime = 0;
        this.popDuration = 600;

        this.isUpperHalfPlane = false;

        this.setupEventListeners();
    }

    toggleUpperHalfPlane(enabled) {
        this.isUpperHalfPlane = enabled;
        this.render();
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
    screenToDisk(screenX, screenY) {
        if (this.isUpperHalfPlane) {
            const uhp = this.screenToUHP(screenX, screenY);
            return this.UHPToDisk(uhp.u, uhp.v);
        }

        // Inverse of 90° counterclockwise rotation
        const rotatedX = (screenX - this.centerX) / this.scale;
        const rotatedY = -(screenY - this.centerY) / this.scale;
        // Inverse rotation: (-y, x) → (y, -x)
        return {
            x: rotatedY,
            y: -rotatedX
        };
    }

    diskToUHP(x, y) {
        const denom = (1 - x) * (1 - x) + y * y;
        if (denom < 1e-9) return { u: 0, v: 10000 }; // Near infinity

        return {
            u: -2 * y / denom,
            v: (1 - x * x - y * y) / denom
        };
    }

    UHPToDisk(u, v) {
        const denom = u * u + (v + 1) * (v + 1);
        if (denom < 1e-9) return { x: 1, y: 0 }; // Should not happen for v>0
        return {
            x: (u * u + v * v - 1) / denom,
            y: -2 * u / denom
        };
    }

    UHPToScreen(u, v) {
        const scale = this.height / 5; // Show up to v=5
        const centerX = this.width / 2;
        const bottomY = this.height - 20; // Padding from bottom

        return {
            x: centerX + u * scale,
            y: bottomY - v * scale
        };
    }

    screenToUHP(sx, sy) {
        const scale = this.height / 5;
        const centerX = this.width / 2;
        const bottomY = this.height - 20;

        return {
            u: (sx - centerX) / scale,
            v: (bottomY - sy) / scale
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

        ctx.strokeStyle = this.getFaceColor(faceId, alpha);
        ctx.lineWidth = strokeWidth;
        ctx.setLineDash(dashPattern);

        // Find vertices on this face
        const verticesOnFace = [];
        if (this.vertices && this.vertices.length > 0) {
            for (let i = 0; i < this.vertices.length; i++) {
                const vertex = this.vertices[i];
                if (vertex.faces && vertex.faces.includes(faceId)) {
                    verticesOnFace.push(vertex.point);
                }
            }
        }

        if (verticesOnFace.length >= 2) {
            // Draw arcs between consecutive vertices on this circle
            // Sort vertices by angle around the circle center
            const sortedVertices = verticesOnFace.map(v => {
                const angle = Math.atan2(v.y - center.y, v.x - center.x);
                return { point: v, angle };
            }).sort((a, b) => a.angle - b.angle);

            ctx.beginPath();
            for (let i = 0; i < sortedVertices.length; i++) {
                const curr = sortedVertices[i];
                const next = sortedVertices[(i + 1) % sortedVertices.length];

                const p1 = this.diskToScreen(curr.point.x, curr.point.y);
                const p2 = this.diskToScreen(next.point.x, next.point.y);

                // Draw arc from p1 to p2
                const startAngle = curr.angle;
                const endAngle = next.angle;

                // Handle wrap-around
                let actualEndAngle = endAngle;
                if (endAngle < startAngle) {
                    actualEndAngle = endAngle + 2 * Math.PI;
                }

                // Draw arc
                ctx.arc(screenCenter.x, screenCenter.y, screenRadius, startAngle, actualEndAngle);
            }
            ctx.stroke();
        } else {
            // No vertices or only one vertex - draw full circle as fallback
            ctx.beginPath();
            ctx.arc(screenCenter.x, screenCenter.y, screenRadius, 0, 2 * Math.PI);
            ctx.stroke();
        }

        ctx.setLineDash([]); // Reset dash pattern

        if (this.popFaceId === faceId && this.popStrength > 0) {
            ctx.restore();
        }
    }

    // Draw a geodesic line through origin in the Poincaré disk
    drawGeodesicLine(normal, faceId, isSelected = false, isHovered = false, isMapped = false, isShiftClicked = false) {
        const ctx = this.ctx;

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

        ctx.strokeStyle = this.getFaceColor(faceId, alpha);
        ctx.lineWidth = strokeWidth;
        ctx.setLineDash(dashPattern);

        // Find vertices on this face
        const verticesOnFace = [];
        if (this.vertices && this.vertices.length > 0) {
            for (let i = 0; i < this.vertices.length; i++) {
                const vertex = this.vertices[i];
                if (vertex.faces && vertex.faces.includes(faceId)) {
                    verticesOnFace.push(vertex.point);
                }
            }
        }

        if (verticesOnFace.length >= 2) {
            // Draw segments between consecutive vertices on this line
            // For a line through the origin, project each vertex onto the line and sort by position
            const dx = -normal.y;
            const dy = normal.x;
            const len = Math.sqrt(dx * dx + dy * dy);
            if (len < 1e-9) return;

            const ux = dx / len; // Unit direction along line
            const uy = dy / len;

            const sortedVertices = verticesOnFace.map(v => {
                const t = v.x * ux + v.y * uy; // Position along line
                return { point: v, t };
            }).sort((a, b) => a.t - b.t);

            // Draw line segments between consecutive vertices
            ctx.beginPath();
            for (let i = 0; i < sortedVertices.length - 1; i++) {
                const p1 = this.diskToScreen(sortedVertices[i].point.x, sortedVertices[i].point.y);
                const p2 = this.diskToScreen(sortedVertices[i + 1].point.x, sortedVertices[i + 1].point.y);
                ctx.moveTo(p1.x, p1.y);
                ctx.lineTo(p2.x, p2.y);
            }
            ctx.stroke();
        } else {
            // No vertices or only one - draw full line as fallback
            const dx = -normal.y;
            const dy = normal.x;
            const len = Math.sqrt(dx * dx + dy * dy);
            if (len < 1e-9) return;

            const t = 1.0 / len;
            const p1 = this.diskToScreen(t * dx, t * dy);
            const p2 = this.diskToScreen(-t * dx, -t * dy);

            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();
        }

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
        // g^T = [[a, c], [b, d]]
        const result11 = gh11 * a + gh12 * b;
        const result12 = gh11 * c + gh12 * d;
        const result22 = gh21 * c + gh22 * d;

        // Extract (x',y',t') from H' = [[t'+x', y'], [y', t'-x']]
        const tPrime = (result11 + result22) / 2;
        const xPrime = (result11 - result22) / 2;
        const yPrime = result12;

        return [xPrime, yPrime, tPrime];
    }

    // ... (findClosestGeodesic, etc.)

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

        // Convert disk point to Minkowski space
        const denom = 1 - rSq;
        const mx = 2 * x / denom;
        const my = 2 * y / denom;
        const mt = (1 + rSq) / denom;

        let targetMatrix = matrix;

        // If useInverse is true, compute the inverse matrix
        if (useInverse) {
            targetMatrix = this.invertMatrix(matrix);
            if (!targetMatrix) return null;
        }

        const result = this.applyMatrixToPoint(targetMatrix, [mx, my, mt]);
        if (!result) return null;

        const [xPrime, yPrime, tPrime] = result;

        // Convert back to disk coordinates
        const diskX = xPrime / (1 + tPrime);
        const diskY = yPrime / (1 + tPrime);

        return { x: diskX, y: diskY };
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

        if (this.isUpperHalfPlane) {
            this.renderUHP();
        } else {
            this.renderDisk();
        }

        // Update animation and request next frame if needed
        if (this.updateAnimation()) {
            requestAnimationFrame(() => this.render());
        }
    }

    renderDisk() {
        const ctx = this.ctx;
        ctx.save();

        // Create clipping region for unit disk
        ctx.beginPath();
        ctx.arc(this.centerX, this.centerY, this.scale, 0, 2 * Math.PI);
        ctx.clip();

        // Fill interior of disk with slightly lighter background
        ctx.fillStyle = '#2a2a2a';
        ctx.fill();

        // Draw and fill fundamental domain or orbit
        if (this.showFundamentalDomain) {
            if (this.showDomainOrbit && this.faceMatrices.length > 0) {
                this.drawDomainOrbit();
            } else {
                this.drawFundamentalDomain();
            }
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

        // Draw all geodesics (only if fundamental domain is shown)
        if (this.showFundamentalDomain) {
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
        }

        // Draw vertices (only if fundamental domain is shown)
        if (this.showFundamentalDomain) {
            this.drawVertices();
        }

        // Restore context state (removes clipping)
        ctx.restore();
    }

    renderUHP() {
        const ctx = this.ctx;
        ctx.save();

        // Fill background
        ctx.fillStyle = '#2a2a2a';
        ctx.fillRect(0, 0, this.width, this.height);

        // Draw and fill fundamental domain or orbit
        if (this.showFundamentalDomain) {
            if (this.showDomainOrbit && this.faceMatrices.length > 0) {
                this.drawDomainOrbit();
            } else {
                this.drawFundamentalDomain();
            }
        }

        // Draw Cayley graph if enabled
        if (this.showCayleyGraph && this.faceMatrices.length > 0) {
            this.drawCayleyGraph((x, y) => {
                const uhp = this.diskToUHP(x, y);
                return this.UHPToScreen(uhp.u, uhp.v);
            });
        }

        // Draw boundary (Real line)
        if (this.showBoundary) {
            const p1 = this.UHPToScreen(-100, 0);
            const p2 = this.UHPToScreen(100, 0);
            ctx.strokeStyle = 'rgba(136, 170, 255, 0.8)';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();
        }

        // Draw all geodesics
        if (this.showFundamentalDomain) {
            // Draw circles
            for (let i = 0; i < this.sphereCenters.length; i++) {
                const isSelected = this.selectedFaceId === i || this.selectedEdgeFaces[0] === i || this.selectedEdgeFaces[1] === i;
                const isMapped = this.mappedFaceId === i;
                const isShiftClicked = this.shiftClickedFaceId === i;
                const isHovered = this.hoveredFaceId === i;
                this.drawGeodesicCircleUHP(this.sphereCenters[i], this.sphereRadii[i], i, isSelected, isHovered, isMapped, isShiftClicked);
            }

            // Draw lines
            const numSpheres = this.sphereCenters.length;
            for (let i = 0; i < this.planeNormals.length; i++) {
                const faceId = numSpheres + i;
                const isSelected = this.selectedFaceId === faceId || this.selectedEdgeFaces[0] === faceId || this.selectedEdgeFaces[1] === faceId;
                const isMapped = this.mappedFaceId === faceId;
                const isShiftClicked = this.shiftClickedFaceId === faceId;
                const isHovered = this.hoveredFaceId === faceId;
                this.drawGeodesicLineUHP(this.planeNormals[i], faceId, isSelected, isHovered, isMapped, isShiftClicked);
            }
        }

        // Draw vertices
        if (this.showFundamentalDomain) {
            this.drawVerticesUHP();
        }

        ctx.restore();
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

                // Trace the point to the fundamental domain by repeatedly applying inverse generators
                let point = { x: disk.x, y: disk.y };
                let firstGeneratorUsed = -1;
                let wordLength = 0;

                for (let iter = 0; iter < maxIterations; iter++) {
                    // Check if point is in fundamental domain
                    if (this.isInFundamentalDomain(point.x, point.y)) {
                        break;
                    }

                    // Find most violated constraint
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

                    // Apply inverse of the generator to move toward fundamental domain
                    const newPoint = this.applyTransformation(point, violatedFace, true);

                    if (!newPoint) {
                        break;
                    }

                    point = newPoint;
                    wordLength++;
                }

                let color;
                if (firstGeneratorUsed === -1 || wordLength === 0) {
                    // In fundamental domain
                    color = { r: 255, g: 255, b: 255, a: 180 };
                } else {
                    // Color based on which generator was first used
                    const baseColor = this.getFaceColor(firstGeneratorUsed, 1.0);
                    const match = baseColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*[\d.]+)?\)/);
                    if (match) {
                        color = {
                            r: parseInt(match[1]),
                            g: parseInt(match[2]),
                            b: parseInt(match[3]),
                            a: 150
                        };
                    } else {
                        // Fallback color based on position
                        const hue = (Math.atan2(point.y, point.x) / (2 * Math.PI) + 0.5) * 360;
                        const saturation = 70;
                        const lightness = 60;
                        color = this.hslToRgb(hue, saturation, lightness);
                        color.a = 150;
                    }
                }
                data[idx] = color.r;
                data[idx + 1] = color.g;
                data[idx + 2] = color.b;
                data[idx + 3] = color.a;
            }
        }

        ctx.putImageData(imageData, 0, 0);
    }

    drawCayleyGraph(projectionFn = null) {
        const ctx = this.ctx;
        const maxDepth = 4;
        const project = projectionFn || ((x, y) => this.diskToScreen(x, y));

        // Identify generator indices and matrices
        const generators = [];
        for (let i = 0; i < this.faceMatrices.length; i++) {
            if (this.faceMatrices[i]) {
                generators.push({
                    matrix: this.faceMatrices[i],
                    faceId: i
                });
            }
        }

        if (generators.length === 0) return;

        // Helper to multiply 2x2 matrices
        const multiply = (m1, m2) => {
            const a1 = m1.a?.re ?? m1.a;
            const b1 = m1.b?.re ?? m1.b;
            const c1 = m1.c?.re ?? m1.c;
            const d1 = m1.d?.re ?? m1.d;

            const a2 = m2.a?.re ?? m2.a;
            const b2 = m2.b?.re ?? m2.b;
            const c2 = m2.c?.re ?? m2.c;
            const d2 = m2.d?.re ?? m2.d;

            return {
                a: a1 * a2 + b1 * c2,
                b: a1 * b2 + b1 * d2,
                c: c1 * a2 + d1 * c2,
                d: c1 * b2 + d1 * d2
            };
        };

        // Helper to get disk point from matrix (applying to origin)
        const getPoint = (matrix) => {
            // Origin in Minkowski is (0, 0, 1)
            const p = this.applyMatrixToPoint(matrix, [0, 0, 1]);
            if (!p) return { x: 0, y: 0 };
            return { x: p[0] / (1 + p[2]), y: p[1] / (1 + p[2]) };
        };

        // Helper to get canonical matrix key for PSL(2,R)
        const getMatrixKey = (m) => {
            let a = m.a?.re ?? m.a;
            let b = m.b?.re ?? m.b;
            let c = m.c?.re ?? m.c;
            let d = m.d?.re ?? m.d;

            // Normalize: ensure first non-zero element is positive
            if (a < -1e-9 || (Math.abs(a) < 1e-9 && (b < -1e-9 || (Math.abs(b) < 1e-9 && (c < -1e-9 || (Math.abs(c) < 1e-9 && d < -1e-9)))))) {
                a = -a; b = -b; c = -c; d = -d;
            }
            return `${a.toFixed(4)},${b.toFixed(4)},${c.toFixed(4)},${d.toFixed(4)}`;
        };

        const identity = { a: 1, b: 0, c: 0, d: 1 };
        const originPoint = { x: 0, y: 0 };

        // BFS
        let visited = new Map();
        const startKey = getMatrixKey(identity);
        visited.set(startKey, { matrix: identity, point: originPoint, depth: 0 });

        let queue = [startKey];
        let head = 0;

        // Store edges to draw
        const edges = [];

        while (head < queue.length) {
            const currentKey = queue[head++];
            const current = visited.get(currentKey);

            if (current.depth >= maxDepth) continue;

            for (const gen of generators) {
                // Right multiplication: current * generator
                const nextMatrix = multiply(current.matrix, gen.matrix);
                const nextKey = getMatrixKey(nextMatrix);

                // Calculate point for next matrix
                const nextPoint = getPoint(nextMatrix);

                // Add edge
                edges.push({
                    p1: current.point,
                    p2: nextPoint,
                    color: this.getFaceColor(gen.faceId)
                });

                if (!visited.has(nextKey)) {
                    visited.set(nextKey, {
                        matrix: nextMatrix,
                        point: nextPoint,
                        depth: current.depth + 1
                    });
                    queue.push(nextKey);
                }
            }
        }

        // Draw edges
        ctx.lineWidth = 1;
        for (const edge of edges) {
            const p1 = project(edge.p1.x, edge.p1.y);
            const p2 = project(edge.p2.x, edge.p2.y);
            ctx.strokeStyle = edge.color;
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();
        }

        // Draw vertices
        ctx.fillStyle = '#FFF';
        for (const node of visited.values()) {
            const p = project(node.point.x, node.point.y);
            ctx.beginPath();
            ctx.arc(p.x, p.y, 3, 0, 2 * Math.PI);
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
                if (t < 1 / 6) return p + (q - p) * 6 * t;
                if (t < 1 / 2) return q;
                if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
                return p;
            };

            const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
            const p = 2 * l - q;

            r = hue2rgb(p, q, h + 1 / 3);
            g = hue2rgb(p, q, h);
            b = hue2rgb(p, q, h - 1 / 3);
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
    drawGeodesicCircleUHP(center, radius, faceId, isSelected, isHovered, isMapped, isShiftClicked) {
        // Find intersection with unit circle in D
        // Circle: |z-c|^2 = r^2
        // Unit circle: |z|^2 = 1
        // 2 Re(z c_bar) = 1 + |c|^2 - r^2
        // 2(x cx + y cy) = 1 + cx^2 + cy^2 - r^2

        const cx = center.x;
        const cy = center.y;
        const C = 1 + cx * cx + cy * cy - radius * radius;

        // Intersection of line 2*cx*x + 2*cy*y = C and x^2+y^2=1
        const A = 2 * cx;
        const B = 2 * cy;

        // Distance from origin to line
        const dist = Math.abs(C) / Math.sqrt(A * A + B * B);
        if (dist >= 1.0) return; // Should not happen for geodesics intersecting disk

        // Find points
        const x0 = A * C / (A * A + B * B);
        const y0 = B * C / (A * A + B * B);

        const d = Math.sqrt(1 - dist * dist);
        const mult = Math.sqrt(d * d / (A * A + B * B));

        const ax = x0 + B * mult;
        const ay = y0 - A * mult;
        const bx = x0 - B * mult;
        const by = y0 + A * mult;

        // Map to UHP
        const p1 = this.diskToUHP(ax, ay);
        const p2 = this.diskToUHP(bx, by);

        this.drawGeodesicUHPFromEndpoints(p1, p2, faceId, isSelected, isHovered, isMapped, isShiftClicked);
    }

    drawGeodesicLineUHP(normal, faceId, isSelected, isHovered, isMapped, isShiftClicked) {
        // Line through origin with normal (nx, ny)
        // Intersects unit circle at (-ny, nx) and (ny, -nx)
        const ax = -normal.y;
        const ay = normal.x;
        const bx = normal.y;
        const by = -normal.x;

        const p1 = this.diskToUHP(ax, ay);
        const p2 = this.diskToUHP(bx, by);

        this.drawGeodesicUHPFromEndpoints(p1, p2, faceId, isSelected, isHovered, isMapped, isShiftClicked);
    }

    drawGeodesicUHPFromEndpoints(p1, p2, faceId, isSelected, isHovered, isMapped, isShiftClicked) {
        const ctx = this.ctx;

        // Set styles
        let strokeWidth = 2;
        let alpha = 0.8;
        let dashPattern = [];

        if (isSelected) {
            strokeWidth = 4;
            alpha = 1.0;
        } else if (isMapped) {
            strokeWidth = 4;
            alpha = 1.0;
            dashPattern = [10, 5];
        } else if (isShiftClicked) {
            strokeWidth = 4;
            alpha = 1.0;
            dashPattern = [5, 5];
        } else if (isHovered) {
            strokeWidth = 3;
            alpha = 0.9;
        }

        if (this.popFaceId === faceId && this.popStrength > 0) {
            const popScale = 1 + this.popStrength * 0.05;
            strokeWidth *= popScale;
        }

        ctx.strokeStyle = this.getFaceColor(faceId, alpha);
        ctx.lineWidth = strokeWidth;
        ctx.setLineDash(dashPattern);
        ctx.beginPath();

        // Check if vertical line
        // p1 or p2 might be at infinity (v large)
        const isInf1 = p1.v > 1000;
        const isInf2 = p2.v > 1000;

        if (isInf1 || isInf2) {
            // Vertical line
            const u = isInf1 ? p2.u : p1.u;
            const top = this.UHPToScreen(u, 10); // High up
            const bottom = this.UHPToScreen(u, 0);
            ctx.moveTo(top.x, top.y);
            ctx.lineTo(bottom.x, bottom.y);
        } else {
            // Semicircle
            const centerU = (p1.u + p2.u) / 2;
            const radius = Math.abs(p1.u - p2.u) / 2;

            const screenCenter = this.UHPToScreen(centerU, 0);
            // Radius in screen pixels
            // UHPToScreen scales u by 'scale'
            const scale = this.height / 5;
            const screenRadius = radius * scale;

            // Draw semicircle
            ctx.arc(screenCenter.x, screenCenter.y, screenRadius, Math.PI, 0);
        }

        ctx.stroke();
        ctx.setLineDash([]);
    }

    drawVerticesUHP() {
        if (!this.vertices || this.vertices.length === 0) return;
        const ctx = this.ctx;

        for (let i = 0; i < this.vertices.length; i++) {
            const vertex = this.vertices[i];
            const uhp = this.diskToUHP(vertex.point.x, vertex.point.y);
            const screen = this.UHPToScreen(uhp.u, uhp.v);

            const isSelected = this.selectedVertexId === i;
            const isHovered = this.hoveredVertexId === i;

            ctx.beginPath();
            ctx.arc(screen.x, screen.y, isSelected ? 8 : (isHovered ? 6 : 4), 0, 2 * Math.PI);

            if (isSelected) {
                ctx.fillStyle = '#FFD700';
                ctx.strokeStyle = '#FF6B35';
                ctx.lineWidth = 2;
            } else if (isHovered) {
                ctx.fillStyle = '#FFA07A';
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
}
