// controlsView.js — render an introspected control schema as two pages.
//
//   SIMPLE    the default: a curated handful of big, thumb-friendly controls —
//             fill-bar drag sliders, toggle tiles, segmented pickers, action
//             and key tiles (picked in curation.js, else by heuristic).
//   ADVANCED  every control, grouped into cards, with a filter.
//
// Used by BOTH the on-stage panel and the remote, so the two control surfaces
// look and behave identically. `dispatch(type, payload)` is the only outward
// dependency: on the stage it calls the controller directly; on the remote it
// sends over the transport. Re-rendering patches values in place, so a slider
// under a finger is never replaced mid-drag.

import { CMD } from './protocol.js';
import { el, clear, keyLabel } from './util.js';
import { curationFor } from './curation.js';
import { vizById } from './manifest.js';

export const ECHO_GRACE_MS = 800; // ignore the stage's echo of a value we just sent
const CONTROLS = '\u0000controls';
const ACTIONS = '\u0000actions';
const ACTION_RE = /random|shuffle|reset|restart|new|seed|preset|play|pause|clear|surprise/i;

/**
 * Mount the two control pages. Call `update(schema)` whenever a schema arrives;
 * it returns counts for tab badges.
 */
export function createControlsView({ simple, advanced, dispatch, onMore } = {}) {
  let latest = null;
  const render = (schema) => {
    const m = buildModel(schema);
    if (simple) sync(simple, m, 'simple', ctx);
    if (advanced) sync(advanced, m, 'advanced', ctx);
    return { simple: m.picks.length + m.simpleKeys.length, advanced: m.controls.length, keys: m.keys.length };
  };
  // A slider under a finger defers structural rebuilds; its release re-renders the latest schema.
  const ctx = { dispatch, onMore, resync: () => { if (latest !== null) render(latest); } };
  return {
    update(schema) {
      latest = schema;
      return render(schema);
    },
  };
}

// ── model: schema + curation ─────────────────────────────────────────────────
function buildModel(schema) {
  const vizId = schema?.vizId || null;
  const cur = curationFor(vizId);
  const labels = cur?.labels || {};
  const hidden = new Set(cur?.hide || []);
  const controls = (schema?.controls || [])
    .filter((c) => !hidden.has(c.selector))
    .map((c) => ({ ...c, label: labels[c.selector] || c.label || 'Control' }));
  const bySel = new Map(controls.map((c) => [c.selector, c]));
  const find = (sel) => bySel.get(sel) || (!sel.startsWith('#') && !sel.includes(' ') ? bySel.get(`#${CSS.escape(sel)}`) : null);

  const keys = cur?.keys
    ? cur.keys.map((k) => ({ key: k.key, label: k.label || '', simple: !!k.simple }))
    : uniqueBy((schema?.keys || []).flatMap(splitKeys), (k) => k).map((key) => ({ key, label: '', simple: false }));

  const seen = new Set();
  const picks = (cur?.simple
    ? cur.simple.map((p) => {
      const c = find(p.sel);
      if (!c) return null;
      const pick = { ...c, label: p.label || c.label };
      if (p.options && c.options) pick.options = c.options.filter((o) => p.options.includes(String(o.value)));
      return pick;
    })
    : fallbackPicks(controls)
  ).filter((c) => c && !seen.has(c.selector) && seen.add(c.selector));

  return {
    vizId,
    ok: !!schema?.ok,
    description: schema?.description || '',
    controls,
    bySel,
    keys,
    picks,
    simpleKeys: keys.filter((k) => k.simple),
  };
}

/** <kbd> hints may bundle several keys ("H J Space"); ' ' is the space key itself. */
function splitKeys(k) {
  if (k === ' ') return [' '];
  return String(k).split(/\s+/).filter(Boolean).map((s) => (s === 'Space' ? ' ' : s.length === 1 ? s.toLowerCase() : s));
}

