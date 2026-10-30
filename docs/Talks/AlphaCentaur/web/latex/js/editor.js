// CodeMirror 6 for LaTeX: highlighting, search, completion (commands,
// environments, labels, citations, files, packages), live code checks and
// compile errors in the gutter, equation previews, reference hover cards,
// ⌘-click navigation and the formatting commands behind the toolbar.
import {
  EditorState, EditorView, StateEffect, StateField, Decoration, Prec, Compartment, keymap, lineNumbers, highlightActiveLine,
  highlightActiveLineGutter, drawSelection, dropCursor, rectangularSelection, crosshairCursor, history, defaultKeymap,
  historyKeymap, indentWithTab, searchKeymap, highlightSelectionMatches, StreamLanguage, stex, HighlightStyle,
  syntaxHighlighting, tags, bracketMatching, autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap,
  snippetCompletion, snippet, startCompletion, indentUnit, Transaction, showTooltip, hoverTooltip, linter, lintGutter, forceLinting,
} from '../vendor/codemirror.js';
import katex from '../vendor/katex/katex.mjs';
import {mathAt, referenceAt, codeCheck} from './latex.js';

export {emptyIndex, scanSource, scanBib} from './latex.js';
const latex = StreamLanguage.define(stex);
const style = HighlightStyle.define([
  {tag: tags.tagName, color: 'var(--syn-command)'},
  {tag: tags.keyword, color: 'var(--syn-math)', fontWeight: '600'},
  {tag: tags.special(tags.variableName), color: 'var(--syn-math)'},
  {tag: tags.atom, color: 'var(--syn-env)'},
  {tag: tags.number, color: 'var(--syn-number)'},
  {tag: tags.bracket, color: 'var(--syn-bracket)'},
  {tag: tags.comment, color: 'var(--syn-comment)', fontStyle: 'italic'},
  {tag: tags.standard(tags.variableName), color: 'var(--syn-env)'},
]);
const theme = EditorView.theme({
  '&': {height: '100%', fontSize: 'var(--editor-size, 14px)', backgroundColor: 'var(--editor-bg)', color: 'var(--text)'},
  '.cm-scroller': {fontFamily: 'var(--editor-font, var(--mono))', lineHeight: 'var(--editor-line, 1.6)', overflow: 'auto'},
  '.cm-content': {padding: '14px 0 40vh', caretColor: 'var(--primary)'},
  '.cm-line': {padding: '0 18px 0 10px'},
  '.cm-gutters': {backgroundColor: 'var(--editor-bg)', border: 'none', color: 'var(--gutter)'},
  '.cm-lineNumbers .cm-gutterElement': {padding: '0 6px 0 10px', minWidth: '30px'},
  '.cm-activeLine': {backgroundColor: 'var(--active-line)'},
  '.cm-activeLineGutter': {backgroundColor: 'var(--active-line)', color: 'var(--text-2)'},
  '&.cm-focused': {outline: 'none'},
  '.cm-cursor': {borderLeftColor: 'var(--primary)', borderLeftWidth: '2px'},
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': {backgroundColor: 'var(--selection) !important'},
  '.cm-selectionMatch': {backgroundColor: 'var(--selection-match)'},
  '.cm-matchingBracket': {backgroundColor: 'var(--selection-match)', outline: '1px solid var(--line-strong)'},
  '.cm-flash': {animation: 'cm-flash 1.6s ease-out'},
  '.cm-panels': {backgroundColor: 'var(--panel-2)', color: 'var(--text)', borderColor: 'var(--line)'},
  '.cm-panels input, .cm-panels button': {fontSize: '12.5px'},
  '.cm-tooltip': {backgroundColor: 'var(--panel)', border: '1px solid var(--line-strong)', borderRadius: '8px', boxShadow: 'var(--shadow)', overflow: 'hidden', color: 'var(--text)'},
  '.cm-tooltip-autocomplete > ul': {fontFamily: 'var(--mono)', fontSize: '13px', maxHeight: '18em', minWidth: '260px'},
  '.cm-tooltip-autocomplete > ul > li': {padding: '3px 10px !important'},
  '.cm-tooltip-autocomplete > ul > li[aria-selected]': {backgroundColor: 'var(--primary-soft)', color: 'var(--text)'},
  '.cm-completionDetail': {color: 'var(--muted)', fontStyle: 'normal', marginLeft: '1em', fontFamily: 'var(--font)', fontSize: '12px'},
  '.cm-completionMatchedText': {textDecoration: 'none', color: 'var(--primary)', fontWeight: '600'},
  '.cm-diagnostic': {padding: '6px 10px', fontSize: '12.5px', fontFamily: 'var(--font)', maxWidth: '460px'},
  '.cm-diagnostic-error': {borderLeftColor: 'var(--danger)'},
  '.cm-diagnostic-warning': {borderLeftColor: 'var(--warn)'},
  '.cm-lintRange-error': {backgroundImage: 'none', textDecoration: 'underline wavy var(--danger)', textUnderlineOffset: '3px'},
  '.cm-lintRange-warning': {backgroundImage: 'none', textDecoration: 'underline wavy var(--warn)', textUnderlineOffset: '3px'},
  '.cm-lintRange-info': {backgroundImage: 'none'},
  '.cm-gutter-lint': {width: '1.1em'},
  '.cm-tooltip.math-preview-tip': {padding: '8px 12px', maxWidth: 'min(640px, 90vw)', overflowX: 'auto'},
});

