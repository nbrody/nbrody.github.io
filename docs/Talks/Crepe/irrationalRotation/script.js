/**
 * Irrational Rotation Visualizer
 * Logic for simulating orbits on S¹ under rotation by α.
 */

class IrrationalRotation {
    constructor() {
        this.canvas = document.getElementById('canvas');
        this.ctx = this.canvas.getContext('2d');
        this.overlay = document.getElementById('labels-overlay');
        
        // State
        this.alpha = 0.125;
        this.iterations = 1;
        this.mode = 'rational';
        this.currentStep = 0;
        this.isPlaying = false;
        this.points = [];
        this.seeds = [0];
        
        // Paradox animation state
        this.paradoxPhase = 'idle'; // 'idle' | 'translate-out' | 'rotate' | 'translate-back' | 'done'
        this.paradoxT = 0;        // 0→1 animation progress for current phase
        this.paradoxOrbitN = 30;   // Number of orbit points to show in paradox

        // UI Elements
        this.elements = {
            alphaSlider: document.getElementById('alpha-slider'),
            alphaDisplay: document.getElementById('alpha-display'),
            iterSlider: document.getElementById('iter-slider'),
            iterDisplay: document.getElementById('iter-display'),
            playBtn: document.getElementById('play-btn'),
            stepBtn: null, // to be created
            resetBtn: document.getElementById('reset-btn'),
            modeBtn: document.getElementById('mode-btn'),
            description: document.getElementById('description'),
            dots: document.getElementById('dots'),
            prevBtn: document.getElementById('prev-btn'),
            nextBtn: document.getElementById('next-btn')
        };

        // Create Step Button
        const stepBtn = document.createElement('button');
        stepBtn.id = 'step-btn';
        stepBtn.className = 'icon-btn';
        stepBtn.textContent = '↷';
        stepBtn.title = "Step One Rotation";
        this.elements.playBtn.parentNode.insertBefore(stepBtn, this.elements.resetBtn);
        this.elements.stepBtn = stepBtn;

        const PHI = (1 + Math.sqrt(5)) / 2;
        this.steps = [
            {
                title: "Rational Rotation (1/7)",
                text: "Suppose we rotate a circle by $360/7$ degrees ($1/7$ of a rotation). Notice what happens to the base point $x_0$: after exactly $7$ steps, it lands right back where it started!",
                alpha: 1/7,
                iter: 1,
                maxIter: 7,
                mode: 'rational'
            },
            {
                title: "The Golden Ratio",
                text: "Now let's rotate by the Golden Ratio $\\phi = \\frac{1+\\sqrt{5}}{2}$. Because $\\phi$ is irrational, this rotation (about $0.618$ of a full circle) will **never** return to the start. The orbit $x_0, x_1, x_2, \\dots$ is infinite!",
                alpha: PHI - 1,
                iter: 1,
                maxIter: 100,
                mode: 'irrational'
            },
            {
                title: "Dense Orbits",
                text: "As we continue, the points fill the circle. Eventually, the orbit will get arbitrarily close to every single point on the circle. This is called a **dense orbit**.",
                alpha: PHI - 1,
                iter: 100,
                maxIter: 1000,
                mode: 'irrational'
            },
            {
                title: "The Logic of Orbits",
                text: "Notice: our point can never land halfway around ($1/2$ rotation). For if $\\rho^n$ moved it halfway, then $\\rho^{2n}$ would return it home—which we know never happens! By the same logic, it never lands on any rationally related point.",
                alpha: PHI - 1,
                iter: 50,
                maxIter: 200,
                mode: 'irrational',
                showMultipleOrbits: false
            },
            {
                title: "Infinitely Many Orbits",
                text: "In this way, we see there are **infinitely many orbits**! While an abstract quotient exists, there's no 'nice' way to write it down or visualize it as a simple geometric object.",
                alpha: PHI - 1,
                iter: 50,
                maxIter: 200,
                mode: 'irrational',
                showMultipleOrbits: true
            },
            // --- NEW PARADOX STEPS ---
            {
                title: "Extract the Orbit",
                text: "Let's focus on a single orbit $\\mathcal{O} = \\{x_0, x_1, x_2, \\dots\\}$. We'll peel those points off the circle to examine them more closely. Notice the gaps left behind—the circle now has infinitely many holes!",
                alpha: PHI - 1,
                iter: 30,
                mode: 'irrational',
                paradox: 'translate-out'
            },
            {
                title: "Apply the Rotation",
                text: "Now apply the rotation $\\rho$ to every point in the orbit. Each $x_n$ maps to $x_{n+1}$. The orbit maps perfectly onto itself—except $x_0$ has no preimage! The point $x_0$ simply **disappears**.",
                alpha: PHI - 1,
                iter: 30,
                mode: 'irrational',
                paradox: 'rotate'
            },
            {
                title: "The Vanishing Point",
                text: "Now translate the rotated points back onto the circle. Every gap is filled **except** the one where $x_0$ used to be. We applied a rigid motion—a rotation—and **lost a point**! This is the heart of the Banach–Tarski paradox.",
                alpha: PHI - 1,
                iter: 30,
                mode: 'irrational',
                paradox: 'translate-back'
            }
        ];

        // Animation state
        this.progress = 0; 
        this.lastTimestamp = 0;
        this.animSpeed = 0.002; 
        this.labels = []; // Track label DOM elements

        this.init();
    }

