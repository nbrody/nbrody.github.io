// introspect.js — drive a visualization without modifying it.
//
// Every tool under docs/graphics/ is served from the same origin as the
// wrapper, so the stage can reach into its iframe's document, enumerate the
// controls the tool already exposes (sliders, toggles, selects, buttons), and
// replay user intent by setting values + dispatching the same DOM events the
// tool's own listeners expect. The remote renders widgets from this schema and
// rounds-trips changes back through the stage. Zero changes to the 18 tools.
//
// Requires same-origin access, which means serving over http(s) (a dev server
// or GitHub Pages) — file:// blocks cross-folder iframe document access.

/** Can we read into this iframe's document? (False if cross-origin / not loaded.) */
export function canIntrospect(iframe) {
  try {
    return !!(iframe && iframe.contentDocument && iframe.contentDocument.body);
  } catch {
    return false;
  }
}

const CONTROL_SELECTOR = 'input, select, button, textarea';
const SKIP_INPUT_TYPES = new Set(['hidden', 'file', 'password', 'submit', 'image']);

/** True if the element is rendered (skip display:none / detached controls). */
function isVisible(node) {
  if (node.type === 'hidden') return false;
  if (node.hidden) return false;
  // offsetParent is null for display:none (and fixed-position, but tool panels
  // aren't fixed children); also accept anything with layout boxes.
  return node.offsetParent !== null || node.getClientRects().length > 0;
}

/** Build a selector that uniquely resolves `node` within `doc`. */
function uniqueSelector(node, doc) {
  if (node.id && doc.querySelectorAll(`#${CSS.escape(node.id)}`).length === 1) {
    return `#${CSS.escape(node.id)}`;
  }
  // Walk up to a stable ancestor (one with an id), building nth-of-type steps.
  const parts = [];
  let cur = node;
  while (cur && cur.nodeType === 1 && cur !== doc.documentElement) {
    if (cur.id) {
      parts.unshift(`#${CSS.escape(cur.id)}`);
      break;
    }
    const tag = cur.tagName.toLowerCase();
    const sibs = cur.parentNode ? Array.from(cur.parentNode.children).filter((c) => c.tagName === cur.tagName) : [cur];
    const idx = sibs.indexOf(cur) + 1;
    parts.unshift(sibs.length > 1 ? `${tag}:nth-of-type(${idx})` : tag);
    cur = cur.parentNode;
  }
  return parts.join(' > ');
}

/** Prettify an id/name into a fallback label ("colorCycleSlider" → "Color Cycle"). */
function prettify(str) {
  return String(str)
    .replace(/[-_]+/g, ' ')
    .replace(/([a-z\d])([A-Z])/g, '$1 $2')
    .replace(/\b(slider|toggle|btn|button|input|select|checkbox)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\w/, (c) => c.toUpperCase());
}

/** Best-effort human label for a control. Strips nested value-badge spans. */
function labelFor(node, doc) {
  // 1. explicit <label for=id>
  let labelEl = node.id ? doc.querySelector(`label[for="${CSS.escape(node.id)}"]`) : null;
  // 2. wrapping/sibling label inside the same control group
  if (!labelEl) {
    const group = node.closest('.control-group, .toggle-row, label, .field, .row, .slider, fieldset');
    if (group) labelEl = group.matches('label') ? group : group.querySelector('label');
  }
  if (labelEl) {
    const clone = labelEl.cloneNode(true);
    clone.querySelectorAll('span, .value-badge, input, select, output').forEach((n) => n.remove());
    const txt = clone.textContent.replace(/\s+/g, ' ').trim();
    if (txt) return txt;
  }
  return (
    node.getAttribute('aria-label') ||
    node.title ||
    node.placeholder ||
    prettify(node.id || node.name || node.value || node.tagName)
  );
}

/** Classify an element into a remote-widget kind, or null to skip it. */
function kindOf(node) {
  const tag = node.tagName.toLowerCase();
  if (tag === 'button') return 'button';
  if (tag === 'select') return 'select';
  if (tag === 'textarea') return 'text';
  if (tag === 'input') {
    const t = (node.type || 'text').toLowerCase();
    if (SKIP_INPUT_TYPES.has(t)) return null;
    if (t === 'range') return 'range';
    if (t === 'checkbox') return 'checkbox';
    if (t === 'radio') return 'radio';
    if (t === 'color') return 'color';
    if (t === 'number') return 'number';
    if (t === 'button' || t === 'reset') return 'button';
    return 'text';
  }
  return null;
}

/**
 * Enumerate the controls a visualization exposes.
 * Returns { controls: [...], keys: [...] } — `keys` are <kbd> hints found in
 * the tool's own instructions overlay.
 */
