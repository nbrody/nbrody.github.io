import * as Effects from './effects.js';

class JamBoardApp {
    constructor() {
        this.ctx = null;
        this.chain = null;
        this.effects = [];
        this.activeBank = 0;
        this.expressionValue = 0.5;
        this.initialized = false;
        this.isDraggingExp = false;

        this.initDOM();
        this.bindEvents();
        this.initMIDI();
    }

    initDOM() {
        this.pedalGrid = document.getElementById('pedal-grid');
        this.hwButtons = document.querySelectorAll('.hw-btn');
        this.expValueEl = document.getElementById('expression-value');
        this.startBtn = document.getElementById('start-btn');
        this.welcomeOverlay = document.getElementById('welcome-overlay');
        this.powerBtn = document.getElementById('power-btn');
        this.testToneBtn = document.getElementById('test-tone-btn');
        this.loopBtn = document.createElement('button');
        this.loopBtn.id = 'loop-btn';
        this.loopBtn.className = 'secondary-btn';
        this.loopBtn.textContent = 'GUITAR LOOP: LOADING...';
        document.querySelector('.header-actions').prepend(this.loopBtn);
    }

    async initAudio() {
        if (this.initialized) return;

        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.chain = new Effects.EffectChain(this.ctx);

        // Create 8 Pedals
        const effectClasses = [
            Effects.Distortion,
            Effects.Chorus,
            Effects.Delay,
            Effects.Reverb,
            Effects.Wah,
            Effects.Tremolo,
            Effects.Compressor,
            Effects.Filter
        ];

        effectClasses.forEach((EffClass, i) => {
            const effect = new EffClass(this.ctx);
            this.effects.push(effect);
            this.chain.addEffect(effect);
            this.createPedalUI(effect, i);
        });

        // Connect Chain to Destination
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = 1.0;
        this.chain.output.connect(this.masterGain);
        this.masterGain.connect(this.ctx.destination);

        // Setup Test Oscillator
        this.setupTestOsc();

        this.initialized = true;
        this.statusDot.classList.add('active');
        this.powerBtn.textContent = 'ENGINE ACTIVE';
        this.welcomeOverlay.classList.add('hidden');
        console.log('jamBoard Engine Initialized');
        this.startStateMonitor();
    }

    async setupTestOsc() {
        // We'll keep a simple sine as a backup
        this.osc = this.ctx.createOscillator();
        this.oscGain = this.ctx.createGain();
        this.osc.type = 'sine';
        this.osc.frequency.value = 440;
        this.oscGain.gain.value = 0.0;
        this.osc.connect(this.oscGain);
        this.oscGain.connect(this.chain.input);
        this.osc.start();

        // Guitar Loop Setup
        this.guitarBuffer = null;
        this.guitarSource = null;
        this.guitarGain = this.ctx.createGain();
        this.guitarGain.gain.value = 0.0;
        this.guitarGain.connect(this.chain.input);

        const loopUrl = 'https://mdn.github.io/webaudio-examples/audio-analyser/viper.mp3';
        try {
            const response = await fetch(loopUrl);
            const arrayBuffer = await response.arrayBuffer();
            this.guitarBuffer = await this.ctx.decodeAudioData(arrayBuffer);
            this.loopBtn.textContent = 'GUITAR LOOP: OFF';
            console.log('Guitar loop loaded');
        } catch (e) {
            this.loopBtn.textContent = 'LOOP ERROR';
            console.error('Failed to load guitar loop', e);
        }
    }

    toggleGuitarLoop() {
        if (!this.initialized) {
            this.initAudio();
            return;
        }
        if (!this.guitarBuffer) return;

        this.loopActive = !this.loopActive;

        if (this.loopActive) {
            this.guitarSource = this.ctx.createBufferSource();
            this.guitarSource.buffer = this.guitarBuffer;
            this.guitarSource.loop = true;
            this.guitarSource.connect(this.guitarGain);
            this.guitarGain.gain.setTargetAtTime(0.6, this.ctx.currentTime, 0.05);
            this.guitarSource.start(0);
            this.loopBtn.textContent = 'GUITAR LOOP: ON';
            this.loopBtn.classList.add('active');
        } else {
            if (this.guitarSource) {
                this.guitarGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
                setTimeout(() => {
                    if (this.guitarSource) this.guitarSource.stop();
                }, 100);
            }
            this.loopBtn.textContent = 'GUITAR LOOP: OFF';
            this.loopBtn.classList.remove('active');
        }
    }

