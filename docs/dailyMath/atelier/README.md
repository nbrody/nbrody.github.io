# Daily Math Atelier (`atelier/`)

Dual-mode mathematical visualization library. All scripts attach cleanly onto `window.DM` (plain `<script>` tags, zero network, zero bundler, `file://`-compatible).

```html
<meta name="color-scheme" content="light dark">
<script>try{var t=new URLSearchParams(location.search).get('theme')||localStorage.getItem('dailyMath.theme');if(t==='light'||t==='dark')document.querySelector('meta[name="color-scheme"]').content=t;}catch(e){}</script>
<link rel="stylesheet" href="../atelier/atelier.css">
<script src="../atelier/palette.js"></script>
<script src="../atelier/atelier.js"></script>
<script src="../atelier/draw.js"></script>
```

## Modules

| File | Globals | Purpose |
|---|---|---|
| `palette.js` | `DM.THEMES`, `DM.palette`, `DM.ramp`, `DM.mix`, `DM.rgba`, `DM.contrastRatio` | Museum Parchment (`light`) & Observatory Obsidian (`dark`) mineral/luminous palettes & OKLab mixing |
| `atelier.js` | `DM.page`, `DM.test`, `DM.check`, `DM.fmt`, `DM.int` | Plate shell, theme toggle, tour, dock, native `<dialog>` notes, tween loop, pointer & tests |
| `draw.js` | `DM.clear`, `DM.camera`, `DM.line`, `DM.dashed`, `DM.arrow`, `DM.polyline`, `DM.polygon`, `DM.circle`, `DM.arc`, `DM.dot`, `DM.ring`, `DM.label`, `DM.grid` | 2D canvas primitives + y-up world camera |
| `plot.js` | `DM.ticks`, `DM.plot` | Theme-adaptive editorial charts inside panes |
| `math-exact.js` | `DM.ex`, `DM.Q`, `DM.Zi` | BigInt gcd/egcd/primes/factor/cfrac/Farey/SL2(Z), exact rationals `Q`, Gaussian integers `Zi` |
| `math-linalg.js` | `DM.la` | Dense matrices, `det`, `inv`, `gramSchmidt`, symmetric `jacobi`, `cholesky`, `rot2/3/4` |
| `math-complex.js` | `DM.cx`, `DM.mob`, `DM.hyp` | Complex numbers, Möbius maps, Poincaré disk & UHP geodesics |
| `space3d.js` | `DM.orbit3d`, `DM.curves3d`, `DM.points3d` | Inertia-damped 3D orbit camera & depth-cued strokes |
| `gl.js` | `DM.gl` | WebGL2 helper with `//#DM_PALETTE` synchronized Parchment/Obsidian GLSL uniforms |
| `tex.js` | `DM.tex`, `DM.texify`, `DM.texLabels` | Vendored KaTeX (`vendor/katex/`) + pinned stage math labels |

## `DM.page(config)` -> `app`

- `plate`: `'001'` (plate number badge)
- `title`: `<= 7` words
- `hook`: `5–16` plain words
- `date`: `'YYYY-MM-DD'`
- `defaultTheme`: `'light'` | `'dark'` | `'system'` (chooses the plate's natural ground; user toggle & `?theme=` always override)
- `hint`: short gesture prompt above dock
- `stage`: `'2d'` | `'webgl2'` | `'svg'`, `overlay`: boolean, `frame`: boolean (default `true`)
- `panes`: `[{ id, weight, label }]`, `split`: `'auto' | 'row' | 'column'`
- `controls`: `1–4` controls (plus optional `{ type: 'play' }`) — `segmented`, `slider`, `toggle`, `button`
- `tour`: `3–5` steps (`{ text, enter(app) }`, each `<= 26` words)
- `math`: `25–130` words explaining the exact theorem inside the native `<dialog>` sheet
- `setup(app)`, `step(dt, app)`, `draw(app)`, `onThemeChange(theme, app)`
- `posterStep`, `posterDelay`

## Reading colors dynamically

Always read colors from `app.palette` inside `draw(app)` (never cache hex strings globally at load time!) so switching between Parchment (`light`) and Obsidian (`dark`) updates every stroke, fill, and label seamlessly.
