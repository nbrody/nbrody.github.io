// The Editor guide: alphaMarkdown's syntax and controls, in a dialog.
// `macros` says where shared macros live (a project, or the standalone folder).
const ROWS = [
  ['Headings', '# A new idea\n## A useful lemma'],
  ['Emphasis', '**bold**, *italic*, `code`'],
  ['Inline equations', '$x^2 + y^2$ or \\(x^2 + y^2\\)'],
  ['Display equations', '$$\\sum_{k=1}^n k = \\frac{n(n+1)}2$$\n\\[ A = \\mat{1}{2}{3}{4} \\]'],
  ['Definition', '[[def:group]] (Group)\nA set $G$ with an associative operation…'],
  ['Theorem', '[[thm:main]] (Main result)\nEvery finite subgroup satisfies…'],
  ['Conjecture', '[[conj:bound]] (A sharp bound)\nWe expect $f(n) \\leq n^2$.'],
  ['Lists in a statement', '[[conj:cases]] Every subgroup $G$ is either\n- virtually abelian, or\n- virtually free.\n\nThe block runs to the next blank line.'],
  ['Proof and related blocks', '[[prf:]]\nApply [[main]] to the example.\n\nAlso: lem, prop, cor, rem, ex, claim, q, ax.'],
  ['Links', '[[Another note]] · [[main|the main theorem]]\n[Reference](https://example.org)'],
  ['Lists and tasks', '- An observation\n1. First step\n- [ ] Check the boundary case'],
  ['Code', '```python\nfrom flint import fmpz\nprint(fmpz(100).factor())\n```'],
  ['Tables', '| Object | Dimension |\n| --- | --- |\n| $V$ | $n$ |'],
];

const el = (tag, props = {}, ...children) => {
  const e = Object.assign(document.createElement(tag), props);
  e.append(...children.filter(c => c != null));
  return e;
};

export function openGuide({ macros, icon }) {
  const close = el('button', { type: 'button', className: 'icon-btn', title: 'Close', ariaLabel: 'Close' }, icon('x', 16));
  const dialog = el('dialog', { className: 'guide' },
    el('header', {}, el('div', {}, el('h2', {}, 'alphaMarkdown guide'), el('p', { className: 'muted' }, 'Your source stays ordinary Markdown. All three modes use the same math macros.')), close),
    el('div', { className: 'guide-body' },
      el('p', {}, 'Live editing is one editor that shows the note as it reads. Markdown appears only for the element the cursor is in: a formula, a link, bold text, a theorem label. A heading shows its # only when the cursor is on its line. Move the cursor away, or click outside the note, and it draws again. Source shows all of the Markdown; Reading never changes.'),
      el('p', {}, 'Click a link to follow it. To edit a link, put the cursor beside it and use the arrow keys. Click a checkbox to tick a task. Enter continues a list.'),
      el('p', {}, 'Use the arrow beside a heading to collapse or expand its section. Subsections fold independently. Fold choices are remembered for each note on this device, in Live editing and Reading alike; your Markdown stays unchanged.'),
      el('p', {}, `Environment blocks begin with [[kind:label]] and end at a blank line. Labels let you link to a theorem or definition within the note. ${macros}`),
      el('dl', {}, ...ROWS.map(([label, example]) => el('div', {}, el('dt', {}, label), el('dd', {}, el('pre', {}, example))))),
      el('p', {}, '⌘/Ctrl F Find · ⌘/Ctrl Z Undo · ⌘/Ctrl Shift Z Redo · Tab indents. Changes save automatically.')));
  close.onclick = () => dialog.close();
  dialog.addEventListener('close', () => dialog.remove());
  dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });
  document.body.append(dialog);
  dialog.showModal();
}
