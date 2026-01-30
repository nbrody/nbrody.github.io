/**
 * Mobile Controls for Math World
 * Virtual joystick for movement, touch-to-look for camera control
 * Touch buttons for jump/fly, interact, and atlas
 */

export class MobileControls {
    constructor(player, mathWorld) {
        this.player = player;
        this.mathWorld = mathWorld;
        this.enabled = false;

        // Check if touch device
        this.isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

        // Joystick state
        this.joystick = {
            active: false,
            startX: 0,
            startY: 0,
            currentX: 0,
            currentY: 0,
            radius: 50,
            maxRadius: 80
        };

        // Look state (right side of screen)
        this.look = {
            active: false,
            startX: 0,
            startY: 0,
            sensitivity: 0.003
        };

        // Touch IDs to distinguish joystick from look
        this.joystickTouchId = null;
        this.lookTouchId = null;

        // Direction output (normalized -1 to 1)
        this.moveX = 0;  // Left/Right (A/D)
        this.moveZ = 0;  // Forward/Back (W/S)

        // Action buttons
        this.jumpHeld = false;
        this.interactPressed = false;

        // Create UI if touch device
        if (this.isTouchDevice) {
            this.createUI();
            this.setupTouchListeners();
        }
    }

    createUI() {
        // Container for all mobile controls
        this.container = document.createElement('div');
        this.container.id = 'mobile-controls';
        this.container.innerHTML = `
            <style>
                #mobile-controls {
                    position: fixed;
                    inset: 0;
                    pointer-events: none;
                    z-index: 100;
                    display: none;
                }
                #mobile-controls.active {
                    display: block;
                }
                
                /* Joystick zone - left third of screen */
                #joystick-zone {
                    position: absolute;
                    left: 0;
                    bottom: 0;
                    width: 40%;
                    height: 50%;
                    pointer-events: auto;
                    touch-action: none;
                }
                
                #joystick-base {
                    position: absolute;
                    left: 30px;
                    bottom: 30px;
                    width: 120px;
                    height: 120px;
                    background: rgba(255, 255, 255, 0.15);
                    border: 2px solid rgba(255, 255, 255, 0.3);
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    backdrop-filter: blur(8px);
                }
                
                #joystick-knob {
                    width: 50px;
                    height: 50px;
                    background: rgba(255, 255, 255, 0.5);
                    border: 2px solid rgba(255, 255, 255, 0.7);
                    border-radius: 50%;
                    transition: transform 0.05s ease-out;
                }
                
                /* Look zone - right side of screen */
                #look-zone {
                    position: absolute;
                    right: 0;
                    top: 0;
                    width: 60%;
                    height: 70%;
                    pointer-events: auto;
                    touch-action: none;
                }
                
                /* Action buttons - right side bottom */
                #action-buttons {
                    position: absolute;
                    right: 20px;
                    bottom: 20px;
                    display: flex;
                    flex-direction: column;
                    gap: 15px;
                    pointer-events: auto;
                }
                
                .action-btn {
                    width: 60px;
                    height: 60px;
                    background: rgba(255, 255, 255, 0.2);
                    border: 2px solid rgba(255, 255, 255, 0.4);
                    border-radius: 50%;
                    color: white;
                    font-size: 20px;
                    font-weight: bold;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    backdrop-filter: blur(8px);
                    user-select: none;
                    touch-action: manipulation;
                }
                
                .action-btn:active, .action-btn.active {
                    background: rgba(255, 255, 255, 0.4);
                    transform: scale(0.95);
                }
                
                #btn-jump {
                    font-size: 24px;
                }
                
                /* Top action bar - left side */
                #top-actions {
                    position: absolute;
                    left: 20px;
                    top: 60px;
                    display: flex;
                    gap: 10px;
                    pointer-events: auto;
                }
                
                .top-btn {
                    width: 50px;
                    height: 50px;
                    background: rgba(0, 0, 0, 0.3);
                    border: 2px solid rgba(255, 255, 255, 0.3);
                    border-radius: 12px;
                    color: white;
                    font-size: 22px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    backdrop-filter: blur(8px);
                    user-select: none;
                    touch-action: manipulation;
                }
                
                .top-btn:active {
                    background: rgba(0, 0, 0, 0.5);
                }
            </style>
            
            <!-- Joystick zone -->
            <div id="joystick-zone">
                <div id="joystick-base">
                    <div id="joystick-knob"></div>
                </div>
            </div>
            
            <!-- Look zone -->
            <div id="look-zone"></div>
            
            <!-- Action buttons -->
            <div id="action-buttons">
                <button class="action-btn" id="btn-interact">E</button>
                <button class="action-btn" id="btn-jump">↑</button>
            </div>
            
            <!-- Top action bar -->
            <div id="top-actions">
                <button class="top-btn" id="btn-atlas">🗺️</button>
                <button class="top-btn" id="btn-help">?</button>
            </div>
        `;

        document.body.appendChild(this.container);

        // Cache DOM elements
        this.joystickZone = document.getElementById('joystick-zone');
        this.joystickBase = document.getElementById('joystick-base');
        this.joystickKnob = document.getElementById('joystick-knob');
        this.lookZone = document.getElementById('look-zone');
        this.btnJump = document.getElementById('btn-jump');
        this.btnInteract = document.getElementById('btn-interact');
        this.btnAtlas = document.getElementById('btn-atlas');
        this.btnHelp = document.getElementById('btn-help');
    }

