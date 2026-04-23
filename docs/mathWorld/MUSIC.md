# Music Events in Math World

Math World doubles as a 3D archive of concerts I've been to. A
**venue** is a real landmark that lives *inside* an existing level —
the Greek Theatre is part of the UC Berkeley campus, the Fox is part
of downtown Oakland, and so on. A **show** is one specific night at
that venue (date, artist, setlist, weather, memory).

When you walk up to a venue inside a level and press `E`, a show
picker appears. Pick a show and the venue re-dresses in place —
lighting mood, stage banner, crowd density, weather — like
time-lapsing through nights. Pick "Just the venue" to leave it empty.

This doc complements [LEVELS.md](LEVELS.md): levels stay the primary
unit; venues are interactable fixtures inside them.

---

## TL;DR

1. **Make sure the parent level exists.** Greek Theatre → UC Berkeley
   (`js/berkeley/ucbCampus.js`). If the level doesn't exist yet, add
   it first using [LEVELS.md](LEVELS.md).
2. **Add the venue geometry to that level's class.** Expose it as a
   single `THREE.Group` tagged as a music venue (§3).
3. **Register the venue** in `js/music/venues.js` with its ID and
   metadata.
4. **Add the shows** to `js/music/shows.js` with date, artist, and
   scene-dressing fields (§4).
5. **Walk up, press `E`, pick a show.** The venue re-dresses in place.

---

## Why this design?

A venue isn't its own teleport destination — going to the Greek only
makes sense if you first walk through UC Berkeley campus. So a venue
is geometry *inside* a level, not a level of its own. The venue
renders as an ordinary campus landmark when nothing's selected; the
show-specific atmosphere is additive.

Three layers of permanence, each in its own place:

- **Levels** (`js/<region>/<level>.js`) — permanent campus / city /
  neighborhood geometry. Doesn't know anything about shows.
- **Venues** (`js/music/venues.js`) — a thin registry of which
  interactable in which level is a music venue, plus its anchors
  (stage, crowd area, banner plane, marquee).
- **Shows** (`js/music/shows.js`) — the actual history, referencing
  venues by ID.

A show references its venue by ID. The level always draws the venue;
the show overlay layers on top.

---

## 1. Architecture

```
┌──────────────────────────────────────┐
│ Atlas (M) → UC Berkeley              │
└──────────────────┬───────────────────┘
                   │ teleport
                   ▼
┌──────────────────────────────────────┐
│ UCBerkeleyCampus loads.              │
│ Greek Theatre sits at ~(330, 0,-155) │
│ as part of the campus, empty.        │
└──────────────────┬───────────────────┘
                   │ walk to the Greek's entrance
                   │ E pressed on the interactable
                   ▼
┌──────────────────────────────────────┐
│ Show picker overlay                  │
│   ▸ Phish · 2010-08-07 · night 3     │
│   ▸ Phish · 2010-08-06 · night 2     │
│   ▸ Phish · 2010-08-05 · night 1     │
│   ▸ Just the venue                   │
│   ▸ Cancel                           │
└──────────────────┬───────────────────┘
                   │ picks a show
                   ▼
┌──────────────────────────────────────┐
│ applyShow(show) on the venue group:  │
│   • lighting → night / clear         │
│   • crowd   → full, swaying          │
│   • banner  → phish-mockingbird      │
│   • marquee → "PHISH · 8/5/10"       │
│   • weather → warm summer haze       │
└──────────────────────────────────────┘
```

Player position and camera don't change when a show is applied —
the venue reconfigures around them as a ~400 ms cross-fade.

---

## 2. File layout

```
js/music/
├── venues.js           # Venue registry: id → { name, parentLevel, anchors, … }
├── shows.js            # Show registry:  list of { id, venueId, date, artist, … }
├── showOverlay.js      # HTML/CSS overlay + keyboard flow for the picker
├── sceneDressing.js    # Shared helpers: lighting, crowd, banners, weather
├── banners/<slug>.png  # Per-show banners
├── stubs/<slug>.jpg    # Optional ticket-stub images
├── audio/<slug>.mp3    # Optional ambient clips
└── refs/
    └── <venue-slug>.md # Research per venue
```

The actual venue *geometry* lives in the parent level file (e.g.
`createGreekTheatre()` inside `ucbCampus.js`) — NOT under `js/music/`.
That keeps `js/music/` purely about data and shared UI.