/** Uncurated visualizations: pickers first, then sliders, toggles, colors; plus obvious action buttons. */
function fallbackPicks(controls) {
  const rank = { select: 0, radio: 0, range: 1, checkbox: 2, color: 3 };
  const fields = controls.filter((c) => !c.readOnly && c.kind in rank
    && (!['select', 'radio'].includes(c.kind) || ((c.options?.length || 0) > 1 && c.options.length <= 12)));
  const chosen = new Set([...fields].sort((a, b) => rank[a.kind] - rank[b.kind]).slice(0, 5));
  const buttons = controls.filter((c) => c.kind === 'button' && ACTION_RE.test(c.label)).slice(0, 4);
  return [...controls.filter((c) => chosen.has(c)), ...buttons];
}

// ── render / patch ───────────────────────────────────────────────────────────
function sync(root, m, page, ctx) {
  const sig = signature(m, page);
  // Same structure — or a slider is being pressed, which a rebuild would yank from under
  // the finger: patch values in place (the release re-syncs any pending rebuild).
  if (root.dataset.structure === sig || root.querySelector('.dslider.pressing')) {
    for (const node of root.querySelectorAll('[data-sel]')) {
      const c = m.bySel.get(node.dataset.sel);
      if (c && node._cvSet) node._cvSet(c);
    }
    const more = root.querySelector('.cv-more .more-label');
    if (more) more.textContent = moreLabel(m);
    return;
  }
  root.dataset.structure = sig;
  clear(root);
  (page === 'simple' ? buildSimple : buildAdvanced)(root, m, ctx);
}

function signature(m, page) {
  const shape = (c) => [c.selector, c.kind, c.label, c.min, c.max, c.step, c.readOnly, c.group, (c.options || []).map((o) => [o.value, o.label])];
  return page === 'simple'
    ? JSON.stringify([m.vizId, m.ok, m.picks.map(shape), m.simpleKeys, hasMore(m)])
    : JSON.stringify([m.vizId, m.ok, m.description, m.controls.map(shape), m.keys]);
}

function buildSimple(root, m, ctx) {
  if (!m.ok) {
    root.append(empty('Waiting for the visualization…', 'Its controls appear here as soon as it loads.'));
    return;
  }
  const stack = el('div', { class: 'simple-stack' });
  const blurb = vizById(m.vizId)?.blurb;
  if (blurb) stack.append(el('p', { class: 'pc-sub' }, blurb));

  const fields = m.picks.filter((c) => c.kind !== 'button');
  const buttons = m.picks.filter((c) => c.kind === 'button');
  let grid = null; // consecutive toggles share a two-up grid
  for (const c of fields) {
    if (c.kind === 'checkbox') {
      if (!grid) stack.append(grid = el('div', { class: 'tiles' }));
      grid.append(toggleTile(c, ctx));
    } else {
      grid = null;
      stack.append(fieldWidget(c, ctx, 'large'));
    }
  }
  if (buttons.length || m.simpleKeys.length) {
    stack.append(el('div', { class: 'tiles' }, [
      ...buttons.map((c) => buttonTile(c, ctx)),
      ...m.simpleKeys.map((k) => keyTile(k, ctx)),
    ]));
  }
  stack.querySelectorAll('.tiles').forEach(balance);

  if (!m.picks.length && !m.simpleKeys.length) {
    stack.append(m.controls.length || m.keys.length
      ? empty('No quick controls here.', 'Everything this visualization offers is on the Advanced page.')
      : empty('Nothing to adjust — just enjoy it.', 'This visualization has no live controls.'));
  }
  if (hasMore(m) && ctx.onMore) {
    stack.append(el('button', { type: 'button', class: 'cv-more', onclick: () => ctx.onMore() }, [
      el('span', { class: 'more-label' }, moreLabel(m)),
      el('span', { class: 'arrow', 'aria-hidden': 'true' }, '→'),
    ]));
  }
  root.append(stack);
}

const hasMore = (m) => m.controls.length + m.keys.length > m.picks.length + m.simpleKeys.length;
const moreLabel = (m) => (m.controls.length ? `All ${m.controls.length} controls` : 'Keyboard shortcuts');

