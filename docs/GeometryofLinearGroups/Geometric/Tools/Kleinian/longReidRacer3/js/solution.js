// solution.js — the built-in winning word.
//
// The length-82 witness from Brody, "An improper surface group action"
// (arXiv:2512.19760): it evaluates to an infinite-order element of SL2(Z),
// certifying that the Long-Reid action on T3 x T4 is not proper.
// Alphabet: a, b generators; A = a^-1, B = b^-1.

'use strict';

const SOLUTION_WORD =
    ('aabAABabaaBABaab' +
     'AbaaBABabaBabAba' +
     'aBaaabAABaBAAbba' +
     'BAAbABaBAAbaBaa' +
     'bAbaBabAbaaBaaab' +
     'AAB').split('');

if (typeof module !== 'undefined' && module.exports) {
    module.exports = SOLUTION_WORD;
}
