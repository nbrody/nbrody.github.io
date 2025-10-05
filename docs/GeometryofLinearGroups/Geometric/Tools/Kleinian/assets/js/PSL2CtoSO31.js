// PSL2CtoSO31.js
// Given g = [[a,b],[c,d]] in SL2(C), compute the corresponding element of SO^+(3,1)
// via the standard action on 2x2 Hermitian matrices: H -> g H g^†.
// We identify Minkowski vectors (t,x,y,z) with Hermitian matrices
//   H(t,x,y,z) = [[t+z, x - i y], [x + i y, t - z]]
// so that det(H) = t^2 - x^2 - y^2 - z^2.
// The resulting 4x4 real matrix Λ satisfies v' = Λ v for v ∈ R^{3,1}.

// ------------------ Complex helpers ------------------
function toC(z) {
  if (typeof z === 'number') return { re: z, im: 0 };
  if (z && typeof z.re === 'number' && typeof z.im === 'number') return { re: z.re, im: z.im };
  throw new Error('Complex inputs must be numbers or {re,im} objects');
}
function C(re, im) { return { re, im }; }
function cAdd(z, w) { return C(z.re + w.re, z.im + w.im); }
function cSub(z, w) { return C(z.re - w.re, z.im - w.im); }
function cMul(z, w) { return C(z.re * w.re - z.im * w.im, z.re * w.im + z.im * w.re); }
function cConj(z) { return C(z.re, -z.im); }

// 2x2 complex matrix helpers
function cMatMul2(A, B) {
  // A,B are [[z11,z12],[z21,z22]] with complex entries
  return [
    [ cAdd(cMul(A[0][0], B[0][0]), cMul(A[0][1], B[1][0]) ),
      cAdd(cMul(A[0][0], B[0][1]), cMul(A[0][1], B[1][1]) ) ],
    [ cAdd(cMul(A[1][0], B[0][0]), cMul(A[1][1], B[1][0]) ),
      cAdd(cMul(A[1][0], B[0][1]), cMul(A[1][1], B[1][1]) ) ]
  ];
}
function cMatAdjoint2(A) {
  // conjugate transpose
  return [
    [ cConj(A[0][0]), cConj(A[1][0]) ],
    [ cConj(A[0][1]), cConj(A[1][1]) ]
  ];
}

// ------------------ Minkowski <-> Hermitian ------------------
function hermitianFromVec(v) {
  const [t, x, y, z] = v;
  // H = [[t+z, x - i y],[x + i y, t - z]]
  return [
    [ C(t + z, 0), C(x, -y) ],
    [ C(x,  y),   C(t - z, 0) ]
  ];
}
function vecFromHermitian(H) {
  // H must be Hermitian
  const t = (H[0][0].re + H[1][1].re) / 2;
  const z = (H[0][0].re - H[1][1].re) / 2;
  const x = H[0][1].re;      // off-diagonal real part
  const y = -H[0][1].im;     // since H01 = x - i y
  return [t, x, y, z];
}

// ------------------ Main map ------------------
/**
 * Compute the 4x4 real matrix in SO^+(3,1) corresponding to g ∈ SL2(C).
 * Inputs a,b,c,d may be numbers (treated as real) or objects {re,im}.
 * The result is a 4x4 array of real numbers; columns are Λ(e_0), Λ(e_1), Λ(e_2), Λ(e_3).
 */
export function PSL2CtoSO31(a, b, c, d) {
  const A = toC(a), B = toC(b), Cc = toC(c), D = toC(d);

  // Build g and its adjoint
  const g = [ [A, B], [Cc, D] ];
  const gAdj = cMatAdjoint2(g);

  // Basis vectors of R^{3,1}
  const basis = [
    [1,0,0,0], // e0
    [0,1,0,0], // e1
    [0,0,1,0], // e2
    [0,0,0,1]  // e3
  ];

  // Compute images of basis under H -> g H g^†, then convert back to vectors
  const columns = basis.map(v => {
    const H = hermitianFromVec(v);
    const gHgAdj = cMatMul2( cMatMul2(g, H), gAdj );
    return vecFromHermitian(gHgAdj);
  });

  // Assemble 4x4 Λ with columns = images; ensure entries are real (small imprecisions -> round)
  const Lambda = Array.from({ length: 4 }, (_, r) =>
    columns.map(col => {
      const val = col[r];
      // Tiny numerical noise guard
      const eps = 1e-14;
      return Math.abs(val) < eps ? 0 : val;
    })
  );

  return Lambda; // 4x4 array, real, determinant +1, preserves diag(1,-1,-1,-1)
}

