'use strict';
/* Guided walkthrough shown when embedded in the deck (?embed=1).
 * One tree, a caption, prev/next. Arrow keys are forwarded to the parent
 * deck (iframeNav contract) and never handled here.
 */
(function () {
    const params = new URLSearchParams(location.search);
    if (params.get('embed') !== '1') return;
    const $ = sel => document.querySelector(sel);

    document.addEventListener('DOMContentLoaded', init);

    const L = Leavitt;
    const m = L.mono;
    const P = s => L.parse(s);
    const TAU = '1 + e0 + e10 + s0t10 + s10t0';
    const U_SYN = 's0000t000 + s0010t001 + s010t01 + s0001t1000 + s0011t1001 + s011t101 + s100t1100 + s101t1101 + s11t111';

    let tv, idx = 0, runSeq = 0;

    const fm = html => { $('#tourFormula').innerHTML = html; };
    const live = t => { fm(L.toHTML(L.make(t.currentPairs()))); };

    const steps = [
        {
            cap: 'An element of <b>R</b> is an 𝔽₂-linear combination — i.e. a <b>finite set</b> — of monomials ' +
                 's<sub>a</sub>t<sub>b</sub>. The diagonal ones e<sub>a</sub> = s<sub>a</sub>t<sub>a</sub> are ' +
                 'idempotents: picture e<sub>a</sub> as the <b>vertex a</b> of the binary tree (the projection onto ' +
                 'the cylinder [a]).',
            async play(alive) {
                tv.setDepth(3);
                const el = P('e0 + e11');
                tv.showElement(el);
                fm(L.toHTML(el));
            }
        },
        {
            cap: 'The defining relation s₀t₀ + s₁t₁ = 1, conjugated into a corner, says ' +
                 '<b>e<sub>a</sub> = e<sub>a0</sub> + e<sub>a1</sub></b>: a vertex equals the sum of its two ' +
                 'children. Same element, different vertex sets — the calculator always merges back to the ' +
                 'canonical form.',
            async play(alive) {
                tv.setDepth(3);
                tv.showElement(P('e0')); fm('e<sub>0</sub>');
                await tv.sleep(700); if (!alive()) return;
                await tv.playSteps([{ type: 'subdivide', p: m('0', '0'), into: [m('00', '00'), m('01', '01')] }], live);
                if (!alive()) return;
                await tv.sleep(900); if (!alive()) return;
                await tv.playSteps([{ type: 'merge', from: [m('00', '00'), m('01', '01')], into: m('0', '0') }], live);
            }
        },
        {
            cap: 'Coefficients are mod 2, so <b>equal monomials cancel</b>. To add e₀ + e₀₀: split e₀ into its ' +
                 'children, and the two copies of e₀₀ annihilate. The relations do the bookkeeping: ' +
                 'e₀ + e₀₀ = e₀₁.',
            async play(alive) {
                tv.setDepth(3);
                const raw = P('e0 + e00');
                const trace = [];
                const res = L.canonicalize(raw, trace);
                tv.showElement(raw); fm(L.toHTML(raw));
                await tv.sleep(800); if (!alive()) return;
                await tv.playSteps(trace, live);
                if (!alive()) return;
                tv.showElement(res); fm('e<sub>0</sub> + e<sub>00</sub> = e<sub>01</sub>');
            }
        },
        {
            cap: 'Off-diagonal monomials are <b>arrows</b>: s<sub>a</sub>t<sub>b</sub> maps the cylinder [b] onto ' +
                 '[a] — on strings, s₀₁t₁ · e<sub>1ω</sub> = e<sub>01ω</sub>. A general element of R is a set of ' +
                 'vertices and arrows.',
            async play(alive) {
                tv.setDepth(3);
                const el = P('s01t1');
                tv.showElement(el);
                fm('s<sub>01</sub>t<sub>1</sub> : [1] → [01]');
            }
        },
        {
            cap: '<b>Multiplication composes arrows</b> right-to-left, matching prefixes in the middle: ' +
                 't₀s₀ = 1 (prepend 0, then delete it) but s₀t₀ = e₀ ≠ 1. One-sided inverses — ' +
                 'the engine of everything in this chapter.',
            async play(alive) {
                tv.setDepth(2);
                const s0 = m('0', ''), t0 = m('', '0');
                tv.showPairs([s0, t0]);
                fm('t<sub>0</sub> · s<sub>0</sub> = ?');
                await tv.sleep(700); if (!alive()) return;
                await tv.pulse(tv.key(s0)); await tv.pulse(tv.key(t0)); if (!alive()) return;
                await tv.spawn(m('', ''), '#ffffff');
                fm('t<sub>0</sub>s<sub>0</sub> = 1');
                await tv.sleep(1300); if (!alive()) return;
                tv.showPairs([s0, t0]);
                fm('s<sub>0</sub> · t<sub>0</sub> = ?');
                await tv.sleep(700); if (!alive()) return;
                await tv.pulse(tv.key(t0)); await tv.pulse(tv.key(s0)); if (!alive()) return;
                await tv.spawn(m('0', '0'), '#ffffff');
                fm('s<sub>0</sub>t<sub>0</sub> = e<sub>0</sub> ≠ 1');
            }
        },
        {
            cap: '<b>Incomparable prefixes annihilate.</b> t₁ · s₀ = 0: s₀ lands inside cylinder [0], but t₁ only ' +
                 'accepts strings that start with 1. Products of monomials are matched by prefix or die.',
            async play(alive) {
                tv.setDepth(2);
                const s0 = m('0', ''), t1 = m('', '1');
                tv.showPairs([s0, t1]);
                fm('t<sub>1</sub> · s<sub>0</sub> = ?');
                await tv.sleep(700); if (!alive()) return;
                await tv.pulse(tv.key(s0)); await tv.pulse(tv.key(t1)); if (!alive()) return;
                await tv.flashZero('0');
                fm('t<sub>1</sub>s<sub>0</sub> = 0');
            }
        },
        {
            cap: '<b>Units.</b> τ = 1 + e₀ + e₁₀ + s₀t₁₀ + s₁₀t₀ swaps the cylinders [0] ↔ [10] and fixes ' +
                 'everything else. Watch τ·τ: all 25 cross terms cancel in pairs (char 2), leaving 1. ' +
                 'Swaps like τ generate Thompson’s group V inside R<sup>×</sup>.',
            async play(alive) {
                tv.setDepth(3);
                const tau = P(TAU);
                tv.showElement(tau);
                fm('τ = ' + L.toHTML(tau));
                await tv.sleep(1400); if (!alive()) return;
                const traces = { pairs: [], canon: [] };
                const res = L.mul(tau, tau, traces);
                const oldSpeed = tv.speed;
                if (tv.speed > 0) tv.speed = 2.4;
                tv.clearMarkers();
                fm('τ · τ = &hellip;');
                for (const st of traces.pairs) {
                    if (!alive()) { tv.speed = oldSpeed; return; }
                    if (st.r) { await tv.spawn(st.r); live(tv); }
                }
                await tv.sleep(300); if (!alive()) { tv.speed = oldSpeed; return; }
                await tv.playSteps(traces.canon, live);
                tv.speed = oldSpeed;
                if (!alive()) return;
                tv.showElement(res);
                fm('τ · τ = 1 — an involution in R<sup>×</sup>');
            }
        },
        {
            cap: 'The contraction <b>u</b> from the proof: nine arrows implementing its prefix table — an element ' +
                 'of Thompson’s group V ⊆ R<sup>×</sup>, with u·u* = u*·u = 1. Build your own elements, click ' +
                 'vertices and arrows, and multiply them in the full calculator.',
            async play(alive) {
                const u = P(U_SYN);
                tv.setDepth(5);
                tv.showElement(u);
                fm('u = ' + L.toHTML(u));
            }
        },
    ];

    function init() {
        document.body.classList.add('embed');
        $('#tourRoot').hidden = false;
        tv = new TreeViz($('#tourSvg'), { width: 680, height: 268, pad: 18 });

        $('#tourPrev').addEventListener('click', () => go(idx - 1));
        $('#tourNext').addEventListener('click', () => go(idx + 1));

        // Deck embed contract: forward navigation keys to the parent, never
        // handle them here.
        window.addEventListener('keydown', e => {
            if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' '].includes(e.key)) {
                parent.postMessage({ type: 'iframeNav', key: e.key }, '*');
                e.preventDefault();
            }
        });

        go(0);
    }

    async function go(i) {
        if (i < 0 || i >= steps.length) return;
        idx = i;
        const mine = ++runSeq;
        const alive = () => runSeq === mine;
        $('#tourNum').textContent = (i + 1) + ' / ' + steps.length;
        $('#tourPrev').disabled = i === 0;
        $('#tourNext').disabled = i === steps.length - 1;
        $('#tourCaption').innerHTML = steps[i].cap;
        fm('');
        tv.speed = 1;
        tv.clearMarkers();
        await steps[i].play(alive);
    }
})();
