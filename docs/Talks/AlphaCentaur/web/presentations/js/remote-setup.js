// Phone remote — connecting decks to Firebase. A walkthrough for first-time
// setup, where the setup is kept, the connection test, and the single-file
// phone page to put on a web host.
//
// Setup = { firebase: { apiKey, databaseURL, projectId }, page }.
// - Inside alphaCentaur there is one setup for the whole workspace, kept in
//   its settings (GET/PUT /api/phone-remote, through the host bridge). Decks
//   don't store it; it is written into the exported file when presenting,
//   saving or downloading.
// - Standalone, the browser remembers the last setup (localStorage) for new
//   decks, and each deck keeps its own copy in deck.remote, so its exported
//   file works anywhere.

import { REMOTE_RULES, parseFirebaseConfig, normalizeFirebase, normalizeRemoteDeck, safePage } from './remote-model.js';
import { HOST, onHost, toHost } from './host.js';
import { app } from './state.js';
import { h, icon, button, modal, toast } from './ui.js';

const KEY = 'pz-remote-setup';
const CONSOLE = 'https://console.firebase.google.com/';
export const WORKSPACE = HOST;     // the setup belongs to alphaCentaur, not to the deck

let workspace = { firebase: null, page: '' };
if (HOST) {
  onHost('pz-remote-setup', d => {
    if (d.error) toast(d.error, 'error');
    if (d.setup) workspace = { firebase: normalizeFirebase(d.setup.firebase), page: safePage(d.setup.page) };
    if (app.deck) app.refresh(['inspector']);
  });
}
export const workspaceSetup = () => workspace;

// The setup to offer: the workspace's, or the one this browser remembers.
export function savedSetup() {
  if (HOST) return workspace.firebase ? { ...workspace } : null;
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null');
    const firebase = normalizeFirebase(s?.firebase);
    return firebase ? { firebase, page: safePage(s.page) } : null;
  } catch { return null; }
}
// Save a setup, or part of one ({ page } alone keeps the Firebase config).
export function saveSetup(part) {
  if (HOST) {
    workspace = { ...workspace, ...part };
    toHost('pz-remote-setup-save', { body: part });
    return;
  }
  const prev = savedSetup() || {};
  try { localStorage.setItem(KEY, JSON.stringify({ firebase: part.firebase ?? prev.firebase ?? null, page: part.page ?? prev.page ?? '' })); } catch {}
}
// What a deck's exported file uses: the workspace setup inside alphaCentaur
// (falling back to a copy the deck brought with it), else the deck's own.
export function effectiveSetup(deck) {
  const r = normalizeRemoteDeck(deck?.remote);
  if (HOST && workspace.firebase) return { firebase: workspace.firebase, page: workspace.page || r.page, source: 'workspace' };
  if (HOST && workspace.page && !r.page) return { firebase: r.firebase, page: workspace.page, source: r.firebase ? 'deck' : null };
  return { firebase: r.firebase, page: r.page, source: r.firebase ? 'deck' : null };
}

// A write, read-back and delete in the database, with the likely fixes.
export async function testConnection(firebase) {
  const link = self.PZRemoteLink;
  if (!link) throw new Error('The remote scripts did not load.');
  const t0 = performance.now();
  let timer;
  try {
    await Promise.race([
      link.test(firebase),
      new Promise((_, rej) => { timer = setTimeout(() => rej(new Error('timeout')), 9000); }),
    ]);
  } catch (e) {
    const m = String(e?.code || e?.message || e);
    if (/permission/i.test(m)) throw new Error('The database refused the test write. Publish the rules from step 3, then test again.');
    if (/timeout/.test(m)) throw new Error('No answer from the database. Check the database address, and that this computer is online.');
    if (/load Firebase/.test(m)) throw new Error('Could not load the Firebase library — is this computer online?');
    throw new Error(m);
  } finally { clearTimeout(timer); }
  return Math.round(performance.now() - t0);
}

