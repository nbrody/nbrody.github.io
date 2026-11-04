// Figure 1 (TEMPLATE): the module contract. Pure math is exported and tested in node (tests/);
// the DOM is built only in mount(). Colours are read at draw time; math goes through MathJax.
import { el, makeCanvas, labelLayer, slider, controls, setTex, palette, onTheme } from './common.js';

/** The live check: x² ≥ 0 at every sample. Pure, so node can test it. */
export function squares(lo, hi, n = 64) {
  const xs = Array.from({ length: n + 1 }, (_, i) => lo + ((hi - lo) * i) / n);
  return xs.map((x) => [x, x * x]);
}

export function mount(root) {
  const row = el('div', { class: 'fig-row' });
  const left = el('div', { class: 'grow' }), right = el('div', { class: 'side' });
  row.append(left, right);
  root.append(row);

  const st = { a: 1.5 };   // an interesting default: the curve already fills the frame
  const cv = makeCanvas(left, { aspect: 0.7, maxHeight: 420, draw });
  const labels = labelLayer(cv.wrap);

  function draw(ctx, w, h) {
    const P = palette();
    const pts = squares(-st.a, st.a);
    const top = st.a * st.a || 1;
    const X = (x) => w / 2 + (x / st.a) * (w / 2 - 20), Y = (y) => h - 20 - (y / top) * (h - 40);
    ctx.strokeStyle = P.grid; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, Y(0) + 0.5); ctx.lineTo(w, Y(0) + 0.5); ctx.stroke();
    ctx.strokeStyle = P.main; ctx.lineWidth = 2.5;
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y))));
    ctx.stroke();
    labels.set([{ id: 'curve', x: X(st.a) - 8, y: Y(top) + 6, tex: 'y=x^2', cls: 'halo', anchor: 'sw', color: P.main }]);
    readout();
  }

  const ctl = controls(right);
  ctl.style.marginTop = '0';
  slider(ctl, { label: 'range $a$', min: 0.5, max: 3, step: 0.1, value: st.a, fmt: (v) => v.toFixed(1), oninput: (v) => { st.a = v; cv.redraw(); } });
  const ro = el('div', { class: 'readout', style: 'margin-top:.7rem' });
  right.append(ro, el('div', { class: 'hint' }, 'Drag the slider.'));

  function readout() {
    const min = Math.min(...squares(-st.a, st.a).map(([, y]) => y));
    setTex(ro, `<table><tr><td>$\\min x^2$ on $[-a,a]$</td><td class="num">${min.toFixed(3)}</td></tr>
      <tr><td colspan="2">(1.1) holds: <span class="${min >= 0 ? 'ok' : 'bad'}">${min >= 0 ? '✓' : '✗'}</span></td></tr></table>`);
  }
  onTheme(() => cv.redraw());
}
