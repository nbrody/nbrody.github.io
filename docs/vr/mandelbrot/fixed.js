/** 256-bit signed fixed-point coordinates, matching the GOLG explorer. */
export const BITS = 256;
export const SCALE_BIG = 1n << 256n;
const SCALE = 2 ** BITS;
export const fx = n => BigInt(Math.round(n * SCALE));
export const fd = n => Number(n) / SCALE;
export function parseFx(s) {
  const m = /^\s*([+-]?)(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?\s*$/.exec(String(s));
  if (!m || !(m[2] || m[3])) throw new Error(`Invalid coordinate: ${s}`);
  const sign = m[1] === '-' ? -1n : 1n;
  const digits = BigInt((m[2] || '0') + (m[3] || ''));
  const exp = Number(m[4] || 0) - (m[3] || '').length;
  return sign * (exp >= 0 ? digits * 10n ** BigInt(exp) * SCALE_BIG : digits * SCALE_BIG / 10n ** BigInt(-exp));
}
export function formatFx(x, places = 8) {
  const sign = x < 0n ? '−' : ''; if (x < 0n) x = -x;
  const base = 10n ** BigInt(places), rounded = (x * base + SCALE_BIG / 2n) / SCALE_BIG;
  return sign + (rounded / base).toString() + (places ? '.' + (rounded % base).toString().padStart(places, '0') : '');
}
export const pointAtUV = (u,v,center,width) => [center[0]+fx((u-.5)*width), center[1]+fx((v-.5)*width)];
/** Exact fixed-point orbit; useful for checking a reference and local perturbations. */
export function orbitFixed(cx,cy,limit,bits=BITS) {
  let zr=0n,zi=0n; const p=BigInt(bits), p1=p-1n, out=[[zr,zi]];
  for(let i=0;i<limit;i++) { const next=((zr*zr-zi*zi)>>p)+cx; zi=((zr*zi)>>p1)+cy; zr=next;out.push([zr,zi]); }
  return out;
}
