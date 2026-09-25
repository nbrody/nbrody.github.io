/**
 * Permalinks: the page state — generators (as typed), exact field, search
 * settings, basepoint, cusp view and display model — packed into the URL hash
 * as base64url JSON (#s=…). Loading such a URL restores the exact group.
 */
const PREFIX = '#s=';

function toB64(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = '';
    for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64(b64) {
    const s = b64.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(s + '==='.slice((s.length + 3) % 4));
    const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
}

export function encodeState(state) {
    return PREFIX + toB64(JSON.stringify(state));
}

/** The state in the current URL hash, or null. */
export function readStateFromURL() {
    const h = location.hash || '';
    if (!h.startsWith(PREFIX)) return null;
    try {
        const st = JSON.parse(fromB64(h.slice(PREFIX.length)));
        return st && st.v === 1 ? st : null;
    } catch (e) {
        console.warn('[permalink] could not read the URL state:', e);
        return null;
    }
}

/** Replace the URL hash without adding a history entry. */
export function writeStateToURL(state) {
    const url = location.pathname + location.search + encodeState(state);
    try { history.replaceState(null, '', url); } catch (e) { /* sandboxed frames */ }
    return location.origin + url;
}
