/* ============================================================
   TROPHALLAXIS — the machine
   256x240 virtual screen: 24px status bar, 208px nest, 8px ticker.
   ============================================================ */

const SCREEN_W = 256, SCREEN_H = 240;
const HUD_TOP = 24, HUD_BOT = 8;

const COL = {
    cyan: '#6fd7ea', white: '#ffffff', amber: '#eaa93c', green: '#7fd94e',
    red: '#e0403a', pink: '#f4a3bb', yellow: '#f7e06e', dim: '#7a6a55',
    black: '#0b0805', shadow: 'rgba(0,0,0,0.55)',
};

const HINTS = [
    'CALLOWS GLOW CYAN - BACK INTO THEM',
    'SOLDIERS AND LARVAE FEED FACE TO FACE',
    'HOLD SHIFT TO WALK BACKWARD',
    'CHEW WOOD - AMBER FERMENTS TO GREEN',
];

class Game {
    constructor(canvas) {
        this.cv = canvas;
        this.g = canvas.getContext('2d');
        this.g.imageSmoothingEnabled = false;
        this.hi = parseInt(localStorage.getItem('troph.hi') || '0', 10);
        this.state = 'title';
        this.t = 0;
        this.titleT = 0;
        this.shake = 0;
        this.flash = 0;
        this.particles = [];
        this.floats = [];
        this.banner = null;
        this.map = new NestMap(MAPS[0]);
        this.nestmates = [];
        this.ants = [];
        this.wood = [];
        this.pickups = [];
        this.player = new Player(128, 176);
        this.queen = new Queen(this.map.queen.x, this.map.queen.y);
        this.linkedTo = null;
        this.drainScale = 1;
        this.paused = false;
    }

    /* ---------------- lifecycle ---------------- */

    newGame() {
        this.score = 0;
        this.colony = 5;
        this.wave = 0;
        this.combo = 0;
        this.comboT = 0;
        this.particles.length = 0;
        this.floats.length = 0;
        // a new colony, not the leftovers of the one that just collapsed
        this.nestmates.length = 0;
        this.ants.length = 0;
        this.banner = null;
        this.player.slots = [null, null, null, null];
        this.player.freeFeeds = 0;
        this.player.stun = 0;
        this.player.link = null;
        this.linkedTo = null;
        this.state = 'play';
        this.hintIdx = 0;
        this.hintT = 0;
        this.nextWave();
        Chip.sfx('start');
        Chip.startMusic(126);
    }

    nextWave() {
        this.wave++;
        const w = this.wave;
        this.map = new NestMap(MAPS[(w - 1) % MAPS.length]);
        this.queen = new Queen(this.map.queen.x, this.map.queen.y);
        this.queen.timer = 20;
        this.baseDrain = 1 + (w - 1) * 0.15;
        this.drainScale = this.baseDrain;
        this.pheromoneT = 0;
        this.woodPending = [];
        this.quota = 5 + 2 * w;
        this.delivered = 0;
        this.maxAnts = w <= 1 ? 0 : Math.min(1 + Math.floor((w - 2) / 1.5), 5);
        this.antSpeed = Math.min(42 + w * 3.5, 68);
        this.antTimer = 8;
        this.pickupTimer = 16 + Math.random() * 6;
        this.linkedTo = null;
        this.ants.length = 0;
        this.pickups.length = 0;
        this.wood.length = 0;

        const start = this.map.randomOpen(Math.random, [this.map.queen], 48);
        this.player.x = start.x; this.player.y = start.y;
        this.player.link = null; this.player.stun = 0; this.player.chew = 0;
        this.player.invuln = 1.5;
        if (w === 1) this.player.slots = [{ type: 'fluid', t: FERMENT_TIME }, { type: 'crop', t: 0 }, null, null];

        // wood piles
        for (let i = 0; i < 2; i++) this.spawnWood();

        // nestmates: keep survivors, top up to the wave roster
        const roster = Math.min(4 + w, 9);
        this.nestmates = this.nestmates.filter(n => !n.dead);
        for (const n of this.nestmates) {
            const p = this.map.randomOpen(Math.random, [this.player, this.map.queen], 34);
            n.x = p.x; n.y = p.y;
            n.flora = Math.min(1, n.flora + 0.35);
        }
        const pool = w === 1 ? ['callow', 'larva', 'callow', 'nymph', 'soldier']
            : ['callow', 'nymph', 'soldier', 'larva', 'callow', 'nymph', 'larva', 'soldier', 'nymph'];
        while (this.nestmates.length < roster) {
            const caste = pool[this.nestmates.length % pool.length];
            const p = this.map.randomOpen(Math.random, [this.player, this.map.queen], 34);
            this.nestmates.push(new Nestmate(p.x, p.y, caste));
        }

        // the moult: everyone who just shed their cuticle lost their fauna
        if (w > 1) {
            const victims = this.nestmates.filter(n => n.mode === 'proctodeal');
            const k = Math.min(victims.length, 1 + Math.floor(w / 2));
            for (let i = 0; i < k; i++) {
                const v = victims[(Math.random() * victims.length) | 0];
                if (!v) break;
                v.flora = 0.14;
                v.caste = 'callow';
                v.cfg = CASTE.callow;
                v.mode = CASTE.callow.mode;
                v.moltFlash = 0.9;
                this.burst(v.x, v.y, 12, COL.white, 40);
            }
            this.setBanner('MOULT! ' + k + ' CALLOWS STRIPPED', 2.2, COL.cyan);
            Chip.sfx('molt');
        } else {
            this.setBanner('WAVE 1 - FEED THE COLONY', 2.4, COL.green);
        }
        Chip.setTempo(120 + this.wave * 6);
    }

