// ────────────────────────────────────────────────────────────────
//  hat.js — Hat monotile substitution system
//  Adapted from Craig S. Kaplan's hatviz (BSD-3-Clause)
// ────────────────────────────────────────────────────────────────

// ── Tile types ─────────────────────────────────────────────────
class HatTile {
    constructor(label) {
        this.label = label;
    }
}

class MetaTile {
    constructor(shape, width) {
        this.shape = shape;
        this.width = width;
        this.children = [];
    }

    addChild(T, geom) {
        this.children.push({ T, geom });
    }

    evalChild(n, i) {
        return transPt(this.children[n].T, this.children[n].geom.shape[i]);
    }

    recentre() {
        let cx = 0, cy = 0;
        for (const p of this.shape) { cx += p.x; cy += p.y; }
        cx /= this.shape.length;
        cy /= this.shape.length;
        const tr = pt(-cx, -cy);
        for (let i = 0; i < this.shape.length; i++) {
            this.shape[i] = padd(this.shape[i], tr);
        }
        const M = ttrans(-cx, -cy);
        for (const ch of this.children) {
            ch.T = mul(M, ch.T);
        }
    }
}

// ── Five hat label types ───────────────────────────────────────
const H1_hat = new HatTile('H1');
const H_hat = new HatTile('H');
const T_hat = new HatTile('T');
const P_hat = new HatTile('P');
const F_hat = new HatTile('F');

// ── Initial metatiles ──────────────────────────────────────────
const H_init = (() => {
    const outline = [
        pt(0, 0), pt(4, 0), pt(4.5, hr3),
        pt(2.5, 5 * hr3), pt(1.5, 5 * hr3), pt(-0.5, hr3)
    ];
    const meta = new MetaTile(outline, 2);
    meta.addChild(
        matchTwo(hat_outline[5], hat_outline[7], outline[5], outline[0]),
        H_hat);
    meta.addChild(
        matchTwo(hat_outline[9], hat_outline[11], outline[1], outline[2]),
        H_hat);
    meta.addChild(
        matchTwo(hat_outline[5], hat_outline[7], outline[3], outline[4]),
        H_hat);
    meta.addChild(
        mul(ttrans(2.5, hr3),
            mul([-0.5, -hr3, 0, hr3, -0.5, 0],
                [0.5, 0, 0, 0, -0.5, 0])),
        H1_hat);
    return meta;
})();

const T_init = (() => {
    const outline = [pt(0, 0), pt(3, 0), pt(1.5, 3 * hr3)];
    const meta = new MetaTile(outline, 2);
    meta.addChild([0.5, 0, 0.5, 0, 0.5, hr3], T_hat);
    return meta;
})();

const P_init = (() => {
    const outline = [
        pt(0, 0), pt(4, 0),
        pt(3, 2 * hr3), pt(-1, 2 * hr3)
    ];
    const meta = new MetaTile(outline, 2);
    meta.addChild([0.5, 0, 1.5, 0, 0.5, hr3], P_hat);
    meta.addChild(
        mul(ttrans(0, 2 * hr3),
            mul([0.5, hr3, 0, -hr3, 0.5, 0],
                [0.5, 0, 0, 0, 0.5, 0])),
        P_hat);
    return meta;
})();

const F_init = (() => {
    const outline = [
        pt(0, 0), pt(3, 0),
        pt(3.5, hr3), pt(3, 2 * hr3), pt(-1, 2 * hr3)
    ];
    const meta = new MetaTile(outline, 2);
    meta.addChild([0.5, 0, 1.5, 0, 0.5, hr3], F_hat);
    meta.addChild(
        mul(ttrans(0, 2 * hr3),
            mul([0.5, hr3, 0, -hr3, 0.5, 0],
                [0.5, 0, 0, 0, 0.5, 0])),
        F_hat);
    return meta;
})();

