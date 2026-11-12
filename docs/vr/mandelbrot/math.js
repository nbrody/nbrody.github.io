/** Square image UVs (origin at bottom left) to a complex coordinate. */
export function pointFromUV(u, v, centre, span) {
  return [centre[0] + (u - .5) * span, centre[1] + (v - .5) * span];
}
export const SELECT_SCALE = 4095;
export function encodeUV(u, v) {
  const x = Math.round(Math.max(0, Math.min(1, u)) * SELECT_SCALE);
  const y = Math.round(Math.max(0, Math.min(1, v)) * SELECT_SCALE);
  return x + y * (SELECT_SCALE + 1);
}
export function decodeUV(tag) {
  return [(tag % (SELECT_SCALE + 1)) / SELECT_SCALE, Math.floor(tag / (SELECT_SCALE + 1)) / SELECT_SCALE];
}
