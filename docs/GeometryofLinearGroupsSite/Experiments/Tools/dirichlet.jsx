import React, { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";

/**
 * Dirichlet domain visualizer for groups of PSL(2, C) in the upper half-space model of H^3.
 *
 * Math overview (implemented below):
 * - Identify basepoint o = j = (0, 0, 1).
 * - For each nontrivial g in Γ, compute the bisector between o and g·o.
 * - Using the Hermitian matrix model of H^3: points X(w,t) = (1/t) [[|w|^2 + t^2, w], [\bar w, 1]].
 * - Distance equality d(X, I) = d(X, Q) (with Q = g g*) simplifies to tr((I - Q^{-1}) X) = 0.
 * - For A = I - Q^{-1} = [[α, β̄], [β, δ]], the bisector is
 *     α(|w|^2 + t^2) + 2 Re(β w) + δ = 0.
 *   If α ≠ 0, this is a hemisphere (center c = -\overline{β}/α, radius^2 = |β|^2/α^2 - δ/α).
 *   If α = 0, it is a vertical plane: 2 Re(β w) + δ = 0.
 * - The Dirichlet half-space (points closer to o than g·o) satisfies α(|w|^2 + t^2) + 2 Re(β w) + δ ≤ 0.
 *
 * Rendering strategy:
 * 1) Generate group words up to length L from user-provided generators (and inverses).
 * 2) For each element, compute a bisector surface and render it (hemisphere/plane) semi-transparently.
 * 3) Approximate the Dirichlet region as a point cloud by sampling (x,y,t) and testing all half-space inequalities.
 * 4) Show orbit points g·o to give geometric scale.
 *
 * Notes:
 * - All matrices are normalized to det = 1 (PSL(2,C)) by scaling with 1/sqrt(det).
 * - Numerics are delicate; use the tolerance sliders if a face looks “inside out.”
 */
 
// -------------------- Complex helpers --------------------
class C {
  constructor(re = 0, im = 0) { this.re = re; this.im = im; }
  static from(x) { return x instanceof C ? x : new C(x, 0); }
  static add(a,b){ return new C(a.re+b.re, a.im+b.im); }
  static sub(a,b){ return new C(a.re-b.re, a.im-b.im); }
  static mul(a,b){ return new C(a.re*b.re - a.im*b.im, a.re*b.im + a.im*b.re); }
  static div(a,b){ const d = b.re*b.re + b.im*b.im || 1e-16; return new C((a.re*b.re + a.im*b.im)/d, (a.im*b.re - a.re*b.im)/d); }
  static conj(a){ return new C(a.re, -a.im); }
  static abs2(a){ return a.re*a.re + a.im*a.im; }
  static sqrt(a){
    const r = Math.hypot(a.re, a.im);
    const u = Math.sqrt((r + a.re) / 2);
    const v = (a.im>=0 ? 1 : -1) * Math.sqrt(Math.max(0,(r - a.re) / 2));
    return new C(u, v);
  }
  toString(){
    const r = this.re.toFixed(6);
    const i = this.im.toFixed(6);
    if (Math.abs(this.im) < 1e-12) return `${r}`;
    if (Math.abs(this.re) < 1e-12) return `${i}i`;
    return `${r}${this.im>=0 ? "+" : "-"}${Math.abs(this.im).toFixed(6)}i`;
  }
}

function parseComplex(str){
  // Accepts forms like: 3, -2.1, 4i, -0.5i, 3+2i, 3-2i, (3+2i)
  const s = (str||"").trim().replace(/[()\s]/g,"");
  if (!s) return new C(0,0);
  // Pure imaginary like 'i' or '-i'
  if (s === 'i') return new C(0,1);
  if (s === '-i') return new C(0,-1);
  // Contains 'i'
  if (/i/i.test(s)){
    // Split into real and imaginary parts
    const m = s.match(/^([+-]?[0-9]*\.?[0-9]+)?([+-][0-9]*\.?[0-9]+)?i$/i);
    if (m){
      const re = m[1] ? parseFloat(m[1]) : 0;
      const im = m[2] ? parseFloat(m[2]) : (s.startsWith('-')? -1 : 1);
      return new C(re, im);
    }
    // General a+bi or a-bi
    const m2 = s.match(/^([+-]?[0-9]*\.?[0-9]+)([+-][0-9]*\.?[0-9]+)i$/i);
    if (m2){
      return new C(parseFloat(m2[1]), parseFloat(m2[2]));
    }
    // '3i' style
    const m3 = s.match(/^([+-]?[0-9]*\.?[0-9]+)i$/i);
    if (m3){
      return new C(0, parseFloat(m3[1]));
    }
  }
  // Pure real
  const val = parseFloat(s);
  if (!isNaN(val)) return new C(val,0);
  // Fallback
  return new C(0,0);
}

// -------------------- 2x2 Complex matrices --------------------
class M2C {
  // entries in row-major: [a,b; c,d]
  constructor(a,b,c,d){ this.a=C.from(a); this.b=C.from(b); this.c=C.from(c); this.d=C.from(d); }
  static I(){ return new M2C(new C(1,0), new C(0,0), new C(0,0), new C(1,0)); }
  clone(){ return new M2C(this.a, this.b, this.c, this.d); }
  static mul(X,Y){
    const a = C.add(C.mul(X.a,Y.a), C.mul(X.b,Y.c));
    const b = C.add(C.mul(X.a,Y.b), C.mul(X.b,Y.d));
    const c = C.add(C.mul(X.c,Y.a), C.mul(X.d,Y.c));
    const d = C.add(C.mul(X.c,Y.b), C.mul(X.d,Y.d));
    return new M2C(a,b,c,d);
  }
  static det(X){
    const ad = C.mul(X.a, X.d);
    const bc = C.mul(X.b, X.c);
    return C.sub(ad, bc);
  }
  static scale(X, s){ return new M2C(C.mul(X.a,s), C.mul(X.b,s), C.mul(X.c,s), C.mul(X.d,s)); }
  static conjT(X){ return new M2C(C.conj(X.a), C.conj(X.c), C.conj(X.b), C.conj(X.d)); }
  static inv(X){
    const det = M2C.det(X);
    const invDet = C.div(new C(1,0), det);
    return new M2C(C.mul(X.d,invDet), C.mul(new C(-X.b.re,-X.b.im),invDet), C.mul(new C(-X.c.re,-X.c.im),invDet), C.mul(X.a,invDet));
  }
  static normalizeSL2(X){
    const det = M2C.det(X);
    const s = C.sqrt(det); // s^2 = det
    const invs = C.div(new C(1,0), s);
    return M2C.scale(X, invs);
  }
}

// Action on H^3 upper half-space at basepoint j = (w=0, t=1):
// Using Hermitian model: Q = g g* corresponds to g·j.
function hermitian_Q_from_g(g){
  const ggstar = M2C.mul(g, M2C.conjT(g)); // positive Hermitian
  return ggstar;
}

// Recover (w, t) from Hermitian Q with det=1: Q = [[A, B̄], [B, D]].
// For j mapped by g: Q = g g*. Then
//   t = 1 / Q[1,1] = 1 / D,
//   w = Q[0,1] / Q[1,1] = B̄ / D  (careful with conjugation consistency below)
function pointFromHermitian(Q){
  // Q = [[A, conj(B)], [B, D]], with A,D real; B complex
  const A = Q.a; // should be real
  const Bconj = Q.b; // this is upper-right = conj(B)
  const B = C.conj(Bconj);
  const D = Q.d; // should be real
  const Dre = D.re;
  const t = 1 / (Dre !== 0 ? Dre : 1e-9);
  const w = C.div(B, new C(Dre, 0));
  return { w, t };
}

// Bisector data from A = I - (g g*)^{-1}
function bisectorFromG(g){
  // Ensure det=1
  const gSL = M2C.normalizeSL2(g);
  const Q = hermitian_Q_from_g(gSL);
  const Qinv = M2C.inv(Q);
  // A = I - Q^{-1}
  const I = M2C.I();
  const A = new M2C(
    new C(I.a.re - Qinv.a.re, I.a.im - Qinv.a.im),
    new C(I.b.re - Qinv.b.re, I.b.im - Qinv.b.im),
    new C(I.c.re - Qinv.c.re, I.c.im - Qinv.c.im),
    new C(I.d.re - Qinv.d.re, I.d.im - Qinv.d.im),
  );
  // Hermitian sanity (symmetrize lightly)
  const alpha = new C((A.a.re + A.a.re)/2, 0); // real
  const delta = new C((A.d.re + A.d.re)/2, 0); // real
  const beta = new C((A.c.re + A.b.re)/2, (A.c.im - A.b.im)/2); // average lower-left with conj upper-right
  // If |alpha| small => vertical plane: 2 Re(beta w) + δ = 0
  const tol = 1e-10;
  if (Math.abs(alpha.re) < tol){
    return { type: "plane", alpha: alpha.re, beta, delta: delta.re };
  }
  // Hemisphere: center c = -conj(beta)/alpha, radius^2 = |beta|^2/alpha^2 - delta/alpha
  const alphaR = alpha.re;
  const c = C.div(new C(-beta.re, beta.im), new C(alphaR, 0)); // -conj(beta)/alpha -> conj(beta) = (beta.re, -beta.im); but we used ( -beta.re, +beta.im ) to get -conj(beta)
  const betaAbs2 = C.abs2(beta);
  const r2 = betaAbs2/(alphaR*alphaR) - (delta.re/alphaR);
  return { type: "sphere", alpha: alphaR, beta, delta: delta.re, center: c, r2 };
}

// Evaluate the half-space inequality s(w,t) = α(|w|^2 + t^2) + 2 Re(β w) + δ ≤ 0
function bisectorSide(bis, w, t){
  const x = w.re, y = w.im;
  const beta = bis.beta;
  const twoRe = 2*(beta.re * x - beta.im * y);
  const s = bis.alpha * (x*x + y*y + t*t) + twoRe + bis.delta;
  return s;
}

// -------------------- Word generation --------------------
function inverses(mats){
  return mats.map(M2C.inv);
}

// Reduced word generator up to length L
function generateWords(gens, L){
  // gens: array of M2C; include inverses as separate symbols to avoid inversions each step
  const syms = [];
  gens.forEach((g,i)=>{ syms.push({ M: g, i, inv:false}); });
  inverses(gens).forEach((g,i)=>{ syms.push({ M: g, i, inv:true}); });

  const words = [{M: M2C.I(), w: []}];
  const seen = new Map();
  const keyOf = (M)=>{
    // hash by rounded entries
    const r = (z)=>`${z.re.toFixed(9)},${z.im.toFixed(9)}`;
    return [M.a,M.b,M.c,M.d].map(r).join("|");
  };
  seen.set(keyOf(M2C.I()), true);

  for (let len=1; len<=L; len++){
    const newWords = [];
    for (const base of words.filter(p=>p.w.length===len-1)){
      const last = base.w[base.w.length-1];
      for (const s of syms){
        // Avoid immediate cancellation: don't append g and g^{-1} of same generator index
        if (last && last.i === s.i && last.inv !== s.inv) continue;
        const M = M2C.mul(base.M, s.M);
        const k = keyOf(M);
        if (!seen.has(k)){
          seen.set(k, true);
          newWords.push({ M, w: [...base.w, s]});
        }
      }
    }
    words.push(...newWords);
  }

  return words.map(p=>p.M);
}

// Compute orbit points g·j for a list of elements
function orbitPoints(elems){
  const pts = [];
  for (const g of elems){
    const gSL = M2C.normalizeSL2(g);
    const Q = hermitian_Q_from_g(gSL);
    const pt = pointFromHermitian(Q);
    pts.push(pt);
  }
  return pts;
}

// -------------------- THREE Scene --------------------
function useThreeScene(){
  const mountRef = useRef(null);
  const stateRef = useRef({ width: 900, height: 600 });
  const apiRef = useRef({});

  useEffect(()=>{
    const mount = mountRef.current;
    const width = mount.clientWidth || 900;
    const height = 600;
    stateRef.current = { width, height };

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b0f12);

    const camera = new THREE.PerspectiveCamera(55, width/height, 0.01, 5000);
    camera.position.set(6, -10, 6);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio || 1);
    renderer.setSize(width, height);
    renderer.localClippingEnabled = true; // enable clipping planes (for z>=0)
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    // Lights
    const hemi = new THREE.HemisphereLight(0xffffff, 0x334455, 0.75);
    scene.add(hemi);
    const dir = new THREE.DirectionalLight(0xffffff, 0.9);
    dir.position.set(6,6,10);
    scene.add(dir);

    // Boundary plane (z=0) grid
    const grid = new THREE.GridHelper(40, 40, 0x222a32, 0x1a1f25);
    // THREE's GridHelper lies in XZ plane; we want XY at z=0: rotate to XY
    grid.rotation.x = Math.PI / 2; // XZ->XY
    grid.position.z = 0.0001; // slightly above to avoid z-fighting with clipping
    scene.add(grid);

    const axes = new THREE.AxesHelper(4);
    scene.add(axes);

    const clippingPlanes = [ new THREE.Plane(new THREE.Vector3(0,0,-1), 0) ]; // keep z >= 0

    const objectsGroup = new THREE.Group(); // hemispheres / planes
    const orbitGroup = new THREE.Group(); // orbit points g·j
    const cloudGroup = new THREE.Group(); // point cloud for domain
    scene.add(objectsGroup);
    scene.add(orbitGroup);
    scene.add(cloudGroup);

    function clearGroup(g){ while(g.children.length) g.remove(g.children[0]); }

    function render(){
      controls.update();
      renderer.render(scene, camera);
      requestAnimationFrame(render);
    }
    render();

    const onResize = ()=>{
      const w = mount.clientWidth || 900;
      const h = 600;
      stateRef.current = { width: w, height: h };
      camera.aspect = w/h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);

    apiRef.current = {
      scene, camera, renderer, controls,
      objectsGroup, orbitGroup, cloudGroup,
      clippingPlanes,
      clear(){ clearGroup(objectsGroup); clearGroup(orbitGroup); clearGroup(cloudGroup); },
      addMesh(m){ objectsGroup.add(m); },
      addOrbitPoint(p){ orbitGroup.add(p); },
      addCloudPoints(ptsMesh){ cloudGroup.add(ptsMesh); },
      setShowGrid(v){ grid.visible = v; },
    };

    return ()=>{
      window.removeEventListener('resize', onResize);
      renderer.dispose();
      mount.removeChild(renderer.domElement);
    };
  },[]);

  return { mountRef, apiRef };
}

