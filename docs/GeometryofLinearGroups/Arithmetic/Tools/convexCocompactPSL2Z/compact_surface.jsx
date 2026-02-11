import { useState, useEffect, useRef, useCallback, useMemo } from "react";

/* ═══════ Linear algebra ═══════ */
function gcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { [a, b] = [b, a % b]; } return a; }
function isPrime(n) {
  if (n < 2) return false; if (n < 4) return true;
  if (n % 2 === 0 || n % 3 === 0) return false;
  for (let i = 5; i * i <= n; i += 6) if (n % i === 0 || n % (i + 2) === 0) return false;
  return true;
}
function matMul(A, B) {
  return [
    [A[0][0]*B[0][0]+A[0][1]*B[1][0], A[0][0]*B[0][1]+A[0][1]*B[1][1]],
    [A[1][0]*B[0][0]+A[1][1]*B[1][0], A[1][0]*B[0][1]+A[1][1]*B[1][1]]
  ];
}
function matDet(A) { return A[0][0]*A[1][1]-A[0][1]*A[1][0]; }
function matInvPGL(A) {
  // For PGL action: adjugate works regardless of det
  return [[A[1][1],-A[0][1]],[-A[1][0],A[0][0]]];
}
function mobius(M, z) {
  const [a,b]=M[0],[c,d]=M[1],[x,y]=z;
  const nR=a*x+b, nI=a*y, dR=c*x+d, dI=c*y, dn=dR*dR+dI*dI;
  if(dn<1e-30) return null;
  return [(nR*dR+nI*dI)/dn, (nI*dR-nR*dI)/dn];
}

/* ═══════ Geodesic axis of a hyperbolic element ═══════ */
function hyperFixedPts(M) {
  // Fixed points of z -> (az+b)/(cz+d) on real line
  const [a,b]=M[0],[c,d]=M[1];
  if(Math.abs(c)<1e-12) return null; // parabolic at ∞
  const tr = a+d;
  const disc = tr*tr - 4*matDet(M);
  if(disc <= 0) return null;
  const sq = Math.sqrt(disc);
  return [(a-d+sq)/(2*c), (a-d-sq)/(2*c)];
}

function geodesicArc(x1, x2, numPts=200) {
  // Semicircle in upper half plane from x1 to x2 on real axis
  const cx = (x1+x2)/2, r = Math.abs(x2-x1)/2;
  const pts = [];
  for(let i=0;i<=numPts;i++){
    const th = Math.PI*i/numPts;
    pts.push([cx+r*Math.cos(Math.PI-th), r*Math.sin(Math.PI-th)]);
  }
  return {cx, r, pts};
}

/* ═══════ Which side of a geodesic is a point on? ═══════ */
function sideOfGeodesic(z, geod) {
  // Returns positive if outside semicircle, negative if inside
  const dx = z[0]-geod.cx, dy = z[1];
  return Math.sqrt(dx*dx+dy*dy) - geod.r;
}

/* ═══════ Cusp height functions ═══════ */
function cuspHeight(z, cusp, p) {
  // Height of z at cusp, using appropriate scaling matrix
  const [x,y] = z;
  if(cusp === 'inf') return y;
  if(cusp === '0') return y/(x*x+y*y);
  if(cusp === '1/p') {
    const dx = x-1/p;
    return y/(dx*dx+y*y) / (p*p);
  }
  if(cusp === '1/2') {
    const dx = x-0.5;
    return y/(dx*dx+y*y) / 4;
  }
  return 0;
}

function maxCuspHeight(z, p) {
  return Math.max(
    cuspHeight(z,'inf',p),
    cuspHeight(z,'0',p),
    cuspHeight(z,'1/p',p),
    cuspHeight(z,'1/2',p)
  );
}