---

## 3. Embedding a venue in a level

A venue is one `THREE.Group` built inside the level's `generate()`.
It's marked as a music venue via `userData` so the show overlay and
scene-dressing helpers can find it.

In `js/berkeley/ucbCampus.js`:

```js
async generate() {
    // … existing campus stuff …
    this.createGreekTheatre();
}

createGreekTheatre() {
    const theatre = new THREE.Group();

    // Tag this group as an interactable + a music venue
    theatre.userData = {
        name: 'Greek Theatre',
        description: 'Hearst Greek Theatre — 1903 open-air amphitheatre.',
        isInteractable: true,
        type: 'venue',
        interactionType: 'See Shows',
        musicVenueId: 'greekBerkeley'   // ← key lookup into venues.js
    };

    // Build the permanent geometry: stone columns, semicircular
    // seating tiers, stage apron, stage house, entry arch.
    const stage = this._buildStage(…);
    const seating = this._buildSeating(…);
    const proscenium = this._buildProscenium(…);
    theatre.add(stage, seating, proscenium);

    // Expose ANCHORS so scene-dressing helpers know where to hang
    // the banner, where to spawn crowd silhouettes, and what area
    // counts as "inside the bowl" for lighting-mood changes.
    theatre.userData.anchors = {
        stage,              // where stage backdrop banners attach
        crowdArea: seating, // crowd density fills this area
        marquee: proscenium,
        bowlCenter: new THREE.Vector3(0, 0, 0)
    };

    // Position on campus (roughly NE of the Campanile)
    theatre.position.set(330, this.getTerrainHeight(330, -155), -155);
    this.group.add(theatre);
    this._greekTheatre = theatre;   // keep a reference for dressing
}
```

Conventions:

- **Always `userData.musicVenueId`** on the top-level venue group.
  That's how the show overlay detects "this interactable is a venue"
  when the player hits `E`.
- **Anchors** are named refs to sub-groups or Vector3s that the
  dressing helpers use. Use whichever of these apply:
  `stage`, `crowdArea`, `marquee`, `bowlCenter`, `bannerPlane`,
  `lightingRig`, `fogVolume`. Add new anchors if a venue needs
  something unusual.
- **No show-specific content** goes in the permanent geometry. An
  empty Greek Theatre should look convincing without a show.

---

## 4. Data model

### Venue registry — `js/music/venues.js`

```js
export const VENUES = {
    greekBerkeley: {
        id: 'greekBerkeley',
        name: 'Hearst Greek Theatre',
        city: 'Berkeley, CA',
        parentLevel: 'berkeley',           // matches key in LOCATION_REGIONS
        lat: 37.8733, lon: -122.2540,
        capacity: 8500,
        opened: 1903,
        style: 'amphitheatre',             // see §6
        description: 'Open-air Greek-inspired bowl above campus',
        refs: 'greekBerkeley.md'
    },

    fillmore: {
        id: 'fillmore',
        name: 'The Fillmore',
        city: 'San Francisco, CA',
        parentLevel: 'sanFrancisco',
        lat: 37.7843, lon: -122.4329,
        capacity: 1315,
        opened: 1912,
        style: 'club',
        description: 'Ballroom with chandeliers, posters, and apples'
    },

    // … more as they get built
};
```

Required: `id`, `name`, `parentLevel`, `lat`, `lon`, `style`.
Everything else informs the renderer or the picker UI.

### Show registry — `js/music/shows.js`

