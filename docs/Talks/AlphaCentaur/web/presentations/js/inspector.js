// The right-hand panel. "Format" is contextual (the selection, or the slide
// when nothing is selected); "Design" holds the deck theme and settings.

import { app, currentSlide, selectedEls } from './state.js';
import { PALETTES, FONT_PAIRS, FONTS, SYSTEM_FONTS, COLOR_TOKENS, COLOR_LABELS, fontStack } from './themes.js';
import { TEXT_STYLES, TYPE_LABELS, SHAPES, applyTextStyle } from './model.js';
import { SHADOW_NAMES, ANIMS, buildSteps, embedURL } from './render.js';
import { APPLETS } from './applets.js';
import { remoteDesignSection, remoteSlideSection } from './remote-inspector.js';
import {
  h, icon, button, field, numberInput, slider, segmented, select, toggle, colorControl, section, row, toHex6, popover,
} from './ui.js';

let host, body, tabs;
const geo = {};        // live geometry fields
export const ensureFontHook = { fn: () => {} };

export function initInspector(el) {
  host = el;
  tabs = h('div.insp-tabs', { role: 'tablist' });
  body = h('div.insp-body');
  host.append(tabs, body);
}

export function renderInspector() {
  if (!app.deck) return;
  const scrollTop = body.scrollTop, sameTab = body.dataset.tab === app.tab;
  tabs.textContent = '';
  for (const [id, label, ic] of [['format', 'Format', 'sliders'], ['design', 'Design', 'palette']]) {
    tabs.append(h('button.insp-tab' + (app.tab === id ? '.on' : ''), {
      type: 'button', role: 'tab', 'aria-selected': String(app.tab === id),
      onclick: () => { app.tab = id; renderInspector(); },
    }, icon(ic, 15), h('span', null, label)));
  }
  body.textContent = '';
  body.dataset.tab = app.tab;
  for (const k of Object.keys(geo)) delete geo[k];
  if (app.tab === 'design') body.append(...designPanel());
  else {
    const sel = selectedEls();
    if (sel.length === 1) body.append(...elementPanel(sel[0]));
    else if (sel.length > 1) body.append(...multiPanel(sel));
    else body.append(...slidePanel());
  }
  if (sameTab) body.scrollTop = scrollTop;
}

// Update the X/Y/W/H/rotation fields without rebuilding (during drags).
export function syncGeometry() {
  const sel = selectedEls();
  if (sel.length !== 1 || !geo.x) return;
  const el = sel[0];
  geo.x.set(el.x); geo.y.set(el.y); geo.w.set(el.w); geo.h.set(el.h); geo.rot?.set(el.rot);
}

// -------------------------------------------------------------- helpers --
const live = () => app.refresh(['canvas', 'geometry']);
const commit = key => { app.commit(key); app.refresh(['thumb']); };
// Apply to the selection: live while dragging a control, commit on release.
function setter(els, prop, { rerender = false, map } = {}) {
  const apply = v => { for (const el of els) el[prop] = map ? map(v, el) : v; };
  return {
    onInput: v => { apply(v); live(); },
    onCommit: v => { apply(v); live(); commit(prop + els.map(e => e.id).join()); if (rerender) renderInspector(); },
    onChange: v => { apply(v); live(); commit(); if (rerender) renderInspector(); },
  };
}
function numRow(label, els, prop, opts = {}) {
  const s = setter(els, prop);
  return field(label, numberInput(els[0][prop], { ...opts, onInput: s.onInput, onCommit: s.onCommit }));
}
function colorRow(label, els, prop, opts = {}) {
  const s = setter(els, prop, { rerender: opts.rerender });
  return field(label, colorControl(els[0][prop], app.deck.theme, s.onChange, { allowNone: opts.allowNone, onInput: s.onInput }), { cls: 'block' });
}
function fontOptions() {
  const t = app.deck.theme.fonts;
  return [
    { group: 'Theme', options: [['heading', `Heading — ${t.heading}`], ['body', `Body — ${t.body}`], ['mono', `Mono — ${t.mono}`]] },
    { group: 'Fonts', options: [...Object.keys(FONTS), ...Object.keys(SYSTEM_FONTS)].sort().map(f => [f, f]) },
  ];
}

