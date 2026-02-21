// ============================================================
//  sonic.js  –  Sonic character physics, state machine & rendering
// ============================================================
const Sonic = (() => {
    const TWO_PI = Math.PI * 2;

    // ─── Physics constants ───
    const ACCEL = 0.08;
    const DECEL = 0.12;
    const FRICTION = 0.04;
    const TOP_SPEED = 8;
    const JUMP_FORCE = -11;
    const GRAVITY = 0.38;
    const MAX_FALL = 12;
    const AIR_ACCEL = 0.06;
    const ROLL_DECEL = 0.02;
    const SPINDASH_BASE = 8;
    const SPINDASH_MAX = 14;

    const WIDTH = 20;
    const HEIGHT = 34;

    // States: idle, running, jumping, rolling, spindash, hurt, dead
    function createSonic(x, y) {
        return {
            x, y,
            vx: 0, vy: 0,
            width: WIDTH, height: HEIGHT,
            grounded: false,
            state: 'idle',
            facing: 1, // 1 = right, -1 = left
            animFrame: 0,
            animTimer: 0,
            spinDashCharge: 0,
            invincibleTimer: 0,
            hurtTimer: 0,
            spinAngle: 0,
            idleTimer: 0,
            lookUpTimer: 0,
            peelOutTimer: 0,
            // For keeping track of speed-lines effect
            speedTrail: [],
        };
    }

    function update(s, input, segments, platforms, dt) {
        if (s.state === 'dead') {
            s.vy += GRAVITY;
            s.y += s.vy;
            return;
        }

        if (s.hurtTimer > 0) {
            s.hurtTimer--;
            if (s.hurtTimer <= 0) s.state = 'idle';
        }
        if (s.invincibleTimer > 0) s.invincibleTimer--;

        s.animTimer++;

        // ─── STATE MACHINE ───
        switch (s.state) {
            case 'idle':
            case 'running':
                handleGroundMovement(s, input, segments, platforms);
                break;
            case 'jumping':
                handleAirMovement(s, input, segments, platforms);
                break;
            case 'rolling':
                handleRolling(s, input, segments, platforms);
                break;
            case 'spindash':
                handleSpinDash(s, input, segments, platforms);
                break;
            case 'hurt':
                handleHurt(s, input, segments, platforms);
                break;
        }

        // Speed trail
        if (Math.abs(s.vx) > 5) {
            s.speedTrail.push({ x: s.x, y: s.y + s.height * 0.5, life: 8 });
        }
        for (let i = s.speedTrail.length - 1; i >= 0; i--) {
            s.speedTrail[i].life--;
            if (s.speedTrail[i].life <= 0) s.speedTrail.splice(i, 1);
        }
    }

    function handleGroundMovement(s, input, segments, platforms) {
        // Acceleration / deceleration
        if (input.left) {
            s.facing = -1;
            if (s.vx > 0) {
                s.vx -= DECEL; // skid
            } else {
                s.vx = Math.max(s.vx - ACCEL, -TOP_SPEED);
            }
        } else if (input.right) {
            s.facing = 1;
            if (s.vx < 0) {
                s.vx += DECEL; // skid
            } else {
                s.vx = Math.min(s.vx + ACCEL, TOP_SPEED);
            }
        } else {
            // friction
            if (Math.abs(s.vx) < FRICTION) s.vx = 0;
            else s.vx -= Math.sign(s.vx) * FRICTION;
        }

        // State
        if (Math.abs(s.vx) > 0.1) {
            s.state = 'running';
            s.idleTimer = 0;
        } else {
            s.state = 'idle';
            s.idleTimer++;
        }

        // Animation speed
        if (s.state === 'running') {
            const speed = Math.abs(s.vx);
            s.animFrame = Math.floor(s.animTimer / Math.max(2, 10 - speed)) % 8;
        }

        // Jump
        if (input.jumpPressed && s.grounded) {
            s.vy = JUMP_FORCE;
            s.grounded = false;
            s.state = 'jumping';
            AudioManager.jump();
            return;
        }

        // Roll / Spin dash
        if (input.down && s.grounded) {
            if (Math.abs(s.vx) > 1) {
                s.state = 'rolling';
                AudioManager.spinDash();
            } else {
                s.state = 'spindash';
                s.spinDashCharge = 0;
            }
        }

        applyPhysics(s, segments, platforms);
    }

    function handleAirMovement(s, input, segments, platforms) {
        // Air control
        if (input.left) {
            s.vx = Math.max(s.vx - AIR_ACCEL, -TOP_SPEED);
            s.facing = -1;
        } else if (input.right) {
            s.vx = Math.min(s.vx + AIR_ACCEL, TOP_SPEED);
            s.facing = 1;
        }

        // Variable jump height
        if (!input.jump && s.vy < -3) {
            s.vy = -3;
        }

        s.spinAngle += 0.3;

        applyPhysics(s, segments, platforms);

        if (s.grounded) {
            s.state = Math.abs(s.vx) > 0.5 ? 'running' : 'idle';
        }
    }

    function handleRolling(s, input, segments, platforms) {
        // Slower deceleration while rolling
        if (Math.abs(s.vx) < 0.5) {
            s.state = 'idle';
            s.vx = 0;
            return;
        }

        s.vx -= Math.sign(s.vx) * ROLL_DECEL;
        s.spinAngle += 0.3 * Math.sign(s.vx);

        // Jump out of roll
        if (input.jumpPressed && s.grounded) {
            s.vy = JUMP_FORCE;
            s.grounded = false;
            s.state = 'jumping';
            AudioManager.jump();
            return;
        }

        applyPhysics(s, segments, platforms);
    }

    function handleSpinDash(s, input, segments, platforms) {
        if (input.down) {
            // Charging
            if (input.jumpPressed) {
                s.spinDashCharge = Math.min(s.spinDashCharge + 2, SPINDASH_MAX - SPINDASH_BASE);
                AudioManager.spindashCharge();
            }
            s.spinAngle += 0.4;
            applyPhysics(s, segments, platforms);
        } else {
            // Release
            s.vx = s.facing * (SPINDASH_BASE + s.spinDashCharge);
            s.state = 'rolling';
            AudioManager.spinDash();
        }
    }

    function handleHurt(s, input, segments, platforms) {
        // Knockback
        applyPhysics(s, segments, platforms);
        if (s.grounded && s.hurtTimer < 20) {
            s.vx *= 0.5;
            if (Math.abs(s.vx) < 0.5) {
                s.vx = 0;
                s.state = 'idle';
                s.hurtTimer = 0;
            }
        }
    }

    function applyPhysics(s, segments, platforms) {
        // Gravity
        if (!s.grounded) {
            s.vy = Math.min(s.vy + GRAVITY, MAX_FALL);
        }

        // Horizontal movement
        s.x += s.vx;

        // Wall collision
        const wall = Level.checkWallCollision(s.x, s.y, s.height, s.width, segments, platforms);
        if (wall) {
            s.x = wall.pushX;
            s.vx = 0;
        }

        // Vertical movement
        s.y += s.vy;

        // Ground collision
        const ground = Level.resolveGround(s.x + s.width / 2, s.y, s.height, segments, platforms);
        if (ground !== null && s.vy >= 0) {
            if (s.y + s.height >= ground) {
                s.y = ground - s.height;
                s.vy = 0;
                s.grounded = true;
            }
        } else {
            s.grounded = false;
        }

        // Ceiling collision
        if (s.vy < 0) {
            const ceil = Level.checkCeiling(s.x + s.width / 2, s.y, s.width, segments, platforms);
            if (ceil !== null) {
                s.y = ceil;
                s.vy = 0;
            }
        }

        // Fell off bottom (no ground below)
        if (s.vy > 0 && ground === null && s.grounded) {
            s.grounded = false;
        }

        // Keep Sonic in bounds (left)
        if (s.x < 0) { s.x = 0; s.vx = 0; }
    }

    // ─── RENDERING ───
    function draw(ctx, s, camX, camY, time) {
        const sx = s.x - camX;
        const sy = s.y - camY;

        // Speed trail
        if (s.speedTrail.length > 0) {
            s.speedTrail.forEach(t => {
                const tx = t.x - camX;
                const ty = t.y - camY;
                ctx.fillStyle = `rgba(30, 90, 255, ${t.life / 10})`;
                ctx.beginPath();
                ctx.arc(tx, ty, 4 + (8 - t.life) * 0.5, 0, TWO_PI);
                ctx.fill();
            });
        }

        // Invincibility flash
        if (s.invincibleTimer > 0 && Math.floor(s.invincibleTimer / 3) % 2 === 0) return;

        ctx.save();
        ctx.translate(sx + s.width / 2, sy + s.height / 2);

        if (s.state === 'jumping' || s.state === 'rolling' || s.state === 'spindash') {
            ctx.rotate(s.spinAngle * s.facing);
            drawSonicBall(ctx, s);
        } else if (s.state === 'hurt') {
            ctx.rotate(Math.sin(time * 0.02) * 0.3);
            drawSonicStanding(ctx, s, time);
        } else {
            drawSonicStanding(ctx, s, time);
        }

        ctx.restore();
    }

    function drawSonicBall(ctx, s) {
        // Spin ball
        const r = 14;

        // Blue body
        ctx.fillStyle = '#1565C0';
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, TWO_PI);
        ctx.fill();

        // Darker blue outline
        ctx.strokeStyle = '#0D47A1';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Spines (rotating)
        ctx.fillStyle = '#1565C0';
        for (let i = 0; i < 5; i++) {
            const a = (i / 5) * TWO_PI;
            const spineX = Math.cos(a) * r;
            const spineY = Math.sin(a) * r;
            ctx.beginPath();
            ctx.moveTo(spineX, spineY);
            ctx.lineTo(Math.cos(a + 0.3) * (r + 6), Math.sin(a + 0.3) * (r + 6));
            ctx.lineTo(Math.cos(a - 0.3) * (r + 2), Math.sin(a - 0.3) * (r + 2));
            ctx.fill();
        }

        // Red shoes blur
        ctx.fillStyle = '#E53935';
        ctx.beginPath();
        ctx.arc(0, r * 0.5, 4, 0, TWO_PI);
        ctx.fill();
    }

    function drawSonicStanding(ctx, s, time) {
        const f = s.facing;
        const speed = Math.abs(s.vx);
        const bob = s.state === 'running' ? Math.sin(s.animTimer * 0.3 * Math.max(1, speed * 0.5)) * 2 : 0;

        // ─── Legs ───
        if (s.state === 'running' && speed > 0.5) {
            const legPhase = s.animTimer * 0.25 * Math.max(1, speed * 0.3);
            // Running legs
            for (let leg = 0; leg < 2; leg++) {
                const phase = legPhase + leg * Math.PI;
                const legX = Math.sin(phase) * 6 * f;
                const legY = 8 + Math.abs(Math.cos(phase)) * 4;

                // Leg
                ctx.fillStyle = '#1565C0';
                ctx.beginPath();
                ctx.ellipse(legX, legY, 4, 5, 0, 0, TWO_PI);
                ctx.fill();

                // Shoe
                ctx.fillStyle = '#E53935';
                ctx.beginPath();
                ctx.ellipse(legX + f * 3, legY + 4, 6, 3, 0, 0, TWO_PI);
                ctx.fill();
                // White stripe
                ctx.fillStyle = '#FFF';
                ctx.fillRect(legX + f * 1, legY + 2, 4, 1.5);
                // Sole
                ctx.fillStyle = '#BDBDBD';
                ctx.beginPath();
                ctx.ellipse(legX + f * 3, legY + 6.5, 5, 1.5, 0, 0, TWO_PI);
                ctx.fill();
            }
        } else {
            // Standing legs
            for (let dx = -3; dx <= 3; dx += 6) {
                ctx.fillStyle = '#1565C0';
                ctx.beginPath();
                ctx.ellipse(dx, 10, 4, 5, 0, 0, TWO_PI);
                ctx.fill();
                // Shoe
                ctx.fillStyle = '#E53935';
                ctx.beginPath();
                ctx.ellipse(dx + f * 2, 15, 6, 3, 0, 0, TWO_PI);
                ctx.fill();
                ctx.fillStyle = '#FFF';
                ctx.fillRect(dx, 13, 4, 1.5);
                ctx.fillStyle = '#BDBDBD';
                ctx.beginPath();
                ctx.ellipse(dx + f * 2, 17, 5, 1.5, 0, 0, TWO_PI);
                ctx.fill();
            }
        }

        // ─── Body ───
        ctx.fillStyle = '#1565C0';
        ctx.beginPath();
        ctx.ellipse(0, -2 + bob, 10, 12, 0, 0, TWO_PI);
        ctx.fill();

        // Belly
        ctx.fillStyle = '#FFCC80';
        ctx.beginPath();
        ctx.ellipse(f * 2, 0 + bob, 6, 8, 0, 0, TWO_PI);
        ctx.fill();

        // ─── Arms ───
        ctx.fillStyle = '#FFCC80';
        const armSwing = s.state === 'running' ? Math.sin(s.animTimer * 0.25 * Math.max(1, speed * 0.3)) * 20 * (Math.PI / 180) : 0;
        ctx.save();
        ctx.rotate(armSwing);
        ctx.beginPath();
        ctx.ellipse(f * -8, -2 + bob, 3, 8, f * -0.3, 0, TWO_PI);
        ctx.fill();
        // Glove
        ctx.fillStyle = '#FFF';
        ctx.beginPath();
        ctx.arc(f * -9, 6 + bob, 4, 0, TWO_PI);
        ctx.fill();
        ctx.restore();

        // ─── Head ───
        ctx.fillStyle = '#1565C0';
        ctx.beginPath();
        ctx.arc(0, -14 + bob, 11, 0, TWO_PI);
        ctx.fill();

        // Face / skin
        ctx.fillStyle = '#FFCC80';
        ctx.beginPath();
        ctx.ellipse(f * 4, -12 + bob, 7, 8, 0, 0, TWO_PI);
        ctx.fill();

        // Eyes
        // White
        ctx.fillStyle = '#FFF';
        ctx.beginPath();
        ctx.ellipse(f * 4, -15 + bob, 5, 5.5, 0, 0, TWO_PI);
        ctx.fill();
        // Green iris
        ctx.fillStyle = '#4CAF50';
        ctx.beginPath();
        ctx.arc(f * 5.5, -15 + bob, 3, 0, TWO_PI);
        ctx.fill();
        // Pupil
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.arc(f * 6, -15 + bob, 1.8, 0, TWO_PI);
        ctx.fill();
        // Highlight
        ctx.fillStyle = '#FFF';
        ctx.beginPath();
        ctx.arc(f * 5, -16 + bob, 1, 0, TWO_PI);
        ctx.fill();

        // Nose
        ctx.fillStyle = '#0D47A1';
        ctx.beginPath();
        ctx.ellipse(f * 10, -12 + bob, 3, 2, 0, 0, TWO_PI);
        ctx.fill();

        // Mouth (smile)
        ctx.strokeStyle = '#5D4037';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(f * 6, -9 + bob, 4, 0.1, Math.PI * 0.8);
        ctx.stroke();

        // ─── Spines (quills) ───
        const spineColors = ['#1565C0', '#1976D2', '#1E88E5'];
        for (let i = 0; i < 3; i++) {
            const baseAngle = Math.PI * 0.7 + i * 0.25;
            const length = 16 - i * 2;
            const sway = Math.sin(time * 0.003 + i) * 0.05 * (speed + 1);
            const angle = baseAngle - f * 0.3 + sway;

            ctx.fillStyle = spineColors[i];
            ctx.beginPath();
            ctx.moveTo(-f * 4, -16 + bob + i * 4);
            ctx.lineTo(
                -f * 4 + Math.cos(angle + (speed > 3 ? 0.3 : 0) * -f) * length * -f,
                -16 + bob + i * 4 + Math.sin(angle) * length * 0.5
            );
            ctx.lineTo(-f * 2, -14 + bob + i * 4 + 3);
            ctx.fill();
        }

        // ─── Ears (small) ───
        ctx.fillStyle = '#1565C0';
        ctx.beginPath();
        ctx.ellipse(f * -2, -22 + bob, 3, 4, f * -0.3, 0, TWO_PI);
        ctx.fill();
    }

    return { createSonic, update, draw, WIDTH, HEIGHT };
})();
