/**
 * Shared application state.
 *
 * FRAMES. The domain is computed in a HOME frame where its centre sits at the
 * ball origin, and drawn through a scene isometry:
 *
 *     S = fly · F · viewMatrix · B
 *
 *   B          basepoint isometry: the Dirichlet centre is B·j, and the home
 *              frame sees the conjugated generators B⁻¹·g·B;
 *   viewMatrix the group element accumulated by clicking generators and
 *              face pairings (what the "current element" reports);
 *   F          display frame: the identity, or in cusp view the map sending
 *              the chosen cusp to ∞ (so the upper half-space looks down it);
 *   fly        the inside-view observer's motion (never a group element).
 *
 * The Ford domain has its own home frame (cusp at ∞, generators K·g·K⁻¹), so
 * its scene isometry is fly · F · viewMatrix · K⁻¹ with F = K.
 */
import { Matrix2x2 } from './math.js';

const I = () => Matrix2x2.identity();

export const app = {
    // input
    matrices: [],            // generators as typed (det 1)
    exactCtx: null,          // { field, gens } in exact mode
    depth: 8,
    maxFaces: 96,
    fullDirichlet: false,
    // frames
    viewMatrix: I(),
    cumulativeWord: [],
    flyMatrix: I(),
    flying: false,
    basepoint: I(),
    basepointBall: [0, 0, 0],
    fordOn: false,
    fordFrame: null,         // K (cusp → ∞), from the last Ford computation
    fordCusp: 0,
    // results (see domain.js)
    home: null, scene: null,
    fordHome: null, fordScene: null, ford: null,
    report: null, invariants: null,
    // state
    animating: false,
    computing: false,
};

export function displayFrame() {
    return app.fordOn && app.fordFrame ? app.fordFrame : I();
}

/** P = fly · F · viewMatrix: how an actual group element appears in the scene. */
export function outerFrame() {
    let P = displayFrame().mul(app.viewMatrix);
    if (app.flying) P = app.flyMatrix.mul(P);
    return P.normalized();
}

/** Scene isometry of the Dirichlet home frame. */
export function sceneMatrix() {
    return outerFrame().mul(app.basepoint).normalized();
}

/** Scene isometry of the Ford home frame. */
export function fordSceneMatrix() {
    if (!app.fordFrame) return sceneMatrix();
    return outerFrame().mul(app.fordFrame.inv()).normalized();
}

/** An actual group element, as it acts in the scene. */
export function sceneAction(m) {
    const P = outerFrame();
    return P.mul(m).mul(P.inv()).normalized();
}

/** Home-frame generators B⁻¹·g·B. */
export function homeGenerators() {
    const B = app.basepoint, Bi = B.inv();
    return app.matrices.map(m => Bi.mul(m).mul(B).normalized());
}

/** Interleaved home-frame generators [g, g⁻¹, …] for orbit-based layers. */
export function homeGeneratorsInterleaved() {
    return homeGenerators().flatMap(g => [g, g.inv().normalized()]);
}

/** Matrix of a word (signed 1-based letters) in the generators as typed. */
export function wordToMatrix(word) {
    let M = Matrix2x2.identity();
    for (const w of word) {
        const g = app.matrices[Math.abs(w) - 1];
        if (!g) throw new Error(`g${Math.abs(w)} is not defined`);
        M = M.mul(w > 0 ? g : g.inv().normalized());
    }
    return M.normalized();
}

/** Whether the view has moved away from the basepoint (tutorial API). */
export function viewIsDirty() {
    const m = app.viewMatrix, tol = 1e-9;
    return Math.abs(m.a.re - 1) > tol || Math.abs(m.a.im) > tol ||
        Math.abs(m.b.re) > tol || Math.abs(m.b.im) > tol ||
        Math.abs(m.c.re) > tol || Math.abs(m.c.im) > tol ||
        Math.abs(m.d.re - 1) > tol || Math.abs(m.d.im) > tol;
}
