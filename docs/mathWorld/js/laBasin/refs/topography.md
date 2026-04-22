# Los Angeles Basin / Topanga Canyon — Topography & Layout Notes

Research findings behind `laBasin.js` (regional terrain) and
`topangaCanyon.js` (the local level). Update this file when the geometry
changes so the code and the refs stay in sync.

Researched: 2026-04-21. See `sources.md` for URLs.

## Regional setting

Topanga Canyon cuts through the **Santa Monica Mountains** — an east-west
range separating the Pacific coast from the San Fernando Valley. Key
reference elevations in the region:

| Location                                | Approx. elevation |
|-----------------------------------------|-------------------|
| Pacific Ocean (sea level)               | 0 m               |
| Topanga Beach (mouth of the canyon)     | ~1 m              |
| Topanga town center (by Country Store)  | ~110 m            |
| Old Topanga Canyon Rd junction          | ~180 m            |
| Topanga State Park, Trippet Ranch       | ~370 m            |
| Topanga Lookout (west ridge)            | ~500 m            |
| Saddle Peak (west of canyon)            | 855 m (2805 ft)   |
| Cahuenga Peak (Hollywood sign area)     | 520 m             |
| LA basin floor (downtown LA)            | ~90 m             |

The mountains rise abruptly from the coast — within 1.5 km of the
shoreline the land climbs to 500+ m. Topanga Creek has carved a narrow
defile through this ridgeline that CA Highway 27 (Topanga Canyon Blvd)
follows from the Pacific Coast Highway up to the San Fernando Valley.

## Topanga Canyon (the level's subject)

The level models a ~800 m × 800 m patch of the canyon centered roughly at
the Topanga Country Store — the symbolic heart of the town.

### GPS reference points (canyon section)

| Landmark                       | GPS                     | Notes                       |
|--------------------------------|-------------------------|-----------------------------|
| Topanga Country Store          | 34.0934, -118.6020      | Origin of the local level   |
| Topanga Creek (at town center) | parallel to store       | Flows south                 |
| Topanga Canyon Blvd (CA-27)    | passes 30-40 m east of store | N-S through canyon     |
| Theatricum Botanicum           | 34.0985, -118.6008      | ~600 m north of origin      |
| Old Topanga Canyon Rd junction | 34.0970, -118.6060      | NW of town                  |
| Topanga State Park entrance    | 34.0967, -118.5819      | Well east of canyon proper  |
| Topanga Beach (canyon mouth)   | 34.0380, -118.5823      | 6 km south, outside level   |

### Canyon cross-section at the town

At the Country Store the canyon floor is narrow — about 60–90 m wide
between the sharp toe-of-slopes on each side. The creek runs along the
western edge of the valley floor; CA-27 is elevated slightly on a berm
on the eastern edge. Measured cross-section:

| From centerline | Height above valley floor        |
|-----------------|----------------------------------|
| 0 m (creek)     | -3 m (creek bed)                 |
| ±30 m           | ~0 m (valley floor, road level)  |
| ±80 m           | ~15 m (toe-of-slope)             |
| ±200 m          | ~80 m (mid-slope, oak woodland)  |
| ±400 m          | ~160 m (upper slope, chaparral)  |

The canyon feels tall and narrow because the vertical rise (~160 m)
happens within ~400 m horizontal — a 40% grade on the upper slopes.

### Vegetation zones

- **Creek corridor** (valley floor ±15 m): California sycamore
  (*Platanus racemosa*), white alder, willow. Tall, pale-barked.
- **Lower slopes** (valley floor to ~80 m above): coast live oak
  (*Quercus agrifolia*) woodland — dark green, rounded crowns, dense.
- **Mid slopes**: mix of oak woodland and chaparral, with some
  eucalyptus near the old town.
- **Upper slopes and ridges** (~100 m above floor): chaparral —
  dense low scrub of ceanothus, chamise, manzanita, sage. Greys and
  muted greens.

### Cultural features

Topanga is a legendary artist/counterculture enclave. The built
landscape is deliberately rustic — wooden cabins tucked into oaks,
hand-painted signs, outdoor sculpture, tiered wooden amphitheaters.
The level captures this with:

- The **Country Store** (1930s, red-painted wooden building with
  front porch) as the origin landmark.
- **Theatricum Botanicum** — outdoor Shakespeare theater with tiered
  wooden bench seating around a round stage.
- **Topanga Canyon Boulevard** — two-lane rural highway winding along
  the creek. Asphalt, dashed yellow center line, no shoulder in
  places.
- Scattered **rustic cabins** on the lower slopes: cedar-sided,
  green roofs, porches, mailboxes at the road.
- **Art Gallery** / general store cluster across the street from the
  Country Store.

## In-game compression (Topanga)

| Real feature                     | In-game representation                            |
|----------------------------------|---------------------------------------------------|
| 500 m canyon-wall rise over 1.5 km | 160 m rise over 400 m (steeper, more dramatic) |
| Canyon floor ~70 m wide          | Valley floor ~60 m wide                           |
| Creek bed -2 m from floor        | Creek bed -3 m (slightly deeper for readability)  |
| Topanga Cyn Blvd ~8 m asphalt    | Road 7 m wide + 1 m shoulder on each side         |
| ~12 minutes of driving town span | Compressed to ~300 m walkable scene               |

---

# Venice Beach & Santa Monica Pier

