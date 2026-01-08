document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('viz-canvas');
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    const cx = width / 2;
    const cy = height / 2;
    const scale = width * 0.4; // Radius of the unit disk

    // View mode: 'sphere' or 'affine'
    let viewMode = 'sphere';
    let affineRange = 5; // Coordinate range for affine view (±affineRange)

    // Rotation state (for sphere view)
    let rotX = 0;
    let rotY = 0;
    let isDragging = false;
    let lastMouseX = 0;
    let lastMouseY = 0;

    // Pan state (for affine view)
    let affinePanX = 0;
    let affinePanY = 0;

    canvas.addEventListener('mousedown', (e) => {
        isDragging = true;
        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
    });

    window.addEventListener('mouseup', () => {
        isDragging = false;
    });

    canvas.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        const dx = e.clientX - lastMouseX;
        const dy = e.clientY - lastMouseY;

        if (viewMode === 'sphere') {
            rotY += dx * 0.01;
            rotX += dy * 0.01;
        } else {
            // Pan in affine view (in coordinate units)
            const panScale = affineRange * 2 / width;
            affinePanX -= dx * panScale;
            affinePanY += dy * panScale;
        }

        lastMouseX = e.clientX;
        lastMouseY = e.clientY;

        renderVisualization();
    });

    // Generators State
    let generatorsState = [
        {
            name: 'a',
            values: [
                "0", "1", "0",
                "1", "0", "-1",
                "0", "-1", "-1"
            ]
        },
        {
            name: 't',
            values: [
                "3", "4", "6",
                "2", "3", "4",
                "2", "3", "5"
            ]
        }
    ];

    const generatorsList = document.getElementById('generators-list');
    const addGenBtn = document.getElementById('add-generator-btn');
    const powerInput = document.getElementById('power-k');
    const analyzeBtn = document.getElementById('analyze-btn');
    const extraWordsInput = document.getElementById('extra-words-input');

    // Results elements
    const statusText = document.getElementById('status-text');
    const warningsList = document.getElementById('warnings-list');
    const metricsDiv = document.getElementById('metrics');

    function renderGeneratorsUI() {
        generatorsList.innerHTML = '';
        generatorsState.forEach((gen, index) => {
            const item = document.createElement('div');
            item.className = 'generator-item';

            // Header
            const header = document.createElement('div');
            header.className = 'generator-header';

            const nameInput = document.createElement('input');
            nameInput.type = 'text';
            nameInput.className = 'generator-name';
            nameInput.value = gen.name;
            nameInput.addEventListener('change', (e) => {
                gen.name = e.target.value;
                updateAnimSelect();
            });

            const delBtn = document.createElement('button');
            delBtn.className = 'delete-btn';
            delBtn.innerHTML = '&times;';
            delBtn.title = 'Remove Generator';
            delBtn.onclick = () => {
                generatorsState.splice(index, 1);
                renderGeneratorsUI();
                updateAnimSelect();
            };

            header.appendChild(nameInput);
            header.appendChild(delBtn);
            item.appendChild(header);

            // Matrix Grid
            const wrapper = document.createElement('div');
            wrapper.className = 'matrix-wrapper';

            const grid = document.createElement('div');
            grid.className = 'matrix-grid';

            gen.values.forEach((val, i) => {
                const input = document.createElement('input');
                input.type = 'text';
                input.value = val;
                input.addEventListener('change', (e) => {
                    gen.values[i] = e.target.value;
                });
                grid.appendChild(input);
            });

            wrapper.appendChild(grid);
            item.appendChild(wrapper);
            generatorsList.appendChild(item);
        });
        updateAnimSelect();
    }

    function updateAnimSelect() {
        // Animation is now triggered via legend clicks, no dropdown to update
    }

    addGenBtn.addEventListener('click', () => {
        // Add new identity matrix with a unique name
        const newName = 'g' + (generatorsState.length + 1);
        generatorsState.push({
            name: newName,
            values: ["1", "0", "0", "0", "1", "0", "0", "0", "1"]
        });
        renderGeneratorsUI();
    });

    // Helper to extract matrix from values array
    function getMatrixFromValues(values) {
        const mat = [];
        for (let i = 0; i < 3; i++) {
            const row = [];
            for (let j = 0; j < 3; j++) {
                row.push(values[i * 3 + j]);
            }
            mat.push(row);
        }
        return mat;
    }

    // Initial Render
    renderGeneratorsUI();

    // View Tab Switching
    const viewTabs = document.querySelectorAll('.view-tab');
    const canvasContainer = document.getElementById('canvas-container');
    const affineControls = document.getElementById('affine-controls');
    const affineRangeInput = document.getElementById('affine-range');
    const affineRangeValue = document.getElementById('affine-range-value');

    viewTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            viewTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            viewMode = tab.dataset.view;

            // Update canvas container class for styling
            canvasContainer.className = viewMode === 'sphere' ? 'sphere-view' : 'affine-view';

            // Show/hide affine controls
            affineControls.style.display = viewMode === 'affine' ? 'flex' : 'none';

            renderVisualization();
        });
    });

    // Set initial view class
    canvasContainer.className = 'sphere-view';

    // Affine range control
    affineRangeInput.addEventListener('input', (e) => {
        affineRange = parseInt(e.target.value);
        affineRangeValue.textContent = `±${affineRange}`;
        renderVisualization();
    });


    // Helper: 3D Rotation
    function rotateVector(v) {
        // v is [x, y, z]
        let x = v[0], y = v[1], z = v[2];

        // Rotation around X-axis (by rotX)
        let cx = Math.cos(rotX);
        let sx = Math.sin(rotX);
        let y1 = y * cx - z * sx;
        let z1 = y * sx + z * cx;
        let x1 = x;

        // Rotation around Y-axis (by rotY)
        let cy = Math.cos(rotY);
        let sy = Math.sin(rotY);
        let x2 = x1 * cy + z1 * sy;
        let z2 = -x1 * sy + z1 * cy;
        let y2 = y1;

        return [x2, y2, z2];
    }

    // Helper: Project 3D vector to 2D disk
    function project(v) {
        // v is [x, y, z]
        let norm = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
        if (norm === 0) return { x: 0, y: 0 };

        // Normalize
        let x = v[0] / norm;
        let y = v[1] / norm;
        let z = v[2] / norm;

        // Apply rotation
        const rotated = rotateVector([x, y, z]);
        x = rotated[0];
        y = rotated[1];
        z = rotated[2];

        // Visualizing RP^2:
        // We identify antipodal points v ~ -v.
        // We choose the representative with z >= 0 (visible on upper hemisphere)
        if (z < 0) {
            x = -x;
            y = -y;
            z = -z;
        }

        // Orthographic projection: just return (x, y)
        // We include 'z' in return for occlusion checks if needed, but for now just x,y
        return { x: x, y: y, z: z };
    }

    // Helper to format labels for canvas drawing (Unicode superscripts)
    function formatCanvasLabel(name) {
        if (name.endsWith('_inv')) {
            return name.slice(0, -4) + '⁻¹';
        }
        return name;
    }

    function drawDisk() {
        ctx.beginPath();
        ctx.arc(cx, cy, scale, 0, Math.PI * 2);
        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Draw 3D-ish feel
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, scale, 0, Math.PI * 2);
        ctx.clip();

        // Horizontal grid line (Equator if rotX=0)
        // ...actually let's just keep it simple first

        ctx.restore();

        ctx.fillStyle = '#0f172a';
        ctx.fill();
    }

    // ========== AFFINE VIEW HELPERS ==========

    function projectAffine(v) {
        // Project [x, y, z] to affine patch Z=1: (x/z, y/z)
        // Handle z ≈ 0 case (point at infinity)
        let x = v[0], y = v[1], z = v[2];

        // Normalize first
        let norm = Math.sqrt(x * x + y * y + z * z);
        if (norm === 0) return null;
        x /= norm; y /= norm; z /= norm;

        // If z is near 0, point is at infinity in affine patch
        if (Math.abs(z) < 0.001) return null;

        // Choose representative with z > 0 for consistency (optional in affine view)
        if (z < 0) { x = -x; y = -y; z = -z; }

        return { x: x / z, y: y / z };
    }

    function affineToCanvas(ax, ay) {
        // Convert affine coordinates to canvas coordinates
        const scaleAffine = width / (2 * affineRange);
        return {
            x: cx + (ax - affinePanX) * scaleAffine,
            y: cy - (ay - affinePanY) * scaleAffine  // Flip Y
        };
    }

    function canvasToAffine(canvasX, canvasY) {
        const scaleAffine = width / (2 * affineRange);
        return {
            x: (canvasX - cx) / scaleAffine + affinePanX,
            y: -(canvasY - cy) / scaleAffine + affinePanY
        };
    }

    function drawAffineBackground() {
        // Fill with dark background
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, width, height);

        // Draw grid
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.1)';
        ctx.lineWidth = 1;

        const step = affineRange > 10 ? 2 : 1;
        const minCoord = Math.floor(-affineRange + affinePanX - affineRange);
        const maxCoord = Math.ceil(affineRange + affinePanX + affineRange);
        const minCoordY = Math.floor(-affineRange + affinePanY - affineRange);
        const maxCoordY = Math.ceil(affineRange + affinePanY + affineRange);

        // Vertical lines
        for (let x = minCoord; x <= maxCoord; x += step) {
            const p = affineToCanvas(x, 0);
            ctx.beginPath();
            ctx.moveTo(p.x, 0);
            ctx.lineTo(p.x, height);
            ctx.stroke();
        }

        // Horizontal lines
        for (let y = minCoordY; y <= maxCoordY; y += step) {
            const p = affineToCanvas(0, y);
            ctx.beginPath();
            ctx.moveTo(0, p.y);
            ctx.lineTo(width, p.y);
            ctx.stroke();
        }

        // Draw axes
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.4)';
        ctx.lineWidth = 2;

        // X axis
        const axisY = affineToCanvas(0, 0).y;
        if (axisY >= 0 && axisY <= height) {
            ctx.beginPath();
            ctx.moveTo(0, axisY);
            ctx.lineTo(width, axisY);
            ctx.stroke();
        }

        // Y axis
        const axisX = affineToCanvas(0, 0).x;
        if (axisX >= 0 && axisX <= width) {
            ctx.beginPath();
            ctx.moveTo(axisX, 0);
            ctx.lineTo(axisX, height);
            ctx.stroke();
        }
    }

    function drawAffinePoint(v, color, label) {
        const proj = projectAffine(v);
        if (!proj) return; // Point at infinity

        const p = affineToCanvas(proj.x, proj.y);

        // Check if within canvas bounds
        if (p.x < -20 || p.x > width + 20 || p.y < -20 || p.y > height + 20) return;

        ctx.beginPath();
        ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        if (label) {
            ctx.fillStyle = '#e2e8f0';
            ctx.font = '12px Inter';
            ctx.fillText(label, p.x + 10, p.y + 4);
        }
    }

    function drawAffineLine(normal, color) {
        // The plane n·v = 0 intersects Z=1 as the line n[0]*x + n[1]*y + n[2] = 0
        // Solve for two points on boundaries
        const nx = normal[0], ny = normal[1], nz = normal[2];

        // Line: nx*x + ny*y + nz = 0 => y = (-nz - nx*x) / ny or x = (-nz - ny*y) / nx
        const points = [];
        const bounds = {
            xMin: -affineRange + affinePanX - affineRange,
            xMax: affineRange + affinePanX + affineRange,
            yMin: -affineRange + affinePanY - affineRange,
            yMax: affineRange + affinePanY + affineRange
        };

        // Find intersections with view boundary
        if (Math.abs(ny) > 0.001) {
            // Left edge (x = bounds.xMin)
            let y = (-nz - nx * bounds.xMin) / ny;
            if (y >= bounds.yMin && y <= bounds.yMax) points.push({ x: bounds.xMin, y });
            // Right edge (x = bounds.xMax)
            y = (-nz - nx * bounds.xMax) / ny;
            if (y >= bounds.yMin && y <= bounds.yMax) points.push({ x: bounds.xMax, y });
        }
        if (Math.abs(nx) > 0.001) {
            // Bottom edge (y = bounds.yMin)
            let x = (-nz - ny * bounds.yMin) / nx;
            if (x >= bounds.xMin && x <= bounds.xMax) points.push({ x, y: bounds.yMin });
            // Top edge (y = bounds.yMax)
            x = (-nz - ny * bounds.yMax) / nx;
            if (x >= bounds.xMin && x <= bounds.xMax) points.push({ x, y: bounds.yMax });
        }

        if (points.length < 2) return;

        // Remove duplicates
        const uniquePoints = [points[0]];
        for (let i = 1; i < points.length; i++) {
            const d = Math.hypot(points[i].x - uniquePoints[0].x, points[i].y - uniquePoints[0].y);
            if (d > 0.01) {
                uniquePoints.push(points[i]);
                break;
            }
        }

        if (uniquePoints.length < 2) return;

        const p1 = affineToCanvas(uniquePoints[0].x, uniquePoints[0].y);
        const p2 = affineToCanvas(uniquePoints[1].x, uniquePoints[1].y);

        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.stroke();
    }

    function drawAffineCircle(center, radiusAngle, color) {
        // In affine coordinates, a spherical cap centered at 'center' with angular radius 'radiusAngle'
        // projects to an ellipse (or more complex conic section)
        // For simplicity, we approximate by drawing a circle in affine coords with radius based on the projection

        const proj = projectAffine(center);
        if (!proj) return;

        // The angular radius on the sphere maps approximately to a radius in affine coords
        // This is an approximation - the actual shape is a conic section
        // For points near the Z=1 plane, sin(angle) ≈ angle works reasonably
        // z = cos(angle from center), so radius in affine ≈ tan(radiusAngle) * |center_z|

        // Get z coordinate of center (normalized)
        let cNorm = Math.sqrt(center[0] ** 2 + center[1] ** 2 + center[2] ** 2);
        let cz = Math.abs(center[2]) / cNorm;
        if (cz < 0.1) cz = 0.1; // Clamp for points near equator

        const affineRadius = Math.tan(radiusAngle) / cz;

        const pCenter = affineToCanvas(proj.x, proj.y);
        const scaleAffine = width / (2 * affineRange);
        const canvasRadius = affineRadius * scaleAffine;

        // Skip if way off screen or too large
        if (canvasRadius > width * 3) return;
        if (pCenter.x < -canvasRadius || pCenter.x > width + canvasRadius) return;
        if (pCenter.y < -canvasRadius || pCenter.y > height + canvasRadius) return;

        ctx.beginPath();
        ctx.arc(pCenter.x, pCenter.y, Math.min(canvasRadius, width), 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.strokeStyle = color.replace('0.2', '0.8');
        ctx.lineWidth = 1;
        ctx.stroke();
    }

    function drawAffineConic(conic, color) {
        // Draw a conic section: ax² + bxy + cy² + dx + ey + f = 0
        if (!conic || !conic.coeffs) return;

        const [a, b, c, d, e, f] = conic.coeffs;

        // Skip degenerate cases
        if (Math.abs(a) < 1e-10 && Math.abs(b) < 1e-10 && Math.abs(c) < 1e-10) return;

        // Sample points on the conic by solving for y given x (or vice versa)
        // For cy² + (bx + e)y + (ax² + dx + f) = 0
        // y = (-(bx+e) ± sqrt((bx+e)² - 4c(ax² + dx + f))) / (2c)

        const points = [];
        const xMin = -affineRange + affinePanX - affineRange;
        const xMax = affineRange + affinePanX + affineRange;
        const yMin = -affineRange + affinePanY - affineRange;
        const yMax = affineRange + affinePanY + affineRange;

        const step = affineRange / 50;

        // Method 1: Solve for y given x (works well for mostly-horizontal conics)
        if (Math.abs(c) > 1e-10) {
            for (let x = xMin; x <= xMax; x += step) {
                const B = b * x + e;
                const C = a * x * x + d * x + f;
                const disc = B * B - 4 * c * C;

                if (disc >= 0) {
                    const sqrtDisc = Math.sqrt(disc);
                    const y1 = (-B + sqrtDisc) / (2 * c);
                    const y2 = (-B - sqrtDisc) / (2 * c);

                    if (y1 >= yMin && y1 <= yMax) {
                        points.push({ x, y: y1, branch: 1 });
                    }
                    if (y2 >= yMin && y2 <= yMax && Math.abs(y2 - y1) > step / 10) {
                        points.push({ x, y: y2, branch: 2 });
                    }
                }
            }
        }

        // Method 2: Solve for x given y (works well for mostly-vertical conics)
        if (Math.abs(a) > 1e-10) {
            for (let y = yMin; y <= yMax; y += step) {
                const B = b * y + d;
                const C = c * y * y + e * y + f;
                const disc = B * B - 4 * a * C;

                if (disc >= 0) {
                    const sqrtDisc = Math.sqrt(disc);
                    const x1 = (-B + sqrtDisc) / (2 * a);
                    const x2 = (-B - sqrtDisc) / (2 * a);

                    if (x1 >= xMin && x1 <= xMax) {
                        points.push({ x: x1, y, branch: 3 });
                    }
                    if (x2 >= xMin && x2 <= xMax && Math.abs(x2 - x1) > step / 10) {
                        points.push({ x: x2, y, branch: 4 });
                    }
                }
            }
        }

        if (points.length < 2) return;

        // Sort points by angle from center for better curve drawing
        // Find approximate center of the conic
        let sumX = 0, sumY = 0;
        points.forEach(p => { sumX += p.x; sumY += p.y; });
        const centerX = sumX / points.length;
        const centerY = sumY / points.length;

        // Group points by branch and draw each branch
        const branches = {};
        points.forEach(p => {
            if (!branches[p.branch]) branches[p.branch] = [];
            branches[p.branch].push(p);
        });

        ctx.strokeStyle = color;
        ctx.lineWidth = 2;

        Object.values(branches).forEach(branchPoints => {
            if (branchPoints.length < 2) return;

            // Sort by coordinate
            if (branchPoints[0].branch <= 2) {
                branchPoints.sort((a, b) => a.x - b.x);
            } else {
                branchPoints.sort((a, b) => a.y - b.y);
            }

            ctx.beginPath();
            let started = false;
            let lastP = null;

            for (const pt of branchPoints) {
                const canvasPt = affineToCanvas(pt.x, pt.y);

                // Skip if too far from last point (discontinuity in hyperbola)
                if (lastP) {
                    const dist = Math.hypot(canvasPt.x - lastP.x, canvasPt.y - lastP.y);
                    if (dist > width / 4) {
                        ctx.stroke();
                        ctx.beginPath();
                        started = false;
                    }
                }

                if (!started) {
                    ctx.moveTo(canvasPt.x, canvasPt.y);
                    started = true;
                } else {
                    ctx.lineTo(canvasPt.x, canvasPt.y);
                }
                lastP = canvasPt;
            }
            ctx.stroke();
        });

        // Draw eigenvector fixed points if available
        if (conic.affine_eigenvecs) {
            conic.affine_eigenvecs.forEach(ev => {
                if (ev && ev[0] !== null) {
                    const p = affineToCanvas(ev[0], ev[1]);
                    if (p.x >= -10 && p.x <= width + 10 && p.y >= -10 && p.y <= height + 10) {
                        ctx.beginPath();
                        ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
                        ctx.fillStyle = color;
                        ctx.fill();
                        ctx.strokeStyle = 'white';
                        ctx.lineWidth = 1;
                        ctx.stroke();
                    }
                }
            });
        }
    }

    function drawPoint(p, color, label) {
        const px = cx + p.x * scale;
        const py = cy - p.y * scale; // Flip Y for canvas

        ctx.beginPath();
        ctx.arc(px, py, 5, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();

        if (label) {
            ctx.fillStyle = '#94a3b8';
            ctx.font = '12px Inter';
            ctx.fillText(label, px + 8, py + 3);
        }
    }

    // Helper: 3D Rotation (exposed for Great Circle)
    // ... rotateVector is already defined above ...

    function drawGreatCircle(normal, color) {
        // Normal n. Plane n.v = 0.
        // parametrized circle.

        // Normalize n
        const n_norm = Math.sqrt(normal[0] ** 2 + normal[1] ** 2 + normal[2] ** 2);
        const nx = normal[0] / n_norm;
        const ny = normal[1] / n_norm;
        const nz = normal[2] / n_norm;

        // Find u orthogonal to n
        let u;
        if (Math.abs(nx) < 0.9) u = [1, 0, 0];
        else u = [0, 1, 0];

        // u = u - (u.n)n
        const dot = u[0] * nx + u[1] * ny + u[2] * nz;
        u[0] -= dot * nx;
        u[1] -= dot * ny;
        u[2] -= dot * nz;

        const u_norm = Math.sqrt(u[0] ** 2 + u[1] ** 2 + u[2] ** 2);
        u[0] /= u_norm; u[1] /= u_norm; u[2] /= u_norm;

        // w = n x u
        const wx = ny * u[2] - nz * u[1];
        const wy = nz * u[0] - nx * u[2];
        const wz = nx * u[1] - ny * u[0];

        const w = [wx, wy, wz];

        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;

        // Draw the full ellipse (projection of the great circle) WITHOUT z-flip.
        // This visualizes the plane intersection with the sphere directly.

        for (let i = 0; i <= 360; i += 2) {
            const theta = i * Math.PI / 180;
            const c = Math.cos(theta);
            const s = Math.sin(theta);

            // Point on circle in 3D (unrotated)
            const p_raw = [
                c * u[0] + s * w[0],
                c * u[1] + s * w[1],
                c * u[2] + s * w[2]
            ];

            // Rotate
            const p_rot = rotateVector(p_raw);

            // Project (ORTHOGRAPHIC, no Z-flip)
            const px = cx + p_rot[0] * scale;
            const py = cy - p_rot[1] * scale;

            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.stroke();
    }

    function drawSmallCircle(center, radiusAngle, color) {
        // Draw circle on sphere around center with angular radius 'radiusAngle'
        const d = Math.cos(radiusAngle);
        const R = Math.sin(radiusAngle);

        // Normalize center
        const c_norm = Math.sqrt(center[0] ** 2 + center[1] ** 2 + center[2] ** 2);
        const nx = center[0] / c_norm;
        const ny = center[1] / c_norm;
        const nz = center[2] / c_norm;

        // Basis u, w
        let u;
        if (Math.abs(nx) < 0.9) u = [1, 0, 0];
        else u = [0, 1, 0];
        const dot = u[0] * nx + u[1] * ny + u[2] * nz;
        u[0] -= dot * nx; u[1] -= dot * ny; u[2] -= dot * nz;
        const u_norm = Math.sqrt(u[0] ** 2 + u[1] ** 2 + u[2] ** 2);
        u[0] /= u_norm; u[1] /= u_norm; u[2] /= u_norm;

        const wx = ny * u[2] - nz * u[1];
        const wy = nz * u[0] - nx * u[2];
        const wz = nx * u[1] - ny * u[0];
        const w = [wx, wy, wz];

        ctx.beginPath();
        ctx.fillStyle = color; // transparent fill
        ctx.strokeStyle = color.replace('0.2', '0.8');

        let points = [];

        for (let i = 0; i <= 360; i += 5) {
            const theta = i * Math.PI / 180;
            const cos = Math.cos(theta);
            const sin = Math.sin(theta);

            const px = d * nx + R * (cos * u[0] + sin * w[0]);
            const py = d * ny + R * (cos * u[1] + sin * w[1]);
            const pz = d * nz + R * (cos * u[2] + sin * w[2]);

            points.push(project([px, py, pz]));
        }

        if (points.length > 0) {
            const start = points[0];
            ctx.moveTo(cx + start.x * scale, cy - start.y * scale);
            for (let p of points) {
                ctx.lineTo(cx + p.x * scale, cy - p.y * scale);
            }
        }
        ctx.fill();
        ctx.stroke();
    }

    // Color Palette for dynamic generators
    const colorPalette = [
        '#f43f5e', // Rose
        '#10b981', // Emerald
        '#3b82f6', // Blue
        '#f59e0b', // Amber
        '#8b5cf6', // Violet
        '#ec4899', // Pink
        '#06b6d4', // Cyan
        '#84cc16'  // Lime
    ];
    let genColors = {};
    let visibility = {};

    function renderVisualization() {
        console.log('renderVisualization called, viewMode:', viewMode, 'vizData:', !!window.vizData);
        ctx.clearRect(0, 0, width, height);

        if (viewMode === 'sphere') {
            renderSphereView();
        } else {
            renderAffineView();
        }

        updateLegend();
    }

    function renderSphereView() {
        console.log('renderSphereView called');
        drawDisk();

        if (!window.vizData) return;

        const data = window.vizData;
        const defaultRadius = data.max_radius / 2.0;

        // Draw Words first (dots)
        if (data.words) {
            data.words.forEach(w => {
                const p = project(w.att_vec);
                drawPoint({ x: p.x, y: p.y }, '#ffffff', null);
            });
        }

        // Draw Generators
        for (const [name, gen] of Object.entries(data.generators)) {
            if (!visibility[name]) continue;

            const c = genColors[name] || '#fff';
            // Convert to rgba for fill
            let rgba = 'rgba(255, 255, 255, 0.2)';
            if (c.startsWith('#')) {
                const r = parseInt(c.slice(1, 3), 16);
                const g = parseInt(c.slice(3, 5), 16);
                const b = parseInt(c.slice(5, 7), 16);
                rgba = `rgba(${r},${g},${b}, 0.2)`;
            }

            const radius = gen.radius || defaultRadius;
            drawSmallCircle(gen.att_vec, radius, rgba);
            drawGreatCircle(gen.rep_norm_vec, 'rgba(255, 255, 255, 0.2)');
            drawPoint(project(gen.att_vec), c, formatCanvasLabel(name));
        }
    }

    function renderAffineView() {
        drawAffineBackground();

        if (!window.vizData) return;

        const data = window.vizData;
        const defaultRadius = data.max_radius / 2.0;

        // Draw Words first (dots)
        if (data.words) {
            data.words.forEach(w => {
                drawAffinePoint(w.att_vec, '#ffffff', null);
            });
        }

        // Draw Generators
        for (const [name, gen] of Object.entries(data.generators)) {
            if (!visibility[name]) continue;

            const c = genColors[name] || '#fff';
            let rgba = 'rgba(255, 255, 255, 0.2)';
            if (c.startsWith('#')) {
                const r = parseInt(c.slice(1, 3), 16);
                const gVal = parseInt(c.slice(3, 5), 16);
                const b = parseInt(c.slice(5, 7), 16);
                rgba = `rgba(${r},${gVal},${b}, 0.2)`;
            }

            const radius = gen.radius || defaultRadius;

            // Draw invariant conic if available
            if (gen.conic) {
                drawAffineConic(gen.conic, c);
            }

            // Draw domain (circle in affine coords)
            drawAffineCircle(gen.att_vec, radius, rgba);

            // Draw repelling plane (line in affine coords)
            drawAffineLine(gen.rep_norm_vec, 'rgba(255, 255, 255, 0.3)');

            // Draw attractor point
            drawAffinePoint(gen.att_vec, c, formatCanvasLabel(name));
        }
    }

    function updateLegend() {
        const legendContainer = document.querySelector('.legend');
        if (!legendContainer) return;
        legendContainer.innerHTML = '';

        if (!window.vizData) return;

        // Helper to format generator names with LaTeX for MathJax
        function formatNameLatex(name) {
            // Convert "a_inv" to "$a^{-1}$", etc.
            if (name.endsWith('_inv')) {
                const base = name.slice(0, -4);
                return `$${base}^{-1}$`;
            }
            return `$${name}$`;
        }

        // Helper for canvas/title (plain text with Unicode)
        function formatNamePlain(name) {
            if (name.endsWith('_inv')) {
                return name.slice(0, -4) + '⁻¹';
            }
            return name;
        }

        // Sort: base generators first, then their inverses
        const sortedKeys = Object.keys(window.vizData.generators).sort((a, b) => {
            const aBase = a.replace('_inv', '');
            const bBase = b.replace('_inv', '');
            if (aBase !== bBase) return aBase.localeCompare(bBase);
            // Base before inverse
            return a.includes('_inv') ? 1 : -1;
        });

        sortedKeys.forEach(key => {
            const item = document.createElement('div');
            item.className = 'legend-item';

            const c = genColors[key] || '#fff';

            // Checkbox for visibility
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = visibility[key];
            checkbox.className = 'legend-checkbox';
            checkbox.addEventListener('change', (e) => {
                e.stopPropagation();
                visibility[key] = e.target.checked;
                renderVisualization();
            });
            checkbox.addEventListener('click', (e) => e.stopPropagation());

            // Colored dot
            const dot = document.createElement('span');
            dot.className = 'legend-dot';
            dot.style.backgroundColor = c;

            // Label (clickable for animation) - using MathJax
            const label = document.createElement('span');
            label.className = 'legend-label';
            label.innerHTML = formatNameLatex(key);
            label.style.color = c;
            label.title = `Click to animate ${formatNamePlain(key)}`;

            // Play icon
            const playIcon = document.createElement('span');
            playIcon.className = 'legend-play';
            playIcon.textContent = '▶';
            playIcon.style.color = c;

            // Click on label or item (except checkbox) triggers animation
            const triggerAnimation = (e) => {
                if (e.target === checkbox) return;
                e.preventDefault();
                animateTransformation(key);
            };

            label.addEventListener('click', triggerAnimation);
            playIcon.addEventListener('click', triggerAnimation);

            item.appendChild(checkbox);
            item.appendChild(dot);
            item.appendChild(label);
            item.appendChild(playIcon);
            legendContainer.appendChild(item);
        });

        // Trigger MathJax to typeset the new content
        if (window.MathJax && window.MathJax.typesetPromise) {
            MathJax.typesetPromise([legendContainer]).catch((err) => console.log('MathJax error:', err));
        }
    }

    analyzeBtn.addEventListener('click', async () => {
        statusText.textContent = 'Analyzing...';
        statusText.style.color = '#e2e8f0';
        warningsList.innerHTML = '';
        metricsDiv.innerHTML = '';

        analyzeBtn.disabled = true;

        const generatorsPayload = {};
        generatorsState.forEach(gen => {
            generatorsPayload[gen.name] = getMatrixFromValues(gen.values);
        });

        const extraWords = extraWordsInput.value.split('\n').map(s => s.trim()).filter(s => s);

        const data = {
            generators: generatorsPayload,
            extraWords: extraWords,
            k: powerInput.value
        };

        try {
            const response = await fetch('/analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            const result = await response.json();

            if (result.success) {
                statusText.textContent = result.valid ?
                    `Valid Ping Pong Structure (k=${result.k})` :
                    `Structure Invalid / Weak (k=${result.k})`;
                statusText.style.color = result.valid ? '#10b981' : '#f43f5e';

                metricsDiv.innerHTML = `
                    <div>Min Separation: ${result.min_separation.toFixed(4)}</div>
                    <div>Safe Radius: ${result.max_radius.toFixed(4)}</div>
                `;

                if (result.warnings && result.warnings.length > 0) {
                    result.warnings.forEach(w => {
                        const li = document.createElement('li');
                        li.textContent = w;
                        warningsList.appendChild(li);
                    });
                }

                window.vizData = result;

                // Assign colors dynamically
                genColors = {};
                const baseNames = new Set();
                Object.keys(result.generators).forEach(k => {
                    const base = k.replace('_inv', '');
                    baseNames.add(base);
                });

                const baseColorMap = {};
                Array.from(baseNames).forEach((base, i) => {
                    baseColorMap[base] = colorPalette[i % colorPalette.length];
                });

                Object.keys(result.generators).forEach(k => {
                    const base = k.replace('_inv', '');
                    genColors[k] = baseColorMap[base];
                });

                visibility = {};
                Object.keys(result.generators).forEach(k => visibility[k] = true);

                renderVisualization();
            } else {
                statusText.textContent = 'Error: ' + result.error;
                statusText.style.color = '#f87171';
            }
        } catch (e) {
            statusText.textContent = 'Network Error';
            console.error(e);
        } finally {
            analyzeBtn.textContent = 'Analyze Ping Pong';
            analyzeBtn.disabled = false;
        }
    });

    // Refresh button - triggers analyze
    const refreshBtn = document.getElementById('refresh-btn');
    refreshBtn.addEventListener('click', () => {
        // Add spinning animation
        refreshBtn.classList.add('spinning');
        setTimeout(() => refreshBtn.classList.remove('spinning'), 500);

        // Trigger the analyze button click
        analyzeBtn.click();
    });

    // --- Animation Logic ---
    let isAnimating = false;

    function getCircleBoundaryPoints(center, radiusAngle, numPoints = 50) {
        // Parametrize small circle boundary
        const d = Math.cos(radiusAngle);
        const R = Math.sin(radiusAngle);

        const c_norm = Math.sqrt(center[0] ** 2 + center[1] ** 2 + center[2] ** 2);
        const nx = center[0] / c_norm;
        const ny = center[1] / c_norm;
        const nz = center[2] / c_norm;

        let u;
        if (Math.abs(nx) < 0.9) u = [1, 0, 0];
        else u = [0, 1, 0];
        const dot = u[0] * nx + u[1] * ny + u[2] * nz;
        u[0] -= dot * nx; u[1] -= dot * ny; u[2] -= dot * nz;
        const u_norm = Math.sqrt(u[0] ** 2 + u[1] ** 2 + u[2] ** 2);
        u[0] /= u_norm; u[1] /= u_norm; u[2] /= u_norm;

        const wx = ny * u[2] - nz * u[1];
        const wy = nz * u[0] - nx * u[2];
        const wz = nx * u[1] - ny * u[0];
        const w = [wx, wy, wz];

        const points = [];
        for (let i = 0; i <= numPoints; i++) {
            const theta = (i / numPoints) * 2 * Math.PI;
            const cos = Math.cos(theta);
            const sin = Math.sin(theta);

            const px = d * nx + R * (cos * u[0] + sin * w[0]);
            const py = d * ny + R * (cos * u[1] + sin * w[1]);
            const pz = d * nz + R * (cos * u[2] + sin * w[2]);
            points.push([px, py, pz]);
        }
        return points;
    }

    function matMul(M, v) {
        // M is 3x3 array, v is [x,y,z]
        const res = [0, 0, 0];
        for (let i = 0; i < 3; i++) {
            res[i] = M[i][0] * v[0] + M[i][1] * v[1] + M[i][2] * v[2];
        }
        return res;
    }

    function animateTransformation(genName) {
        if (isAnimating) return;
        isAnimating = true;

        // Safety check
        if (!window.vizData || !window.vizData.generators[genName]) {
            isAnimating = false;
            return;
        }

        const genData = window.vizData.generators[genName];
        const M = genData.mat;
        const defaultRadius = window.vizData.max_radius / 2.0;

        // Build inverse map dynamically
        const invMap = {};
        Object.keys(window.vizData.generators).forEach(k => {
            if (k.endsWith('_inv')) {
                const base = k.replace('_inv', '');
                invMap[base] = k;
                invMap[k] = base;
            }
        });

        // If not found (e.g. user deleted inverse?), handle gracefully
        const invName = invMap[genName];

        const shapes = [];
        const shapeColors = [];

        for (const [name, g] of Object.entries(window.vizData.generators)) {
            // Don't animate the domain of g^-1
            if (name === invName) continue;

            // Get boundary points of U_h (in 3D)
            const r = g.radius || defaultRadius;
            const pts = getCircleBoundaryPoints(g.att_vec, r);
            shapes.push(pts);
            // Use the color of the set being moved
            shapeColors.push(genColors[name]);
        }

        const duration = 2000; // ms
        const startTime = performance.now();

        function loop(time) {
            let t = (time - startTime) / duration;
            if (t > 1) t = 1;

            // Ease out
            const ease = 1 - Math.pow(1 - t, 3);

            // Render static base
            renderVisualization();

            // Interpolate action
            shapes.forEach((pts, shapeIdx) => {
                const movedPts = pts.map(p => {
                    const transformed = matMul(M, p);
                    // Interpolate between p and transformed
                    const curr = [
                        (1 - ease) * p[0] + ease * transformed[0],
                        (1 - ease) * p[1] + ease * transformed[1],
                        (1 - ease) * p[2] + ease * transformed[2]
                    ];

                    // Project based on current view mode
                    if (viewMode === 'affine') {
                        const affPt = projectAffine(curr);
                        if (!affPt) return null;
                        return affineToCanvas(affPt.x, affPt.y);
                    } else {
                        const sphPt = project(curr);
                        return { x: cx + sphPt.x * scale, y: cy - sphPt.y * scale };
                    }
                }).filter(p => p !== null);

                // Draw shape
                const c = shapeColors[shapeIdx];
                ctx.beginPath();
                if (movedPts.length > 1) {
                    ctx.moveTo(movedPts[0].x, movedPts[0].y);
                    for (let i = 1; i < movedPts.length; i++) {
                        ctx.lineTo(movedPts[i].x, movedPts[i].y);
                    }
                    if (c && c.startsWith('#')) {
                        const r = parseInt(c.slice(1, 3), 16);
                        const gVal = parseInt(c.slice(3, 5), 16);
                        const b = parseInt(c.slice(5, 7), 16);
                        ctx.fillStyle = `rgba(${r},${gVal},${b}, 0.5)`;
                    }
                    ctx.fill();
                    ctx.strokeStyle = '#fff';
                    ctx.lineWidth = 1;
                    ctx.stroke();
                }
            });

            if (t < 1) {
                requestAnimationFrame(loop);
            } else {
                isAnimating = false;
            }
        }

        requestAnimationFrame(loop);
    }

    // Initial draw
    drawDisk();
});
