/* ============================================================
   TROPHALLAXIS — actors
   ============================================================ */

const DIRV = [[0, -1], [1, 0], [0, 1], [-1, 0]]; // N E S W

const SLOTS_MAX = 4;
const CHEW_TIME = 0.8;      // seconds of gnawing per crop dose
const FERMENT_TIME = 5.0;   // crop -> hindgut fluid
const FEED_TIME = 0.55;     // seconds of contact to complete a transfer

/* Castes. `mode` is the end of YOUR body the food has to come out of. */
const CASTE = {
    callow: { mode: 'proctodeal', art: 'worker', variant: 'callow', drain: 0.055, speed: 22, half: 5 },
    nymph: { mode: 'proctodeal', art: 'worker', variant: 'nymph', drain: 0.042, speed: 26, half: 5 },
    soldier: { mode: 'stomodeal', art: 'soldier', variant: 'soldier', drain: 0.050, speed: 20, half: 5 },
    larva: { mode: 'stomodeal', art: 'larva', variant: 'larva', drain: 0.062, speed: 14, half: 4 },
};

class Actor {
    constructor(x, y, half) {
        this.x = x; this.y = y;
        this.dir = 2;
        this.half = half || 5;
        this.wobble = Math.random() * 6.28;
        this.stuckT = 0;
        this.unstick = 0;
    }

    /* Axis-separated collision so we slide along carton walls. */
    step(dx, dy, map) {
        if (dx) {
            const nx = this.x + dx;
            if (!map.boxHits(nx, this.y, this.half)) this.x = nx;
        }
        if (dy) {
            const ny = this.y + dy;
            if (!map.boxHits(this.x, ny, this.half)) this.y = ny;
        }
        if (Math.abs(dx) > Math.abs(dy)) this.dir = dx > 0 ? 1 : 3;
        else if (dy) this.dir = dy > 0 ? 2 : 0;
    }

    /* Greedy chase with an unstick nudge — enough brain for an insect. */
    steerToward(tx, ty, speed, dt, map) {
        const px = this.x, py = this.y;
        let ax = tx - this.x, ay = ty - this.y;
        const d = Math.hypot(ax, ay) || 1;
        if (this.unstick > 0) {
            this.unstick -= dt;
            this.step(this.perp[0] * speed * dt, this.perp[1] * speed * dt, map);
        } else {
            this.step((ax / d) * speed * dt, (ay / d) * speed * dt, map);
        }
        if (Math.hypot(this.x - px, this.y - py) < speed * dt * 0.35 && d > 12) {
            this.stuckT += dt;
            if (this.stuckT > 0.25) {
                this.stuckT = 0;
                this.unstick = 0.45;
                const s = Math.random() < 0.5 ? 1 : -1;
                this.perp = Math.abs(ax) > Math.abs(ay) ? [0, s] : [s, 0];
            }
        } else this.stuckT = 0;
    }

    wanderStep(speed, dt, map) {
        this.wanderT = (this.wanderT || 0) - dt;
        if (this.wanderT <= 0 || this.wanderBlocked) {
            this.wanderT = 0.5 + Math.random() * 1.4;
            this.wanderD = (Math.random() * 4) | 0;
            this.wanderBlocked = false;
        }
        const v = DIRV[this.wanderD];
        const px = this.x, py = this.y;
        this.step(v[0] * speed * dt, v[1] * speed * dt, map);
        if (Math.hypot(this.x - px, this.y - py) < speed * dt * 0.5) this.wanderBlocked = true;
    }

    /* Point just behind / in front of the body, in world pixels. */
    rearPoint(d) { const v = DIRV[this.dir]; return { x: this.x - v[0] * (d || 7), y: this.y - v[1] * (d || 7) }; }
    headPoint(d) { const v = DIRV[this.dir]; return { x: this.x + v[0] * (d || 7), y: this.y + v[1] * (d || 7) }; }
}

/* ---------------------------------------------------------- */

class Player extends Actor {
    constructor(x, y) {
        super(x, y, 5);
        this.speed = 74;
        this.slots = [null, null, null, null];
        this.chew = 0;
        this.chewTarget = null;
        this.link = null;
        this.stun = 0;
        this.invuln = 0;
        this.freeFeeds = 0;
        this.cueEnd = null;
        this.animT = 0;
    }