```js
export const SHOWS = [
    {
        id: 'phish-greekBerkeley-2010-08-05',
        venueId: 'greekBerkeley',
        date: '2010-08-05',
        artist: 'Phish',
        tour: 'Summer Tour 2010',
        runNote: 'Night 1 of 3',

        // Scene dressing — how the venue re-renders this night
        timeOfDay: 'night',
        weather: 'clear',
        crowdDensity: 'full',
        crowdMood: 'swaying',
        stageSetup: 'rock',
        banner: 'phish-mockingbird',

        notes: 'Back at the Greek after a long time. "Reba" set I.',
        setlistUrl: 'https://phish.net/setlists/phish-august-05-2010-…',
        rating: 5
    },
    {
        id: 'phish-greekBerkeley-2010-08-06',
        venueId: 'greekBerkeley',
        date: '2010-08-06',
        artist: 'Phish',
        tour: 'Summer Tour 2010',
        runNote: 'Night 2 of 3',
        timeOfDay: 'night',
        weather: 'overcast',
        crowdDensity: 'full',
        crowdMood: 'hype',
        stageSetup: 'rock',
        banner: 'phish-mockingbird',
        notes: '"Drowned" → "Crosseyed and Painless". Fog rolled in.',
        rating: 5
    },
    {
        id: 'phish-greekBerkeley-2010-08-07',
        venueId: 'greekBerkeley',
        date: '2010-08-07',
        artist: 'Phish',
        tour: 'Summer Tour 2010',
        runNote: 'Night 3 of 3',
        timeOfDay: 'night',
        weather: 'clear',
        crowdDensity: 'packed',
        crowdMood: 'swaying',
        stageSetup: 'rock',
        banner: 'phish-mockingbird',
        notes: 'Closer of the run. Long "Tweezer" → "Light". Emotional.',
        rating: 5
    }
];
```

Required: `id`, `venueId`, `date`, `artist`. Everything else is
optional; the renderer uses sensible defaults when a field is missing.

ID slug format: `{artist-kebab}-{venueId}-{YYYY-MM-DD}`. That sorts
naturally and stays unique across the whole archive.

---

## 5. Adding a new show

The normal path is **don't write show data by hand** — use the
Setlist.fm importer (§5a). Hand-editing is for when Setlist.fm
doesn't know about a show, or when you want to tweak the
scene-dressing fields for a show the importer already pulled in.

If you *do* hand-edit, it's pure data + assets:

1. **Append a row to `shows.js`** (as above). Leave out
   `setlistfmId` so the importer won't touch it.
2. **Drop the banner** at `js/music/banners/<banner-slug>.png`
   (512×256 PNG, transparent OK).
3. **Optional extras** — ticket stub image
   `js/music/stubs/<show-id>.jpg`, ambient clip
   `js/music/audio/<show-id>.mp3`.
4. **Done.** Next time you enter the parent level and approach the
   venue, the new show is in the picker.

### 5a. Bulk import from Setlist.fm

`tools/importSetlistFm.mjs` pulls attended shows from your Setlist.fm
account and rewrites `venues.js` + `shows.js`. Full instructions in
[tools/README.md](tools/README.md); the TL;DR:

```sh
# one-time: get an API key at https://api.setlist.fm/docs/1.0/index.html
export SETLISTFM_API_KEY='your-key'

# each time you've logged new shows on setlist.fm:
cd docs/mathWorld
node tools/importSetlistFm.mjs <your-setlistfm-username>
```

On re-import the script preserves every field it can't derive from
Setlist.fm — `parentLevel`, `style`, scene-dressing fields, `notes`,
`rating`. Identity is by Setlist.fm's internal ID, so renaming a
venue slug by hand (`greekTheatreBerkeley` → `greekBerkeley`) is
sticky across future runs.

New venues print at the end of each run asking for `parentLevel`
and `style`:

```
  1 NEW venues need parentLevel + style set in venues.js:
    • greekTheatreBerkeley  —  The Greek Theatre, Berkeley, CA, US
```

Open `venues.js`, set both on that entry, and optionally rename the
slug. Then the venue is ready — once the geometry is added to its
parent level (§3), pressing `E` on it will show the imported shows.

No code changes unless the show demands a one-off effect (fireworks,
special weather). For a one-off, handle it inside the level's
dressing callback with a clause keyed on `show.id`:

```js
if (show.id === 'phish-greekBerkeley-2010-08-07') {
    // closing-night glow sticks on the back of the bowl
    this._addGlowsticks(theatre.userData.anchors.crowdArea);
}
```

---

## 6. Venue style templates

Permanent geometry is owned by the level, but a lot of it is
generic. Shared templates in `sceneDressing.js` generate the boring
parts and also know how to dress them per-show.