    init() {
        this.setupEventListeners();
        this.setupDots();
        this.resize();
        window.addEventListener('resize', () => this.resize());
        this.goToStep(0);
        requestAnimationFrame((t) => this.animate(t));
    }

    setupEventListeners() {
        this.elements.alphaSlider.oninput = (e) => {
            this.alpha = parseFloat(e.target.value);
            this.updateDisplay();
        };

        this.elements.iterSlider.oninput = (e) => {
            this.iterations = parseInt(e.target.value);
            this.progress = 0;
            this.updateDisplay();
            this.updateLabels();
        };

        this.elements.playBtn.onclick = () => {
            const step = this.steps[this.currentStep];
            if (step.paradox) {
                // In paradox steps, play triggers the animation
                this.startParadoxAnimation(step.paradox);
                return;
            }
            this.isPlaying = !this.isPlaying;
            this.elements.playBtn.textContent = this.isPlaying ? '⏸' : '▶';
        };

        this.elements.stepBtn.onclick = () => {
            const step = this.steps[this.currentStep];
            if (step.paradox) {
                this.startParadoxAnimation(step.paradox);
                return;
            }
            if (this.progress > 0) return; // Wait for current
            this.isPlaying = false;
            this.elements.playBtn.textContent = '▶';
            this.doStep();
        };

        this.elements.resetBtn.onclick = () => {
            this.iterations = 1;
            this.progress = 0;
            this.paradoxPhase = 'idle';
            this.paradoxT = 0;
            this.updateDisplay();
            this.updateLabels();
        };

        this.elements.modeBtn.onclick = () => {
            if (this.mode === 'rational') {
                this.mode = 'irrational';
                this.alpha = (Math.sqrt(5)-1)/2;
                this.elements.modeBtn.textContent = 'Irrational Mode';
            } else {
                this.mode = 'rational';
                this.alpha = 1/7;
                this.elements.modeBtn.textContent = 'Rational Mode';
            }
            this.updateDisplay();
            this.updateLabels();
        };

        this.elements.prevBtn.onclick = () => this.prev();
        this.elements.nextBtn.onclick = () => this.next();
    }

    setupDots() {
        this.elements.dots.innerHTML = '';
        this.steps.forEach((_, i) => {
            const dot = document.createElement('div');
            dot.className = 'dot';
            dot.onclick = () => this.goToStep(i);
            this.elements.dots.appendChild(dot);
        });
    }

    resize() {
        const wrap = document.getElementById('canvas-wrap');
        const rect = wrap.getBoundingClientRect();
        this.canvas.width = rect.width * window.devicePixelRatio;
        this.canvas.height = rect.height * window.devicePixelRatio;
        this.ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    }

