// Symbol palette: [command, glyph, extra search words], grouped as in Overleaf.
const greek = 'alpha α|beta β|gamma γ|delta δ|epsilon ϵ|varepsilon ε|zeta ζ|eta η|theta θ|vartheta ϑ|iota ι|kappa κ|lambda λ|mu μ|nu ν|xi ξ|pi π|varpi ϖ|rho ρ|varrho ϱ|sigma σ|varsigma ς|tau τ|upsilon υ|phi ϕ|varphi φ|chi χ|psi ψ|omega ω|Gamma Γ|Delta Δ|Theta Θ|Lambda Λ|Xi Ξ|Pi Π|Sigma Σ|Upsilon Υ|Phi Φ|Psi Ψ|Omega Ω';
const arrows = 'to → right|rightarrow → right|leftarrow ← left|gets ← left|leftrightarrow ↔|Rightarrow ⇒ implies|Leftarrow ⇐|Leftrightarrow ⇔ iff|implies ⟹|impliedby ⟸|iff ⟺|longrightarrow ⟶|longleftarrow ⟵|longmapsto ⟼|mapsto ↦ maps|hookrightarrow ↪ injection|hookleftarrow ↩|twoheadrightarrow ↠ surjection|uparrow ↑ up|downarrow ↓ down|updownarrow ↕|Uparrow ⇑|Downarrow ⇓|nearrow ↗|searrow ↘|nwarrow ↖|swarrow ↙|rightharpoonup ⇀|leftharpoonup ↼|rightleftharpoons ⇌|leadsto ⇝|circlearrowright ↻|curvearrowright ↷';
const operators = 'sum ∑|prod ∏|coprod ∐|int ∫ integral|iint ∬|iiint ∭|oint ∮ contour|bigcup ⋃ union|bigcap ⋂ intersection|bigoplus ⨁|bigotimes ⨂|bigsqcup ⨆|bigvee ⋁|bigwedge ⋀|pm ± plus minus|mp ∓|times × multiply|div ÷ divide|cdot ⋅ dot|ast ∗|star ⋆|circ ∘ compose|bullet ∙|oplus ⊕|ominus ⊖|otimes ⊗ tensor|oslash ⊘|odot ⊙|cup ∪ union|cap ∩ intersection|sqcup ⊔|sqcap ⊓|vee ∨ or|wedge ∧ and|setminus ∖ minus|wr ≀|dagger †|ddagger ‡|amalg ⨿|nabla ∇ gradient|partial ∂ derivative|sqrt{} √ root|frac{}{} ⁄ fraction|binom{}{} ( binomial';
const relations = 'leq ≤ less|geq ≥ greater|neq ≠ not equal|equiv ≡|approx ≈|sim ∼|simeq ≃|cong ≅ isomorphic|propto ∝|ll ≪|gg ≫|prec ≺|succ ≻|preceq ⪯|succeq ⪰|subset ⊂|supset ⊃|subseteq ⊆|supseteq ⊇|subsetneq ⊊|supsetneq ⊋|sqsubseteq ⊑|in ∈ element|notin ∉|ni ∋|mid ∣ divides|nmid ∤|parallel ∥|perp ⟂ perpendicular|models ⊨|vdash ⊢|dashv ⊣|asymp ≍|doteq ≐|lesssim ≲|gtrsim ≳|triangleleft ◁ normal|trianglelefteq ⊴|bowtie ⋈|coloneqq ≔ defined';
const misc = 'infty ∞ infinity|forall ∀ all|exists ∃|nexists ∄|neg ¬ not|emptyset ∅ empty|varnothing ∅|aleph ℵ|beth ℶ|hbar ℏ|ell ℓ|wp ℘|Re ℜ|Im ℑ|angle ∠|triangle △|square □|blacksquare ■ qed|Box □|diamond ⋄|clubsuit ♣|heartsuit ♡|spadesuit ♠|top ⊤|bot ⊥|flat ♭|sharp ♯|natural ♮|prime ′|backslash ∖|surd √|ldots … dots|cdots ⋯|vdots ⋮|ddots ⋱|langle ⟨|rangle ⟩|lfloor ⌊ floor|rfloor ⌋|lceil ⌈ ceiling|rceil ⌉|mathbb{R} ℝ reals|mathbb{C} ℂ complex|mathbb{Z} ℤ integers|mathbb{Q} ℚ rationals|mathbb{N} ℕ naturals|mathbb{F} 𝔽 field|mathcal{O} 𝒪|degree °';

const parse = (group, data) => data.split('|').map(item => {
  const [command, glyph, ...words] = item.split(' ');
  return {group, command: `\\${command}`, glyph, words: words.join(' ')};
});
export const SYMBOLS = [
  ...parse('Greek', greek), ...parse('Arrows', arrows), ...parse('Operators', operators),
  ...parse('Relations', relations), ...parse('Miscellaneous', misc),
];
export const SYMBOL_GROUPS = ['Greek', 'Arrows', 'Operators', 'Relations', 'Miscellaneous'];
