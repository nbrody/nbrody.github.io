import { F } from './math.js';
import * as THREE from 'three';

// === Configuration / Constants ===

// Beacon Coordinates (ABC representation)
export const BEACON_SC = {
    a: -44568,
    b: -71676,
    c: 63505,
    color: 0x00ff66,
    den: 105625
};

export const BEACON_NASH = {
    a: 4644,
    b: -85175,
    c: 62292,
    color: 0xff8800,
    den: 105625
};

// Colors
export const COLOR_BG = 0x1e1e28;
export const COLOR_PANEL = 'rgba(30, 30, 40, 0.95)';

// Exact Matrices (Rational)
// L = rotation about Y (0,1,0) by theta where cos=3/5, sin=-4/5  (Note: original code had sin=-4/5 at a31? Let's verify original)
// Original L:
// 3/5, 0, 4/5
// 0,   1, 0
// -4/5, 0, 3/5
// This corresponds to rotation around Y axis.
export const MAT_L_EXACT = [
    [F(3, 5), F(0), F(4, 5)],
    [F(0), F(1), F(0)],
    [F(-4, 5), F(0), F(3, 5)]
];

export const MAT_LINV_EXACT = [
    [F(3, 5), F(0), F(-4, 5)],
    [F(0), F(1), F(0)],
    [F(4, 5), F(0), F(3, 5)]
];

// U = rotation about X-ish axis?
// Original U:
// 1,    0,       0
// 0,   5/13,  -12/13
// 0,  12/13,   5/13
export const MAT_U_EXACT = [
    [F(1), F(0), F(0)],
    [F(0), F(5, 13), F(-12, 13)],
    [F(0), F(12, 13), F(5, 13)]
];

export const MAT_UINV_EXACT = [
    [F(1), F(0), F(0)],
    [F(0), F(5, 13), F(12, 13)],
    [F(0), F(-12, 13), F(5, 13)]
];

// Helper to create THREE.Matrix4 from 3x3 components (row-major input)
function makeM4(a11, a12, a13, a21, a22, a23, a31, a32, a33) {
    const m = new THREE.Matrix4();
    m.set(
        a11, a12, a13, 0,
        a21, a22, a23, 0,
        a31, a32, a33, 0,
        0, 0, 0, 1
    );
    return m;
}

// Float Matrices (THREE.Matrix4)
export const MAT_L_FLOAT = makeM4(3 / 5, 0, 4 / 5, 0, 1, 0, -4 / 5, 0, 3 / 5);
export const MAT_U_FLOAT = makeM4(1, 0, 0, 0, 5 / 13, -12 / 13, 0, 12 / 13, 5 / 13);
