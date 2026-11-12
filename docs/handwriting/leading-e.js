'use strict';
// Isolated handwriting strokes for the opt-in leading-E workaround.
const REVIEWED_E_STROKES = [[[0.177,-1.007],[0.169,-0.968],[0.167,-0.929],[0.167,-0.89],[0.169,-0.851],[0.172,-0.812],[0.177,-0.772],[0.182,-0.733],[0.187,-0.694],[0.193,-0.655],[0.199,-0.616],[0.205,-0.578],[0.211,-0.539],[0.215,-0.5],[0.219,-0.46],[0.221,-0.421],[0.223,-0.382],[0.223,-0.343],[0.223,-0.303],[0.22,-0.264],[0.215,-0.225],[0.208,-0.244],[0.211,-0.284],[0.215,-0.323]],[[0.137,-0.968],[0.152,-0.996],[0.191,-1.0],[0.229,-1.003],[0.268,-1.006],[0.307,-1.01],[0.345,-1.015],[0.384,-1.02],[0.422,-1.024],[0.461,-1.029],[0.499,-1.035],[0.538,-1.041],[0.576,-1.047],[0.614,-1.054],[0.652,-1.06],[0.691,-1.065],[0.729,-1.07],[0.768,-1.074],[0.806,-1.072]],[[0.235,-0.594],[0.266,-0.59],[0.304,-0.595],[0.341,-0.6],[0.378,-0.605],[0.415,-0.611],[0.452,-0.617],[0.49,-0.622],[0.527,-0.627],[0.564,-0.632],[0.601,-0.637],[0.639,-0.641],[0.676,-0.644],[0.714,-0.643]],[[0.251,-0.243],[0.29,-0.241],[0.328,-0.244],[0.366,-0.248],[0.405,-0.252],[0.443,-0.256],[0.481,-0.261],[0.519,-0.265],[0.557,-0.27],[0.595,-0.274],[0.633,-0.278],[0.672,-0.281],[0.71,-0.283],[0.749,-0.285],[0.787,-0.286],[0.826,-0.286],[0.864,-0.284]]];

function supportsLeadingE(text) {
  return text === 'E' || (typeof text === 'string' && !/[\r\n]/.test(text) && /^E[a-z][\x20-\x7e]*$/.test(text) && !text.slice(1).includes('E'));
}

function quantile(values, q) {
  const sorted = [...values].sort((a, b) => a - b);
  const at = (sorted.length - 1) * q, lower = Math.floor(at), upper = Math.ceil(at);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (at - lower);
}

function sourcePoints(yShift = 0) {
  return REVIEWED_E_STROKES.flatMap(stroke => stroke.map(([x, y], i) => ({
    x, y: y + yShift, lift: i === stroke.length - 1
  })));
}

function pointBounds(points) {
  if (!points.length || points.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y))) return null;
  const xs = points.map(p => p.x), ys = points.map(p => p.y);
  return {loX: Math.min(...xs), hiX: Math.max(...xs), loY: Math.min(...ys), hiY: Math.max(...ys)};
}

function standaloneE() {
  const points = sourcePoints(), bounds = pointBounds(points);
  return {points, loX: bounds.loX, hiX: bounds.hiX};
}

function prependE(remainder) {
  if (!remainder || !Array.isArray(remainder.points)) return null;
  const bounds = pointBounds(remainder.points);
  if (!bounds || bounds.hiY - bounds.loY > 4 || bounds.hiX - bounds.loX > 80) return null;
  const source = sourcePoints(), sourceBounds = pointBounds(source);
  const yShift = quantile(remainder.points.map(p => p.y), .8) - quantile(source.map(p => p.y), .95);
  if (!Number.isFinite(yShift) || Math.abs(yShift) > 1.5) return null;
  const xShift = sourceBounds.hiX + .06 - bounds.loX;
  const points = sourcePoints(yShift).concat(remainder.points.map(p => ({x: p.x + xShift, y: p.y, lift: Boolean(p.lift)})));
  const combined = pointBounds(points);
  return combined ? {points, loX: combined.loX, hiX: combined.hiX} : null;
}

const leadingE = Object.freeze({supportsLeadingE, standaloneE, prependE});
if (typeof module !== 'undefined' && module.exports) module.exports = leadingE;
else globalThis.HandwritingLeadingE = leadingE;
