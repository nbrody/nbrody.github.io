// Resolve project reels to a linked slide URL, keeping entries within their
// own folder and preserving the reel's interactive mode.
import {relativeURL} from './folder-path.js';

export function reelProjectTarget(manifestPath, manifest, files, deckFolder) {
  if (!manifestPath.endsWith('/reel.json') || !manifest || typeof manifest !== 'object' || Array.isArray(manifest)) throw new Error('The reel manifest is invalid.');
  const folder=manifestPath.slice(0,-'/reel.json'.length);
  const entry=typeof manifest.entry==='string' && manifest.entry ? manifest.entry.replace(/^\.\//,'') : 'index.html';
  if (!/\.html?$/i.test(entry) || /[\\?#]/.test(entry) || entry.split('/').some(p=>!p || p.startsWith('.'))) throw new Error('The reel entry must be an HTML file inside its folder.');
  const path=folder+'/'+entry;
  if (!files.some(f=>f.path===path)) throw new Error('The reel’s entry HTML file is missing from the project.');
  const mode=typeof manifest.interact==='string' ? manifest.interact.trim() : '?mode=interact';
  const query=mode ? '?'+new URLSearchParams(mode.replace(/^\?/, '')).toString() : '';
  return {path,url:relativeURL(deckFolder,path)+query,title:typeof manifest.title==='string' && manifest.title.trim() ? manifest.title : folder.split('/').pop()};
}
