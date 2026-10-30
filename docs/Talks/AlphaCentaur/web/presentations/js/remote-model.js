// The phone remote: presets, the control schema, what each slide's remote
// shows, and the parameters applets expose. No DOM, so it also runs in Node.
//
// deck.remote  = { enabled, preset, page, firebase }  (see normalizeRemoteDeck)
// slide.remote = { preset: 'deck' | <preset id>, controls: [...] }  (custom only)
//
// A control is { type, … }. Navigation and information controls need nothing
// else; parameter controls carry a name, which is what the slide's applets and
// embeds receive (see APPLET_API in render.js).

export const REMOTE_PRESETS = [
  { id: 'presenter', name: 'Presenter', desc: 'Timer, speaker notes and what comes next, with Back and Next.',
    controls: [{ type: 'slide' }, { type: 'timer' }, { type: 'notes' }, { type: 'upnext' }, { type: 'nav' }] },
  { id: 'clicker', name: 'Clicker', desc: 'One big Next button and a small Back.',
    controls: [{ type: 'progress' }, { type: 'next' }, { type: 'prev' }] },
  { id: 'buttons', name: 'Buttons', desc: 'Back and Next, the slide number, and a slide list.',
    controls: [{ type: 'progress' }, { type: 'nav' }, { type: 'slides' }] },
  { id: 'joystick', name: 'Joystick', desc: 'A virtual joystick for the slide’s applets, with Back and Next.',
    controls: [{ type: 'joystick', name: 'joystick', label: 'Joystick' }, { type: 'nav' }] },
  { id: 'controls', name: 'Controls', desc: 'Sliders, switches and buttons for every parameter the slide’s applets expose.',
    controls: 'auto' },
  { id: 'custom', name: 'Custom', desc: 'Your own list of controls for this slide.', controls: null },
];
export const presetById = id => REMOTE_PRESETS.find(p => p.id === id);

export const CONTROL_TYPES = {
  nav: { label: 'Back & Next', group: 'Navigation' },
  next: { label: 'Big Next button', group: 'Navigation' },
  prev: { label: 'Back button', group: 'Navigation' },
  slides: { label: 'Slide list', group: 'Navigation' },
  progress: { label: 'Slide number', group: 'Information' },
  slide: { label: 'Current slide', group: 'Information' },
  timer: { label: 'Timer', group: 'Information' },
  notes: { label: 'Speaker notes', group: 'Information' },
  upnext: { label: 'Up next', group: 'Information' },
  text: { label: 'Text', group: 'Information' },
  slider: { label: 'Slider', group: 'Parameters', param: true },
  toggle: { label: 'Switch', group: 'Parameters', param: true },
  button: { label: 'Button', group: 'Parameters', param: true },
  joystick: { label: 'Joystick', group: 'Parameters', param: true },
};
export const isParamControl = c => !!CONTROL_TYPES[c?.type]?.param;

const NAME = /^[A-Za-z_][\w-]{0,39}$/;
const num = (v, d) => (Number.isFinite(+v) && v !== '' && v !== null ? +v : d);
const str = (v, max = 80) => (typeof v === 'string' ? v.slice(0, max) : '');

// One control, checked field by field; anything unusable is dropped.
export function normalizeControl(raw) {
  if (!raw || typeof raw !== 'object' || !CONTROL_TYPES[raw.type]) return null;
  const c = { type: raw.type };
  if (raw.label) c.label = str(raw.label, 60);
  if (c.type === 'text') { c.text = str(raw.text, 400); return c; }
  if (!isParamControl(c)) return c;
  c.name = NAME.test(raw.name || '') ? raw.name : null;
  if (!c.name) return null;
  if (c.type === 'slider') {
    c.min = num(raw.min, 0); c.max = num(raw.max, 1);
    if (c.max <= c.min) c.max = c.min + 1;
    c.step = Math.max(0, num(raw.step, (c.max - c.min) / 100));
    c.value = Math.min(c.max, Math.max(c.min, num(raw.value, c.min)));
  } else if (c.type === 'toggle') c.value = !!raw.value;
  return c;
}
export const normalizeControls = list => (Array.isArray(list) ? list.slice(0, 24).map(normalizeControl).filter(Boolean) : []);