    createPedalUI(effect, index) {
        const pedal = document.createElement('div');
        pedal.className = 'pedal';
        pedal.style.setProperty('--pedal-active-color', `var(--pedal-color-${index + 1})`);
        pedal.id = `pedal-${index}`;

        pedal.innerHTML = `
            <div class="pedal-header">
                <span class="pedal-name">${effect.name}</span>
                <div class="pedal-led"></div>
            </div>
            <div class="pedal-controls">
                <div class="knob-container">
                    <div class="knob" data-param="gain"><div class="knob-pointer"></div></div>
                    <span class="knob-label">Gain</span>
                </div>
                <div class="knob-container">
                    <div class="knob" data-param="mix"><div class="knob-pointer"></div></div>
                    <span class="knob-label">Mix</span>
                </div>
            </div>
        `;

        pedal.addEventListener('click', () => this.toggleEffect(index));
        this.pedalGrid.appendChild(pedal);
    }

    toggleEffect(index) {
        if (!this.initialized) return;
        const effect = this.effects[index];
        const isActive = effect.toggle();

        const pedalEl = document.getElementById(`pedal-${index}`);
        const hwBtn = document.querySelector(`.hw-btn[data-btn="${index + 1}"]`);

        if (isActive) {
            pedalEl.classList.add('active');
            hwBtn.classList.add('active');
        } else {
            pedalEl.classList.remove('active');
            hwBtn.classList.remove('active');
        }

        // Pulse the LED on hardware
        this.vibrate(50);
    }

    setExpression(val) {
        this.expressionValue = Math.max(0, Math.min(1, val));
        this.expValueEl.style.height = `${this.expressionValue * 100}%`;

        // Route expression to Wah if active
        const wahSlot = this.effects.find(e => e.name === 'Wah');
        if (wahSlot) {
            wahSlot.setFrequency(this.expressionValue);
        }

        // Map to some other parameters for fun
        if (this.osc) {
            this.osc.frequency.setTargetAtTime(110 + (this.expressionValue * 440), this.ctx.currentTime, 0.05);
        }
    }

    async initMIDI() {
        if (!navigator.requestMIDIAccess) {
            console.log('Web MIDI not supported');
            return;
        }

        try {
            const midi = await navigator.requestMIDIAccess();
            const inputs = midi.inputs.values();
            for (let input of inputs) {
                input.onmidimessage = (msg) => this.handleMIDIMessage(msg);
            }
        } catch (err) {
            console.error('MIDI Access Failed', err);
        }
    }

    handleMIDIMessage(msg) {
        const [status, data1, data2] = msg.data;
        const type = status & 0xf0;

        // Note On or CC
        if (type === 144 && data2 > 0) { // Note On
            const btnIdx = data1 % 10;
            if (btnIdx < 8) this.toggleEffect(btnIdx);
            else this.pulseHwBtn(btnIdx);
        } else if (type === 176) { // CC (Control Change)
            // Common Expression CC is 11 or 1
            if (data1 === 11 || data1 === 1) {
                this.setExpression(data2 / 127);
            }
        }
    }

