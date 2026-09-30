// Integer numerators over powers of 3: exact at the displayed word lengths (<= 6).
export const identity = { n: [1,0,0,0,1,0,0,0,1], d: 1 };
export const generators = [
  { n: [1,0,0,0,0,-1,0,1,0], d: 1, name: 'A' },
  { n: [0,0,1,0,1,0,-1,0,0], d: 1, name: 'B' },
  { n: [1,2,2,2,1,-2,-2,2,-1], d: 3, name: 'C' }
];
export function inverse(m) { return { n: [0,3,6,1,4,7,2,5,8].map(i => m.n[i]), d: m.d }; }
export function multiply(a,b) {
  const n = Array.from({length:9},(_,i) => {
    const r = Math.floor(i/3), c = i%3;
    return a.n[r*3]*b.n[c]+a.n[r*3+1]*b.n[c+3]+a.n[r*3+2]*b.n[c+6];
  });
  let d = a.d*b.d;
  while(d>1 && n.every(x=>x%3===0)) { for(let i=0;i<9;i++)n[i]/=3; d/=3; }
  return {n,d};
}
export const matrixKey = m => `${m.d}:${m.n.join(',')}`;
export function cayleyBall(depth) {
  const signed = generators.flatMap(g=>[g,inverse(g)]);
  const nodes = [{...identity,depth:0}], seen = new Map([[matrixKey(identity),0]]);
  for(let i=0;i<nodes.length;i++) {
    if(nodes[i].depth===depth)continue;
    // Breadth-first discovery makes the discoverer a parent in a geodesic spanning tree;
    // `letter` indexes A, A⁻¹, B, B⁻¹, C, C⁻¹ for the edge from the parent.
    signed.forEach((g,letter) => {
      const m=multiply(nodes[i],g), key=matrixKey(m);
      if(!seen.has(key)){seen.set(key,nodes.length);nodes.push({...m,depth:nodes[i].depth+1,parent:i,letter});}
    });
  }
  const edges=[];
  // Positive generators suffice for every undirected edge, including boundary cycles.
  for(let i=0;i<nodes.length;i++) for(let color=0;color<3;color++) {
    const j=seen.get(matrixKey(multiply(nodes[i],generators[color])));
    if(j===undefined)continue;
    const tree=(nodes[j].parent===i && nodes[j].letter===2*color) || (nodes[i].parent===j && nodes[i].letter===2*color+1);
    edges.push({from:i,to:j,color,tree});
  }
  return {nodes,edges};
}
export function orbitPoint(m) {
  // Q-linearly independent coordinates give trivial stabilizer in SO3(Q).
  const v=[1,Math.sqrt(2),Math.sqrt(3)];
  return [0,1,2].map(r=>(m.n[3*r]*v[0]+m.n[3*r+1]*v[1]+m.n[3*r+2]*v[2])/(m.d*Math.sqrt(6)));
}
export const fractionLabel = ([p,q]) => q===0?'∞':q===1?String(p):`${p}/${q}`;
export function boundaryPoint([p,q]) { const n=p*p+q*q; return [(p*p-q*q)/n,-2*p*q/n]; }
export function fareyEdges(depth) {
  const edges=[], seen=new Set();
  function add(a,b,level) {
    const key=[fractionLabel(a),fractionLabel(b)].sort().join('|');
    if(!seen.has(key)){seen.add(key);edges.push({a,b,level});}
  }
  function split(a,b,level) {
    add(a,b,level);
    if(level>=depth)return;
    const m=[a[0]+b[0],a[1]+b[1]];
    split(a,m,level+1);split(m,b,level+1);
  }
  split([0,1],[1,0],0);split([0,1],[-1,0],0);
  return edges;
}
export function figureEight(t) { return [(2+Math.cos(2*t))*Math.cos(3*t),(2+Math.cos(2*t))*Math.sin(3*t),Math.sin(4*t)]; }

export const vertexRadius = depth => .03 * .72 ** depth;

// Radial layout of the spanning tree: depth k lies on the circle of radius k/maxDepth·radius,
// and each subtree gets an angular wedge proportional to its leaves. Siblings are ordered
// by `azimuth` (the direction of each vertex's sphere image), and the whole layout is
// turned to match, so branches start out pointing roughly where they will land.
export function treeLayout(nodes, azimuth, radius) {
  const children = nodes.map(() => []), leaves = new Array(nodes.length).fill(1), angle = new Array(nodes.length).fill(0);
  nodes.forEach((n,i) => { if(i) children[n.parent].push(i); });
  for(let i=nodes.length-1;i>=0;i--) if(children[i].length) leaves[i] = children[i].reduce((sum,c) => sum+leaves[c], 0);
  const turn = a => Math.atan2(Math.sin(a), Math.cos(a));
  function place(i, start, width) {
    angle[i] = start+width/2;
    const kids = children[i].sort((a,b) => turn(azimuth[a]-angle[i])-turn(azimuth[b]-angle[i]));
    for(const c of kids) { const w = width*leaves[c]/leaves[i]; place(c, start, w); start += w; }
  }
  const root = children[0].sort((a,b) => azimuth[a]-azimuth[b]), wedge = c => 2*Math.PI*leaves[c]/leaves[0];
  let start = 0, sin = 0, cos = 0;
  for(const c of root) { const mid = start+wedge(c)/2; sin += leaves[c]*Math.sin(azimuth[c]-mid); cos += leaves[c]*Math.cos(azimuth[c]-mid); start += wedge(c); }
  start = Math.atan2(sin, cos);
  for(const c of root) { place(c, start, wedge(c)); start += wedge(c); }
  const maxDepth = Math.max(...nodes.map(n => n.depth));
  return nodes.map((n,i) => [radius*n.depth/maxDepth*Math.cos(angle[i]), radius*n.depth/maxDepth*Math.sin(angle[i])]);
}

// Bends the plane z=1 onto the unit sphere without stretching it: at curvature k the plane
// lies on the sphere of radius 1/k tangent at (0,0,1). k=0 is flat; k=1 is the azimuthal
// equidistant wrap, sending distance d from the tangent point to arc length d.
export function wrapPoint([x,y], k) {
  const d = Math.hypot(x,y);
  if(d<1e-12) return [0,0,1];
  if(k<1e-6) return [x,y,1];
  const s = Math.sin(d*k)/(k*d);
  return [x*s, y*s, 1-(1-Math.cos(d*k))/k];
}

// Great-circle interpolation between unit vectors; antipodes turn about a perpendicular axis.
export function slerp(a, b, t) {
  const dot = Math.max(-1, Math.min(1, a[0]*b[0]+a[1]*b[1]+a[2]*b[2])), angle = Math.acos(dot), s = Math.sin(angle);
  if(angle<1e-9) return [...a];
  if(s<1e-9) {
    const e = Math.abs(a[0])<.9 ? [1,0,0] : [0,1,0];
    const p = [a[1]*e[2]-a[2]*e[1], a[2]*e[0]-a[0]*e[2], a[0]*e[1]-a[1]*e[0]], n = Math.hypot(...p);
    return a.map((x,i) => x*Math.cos(Math.PI*t)+p[i]/n*Math.sin(Math.PI*t));
  }
  const wa = Math.sin((1-t)*angle)/s, wb = Math.sin(t*angle)/s;
  return a.map((x,i) => wa*x+wb*b[i]);
}