// ----------------------------------------------------------- settings --
// One settings object is shared by every file; toggles that change which
// extensions are present are reconfigured through compartments.
export const DEFAULT_SETTINGS = {fontSize: 14, lineHeight: 'normal', wrap: true, complete: true, brackets: true, check: true,
  preview: true, spell: true, theme: 'system', pdfDark: false, autoCompile: false, engine: 'auto', draft: false, haltOnError: false};
const parts = {wrap: new Compartment(), complete: new Compartment(), brackets: new Compartment(), spell: new Compartment()};
function settingValues(settings, kind, getIndex) {
  const tex = kind === 'tex' || kind === 'bib';
  return {
    wrap: settings.wrap ? EditorView.lineWrapping : [],
    complete: tex && settings.complete ? autocompletion({override: [completions(() => ({...getIndex(), kind}))], icons: false, activateOnTyping: true, maxRenderedOptions: 80}) : [],
    brackets: tex && settings.brackets ? [closeBrackets(), EditorState.languageData.of(() => [{closeBrackets: {brackets: ['(', '[', '{']}}])] : [],
    spell: EditorView.contentAttributes.of({spellcheck: settings.spell && kind !== 'bib' ? 'true' : 'false', autocorrect: 'off', autocapitalize: 'off'}),
  };
}
const configured = (settings, kind, getIndex) => Object.entries(settingValues(settings, kind, getIndex)).map(([name, value]) => parts[name].of(value));
// Spec that applies changed settings to a state or view made by makeState.
export const settingsEffects = (settings, kind, getIndex) =>
  ({effects: Object.entries(settingValues(settings, kind, getIndex)).map(([name, value]) => parts[name].reconfigure(value))});

// ------------------------------------------------------- line flash ----
const flashEffect = StateEffect.define();
const flashField = StateField.define({
  create: () => Decoration.none,
  update(deco, tr) {
    deco = deco.map(tr.changes);
    for (const e of tr.effects) if (e.is(flashEffect)) deco = e.value === null ? Decoration.none : Decoration.set([Decoration.line({class: 'cm-flash'}).range(e.value)]);
    return deco;
  },
  provide: f => EditorView.decorations.from(f),
});
export function jumpTo(view, line, {focus = true, select} = {}) {
  const doc = view.state.doc, target = doc.line(Math.max(1, Math.min(doc.lines, Math.trunc(line) || 1)));
  const selection = select ? {anchor: Math.min(target.from + select.from, target.to), head: Math.min(target.from + select.to, target.to)} : {anchor: target.from};
  view.dispatch({selection, effects: [EditorView.scrollIntoView(selection.anchor, {y: 'center'}), flashEffect.of(null)]});
  requestAnimationFrame(() => view.dispatch({effects: flashEffect.of(target.from)}));
  if (focus) view.focus();
}

