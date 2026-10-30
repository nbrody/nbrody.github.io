// Markdown source → HTML syntax tree, with alphaMarkdown's plugins in the
// order the Notes section has always used: GFM and math, theorem-like blocks,
// [[wiki links]], display-math blocks, folding, then KaTeX. Reading mode and
// the workspace's chat use it; Live editing is live-preview.js. The libraries are passed in (`libs`) so the page uses its
// vendored copies (js/libs.js) and the tests npm's.
import { normalizeWithOffsets, rehypeMathBlocks } from './live.js';
import { remarkEnvironments, remarkWikiLinks, katexOptions } from './syntax.js';
import { rehypeFoldSections } from './folding.js';

// Links and pictures: http(s), mailto, relative paths and #anchors only, as in
// react-markdown; a relative picture is resolved against the note's folder.
const safeProtocol = /^(https?|ircs?|mailto|xmpp)$/i;
export function safeUrl(value) {
  const colon = value.indexOf(':'), q = value.indexOf('?'), hash = value.indexOf('#'), slash = value.indexOf('/');
  if (colon === -1 || (slash !== -1 && colon > slash) || (q !== -1 && colon > q) || (hash !== -1 && colon > hash) || safeProtocol.test(value.slice(0, colon))) return value;
  return '';
}
const URL_PROPS = ['href', 'src', 'cite', 'poster'];
function rehypeSafeUrls({ resolveURL } = {}) {
  return tree => {
    const walk = node => {
      if (node.type === 'element' && node.properties) for (const key of URL_PROPS) {
        const url = node.properties[key];
        if (typeof url !== 'string') continue;
        node.properties[key] = key === 'src' && resolveURL && url && !/^(?:[a-z][\w+.-]*:|\/|#)/i.test(url) ? resolveURL(url) : safeUrl(url);
      }
      node.children?.forEach(walk);
    };
    walk(tree);
  };
}
// HTML typed into a note shows as text, never as markup.
function rehypeRawAsText() {
  return tree => {
    const walk = node => { if (node.children) node.children = node.children.map(c => (c.type === 'raw' ? { type: 'text', value: c.value } : (walk(c), c))); };
    walk(tree);
  };
}

// A fold arrow in each heading that owns a section (folding.js marks them).
// The editor handles clicks on [data-fold-toggle].
const chevron = () => ({ type: 'element', tagName: 'svg', properties: { viewBox: '0 0 24 24', width: 16, height: 16, fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', ariaHidden: 'true' },
  children: [{ type: 'element', tagName: 'path', properties: { d: 'm6 9 6 6 6-6' }, children: [] }] });
function rehypeFoldButtons({ collapsed = [] } = {}) {
  return tree => {
    for (const node of tree.children) {
      const key = node.type === 'element' && node.properties?.['data-fold-key'];
      if (!key) continue;
      const closed = collapsed.includes(key), label = node.properties['data-fold-label'] || '';
      node.properties.className = [...(node.properties.className || []), 'fold-heading'];
      node.children.unshift({ type: 'element', tagName: 'button', properties: {
        type: 'button', className: ['fold-toggle'], ariaExpanded: String(!closed), ariaLabel: `${closed ? 'Expand' : 'Collapse'} section: ${label}`,
        title: `${closed ? 'Expand' : 'Collapse'} section`, dataFoldToggle: key }, children: [chevron()] });
    }
  };
}

// folds: collapsed heading keys, or null to turn folding off.
export function renderTree(libs, source, { macros = {}, folds = null, resolveURL } = {}) {
  const normal = normalizeWithOffsets(source);
  let p = libs.unified()
    .use(libs.remarkParse).use(libs.remarkGfm).use(libs.remarkMath)
    .use(remarkEnvironments, { source, offset: normal.offset }).use(remarkWikiLinks)
    .use(libs.remarkRehype, { allowDangerousHtml: true }).use(rehypeRawAsText)
    .use(rehypeMathBlocks);
  if (folds) p = p.use(rehypeFoldSections, { collapsed: folds }).use(rehypeFoldButtons, { collapsed: folds });
  p = p.use(libs.rehypeKatex, katexOptions(macros)).use(rehypeSafeUrls, { resolveURL });
  return p.runSync(p.parse(normal.text));
}
