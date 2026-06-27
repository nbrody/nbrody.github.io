// controlsView.js — render an introspected control schema into widgets.
//
// Used by BOTH the on-stage overlay remote and the separate-window remote, so
// the two control surfaces look and behave identically. `dispatch(type,
// payload)` is the only outward dependency: on the stage it calls the
// controller directly; on the remote it sends over the transport.

import { CMD } from './protocol.js';
import { el, clear, keyLabel } from './util.js';

/** Render the full control surface (form controls + key buttons) for a viz. */
export function renderControls(container, schema, dispatch) {
  clear(container);
  if (!schema || !schema.ok) {
    container.append(el('div', { class: 'cv-empty' }, 'No live controls detected for this visualization.'));
    return;
  }
  const { controls = [], keys = [] } = schema;

  const buttons = controls.filter((c) => c.kind === 'button');
  const fields = controls.filter((c) => c.kind !== 'button');

  if (fields.length) {
    const grid = el('div', { class: 'cv-fields' });
    for (const c of fields) grid.append(fieldWidget(c, dispatch));
    container.append(grid);
  }

  if (buttons.length) {
    container.append(sectionLabel('Actions'));
    const row = el('div', { class: 'cv-buttons' });
    for (const c of buttons) {
      row.append(el('button', { class: 'btn', title: c.label, onclick: () => dispatch(CMD.INVOKE, { selector: c.selector }) }, c.label || 'Button'));
    }
    container.append(row);
  }

  if (keys.length) {
    container.append(sectionLabel('Keyboard'));
    const row = el('div', { class: 'cv-keys' });
    for (const k of keys) {
      // <kbd> hints may bundle multiple keys ("H J Space") — split defensively.
      for (const single of String(k).split(/\s+/).filter(Boolean)) {
        const key = single === 'Space' ? ' ' : single;
        row.append(el('button', { class: 'btn key', title: `Press ${single}`, onclick: () => dispatch(CMD.KEY, { key }) }, keyLabel(key)));
      }
    }
    container.append(row);
  }

  if (!fields.length && !buttons.length && !keys.length) {
    container.append(el('div', { class: 'cv-empty' }, 'This visualization exposes no adjustable controls.'));
  }
}

function sectionLabel(text) {
  return el('div', { class: 'cv-section' }, text);
}

function fieldWidget(c, dispatch) {
  const wrap = el('div', { class: 'cv-field' });
  const set = (value) => dispatch(CMD.SET_CONTROL, { selector: c.selector, kind: c.kind, value });

  if (c.kind === 'range' || c.kind === 'number') {
    const badge = el('span', { class: 'cv-badge' }, fmt(c.value));
    wrap.append(el('label', {}, [el('span', { class: 'cv-label' }, c.label), badge]));
    const input = el('input', {
      type: c.kind === 'number' ? 'number' : 'range',
      ...(c.min != null ? { min: c.min } : {}),
      ...(c.max != null ? { max: c.max } : {}),
      ...(c.step != null ? { step: c.step } : {}),
      value: c.value,
    });
    input.addEventListener('input', () => { badge.textContent = fmt(input.value); set(Number(input.value)); });
    wrap.append(input);
  } else if (c.kind === 'checkbox') {
    const input = el('input', { type: 'checkbox', checked: c.value });
    input.addEventListener('change', () => set(input.checked));
    wrap.classList.add('toggle');
    wrap.append(el('span', { class: 'cv-label' }, c.label), el('label', { class: 'switch' }, [input, el('span', { class: 'track' })]));
  } else if (c.kind === 'select' || c.kind === 'radio') {
    wrap.append(el('label', {}, el('span', { class: 'cv-label' }, c.label)));
    const sel = el('select', {}, (c.options || []).map((o) => el('option', { value: o.value, selected: String(o.value) === String(c.value) }, o.label)));
    sel.addEventListener('change', () => set(sel.value));
    wrap.append(sel);
  } else if (c.kind === 'color') {
    wrap.classList.add('toggle');
    const input = el('input', { type: 'color', value: c.value });
    input.addEventListener('input', () => set(input.value));
    wrap.append(el('span', { class: 'cv-label' }, c.label), input);
  } else {
    // text / textarea
    wrap.append(el('label', {}, el('span', { class: 'cv-label' }, c.label)));
    const input = el('input', { type: 'text', value: c.value ?? '' });
    input.addEventListener('change', () => set(input.value));
    wrap.append(input);
  }
  return wrap;
}

function fmt(v) {
  const n = Number(v);
  if (Number.isNaN(n)) return String(v);
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(Math.abs(n) < 1 ? 3 : 2);
}
