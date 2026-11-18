// The HTML syntax tree (hast) the Markdown pipeline produces, turned into DOM
// nodes for the page, or into an HTML string for the tests. The pipeline drops
// any raw HTML written in a note, so every element and attribute here comes
// from Markdown syntax, the plugins in this folder, or KaTeX. URLs are checked
// before this (render.js, safeUrls).
const NS = { svg: 'http://www.w3.org/2000/svg', math: 'http://www.w3.org/1998/Math/MathML' };

// [attribute name, string value] for a hast property, or null to omit it.
function attribute(info, schema, key, value) {
  if (value === null || value === undefined || value === false || (typeof value === 'number' && Number.isNaN(value))) return null;
  const prop = info.find(schema, key);
  if (value === true) return [prop.attribute, ''];
  if (Array.isArray(value)) value = value.join(prop.commaSeparated ? ', ' : ' ');
  return [prop.attribute, String(value)];
}

const space = (tag, parent) => (tag === 'svg' ? 'svg' : tag === 'math' ? 'math' : parent);
// Whitespace between table parts is not content (React drops it too).
const TABLE = new Set(['table', 'thead', 'tbody', 'tfoot', 'tr']);
const kids = node => (TABLE.has(node.tagName) ? (node.children || []).filter(c => !(c.type === 'text' && !c.value.trim())) : node.children || []);

// info: {find, html, svg} from property-information (vendored, or npm's in tests).
export function toDom(node, info, doc = document, ns = 'html') {
  if (node.type === 'root') {
    const frag = doc.createDocumentFragment();
    for (const child of node.children || []) { const n = toDom(child, info, doc, ns); if (n) frag.append(n); }
    return frag;
  }
  if (node.type === 'text') return doc.createTextNode(node.value);
  if (node.type !== 'element') return null; // comments, doctypes, raw: never rendered
  const here = space(node.tagName, ns);
  const el = here === 'html' ? doc.createElement(node.tagName) : doc.createElementNS(NS[here], node.tagName);
  const schema = here === 'svg' ? info.svg : info.html;
  for (const [key, value] of Object.entries(node.properties || {})) {
    const pair = attribute(info, schema, key, value);
    if (pair) el.setAttribute(pair[0], pair[1]);
  }
  for (const child of kids(node)) { const n = toDom(child, info, doc, here); if (n) el.append(n); }
  return el;
}

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const escapeText = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escapeAttr = s => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');

export function toHtml(node, info, ns = 'html') {
  if (node.type === 'root') return (node.children || []).map(c => toHtml(c, info, ns)).join('');
  if (node.type === 'text') return escapeText(node.value);
  if (node.type !== 'element') return '';
  const here = space(node.tagName, ns), schema = here === 'svg' ? info.svg : info.html;
  const attrs = Object.entries(node.properties || {}).map(([k, v]) => attribute(info, schema, k, v)).filter(Boolean)
    .map(([a, v]) => (v === '' ? ` ${a}=""` : ` ${a}="${escapeAttr(v)}"`)).join('');
  if (here === 'html' && VOID.has(node.tagName)) return `<${node.tagName}${attrs}>`;
  return `<${node.tagName}${attrs}>${kids(node).map(c => toHtml(c, info, here)).join('')}</${node.tagName}>`;
}