    spawnWood() {
        const avoid = [this.map.queen, this.player].concat(this.wood);
        const p = this.map.randomOpen(Math.random, avoid, 44);
        this.wood.push(new Wood(p.x, p.y));
    }

    setBanner(text, time, color) { this.banner = { text, t: time, max: time, color: color || COL.yellow }; }

    /* ---------------- events ---------------- */

    onStarveStart(n) {
        this.setBanner('A NESTMATE IS FADING!', 1.6, COL.red);
        Chip.sfx('starve');
    }

    onStarved(n) {
        this.colony--;
        this.flash = 0.3;
        this.shake = 4;
        this.burst(n.x, n.y, 16, COL.dim, 46);
        this.floats.push(new FloatText(n.x, n.y - 10, 'LOST', COL.red, 1));
        Chip.sfx('starve');
        if (this.colony <= 0) this.gameOver();
    }

    onQueenCalls() {
        this.setBanner('THE QUEEN IS CALLING', 2.0, COL.pink);
        Chip.sfx('link');
    }

    soldierStrike(sold, ant) {
        ant.dead = true;
        sold.flora = Math.max(0.05, sold.flora - 0.12);
        this.addScore(250, ant.x, ant.y, COL.amber);
        this.burst(ant.x, ant.y, 14, '#8f2320', 60);
        this.shake = 3;
        Chip.sfx('antDown');
    }

    bitePlayer(ant) {
        const p = this.player;
        p.stun = 0.75; p.invuln = 2.0; p.link = null; this.linkedTo = null;
        p.dropOne();
        this.colony--;
        this.combo = 0;
        this.shake = 6; this.flash = 0.25;
        ant.kick(p.x, p.y);
        this.burst(p.x, p.y, 14, COL.red, 70);
        this.floats.push(new FloatText(p.x, p.y - 12, 'BITTEN', COL.red, 1));
        Chip.sfx('bite');
        if (this.colony <= 0) this.gameOver();
    }

    gameOver() {
        this.state = 'gameover';
        this.overT = 0;
        this.newRecord = this.score > this.hi;
        if (this.newRecord) { this.hi = this.score; localStorage.setItem('troph.hi', String(this.hi)); }
        Chip.stopMusic();
        Chip.sfx('gameOver');
    }

    addScore(n, x, y, color) {
        this.score += n;
        if (x != null) this.floats.push(new FloatText(x, y - 8, String(n), color || COL.white, 1));
    }

    burst(x, y, n, color, speed) {
        for (let i = 0; i < n; i++) {
            const a = Math.random() * 6.283, s = (0.3 + Math.random() * 0.7) * (speed || 50);
            this.particles.push(new Particle(x, y, Math.cos(a) * s, Math.sin(a) * s,
                0.3 + Math.random() * 0.4, color, Math.random() < 0.3 ? 2 : 1));
        }
    }

    /* ---------------- feeding ---------------- */

    /** Is `target` correctly presented to the right end of the player? */
    alignment(target) {
        const p = this.player;
        const v = DIRV[p.dir];
        const dx = target.x - p.x, dy = target.y - p.y;
        const d = Math.hypot(dx, dy) || 0.001;
        const dot = (dx / d) * v[0] + (dy / d) * v[1];
        const reach = (target instanceof Queen) ? 30 : 17;
        if (d > reach) return null;
        // the queen is fixed facing north — her mouth is only reachable from above
        if (target instanceof Queen && p.y > target.y - 6) return null;
        if (dot < -0.42) return 'proctodeal';   // target is behind us
        if (dot > 0.42) return 'stomodeal';     // target is in front of us
        return null;
    }

    findFeedTarget() {
        const p = this.player;
        let best = null, bestD = 1e9;
        const consider = (obj, needsIt) => {
            if (!needsIt) return;
            const end = this.alignment(obj);
            if (end !== obj.mode) return;
            if (!p.has(obj.mode)) return;
            const d = Math.hypot(obj.x - p.x, obj.y - p.y);
            if (d < bestD) { bestD = d; best = obj; }
        };
        for (const n of this.nestmates) consider(n, !n.dead && n.flora < 0.92);
        consider(this.queen, this.queen.hungry);
        return best;
    }