export function introspectControls(iframe) {
  if (!canIntrospect(iframe)) return { controls: [], keys: [], ok: false };
  const doc = iframe.contentDocument;
  const controls = [];
  const seenRadioGroups = new Set();

  for (const node of doc.querySelectorAll(CONTROL_SELECTOR)) {
    const kind = kindOf(node);
    if (!kind || !isVisible(node)) continue;

    // Collapse radio groups to a single select-like control.
    if (kind === 'radio') {
      if (!node.name || seenRadioGroups.has(node.name)) continue;
      seenRadioGroups.add(node.name);
      const group = Array.from(doc.querySelectorAll(`input[type=radio][name="${CSS.escape(node.name)}"]`));
      controls.push({
        kind: 'radio',
        selector: `input[type=radio][name="${CSS.escape(node.name)}"]`,
        label: prettify(node.name),
        value: group.find((r) => r.checked)?.value ?? null,
        options: group.map((r) => ({ value: r.value, label: labelFor(r, doc) || r.value })),
      });
      continue;
    }

    const c = { kind, selector: uniqueSelector(node, doc), label: labelFor(node, doc) };
    if (kind === 'range' || kind === 'number') {
      c.min = node.min !== '' ? Number(node.min) : null;
      c.max = node.max !== '' ? Number(node.max) : null;
      c.step = node.step !== '' && node.step !== 'any' ? Number(node.step) : null;
      c.value = Number(node.value);
    } else if (kind === 'checkbox') {
      c.value = node.checked;
    } else if (kind === 'select') {
      c.options = Array.from(node.options).map((o) => ({ value: o.value, label: o.textContent.trim() }));
      c.value = node.value;
    } else if (kind === 'button') {
      c.label = (node.textContent || node.value || labelFor(node, doc)).replace(/\s+/g, ' ').trim();
    } else {
      c.value = node.value;
    }
    controls.push(c);
  }

  // Keyboard hints from the tool's own <kbd> tags.
  const keys = [];
  for (const k of doc.querySelectorAll('kbd')) {
    const t = k.textContent.trim();
    if (t && !keys.includes(t)) keys.push(t);
  }

  return { controls, keys, ok: true };
}

/** Resolve a control's live element inside the iframe. */
function resolve(iframe, selector) {
  if (!canIntrospect(iframe)) return null;
  try {
    return iframe.contentDocument.querySelector(selector);
  } catch {
    return null;
  }
}

/** Dispatch input+change (in the iframe's realm so listeners see same-origin events). */
function fireInputChange(iframe, node) {
  const W = iframe.contentWindow;
  node.dispatchEvent(new W.Event('input', { bubbles: true }));
  node.dispatchEvent(new W.Event('change', { bubbles: true }));
}

/** Apply a value to a control and notify the tool. Returns true on success. */
export function applyControl(iframe, { selector, kind, value }) {
  const node = resolve(iframe, selector);
  if (!node) return false;
  if (kind === 'checkbox') {
    node.checked = !!value;
  } else if (kind === 'radio') {
    const W = iframe.contentWindow;
    const target = iframe.contentDocument.querySelector(`${selector}[value="${CSS.escape(String(value))}"]`);
    if (!target) return false;
    target.checked = true;
    target.dispatchEvent(new W.Event('input', { bubbles: true }));
    target.dispatchEvent(new W.Event('change', { bubbles: true }));
    return true;
  } else {
    node.value = value;
  }
  fireInputChange(iframe, node);
  return true;
}

/** Click a button-like control. */
export function invokeControl(iframe, { selector }) {
  const node = resolve(iframe, selector);
  if (!node) return false;
  node.click();
  return true;
}

/** Dispatch a keyboard event into the visualization (keydown + keyup). */
export function sendKey(iframe, { key, code, shift = false, ctrl = false, alt = false, meta = false }) {
  if (!canIntrospect(iframe)) return false;
  const W = iframe.contentWindow;
  const doc = iframe.contentDocument;
  const init = {
    key,
    code: code || (key.length === 1 ? `Key${key.toUpperCase()}` : key),
    bubbles: true,
    cancelable: true,
    shiftKey: shift,
    ctrlKey: ctrl,
    altKey: alt,
    metaKey: meta,
  };
  const target = doc.activeElement && doc.activeElement !== doc.body ? doc.activeElement : doc.body || doc;
  target.dispatchEvent(new W.KeyboardEvent('keydown', init));
  target.dispatchEvent(new W.KeyboardEvent('keyup', init));
  return true;
}

/** Snapshot every control value (for the "save this view as a preset" feature). */
export function captureState(iframe) {
  const { controls } = introspectControls(iframe);
  const state = {};
  for (const c of controls) {
    if (c.kind === 'button') continue;
    state[c.selector] = { kind: c.kind, value: c.value };
  }
  return state;
}

/** Re-apply a snapshot produced by captureState(). */
export function applyState(iframe, state) {
  if (!state) return;
  for (const [selector, { kind, value }] of Object.entries(state)) {
    applyControl(iframe, { selector, kind, value });
  }
}
