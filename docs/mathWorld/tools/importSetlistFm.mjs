#!/usr/bin/env node
/**
 * Setlist.fm → Math World importer.
 *
 * Pulls the attended shows for a given Setlist.fm user and writes them
 * into js/music/venues.js and js/music/shows.js.
 *
 * Re-running is safe: user-editable fields (scene dressing, notes,
 * rating, parentLevel, style, …) are preserved across imports. Only
 * the auto-derived fields (name, dates, setlist, GPS, …) get
 * overwritten.
 *
 * Usage:
 *   cd docs/mathWorld
 *   SETLISTFM_API_KEY=your_key node tools/importSetlistFm.mjs <username>
 *
 *   # or dry-run (don't write files, just print what would change):
 *   SETLISTFM_API_KEY=your_key node tools/importSetlistFm.mjs <username> --dry
 *
 * Get an API key:
 *   https://api.setlist.fm/docs/1.0/index.html
 *   → "Request an API key"
 *
 * Rate limit: 2 req/s, 1440/day. The script sleeps 600 ms between
 * requests to stay well inside the limit.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const ROOT       = resolve(__dirname, '..');   // docs/mathWorld
const VENUES_FILE = resolve(ROOT, 'js/music/venues.js');
const SHOWS_FILE  = resolve(ROOT, 'js/music/shows.js');

// ----- CLI parsing -----
const args = process.argv.slice(2);
const positional = args.filter(a => !a.startsWith('--'));
const flags = new Set(args.filter(a => a.startsWith('--')));
const USER_ID = positional[0] || process.env.SETLISTFM_USER;
const API_KEY = process.env.SETLISTFM_API_KEY;
const DRY_RUN = flags.has('--dry') || flags.has('--dry-run');

if (!API_KEY) die('Set SETLISTFM_API_KEY environment variable.');
if (!USER_ID) die('Usage: node tools/importSetlistFm.mjs <setlistfm-username>');

// ----- Fields we never overwrite on re-import -----
const USER_EDITABLE_VENUE_FIELDS = [
    'parentLevel', 'style', 'description', 'refs',
    'capacity', 'opened', 'orientation', 'seatingRadius',
    'anchors'
];
const USER_EDITABLE_SHOW_FIELDS = [
    'timeOfDay', 'weather', 'crowdDensity', 'crowdMood',
    'stageSetup', 'banner', 'notes', 'rating', 'photoRef', 'runNote'
];

// ----- Main -----

(async () => {
    console.log(`Fetching attended shows for "${USER_ID}"…`);
    const setlists = await fetchAllAttended(USER_ID);
    console.log(`  → ${setlists.length} setlists`);

    const existingVenues = await loadExistingModule(VENUES_FILE, 'VENUES') || {};
    const existingShows  = await loadExistingModule(SHOWS_FILE,  'SHOWS')  || [];
    console.log(`  Existing: ${Object.keys(existingVenues).length} venues, ${existingShows.length} shows`);

    const { venues, shows, newVenueIds } = transform(setlists, existingVenues, existingShows);

    const venueCount = Object.keys(venues).length;
    console.log(`\nMerged → ${venueCount} venues, ${shows.length} shows`);
    if (newVenueIds.length) {
        console.log(`  ${newVenueIds.length} NEW venues need parentLevel + style set in venues.js:`);
        for (const id of newVenueIds) {
            const v = venues[id];
            console.log(`    • ${id}  —  ${v.name}, ${v.city}`);
        }
    }

    if (DRY_RUN) {
        console.log('\n(--dry) no files written.');
        return;
    }

    writeFileSync(VENUES_FILE, serializeVenuesFile(venues));
    writeFileSync(SHOWS_FILE,  serializeShowsFile(shows));
    console.log(`\nWrote ${relative(ROOT, VENUES_FILE)}`);
    console.log(`Wrote ${relative(ROOT, SHOWS_FILE)}`);
})().catch(err => {
    console.error('\n✗ import failed:', err.message);
    process.exit(1);
});

// ========================================================================
// Fetch
// ========================================================================

async function fetchAllAttended(userId) {
    const all = [];
    let page = 1;
    while (true) {
        const url = `https://api.setlist.fm/rest/1.0/user/${encodeURIComponent(userId)}/attended?p=${page}`;
        const data = await apiGet(url);
        if (!data) break;
        const pageList = data.setlist || [];
        all.push(...pageList);
        const total = data.total || 0;
        const perPage = data.itemsPerPage || 20;
        if (page * perPage >= total || pageList.length === 0) break;
        page++;
        await sleep(600);  // Stay under 2 req/s
    }
    return all;
}

async function apiGet(url) {
    const res = await fetch(url, {
        headers: {
            'x-api-key': API_KEY,
            'Accept': 'application/json',
            'Accept-Language': 'en'
        }
    });
    if (res.status === 404) {
        throw new Error(`404 — user "${USER_ID}" not found or has no attended shows`);
    }
    if (res.status === 401 || res.status === 403) {
        throw new Error(`${res.status} — API key rejected. Check SETLISTFM_API_KEY.`);
    }
    if (res.status === 429) {
        throw new Error('429 — rate limited. Wait a minute and re-run.');
    }
    if (!res.ok) {
        throw new Error(`${res.status} ${res.statusText} at ${url}`);
    }
    return res.json();
}

// ========================================================================
// Transform
// ========================================================================

function transform(setlists, existingVenues, existingShows) {
    // Build a lookup: setlistfmVenueId → existing slug, so renames survive
    const venueSlugByFmId = {};
    for (const [slug, v] of Object.entries(existingVenues)) {
        if (v.setlistfmId) venueSlugByFmId[v.setlistfmId] = slug;
    }
    // Same for shows
    const showIdxByFmId = {};
    existingShows.forEach((s, i) => {
        if (s.setlistfmId) showIdxByFmId[s.setlistfmId] = i;
    });

    const venues = { ...existingVenues };
    const newVenueIds = [];
    const shows = [];
    // Keep user-edited shows that are still attended (we re-add them below)
    const keptShows = new Set();

    for (const sl of setlists) {
        // --- Venue ---
        const fmVenue = sl.venue;
        const fmVenueId = fmVenue.id;
        let slug = venueSlugByFmId[fmVenueId];
        if (!slug) {
            slug = deriveVenueSlug(fmVenue, venues);
            newVenueIds.push(slug);
        }
        venues[slug] = mergeVenue(venues[slug], fmVenue, slug);
        venueSlugByFmId[fmVenueId] = slug;

        // --- Show ---
        const show = buildShow(sl, slug);
        const existingIdx = showIdxByFmId[sl.id];
        if (existingIdx !== undefined) {
            const existing = existingShows[existingIdx];
            // Preserve user-editable fields
            for (const f of USER_EDITABLE_SHOW_FIELDS) {
                if (existing[f] !== undefined) show[f] = existing[f];
            }
            keptShows.add(existingIdx);
        }
        shows.push(show);
    }

    // Also keep any hand-added shows that never came from Setlist.fm
    existingShows.forEach((s, i) => {
        if (!s.setlistfmId && !keptShows.has(i)) shows.push(s);
    });

    shows.sort((a, b) => b.date.localeCompare(a.date));

    return { venues, shows, newVenueIds };
}

function deriveVenueSlug(fmVenue, existingVenues) {
    // e.g. "The Greek Theatre" + "Berkeley" → "greekTheatreBerkeley"
    const nameClean = (fmVenue.name || 'venue')
        .replace(/^The\s+/i, '')
        .replace(/&/g, 'and')
        .replace(/[^\w\s]/g, '')
        .trim();
    const city = (fmVenue.city?.name || '')
        .replace(/[^\w\s]/g, '')
        .trim();
    const base = camelCase(nameClean) + pascalCase(city);
    // Ensure uniqueness
    let slug = base || 'venue';
    let n = 2;
    while (existingVenues[slug]) {
        slug = `${base}${n++}`;
    }
    return slug;
}

function mergeVenue(existing, fmVenue, slug) {
    const autoFields = {
        id: slug,
        name: fmVenue.name || 'Unknown',
        city: formatCity(fmVenue.city),
        lat: fmVenue.city?.coords?.lat ?? null,
        lon: fmVenue.city?.coords?.long ?? null,
        setlistfmId: fmVenue.id,
        setlistfmUrl: fmVenue.url || null
    };
    // Default user-editable fields if this is a brand-new venue
    const defaults = existing ? {} : {
        parentLevel: null,
        style: null,
        description: null
    };
    // Preserve user-editable fields from the existing entry
    const preserved = {};
    if (existing) {
        for (const f of USER_EDITABLE_VENUE_FIELDS) {
            if (existing[f] !== undefined) preserved[f] = existing[f];
        }
    }
    return { ...autoFields, ...defaults, ...preserved };
}

function buildShow(sl, venueSlug) {
    const date = reformatDate(sl.eventDate);
    const artist = sl.artist?.name || 'Unknown Artist';
    const artistSlug = kebabCase(artist);
    const id = `${artistSlug}-${venueSlug}-${date}`;

    return {
        id,
        venueId: venueSlug,
        date,
        artist,
        tour: sl.tour?.name || null,
        setlist: extractSetlist(sl),
        setlistfmId: sl.id,
        setlistfmUrl: sl.url || null,
        // Sensible scene-dressing defaults — user can override
        timeOfDay: 'night',
        weather: 'clear',
        crowdDensity: 'full',
        crowdMood: 'swaying',
        stageSetup: 'rock',
        banner: null,
        notes: null,
        rating: null
    };
}

function extractSetlist(sl) {
    const sets = sl.sets?.set || [];
    const songs = [];
    for (const s of sets) {
        for (const song of (s.song || [])) {
            if (song.name) songs.push(song.name);
        }
    }
    return songs;
}

function reformatDate(dmy) {
    // Setlist.fm uses dd-MM-yyyy. We want yyyy-MM-dd for ISO sorting.
    if (!dmy) return '0000-00-00';
    const [d, m, y] = dmy.split('-');
    return `${y}-${pad2(m)}-${pad2(d)}`;
}

function formatCity(city) {
    if (!city) return '';
    const parts = [city.name];
    if (city.stateCode) parts.push(city.stateCode);
    else if (city.state) parts.push(city.state);
    if (city.country?.code) parts.push(city.country.code);
    return parts.filter(Boolean).join(', ');
}

// ========================================================================
// Serialise back to JS source
// ========================================================================

function serializeVenuesFile(venues) {
    const header = readHeaderBlock(VENUES_FILE) || DEFAULT_VENUES_HEADER;
    const sortedKeys = Object.keys(venues).sort();
    const body = sortedKeys.length === 0
        ? '    // Populated by the importer. See tools/importSetlistFm.mjs.'
        : sortedKeys.map(k => '    ' + safeKey(k) + ': ' + formatValue(venues[k], 1)).join(',\n');

    return header + '\nexport const VENUES = {\n' + body + '\n};\n\n'
        + '/**\n * Return the venue metadata object for a given id.\n */\n'
        + 'export function getVenue(venueId) {\n'
        + '    return VENUES[venueId] || null;\n'
        + '}\n';
}

