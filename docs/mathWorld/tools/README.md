# Math World tools

Command-line helpers for maintaining Math World data files.

## `importSetlistFm.mjs`

Pulls your attended shows from [Setlist.fm](https://www.setlist.fm/) and
writes them into `js/music/venues.js` and `js/music/shows.js`.

### One-time setup

1. **Create a Setlist.fm account** if you don't already have one, and
   mark some shows as attended on the site. Your username is the one
   that appears in your profile URL:
   `https://www.setlist.fm/user/<USERNAME>`.

2. **Request an API key.** Visit
   <https://api.setlist.fm/docs/1.0/index.html> and click *Request
   an API key* — usually issued within a day. Keep it secret; don't
   commit it.

3. **Export the key** in your shell:
   ```sh
   export SETLISTFM_API_KEY='your-key-here'
   # optional: pin your username too
   export SETLISTFM_USER='nic-b'
   ```
   (Add to `~/.zshrc` or a `.env` file you don't commit.)

### Run it

From the `docs/mathWorld` directory:

```sh
# full import
node tools/importSetlistFm.mjs <your-setlistfm-username>

# preview what would change (no files written)
node tools/importSetlistFm.mjs <your-setlistfm-username> --dry

# if you set SETLISTFM_USER in the environment, the username is optional
node tools/importSetlistFm.mjs
```

Node 18 or newer is required (uses native `fetch`).

### What gets written

The script populates two files:

- `js/music/venues.js` — one entry per unique venue you've attended
- `js/music/shows.js`  — one entry per attended show, newest first

Venues that haven't been connected to a Math World level yet print at
the end of the run:

```
  3 NEW venues need parentLevel + style set in venues.js:
    • greekTheatreBerkeley  —  The Greek Theatre, Berkeley, CA, US
    • fillmore              —  The Fillmore, San Francisco, CA, US
    • foxTheaterOakland     —  Fox Theater, Oakland, CA, US
```

Open `js/music/venues.js` and set `parentLevel` and `style` on each
new entry. See [MUSIC.md](../MUSIC.md) for the style templates.

### Re-running

Safe to re-run any time (rate limit: 2 req/s, 1440/day). The script
preserves every field you've hand-edited:

| File       | Auto-overwritten                              | Preserved                                                                    |
|------------|------------------------------------------------|------------------------------------------------------------------------------|
| venues.js  | `id`, `name`, `city`, `lat`, `lon`, `setlistfmId`, `setlistfmUrl` | `parentLevel`, `style`, `description`, `refs`, `capacity`, `opened`, `orientation`, `seatingRadius`, `anchors` |
| shows.js   | `id`, `venueId`, `date`, `artist`, `tour`, `setlist`, `setlistfmId`, `setlistfmUrl` | `timeOfDay`, `weather`, `crowdDensity`, `crowdMood`, `stageSetup`, `banner`, `notes`, `rating`, `photoRef`, `runNote` |

Identity across re-runs is by Setlist.fm's `id`, not by our slug, so
you can rename a venue slug in `venues.js` and the next import will
pick it up via `setlistfmId` and keep your rename.

### Troubleshooting

| Message                              | What to do                                    |
|--------------------------------------|-----------------------------------------------|
| `Set SETLISTFM_API_KEY…`             | Export the env var (see *One-time setup*).    |
| `404 — user "…" not found`           | Double-check the username. Profile must be public. |
| `401 / 403 — API key rejected`       | Confirm the key is the full GUID, not truncated. |
| `429 — rate limited`                 | Wait a minute and re-run.                     |

### Hand-adding a show not on Setlist.fm

Add it directly to `shows.js` without a `setlistfmId` field. The
importer won't touch it on future runs. Same for venues — hand-added
venues without `setlistfmId` are left alone.
