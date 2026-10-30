// The vendored libraries, in the shape render.js and hast.js take them.
// (Tests pass npm's copies of the same packages instead.)
import * as md from '../vendor/markdown.js';

export const libs = {
  unified: md.unified, remarkParse: md.remarkParse, remarkGfm: md.remarkGfm,
  remarkMath: md.remarkMath, remarkRehype: md.remarkRehype, rehypeKatex: md.rehypeKatex,
};
export const info = { find: md.find, html: md.html, svg: md.svg };
export const katex = md.katex;
