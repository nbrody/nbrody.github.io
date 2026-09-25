// Shared materials and procedural textures for the machine.
import * as THREE from 'three';

const cache = new Map();

export function makeMaterials(renderer) {
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const M = {};
  M.steel = new THREE.MeshStandardMaterial({ color: 0xd9dee4, metalness: 1, roughness: 0.2 });
  M.steelDark = new THREE.MeshStandardMaterial({ color: 0x8a9098, metalness: 1, roughness: 0.35 });
  M.chain = new THREE.MeshStandardMaterial({ color: 0x3a3d42, metalness: 0.9, roughness: 0.45 });
  M.brass = new THREE.MeshStandardMaterial({ color: 0xd4a94f, metalness: 1, roughness: 0.28 });
  M.copper = new THREE.MeshStandardMaterial({ color: 0xc9774a, metalness: 1, roughness: 0.3 });
  M.bronze = new THREE.MeshStandardMaterial({ color: 0xb07a3c, metalness: 1, roughness: 0.32 });
  M.gongBronze = new THREE.MeshStandardMaterial({ color: 0xa8702f, metalness: 1, roughness: 0.38, map: gongTexture(aniso) });
  M.iron = new THREE.MeshStandardMaterial({ color: 0x1f2a2a, metalness: 0.5, roughness: 0.55 });
  M.cream = new THREE.MeshStandardMaterial({ color: 0xf1e8d6, metalness: 0.0, roughness: 0.5 });
  M.rosewood = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, metalness: 0, map: woodTexture(aniso, '#6d2f1c', '#4a1c10') });
  M.maple = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.45, metalness: 0, map: woodTexture(aniso, '#d9b27a', '#b98a52') });
  M.glass = new THREE.MeshStandardMaterial({ color: 0xe6f2ff, metalness: 0, roughness: 0.04, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide });
  M.drumHead = new THREE.MeshStandardMaterial({ color: 0xf4efe2, roughness: 0.65, metalness: 0 });
  M.funnel = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.35, roughness: 0.3, map: spiralTexture(aniso), side: THREE.DoubleSide });
  M.hopper = new THREE.MeshStandardMaterial({ color: 0xd9b25c, metalness: 1, roughness: 0.26, side: THREE.DoubleSide });
  M.trough = new THREE.MeshStandardMaterial({ color: 0xc9874f, metalness: 1, roughness: 0.3, side: THREE.DoubleSide });
  M.rubber = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.8 });
  M.white = new THREE.MeshStandardMaterial({ color: 0xfaf6ee, roughness: 0.4 });
  M.gold = new THREE.MeshStandardMaterial({ color: 0xf0c75a, metalness: 1, roughness: 0.22 });
  M.pedestal = new THREE.MeshStandardMaterial({ color: 0x17423c, metalness: 0.2, roughness: 0.45 });
  M.paint = (hex) => {
    const k = 'paint' + hex;
    if (!cache.has(k)) cache.set(k, new THREE.MeshStandardMaterial({ color: new THREE.Color(hex), metalness: 0.25, roughness: 0.38 }));
    return cache.get(k);
  };
  M.glow = (hex) => {
    const k = 'glow' + hex;
    if (!cache.has(k)) cache.set(k, new THREE.MeshStandardMaterial({ color: new THREE.Color(hex), emissive: new THREE.Color(hex), emissiveIntensity: 0.6, roughness: 0.4 }));
    return cache.get(k);
  };
  return M;
}

function canvasTex(w, h, draw, aniso, repeat) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  return t;
}

function woodTexture(aniso, base, dark) {
  return canvasTex(256, 64, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 70; i++) {
      const y = Math.random() * h;
      g.strokeStyle = dark;
      g.globalAlpha = 0.08 + Math.random() * 0.18;
      g.lineWidth = 0.5 + Math.random() * 1.8;
      g.beginPath();
      g.moveTo(0, y);
      for (let x = 0; x <= w; x += 16) g.lineTo(x, y + Math.sin(x * 0.03 + i) * 1.5 + (Math.random() - 0.5) * 0.8);
      g.stroke();
    }
    g.globalAlpha = 1;
  }, aniso, true);
}

function spiralTexture(aniso) {
  // U runs around the funnel, V from rim to hole: red/cream spiral stripes
  return canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#f3e7cf'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#c8243a';
    const n = 8;
    for (let k = 0; k < n; k++) {
      g.beginPath();
      for (let y = 0; y <= h; y += 4) {
        const x = ((k / n) * w + y * 1.3) % w;
        if (y === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      for (let y = h; y >= 0; y -= 4) {
        const x = ((k / n) * w + y * 1.3 + w / (2 * n)) % w;
        g.lineTo(x, y);
      }
      g.closePath(); g.fill();
    }
    // wrap-safe second pass for stripes crossing the edge
    g.globalCompositeOperation = 'source-over';
    for (let y = 0; y < h; y += 64) { g.fillStyle = 'rgba(255,255,255,0.05)'; g.fillRect(0, y, w, 2); }
  }, aniso, true);
}

// For a lathe the texture's v runs along the profile (centre -> rim), so the
// concentric rings of a hammered gong are horizontal bands.
function gongTexture(aniso) {
  return canvasTex(64, 512, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, '#e9bd72'); grd.addColorStop(0.12, '#a86c2a'); grd.addColorStop(0.2, '#d09a52'); grd.addColorStop(0.55, '#b27a3a'); grd.addColorStop(0.85, '#8a5520'); grd.addColorStop(1, '#5d3510');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 3) {
      g.globalAlpha = 0.08 + Math.random() * 0.1;
      g.fillStyle = (y / 3) % 2 ? '#3a2008' : '#f7d8a0';
      g.fillRect(0, y, w, 1.5);
    }
    g.globalAlpha = 1;
  }, aniso, false);
}

// Billiard-style ball texture: solid or stripe with a numbered white disk.
export function ballTexture(colorHex, number, aniso = 4) {
  const key = `ball${colorHex}-${number}`;
  if (cache.has(key)) return cache.get(key);
  const col = '#' + colorHex.toString(16).padStart(6, '0');
  const stripe = number > 8;
  const t = canvasTex(512, 256, (g, w, h) => {
    g.fillStyle = stripe ? '#f8f4ea' : col;
    g.fillRect(0, 0, w, h);
    if (stripe) { g.fillStyle = col; g.fillRect(0, h * 0.28, w, h * 0.44); }
    for (const cx of [w * 0.25, w * 0.75]) {
      g.fillStyle = '#f8f4ea';
      g.beginPath(); g.ellipse(cx, h / 2, w * 0.07, h * 0.14, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#161616';
      g.font = `bold ${Math.round(h * 0.17)}px Georgia, serif`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(String(number), cx, h / 2 + 2);
      if (number === 6 || number === 9) g.fillRect(cx - 9, h / 2 + h * 0.09, 18, 3);
    }
  }, aniso, false);
  cache.set(key, t);
  return t;
}
