export const state = {
    step: 0,

    // Step 0 – the plane (no interactive state, just draws the grid/axes/basis)

    // Step 1 – translations
    transSubStep: 0, // 0 = show e₁ translation, 1 = show e₂ translation, 2 = show both
    transAnimT: 0,
    transAnimating: false,

    // Step 2 – combining translations
    combineM: 3, // how many steps in e₁ direction
    combineN: 2, // how many steps in e₂ direction
    combinePhase: 'idle', // idle | iterating | combining
    combineT: 0,

    // Step 3 – placemat (old step 3)
    pmSequence: [],
    pmPhase: 'idle',
    pmT: 0,

    // Step 4 – generators (old step 4)
    genType: 'gen-translate',
    genDepth: 3,

    // Step 5 – commuting (old step 5)
    commDir1: 0, commD1: 2,
    commDir2: 90, commD2: 2,

    // Step 6 – lattices (old step 6)
    latDir1: 0, latD1: 2,
    latDir2: 90, latD2: 2,

    // --- Legacy (kept for compatibility, used by old step 0/1/2) ---
    isoType: 'translation',
    translateDir: 0,
    translateDist: 2,
    rotAngle: 60,
    refAxis: 0,
    invType: 'inv-translate',
    invPhase: 'idle',
    invT: 0,
    compA: 'translate',
    compB: 'translate',
    compIter: 1,
    compPhase: 'idle',
    compT: 0,

    // animation
    animating: false,
};