function buildAdvanced(root, m, ctx) {
  if (!m.ok) {
    root.append(empty('Waiting for the visualization…', 'Every control it exposes will be listed here.'));
    return;
  }
  // Filter text and card open/closed state survive re-renders of the same visualization.
  if (root._cvMemory?.vizId !== m.vizId) root._cvMemory = { vizId: m.vizId, filter: '', open: new Map() };
  const memory = root._cvMemory;
  const stack = el('div', { class: 'advanced-stack' });
  if (m.description) stack.append(el('p', { class: 'cv-description' }, m.description));

  const sections = new Map([[CONTROLS, []]]);
  for (const c of m.controls) {
    const name = c.group || (c.kind === 'button' ? ACTIONS : CONTROLS);
    if (!sections.has(name)) sections.set(name, []);
    sections.get(name).push(c);
  }
  if (sections.has(ACTIONS)) { const a = sections.get(ACTIONS); sections.delete(ACTIONS); sections.set(ACTIONS, a); }
  const entries = [...sections].filter(([, list]) => list.length);
  if (m.keys.length) entries.push(['Keyboard', null]);

  const cards = entries.map(([name, list], i) => {
    const title = name === CONTROLS ? 'Controls' : name === ACTIONS ? 'Actions' : name;
    const body = el('div', { class: 'pc-card-body' });
    if (list) {
      list.filter((c) => c.kind !== 'button').forEach((c) => body.append(fieldWidget(c, ctx, 'compact')));
      const buttons = list.filter((c) => c.kind === 'button');
      if (buttons.length) body.append(el('div', { class: 'btn-row' }, buttons.map((c) => buttonSmall(c, ctx))));
    } else {
      const tiles = el('div', { class: 'tiles' }, m.keys.map((k) => keyTile(k, ctx)));
      balance(tiles);
      body.append(tiles);
    }
    const defaultOpen = entries.length <= 3 || i < 2 || ['Scenes', 'Motion'].includes(title);
    // The count rides in an attribute so the summary's text is exactly the group name.
    const card = el('details', { class: 'pc-card cv-group', dataset: { title: title.toLowerCase() } }, [
      el('summary', {}, el('span', { class: 'pc-label', dataset: { n: String(list ? list.length : m.keys.length) } }, title)),
      body,
    ]);
    card.open = memory.open.has(title) ? memory.open.get(title) : defaultOpen;
    card._cvDefault = () => (memory.open.has(title) ? memory.open.get(title) : defaultOpen);
    card.addEventListener('toggle', () => { if (!stack.classList.contains('cv-filtering')) memory.open.set(title, card.open); });
    return card;
  });

  if (m.controls.length >= 8) {
    const noMatch = el('div', { class: 'cv-empty', hidden: true }, [el('strong', {}, 'No matching controls'), 'Try a different word.']);
    const input = el('input', { type: 'search', placeholder: `Filter ${m.controls.length} controls…`, 'aria-label': 'Filter controls', autocomplete: 'off', spellcheck: 'false', value: memory.filter });
    const apply = () => {
      const q = input.value.trim().toLowerCase();
      memory.filter = input.value;
      stack.classList.toggle('cv-filtering', !!q);
      let anyCard = false;
      for (const card of cards) {
        const titleHit = !!q && card.dataset.title.includes(q);
        let any = false;
        for (const row of card.querySelectorAll('.pc-card-body [data-search]')) {
          const hit = !q || titleHit || row.dataset.search.includes(q);
          row.hidden = !hit;
          any ||= hit;
        }
        card.hidden = !any;
        card.open = q ? any : card._cvDefault();
        anyCard ||= any;
      }
      noMatch.hidden = !q || anyCard;
    };
    input.addEventListener('input', apply);
    stack.append(el('div', { class: 'cv-filter' }, input), ...cards, noMatch);
    if (memory.filter) apply();
  } else {
    stack.append(...cards);
  }

  if (!entries.length) stack.append(empty('No adjustable controls.', 'This visualization exposes nothing to tweak.'));
  root.append(stack);
}

