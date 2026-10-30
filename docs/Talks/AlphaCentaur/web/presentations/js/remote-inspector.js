// Phone remote — the inspector sections: the deck's remote (Design tab) and
// the current slide's remote (Format tab, nothing selected).

import { app, currentSlide } from './state.js';
import {
  REMOTE_PRESETS, CONTROL_TYPES, presetById, isParamControl, normalizeRemoteDeck, normalizeControl, resolveRemote, slideParams,
} from './remote-model.js';
import { savedSetup, saveSetup, effectiveSetup, openSetupWizard, testConnection, downloadPhonePage, WORKSPACE } from './remote-setup.js';
import { toHost } from './host.js';
import { setRemotePreview } from './remote-preview.js';
import { h, icon, button, field, select, toggle, menuButton, numberInput, toast } from './ui.js';

const NAME = /^[A-Za-z_][\w-]{0,39}$/;
const remoteOf = deck => normalizeRemoteDeck(deck.remote);
const setDeckRemote = (patch, parts = ['inspector']) =>
  app.mutate(d => { d.remote = { ...normalizeRemoteDeck(d.remote), ...patch }; }, { parts });
// Turning the remote on. Standalone, a deck without a setup takes the one
// this browser remembers; inside alphaCentaur the workspace's applies anyway.
function enablePatch(r) {
  const saved = savedSetup();
  return !WORKSPACE && !r.firebase && saved ? { enabled: true, firebase: saved.firebase, page: r.page || saved.page } : { enabled: true };
}

function titled(title, extra, ...children) {
  return h('section.insp-section', null, h('div.insp-title-row', null, h('h3.insp-title', null, title), extra), ...children);
}
function eyeButton() {
  const on = app.remotePreview;
  return h('button.btn.ghost.sm.eye-btn' + (on ? '.on' : ''), {
    type: 'button', title: on ? 'Hide the phone preview' : 'Show this slide’s remote beside the canvas',
    'aria-pressed': String(on), onclick: () => setRemotePreview(!on),
  }, icon(on ? 'eye' : 'eyeOff', 16), h('span', null, on ? 'Shown' : 'Show'));
}

// A tiny phone sketch for each preset.
function glyph(id) {
  const parts = {
    presenter: '<rect x="7" y="8" width="18" height="5" rx="1.5"/><rect x="7" y="15" width="18" height="11" rx="1.5" opacity=".55"/><rect x="7" y="28" width="18" height="3" rx="1" opacity=".55"/><rect x="7" y="33" width="7" height="5" rx="1.5"/><rect x="16" y="33" width="9" height="5" rx="1.5" class="a"/>',
    clicker: '<rect x="7" y="8" width="18" height="4" rx="1.2" opacity=".55"/><rect x="7" y="14" width="18" height="17" rx="2.5" class="a"/><rect x="7" y="33" width="18" height="5" rx="1.5"/>',
    buttons: '<rect x="7" y="8" width="18" height="4" rx="1.2" opacity=".55"/><rect x="7" y="14" width="7" height="6" rx="1.5"/><rect x="16" y="14" width="9" height="6" rx="1.5" class="a"/><path d="M8 24h16M8 28h16M8 32h16M8 36h12" stroke-width="1.6" opacity=".6"/>',
    joystick: '<circle cx="16" cy="20" r="8.5" opacity=".55"/><circle cx="16" cy="20" r="3.4" class="a"/><rect x="7" y="33" width="7" height="5" rx="1.5"/><rect x="16" y="33" width="9" height="5" rx="1.5" class="a"/>',
    controls: '<path d="M8 11h16M8 18h16" stroke-width="1.6" opacity=".55"/><circle cx="19" cy="11" r="2.2" class="a"/><circle cx="12" cy="18" r="2.2" class="a"/><rect x="7" y="23" width="18" height="5" rx="2.5" opacity=".55"/><rect x="7" y="33" width="7" height="5" rx="1.5"/><rect x="16" y="33" width="9" height="5" rx="1.5" class="a"/>',
    custom: '<path d="M10 12h12M10 18h8M10 24h12" stroke-width="1.6" opacity=".6"/><path d="M16 31v6M13 34h6" stroke-width="1.8" class="as"/>',
  }[id] || '';
  return h('span.preset-glyph', { html: `<svg viewBox="0 0 32 44" width="24" height="33" aria-hidden="true"><rect x="3.5" y="2.5" width="25" height="39" rx="5" fill="none" stroke="currentColor" stroke-width="1.6"/><g fill="currentColor" stroke="currentColor" stroke-width="0">${parts}</g></svg>` });
}

