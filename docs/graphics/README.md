# Graphics Studio

Serve the repository over HTTP(S) and open `docs/graphics/index.html`.

The gallery lists every catalog visualization with a preview thumbnail, search,
and category filters (grid or compact list). Each title and thumbnail links to
the visualization's own `<id>/index.html`; ↗ opens it with `?standalone=1`, ⧉
copies the link, and **+ Add** appends it to the playlist being edited.

Each catalog visualization opens in a shared stage with a floating controls
panel and a dock. Direct links such as `donutSpiral/index.html` enter the same
shell. Use `?standalone=1` to open the original tool without the shell.

## Simple and Advanced controls

Every control surface (the stage panel and the remote) opens on a **Simple**
page: the handful of controls that matter most for that visualization, drawn
big enough for a thumb. These include fill-bar sliders you tap or drag sideways,
toggle tiles, segmented or chip pickers, and action and key tiles with plain-language
labels. Tap **Advanced** (or **All N controls**, or swipe sideways) for every
control the visualization exposes. Advanced groups controls into collapsible
cards and has a filter box for tools with dozens of controls. On the stage, a
third **Studio** page holds Present, Fullscreen, Reload, the library, the
pop-out remote, and phone pairing.

The Simple picks, better labels, keyboard-shortcut meanings, and the few
controls hidden from remotes live in `app/curation.js`, one entry per
visualization (see the comment at its top). Selectors must match what
introspection reports, usually `#id`. A visualization without an entry falls
back to a heuristic Simple page (pickers, then sliders, toggles and obvious
action buttons).

The control UI follows the design language of the Poincaré workbench sidebar
(`docs/GeometryofLinearGroups/Geometric/Tools/Kleinian/poincare`). It uses
indigo/cyan accents, gradient-hairline glass, segmented tabs with a soft glow,
and micro-label cards. The tokens and components are in `app/style.css`.

## Remote and playlists

The remote (`remote.html`) is built for a phone. It has a now-playing header,
tabs for **Simple · Advanced · Playlist · Connect** (tap or swipe), and a
bottom dock with random, previous, play/pause and next. The dock's **⋯** opens
display options: show or hide the display's panel, reload, fullscreen, shuffle
the queue, and open the library. Notices from the display appear as toasts.

Open a visualization or playlist, then select **Pop out the remote** on its
panel's Studio page. The display switches to a clean, edge-to-edge presentation;
the visualization's original UI and the stage dock are hidden. The remote's
display options restore the panel. Press **C** on the focused stage, or use the
round button at the upper right (always faintly visible on touch screens), to
recover controls locally. Browser fullscreen requires a user gesture on the
display: click **Fullscreen** or press **F** there. Presentation mode itself
needs no browser permission.

The remote can:

- Add, remove, and reorder visualization entries, including repeats.
- Set default/per-entry durations, auto-advance, and looping.
- Send a playlist to the display, jump to an entry, select a random different
  entry, or shuffle the queue while retaining the current visualization.
- Save named playlists in this browser, reopen them, and import/export JSON.
- Adjust the visualization's controls live; the sidebar and other remotes
  synchronize from the actual visualization controls.
- Apply JSON parameter payloads or capture the current controls as a preset.

To save live adjustments, select **Capture current view**, **Use display queue**,
then **Save playlist**. Queue edits are drafts until **Play on display** is
selected; saving alone does not interrupt playback. Local storage persists
across browser restarts; export JSON for backups or transfer to another browser.

Each display has a unique `room` in its URL. Its pop-out remote carries that
room, isolating it from other displays. A remote opened from the gallery uses
the most recently opened display's room, and can launch a display itself.

## Phone-to-computer pairing

Open the display panel's **Studio** page and select **Enable phone pairing**.
Scan the QR with your phone. The phone opens the remote for this display, and
the display switches to presentation mode when the remote connects. The remote's
**Connect** page has a copyable link and a field to join a different display
using its pairing link or full room code.

Pairing uses the same Firebase Realtime Database project as the Talks sites
(`mathtalks-84dad`), under isolated `sessions/graphics-<room>` records. No new
backend or Firebase project is needed. Enabling pairing loads the same pinned
Firebase SDK version used by Talks; ordinary local playback does not load it.
The stage and remote need internet access for cloud control. Local control
continues through BroadcastChannel if the cloud connection is unavailable.

