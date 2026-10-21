/**
 * elementaryView.js — the presentation of a Γ that is not Zariski dense (elementary.js), as the last
 * section of card 1, and as the data of the presentation at the top of the page.
 */
import { esc, mix } from './zariskiView.js';

const tex = (s, display = false) => (display ? `\\[${s}\\]` : `\\(${s}\\)`);
const para = (s, cls = 'note') => `<p class="${cls}">${mix(s)}</p>`;
const banner = (status, s) => `<div class="banner" data-status="${status}"><span class="dot"></span><div>${mix(s)}</div></div>`;

/** ⟨ names | relations ⟩, on one line when short */
function presTex(names, rels) {
    const body = rels.length ? rels.join(',\\ ') : '\\ ';
    return `\\Gamma = \\left\\langle ${names.join(', ')} \\;\\middle|\\; ${body} \\right\\rangle`;
}

/** P = { status: 'running' | 'done' | 'error', result, error } */
export function elementarySection(P) {
    if (!P) return '';
    let html = '<h3>Presentation</h3>';
    if (P.status === 'running') return html + para('Computing a presentation of Γ…');
    if (P.status === 'error' || !P.result) return html + banner('open', `No presentation was found: ${String(P.error || 'unknown error').replace(/\$/g, '')}.`);
    const E = P.result;
    const names = E.gens.map((g) => g.name);
    html += `<p class="lead">${esc(E.summary)}</p>`;
    if (E.structure && E.structure !== '1') html += `<div class="head-math">${tex(`\\Gamma \\cong ${E.structure}`, true)}</div>`;
    if (!E.complete) {
        html += banner('open', 'The presentation is incomplete: the relations of the module of translations were not computed for multipliers that are not rational.');
    }
    if (E.gens.length) {
        const kind = E.module && E.D && E.D.free ? `a $${E.module.ringTex}$-presentation` : 'a presentation';
        html += `<p><b>${mix(`As ${kind}.`)}</b> ${E.ringNote ? mix(E.ringNote) : ''}</p>`;
        html += `<div class="pres-block">${tex(presTex(names, E.relations))}</div>`;
    }
    if (E.splitNote) html += para(E.splitNote);
    if (E.fpReason) html += para(E.fpReason);
    if (E.ordinary) {
        const O = E.ordinary;
        const rels = O.relators.concat(O.infinite);
        html += `<p><b>${O.finite ? 'A finite presentation.' : 'An ordinary presentation.'}</b> ${mix(O.note)}</p>`;
        html += `<div class="pres-block">${tex(presTex(names, rels))}</div>`;
    }
    if (E.gens.length) {
        html += `<p><b>${mix('The generators, as words in $g_1, g_2, \\ldots$')}</b></p>`;
        html += '<ul class="nice-gens">' + E.gens.map((g) => `<li>${tex(`${g.name} = ${g.wordTex.length > 600 ? `\\text{(a word of length ${g.length})}` : g.wordTex} = ${g.matTex}`)}</li>`).join('') + '</ul>';
    }
    if (E.given && E.given.length) html += `<p class="note">${mix('Conversely: ')}${E.given.map((t) => tex(t)).join(', ')}.</p>`;
    const checks = ['Every relation was checked exactly on the matrices.'];
    if (E.unitGap) checks.push(`The units among the multipliers were separated numerically (the smallest independent log-vector has length ${E.unitGap.toPrecision(3)}); every relation found among them was checked exactly.`);
    html += `<p class="note">${esc(checks.join(' '))} ${esc(`(${E.ms} ms.)`)}</p>`;
    return html;
}

/** The data for the presentation at the top of the page (main.js presentationData). */
export function elementaryTop(E) {
    const ordinary = E.ordinary && E.ordinary.finite ? E.ordinary : null;
    const rels = ordinary ? ordinary.relators : E.relations;
    const ringPres = !ordinary && E.module && E.D && E.D.free;
    return {
        source: E.structure && E.structure !== '1' ? `Γ ≅ $${E.structure}$` : 'Γ is trivial',
        rels, complete: !!E.complete, free: E.complete && !rels.length && E.gens.length === 1,
        names: E.gens.map((g) => g.name),
        defs: E.gens.map((g) => `${g.name} = ${g.wordTex.length > 300 ? `\\text{(length ${g.length})}` : g.wordTex}`),
        note: ringPres ? `a $${E.module.ringTex}$-presentation${E.finitelyPresented === false ? '; not finitely presented' : ''}` : null,
    };
}
