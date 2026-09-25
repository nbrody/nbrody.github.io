# Block Cloud — sampled cloudscape

The scene is an unbounded horizontal cloudscape with a **768-world-unit period**.
A seeded, repeating 32³ noise texture feeds three octaves of a continuous signed
implicit field. A vertical density profile makes floating banks rather than a
finite collection of sphere primitives. The texture contains noise, not cloud
occupancy; the cloud field is evaluated in the shader at arbitrary world points.

## Grid sampling

For every integer cell `(i,j,k)`, sample the cloud field at
`cellSize * (i+½,j+½,k+½)`. If that value is negative, render the entire cube
centered at that sample. Otherwise leave it empty. A voxel DDA traverses this
implicit grid front to back and returns the first occupied cell and its exact
face normal. There is no interpolation between smooth and block SDFs, no
partially filled cubes, and no finite cluster boundary.

Cube size switches instantly every **10 seconds**, without interpolation:

```
time:          0–10s   10–20s   20–30s   repeat
cube scale:       1×       ¼×       4×
grid spacing:      h      h/4       4h
```

These are side lengths along every axis, relative to the base grid spacing.
The field, seed, and world-grid origin remain fixed. Each new cell independently
samples the cloud field at its center. The sidebar and remote can adjust the
seconds between changes or pause on the current size. Orange frames remain the
only palette. Sampling uses elapsed time so slower rendering does not stretch
the interval.

## Flight and clearance

The camera travels forward at a fixed height above the cloud layer, looking
**12 degrees downward** with no roll, vertical bobbing, or changing pitch.
Long straight stretches are joined by eased left/right turns. The target always
follows the horizontal travel direction at the same viewing angle.

The upper bound of the cloud field follows analytically from the maximum noise
value and vertical density profile. Camera height includes that bound, half the
largest cell height across the entire sampling cycle, a precision margin, and
the selected height above the layer (6 units by default, minimum 2). Thus grid
resampling never moves the camera up/down or puts blocks around it. Changing
cloud or height settings can reposition the flight level; ordinary flight keeps
it fixed. Cloud geometry is not erased around the camera.

## Controls and implementation

The stage sidebar, phone remote, and saved playlist payloads expose cloud seed,
fullness, detail, base spacing, cycle length, flight speed, height above the cloud layer,
glow, haze, and rendering quality. Reduced-motion preferences start flight and
resampling paused. WebGL 2 is required.

```json
{"#seed":2718,"#cellSize":1.5,"#morphToggle":true,"#cycleSeconds":10,"#flightToggle":true}
```

`scene.js` contains the seeded noise, CPU field, sampling equations, and camera
planner. `cloud.frag` evaluates the same field and renders occupied cells with
DDA traversal. This is original shader code; the supplied reference informed
the orange-frame visual direction.

`tests/blockCloud.mjs` checks periodicity, instant 1×/¼×/4× size changes at ten-second boundaries, camera
clearance across seeds/spacings, nearby occupied cells, forward progress, shader
compilation, remote commands, and animated resampling. Use the Playwright setup
in the parent README.
