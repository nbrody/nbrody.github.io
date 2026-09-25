import { firebaseConfig } from './firebase-config.js';
import { days, slots, slotLabel, normalizeResponses, bestWindows } from './survey.js';

const $ = id => document.getElementById(id);
const DRAFT_KEY = 'golg-fall-2026-draft-v1';
const PATH = 'seminars/geometry-linear-groups-fall-2026/responses';
let selected = new Set(), saved = false, busy = false, revision = 0, storageAvailable = true;
try {
  const draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
  if (draft) {
    $('name').value = typeof draft.name === 'string' ? draft.name.slice(0, 80) : '';
    selected = new Set((Array.isArray(draft.slots) ? draft.slots : []).filter(id => slots.some(s => s.id === id)));
    $('flexible').checked = draft.flexible === true;
    saved = draft.saved === true;
  }
} catch { storageAvailable = false; }
function status(message, error = false) { $('status').textContent = message; $('status').classList.toggle('error', error); }
function snapshot() { return { name: $('name').value.trim(), slots: [...selected].sort(), flexible: $('flexible').checked }; }
function persist() {
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...snapshot(), saved })); }
  catch { storageAvailable = false; }
  $('draft-status').textContent = storageAvailable ? 'Draft saved on this device. Save your response to share changes.' : 'Browser storage is unavailable. Keep this page open until you submit.';
}
function edited() { revision++; persist(); status(''); }
function paint() {
  for (const button of $('calendar').querySelectorAll('.slot')) button.setAttribute('aria-pressed', String(selected.has(button.dataset.slot)));
  const hours = selected.size / 2;
  $('selection-count').textContent = selected.size ? `${hours} ${hours === 1 ? 'hour' : 'hours'} selected` : 'No times selected';
}
function makeGrid(container, group = false, responses = []) {
  container.replaceChildren();
  const cell = (className, text) => { const node = document.createElement('div'); node.className = className; node.textContent = text; container.append(node); };
  cell('time-heading', 'TIME'); days.forEach(d => cell('day', d.slice(0, 3)));
  for (let row = 0; row < 24; row++) {
    const hour = 8 + Math.floor(row / 2);
    cell('time', row % 2 === 0 ? `${hour % 12 || 12} ${hour < 12 ? 'am' : 'pm'}` : '');
    for (let day = 0; day < 5; day++) {
      const id = `${day}-${row}`;
      const button = document.createElement('button'); button.type = 'button';
      button.className = `slot${row % 2 === 0 ? ' hour' : ''}${group ? ' group-slot' : ''}`;
      button.dataset.slot = id;
      const label = slotLabel(id);
      if (!group) { button.setAttribute('aria-label', label); button.setAttribute('aria-pressed', String(selected.has(id))); }
      else {
        const people = responses.filter(r => r.slots.includes(id)).map(r => r.name);
        button.textContent = people.length || '';
        button.style.backgroundColor = `rgba(94, 132, 69, ${people.length ? .12 + .65 * people.length / responses.length : .06})`;
        button.setAttribute('aria-label', `${label}: ${people.length} of ${responses.length} participants available`);
        button.addEventListener('click', () => { $('slot-detail').textContent = `${label}: ${people.length ? people.join(', ') : 'No one available'}.`; });
      }
      button.title = button.getAttribute('aria-label'); container.append(button);
    }
  }
}
makeGrid($('calendar')); paint();
// Mouse/pen supports painting; touch keeps native page scrolling and tap selection.
let dragging = false, paintValue = false;
function setSlot(button, value) { if (value) selected.add(button.dataset.slot); else selected.delete(button.dataset.slot); paint(); edited(); }
$('calendar').addEventListener('pointerdown', event => {
  const button = event.target.closest('.slot');
  if (!button || event.pointerType === 'touch' || event.button !== 0) return;
  event.preventDefault(); button.focus(); dragging = true; paintValue = !selected.has(button.dataset.slot); setSlot(button, paintValue);
});
$('calendar').addEventListener('pointerover', event => { const button = event.target.closest('.slot'); if (dragging && button) setSlot(button, paintValue); });
window.addEventListener('pointerup', () => { dragging = false; });
window.addEventListener('pointercancel', () => { dragging = false; });
window.addEventListener('blur', () => { dragging = false; });
$('calendar').addEventListener('click', event => {
  const button = event.target.closest('.slot');
  if (button && (event.detail === 0 || event.pointerType === 'touch')) setSlot(button, !selected.has(button.dataset.slot));
});
$('clear').addEventListener('click', () => { selected.clear(); paint(); edited(); });
$('name').addEventListener('input', edited);
$('flexible').addEventListener('change', edited);