// ── widgets ──────────────────────────────────────────────────────────────────
function fieldWidget(c, ctx, size) {
  switch (c.kind) {
    case 'range': return slider(c, ctx, size);
    case 'number': {
      // A number with a short range reads well as a slider; seeds, BPM and the like need typing.
      const steps = (c.max - c.min) / (c.step > 0 ? c.step : 1);
      return Number.isFinite(steps) && steps > 0 && steps <= 400 ? slider(c, ctx, size) : stepper(c, ctx);
    }
    case 'checkbox': return size === 'large' ? toggleTile(c, ctx) : switchRow(c, ctx);
    case 'select':
    case 'radio': return choice(c, ctx, size);
    case 'color': return colorRow(c, ctx, size);
    case 'button': return size === 'large' ? buttonTile(c, ctx) : buttonSmall(c, ctx);
    default: return textField(c, ctx);
  }
}

const setter = (c, ctx) => (value) => ctx.dispatch(CMD.SET_CONTROL, { selector: c.selector, kind: c.kind, value });
const graceLeft = (lastLocal) => Math.max(0, ECHO_GRACE_MS - (performance.now() - lastLocal));

/**
 * Apply the stage's values to a widget without fighting the user: while `busy()` returns a
 * wait (ms), hold the newest patch and retry, so the stage's final value (clamped, snapped
 * or rejected) always lands once the user's hands are off the control.
 */
function patcher(busy, apply) {
  let timer = 0;
  let pending;
  const run = () => {
    timer = 0;
    const wait = busy();
    if (wait > 0) timer = setTimeout(run, wait);
    else apply(pending);
  };
  return (next) => { pending = next; if (!timer) run(); };
}
const meta = (c) => ({ sel: c.selector, search: `${c.label} ${c.group || ''}`.toLowerCase() });
const now = () => performance.now();

/** Fill-bar slider: tap to jump, drag sideways to scrub; vertical swipes still scroll the page. */
function slider(c, ctx, size) {
  const min = Number.isFinite(c.min) ? c.min : 0;
  const max = Number.isFinite(c.max) ? c.max : 100;
  const step = Number.isFinite(c.step) && c.step > 0 ? c.step : null;
  const span = max - min || 1;
  let value = Number(c.value);
  let lastLocal = 0;
  let dragging = false;
  let start = null;

  const out = el('span', { class: 'dl-value' });
  const node = el('div', {
    class: size === 'large' ? 'dslider' : 'dslider compact',
    role: 'slider', tabindex: '0', 'aria-label': c.label, 'aria-valuemin': min, 'aria-valuemax': max,
    dataset: meta(c),
  }, [el('span', { class: 'dl-label' }, c.label), out]);
  const send = throttle(setter(c, ctx), 60);

  const render = () => {
    const f = Math.max(0, Math.min(1, (value - min) / span));
    node.style.setProperty('--fill', `${((Number.isFinite(f) ? f : 0) * 100).toFixed(2)}%`);
    const text = Number.isFinite(value) ? formatNumber(value, step, span) : '—';
    out.textContent = text;
    node.setAttribute('aria-valuenow', Number.isFinite(value) ? value : min);
    node.setAttribute('aria-valuetext', text);
  };
  const commit = (raw) => {
    lastLocal = now();
    const v = quantize(raw, min, max, step);
    if (v === value) return;
    value = v;
    render();
    send(v);
  };
  const fromX = (x) => {
    const r = node.getBoundingClientRect();
    commit(min + ((x - r.left) / (r.width || 1)) * span);
  };
  let dragged = false; // the gesture scrubbed, so the click that may follow is not a tap
  const begin = (e) => {
    dragging = dragged = true;
    node.classList.add('dragging');
    try { node.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
  };
  const end = (e) => {
    if (!start || e.pointerId !== start.id) return;
    start = null;
    if (dragging) { dragging = false; node.classList.remove('dragging'); }
    node.classList.remove('pressing');
    send.flush();
    ctx.resync?.(); // apply any rebuild deferred while the finger was down
  };

  // Mouse: press and drag at the pointer, like a desktop slider. Touch: drag moves the value
  // by the finger's travel (a stray swipe nudges rather than jumps), and a tap jumps via
  // `click`, which browsers withhold after pans and after a tap that stops a fling.
  node.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    dragged = false;
    start = { x: e.clientX, y: e.clientY, id: e.pointerId, mouse: e.pointerType === 'mouse', value };
    node.classList.add('pressing');
    if (start.mouse) { begin(e); fromX(e.clientX); }
  });
  node.addEventListener('pointermove', (e) => {
    if (!start || e.pointerId !== start.id) return;
    if (!dragging) {
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      if (Math.abs(dx) < 6 || Math.abs(dx) < Math.abs(dy)) return;
      begin(e);
    }
    if (start.mouse || !Number.isFinite(start.value)) fromX(e.clientX);
    else commit(start.value + ((e.clientX - start.x) / (node.getBoundingClientRect().width || 1)) * span);
  });
  node.addEventListener('pointerup', end);
  node.addEventListener('pointercancel', end);
  node.addEventListener('click', (e) => {
    if (dragged || e.detail === 0) return; // after a scrub, or a synthetic activation with no position
    fromX(e.clientX);
    send.flush();
  });
  node.addEventListener('keydown', (e) => {
    const unit = step || span / 100;
    const big = Math.max(unit, span / 10);
    const base = Number.isFinite(value) ? value : min;
    const target = {
      ArrowRight: base + unit, ArrowUp: base + unit, ArrowLeft: base - unit, ArrowDown: base - unit,
      PageUp: base + big, PageDown: base - big, Home: min, End: max,
    }[e.key];
    if (target == null) return;
    e.preventDefault();
    commit(target);
    send.flush();
  });

  node._cvSet = patcher(() => (start ? 150 : graceLeft(lastLocal)), (next) => {
    const v = Number(next.value);
    if (v !== value && !Number.isNaN(v)) { value = v; render(); }
  });
  render();
  return node;
}

