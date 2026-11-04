// 3D view of the foam inside the cylinder D² × [0, 1].
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { labelColor } from './config.js';

// jewel tones from the poincare palette, lightened a touch for lit surfaces
const FACET_TONES = ['#818cf8', '#22d3ee', '#f472b6', '#4ade80', '#fbbf24', '#a78bfa', '#38bdf8', '#fb7185', '#2dd4bf', '#a3e635', '#fb923c', '#e879f9'];
const facetHue = i => new THREE.Color(FACET_TONES[i % FACET_TONES.length]).lerp(new THREE.Color('#ffffff'), 0.12 + 0.1 * Math.floor(i / FACET_TONES.length));

function tubeGeometry(lines, radius = 0.011, radial = 7) {
  const pos = [], nor = [], idx = [];
  for (const L of lines) {
    if (L.length < 2) continue;
    const base = pos.length / 3;
    let prevN = null;
    for (let i = 0; i < L.length; i++) {
      const p = new THREE.Vector3(...L[i]);
      const a = new THREE.Vector3(...L[Math.max(0, i - 1)]), b = new THREE.Vector3(...L[Math.min(L.length - 1, i + 1)]);
      const t = b.sub(a).normalize();
      let n = prevN ? prevN.clone().sub(t.clone().multiplyScalar(prevN.dot(t))) : new THREE.Vector3(0, 1, 0).cross(t);
      if (n.lengthSq() < 1e-8) n = new THREE.Vector3(1, 0, 0).cross(t);
      n.normalize(); prevN = n;
      const bnorm = t.clone().cross(n);
      for (let r = 0; r < radial; r++) {
        const th = 2 * Math.PI * r / radial;
        const d = n.clone().multiplyScalar(Math.cos(th)).add(bnorm.clone().multiplyScalar(Math.sin(th)));
        pos.push(p.x + d.x * radius, p.y + d.y * radius, p.z + d.z * radius);
        nor.push(d.x, d.y, d.z);
      }
    }
    for (let i = 0; i < L.length - 1; i++) for (let r = 0; r < radial; r++) {
      const a = base + i * radial + r, b = base + i * radial + (r + 1) % radial;
      const c = a + radial, d = b + radial;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  return g;
}

export class FoamView {
  constructor(el, cb = {}) {
    this.el = el; this.cb = cb;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    el.appendChild(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.01, 100);
    this.camera.position.set(2.6, 2.4, 3.4);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.12;
    this.userMoved = false;
    this.controls.addEventListener('start', () => { this.userMoved = true; });
    this.scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x20242c, 1.15));
    const d1 = new THREE.DirectionalLight(0xffffff, 1.5); d1.position.set(3, 5, 4); this.scene.add(d1);
    const d2 = new THREE.DirectionalLight(0x9fb8ff, 0.6); d2.position.set(-4, 2, -3); this.scene.add(d2);
    this.root = new THREE.Group(); this.scene.add(this.root);
    this.facetMeshes = [];
    this.style = { translucent: true, colorBy: 'auto', showSeams: true, showSlice: true, showCyl: true };
    this.hover = -1; this.selected = -1;
    this.raycaster = new THREE.Raycaster();
    this._down = null;
    const dom = this.renderer.domElement;
    dom.addEventListener('pointerdown', e => { this._down = [e.clientX, e.clientY]; });
    dom.addEventListener('pointerup', e => {
      if (!this._down) return;
      const moved = Math.hypot(e.clientX - this._down[0], e.clientY - this._down[1]);
      this._down = null;
      if (moved > 5) return;
      const hit = this.pick(e);
      this.cb.onPick && this.cb.onPick(hit ? hit.facet : -1, hit ? hit.point : null, e);
    });
    dom.addEventListener('pointermove', e => {
      if (e.buttons) return;
      const hit = this.pick(e);
      const f = hit ? hit.facet : -1;
      if (f !== this.hover) { this.hover = f; this.refreshMaterials(); this.cb.onHover && this.cb.onHover(f, e); }
      else if (f >= 0 && this.cb.onHoverMove) this.cb.onHoverMove(e);
    });
    dom.addEventListener('pointerleave', () => { if (this.hover !== -1) { this.hover = -1; this.refreshMaterials(); this.cb.onHover && this.cb.onHover(-1); } });
    new ResizeObserver(() => this.resize()).observe(el);
    this.resize();
    const loop = () => { this.controls.update(); this.renderer.render(this.scene, this.camera); requestAnimationFrame(loop); };
    loop();
  }

  // draw right away as well: requestAnimationFrame stalls in hidden tabs
  renderNow() { this.renderer.render(this.scene, this.camera); }

  // floating panels cover the sides: shift the projection centre into the gap
  setInsets(l, r) {
    this.insets = [Math.max(0, l), Math.max(0, r)];
    this.resize();
  }

  resize() {
    const w = this.el.clientWidth || 1, h = this.el.clientHeight || 1;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    const [l, r] = this.insets || [0, 0];
    const dx = (l - r) / 2;
    if (dx) this.camera.setViewOffset(w, h, -dx, 0, w, h); else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
    if (!this.userMoved && this.F) this.fit();
    this.renderNow();
  }

  pick(e) {
    if (this.mode === 'space') return null;
    const r = this.renderer.domElement.getBoundingClientRect();
    const m = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(m, this.camera);
    const hits = this.raycaster.intersectObjects(this.facetMeshes, false);
    if (!hits.length) return null;
    return { facet: hits[0].object.userData.facet, point: hits[0].point.toArray() };
  }

  clear(group) {
    if (!group) return;
    group.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) [].concat(o.material).forEach(m => m.dispose()); });
    group.parent && group.parent.remove(group);
  }

  // 'auto' colours by facet when every facet has the same label
  byFacet() {
    if (this.style.colorBy !== 'auto') return this.style.colorBy === 'facet';
    return !this.F || new Set(this.F.facets.map(f => f.label)).size <= 1;
  }
  colorOf(f) {
    return this.byFacet() ? facetHue(f.id) : new THREE.Color(labelColor(f.label));
  }

  setFoam(F, extra = {}) {
    this.F = F;
    this.clear(this.foamG); this.clear(this.decoG); this.clear(this.ghostG);
    this.foamG = new THREE.Group(); this.decoG = new THREE.Group(); this.ghostG = new THREE.Group();
    this.root.add(this.foamG, this.decoG, this.ghostG);
    this.facetMeshes = [];
    for (const f of F.facets) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(f.positions, 3));
      g.setAttribute('normal', new THREE.BufferAttribute(f.normals, 3));
      g.setIndex(new THREE.BufferAttribute(f.indices, 1));
      const mat = new THREE.MeshStandardMaterial({ color: this.colorOf(f), roughness: 0.5, metalness: 0.05, side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(g, mat);
      mesh.userData.facet = f.id;
      mesh.renderOrder = 2;
      this.facetMeshes.push(mesh);
      this.foamG.add(mesh);
    }
    // bindings and singular vertices
    if (F.seams.length) {
      const sm = new THREE.Mesh(tubeGeometry(F.seams, 0.012), new THREE.MeshStandardMaterial({ color: 0xfb7185, roughness: 0.4, emissive: 0x5a1020 }));
      sm.renderOrder = 1;
      this.seamMesh = sm;
      this.foamG.add(sm);
    } else this.seamMesh = null;
    if (F.sing.length) {
      const im = new THREE.InstancedMesh(new THREE.SphereGeometry(0.032, 16, 12), new THREE.MeshStandardMaterial({ color: 0xffd36b, emissive: 0x3a2a00 }), F.sing.length);
      F.sing.forEach((p, i) => im.setMatrixAt(i, new THREE.Matrix4().makeTranslation(p[0], p[1], p[2])));
      this.foamG.add(im);
    }
    // dots
    if (extra.dots && extra.dots.length) {
      const im = new THREE.InstancedMesh(new THREE.SphereGeometry(0.036, 16, 12), new THREE.MeshStandardMaterial({ color: 0x101318, roughness: 0.25, metalness: 0.2, emissive: 0x050608 }), extra.dots.length);
      extra.dots.forEach((p, i) => im.setMatrixAt(i, new THREE.Matrix4().makeTranslation(p[0], p[1], p[2])));
      im.renderOrder = 3;
      this.foamG.add(im);
    }
    // cylinder
    const H = Math.max(F.totalH, 0.001);
    const lm = new THREE.LineBasicMaterial({ color: 0x8b93c9, transparent: true, opacity: 0.32 });
    for (const y of [0, H]) {
      const pts = []; for (let i = 0; i <= 96; i++) { const a = 2 * Math.PI * i / 96; pts.push(new THREE.Vector3(Math.cos(a), y, -Math.sin(a))); }
      this.decoG.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lm));
    }
    for (const b of (extra.boundary || [])) {
      this.decoG.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(b[0], 0, -b[1]), new THREE.Vector3(b[0], H, -b[1])]), lm));
    }
    // frame heights
    const fm = new THREE.LineBasicMaterial({ color: 0x8b93c9, transparent: true, opacity: 0.13 });
    for (const z of F.frameZ.slice(1, -1)) {
      const pts = []; for (let i = 0; i <= 64; i++) { const a = 2 * Math.PI * i / 64; pts.push(new THREE.Vector3(Math.cos(a), z, -Math.sin(a))); }
      this.decoG.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), fm));
    }
    // double lines: where the projected sheets of a knotted foam pass through each other
    if (F.doubles && F.doubles.length) {
      const dm = new THREE.LineDashedMaterial({ color: 0xc7d2fe, dashSize: 0.025, gapSize: 0.02, transparent: true, opacity: 0.55 });
      for (const pts of F.doubles) {
        const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts.map(p => new THREE.Vector3(p[0], p[1], p[2]))), dm);
        l.computeLineDistances();
        this.foamG.add(l);
      }
    }
    // the target web floating above an incomplete movie
    if (extra.ghost) {
      const y = H + 0.45;
      const dm = new THREE.LineDashedMaterial({ color: 0xfbbf24, dashSize: 0.04, gapSize: 0.03 });
      for (const pts of extra.ghost) {
        const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts.map(p => new THREE.Vector3(p[0], y, -p[1]))), dm);
        l.computeLineDistances();
        this.ghostG.add(l);
      }
      const pts = []; for (let i = 0; i <= 96; i++) { const a = 2 * Math.PI * i / 96; pts.push(new THREE.Vector3(Math.cos(a), y, -Math.sin(a))); }
      const c = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), dm); c.computeLineDistances();
      this.ghostG.add(c);
    }
    this.refreshMaterials();
    if (!this._fitted || extra.refit || (!this.userMoved && this._lastH !== F.totalH)) { this.fit(); this._fitted = true; }
    else if (this._lastH !== F.totalH && this.mode !== 'space') {
      // keep the user's view direction but follow the centre of the foam
      const dy = (F.totalH - this._lastH) / 2;
      this.controls.target.y += dy; this.camera.position.y += dy;
      this.controls.update();
    }
    this._lastH = F.totalH;
    this.applyVisibility();
    this.renderNow();
  }

  applyVisibility() {
    const sp = this.mode === 'space';
    if (this.foamG) this.foamG.visible = !sp;
    if (this.ghostG) this.ghostG.visible = !sp;
    if (this.spaceG) this.spaceG.visible = sp;
    if (this.seamMesh) this.seamMesh.visible = this.style.showSeams;
    if (this.decoG) this.decoG.visible = this.style.showCyl && !sp;
    if (this.sliceG) this.sliceG.visible = this.style.showSlice && !sp;
  }

  // 'foam': the projected foam in D² × [0,1];  'space': the web at the current
  // time as a curve in D² × [-1,1] (depth exaggerated)
  setMode(mode) {
    if (mode === this.mode) return;
    this.mode = mode;
    this.userMoved = false;
    this.applyVisibility();
    this.fit();
  }

  setSpace(data) {
    this.clear(this.spaceG);
    this.spaceG = new THREE.Group();
    this.root.add(this.spaceG);
    const K = 2.0;                     // depth exaggeration
    const P = q => [q[0], (q[2] || 0) * K, -q[1]];
    const disk = new THREE.Mesh(new THREE.CircleGeometry(1, 96), new THREE.MeshBasicMaterial({ color: 0x818cf8, transparent: true, opacity: 0.06, side: THREE.DoubleSide, depthWrite: false }));
    disk.rotation.x = -Math.PI / 2;
    this.spaceG.add(disk);
    for (const y of [-0.1 * K * 1.6, 0, 0.1 * K * 1.6]) {
      const ring = []; for (let i = 0; i <= 96; i++) { const a = 2 * Math.PI * i / 96; ring.push(new THREE.Vector3(Math.cos(a), y, -Math.sin(a))); }
      this.spaceG.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(ring), new THREE.LineBasicMaterial({ color: 0x8b93c9, transparent: true, opacity: y ? 0.15 : 0.45 })));
    }
    const groups = new Map();
    for (const L of data.lines) {
      if (L.pts.length < 2) continue;
      const f = this.F && this.F.facets[L.facet];
      const col = f ? this.colorOf(f) : new THREE.Color(labelColor(L.label || 1));
      const k = col.getHexString();
      if (!groups.has(k)) groups.set(k, { col, lines: [] });
      groups.get(k).lines.push(L.pts.map(P));
    }
    for (const { col, lines } of groups.values()) {
      const m = new THREE.Mesh(tubeGeometry(lines, 0.017, 9), new THREE.MeshStandardMaterial({ color: col, roughness: 0.35, metalness: 0.1, emissive: col.clone().multiplyScalar(0.12) }));
      this.spaceG.add(m);
    }
    const sph = new THREE.SphereGeometry(0.03, 16, 12);
    const vm = new THREE.MeshStandardMaterial({ color: 0xeef1f8, roughness: 0.3 });
    for (const v of data.verts) { const m = new THREE.Mesh(sph, vm); m.position.set(...P(v)); this.spaceG.add(m); }
    const bm = new THREE.MeshStandardMaterial({ color: 0xa5b4fc, emissive: 0x1e2550 });
    for (const b of data.boundary || []) { const m = new THREE.Mesh(sph, bm); m.position.set(b[0], 0, -b[1]); m.scale.setScalar(0.8); this.spaceG.add(m); }
    this.applyVisibility();
    this.renderNow();
  }

  refreshMaterials() {
    if (!this.F) return;
    const tr = this.style.translucent;
    this.facetMeshes.forEach((m, i) => {
      const f = this.F.facets[i];
      const mat = m.material;
      mat.color = this.colorOf(f);
      const hot = i === this.hover || i === this.selected;
      mat.emissive = new THREE.Color(hot ? (i === this.selected ? 0x3a3a3a : 0x262626) : 0x000000);
      const dim = this.selected >= 0 && i !== this.selected;
      mat.transparent = tr || dim;
      mat.opacity = dim ? (tr ? 0.22 : 0.45) : (tr ? 0.62 : 1);
      mat.depthWrite = !mat.transparent;
      mat.needsUpdate = true;
    });
    this.renderNow();
  }

  setStyle(o) { Object.assign(this.style, o); this.refreshMaterials(); this.applyVisibility(); }
  setSelected(i) { this.selected = i; this.refreshMaterials(); }

  // horizontal slice plane plus the level set drawn on it, and the frame web if exact
  setSlice(h, slice, frameCurves) {
    this.clear(this.sliceG);
    this.sliceG = new THREE.Group();
    this.root.add(this.sliceG);
    if (h == null) return;
    const disk = new THREE.Mesh(new THREE.CircleGeometry(1.0, 96), new THREE.MeshBasicMaterial({ color: 0x818cf8, transparent: true, opacity: 0.09, side: THREE.DoubleSide, depthWrite: false }));
    disk.rotation.x = -Math.PI / 2; disk.position.y = h; disk.renderOrder = 4;
    this.sliceG.add(disk);
    const ring = []; for (let i = 0; i <= 96; i++) { const a = 2 * Math.PI * i / 96; ring.push(new THREE.Vector3(Math.cos(a), h, -Math.sin(a))); }
    this.sliceG.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(ring), new THREE.LineBasicMaterial({ color: 0xa5b4fc })));
    const lines = [];
    if (frameCurves) for (const c of frameCurves) lines.push(c.map(p => [p[0], h + 0.002, -p[1]]));
    else if (slice) for (const f of slice.facets) for (const s of f.segs) lines.push([[s[0][0], h + 0.002, -s[0][1]], [s[1][0], h + 0.002, -s[1][1]]]);
    if (lines.length) {
      const m = new THREE.Mesh(tubeGeometry(lines, 0.006, 5), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      m.renderOrder = 5;
      this.sliceG.add(m);
    }
    this.applyVisibility();
    this.renderNow();
  }

  fit() {
    const sp = this.mode === 'space';
    const H = sp ? 0.4 : (this.F ? this.F.totalH : 1);
    const c = new THREE.Vector3(0, sp ? 0 : H / 2, 0);
    const r = sp ? 1.12 : Math.hypot(1.05, H / 2 + 0.1);
    const v = this.camera.fov * Math.PI / 180;
    const w = this.el.clientWidth || 1, hgt = this.el.clientHeight || 1, [il, ir] = this.insets || [0, 0];
    const hf = 2 * Math.atan(Math.tan(v / 2) * Math.max(0.3, (w - il - ir) / hgt));
    const dir = sp ? new THREE.Vector3(0.0, 0.78, 0.62).normalize() : new THREE.Vector3(0.62, 0.42, 0.66).normalize();
    this.controls.target.copy(c);
    this.camera.position.copy(c.clone().add(dir.multiplyScalar(r / Math.sin(Math.min(v, hf) / 2) * 0.92)));
    this.camera.updateProjectionMatrix();
    this.controls.update();
    this.renderNow();
  }

  viewFrom(which) {
    const H = this.F ? this.F.totalH : 1, c = new THREE.Vector3(0, this.mode === 'space' ? 0 : H / 2, 0);
    const r = this.camera.position.distanceTo(this.controls.target);
    const d = which === 'top' ? new THREE.Vector3(0.001, 1, 0.02) : which === 'side' ? new THREE.Vector3(0, 0.08, 1) : new THREE.Vector3(0.62, 0.42, 0.66);
    this.controls.target.copy(c);
    this.camera.position.copy(c.clone().add(d.normalize().multiplyScalar(r)));
    this.controls.update();
    this.renderNow();
  }
}