// ------------------------------------------------------------ phone page --
// remote.html with its three scripts inlined: one file, any static host.
export async function phonePageHTML() {
  const get = async p => { const r = await fetch(new URL(p, import.meta.url)); if (!r.ok) throw new Error(`Could not read ${p}`); return r.text(); };
  const [tpl, link, ui, page] = await Promise.all(['../remote.html', './remote-link.js', './remote-ui.js', './remote-page.js'].map(get));
  const src = { 'remote-link': link, 'remote-ui': ui, 'remote-page': page };
  return tpl.replace(/<script src="js\/(remote-[\w-]+)\.js"><\/script>/g, (m, name) => `<script>\n${src[name].replace(/<\/script/gi, '<\\/script')}\n</script>`);
}
export async function downloadPhonePage() {
  try {
    const html = await phonePageHTML();
    const a = h('a', { href: URL.createObjectURL(new Blob([html], { type: 'text/html' })), download: 'remote.html' });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  } catch (e) { toast(e.message, 'error'); }
}

// ------------------------------------------------------------ walkthrough --
const mask = k => (k.length > 12 ? k.slice(0, 6) + '…' + k.slice(-4) : k);
function copyBlock(text) {
  const pre = h('pre.setup-code', null, text);
  const b = button('Copy', 'copy', async () => {
    try { await navigator.clipboard.writeText(text); toast('Copied'); } catch { getSelection().selectAllChildren(pre); toast('Selected — press ⌘C to copy'); }
  }, { showLabel: true, cls: 'ghost sm setup-copy' });
  return h('div.setup-code-wrap', null, pre, b);
}
const ext = (href, label) => h('a.setup-link', { href, target: '_blank', rel: 'noopener noreferrer' }, label, icon('window', 13));
const steps = (...items) => h('ol.setup-steps', null, items.map(x => h('li', null, x)));

