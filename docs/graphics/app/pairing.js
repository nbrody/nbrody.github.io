import { el } from './util.js';
import { CMD } from './protocol.js';

export function activatePairing(transport) {
  const url = new URL(location.href);
  url.searchParams.set('transport', 'firebase');
  history.replaceState(null, '', url);
  localStorage.setItem('graphics.lastTransport', 'firebase');
  return transport.enableCloud();
}

export function mountPairing(container, transport, { remote = false } = {}) {
  const status = el('p', { role: 'status', class: 'pair-status' }, 'Phone pairing is off.');
  const enable = el('button', { class: 'btn primary' }, 'Enable phone pairing');
  const base = el('input', { type: 'url', 'aria-label': 'Phone-accessible graphics URL', value: new URL('./', location.href).href });
  const link = el('a', { target: '_blank', rel: 'noopener', class: 'pair-link' });
  const qr = el('img', { width: 220, height: 220, alt: 'Scan to control this display', class: 'pair-qr', hidden: true });
  const hint = el('p', { class: 'faint' });
  let pairingURL = '';
  function updateLink() {
    try {
      const site = new URL(base.value);
      if (!['http:', 'https:'].includes(site.protocol)) throw new Error('Use an HTTP or HTTPS graphics site URL.');
      const url = new URL('remote.html', site.href.endsWith('/') ? site : new URL('./', site));
      url.search = new URLSearchParams({ room: transport.room, transport: 'firebase' });
      pairingURL = url.href;
      link.href = pairingURL;
      link.textContent = pairingURL;
      const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
      hint.textContent = local
        ? 'A phone cannot reach localhost. Enter this computer’s LAN graphics URL (same Wi-Fi), or the deployed graphics URL with these changes.'
        : 'Scan on your phone. Keep the display open. Anyone with this link can control this session.';
      qr.hidden = local || transport.cloudStatus !== 'online';
      if (!qr.hidden) {
        const src = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(pairingURL)}`;
        if (qr.src !== src) qr.src = src;
      }
    } catch (error) { pairingURL = ''; link.removeAttribute('href'); link.textContent = ''; qr.hidden = true; hint.textContent = error.message; }
  }
  enable.onclick = () => {
    if (remote) transport.send(CMD.ENABLE_CLOUD);
    activatePairing(transport);
  };
  base.addEventListener('input', updateLink);
  qr.onerror = () => { qr.hidden = true; hint.textContent = 'QR image unavailable. Copy or open the pairing link instead.'; };
  const copy = el('button', { class: 'btn', onclick: async () => {
    try { if (!pairingURL) return; await navigator.clipboard.writeText(pairingURL); hint.textContent = 'Pairing link copied.'; }
    catch { hint.textContent = 'Select and copy the pairing link above.'; }
  } }, 'Copy pairing link');
  transport.onCloudStatus((state, error) => {
    const labels = { disabled: 'Phone pairing is off.', connecting: 'Connecting phone pairing…', online: 'Phone pairing ready', offline: 'Pairing offline — reconnecting…', error: `Pairing failed: ${error}` };
    status.textContent = labels[state];
    enable.disabled = state === 'connecting' || state === 'online';
    enable.textContent = state === 'online' ? 'Pairing enabled' : 'Enable phone pairing';
    updateLink();
  });
  container.append(status, enable, el('label', {}, ['Phone-accessible graphics URL', base]), qr, link, copy, hint);
  if (remote) {
    const join = el('input', { type: 'text', 'aria-label': 'Pairing link or room code', placeholder: 'Paste a pairing link or room code' });
    container.append(el('label', {}, ['Join another display', join]), el('button', { class: 'btn', onclick: () => {
      try {
        const raw = join.value.trim();
        const room = raw.startsWith('http') ? new URL(raw).searchParams.get('room') : raw;
        if (!room || !/^[a-zA-Z0-9_-]{8,100}$/.test(room)) throw new Error('Paste the full pairing link or room code from the display.');
        const url = new URL(location.href);
        url.search = new URLSearchParams({ room, transport: 'firebase' });
        location.href = url.href;
      } catch (error) { hint.textContent = error.message; }
    } }, 'Connect to display'));
  }
}
