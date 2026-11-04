// All mathematics on the page is typeset by KaTeX. Figures keep their shapes in SVG / canvas and
// put their labels in an HTML layer laid over them (same pixel coordinates), so a label is real
// LaTeX rather than Unicode characters in a text font.

export const MACROS = {
  "\\Z": "\\mathbb{Z}", "\\Q": "\\mathbb{Q}", "\\R": "\\mathbb{R}", "\\F": "\\mathbb{F}",
  "\\PGL": "\\mathrm{PGL}", "\\fl": "\\lfloor #1\\rfloor_{#2}", "\\row": "\\mathrm{row}",
};

const prep = (s) => s
  .replace(/\\begin\{psmallmatrix\}/g, "\\left(\\begin{smallmatrix}")
  .replace(/\\end\{psmallmatrix\}/g, "\\end{smallmatrix}\\right)");

const cache = new Map();
export function tex(s, display = false) {
  if (!window.katex) return s;
  const key = (display ? "D" : "I") + s;
  let out = cache.get(key);
  if (out === undefined) {
    out = katex.renderToString(prep(s), {
      displayMode: display, throwOnError: false, macros: MACROS,
      trust: (ctx) => ctx.command === "\\htmlClass",
      strict: (code) => (code === "htmlExtension" ? "ignore" : "warn"),
    });
    if (cache.size > 4000) cache.clear();
    cache.set(key, out);
  }
  return out;
}
// "$…$" and "$$…$$" inside a string of HTML
export function rich(str) {
  return str.replace(/\$\$([\s\S]+?)\$\$|\$([^$]+?)\$/g, (_, d, i) => (d !== undefined ? tex(d, true) : tex(i, false)));
}
export function renderStaticMath(root = document) {
  root.querySelectorAll(".tex").forEach((n) => {
    if (n.dataset.raw === undefined) n.dataset.raw = n.textContent;
    n.innerHTML = rich(n.dataset.raw);
  });
}

// ---------------------------------------------------------------- label layer

const AX = { start: 0, middle: 0.5, end: 1 };
const AY = { top: 0, middle: 0.5, bottom: 1 };

export class TexLayer {
  // host: an element that contains the figure; it becomes the positioning context
  constructor(host, cls = "") {
    if (getComputedStyle(host).position === "static") host.style.position = "relative";
    this.el = document.createElement("div");
    this.el.className = "tex-layer " + cls;
    host.appendChild(this.el);
  }
  clear() { this.el.replaceChildren(); }

  // a label whose anchor point (anchor ∈ start|middle|end, baseline ∈ top|middle|bottom) sits at (x, y)
  add(src, x, y, { anchor = "middle", baseline = "middle", cls = "", opacity = 1, html = false } = {}) {
    const s = document.createElement("span");
    s.className = "tex-lab " + cls;
    s.innerHTML = html ? src : tex(src);
    s.style.left = x + "px"; s.style.top = y + "px";
    s.style.transform = `translate(${-100 * AX[anchor]}%, ${-100 * AY[baseline]}%)`;
    if (opacity !== 1) s.style.opacity = opacity;
    this.el.appendChild(s);
    return s;
  }

  // Greedy placement without overlaps. cands: [{ src, x, y, tries: [{dx, dy, anchor, baseline}], cls, pri }]
  // Everything is inserted hidden, measured in one layout pass, then accepted or dropped.
  place(cands, { pad = 2, bounds = null } = {}) {
    cands = [...cands].sort((a, b) => b.pri - a.pri);
    const nodes = cands.map((c) => {
      const s = this.add(c.src, 0, 0, { cls: c.cls, anchor: "start", baseline: "top" });
      s.style.visibility = "hidden";
      return s;
    });
    const sizes = nodes.map((s) => [s.offsetWidth, s.offsetHeight]);
    const boxes = [];
    cands.forEach((c, i) => {
      const [w, h] = sizes[i], s = nodes[i];
      for (const t of c.tries) {
        const x0 = c.x + (t.dx || 0) - w * AX[t.anchor || "middle"];
        const y0 = c.y + (t.dy || 0) - h * AY[t.baseline || "middle"];
        const box = { x0: x0 - pad, y0: y0 - pad, x1: x0 + w + pad, y1: y0 + h + pad };
        if (bounds && (box.x0 < bounds.x0 || box.x1 > bounds.x1)) continue;
        if (!c.force && boxes.some((b) => !(box.x1 < b.x0 || box.x0 > b.x1 || box.y1 < b.y0 || box.y0 > b.y1))) continue;
        boxes.push(box);
        s.style.left = x0 + "px"; s.style.top = y0 + "px";
        s.style.visibility = "";
        return;
      }
      s.remove();
    });
  }
}

// q ∈ ℚ as TeX (a small fraction for tree labels)
export const qTeX = (q, small = true) => {
  if (q.d === 1n) return `${q.n}`;
  const sgn = q.n < 0n ? "-" : "";
  const a = q.n < 0n ? -q.n : q.n;
  return `${sgn}${small ? "\\tfrac" : "\\frac"}{${a}}{${q.d}}`;
};
export const vertexTeX = (v) => `\\lfloor ${qTeX(v.q)}\\rfloor_{${v.n}}`;