| Style          | Typical venues                       | Shared helpers                        |
|----------------|--------------------------------------|----------------------------------------|
| `amphitheatre` | Greek Berkeley, Red Rocks, Hollywood | `buildSemiBowl`, `buildProscenium`    |
| `club`         | Fillmore, 9:30 Club, Metro          | `buildFlatFloor`, `buildBalcony`      |
| `theatre`      | Fox Oakland, Paramount              | `buildProscenium`, `buildBalconySeats`|
| `arena`        | Oracle, Chase Center                 | `buildRoundBowl`, `buildJumbotrons`   |
| `stadium`      | Levi's, SoFi, MSG                    | `buildFullBowl`, `buildJumbotrons`    |
| `festival`     | Outside Lands, Coachella             | `buildMainstage`, `buildLawn`         |
| `bar`          | Smalls, Tipitina's                   | `buildRoomWithStage`                  |

Dressing helpers (shared across all styles):

```js
// sceneDressing.js
export function applyLighting(scene, timeOfDay, weather) { /* … */ }
export function applyWeather(scene, weather) { /* … */ }
export function addCrowd(anchor, density, mood, seatingShape) { /* … */ }
export function hangBanner(stageAnchor, bannerSlug) { /* … */ }
export function updateMarquee(marqueeAnchor, show) { /* … */ }
export function clearDressing(venueGroup) { /* removes everything we added */ }
```

Each adds a named sub-group under `venueGroup.userData.showLayer` so
`clearDressing` can remove it cleanly. No orphaned geometry between
shows.

---

## 7. Show-picker UI

The picker is an HTML overlay, matching the Atlas / pause-menu style.

```html
<div id="show-picker" class="welcome-screen hidden">
    <div class="show-card">
        <h2 id="show-venue-name">Hearst Greek Theatre</h2>
        <p class="show-count">3 shows attended</p>
        <ul class="show-list" role="listbox">
            <li data-show-id="phish-greekBerkeley-2010-08-07" class="show-row">
                <span class="show-date">Aug 7, 2010</span>
                <span class="show-artist">Phish</span>
                <span class="show-tag">Night 3 of 3 · packed</span>
            </li>
            <li data-show-id="phish-greekBerkeley-2010-08-06">…</li>
            <li data-show-id="phish-greekBerkeley-2010-08-05">…</li>
        </ul>
        <div class="show-actions">
            <button data-action="venue-only">Just the venue</button>
            <button data-action="cancel">Back</button>
        </div>
    </div>
</div>
```

Keyboard:

- `↑`/`↓` or `J`/`K` — move highlight
- `Enter` — apply the highlighted show
- `V` — "Just the venue" (clear dressing)
- `Escape` / `B` — close, scene unchanged

