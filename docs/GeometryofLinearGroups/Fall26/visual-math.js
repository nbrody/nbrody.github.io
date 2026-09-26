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
    for(const g of signed) {
      const m=multiply(nodes[i],g), key=matrixKey(m);
      if(!seen.has(key)){seen.set(key,nodes.length);nodes.push({...m,depth:nodes[i].depth+1});}
    }
  }
  const edges=[];
  // Positive generators suffice for every undirected edge, including boundary cycles.
  for(let i=0;i<nodes.length;i++) for(let color=0;color<3;color++) {
    const j=seen.get(matrixKey(multiply(nodes[i],generators[color])));
    if(j!==undefined)edges.push({from:i,to:j,color});
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
