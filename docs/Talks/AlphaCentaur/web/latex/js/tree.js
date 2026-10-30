// File tree with collapsible folders built from file paths (or the host's
// display labels).
import {h, icon} from './ui.js';

export function treeOf(files) {
  const root = {name: '', path: '', folders: new Map(), files: []};
  for (const f of files) {
    const parts = (f.label || f.path).split('/');
    let node = root, at = '';
    for (const name of parts.slice(0, -1)) {
      at = at ? `${at}/${name}` : name;
      if (!node.folders.has(name)) node.folders.set(name, {name, path: at, folders: new Map(), files: []});
      node = node.folders.get(name);
    }
    node.files.push({...f, name: parts.at(-1)});
  }
  return root;
}

export const fileIcon = f => f.icon || {tex: 'fileText', bib: 'library', image: 'image', pdf: 'book'}[f.kind] || 'file';

const DRAG = 'application/x-latex-file';
export function fileRow(f, {depth = 0, active, main, dirty, onOpen, onRename, onDelete, onMove}) {
  const movable = !!onMove && !f.readOnly && f.group !== 'shared';
  return h('div', {class: `tree-row file ${active ? 'active' : ''} ${f.binary && f.kind !== 'image' && f.kind !== 'pdf' ? 'inert' : ''}`,
    style: {paddingLeft: `${10 + depth * 14}px`}, role: 'treeitem', 'aria-selected': String(!!active), tabindex: '0', title: f.path,
    draggable: movable ? 'true' : undefined, ondragstart: movable ? e => { e.dataTransfer.setData(DRAG, f.id); e.dataTransfer.effectAllowed = 'move'; } : undefined,
    onclick: () => onOpen(f.id), onkeydown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(f.id); } }},
    icon(fileIcon(f), 15, 'tree-icon'),
    h('span', {class: 'tree-name'}, f.name || f.label || f.path),
    dirty ? h('span', {class: 'dirty-dot', title: 'Unsaved changes'}) : null,
    main ? h('span', {class: 'pill main', title: 'Main document'}, 'main') : null,
    f.tag ? h('span', {class: 'pill'}, f.tag) : null,
    f.badge ? h('span', {class: 'pill linked'}, f.badge) : null,
    onRename && !f.readOnly ? h('button', {class: 'row-action', title: 'Move or rename', 'aria-label': `Move or rename ${f.path}`,
      onclick: e => { e.stopPropagation(); onRename(f.id); }}, icon('move', 13)) : null,
    onDelete && !f.readOnly && f.group !== 'shared' ? h('button', {class: 'row-action', title: 'Move to Trash', 'aria-label': `Delete ${f.path}`,
      onclick: e => { e.stopPropagation(); onDelete(f.id); }}, icon('trash', 13)) : null);
}
// Folder rows (and the tree's empty space) accept files dragged within the tree.
function dropTarget(el, folder, onMove) {
  if (!onMove) return el;
  el.addEventListener('dragover', e => { if (e.dataTransfer.types.includes(DRAG)) { e.preventDefault(); e.stopPropagation(); el.classList.add('drop'); } });
  el.addEventListener('dragleave', () => el.classList.remove('drop'));
  el.addEventListener('drop', e => {
    const id = e.dataTransfer.getData(DRAG);
    el.classList.remove('drop');
    if (!id) return;
    e.preventDefault(); e.stopPropagation();
    onMove(id, folder);
  });
  return el;
}

export function renderTree(container, files, {activeId, mainId, isDirty, folds, onToggle, onOpen, onRename, onDelete, onMove}) {
  const out = [];
  const walk = (node, depth) => {
    for (const folder of [...node.folders.values()].sort((a, b) => a.name.localeCompare(b.name))) {
      const closed = folds.has(folder.path);
      out.push(dropTarget(h('div', {class: 'tree-row folder', 'data-path': folder.path, style: {paddingLeft: `${10 + depth * 14}px`}, role: 'treeitem', tabindex: '0',
        'aria-expanded': String(!closed), onclick: () => onToggle(folder.path),
        onkeydown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(folder.path); } }},
        icon(closed ? 'right' : 'down', 13, 'tree-chevron'), icon(closed ? 'folder' : 'folderOpen', 15, 'tree-icon'),
        h('span', {class: 'tree-name'}, folder.name)), folder.path, onMove));
      if (!closed) walk(folder, depth + 1);
    }
    for (const f of node.files.sort((a, b) => a.name.localeCompare(b.name)))
      out.push(fileRow(f, {depth, active: f.id === activeId, main: f.id === mainId, dirty: isDirty(f.id), onOpen, onRename, onDelete, onMove}));
  };
  walk(treeOf(files), 0);
  container.replaceChildren(...out);
  if (!container.dataset.drop) { container.dataset.drop = '1'; dropTarget(container, '', (id, folder) => container.onMoveRoot?.(id, folder)); }
  container.onMoveRoot = onMove;
}
