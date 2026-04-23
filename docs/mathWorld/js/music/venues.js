/**
 * Music venues registered in Math World.
 *
 * This file is MAINTAINED by tools/importSetlistFm.mjs but is safe to
 * hand-edit. Re-running the importer preserves these user-editable
 * fields on each venue (anything the importer can't derive from
 * Setlist.fm):
 *
 *   parentLevel, style, description, refs, capacity, opened,
 *   orientation, seatingRadius, anchors
 *
 * Auto-updated fields (rewritten on every import):
 *
 *   id, name, city, lat, lon, setlistfmId, setlistfmUrl
 *
 * See MUSIC.md for the full data model.
 */
export const VENUES = {
    // Populated by the importer. See tools/importSetlistFm.mjs.
};

/**
 * Return all shows at a given venue, newest first.
 * Used by the show-picker overlay.
 */
export function getVenue(venueId) {
    return VENUES[venueId] || null;
}
