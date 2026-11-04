// Content for the companion pages. Plain data: HTML strings with $…$ math. Numbered references
// written as plain text ("Lemma 3.1", "(4.15)", "§3") become links with previews automatically.
// Leave a list empty (or the export out) and its page is not offered.
const R = String.raw;

// kind: def | lemma | prop | thm | goal | eq | remark | input; target: id on the page;
// cite: a CITED key for inputs that live only on the Cited results page; uses: ids this rests on
export const DEP_NODES = [
  { id: 'input', kind: 'input', label: 'A cited result', gist: 'one line', cite: 'example', uses: [] },
  { id: 'eq11', kind: 'eq', label: '(1.1)', gist: R`$x^2\ge0$`, target: 'eq-1-1', uses: ['input'] },
  { id: 'thm11', kind: 'goal', label: 'Theorem 1.1', gist: 'the main theorem', target: 'thm-1-1', uses: ['eq11'] },
];

export const DEF_TOPICS = ['Basics'];
// level: basic | intermediate | specialized; origin: paper | background; topic: index into DEF_TOPICS
export const DEFINITIONS = [
  { key: 'square', term: 'Square', topic: 0, level: 'basic', origin: 'background', text: R`The number $x^2=x\cdot x$.`, where: '(1.1)' },
];

// rows: [symbol, meaning, first appearance (a reference, or '#id' of a heading), note ('Not …' marks a clash)]
export const NOTATION_GROUPS = [
  { title: 'Numbers', rows: [[R`$x$`, 'a real number', '(1.1)', '']] },
];

export const CITED = [
  { key: 'example', name: 'A cited theorem', who: 'Author (year)', statement: 'The statement, as the paper uses it.', used: 'Theorem 1.1' },
];

// slips in the source: where, and the intended reading
export const SLIPS = [];

export const GUIDE_HTML = R`<h3 class="cmp-h3" id="guide-parts">Status of each part</h3>
<div class="table-scroll"><table class="params">
<tr><th>Part</th><th>Status</th><th>Where the weight sits</th></tr>
<tr><td>Theorem 1.1</td><td>new</td><td>TEMPLATE</td></tr>
</table></div>`;

export const TEXT = {
  kicker: 'Short Title · companion',
  trace: 'Trace what Theorem 1.1 rests on',
  intro: {},
};
