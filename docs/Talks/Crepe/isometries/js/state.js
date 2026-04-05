export const state = {
    step: 0,

    // Step 0 – rigid motions
    isoType: 'translation',
    translateDir: 0,
    translateDist: 2,
    rotAngle: 60,
    refAxis: 0,

    // Step 1 – inverses
    invType: 'inv-translate',
    invPhase: 'idle', // idle | applied | undone
    invT: 0,

    // Step 2 – composition
    compA: 'translate',
    compB: 'translate',
    compIter: 1,
    compPhase: 'idle',
    compT: 0,

    // Step 3 – placemat
    pmSequence: [],
    pmPhase: 'idle',
    pmT: 0,

    // Step 4 – generators
    genType: 'gen-translate',
    genDepth: 3,

    // Step 5 – commuting
    commDir1: 0, commD1: 2,
    commDir2: 90, commD2: 2,

    // Step 6 – lattices
    latDir1: 0, latD1: 2,
    latDir2: 90, latD2: 2,

    // animation
    animating: false,
};
