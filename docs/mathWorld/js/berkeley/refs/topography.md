# UC Berkeley — Topography & Layout Notes

These are the research findings that drive the geometry in
`ucbCampus.js`. When you change the geometry, update this file too so the
code and the refs stay in sync.

Researched: 2026-04-21. See `sources.md` for URLs.

## Elevations (m above mean sea level)

| Location                        | Elevation   |
|---------------------------------|-------------|
| West edge of campus (Oxford St) | ~55 m       |
| Dwight Way & Telegraph          | ~65 m       |
| Bancroft Way & Telegraph        | ~80 m       |
| Memorial Glade                  | ~85 m       |
| Sather Tower / Campanile base   | ~85 m       |
| Hearst Greek Theatre            | ~130 m      |
| East edge (Memorial Stadium)    | ~130 m      |
| Foothill residence halls        | ~180 m      |
| Grizzly Peak / MSRI (SLMath)    | ~370 m      |

The main campus slopes ~3–4% west→east. The Berkeley Hills east of campus
climb much faster — roughly 240 m of vertical over ~1.5 km horizontal
(~15% grade) between Memorial Stadium and MSRI.

The **Hayward Fault** runs along the base of the hills and passes **directly
under Memorial Stadium** — hence the stadium's ongoing seismic retrofit. This
is why the local grade steepens so abruptly at the east edge.

## Strawberry Creek

Two forks feed the campus:

- **South Fork** — emerges from culverts at the mouth of Strawberry Canyon
  (east edge, near the stadium), surfaces in **Faculty Glade**, and flows
  west through the south half of campus before going underground near the
  west edge. This is the fork modeled in the game at `z ≈ +55`.
- **North Fork** — runs through the north end of campus, near the Mining
  Circle area. Not currently modeled.

## Landmark positions (relative to Sather Tower)

| Landmark                | GPS                | Δ from Sather Tower         |
|-------------------------|--------------------|-----------------------------|
| Sather Tower            | 37.8719, -122.2578 | (origin)                    |
| Doe Library             | ~37.8723, -122.2583 | ~45 m N, ~45 m W (entrance N) |
| Memorial Glade          | ~37.8721, -122.2580 | between Doe and Campanile   |
| South Hall              | ~37.8716, -122.2574 | ~33 m S, ~35 m E            |
| Wheeler Hall            | ~37.8708, -122.2578 | ~120 m S                    |
| Sather Gate             | ~37.8707, -122.2578 | ~130 m S, crosses creek     |
| Sproul Plaza (center)   | ~37.8695, -122.2589 | ~270 m S                    |
| Bancroft & Telegraph    | ~37.8692, -122.2585 | ~300 m S                    |
| Durant & Telegraph      | ~37.8680, -122.2585 | ~430 m S                    |
| Channing & Telegraph    | ~37.8672, -122.2585 | ~520 m S                    |
| Haste & Telegraph       | ~37.8663, -122.2585 | ~620 m S                    |
| Dwight & Telegraph      | 37.8635, -122.2584 | ~930 m S, ~10 m E           |
| Evans Hall              | ~37.8736, -122.2580 | ~190 m N                    |
| SLMath / MSRI           | 37.8790, -122.2436 | ~800 m N, ~1300 m E, +285 m |

## Telegraph Avenue district

The four blocks south of campus between **Bancroft Way** and **Dwight Way**
are the iconic pedestrian strip immediately south of the Sproul Plaza
entrance. Real block lengths are ~125 m each (~500 m total). In-game we
compress them to ~50 m per block so the walk from Dwight to the Campanile
is ~320 m instead of ~900 m.

In-game Z-positions (with Sather Tower at `z = 0`, +Z = south):

| Cross street   | Real Δ from Sather Tower | Game `z` | Notes                        |
|----------------|--------------------------|---------:|------------------------------|
| Bancroft Way   | ~300 m S                 |    `+118` | South campus boundary        |
| Durant Ave     | ~430 m S                 |    `+170` |                              |
| Channing Way   | ~520 m S                 |    `+220` |                              |
| Haste St       | ~620 m S                 |    `+270` |                              |
| Dwight Way     | ~930 m S                 |    `+320` | Player spawn is here         |

Notable storefronts represented: Pegasus Books, Caffé Strada, Top Dog,
Rasputin Music, Shakespeare & Co., Moe's Books, Amoeba Music, Caffè
Mediterraneum, People's Park, and others. Shop facade colors and awning
palettes are modeled to evoke Telegraph's eclectic painted-facade feel,
but building geometry itself is abstracted.

## Design notes

- **Scale compression.** In-game, SLMath is placed at `(150, -165)` with a
  peak of 170 m instead of its real ~1500 m distance / 285 m rise. That's
  a ~10× horizontal compression. Keep this in mind when adding new
  hillside content.
- **Telegraph compression.** Blocks are compressed ~2.5× horizontally so
  the walk from the Dwight spawn to the Campanile feels brisk rather than
  a half-kilometer slog.
- **Campus axis.** Campanile Way forms the east-west axis. The main
  north-south axis runs from Sather Gate through the Campanile to Doe
  Library, with Telegraph Avenue extending it south to Dwight.
- **Quadrants.** Wikipedia's "Campus of UC Berkeley" splits the campus into
  four zones: the park-like west, the monumental central core, the hilly
  east (dominated by the Berkeley Hills), and the athletic south.
- **Player spawn.** The Berkeley scene opens at the NW corner of Dwight &
  Telegraph (`spawnX = -11, spawnZ = 318`) looking north up Telegraph
  toward Sproul Plaza and the Campanile — the classic on-foot approach.