// The deck's remote. The Firebase web config is public by design (it ships
// in every web app); only the fields the Realtime Database needs are kept,
// plus `root`: the database folder that holds the sessions (default
// pz-remote). Another folder lets the remote share a project whose rules
// already open one, e.g. the `sessions` folder of an older remote.
export const DEFAULT_ROOT = 'pz-remote';
export const cleanRoot = r => str(r, 40).trim().replace(/^\/+|\/+$/g, '');
export const validRoot = r => /^[\w-]{1,40}$/.test(r);
export function normalizeFirebase(f) {
  if (!f || typeof f !== 'object') return null;
  const apiKey = str(f.apiKey, 100).trim(), databaseURL = str(f.databaseURL, 200).trim().replace(/\/+$/, ''), projectId = str(f.projectId, 100).trim();
  if (!/^[\w-]{10,}$/.test(apiKey) || !/^https:\/\/[\w.-]+\.(firebaseio\.com|firebasedatabase\.app)$/.test(databaseURL) || !/^[\w-]+$/.test(projectId)) return null;
  const root = cleanRoot(f.root);
  return { apiKey, databaseURL, projectId, ...(validRoot(root) && root !== DEFAULT_ROOT ? { root } : {}) };
}
export const safePage = u => (typeof u === 'string' && /^https?:\/\/[^\s"'<>]+$/.test(u.trim()) ? u.trim() : '');
export function normalizeRemoteDeck(r) {
  r = r && typeof r === 'object' ? r : {};
  return {
    enabled: !!r.enabled,
    preset: presetById(r.preset) && r.preset !== 'custom' ? r.preset : 'presenter',
    page: safePage(r.page),
    firebase: normalizeFirebase(r.firebase),
  };
}
export function normalizeRemoteSlide(r) {
  if (!r || typeof r !== 'object') return undefined;
  const preset = r.preset === 'deck' || presetById(r.preset) ? r.preset : 'deck';
  if (preset === 'deck') return undefined;
  return preset === 'custom' ? { preset, controls: normalizeControls(r.controls) } : { preset };
}

// ---------------------------------------------------------- applet params --
// Applets declare parameters with the pz API:
//   pz.slider('speed', { min: 0, max: 5, step: 0.1, value: 1, label: 'Speed' }, v => …)
//   pz.toggle('trails', { value: true }, on => …)
//   pz.button('reset', { label: 'Start again' }, () => …)
//   pz.joystick('tilt', { label: 'Tilt' }, ({ x, y }) => …)
// They are read from the code without running it.
function literalObject(src) {
  const out = {};
  for (const m of src.matchAll(/([A-Za-z_]\w*)\s*:\s*('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|-?\d*\.?\d+(?:e-?\d+)?|true|false)/g)) {
    const v = m[2];
    out[m[1]] = v === 'true' ? true : v === 'false' ? false : /^['"]/.test(v) ? v.slice(1, -1) : +v;
  }
  return out;
}
export function parseAppletParams(code) {
  const out = [], seen = new Set();
  const re = /\bpz\s*\.\s*(slider|toggle|button|joystick)\s*\(\s*(['"])([A-Za-z_][\w-]{0,39})\2\s*(?:,\s*\{([^{}]*)\})?/g;
  for (const m of String(code || '').matchAll(re)) {
    if (seen.has(m[3])) continue;
    seen.add(m[3]);
    const c = normalizeControl({ ...literalObject(m[4] || ''), type: m[1], name: m[3] });
    if (c) out.push(c);
  }
  return out;
}
export function slideParams(slide) {
  const out = [], seen = new Set();
  for (const el of slide?.elements || []) {
    if (el.type !== 'applet') continue;
    for (const p of parseAppletParams(el.code)) if (!seen.has(p.name)) { seen.add(p.name); out.push(p); }
  }
  return out;
}

// What the phone shows for a slide.
export function slidePreset(deck, slide) {
  const own = slide?.remote?.preset;
  return own && own !== 'deck' ? own : normalizeRemoteDeck(deck?.remote).preset;
}
export function resolveRemote(deck, slide) {
  const id = slidePreset(deck, slide), p = presetById(id) || presetById('presenter');
  if (id === 'custom') return normalizeControls(slide?.remote?.controls);
  if (p.controls === 'auto') {
    const params = slideParams(slide);
    return params.length ? [{ type: 'progress' }, ...params, { type: 'nav' }] : [{ type: 'text', text: 'No applet on this slide exposes parameters.' }, { type: 'nav' }];
  }
  return p.controls.map(c => ({ ...c }));
}

// Recommended Realtime Database rules: any client may use a session it knows
// the (random, 12-character) name of, and nothing else.
export const REMOTE_RULES = `{
  "rules": {
    "pz-remote": {
      "$session": {
        ".read": true,
        ".write": true,
        ".validate": "$session.length >= 12"
      }
    }
  }
}`;

// Firebase's console shows the web config as JavaScript; accept that or JSON.
export function parseFirebaseConfig(text) {
  const src = String(text || '');
  const pick = k => (new RegExp(`["']?${k}["']?\\s*:\\s*["']([^"']+)["']`).exec(src) || [])[1];
  return normalizeFirebase({ apiKey: pick('apiKey'), databaseURL: pick('databaseURL'), projectId: pick('projectId'), root: pick('root') });
}