    bindEvents() {
        this.startBtn.addEventListener('click', () => this.initAudio());
        this.powerBtn.addEventListener('click', () => this.initAudio());
        this.testToneBtn.addEventListener('click', () => this.toggleTestTone());
        this.loopBtn.addEventListener('click', () => this.toggleGuitarLoop());

        // Keyboard mappings
        window.addEventListener('keydown', (e) => {
            const key = e.key;
            if (key === ' ') e.preventDefault(); // Prevent scrolling

            if (key >= '1' && key <= '8') {
                this.toggleEffect(parseInt(key) - 1);
            }
            if (key === '9') this.pulseHwBtn(8);
            if (key === '0') this.pulseHwBtn(9);

            // Test Sound (Now triggers Guitar Loop if not initialized)
            if (key === ' ') {
                if (!this.initialized) {
                    this.initAudio();
                    return;
                }
                if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();

                // If guitar loop is loaded but not playing, start it on space down
                if (this.guitarBuffer && !this.loopActive) {
                    this.guitarGain.gain.setTargetAtTime(0.6, this.ctx.currentTime, 0.05);
                    if (!this.spaceBarPlaying) {
                        this.guitarSource = this.ctx.createBufferSource();
                        this.guitarSource.buffer = this.guitarBuffer;
                        this.guitarSource.loop = true;
                        this.guitarSource.connect(this.guitarGain);
                        this.guitarSource.start(0);
                        this.spaceBarPlaying = true;
                    }
                } else if (!this.guitarBuffer) {
                    // Fallback to sine if loop failed
                    this.oscGain.gain.setTargetAtTime(0.3, this.ctx.currentTime, 0.05);
                }
            }
        });

        window.addEventListener('keyup', (e) => {
            if (e.key === ' ') {
                e.preventDefault();
                if (this.guitarGain) {
                    this.guitarGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
                    setTimeout(() => {
                        if (this.guitarSource && this.spaceBarPlaying) {
                            this.guitarSource.stop();
                            this.spaceBarPlaying = false;
                        }
                    }, 150);
                }
                if (this.oscGain) {
                    this.oscGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
                }
            }
        });

        // Mouse/Touch Expression Control
        window.addEventListener('wheel', (e) => {
            this.setExpression(this.expressionValue - e.deltaY * 0.001);
        }, { passive: true });

        // Draggable Expression Pedal
        const expContainer = document.querySelector('.expression-pedal-container');
        const handleDrag = (e) => {
            if (!this.isDraggingExp) return;
            const rect = expContainer.getBoundingClientRect();
            const y = e.touches ? e.touches[0].clientY : e.clientY;
            const val = 1 - ((y - rect.top) / rect.height);
            this.setExpression(val);
        };

        expContainer.addEventListener('mousedown', () => this.isDraggingExp = true);
        expContainer.addEventListener('touchstart', (e) => {
            this.isDraggingExp = true;
            handleDrag(e);
        }, { passive: false });

        window.addEventListener('mousemove', handleDrag);
        window.addEventListener('touchmove', handleDrag, { passive: false });
        window.addEventListener('mouseup', () => this.isDraggingExp = false);
        window.addEventListener('touchend', () => this.isDraggingExp = false);

        // Hardware Button UI feedback
        this.hwButtons.forEach((btn, i) => {
            btn.addEventListener('click', () => {
                if (i < 8) this.toggleEffect(i);
                else this.pulseHwBtn(i);
            });
        });
    }

    toggleTestTone() {
        if (!this.initialized) {
            this.initAudio();
            return;
        }

        this.testToneActive = !this.testToneActive;
        if (this.testToneActive) {
            this.oscGain.gain.setTargetAtTime(0.3, this.ctx.currentTime, 0.05);
            this.testToneBtn.textContent = 'TEST TONE: ON';
            this.testToneBtn.classList.add('active');
        } else {
            this.oscGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
            this.testToneBtn.textContent = 'TEST TONE: OFF';
            this.testToneBtn.classList.remove('active');
        }
    }

    startStateMonitor() {
        const cpuEl = document.querySelector('.cpu-usage');
        setInterval(() => {
            if (this.ctx) {
                cpuEl.textContent = `STATE: ${this.ctx.state.toUpperCase()}`;
                if (this.ctx.state === 'running') {
                    this.statusDot.classList.add('active');
                } else {
                    this.statusDot.classList.remove('active');
                }
            }
        }, 1000);
    }

    pulseHwBtn(index) {
        const btn = this.hwButtons[index];
        btn.classList.add('active');
        setTimeout(() => btn.classList.remove('active'), 200);
        this.vibrate(20);
    }

    vibrate(ms) {
        if ("vibrate" in navigator) {
            navigator.vibrate(ms);
        }
    }
}

// Start the app
const app = new JamBoardApp();
window.app = app; // For debugging