For a local preview, open the site using the computer's LAN address from both
computer and phone (same Wi-Fi), or enter that address in **Phone-accessible
graphics URL**. For example, `http://192.168.1.20:8124/docs/graphics/`.
The example IP must be replaced with your computer's address. `localhost`
always means the device viewing the link, so its QR is deliberately hidden.
On the deployed site, the correct public URL is filled automatically.

QR images use the same qrserver service as Talks. If that service is unavailable,
the pairing link still works. The session link grants control of the display;
share it only with intended controllers. Pairing inherits the existing Firebase
project's access rules; this change does not alter database rules or authentication.

Commands have unique IDs to prevent double execution through local/cloud routes.
They use a queue, are removed after receipt, and expire after 15 seconds; commands
issued while the sender is offline are not queued to Firebase. State and controls
use separate latest-value records. JSON envelopes preserve selectors and empty
arrays through Firebase. The display registers server-side session cleanup on
disconnect and republishes current state when it reconnects. Errors and reconnecting
status are shown in the pairing panel.

## Payloads

A playlist entry has a visualization ID, optional duration in seconds, and an
optional JSON object mapping control selectors (or input IDs) to primitive values:

```json
{
  "vizId": "donutSpiral",
  "duration": 20,
  "payload": {
    "#speedSlider": 0.5,
    "#spokesSlider": 32,
    "#bgColor": "#102030"
  }
}
```

A complete playlist has `name`, `items`, `advance` (`manual` or `auto`),
`defaultDuration`, and `loop`. Legacy `state` snapshots containing
`{ "kind": "range", "value": 0.5 }` entries remain readable.

For a single visualization, `stage.html?viz=donutSpiral&payload=...` accepts the
URL-encoded JSON payload. Build links with `URLSearchParams` to encode it.
The remote also has a per-entry payload editor and an **Apply payload** command
for the current visualization. Payloads apply after load; controls created
asynchronously are retried for up to five seconds. Missing controls are reported
in the remote. Numeric ranges are constrained by the visualization's own input.
These payloads capture exposed form controls, not arbitrary internal state such
as camera position, simulation history, or canvas gestures.

## Architecture

- `manifest.js`: catalog and paths.
- `stage.js`: owns the visualization iframe, queue, timers, and command handling.
- `remote.js` / `playlistEditor.js`: remote controls and draft playlist editor.
- `protocol.js` / `transport.js`: command/event envelopes, local/cloud transport.
- `firebase.js` / `pairing.js`: Talks backend configuration, SDK loading, QR/link UI.
- `introspect.js`: same-origin control discovery and application.
- `controlsView.js` / `curation.js`: the Simple and Advanced pages, rendered from
  the introspected schema plus per-visualization curation; values are patched
  in place, so a widget under a finger is never replaced mid-drag.
- `pager.js`: tabs over swipeable scroll-snap pages; inactive pages are inert.
- `payload.js` / `store.js`: payload normalization and persistent playlists.
- `entry.js` / `presentation.js`: direct-link shell entry and embedded layout.

To add a visualization, register it in `manifest.js`, include
`<script src="../app/entry.js"></script>` in its HTML head, and extend
`presentation.js` if its layout has different control panels. Add an entry to
`curation.js` with its Simple picks and any label fixes. Then generate its
thumbnail (below); without one the gallery falls back to the manifest glyph. Use stable IDs
and labels for form controls. All embedded visualizations must be same-origin.

## Thumbnails

`thumbs/<id>.webp` are 320×200 WebP previews (~2–17 KB each), loaded lazily by
the gallery. Regenerate them with the repository served on port 8124:

```sh
node docs/graphics/scripts/make-thumbs.mjs             # all visualizations
node docs/graphics/scripts/make-thumbs.mjs fire penrose # just these
```

The script drives installed Google Chrome over the DevTools protocol (no npm
dependencies), opens each visualization in presentation mode, and waits a few
seconds before capturing. Tools that start blank get per-id help in its `PREP`
table (extra wait, a script such as starting a MIDI demo, or painted strokes).

## Regression checks

Install Playwright in your development environment, serve the repository on
port 8124, and run `node docs/graphics/tests/studio.mjs`. The test uses installed
Google Chrome on macOS. Override `CHROME_PATH`, `GRAPHICS_TEST_URL`, or
`PLAYWRIGHT_MODULE` for another environment.

`tests/phone-pairing.mjs` exercises the real Firebase backend with isolated browser
profiles: phone queue/payload control, local/cloud deduplication, reconnect, QR
links, and SDK failure handling. It creates a unique graphics test room and
cleans it up afterward. Run it with the same Playwright/environment setup.
