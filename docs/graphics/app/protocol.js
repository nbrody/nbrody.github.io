// protocol.js — the message vocabulary spoken between a remote (controller)
// and the stage (display). Both BroadcastChannel and (future) WebRTC transports
// carry these same envelopes, so controllers are transport-agnostic.
//
// Envelope shape: { v: 1, role: 'remote'|'stage', type: <CMD|EVT>, payload, t }

export const PROTOCOL_VERSION = 1;

// Commands: remote → stage
export const CMD = {
  HELLO: 'hello', // controller announces itself; stage replies with STATE+CONTROLS
  NEXT: 'next',
  PREV: 'prev',
  GOTO: 'goto', // { index }
  PLAY: 'play',
  PAUSE: 'pause',
  TOGGLE_PLAY: 'togglePlay',
  SET_CONTROL: 'setControl', // { selector, kind, value }
  INVOKE: 'invoke', // { selector }  — click a button
  KEY: 'key', // { key, code, shift, ctrl, alt, meta }
  TOGGLE_VIZ_PANEL: 'toggleVizPanel', // press the viz's own panel-toggle (usually "h")
  RELOAD: 'reload',
  FULLSCREEN: 'fullscreen',
  REQUEST_STATE: 'requestState',
  SET_ADVANCE: 'setAdvance', // { advance: 'manual'|'auto', duration? }
};

// Events: stage → remote(s)
export const EVT = {
  STATE: 'state', // see makeState() shape below
  CONTROLS: 'controls', // { controls: [...], keys: [...] }  (introspected schema)
  GOODBYE: 'goodbye', // stage is closing
};

/** Canonical shape of the STATE event payload (documentation + defaults). */
export function makeState(partial = {}) {
  return {
    playlistId: null,
    playlistName: '',
    index: 0,
    total: 0,
    vizId: null,
    vizTitle: '',
    playing: false,
    advance: 'manual', // 'manual' | 'auto'
    duration: 0, // seconds for the current item (auto mode)
    remaining: 0, // seconds left on the current item (auto mode)
    items: [], // [{ vizId, title }]
    ...partial,
  };
}
