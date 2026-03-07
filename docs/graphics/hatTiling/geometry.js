// ────────────────────────────────────────────────────────────────
//  geometry.js — 2D affine transforms & hat tile outline
//  Adapted from Craig S. Kaplan's hatviz (BSD-3-Clause)
// ────────────────────────────────────────────────────────────────

const { cos, sin, PI, sqrt, abs } = Math;
const hr3 = sqrt(3) / 2;
const ident = [1, 0, 0, 0, 1, 0];

function pt(x, y) { return { x, y }; }
function hexPt(x, y) { return pt(x + 0.5 * y, hr3 * y); }

// ── Affine matrix helpers ──────────────────────────────────────
function inv(T) {
    const det = T[0] * T[4] - T[1] * T[3];
    return [
        T[4] / det, -T[1] / det, (T[1] * T[5] - T[2] * T[4]) / det,
        -T[3] / det, T[0] / det, (T[2] * T[3] - T[0] * T[5]) / det
    ];
}

function mul(A, B) {
    return [
        A[0] * B[0] + A[1] * B[3],
        A[0] * B[1] + A[1] * B[4],
        A[0] * B[2] + A[1] * B[5] + A[2],
        A[3] * B[0] + A[4] * B[3],
        A[3] * B[1] + A[4] * B[4],
        A[3] * B[2] + A[4] * B[5] + A[5]
    ];
}

function padd(p, q) { return { x: p.x + q.x, y: p.y + q.y }; }
function psub(p, q) { return { x: p.x - q.x, y: p.y - q.y }; }

function trot(ang) {
    const c = cos(ang), s = sin(ang);
    return [c, -s, 0, s, c, 0];
}

function ttrans(tx, ty) { return [1, 0, tx, 0, 1, ty]; }

function rotAbout(p, ang) {
    return mul(ttrans(p.x, p.y), mul(trot(ang), ttrans(-p.x, -p.y)));
}

function transPt(M, P) {
    return pt(M[0] * P.x + M[1] * P.y + M[2], M[3] * P.x + M[4] * P.y + M[5]);
}

function matchSeg(p, q) {
    return [q.x - p.x, p.y - q.y, p.x, q.y - p.y, q.x - p.x, p.y];
}

function matchTwo(p1, q1, p2, q2) {
    return mul(matchSeg(p2, q2), inv(matchSeg(p1, q1)));
}

function intersect(p1, q1, p2, q2) {
    const d = (q2.y - p2.y) * (q1.x - p1.x) - (q2.x - p2.x) * (q1.y - p1.y);
    const uA = ((q2.x - p2.x) * (p1.y - p2.y) - (q2.y - p2.y) * (p1.x - p2.x)) / d;
    return pt(p1.x + uA * (q1.x - p1.x), p1.y + uA * (q1.y - p1.y));
}

function mag(a, b) { return sqrt(a * a + b * b); }

// ── Hat tile outline (13 vertices on hex grid) ─────────────────
const hat_outline = [
    hexPt(0, 0), hexPt(-1, -1), hexPt(0, -2), hexPt(2, -2),
    hexPt(2, -1), hexPt(4, -2), hexPt(5, -1), hexPt(4, 0),
    hexPt(3, 0), hexPt(2, 2), hexPt(0, 3), hexPt(0, 2),
    hexPt(-1, 2)
];