// ------------------------------------------------------- completion ----
const COMMANDS = [
  ['section', 1], ['subsection', 1], ['subsubsection', 1], ['paragraph', 1], ['chapter', 1], ['part', 1], ['section*', 1], ['subsection*', 1],
  ['label', 1], ['ref', 1], ['eqref', 1], ['pageref', 1], ['cref', 1], ['Cref', 1], ['autoref', 1], ['cite', 1], ['citep', 1], ['citet', 1],
  ['emph', 1], ['textbf', 1], ['textit', 1], ['texttt', 1], ['textsc', 1], ['textrm', 1], ['underline', 1], ['footnote', 1], ['text', 1],
  ['frac', 2], ['dfrac', 2], ['tfrac', 2], ['binom', 2], ['sqrt', 1], ['mathbb', 1], ['mathcal', 1], ['mathfrak', 1], ['mathrm', 1],
  ['mathbf', 1], ['mathsf', 1], ['mathscr', 1], ['mathit', 1], ['operatorname', 1], ['overline', 1], ['underbrace', 1], ['overbrace', 1],
  ['widetilde', 1], ['widehat', 1], ['hat', 1], ['bar', 1], ['tilde', 1], ['vec', 1], ['dot', 1], ['ddot', 1], ['boldsymbol', 1],
  ['url', 1], ['href', 2], ['includegraphics', 1], ['caption', 1], ['usepackage', 1], ['documentclass', 1], ['input', 1], ['include', 1],
  ['newcommand', 2], ['renewcommand', 2], ['DeclareMathOperator', 2], ['newtheorem', 2], ['title', 1], ['author', 1], ['date', 1],
  ['vspace', 1], ['hspace', 1], ['bibliographystyle', 1], ['bibliography', 1], ['addbibresource', 1], ['begin', 1], ['end', 1],
  ['textcolor', 2], ['colorbox', 2], ['mbox', 1], ['hyperref', 1], ['tag', 1], ['intertext', 1], ['substack', 1], ['stackrel', 2], ['overset', 2], ['underset', 2],
  ...'item maketitle tableofcontents listoffigures listoftables today newpage clearpage noindent centering hfill vfill medskip bigskip smallskip printbibliography appendix qedhere nonumber notag linewidth textwidth'.split(' ').map(n => [n, 0]),
  ...('alpha beta gamma delta epsilon varepsilon zeta eta theta vartheta iota kappa lambda mu nu xi pi varpi rho varrho sigma tau upsilon ' +
    'phi varphi chi psi omega Gamma Delta Theta Lambda Xi Pi Sigma Upsilon Phi Psi Omega infty partial nabla sum prod coprod int iint oint ' +
    'lim limsup liminf sup inf max min log ln exp sin cos tan det dim ker hom deg gcd to mapsto rightarrow leftarrow Rightarrow Leftarrow ' +
    'leftrightarrow Leftrightarrow longrightarrow hookrightarrow twoheadrightarrow iff implies leq geq neq ll gg approx equiv sim simeq cong ' +
    'propto subset subseteq subsetneq supset supseteq in notin ni cup cap bigcup bigcap setminus emptyset varnothing forall exists nexists ' +
    'neg wedge vee times cdot cdots ldots dots vdots ddots otimes oplus bigotimes bigoplus circ langle rangle lfloor rfloor lceil rceil ' +
    'left right big Big bigg quad qquad mid nmid parallel perp ell hbar Re Im aleph prime star ast dagger').split(' ').map(n => [n, 0]),
];
const ENVIRONMENTS = ('equation equation* align align* gather gather* multline multline* split cases aligned pmatrix bmatrix vmatrix matrix ' +
  'array itemize enumerate description figure figure* table table* tabular center flushleft flushright theorem lemma proposition corollary ' +
  'definition remark example proof abstract quote quotation verbatim minipage tikzpicture thebibliography frame columns column subfigure').split(' ');
const PACKAGES = ('amsmath amssymb amsthm mathtools graphicx hyperref cleveref xcolor tikz pgfplots geometry fancyhdr booktabs ' +
  'tabularx longtable multirow array caption subcaption float wrapfig enumitem listings minted algorithm2e algorithmicx algpseudocode ' +
  'biblatex natbib csquotes babel inputenc fontenc lmodern microtype setspace parskip titlesec tocloft appendix url siunitx physics ' +
  'bm mathrsfs dsfont stmaryrd tikz-cd thmtools mdframed tcolorbox xparse etoolbox ifthen calc lipsum blindtext todonotes comment ' +
  'verbatim fontspec unicode-math polyglossia hyphenat ragged2e multicol float placeins afterpage pdfpages standalone subfiles import').split(' ');