/** Big two-state tile (Simple page). */
function toggleTile(c, ctx) {
  let on = !!c.value;
  let lastLocal = 0;
  const set = setter(c, ctx);
  const node = el('button', { type: 'button', class: 'tbtn', role: 'switch', 'aria-checked': String(on), dataset: meta(c) }, [
    el('span', {}, c.label),
    el('span', { class: 'led', 'aria-hidden': 'true' }),
  ]);
  node.addEventListener('click', () => {
    on = !on;
    lastLocal = now();
    node.setAttribute('aria-checked', String(on));
    set(on);
  });
  node._cvSet = patcher(() => graceLeft(lastLocal), (next) => {
    on = !!next.value;
    node.setAttribute('aria-checked', String(on));
  });
  return node;
}

/** Compact labelled switch row (Advanced page); the whole row is the hit target. */
function switchRow(c, ctx) {
  let lastLocal = 0;
  const set = setter(c, ctx);
  const input = el('input', { type: 'checkbox', checked: !!c.value, 'aria-label': c.label });
  input.addEventListener('change', () => { lastLocal = now(); set(input.checked); });
  const node = el('label', { class: 'cv-row', dataset: meta(c) }, [
    el('span', { class: 'cv-row-label' }, c.label),
    el('span', { class: 'switch' }, [input, el('span', { class: 'track' })]),
  ]);
  node._cvSet = patcher(() => graceLeft(lastLocal), (next) => { input.checked = !!next.value; });
  return node;
}

