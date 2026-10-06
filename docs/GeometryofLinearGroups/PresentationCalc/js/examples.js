/**
 * Examples: groups chosen to end at each step of the pipeline, then the
 * Discreteness Algorithm's library (its own groups, poincare's library and
 * trees' presets, imported from those tools). Every example is poincare's
 * input state: { name, cat, desc, mats, consts?, anti?, depth? }.
 *
 * Quaternions a + bi + cj + dk are written as the complex matrices
 * (a + bi, c + di; −c + di, a − bi).
 */
import { allExamples as discretenessExamples } from '../../Geometric/Tools/discretenessAlgorithm/js/examples.js';

const SARITH = 'S-arithmetic: certified by FlashBeam';
const DISCRETE = 'Discrete at a place';
const NOTDENSE = 'Not Zariski dense';
const OPEN = 'No certificate';

export const CURATED = [
    {
        name: 'PGL₂(ℤ[½])', cat: SARITH,
        desc: 'T, S and diag(2, 1). Dense at ∞ and at 2; transitive on the tree T₃, and its vertex stabilizer PGL₂(ℤ) has finite area.',
        mats: [['1', '1', '0', '1'], ['0', '-1', '1', '0'], ['2', '0', '0', '1']],
    },
    {
        name: 'A congruence subgroup of PGL₂(ℤ[⅓])', cat: SARITH,
        desc: '(1 2; 0 1), (1 0; 2 1) and diag(3, 1): the vertex stabilizer contains Γ(2).',
        mats: [['1', '2', '0', '1'], ['1', '0', '2', '1'], ['3', '0', '0', '1']],
    },
    {
        name: 'Γ₀(3) and diag(2, 1)', cat: SARITH,
        desc: '(1 1; 0 1), (1 0; 3 1) and diag(2, 1) in PGL₂(ℤ[½]).',
        mats: [['1', '1', '0', '1'], ['1', '0', '3', '1'], ['2', '0', '0', '1']],
    },
    {
        name: 'PSL₂(ℤ[1/5]) without type changes', cat: SARITH,
        desc: 'T, S and diag(25, 1) preserve the types of T₆: the certificate needs two orbit representatives.',
        mats: [['1', '1', '0', '1'], ['0', '-1', '1', '0'], ['25', '0', '0', '1']],
    },
    {
        name: 'Picard group with ½: PGL₂(ℤ[i][1/(1+i)])', cat: SARITH,
        desc: 'Translations by 1 and i, S and diag(1+i, 1). The vertex stabilizer has finite volume in H³.',
        mats: [['1', '1', '0', '1'], ['1', 'i', '0', '1'], ['0', '-1', '1', '0'], ['1+i', '0', '0', '1']],
    },
    {
        name: 'Hurwitz quaternions at 5 and 13: ⟨1+2i, 1+2j, 3+2i, 3+2j⟩', cat: SARITH,
        desc: 'Definite at ∞, so the certificate is a covering of T₆ × T₁₄ alone. FlashBeam needs a few seconds and four representatives.',
        mats: [['1+2i', '0', '0', '1-2i'], ['1', '2', '-2', '1'], ['3+2i', '0', '0', '3-2i'], ['3', '2', '-2', '3']],
    },
    {
        name: 'Hurwitz quaternions at 5 and 13: five generators', cat: SARITH,
        desc: '1+2i, 1+2j, 1+2k, 3+2i, 3+2j: transitive on the vertices of T₆ × T₁₄.',
        mats: [['1+2i', '0', '0', '1-2i'], ['1', '2', '-2', '1'], ['1', '2i', '2i', '1'], ['3+2i', '0', '0', '3-2i'], ['3', '2', '-2', '3']],
    },
    {
        name: 'Modular group PSL₂(ℤ)', cat: DISCRETE,
        desc: 'Discrete at ∞, with finite area: the pipeline stops at step 2 with Poincaré’s presentation.',
        mats: [['1', '1', '0', '1'], ['0', '-1', '1', '0']],
    },
    {
        name: 'Hurwitz quaternions at 5: ⟨1+2i, 1+2j, 1+2k⟩', cat: DISCRETE,
        desc: 'Free, acting simply transitively on T₆: discrete at the prime above 5.',
        mats: [['1+2i', '0', '0', '1-2i'], ['1', '2', '-2', '1'], ['1', '2i', '2i', '1']],
    },
    {
        name: 'A 3-adic Schottky group', cat: DISCRETE,
        desc: 'Free and discrete in PGL₂(ℚ₃) by Conder’s test.',
        mats: [['3', '0', '0', '1'], ['5', '-4', '2', '-1']],
    },
    {
        name: 'Long–Reid group at t = 9', cat: DISCRETE,
        desc: '(t 0; 0 1), (t²+1 2; t 1): a cocompact Fuchsian group, with Poincaré’s presentation ⟨x, y | [x, y]²⟩. Its action on T₃ × T₄ has finitely many orbits but is not proper (arXiv:2512.19760).',
        mats: [['9', '0', '0', '1'], ['82', '2', '9', '1']],
    },
    {
        name: 'Borel subgroup', cat: NOTDENSE,
        desc: '(1 1; 0 1) and diag(2, 1) fix ∞: the closure is the upper-triangular group.',
        mats: [['1', '1', '0', '1'], ['2', '0', '0', '1']],
    },
    {
        name: 'Normalizer of a torus', cat: NOTDENSE,
        desc: 'diag(2, 1) and (0 1; 1 0): an infinite dihedral group.',
        mats: [['2', '0', '0', '1'], ['0', '1', '1', '0']],
    },
    {
        name: 'Dihedral group of order 6', cat: NOTDENSE,
        desc: 'Finite: its own Zariski closure.',
        mats: [['0', '1', '1', '0'], ['0', '-1', '1', '-1']],
    },
    {
        name: 'Hurwitz quaternions: ⟨1+2i, 3+2j⟩', cat: OPEN,
        desc: 'One generator at each of 5 and 13. The search finds no covering.',
        mats: [['1+2i', '0', '0', '1-2i'], ['3', '2', '-2', '3']],
    },
];

export const CAT_ORDER = [SARITH, DISCRETE, NOTDENSE, OPEN];

/** Ours first, then the Discreteness Algorithm's library (without repeats). */
export async function allExamples() {
    let more = [];
    try { more = await discretenessExamples(); } catch (e) { more = []; }
    const names = new Set(CURATED.map((e) => e.name));
    return CURATED.concat(more.filter((e) => !names.has(e.name)));
}
