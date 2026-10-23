// LaTeX on the page: KaTeX rendering (inline, rich text with $…$, labels inside SVG) and
// MathQuill input fields whose LaTeX is translated back into the expression grammar.

const NS = "http://www.w3.org/2000/svg";

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const cache = new Map();

// Inline (or display) KaTeX HTML for a LaTeX string.
export function tex(src, display = false) {
  const k = (display ? "D" : "I") + src;
  let h = cache.get(k);
  if (h === undefined) {
    h = window.katex
      ? window.katex.renderToString(src, { throwOnError: false, displayMode: display, strict: "ignore", trust: false })
      : `<span class="mono">${esc(src)}</span>`;
    if (cache.size > 6000) cache.clear();
    cache.set(k, h);
  }
  return h;
}
// Rich text: HTML with $…$ segments rendered as inline math.
export const rich = (s) => String(s).replace(/\$([^$]+)\$/g, (_, m) => tex(m));

// A KaTeX label inside an SVG (foreignObject, in user units, so it scales with the viewBox).
export function svgTex(parent, x, y, latex, { anchor = "middle", w = 220, h = 30, size = 13, color = null, cls = "" } = {}) {
  const fx = anchor === "middle" ? x - w / 2 : anchor === "end" ? x - w : x;
  const fo = document.createElementNS(NS, "foreignObject");
  for (const [k, v] of Object.entries({ x: fx, y: y - h / 2, width: w, height: h, class: "svgtex " + cls })) fo.setAttribute(k, v);
  const div = document.createElement("div");
  div.className = "svgtex-inner " + anchor;
  div.style.fontSize = size + "px";
  if (color) div.style.color = color;
  div.innerHTML = tex(latex);
  fo.appendChild(div);
  parent.appendChild(fo);
  return fo;
}

// Render $…$ in the static page once (MathQuill fields excluded).
export function renderStaticMath(root) {
  if (!window.renderMathInElement) return false;
  window.renderMathInElement(root, {
    delimiters: [{ left: "$$", right: "$$", display: true }, { left: "$", right: "$", display: false }],
    throwOnError: false,
    ignoredClasses: ["mq-field", "no-tex"],
  });
  return true;
}

// Numbers in LaTeX: thousands separators as {,}; very long numbers abbreviated.
export function texNum(n) {
  const s = n.toString();
  if (s.length > 15) return `${s.slice(0, 4)}\\ldots\\ (${s.length}\\text{ digits})`;
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, "{,}");
}
export const texFactored = (pairs) => (pairs.length ? pairs.map(([p, e]) => (e > 1 ? `${p}^{${e}}` : String(p))).join("\\cdot ") : "1");

// ---------------------------------------------------------------------------------------
// MathQuill

let MQ = null;
export function mathQuill() {
  if (MQ) return MQ;
  if (window.MathQuill) MQ = window.MathQuill.getInterface(2);
  return MQ;
}
// Make a MathQuill field in `el` (falls back to a plain input if MathQuill is unavailable).
export function mathField(el, { latex = "", onEnter = null, onEdit = null } = {}) {
  const mq = mathQuill();
  if (!mq) {
    const inp = document.createElement("input");
    inp.className = "field";
    inp.value = latex;
    el.replaceWith(inp);
    if (onEnter) inp.addEventListener("keydown", (e) => { if (e.key === "Enter") onEnter(); });
    return { latex: (v) => (v === undefined ? inp.value : (inp.value = v)), focus: () => inp.focus(), el: inp };
  }
  const mf = mq.MathField(el, {
    spaceBehavesLikeTab: false,
    autoSubscriptNumerals: true,
    autoCommands: "pi alpha",
    handlers: { enter: () => onEnter && onEnter(), edit: () => onEdit && onEdit() },
  });
  if (latex) mf.latex(latex);
  return { latex: (v) => (v === undefined ? mf.latex() : mf.latex(v)), focus: () => mf.focus(), el };
}

// Translate MathQuill LaTeX into the plain expression grammar of octavian.js:
// \frac{a}{b} → ((a)/(b)), e_{1} → e1, \cdot → *, \left( → (, ^{n} → ^(n).
export function latexToExpr(src) {
  let s = String(src)
    .replace(/\\left|\\right/g, "")
    .replace(/\\cdot|\\times|\\ast/g, "*")
    .replace(/\\[,;:! ]|\\quad|\\qquad/g, " ")
    .replace(/\\mathbb\{([A-Za-z])\}/g, "$1")
    .replace(/\\operatorname\{([^}]*)\}/g, "$1")
    .replace(/\\(i|j|k)\b/g, "$1");
  const out = [];
  let i = 0;
  const group = () => { // read {…} or a single char starting at i
    if (s[i] === "{") {
      let depth = 0, j = i;
      for (; j < s.length; j++) { if (s[j] === "{") depth++; else if (s[j] === "}" && --depth === 0) break; }
      const inner = s.slice(i + 1, j);
      i = j + 1;
      return inner;
    }
    return s[i++] || "";
  };
  while (i < s.length) {
    if (s.startsWith("\\frac", i) || s.startsWith("\\dfrac", i) || s.startsWith("\\tfrac", i)) {
      i += s[i + 1] === "f" ? 5 : 6;
      const a = group(), b = group();
      out.push("((" + latexToExpr(a) + ")/(" + latexToExpr(b) + "))");
    } else if (s[i] === "_") {
      i++;
      out.push(latexToExpr(group()));
    } else if (s[i] === "^") {
      i++;
      out.push("^(" + latexToExpr(group()) + ")");
    } else if (s[i] === "{") {
      out.push("(" + latexToExpr(group()) + ")");
    } else if (s[i] === "\\") {
      const m = s.slice(i).match(/^\\[A-Za-z]+/);
      throw new Error("unexpected " + (m ? m[0] : "\\"));
    } else out.push(s[i++]);
  }
  return out.join("");
}