/** Selects and radio groups: segmented control, chips, or a native picker by option count/length. */
function choice(c, ctx, size) {
  const opts = c.options || [];
  const names = opts.map((o) => String(o.label ?? o.value));
  const total = names.reduce((n, s) => n + s.length, 0);
  const longest = Math.max(0, ...names.map((s) => s.length));
  const set = setter(c, ctx);
  let lastLocal = 0;
  let mode = 'select';
  if (opts.length >= 2 && opts.length <= 4 && longest <= 12 && total <= 28) mode = 'seg';
  else if (size === 'large' && opts.length >= 2 && opts.length <= 8 && longest <= 22 && total <= 90) mode = 'chips';

  const wrap = el('div', { class: 'cv-field', dataset: meta(c) }, el('div', { class: 'pc-label' }, c.label));
  if (mode === 'select') {
    const sel = el('select', { class: 'cv-select', 'aria-label': c.label },
      opts.map((o) => el('option', { value: o.value, selected: String(o.value) === String(c.value) }, o.label)));
    sel.addEventListener('change', () => { lastLocal = now(); set(sel.value); });
    wrap.append(sel);
    wrap._cvSet = patcher(() => (sel === document.activeElement ? 300 : graceLeft(lastLocal)), (next) => {
      sel.value = next.value ?? '';
    });
    return wrap;
  }

  let value = c.value;
  const group = el('div', {
    class: mode === 'seg' ? (size === 'large' ? 'seg' : 'seg compact') : 'chips',
    role: 'radiogroup', 'aria-label': c.label,
  });
  const buttons = opts.map((o, i) => el('button', {
    type: 'button', role: 'radio', title: names[i],
    onclick: () => pick(i),
  }, names[i]));
  const paint = () => {
    const current = opts.findIndex((o) => String(o.value) === String(value));
    buttons.forEach((b, i) => {
      b.setAttribute('aria-checked', String(i === current));
      b.tabIndex = i === (current < 0 ? 0 : current) ? 0 : -1;
    });
  };
  function pick(i) {
    value = opts[i].value;
    lastLocal = now();
    paint();
    set(value);
  }
  group.addEventListener('keydown', (e) => {
    const i = buttons.indexOf(document.activeElement);
    const d = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (i < 0 || !d) return;
    e.preventDefault();
    const j = (i + d + buttons.length) % buttons.length;
    pick(j);
    buttons[j].focus();
  });
  group.append(...buttons);
  wrap.append(group);
  wrap._cvSet = patcher(() => graceLeft(lastLocal), (next) => {
    value = next.value;
    paint();
  });
  paint();
  return wrap;
}

function colorRow(c, ctx, size) {
  let lastLocal = 0;
  const send = throttle(setter(c, ctx), 80);
  const input = el('input', { type: 'color', value: c.value || '#000000', 'aria-label': c.label });
  input.addEventListener('input', () => { lastLocal = now(); send(input.value); });
  input.addEventListener('change', () => send.flush());
  const node = el('label', { class: size === 'large' ? 'cv-color' : 'cv-color compact', dataset: meta(c) }, [el('span', {}, c.label), input]);
  node._cvSet = patcher(() => (input === document.activeElement ? 300 : graceLeft(lastLocal)), (next) => {
    if (next.value) input.value = next.value;
  });
  return node;
}

/** Numbers without a usable range: − value + */
function stepper(c, ctx) {
  const step = Number.isFinite(c.step) && c.step > 0 ? c.step : 1;
  const lo = Number.isFinite(c.min) ? c.min : -Infinity;
  const hi = Number.isFinite(c.max) ? c.max : Infinity;
  const set = setter(c, ctx);
  let lastLocal = 0;
  const input = el('input', { type: 'number', inputmode: 'decimal', value: c.value ?? '', 'aria-label': c.label, step: c.step ?? 'any' });
  const push = (v) => { lastLocal = now(); input.value = v; set(v); };
  const bump = (d) => push(quantize((Number(input.value) || 0) + d * step, lo, hi, Number.isFinite(c.step) ? c.step : null));
  input.addEventListener('change', () => { if (input.value !== '') push(quantize(Number(input.value), lo, hi, Number.isFinite(c.step) && c.step > 0 ? c.step : null)); });
  const node = el('div', { class: 'cv-field', dataset: meta(c) }, [
    el('div', { class: 'pc-label' }, c.label),
    el('div', { class: 'stepper' }, [
      el('button', { type: 'button', class: 'icon-btn', 'aria-label': `Decrease ${c.label}`, onclick: () => bump(-1) }, '−'),
      input,
      el('button', { type: 'button', class: 'icon-btn', 'aria-label': `Increase ${c.label}`, onclick: () => bump(1) }, '+'),
    ]),
  ]);
  node._cvSet = patcher(() => (input === document.activeElement ? 300 : graceLeft(lastLocal)), (next) => {
    input.value = next.value ?? '';
  });
  return node;
}