const CLASSES = 'article report book amsart amsbook amsproc beamer memoir letter scrartcl scrreprt scrbook revtex4-2 standalone elsarticle llncs IEEEtran acmart'.split(' ');
const BIB_TYPES = {
  article: 'author = {${}},\n  title = {${}},\n  journal = {${}},\n  year = {${}},\n  volume = {${}},\n  pages = {${}},',
  book: 'author = {${}},\n  title = {${}},\n  publisher = {${}},\n  year = {${}},',
  inproceedings: 'author = {${}},\n  title = {${}},\n  booktitle = {${}},\n  year = {${}},\n  pages = {${}},',
  incollection: 'author = {${}},\n  title = {${}},\n  booktitle = {${}},\n  editor = {${}},\n  publisher = {${}},\n  year = {${}},',
  misc: 'author = {${}},\n  title = {${}},\n  howpublished = {${}},\n  year = {${}},',
  phdthesis: 'author = {${}},\n  title = {${}},\n  school = {${}},\n  year = {${}},',
  techreport: 'author = {${}},\n  title = {${}},\n  institution = {${}},\n  year = {${}},',
  unpublished: 'author = {${}},\n  title = {${}},\n  note = {${}},\n  year = {${}},',
  online: 'author = {${}},\n  title = {${}},\n  url = {${}},\n  urldate = {${}},',
};

function completions(getIndex) {
  const segment = (m, open) => {
    const inner = m.text.slice(open + 1), comma = inner.lastIndexOf(',');
    return m.from + open + 1 + comma + 1 + (inner.slice(comma + 1).length - inner.slice(comma + 1).trimStart().length);
  };
  return context => {
    const idx = getIndex();
    let m;
    // BibTeX entry types in .bib files.
    if (idx.kind === 'bib' && (m = context.matchBefore(/^\s*@[a-zA-Z]*/))) {
      const from = m.from + m.text.indexOf('@');
      return {from, options: Object.entries(BIB_TYPES).map(([type, body]) =>
        snippetCompletion(`@${type}{\${key},\n  ${body}\n}`, {label: `@${type}`, type: 'class'}))};
    }
    if ((m = context.matchBefore(/\\([a-zA-Z]*ref|labelcref)\*?\{[^{}]*/)) && !m.text.startsWith('\\href')) {
      const options = [...idx.labels].map(([label, l]) => ({label, detail: `${l.file}:${l.line}`, info: l.text, type: 'variable'}));
      return {from: segment(m, m.text.indexOf('{')), options, validFor: /^[^,}\s]*$/};
    }
    if ((m = context.matchBefore(/\\(?:[a-zA-Z]*cite[a-zA-Z]*)\*?(?:\[[^\]]*\]){0,2}\{[^{}]*/))) {
      // Search keys, authors and titles, like Overleaf's reference search.
      const from = segment(m, m.text.lastIndexOf('{')), query = context.state.sliceDoc(from, context.pos).toLowerCase();
      const words = query.split(/\s+/).filter(Boolean);
      const options = [...idx.cites].map(([key, c]) => ({key, c, hay: `${key} ${c.author} ${c.title} ${c.year || ''}`.toLowerCase()}))
        .filter(x => words.every(w => x.hay.includes(w)))
        .sort((a, b) => Number(!a.key.toLowerCase().startsWith(query)) - Number(!b.key.toLowerCase().startsWith(query)) || a.key.localeCompare(b.key))
        .slice(0, 200)
        .map(({key, c}) => ({label: key, detail: [c.author, c.year].filter(Boolean).join(' '), info: c.title || c.file, type: 'text'}));
      return {from, options, filter: false};
    }
    if ((m = context.matchBefore(/\\(begin|end)\{[a-zA-Z*]*/))) {
      const begin = m.text.startsWith('\\begin'), from = m.from + m.text.indexOf('{') + 1;
      const names = [...new Set([...ENVIRONMENTS, ...idx.environments])];
      return {from, validFor: /^[a-zA-Z*]*$/, options: names.map(env => ({label: env, type: 'type', apply: begin ? (view, _c, from, to) => {
        const line = view.state.doc.lineAt(from), indent = /^\s*/.exec(line.text)[0];
        const end = view.state.sliceDoc(to, to + 1) === '}' ? to + 1 : to;
        const insert = `${env}}\n${indent}  \n${indent}\\end{${env}}`;
        view.dispatch({changes: {from, to: end, insert}, selection: {anchor: from + env.length + 2 + indent.length + 2}, userEvent: 'input.complete'});
      } : undefined}))};
    }
    if ((m = context.matchBefore(/\\(?:usepackage|RequirePackage)(?:\[[^\]]*\])?\{[^{}]*/))) {
      const used = idx.packages;
      return {from: segment(m, m.text.lastIndexOf('{')), validFor: /^[\w-]*$/,
        options: PACKAGES.map(p => ({label: p, type: 'namespace', detail: used.has(p) ? 'used' : undefined, boost: used.has(p) ? -1 : 0}))};
    }
    if ((m = context.matchBefore(/\\documentclass(?:\[[^\]]*\])?\{[^{}]*/)))
      return {from: m.from + m.text.lastIndexOf('{') + 1, validFor: /^[\w-]*$/, options: CLASSES.map(c => ({label: c, type: 'namespace'}))};
    if ((m = context.matchBefore(/\\(input|include|includeonly|subfile|includegraphics|bibliography|addbibresource)(?:\[[^\]]*\])?\{[^{}]*/))) {
      const cmd = /^\\(\w+)/.exec(m.text)[1], from = segment(m, m.text.lastIndexOf('{'));
      const want = cmd === 'includegraphics' ? /\.(png|jpe?g|pdf|eps|svg)$/i : /bib/.test(cmd) ? /\.bib$/i : /\.tex$/i;
      const strip = cmd === 'include' || cmd === 'bibliography' || cmd === 'subfile';
      const options = idx.files.filter(f => want.test(f)).map(f => ({label: strip ? f.replace(/\.(tex|bib)$/i, '') : f, type: 'namespace'}));
      return {from, options, validFor: /^[^,}]*$/};
    }
    if ((m = context.matchBefore(/\\[a-zA-Z@]*\*?/)) && (m.text.length > 1 || context.explicit)) {
      const seen = new Set(), options = [];
      for (const [name, n] of [...[...idx.commands].map(([k, v]) => [k, v.args]), ...COMMANDS]) {
        if (seen.has(name)) continue;
        seen.add(name);
        const label = `\\${name}`, detail = idx.commands.has(name) ? 'your macro' : undefined;
        options.push(n > 0 ? snippetCompletion(`${label}${'{${}}'.repeat(n)}`, {label, detail, type: 'function'}) : {label, detail, type: 'keyword'});
      }
      return {from: m.from, options, validFor: /^\\[a-zA-Z@]*\*?$/};
    }
    return null;
  };
}