// Convenience: accept a 2x2 matrix of complex entries
export function PSL2CtoSO31_fromMatrix(g) {
  if (!Array.isArray(g) || g.length !== 2 || g[0].length !== 2 || g[1].length !== 2) {
    throw new Error('Input must be a 2x2 matrix [[a,b],[c,d]]');
  }
  return PSL2CtoSO31(g[0][0], g[0][1], g[1][0], g[1][1]);
}

// ------------------ Simple sanity checks (can be removed) ------------------
// Identity -> identity
// const I = PSL2CtoSO31(1,0,0,1);
// console.log('Λ(I)=', I);

// Example real element: S = [[0,-1],[1,0]]; should be a spatial inversion in x,z plane combined appropriately.
// const S = PSL2CtoSO31(0,-1,1,0);
// console.log('Λ(S)=', S);

// ================== sDF utilities (UI-safe) ==================
const __ETA = [1, -1, -1, -1];
function __etaApply(v){ return [v[0], -v[1], -v[2], -v[3]]; }
function __stdBasis(j){
  return [0,0,0,0].map((_,k)=> (k===j?1:0));
}
// Compute g^{-1} e_j using g^{-1} = η g^T η and the fact that η e_j = s e_j, s = η_jj
function __ginv_ej(g, j){
  const s = (j===0)? 1 : -1;               // signature of e_j
  const r = g[j];                           // row j of g
  // w = g^{-1} e_j = s * η * (row_j(g))^T
  return [ s * r[0], -s * r[1], -s * r[2], -s * r[3] ];
}

/**
 * Generalized sDF construction following the user's hierarchy:
 * Try j=0,1,2,3 in order. If g(e_j) = e_j (equivalently g^{-1}e_j = e_j), skip to next j.
 * Otherwise choose ℓ so that ℓ(e_j)=1 and ℓ(g^{-1}e_j)=-1.
 * Returns { row: number[4], pivot: j }.
 */
export function sDF_autoFromSO31(g){
  if (!Array.isArray(g) || g.length !== 4 || g.some(r=>!Array.isArray(r)||r.length!==4)) {
    throw new Error('sDF_autoFromSO31 expects a 4x4 matrix');
  }
  const eps = 1e-14;
  for (let j=0; j<4; j++){
    const s = (j===0)? 1 : -1; // signature of e_j
    const w = __ginv_ej(g, j); // w = g^{-1} e_j
    const denom = s*(w[j] - 1); // ⟨w - e_j, e_j⟩
    if (Math.abs(denom) < eps){
      // g fixes e_j, try next
      continue;
    }
    // u = w - e_j
    const e = __stdBasis(j);
    const u = [ w[0]-e[0], w[1]-e[1], w[2]-e[2], w[3]-e[3] ];
    // ℓ = η u / denom (row covector)
    const eta_u = __etaApply(u);
    const row = eta_u.map(x=>x/denom);
    return { row, pivot: j };
  }
  throw new Error('sDF undefined: g fixes e₀,e₁,e₂,e₃');
}

// Backwards-compatible wrapper: force pivot j=0 when possible, otherwise fall back to auto
export function sDF_fromSO31(g){
  {
    // Backwards-compatible wrapper: force pivot j=0 when possible, otherwise fall back to auto
    try{
      const { row } = (function forceJ0(){
        const eps = 1e-14;
        const j = 0, s = 1;                    // time-like basis vector e0
        const w = (function __ginv_e0(g){ const r0 = g[0]; return [ r0[0], -r0[1], -r0[2], -r0[3] ]; })(g);
        const denom = w[0] - 1;
        if (Math.abs(denom) < eps) throw new Error('pivot0');
        const u = [ w[0]-1, w[1], w[2], w[3] ];
        const eta_u = [ u[0], -u[1], -u[2], -u[3] ];
        return { row: eta_u.map(x=>x/denom) };
      })();
      return row;
    }catch(_){
      const { row } = sDF_autoFromSO31(g);
      return row;
    }
  }
}

// ================== TESTER UI ==================
function __parseComplex(s){
  if (typeof s === 'number') return {re:s, im:0};
  s = (s||'').toString().trim();
  if (s === '') return {re:0, im:0};
  // Allow forms: a, a+bi, a-bi, bi, i, -i
  const iOnly = /^([+-]?)(?:i|1i)$/i;
  if (iOnly.test(s)) return {re:0, im: s.startsWith('-') ? -1 : 1};
  const bi = /^([+-]?(?:\d+(?:\.\d+)?))?([+-](?:\d+(?:\.\d+)?))?i$/i;
  if (bi.test(s)){
    const m = s.match(bi);
    const re = m[1] ? parseFloat(m[1]) : 0;
    const im = m[2] ? parseFloat(m[2]) : (s.includes('-') ? -1 : 1);
    return {re, im};
  }
  const a_plus_bi = /^([+-]?\d+(?:\.\d+)?)([+-]\d+(?:\.\d+)?)i$/i;
  const a_only = /^([+-]?\d+(?:\.\d+)?)$/;
  if (a_plus_bi.test(s)){
    const m = s.match(a_plus_bi);
    return {re: parseFloat(m[1]), im: parseFloat(m[2])};
  }
  if (a_only.test(s)) return {re: parseFloat(s), im: 0};
  // Fallback: try to split on 'i'
  if (s.endsWith('i')){
    const core = s.slice(0,-1);
    if (core === '' || core === '+') return {re:0, im:1};
    if (core === '-') return {re:0, im:-1};
    const num = parseFloat(core);
    if (!Number.isNaN(num)) return {re:0, im:num};
  }
  throw new Error(`Cannot parse complex: "${s}"`);
}

