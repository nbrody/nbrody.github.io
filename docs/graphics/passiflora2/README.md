# passiflora2

A three.js + GLSL blue passionflower (*Passiflora caerulea*), modeled on the photo of two blooms against a fence.

## Run

ES modules need a local server:

    cd passiflora2
    python3 -m http.server 8000
    # open http://localhost:8000

three.js r170 loads from jsDelivr via the import map in `index.html`.

## Layout

- `src/main.js` sets up renderer, camera, orbit controls, shared uniforms, and places flowers, buds, and leaves.
- `src/flower.js` builds one flower: 10 tepals, ~420 corona filaments, the nectar disc, androgynophore, 5 stamens with anthers, ovary, 3 styles with stigmas, calyx and stem.
- `src/leaves.js` builds instanced five-lobed leaves.
- `src/shaders/` holds all GLSL:
  - `common.js`: shared uniforms, noise, thin-tissue lighting (wrapped diffuse and translucency), ACES tone map.
  - `tepal.js`: flat planes bent into cupped, curling tepals in the vertex shader, normals by finite differences; veins, midrib, green backs and fake filament shadows in the fragment shader.
  - `filament.js`: instanced tubes whose centreline, crinkle and breeze are computed per vertex; purple, white and violet banding by length.
  - `leaf.js`: polar grid shaped into palmate lobes with V-folds.
  - `organ.js`: speckled solid parts.
  - `disc.js`, `background.js`: nectar ring and the out-of-focus fence and foliage.

## Tuning

Filament rows are set in `createFlower` via `row(count, r0, length, elevation, droop, thickness, kind, offset)`. Sun direction and colour live in `shared` in `main.js`. `window.passiflora` exposes the scene, camera and controls for console tinkering.