let backendPromise;
async function backend() {
  if (!backendPromise) backendPromise = (async () => {
    const base = 'https://www.gstatic.com/firebasejs/10.14.1/';
    const [appSDK, authSDK, dbSDK] = await Promise.all([import(base + 'firebase-app.js'), import(base + 'firebase-auth.js'), import(base + 'firebase-database.js')]);
    const app = appSDK.initializeApp(firebaseConfig, 'golg-fall-2026');
    const auth = authSDK.getAuth(app);
    await auth.authStateReady();
    const user = auth.currentUser || (await authSDK.signInAnonymously(auth)).user;
    const token = () => user.getIdToken();
    return { user, token, db: dbSDK.getDatabase(app), dbSDK };
  })().catch(error => { backendPromise = null; throw error; });
  return backendPromise;
}
// REST mutations have a finite timeout; the stable authenticated UID makes retries idempotent.
async function request(method = 'GET', value) {
  const { user, token } = await backend();
  const path = method === 'GET' ? PATH : `${PATH}/${user.uid}`;
  const url = `${firebaseConfig.databaseURL}/${path}.json?auth=${encodeURIComponent(await token())}`;
  const response = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: value === undefined ? undefined : JSON.stringify(value), signal: AbortSignal.timeout(12000), cache: 'no-store' });
  if (!response.ok) throw new Error(`Firebase ${response.status}`);
  return response.json();
}
function renderGroup(data) {
  const responses = normalizeResponses(data);
  $('group-summary').textContent = responses.length ? `${responses.length} ${responses.length === 1 ? 'participant has' : 'participants have'} responded. Best one-hour windows:` : 'No responses yet. Be the first to share your availability.';
  $('group-results').replaceChildren();
  const windows = bestWindows(responses);
  for (const window of windows.slice(0, 3)) {
    const row = document.createElement('div'); row.className = 'group-row';
    const label = document.createElement('span'); label.textContent = window.label;
    const count = document.createElement('span'); count.textContent = `${window.count} / ${responses.length} available`;
    row.append(label, count); $('group-results').append(row);
  }
  if (responses.length && !windows.length) $('group-summary').textContent = `${responses.length} responded. No one-hour availability windows yet.`;
  $('all-availability').hidden = !responses.length;
  makeGrid($('group-calendar'), true, responses);
  $('slot-detail').textContent = '';
  $('participants').textContent = 'Participants: ' + responses.map(r => r.name + (r.flexible ? ' (availability undecided)' : '')).join(', ');
}
function friendlyError(error) {
  if (/configuration-not-found|operation-not-allowed|admin-restricted-operation|Firebase 40[13]|PERMISSION_DENIED/i.test(error.message)) return 'Shared responses are not available yet: the organizer needs to enable this survey in Firebase.';
  return 'Could not connect to the shared survey. Check your connection and try again.';
}
let unsubscribe;
async function connect() {
  $('refresh').disabled = true;
  try {
    const { db, dbSDK, user } = await backend();
    const data = await request();
    renderGroup(data);
    if (data?.[user.uid]) { saved = true; $('remove').hidden = false; $('save').textContent = 'Update response ↗'; }
    if (!unsubscribe) unsubscribe = dbSDK.onValue(dbSDK.ref(db, PATH), snapshot => renderGroup(snapshot.val()), error => { $('group-summary').textContent = friendlyError(error) + ' Displayed results may be out of date.'; });
  } catch (error) { $('group-summary').textContent = friendlyError(error); }
  finally { $('refresh').disabled = false; }
}
$('refresh').addEventListener('click', connect);
$('availability-form').addEventListener('submit', async event => {
  event.preventDefault(); if (busy) return;
  const data = snapshot();
  if (!data.name) { status('Please enter your name.', true); $('name').focus(); return; }
  if (!data.slots.length && !data.flexible) { status('Mark an available time, or check the box if your availability is undecided.', true); return; }
  busy = true; $('save').disabled = true; $('remove').disabled = true;
  const submittedRevision = revision;
  status('Saving your response…');
  try {
    await request('PUT', { ...data, updatedAt: { '.sv': 'timestamp' } });
    saved = true; persist(); $('remove').hidden = false; $('save').textContent = 'Update response ↗';
    const changed = revision !== submittedRevision;
    $('draft-status').textContent = changed ? 'You have changes made during saving. Save again to share them.' : 'Your response is saved. You can update it in this browser.';
    status(changed ? 'Response saved. Your newer edits are still a draft.' : 'Thank you! Your interest and availability have been shared.');
    await connect();
  } catch (error) { status(friendlyError(error) + ' Your response has not been confirmed; retry to save it.', true); }
  finally { busy = false; $('save').disabled = false; $('remove').disabled = false; }
});
$('remove').addEventListener('click', async () => {
  if (busy || !confirm('Remove your shared response? Your local availability draft will remain.')) return;
  busy = true; $('save').disabled = true; $('remove').disabled = true;
  try { await request('DELETE'); saved = false; persist(); $('remove').hidden = true; $('save').textContent = 'Save response ↗'; status('Your shared response has been removed.'); await connect(); }
  catch (error) { status(friendlyError(error) + ' Removal was not confirmed. Please retry.', true); }
  finally { busy = false; $('save').disabled = false; $('remove').disabled = false; }
});
connect();