function __formatMatrix4(M){
  return M.map(row => row.map(x => Math.abs(x) < 1e-12 ? 0 : +x.toFixed(8)));
}

function __formatRow(v){
  return v.map(x => Math.abs(x) < 1e-12 ? 0 : +x.toFixed(8));
}

export function attachPSL2CtoSO31Tester(containerSelector){
  const root = (typeof containerSelector === 'string') ? document.querySelector(containerSelector) : containerSelector;
  if (!root) throw new Error('attachPSL2CtoSO31Tester: container not found');
  root.innerHTML = '';
  const wrapper = document.createElement('div');
  wrapper.style.maxWidth = '920px';
  wrapper.style.margin = '1rem auto';
  wrapper.style.fontFamily = 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial';
  wrapper.style.lineHeight = '1.35';

  wrapper.innerHTML = `
    <h2 style="margin:0 0 .5rem 0">PSL₂(ℂ) → SO⁺(3,1) Tester</h2>
    <p style="margin:.25rem 0 .75rem 0">Enter <code>a,b,c,d</code> (e.g. <code>1</code>, <code>0</code>, <code>i</code>, <code>1-2i</code>). Click Compute.</p>
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:.5rem;align-items:end">
      <label> a<input id="psl-a" type="text" value="1" style="width:100%"></label>
      <label> b<input id="psl-b" type="text" value="0" style="width:100%"></label>
      <label> c<input id="psl-c" type="text" value="0" style="width:100%"></label>
      <label> d<input id="psl-d" type="text" value="1" style="width:100%"></label>
    </div>
    <div style="margin:.5rem 0; display:flex; gap:.5rem; flex-wrap:wrap">
      <button id="psl-compute">Compute</button>
      <button id="psl-S">Use S = [[0,-1],[1,0]]</button>
      <button id="psl-T">Use T = [[1,1],[0,1]]</button>
    </div>
    <div id="psl-out"></div>
  `;
  root.appendChild(wrapper);

  const el = id => wrapper.querySelector(id);
  const out = el('#psl-out');

  function readInputs(){
    const a = __parseComplex(el('#psl-a').value);
    const b = __parseComplex(el('#psl-b').value);
    const c = __parseComplex(el('#psl-c').value);
    const d = __parseComplex(el('#psl-d').value);
    return {a,b,c,d};
  }

  function render(){
    try{
      const {a,b,c,d} = readInputs();
      const M = PSL2CtoSO31(a,b,c,d);
      const auto = sDF_autoFromSO31(M);
      const sdf = auto.row;               // row covector
      const pivot = auto.pivot;           // which e_j was used
      const Mfmt = __formatMatrix4(M);
      const sdfFmt = __formatRow(sdf);
      out.innerHTML = `
        <h3 style="margin:.75rem 0 .25rem 0">Λ ∈ SO⁺(3,1)</h3>
        <table style="border-collapse:collapse; font-family:inherit">
          ${Mfmt.map(r=>`<tr>${r.map(x=>`<td style='border:1px solid #ddd;padding:.25rem .5rem;text-align:right'>${x}</td>`).join('')}</tr>`).join('')}
        </table>
        <h3 style="margin:.75rem 0 .25rem 0">sDF(g) as row covector</h3>
        <div><code>[ ${sdfFmt.join(', ')} ]</code></div>
        <small>Chosen pivot: e<sub>${pivot}</sub>; constraints: sDF(e<sub>${pivot}</sub>) = 1 and sDF(g<sup>-1</sup>e<sub>${pivot}</sub>) = -1</small>
      `;
    }catch(e){
      out.innerHTML = `<div style='color:#b00'>${e.message}</div>`;
    }
  }

  el('#psl-compute').onclick = render;
  el('#psl-S').onclick = () => { el('#psl-a').value='0'; el('#psl-b').value='-1'; el('#psl-c').value='1'; el('#psl-d').value='0'; render(); };
  el('#psl-T').onclick = () => { el('#psl-a').value='1'; el('#psl-b').value='1'; el('#psl-c').value='0'; el('#psl-d').value='1'; render(); };

  render();
}