function serializeShowsFile(shows) {
    const header = readHeaderBlock(SHOWS_FILE) || DEFAULT_SHOWS_HEADER;
    const body = shows.length === 0
        ? '    // Populated by the importer. See tools/importSetlistFm.mjs.'
        : shows.map(s => '    ' + formatValue(s, 1)).join(',\n');

    return header + '\nexport const SHOWS = [\n' + body + '\n];\n\n'
        + '/**\n * Return every show at a given venue, newest first.\n */\n'
        + 'export function getShowsAtVenue(venueId) {\n'
        + '    return SHOWS\n'
        + '        .filter(s => s.venueId === venueId)\n'
        + '        .sort((a, b) => b.date.localeCompare(a.date));\n'
        + '}\n\n'
        + '/**\n * Lookup a show by id.\n */\n'
        + 'export function getShow(showId) {\n'
        + '    return SHOWS.find(s => s.id === showId) || null;\n'
        + '}\n';
}

// Preserve the leading /** ... */ comment block from the existing file,
// so re-runs don't blow away hand-edited docs.
function readHeaderBlock(path) {
    if (!existsSync(path)) return null;
    const src = readFileSync(path, 'utf8');
    const match = src.match(/^(\/\*\*[\s\S]*?\*\/)/);
    return match ? match[1] : null;
}

