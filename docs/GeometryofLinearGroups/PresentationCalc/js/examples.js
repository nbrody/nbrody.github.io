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

const SARITH = 'S-arithmetic: certified';
const DISCRETE = 'Discrete at a place';
const NOTDENSE = 'Not Zariski dense';
const OPEN = 'No certificate';

export const CURATED = [
    {
        name: 'PGL₂(ℤ[½])', cat: SARITH, chip: '\\mathrm{PGL}_2(\\mathbb{Z}[\\tfrac12])',
        desc: 'T, S and diag(2, 1). Dense at ∞ and at 2; transitive on the tree T₃, and its vertex stabilizer PGL₂(ℤ) has finite area.',
        mats: [['1', '1', '0', '1'], ['0', '-1', '1', '0'], ['2', '0', '0', '1']],
    },
    {
        name: 'A congruence subgroup of PGL₂(ℤ[⅓])', cat: SARITH, chip: '\\langle T^2, L^2, \\mathrm{diag}(3,1)\\rangle',
        desc: '(1 2; 0 1), (1 0; 2 1) and diag(3, 1): the vertex stabilizer contains Γ(2).',
        mats: [['1', '2', '0', '1'], ['1', '0', '2', '1'], ['3', '0', '0', '1']],
    },
    {
        name: 'Γ₀(3) and diag(2, 1)', cat: SARITH, chip: '\\langle \\Gamma_0(3), \\mathrm{diag}(2,1)\\rangle',
        desc: '(1 1; 0 1), (1 0; 3 1) and diag(2, 1) in PGL₂(ℤ[½]).',
        mats: [['1', '1', '0', '1'], ['1', '0', '3', '1'], ['2', '0', '0', '1']],
    },
    {
        name: 'PSL₂(ℤ[1/5]) without type changes', cat: SARITH, chip: '\\mathrm{PSL}_2(\\mathbb{Z}[\\tfrac15])',
        desc: 'T, S and diag(25, 1) preserve the types of T₆: the certificate needs two orbit representatives.',
        mats: [['1', '1', '0', '1'], ['0', '-1', '1', '0'], ['25', '0', '0', '1']],
    },
    {
        name: 'Picard group with ½: PGL₂(ℤ[i][1/(1+i)])', cat: SARITH, chip: '\\mathrm{PGL}_2(\\mathbb{Z}[i][\\tfrac{1}{1+i}])',
        desc: 'Translations by 1 and i, S and diag(1+i, 1). The vertex stabilizer has finite volume in H³.',
        mats: [['1', '1', '0', '1'], ['1', 'i', '0', '1'], ['0', '-1', '1', '0'], ['1+i', '0', '0', '1']],
    },
    {
        name: 'Hurwitz quaternions at 5 and 13: ⟨1+2i, 1+2j, 3+2i, 3+2j⟩', cat: SARITH, chip: '\\langle 1{+}2i, 1{+}2j, 3{+}2i, 3{+}2j\\rangle',
        desc: 'Definite at ∞: coset enumeration in SO₃(ℤ[1/65]) gives index 96, and Γ is a congruence subgroup of level 16.',
        mats: [['1+2i', '0', '0', '1-2i'], ['1', '2', '-2', '1'], ['3+2i', '0', '0', '3-2i'], ['3', '2', '-2', '3']],
    },
    {
        name: 'Hurwitz quaternions at 5 and 13: five generators', cat: SARITH, chip: '\\mathrm{PU}_2(\\mathbb{Z}[\\tfrac15,\\tfrac1{13}])',
        desc: '1+2i, 1+2j, 1+2k, 3+2i, 3+2j: index 24 in SO₃(ℤ[1/65]), transitive on the vertices of T₆ × T₁₄.',
        mats: [['1+2i', '0', '0', '1-2i'], ['1', '2', '-2', '1'], ['1', '2i', '2i', '1'], ['3+2i', '0', '0', '3-2i'], ['3', '2', '-2', '3']],
    },
    {
        name: 'Hurwitz quaternions: ⟨1+2i, 3+2j⟩', cat: SARITH, chip: '\\langle 1{+}2i, 3{+}2j\\rangle',
        desc: 'One generator at each of 5 and 13: index 2304 in SO₃(ℤ[1/65]) by coset enumeration, a congruence subgroup of level 96. FlashBeam alone finds no covering: it would need 96 orbit representatives.',
        mats: [['1+2i', '0', '0', '1-2i'], ['3', '2', '-2', '3']],
    },
    {
        name: 'Modular group PSL₂(ℤ)', cat: DISCRETE, chip: '\\mathrm{PSL}_2(\\mathbb{Z})',
        desc: 'Discrete at ∞, with finite area: Poincaré’s presentation, and index 2 in PGL₂(ℤ) by Stallings folding.',
        mats: [['1', '1', '0', '1'], ['0', '-1', '1', '0']],
    },
    {
        name: 'Hurwitz quaternions at 5: ⟨1+2i, 1+2j, 1+2k⟩', cat: DISCRETE, chip: '\\text{LPS at }5',
        desc: 'Free, acting simply transitively on T₆: discrete at the prime above 5, and of index 24 in SO₃(ℤ[1/5]).',
        mats: [['1+2i', '0', '0', '1-2i'], ['1', '2', '-2', '1'], ['1', '2i', '2i', '1']],
    },
    {
        name: 'A 3-adic Schottky group', cat: DISCRETE, chip: '\\text{3-adic Schottky}',
        desc: 'Free and discrete in PGL₂(ℚ₃) by Conder’s test.',
        mats: [['3', '0', '0', '1'], ['5', '-4', '2', '-1']],
    },
    {
        name: 'Long–Reid group at t = 9', cat: DISCRETE, chip: '\\text{Long–Reid }t{=}9',
        desc: '(t 0; 0 1), (t²+1 2; t 1): a cocompact Fuchsian group, with Poincaré’s presentation ⟨x, y | [x, y]²⟩. Its action on T₃ × T₄ has finitely many orbits but is not proper (arXiv:2512.19760).',
        mats: [['9', '0', '0', '1'], ['82', '2', '9', '1']],
    },
    {
        name: 'Borel subgroup', cat: NOTDENSE, chip: '\\text{Borel}',
        desc: '(1 1; 0 1) and diag(2, 1) fix ∞: the closure is the upper-triangular group.',
        mats: [['1', '1', '0', '1'], ['2', '0', '0', '1']],
    },
    {
        name: 'ℤ[1/6] ⋊ ℤ: not finitely presented', cat: NOTDENSE, chip: '\\mathbb{Z}[\\tfrac16] \\rtimes \\mathbb{Z}',
        desc: '(1 1; 0 1) and diag(3, 2): z ↦ z + 1 and z ↦ 3z/2. The translations form ℤ[1/6], and t u t⁻¹ = u^{3/2}; by Bieri–Strebel the group is not finitely presented.',
        mats: [['1', '1', '0', '1'], ['3', '0', '0', '2']],
    },
    {
        name: 'A non-split extension of ℤ² by ℤ[1/15]', cat: NOTDENSE, chip: '\\mathbb{Z}[\\tfrac1{15}] \\,.\\, \\mathbb{Z}^2',
        desc: 'z ↦ 3z and z ↦ 5z + 1: the multipliers 3 and 5 have no common fixed point modulo the translations, so [t₁, t₂] = u is a translation.',
        mats: [['3', '0', '0', '1'], ['5', '1', '0', '1']],
    },
    {
        name: 'Normalizer of a torus', cat: NOTDENSE, chip: 'D_\\infty',
        desc: 'diag(2, 1) and (0 1; 1 0): an infinite dihedral group.',
        mats: [['2', '0', '0', '1'], ['0', '1', '1', '0']],
    },
    {
        name: 'Dihedral group of order 6', cat: NOTDENSE, chip: 'D_3',
        desc: 'Finite: its own Zariski closure.',
        mats: [['0', '1', '1', '0'], ['0', '-1', '1', '-1']],
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
