// Path Trace: hand the current picture to Steve Trettel's PathTracerGLSL, running locally.
//
// The tracer is a separate checkout (private/gitClones/PathTracerGLSL, started with `npm run dev`
// on port 3000). Its dev server accepts posted files at /__import/ (see its vite.config.ts) and
// its studio page renders them: /studio.html?scene=<scene>&file=<file>. An app builds the files for its
// picture and calls pathTrace(); the studio opens in a new tab and starts accumulating at once.
//
// The tracer is not part of this site, so the button only makes sense on a page served from this
// machine: isLocalPage() says whether to show it.

export const TRACER = 'http://localhost:3000';

const LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])$/;
export const isLocalPage = () => LOCAL.test(location.hostname);

const NOT_RUNNING = 'The path tracer is not running. Start it with `npm run dev` in private/gitClones/PathTracerGLSL (port 3000), then press Path Trace again.';

/** Whether the tracer answers at `tracer` (within a second and a half). */
export async function tracerIsUp(tracer = TRACER) {
    try {
        const r = await fetch(`${tracer}/__import/ping`, { signal: AbortSignal.timeout(1500) });
        return r.ok && (await r.json()).tracer === 'PathTracerGLSL';
    } catch (e) {
        return false;
    }
}

/** Post files to the tracer: each is [file name, body, MIME type]. A name ending .inst or .json
 *  lands in its test-data/, .png in its renders/. */
export async function postFiles(files, tracer = TRACER) {
    for (const [name, body, type] of files) {
        const res = await fetch(`${tracer}/__import/${name}`, { method: 'POST', headers: { 'Content-Type': type }, body });
        if (!res.ok) throw new Error(`Path Trace: posting ${name} failed (${res.status}: ${await res.text()})`);
    }
}

/** Post `files` and open the tracer's studio on `scene` reading `file`. Call it straight from a
 *  click: the tab is opened before anything is awaited, so a popup blocker allows it, and it is
 *  closed again if the tracer is down or a post fails. Returns the studio's URL and whether its tab
 *  opened (false when the browser blocked it). */
export async function pathTrace({ scene, file, files, tracer = TRACER }) {
    const tab = window.open('about:blank', '_blank');
    if (tab) tab.opener = null;
    try {
        if (!(await tracerIsUp(tracer))) throw new Error(NOT_RUNNING);
        await postFiles(files, tracer);
        const url = `${tracer}/studio.html?scene=${encodeURIComponent(scene)}&file=${encodeURIComponent(file)}`;
        if (tab) tab.location.href = url;
        return { url, opened: !!tab };
    } catch (e) {
        tab?.close();
        throw e;
    }
}

/** Make `btn` a Path Trace button. `prepare()` returns { scene, file, files, summary } for the
 *  current picture (or throws with a message for the user); `report(kind, text)` shows a result,
 *  kind 'ok' or 'error'; `after()` runs once a press is over (to re-sync the button's state).
 *  When the browser blocks the new tab, the button becomes "Open the path tracer ↗" and its next
 *  press opens the studio directly, as a fresh click the blocker allows. */
export function wirePathTrace(btn, { prepare, report = () => {}, after = () => {}, transport = pathTrace }) {
    const label = btn.textContent;
    let blocked = null;
    btn.addEventListener('click', async () => {
        if (blocked) {
            window.open(blocked, '_blank', 'noopener');
            blocked = null;
            btn.textContent = label;
            return;
        }
        btn.disabled = true;
        btn.textContent = 'Sending…';
        try {
            const job = prepare();
            const { url, opened } = await transport(job);
            if (opened) {
                btn.textContent = 'Opened ✓';
                setTimeout(() => { if (!blocked) btn.textContent = label; }, 1800);
                report('ok', job.summary);
            } else {
                blocked = url;
                btn.textContent = 'Open the path tracer ↗';
                report('ok', `${job.summary} The browser blocked the new tab, so press the button again to open it.`);
            }
        } catch (e) {
            btn.textContent = label;
            report('error', e.message);
        } finally {
            btn.disabled = false;
            after();
        }
    });
}

// ---------- Advanced options ----------
// A fold under the Path Trace button whose settings ride along as `options` in the posted JSON;
// the tracer's demos/posted.ts (PostedOptions) says what each one does there. It is built from
// the controls both apps already style (cayley-selector rows, select-input, number-input,
// opacity-slider), and it remembers its settings per app in localStorage.

