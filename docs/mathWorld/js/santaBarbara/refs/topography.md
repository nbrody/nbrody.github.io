# UC Santa Barbara — Topography & Layout Notes

Research findings that drive the geometry in `ucsbCampus.js` and
`santaBarbara.js`. Update this file when you update the code.

Researched: 2026-04-21. See `sources.md` for URLs.

## Regional setting

UCSB's main campus sits on a **coastal marine terrace** / mesa, roughly 15 m
(50 ft) above sea level, on a thumb of land surrounded on three sides by the
Pacific Ocean. The campus is bounded by:

- **North** — Isla Vista and UCSB's North Campus (across El Colegio Rd)
- **East** — Campus Lagoon, then Goleta Beach County Park
- **South** — Coastal cliffs (~9 m / 30 ft drop) into the Pacific
- **West** — West Campus, Devereux Slough

The cliffs are cut into **late-Pleistocene marine terrace deposits (~45,000
years old)**, raised to their current elevation by tectonic uplift and
Pleistocene eustatic sea-level drops. Rockfalls are an ongoing erosion issue
(see the UCSB Shoreline Adaptation Project in `sources.md`).

## Elevations

| Location                    | Elevation          |
|-----------------------------|--------------------|
| Beach                       | ~0 m (sea level)   |
| Top of coastal cliff        | ~9–15 m            |
| Campus mesa (general)       | ~15 m              |
| Storke Tower ground floor   | ~14 m              |
| Storke Tower summit         | ~67 m (175 ft tall)|

The mesa is **remarkably flat** across the academic core — within ~300 m of
Storke Tower, natural elevation variation is under 1 m. Our `localHeight()`
function only adds a gentle organic roll + the Lagoon depression + the cliff.

## Campus Lagoon

- **Saltwater**, connected to the Pacific by a narrow inlet.
- **~90 acres** (~360,000 m²) in a roughly C-shape wrapping the SE/S/SW of
  the academic core.
- Modeled as an ellipse (95 × 55 m) for the game — heavily compressed.
- Host to tidal exchange, migratory birds, kelp wrack. Small islands inside
  are used for nesting.

## Main campus N-S spine

UCSB's academic core is arranged along a single north-south axis:

```
 (NORTH)
   Davidson Library
   │
   Bus circle
   │
   Storke Plaza  (Storke Tower at its north end)
   │
   Bike roundabout
   │
   UCen  (University Center, perched on the lagoon's north shore)
   │
   Campus Lagoon
   │
   Goleta Point / coastal cliffs
 (SOUTH)
```

## Landmark positions (relative to Storke Tower)

| Landmark          | GPS                   | Δ from Storke Tower     |
|-------------------|-----------------------|-------------------------|
| Storke Tower      | 34.4125, -119.8483    | (origin)                |
| Davidson Library  | ~34.4141, -119.8482   | ~175 m N                |
| South Hall        | 34.414005, -119.847603| ~170 m N, ~65 m E       |
| UCen              | ~34.4120, -119.8438   | ~55 m S, ~415 m E *     |
| Campus Lagoon ctr | ~34.4095, -119.8427   | ~340 m S, ~500 m E *    |

\* UCSB's real east-west positions are more spread out than the game's
compressed layout. In-game positions are about 50% of the real distances.

## Storke Tower (the bell tower)

- **175 ft (53 m) tall** — the tallest steel/cement structure in Santa
  Barbara County.
- Houses a **61-bell carillon**; bells from 13 lb to 4,793 lb. The largest
  bell carries the UC seal.
- Plays the **Westminster Quarters** every hour; the ten largest bells spell
  out the UC motto *"Let There Be Light"* at 10 minutes before each hour.
- Located in the **center of campus** overlooking Storke Plaza (to its south).

## Bike paths

UCSB is famously **bike-dependent**. The main academic core is circled by an
outer loop of red-pigmented concrete bike paths with:

- Dashed white center lines (two-way traffic)
- Dedicated bike traffic signals and **roundabouts** (trademark UCSB feature)
- Separation from pedestrian walkways wherever possible

We model one outer loop, two spurs, and one roundabout in front of UCen.

## Design notes

- **Scale compression.** Real Storke → Library distance is ~175 m; we use
  95 m (a ~55% compression). Similar compression applies to other distances.
  This keeps the level traversable on foot in a reasonable time.
- **Axis orientation.** Code origin = Storke Tower base; `-Z` is north
  (toward Library), `+Z` is south (toward Lagoon), `+X` is east (toward
  South Hall and UCen).
- **Cliff location in code.** The cliff drop kicks in at `z > 230`, past the
  southern shore of the Lagoon. The Lagoon sits on the mesa itself.
