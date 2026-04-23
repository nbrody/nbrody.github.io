/**
 * Attended shows — the concert archive.
 *
 * This file is MAINTAINED by tools/importSetlistFm.mjs but is safe to
 * hand-edit. Re-running the importer preserves these user-editable
 * fields on each show (everything the importer can't derive from
 * Setlist.fm):
 *
 *   timeOfDay, weather, crowdDensity, crowdMood, stageSetup,
 *   banner, notes, rating, photoRef, runNote
 *
 * Auto-updated fields (rewritten on every import):
 *
 *   id, venueId, date, artist, tour, setlist,
 *   setlistfmId, setlistfmUrl
 *
 * See MUSIC.md for the full data model.
 */
export const SHOWS = [
    // Populated by the importer. See tools/importSetlistFm.mjs.
];

/**
 * Return every show at a given venue, newest first.
 * Used by the show-picker overlay.
 */
export function getShowsAtVenue(venueId) {
    return SHOWS
        .filter(s => s.venueId === venueId)
        .sort((a, b) => b.date.localeCompare(a.date));
}

/**
 * Lookup a show by id.
 */
export function getShow(showId) {
    return SHOWS.find(s => s.id === showId) || null;
}
