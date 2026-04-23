# Downtown Santa Barbara — Research Notes

Research behind `downtownSB.js`. Update this file when the geometry
changes so code and refs stay in sync.

Researched: 2026-04-22.

## Setting

Downtown Santa Barbara runs roughly NE-SW along State Street from the
foothills of the Santa Ynez Mountains down to the Pacific at Stearns
Wharf (Cabrillo Blvd). The defining look is **Spanish Colonial
Revival** — white/cream stucco walls, red terracotta tile roofs,
wrought iron, arched windows, and courtyards. The look dates from a
1925 earthquake + an ordinance adopted in its aftermath that requires
new downtown construction to match the style.

Key urban-design facts:
- **State Street** runs NE-SW (rotated ~45° from true north).
  In-game we align it to the Z-axis (N-S) for simplicity; mountains
  stay "north" (-Z) and ocean stays "south" (+Z).
- State Street is **pedestrianised** from about the 500 block through
  the 1000 block (the "State Street Promenade"; since 2020). Cars
  still cross on Anapamu, Carrillo, etc.
- Downtown blocks are ~150 m × 75 m (long axis parallel to State).
  In-game we compress to ~80 m × 75 m.
- Elevation is ~5-15 m above sea level across the grid; rises gently
  to the north as you approach the Mission and the foothills.

## GPS reference points

| Landmark                          | GPS                  | Notes                          |
|-----------------------------------|----------------------|--------------------------------|
| State St & Anapamu St (origin)    | 34.4208, -119.6982   | Player spawn                   |
| Santa Barbara Courthouse          | 34.4240, -119.7025   | Anacapa & Anapamu, E of origin |
| Granada Theatre                   | 34.4206, -119.6983   | 1214 State St                  |
| Arlington Theatre                 | 34.4217, -119.7003   | 1317 State St                  |
| Paseo Nuevo                       | 34.4185, -119.6977   | 700 block State, W side        |
| El Paseo                          | 34.4194, -119.6981   | 800 State, arcaded plaza       |
| Santa Barbara Museum of Art       | 34.4217, -119.6996   | 1130 State                     |
| La Arcada Plaza                   | 34.4217, -119.7012   | 1114 State                     |
| Public Library (Main branch)      | 34.4236, -119.7018   | Anapamu, west of courthouse    |
| Cabrillo Blvd & State             | 34.4135, -119.6927   | Beach front, south end         |
| Stearns Wharf (entrance)          | 34.4100, -119.6850   | Wooden pier to the Pacific     |
| Santa Barbara Harbor              | 34.4033, -119.6925   | SW of downtown, sailboats      |
| Mission Santa Barbara             | 34.4381, -119.7137   | NW, foothills — not in level   |

## Street grid (in-game local coords)

Origin at State & Anapamu. +Z = south (ocean), +X = east (toward
courthouse).

### N-S streets (x positions):

| Street           |  x    |
|------------------|-------|
| De la Vina       | -200  |
| Chapala          | -120  |
| State            |    0  |
| Anacapa          |  +80  |
| Santa Barbara    | +160  |
| Garden           | +240  |

### E-W streets (z positions), 75 m apart:

| Street            |  z    | Notes                             |
|-------------------|-------|-----------------------------------|
| Sola              | -150  |                                    |
| Victoria          |  -75  |                                    |
| Anapamu           |    0  | Origin; courthouse at Anacapa     |
| Figueroa          |  +75  |                                    |
| Carrillo          | +150  |                                    |
| Canon Perdido     | +225  |                                    |
| De la Guerra      | +300  | Historic centre, plaza            |
| Ortega            | +375  |                                    |
| Cota              | +450  |                                    |
| Haley             | +525  |                                    |
| Gutierrez         | +600  |                                    |
| Yanonali          | +675  | Funk Zone N edge                  |
| Cabrillo Blvd     | +750  | Beachfront, palm-lined            |

Beach sand: z ∈ [+760, +800]
Stearns Wharf pier: z ∈ [+790, +950] (~160 m, compressed from real 700 m)

