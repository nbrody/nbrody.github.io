# Running the talk with no wifi

Every third-party dependency is vendored into `vendor/` (reveal.js, MathJax +
fonts, three.js + OrbitControls, MathQuill + Symbola, jQuery, math.js, JSZip,
and the Google fonts as latin-subset woff2s), and every page in the talk —
including the two Boise animations the deck embeds — references those local
copies. Nothing is fetched from the network.

## To present offline

```bash
./serve.sh
```

then open <http://localhost:8764/Talks/MathFest/> in the browser.
(Any static server rooted at `docs/` works; `file://` does not, because the
apps use ES modules and iframes.)

## What works offline

- The whole deck, all math typesetting, all embedded apps: torusOrbifold,
  productOfTrees, cayleyHeights cost landscape, Long-Reid Racer, the 11-step
  poincareTutorial (including exact arithmetic), and the full-app slide.
- Speaker notes (press `S`).
- A same-machine "remote": open
  <http://localhost:8764/Talks/MathFest/?remote=1> in a second window —
  commands travel over a BroadcastChannel, no network involved.

## What needs internet

- The **phone** remote (Firebase) and the QR code in the Present modal.
  The Firebase SDK is still loaded from Google's CDN; offline, those two
  script tags fail and `remote.js` degrades gracefully (guarded with
  `typeof firebase !== 'undefined'`) — the deck itself is unaffected.