// -------------------- UI Component --------------------
function ComplexInput({ value, onChange, placeholder }){
  return (
    <Input className="w-full" value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder||"a+bi"} />
  );
}

function MatrixEditor({ matrix, onChange }){
  // matrix is { a, b, c, d } strings
  const update = (key, val)=> onChange({ ...matrix, [key]: val });
  return (
    <div className="grid grid-cols-2 gap-2">
      <ComplexInput value={matrix.a} onChange={(v)=>update('a', v)} placeholder="a" />
      <ComplexInput value={matrix.b} onChange={(v)=>update('b', v)} placeholder="b" />
      <ComplexInput value={matrix.c} onChange={(v)=>update('c', v)} placeholder="c" />
      <ComplexInput value={matrix.d} onChange={(v)=>update('d', v)} placeholder="d" />
    </div>
  );
}

function ExampleGenerators({ onUse }){
  const examples = [
    {
      name: "Two loxodromics (toy)",
      gens: [
        { a:"1.2", b:"0.4+0.2i", c:"0", d:"1/1.2" },
        { a:"1.1", b:"0.25-0.35i", c:"0.05i", d:"1/1.1" },
      ]
    },
    {
      name: "Fuchsian-like (upper triangular)",
      gens: [
        { a:"1", b:"1", c:"0", d:"1" },
        { a:"1", b:"0", c:"1", d:"1" },
      ]
    },
  ];
  return (
    <div className="space-y-2">
      {examples.map((ex, idx)=> (
        <Button key={idx} variant="secondary" className="w-full" onClick={()=>onUse(ex.gens)}>
          Use: {ex.name}
        </Button>
      ))}
    </div>
  );
}