    updateDisplay() {
        this.elements.alphaSlider.value = this.alpha;
        this.elements.iterSlider.value = this.iterations;
        this.elements.iterDisplay.textContent = this.iterations;

        if (this.mode === 'rational') {
            const n = Math.round(1 / this.alpha);
            if (Math.abs(this.alpha - 1/n) < 0.001) {
                this.elements.alphaDisplay.textContent = `1/${n}`;
            } else {
                this.elements.alphaDisplay.textContent = this.alpha.toFixed(3);
            }
        } else {
            this.elements.alphaDisplay.textContent = this.alpha.toFixed(5);
        }

        if (window.MathJax) {
            MathJax.typesetPromise([this.elements.description, this.elements.alphaDisplay, this.elements.iterDisplay]);
        }
    }

    goToStep(index) {
        if (index < 0 || index >= this.steps.length) return;
        
        this.currentStep = index;
        const step = this.steps[index];
        
        this.alpha = step.alpha;
        this.iterations = step.iter;
        this.mode = step.mode;
        this.progress = 0;
        this.isPlaying = false;
        this.paradoxPhase = 'idle';
        this.paradoxT = 0;
        this.elements.playBtn.textContent = '▶';
        
        this.elements.iterSlider.max = step.maxIter || 1000;

        if (step.showMultipleOrbits) {
            this.seeds = [0, 0.1, 0.2, 0.3];
        } else {
            this.seeds = [0];
        }

        // For paradox steps, auto-start the animation after brief delay
        if (step.paradox) {
            this.paradoxPhase = 'idle';
            this.paradoxT = 0;
            setTimeout(() => {
                if (this.currentStep === index) {
                    this.startParadoxAnimation(step.paradox);
                }
            }, 800);
        }

        this.elements.description.style.opacity = 0;
        setTimeout(() => {
            this.elements.description.innerHTML = step.text;
            this.elements.description.style.opacity = 1;
            if (window.MathJax) MathJax.typesetPromise([this.elements.description]);
        }, 200);

        this.elements.prevBtn.disabled = index === 0;
        this.elements.nextBtn.disabled = index === this.steps.length - 1;

        Array.from(this.elements.dots.children).forEach((dot, i) => {
            dot.classList.toggle('active', i === index);
        });

        this.updateDisplay();
        this.updateLabels();
    }

    prev() { this.goToStep(this.currentStep - 1); }
    next() { this.goToStep(this.currentStep + 1); }

    doStep() {
        this.progress = 0.0001; // Trigger animation
    }

    startParadoxAnimation(phase) {
        this.paradoxPhase = phase;
        this.paradoxT = 0;
    }

    animate(timestamp) {
        const dt = timestamp - this.lastTimestamp;
        this.lastTimestamp = timestamp;

        const step = this.steps[this.currentStep];

        // Paradox animation tick
        if (step && step.paradox && this.paradoxPhase !== 'idle' && this.paradoxPhase !== 'done') {
            const speed = this.paradoxPhase === 'rotate' ? 0.0008 : 0.001;
            this.paradoxT += speed * dt;
            if (this.paradoxT >= 1) {
                this.paradoxT = 1;
                this.paradoxPhase = 'done';
            }
        }

        // Normal orbit animation tick
        if (!step?.paradox) {
            if (this.isPlaying || this.progress > 0) {
                this.progress += this.animSpeed * dt;
                if (this.progress >= 1) {
                    this.progress = 0;
                    this.iterations++;
                    
                    if (this.iterations > (step?.maxIter || 1000)) {
                        this.isPlaying = false;
                        this.elements.playBtn.textContent = '▶';
                    }
                    this.updateDisplay();
                    this.updateLabels();
                }
            }
        }

        this.draw();
        requestAnimationFrame((t) => this.animate(t));
    }

    updateLabels() {
        const maxVisible = 25;
        this.overlay.innerHTML = '';
        this.labels = [];

        const step = this.steps[this.currentStep];
        if (step && step.paradox) return; // No labels for paradox steps (we draw them on canvas)

        if (this.iterations > maxVisible || this.seeds.length > 1) return;

        for (let i = 0; i <= this.iterations; i++) {
            const label = document.createElement('div');
            label.className = 'orbit-label';
            label.innerHTML = `\\(x_{${i}}\\)` ;
            this.overlay.appendChild(label);
            this.labels.push(label);
        }

        if (window.MathJax) {
            MathJax.typesetPromise([this.overlay]);
        }
    }