## Landmarks — in-game positions

| Landmark                 | Local (x, z)  | Notes                             |
|--------------------------|---------------|-----------------------------------|
| SB Courthouse            | (+80, 0)      | Anapamu & Anacapa                 |
| Courthouse Sunken Gardens| (+80, -40)    | North of courthouse               |
| El Mirador bell tower    | (+70, +10)    | On courthouse SW corner           |
| Granada Theatre          | (0, +60)      | State & Canon Perdido-ish         |
| Arlington Theatre        | (0, -10)      | State & Anapamu, north side       |
| SB Museum of Art         | (0, -30)      | State @ 1130 block                |
| Paseo Nuevo              | (-30, +200)   | 700 State, west of street         |
| El Paseo                 | (+35, +120)   | 800 State, east of street         |
| La Arcada Plaza          | (-35, -30)    | 1114 State, west                  |
| Public Library           | (+30, 0)      | Anapamu, W of courthouse          |
| Paseo Nuevo Nordstrom    | (-80, +250)   | Anchor at west end of mall        |
| Stearns Wharf base       | (+20, +780)   | At State & Cabrillo               |
| Wharf end (shops)        | (+20, +935)   | End of pier                       |
| Harbor                   | (-400, +700)  | SW, sailboats + breakwater        |
| Funk Zone (industrial)   | (+140, +680)  | East of Cabrillo, warehouses      |

## Materials palette

Spanish Colonial Revival is distinctive — almost every building
shares the same palette. Share `MeshStandardMaterial` instances for
perf.

- **Stucco walls**: `0xF2EEE2` (off-white), `0xE8DCBA` (cream),
  `0xDFC99C` (pale yellow), `0xD8A885` (salmon)
- **Terracotta roof tiles**: `0xA84E32`, `0xCC5A3A`, `0x8B4A36`
- **Wrought iron**: `0x2A1A10`
- **Glass**: `0x6F8AA3` (bluish)
- **Dark wood**: `0x3E2A1A`
- **Palm trunk**: `0x6B5238`
- **Palm fronds**: `0x3F6B2A`, `0x4A7A35`
- **Bougainvillea**: `0xB82A6E` (magenta), `0xD04B8C` (pink),
  `0xC92A2A` (red), `0xF07298` (light pink)
- **Beach sand**: `0xE8D7A6`
- **Ocean**: `0x1E5F82`
- **Asphalt**: `0x2E2E30`
- **Sidewalk concrete**: `0xCBC3B4`

## Architectural elements (reusable)

- **Arched window/door**: rectangle with a semi-circular top
- **Red clay barrel tile roof**: slightly striped texture; easy way
  is vertex colouring on a thin pitched slab
- **Bell tower (campanile)**: stepped square tower, arched openings
  near top, pyramidal tile cap, finial cross
- **Archway colonnade**: row of arched openings (El Paseo, courthouse
  loggia)
- **Courtyard with fountain**: open central space, round fountain,
  surrounding arcade
- **Wrought-iron balcony**: thin horizontal rail + vertical balusters
- **Decorative tile mosaic**: small colourful tile panel (Canvas
  texture)

## In-game compression

| Real feature                    | In-game                            |
|---------------------------------|-------------------------------------|
| State & Anapamu → beach ~3 km   | ~750 m (4× compression)             |
| Block length ~150 m             | ~75-80 m                            |
| Stearns Wharf 700 m             | 160 m (4× compression)              |
| Courthouse 180 × 75 m           | ~60 × 40 m footprint                |
| El Mirador tower ~26 m tall     | Modelled at 28 m for prominence     |

## Player spawn

Spawn at **State & Anapamu, facing north up State Street** (toward
Arlington Theatre and, beyond, the foothills / mission). Behind the
player looking south: 750 m of State Street down to Cabrillo Blvd +
the wharf + the ocean.

```
spawnX = -4; spawnZ = 20; initialYaw = 0;  // facing -Z (north)
```