function header(title, ic, actions = []) {
  return h('div.insp-head', null, h('div.insp-head-title', null, ic ? icon(ic, 16) : null, h('span', null, title)), h('div.insp-head-actions', null, actions));
}

// ------------------------------------------------------------- element --
const TYPE_ICON = { text: 'text', math: 'sigma', image: 'image', shape: 'shapes', embed: 'globe', applet: 'code' };

function elementPanel(el) {
  const out = [header(el.type === 'applet' ? el.name || 'Applet' : el.type === 'shape' ? SHAPES[el.shape] : TYPE_LABELS[el.type], TYPE_ICON[el.type], [
    button('Duplicate', 'copy', () => app.action('duplicate'), { cls: 'ghost sm', title: 'Duplicate (⌘D)' }),
    button('Delete', 'trash', () => app.action('delete'), { cls: 'ghost sm', title: 'Delete' }),
  ])];
  const els = [el];
  switch (el.type) {
    case 'text': out.push(...textSections(els)); break;
    case 'math': out.push(...mathSections(el)); break;
    case 'image': out.push(...imageSections(el)); break;
    case 'shape': out.push(...shapeSections(el)); break;
    case 'embed': out.push(...embedSections(el)); break;
    case 'applet': out.push(...appletSections(el)); break;
  }
  out.push(arrangeSection(el), effectsSection(els), buildSection(els));
  return out;
}

function textSections(els) {
  const el = els[0];
  const presets = h('div.chips');
  for (const [role, s] of Object.entries(TEXT_STYLES)) {
    presets.append(h('button.chip' + (el.role === role ? '.on' : ''), {
      type: 'button', onclick: () => app.mutate(() => els.forEach(e => applyTextStyle(e, role)), { parts: ['canvas', 'thumb', 'inspector'] }),
    }, s.label));
  }
  const font = select(fontOptions(), el.font, v => { ensureFontHook.fn(v); setter(els, 'font').onChange(v); }, { label: 'Font' });
  const weights = [[300, 'Light'], [400, 'Regular'], [500, 'Medium'], [600, 'Semibold'], [700, 'Bold'], [800, 'Black']];
  const typo = section('Text',
    presets,
    field('Font', font),
    row(numRow('Size', els, 'size', { min: 6, max: 400, step: 1, suffix: 'px' }),
      field('Weight', select(weights.map(([v, l]) => [String(v), l]), String(el.weight), v => setter(els, 'weight').onChange(+v)))),
    colorRow('Color', els, 'color'),
    row(field('Align', segmented([['left', 'Left', 'tAlignL'], ['center', 'Center', 'tAlignC'], ['right', 'Right', 'tAlignR'], ['justify', 'Justify', 'tAlignJ']], el.align, setter(els, 'align').onChange)),
      field('Style', h('div.seg', null,
        flagBtn('Italic', icon('italic', 16), el.italic, v => setter(els, 'italic').onChange(v)),
        flagBtn('All caps', 'AA', el.upper, v => setter(els, 'upper').onChange(v)))),
    ),
    field('Line spacing', slider(el.lh, { min: 0.8, max: 2.4, step: 0.05, format: v => v.toFixed(2), ...setter(els, 'lh') })),
    field('Letter spacing', slider(el.ls || 0, { min: -0.06, max: 0.3, step: 0.005, format: v => v.toFixed(3) + 'em', ...setter(els, 'ls') })),
  );
  const box = section('Box',
    field('Height', h('div.inline', null,
      toggle('Fit to text', el.autoH, v => { app.mutate(() => els.forEach(e => { e.autoH = v; }), { parts: ['canvas', 'thumb', 'inspector'] }); }),
      !el.autoH ? segmented([['top', 'Top', 'vTop'], ['middle', 'Middle', 'vMid'], ['bottom', 'Bottom', 'vBot']], el.valign, setter(els, 'valign').onChange) : null)),
    colorRow('Fill', els, 'fill', { allowNone: true }),
    row(numRow('Padding', els, 'pad', { min: 0, max: 200, suffix: 'px' }), numRow('Radius', els, 'radius', { min: 0, max: 400, suffix: 'px' })),
    row(field('Border', colorControlMini(els, 'stroke')), numRow('Width', els, 'strokeW', { min: 0, max: 40, suffix: 'px' })),
  );
  const tip = h('p.hint', null, 'Double-click to edit. Write math as ', h('code', null, '$x^2$'), ' or ', h('code', null, '$$…$$'), '; Esc to finish.');
  return [typo, box, tip];
}

