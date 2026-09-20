# Passiflora

A photograph-inspired, procedural passionflower using Three.js and GLSL. Open `index.html` through an HTTP server, for example from this directory:

```sh
python3 -m http.server 8080
```

Then visit http://localhost:8080. All rendering dependencies are vendored locally; the optional Google Fonts stylesheet falls back to system fonts offline.

Drag to orbit; scroll or pinch to zoom. Tap or click the stylized “Passiflora.” title to toggle the breeze (keyboard: focus the title and press Enter or Space). The page contains only the full-screen scene and title. Reduced-motion preferences disable the breeze initially.

`main.js` constructs curved petals, three rings of tubular corona filaments, five anthers, three stigmas, and the supporting stalk. `shaders.js` supplies GLSL banding, veins, grain and two-sided botanical lighting. This is an artistic reconstruction, not a species identification or growth simulation. No photograph or image textures are bundled.

Vendored Three.js r160 and OrbitControls are MIT-licensed (see `vendor/LICENSE`).