    // Smooth easing: ease-in-out cubic
    ease(t) {
        if (t < 0.5) return 4 * t * t * t;
        return 1 - Math.pow(-2 * t + 2, 3) / 2;
    }

    // Get the position of orbit point i on the circle
    orbitTheta(i) {
        return 2 * Math.PI * (i * this.alpha) - Math.PI / 2;
    }

    draw() {
        const step = this.steps[this.currentStep];
        if (step && step.paradox) {
            this.drawParadox();
        } else {
            this.drawNormal();
        }
    }

    drawNormal() {
        const { ctx, canvas, iterations, alpha, seeds, progress, labels } = this;
        const w = canvas.width / window.devicePixelRatio;
        const h = canvas.height / window.devicePixelRatio;
        const centerX = w / 2;
        const centerY = h / 2 - 40;
        const radius = Math.min(w, h) * 0.32;

        // Label coordinates: use actual overlay bounds since it's inside canvas-wrap,
        // which is shorter than the full viewport (footer sits below).
        const overlayRect = this.overlay.getBoundingClientRect();
        const labelCenterX = overlayRect.width / 2;
        const labelCenterY = overlayRect.height / 2 - 40;
        const labelRadius = Math.min(overlayRect.width, overlayRect.height) * 0.32;
        const labelOffset = 22;

        ctx.clearRect(0, 0, w, h);

        // Draw Main Circle
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(124, 138, 255, 0.1)';
        ctx.lineWidth = 2;
        ctx.stroke();

        seeds.forEach((seed, sIdx) => {
            const orbitColor = `hsl(${(sIdx * 90) % 360}, 70%, 65%)`;
            
            // Draw past points
            ctx.shadowBlur = iterations > 50 ? 0 : 10;
            ctx.shadowColor = orbitColor;

            for (let i = 0; i < iterations; i++) {
                const theta = 2 * Math.PI * (seed + i * alpha) - Math.PI / 2;
                const x = centerX + Math.cos(theta) * radius;
                const y = centerY + Math.sin(theta) * radius;

                const size = iterations > 100 ? 2 : 4;
                const opacity = iterations > 200 ? Math.max(0.1, 1 - i / iterations) : 1;
                
                ctx.globalAlpha = opacity;
                ctx.fillStyle = orbitColor;
                ctx.beginPath();
                ctx.arc(x, y, size, 0, Math.PI * 2);
                ctx.fill();

                // Position Labels
                if (sIdx === 0 && labels[i]) {
                    const lx = labelCenterX + Math.cos(theta) * (labelRadius + labelOffset);
                    const ly = labelCenterY + Math.sin(theta) * (labelRadius + labelOffset);
                    labels[i].style.left = `${lx}px`;
                    labels[i].style.top = `${ly}px`;
                    labels[i].style.opacity = opacity;
                }
            }

            // Current animating point
            const currentThetaStart = 2 * Math.PI * (seed + (iterations - 1) * alpha) - Math.PI / 2;
            const currentThetaEnd = 2 * Math.PI * (seed + iterations * alpha) - Math.PI / 2;
            
            // Path
            if (iterations < 50) {
                ctx.beginPath();
                ctx.arc(centerX, centerY, radius, currentThetaStart, currentThetaStart + (currentThetaEnd - currentThetaStart) * progress);
                ctx.strokeStyle = orbitColor;
                ctx.lineWidth = 3;
                ctx.stroke();
            }

            // The moving dot
            const currentTheta = currentThetaStart + (currentThetaEnd - currentThetaStart) * progress;
            const mx = centerX + Math.cos(currentTheta) * radius;
            const my = centerY + Math.sin(currentTheta) * radius;

            ctx.globalAlpha = 1;
            ctx.fillStyle = '#fff';
            ctx.shadowBlur = 15;
            ctx.shadowColor = '#fff';
            ctx.beginPath();
            ctx.arc(mx, my, 6, 0, Math.PI * 2);
            ctx.fill();
            
            if (sIdx === 0 && labels[iterations]) {
                const lx = labelCenterX + Math.cos(currentTheta) * (labelRadius + labelOffset);
                const ly = labelCenterY + Math.sin(currentTheta) * (labelRadius + labelOffset);
                labels[iterations].style.left = `${lx}px`;
                labels[iterations].style.top = `${ly}px`;
                labels[iterations].style.opacity = 1;
            }
        });
    }