// ---------------------------------------------------- math preview ----
function renderMath(dom, tex, display, macros) {
  let source = tex.replace(/\\label\s*\{[^{}]*\}/g, '').replace(/\\(nonumber|notag)\b/g, '')
    .replace(/\\begin\{multline(\*?)\}/g, '\\begin{gather$1}').replace(/\\end\{multline(\*?)\}/g, '\\end{gather$1}')
    .replace(/\\begin\{eqnarray(\*?)\}/g, '\\begin{align$1}').replace(/\\end\{eqnarray(\*?)\}/g, '\\end{align$1}').replace(/&\s*=\s*&/g, '&=');
  katex.render(source, dom, {displayMode: display, throwOnError: false, errorColor: '#c24940', macros: {...macros}, strict: 'ignore', trust: false, output: 'html'});
}
function mathPreview(getIndex, settings) {
  const compute = state => {
    if (!settings.preview) return null;
    const sel = state.selection.main;
    if (!sel.empty) return null;
    const lo = Math.max(0, sel.head - 4000), text = state.sliceDoc(lo, Math.min(state.doc.length, sel.head + 4000));
    const m = mathAt(text, sel.head - lo);
    if (!m || !m.tex.replace(/\\(begin|end)\{[^}]*\}/g, '').trim()) return null;
    return {pos: lo + m.from, above: true, strictSide: false, arrow: true, key: m.tex,
      create() {
        const dom = document.createElement('div');
        dom.className = 'math-preview';
        try { renderMath(dom, m.tex, m.display, getIndex().macros); } catch { dom.textContent = m.tex; }
        return {dom};
      }};
  };
  return StateField.define({
    create: compute,
    update(value, tr) {
      if (!tr.docChanged && !tr.selection && !tr.effects.some(e => e.is(refreshPreview))) return value;
      const next = compute(tr.state);
      // Keep the same tooltip (no flicker) while the cursor moves within unchanged math.
      return next && value && next.key === value.key && next.pos === value.pos ? value : next;
    },
    provide: f => showTooltip.from(f),
  });
}
export const refreshPreview = StateEffect.define();