    setupTouchListeners() {
        // Joystick touch events
        this.joystickZone.addEventListener('touchstart', (e) => this.onJoystickStart(e), { passive: false });
        this.joystickZone.addEventListener('touchmove', (e) => this.onJoystickMove(e), { passive: false });
        this.joystickZone.addEventListener('touchend', (e) => this.onJoystickEnd(e));
        this.joystickZone.addEventListener('touchcancel', (e) => this.onJoystickEnd(e));

        // Look touch events
        this.lookZone.addEventListener('touchstart', (e) => this.onLookStart(e), { passive: false });
        this.lookZone.addEventListener('touchmove', (e) => this.onLookMove(e), { passive: false });
        this.lookZone.addEventListener('touchend', (e) => this.onLookEnd(e));
        this.lookZone.addEventListener('touchcancel', (e) => this.onLookEnd(e));

        // Jump button (hold to fly up)
        this.btnJump.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.jumpHeld = true;
            this.btnJump.classList.add('active');
        });
        this.btnJump.addEventListener('touchend', () => {
            this.jumpHeld = false;
            this.btnJump.classList.remove('active');
        });
        this.btnJump.addEventListener('touchcancel', () => {
            this.jumpHeld = false;
            this.btnJump.classList.remove('active');
        });

        // Interact button
        this.btnInteract.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.interactPressed = true;
            this.btnInteract.classList.add('active');
            // Trigger interact on player
            if (this.player && this.player.tryInteract) {
                this.player.tryInteract();
            }
        });
        this.btnInteract.addEventListener('touchend', () => {
            this.interactPressed = false;
            this.btnInteract.classList.remove('active');
        });

        // Atlas button
        this.btnAtlas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            if (this.mathWorld && this.mathWorld.atlas) {
                this.mathWorld.atlas.toggle();
            }
        });

        // Help button
        this.btnHelp.addEventListener('touchstart', (e) => {
            e.preventDefault();
            const hint = document.getElementById('controls-hint');
            if (hint) hint.classList.toggle('hidden');
        });
    }

    onJoystickStart(e) {
        e.preventDefault();
        if (this.joystickTouchId !== null) return;

        const touch = e.changedTouches[0];
        this.joystickTouchId = touch.identifier;
        this.joystick.active = true;

        // Get center of joystick base
        const rect = this.joystickBase.getBoundingClientRect();
        this.joystick.startX = rect.left + rect.width / 2;
        this.joystick.startY = rect.top + rect.height / 2;
        this.joystick.currentX = touch.clientX;
        this.joystick.currentY = touch.clientY;

        this.updateJoystick();
    }

    onJoystickMove(e) {
        e.preventDefault();
        if (!this.joystick.active) return;

        for (const touch of e.changedTouches) {
            if (touch.identifier === this.joystickTouchId) {
                this.joystick.currentX = touch.clientX;
                this.joystick.currentY = touch.clientY;
                this.updateJoystick();
                break;
            }
        }
    }

    onJoystickEnd(e) {
        for (const touch of e.changedTouches) {
            if (touch.identifier === this.joystickTouchId) {
                this.joystick.active = false;
                this.joystickTouchId = null;
                this.moveX = 0;
                this.moveZ = 0;
                this.joystickKnob.style.transform = 'translate(0, 0)';
                break;
            }
        }
    }

    updateJoystick() {
        // Calculate offset from center
        let dx = this.joystick.currentX - this.joystick.startX;
        let dy = this.joystick.currentY - this.joystick.startY;

        // Clamp to max radius
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > this.joystick.maxRadius) {
            dx = (dx / dist) * this.joystick.maxRadius;
            dy = (dy / dist) * this.joystick.maxRadius;
        }

        // Update knob position
        this.joystickKnob.style.transform = `translate(${dx}px, ${dy}px)`;

        // Normalize to -1 to 1
        this.moveX = dx / this.joystick.maxRadius;  // Left/Right
        this.moveZ = -dy / this.joystick.maxRadius; // Forward/Back (Y is inverted)
    }

    onLookStart(e) {
        e.preventDefault();
        if (this.lookTouchId !== null) return;

        const touch = e.changedTouches[0];
        this.lookTouchId = touch.identifier;
        this.look.active = true;
        this.look.startX = touch.clientX;
        this.look.startY = touch.clientY;
    }

    onLookMove(e) {
        e.preventDefault();
        if (!this.look.active) return;

        for (const touch of e.changedTouches) {
            if (touch.identifier === this.lookTouchId) {
                const dx = touch.clientX - this.look.startX;
                const dy = touch.clientY - this.look.startY;

                // Apply look rotation to player
                if (this.player) {
                    this.player.handleMobileLook(dx * this.look.sensitivity, dy * this.look.sensitivity);
                }

                // Reset start position for continuous movement
                this.look.startX = touch.clientX;
                this.look.startY = touch.clientY;
                break;
            }
        }
    }

    onLookEnd(e) {
        for (const touch of e.changedTouches) {
            if (touch.identifier === this.lookTouchId) {
                this.look.active = false;
                this.lookTouchId = null;
                break;
            }
        }
    }

    enable() {
        if (!this.isTouchDevice) return;
        this.enabled = true;
        this.container.classList.add('active');
    }

    disable() {
        if (!this.isTouchDevice) return;
        this.enabled = false;
        this.container.classList.remove('active');
    }

    // Get movement input for player update
    getMovement() {
        return {
            x: this.moveX,
            z: this.moveZ,
            jump: this.jumpHeld
        };
    }

    isTouch() {
        return this.isTouchDevice;
    }
}
