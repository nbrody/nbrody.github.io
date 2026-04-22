# Creating a New Level in Math World

This doc walks through how to add a new explorable location (a "level") to
Math World. A level is a self-contained piece of geometry — a campus, a
landmark, a beach, etc. — that the player can teleport into and walk around.

The Atlas navigates a tree: **world → continent → region → city cluster →
location**. A level is a node at (or near) the leaves of that tree.

## TL;DR

1. **Research topography first.** Put your findings in a `refs/` folder next to
   the code (see [refs folder convention](#refs-folder-convention)).
2. **Write the level class** in the right region sub-module (e.g.
   `js/santaBarbara/ucsbCampus.js`). It renders into a supplied group and
   exposes a `getTerrainHeight(x, z)` function.
3. **Register it** in `js/main.js` (imports, region map, `ensureRegion`,
   `loadLocation` switch, teleport spawn pose).
4. **Unlock it** by setting `hasContent: true` in `js/regionalLocations.js`
   (or add it if it doesn't exist yet).
5. **Playtest** via the Atlas (press `M` to open).

---

## 1. Research topography FIRST

Before writing any code, research the real-world area. Accurate bearings and
scale make the level feel like a place; made-up geometry feels like a demo.

Do at least this much:

- **Get GPS coordinates** for the key landmarks you plan to model. Compute
  real east/north offsets from your chosen origin (usually the centerpiece
  building). 1° latitude ≈ 111 km; 1° longitude ≈ `111 * cos(lat) km`.
- **Get elevations** — at the origin, the perimeter, and any distinctive
  features (ridgelines, creeks, bluffs, lagoons).
- **Identify topographic features** that define the area: slopes, creeks,
  cliffs, coastlines, fault traces, plateaus.
- **Find a campus or area map** (usually available as PDF) and a satellite
  view. Save the ones you actually consulted into `refs/` — see below.

Use the `WebSearch` and `WebFetch` tools. When you're done, your code should
cite the real elevations and directions in the header comment. See
`js/berkeley/ucbCampus.js` and `js/santaBarbara/ucsbCampus.js` headers for
examples.

### Refs folder convention

Every region folder (`js/<region>/`) has a `refs/` subfolder. The refs folder
holds provenance for the geometry — the research that justifies what the code
renders. Keep it under version control; don't treat it as throwaway.

```
js/<region>/refs/
├── topography.md     # Research findings (elevations, GPS, slopes, creeks…)
├── sources.md        # URLs consulted, with short descriptions
├── <map-name>.pdf    # Official campus/area map(s) downloaded from the site
├── <feature>.png     # Screenshots of satellite views, topo overlays, etc.
└── <anything-else>   # Sketches, measured notes, license notes
```

Rules of thumb for the refs folder:

- **Small files only.** If a PDF is > 5 MB, link it from `sources.md` instead
  of committing it.
- **Always list provenance.** Every saved file should have an entry in
  `sources.md` with the URL it came from and the date of retrieval.
- **Respect licensing.** Wikipedia images are typically Creative Commons —
  cite the page. University campus maps are usually OK to keep as research
  artifacts. Don't commit obviously copyrighted photos.
- **Update, don't orphan.** If you change the geometry in response to new
  research, update `topography.md` so the code and the refs stay in sync.

---

## 2. Write the level class

Each level is a class that takes a `THREE.Group` to render into and an
optional regional-terrain height function to blend with. The class exposes
`generate()` (builds the geometry), `getTerrainHeight(x, z)` (used by the
player for collision), and `getInteractables()` (chalkboards, landmarks).

Follow the pattern in
[`js/santaBarbara/ucsbCampus.js`](js/santaBarbara/ucsbCampus.js) or
[`js/berkeley/ucbCampus.js`](js/berkeley/ucbCampus.js):

```js
import * as THREE from 'three';

export class MyLevel {
    constructor(group, terrainHeightFn = null) {
        this.group = group;
        this.worldSize = 640;          // tile size; outside this the
                                       // regional terrain takes over
        this.regionalTerrainFn = terrainHeightFn;
    }

    async generate() {
        this.createTerrain();
        this.createPaths();
        this.createBuildings();
        // …
    }

    // Local procedural terrain — called by the player and by every
    // object placement inside the level.
    localHeight(x, z) {
        let h = 0;
        // your shape: slopes, creeks, lagoon depressions, etc.
        return h;
    }

    // Blend local terrain into the regional terrain at the edge.
    getTerrainHeight(x, z) {
        const half = this.worldSize / 2;
        const margin = 30;
        const absX = Math.abs(x), absZ = Math.abs(z);
        if (absX < half - margin && absZ < half - margin) {
            return this.localHeight(x, z);
        }
        if (this.regionalTerrainFn) {
            // Blend zone near the edge
            if (absX < half && absZ < half) {
                const edgeDist = Math.min(half - absX, half - absZ);
                const t = Math.max(0, Math.min(1, edgeDist / margin));
                return this.localHeight(x, z) * t
                     + this.regionalTerrainFn(x, z) * (1 - t);
            }
            return this.regionalTerrainFn(x, z);
        }
        return this.localHeight(x, z);
    }

    getInteractables() {
        const out = [];
        this.group.traverse(obj => {
            if (obj.userData && obj.userData.isInteractable) out.push(obj);
        });
        return out;
    }
}
```

Conventions:

- **Origin** is the centerpiece landmark (tower, library, pier…). Document
  it in a header comment, along with axis directions (`-Z` is typically north).
- **Interactable objects** get `userData = { isInteractable: true, name, type,
  interactionType }` — the player's `E` key picks these up automatically.
- **Walkable surfaces** (paths, plazas, decks) set `userData.noCollision =
  true` so the player doesn't raycast-collide with them.
- **Shadows** — only cast shadows from important vertical geometry. Too many
  `castShadow=true` meshes tank framerate.
- **Materials** — reuse a few `MeshStandardMaterial` instances per class
  instead of creating one per mesh.

---

## 3. Wire it into `main.js`

Open [`js/main.js`](js/main.js) and update four things:

1. **Import** your new class, and the regional terrain if it's a new region:

    ```js
    import { MyLevel } from './myRegion/myLevel.js';
    ```

2. **Region mapping** — tell `LOCATION_REGIONS` which regional terrain your
   level lives on:

    ```js
    const LOCATION_REGIONS = {
        …
        myLevel: 'myRegion',
    };
    ```

3. **`loadLocation` switch** — pick the right class to instantiate:

    ```js
    case 'myLevel':
        this.locationContent = new MyLevel(this.locationGroup, localTerrainFn);
        break;
    ```

4. **`teleportTo` spawn pose** — where the player lands and which way they
   face:

    ```js
    } else if (locationId === 'myLevel') {
        spawnX = 0; spawnZ = 20; faceTowardZ = 0;
        initialYaw = 0;   // facing -Z (north)
    }
    ```

If your level lives in a brand-new region, also:

- Add a `REGION_COORDS` entry so GPS → local conversion works.
- Add a new branch in `ensureRegion()` that constructs the regional terrain.

---

## 4. Unlock it in the Atlas

Open [`js/regionalLocations.js`](js/regionalLocations.js) and make sure your
level has an entry with `hasContent: true`. The Atlas uses this to decide
whether a node is a **folder** (has children), a **leaf** (`hasContent: true`,
teleportable), or **locked** (neither).

```js
myLevel: {
    name: 'My Level',
    description: 'Short pitch',
    lat: 34.4140, lon: -119.8489,
    type: 'campus',
    hasContent: true,
    scaleLevel: 'city'
}
```

If you want the level reachable from the Atlas, also add it to the right
parent's `children` array in `LOCATION_TREE` (inside
[`js/atlas.js`](js/atlas.js)).

---

## 5. Playtest checklist

- Open the site, start the game, press `M`. Navigate to your level via
  `M`/arrows/`Enter` and select it.
- Walk to every major landmark. Does the terrain feel right? Any floating
  objects? Any z-fighting on paths?
- Press `E` near each interactable. Is the prompt showing the right name?
- Press `F3` to check framerate. Target is 60 fps on a mid-tier laptop.
- Re-open the Atlas, teleport away, teleport back — does the level clean up
  without leaving orphaned geometry?
- Check that the refs folder is up to date with whatever decisions the code
  reflects.

---

## Example: how we did UCSB

- **Research** (saved in
  [`js/santaBarbara/refs/`](js/santaBarbara/refs/)):
  - Topography: UCSB sits on a marine terrace ~15 m above sea level; ~9 m
    coastal cliffs; Campus Lagoon is ~90 acres.
  - Layout: Library → Plaza → Storke Tower → UCen → Lagoon all on one N-S
    axis; UCen is "perched on a hill above the lagoon."
- **Code**: [`js/santaBarbara/ucsbCampus.js`](js/santaBarbara/ucsbCampus.js)
  models all five buildings, the lagoon (with reeds + footbridge +
  observation deck), UCSB's signature red-pigmented bike paths with a
  roundabout, and palm-lined paths.
- **Wiring**: `main.js` maps `ucsb → santaBarbara` region, loads
  `SantaBarbaraTerrain`, spawns the player south of Storke Tower facing
  north.
- **Atlas**: `regionalLocations.js` has `ucsb.hasContent = true`, reachable
  via `santaBarbara → ucsb`.
