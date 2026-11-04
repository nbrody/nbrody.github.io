// node tests/latex.test.mjs — the MathQuill-LaTeX readers agree with the plain parser
import { parseWord, randomWord, projEqual, Q, M, mprod, generators, power } from "../js/exact.js";
import { parseWordLatex, evalEntryLatex, plainWordToLatex } from "../js/latexInput.js";

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error("FAIL:", m); } };
let seed = 99;
const rng = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);

for (const p of [2, 3, 5, 7]) {
  const G = generators(p);
  for (let i = 0; i < 300; i++) {
    const w = randomWord(1 + Math.floor(rng() * 10), rng);
    const tex = plainWordToLatex(w);
    ok(projEqual(parseWordLatex(tex, p).matrix, parseWord(w, p).matrix), `word ${w} → ${tex}`);
  }
  // MathQuill-shaped inputs
  const cases = [
    ["StTSt^{-1}StT", "S t T S t^-1 S t T"],
    ["\\sigma t\\sigma", "J t J"],
    ["\\left(St\\right)^{3}W", "S t S t S t W"],
    ["(tT)^{-2}", "T^-1 t^-1 T^-1 t^-1"],
    ["t^{-1}\\cdot T\\cdot t", "t^-1 T t"],
    ["T^2t", "T^2 t"],
    ["W\\ T^{12}", "W T^12"],
    // what MathQuill produces when typing runs on inside an exponent, or text is pasted
    ["t^{-1\\ T\\ t}", "t^-1 T t"],
    ["S\\ t\\ T\\ S\\ t^{-1\\ S\\ t\\ T}", "S t T S t^-1 S t T"],
    ["T^{2\\ t\\ S\\ t^{-1}}", "T^2 t S t^-1"],
    ["\\left(S\\ t\\right)^{3\\ W}", "S t S t S t W"],
    ["t^{-1T}", "t^-1 T"],
  ];
  for (const [tex, plain] of cases) ok(projEqual(parseWordLatex(tex, p).matrix, parseWord(plain, p).matrix), `case ${tex}`);
  // σ t σ = t^{-1}
  ok(projEqual(parseWordLatex("\\sigma t\\sigma", p).matrix, power(G.t, -1)), "σtσ = t⁻¹");
  // entries
  const P = BigInt(p);
  const ents = [
    ["\\frac{1}{p^2}", new Q(1n, P * P)], ["1+\\frac{1}{p}", new Q(P + 1n, P)], ["-\\frac{3}{4}", new Q(-3n, 4n)],
    ["p^{-2}", new Q(1n, P * P)], ["2p", new Q(2n * P)], ["\\left(p+1\\right)^2", new Q((P + 1n) ** 2n)],
    ["0.25", new Q(1n, 4n)], ["3\\cdot\\frac{1}{p}", new Q(3n, P)], ["\\frac{p-1}{p}", new Q(P - 1n, P)], ["p^12", new Q(2n * P)], ["p^{2+1}", new Q(P * P * P)], ["p^{-1-1}", new Q(1n, P * P)],
  ];
  for (const [tex, want] of ents) { const got = evalEntryLatex(tex, p); ok(got.eq(want), `entry ${tex}: got ${got}, want ${want}`); }
}
for (const bad of ["tX", "t^{x}", "(tT", ""]) { let threw = false; try { parseWordLatex(bad, 3); } catch { threw = true; } ok(threw, `rejects word ${JSON.stringify(bad)}`); }
for (const bad of ["\\frac{1}{0}", "1+", "q", ""]) { let threw = false; try { evalEntryLatex(bad, 3); } catch { threw = true; } ok(threw, `rejects entry ${JSON.stringify(bad)}`); }
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