/** Text inputs; read-only ones (status mirrors, readouts) stay read-only textboxes styled as readouts. */
function textField(c, ctx) {
  const input = el('input', {
    type: 'text', value: c.value ?? '', 'aria-label': c.label, spellcheck: 'false', autocomplete: 'off',
    readonly: !!c.readOnly, class: c.readOnly ? 'cv-readout' : null,
  });
  if (!c.readOnly) input.addEventListener('change', () => ctx.dispatch(CMD.SET_CONTROL, { selector: c.selector, kind: c.kind, value: input.value }));
  const node = el('div', { class: 'cv-field', dataset: meta(c) }, [el('div', { class: 'pc-label' }, c.label), input]);
  node._cvSet = patcher(() => (!c.readOnly && input === document.activeElement ? 300 : 0), (next) => { input.value = next.value ?? ''; });
  return node;
}

function buttonTile(c, ctx) {
  return el('button', {
    type: 'button', class: 'tile', dataset: meta(c),
    onclick: () => ctx.dispatch(CMD.INVOKE, { selector: c.selector }),
  }, c.label || 'Button');
}

function buttonSmall(c, ctx) {
  return el('button', {
    type: 'button', class: 'btn', title: c.label, dataset: meta(c),
    onclick: () => ctx.dispatch(CMD.INVOKE, { selector: c.selector }),
  }, c.label || 'Button');
}

function keyTile(k, ctx) {
  const name = keyLabel(k.key);
  return el('button', {
    type: 'button', class: 'tile key', title: `Press ${name}`,
    'aria-label': k.label ? `${k.label} (${name})` : `Press ${name}`,
    dataset: { search: `${k.label} ${name}`.toLowerCase() },
    onclick: () => ctx.dispatch(CMD.KEY, { key: k.key }),
  }, [el('kbd', { 'aria-hidden': 'true' }, name), k.label ? el('span', {}, k.label) : null]);
}

// ── helpers ──────────────────────────────────────────────────────────────────
function empty(title, text) {
  return el('div', { class: 'cv-empty' }, [el('strong', {}, title), text]);
}

/** Two-up grids: a lone last tile spans the full row instead of leaving a hole. */
function balance(grid) {
  const tiles = [...grid.children];
  tiles.forEach((t) => { t.style.gridColumn = ''; });
  if (tiles.length % 2) tiles[tiles.length - 1].style.gridColumn = '1 / -1';
}

function uniqueBy(list, key) {
  const seen = new Set();
  return list.filter((x) => !seen.has(key(x)) && seen.add(key(x)));
}

function decimals(n) {
  if (!Number.isFinite(n)) return 0;
  const s = String(n);
  if (s.includes('e-')) return Number(s.split('e-')[1]);
  const i = s.indexOf('.');
  return i < 0 ? 0 : s.length - i - 1;
}

/** Clamp and snap to the control's step grid (anchored at min), without float fuzz. */
function quantize(raw, min, max, step) {
  const v = Math.max(min, Math.min(max, raw));
  if (!step) return v;
  const base = Number.isFinite(min) ? min : 0;
  let n = Math.round((v - base) / step);
  if (Number.isFinite(max)) n = Math.min(n, Math.floor((max - base) / step + 1e-9));
  return Number((base + n * step).toFixed(Math.min(10, Math.max(decimals(step), decimals(base)))));
}

function formatNumber(v, step, span) {
  const d = step ? decimals(step) : Math.max(0, 2 - Math.floor(Math.log10(span || 1)));
  return v.toFixed(Math.min(4, d));
}

/** Leading + trailing throttle; `flush()` sends any pending value now. */
function throttle(fn, ms) {
  let last = 0;
  let timer = 0;
  let pending;
  let has = false;
  const run = () => {
    clearTimeout(timer);
    timer = 0;
    if (!has) return;
    has = false;
    last = now();
    fn(pending);
  };
  const t = (v) => {
    pending = v;
    has = true;
    const wait = ms - (now() - last);
    if (wait <= 0) run();
    else if (!timer) timer = setTimeout(run, wait);
  };
  t.flush = run;
  return t;
}
