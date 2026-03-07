let animationRunning = false;
let animationFrame = null;

export function toggleAnimation() {
    const btn = document.getElementById('playBtn');
    if (animationRunning) {
        animationRunning = false;
        cancelAnimationFrame(animationFrame);
        btn.textContent = 'Play Animation';
    } else {
        animationRunning = true;
        btn.textContent = 'Pause';
        startAnosovAnimation();
    }
}

// Attach to window
window.toggleAnimation = toggleAnimation;

function startAnosovAnimation() {
    const canvas = document.getElementById('anosovCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    const scale = 250;
    const offsetX = (width - scale) / 2;
    const offsetY = (height - scale) / 2;

    const duration = 7000; // ms
    const startTime = Date.now();

    // Helper: convert logical to canvas coords
    const toCanvas = (x, y) => ({
        x: offsetX + x * scale,
        y: offsetY + (1 - y) * scale
    });

    // Points from Theorem 7 (page 4 of arXiv:2511.10530)
    const points = [
        { label: 'P', subscript: '1', x: 0, y: 0, color: '#9b59b6' },
        { label: 'P', subscript: '2', x: 4 / 5, y: 3 / 5, color: '#3498db' },
        { label: 'P', subscript: '3', x: 3 / 5, y: 1 / 5, color: '#e74c3c' },
        { label: 'P', subscript: '4', x: 2 / 5, y: 4 / 5, color: '#f39c12' },
        { label: 'P', subscript: '5', x: 1 / 5, y: 2 / 5, color: '#1abc9c' }
    ];

    function animate() {
        if (!animationRunning) return;

        const elapsed = Date.now() - startTime;
        let t = elapsed / duration;

        // Clamp t to stay in final state after animation completes
        if (t > 0.75) {
            t = 0.75;
        }

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);

        // Phases:
        // 0.0-0.35: Transform
        // 0.35-0.45: Hold transformed
        // 0.45-0.75: Cut and drag
        // After 0.75: Stay in final state

        let phase, s;
        if (t < 0.35) {
            phase = 'transform';
            s = t / 0.35;
        } else if (t < 0.45) {
            phase = 'hold_transformed';
            s = 1.0;
        } else if (t < 0.75) {
            phase = 'cut_drag';
            s = (t - 0.45) / 0.3;
        } else {
            phase = 'cut_drag';
            s = 1.0;
        }

        const smoothS = s * s * (3 - 2 * s);

        // Matrix interpolation
        let m11, m12, m21, m22;
        if (phase === 'transform') {
            m11 = 1;
            m12 = smoothS;
            m21 = smoothS;
            m22 = 1 - smoothS;
        } else {
            m11 = 1; m12 = 1; m21 = 1; m22 = 0;
        }

        const gridDensity = 5;

        // Golden ratio and eigenspaces
        const phi = (1 + Math.sqrt(5)) / 2;

        if (phase !== 'cut_drag') {
            // Draw fixed eigenspace foliations (not transformed)
            const numLines = 8;

            // Expanding eigenspace (blue) - direction [φ, 1]
            ctx.strokeStyle = 'rgba(52, 152, 219, 0.3)';
            ctx.lineWidth = 1.5;
            for (let i = -numLines; i <= numLines; i++) {
                const offset = i * 0.15;
                const t1 = -2, t2 = 2;

                const x1 = offset + phi * t1;
                const y1 = t1;
                const x2 = offset + phi * t2;
                const y2 = t2;

                const p1 = toCanvas(x1, y1);
                const p2 = toCanvas(x2, y2);

                ctx.beginPath();
                ctx.moveTo(p1.x, p1.y);
                ctx.lineTo(p2.x, p2.y);
                ctx.stroke();
            }

            // Contracting eigenspace (orange) - direction [1, -φ]
            ctx.strokeStyle = 'rgba(230, 126, 34, 0.3)';
            ctx.lineWidth = 1.5;
            for (let i = -numLines; i <= numLines; i++) {
                const offset = i * 0.15;
                const t1 = -2, t2 = 2;

                const x1 = offset + t1;
                const y1 = -phi * t1;
                const x2 = offset + t2;
                const y2 = -phi * t2;

                const p1 = toCanvas(x1, y1);
                const p2 = toCanvas(x2, y2);

                ctx.beginPath();
                ctx.moveTo(p1.x, p1.y);
                ctx.lineTo(p2.x, p2.y);
                ctx.stroke();
            }

            // Normal grid drawing
            ctx.strokeStyle = '#e0e0e0';
            ctx.lineWidth = 1;

            for (let i = 0; i <= gridDensity; i++) {
                const u = i / gridDensity;
                // Vertical
                ctx.beginPath();
                for (let j = 0; j <= gridDensity; j++) {
                    const v = j / gridDensity;
                    const x = m11 * u + m12 * v;
                    const y = m21 * u + m22 * v;
                    const p = toCanvas(x, y);
                    if (j === 0) ctx.moveTo(p.x, p.y);
                    else ctx.lineTo(p.x, p.y);
                }
                ctx.stroke();
                // Horizontal
                ctx.beginPath();
                for (let j = 0; j <= gridDensity; j++) {
                    const v = j / gridDensity;
                    const x = m11 * v + m12 * u;
                    const y = m21 * v + m22 * u;
                    const p = toCanvas(x, y);
                    if (j === 0) ctx.moveTo(p.x, p.y);
                    else ctx.lineTo(p.x, p.y);
                }
                ctx.stroke();
            }

            // Boundary
            ctx.strokeStyle = '#2c3e50';
            ctx.lineWidth = 3;
            ctx.beginPath();
            [[0, 0], [1, 0], [1, 1], [0, 1]].forEach((c, i) => {
                const x = m11 * c[0] + m12 * c[1];
                const y = m21 * c[0] + m22 * c[1];
                const p = toCanvas(x, y);
                if (i === 0) ctx.moveTo(p.x, p.y);
                else ctx.lineTo(p.x, p.y);
            });
            ctx.closePath();
            ctx.stroke();

            // Basis vectors
            const drawVector = (vx, vy, color, label) => {
                const x = m11 * vx + m12 * vy;
                const y = m21 * vx + m22 * vy;
                const p = toCanvas(x, y);
                const origin = toCanvas(0, 0);

                ctx.strokeStyle = color;
                ctx.fillStyle = color;
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.moveTo(origin.x, origin.y);
                ctx.lineTo(p.x, p.y);
                ctx.stroke();

                const angle = Math.atan2(p.y - origin.y, p.x - origin.x);
                const headLength = 15;
                ctx.beginPath();
                ctx.moveTo(p.x, p.y);
                ctx.lineTo(p.x - headLength * Math.cos(angle - Math.PI / 6),
                    p.y - headLength * Math.sin(angle - Math.PI / 6));
                ctx.lineTo(p.x - headLength * Math.cos(angle + Math.PI / 6),
                    p.y - headLength * Math.sin(angle + Math.PI / 6));
                ctx.closePath();
                ctx.fill();

                ctx.font = 'bold 16px Arial';
                ctx.fillText(label, p.x + 10, p.y - 10);
            };

            drawVector(1, 0, '#e74c3c', 'e₁');
            drawVector(0, 1, '#3498db', 'e₂');

            // Draw scaling eigenvectors
            const drawEigenvector = (vx, vy, scaleFactor, color, label) => {
                const length = Math.sqrt(vx * vx + vy * vy);
                const scale = 0.4 * scaleFactor; // Base length 0.4
                const x = vx * scale / length;
                const y = vy * scale / length;

                const p = toCanvas(x, y);
                const origin = toCanvas(0, 0);

                ctx.strokeStyle = color;
                ctx.fillStyle = color;
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.moveTo(origin.x, origin.y);
                ctx.lineTo(p.x, p.y);
                ctx.stroke();

                const angle = Math.atan2(p.y - origin.y, p.x - origin.x);
                const headLength = 15;
                ctx.beginPath();
                ctx.moveTo(p.x, p.y);
                ctx.lineTo(p.x - headLength * Math.cos(angle - Math.PI / 6),
                    p.y - headLength * Math.sin(angle - Math.PI / 6));
                ctx.lineTo(p.x - headLength * Math.cos(angle + Math.PI / 6),
                    p.y - headLength * Math.sin(angle + Math.PI / 6));
                ctx.closePath();
                ctx.fill();

                ctx.font = 'bold 16px Arial';
                ctx.fillText(label, p.x + 10, p.y - 10);
            };

            // Expanding eigenvector (blue): scales by φ^smoothS
            const expandScale = Math.pow(phi, smoothS);
            drawEigenvector(phi, 1, expandScale, '#3498db', 'v₊');

            // Contracting eigenvector (orange): maps from (1, -φ) to (-1/φ, 1)
            // Linear interpolation naturally passes through origin
            const vx = (1 - smoothS) * 1 + smoothS * (-1 / phi);
            const vy = (1 - smoothS) * (-phi) + smoothS * 1;
            drawEigenvector(vx, vy, 1, '#e67e22', 'v₋');

        } else {
            // Cut-and-drag phase
            const dragOffset = -smoothS; // Drag triangle left

            // Draw left piece (parallelogram with x <= 1)
            ctx.strokeStyle = '#e0e0e0';
            ctx.lineWidth = 1;

            // Grid on left piece
            for (let i = 0; i <= gridDensity; i++) {
                const u = i / gridDensity;
                for (let j = 0; j <= gridDensity; j++) {
                    const v = j / gridDensity;
                    const x = u + v;
                    const y = u;
                    if (x <= 1.01) {
                        const p1 = toCanvas(x, y);
                        const x2 = (i + 1) / gridDensity + v;
                        const y2 = (i + 1) / gridDensity;
                        if (x2 <= 1.01 && i < gridDensity) {
                            ctx.beginPath();
                            ctx.moveTo(p1.x, p1.y);
                            const p2 = toCanvas(x2, y2);
                            ctx.lineTo(p2.x, p2.y);
                            ctx.stroke();
                        }
                        const x3 = u + (j + 1) / gridDensity;
                        const y3 = u;
                        if (x3 <= 1.01 && j < gridDensity) {
                            ctx.beginPath();
                            ctx.moveTo(p1.x, p1.y);
                            const p3 = toCanvas(x3, y3);
                            ctx.lineTo(p3.x, p3.y);
                            ctx.stroke();
                        }
                    }
                }
            }

            // Left piece boundary and fill
            ctx.fillStyle = 'rgba(52, 152, 219, 0.1)';
            ctx.strokeStyle = '#2c3e50';
            ctx.lineWidth = 3;
            ctx.beginPath();
            let p = toCanvas(0, 0);
            ctx.moveTo(p.x, p.y);
            p = toCanvas(1, 0);
            ctx.lineTo(p.x, p.y);
            p = toCanvas(1, 1);
            ctx.lineTo(p.x, p.y);
            p = toCanvas(0, 0);
            ctx.lineTo(p.x, p.y);
            ctx.fill();
            ctx.stroke();

            // Right triangle (dragging)
            // Vertices: (1,0), (1,1), (2,1) → drag left by smoothS
            ctx.fillStyle = 'rgba(231, 76, 60, 0.15)';
            ctx.beginPath();
            p = toCanvas(1 + dragOffset, 0);
            ctx.moveTo(p.x, p.y);
            p = toCanvas(1 + dragOffset, 1);
            ctx.lineTo(p.x, p.y);
            p = toCanvas(2 + dragOffset, 1);
            ctx.lineTo(p.x, p.y);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            // Grid on triangle
            ctx.strokeStyle = '#e0e0e0';
            ctx.lineWidth = 1;
            for (let i = 0; i <= gridDensity; i++) {
                const u = i / gridDensity;
                for (let j = 0; j <= gridDensity; j++) {
                    const v = j / gridDensity;
                    const x = u + v + dragOffset;
                    const y = u;
                    const origX = u + v;
                    if (origX > 0.99 && origX <= 2.01) {
                        const p1 = toCanvas(x, y);
                        const x2 = (i + 1) / gridDensity + v + dragOffset;
                        const y2 = (i + 1) / gridDensity;
                        const origX2 = (i + 1) / gridDensity + v;
                        if (origX2 > 0.99 && origX2 <= 2.01 && i < gridDensity) {
                            ctx.beginPath();
                            ctx.moveTo(p1.x, p1.y);
                            const p2 = toCanvas(x2, y2);
                            ctx.lineTo(p2.x, p2.y);
                            ctx.stroke();
                        }
                    }
                }
            }

            // Cut line
            ctx.strokeStyle = '#e74c3c';
            ctx.lineWidth = 3;
            ctx.setLineDash([10, 5]);
            ctx.beginPath();
            p = toCanvas(1, 0);
            ctx.moveTo(p.x, p.y);
            p = toCanvas(1, 1);
            ctx.lineTo(p.x, p.y);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        // Draw tracked points
        points.forEach(pt => {
            let x = m11 * pt.x + m12 * pt.y;
            let y = m21 * pt.x + m22 * pt.y;

            if (phase === 'cut_drag') {
                // Apply drag to points in triangle
                if (x > 1) {
                    x -= smoothS;
                }
            }

            const p = toCanvas(x, y);
            ctx.fillStyle = pt.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, 6, 0, 2 * Math.PI);
            ctx.fill();
            ctx.strokeStyle = '#2c3e50';
            ctx.lineWidth = 2;
            ctx.stroke();

            // Draw label with subscript
            ctx.fillStyle = '#2c3e50';
            ctx.font = 'bold 14px Arial';
            const mainText = pt.label;
            const mainWidth = ctx.measureText(mainText).width;
            ctx.fillText(mainText, p.x + 10, p.y - 8);

            ctx.font = 'bold 10px Arial';
            ctx.fillText(pt.subscript, p.x + 10 + mainWidth, p.y - 4);
        });

        // Phase label
        ctx.fillStyle = '#2c3e50';
        ctx.font = 'bold 18px Arial';
        let phaseText = '';
        if (phase === 'transform') {
            phaseText = 'Applying Anosov map';
        } else if (phase === 'hold_transformed') {
            phaseText = 'Parallelogram extends beyond unit square';
        } else if (phase === 'cut_drag') {
            if (s < 1.0) {
                phaseText = 'Cut at x=1 and drag triangle left';
            } else {
                phaseText = 'Result: Anosov map on torus';
            }
        }
        ctx.fillText(phaseText, 20, 30);

        animationFrame = requestAnimationFrame(animate);
    }

    animate();
}