function flagBtn(label, content, on, onChange) {
  const b = h('button.seg-btn' + (on ? '.on' : ''), { type: 'button', title: label, 'aria-label': label, 'aria-pressed': String(!!on) }, content);
  b.addEventListener('click', () => { on = !on; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); onChange(on); });
  return b;
}

// A compact color popover trigger for secondary colors.
function colorControlMini(els, prop) {
  const theme = app.deck.theme;
  const v = els[0][prop];
  const sw = h('span.mini-swatch' + (!v || v === 'none' ? '.none' : ''), { style: { background: v && v !== 'none' ? (COLOR_TOKENS.includes(v) ? theme.colors[v] : v) : '' } });
  const b = h('button.btn.mini-color', { type: 'button' }, sw, h('span', null, !v || v === 'none' ? 'None' : COLOR_TOKENS.includes(v) ? COLOR_LABELS[v] : v));
  b.addEventListener('click', () => {
    const s = setter(els, prop, { rerender: true });
    popover(b, h('div.pop-pad', null, colorControl(v, theme, val => {
      s.onChange(val);
      if (prop === 'stroke' && val !== 'none' && !els[0].strokeW) { els.forEach(e => { e.strokeW = 3; }); live(); commit(); renderInspector(); }
    }, { allowNone: true, onInput: s.onInput })));
  });
  return b;
}

function mathSections(el) {
  const ta = h('textarea.code.tex-src', { rows: 4, spellcheck: false, 'data-focus': 'tex' });
  ta.value = el.tex;
  ta.addEventListener('input', () => { el.tex = ta.value; live(); });
  ta.addEventListener('change', () => commit('tex:' + el.id));
  return [
    section('Equation',
      field('LaTeX', ta, { cls: 'block' }),
      h('p.hint', null, 'Rendered with KaTeX in display style. Deck macros (Design → Math) apply.'),
      row(numRow('Size', [el], 'size', { min: 8, max: 400, suffix: 'px' }),
        field('Align', segmented([['left', 'Left', 'tAlignL'], ['center', 'Center', 'tAlignC'], ['right', 'Right', 'tAlignR']], el.align, setter([el], 'align').onChange))),
      colorRow('Color', [el], 'color'),
    ),
    section('Box',
      colorRow('Fill', [el], 'fill', { allowNone: true }),
      row(numRow('Padding', [el], 'pad', { min: 0, max: 200, suffix: 'px' }), numRow('Radius', [el], 'radius', { min: 0, max: 400, suffix: 'px' })),
    ),
  ];
}

function imageSections(el) {
  const url = h('input.text-input', { type: 'url', placeholder: 'https://… (or choose a file)', value: el.asset ? '' : el.src || '', 'data-focus': 'src' });
  url.addEventListener('change', () => app.mutate(() => { el.src = url.value.trim(); el.asset = null; }, { parts: ['canvas', 'thumb'] }));
  const asset = el.asset && app.deck.assets[el.asset];
  return [section('Image',
    h('div.btn-row', null,
      button(el.asset || el.src ? 'Replace…' : 'Choose image…', 'upload', () => app.onReplaceImage?.(el), { showLabel: true }),
      button('Use as background', 'layout', () => app.action('imageToBackground'), { showLabel: true, disabled: !el.asset, cls: 'ghost' })),
    asset ? h('p.hint', null, asset.path ? `${asset.name || 'Picture'} · file ${asset.path}` : `${asset.name || 'Embedded image'} · ${fmtBytes(asset.data.length * 0.75)}`) : null,
    field('Or link', url),
    field('Fit', segmented([['contain', 'Contain'], ['cover', 'Fill (crop)'], ['fill', 'Stretch']], el.fit, setter([el], 'fit').onChange)),
    row(numRow('Radius', [el], 'radius', { min: 0, max: 600, suffix: 'px' }), field('Aspect', toggle('Lock', el.lockAspect, v => { el.lockAspect = v; commit(); }))),
    row(field('Border', colorControlMini([el], 'stroke')), numRow('Width', [el], 'strokeW', { min: 0, max: 40, suffix: 'px' })),
    field('Alt text', inputText(el, 'alt', 'Describe the image')),
  )];
}
const fmtBytes = n => n > 1e6 ? (n / 1e6).toFixed(1) + ' MB' : Math.round(n / 1e3) + ' KB';
function inputText(el, prop, placeholder) {
  const i = h('input.text-input', { type: 'text', placeholder, value: el[prop] || '' });
  i.addEventListener('input', () => { el[prop] = i.value; live(); });
  i.addEventListener('change', () => commit(prop + el.id));
  return i;
}

