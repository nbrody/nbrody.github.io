export const REGIONAL_LOCATIONS = {
    // === CONTINENTS (Visible at World Level 15,000km) ===
    northAmerica: {
        name: 'North America',
        description: 'Explore locations across North America',
        lat: 45, lon: -100,
        type: 'continent',
        hasContent: false,
        scaleLevel: 'continent'
    },
    eurasia: {
        name: 'Eurasia',
        description: 'Coming soon',
        lat: 50, lon: 40,
        type: 'continent',
        hasContent: false,
        scaleLevel: 'continent'
    },
    southAmerica: {
        name: 'South America',
        description: 'Coming soon',
        lat: -20, lon: -60,
        type: 'continent',
        hasContent: false,
        scaleLevel: 'continent'
    },
    africa: {
        name: 'Africa',
        description: 'Coming soon',
        lat: 10, lon: 20,
        type: 'continent',
        hasContent: false,
        scaleLevel: 'continent'
    },
    australia: {
        name: 'Australia',
        description: 'Coming soon',
        lat: -25, lon: 135,
        type: 'continent',
        hasContent: false,
        scaleLevel: 'continent'
    },

    // === STATES / REGIONS (Visible at Continent Level 4,000km) ===
    california: {
        name: 'California',
        description: 'The Golden State',
        lat: 36.7783, lon: -119.4179,
        type: 'state',
        hasContent: true,
        scaleLevel: 'state'
    },
    newYork: {
        name: 'New York',
        description: 'Coming soon',
        lat: 40.7128, lon: -74.0060,
        type: 'state',
        hasContent: false,
        scaleLevel: 'state'
    },
    texas: {
        name: 'Texas',
        description: 'Coming soon',
        lat: 31.9686, lon: -99.9018,
        type: 'state',
        hasContent: false,
        scaleLevel: 'state'
    },
    britishColumbia: {
        name: 'British Columbia',
        description: 'Coming soon',
        lat: 53.7267, lon: -127.6476,
        type: 'province',
        hasContent: false,
        scaleLevel: 'state'
    },
    florida: {
        name: 'Florida',
        description: 'Coming soon',
        lat: 27.6648, lon: -81.5158,
        type: 'state',
        hasContent: false,
        scaleLevel: 'state'
    },

    // === CITIES (Visible at Region Level 600km) ===
    santaCruz: {
        name: 'Santa Cruz',
        description: 'Surf city on the Monterey Bay',
        lat: 36.9741, lon: -122.0308,
        type: 'city',
        hasContent: true,
        scaleLevel: 'city'
    },
    berkeley: {
        name: 'Berkeley',
        description: 'Home of UC Berkeley',
        lat: 37.8715, lon: -122.2730,
        type: 'city',
        hasContent: true,
        scaleLevel: 'city'
    },
    sanFrancisco: {
        name: 'San Francisco',
        description: 'Coming soon',
        lat: 37.7749, lon: -122.4194,
        type: 'city',
        hasContent: false,
        scaleLevel: 'city'
    },
    losAngeles: {
        name: 'Los Angeles',
        description: 'Coming soon',
        lat: 34.0522, lon: -118.2437,
        type: 'city',
        hasContent: false,
        scaleLevel: 'city'
    },
    lakeTahoe: {
        name: 'Lake Tahoe',
        description: 'Coming soon',
        lat: 39.0968, lon: -120.0324,
        type: 'nature',
        hasContent: false,
        scaleLevel: 'city'
    },
    sanDiego: {
        name: 'San Diego',
        description: 'Coming soon',
        lat: 32.7157, lon: -117.1611,
        type: 'city',
        hasContent: false,
        scaleLevel: 'city'
    }
};
