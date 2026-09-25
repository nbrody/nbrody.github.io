// Build dist/: a single-file bundle of js/ (three.js stays external, resolved
// by the page's import map), a standalone dist/index.html, and
// dist/artifact.html (the same page without the document wrapper tags, for
// hosts that supply <html>/<head>/<body> themselves). Both drop the Graphics
// Studio redirect, so they always run as the full-page app.
//   node tools/build-artifact.mjs [path-to-esbuild]
// or set ESBUILD, or have esbuild on your PATH.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, delimiter } from 'node:path';
import { execFileSync } from 'node:child_process';

const root = new URL('..', import.meta.url).pathname;
const candidates = [
  process.argv[2],
  process.env.ESBUILD,
  join(root, 'node_modules/.bin/esbuild'),
  ...(process.env.PATH || '').split(delimiter).map((d) => join(d, 'esbuild')),
].filter(Boolean);
const esbuild = candidates.find((p) => existsSync(p));
if (!esbuild) throw new Error('esbuild not found; pass its path as the first argument or set ESBUILD');

mkdirSync(join(root, 'dist'), { recursive: true });
execFileSync(esbuild, [
  join(root, 'js/main.js'), '--bundle', '--format=esm', '--target=es2020',
  '--external:three', '--external:three/addons/*', '--legal-comments=none',
  '--minify-syntax', `--outfile=${join(root, 'dist/app.js')}`,
], { stdio: 'inherit' });

const html = readFileSync(join(root, 'index.html'), 'utf8')
  .replace('src="js/main.js"', 'src="app.js"')
  .replace(/<script src="\.\.\/app\/entry\.js"><\/script>\s*/, '');
writeFileSync(join(root, 'dist/index.html'), html);
const bare = html
  .replace(/<!doctype html>\s*/i, '')
  .replace(/<html[^>]*>\s*/i, '').replace(/<\/html>\s*/i, '')
  .replace(/<head>\s*/i, '').replace(/<\/head>\s*/i, '')
  .replace(/<body>\s*/i, '').replace(/<\/body>\s*/i, '')
  .replace(/<meta charset="utf-8">\s*/i, '')
  .replace(/<meta name="viewport"[^>]*>\s*/i, '');
writeFileSync(join(root, 'dist/artifact.html'), bare);
console.log('built dist/app.js, dist/index.html, dist/artifact.html');
