# Hollywood Juniper

A photo-inspired procedural Three.js / GLSL model of a Hollywood juniper. Open `index.html` through an HTTP server; no build step or network dependencies are required.

From the graphics directory:

```sh
python3 -m http.server 8765
```

Visit http://localhost:8765/juniper/.

Drag to orbit, scroll/pinch to zoom, and right-drag to pan. The controls provide portrait/profile cameras, a sparse structure view, foliage density, wind strength, automatic rotation, reset, and PNG export. On narrow screens the controls start collapsed. Reduced-motion preferences disable wind initially.

`main.js` contains the hand-shaped Catmull–Rom branch scaffold, tapered wood geometry, seeded procedural foliage, instanced scale-leaf geometry, and GLSL bark/leaf shading and wind deformation. The shadow shader shares the wind deformation. `style.css` and `index.html` provide the responsive study interface. Vendored Three.js r160 and OrbitControls retain their MIT license in `vendor/LICENSE`.

This is a sculptural interpretation of a single photograph, rather than a measured reconstruction of the unseen side of the tree.

The two additional ground-level references inform the exposed shared bole, open lower forks, root flare, and rectangular planting bed. Both camera presets frame the complete tree and ground contact.
