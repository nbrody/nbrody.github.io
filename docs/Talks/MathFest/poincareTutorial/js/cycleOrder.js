/**
 * Poincaré edge-cycle order m = round(2π / Σθ), with a hard cap so a
 * zero/tiny angle sum cannot produce Infinity / multi-million P^m loops.
 */

export const MAX_CYCLE_ORDER = 10000;

/**
 * @param {number} angleSum
 * @returns {{ m: number|null, orderCheckable: boolean }}
 */
export function cycleOrderFromAngleSum(angleSum) {
    const mFloat = 2 * Math.PI / angleSum;
    const m = Number.isFinite(mFloat) && mFloat > 0 ? Math.round(mFloat) : null;
    const orderCheckable = Number.isSafeInteger(m) && m >= 1 && m <= MAX_CYCLE_ORDER;
    return { m, orderCheckable };
}