Flow (in `main.js`'s key handler or a new `musicController.js`):

```js
onInteract(interactable) {
    if (interactable.userData.musicVenueId) {
        this.showPicker.open(interactable);
    } else {
        // existing interaction logic
    }
}

// ShowPicker.open:
const venueId = interactable.userData.musicVenueId;
const venue = VENUES[venueId];
const shows = SHOWS
    .filter(s => s.venueId === venueId)
    .sort((a, b) => b.date.localeCompare(a.date));  // newest first
render(venue, shows);

// On pick:
applyShow(interactable, show);    // calls sceneDressing helpers
closeOverlay();
```

The player's pointer lock should be released while the overlay is
open (same way the pause menu does it) so they can use the mouse.

---

## 8. The `applyShow` contract

`applyShow` reconfigures a venue in place:

```js
import {
    applyLighting, applyWeather, addCrowd,
    hangBanner, updateMarquee, clearDressing
} from './music/sceneDressing.js';

export function applyShow(venueGroup, show, scene) {
    clearDressing(venueGroup);
    if (!show) return;   // venue-only mode

    const layer = new THREE.Group();
    layer.userData.showLayer = true;
    venueGroup.add(layer);
    venueGroup.userData.showLayer = layer;

    const a = venueGroup.userData.anchors;
    applyLighting(scene, show.timeOfDay, show.weather);
    applyWeather(scene, show.weather);
    addCrowd(a.crowdArea, show.crowdDensity, show.crowdMood, venueGroup.userData.style);
    hangBanner(a.stage, show.banner);
    updateMarquee(a.marquee, show);
}
```

Re-applying with `null` restores the empty-venue state. Re-applying
with a different show swaps dressing without the venue geometry ever
reloading.

---

## 9. Walkthrough — Phish at the Greek, Aug 5–7 2010

You're adding three shows (a 3-night run) to a venue that doesn't
exist yet.

1. **Level parent**: `js/berkeley/ucbCampus.js` already exists.
2. **Build the venue inside it.** Add `createGreekTheatre()` to the
   class, following §3. Position at roughly `(330, 0, -155)` local
   (NE of the Campanile). Seating is a `semiBowl` with stone-column
   proscenium at the back of the stage. Tag
   `userData.musicVenueId = 'greekBerkeley'`.
3. **Register the venue** in `js/music/venues.js`:
   ```js
   greekBerkeley: {
       id: 'greekBerkeley',
       name: 'Hearst Greek Theatre',
       city: 'Berkeley, CA',
       parentLevel: 'berkeley',
       lat: 37.8733, lon: -122.2540,
       capacity: 8500,
       opened: 1903,
       style: 'amphitheatre',
       description: 'Open-air Greek-inspired bowl above campus'
   }
   ```
4. **Add the three shows** to `js/music/shows.js` (data block in §4).
5. **Drop the banner** at `js/music/banners/phish-mockingbird.png`
   (square-ish PNG of a Phish logo / graphic — any of the 2010-era
   designs fits).
6. **Playtest**:
   - Open Math World, hit `M`, navigate to UC Berkeley, teleport.
   - Walk NE past Doe Library into the Greek (or warp with `1-3` if
     you add a teleport key).
   - Press `E` at the entrance. The picker shows three rows:
     `Aug 7, 2010 · Phish · Night 3 of 3 · packed`, and two more.
   - Pick 8/5. Stage lights dim, the bowl fills with swaying
     silhouettes, the Phish banner drops over the stage, the
     marquee reads "PHISH · 8/5/10".
   - Hit `E` again, pick 8/7 — dressing switches without a reload.
   - Hit `E`, pick "Just the venue" — dressing clears; you're back
     in an empty Greek.

---

## 10. Future directions

- **Setlist placard** — a small readable panel near the soundboard;
  clicking a song adds a highlight marker to that moment.
- **Audio snippets** — 15-sec CC-cleared clips that play softly when
  you stand near the stage during a specific show.
- **Ticket stubs** — an inventory of scanned stubs per show.
- **Friends** — mark who was with you; their avatars appear in the
  crowd near you.
- **Chronology view** — an Atlas panel that groups all shows by
  year, artist, or venue instead of by geography.
- **Setlist.fm importer** — CLI tool that pulls attended shows into
  `shows.js` so you don't type setlists by hand.
- **Multi-night runs** — this Phish run is three shows, each its own
  row; a future picker could collapse them to "Phish · Aug 5–7 ·
  3-night run" with an expander.

---

## Conventions

- **Venue slugs** are camelCase and globally unique.
  (`greekBerkeley`, not `greek-berkeley`.) They're dict keys.
- **Show IDs** are kebab-case:
  `{artist-slug}-{venueSlug}-{YYYY-MM-DD}`. Sortable by string.
- **Dates** are strings in ISO-8601 (`2010-08-05`). No `Date`
  objects in the data.
- **Artists** keep their real casing in the data; slugs are
  lowercase-kebab.
- **Assets** (banners, stubs, audio) live under
  `js/music/<kind>/<slug>.<ext>` and are committed unless >1 MB.
- **No show without a venue.** Add the venue in its parent level
  first; a venue with one show is fine.
- **No venue without a level.** The Greek can't be a standalone
  teleport destination — always enter through UC Berkeley.

---

## Not yet decided

These are open — pick what you like the first time each comes up and
we'll canonicalise.

- **Multi-artist festivals** — is a day at Outside Lands one show
  with many artists, or many shows sharing venue + date? Probably
  the former: `{ artist: 'various', lineup: ['Green Day', …] }`.
- **Ambient audio** — should venues loop quiet crowd-noise even
  with no show selected, or stay silent until you pick one?
- **Picker timing** — open the picker automatically on entering
  the venue, or always wait for `E`? `E` is safer; it keeps casual
  walk-throughs uninterrupted.
- **Atlas parallel index** — in addition to geography, a separate
  `music` branch that lists all venues and shows grouped by year or
  artist? Useful once the archive has >20 shows.
- **Run grouping** — when picker rows are all from the same
  run (same artist, consecutive days, same venue), show them as
  one expandable row.
