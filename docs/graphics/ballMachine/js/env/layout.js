// Glasshouse environment — shared dimensions (metres, y up, origin = centre of floor).
import { bezier2 } from './util.js';

export const N_SIDES = 16;
export const APOTHEM = 14.0;                               // glass line (inner face of the glazing)
export const HALF_ANGLE = Math.PI / N_SIDES;
export const CIRCUM = APOTHEM / Math.cos(HALF_ANGLE);      // column centres (polygon vertices)
export const SIDE_LEN = 2 * APOTHEM * Math.tan(HALF_ANGLE);

export const PLINTH_R = 6.0;
export const PLINTH_TOP = 0.25;
export const WALK_OUTER = 7.5;          // walkway ring 6.0 .. 7.5
export const PATH_HALF = 0.75;          // radial paths along +z / -z, |x| < PATH_HALF
export const CURB_W = 0.22;
export const CURB_H = 0.32;
export const BED_INNER = WALK_OUTER + CURB_W;              // soil starts
export const BED_OUTER = 13.05;                            // soil ends (outer curb 13.05..13.27)
export const GRATE_INNER = BED_OUTER + CURB_W;             // heating-grate path to the dwarf wall
export const WALL_INNER = 13.88;                           // dwarf wall inner face (apothem)
export const WALL_OUTER = 14.25;
export const DWARF_TOP = 0.9;
export const PATH_CURB_X = PATH_HALF + CURB_W;

export const WALL_TOP = 8.3;            // top of glazing / underside of the architrave
export const CORNICE_TOP = 9.3;         // gallery floor level, dome springing
export const GALLERY_D = 1.1;           // gallery depth (inward from glass line)

// doors on faces 4 (+z) and 12 (-z)
export const DOOR_FACES = [4, 12];
export const DOOR_HALF = 1.121;
export const DOOR_TOP = 2.9;

// face k is centred at angle k*2π/N ; vertex k sits at (k-0.5)*2π/N
export const faceAngle = (k) => (k * 2 * Math.PI) / N_SIDES;
export const vertexAngle = (k) => ((k - 0.5) * 2 * Math.PI) / N_SIDES;

/** Radius of the polygon of given apothem along direction phi. */
export function polyRadius(apothem, phi) {
  const seg = (2 * Math.PI) / N_SIDES;
  let a = ((phi % seg) + seg) % seg;       // 0..seg, face centres at 0
  if (a > seg / 2) a -= seg;
  return apothem / Math.cos(a);
}

// ------------------------------------------------------------ dome profile ---
// Two cubic Béziers in (R = circumradius at the rib lines, y): convex lower bell,
// then a gentle concave (ogee) kick up into the lantern ring.
const SEG_A = [[CIRCUM, CORNICE_TOP], [CIRCUM, 13.4], [12.4, 16.65], [8.7, 18.35]];
const SEG_B = [[8.7, 18.35], [5.9, 19.62], [2.62, 19.72], [2.3, 20.35]];

const _prof = (() => {
  const pts = [];
  const n = 240;
  for (let i = 0; i <= n; i++) pts.push(bezier2(...SEG_A, i / n));
  for (let i = 1; i <= n; i++) pts.push(bezier2(...SEG_B, i / n));
  const L = [0];
  for (let i = 1; i < pts.length; i++) L.push(L[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return { pts, L, total: L[L.length - 1] };
})();

/** Dome profile by normalised arc length s ∈ [0,1] → [R, y]. */
export function domeAt(s) {
  const { pts, L, total } = _prof;
  const target = Math.min(1, Math.max(0, s)) * total;
  let lo = 0, hi = L.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (L[mid] < target) lo = mid; else hi = mid; }
  const t = (target - L[lo]) / (L[hi] - L[lo] || 1);
  return [pts[lo][0] + (pts[hi][0] - pts[lo][0]) * t, pts[lo][1] + (pts[hi][1] - pts[lo][1]) * t];
}
export const DOME_TOP_Y = domeAt(1)[1];
export const DOME_TOP_R = domeAt(1)[0];

/** Dome circumradius at height y (for clearance tests); returns CIRCUM below the springing. */
export function domeRadiusAtY(y) {
  if (y <= CORNICE_TOP) return CIRCUM;
  const { pts } = _prof;
  for (let i = 1; i < pts.length; i++) {
    if (pts[i][1] >= y) {
      const a = pts[i - 1], b = pts[i];
      const t = (y - a[1]) / (b[1] - a[1] || 1);
      return a[0] + (b[0] - a[0]) * t;
    }
  }
  return DOME_TOP_R;
}

export const LANTERN_H = 1.25;
export const LANTERN_R = DOME_TOP_R;

// ---------------------------------------------------------------- planting ---
/** Soil surface height in the beds (gentle mounding). */
export function soilHeight(x, z) {
  const r = Math.hypot(x, z);
  const t = Math.min(1, Math.max(0, (r - BED_INNER) / (BED_OUTER - BED_INNER)));
  const mound = Math.pow(Math.sin(Math.PI * t), 0.7) * 0.2;
  const wob = 0.035 * Math.sin(x * 0.9 + 1.3) * Math.sin(z * 0.8 - 0.4);
  return 0.26 + mound + wob * Math.sin(Math.PI * t);
}

/** Is (x,z) inside the planted beds (with an inset margin)? */
export function inBeds(x, z, margin = 0) {
  const r = Math.hypot(x, z);
  if (r < BED_INNER + margin || r > BED_OUTER - margin) return false;
  if (Math.abs(x) < PATH_CURB_X + margin) return false;
  return true;
}

/** Keep-out test for foliage points: machine cylinder, walls, gallery, dome. */
export function foliageAllowed(x, y, z) {
  const r = Math.hypot(x, z);
  if (r < 5.85) return false;                                  // machine envelope (+ margin)
  if (r > polyRadius(WALL_INNER, Math.atan2(z, x)) - 0.25) return false; // walls
  if (y > 8.1 && y < 10.6 && r > APOTHEM - GALLERY_D - 0.45) return false; // gallery & cornice
  if (y > 9.3 && r > domeRadiusAtY(y) * Math.cos(HALF_ANGLE) - 0.6) return false;
  return true;
}