    hasFluid() { return this.slots.some(s => s && s.type === 'fluid'); }
    hasCrop() { return this.slots.some(s => s && s.type === 'crop'); }
    has(mode) { return mode === 'proctodeal' ? this.hasFluid() : this.hasCrop(); }
    emptySlot() { return this.slots.indexOf(null); }
    count() { return this.slots.filter(Boolean).length; }

    addCrop() {
        const i = this.emptySlot();
        if (i < 0) return false;
        this.slots[i] = { type: 'crop', t: 0 };
        return true;
    }

    fillFluid() {
        for (let i = 0; i < SLOTS_MAX; i++) this.slots[i] = { type: 'fluid', t: FERMENT_TIME };
    }

    consume(mode) {
        if (this.freeFeeds > 0) { this.freeFeeds--; return true; }
        const want = mode === 'proctodeal' ? 'fluid' : 'crop';
        for (let i = 0; i < SLOTS_MAX; i++) {
            if (this.slots[i] && this.slots[i].type === want) { this.slots[i] = null; return true; }
        }
        return false;
    }

    dropOne() {
        for (let i = SLOTS_MAX - 1; i >= 0; i--) if (this.slots[i]) { this.slots[i] = null; return true; }
        return false;
    }

    update(dt, input, map) {
        this.animT += dt;
        if (this.stun > 0) { this.stun -= dt; }
        if (this.invuln > 0) this.invuln -= dt;

        // ferment the crop into hindgut fluid
        for (const s of this.slots) {
            if (s && s.type === 'crop') {
                s.t += dt;
                if (s.t >= FERMENT_TIME) { s.type = 'fluid'; s.justFermented = 0.6; }
            } else if (s && s.justFermented > 0) s.justFermented -= dt;
        }

        if (this.stun > 0 || this.link) { this.moving = false; return; }

        let dx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
        let dy = (input.down ? 1 : 0) - (input.up ? 1 : 0);
        if (dx && dy) { dx *= 0.7071; dy *= 0.7071; }
        this.moving = !!(dx || dy);
        if (!this.moving) return;

        const sp = this.speed * (this.chew > 0 ? 0.4 : 1);
        const px = this.x, py = this.y;
        const keepFacing = input.reverse;
        const oldDir = this.dir;
        this.step(dx * sp * dt, dy * sp * dt, map);
        if (keepFacing) this.dir = oldDir;
        if (Math.hypot(this.x - px, this.y - py) < 0.01) this.moving = false;
    }
}

/* ---------------------------------------------------------- */

class Nestmate extends Actor {
    constructor(x, y, caste) {
        const c = CASTE[caste];
        super(x, y, c.half);
        this.caste = caste;
        this.cfg = c;
        this.mode = c.mode;
        this.flora = 0.55 + Math.random() * 0.4;
        this.weak = 0;
        this.dead = false;
        this.fedFlash = 0;
        this.grapple = null;
        this.dir = (Math.random() * 4) | 0;
    }

    get hungry() { return this.flora < 0.4; }
    get starving() { return this.flora <= 0; }

    receive(amount) {
        this.flora = Math.min(1, this.flora + amount);
        this.weak = 0;
        this.fedFlash = 0.7;
    }

    update(dt, game) {
        const map = game.map;
        if (this.fedFlash > 0) this.fedFlash -= dt;
        if (this.hurtFlash > 0) this.hurtFlash -= dt;

        if (this.flora > 0) {
            this.flora -= this.cfg.drain * game.drainScale * dt;
            if (this.flora <= 0) { this.flora = 0; this.weak = 8; game.onStarveStart(this); }
        } else {
            this.weak -= dt;
            if (this.weak <= 0) { this.dead = true; game.onStarved(this); }
            return; // too weak to walk
        }

        if (game.linkedTo === this) return;

        // soldiers with a full crop go and headbutt raiders
        if (this.caste === 'soldier' && this.flora > 0.45) {
            let best = null, bd = 60;
            for (const a of game.ants) {
                const d = Math.hypot(a.x - this.x, a.y - this.y);
                if (d < bd) { bd = d; best = a; }
            }
            if (best) {
                this.steerToward(best.x, best.y, this.cfg.speed * 2.1, dt, map);
                if (bd < 11) game.soldierStrike(this, best);
                return;
            }
        }

        // beg from the worker if they are carrying what we need
        if (this.hungry && game.player.has(this.mode)) {
            const p = game.player;
            const d = Math.hypot(p.x - this.x, p.y - this.y);
            if (d < 92 && d > 11) {
                this.steerToward(p.x, p.y, this.cfg.speed * 1.5, dt, map);
                return;
            }
            if (d <= 11) { this.faceToward(p.x, p.y); return; }
        }
        this.wanderStep(this.cfg.speed, dt, map);
    }