/* ═══════ Schreier generators for Γ₀(N) ═══════ */
function computeSchreierGens(p) {
  const N = 2*p;
  const units = [];
  for (let u=1; u<N; u++) if(gcd(u,N)===1) units.push(u);

  function canon(c,d) {
    c=((c%N)+N)%N; d=((d%N)+N)%N;
    let mk = c*N+d;
    for(const u of units){ const k=((u*c)%N)*N+((u*d)%N); if(k<mk) mk=k; }
    return mk;
  }

  const cosetMap=new Map(), cosetPairs=[];
  for(let c=0;c<N;c++) for(let d=0;d<N;d++){
    if(!c&&!d) continue;
    const k=canon(c,d);
    if(!cosetMap.has(k)){ cosetMap.set(k,cosetPairs.length); cosetPairs.push([c,d]); }
  }
  const numC=cosetPairs.length;

  const gens=[[[0,-1],[1,0]], [[1,1],[0,1]], [[1,-1],[0,1]]];
  function act(c,d,g){
    if(g===0) return canon(d,(N-c)%N);
    if(g===1) return canon(c,(c+d)%N);
    return canon(c,(d-c+N)%N);
  }

  const idIdx=cosetMap.get(canon(0,1));
  const rep=new Array(numC).fill(null);
  rep[idIdx]=[[1,0],[0,1]];
  const q=[idIdx];
  while(q.length){
    const idx=q.shift(); const [c,d]=cosetPairs[idx];
    for(let g=0;g<3;g++){
      const ni=cosetMap.get(act(c,d,g));
      if(ni!==undefined && !rep[ni]){ rep[ni]=matMul(rep[idx],gens[g]); q.push(ni); }
    }
  }

  const result=[], seen=new Set();
  for(let idx=0;idx<numC;idx++){
    if(!rep[idx]) continue;
    const [c,d]=cosetPairs[idx];
    for(let g=0;g<3;g++){
      const ni=cosetMap.get(act(c,d,g));
      if(ni===undefined||!rep[ni]) continue;
      const sg=matMul(matMul(rep[idx],gens[g]),matInvPGL(rep[ni]));
      const r=sg.map(row=>row.map(x=>Math.round(x)));
      if(Math.abs(r[0][0])<=1&&r[0][1]===0&&r[1][0]===0&&Math.abs(r[1][1])<=1) continue;
      let norm=r;
      const fnz=[r[0][0],r[0][1],r[1][0],r[1][1]].find(x=>x!==0);
      if(fnz<0) norm=r.map(row=>row.map(x=>-x));
      const key=norm.flat().join(',');
      const nkey=norm.map(row=>row.map(x=>-x)).flat().join(',');
      if(!seen.has(key)&&!seen.has(nkey)){ seen.add(key); seen.add(nkey); result.push(norm); }
    }
  }
  return {generators:result, numCosets:numC};
}

/* ═══════ Orbit computation with cusp filtering ═══════ */
function computeOrbit(generators, maxLen, p, cuspCutoff, limit=60000) {
  const allGens=[];
  for(const g of generators){
    allGens.push(g);
    const gi=matInvPGL(g);
    const key=g.flat().join(','), kiey=gi.flat().join(',');
    if(key!==kiey) allGens.push(gi);
  }

  const EPS=0.0003;
  const gk=(z)=>`${Math.round(z[0]/EPS)},${Math.round(z[1]/EPS)}`;
  const base=[0,1];
  const inCompact = maxCuspHeight(base, p) < cuspCutoff;
  const pts=[{z:base, depth:0, compact:inCompact}];
  const vis=new Set([gk(base)]);
  let front=[base];

  for(let d=1;d<=maxLen;d++){
    const nf=[];
    for(const z of front){
      for(const gen of allGens){
        const w=mobius(gen,z);
        if(!w||w[1]<1e-8) continue;
        const k=gk(w);
        if(!vis.has(k)){
          vis.add(k);
          const ic = maxCuspHeight(w,p) < cuspCutoff;
          pts.push({z:w, depth:d, compact:ic});
          nf.push(w);
        }
      }
    }
    front=nf;
    if(pts.length>limit) break;
  }
  return pts;
}

/* ═══════ Paper elements ═══════ */
function paperElements(p) {
  const Tinf = [[1,1],[0,1]];
  const T1p = [[1-2*p, 2],[-2*p*p, 1+2*p]];
  const T12 = [[1-2*p, p],[-4*p, 1+2*p]];
  const T0 = [[1,0],[-2*p,1]];
  const t = [[0,-1],[2*p,-2*(p+2)]];
  const alpha = matMul(Tinf, T1p);
  const beta = matMul(T12, T0);
  return { Tinf, T1p, T12, T0, t, alpha, beta };
}