// ---------------------------------------------- hover and ⌘-click ----
function hoverCards(getIndex) {
  return hoverTooltip((view, pos) => {
    const line = view.state.doc.lineAt(pos), ref = referenceAt(line.text, pos - line.from);
    if (!ref || ref.type === 'package' || !ref.name) return null;
    const idx = getIndex(), mod = /Mac/.test(navigator.platform) ? '⌘' : 'Ctrl';
    let title, body, missing = false;
    if (ref.type === 'ref') {
      const l = idx.labels.get(ref.name);
      if (l) { title = `${l.file}:${l.line}`; body = l.text; } else { title = `No \\label{${ref.name}} in this project`; missing = true; }
    } else if (ref.type === 'cite') {
      const c = idx.cites.get(ref.name);
      if (c) { title = [c.author, c.year].filter(Boolean).join(', ') || ref.name; body = c.title || `${c.file}:${c.line}`; }
      else { title = `No entry ${ref.name} in the bibliography`; missing = true; }
    } else if (ref.type === 'label') {
      const uses = idx.labelUses?.get(ref.name) || 0;
      title = `\\label{${ref.name}}`; body = uses ? `Referenced ${uses} time${uses > 1 ? 's' : ''}` : 'Not referenced yet';
    } else { title = ref.name; body = `${mod}-click to open`; }
    return {pos: line.from + ref.from, end: line.from + ref.to, above: true, create() {
      const dom = document.createElement('div');
      dom.className = `ref-card ${missing ? 'missing' : ''}`;
      const t = dom.appendChild(document.createElement('strong')); t.textContent = title;
      if (body) { const b = dom.appendChild(document.createElement('div')); b.textContent = body; }
      if (!missing && ref.type !== 'file' && ref.type !== 'label') { const h = dom.appendChild(document.createElement('small')); h.textContent = `${mod}-click to go there`; }
      return {dom};
    }};
  }, {hoverTime: 350});
}
// Images pasted or dropped into the source (handled by the app, which can
// save the file and insert a figure).
function imageInput(onImage) {
  const images = list => [...(list || [])].filter(f => /^image\/(png|jpe?g|gif|svg\+xml|webp)$/.test(f.type));
  return EditorView.domEventHandlers({
    paste(e, view) { const files = images(e.clipboardData?.files); if (!files.length || !onImage || view.state.readOnly) return false; e.preventDefault(); onImage(files, view); return true; },
    drop(e, view) {
      const files = images(e.dataTransfer?.files);
      if (!files.length || !onImage || view.state.readOnly) return false;
      e.preventDefault();
      const pos = view.posAtCoords({x: e.clientX, y: e.clientY});
      if (pos !== null) view.dispatch({selection: {anchor: pos}});
      onImage(files, view);
      return true;
    },
  });
}
function clickToDefinition(onNavigate) {
  return EditorView.domEventHandlers({
    mousedown(e, view) {
      if (!(e.metaKey || e.ctrlKey) || e.button !== 0 || !onNavigate) return false;
      const pos = view.posAtCoords({x: e.clientX, y: e.clientY});
      if (pos === null) return false;
      const line = view.state.doc.lineAt(pos), ref = referenceAt(line.text, pos - line.from);
      if (!ref || !ref.name) return false;
      e.preventDefault();
      onNavigate(ref);
      return true;
    },
  });
}

