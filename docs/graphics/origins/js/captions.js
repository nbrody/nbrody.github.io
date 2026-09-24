// captions.js — the storytelling layer: chapter title cards, beat captions,
// and a cosmic timeline along the bottom edge.
//
// Opacity is computed from chapter time every frame (not CSS transitions) so
// captions stay exact while paused, scrubbing, or seeking.

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const envelope = (T, a, d, fi, fo) => Math.min(smooth(a, a + fi, T), 1 - smooth(a + d - fo, a + d, T));

// Cosmic timeline: 13.8 billion years drawn linearly. Everything after
// Chapter 2 happens in the last third; humans occupy the final hair.
const AGE = 13.8e9;

export class Captions {
  constructor(root) {
    this.root = root;
    this.enabled = true;
    root.innerHTML = `
      <div class="card"><div class="card-num"></div><div class="card-title"></div><div class="card-sub"></div></div>
      <div class="cap"><div class="cap-title"></div><div class="cap-sub"></div></div>
      <div class="timeline">
        <div class="tl-track"><div class="tl-fill"></div><div class="tl-dot"></div></div>
        <div class="tl-labels"><span>Big Bang</span><span class="tl-now"></span><span>today</span></div>
      </div>`;
    this.card = root.querySelector('.card');
    this.cardNum = root.querySelector('.card-num');
    this.cardTitle = root.querySelector('.card-title');
    this.cardSub = root.querySelector('.card-sub');
    this.cap = root.querySelector('.cap');
    this.capTitle = root.querySelector('.cap-title');
    this.capSub = root.querySelector('.cap-sub');
    this.timeline = root.querySelector('.timeline');
    this.tlFill = root.querySelector('.tl-fill');
    this.tlDot = root.querySelector('.tl-dot');
    this.tlNow = root.querySelector('.tl-now');
    this.last = {};
  }

  toggle() { this.setEnabled(!this.enabled); }
  setEnabled(on) {
    this.enabled = on;
    this.root.hidden = !on;
  }

  _set(key, el, value, prop = 'textContent') {
    if (this.last[key] === value) return;
    this.last[key] = value;
    if (prop === 'opacity') el.style.opacity = value;
    else if (prop === 'width') el.style.width = value;
    else if (prop === 'left') el.style.left = value;
    else el[prop] = value;
  }

  update(director) {
    if (!this.enabled) return;
    let best = null, bestA = 0, card = null, cardA = 0, yearsAgo = null, tlA = 0;
    for (const { scene, T, w } of director.layers()) {
      // chapter title card, plus any cards the scene adds (a closing title)
      const ca = envelope(T, 0.6, 6.2, 1.6, 1.8) * w;
      if (ca > cardA) { cardA = ca; card = scene; }
      for (const c of scene.cards || []) {
        const a = envelope(T, c.t, c.d, c.fi ?? 1.6, c.fo ?? 1.8) * w;
        if (a > cardA) { cardA = a; card = c; }
      }
      // beat captions
      for (const c of scene.cues) {
        const a = envelope(T, c.t, c.d ?? 6, 1.0, 1.2) * w;
        if (a > bestA) { bestA = a; best = c; }
      }
      // where we are in cosmic history
      if (scene.yearsAgo && w >= 0.5) { yearsAgo = scene.yearsAgo(T); tlA = scene.timelineAlpha?.(T) ?? 1; }
    }

    this._set('cardA', this.card, cardA.toFixed(3), 'opacity');
    if (card && cardA > 0) {
      this._set('cardNum', this.cardNum, card.num);
      this._set('cardTitle', this.cardTitle, card.title);
      this._set('cardSub', this.cardSub, card.subtitle);
    }

    // hide beat captions while the title card is up
    const capA = bestA * (1 - Math.min(1, cardA * 1.5));
    this._set('capA', this.cap, capA.toFixed(3), 'opacity');
    if (best) {
      this._set('capTitle', this.capTitle, best.title, 'innerHTML');
      this._set('capSub', this.capSub, best.sub ?? '', 'innerHTML');
    }

    if (yearsAgo != null) {
      const f = Math.min(1, Math.max(0, 1 - yearsAgo / AGE));
      this._set('tlW', this.tlFill, `${(f * 100).toFixed(3)}%`, 'width');
      this._set('tlL', this.tlDot, `${(f * 100).toFixed(3)}%`, 'left');
      this._set('tlNow', this.tlNow, formatAgo(yearsAgo));
    }
    this._set('tlA', this.timeline, (yearsAgo == null ? 0 : tlA * (1 - cardA * 0.6)).toFixed(3), 'opacity');
  }
}

export function formatAgo(y) {
  if (y >= AGE * 0.99995) return '13.8 billion years ago';
  if (y >= 1e9) return `${(y / 1e9).toFixed(y >= 1e10 ? 1 : 2).replace(/\.?0+$/, '')} billion years ago`;
  if (y >= 1e6) return `${Math.round(y / 1e6).toLocaleString()} million years ago`;
  if (y >= 1e4) return `${Math.round(y / 1e3).toLocaleString()},000 years ago`;
  if (y >= 100) return `${Math.round(y).toLocaleString()} years ago`;
  return 'now';
}