export default function DirichletH3App(){
  const { mountRef, apiRef } = useThreeScene();
  const [generators, setGenerators] = useState([
    { a:"1", b:"1", c:"0", d:"1" },
  ]);
  const [maxLen, setMaxLen] = useState([4]);
  const [sampleCount, setSampleCount] = useState([15000]);
  const [epsBoundary, setEpsBoundary] = useState([0.015]);
  const [showBisectors, setShowBisectors] = useState(true);
  const [showOrbit, setShowOrbit] = useState(true);
  const [showCloud, setShowCloud] = useState(true);
  const [gridVisible, setGridVisible] = useState(true);
  const [log, setLog] = useState("");

  const appendLog = (s)=> setLog(prev => (prev + s + "\n"));

  const addGenerator = ()=> setGenerators([...generators, {a:"1", b:"0", c:"0", d:"1"}]);
  const removeGenerator = (idx)=> setGenerators(generators.filter((_,i)=>i!==idx));
  const updateGenerator = (idx, mat)=> setGenerators(generators.map((m,i)=> i===idx? mat : m));

  // Build & Render
  const build = ()=>{
    const api = apiRef.current;
    if (!api.scene) return;

    api.setShowGrid(gridVisible);
    api.clear();
    appendLog("Parsing generators and building words...");

    // Parse matrices
    const gens = [];
    for (const m of generators){
      // Allow simple fractions like "1/1.2"
      const parseMaybeFrac = (s)=>{
        const t = (s||"").trim();
        if (t.includes('/') && !/i/i.test(t)){
          const [p,q] = t.split('/')
          const v = parseFloat(p)/parseFloat(q);
          return new C(v,0);
        }
        return parseComplex(t);
      };
      const a = parseMaybeFrac(m.a), b = parseMaybeFrac(m.b), c = parseMaybeFrac(m.c), d = parseMaybeFrac(m.d);
      const M = new M2C(a,b,c,d);
      gens.push(M2C.normalizeSL2(M));
    }

    const L = Math.max(1, Math.min(7, Math.round(maxLen[0])));
    const elems = generateWords(gens, L);
    appendLog(`Words up to length ${L}: ${elems.length} elements.`);

    // Bisectors
    const bisectors = [];
    for (const g of elems){
      // Skip identity (its bisector is undefined)
      const isIdentity = (z)=> Math.abs(z.re) < 1e-12 && Math.abs(z.im) < 1e-12;
      const idLike = isIdentity(C.sub(g.a, new C(1,0))) && isIdentity(g.b) && isIdentity(g.c) && isIdentity(C.sub(g.d, new C(1,0)));
      if (idLike) continue;
      const bis = bisectorFromG(g);
      bisectors.push(bis);
    }
    appendLog(`Bisectors computed: ${bisectors.length}.`);

    // Render bisectors
    if (showBisectors){
      const matSphere = new THREE.MeshStandardMaterial({ transparent: true, opacity: 0.18, metalness: 0.0, roughness: 0.9, side: THREE.DoubleSide, clippingPlanes: api.clippingPlanes });
      const matPlane = new THREE.MeshStandardMaterial({ transparent: true, opacity: 0.15, metalness: 0.0, roughness: 1.0, side: THREE.DoubleSide, clippingPlanes: api.clippingPlanes });

      for (const bis of bisectors){
        if (bis.type === 'sphere'){
          if (!(bis.r2>1e-10)) continue; // ignore degenerate
          const R = Math.sqrt(bis.r2);
          const geo = new THREE.SphereGeometry(R, 64, 32);
          const mesh = new THREE.Mesh(geo, matSphere.clone());
          mesh.position.set(bis.center.re, bis.center.im, 0);
          api.addMesh(mesh);
        } else if (bis.type === 'plane'){
          // Plane: 2 Re(β w) + δ = 0  =>  2(β.re x - β.im y) + δ = 0
          const nx = 2*bis.beta.re;
          const ny = -2*bis.beta.im;
          const nz = 0;
          const len = Math.hypot(nx, ny);
          if (len < 1e-12) continue;
          // make a big plane aligned with this normal
          const plane = new THREE.Plane(new THREE.Vector3(nx, ny, nz).normalize(), bis.delta/len);
          // But THREE.Plane geometry uses a mesh; we'll construct a large PlaneGeometry and orient it.
          const geo = new THREE.PlaneGeometry(60, 60, 1, 1);
          const mesh = new THREE.Mesh(geo, matPlane.clone());
          // Align plane: find quaternion mapping mesh's +Z normal to plane normal in XY
          // Our plane mesh normal starts +Z; we want it vertical. We'll rotate so its normal equals (nx, ny, 0)
          const target = new THREE.Vector3(nx, ny, 0).normalize();
          const current = new THREE.Vector3(0,0,1);
          const q = new THREE.Quaternion().setFromUnitVectors(current, target);
          mesh.quaternion.copy(q);
          // Position the plane so that ax + by + cz + d = 0; here c=0
          // plane constant: n·x + d = 0 => choose point p s.t. n·p = -d
          const dconst = plane.constant; // note THREE's Plane stores n·x + constant = 0
          const p0 = target.clone().multiplyScalar(-dconst);
          mesh.position.copy(p0);
          api.addMesh(mesh);
        }
      }
    }

    // Orbit points of basepoint j
    if (showOrbit){
      const pts = orbitPoints(elems.slice(0, Math.min(elems.length, 500)));
      const sphGeo = new THREE.SphereGeometry(0.05, 16, 16);
      const matO = new THREE.MeshStandardMaterial({ color: 0x99ccff });
      for (const {w,t} of pts){
        const m = new THREE.Mesh(sphGeo, matO);
        m.position.set(w.re, w.im, t);
        api.addOrbitPoint(m);
      }
      // Basepoint j
      const base = new THREE.Mesh(sphGeo, new THREE.MeshStandardMaterial({ color: 0xffcc66 }));
      base.position.set(0,0,1);
      api.addOrbitPoint(base);
    }

    // Sample the Dirichlet region (point cloud)
    if (showCloud){
      appendLog("Sampling Dirichlet region point cloud...");
      const N = Math.max(1000, Math.min(200000, Math.round(sampleCount[0])));

      // crude bounding box from orbit points
      const pts = orbitPoints(elems.slice(0, Math.min(elems.length, 300)));
      let Rxy = 3, zMax = 3; // defaults
      for (const {w,t} of pts){
        Rxy = Math.max(Rxy, Math.hypot(w.re, w.im) + 1.5);
        zMax = Math.max(zMax, t + 1.5);
      }
      const zMin = 0.05;

      const positions = new Float32Array(N * 3);
      let count = 0; let accepted = 0;
      const eps = Math.max(1e-5, Math.min(0.2, epsBoundary[0]));

      while (count < N && accepted < N*2){
        // Stratified-ish sampling in cylinder of radius Rxy, height [zMin, zMax]
        const r = Rxy * Math.sqrt(Math.random());
        const theta = 2*Math.PI*Math.random();
        const x = r * Math.cos(theta);
        const y = r * Math.sin(theta);
        const t = zMin + (zMax - zMin) * Math.random();
        const w = new C(x,y);

        let ok = true; let minAbs = Infinity;
        for (const bis of bisectors){
          const s = bisectorSide(bis, w, t);
          if (s > 1e-7){ ok = false; break; }
          const a = Math.abs(s);
          if (a < minAbs) minAbs = a;
        }
        if (ok && minAbs < eps){
          positions[3*count+0] = x;
          positions[3*count+1] = y;
          positions[3*count+2] = t;
          count++;
        }
        accepted++;
        if (accepted > N*30) break; // avoid infinite loop if region is tiny
      }

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(positions.slice(0, 3*count), 3));
      const ptsMat = new THREE.PointsMaterial({ size: 0.05, opacity: 0.9, transparent: true });
      const cloud = new THREE.Points(geo, ptsMat);
      api.addCloudPoints(cloud);
      appendLog(`Boundary samples placed: ${count}/${N}`);
    }

  };

  return (
    <div className="w-full h-full grid grid-cols-12 gap-4 p-4">
      <div className="col-span-4 space-y-4">
        <Card className="p-4">
          <h2 className="text-xl font-semibold mb-2">Generators (2×2 complex matrices)</h2>
          <p className="text-sm text-muted-foreground mb-2">Enter entries as <code>a+bi</code> (e.g. <code>1.2-0.3i</code>). Matrices are normalized to det=1.</p>
          <div className="space-y-3">
            {generators.map((g, idx)=> (
              <div key={idx} className="rounded-2xl p-3 bg-neutral-900/40 border border-neutral-800">
                <div className="flex items-center justify-between mb-2">
                  <div className="font-medium">g{idx+1}</div>
                  <Button size="sm" variant="ghost" onClick={()=>removeGenerator(idx)}>Remove</Button>
                </div>
                <MatrixEditor matrix={g} onChange={(m)=>updateGenerator(idx,m)} />
              </div>
            ))}
            <Button onClick={addGenerator} variant="secondary">+ Add generator</Button>
          </div>
        </Card>

        <Card className="p-4">
          <h2 className="text-lg font-semibold mb-3">Controls</h2>
          <div className="space-y-3">
            <div>
              <Label>Max word length: {Math.round(maxLen[0])}</Label>
              <Slider min={1} max={7} step={1} value={maxLen} onValueChange={setMaxLen} />
            </div>
            <div>
              <Label>Boundary sampling (points): {Math.round(sampleCount[0])}</Label>
              <Slider min={1000} max={50000} step={1000} value={sampleCount} onValueChange={setSampleCount} />
            </div>
            <div>
              <Label>Boundary tolerance ε: {epsBoundary[0].toFixed(3)}</Label>
              <Slider min={0.005} max={0.08} step={0.001} value={epsBoundary} onValueChange={setEpsBoundary} />
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button onClick={build}>Build Dirichlet Domain</Button>
              <Button variant="outline" onClick={()=>setGridVisible(v=>!v)}>{gridVisible? 'Hide':'Show'} grid</Button>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button variant={showBisectors? 'secondary':'outline'} onClick={()=>setShowBisectors(v=>!v)}>
                {showBisectors? 'Hide':'Show'} bisectors
              </Button>
              <Button variant={showOrbit? 'secondary':'outline'} onClick={()=>setShowOrbit(v=>!v)}>
                {showOrbit? 'Hide':'Show'} orbit
              </Button>
              <Button variant={showCloud? 'secondary':'outline'} onClick={()=>setShowCloud(v=>!v)}>
                {showCloud? 'Hide':'Show'} cloud
              </Button>
            </div>
          </div>
        </Card>

        <Card className="p-3">
          <Tabs defaultValue="examples">
            <TabsList className="grid grid-cols-2 w-full">
              <TabsTrigger value="examples">Examples</TabsTrigger>
              <TabsTrigger value="log">Log</TabsTrigger>
            </TabsList>
            <TabsContent value="examples" className="pt-2">
              <ExampleGenerators onUse={(gens)=>setGenerators(gens)} />
            </TabsContent>
            <TabsContent value="log" className="pt-2">
              <pre className="text-xs whitespace-pre-wrap leading-snug max-h-48 overflow-auto">{log}</pre>
            </TabsContent>
          </Tabs>
        </Card>

        <Card className="p-4">
          <h3 className="font-semibold mb-2">Tips</h3>
          <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
            <li>Faces are hemispheres/vertical planes orthogonal to the boundary (z=0).</li>
            <li>The yellow dot is the basepoint <code>j=(0,0,1)</code>. Blue dots are <code>g·j</code> for words up to length L.</li>
            <li>The white point cloud approximates the boundary of the Dirichlet domain (within tolerance ε).</li>
            <li>Increase word length L to add more faces; increase points for sharper boundary.</li>
          </ul>
        </Card>
      </div>

      <div className="col-span-8">
        <Card className="p-2 h-full">
          <div ref={mountRef} className="w-full h-[600px] rounded-2xl bg-black/60" />
        </Card>
      </div>
    </div>
  );
}
