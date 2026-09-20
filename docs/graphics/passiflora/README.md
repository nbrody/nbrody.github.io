# Passiflora

A photograph-inspired, procedural passionflower using Three.js and GLSL. Open `index.html` through an HTTP server, for example from this directory:

```sh
python3 -m http.server 8080
```

Then visit http://localhost:8080. All rendering dependencies are vendored locally; the optional Google Fonts stylesheet falls back to system fonts offline.

Drag to orbit, scroll or pinch to zoom. Controls adjust petal opening, corona length and curl, with face/profile/center views, optional rotation and breeze, and PNG export. Reduced-motion preferences disable the breeze initially.

`main.js` constructs curved petals, three rings of tubular corona filaments, five anthers, three stigmas, and the supporting stalk. `shaders.js` supplies GLSL banding, veins, grain and two-sided botanical lighting. This is an artistic reconstruction, not a species identification or growth simulation. No photograph or image textures are bundled.

Vendored Three.js r160 and OrbitControls are MIT-licensed (see `vendor/LICENSE`).