/* ═══════ Orientation check ═══════ */
function checkOrientation(p) {
  const pe = paperElements(p);
  const fpA = hyperFixedPts(pe.alpha);
  const fpB = hyperFixedPts(pe.beta);
  if(!fpA || !fpB) return { valid: false, msg: "Non-hyperbolic element" };

  const geodA = geodesicArc(fpA[0], fpA[1]);
  const geodB = geodesicArc(fpB[0], fpB[1]);

  // Check: does t map α's axis to β's axis?
  const tFpA0 = mobius(pe.t, [fpA[0], 0.0001]);
  const tFpA1 = mobius(pe.t, [fpA[1], 0.0001]);

  // Test point on axis of α, slightly displaced outward (compact side)
  const testOnAxis = [geodA.cx, geodA.r]; // top of semicircle
  const eps = 0.01;
  const testOutside = [geodA.cx, geodA.r + eps]; // outside semicircle (compact side for α)
  const testInside = [geodA.cx, geodA.r - eps]; // inside semicircle (cusp side for α)

  const imgOutside = mobius(pe.t, testOutside);
  const imgInside = mobius(pe.t, testInside);

  const sideOut = imgOutside ? sideOfGeodesic(imgOutside, geodB) : 0;
  const sideIn = imgInside ? sideOfGeodesic(imgInside, geodB) : 0;

  // i should be on the compact side of both
  const iSideA = sideOfGeodesic([0,1], geodA);
  const iSideB = sideOfGeodesic([0,1], geodB);

  // For the gluing to be correct, the compact side of α should map to the compact side of β
  // "compact side" = same sign as i's side
  const compactSignA = Math.sign(iSideA); // should be +1 (outside)
  const compactSignB = Math.sign(iSideB); // should be +1 (outside)

  const mapsCompactToCompact = Math.sign(sideOut) === compactSignB;
  const mapsCuspToCusp = Math.sign(sideIn) === -compactSignB;

  // Check orientation: does t preserve or reverse the direction along the axis?
  // Map the two fixed points and see if order is preserved
  const tFp0 = mobius(pe.t, [fpA[0], 1e-8]);
  const tFp1 = mobius(pe.t, [fpA[1], 1e-8]);

  // Which fixed point of α is attracting? (eigenvalue > 1)
  const trA = pe.alpha[0][0]+pe.alpha[1][1];
  const attractA = trA > 0 ? fpA[0] : fpA[1]; // larger eigenvalue corresponds to first root if tr>0
  const repelA = trA > 0 ? fpA[1] : fpA[0];

  // Which fixed point of β is attracting?
  const trB = pe.beta[0][0]+pe.beta[1][1];
  const attractB = trB > 0 ? fpB[0] : fpB[1];
  const repelB = trB > 0 ? fpB[1] : fpB[0];

  // Does t map attract(α) → attract(β)? (preserves direction)
  // Or attract(α) → repel(β)? (reverses direction)
  const tAttract = tFp0; // image of first fixed point
  const distToAttractB = tAttract ? Math.abs(tAttract[0]-attractB) : Infinity;
  const distToRepelB = tAttract ? Math.abs(tAttract[0]-repelB) : Infinity;
  const preservesDirection = distToAttractB < distToRepelB;

  // Verify conjugation: t α t⁻¹ should equal β
  const tInv = matInvPGL(pe.t);
  const conj = matMul(matMul(pe.t, pe.alpha), tInv);
  // Normalize both to compare in PGL
  const scale1 = conj[0][0] !== 0 ? pe.beta[0][0]/conj[0][0] : pe.beta[1][0]/conj[1][0];
  const conjMatch = Math.abs(conj[0][0]*scale1 - pe.beta[0][0]) < 0.01 &&
                    Math.abs(conj[0][1]*scale1 - pe.beta[0][1]) < 0.01 &&
                    Math.abs(conj[1][0]*scale1 - pe.beta[1][0]) < 0.01 &&
                    Math.abs(conj[1][1]*scale1 - pe.beta[1][1]) < 0.01;

  // More careful: check in PGL₂, so t·α·t⁻¹ = λβ for some scalar λ
  // Since det(t)=2p, t⁻¹ in PGL is adjugate. t·α·t⁻¹ = t·α·adj(t)
  const conjExact = matMul(matMul(pe.t, pe.alpha), [[pe.t[1][1], -pe.t[0][1]], [-pe.t[1][0], pe.t[0][0]]]);
  const ratio00 = conjExact[0][0] / pe.beta[0][0];
  const ratioCheck = pe.beta.flat().every((v,i) => Math.abs(conjExact.flat()[i] - ratio00*v) < 0.5);

  return {
    valid: true,
    fpA, fpB, geodA, geodB,
    mapsCompactToCompact,
    mapsCuspToCusp,
    preservesDirection,
    conjMatch: ratioCheck,
    conjRatio: ratio00,
    iSideA, iSideB,
    imgOutside, imgInside,
    sideOut, sideIn,
    detT: matDet(pe.t),
    attractA, repelA, attractB, repelB,
    trA, trB
  };
}