const DEFAULT_VENUES_HEADER = `/**
 * Music venues registered in Math World.
 *
 * This file is MAINTAINED by tools/importSetlistFm.mjs but is safe to
 * hand-edit. Re-running the importer preserves user-editable fields:
 *   parentLevel, style, description, refs, capacity, opened,
 *   orientation, seatingRadius, anchors
 * Auto-updated fields:
 *   id, name, city, lat, lon, setlistfmId, setlistfmUrl
 *
 * See MUSIC.md for the full data model.
 */`;

const DEFAULT_SHOWS_HEADER = `/**
 * Attended shows — the concert archive.
 *
 * This file is MAINTAINED by tools/importSetlistFm.mjs but is safe to
 * hand-edit. Re-running the importer preserves user-editable fields:
 *   timeOfDay, weather, crowdDensity, crowdMood, stageSetup,
 *   banner, notes, rating, photoRef, runNote
 * Auto-updated fields:
 *   id, venueId, date, artist, tour, setlist,
 *   setlistfmId, setlistfmUrl
 *
 * See MUSIC.md for the full data model.
 */`;

function formatValue(val, indent) {
    const pad     = '    '.repeat(indent);
    const innerPad = '    '.repeat(indent + 1);
    if (val === null || val === undefined) return 'null';
    if (typeof val === 'boolean') return val ? 'true' : 'false';
    if (typeof val === 'number') return Number.isFinite(val) ? String(val) : 'null';
    if (typeof val === 'string') return quote(val);
    if (Array.isArray(val)) {
        if (val.length === 0) return '[]';
        if (val.every(v => typeof v === 'string' || typeof v === 'number')) {
            return '[' + val.map(formatInline).join(', ') + ']';
        }
        return '[\n' + val.map(v => innerPad + formatValue(v, indent + 1)).join(',\n') + '\n' + pad + ']';
    }
    if (typeof val === 'object') {
        const keys = Object.keys(val);
        if (keys.length === 0) return '{}';
        return '{\n' + keys.map(k =>
            innerPad + safeKey(k) + ': ' + formatValue(val[k], indent + 1)
        ).join(',\n') + '\n' + pad + '}';
    }
    return 'null';
}

