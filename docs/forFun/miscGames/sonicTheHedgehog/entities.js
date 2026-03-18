// ============================================================
//  entities.js  –  Rings, enemies, springs, checkpoints, particles
// ============================================================
const Entities = (() => {
    const TWO_PI = Math.PI * 2;

    // ─── Ring Drawing ───
    function drawRing(ctx, x, y, time) {
        const phase = Math.sin(time * 0.005 + x * 0.01);
        const radiusX = 10;
        const radiusY = 10 * Math.abs(Math.cos(time * 0.003 + x * 0.02));

        // Outer ring
        ctx.strokeStyle = '#FFD600';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.ellipse(x, y, radiusX, Math.max(3, radiusY), 0, 0, TWO_PI);
        ctx.stroke();

        // Inner shine
        ctx.strokeStyle = '#FFFF8D';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.ellipse(x, y, radiusX - 2, Math.max(1, radiusY - 2), 0, 0, TWO_PI);
        ctx.stroke();

        // Sparkle
        const sparkle = Math.sin(time * 0.01 + x) * 0.5 + 0.5;
        if (sparkle > 0.8) {
            ctx.fillStyle = '#FFF';
            ctx.beginPath();
            ctx.arc(x - 4, y - 4, 2, 0, TWO_PI);
            ctx.fill();
        }
    }

    function drawCollectedRing(ctx, x, y, t) {
        // Fading, rising collected ring
        const alpha = Math.max(0, 1 - t / 30);
        const rise = t * 2;
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = '#FFD600';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(x, y - rise, 8, 8, 0, 0, TWO_PI);
        ctx.stroke();
        ctx.globalAlpha = 1;
    }

    // ─── Enemy Drawing ───
    function drawMotobug(ctx, x, y, dir, time) {
        // Body
        ctx.fillStyle = '#E53935';
        ctx.beginPath();
        ctx.ellipse(x, y - 6, 14, 10, 0, 0, TWO_PI);
        ctx.fill();

        // Shell
        ctx.fillStyle = '#B71C1C';
        ctx.beginPath();
        ctx.ellipse(x, y - 8, 12, 6, 0, Math.PI, TWO_PI);
        ctx.fill();

        // Eye
        ctx.fillStyle = '#FFF';
        ctx.beginPath();
        ctx.arc(x + dir * 8, y - 10, 4, 0, TWO_PI);
        ctx.fill();
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.arc(x + dir * 9, y - 10, 2, 0, TWO_PI);
        ctx.fill();

        // Wheel
        const wheelAngle = time * 0.1;
        ctx.strokeStyle = '#424242';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x - 6, y + 2, 5, 0, TWO_PI);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(x + 6, y + 2, 5, 0, TWO_PI);
        ctx.stroke();
        // Spokes
        ctx.strokeStyle = '#616161';
        ctx.lineWidth = 1;
        for (let i = 0; i < 3; i++) {
            const a = wheelAngle + i * (TWO_PI / 3);
            ctx.beginPath();
            ctx.moveTo(x - 6 + Math.cos(a) * 4, y + 2 + Math.sin(a) * 4);
            ctx.lineTo(x - 6 - Math.cos(a) * 4, y + 2 - Math.sin(a) * 4);
            ctx.stroke();
        }

        // Exhaust puff
        const puffX = x - dir * 16;
        const puffAlpha = 0.3 + Math.sin(time * 0.05) * 0.15;
        ctx.fillStyle = `rgba(200,200,200,${puffAlpha})`;
        ctx.beginPath();
        ctx.arc(puffX, y - 4, 4 + Math.sin(time * 0.08) * 2, 0, TWO_PI);
        ctx.fill();
    }

    function drawBuzzBomber(ctx, x, y, dir, time) {
        // Body (wasp-like)
        ctx.fillStyle = '#1565C0';
        ctx.beginPath();
        ctx.ellipse(x, y, 16, 8, 0, 0, TWO_PI);
        ctx.fill();

        // Stripes
        ctx.fillStyle = '#FFD600';
        ctx.fillRect(x - 6, y - 4, 4, 8);
        ctx.fillRect(x + 2, y - 4, 4, 8);

        // Wings
        const wingFlap = Math.sin(time * 0.3) * 8;
        ctx.fillStyle = 'rgba(200,220,255,0.5)';
        ctx.beginPath();
        ctx.ellipse(x - 4, y - 10 - wingFlap, 10, 4, -0.3, 0, TWO_PI);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(x + 4, y - 10 - wingFlap, 10, 4, 0.3, 0, TWO_PI);
        ctx.fill();

        // Eye
        ctx.fillStyle = '#FF1744';
        ctx.beginPath();
        ctx.arc(x + dir * 12, y - 2, 3, 0, TWO_PI);
        ctx.fill();

        // Stinger
        ctx.fillStyle = '#9E9E9E';
        ctx.beginPath();
        ctx.moveTo(x - dir * 16, y);
        ctx.lineTo(x - dir * 22, y + 2);
        ctx.lineTo(x - dir * 16, y + 4);
        ctx.fill();
    }

    function drawExplosion(ctx, x, y, t) {
        const progress = t / 20;
        const alpha = Math.max(0, 1 - progress);
        const radius = 10 + progress * 25;

        ctx.globalAlpha = alpha;
        // Explosion circles
        ctx.fillStyle = '#FF6D00';
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, TWO_PI);
        ctx.fill();
        ctx.fillStyle = '#FFAB00';
        ctx.beginPath();
        ctx.arc(x, y, radius * 0.6, 0, TWO_PI);
        ctx.fill();
        ctx.fillStyle = '#FFF';
        ctx.beginPath();
        ctx.arc(x, y, radius * 0.25, 0, TWO_PI);
        ctx.fill();

        // Particles
        for (let i = 0; i < 6; i++) {
            const angle = (i / 6) * TWO_PI + progress * 2;
            const dist = radius * 1.3;
            ctx.fillStyle = i % 2 === 0 ? '#FFD600' : '#FF6D00';
            ctx.beginPath();
            ctx.arc(x + Math.cos(angle) * dist, y + Math.sin(angle) * dist, 3 - progress * 2, 0, TWO_PI);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
    }

    // ─── Spring Drawing ───
    function drawSpring(ctx, x, y, compressed) {
        const comp = compressed > 0 ? Math.min(compressed, 8) : 0;
        const baseY = y;
        const topY = y - 20 + comp;

        // Base
        ctx.fillStyle = '#FFD600';
        ctx.fillRect(x - 12, baseY - 4, 24, 8);

        // Coil
        ctx.strokeStyle = '#FFA000';
        ctx.lineWidth = 3;
        const coilSegs = 4;
        ctx.beginPath();
        for (let i = 0; i <= coilSegs; i++) {
            const t = i / coilSegs;
            const cy = baseY - 4 - t * (20 - comp);
            const cx = x + (i % 2 === 0 ? -8 : 8);
            if (i === 0) ctx.moveTo(x, baseY - 4);
            else ctx.lineTo(cx, cy);
        }
        ctx.lineTo(x, topY);
        ctx.stroke();

        // Top pad
        ctx.fillStyle = '#FF6D00';
        ctx.beginPath();
        ctx.roundRect(x - 10, topY - 4, 20, 6, 3);
        ctx.fill();
    }

    // ─── Checkpoint Drawing ───
    function drawCheckpoint(ctx, x, y, activated, time) {
        // Pole
        ctx.fillStyle = '#9E9E9E';
        ctx.fillRect(x - 2, y - 60, 4, 60);

        // Spinning sign
        const spin = activated ? Math.sin(time * 0.003) : 1;
        const signW = Math.abs(spin) * 20;

        ctx.fillStyle = activated ? '#2196F3' : '#F44336';
        ctx.fillRect(x - signW / 2, y - 58, signW, 16);

        if (signW > 5) {
            ctx.fillStyle = '#FFF';
            ctx.font = '6px "Press Start 2P"';
            ctx.textAlign = 'center';
            ctx.fillText(activated ? '✓' : '◆', x, y - 47);
            ctx.textAlign = 'left';
        }

        // Glow when activated
        if (activated) {
            ctx.fillStyle = `rgba(33,150,243,${0.2 + Math.sin(time * 0.005) * 0.1})`;
            ctx.beginPath();
            ctx.arc(x, y - 50, 20, 0, TWO_PI);
            ctx.fill();
        }
    }

    // ─── Scattered rings (when hit) ───
    function createScatteredRings(x, y, count) {
        const scattered = [];
        for (let i = 0; i < count; i++) {
            const angle = (i / count) * TWO_PI + Math.random() * 0.5;
            const speed = 4 + Math.random() * 4;
            scattered.push({
                x, y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed - 5,
                life: 60 + Math.random() * 30,
                bounce: 0
            });
        }
        return scattered;
    }

    function updateScatteredRings(rings, dt) {
        for (let i = rings.length - 1; i >= 0; i--) {
            const r = rings[i];
            r.vy += 0.3; // gravity
            r.x += r.vx;
            r.y += r.vy;
            r.life--;
            if (r.y > Level.GROUND_Y && r.bounce < 2) {
                r.y = Level.GROUND_Y;
                r.vy = -r.vy * 0.5;
                r.vx *= 0.8;
                r.bounce++;
            }
            if (r.life <= 0) rings.splice(i, 1);
        }
    }

    function drawScatteredRings(ctx, rings, camX, camY, time) {
        rings.forEach(r => {
            const sx = r.x - camX;
            const sy = r.y - camY;
            const alpha = Math.min(1, r.life / 20);
            ctx.globalAlpha = alpha;
            drawRing(ctx, sx, sy, time);
            ctx.globalAlpha = 1;
        });
    }

    return {
        drawRing, drawCollectedRing,
        drawMotobug, drawBuzzBomber, drawExplosion,
        drawSpring, drawCheckpoint,
        createScatteredRings, updateScatteredRings, drawScatteredRings
    };
})();