function shapeSections(el) {
  const linear = el.shape === 'line' || el.shape === 'arrow';
  return [section('Shape',
    field('Kind', select(Object.entries(SHAPES), el.shape, v => app.mutate(() => {
      const wasLinear = linear, nowLinear = v === 'line' || v === 'arrow';
      el.shape = v;
      if (nowLinear && !wasLinear) { el.stroke = el.fill !== 'none' ? el.fill : 'text'; el.strokeW = Math.max(4, el.strokeW); el.fill = 'none'; const cy = el.y + el.h / 2; el.h = 40; el.y = cy - 20; el.head = v === 'arrow' ? 'end' : 'none'; }
      if (!nowLinear && wasLinear) { el.fill = el.stroke; el.stroke = 'none'; el.strokeW = 0; const cy = el.y + el.h / 2; el.h = Math.max(160, el.h); el.y = cy - el.h / 2; }
      if (v === 'arrow' && el.head === 'none') el.head = 'end';
    }, { parts: ['canvas', 'thumb', 'inspector', 'overlay'] }))),
    linear ? null : colorRow('Fill', [el], 'fill', { allowNone: true }),
    linear ? colorRow('Color', [el], 'stroke') : row(field('Outline', colorControlMini([el], 'stroke')), numRow('Width', [el], 'strokeW', { min: 0, max: 60, suffix: 'px' })),
    linear ? numRow('Thickness', [el], 'strokeW', { min: 1, max: 60, suffix: 'px' }) : null,
    el.shape === 'rect' ? numRow('Corner radius', [el], 'radius', { min: 0, max: 600, suffix: 'px' }) : null,
    linear || el.strokeW ? field('Dash', segmented([['solid', 'Solid'], ['dashed', 'Dashed'], ['dotted', 'Dotted']], el.dash || 'solid', setter([el], 'dash').onChange)) : null,
    el.shape === 'arrow' ? field('Heads', segmented([['end', 'End'], ['start', 'Start'], ['both', 'Both']], el.head, setter([el], 'head').onChange)) : null,
    linear ? h('p.hint', null, 'Drag the round handle to set the angle; Shift snaps to 15°.') : null,
  )];
}

function embedSections(el) {
  const url = h('input.text-input', { type: 'url', placeholder: 'https://…', value: el.src || '', 'data-focus': 'src' });
  url.addEventListener('change', () => app.mutate(() => { el.src = url.value.trim(); }, { parts: ['canvas', 'thumb', 'inspector'] }));
  url.addEventListener('keydown', e => { if (e.key === 'Enter') url.blur(); });
  const resolved = embedURL(el.src);
  return [section('Web embed',
    field('Address', url, { cls: 'block' }),
    resolved && resolved !== el.src ? h('p.hint', null, 'Embeds as ', h('code', null, resolved)) : null,
    h('div.btn-row', null,
      button('Interact', 'hand', () => app.action('interact'), { showLabel: true, disabled: !el.src }),
      button('Reload', 'reload', () => app.action('reload'), { showLabel: true, cls: 'ghost', disabled: !el.src })),
    h('p.hint', null, 'YouTube and Vimeo links are converted automatically. Some sites refuse to be framed. Your own tools can take ', h('code', null, '?embed=true'), ' and send ', h('code', null, "{type:'iframeNav'}"), ' to advance the deck.'),
    row(numRow('Radius', [el], 'radius', { min: 0, max: 200, suffix: 'px' }), field('Border', colorControlMini([el], 'stroke'))),
  )];
}

