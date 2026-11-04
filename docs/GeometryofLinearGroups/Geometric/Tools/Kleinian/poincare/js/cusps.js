/**
 * The marker at an ideal vertex ξ of a fundamental domain: a horoball.
 *
 * At ξ the largest horoball with no point of the basepoint's orbit inside it
 * touches exactly the orbit points whose Dirichlet cells reach ξ (the corners
 * of the Delaunay cell at ξ). The marker is that horoball pushed in by
 * CUSP_DEPTH. Both steps commute with Γ, so ideal vertices glued together get
 * horoballs that the gluings carry onto each other, and an isometry of the
 * view carries a horoball to a horoball.
 *
 * A horoball is {X : −⟨X, N⟩ < 1} for a null vector N = c·(ξ, 1), with
 * ⟨x, y⟩ = x·y − x_t·y_t on hyperboloid vectors (x, y, z, t).
 */
import * as THREE from 'three';

export const CUSP_DEPTH = 4;

/**
 * N for the marker at the unit ball vector ξ. `orbit` holds hyperboloid
 * points [x, y, z, t] of the orbit, at least one of them a nearest one to ξ
 * (a corner of the domain at ξ, or the Dirichlet centre). Null without one.
 */
export function cuspNull(xi, orbit, depth = CUSP_DEPTH) {
    let m = Infinity;
    for (const P of orbit) m = Math.min(m, P[3] - (P[0] * xi.x + P[1] * xi.y + P[2] * xi.z));
    if (!(m > 0 && m < Infinity)) return null;
    const c = Math.exp(depth) / m;
    return new THREE.Vector4(c * xi.x, c * xi.y, c * xi.z, c);
}

/**
 * The horoball of N in the ball model: a sphere tangent to the unit sphere at
 * ξ. Its diameter through ξ runs along the ball's radius, from ξ in to the
 * ball radius (c − 1)/(c + 1), so its radius is 1/(c + 1).
 */
export function horoballInBall(N) {
    const c = N.w;
    const xi = new THREE.Vector3(N.x, N.y, N.z).divideScalar(c).normalize();
    const radius = 1 / (c + 1);
    return { xi, centre: xi.clone().multiplyScalar(1 - radius), radius };
}

/**
 * Orbit points for cuspNull at the Delaunay domain's cusps: the basepoint
 * copy of each piece (delaunay.js). A piece with an ideal vertex ξ is
 * (p, …, ξ) carried from the Dirichlet domain of p, which reaches ξ, so its p
 * is nearest to ξ. The domain's corners will not do: a kaleidoscope's chamber
 * has no basepoint copy among them.
 */
export function delaunayOrbit(R) {
    return R.simplices.map(s => kleinToHyperboloid(s.T.apply(s.pts[0])));
}

/** Klein point → hyperboloid [x, y, z, t]. */
export function kleinToHyperboloid(k) {
    const s = 1 / Math.sqrt(Math.max(1e-300, 1 - k.lengthSq()));
    return [k.x * s, k.y * s, k.z * s, s];
}