    faceToward(tx, ty) {
        const dx = tx - this.x, dy = ty - this.y;
        this.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : (dy > 0 ? 2 : 0);
    }
}

/* ---------------------------------------------------------- */

class Ant extends Actor {
    constructor(x, y, speed) {
        super(x, y, 5);
        this.speed = speed;
        this.spawnT = 1.0;      // telegraph before it becomes solid
        this.dead = false;
        this.grappled = 0;
        this.recoil = 0;
    }

    update(dt, game) {
        if (this.spawnT > 0) { this.spawnT -= dt; return; }
        if (this.grappled > 0) { this.grappled -= dt; return; }
        if (this.recoil > 0) {
            this.recoil -= dt;
            this.step(this.rx * 90 * dt, this.ry * 90 * dt, game.map);
            return;
        }
        // prefer a helpless nestmate, otherwise harass the worker
        let target = game.player, bd = Math.hypot(game.player.x - this.x, game.player.y - this.y) * 1.35;
        for (const n of game.nestmates) {
            if (n.dead) continue;
            const d = Math.hypot(n.x - this.x, n.y - this.y) * (n.starving ? 0.5 : 1);
            if (d < bd) { bd = d; target = n; }
        }
        this.steerToward(target.x, target.y, this.speed, dt, game.map);
    }

    kick(fromX, fromY) {
        const d = Math.hypot(this.x - fromX, this.y - fromY) || 1;
        this.rx = (this.x - fromX) / d; this.ry = (this.y - fromY) / d;
        this.recoil = 0.35;
    }
}

/* ---------------------------------------------------------- */

class Wood {
    constructor(x, y) { this.x = x; this.y = y; this.charges = 3; this.dead = false; this.t = 0; }
}

class Pickup {
    constructor(x, y, kind) { this.x = x; this.y = y; this.kind = kind; this.life = 14; this.dead = false; this.t = 0; }
}

class Queen {
    constructor(x, y) {
        this.x = x; this.y = y; this.dir = 0;
        this.hunger = 0;          // 0..1, 1 = demanding
        this.timer = 22;
        this.fedFlash = 0;
        this.half = 11;
        this.mode = 'stomodeal';  // royal feeding is mouth to mouth
        this.served = 0;
    }
    headPoint() { return { x: this.x, y: this.y - 14 }; }
    get hungry() { return this.hunger > 0; }
    update(dt, game) {
        if (this.fedFlash > 0) this.fedFlash -= dt;
        if (this.hunger > 0) return;
        this.timer -= dt;
        if (this.timer <= 0) { this.hunger = 1; game.onQueenCalls(); }
    }
    receive(game) {
        this.hunger = 0;
        this.timer = 24 + Math.random() * 8;
        this.fedFlash = 1.0;
        this.served++;
    }
}

/* ---------------------------------------------------------- */

class Particle {
    constructor(x, y, vx, vy, life, color, size) {
        this.x = x; this.y = y; this.vx = vx; this.vy = vy;
        this.life = life; this.maxLife = life; this.color = color; this.size = size || 1;
    }
    update(dt) { this.x += this.vx * dt; this.y += this.vy * dt; this.life -= dt; }
}

class FloatText {
    constructor(x, y, text, color, scale) {
        this.x = x; this.y = y; this.text = text; this.color = color;
        this.life = 1.1; this.scale = scale || 1;
    }
}
