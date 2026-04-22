/**
 * Regional Locations
 *
 * Hierarchy (see atlas.js LOCATION_TREE for the navigation structure):
 *   world
 *     northAmerica
 *       western
 *         norcal
 *           bayArea      (cluster of Bay Area cities)
 *             berkeley, sanFrancisco, oakland, paloAlto
 *           santaCruz    (cluster of SC-area locations; children live in santaCruz/locations.js)
 *         socal
 *           santaBarbara
 *             islaVista, ucsb, downtownSB
 *           la
 *             venice, ucla, laguna
 *       (other states – placeholders)
 *     (other continents – placeholders)
 *
 * `scaleLevel` is a loose label for the zoom stage at which the marker is shown.
 */
export const REGIONAL_LOCATIONS = {
    // === CONTINENTS ===
    northAmerica: {
        name: 'North America',
        description: 'Explore locations across North America',
        lat: 45, lon: -100,
        type: 'continent',
        hasContent: false,
        scaleLevel: 'continent'
    },
    eurasia: {
        name: 'Eurasia', description: 'Coming soon',
        lat: 50, lon: 40, type: 'continent', hasContent: false, scaleLevel: 'continent'
    },
    southAmerica: {
        name: 'South America', description: 'Coming soon',
        lat: -20, lon: -60, type: 'continent', hasContent: false, scaleLevel: 'continent'
    },
    africa: {
        name: 'Africa', description: 'Coming soon',
        lat: 10, lon: 20, type: 'continent', hasContent: false, scaleLevel: 'continent'
    },
    australia: {
        name: 'Australia', description: 'Coming soon',
        lat: -25, lon: 135, type: 'continent', hasContent: false, scaleLevel: 'continent'
    },

    // === REGIONS (large North American zones) ===
    western: {
        name: 'Western US',
        description: 'California and the West Coast',
        lat: 37.0, lon: -120.0,
        type: 'region',
        hasContent: false,
        scaleLevel: 'region'
    },

    // State-level placeholders (not currently wired into the tree beneath a region)
    newYork: {
        name: 'New York', description: 'Coming soon',
        lat: 40.7128, lon: -74.0060, type: 'state', hasContent: false, scaleLevel: 'state'
    },
    texas: {
        name: 'Texas', description: 'Coming soon',
        lat: 31.9686, lon: -99.9018, type: 'state', hasContent: false, scaleLevel: 'state'
    },
    britishColumbia: {
        name: 'British Columbia', description: 'Coming soon',
        lat: 53.7267, lon: -127.6476, type: 'province', hasContent: false, scaleLevel: 'state'
    },
    florida: {
        name: 'Florida', description: 'Coming soon',
        lat: 27.6648, lon: -81.5158, type: 'state', hasContent: false, scaleLevel: 'state'
    },

    // === SUB-REGIONS (within Western) ===
    norcal: {
        name: 'Northern California',
        description: 'Bay Area, Santa Cruz, and beyond',
        lat: 37.4, lon: -121.8,
        type: 'region',
        hasContent: false,
        scaleLevel: 'subregion'
    },
    socal: {
        name: 'Southern California',
        description: 'Santa Barbara, LA and beyond',
        lat: 34.3, lon: -118.5,
        type: 'region',
        hasContent: false,
        scaleLevel: 'subregion'
    },

    // === CITY CLUSTERS (within NorCal / SoCal) ===
    bayArea: {
        name: 'Bay Area',
        description: 'San Francisco Bay region',
        lat: 37.75, lon: -122.40,
        type: 'cityCluster',
        hasContent: false,
        scaleLevel: 'cityCluster'
    },
    santaCruz: {
        name: 'Santa Cruz',
        description: 'Surf city on the Monterey Bay',
        lat: 36.9741, lon: -122.0308,
        type: 'cityCluster',
        hasContent: true,
        scaleLevel: 'cityCluster'
    },
    santaBarbara: {
        name: 'Santa Barbara',
        description: 'American Riviera on the Pacific',
        lat: 34.4208, lon: -119.6982,
        type: 'cityCluster',
        hasContent: false,
        scaleLevel: 'cityCluster'
    },
    la: {
        name: 'Los Angeles',
        description: 'Greater LA basin',
        lat: 34.0522, lon: -118.2437,
        type: 'cityCluster',
        hasContent: false,
        scaleLevel: 'cityCluster'
    },

    // === CITIES / DESTINATIONS (leaves, except where noted) ===
    // Bay Area
    berkeley: {
        name: 'Berkeley',
        description: 'Begin at Dwight & Telegraph — walk up Telegraph Ave to Sproul Plaza, Sather Gate, and the Campanile',
        lat: 37.8719, lon: -122.2578,
        type: 'city',
        hasContent: true,
        scaleLevel: 'city'
    },
    sanFrancisco: {
        name: 'San Francisco', description: 'Coming soon',
        lat: 37.7749, lon: -122.4194,
        type: 'city', hasContent: false, scaleLevel: 'city'
    },
    oakland: {
        name: 'Oakland', description: 'Coming soon',
        lat: 37.8044, lon: -122.2712,
        type: 'city', hasContent: false, scaleLevel: 'city'
    },
    paloAlto: {
        name: 'Palo Alto', description: 'Coming soon',
        lat: 37.4419, lon: -122.1430,
        type: 'city', hasContent: false, scaleLevel: 'city'
    },

    // Santa Barbara area
    islaVista: {
        name: 'Isla Vista', description: 'Coming soon',
        lat: 34.4133, lon: -119.8610,
        type: 'city', hasContent: false, scaleLevel: 'city'
    },
    ucsb: {
        name: 'UC Santa Barbara', description: 'Storke Tower, the Lagoon & coastal bike paths',
        lat: 34.4140, lon: -119.8489,
        type: 'campus', hasContent: true, scaleLevel: 'city'
    },
    downtownSB: {
        name: 'Downtown Santa Barbara', description: 'Coming soon',
        lat: 34.4208, lon: -119.6982,
        type: 'urban', hasContent: false, scaleLevel: 'city'
    },

    // LA area
    topanga: {
        name: 'Topanga Canyon',
        description: 'Rustic S-curve town in the Santa Monica Mountains — Country Store, Theatricum Botanicum, oak-lined creek along CA-27',
        lat: 34.0934, lon: -118.6020,
        type: 'landmark',
        hasContent: true,
        scaleLevel: 'city'
    },
    venice: {
        name: 'Venice Beach',
        description: 'Ocean Front Walk, Muscle Beach, skatepark, graffiti walls & the Santa Monica Pier at the north end',
        lat: 33.9850, lon: -118.4695,
        type: 'landmark',
        hasContent: true,
        scaleLevel: 'city'
    },
    ucla: {
        name: 'UCLA', description: 'Coming soon',
        lat: 34.0689, lon: -118.4452,
        type: 'campus', hasContent: false, scaleLevel: 'city'
    },
    laguna: {
        name: 'Laguna Beach', description: 'Coming soon',
        lat: 33.5427, lon: -117.7854,
        type: 'landmark', hasContent: false, scaleLevel: 'city'
    },

    // === LEGACY (kept so old code paths that reference these names still resolve) ===
    lakeTahoe: {
        name: 'Lake Tahoe', description: 'Coming soon',
        lat: 39.0968, lon: -120.0324,
        type: 'nature', hasContent: false, scaleLevel: 'city'
    },
    losAngeles: {
        name: 'Los Angeles', description: 'Coming soon',
        lat: 34.0522, lon: -118.2437,
        type: 'city', hasContent: false, scaleLevel: 'city'
    },
    sanDiego: {
        name: 'San Diego', description: 'Coming soon',
        lat: 32.7157, lon: -117.1611,
        type: 'city', hasContent: false, scaleLevel: 'city'
    },
    california: {
        name: 'California', description: 'The Golden State',
        lat: 36.7783, lon: -119.4179,
        type: 'state', hasContent: false, scaleLevel: 'state'
    }
};