function appletSections(el) {
  return [section('Applet',
    field('Name', inputText(el, 'name', 'Applet')),
    h('div.btn-row', null,
      button('Edit code…', 'code', () => app.onEditApplet?.(el), { showLabel: true, cls: 'primary' }),
      button('Interact', 'hand', () => app.action('interact'), { showLabel: true }),
      button('Reload', 'reload', () => app.action('reload'), { cls: 'ghost' })),
    field('Replace with', select([['', 'Choose a starter…'], ...APPLETS.map(a => [a.id, a.name]), ['file', 'An .html file…']], '', v => {
      if (v === 'file') app.onLoadAppletFile?.(el);
      else if (v) { const a = APPLETS.find(x => x.id === v); app.mutate(() => { el.code = a.code; el.name = a.name; }, { parts: ['canvas', 'thumb', 'inspector'] }); }
    })),
    h('p.hint', null, 'Runs sandboxed. The theme is available as CSS variables (', h('code', null, 'var(--pz-accent)'), ' …). Arrow keys pressed inside still advance the deck unless the applet handles them.'),
    row(numRow('Radius', [el], 'radius', { min: 0, max: 200, suffix: 'px' }), field('Border', colorControlMini([el], 'stroke'))),
  )];
}

function arrangeSection(el) {
  const s = k => setter([el], k);
  geo.x = numberInput(el.x, { step: 1, ...s('x') });
  geo.y = numberInput(el.y, { step: 1, ...s('y') });
  geo.w = numberInput(el.w, { min: 4, step: 1, ...s('w'), onInput: v => { el.w = v; live(); }, onCommit: v => { el.w = v; live(); commit(); } });
  geo.h = numberInput(el.h, { min: 4, step: 1, onInput: v => { el.h = v; if (el.type === 'text') el.autoH = false; live(); }, onCommit: v => { el.h = v; if (el.type === 'text') el.autoH = false; live(); commit(); } });
  geo.rot = numberInput(el.rot, { min: -180, max: 180, step: 1, suffix: '°', ...s('rot') });
  return section('Arrange',
    h('div.grid4', null, field('X', geo.x), field('Y', geo.y), field('W', geo.w), field('H', geo.h)),
    row(field('Rotate', geo.rot), field('Lock', toggle(el.locked ? 'Locked' : 'Unlocked', el.locked, v => { app.mutate(() => { el.locked = v; }, { parts: ['canvas', 'overlay', 'inspector'] }); }))),
    field('Align to slide', h('div.icon-row', null,
      ...[['alignL', 'left'], ['alignC', 'center'], ['alignR', 'right'], ['alignT', 'top'], ['alignM', 'middle'], ['alignB', 'bottom']]
        .map(([ic, a]) => button('Align ' + a, ic, () => app.action('align', a), { cls: 'ghost sm' })))),
    field('Order', h('div.icon-row', null,
      button('Bring to front (⇧⌘])', 'front', () => app.action('order', 'front'), { cls: 'ghost sm' }),
      button('Bring forward (⌘])', 'chevron', () => app.action('order', 'forward'), { cls: 'ghost sm flip' }),
      button('Send backward (⌘[)', 'chevron', () => app.action('order', 'backward'), { cls: 'ghost sm' }),
      button('Send to back (⇧⌘[)', 'back', () => app.action('order', 'back'), { cls: 'ghost sm' }))),
  );
}

function effectsSection(els) {
  const el = els[0];
  return section('Effects',
    field('Opacity', slider(el.opacity ?? 1, { min: 0.05, max: 1, step: 0.01, format: v => Math.round(v * 100) + '%', ...setter(els, 'opacity') })),
    field('Shadow', segmented(Object.entries(SHADOW_NAMES), el.shadow || 'none', setter(els, 'shadow').onChange)),
  );
}