    /** The comedy case: right nestmate, wrong orifice. */
    findWrongEnd() {
        const p = this.player;
        for (const n of this.nestmates) {
            if (n.dead || n.flora >= 0.92) continue;
            const end = this.alignment(n);
            if (end && end !== n.mode) return n;
        }
        if (this.queen.hungry) {
            const end = this.alignment(this.queen);
            if (end && end !== this.queen.mode) return this.queen;
        }
        return null;
    }

    /** Where the two bodies actually meet: donor's business end to recipient's mouth. */
    junction(tg) {
        const p = this.player;
        const a = tg.mode === 'proctodeal' ? p.rearPoint(6) : p.headPoint(6);
        const b = tg.headPoint ? tg.headPoint(6) : { x: tg.x, y: tg.y };
        return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    }

    completeFeed(target) {
        const p = this.player;
        p.consume(target.mode);
        this.delivered++;
        this.combo++; this.comboT = 5;
        const mult = Math.min(this.combo, 8);
        if (target instanceof Queen) {
            target.receive(this);
            this.addScore(1000 * mult, target.x, target.y - 16, COL.pink);
            this.setBanner('ROYAL RATION DELIVERED', 1.8, COL.pink);
            p.freeFeeds += 2;
            this.burst(target.x, target.y - 12, 22, COL.pink, 55);
        } else {
            const revived = target.starving || target.weak > 0;
            target.receive(0.8);
            this.addScore((revived ? 250 : 100) * mult, target.x, target.y, revived ? COL.cyan : COL.green);
            if (revived) this.setBanner('REVIVED!', 1.2, COL.cyan);
            this.burst(target.x, target.y, 10, target.mode === 'proctodeal' ? COL.green : COL.amber, 40);
        }
        if (mult > 1) this.floats.push(new FloatText(p.x, p.y - 18, 'X' + mult, COL.yellow, 1));
        Chip.sfx('feed');
        if (this.delivered >= this.quota) this.clearWave();
    }

    clearWave() {
        this.state = 'waveclear';
        this.clearT = 0;
        this.bonus = 200 * this.wave + 100 * this.colony;
        this.score += this.bonus;
        this.linkedTo = null;
        this.player.link = null;
        Chip.sfx('wave');
    }

    /* ---------------- update ---------------- */

