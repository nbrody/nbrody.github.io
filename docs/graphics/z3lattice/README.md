# Z³ — Waves in a Crystal

A finite set of integer lattice points, rendered as shaded lights with GPU wave
motion and soft halos. Open through the graphics gallery for the shared sidebar,
playlist payloads, and phone controls. `index.html?standalone=1` uses the native
control panel.

Four scenes provide starting points:

- **Aurora:** slowly rotating traveling waves, jade and violet.
- **Pearl:** radial ripples through a spherical window, lavender and champagne.
- **Ember:** two crossing waves, copper and gold.
- **Blueprint:** standing waves on three intersecting coordinate planes.

Scenes set parameters; changing a parameter marks the scene Custom. The optional
tour advances every 24 seconds while waves are playing. Pause freezes wave time,
the tour, and automatic orbit; dragging still works. Manual camera interaction
suspends automatic orbit for four seconds. Reduced-motion preferences start both
wave animation and automatic orbit disabled.

## Mathematics

Indices `(i,j,k)` range from `-N` to `N`. A full crystal has `(2N+1)^3` points.
The display position is `1.6(i,j,k) + A*w(i,j,k,t)*(0,1,0)`. All motion stays
vertical. Color and a small change in radius encode the wave value.

For a rotating horizontal unit direction `d`, let `a = frequency*(i,k)·d`,
`b = frequency*(i,k)·d_perp`, `l = j*layerPhase`, and `t` include the phase offset:

- Traveling: `sin(a+l-t)`.
- Radial: `sin(frequency*sqrt(i²+k²)+l-t)`.
- Interference: `(sin(a+l-t)+sin(b-l-0.83t))/2`.
- Standing: `cos(a+l)*cos(0.7b)*sin(t)`.

The spherical window, horizontal layer, and coordinate-plane views filter integer
points; they do not change the lattice itself. The reference arrow shows `d`.

## Implementation and integration

`main.js` uses two point-cloud draws (sphere impostors and additive halos) plus
reference geometry. Wave displacement and color happen in shaders. Buffer geometry
is rebuilt only when lattice extent or the visible subset changes, and disposed
before replacement. Density ranges from N=3 to N=12 (15,625 points).

The original `nSlider`, `aSlider`, `kSlider`, `wSlider`, and `rSlider` IDs remain
valid for saved payloads. All new controls also have stable IDs. For example:

```json
{"#scenePreset":"pearl", "#glowSlider":0.4, "#orbitToggle":false}
```

Controls opt into shared grouping through `data-control-group`. The stage and
remote render Motion and Scenes immediately, with Wave field and Crystal & light
in collapsible sections. Native HTML labels supply accessible remote labels.

Run `tests/z3lattice.mjs` from the graphics test suite using the Playwright setup
in the parent README. It checks shader errors, scenes via remote commands,
cutaway counts, legacy payload IDs, maximum density, and mobile layout.