// ------------------------------------------------- environment sync ----
// Renaming \begin{x} renames its matching \end{x} (and the other way round),
// as Overleaf does, but only for pairs that matched before the edit.
const nameAround = (state, pos) => {
  const line = state.doc.lineAt(pos), before = line.text.slice(0, pos - line.from), after = line.text.slice(pos - line.from);
  const m = /\\(begin|end)\s*\{([a-zA-Z*@]*)$/.exec(before), n = /^([a-zA-Z*@]*)\}/.exec(after);
  return m && n ? {kind: m[1], name: m[2] + n[1], from: pos - m[2].length, to: pos + n[1].length} : null;
};
function partner(state, at) {
  const text = state.doc.toString(), re = /\\(begin|end)\s*\{([^{}]*)\}/g, tokens = [];
  for (const m of text.matchAll(re)) tokens.push({kind: m[1], name: m[2], from: m.index + m[0].length - m[2].length - 1, to: m.index + m[0].length - 1});
  const i = tokens.findIndex(t => t.from <= at.from && t.to >= at.to);
  if (i < 0) return null;
  let depth = 0;
  if (at.kind === 'begin') {
    for (let j = i + 1; j < tokens.length; j++) { if (tokens[j].kind === 'begin') depth++; else if (depth-- === 0) return tokens[j]; }
  } else {
    for (let j = i - 1; j >= 0; j--) { if (tokens[j].kind === 'end') depth++; else if (depth-- === 0) return tokens[j]; }
  }
  return null;
}
const environmentSync = EditorState.transactionFilter.of(tr => {
  if (!tr.docChanged || !(tr.isUserEvent('input') || tr.isUserEvent('delete')) || tr.state.doc.length > 400_000) return tr;
  const now = nameAround(tr.state, tr.state.selection.main.head), was = nameAround(tr.startState, tr.startState.selection.main.head);
  if (!now || !was || now.kind !== was.kind || now.name === was.name) return tr;
  const other = partner(tr.state, now);
  if (!other || other.name !== was.name) return tr;
  return [tr, {changes: {from: other.from, to: other.to, insert: now.name}, sequential: true}];
});

// ------------------------------------------------------------- lint ----
function diagnosticsSource({settings, kind, getProblems}) {
  return view => {
    const doc = view.state.doc, out = [];
    if (settings.check && kind === 'tex') for (const d of codeCheck(doc.toString())) out.push({...d, source: 'Code check'});
    for (const p of getProblems?.() || []) {
      if (!p.line || p.line > doc.lines) continue;
      const line = doc.line(p.line), lead = /^\s*/.exec(line.text)[0].length;
      out.push({from: Math.min(line.from + lead, line.to), to: line.to, severity: p.level === 'error' ? 'error' : p.level === 'warning' ? 'warning' : 'info',
        message: p.message + (p.detail && p.level === 'error' ? `\n${p.detail.split('\n').slice(0, 3).join('\n')}` : ''), source: 'Compiler'});
    }
    return out;
  };
}
export const relint = view => forceLinting(view);

// ------------------------------------------------------------ states ----
// Every file keeps its own EditorState, so undo history survives switching.
export function makeState(doc, {kind, readOnly = false, onUpdate, commands = [], getIndex = () => ({}), settings = DEFAULT_SETTINGS, onNavigate, getProblems, onImage}) {
  const extensions = [
    lineNumbers(), highlightActiveLineGutter(), highlightActiveLine(), history(), drawSelection(), dropCursor(),
    rectangularSelection(), crosshairCursor(), bracketMatching(), highlightSelectionMatches(), flashField,
    indentUnit.of('  '), syntaxHighlighting(style), theme,
    EditorState.readOnly.of(readOnly), EditorView.editable.of(!readOnly),
    Prec.highest(keymap.of(commands)),
    keymap.of([...closeBracketsKeymap, ...completionKeymap, ...searchKeymap, ...historyKeymap, indentWithTab, ...defaultKeymap]),
    EditorView.updateListener.of(u => onUpdate?.(u)),
    configured(settings, kind, getIndex),
  ];
  if (kind === 'tex' || kind === 'bib') extensions.push(latex);
  if (kind === 'tex') extensions.push(mathPreview(getIndex, settings), hoverCards(getIndex), clickToDefinition(onNavigate), environmentSync, imageInput(onImage));
  if (kind === 'tex' || kind === 'bib') extensions.push(lintGutter(), linter(diagnosticsSource({settings, kind, getProblems}), {delay: 500}));
  return EditorState.create({doc, extensions});
}

// A transaction spec that turns the document into `text` with one minimal
// change, kept out of undo history, so the cursor and the undo history of
// untouched text survive edits made elsewhere.
export function outsideEdit(state, text) {
  const old = state.doc.toString();
  if (old === text) return null;
  let start = 0, endOld = old.length, endNew = text.length;
  while (start < endOld && start < endNew && old.charCodeAt(start) === text.charCodeAt(start)) start++;
  while (endOld > start && endNew > start && old.charCodeAt(endOld - 1) === text.charCodeAt(endNew - 1)) { endOld--; endNew--; }
  return {changes: {from: start, to: endOld, insert: text.slice(start, endNew)}, annotations: Transaction.addToHistory.of(false)};
}

