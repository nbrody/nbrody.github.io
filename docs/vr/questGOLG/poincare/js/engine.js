/**
 * The math engine, imported live from the main Poincaré tool
 * (GeometryofLinearGroups/Geometric/Tools/Kleinian/poincare). Nothing here is
 * copied: the VR app runs exactly the same exact-arithmetic reader, canonical
 * domains, certifier, presentations, invariants, Delaunay domains and face
 * coloring as the desktop tool, so improvements there show up here too.
 *
 * Every import of the engine goes through this file, so the path lives in one
 * place.
 */
export {
    Matrix2x2, Complex, pslKey, lorentzMatrix, applyMatrixToBall, translationTowards,
    invertWord, reduceWord, covToGeom
} from '../../../../GeometryofLinearGroups/Geometric/Tools/Kleinian/poincare/js/math.js';
export {
    buildPolyhedron, kleinToBall, ballToKlein
} from '../../../../GeometryofLinearGroups/Geometric/Tools/Kleinian/poincare/js/polyhedron.js';
export { buildGroup, exampleLibrary } from '../../../../GeometryofLinearGroups/Geometric/Tools/Kleinian/poincare/js/matrixInput.js';
export { createDomainService } from '../../../../GeometryofLinearGroups/Geometric/Tools/Kleinian/poincare/js/domainService.js';
export { serializeTowerContext } from '../../../../GeometryofLinearGroups/Geometric/Tools/Kleinian/poincare/js/tower.js';
export { matToArr, arrToMat } from '../../../../GeometryofLinearGroups/Geometric/Tools/Kleinian/poincare/js/compute.js';
export { computeDelaunayDomain } from '../../../../GeometryofLinearGroups/Geometric/Tools/Kleinian/poincare/js/delaunay.js';

/**
 * The desktop tool's face coloring (faceColoring.js, paletteColors.js), loaded
 * on demand: resolves to { colorClasses, polyhedronContacts, delaunayContacts,
 * discretePool }, or null where those modules are not deployed (state.js then
 * uses a simple palette in which paired faces still match).
 */
export const faceColoringReady = Promise.all([
    import('../../../../GeometryofLinearGroups/Geometric/Tools/Kleinian/poincare/js/faceColoring.js'),
    import('../../../../GeometryofLinearGroups/Geometric/Tools/Kleinian/poincare/js/paletteColors.js'),
]).then(([fc, pc]) => ({
    colorClasses: fc.colorClasses, polyhedronContacts: fc.polyhedronContacts,
    delaunayContacts: fc.delaunayContacts, discretePool: pc.discretePool,
})).catch((e) => {
    console.info('[colors] desktop face coloring not available, using a simple palette:', e.message);
    return null;
});
export { cuspNull, horoballInBall, delaunayOrbit } from '../../../../GeometryofLinearGroups/Geometric/Tools/Kleinian/poincare/js/cusps.js';
export { vertexClass, faceCentreHome } from '../../../../GeometryofLinearGroups/Geometric/Tools/Kleinian/poincare/js/gluing.js';
export { presentationTex } from '../../../../GeometryofLinearGroups/Geometric/Tools/Kleinian/poincare/js/presentation.js';
export { wordTex } from '../../../../GeometryofLinearGroups/Geometric/Tools/Kleinian/poincare/js/format.js';
export { readStateFromURL, encodeState } from '../../../../GeometryofLinearGroups/Geometric/Tools/Kleinian/poincare/js/permalink.js';
export { isRealGroup } from '../../../../GeometryofLinearGroups/Geometric/Tools/Kleinian/poincare/js/planar.js';

/** The desktop tool, for "open on desktop" links. */
export const DESKTOP_URL = '../../../GeometryofLinearGroups/Geometric/Tools/Kleinian/poincare/';