// ── Construct a patch of 29 metatiles ──────────────────────────
function constructPatch(H, T, P, F) {
    const rules = [
        ['H'],
        [0, 0, 'P', 2],
        [1, 0, 'H', 2],
        [2, 0, 'P', 2],
        [3, 0, 'H', 2],
        [4, 4, 'P', 2],
        [0, 4, 'F', 3],
        [2, 4, 'F', 3],
        [4, 1, 3, 2, 'F', 0],
        [8, 3, 'H', 0],
        [9, 2, 'P', 0],
        [10, 2, 'H', 0],
        [11, 4, 'P', 2],
        [12, 0, 'H', 2],
        [13, 0, 'F', 3],
        [14, 2, 'F', 1],
        [15, 3, 'H', 4],
        [8, 2, 'F', 1],
        [17, 3, 'H', 0],
        [18, 2, 'P', 0],
        [19, 2, 'H', 2],
        [20, 4, 'F', 3],
        [20, 0, 'P', 2],
        [22, 0, 'H', 2],
        [23, 4, 'F', 3],
        [23, 0, 'F', 3],
        [16, 0, 'P', 2],
        [9, 4, 0, 2, 'T', 2],
        [4, 0, 'F', 3]
    ];

    const ret = new MetaTile([], H.width);
    const shapes = { H, T, P, F };

    for (const r of rules) {
        if (r.length === 1) {
            ret.addChild(ident, shapes[r[0]]);
        } else if (r.length === 4) {
            const poly = ret.children[r[0]].geom.shape;
            const Tr = ret.children[r[0]].T;
            const Pp = transPt(Tr, poly[(r[1] + 1) % poly.length]);
            const Q = transPt(Tr, poly[r[1]]);
            const nshp = shapes[r[2]];
            const npoly = nshp.shape;
            ret.addChild(
                matchTwo(npoly[r[3]], npoly[(r[3] + 1) % npoly.length], Pp, Q),
                nshp);
        } else {
            const chP = ret.children[r[0]];
            const chQ = ret.children[r[2]];
            const Pp = transPt(chQ.T, chQ.geom.shape[r[3]]);
            const Q = transPt(chP.T, chP.geom.shape[r[1]]);
            const nshp = shapes[r[4]];
            const npoly = nshp.shape;
            ret.addChild(
                matchTwo(npoly[r[5]], npoly[(r[5] + 1) % npoly.length], Pp, Q),
                nshp);
        }
    }
    return ret;
}

// ── Extract new metatile outlines from a patch ─────────────────
function constructMetatiles(patch) {
    const bps1 = patch.evalChild(8, 2);
    const bps2 = patch.evalChild(21, 2);
    const rbps = transPt(rotAbout(bps1, -2.0 * PI / 3.0), bps2);

    const p72 = patch.evalChild(7, 2);
    const p252 = patch.evalChild(25, 2);

    const llc = intersect(bps1, rbps,
        patch.evalChild(6, 2), p72);
    let w = psub(patch.evalChild(6, 2), llc);

    const new_H_outline = [llc, bps1];
    w = transPt(trot(-PI / 3), w);
    new_H_outline.push(padd(new_H_outline[1], w));
    new_H_outline.push(patch.evalChild(14, 2));
    w = transPt(trot(-PI / 3), w);
    new_H_outline.push(psub(new_H_outline[3], w));
    new_H_outline.push(patch.evalChild(6, 2));

    const new_H = new MetaTile(new_H_outline, patch.width * 2);
    for (const ch of [0, 9, 16, 27, 26, 6, 1, 8, 10, 15]) {
        new_H.addChild(patch.children[ch].T, patch.children[ch].geom);
    }

    const new_P_outline = [p72, padd(p72, psub(bps1, llc)), bps1, llc];
    const new_P = new MetaTile(new_P_outline, patch.width * 2);
    for (const ch of [7, 2, 3, 4, 28]) {
        new_P.addChild(patch.children[ch].T, patch.children[ch].geom);
    }

    const new_F_outline = [
        bps2, patch.evalChild(24, 2), patch.evalChild(25, 0),
        p252, padd(p252, psub(llc, bps1))
    ];
    const new_F = new MetaTile(new_F_outline, patch.width * 2);
    for (const ch of [21, 20, 22, 23, 24, 25]) {
        new_F.addChild(patch.children[ch].T, patch.children[ch].geom);
    }

    const AAA = new_H_outline[2];
    const BBB = padd(new_H_outline[1],
        psub(new_H_outline[4], new_H_outline[5]));
    const CCC = transPt(rotAbout(BBB, -PI / 3), AAA);
    const new_T_outline = [BBB, CCC, AAA];
    const new_T = new MetaTile(new_T_outline, patch.width * 2);
    new_T.addChild(patch.children[11].T, patch.children[11].geom);

    new_H.recentre();
    new_P.recentre();
    new_F.recentre();
    new_T.recentre();

    return [new_H, new_T, new_P, new_F];
}

// ── Build a tiling to specified level ──────────────────────────
function buildTiling(level) {
    let tiles = [H_init, T_init, P_init, F_init];
    for (let i = 1; i < level; i++) {
        const patch = constructPatch(...tiles);
        tiles = constructMetatiles(patch);
    }
    return tiles;
}

// ── Collect all hat tiles from a metatile tree ─────────────────
function collectHats(geom, T, level, result) {
    if (geom instanceof HatTile) {
        result.push({ label: geom.label, T });
        return;
    }
    if (level <= 0) return;
    for (const ch of geom.children) {
        collectHats(ch.geom, mul(T, ch.T), level - 1, result);
    }
}

// ── Collect supertile outlines at specific levels ──────────────
function collectOutlines(geom, T, level, targetLevel, result) {
    if (geom instanceof HatTile) return;
    if (level === targetLevel) {
        const transformed = geom.shape.map(p => transPt(T, p));
        result.push({ shape: transformed, width: geom.width });
        return;
    }
    for (const ch of geom.children) {
        collectOutlines(ch.geom, mul(T, ch.T), level - 1, targetLevel, result);
    }
}
