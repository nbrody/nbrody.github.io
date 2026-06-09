// Stallings folding for finitely generated subgroups of a free group F_r.
//
// Directed-letter alphabet: letter L has positive id 2L and inverse id 2L+1.
// INV(d) = d XOR 1.  A word is an array of directed-letter ids.  The subgroup
// has finite index iff the folded core graph is complete: every vertex has all
// 2r directed labels.  The index is then the number of vertices.

const INV = (d) => d ^ 1;

export class Stallings {
  constructor(nLetters) {
    this.nl = nLetters;
    this.edges = [new Map()];     // edges[v]: Map(label -> neighbor)
    this.parent = [0];
  }
  find(v) { while (this.parent[v] !== v) { this.parent[v] = this.parent[this.parent[v]]; v = this.parent[v]; } return v; }
  _new() { this.edges.push(new Map()); this.parent.push(this.parent.length); return this.parent.length - 1; }

  _setEdge(u, lab, w, pend) {
    u = this.find(u); w = this.find(w);
    const eu = this.edges[u];
    if (eu.has(lab)) { const o = this.find(eu.get(lab)); if (o !== w) pend.push([o, w]); }
    else eu.set(lab, w);
    const rl = INV(lab), ew = this.edges[w];
    if (ew.has(rl)) { const o = this.find(ew.get(rl)); if (o !== u) pend.push([o, u]); }
    else ew.set(rl, u);
  }
  _merge(a, b, pend) {
    let ra = this.find(a), rb = this.find(b);
    if (ra === rb) return;
    this.parent[rb] = ra;
    for (const [lab, w] of this.edges[rb]) this._setEdge(ra, lab, this.find(w), pend);
    this.edges[rb] = new Map();
  }
  addWord(word) {
    let cur = 0; const pend = [];
    for (const lab of word) {
      const nxt = this._new();
      this._setEdge(cur, lab, nxt, pend);
      while (pend.length) { const [a, b] = pend.pop(); this._merge(a, b, pend); }
      cur = this.find(nxt);
    }
    this._merge(cur, 0, pend);
    while (pend.length) { const [a, b] = pend.pop(); this._merge(a, b, pend); }
  }
  vertices() { const s = new Set(); for (let v = 0; v < this.parent.length; v++) s.add(this.find(v)); return [...s].sort((a,b)=>a-b); }
  index() {
    const verts = this.vertices();
    for (const v of verts) { const e = this.edges[v]; for (let d = 0; d < 2*this.nl; d++) if (!e.has(d)) return null; }
    return verts.length;
  }
  stats() {
    const verts = this.vertices(); const n = verts.length;
    let edgecount = 0, missing = 0;
    for (const v of verts) {
      const e = this.edges[v];
      for (let L = 0; L < this.nl; L++) if (e.has(2*L)) edgecount++;
      for (let d = 0; d < 2*this.nl; d++) if (!e.has(d)) missing++;
    }
    return { vertices: n, edges: edgecount, rank: edgecount - n + 1, missing };
  }
  // export a renumbered graph for visualisation
  graph() {
    const verts = this.vertices();
    const id = new Map(); verts.forEach((v, i) => id.set(v, i));
    const nodes = verts.map((_, i) => i);
    const links = [];
    for (const v of verts) {
      const e = this.edges[v];
      for (let L = 0; L < this.nl; L++) {
        if (e.has(2*L)) links.push({ source: id.get(v), target: id.get(this.find(e.get(2*L))), label: L });
      }
    }
    return { nodes, links, nLetters: this.nl };
  }
}
