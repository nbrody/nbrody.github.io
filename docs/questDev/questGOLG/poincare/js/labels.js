/**
 * Face labels (s_k, s_k^{-1}) as camera-facing sprites: a small pill with the
 * LaTeX drawn by tex.js. The sprite redraws itself once MathJax has rendered.
 */
import * as THREE from 'three';
import { texImage, drawTex, onTexReady } from './ui/tex.js';

const PX = 44;           // em size on the label canvas
const live = new Set();  // labels still waiting for their formula

onTexReady(() => {
    for (const L of [...live]) if (L.draw()) live.delete(L);
});

const COLORS = {
    light: { bg: 'rgba(255,255,255,0.88)', ink: '#16181e' },
    dark: { bg: 'rgba(43,49,56,0.88)', ink: '#e8ebef' },
};

/** A sprite showing `tex`; sprite.userData.aspect = width / height. */
export function makeLabel(tex, theme = 'light') {
    const C = COLORS[theme] || COLORS.light;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    const mat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, depthTest: true, toneMapped: false });
    const sprite = new THREE.Sprite(mat);
    sprite.renderOrder = 20;
    sprite.userData.aspect = 1.6;

    const L = {
        draw() {
            const t = texImage(tex, { color: C.ink, px: PX });
            const ready = t.ready && !t.error && t.img;
            const w = ready ? t.w : PX * 1.2, h = ready ? t.h : PX * 0.9;
            const padX = PX * 0.45, padY = PX * 0.28;
            const W = Math.ceil(w + 2 * padX), Hh = Math.ceil(Math.max(h, PX * 0.9) + 2 * padY);
            if (canvas.width !== W || canvas.height !== Hh) { canvas.width = W; canvas.height = Hh; }
            ctx.clearRect(0, 0, W, Hh);
            ctx.fillStyle = C.bg;
            const r = Hh / 2;
            ctx.beginPath();
            ctx.moveTo(r, 0); ctx.lineTo(W - r, 0); ctx.arc(W - r, r, r, -Math.PI / 2, Math.PI / 2);
            ctx.lineTo(r, Hh); ctx.arc(r, r, r, Math.PI / 2, 3 * Math.PI / 2); ctx.closePath();
            ctx.fill();
            if (ready) {
                const base = (Hh + (t.h - 2 * t.depth)) / 2;
                drawTex(ctx, t, (W - t.w) / 2, base);
            } else {
                ctx.fillStyle = C.ink;
                ctx.font = `${Math.round(PX * 0.8)}px "Atkinson Hyperlegible", sans-serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText((t && t.fallback) || tex, W / 2, Hh / 2);
            }
            sprite.userData.aspect = W / Hh;
            texture.needsUpdate = true;
            return !!ready || (t && t.error);
        }
    };
    if (!L.draw()) live.add(L);
    sprite.onRemoved = () => live.delete(L);
    sprite.addEventListener('removed', () => { live.delete(L); texture.dispose(); mat.dispose(); });
    return sprite;
}
