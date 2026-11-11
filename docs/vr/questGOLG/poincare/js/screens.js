/**
 * The panels on the workbench:
 *  - left:  Groups (the library), View (what is drawn), Move (isometries,
 *           the inside view);
 *  - right: Certificate, Invariants, Face (the selected face);
 *  - a status strip above the ball.
 * All text with mathematics is LaTeX (MathJax via ui/tex.js).
 */
import { createPanel } from './ui/panel.js';
import { presentationTex, wordTex } from './engine.js';
import {
    app, on, libraryByCategory, randomPreset, pairingGenerators, faceLabel, statusSummary, nameParts,
    applyGenerator, applyHome, ensureDelaunay, PALETTES
} from './state.js';

const fmt = (x, d = 6) => (Number.isFinite(x) ? x.toFixed(d) : '—');
/** Fixed digits without a stray minus sign on a rounded zero. */
const fix = (x, d) => (Math.abs(x) < 0.5 * 10 ** -d ? 0 : x).toFixed(d);
/** LaTeX a + b i. */
const cplx = (re, im, d) => `${fix(re, d)} ${im >= 0 ? '+' : '-'} ${fix(Math.abs(im), d)}\,i`;

export function createScreens({ actions, workbench }) {
    const ui0 = { left: 'groups', right: 'cert', cat: 0 };

    // ---------------- panels ----------------

    const left = createPanel({ name: 'left', widthM: 0.44, heightM: 0.44, theme: app.settings.theme, build: buildLeft });
    const right = createPanel({ name: 'right', widthM: 0.44, heightM: 0.46, theme: app.settings.theme, build: buildRight });
    const strip = createPanel({ name: 'strip', widthM: 0.46, heightM: 0.085, theme: app.settings.theme, build: buildStrip });

    left.mesh.position.set(-0.47, -0.03, 0.11);
    left.mesh.rotation.set(-0.08, 0.55, 0, 'YXZ');
    right.mesh.position.set(0.47, -0.02, 0.11);
    right.mesh.rotation.set(-0.08, -0.55, 0, 'YXZ');
    strip.mesh.position.set(0, 0.3, 0.02);
    strip.mesh.rotation.set(-0.12, 0, 0);
    workbench.add(left.mesh, right.mesh, strip.mesh);
    const panels = [left, right, strip];

    // ---------------- left: groups / view / move ----------------

    function buildLeft(ui) {
        ui.tabs('leftTab', [
            { value: 'groups', label: 'Groups' }, { value: 'view', label: 'View' }, { value: 'move', label: 'Move' }
        ], ui0.left);
        ui.space(10 * ui.s);
        if (ui0.left === 'groups') groupsTab(ui);
        else if (ui0.left === 'view') viewTab(ui);
        else moveTab(ui);
    }

    function groupsTab(ui) {
        const cats = libraryByCategory();
        if (ui0.cat >= cats.length) ui0.cat = 0;
        ui.row(r => {
            r.subheading('Library');
            r.spacer();
            r.button('random', 'Surprise me', { icon: 'reset' });
        });
        ui.space(6 * ui.s);
        ui.columns([0.42, 0.58], (c, u) => {
            if (c === 0) {
                u.scrollArea('cats', null, (s) => {
                    cats.forEach((cat, i) => {
                        s.button(`cat:${i}`, shortCat(cat.name), { active: i === ui0.cat, value: i, align: 'left', size: 24 * ui.s, height: 54 * ui.s });
                        s.space(6 * ui.s);
                    });
                });
            } else {
                const cat = cats[ui0.cat];
                u.scrollArea(`presets:${ui0.cat}`, null, (s) => {
                    for (const it of cat.items) {
                        s.card((k) => {
                            k.text(nameParts(it.name).map(x => (typeof x === 'string' ? { text: x, bold: true } : x)), { size: 25 * ui.s });
                            if (it.desc) k.text(it.desc, { muted: true, size: 20 * ui.s });
                        }, { id: `preset:${it.index}`, value: it.index, active: it.index === app.presetIndex, pad: 16 * ui.s });
                        s.space(8 * ui.s);
                    }
                });
            }
        });
    }

    function viewTab(ui) {
        const s = app.settings;
        ui.scrollArea('viewScroll', null, (u) => {
            u.label('Domain');
            const R = app.delaunay;
            u.segmented('domain', [
                { value: 'dirichlet', label: 'Dirichlet' },
                { value: 'delaunay', label: 'Delaunay', disabled: !!(R && !R.ok) || (app.planar && s.plane) }
            ], s.domain);
            if (s.domain === 'delaunay' && R && !R.ok) u.text(R.message || 'No Delaunay domain for this group.', { muted: true, size: 22 * u.s });
            if (app.planar) u.toggle('plane', 'Draw the Fuchsian group in its plane', s.plane);
            u.space(4 * u.s);
            u.toggle('faces', 'Faces', s.faces);
            u.toggle('edges', 'Edges, by edge cycle', s.edges);
            u.toggle('vertices', 'Vertices and cusps', s.vertices);
            u.toggle('labels', 'Face labels', s.labels);
            u.slider('opacity', 'Face opacity', s.opacity, 0.15, 1, { step: 0.05, format: v => `${Math.round(v * 100)}%` });
            u.divider();
            u.toggle('tiling', 'Neighboring tiles', s.tiling);
            if (s.tiling) u.slider('tilingRadius', 'Tiles within distance', ui0.tilingDraft ?? s.tilingRadius, 0.6, 3, { step: 0.1, format: v => v.toFixed(1) });
            u.toggle('cayley', 'Cayley graph', s.cayley);
            u.toggle('limit', 'Limit set', s.limit);
            u.divider();
            u.label('Colors');
            u.row(r => {
                for (const [key, p] of Object.entries(PALETTES)) r.button(`pal:${key}`, p.name, { active: s.palette === key, value: key, size: 22 * u.s, height: 50 * u.s });
            });
            u.space(6 * u.s);
            u.segmented('theme', [{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }], s.theme);
            u.slider('ballRadius', 'Ball size', s.ballRadius * 2, 0.16, 0.8, { step: 0.02, format: v => `${Math.round(v * 100)} cm` });
        });
    }

    function moveTab(ui) {
        ui.scrollArea('moveScroll', null, (u) => {
            u.label('Current element');
            u.row(r => {
                r.tex(app.word.length ? wordTex(app.word, 18) : 'e', { size: 32 * u.s });
                r.spacer();
                r.button('reset', 'Reset view', { icon: 'reset', size: 24 * u.s, height: 52 * u.s });
            });
            u.space(4 * u.s);
            u.label('Your generators');
            u.row(r => {
                app.matrices.forEach((m, i) => {
                    r.button(`gen:${i}:+`, { tex: `g_{${i + 1}}` }, { value: [i, false], disabled: !!app.anim });
                    r.button(`gen:${i}:-`, { tex: `g_{${i + 1}}^{-1}` }, { value: [i, true], disabled: !!app.anim });
                });
            });
            const P = pairingGenerators();
            if (P.length) {
                u.space(4 * u.s);
                u.label('Face pairings');
                u.row(r => {
                    for (const g of P.slice(0, 24)) {
                        r.button(`s:${g.k}:+`, { tex: `s_{${g.k}}` }, { value: [g.k, false], disabled: !!app.anim, size: 26 * u.s, height: 52 * u.s });
                        if (g.partner !== g.wall) r.button(`s:${g.k}:-`, { tex: `s_{${g.k}}^{-1}` }, { value: [g.k, true], disabled: !!app.anim, size: 26 * u.s, height: 52 * u.s });
                    }
                });
            }
            u.divider();
            u.label('Inside the manifold');
            u.toggle('inside', 'Step inside the tiling', app.inside, { disabled: !!app.anim });
            if (app.insideNotice) u.text(app.insideNotice, { color: u.theme.warn, size: 22 * u.s });
            u.text(app.inside
                ? 'Walk, pull the world with a pinch, or push the thumbstick to fly. Point at the translucent Dirichlet cell and tap a face to inspect its pairing; tap twice or use the Face panel to cross it.'
                : 'Stand inside the tiling of hyperbolic space by copies of the domain.', { muted: true, size: 22 * u.s });
            if (app.inside) u.text('Inside uses the Dirichlet cell. Crossing a selected face is an instant teleport.', { muted: true, size: 22 * u.s });
            if (app.inside) u.toggle('honeycomb', 'Edges only (honeycomb)', app.settings.honeycomb);
            u.space(6 * u.s);
            u.button('recenter', 'Bring the workbench to me', { icon: 'back' });
        });
    }

    // ---------------- right: certificate / invariants / face ----------------

    function buildRight(ui) {
        ui.tabs('rightTab', [
            { value: 'cert', label: 'Certificate' }, { value: 'inv', label: 'Invariants' }, { value: 'face', label: 'Face' }
        ], ui0.right);
        ui.space(10 * ui.s);
        if (ui0.right === 'cert') certTab(ui);
        else if (ui0.right === 'inv') invTab(ui);
        else faceTab(ui);
    }

    function certTab(ui) {
        const st = statusSummary();
        ui.chip(st.text, { color: { ok: 'ok', warn: 'warn', fail: 'fail', pending: 'accent' }[st.kind] || 'muted' });
        ui.space(6 * ui.s);
        const H = app.home, rep = app.report, inv = app.invariants;
        if (!H || !rep) { ui.text(app.status === 'computing' ? 'Computing…' : 'Choose a group in the library.', { muted: true }); return; }
        ui.scrollArea('certScroll', null, (u) => {
            const nd = rep.nondiscrete;
            if (nd && nd.headline) u.text(nd.headline, { size: 24 * u.s });
            if (rep.classical && rep.classical.headline) u.text(rep.classical.headline, { size: 24 * u.s });
            const pairs = new Set(H.walls.map((w, i) => (w.pairing ? Math.min(i, w.pairing.partner) : i))).size;
            u.richLine([`${H.walls.length} faces in ${pairs} pairs; basepoint stabilizer of order ${H.stabilizer.order}.`], { size: 26 * u.s });
            const cyc = rep.edgeCycles || [];
            if (cyc.length) u.richLine([`${cyc.length} edge cycles, ${cyc.filter(c => c.ok).length} with angle sum `, { tex: '2\\pi/m' }, '.'], { size: 26 * u.s });
            if (inv && inv.finiteVolume && inv.volume != null) u.richLine(['Covolume ', { tex: `\\mathrm{vol} = ${fmt(inv.volume, 8)}` }, '.'], { size: 26 * u.s });
            else if (inv) u.text('Infinite covolume: the domain reaches the sphere at infinity in open patches.', { size: 26 * u.s });
            if ((rep.cusps || []).length) u.richLine([`${rep.cusps.length} cusp${rep.cusps.length === 1 ? '' : 's'} (horoballs at the ideal vertices).`], { size: 26 * u.s });
            const mem = rep.membership || [];
            if (mem.length) {
                const ok = mem.every(m => m.ok !== false);
                u.richLine([ok ? 'Every generator ' : 'Not every generator ', { tex: 'g_i' }, ok ? ' is a word in the face pairings.' : ' is a word in the face pairings.'], { size: 26 * u.s });
            }
            if (rep.exactUsed) {
                u.richLine(app.fieldTex ? ['Relations checked exactly over ', { tex: app.fieldTex }, '.'] : ['Relations checked in exact arithmetic.'], { size: 26 * u.s });
            }
            if (app.timing) u.text(`Computed in ${Math.round((app.timing.domain || 0) + (app.timing.certificate || 0) + (app.timing.invariants || 0))} ms by the desktop tool’s engine.`, { muted: true, size: 21 * u.s });
            u.divider();
            u.label('Certificate log');
            const entries = (rep.entries || []).slice(0, 40);
            for (const e of entries) {
                const color = e.kind === 'fail' ? 'fail' : e.kind === 'warn' ? 'warn' : e.kind === 'ok' ? 'ok' : e.kind === 'head' ? 'text' : 'muted';
                u.text(e.text, { size: 20 * u.s, mono: e.kind !== 'head', color: color === 'muted' ? undefined : u.theme[color], muted: color === 'muted', bold: e.kind === 'head' });
            }
        });
    }

    function invTab(ui) {
        const inv = app.invariants, rep = app.report;
        if (!inv || !rep) { ui.text('Compute a domain first.', { muted: true }); return; }
        ui.scrollArea('invScroll', null, (u) => {
            if (rep.status !== 'verified' && !rep.classical) u.text('The certificate did not fully pass: treat these values as provisional.', { size: 22 * u.s, color: u.theme.warn });
            u.label('Summary');
            u.richLine([{ tex: '\\mathrm{vol}' }, ' = ', inv.finiteVolume && inv.volume != null ? fmt(inv.volume, 9) : { tex: '\\infty' }], { size: 27 * u.s });
            if (inv.h1Tex) u.richLine([{ tex: `H_1 \\cong ${inv.h1Tex}` }], { size: 27 * u.s });
            u.richLine([inv.torsion && inv.torsion.length ? `Torsion of order ${inv.torsion.join(', ')}` : 'Torsion-free'], { size: 25 * u.s });
            const cusps = rep.cusps || [];
            cusps.forEach((c, i) => {
                if (!c.shape) return;
                if (c.shape.rank === 1) { u.text(`Cusp ${i + 1}: rank 1`, { size: 24 * u.s }); return; }
                const [re, im] = c.shape.shape;
                u.richLine([`Cusp ${i + 1} shape `, { tex: `\\tau = ${cplx(re, im, 5)}` }], { size: 24 * u.s });
            });
            if (inv.simplified) {
                u.divider();
                u.label('Presentation');
                u.tex(presentationTex(inv.simplified, (i) => `a_{${i}}`, { maxRelators: 6 }), { display: true, size: 26 * u.s });
                const dict = inv.simplified.words.slice(0, 6).map((w, k) => `a_{${k + 1}} = ${wordTex(w, 12)}`).join(',\\quad ');
                if (dict) u.tex(dict, { size: 22 * u.s });
                if (inv.inUser) {
                    u.text('In your generators:', { muted: true, size: 22 * u.s });
                    u.tex(presentationTex(inv.inUser, (i) => `g_{${i}}`, { maxRelators: 5 }), { display: true, size: 24 * u.s });
                }
            }
            const tf = inv.traceField;
            u.divider();
            u.label('Invariant trace field');
            if (!app.exactCtx) u.text('The entries are not all algebraic, so the trace field is not computed.', { muted: true, size: 22 * u.s });
            else if (!tf || tf.note) u.text(tf && tf.note ? tf.note : 'Not available.', { muted: true, size: 22 * u.s });
            else {
                const mp = String(tf.minpoly).replace(/−/g, '-').replace(/\^(\d+)/g, '^{$1}');
                u.richLine([{ tex: `k\\Gamma = \\mathbb{Q}(x),\\ ${mp} = 0` }], { size: 25 * u.s });
                u.richLine([`Degree ${tf.degree}: ${tf.signature[0]} real, ${tf.signature[1]} complex place${tf.signature[1] === 1 ? '' : 's'}. Traces ${tf.integral ? 'are' : 'are not all'} algebraic integers.`], { size: 23 * u.s });
                if (tf.arithmetic !== undefined) u.chip(tf.arithmetic ? 'Arithmetic' : 'Not arithmetic', { color: tf.arithmetic ? 'ok' : 'muted' });
            }
            if (inv.spectrum && inv.spectrum.length) {
                u.divider();
                u.label('Shortest closed geodesics');
                for (const c of inv.spectrum.slice(0, 6)) {
                    u.richLine([{ tex: `\\ell + i\\theta = ${cplx(c.length[0], c.length[1], 4)}` }, '   ', { tex: wordTex(c.word, 10) }], { size: 22 * u.s });
                }
            }
        });
    }

    function faceTab(ui) {
        const i = app.selected;
        if (i < 0 || !app.home) {
            ui.text(app.inside ? 'Point at a face of the translucent cell and tap to inspect its pairing. Tap twice or use the button to teleport just across it.' : 'Tap a face of the domain to inspect it. Tap it twice to go through it: the tile behind it comes to the middle.', { muted: true });
            return;
        }
        if (!app.inside && app.settings.domain === 'delaunay' && app.delaunay && app.delaunay.ok && !(app.planar && app.settings.plane)) {
            const R = app.delaunay, S = R.sides[i];
            if (!S) return;
            const P = R.pairs[S.pair];
            ui.richLine([`Side ${i + 1} of the Delaunay domain, glued to side ${(P.minus === i ? P.plus : P.minus) + 1} by pairing ${S.pair + 1}.`]);
            if (S.el && S.el.w) ui.richLine(['Its element ', { tex: wordTex(S.el.w, 16) }]);
            ui.space(8 * ui.s);
            ui.button('through', 'Go through this side', { accent: true, disabled: !!app.anim });
            ui.button('deselect', 'Deselect');
            return;
        }
        const H = app.home, w = H.walls[i];
        const gens = pairingGenerators();
        ui.row(r => { r.tex(faceLabel(i, gens), { size: 44 * ui.s }); r.text(`  face ${i + 1} of ${H.walls.length}`, { muted: true }); });
        if (w.pairing) {
            const p = w.pairing.partner;
            // The face labeled L is carried onto its partner by L⁻¹ (s_k on one side, s_k⁻¹ on the other).
            const L = faceLabel(i, gens);
            const inv = L.endsWith('^{-1}') ? L.slice(0, -5) : `${L}^{-1}`;
            ui.richLine([p === i ? 'Paired with itself (an involution or a mirror): ' : 'Glued to face ', p === i ? '' : { tex: faceLabel(p, gens) }, p === i ? '' : ' by ', { tex: inv }, '.'], { size: 26 * ui.s });
            ui.richLine(['Pairing as a word: ', { tex: wordTex(w.pairing.word, 16) }], { size: 26 * ui.s });
        } else {
            ui.text('This face has no pairing (the certificate failed here).', { size: 26 * ui.s, color: ui.theme.fail });
        }
        ui.richLine(['Wall of ', { tex: wordTex(w.word || [], 16) }, w.kind === 'cone' ? ' (a stabilizer wall through the basepoint)' : '', w.isParabolic ? ' (parabolic)' : ''], { size: 24 * ui.s, muted: true });
        ui.space(8 * ui.s);
        if (app.insideFaceError) ui.text(app.insideFaceError, { color: ui.theme.warn, size: 22 * ui.s });
        ui.button('through', app.inside ? 'Teleport across this face' : 'Go through this face', { accent: true, disabled: !!app.anim || (app.inside && !w.pairing) });
        ui.button('deselect', 'Deselect');
    }

    // ---------------- status strip ----------------

    function buildStrip(ui) {
        const st = statusSummary();
        ui.row(r => {
            r.text(nameParts(app.name || 'Poincaré VR'), { serif: true, size: 34 * ui.s, wrap: false });
            r.spacer();
            r.chip(st.text, { color: { ok: 'ok', warn: 'warn', fail: 'fail', pending: 'accent' }[st.kind] || 'muted' });
        }, { align: 'center' });
    }

    // ---------------- actions ----------------

    const shortCat = (c) => c.replace(' — reflection groups', '').replace(' — pleating-ray cusps', '').replace('Arithmetic & Bianchi groups', 'Arithmetic & Bianchi');

    function act(id, value, info = {}) {
        const [head, a, b] = String(id).split(':');
        switch (head) {
            case 'leftTab': ui0.left = value; break;
            case 'rightTab': ui0.right = value; break;
            case 'random': randomPreset(); break;
            case 'cat': ui0.cat = value; break;
            case 'preset': actions.loadPreset(value); break;
            case 'domain':
                if (value === 'delaunay') ensureDelaunay();
                actions.setSetting('domain', value);
                actions.select(-1);
                break;
            case 'plane': case 'faces': case 'edges': case 'vertices': case 'labels': case 'tiling':
            case 'cayley': case 'limit': case 'honeycomb':
                actions.setSetting(head, value);
                break;
            case 'opacity': actions.setSetting('opacity', value); break;
            case 'tilingRadius':
                // Rebuilding tiles is heavy: preview the value while dragging, apply on release.
                ui0.tilingDraft = info.final ? null : value;
                if (info.final) actions.setSetting('tilingRadius', value);
                break;
            case 'ballRadius': actions.setSetting('ballRadius', value / 2); break;
            case 'pal': actions.setSetting('palette', value); break;
            case 'theme': actions.setTheme(value); break;
            case 'reset': actions.resetView(); break;
            case 'gen': applyGenerator(value[0], value[1]); break;
            case 's': {
                const g = pairingGenerators().find(x => x.k === value[0]);
                if (!g) break;
                const h = value[1] ? g.home.inv().normalized() : g.home;
                const B = app.basepoint;
                applyHome(h, B.mul(h).mul(B.inv()).normalized(), value[1] ? g.word.slice().reverse().map(x => -x) : g.word);
                break;
            }
            case 'inside': actions.setInside(value); break;
            case 'recenter': actions.recenter(); break;
            case 'through': actions.applyFace(app.selected); break;
            case 'deselect': actions.select(-1); break;
        }
        refresh();
    }
    for (const P of panels) P.onAction(act);

    function refresh() { for (const P of panels) P.invalidate(); }
    for (const ev of ['status', 'domain', 'group', 'settings', 'view', 'anim', 'inside', 'reanchor']) on(ev, refresh);
    on('selection', () => { if (app.selected >= 0) ui0.right = 'face'; refresh(); });

    let wasAnim = false;
    return {
        panels,
        update(now) {
            const anim = !!app.anim;
            if (anim !== wasAnim) { wasAnim = anim; refresh(); }
            for (const P of panels) P.update();
        },
        setTheme(t) { for (const P of panels) P.setTheme(t); },
        refresh,
    };
}
