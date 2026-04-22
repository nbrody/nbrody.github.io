# Santa Cruz — Research References

This folder holds the topographic and layout research behind the Santa Cruz
region terrain and its sub-levels (UCSC campus, Steamer Lane, the Beach
Boardwalk, etc.).

**Status:** stub. The geometry was built before the `refs/` convention was
introduced. If you work on any of the Santa Cruz content, please
backfill the research here as you touch each sub-level.

See [`../../LEVELS.md`](../../LEVELS.md) for the refs folder convention.

## Sub-levels to document

- **Santa Cruz regional terrain** (`santaCruz.js`) — Monterey Bay coastline,
  Pogonip / UCSC redwood uplands, mountain rise toward the north.
- **UCSC campus** (`ucscCampus.js`) — McHenry Library, redwood groves,
  hilltop setting at ~180 m elevation.
- **Steamer Lane** (`steamerLane.js`) — West Cliff surf break, Mark Abbott
  Memorial Lighthouse.
- **Beach Boardwalk** (`boardwalk.js`) — historic amusement park at
  sea level next to the San Lorenzo River mouth.

## Suggested file layout

```
refs/
├── region/
│   ├── topography.md
│   └── sources.md
├── ucsc/
│   ├── topography.md
│   └── sources.md
├── steamerLane/
│   ├── topography.md
│   └── sources.md
└── boardwalk/
    ├── topography.md
    └── sources.md
```
