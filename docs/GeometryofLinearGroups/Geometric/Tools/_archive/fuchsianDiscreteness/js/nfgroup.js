/**
 * nfgroup.js — bridge from LaTeX matrix rows to a number-field discreteness analysis.
 * Detects a single algebraic atom (√d / 2cos(π/q)); if present, builds ℚ(α), parses the
 * entries to Mat2NF, runs the (shared) certifier, and returns a wire-format result.
 * Returns {mode:'rational'} when there is no algebraic atom (caller uses the ℚ path).
 */
import { detectAtom, makeContext, parseEntry } from './nfparse.js';
import { Mat2NF } from './mat2nf.js';
import { computeAnalysis, toWire } from './compute.js';

export function analyzeLatexRows(rows) {
    const det = detectAtom(rows.flat());
    if (!det) return { mode: 'rational' };
    if (det.error === 'multiple')
        return { mode: 'error', error: 'multiple', detail: (det.sigs || []).join(', ') };

    let ctx, mats;
    try {
        ctx = makeContext(det.atom);
        mats = rows.map(r => {
            const e = r.map(l => parseEntry(l, ctx));
            return new Mat2NF(ctx.field, ctx.embed, e[0], e[1], e[2], e[3]);
        });
    } catch (e) { return { mode: 'error', error: 'parse', detail: e.message }; }

    for (const m of mats) if (m.det().isZero()) return { mode: 'error', error: 'singular' };

    const { res, domain } = computeAnalysis(mats, {});
    res.field = ctx.label;
    return { mode: 'nf', wire: toWire({ res, domain }), label: ctx.label };
}
