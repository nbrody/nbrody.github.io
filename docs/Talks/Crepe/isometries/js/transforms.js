/**
 * Affine transform algebra.
 * Each transform is { a, b, c, d, tx, ty } representing:
 *   (x, y) ↦ (a·x + b·y + tx,  c·x + d·y + ty)
 */

export function identityTf() {
    return { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };
}

export function translateTf(dirDeg, dist) {
    const θ = dirDeg * Math.PI / 180;
    return { a: 1, b: 0, c: 0, d: 1, tx: dist * Math.cos(θ), ty: dist * Math.sin(θ) };
}

export function rotateTf(angleDeg, cx = 0, cy = 0) {
    const θ = angleDeg * Math.PI / 180;
    const cos = Math.cos(θ), sin = Math.sin(θ);
    return {
        a: cos, b: -sin, c: sin, d: cos,
        tx: cx - cos * cx + sin * cy,
        ty: cy - sin * cx - cos * cy,
    };
}

export function reflectTf(axisDeg) {
    const θ = axisDeg * Math.PI / 180;
    const c2 = Math.cos(2 * θ), s2 = Math.sin(2 * θ);
    return { a: c2, b: s2, c: s2, d: -c2, tx: 0, ty: 0 };
}

/** g ∘ f  (apply f first, then g) */
export function composeTf(f, g) {
    return {
        a: g.a * f.a + g.b * f.c,
        b: g.a * f.b + g.b * f.d,
        c: g.c * f.a + g.d * f.c,
        d: g.c * f.b + g.d * f.d,
        tx: g.a * f.tx + g.b * f.ty + g.tx,
        ty: g.c * f.tx + g.d * f.ty + g.ty,
    };
}

export function inverseTf(tf) {
    const det = tf.a * tf.d - tf.b * tf.c;
    return {
        a: tf.d / det, b: -tf.b / det,
        c: -tf.c / det, d: tf.a / det,
        tx: -(tf.d * tf.tx - tf.b * tf.ty) / det,
        ty: -(-tf.c * tf.tx + tf.a * tf.ty) / det,
    };
}

/** Interpolate identity → tf at parameter t ∈ [0, 1]. */
export function lerpTf(tf, t) {
    return {
        a: 1 + (tf.a - 1) * t, b: tf.b * t,
        c: tf.c * t, d: 1 + (tf.d - 1) * t,
        tx: tf.tx * t, ty: tf.ty * t,
    };
}

export function applyTf(tf, pt) {
    return {
        x: tf.a * pt.x + tf.b * pt.y + tf.tx,
        y: tf.c * pt.x + tf.d * pt.y + tf.ty,
    };
}
