# Passiflora

A photograph-inspired, procedural passionflower using Three.js and GLSL. Open `index.html` through an HTTP server, for example from this directory:

```sh
python3 -m http.server 8080
```

Then visit http://localhost:8080. All rendering dependencies are vendored locally; the optional Google Fonts stylesheet falls back to system fonts offline.

Drag to orbit; scroll or pinch to zoom. Tap or click the stylized “Passiflora.” title to toggle the breeze (keyboard: focus the title and press Enter or Space). The page contains only the full-screen scene and title. Reduced-motion preferences disable the breeze initially.

`main.js` constructs curved petals, three rings of tubular corona filaments, five anthers, three stigmas, and the supporting stalk. `shaders.js` supplies GLSL banding, veins, grain and two-sided botanical lighting. This is an artistic reconstruction, not a species identification or growth simulation. No photographs, canvas-painted textures, or image textures are used.

Vendored Three.js r160 and OrbitControls are MIT-licensed (see `vendor/LICENSE`).

Tap two different petals within six seconds to invite a monarch. It flies to the second petal and settles with gently moving wings. Repeat with two petals to move it again. Dragging and pinching do not count as taps. Reduced-motion mode places the butterfly directly on the flower with still wings. The butterfly anatomy and motion are built in `monarch.js`; `monarch-shaders.js` computes curved veins, dark margins, cream spots, scale texture, and lighting directly in GLSL, using the same lighting and tone mapping as the flower.

### Reference-coordinate tracing

`monarch-trace.js` stores manually traced cubic Bézier control points in the supplied 3072 × 2304 reference image's pixel coordinates, plus vein half-widths and the forewing pigment boundary. The centerlines were refined against nearby dark pixels in an enlarged crop, then fitted back to cubic curves. They are approximate image measurements, not anatomical measurements. `fromPhoto()` in `monarch.js` maps them to wing space and corrects the body's slight lean. The right wing is mirrored; the cropped-off outer tip is inferred and marked in the data. GLSL evaluates the measured curves and widths directly—there is no reference image texture.