function formatInline(v) {
    if (typeof v === 'string') return quote(v);
    return String(v);
}

function quote(s) {
    return "'" + s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n') + "'";
}

function safeKey(k) {
    return /^[A-Za-z_$][\w$]*$/.test(k) ? k : quote(k);
}

// ========================================================================
// Load existing module (preserve user edits)
// ========================================================================

async function loadExistingModule(path, exportName) {
    if (!existsSync(path)) return null;
    try {
        const mod = await import(pathToFileURL(path).href + '?t=' + Date.now());
        return mod[exportName] ?? null;
    } catch (e) {
        console.warn(`Could not import ${path}: ${e.message}`);
        return null;
    }
}

// ========================================================================
// Text helpers
// ========================================================================

function camelCase(s) {
    const words = s.split(/\s+/).filter(Boolean);
    if (words.length === 0) return '';
    return words[0].toLowerCase()
         + words.slice(1).map(w => w[0].toUpperCase() + w.slice(1).toLowerCase()).join('');
}

function pascalCase(s) {
    const words = s.split(/\s+/).filter(Boolean);
    return words.map(w => w[0].toUpperCase() + w.slice(1).toLowerCase()).join('');
}

function kebabCase(s) {
    return s.toLowerCase()
            .replace(/&/g, 'and')
            .replace(/[^\w]+/g, '-')
            .replace(/^-+|-+$/g, '');
}

function pad2(s) { return String(s).padStart(2, '0'); }

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function die(msg) {
    console.error('✗ ' + msg);
    process.exit(1);
}