function buildSection(els) {
  const el = els[0], slide = currentSlide();
  const others = slide.elements.filter(e => !els.includes(e) && e.build > 0);
  const maxStep = Math.max(0, ...others.map(e => e.build + buildSteps(e) - 1));
  const opts = [['0', 'With the slide']];
  for (let k = 1; k <= maxStep + 1; k++) opts.push([String(k), k === maxStep + 1 ? `On click ${k} (new)` : `On click ${k}`]);
  if (el.build > maxStep + 1) opts.push([String(el.build), `On click ${el.build}`]);
  return section('Build',
    row(field('Appears', select(opts, String(el.build || 0), v => { app.mutate(() => els.forEach(e => { e.build = +v; }), { parts: ['canvas', 'overlay', 'thumb', 'inspector'] }); })),
      el.build ? field('Animation', select(Object.entries(ANIMS), el.anim || 'fade', setter(els, 'anim').onChange)) : null),
    el.build && el.type === 'text' ? field('Reveal', segmented([['element', 'Whole box'], ['paragraph', 'By paragraph']], el.buildBy || 'element', v => { app.mutate(() => els.forEach(e => { e.buildBy = v; }), { parts: ['overlay', 'thumb', 'inspector'] }); })) : null,
    h('p.hint', null, 'Builds play in Present and in the exported file: each click reveals the next step.'),
  );
}

// ---------------------------------------------------------------- multi --
function multiPanel(sel) {
  const allText = sel.every(e => e.type === 'text');
  const out = [header(`${sel.length} selected`, 'layout', [
    button('Duplicate', 'copy', () => app.action('duplicate'), { cls: 'ghost sm' }),
    button('Delete', 'trash', () => app.action('delete'), { cls: 'ghost sm' }),
  ])];
  out.push(section('Align',
    field('To each other', h('div.icon-row', null,
      ...[['alignL', 'left'], ['alignC', 'center'], ['alignR', 'right'], ['alignT', 'top'], ['alignM', 'middle'], ['alignB', 'bottom']]
        .map(([ic, a]) => button('Align ' + a, ic, () => app.action('alignSel', a), { cls: 'ghost sm' })))),
    sel.length >= 3 ? field('Distribute', h('div.icon-row', null,
      button('Distribute horizontally', 'distH', () => app.action('distribute', 'h'), { cls: 'ghost sm' }),
      button('Distribute vertically', 'distV', () => app.action('distribute', 'v'), { cls: 'ghost sm' }))) : null,
    field('To slide', h('div.icon-row', null,
      ...[['alignL', 'left'], ['alignC', 'center'], ['alignR', 'right'], ['alignT', 'top'], ['alignM', 'middle'], ['alignB', 'bottom']]
        .map(([ic, a]) => button('Align ' + a, ic, () => app.action('align', a), { cls: 'ghost sm' })))),
    field('Order', h('div.icon-row', null,
      button('Bring to front', 'front', () => app.action('order', 'front'), { cls: 'ghost sm' }),
      button('Send to back', 'back', () => app.action('order', 'back'), { cls: 'ghost sm' }))),
  ));
  if (allText) {
    out.push(section('Text',
      field('Font', select(fontOptions(), sel[0].font, v => { ensureFontHook.fn(v); setter(sel, 'font').onChange(v); })),
      numRow('Size', sel, 'size', { min: 6, max: 400, suffix: 'px' }),
      colorRow('Color', sel, 'color'),
    ));
  }
  out.push(effectsSection(sel), buildSection(sel));
  return out;
}