// The tracer's lightings (LIGHTING in its demos/posted.ts), by id; the studio's Scene tab switches them live.
// 'auto' lets the scene pick what suits the look (Glow for poincare's Mirror, Studio otherwise).
const LIGHTINGS = [['auto', 'Auto (suits the look)'], ['studio', 'Studio'], ['softbox', 'Softbox'], ['threePoint', 'Three-point'],
    ['sunset', 'Sunset'], ['night', 'Night'], ['glow', 'Glow'], ['overcast', 'Overcast'], ['autumn', 'Autumn field (HDR)'],
    ['mountain', 'Mountain sky (HDR)']];
// Stored options before this version saved the then-default 'studio' whether or not it was chosen.
const OPTIONS_VERSION = 2;
const FLOORS = [['plain', 'Plain'], ['checker', 'Checker'], ['none', 'None']];
const SURFACES = [['app', 'App colors'], ['formula', 'Formula']];
// Without a look (the material is chosen in the tracer) the surface options always show.
const painted = (look) => !look || look === 'matte' || look === 'metal';

const OPTIONS_CSS = `
.pt-options { margin-top: 2px; }
.pt-options > summary { cursor: pointer; list-style: none; user-select: none; padding: 6px 2px; }
.pt-options > summary::-webkit-details-marker { display: none; }
.pt-options > summary::before { content: '▸'; display: inline-block; width: 1.2em; transition: transform 0.15s; }
.pt-options[open] > summary::before { transform: rotate(90deg); }
.pt-options-body { display: flex; flex-direction: column; gap: 8px; padding: 4px 0 2px; }
.pt-options [hidden] { display: none !important; }
.pt-options input.number-input {
    background: var(--field-bg); border: 1px solid var(--hairline); border-radius: var(--r-sm);
    color: var(--ink); padding: 7px 10px; font: 13px var(--font); font-variant-numeric: tabular-nums;
}
.pt-options .pt-row .cayley-label { flex: 0 0 5.6em; }
.pt-options .pt-row > select, .pt-options .pt-row > input { flex: 1; min-width: 0; width: auto; }
.pt-options .pt-out { flex: 0 0 2.6em; text-align: right; font-size: 12px; font-variant-numeric: tabular-nums; opacity: 0.8; }
.pt-options .pt-hint { margin: -2px 0 0; }
.pt-options .pt-reset { align-self: flex-end; }
`;

/** Mount the Advanced options fold after `anchor`. `looks` lists [value, label] pairs, the first
 *  being 'auto' (what the app shows, `autoLook()`), or is null when the tracer's studio picks the
 *  material (then there is no Look or Roughness field and values() has no look); `extra` adds app-only fields of the same
 *  shape as the ones below; `formulaHint` explains what a surface formula may read. Returns
 *  { values() } with numbers as numbers, the look resolved, and blank fields left out. */