// ------------------------------------------------------- formatting ----
// Wraps each selection in before…after, or unwraps it if already wrapped.
export function toggleWrap(view, before, after) {
  const {state} = view;
  const tr = state.changeByRange(range => {
    const outer = {from: range.from - before.length, to: range.to + after.length};
    if (outer.from >= 0 && state.sliceDoc(outer.from, range.from) === before && state.sliceDoc(range.to, outer.to) === after)
      return {changes: [{from: outer.from, to: range.from}, {from: range.to, to: outer.to}],
        range: {anchor: outer.from, head: outer.from + range.to - range.from}};
    return {changes: [{from: range.from, insert: before}, {from: range.to, insert: after}],
      range: range.empty ? {anchor: range.from + before.length} : {anchor: range.from + before.length, head: range.to + before.length}};
  });
  view.dispatch(state.update(tr, {scrollIntoView: true, userEvent: 'input'}));
  view.focus();
}
// Turns the current line into a heading (\section{…}) or back into text.
export function setHeading(view, command) {
  const {state} = view, line = state.doc.lineAt(state.selection.main.head);
  const m = /^(\s*)\\(part|chapter|section|subsection|subsubsection|paragraph|subparagraph)(\*?)\s*\{(.*)\}(.*)$/.exec(line.text);
  const text = m ? m[4] : line.text.trim();
  const indent = m ? m[1] : /^\s*/.exec(line.text)[0];
  const insert = command ? `${indent}\\${command}{${text}}${m ? m[5] : ''}` : `${indent}${text}${m ? m[5] : ''}`;
  const cursor = line.from + indent.length + (command ? command.length + 2 : 0) + text.length;
  view.dispatch({changes: {from: line.from, to: line.to, insert}, selection: {anchor: cursor}, userEvent: 'input'});
  view.focus();
}
export function headingAt(state) {
  const line = state.doc.lineAt(state.selection.main.head);
  return /^\s*\\(part|chapter|section|subsection|subsubsection|paragraph|subparagraph)\*?\s*\{/.exec(line.text)?.[1] || '';
}
// Puts the selected lines into a list environment (\item per line).
export function insertList(view, env) {
  const {state} = view, sel = state.selection.main;
  const first = state.doc.lineAt(sel.from), last = state.doc.lineAt(sel.to);
  const indent = /^\s*/.exec(first.text)[0];
  const lines = state.sliceDoc(first.from, last.to).split('\n');
  const items = sel.empty && !first.text.trim() ? [`${indent}  \\item `] : lines.map(l => `${indent}  \\item ${l.trim()}`);
  const insert = `${indent}\\begin{${env}}\n${items.join('\n')}\n${indent}\\end{${env}}`;
  const cursor = first.from + `${indent}\\begin{${env}}\n`.length + items[0].length;
  view.dispatch({changes: {from: first.from, to: last.to, insert}, selection: {anchor: sel.empty ? cursor : first.from + insert.length - `\n${indent}\\end{${env}}`.length}, userEvent: 'input'});
  view.focus();
}
// Inserts a snippet with ${} fields (Tab moves between them).
export function insertSnippet(view, template) {
  const {from, to} = view.state.selection.main;
  snippet(template)(view, null, from, to);
  view.focus();
}
export function insertCompleting(view, text) {
  const {from, to} = view.state.selection.main;
  view.dispatch({changes: {from, to, insert: text}, selection: {anchor: from + text.length - (text.endsWith('}') ? 1 : 0)}, userEvent: 'input'});
  view.focus();
  startCompletion(view);
}
export const SNIPPETS = {
  figure: '\\begin{figure}[h]\n  \\centering\n  \\includegraphics[width=0.6\\linewidth]{${file}}\n  \\caption{${Caption}}\n  \\label{fig:${label}}\n\\end{figure}\n',
  table: '\\begin{table}[h]\n  \\centering\n  \\begin{tabular}{${ccc}}\n    \\hline\n    ${} &  &  \\\\\n    \\hline\n     &  &  \\\\\n    \\hline\n  \\end{tabular}\n  \\caption{${Caption}}\n  \\label{tab:${label}}\n\\end{table}\n',
  display: '\\[\n  ${}\n\\]',
  equation: '\\begin{equation}\n  ${}\n  \\label{eq:${label}}\n\\end{equation}',
  link: '\\href{${url}}{${text}}',
};
export {EditorView, EditorState, startCompletion, snippet};