// ---------------------------------------------------------------- slide --
function slidePanel() {
  const slide = currentSlide(), i = app.slideIndex, bg = slide.bg;
  const setBg = (patch, parts = ['canvas', 'thumb']) => app.mutate(() => { slide.bg = { ...slide.bg, ...patch }; }, { parts });
  const kinds = [['theme', 'Theme'], ['color', 'Color'], ['gradient', 'Gradient'], ['image', 'Image']];
  const bgLive = (patch) => { slide.bg = { ...slide.bg, ...patch }; app.refresh(['canvas']); };
  const bgCtl = (prop, allowNone) => colorControl(bg[prop] || (prop === 'color' ? 'surface' : 'accent'), app.deck.theme, v => setBg({ [prop]: v }), { onInput: v => bgLive({ [prop]: v }), allowNone });
  const out = [header(`Slide ${i + 1} of ${app.deck.slides.length}`, 'layout', [
    button('Present from here', 'play', () => app.present?.(i), { cls: 'ghost sm' }),
    button('Duplicate slide', 'copy', () => app.action('duplicateSlide'), { cls: 'ghost sm' }),
    button('Delete slide', 'trash', () => app.action('deleteSlide'), { cls: 'ghost sm' }),
  ])];
  out.push(section('Background',
    segmented(kinds, bg.kind || 'theme', v => {
      const patch = { kind: v };
      if (v === 'color' && !bg.color) patch.color = 'surface';
      if (v === 'gradient') { patch.color = bg.color || 'bg'; patch.color2 = bg.color2 || 'surface'; patch.angle = bg.angle ?? 135; }
      setBg(patch, ['canvas', 'thumb', 'inspector']);
      if (v === 'image' && !bg.asset) app.onChooseBackground?.();
    }),
    bg.kind === 'color' ? field('Color', bgCtl('color'), { cls: 'block' }) : null,
    bg.kind === 'gradient' ? [field('From', bgCtl('color'), { cls: 'block' }), field('To', bgCtl('color2'), { cls: 'block' }),
      field('Angle', slider(bg.angle ?? 135, { min: 0, max: 360, step: 5, format: v => v + '°', onInput: v => bgLive({ angle: v }), onCommit: v => setBg({ angle: v }) }))] : null,
    bg.kind === 'image' ? [
      h('div.btn-row', null, button(bg.asset ? 'Replace image…' : 'Choose image…', 'upload', () => app.onChooseBackground?.(), { showLabel: true })),
      field('Fit', segmented([['cover', 'Fill'], ['contain', 'Fit']], bg.fit || 'cover', v => setBg({ fit: v }))),
      field('Dim', slider(bg.dim || 0, { min: 0, max: 0.9, step: 0.05, format: v => Math.round(v * 100) + '%', onInput: v => bgLive({ dim: v }), onCommit: v => setBg({ dim: v }) })),
      field('Dim with', segmented([['dark', 'Black'], ['light', 'White']], bg.dimColor || 'dark', v => setBg({ dimColor: v }))),
    ] : null,
    h('div.btn-row', null, button('Apply to all slides', 'copy', () => app.action('bgToAll'), { showLabel: true, cls: 'ghost' })),
  ));
  const title = h('input.text-input', { type: 'text', value: slide.sectionTitle || '', placeholder: 'Section title (used for navigation)', 'data-focus': 'sectionTitle' });
  title.addEventListener('change', () => app.mutate(() => { slide.sectionTitle = title.value; }, { parts: ['slides'] }));
  out.push(section('Section',
    i > 0 ? toggle('This slide starts a new section', slide.section, v => app.mutate(() => { slide.section = v; }, { parts: ['slides', 'inspector'] })) : h('p.hint', null, 'The first slide always starts a section.'),
    i === 0 || slide.section ? field('Title', title, { cls: 'block' }) : null,
    h('p.hint', null, app.deck.settings.nav === 'chapters'
      ? 'Chapters navigation: sections run top to bottom, the slides inside a section run left to right.'
      : 'Sections label the slide list. Switch Design → Navigation to “Chapters” to lay them out as fullPage.js sections.'),
  ));
  out.push(remoteSlideSection());
  out.push(h('p.hint.center', null, 'Speaker notes are under the slide. Select an element to format it.'));
  return out;
}

