// The walkthrough (the "?" in the panel header, or ?tutorial in the URL): a caption bar under the
// picture steps through the tool, after poincare's tutorial.js. Steps are declarative: entering
// step k rebuilds its state from scratch (field, settings, example, current element, camera),
// so stepping back or jumping can't leave things half-done. A step's effect (generators acting,
// the collapse) plays as an animation going forward and is applied at once going back.

const SL2 = '\\begin{pmatrix} 1 & t \\\\ 0 & 1 \\end{pmatrix}';

const STEPS = [
    {
        caption: 'Every vertex of the Bruhat–Tits tree of \\(\\mathbb{Q}((1/t))\\) carries a hyperbolic plane. Here is the base plane \\(X(v_0)\\), and at each rational cusp the plane of a neighbouring vertex: the link of \\(v_0\\) is \\(\\mathbb{P}^1(\\mathbb{Q})\\).',
        state: { field: 'Q', dep: 1, view: 'default' },
    },
    {
        caption: 'The plane at \\(p/q\\) hangs on an edge of length \\(1/q\\). Its other cusps carry planes in turn: the vertices two steps from \\(v_0\\).',
        state: { field: 'Q', dep: 2, view: 'default' },
    },
    {
        caption: 'Keep going, and you have the <strong>tree of planes</strong>.',
        state: { field: 'Q', dep: 4, view: 'default' },
    },
    {
        caption: 'From straight above the tree flattens out: each plane lies just outside its parent, touching it at the cusp it hangs from.',
        state: { field: 'Q', dep: 4, view: 'top' },
    },
    {
        caption: '\\(\\mathrm{SL}_2(\\mathbb{Z})\\) fixes \\(v_0\\) and acts on its plane. Watch \\(S: z \\mapsto -1/z\\) turn the base plane while every other plane rides its cusp.',
        state: { field: 'Q', dep: 4, view: 'default' },
        play: { gens: [[0, false]] },
    },
    {
        caption: `\\(${SL2}\\) fixes the plane at \\(\\infty\\) and turns the tree about it: the half-plane rolls up into a disk while another plane unrolls to take its place.`,
        state: { field: 'Q', dep: 4, view: 'default' },
        play: { gens: [[2, false]] },
    },
    {
        caption: 'Each plane now shows the picture of another, moved by the <em>current element</em>. Hover a plane to see whose.',
        state: { field: 'Q', dep: 4, view: 'default', apply: [[2, false]] },
    },
    {
        caption: 'All of \\(\\mathrm{PGL}_2(\\mathbb{Q}(t))\\) acts. A local map of negative determinant reverses a plane, drawn as a half-turn: \\(\\mathrm{diag}(-1, 1)\\) turns the whole tree over.',
        state: { field: 'Q', dep: 4, view: 'default', example: 'PGL₂: a reflection, an inversion, a shift by one' },
        play: { gens: [[0, false]] },
    },
    {
        caption: 'Setting \\(t = 1\\) sends \\(\\mathrm{PGL}_2(\\mathbb{Q}[t, 1/t])\\) to \\(\\mathrm{PGL}_2(\\mathbb{Q})\\), which acts on <strong>one</strong> hyperbolic plane. Every plane is laid onto it by its frame.',
        state: { field: 'Q', dep: 4, view: 'default', specA: '1' },
        play: { collapse: true },
    },
    {
        caption: 'Collapsed, a generator acts by its value at \\(t = 1\\), rigidly on the one plane: the translation by \\(t\\) becomes \\(z \\mapsto z + 1\\).',
        state: { field: 'Q', dep: 4, view: 'collapsed', specA: '1', collapsed: true },
        play: { gens: [[2, false]] },
    },
    {
        caption: 'Over \\(\\mathbb{Q}(i)\\) the residue field sits in \\(\\mathbb{C}\\), so every vertex carries hyperbolic 3-space: a <strong>ball</strong>, with children at the Gaussian rational points, sized by height. The circles pass through neighbouring cusps.',
        state: { field: 'i', dep: 4, view: 'default' },
    },
    {
        caption: `The Picard group \\(\\mathrm{PSL}_2(\\mathbb{Z}[i])\\) fixes \\(v_0\\) and moves its ball, as \\(S\\) does first; then \\(${SL2}\\) turns the tree of balls about the ball at \\(\\infty\\).`,
        state: { field: 'i', dep: 4, view: 'default' },
        play: { gens: [[0, false], [3, false]] },
    },
    {
        caption: 'Over \\(\\mathbb{Q}(\\omega)\\) the children sit at the Eisenstein points, and \\(\\mathrm{diag}(1 + \\omega, 1)\\) turns the balls on the axis from \\(0\\) to \\(\\infty\\) by a sixth of a turn.',
        state: { field: 'omega', dep: 4, view: 'default', example: 'Eisenstein translations in t' },
        play: { gens: [[2, false]] },
    },
    {
        caption: 'That is the tour. Close it to explore: the <strong>Group</strong> tab takes your own generators, and the <strong>View</strong> tab changes the picture.',
        state: { field: 'Q', dep: 4, view: 'default' },
    },
];

let bar = null, index = 0, token = 0, api = null;

export function startTutorial(hooks) {
    api = hooks;
    if (bar) { go(0, true); return; }
    document.documentElement.classList.add('tutorial-mode');
    bar = document.createElement('div');
    bar.id = 'tutorial-caption';
    bar.setAttribute('role', 'region');
    bar.setAttribute('aria-label', 'Walkthrough');
    bar.innerHTML = `
        <button class="tut-arrow" data-d="-1" title="Back (←)" aria-label="Previous step">‹</button>
        <div class="tut-text" aria-live="polite"></div>
        <span class="tut-counter"></span>
        <button class="tut-arrow" data-d="1" title="Next (→)" aria-label="Next step">›</button>
        <button class="tut-close" title="Close the walkthrough (Esc)" aria-label="Close the walkthrough">×</button>`;
    document.body.appendChild(bar);
    bar.querySelectorAll('.tut-arrow').forEach((b) => b.addEventListener('click', () => go(index + +b.dataset.d, +b.dataset.d > 0)));
    bar.querySelector('.tut-close').addEventListener('click', stop);
    document.addEventListener('keydown', onKey);
    go(0, true);
}

function onKey(e) {
    if (!bar || (e.target && e.target.closest && e.target.closest('input, textarea, select, .mq-editable-field'))) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); go(index + 1, true); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); go(index - 1, false); }
    else if (e.key === 'Escape') stop();
}

function stop() {
    token++;
    bar?.remove();
    bar = null;
    document.removeEventListener('keydown', onKey);
    document.documentElement.classList.remove('tutorial-mode');
    api.finish();
}

async function go(k, forward) {
    if (!bar || k < 0 || k >= STEPS.length) return;
    index = k;
    const t = ++token, step = STEPS[k];
    bar.querySelector('.tut-text').innerHTML = step.caption;
    bar.querySelector('.tut-counter').textContent = `${k + 1} / ${STEPS.length}`;
    const [back, next] = bar.querySelectorAll('.tut-arrow');
    back.disabled = k === 0;
    next.disabled = k === STEPS.length - 1;
    api.typeset(bar.querySelector('.tut-text'));
    api.prepare(step.state);
    if (!step.play) return;
    if (!forward) { api.effect(step.play, true); return; }
    await api.settle();                           // let the camera arrive before anything moves
    if (t === token) await api.effect(step.play, false);
}
