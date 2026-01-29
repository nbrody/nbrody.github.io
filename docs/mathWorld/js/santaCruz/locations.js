/**
 * Santa Cruz Locations
 * GPS coordinates and metadata for all Santa Cruz area locations
 */

export const SANTA_CRUZ_LOCATIONS = {
    mchenryLibrary: {
        name: 'McHenry Library',
        description: 'UC Santa Cruz main library - brutalist architecture',
        lat: 36.9958,
        lon: -122.0595,
        type: 'campus',
        hasContent: true
    },

    steamerLane: {
        name: 'Steamer Lane Lighthouse',
        description: 'Mark Abbott Memorial Lighthouse at Lighthouse Point',
        lat: 36.9515,
        lon: -122.0256,
        type: 'landmark',
        hasContent: true
    },

    boardwalk: {
        name: 'Santa Cruz Beach Boardwalk',
        description: 'Historic beachfront amusement park since 1907',
        lat: 36.9643,
        lon: -122.0177,
        type: 'landmark',
        hasContent: true
    },

    naturalBridges: {
        name: 'Natural Bridges State Beach',
        description: 'Coastal state park with natural rock arch',
        lat: 36.9519,
        lon: -122.0575,
        type: 'nature',
        hasContent: false
    },

    westCliff: {
        name: 'West Cliff Drive',
        description: 'Scenic coastal path overlooking Monterey Bay',
        lat: 36.9505,
        lon: -122.0350,
        type: 'nature',
        hasContent: false
    },

    downtownSC: {
        name: 'Downtown Santa Cruz',
        description: 'Pacific Avenue shopping and dining district',
        lat: 36.9741,
        lon: -122.0308,
        type: 'urban',
        hasContent: false
    }
};

// Get default starting location
export const DEFAULT_LOCATION = 'mchenryLibrary';

// Get all locations as array
export function getAllLocations() {
    return Object.entries(SANTA_CRUZ_LOCATIONS).map(([key, loc]) => ({
        id: key,
        ...loc
    }));
}

// Get locations with content only
export function getActiveLocations() {
    return getAllLocations().filter(loc => loc.hasContent);
}