export function mountPathTraceOptions(anchor, { app, looks, autoLook = () => 'matte', formulaHint = '', extra = [], downloadHint = false }) {
    if (!document.getElementById('pt-options-css')) {
        const css = document.createElement('style');
        css.id = 'pt-options-css';
        css.textContent = OPTIONS_CSS;
        document.head.appendChild(css);
    }
    const look = (v) => (!looks ? undefined : v.look === 'auto' ? autoLook() : v.look);
    const fields = [
        ...(looks ? [
            { id: 'look', label: 'Look', kind: 'select', choices: looks, value: 'auto' },
            { id: 'roughness', label: 'Roughness', kind: 'range', min: 0.02, max: 1, step: 0.01, value: 0.28, show: (v) => look(v) === 'metal' },
        ] : []),
        { id: 'surface', label: 'Surface', kind: 'select', choices: SURFACES, value: 'app', show: (v) => painted(look(v)) },
        {
            id: 'formula', label: 'Formula', kind: 'text', value: '', placeholder: '0.5 + 0.5*cos(6.28*(3.0*p.y + vec3(0.0, 0.33, 0.67)))',
            hint: `A color as GLSL: an expression for a vec3 in the point p${formulaHint}. Numbers need a decimal point (3.0, not 3).`,
            show: (v) => painted(look(v)) && v.surface === 'formula',
        },
        { id: 'floor', label: 'Floor', kind: 'select', choices: FLOORS, value: 'plain' },
        { id: 'lighting', label: 'Lighting', kind: 'select', choices: LIGHTINGS, value: 'auto' },
        { id: 'skyBrightness', label: 'Sky light', kind: 'range', min: 0, max: 3, step: 0.05, value: 1 },
        { id: 'keyLight', label: 'Lamps', kind: 'range', min: 0, max: 3, step: 0.05, value: 1 },
        { id: 'bounces', label: 'Bounces', kind: 'number', min: 1, max: 128, step: 1, value: '', placeholder: 'auto' },
        {
            id: 'samples', label: 'Samples', kind: 'number', min: 0, step: 64, value: 0,
            hint: downloadHint ? '0 keeps rendering live in the studio. A number renders that many samples, then downloads a PNG.' : '0 keeps rendering live in the studio. A number renders that many samples, then saves a PNG to the tracer\'s renders/ folder.',
        },
        { id: 'width', label: 'Width', kind: 'number', min: 64, max: 8192, step: 1, value: 1600, show: (v) => v.samples > 0 },
        { id: 'height', label: 'Height', kind: 'number', min: 64, max: 8192, step: 1, value: 1200, show: (v) => v.samples > 0 },
        ...extra,
    ];
    const key = `pathTrace-options-${app}`, defaults = Object.fromEntries(fields.map((f) => [f.id, f.value]));
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(key) || '{}'); } catch (e) { /* storage blocked */ }
    const v = { ...defaults };
    if (saved.sky && !saved.lighting) saved.lighting = saved.sky;          // the older Sky choice
    if ((saved._v ?? 1) < OPTIONS_VERSION && saved.lighting === 'studio') saved.lighting = 'auto';
    for (const f of fields) if (f.id in saved) v[f.id] = saved[f.id];
    for (const f of fields) if (f.kind === 'select' && !f.choices.some(([x]) => x === v[f.id])) v[f.id] = f.value;
    if (looks && !looks.some(([x]) => x === v.look)) v.look = 'auto';

    const box = document.createElement('details');
    box.className = 'pt-options';
    box.innerHTML = '<summary class="cayley-label">Advanced options</summary><div class="pt-options-body"></div>';
    const body = box.querySelector('.pt-options-body'), rows = [];
    const num = (x) => (x === '' || x == null ? '' : Number(x));
    for (const f of fields) {
        const id = `pt-${app}-${f.id}`, row = document.createElement('div');
        row.className = 'cayley-selector pt-row';
        row.innerHTML = `<label class="cayley-label" for="${id}">${f.label}</label>`;
        let input, out = null;
        if (f.kind === 'select') {
            input = document.createElement('select');
            input.className = 'select-input';
            for (const [val, label] of f.choices) input.add(new Option(label, val));
        } else {
            input = document.createElement('input');
            input.type = f.kind === 'range' ? 'range' : f.kind === 'number' ? 'number' : 'text';
            input.className = f.kind === 'range' ? 'opacity-slider' : 'number-input';
            for (const a of ['min', 'max', 'step', 'placeholder']) if (f[a] !== undefined) input[a] = f[a];
            if (f.kind === 'text') input.spellcheck = false;
        }
        input.id = id;
        input.value = v[f.id];
        row.appendChild(input);
        if (f.kind === 'range') {
            out = document.createElement('output');
            out.className = 'pt-out';
            row.appendChild(out);
        }
        body.appendChild(row);
        let hint = null;
        if (f.hint) {
            hint = document.createElement('p');
            hint.className = 'label-hint pt-hint';
            hint.textContent = f.hint;
            body.appendChild(hint);
        }
        rows.push({ f, row, hint, input, out });
    }
    const reset = document.createElement('button');
    reset.type = 'button';
    reset.className = 'cayley-opt pt-reset';
    reset.textContent = 'Reset';
    body.appendChild(reset);

    const sync = () => {
        for (const { f, row, hint, input, out } of rows) {
            const on = !f.show || f.show(v);
            row.hidden = !on;
            if (hint) hint.hidden = !on;
            if (out) out.textContent = Number(input.value).toFixed(2);
        }
        try { localStorage.setItem(key, JSON.stringify({ ...v, _v: OPTIONS_VERSION })); } catch (e) { /* storage blocked */ }
    };
    for (const { f, input } of rows) {
        input.addEventListener(f.kind === 'select' ? 'change' : 'input', () => {
            v[f.id] = f.kind === 'number' || f.kind === 'range' ? num(input.value) : input.value;
            sync();
        });
    }
    reset.addEventListener('click', () => {
        Object.assign(v, defaults);
        for (const { f, input } of rows) input.value = v[f.id];
        sync();
    });
    sync();
    anchor.insertAdjacentElement('afterend', box);

    return {
        values() {
            const out = {};
            for (const f of fields) if (v[f.id] !== '' && v[f.id] != null) out[f.id] = v[f.id];
            if (looks) out.look = look(v);
            return out;
        },
        /** Set some fields (by id; others keep their values), as a preset does. */
        set(values) {
            for (const { f, input } of rows) {
                if (!(f.id in values)) continue;
                v[f.id] = values[f.id];
                input.value = v[f.id];
            }
            sync();
        },
    };
}

