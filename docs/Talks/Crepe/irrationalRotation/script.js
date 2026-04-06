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
            this.isPlaying = !this.isPlaying;
            this.elements.playBtn.textContent = this.isPlaying ? '⏸' : '▶';
        };

        this.elements.stepBtn.onclick = () => {
            if (this.progress > 0) return; // Wait for current
            this.isPlaying = false;
            this.elements.playBtn.textContent = '▶';
            this.doStep();
        };

        this.elements.resetBtn.onclick = () => {
            this.iterations = 1;
            this.progress = 0;
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
        this.canvas.width = window.innerWidth * window.devicePixelRatio;
        this.canvas.height = window.innerHeight * window.devicePixelRatio;
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
        this.elements.playBtn.textContent = '▶';
        
        this.elements.iterSlider.max = step.maxIter || 1000;

        if (step.showMultipleOrbits) {
            this.seeds = [0, 0.1, 0.2, 0.3];
        } else {
            this.seeds = [0];
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

    animate(timestamp) {
        const dt = timestamp - this.lastTimestamp;
        this.lastTimestamp = timestamp;

        if (this.isPlaying || this.progress > 0) {
            this.progress += this.animSpeed * dt;
            if (this.progress >= 1) {
                this.progress = 0;
                this.iterations++;
                
                const step = this.steps[this.currentStep];
                if (this.iterations > (step.maxIter || 1000)) {
                    this.isPlaying = false;
                    this.elements.playBtn.textContent = '▶';
                }
                this.updateDisplay();
                this.updateLabels();
            }
        }

        this.draw();
        requestAnimationFrame((t) => this.animate(t));
    }

    updateLabels() {
        const maxVisible = 25;
        this.overlay.innerHTML = '';
        this.labels = [];

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

    draw() {
        const { ctx, canvas, iterations, alpha, seeds, progress, labels } = this;
        const w = canvas.width / window.devicePixelRatio;
        const h = canvas.height / window.devicePixelRatio;
        const centerX = w / 2;
        const centerY = h / 2 - 40;
        const radius = Math.min(w, h) * 0.32;

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
                    const lx = centerX + Math.cos(theta) * (radius + 28);
                    const ly = centerY + Math.sin(theta) * (radius + 28);
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
                const lx = centerX + Math.cos(currentTheta) * (radius + 28);
                const ly = centerY + Math.sin(currentTheta) * (radius + 28);
                labels[iterations].style.left = `${lx}px`;
                labels[iterations].style.top = `${ly}px`;
                labels[iterations].style.opacity = 1;
            }
        });
    }
}

// Initializing the visualizer
window.addEventListener('DOMContentLoaded', () => {
    window.rotationApp = new IrrationalRotation();
});
