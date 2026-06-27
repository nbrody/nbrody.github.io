# Graphics Studio — playlists & remote

A wrapper over the visualizations in `docs/graphics/`. It lets you build
**playlists** (ordered sequences of visualizations), play them fullscreen on a
**stage**, and drive them — navigation *and* live parameter tweaks — from a
**remote control**.

Open `docs/graphics/index.html` (must be served over **http(s)** — see *Same-origin*
below). It must be served, not opened as a `file://` URL.

## How it works

```
index.html   gallery + playlist manager   (build/edit playlists; launch)
stage.html   the display                  (owns the iframe; single source of truth)
remote.html  the remote control           (a controller; renders state, sends commands)

app/
  manifest.js      catalog of visualizations (one entry per tool folder)
  store.js         playlists in localStorage (+ import/export JSON)
  transport.js     pluggable sync channel  (BroadcastChannel now; WebRTC stub)
  protocol.js      the command/event vocabulary spoken over a transport
  introspect.js    read & drive a tool's own controls via same-origin DOM access
  controlsView.js  render an introspected control schema into widgets (shared)
  gallery.js / stage.js / remote.js   page logic
  util.js          small DOM helpers
```

### Single source of truth

The **stage owns the iframe** and is the only thing that touches a
visualization. Every control surface — the on-stage overlay panel *and* the
separate-window remote — is just a **controller** that sends protocol commands
(`next`, `setControl`, `key`, …). The stage executes them and broadcasts back
`STATE` + `CONTROLS` events. This is why the overlay and the remote behave
identically, and why a future cross-device remote needs no new stage code.

### Zero-touch control (`introspect.js`)

None of the 18 tools were modified. Because every tool is **same-origin**, the
stage reaches into its iframe, enumerates the controls it already exposes
(sliders, toggles, selects, buttons) and the `<kbd>` shortcuts it advertises,
and replays user intent by setting values + dispatching the same `input` /
`change` / `keydown` events the tool's own listeners expect. The remote renders
matching widgets from that schema.

### Pluggable transport (`transport.js`)

| transport | crosses… | status | use `?transport=` |
|-----------|----------|--------|-------------------|
| BroadcastChannel | tabs/windows of one browser | **working** | `bc` (default) |
| WebRTC + QR | different devices (phone → projector) | **scaffolded** | `rtc` |

Controllers are transport-agnostic, so the WebRTC implementation drops into the
existing interface without touching `stage.js` / `remote.js`.

### Same-origin requirement

Introspection and ES-module imports require serving over http(s) (a dev server,
or GitHub Pages). Under `file://`, cross-folder iframe access and module loading
are blocked, so the stage will play visualizations but the remote will show no
controls.

## Roadmap / next steps (scaffolding in place)

1. **Cross-device remote (WebRTC).** Implement `WebRTCTransport` in
   `transport.js` (PeerJS or raw WebRTC + a tiny signaling shim). The stage
   hosts a peer keyed by a short room code, rendered as a QR in the remote's
   "Connect a phone" panel; remotes connect with the code. Pairing UI is already
   stubbed in `remote.html` (`#qrBox`, `#rtcBtn`).
2. **Presets.** `store.js` items carry a `state` field and `introspect.js` has
   `captureState()` / `applyState()`. Wire a "save this view" button on the
   stage that snapshots controls into the active playlist item, and apply it on
   load (already applied if present).
3. **Thumbnails.** Cards use category gradients + glyphs. Could add captured
   stills (render each viz offscreen once, cache a data URL in the manifest or
   localStorage).
4. **Per-tool control schema overrides.** Auto-introspection labels are
   heuristic. Optional per-tool overrides in `manifest.js` (`controls: [...]`)
   could rename/group/hide controls for a cleaner remote.
5. **Transitions & timing polish.** Per-item durations and crossfade styles.

## Known limitations

- **Cross-surface widget sync.** Each control surface renders its widgets from
  the schema captured at load. Changing a control on one surface drives the
  visualization correctly, but does *not* live-update the *other* surface's
  slider/toggle position (e.g. the on-stage overlay won't reflect a change made
  on the remote until reload). Values applied to the viz are always correct; only
  the other surface's widget position lags. Fix: have the stage emit a targeted
  "control changed" event and patch the single widget rather than re-rendering.
- **Same browser only (today).** Cross-device sync awaits the WebRTC transport
  (roadmap item 1). The on-stage overlay and same-browser remote work now.

## Adding a visualization

Add one entry to `VISUALIZATIONS` in `app/manifest.js` (folder `id`, `title`,
`cat`, `glyph`, `blurb`, optional `keys`). Nothing else is required — the
gallery, stage, and remote all read from the manifest.