const NAME_BYTES = 32;

/** A cloud of spheres in Trettel's `.inst` format (tools/inst-format.mjs in the tracer is the
 *  reference). All numbers are little-endian. The header holds the magic 'INST', version 1, the
 *  count N, flags (1 = sizes, 2 = colors), the AABB of the positions, the names of the scalar
 *  columns (32 bytes each) and a provenance string padded to 4 bytes. Then come the float
 *  blocks: positions (3N), sizes (N), colors (3N, linear RGB), and one block of N per scalar
 *  column. Returns an ArrayBuffer. */
export function encodeInst({ positions, sizes, colors, scalars = {}, provenance = '' }) {
    const n = positions.length / 3, names = Object.keys(scalars), enc = new TextEncoder();
    const prov = enc.encode(provenance), provPad = (prov.length + 3) & ~3;
    const head = 44 + names.length * NAME_BYTES + 4 + provPad;
    const floats = 3 * n + (sizes ? n : 0) + (colors ? 3 * n : 0) + names.length * n;
    const buf = new ArrayBuffer(head + 4 * floats), dv = new DataView(buf), bytes = new Uint8Array(buf);
    dv.setUint32(0, 0x54534e49, true);
    dv.setUint32(4, 1, true);
    dv.setUint32(8, n, true);
    dv.setUint32(12, (sizes ? 1 : 0) | (colors ? 2 : 0), true);
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < 3 * n; i++) {
        const a = i % 3, v = positions[i];
        if (!Number.isFinite(v)) throw new Error(`encodeInst: position ${i / 3 | 0} is not finite`);
        if (v < lo[a]) lo[a] = v;
        if (v > hi[a]) hi[a] = v;
    }
    [...lo, ...hi].forEach((v, k) => dv.setFloat32(16 + 4 * k, v, true));
    dv.setUint32(40, names.length, true);
    names.forEach((name, k) => {
        const b = enc.encode(name);
        if (!b.length || b.length >= NAME_BYTES) throw new Error(`encodeInst: bad column name '${name}'`);
        bytes.set(b, 44 + k * NAME_BYTES);
    });
    const po = 44 + names.length * NAME_BYTES;
    dv.setUint32(po, prov.length, true);
    bytes.set(prov, po + 4);
    const out = new Float32Array(buf, head);
    let off = 0;
    for (const block of [positions, sizes, colors, ...names.map((k) => scalars[k])]) {
        if (!block) continue;
        out.set(block, off);
        off += block.length;
    }
    return buf;
}

/** An sRGB-encoded color channel (0–1) as linear light. */
export const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));

export async function pathTraceStored({ scene, files }) {
    const tab = window.open('about:blank', '_blank');
    if (tab) tab.opener = null;
    try {
        const id = crypto.randomUUID();
        const db = await new Promise((resolve, reject) => {
            const req = indexedDB.open('2dimFields-path-trace', 1);
            req.onupgradeneeded = () => req.result.createObjectStore('scenes');
            req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);
        });
        try { await new Promise((resolve, reject) => {
            const tx = db.transaction('scenes', 'readwrite');
            const store = tx.objectStore('scenes');
            const cursor = store.openCursor();
            cursor.onsuccess = () => { const c = cursor.result; if (c) { if (c.value.created < Date.now() - 7 * 86400000) c.delete(); c.continue(); } };
            store.put({ created: Date.now(), files: Object.fromEntries(files.map(([name, body]) => [name.split('.').pop(), body])) }, id);
            tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
        }); } finally { db.close(); }
        const url = new URL('../path-tracer/studio.html', import.meta.url);
        url.search = new URLSearchParams({ scene, stored: id }).toString();
        if (tab) tab.location.href = url.href;
        return { url: url.href, opened: !!tab };
    } catch (e) { tab?.close(); throw new Error(`Could not save the scene in browser storage: ${e.message}`); }
}
