// polynomial invariants of every example: names, Yamada, and that relaxing changes nothing
import { buildGraph } from '../js/model.js';
import { Relaxer } from '../js/engine.js';
import { graphInvariants, graphDiagram } from '../js/invariants.js';
import { Poly, yamada } from '../js/polynomials.js';
import { EXAMPLES } from '../js/examples.js';
const only = process.argv[2] ? process.argv[2].split(',') : null;
const its = +(process.argv[3] || 600);
const sig = inv => [inv.cycles.map(c => `${c.name}|${c.alex ? Poly.key(c.alex) : '?'}|${c.jones ? Poly.key(c.jones) : '?'}`).sort().join(' '),
    inv.graph.maxDegree <= 3 && inv.graph.yamada ? Poly.key(inv.graph.yamada) : '', inv.graph.linkJones ? Poly.key(inv.graph.linkJones) : ''].join(' / ');
let bad = 0;
for (const cat of EXAMPLES) for (const ex of cat.items) {
    if (only && !only.includes(ex.id)) continue;
    const g = buildGraph(ex.spec());
    const a = graphInvariants(g, 120, { budgetMs: 4000 });
    // Yamada from another direction must agree (for max degree ≤ 3)
    let dirOk = true;
    if (a.graph.yamada && a.graph.maxDegree <= 3) {
        for (const d of [[0.31, -0.52, 0.79], [0.9, 0.1, 0.42]]) {
            const r = yamada(graphDiagram(g, d), { maxStates: 120000 });
            if (r && !Poly.eq(r.R, a.graph.yamada)) dirOk = false;
        }
    }
    const r = new Relaxer(g, {});
    for (let i = 0; i < its; i++) r.step();
    const b = graphInvariants(g, 120, { budgetMs: 4000 });
    const ok = sig(a) === sig(b) && dirOk;
    if (!ok) bad++;
    const names = {};
    for (const c of a.cycles) names[c.name ?? '?'] = (names[c.name ?? '?'] || 0) + 1;
    const Y = a.graph.yamada ? Poly.tex(a.graph.yamada, 'x') : `— (${a.graph.yamadaCrossings} crossings)`;
    console.log(`${ok ? 'ok ' : 'BAD'} ${ex.id.padEnd(15)} ${a.ms.toFixed(0).padStart(5)}ms (graph ${a.graph.ms.toFixed(0)}) ${JSON.stringify(names)}  R=${Y.length > 70 ? Y.slice(0, 70) + '…' : Y}${a.graph.linkJones ? '  V=' + Poly.tex(a.graph.linkJones, 't', 2) : ''}${dirOk ? '' : '  (Yamada depends on direction!)'}${sig(a) === sig(b) ? '' : '\n    before ' + sig(a).slice(0, 200) + '\n    after  ' + sig(b).slice(0, 200)}`);
}
process.exit(bad ? 1 : 0);