/* ═══════ Colors ═══════ */
const COMPACT_COLORS = ["#ffffff","#60a5fa","#34d399","#fbbf24","#fb923c","#f87171","#e879f9","#c084fc","#67e8f9","#a3e635"];
const CUSP_COLOR = "rgba(255,60,60,0.25)";

/* ═══════ Main Component ═══════ */
export default function App() {
  const [pInput, setPInput] = useState("5");
  const [p, setP] = useState(5);
  const [maxLen, setMaxLen] = useState(5);
  const [cuspCutoff, setCuspCutoff] = useState(1.5);
  const [showCuspPts, setShowCuspPts] = useState(true);
  const [showAxes, setShowAxes] = useState(true);
  const [showTAction, setShowTAction] = useState(false);
  const [includeT, setIncludeT] = useState(false);
  const [genInfo, setGenInfo] = useState({generators:[],numCosets:0});
  const [orbit, setOrbit] = useState([]);
  const [computing, setComputing] = useState(false);
  const [orientResult, setOrientResult] = useState(null);

  const [view, setView] = useState({cx:0.3, cy:1.5, scale:250});
  const canvasRef = useRef(null);
  const dragRef = useRef(null);

  const pe = useMemo(()=>paperElements(p),[p]);

  // Orientation check
  useEffect(()=>{
    if(!isPrime(p)||p<5) { setOrientResult(null); return; }
    setOrientResult(checkOrientation(p));
  },[p]);

  // Generators
  useEffect(()=>{
    if(!isPrime(p)||p<5) return;
    setComputing(true);
    requestAnimationFrame(()=>{
      const info = computeSchreierGens(p);
      setGenInfo(info);
      setComputing(false);
    });
  },[p]);

  // Orbit
  useEffect(()=>{
    if(genInfo.generators.length===0) return;
    setComputing(true);
    requestAnimationFrame(()=>{
      let gens=[...genInfo.generators];
      if(includeT) gens.push(pe.t);
      const orb=computeOrbit(gens, maxLen, p, cuspCutoff);
      setOrbit(orb);
      setComputing(false);
    });
  },[genInfo, maxLen, p, cuspCutoff, includeT, pe]);

  // Render
  const render = useCallback(()=>{
    const canvas=canvasRef.current;
    if(!canvas) return;
    const ctx=canvas.getContext('2d');
    const W=canvas.width, H=canvas.height;
    const {cx,cy,scale}=view;
    const toS = (x,y) => [(x-cx)*scale+W/2, H/2-(y-cy)*scale];
    const fromS = (sx,sy) => [(sx-W/2)/scale+cx, (H/2-sy)/scale+cy];

    ctx.fillStyle='#0c0e14';
    ctx.fillRect(0,0,W,H);

    // Grid
    const [xMin]=fromS(0,H), [xMax]=fromS(W,H);
    const [,yMin]=fromS(0,H), [,yMax]=fromS(0,0);
    ctx.strokeStyle='rgba(255,255,255,0.04)';
    ctx.lineWidth=1;
    const gs=scale>150?0.5:scale>40?1:scale>15?2:5;
    for(let x=Math.ceil(xMin/gs)*gs;x<=xMax;x+=gs){
      const [sx]=toS(x,0); ctx.beginPath(); ctx.moveTo(sx,0); ctx.lineTo(sx,H); ctx.stroke();
    }
    for(let y=Math.ceil(Math.max(0,yMin)/gs)*gs;y<=yMax;y+=gs){
      const [,sy]=toS(0,y); ctx.beginPath(); ctx.moveTo(0,sy); ctx.lineTo(W,sy); ctx.stroke();
    }

    // Real axis
    const [,axY]=toS(0,0);
    if(axY>=0&&axY<=H){
      ctx.strokeStyle='rgba(255,255,255,0.2)';
      ctx.lineWidth=1.5;
      ctx.beginPath(); ctx.moveTo(0,axY); ctx.lineTo(W,axY); ctx.stroke();
    }

    // Draw geodesic axes
    if(showAxes && orientResult && orientResult.valid){
      const {geodA, geodB, fpA, fpB} = orientResult;

      // Axis of α
      ctx.strokeStyle='rgba(96,165,250,0.7)';
      ctx.lineWidth=2;
      ctx.setLineDash([]);
      ctx.beginPath();
      for(let i=0;i<geodA.pts.length;i++){
        const [sx,sy]=toS(geodA.pts[i][0],geodA.pts[i][1]);
        if(i===0) ctx.moveTo(sx,sy); else ctx.lineTo(sx,sy);
      }
      ctx.stroke();

      // Label
      const [lx1,ly1]=toS(geodA.cx, geodA.r+0.05);
      ctx.fillStyle='rgba(96,165,250,0.9)';
      ctx.font='bold 13px monospace';
      ctx.textAlign='center';
      ctx.fillText('axis(α = T∞·T₁/ₚ)', lx1, ly1-6);

      // Fixed point markers
      ctx.fillStyle='rgba(96,165,250,0.8)';
      for(const fp of fpA){
        const [sx,sy]=toS(fp,0);
        ctx.beginPath(); ctx.arc(sx,sy,4,0,Math.PI*2); ctx.fill();
      }

      // Axis of β
      ctx.strokeStyle='rgba(251,191,36,0.7)';
      ctx.lineWidth=2;
      ctx.beginPath();
      for(let i=0;i<geodB.pts.length;i++){
        const [sx,sy]=toS(geodB.pts[i][0],geodB.pts[i][1]);
        if(i===0) ctx.moveTo(sx,sy); else ctx.lineTo(sx,sy);
      }
      ctx.stroke();

      const [lx2,ly2]=toS(geodB.cx, geodB.r+0.05);
      ctx.fillStyle='rgba(251,191,36,0.9)';
      ctx.font='bold 13px monospace';
      ctx.fillText('axis(β = T₁/₂·T₀)', lx2, ly2-6);

      ctx.fillStyle='rgba(251,191,36,0.8)';
      for(const fp of fpB){
        const [sx,sy]=toS(fp,0);
        ctx.beginPath(); ctx.arc(sx,sy,4,0,Math.PI*2); ctx.fill();
      }

      // Show t action: map several points on α's axis to β's axis
      if(showTAction){
        ctx.strokeStyle='rgba(239,68,68,0.5)';
        ctx.lineWidth=1.5;
        ctx.setLineDash([3,3]);
        for(let i=10;i<=190;i+=20){
          const src = geodA.pts[i];
          const dst = mobius(pe.t, src);
          if(!dst || dst[1]<0.001) continue;
          const [sx1,sy1]=toS(src[0],src[1]);
          const [sx2,sy2]=toS(dst[0],dst[1]);
          ctx.beginPath(); ctx.moveTo(sx1,sy1); ctx.lineTo(sx2,sy2); ctx.stroke();
          // Arrow head
          const dx=sx2-sx1, dy=sy2-sy1, len=Math.sqrt(dx*dx+dy*dy);
          if(len>5){
            const ux=dx/len, uy=dy/len;
            ctx.fillStyle='rgba(239,68,68,0.7)';
            ctx.beginPath();
            ctx.moveTo(sx2,sy2);
            ctx.lineTo(sx2-8*ux+4*uy, sy2-8*uy-4*ux);
            ctx.lineTo(sx2-8*ux-4*uy, sy2-8*uy+4*ux);
            ctx.fill();
          }
        }
        ctx.setLineDash([]);
      }
    }

    // Cusp markers
    if(p>=5){
      const cusps = [
        {x:0, label:'0'}, {x:1/(2), label:'1/2'},
        {x:1/p, label:`1/${p}`}
      ];
      ctx.font='bold 11px monospace';
      ctx.textAlign='center';
      for(const c of cusps){
        const [sx,sy]=toS(c.x,0);
        if(sx>-20&&sx<W+20){
          ctx.fillStyle='rgba(239,68,68,0.6)';
          ctx.beginPath(); ctx.arc(sx,sy,3,0,Math.PI*2); ctx.fill();
          ctx.fillStyle='rgba(239,68,68,0.8)';
          ctx.fillText(c.label,sx,sy+15);
        }
      }
      // ∞ arrow
      ctx.fillStyle='rgba(239,68,68,0.4)';
      ctx.fillText('↑ ∞',W/2, 16);
    }

    // Orbit points
    for(const pt of orbit){
      const [sx,sy]=toS(pt.z[0],pt.z[1]);
      if(sx<-5||sx>W+5||sy<-5||sy>H+5) continue;
      if(!pt.compact && !showCuspPts) continue;
      if(pt.compact){
        ctx.fillStyle=COMPACT_COLORS[Math.min(pt.depth,COMPACT_COLORS.length-1)];
        ctx.globalAlpha = pt.depth===0?1:Math.max(0.5,1-pt.depth*0.06);
        const r=pt.depth===0?5:Math.max(1.5, 3.5-pt.depth*0.2);
        ctx.beginPath(); ctx.arc(sx,sy,r,0,Math.PI*2); ctx.fill();
      } else {
        ctx.fillStyle=CUSP_COLOR;
        ctx.globalAlpha=0.3;
        ctx.beginPath(); ctx.arc(sx,sy,1.5,0,Math.PI*2); ctx.fill();
      }
    }
    ctx.globalAlpha=1;

    // Stats
    const compactCount = orbit.filter(p=>p.compact).length;
    const cuspCount = orbit.length-compactCount;
    ctx.fillStyle='rgba(255,255,255,0.4)';
    ctx.font='11px monospace';
    ctx.textAlign='left';
    ctx.fillText(`${compactCount} compact + ${cuspCount} cusp pts`, 10, H-10);

  },[view,orbit,showCuspPts,showAxes,showTAction,orientResult,p,pe]);

  useEffect(()=>{
    const c=canvasRef.current; if(!c) return;
    const ro=new ResizeObserver(()=>{
      c.width=c.clientWidth*2; c.height=c.clientHeight*2;
      c.getContext('2d').scale(2,2);
      render();
    });
    ro.observe(c);
    return ()=>ro.disconnect();
  },[render]);
  useEffect(()=>{ render(); },[render]);

  const handleWheel=useCallback((e)=>{
    e.preventDefault();
    setView(v=>({...v, scale:Math.max(5,Math.min(3000,v.scale*(e.deltaY>0?0.85:1.18)))}));
  },[]);
  const handleMouseDown=useCallback((e)=>{
    dragRef.current={x:e.clientX,y:e.clientY,cx:view.cx,cy:view.cy};
  },[view]);
  const handleMouseMove=useCallback((e)=>{
    if(!dragRef.current) return;
    const dx=e.clientX-dragRef.current.x, dy=e.clientY-dragRef.current.y;
    setView(v=>({...v, cx:dragRef.current.cx-dx/v.scale, cy:dragRef.current.cy+dy/v.scale}));
  },[]);
  const handleMouseUp=useCallback(()=>{dragRef.current=null;},[]);

  function handleSetP(){
    const n=parseInt(pInput);
    if(isPrime(n)&&n>=5) setP(n);
  }

  const or = orientResult;

  return (
    <div style={{display:'flex',flexDirection:'column',height:'100vh',width:'100vw',background:'#0c0e14',color:'#e2e8f0',fontFamily:'"JetBrains Mono",monospace',overflow:'hidden'}}>
      {/* Header */}
      <div style={{padding:'10px 16px',borderBottom:'1px solid rgba(255,255,255,0.06)',display:'flex',alignItems:'center',gap:20,flexWrap:'wrap',flexShrink:0}}>
        <div style={{fontSize:14,fontWeight:700,color:'#94a3b8',letterSpacing:0.5}}>COMPACT SURFACE Γ₀(2p) CONSTRUCTION</div>
        <div style={{display:'flex',alignItems:'center',gap:6}}>
          <label style={{fontSize:11,color:'#64748b'}}>p =</label>
          <input value={pInput} onChange={e=>setPInput(e.target.value)}
            onKeyDown={e=>e.key==='Enter'&&handleSetP()} onBlur={handleSetP}
            style={{width:44,background:'#1e293b',border:'1px solid #334155',borderRadius:4,color:'#e2e8f0',padding:'3px 6px',fontSize:12,textAlign:'center'}}/>
          {pInput && (!isPrime(parseInt(pInput))||parseInt(pInput)<5) &&
            <span style={{color:'#f87171',fontSize:10}}>need prime ≥ 5</span>}
        </div>
        <div style={{display:'flex',alignItems:'center',gap:6}}>
          <label style={{fontSize:11,color:'#64748b'}}>depth</label>
          <input type="range" min={1} max={12} value={maxLen} onChange={e=>setMaxLen(+e.target.value)} style={{width:80,accentColor:'#60a5fa'}}/>
          <span style={{fontSize:12,minWidth:14}}>{maxLen}</span>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:6}}>
          <label style={{fontSize:11,color:'#64748b'}}>cusp cutoff</label>
          <input type="range" min={0.3} max={5} step={0.1} value={cuspCutoff} onChange={e=>setCuspCutoff(+e.target.value)} style={{width:70,accentColor:'#fb923c'}}/>
          <span style={{fontSize:11}}>{cuspCutoff.toFixed(1)}</span>
        </div>
        {computing && <span style={{color:'#fbbf24',fontSize:11,animation:'pulse 1s infinite'}}>⏳</span>}
      </div>

      <div style={{display:'flex',flex:1,overflow:'hidden'}}>
        {/* Sidebar */}
        <div style={{width:280,borderRight:'1px solid rgba(255,255,255,0.06)',padding:'12px',overflowY:'auto',flexShrink:0,fontSize:11}}>
          {/* Toggles */}
          <div style={{display:'flex',flexDirection:'column',gap:6,marginBottom:14}}>
            {[
              {v:showAxes, s:setShowAxes, label:'Geodesic axes α, β', c:'#60a5fa'},
              {v:showTAction, s:setShowTAction, label:'Show t: axis(α) → axis(β)', c:'#ef4444'},
              {v:includeT, s:setIncludeT, label:'Add t to orbit generators', c:'#fbbf24'},
              {v:showCuspPts, s:setShowCuspPts, label:'Show cusp-region points', c:'#64748b'},
            ].map(({v,s,label,c},i)=>(
              <label key={i} style={{display:'flex',alignItems:'center',gap:6,cursor:'pointer'}}>
                <input type="checkbox" checked={v} onChange={e=>s(e.target.checked)} style={{accentColor:c}}/>
                <span style={{color:v?c:'#475569',fontSize:11}}>{label}</span>
              </label>
            ))}
          </div>

          {/* ORIENTATION CHECK */}
          {or && or.valid && (
            <div style={{background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.08)',borderRadius:6,padding:10,marginBottom:14}}>
              <div style={{fontWeight:700,fontSize:12,color:'#94a3b8',marginBottom:8}}>🔍 ORIENTATION CHECK</div>

              <div style={{marginBottom:6}}>
                <span style={{color:'#64748b'}}>t conjugates α to β: </span>
                <span style={{color:or.conjMatch?'#34d399':'#f87171',fontWeight:600}}>
                  {or.conjMatch ? '✓ Yes' : '✗ No'}
                  {or.conjMatch && <span style={{color:'#64748b',fontWeight:400}}> (ratio={or.conjRatio.toFixed(1)})</span>}
                </span>
              </div>

              <div style={{marginBottom:6}}>
                <span style={{color:'#64748b'}}>det(t) = </span>
                <span style={{color:'#fb923c'}}>{or.detT}</span>
                <span style={{color:'#64748b'}}> = 2·{p}</span>
              </div>

              <div style={{marginBottom:6}}>
                <span style={{color:'#64748b'}}>t maps compact side → </span>
                <span style={{color:or.mapsCompactToCompact?'#34d399':'#f87171',fontWeight:700}}>
                  {or.mapsCompactToCompact ? 'COMPACT ✓' : 'CUSP ✗'}
                </span>
              </div>

              <div style={{marginBottom:6}}>
                <span style={{color:'#64748b'}}>t maps cusp side → </span>
                <span style={{color:or.mapsCuspToCusp?'#34d399':'#f87171',fontWeight:700}}>
                  {or.mapsCuspToCusp ? 'CUSP ✓' : 'COMPACT ✗'}
                </span>
              </div>

              <div style={{marginBottom:6}}>
                <span style={{color:'#64748b'}}>Direction along axis: </span>
                <span style={{color:or.preservesDirection?'#fbbf24':'#c084fc',fontWeight:600}}>
                  {or.preservesDirection ? 'PRESERVED' : 'REVERSED'}
                </span>
              </div>

              <div style={{marginTop:8,padding:8,borderRadius:4,
                background: or.mapsCompactToCompact
                  ? 'rgba(52,211,153,0.1)' : 'rgba(248,113,113,0.1)',
                border: `1px solid ${or.mapsCompactToCompact ? 'rgba(52,211,153,0.3)' : 'rgba(248,113,113,0.3)'}`
              }}>
                <div style={{fontWeight:700,fontSize:12,
                  color:or.mapsCompactToCompact?'#34d399':'#f87171'
                }}>
                  {or.mapsCompactToCompact
                    ? '✓ Gluing is orientation-compatible'
                    : '✗ Gluing maps compact ↔ cusp: WRONG SIDES'}
                </div>
                <div style={{fontSize:10,color:'#64748b',marginTop:4}}>
                  {or.mapsCompactToCompact
                    ? 'The element t maps the Λ-side of axis(α) to the Λ-side of axis(β). The HNN extension should give a compact surface.'
                    : 'The element t maps the Λ-side to the cusp side. The gluing does NOT produce a compact surface.'}
                </div>
              </div>
            </div>
          )}

          {/* Fixed point info */}
          {or && or.valid && (
            <div style={{background:'rgba(255,255,255,0.02)',borderRadius:4,padding:8,marginBottom:12,fontSize:10}}>
              <div style={{color:'#64748b',fontWeight:600,marginBottom:4}}>FIXED POINTS</div>
              <div style={{color:'#60a5fa'}}>
                α: {or.fpA[0].toFixed(6)}, {or.fpA[1].toFixed(6)}
              </div>
              <div style={{color:'#60a5fa',marginBottom:4}}>
                tr(α) = {or.trA}, geodesic center={or.geodA.cx.toFixed(4)}, r={or.geodA.r.toFixed(4)}
              </div>
              <div style={{color:'#fbbf24'}}>
                β: {or.fpB[0].toFixed(6)}, {or.fpB[1].toFixed(6)}
              </div>
              <div style={{color:'#fbbf24'}}>
                tr(β) = {or.trB}, geodesic center={or.geodB.cx.toFixed(4)}, r={or.geodB.r.toFixed(4)}
              </div>
            </div>
          )}

          {/* Paper matrices */}
          <div style={{color:'#64748b',fontWeight:600,marginBottom:4,fontSize:11}}>
            PAPER ELEMENTS
          </div>
          {[
            {name:'T_∞', m:pe.Tinf, c:'#94a3b8'},
            {name:'T_{1/p}', m:pe.T1p, c:'#94a3b8'},
            {name:'T_{1/2}', m:pe.T12, c:'#94a3b8'},
            {name:'T_0', m:pe.T0, c:'#94a3b8'},
            {name:'α=T∞·T₁/ₚ', m:pe.alpha, c:'#60a5fa'},
            {name:'β=T₁/₂·T₀', m:pe.beta, c:'#fbbf24'},
            {name:'t', m:pe.t, c:'#ef4444'},
          ].map(({name,m,c},i)=>(
            <div key={i} style={{padding:'2px 6px',marginBottom:1,borderRadius:2,background:'rgba(255,255,255,0.02)',color:c,fontFamily:'monospace',fontSize:10}}>
              <span style={{marginRight:4}}>{name}:</span>
              [{m[0].join(', ')}; {m[1].join(', ')}]
            </div>
          ))}

          <div style={{marginTop:12,color:'#475569',fontSize:10,lineHeight:1.6}}>
            Scroll to zoom · Drag to pan<br/>
            Compact pts: outside both geodesic semicircles and below cusp cutoff.<br/>
            <span style={{color:'#60a5fa'}}>■</span> axis(α) separates cusps ∞,1/p<br/>
            <span style={{color:'#fbbf24'}}>■</span> axis(β) separates cusps 1/2,0<br/>
            <span style={{color:'#ef4444'}}>→</span> t action on axis(α)
          </div>
        </div>

        {/* Canvas */}
        <canvas ref={canvasRef} style={{flex:1,cursor:'grab'}}
          onWheel={handleWheel} onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove} onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}/>
      </div>
    </div>
  );
}
