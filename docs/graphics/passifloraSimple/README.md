# Passiflora, simplified

A deliberately basic Three.js + GLSL sketch of the same flower: ten flat ellipse petals, 64 straight filaments, and a center built from cylinders and spheres. One short shader handles color gradients and lighting. No textures, noise, animation, or shape controls.

Serve the parent graphics directory with `python3 -m http.server 8087`, then open `http://localhost:8087/passifloraSimple/`. Drag to orbit, scroll to zoom, or reset the view.

Rendering dependencies are shared with `../passiflora/vendor/` (Three.js r160, MIT). Keep that directory alongside this one.
