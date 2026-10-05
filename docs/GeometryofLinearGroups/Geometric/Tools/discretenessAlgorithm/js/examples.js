/**
 * Examples: a few groups chosen to show the places disagreeing, then the
 * whole of poincare's library and trees' presets, imported from those tools
 * (so a preset added there appears here). Every example is poincare's input
 * state: { name, cat, desc, mats, consts?, anti?, depth? }.
 */
import { exampleLibrary as poincareLibrary } from '../../Kleinian/poincare/js/groupLibrary.js';

const PLACES = 'Places that disagree';

export const CURATED = [
    {
        name: 'Modular group PSL₂(ℤ)', cat: PLACES,
        desc: 'Discrete at ∞ only: at every prime it fixes the standard vertex of the tree and is infinite.',
        mats: [['1', '1', '0', '1'], ['0', '-1', '1', '0']],
    },
    {
        name: 'Hecke group G₅ and its Galois conjugate', cat: PLACES,
        desc: 'n = 2cos(π/5). Fuchsian at n ↦ φ; at n ↦ −1/φ an elliptic of infinite order appears.',
        mats: [['1', 'n', '0', '1'], ['0', '-1', '1', '0']],
        consts: [['n', '2\\cos\\frac{\\pi}{5}']],
    },
    {
        name: 'A 3-adic Schottky group', cat: PLACES,
        desc: 'Free and discrete in PGL₂(ℚ₃) by Conder’s test; compare the real place.',
        mats: [['3', '0', '0', '1'], ['5', '-4', '2', '-1']],
    },
    {
        name: 'ℚ(i): Schottky at one prime above 5', cat: PLACES,
        desc: 'λ = (2+i)⁴ and a conjugate of diag(λ, 1). Free and discrete at (5, i+2), bounded and infinite at (5, i−2).',
        mats: [['-7+24i', '0', '0', '1'], ['-13+24i', '48-144i', '-8+24i', '43-144i']],
    },
    {
        name: 'A 2-adic Schottky group of rank 3', cat: PLACES,
        desc: 'Conjugates of diag(2⁸, 1): Markowitz’s reduction finds an N-reduced basis at 2.',
        mats: [['256', '0', '0', '1'], ['253', '-765', '255', '-767'], ['506', '-3060', '255', '-1534']],
    },
    {
        name: 'Infinite dihedral group over ℚ₃', cat: PLACES,
        desc: 'Torsion: at 3 the decision passes to a torsion-free congruence kernel.',
        mats: [['0', '1', '1', '0'], ['3', '0', '0', '1']],
    },
    {
        name: 'An S-arithmetic group over ℤ[½]', cat: PLACES,
        desc: 'PSL₂(ℤ) and diag(2, 1). Not discrete at any one place: Shimizu at ∞, a unipotent at 2, bounded and infinite elsewhere. Yet it is discrete in PGL₂(ℝ) × PGL₂(ℚ₂).',
        mats: [['1', '1', '0', '1'], ['0', '-1', '1', '0'], ['2', '0', '0', '1']],
    },
    {
        name: 'An elliptic of infinite order', cat: PLACES,
        desc: 'g₁g₂ has trace 3/2: an irrational rotation at ∞. Not discrete at any place.',
        mats: [['1', '1', '0', '1'], ['1', '0', '-\\frac{1}{2}', '1']],
    },
    {
        name: 'Sanov subgroup over ℚ(√2)', cat: PLACES,
        desc: 'x = 1 + √2: free at x ↦ 2.414 (ping-pong), but |x| < ½ at the conjugate place breaks Shimizu’s lemma.',
        mats: [['1', '2', '0', '1'], ['1', '0', '1+\\sqrt{2}', '1']],
    },
];

/** The trees presets, as poincare input states (old field specs become root rows). */
async function treesExamples() {
    try {
        const { EXAMPLES } = await import('../../padicGroups/trees/js/examples.js');
        return EXAMPLES.map((ex) => {
            const consts = [];
            if (ex.field && ex.field.gen && ex.field.gen !== 'i') {
                consts.push({ name: ex.field.gen, poly: ex.field.poly, near: null });
            }
            for (const row of ex.consts || []) consts.push(row);
            const note = String(ex.note || '').replace(/\$[^$]*\$/g, '…').replace(/<[^>]+>/g, '');
            return {
                name: ex.name, cat: `Trees — ${ex.group || 'Trees over number fields'}`,
                desc: note.length > 140 ? `${note.slice(0, 137)}…` : note,
                mats: ex.mats, consts,
            };
        });
    } catch (e) {
        console.warn('[examples] trees presets unavailable:', e);
        return [];
    }
}

/** Every example, curated first. */
export async function allExamples() {
    const fromPoincare = poincareLibrary.map((ex) => ({
        ...ex,
        cat: `Poincaré — ${ex.cat || 'Other'}`,
        consts: [...(ex.name === 'Hecke group' ? [['n', '7']] : []), ...(ex.consts || [])],
    }));
    return [...CURATED, ...fromPoincare, ...(await treesExamples())];
}