    drawParadox() {
        const { ctx, canvas, alpha } = this;
        const w = canvas.width / window.devicePixelRatio;
        const h = canvas.height / window.devicePixelRatio;
        const step = this.steps[this.currentStep];
        const phase = step.paradox; // which phase this step represents
        const t = this.ease(this.paradoxT);

        const N = this.paradoxOrbitN; // how many orbit points to show
        const circleRadius = Math.min(w, h) * 0.28;
        const circleCX = w / 2;
        const circleCY = h / 2 - 30;

        // Translated orbit cluster center (off to the right)
        const sideOffset = Math.min(w * 0.35, 300);
        const sideCX = circleCX + sideOffset;
        const sideCY = circleCY;

        ctx.clearRect(0, 0, w, h);
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;

        // Compute all orbit thetas
        const thetas = [];
        for (let i = 0; i < N; i++) {
            thetas.push(this.orbitTheta(i));
        }

        // --- Determine positions for each point based on phase ---
        const orbitPositions = []; // {x, y, onCircle, label, color, highlight}
        const dotColor = 'hsl(240, 70%, 65%)';
        const rotatedColor = 'hsl(160, 70%, 65%)';
        const x0Color = 'hsl(0, 80%, 65%)';

        if (phase === 'translate-out') {
            // Animate: circle positions → side cluster
            // Points on circle: lerp to side
            for (let i = 0; i < N; i++) {
                const theta = thetas[i];
                const onCircleX = circleCX + Math.cos(theta) * circleRadius;
                const onCircleY = circleCY + Math.sin(theta) * circleRadius;
                
                // Side: translate without shrinking
                const sideX = sideCX + Math.cos(theta) * circleRadius;
                const sideY = sideCY + Math.sin(theta) * circleRadius;

                const x = onCircleX + (sideX - onCircleX) * t;
                const y = onCircleY + (sideY - onCircleY) * t;
                
                orbitPositions.push({
                    x, y,
                    onCircle: 1 - t,
                    label: `x${i}`,
                    color: i === 0 ? x0Color : dotColor,
                    isX0: i === 0,
                    origIndex: i
                });
            }
        } else if (phase === 'rotate') {
            // Points are already on the side.
            // Animate rotation: smooth and clockwise
            for (let i = 0; i < N; i++) {
                const fromTheta = thetas[i];
                // In Canvas, positive angle increases clockwise
                const targetTheta = fromTheta + 2 * Math.PI * alpha;
                const currentTheta = fromTheta + (targetTheta - fromTheta) * t;
                
                const x = sideCX + Math.cos(currentTheta) * circleRadius;
                const y = sideCY + Math.sin(currentTheta) * circleRadius;

                // x_0 position is no longer filled by anyone — it "disappears"
                // After rotation, what was x_0 is now at the x_1 position
                // but mathematically, x_0 has lost its preimage
                orbitPositions.push({
                    x, y,
                    onCircle: 0,
                    label: i === 0 ? `x₀→x₁` : `x${i}→x${i+1}`,
                    color: i === 0 ? x0Color : rotatedColor,
                    isX0: i === 0,
                    origIndex: i,
                    // x_0 gets a special fade in the last portion to illustrate 
                    // that x_0's original slot is now empty
                    opacity: 1
                });
            }
        } else if (phase === 'translate-back') {
            // Post-rotation positions → back to circle
            // Each point x_i has been rotated to x_{i+1}'s theta
            // So point i now goes to theta of (i+1)
            // x_0's original position on the circle is unfilled
            for (let i = 0; i < N; i++) {
                const rotatedTheta = (i < N - 1) ? thetas[i + 1] : thetas[i] + 2 * Math.PI * alpha;
                const sideX = sideCX + Math.cos(rotatedTheta) * circleRadius;
                const sideY = sideCY + Math.sin(rotatedTheta) * circleRadius;

                // Target: back on circle at the ROTATED position
                const onCircleX = circleCX + Math.cos(rotatedTheta) * circleRadius;
                const onCircleY = circleCY + Math.sin(rotatedTheta) * circleRadius;

                const x = sideX + (onCircleX - sideX) * t;
                const y = sideY + (onCircleY - sideY) * t;

                orbitPositions.push({
                    x, y,
                    onCircle: t,
                    label: `x${i+1}`,
                    color: i === 0 ? x0Color : rotatedColor,
                    isX0: false,
                    origIndex: i
                });
            }
        }

        // --- Draw the circle (with gaps if orbit is removed) ---
        const showGaps = (phase === 'translate-out' && t > 0.1) || 
                          phase === 'rotate' || 
                          phase === 'translate-back';
        
        if (showGaps) {
            // Draw circle as a continuous ring but with visual "gap" markers
            // First draw full faint circle
            ctx.beginPath();
            ctx.arc(circleCX, circleCY, circleRadius, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(124, 138, 255, 0.06)';
            ctx.lineWidth = 2;
            ctx.stroke();

            // Draw gap markers at original orbit positions
            const gapOpacity = phase === 'translate-out' ? t : 
                              (phase === 'translate-back' ? 1 - t : 1);
            
            for (let i = 0; i < N; i++) {
                const theta = thetas[i];
                const gx = circleCX + Math.cos(theta) * circleRadius;
                const gy = circleCY + Math.sin(theta) * circleRadius;

                // Draw a small "x" or gap ring to mark the absence
                ctx.globalAlpha = gapOpacity * 0.6;
                ctx.strokeStyle = 'rgba(255, 100, 100, 0.5)';
                ctx.lineWidth = 1.5;
                const gapR = 5;
                ctx.beginPath();
                ctx.arc(gx, gy, gapR, 0, Math.PI * 2);
                ctx.stroke();
            }

            // If translate-back is done, mark x_0's gap prominently
            if (phase === 'translate-back' && t > 0.5) {
                const gx = circleCX + Math.cos(thetas[0]) * circleRadius;
                const gy = circleCY + Math.sin(thetas[0]) * circleRadius;
                const pulse = 0.5 + 0.5 * Math.sin(Date.now() * 0.005);
                
                ctx.globalAlpha = Math.min(1, (t - 0.5) * 2);
                
                // Pulsing ring
                ctx.strokeStyle = `rgba(255, 80, 80, ${0.6 + 0.4 * pulse})`;
                ctx.lineWidth = 2.5;
                ctx.beginPath();
                ctx.arc(gx, gy, 10 + 4 * pulse, 0, Math.PI * 2);
                ctx.stroke();

                // Cross mark
                ctx.strokeStyle = 'rgba(255, 80, 80, 0.9)';
                ctx.lineWidth = 2;
                const cr = 6;
                ctx.beginPath();
                ctx.moveTo(gx - cr, gy - cr);
                ctx.lineTo(gx + cr, gy + cr);
                ctx.moveTo(gx + cr, gy - cr);
                ctx.lineTo(gx - cr, gy + cr);
                ctx.stroke();

                // Missing label
                ctx.globalAlpha = Math.min(1, (t - 0.5) * 2);
                ctx.fillStyle = 'rgba(255, 80, 80, 0.9)';
                ctx.font = '600 14px Inter, sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'bottom';
                ctx.fillText('x₀ missing!', gx, gy - 18);
            }
        } else {
            // Normal circle
            ctx.beginPath();
            ctx.arc(circleCX, circleCY, circleRadius, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(124, 138, 255, 0.1)';
            ctx.lineWidth = 2;
            ctx.stroke();
        }

        // --- Draw the orbit points ---
        ctx.shadowBlur = 0;
        for (const pt of orbitPositions) {
            const opacity = pt.opacity !== undefined ? pt.opacity : 1;
            ctx.globalAlpha = opacity;
            ctx.fillStyle = pt.color;
            
            // Glow for important points
            if (pt.isX0) {
                ctx.shadowBlur = 15;
                ctx.shadowColor = x0Color;
            } else {
                ctx.shadowBlur = 6;
                ctx.shadowColor = pt.color;
            }
            
            const dotSize = pt.isX0 ? 6 : 4;
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, dotSize, 0, Math.PI * 2);
            ctx.fill();
        }

        // --- Draw labels for x_0 and a few other points ---
        ctx.shadowBlur = 0;
        const maxLabeled = Math.min(8, N);
        ctx.font = '500 12px Inter, sans-serif';
        ctx.textAlign = 'center';
        
        for (let i = 0; i < maxLabeled; i++) {
            const pt = orbitPositions[i];
            if (!pt) continue;
            ctx.globalAlpha = (pt.opacity !== undefined ? pt.opacity : 1) * 0.9;
            ctx.fillStyle = pt.color;
            
            // Label offset outward from center
            const dx = pt.x - (phase === 'translate-out' && t < 0.5 ? circleCX : 
                       (phase === 'translate-back' && t > 0.5 ? circleCX : sideCX));
            const dy = pt.y - (phase === 'translate-out' && t < 0.5 ? circleCY :
                       (phase === 'translate-back' && t > 0.5 ? circleCY : sideCY));
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            const labelDist = 18;
            const lx = pt.x + (dx / dist) * labelDist;
            const ly = pt.y + (dy / dist) * labelDist;

            let labelText;
            if (phase === 'rotate') {
                labelText = i === 0 ? 'x₀' : `x${this.subscript(i)}`;
            } else if (phase === 'translate-back') {
                labelText = `x${this.subscript(i + 1)}`;
            } else {
                labelText = `x${this.subscript(i)}`;
            }
            
            ctx.textBaseline = 'middle';
            ctx.fillText(labelText, lx, ly);
        }

        // --- Draw side panel frame when orbit is off to the side ---
        if (phase === 'translate-out' || phase === 'rotate') {
            const frameOpacity = phase === 'translate-out' ? t * 0.3 : 0.3;
            ctx.globalAlpha = frameOpacity;
            ctx.strokeStyle = 'rgba(124, 138, 255, 0.3)';
            ctx.lineWidth = 1;
            ctx.setLineDash([5, 5]);
            ctx.beginPath();
            ctx.arc(sideCX, sideCY, circleRadius + 15, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);

            // Title above the side cluster
            ctx.globalAlpha = frameOpacity * 2;
            ctx.fillStyle = 'rgba(200, 210, 255, 0.7)';
            ctx.font = '500 14px Inter, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            const title = phase === 'translate-out' ? 'Orbit 𝒪' : 'Applying ρ';
            ctx.fillText(title, sideCX, sideCY - (circleRadius + 15) - 12);
        }

        // --- Rotation arrow indicator during 'rotate' phase ---
        if (phase === 'rotate' && t > 0.05 && t < 0.95) {
            // Draw a clockwise arrow 
            ctx.globalAlpha = 0.5;
            ctx.strokeStyle = 'rgba(100, 230, 180, 0.6)';
            ctx.lineWidth = 2;
            const arrowR = circleRadius + 25;
            
            // Since rotation is clockwise, draw the arrow going clockwise
            const startAng = -Math.PI * 0.5; // Top
            const endAng = startAng + t * 2 * Math.PI * alpha; 
            
            ctx.beginPath();
            ctx.arc(sideCX, sideCY, arrowR, startAng, endAng);
            ctx.stroke();
            
            // Arrowhead at the leading (clockwise) edge
            const ax = sideCX + Math.cos(endAng) * arrowR;
            const ay = sideCY + Math.sin(endAng) * arrowR;
            const headLen = 8;
            ctx.fillStyle = 'rgba(100, 230, 180, 0.6)';
            ctx.beginPath();
            ctx.moveTo(ax, ay);
            ctx.lineTo(ax + Math.cos(endAng + Math.PI - 0.5) * headLen, ay + Math.sin(endAng + Math.PI - 0.5) * headLen);
            ctx.lineTo(ax + Math.cos(endAng + Math.PI + 0.5) * headLen, ay + Math.sin(endAng + Math.PI + 0.5) * headLen);
            ctx.closePath();
            ctx.fill();
        }

        ctx.globalAlpha = 1;
    }

    // Generate Unicode subscript digits
    subscript(n) {
        const digits = '₀₁₂₃₄₅₆₇₈₉';
        return String(n).split('').map(d => digits[parseInt(d)] || d).join('');
    }
}

// Initializing the visualizer
window.addEventListener('DOMContentLoaded', () => {
    window.rotationApp = new IrrationalRotation();
});