The Venice Beach level covers the iconic coastal strip from Venice Beach
north to the Santa Monica Pier. In reality the two landmarks are ~3 km
apart along the coast; in-game they're compressed to ~400 m so the
player can walk the entire iconic stretch.

## GPS reference points

| Landmark                          | GPS                    | Notes                   |
|-----------------------------------|------------------------|-------------------------|
| Venice Beach boardwalk (origin)   | 33.9850, -118.4695     | Player spawn            |
| Muscle Beach                      | 33.9877, -118.4729     | ~300 m N of origin      |
| Venice Skatepark                  | 33.9887, -118.4733     | Iconic concrete bowls   |
| Public Art Walls (graffiti)       | 33.9886, -118.4726     | Sanctioned graffiti     |
| Venice Pier (Washington Blvd)     | 33.9785, -118.4760     | Small pier S of origin  |
| Santa Monica Pier                 | 34.0086, -118.4979     | 3 km N in reality       |
| End of Route 66 sign              | at Santa Monica Pier   | Famous photo op         |
| Pacific Park (on the pier)        | at pier end            | Ferris wheel + coaster  |

## Real-world features modelled

Venice's coastal strip has a remarkably consistent cross-section running
N-S. Moving from the ocean inland:

| Zone                | Approximate width | Notes                           |
|---------------------|-------------------|---------------------------------|
| Pacific Ocean       | —                 | Sea level, -1 m                 |
| Sandy beach         | 80–150 m          | Wide, flat, at 0–2 m elevation  |
| Boardwalk           | 6 m               | Concrete pedestrian promenade   |
| Bike path           | 4 m               | Paved cycling path, parallel    |
| Storefront strip    | 8 m               | Cafes, tattoo parlors, vendors  |
| Palm-lined setback  | 3 m               | Canary Island palms             |

Key iconic elements:

- **Muscle Beach** — outdoor gym pen on the sand: chin-up bars, parallel
  bars, weight benches, iconic blue-and-yellow signage. Origin 1934.
- **Venice Skatepark** — 16,000 sq ft of concrete bowls, snake run, and
  street plaza opened in 2009. Replaced the original "Dogtown" skaters'
  haunt.
- **Basketball courts** — famous half-court where *White Men Can't Jump*
  was filmed.
- **Public Art Walls** — sanctioned legal graffiti walls covered in
  constantly-changing murals.
- **Ocean Front Walk** (the "boardwalk") — not actually a wooden boardwalk
  but a concrete promenade, the scene of street performers, vendors,
  fortune tellers, henna tattoo stalls.

## Santa Monica Pier (modeled at the north end of the scene)

The Santa Monica Pier is actually two adjoined piers: the newer
**Pleasure Pier** (1916) carrying Pacific Park, and the older
**Municipal Pier** (1909) extending further out. In-game we merge them
into one ~400 m wooden structure with:

- **Wooden deck** (~18 m wide) running westward from the shore
- **Pacific Park amusement park** on the widened section near the base:
  - **Pacific Wheel** — 41 m tall solar-powered Ferris wheel (world's
    first and only solar-powered pier Ferris wheel).
  - **West Coaster** — 18 m steel roller coaster with helical loops.
  - **Arcade building** — large open pavilion.
- **Looff Hippodrome** — 1916 octagonal carousel building at the pier
  entrance, painted red/cream with a pyramidal roof.
- **Route 66 End of the Trail sign** — iconic photo-op shield near the
  pier entrance, marking the symbolic western terminus.
- **Pier railings + pilings** — wooden posts + crossbeams the whole
  length; exposed pilings visible in the water.
- **Fishing section** at the far western end.

## In-game compression (Venice + pier)

| Real feature                       | In-game representation              |
|------------------------------------|-------------------------------------|
| Venice Beach → SM Pier: 3 km       | Compressed to ~370 m                |
| SM Pier: 490 m long                | 400 m long in-game                  |
| Pier deck height above water: 9 m  | 6 m (easier to read visually)       |
| Pacific Wheel: 41 m tall           | 30 m (readable at pier scale)       |
| Pier width: 18 m                   | 18 m (same)                         |
| Beach width: 100–150 m             | 70 m                                |

## Player spawn

Player spawns on the Venice boardwalk at 33.9850, -118.4695, facing
**north** toward Muscle Beach, the skatepark, and the Santa Monica
Pier visible beyond. The pier's Ferris wheel is the landmark anchor
at the far end of the boardwalk.

## Player spawn

The player spawns on the valley floor next to the Topanga Country
Store, facing north up the canyon. From here they can walk:

- North along the road past Theatricum Botanicum
- Down to the creek (west of the road)
- Up the oak-covered lower slopes to the east
- Into the Country Store (interactable)

## Design notes

- **Origin** is the Country Store at (0, 0, 0) local. The canyon runs
  roughly N-S so `-Z` is north (up-canyon), `+Z` is south (down-canyon
  toward the ocean).
- **Road and creek** are parallel features running along the Z axis.
  Creek at `x ≈ -12`, road at `x ≈ +10`. Valley floor between.
- **Canyon walls** rise via `localHeight(x, z)` — a smooth `abs(x)`
  slope with creek carving and ridge noise, blending to the regional
  terrain at the level boundary.
- **Orientation** — the road curves gently so the player doesn't see
  a perfectly straight road disappearing to the horizon. The creek
  has its own sinuous path slightly out of phase with the road.