    update(dt, input) {
        this.t += dt;
        if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 22);
        if (this.flash > 0) this.flash -= dt;
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.update(dt);
            if (p.life <= 0) this.particles.splice(i, 1);
        }
        for (let i = this.floats.length - 1; i >= 0; i--) {
            const f = this.floats[i];
            f.y -= 14 * dt; f.life -= dt;
            if (f.life <= 0) this.floats.splice(i, 1);
        }
        if (this.banner) { this.banner.t -= dt; if (this.banner.t <= 0) this.banner = null; }

        if (this.state === 'title') { this.titleT += dt; return; }
        if (this.state === 'gameover') { this.overT += dt; return; }
        if (this.state === 'waveclear') {
            this.clearT += dt;
            if (this.clearT > 2.6) { this.state = 'play'; this.nextWave(); }
            return;
        }
        if (this.paused) return;

        this.updatePlay(dt, input);
    }

    updatePlay(dt, input) {
        const p = this.player, map = this.map;
        if (this.comboT > 0) { this.comboT -= dt; if (this.comboT <= 0) this.combo = 0; }
        this.hintT += dt;
        if (this.hintT > 6) { this.hintT = 0; this.hintIdx = (this.hintIdx + 1) % HINTS.length; }

        p.update(dt, input, map);
        this.queen.update(dt, this);

        /* ---- the transfer itself ---- */
        if (p.link) {
            const tg = p.link.target;
            const stillValid = (tg instanceof Queen ? tg.hungry : (!tg.dead)) &&
                this.alignment(tg) === tg.mode && input.action && p.stun <= 0;
            if (!stillValid) {
                p.link = null; this.linkedTo = null;
            } else {
                p.link.t += dt;
                // droplets squeezing out at the junction
                if (Math.random() < 0.7) {
                    const j = this.junction(tg);
                    const a = Math.random() * 6.283;
                    this.particles.push(new Particle(
                        j.x, j.y, Math.cos(a) * 26, Math.sin(a) * 26, 0.28,
                        tg.mode === 'proctodeal' ? COL.green : COL.amber, 2));
                }
                if (p.link.t >= FEED_TIME) {
                    p.link = null; this.linkedTo = null;
                    this.completeFeed(tg);
                }
            }
        } else if (input.action && p.stun <= 0) {
            const target = this.findFeedTarget();
            if (target) {
                p.link = { target, t: 0 };
                this.linkedTo = target;
                if (target.faceToward) target.faceToward(p.x, p.y);
                Chip.sfx('link');
            } else {
                // gnawing wood
                let chewing = null;
                for (const wd of this.wood) {
                    if (Math.hypot(wd.x - p.x, wd.y - p.y) < 15) { chewing = wd; break; }
                }
                if (chewing && p.emptySlot() >= 0) {
                    p.chew += dt;
                    p.chewTarget = chewing;
                    if (Math.random() < 0.35) {
                        this.particles.push(new Particle(chewing.x + (Math.random() * 10 - 5), chewing.y + (Math.random() * 10 - 5),
                            (Math.random() * 40 - 20), -20 - Math.random() * 30, 0.35, '#a8874f', 1));
                    }
                    if (p.chew >= CHEW_TIME) {
                        p.chew = 0;
                        p.addCrop();
                        chewing.charges--;
                        Chip.sfx('gulp');
                        this.floats.push(new FloatText(p.x, p.y - 12, 'CROP', COL.amber, 1));
                        if (chewing.charges <= 0) { chewing.dead = true; this.woodPending.push(2.2); }
                    } else if (Math.random() < 0.25) Chip.sfx('chew');
                } else {
                    p.chew = 0;
                    if (!this.wrongCool || this.wrongCool <= 0) {
                        const w = this.findWrongEnd();
                        if (w) {
                            this.wrongCool = 0.7;
                            this.floats.push(new FloatText(p.x, p.y - 16, 'WRONG END!', COL.red, 1));
                            Chip.sfx('wrongEnd');
                        }
                    }
                }
            }
        } else {
            p.chew = 0;
        }
        if (this.wrongCool > 0) this.wrongCool -= dt;

        /* ---- cue: which end of you is wanted ---- */
        p.cueEnd = null;
        let cueD = 46;
        const cueCheck = (o, need) => {
            if (!need) return;
            const d = Math.hypot(o.x - p.x, o.y - p.y);
            if (d < cueD && p.has(o.mode)) { cueD = d; p.cueEnd = o.mode; }
        };
        for (const n of this.nestmates) cueCheck(n, !n.dead && n.hungry);
        cueCheck(this.queen, this.queen.hungry);

        /* ---- nestmates ---- */
        for (let i = this.nestmates.length - 1; i >= 0; i--) {
            const n = this.nestmates[i];
            if (n.moltFlash > 0) n.moltFlash -= dt;
            n.update(dt, this);
            if (n.dead) this.nestmates.splice(i, 1);
        }

        /* ---- raiders ---- */
        this.antTimer -= dt;
        if (this.ants.length < this.maxAnts && this.antTimer <= 0) {
            this.antTimer = 4 + Math.random() * 4;
            const spots = this.map.edgeSpawns();
            let s = spots[(Math.random() * spots.length) | 0];
            for (let k = 0; k < 12; k++) {
                const c = spots[(Math.random() * spots.length) | 0];
                if (Math.hypot(c.x - p.x, c.y - p.y) > 70) { s = c; break; }
            }
            this.ants.push(new Ant(s.x, s.y, this.antSpeed));
            this.setBanner('RAIDERS AT THE TUNNEL MOUTH', 1.6, COL.red);
        }
        for (let i = this.ants.length - 1; i >= 0; i--) {
            const a = this.ants[i];
            a.update(dt, this);
            if (a.dead) { this.ants.splice(i, 1); continue; }
            if (a.spawnT > 0) continue;
            if (p.invuln <= 0 && Math.hypot(a.x - p.x, a.y - p.y) < 10) this.bitePlayer(a);
            for (const n of this.nestmates) {
                if (n.dead || n.flora <= 0) continue;
                if (Math.hypot(a.x - n.x, a.y - n.y) < 10 && a.recoil <= 0) {
                    n.flora = Math.max(0, n.flora - 0.3);
                    n.fedFlash = 0; n.hurtFlash = 0.4;
                    a.kick(n.x, n.y);
                    this.burst(n.x, n.y, 6, COL.red, 40);
                    Chip.sfx('bite');
                }
            }
        }

        /* ---- pickups ---- */
        this.pickupTimer -= dt;
        if (this.pickupTimer <= 0) {
            this.pickupTimer = 18 + Math.random() * 8;
            const spot = this.map.randomOpen(Math.random, [p], 50);
            this.pickups.push(new Pickup(spot.x, spot.y, Math.random() < 0.55 ? 'bloom' : 'pheromone'));
        }
        for (let i = this.pickups.length - 1; i >= 0; i--) {
            const k = this.pickups[i];
            k.t += dt; k.life -= dt;
            if (k.life <= 0) { this.pickups.splice(i, 1); continue; }
            if (Math.hypot(k.x - p.x, k.y - p.y) < 12) {
                this.pickups.splice(i, 1);
                Chip.sfx('pickup');
                if (k.kind === 'bloom') {
                    p.fillFluid();
                    p.freeFeeds += 3;
                    this.setBanner('PROTOZOA BLOOM! GUT FULL', 1.8, COL.green);
                    this.burst(p.x, p.y, 20, COL.green, 60);
                } else {
                    this.pheromoneT = 8;
                    this.setBanner('ROYAL PHEROMONE - HUNGER STALLED', 1.8, COL.yellow);
                    this.burst(p.x, p.y, 20, COL.yellow, 60);
                }
                this.addScore(150, p.x, p.y, COL.yellow);
            }
        }
        if (this.pheromoneT > 0) this.pheromoneT -= dt;
        this.drainScale = this.pheromoneT > 0 ? this.baseDrain * 0.15 : this.baseDrain;

        for (let i = this.wood.length - 1; i >= 0; i--) if (this.wood[i].dead) this.wood.splice(i, 1);
        for (let i = this.woodPending.length - 1; i >= 0; i--) {
            this.woodPending[i] -= dt;
            if (this.woodPending[i] <= 0) { this.woodPending.splice(i, 1); this.spawnWood(); }
        }
    }

    /* ---------------- render ---------------- */

    render() {
        const g = this.g;
        g.fillStyle = COL.black;
        g.fillRect(0, 0, SCREEN_W, SCREEN_H);

        if (this.state === 'title') { this.renderTitle(); return; }

        const sx = this.shake ? (Math.random() * 2 - 1) * this.shake : 0;
        const sy = this.shake ? (Math.random() * 2 - 1) * this.shake : 0;

        g.save();
        g.beginPath(); g.rect(0, HUD_TOP, SCREEN_W, FIELD_H); g.clip();
        g.translate(sx, HUD_TOP + sy);
        this.renderField();
        g.restore();

        this.renderHud();
        this.renderTicker();

        if (this.state === 'waveclear') this.renderWaveClear();
        if (this.state === 'gameover') this.renderGameOver();
        if (this.paused && this.state === 'play') {
            g.fillStyle = 'rgba(0,0,0,0.7)';
            g.fillRect(0, HUD_TOP, SCREEN_W, FIELD_H);
            drawTextCentered(g, 'PAUSED', 128, 104, COL.white, 2);
            drawTextCentered(g, 'PRESS P TO RESUME', 128, 128, COL.dim, 1);
        }
        if (this.flash > 0) {
            g.fillStyle = 'rgba(224,64,58,' + (this.flash * 0.8) + ')';
            g.fillRect(0, HUD_TOP, SCREEN_W, FIELD_H);
        }
    }

    renderField() {
        const g = this.g;
        g.drawImage(this.map.bg, 0, 0);

        if (this.pheromoneT > 0) {
            g.fillStyle = 'rgba(247,224,110,' + (0.06 + 0.04 * Math.sin(this.t * 8)) + ')';
            g.fillRect(0, 0, FIELD_W, FIELD_H);
        }

        for (const w of this.wood) g.drawImage(getSprite('wood', null, 0), (w.x - 8) | 0, (w.y - 8) | 0);

        for (const k of this.pickups) {
            const bob = Math.sin(k.t * 5) * 1.5;
            if (k.life < 4 && Math.floor(k.life * 8) % 2 === 0) continue;
            g.drawImage(getSprite(k.kind, null, 0), (k.x - 8) | 0, (k.y - 8 + bob) | 0);
        }

        this.renderQueen();

        const actors = [];
        for (const n of this.nestmates) actors.push(n);
        for (const a of this.ants) actors.push(a);
        actors.push(this.player);
        actors.sort((a, b) => a.y - b.y);
        for (const a of actors) {
            if (a instanceof Player) this.renderPlayer();
            else if (a instanceof Ant) this.renderAnt(a);
            else this.renderNestmate(a);
        }

        this.renderLink();

        for (const p of this.particles) {
            g.globalAlpha = Math.max(0, Math.min(1, p.life / p.maxLife));
            g.fillStyle = p.color;
            g.fillRect(p.x | 0, p.y | 0, p.size, p.size);
        }
        g.globalAlpha = 1;

        for (const f of this.floats) {
            g.globalAlpha = Math.max(0, Math.min(1, f.life * 1.6));
            drawTextCentered(g, f.text, f.x, f.y, f.color, f.scale);
        }
        g.globalAlpha = 1;
    }

    /* The money shot: a pulsing seal where donor meets recipient. */
    renderLink() {
        const p = this.player;
        if (!p.link) return;
        const g = this.g, tg = p.link.target;
        const j = this.junction(tg);
        const col = tg.mode === 'proctodeal' ? COL.green : COL.amber;
        const pulse = 0.5 + 0.5 * Math.sin(this.t * 24);
        const r = 2 + Math.round(pulse * 2);
        g.fillStyle = col;
        g.fillRect((j.x - r) | 0, (j.y - r) | 0, r * 2, r * 2);
        g.fillStyle = COL.white;
        g.fillRect((j.x - 1) | 0, (j.y - 1) | 0, 2, 2);
        for (let i = 0; i < 4; i++) {
            const ang = this.t * 7 + i * 1.5708;
            const rad = 6 + 3 * Math.sin(this.t * 11 + i);
            g.fillStyle = col;
            g.fillRect((j.x + Math.cos(ang) * rad) | 0, (j.y + Math.sin(ang) * rad) | 0, 2, 2);
        }
        if (Math.floor(this.t * 7) % 2 === 0)
            drawTextCentered(g, 'GLUG', p.x, p.y - 26, col, 1);
    }

    shadow(x, y, w) {
        const g = this.g;
        g.fillStyle = 'rgba(0,0,0,0.35)';
        g.fillRect((x - w / 2) | 0, (y + 5) | 0, w, 2);
    }

    renderPlayer() {
        const g = this.g, p = this.player;
        if (p.invuln > 0 && Math.floor(p.invuln * 12) % 2 === 0) return;
        this.shadow(p.x, p.y, 10);

        const gutCol = p.hasFluid() ? null : (p.hasCrop()
            ? { key: 'crop', pal: { G: PAL.A, g: PAL.a } }
            : { key: 'empty', pal: { G: '#4a3520', g: '#2f2214' } });
        let extra = gutCol;
        if (p.stun > 0) extra = TINT_RED;

        // a little gait bob so the worker reads as walking
        const bob = p.moving ? (Math.floor(p.animT * 12) % 2) : 0;
        g.drawImage(getSprite('worker', 'worker', p.dir, extra), (p.x - 8) | 0, (p.y - 8 - bob) | 0);

        // which end is wanted
        if (p.cueEnd && !p.link) {
            const a = p.cueEnd === 'proctodeal' ? p.rearPoint(9) : p.headPoint(9);
            const pulse = 0.5 + 0.5 * Math.sin(this.t * 10);
            g.globalAlpha = 0.35 + pulse * 0.5;
            g.fillStyle = p.cueEnd === 'proctodeal' ? COL.green : COL.amber;
            g.fillRect((a.x - 3) | 0, (a.y - 3) | 0, 6, 6);
            g.fillStyle = COL.black;
            g.fillRect((a.x - 1) | 0, (a.y - 1) | 0, 2, 2);
            g.globalAlpha = 1;
        }

        if (p.chew > 0) {
            const w = Math.round(14 * (p.chew / CHEW_TIME));
            g.fillStyle = COL.black; g.fillRect((p.x - 8) | 0, (p.y - 15) | 0, 16, 4);
            g.fillStyle = COL.amber; g.fillRect((p.x - 7) | 0, (p.y - 14) | 0, w, 2);
        }
        if (p.link) {
            const w = Math.round(14 * (p.link.t / FEED_TIME));
            g.fillStyle = COL.black; g.fillRect((p.x - 8) | 0, (p.y - 15) | 0, 16, 4);
            g.fillStyle = p.link.target.mode === 'proctodeal' ? COL.green : COL.amber;
            g.fillRect((p.x - 7) | 0, (p.y - 14) | 0, w, 2);
        }
    }

    renderNestmate(n) {
        const g = this.g;
        this.shadow(n.x, n.y, n.caste === 'larva' ? 8 : 10);
        let extra = null;
        if (n.moltFlash > 0 && Math.floor(n.moltFlash * 14) % 2 === 0) extra = TINT_WHITE;
        else if (n.hurtFlash > 0) extra = TINT_RED;
        else if (n.flora <= 0) extra = (Math.floor(this.t * 6) % 2 === 0) ? TINT_PALE : null;
        else if (n.fedFlash > 0 && Math.floor(n.fedFlash * 16) % 2 === 0) extra = TINT_WHITE;

        g.drawImage(getSprite(n.cfg.art, n.cfg.variant, n.dir, extra), (n.x - 8) | 0, (n.y - 8) | 0);

        // flora gauge
        if (n.flora < 0.85 || n.fedFlash > 0) {
            const x = (n.x - 7) | 0, y = (n.y - 13) | 0;
            g.fillStyle = COL.black; g.fillRect(x - 1, y - 1, 16, 4);
            g.fillStyle = '#3a2a18'; g.fillRect(x, y, 14, 2);
            g.fillStyle = n.flora > 0.5 ? COL.green : (n.flora > 0.22 ? COL.amber : COL.red);
            g.fillRect(x, y, Math.max(1, Math.round(14 * n.flora)), 2);
        }
        // solicit bubble
        if (n.hungry && this.state === 'play') {
            const up = Math.sin(this.t * 6 + n.wobble) * 1.2;
            const bx = (n.x + 8) | 0, by = (n.y - 24 + up) | 0;
            const proct = n.mode === 'proctodeal';
            g.fillStyle = COL.black; g.fillRect(bx - 1, by - 1, 9, 11);
            g.fillStyle = proct ? COL.cyan : COL.yellow;
            g.fillRect(bx, by, 7, 9);
            drawText(g, proct ? 'P' : 'S', bx + 1, by + 1, COL.black, 1);
        }
    }

    renderAnt(a) {
        const g = this.g;
        if (a.spawnT > 0) {
            if (Math.floor(a.spawnT * 10) % 2 === 0) {
                g.fillStyle = COL.red;
                g.fillRect((a.x - 6) | 0, (a.y - 6) | 0, 12, 12);
                drawTextCentered(g, '!', a.x, a.y - 3, COL.white, 1);
            }
            return;
        }
        this.shadow(a.x, a.y, 10);
        g.drawImage(getSprite('ant', 'ant', a.dir, a.recoil > 0 ? TINT_WHITE : null), (a.x - 8) | 0, (a.y - 8) | 0);
    }

    renderQueen() {
        const g = this.g, q = this.queen;
        this.shadow(q.x, q.y + 4, 22);
        let extra = null;
        if (q.fedFlash > 0 && Math.floor(q.fedFlash * 14) % 2 === 0) extra = TINT_WHITE;
        g.drawImage(getSprite('queen', 'queen', 0, extra), (q.x - 12) | 0, (q.y - 12) | 0);
        if (q.hungry) {
            const up = Math.sin(this.t * 6) * 1.5;
            const bx = (q.x + 10) | 0, by = (q.y - 26 + up) | 0;
            g.fillStyle = COL.black; g.fillRect(bx - 1, by - 1, 9, 11);
            g.fillStyle = COL.yellow; g.fillRect(bx, by, 7, 9);
            drawText(g, 'S', bx + 1, by + 1, COL.black, 1);
        }
    }

    /* ---------------- hud ---------------- */

    renderHud() {
        const g = this.g;
        g.fillStyle = '#100a06';
        g.fillRect(0, 0, SCREEN_W, HUD_TOP);
        g.fillStyle = '#2a1a0e';
        g.fillRect(0, HUD_TOP - 1, SCREEN_W, 1);

        drawText(g, '1UP', 4, 2, COL.cyan, 1);
        drawText(g, pad(this.score, 6), 26, 2, COL.white, 1);
        drawText(g, 'HI', 100, 2, COL.cyan, 1);
        drawText(g, pad(this.hi, 6), 114, 2, COL.white, 1);
        const wv = 'WAVE ' + pad(this.wave, 2);
        drawText(g, wv, SCREEN_W - 4 - textWidth(wv, 1), 2, COL.yellow, 1);

        // gut slots
        drawText(g, 'GUT', 4, 13, COL.dim, 1);
        for (let i = 0; i < SLOTS_MAX; i++) {
            const x = 26 + i * 9, y = 13;
            const s = this.player.slots[i];
            g.fillStyle = COL.black; g.fillRect(x, y, 7, 7);
            g.fillStyle = '#3a2a18'; g.fillRect(x + 1, y + 1, 5, 5);
            if (s) {
                if (s.type === 'fluid') {
                    g.fillStyle = (s.justFermented > 0 && Math.floor(s.justFermented * 16) % 2 === 0) ? COL.white : COL.green;
                    g.fillRect(x + 1, y + 1, 5, 5);
                    g.fillStyle = '#c9f5a8'; g.fillRect(x + 2, y + 2, 2, 1);
                } else {
                    const h = Math.max(1, Math.round(5 * (s.t / FERMENT_TIME)));
                    g.fillStyle = COL.amber; g.fillRect(x + 1, y + 1, 5, 5);
                    g.fillStyle = COL.green; g.fillRect(x + 1, y + 6 - h, 5, h);
                }
            }
        }
        if (this.player.freeFeeds > 0) drawText(g, '+' + this.player.freeFeeds, 63, 13, COL.green, 1);

        const fed = 'FED ' + pad(this.delivered, 2) + '/' + pad(this.quota, 2);
        drawText(g, fed, 100, 13, this.delivered >= this.quota ? COL.green : COL.white, 1);

        // colony pips
        const n = Math.max(0, this.colony);
        for (let i = 0; i < 5; i++) {
            const x = SCREEN_W - 4 - (5 - i) * 8, y = 13;
            g.fillStyle = i < n ? COL.pink : '#3a2a18';
            g.fillRect(x, y + 1, 6, 5);
            g.fillStyle = i < n ? COL.white : '#241608';
            g.fillRect(x + 1, y + 2, 2, 2);
        }
    }

    renderTicker() {
        const g = this.g;
        const y = SCREEN_H - HUD_BOT;
        g.fillStyle = '#100a06';
        g.fillRect(0, y, SCREEN_W, HUD_BOT);
        if (this.banner) {
            const blink = this.banner.t > this.banner.max - 0.25 || Math.floor(this.banner.t * 8) % 2 === 0;
            if (blink) drawTextCentered(g, this.banner.text, 128, y + 1, this.banner.color, 1);
        } else if (this.combo > 1) {
            drawTextCentered(g, 'CHAIN X' + Math.min(this.combo, 8), 128, y + 1, COL.yellow, 1);
        } else {
            drawTextCentered(g, HINTS[this.hintIdx], 128, y + 1, COL.dim, 1);
        }
    }

    renderWaveClear() {
        const g = this.g;
        g.fillStyle = 'rgba(0,0,0,0.78)';
        g.fillRect(0, HUD_TOP, SCREEN_W, FIELD_H);
        drawTextCentered(g, 'GALLERY SECURE', 128, 78, COL.green, 2);
        drawTextCentered(g, 'WAVE ' + this.wave + ' COMPLETE', 128, 104, COL.white, 1);
        drawTextCentered(g, 'BONUS ' + this.bonus, 128, 120, COL.yellow, 1);
        if (this.clearT > 1.1) drawTextCentered(g, 'COLONY SIZE ' + this.nestmates.length, 128, 140, COL.cyan, 1);
        if (this.clearT > 1.8 && Math.floor(this.clearT * 4) % 2 === 0)
            drawTextCentered(g, 'NEXT: THE MOULT', 128, 160, COL.pink, 1);
    }

    renderGameOver() {
        const g = this.g;
        g.fillStyle = 'rgba(0,0,0,' + Math.min(0.85, this.overT * 0.9) + ')';
        g.fillRect(0, HUD_TOP, SCREEN_W, FIELD_H);
        if (this.overT < 0.4) return;
        drawTextCentered(g, 'COLONY', 128, 62, COL.red, 2);
        drawTextCentered(g, 'COLLAPSE', 128, 80, COL.red, 2);
        drawTextCentered(g, 'SCORE ' + pad(this.score, 6), 128, 108, COL.white, 1);
        drawTextCentered(g, 'WAVES CLEARED ' + (this.wave - 1), 128, 122, COL.dim, 1);
        if (this.newRecord && Math.floor(this.overT * 4) % 2 === 0)
            drawTextCentered(g, 'NEW RECORD!', 128, 140, COL.yellow, 1);
        if (this.overT > 1.4 && Math.floor(this.overT * 2) % 2 === 0)
            drawTextCentered(g, 'PRESS SPACE TO TRY AGAIN', 128, 168, COL.cyan, 1);
    }

    renderTitle() {
        const g = this.g;
        const t = this.titleT;
        // dim nest backdrop
        g.globalAlpha = 0.35;
        g.drawImage(this.map.bg, 0, HUD_TOP);
        g.globalAlpha = 1;
        g.fillStyle = 'rgba(11,8,5,0.55)';
        g.fillRect(0, 0, SCREEN_W, SCREEN_H);

        drawTextCentered(g, 'TROPHALLAXIS', 128, 22, COL.green, 2);
        drawTextCentered(g, 'A HINDGUT ARCADE CLASSIC', 128, 44, COL.amber, 1);

        // demo: worker backs into a callow and passes a droplet
        const cyc = t % 6;
        const cx = 128, cy = 96;
        const worker = { x: cx - 26 + Math.min(18, cyc * 14), y: cy, dir: 1 };
        let feeding = false;
        if (cyc > 1.3 && cyc < 2.0) { worker.x = cx - 8; worker.dir = 3; }
        else if (cyc >= 2.0) { worker.x = cx - 12; worker.dir = 3; feeding = cyc < 4.2; }
        g.drawImage(getSprite('worker', 'callow', 3), (cx + 6) | 0, (cy - 8) | 0);
        g.drawImage(getSprite('worker', 'worker', worker.dir), (worker.x - 8) | 0, (cy - 8) | 0);
        if (feeding) {
            for (let i = 0; i < 5; i++) {
                const k = ((t * 2.2 + i * 0.2) % 1);
                const x = worker.x + 8 + k * 10, y = cy + Math.sin(k * 6) * 1;
                g.fillStyle = COL.green;
                g.fillRect(x | 0, y | 0, 2, 2);
            }
            if (Math.floor(t * 6) % 2 === 0) drawTextCentered(g, 'GLUG', cx + 4, cy - 20, COL.green, 1);
        }
        drawTextCentered(g, cyc >= 2.0 && cyc < 4.2 ? 'REAR TO MOUTH. THAT IS THE JOB.' : 'RESTORE THE COLONY GUT FAUNA',
            128, cy + 22, COL.white, 1);

        drawTextCentered(g, 'ARROWS/WASD MOVE   SHIFT REVERSE', 128, 150, COL.dim, 1);
        drawTextCentered(g, 'SPACE CHEW / FEED    P PAUSE   M MUTE', 128, 162, COL.dim, 1);
        drawTextCentered(g, 'CYAN P = BACK IN     YELLOW S = FACE THEM', 128, 178, COL.cyan, 1);

        if (Math.floor(t * 2) % 2 === 0)
            drawTextCentered(g, 'PRESS SPACE TO START', 128, 200, COL.yellow, 1);
        drawTextCentered(g, 'HI ' + pad(this.hi, 6), 128, 218, COL.white, 1);
        drawTextCentered(g, 'NB 2026 - NO TERMITES WERE HARMED', 128, 231, '#4a3a2a', 1);
    }
}

function pad(n, w) {
    let s = String(Math.max(0, Math.floor(n)));
    while (s.length < w) s = '0' + s;
    return s;
}