// --------------------------------------------------------- Design tab ----
export function remoteDesignSection() {
  const deck = app.deck, r = remoteOf(deck), saved = savedSetup(), eff = effectiveSetup(deck);
  // Inside alphaCentaur the setup is the workspace's (WORKSPACE): the wizard
  // saves it there and decks keep no copy. Standalone, each deck keeps one.
  const wizard = () => openSetupWizard({
    initial: eff.firebase ? { firebase: eff.firebase, page: eff.page } : saved,
    onDone: s => {
      setDeckRemote(WORKSPACE ? { enabled: true, firebase: null, page: '' } : { enabled: true, firebase: s.firebase, page: s.page || r.page }, ['inspector']);
      toast(WORKSPACE ? 'Phone remote set up for every deck in alphaCentaur' : 'Phone remote connected');
    },
  });
  const onOff = toggle('Phone remote while presenting', r.enabled, v => setDeckRemote(v ? enablePatch(r) : { enabled: false }));
  if (!r.enabled) {
    return titled('Phone remote', null, onOff,
      h('p.hint', null, 'Run the talk from your phone: Next and Back, notes and a timer — or sliders, switches and a joystick for the applets on a slide.'));
  }

  // Connection
  const status = h('div.remote-status');
  if (eff.firebase) {
    const where = eff.source === 'workspace' ? 'Set up for every deck in alphaCentaur. ' : WORKSPACE ? 'This deck brought its own setup. ' : '';
    const msg = h('span.rs-sub', null, where + (eff.page ? 'Phones scan a QR code (press R while presenting).' : 'Add the phone page below to get a QR code.'));
    const test = button('Test', 'reload', async () => {
      test.disabled = true; msg.textContent = 'Testing…';
      try { const ms = await testConnection(eff.firebase); msg.textContent = `Connected — answered in ${ms} ms.`; status.classList.remove('bad'); }
      catch (e) { msg.textContent = e.message; status.classList.add('bad'); }
      test.disabled = false;
    }, { showLabel: true, cls: 'ghost sm' });
    const differs = !saved || saved.firebase.projectId !== r.firebase?.projectId || saved.firebase.databaseURL !== r.firebase?.databaseURL;
    const items = WORKSPACE ? [
      { label: 'Change setup…', icon: 'sliders', action: wizard },
      eff.source === 'deck' ? { label: 'Use it for every deck in alphaCentaur', icon: 'save', action: () => { saveSetup({ firebase: r.firebase, page: r.page }); setDeckRemote({ firebase: null, page: '' }); toast('Saved in Workspace settings'); } } : null,
      { label: 'Workspace settings…', icon: 'window', action: () => toHost('pz-open-settings') },
    ] : [
      { label: 'Change setup…', icon: 'sliders', action: wizard },
      differs ? { label: 'Remember for new decks', icon: 'save', action: () => { saveSetup({ firebase: r.firebase, page: r.page }); toast('Saved for new decks'); } } : null,
      '-',
      { label: 'Disconnect this deck', icon: 'x', danger: true, action: () => setDeckRemote({ firebase: null }) },
    ];
    status.append(h('i.rs-dot.ok'), h('div.rs-text', null, h('b', null, 'Firebase · ', eff.firebase.projectId), msg),
      h('div.rs-actions', null, test, menuButton('More', 'more', () => items.filter(Boolean), { cls: 'ghost sm', showLabel: false, align: 'end' })));
  } else {
    status.classList.add('off');
    status.append(h('i.rs-dot'), h('div.rs-text', null, h('b', null, 'Not connected'),
      h('span.rs-sub', null, (WORKSPACE ? 'alphaCentaur has no Firebase setup yet, so phones can’t reach your decks. ' : 'Phones can’t reach this deck yet. ')
        + 'While presenting you can still open the remote in a window on this computer.')));
  }
  const connect = eff.firebase ? null : h('div.btn-row', null,
    !WORKSPACE && saved ? button(`Use ${saved.firebase.projectId}`, 'check', () => setDeckRemote({ firebase: saved.firebase, page: r.page || saved.page }), { showLabel: true, cls: 'primary' }) : null,
    button(!WORKSPACE && saved ? 'Set up another…' : 'Set up phone remote…', 'phone', wizard, { showLabel: true, cls: !WORKSPACE && saved ? 'ghost' : 'primary' }));

  // Phone page: the workspace's inside alphaCentaur, the deck's standalone.
  const page = h('input.text-input', { type: 'url', value: eff.page, placeholder: 'https://… /remote.html', spellcheck: false });
  page.addEventListener('change', () => {
    const v = page.value.trim();
    if (v && !/^https:\/\/[^\s"'<>]+$/.test(v)) { page.classList.add('bad'); toast('Use a full https:// address', 'error'); return; }
    page.classList.remove('bad');
    if (WORKSPACE && eff.source !== 'deck') { saveSetup({ page: v }); if (r.page) setDeckRemote({ page: '' }); else app.refresh(['inspector']); }
    else { setDeckRemote({ page: v }); if (r.firebase && !WORKSPACE) saveSetup({ firebase: r.firebase, page: v }); }
  });
  const pageField = field('Phone page', h('div.stack-sm', null, page,
    h('p.hint', null, WORKSPACE ? 'Where phones open the remote — one page for every deck in alphaCentaur. ' : 'Where phones open the remote — one page for all decks. ',
      h('button.linkish', { type: 'button', onclick: downloadPhonePage }, 'Download remote.html'), ' and put it on any web host.')), { cls: 'block' });

  // Default remote
  const presets = h('div.preset-grid', { role: 'radiogroup', 'aria-label': 'Default remote' });
  for (const p of REMOTE_PRESETS.filter(p => p.id !== 'custom')) {
    presets.append(h('button.preset-card' + (r.preset === p.id ? '.on' : ''), {
      type: 'button', role: 'radio', 'aria-checked': String(r.preset === p.id), title: p.desc,
      onclick: () => setDeckRemote({ preset: p.id }),
    }, glyph(p.id), h('span.preset-text', null, h('b', null, p.name), h('span', null, p.desc))));
  }

  return titled('Phone remote', eyeButton(), onOff, status, connect, pageField,
    field('Every slide shows', presets, { cls: 'block' }),
    h('p.hint', null, 'A slide can show something else: click an empty part of it and choose under Phone remote. The remote takes the deck’s colors and fonts.'));
}

// ---------------------------------------------------------- Slide panel --
export function remoteSlideSection() {
  const deck = app.deck, slide = currentSlide(), r = remoteOf(deck);
  if (!r.enabled) {
    return titled('Phone remote', null,
      h('p.hint', null, 'The phone remote is off for this deck.'),
      h('div.btn-row', null, button('Turn it on', 'phone', () => { app.tab = 'design'; setDeckRemote(enablePatch(r)); }, { showLabel: true, cls: 'ghost' })));
  }
  const own = slide.remote?.preset || 'deck';
  const params = slideParams(slide);
  const mutate = fn => app.mutate(fn, { parts: ['inspector'] });
  const pick = select([
    ['deck', `Deck default — ${presetById(r.preset).name}`],
    ...REMOTE_PRESETS.map(p => [p.id, p.name]),
  ], own, v => mutate(() => {
    if (v === 'deck') delete slide.remote;
    else if (v === 'custom') {
      // Start from what the phone shows now.
      const now = resolveRemote(deck, slide).filter(c => c.type !== 'text' || own === 'custom');
      slide.remote = { preset: 'custom', controls: now };
    } else slide.remote = { preset: v };
  }), { label: 'Remote for this slide' });
  const desc = presetById(own === 'deck' ? r.preset : own)?.desc;
  const out = [field('This slide shows', pick, { cls: 'block' }), desc ? h('p.hint', null, desc) : null];
  if (own === 'custom') out.push(controlsEditor(slide, params));
  if (params.length) {
    const shown = own === 'controls' || (own === 'deck' && r.preset === 'controls') || own === 'custom';
    out.push(field('Applet parameters', h('div.param-chips', null, params.map(p => h('span.param-chip', { title: CONTROL_TYPES[p.type].label },
      h('code', null, p.name), h('span', null, CONTROL_TYPES[p.type].label.toLowerCase())))), { cls: 'block' }));
    if (!shown) out.push(h('div.btn-row', null, button('Put them on the phone', 'phone', () => mutate(() => { slide.remote = { preset: 'controls' }; }), { showLabel: true, cls: 'ghost' })));
  } else if (slide.elements.some(e => e.type === 'applet')) {
    out.push(h('p.hint', null, 'An applet can expose parameters to the phone: ', h('code', null, "pz.slider('speed', { min: 0, max: 5 }, v => …)"),
      ', ', h('code', null, 'pz.toggle'), ', ', h('code', null, 'pz.button'), ', ', h('code', null, 'pz.joystick'), '.'));
  }
  return titled('Phone remote', eyeButton(), ...out);
}

// --------------------------------------------------------- custom list ---
function controlsEditor(slide, params) {
  const list = slide.remote.controls;
  const commit = (key) => { app.commit(key); app.refresh([]); };
  const rebuild = () => app.mutate(() => {}, { parts: ['inspector'] });
  const uniqueName = base => { let n = base, k = 2; const used = new Set(list.map(c => c.name)); while (used.has(n)) n = base + k++; return n; };
  const add = c => app.mutate(() => { list.push(c); }, { parts: ['inspector'] });
  const box = h('div.ctl-list');
  list.forEach((c, i) => {
    const meta = CONTROL_TYPES[c.type] || { label: c.type };
    const move = d => app.mutate(() => { const [x] = list.splice(i, 1); list.splice(i + d, 0, x); }, { parts: ['inspector'] });
    const head = h('div.ctl-head', null,
      h('span.ctl-type', null, meta.label),
      isParamControl(c) ? h('code.ctl-name', null, c.name || '?') : null,
      h('span.ctl-actions', null,
        button('Move up', 'up', () => move(-1), { cls: 'ghost xs', disabled: i === 0 }),
        button('Move down', 'chevron', () => move(1), { cls: 'ghost xs', disabled: i === list.length - 1 }),
        button('Remove', 'trash', () => app.mutate(() => { list.splice(i, 1); }, { parts: ['inspector'] }), { cls: 'ghost xs' })));
    const row = h('div.ctl-row', null, head);
    const text = (prop, placeholder, opts = {}) => {
      const inp = h(opts.area ? 'textarea.text-input.ctl-area' : 'input.text-input', { type: 'text', value: c[prop] ?? '', placeholder, spellcheck: !opts.code, rows: opts.area ? 3 : null });
      if (opts.area) inp.value = c[prop] ?? '';
      inp.addEventListener('input', () => {
        if (opts.code) { inp.classList.toggle('bad', !NAME.test(inp.value)); if (!NAME.test(inp.value)) return; }
        c[prop] = inp.value; app.refresh([]);
      });
      inp.addEventListener('change', () => { if (opts.code && !NAME.test(inp.value)) { inp.value = c[prop]; inp.classList.remove('bad'); return; } commit('ctl:' + prop + i); if (opts.code) rebuild(); });
      return inp;
    };
    if (isParamControl(c)) {
      row.append(h('div.insp-row', null, field('Label', text('label', c.name)), field('Name', text('name', 'name', { code: true }))));
    } else if (c.type === 'next' || c.type === 'prev') {
      row.append(field('Label', text('label', c.type === 'next' ? 'Next' : '‹ Back')));
    } else if (c.type === 'text') {
      row.append(field('Text', text('text', 'Shown on the phone', { area: true }), { cls: 'block' }));
    }
    if (c.type === 'slider') {
      const num = (prop, lab, o = {}) => field(lab, numberInput(c[prop], { step: 'any', ...o,
        onInput: v => { c[prop] = v; app.refresh([]); },
        onCommit: v => { c[prop] = v; Object.assign(c, normalizeControl(c)); commit('ctl:' + prop + i); rebuild(); } }));
      row.append(h('div.grid4', null, num('min', 'Min'), num('max', 'Max'), num('step', 'Step', { min: 0 }), num('value', 'Start')));
    }
    if (c.type === 'toggle') row.append(toggle('Starts on', c.value, v => { c.value = v; commit('ctl:v' + i); }));
    box.append(row);
  });
  if (!list.length) box.append(h('p.hint', null, 'No controls yet — the phone will show an empty page.'));

  const fromApplets = params.filter(p => !list.some(c => c.name === p.name));
  const items = () => [
    fromApplets.length ? { heading: 'From this slide’s applets' } : null,
    ...fromApplets.map(p => ({ label: `${p.label || p.name} (${CONTROL_TYPES[p.type].label.toLowerCase()})`, icon: 'code', action: () => add({ ...p }) })),
    ...['Navigation', 'Information', 'Parameters'].flatMap(g => [
      { heading: g },
      ...Object.entries(CONTROL_TYPES).filter(([, m]) => m.group === g).map(([type, m]) => ({
        label: m.label, icon: type === 'joystick' ? 'hand' : type === 'slider' ? 'sliders' : type === 'text' ? 'text' : 'phone',
        action: () => add(normalizeControl({ type, ...(m.param ? { name: uniqueName(type), label: m.label } : {}), ...(type === 'text' ? { text: 'Your note' } : {}) })),
      })),
    ]),
  ].filter(Boolean);
  return h('div.stack-sm', null, box, h('div.btn-row', null,
    menuButton('Add control', 'plus', items, { cls: 'ghost' }),
    fromApplets.length > 1 ? button('Add all applet parameters', 'code', () => app.mutate(() => { list.push(...fromApplets.map(p => ({ ...p }))); }, { parts: ['inspector'] }), { showLabel: true, cls: 'ghost' }) : null),
    h('p.hint', null, 'A control’s name is what the applets receive: ', h('code', null, "pz.on('name', v => …)"), ', or listen for ', h('code', null, 'pz-param'), ' messages in an embedded page.'));
}