// --------------------------------------------------------------- design --
function designPanel() {
  const deck = app.deck, theme = deck.theme;
  const setTheme = (fn, rebuild = true) => app.mutate(() => fn(theme), { parts: ['canvas', 'slides', ...(rebuild ? ['inspector'] : [])] });
  const pal = h('div.palette-grid');
  for (const p of PALETTES) {
    const on = theme.palette === p.id && COLOR_TOKENS.every(t => theme.colors[t].toLowerCase() === p.colors[t].toLowerCase());
    pal.append(h('button.palette-card' + (on ? '.on' : ''), {
      type: 'button', title: p.name, style: { background: p.colors.bg, color: p.colors.text },
      onclick: () => setTheme(t => { t.palette = p.id; t.colors = { ...p.colors }; }),
    },
    h('span.pc-aa', { style: { fontFamily: fontStack(theme.fonts.heading) } }, 'Aa'),
    h('span.pc-dots', null, ...['accent', 'accent2', 'muted'].map(k => h('i', { style: { background: p.colors[k] } }))),
    h('span.pc-name', { style: { color: p.colors.muted } }, p.name)));
  }
  const colors = h('div.color-rows');
  for (const t of COLOR_TOKENS) {
    const inp = h('input.color-input', { type: 'color', value: toHex6(theme.colors[t]) });
    const hex = h('input.hex-input', { type: 'text', value: theme.colors[t], spellcheck: false });
    inp.addEventListener('input', () => { theme.colors[t] = inp.value; hex.value = inp.value; app.refresh(['canvas']); });
    inp.addEventListener('change', () => { theme.palette = 'custom'; app.commit('theme-' + t); app.refresh(['slides']); });
    hex.addEventListener('change', () => { if (CSS.supports('color', hex.value)) { theme.colors[t] = hex.value; inp.value = toHex6(hex.value); theme.palette = 'custom'; app.commit(); app.refresh(['canvas', 'slides']); } });
    colors.append(h('label.color-row', null, inp, h('span.cr-label', null, COLOR_LABELS[t]), hex));
  }
  const pairs = h('div.pair-list');
  for (const f of FONT_PAIRS) {
    ensureFontHook.fn(f.heading); ensureFontHook.fn(f.body);
    const on = theme.fonts.heading === f.heading && theme.fonts.body === f.body && theme.fonts.mono === f.mono;
    pairs.append(h('button.pair-card' + (on ? '.on' : ''), {
      type: 'button', onclick: () => setTheme(t => { t.fontPair = f.id; t.fonts = { heading: f.heading, body: f.body, mono: f.mono }; }),
    },
    h('span.pair-h', { style: { fontFamily: fontStack(f.heading) } }, f.name),
    h('span.pair-b', { style: { fontFamily: fontStack(f.body) } }, `${f.heading} · ${f.body}`)));
  }
  const allFonts = [...Object.keys(FONTS), ...Object.keys(SYSTEM_FONTS)].sort().map(x => [x, x]);
  const fontSel = role => select(allFonts, theme.fonts[role], v => { ensureFontHook.fn(v); setTheme(t => { t.fonts[role] = v; t.fontPair = 'custom'; }); });
  const s = deck.settings;
  const setSetting = (k, rebuild) => v => app.mutate(() => { s[k] = v; }, { parts: rebuild ? ['slides', 'inspector'] : [] });
  const macros = h('textarea.code.macros', { rows: 8, spellcheck: false });
  macros.value = s.macros || '';
  macros.addEventListener('change', () => app.mutate(() => { s.macros = macros.value; }, { parts: ['canvas', 'slides'] }));
  return [
    section('Color palette', pal, h('details.more', null, h('summary', null, 'Customize colors'), colors)),
    section('Fonts', pairs, h('details.more', null, h('summary', null, 'Choose fonts individually'),
      field('Headings', fontSel('heading')), field('Body', fontSel('body')), field('Code', fontSel('mono')))),
    section('Navigation',
      field('Layout', segmented([['linear', 'Linear'], ['chapters', 'Chapters']], s.nav, setSetting('nav', true))),
      h('p.hint', null, s.nav === 'chapters' ? 'Each section is a fullPage.js section; its slides scroll horizontally. ↑/↓ jump between sections.' : 'Every slide is its own fullPage.js section, in one vertical run.'),
      toggle('Navigation dots', s.dots, setSetting('dots')),
      toggle('Arrows at the sides', s.arrows, setSetting('arrows')),
      toggle('Slide numbers', s.numbers, setSetting('numbers')),
      toggle('Progress bar', s.progress, setSetting('progress')),
      field('Transition', slider(s.speed, { min: 200, max: 1600, step: 50, format: v => v + ' ms', onCommit: setSetting('speed') })),
    ),
    remoteDesignSection(),
    section('Math', field('Macros', macros, { cls: 'block' }),
      h('p.hint', null, String.raw`One \newcommand per line; used in every equation and $…$ in text.`),
      app.host ? h('p.hint', null, 'The project’s shared macros (macros.tex) also apply; definitions here take precedence.') : null),
  ];
}

export function focusField(name) {
  const el = body.querySelector(`[data-focus="${name}"]`);
  if (el) { el.focus(); el.select?.(); }
}