// onDone(setup) is called with the tested setup when the user finishes.
export function openSetupWizard({ initial, onDone } = {}) {
  const st = {
    step: 0,
    firebase: normalizeFirebase(initial?.firebase) || null,
    pasted: '',
    dbURL: initial?.firebase?.databaseURL || '',
    page: initial?.page || '',
    tested: null, testing: false, error: '',
  };
  const bodyEl = h('div.setup-body'), dots = h('div.setup-dots'), nav = h('div.setup-nav');
  const wrap = h('div.setup', null, dots, bodyEl, nav);
  const m = modal('Set up the phone remote', wrap, {});
  m.el.querySelector('.modal')?.classList.add('setup-modal');

  const TITLES = ['How it works', 'Create a Firebase project', 'Add a Realtime Database', 'Connect this editor', 'The phone page', 'Test the connection'];
  const SHORT = ['Overview', 'Project', 'Database', 'Connect', 'Phone page', 'Test'];
  const canNext = () => (st.step === 3 ? !!st.firebase : true);
  const go = d => { st.step = Math.max(0, Math.min(TITLES.length - 1, st.step + d)); draw(); };

  function parse() {
    st.tested = null;
    if (!st.pasted.trim()) { st.firebase = normalizeFirebase(initial?.firebase) || null; return; }
    // A config copied before the database existed has no databaseURL: take
    // the address from its own field.
    const db = st.dbURL.trim().replace(/["'\s]/g, '');
    st.firebase = parseFirebaseConfig(st.pasted) || (db ? parseFirebaseConfig(`${st.pasted}\ndatabaseURL: "${db}"`) : null);
  }

  function stepBody() {
    switch (st.step) {
      case 0: return [
        h('p', null, 'While you present, your phone shows the controls for each slide — Next and Back, your notes and a timer, or sliders and a joystick for the applets on the slide.'),
        h('div.setup-diagram', null,
          h('div', null, icon('play', 20), h('b', null, 'This computer'), h('span', null, 'the presentation')),
          h('i', null, '⇄'),
          h('div', null, icon('globe', 20), h('b', null, 'Firebase'), h('span', null, 'a free Realtime Database')),
          h('i', null, '⇄'),
          h('div', null, icon('hand', 20), h('b', null, 'Your phone'), h('span', null, 'scans a QR code'))),
        h('p', null, 'The phone and the computer don’t need to share a network: both talk to a small database in your own Firebase project. Setting it up takes about five minutes with a Google account and costs nothing (the free Spark plan is plenty).'),
        h('p.hint', null, 'While a talk runs, the database holds the slide titles, the speaker notes and the current slide for that session, under a random 12-letter name. The presentation deletes them when it closes.'),
        h('p.hint', null, 'Just want to try it? Turn the remote on, Present, press R and open the remote in a window on this computer — no setup needed.'),
      ];
      case 1: return [
        steps(
          ['Open the ', ext(CONSOLE, 'Firebase console'), ' and sign in with a Google account.'],
          ['Click ', h('b', null, 'Create a project'), ' (or ', h('b', null, 'Add project'), '). Any name works — say “slides-remote”.'],
          ['Google Analytics isn’t needed; you can switch it off. Click ', h('b', null, 'Create project'), ' and wait for it to finish.']),
        h('p.hint', null, WORKSPACE ? 'One Firebase project serves every deck in alphaCentaur.' : 'One project serves all your decks.'),
      ];
      case 2: return [
        steps(
          ['In the project, open ', h('b', null, 'Build → Realtime Database'), ' and click ', h('b', null, 'Create Database'), '.'],
          ['Choose the location nearest you, then ', h('b', null, 'Start in locked mode'), ' and ', h('b', null, 'Enable'), '.'],
          ['Open the ', h('b', null, 'Rules'), ' tab, replace what is there with these rules, and click ', h('b', null, 'Publish'), ':']),
        copyBlock(REMOTE_RULES),
        h('p.hint', null, 'They let a phone and a presentation use a session only if they know its random 12-letter name, and nothing else in the database is readable or writable.'),
      ];
      case 3: {
        const ta = h('textarea.code.setup-paste', { rows: 9, spellcheck: false, placeholder: 'const firebaseConfig = {\n  apiKey: "…",\n  authDomain: "…",\n  databaseURL: "https://…firebaseio.com",\n  projectId: "…",\n  …\n};' });
        ta.value = st.pasted;
        const res = h('div.setup-parsed');
        const db = h('input.text-input', { type: 'url', placeholder: 'https://your-project-default-rtdb.firebaseio.com', value: st.dbURL });
        const dbField = h('label.field.setup-db', null, h('span.field-label', null, 'Database address (shown at the top of the Realtime Database page)'), db);
        const show = () => {
          res.replaceChildren();
          const fb = st.firebase;
          const missingDB = st.pasted && !fb && /apiKey/.test(st.pasted) && !/databaseURL/.test(st.pasted);
          dbField.hidden = !missingDB && !(st.dbURL && !/databaseURL/.test(st.pasted));
          if (fb) res.append(h('ul.setup-ok', null,
            h('li', null, icon('check', 15), 'Project ', h('b', null, fb.projectId)),
            h('li', null, icon('check', 15), 'Database ', h('code', null, fb.databaseURL)),
            h('li', null, icon('check', 15), 'Web API key ', h('code', null, mask(fb.apiKey)))));
          else if (missingDB) res.append(h('p.setup-warn', null, 'This config has no databaseURL — it was copied before the database existed. Copy it again from Project settings, or paste the database address below.'));
          else if (st.pasted) res.append(h('p.setup-warn', null, 'That doesn’t look like a Firebase web config. Copy the whole firebaseConfig block.'));
          nav.querySelector('.setup-next')?.toggleAttribute('disabled', !canNext());
        };
        ta.addEventListener('input', () => { st.pasted = ta.value; parse(); show(); });
        db.addEventListener('input', () => { st.dbURL = db.value; parse(); show(); });
        setTimeout(() => { show(); ta.focus(); }, 0);
        return [
          steps(
            ['Click the gear next to ', h('b', null, 'Project Overview'), ' → ', h('b', null, 'Project settings'), '.'],
            ['Under ', h('b', null, 'Your apps'), ', click the web icon ', h('code', null, '</>'), ', give the app a nickname and click ', h('b', null, 'Register app'), ' (Firebase Hosting isn’t needed).'],
            ['Copy the ', h('code', null, 'firebaseConfig'), ' block it shows and paste it here:']),
          ta, dbField, res,
          h('p.hint', null, 'This is the public part of the config that every Firebase web page ships with — it names your project; the rules from step 3 decide what anyone can do. Only apiKey, databaseURL and projectId are kept.'),
        ];
      }
      case 4: {
        const url = h('input.text-input', { type: 'url', placeholder: 'https://you.github.io/remote/', value: st.page });
        const bad = h('p.setup-warn', { hidden: true }, 'Use a full https:// address.');
        url.addEventListener('input', () => { st.page = url.value.trim(); bad.hidden = !st.page || !!safePage(st.page) && /^https:/.test(st.page); });
        return [
          h('p', null, 'The QR code opens a small web page on the phone. It is the same page for every deck and every Firebase project — the code tells it which session to join — so it only needs to be put online once.'),
          steps(
            ['Download it: ', button('Download remote.html', 'download', downloadPhonePage, { showLabel: true, cls: 'sm' })],
            ['Put it on any static web host — a GitHub Pages site, Netlify, or Firebase Hosting in the same project.'],
            ['Paste its address here:']),
          url, bad,
          h('p.hint', null, 'You can leave this empty for now and add it later in Design → Phone remote', WORKSPACE ? ' or alphaCentaur’s Workspace settings' : '', '. Until then the presentation shows a link for a remote on this computer instead of a QR code.'),
        ];
      }
      case 5: {
        const out = h('div.setup-test');
        const run = async () => {
          st.testing = true; st.error = ''; st.tested = null; drawTest();
          try { st.tested = await testConnection(st.firebase); } catch (e) { st.error = e.message; }
          st.testing = false; drawTest();
        };
        const drawTest = () => {
          out.replaceChildren(...[
            h('div.btn-row', null, button(st.testing ? 'Testing…' : 'Test the connection', 'reload', run, { showLabel: true, disabled: st.testing || !st.firebase })),
            st.tested != null ? h('p.setup-good', null, icon('check', 16), `Connected — the database answered in ${st.tested} ms.`) : null,
            st.error ? h('p.setup-warn', null, st.error) : null,
          ].filter(Boolean));
          nav.querySelector('.setup-done')?.toggleAttribute('disabled', st.tested == null);
        };
        drawTest();
        if (st.tested == null && !st.testing && st.firebase) setTimeout(run, 50);
        return [
          h('p', null, 'The editor writes a value to ', h('code', null, 'pz-remote/<random>'), ', reads it back and deletes it.'),
          out,
          h('p.hint', null, WORKSPACE
            ? 'Finishing turns the remote on for this deck and saves the setup in alphaCentaur’s workspace settings, for every deck in every project.'
            : 'Finishing turns the remote on for this deck and remembers the setup in this browser for your other decks.'),
        ];
      }
    }
    return [];
  }

  function draw() {
    dots.replaceChildren(...TITLES.map((t, i) => h('button.setup-dot' + (i === st.step ? '.on' : i < st.step ? '.done' : ''), {
      type: 'button', title: t, onclick: () => { if (i <= st.step || (i > 3 ? !!st.firebase : true)) { st.step = i; draw(); } },
    }, h('i', null, i < st.step ? '✓' : String(i + 1)), h('span', null, SHORT[i]))));
    bodyEl.replaceChildren(h('h3.setup-title', null, TITLES[st.step]), ...stepBody().flat().filter(Boolean));
    const last = st.step === TITLES.length - 1;
    nav.replaceChildren(
      st.step ? h('button.btn', { type: 'button', onclick: () => go(-1) }, 'Back') : h('span'),
      last
        ? h('button.btn.primary.setup-done', { type: 'button', disabled: st.tested == null, onclick: finish }, 'Finish')
        : h('button.btn.primary.setup-next', { type: 'button', disabled: !canNext(), onclick: () => go(1) }, st.step === 0 ? 'Get started' : 'Next'));
  }
  function finish() {
    const setup = { firebase: st.firebase, page: safePage(st.page) };
    saveSetup(setup);
    m.close();
    onDone?.(setup);
  }
  draw();
  return m;
}
