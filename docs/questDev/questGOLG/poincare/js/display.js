/**
 * Everything drawn inside the ball: the domain (Dirichlet, Delaunay, or a
 * Fuchsian group's polygon in its plane), translucent neighbouring tiles or
 * the full honeycomb, the Cayley graph, limit-set dust, face labels, the
 * sphere at infinity — plus CPU picking of faces.
 *
 * All geometry is in home-frame ball coordinates under `root`, whose world
 * transform places and scales the ball. The scene isometry is the shared
 * uniform u_L.
 */
import * as THREE from 'three';
import { Matrix2x2, buildPolyhedron, applyMatrixToBall, lorentzMatrix, pslKey, kleinToBall, ballToKlein } from './engine.js';
import { app, faceLabel, pairingGenerators } from './state.js';
import {
    sharedUniforms, mapMaterial, pointsMaterial, dirichletMeshes, planarMeshes, delaunayMeshes,
    Buf, ballTube, ballSphere, geodesicPoints
} from './meshes.js';
import { tilesNear, lorentz4 } from './hyper.js';
import { makeLabel } from './labels.js';

const THEME = {
    light: { shell: 0x9aa3b5, shellAlpha: 0.10, wash: 0.18, plane: 0xffffff, fill: [0.95, 0.96, 0.98], sel: [0.506, 0.549, 0.973] },
    dark: { shell: 0xc9d2e6, shellAlpha: 0.12, wash: 0.0, plane: 0x1d2229, fill: [0.27, 0.3, 0.35], sel: [1.0, 1.0, 1.0] },
};

export function createDisplay(root) {
    const shared = sharedUniforms();
    const L4 = shared.u_L.value;

    // ---- materials ----
    const faceMat = mapMaterial(shared, { opacity: 1, gloss: 0.16, polygonOffset: true });
    const edgeMat = mapMaterial(shared, { opacity: 1, gloss: 0.3, side: THREE.FrontSide });
    const vertMat = mapMaterial(shared, { opacity: 1, gloss: 0.4, side: THREE.FrontSide });
    const tileFaceMat = mapMaterial(shared, { opacity: 0.16, gloss: 0.04, fade: 0.82, depthWrite: false });
    const tileEdgeMat = mapMaterial(shared, { opacity: 0.85, gloss: 0.2, fade: 0.9, side: THREE.FrontSide, transparent: true, depthWrite: true });
    const extraMat = mapMaterial(shared, { opacity: 1, gloss: 0.3, side: THREE.FrontSide });
    const dustMat = pointsMaterial(shared, 3);

    // ---- groups ----
    const domainG = new THREE.Group();
    const tileG = new THREE.Group();
    const extraG = new THREE.Group();
    const labelG = new THREE.Group();
    root.add(domainG, tileG, extraG, labelG);

    // The sphere at infinity: a glass bubble, brighter at its rim.
    const shellMat = new THREE.ShaderMaterial({
        uniforms: { u_color: { value: new THREE.Color(THEME.light.shell) }, u_alpha: { value: THEME.light.shellAlpha } },
        vertexShader: /* glsl */`
            varying vec3 vN; varying vec3 vV;
            void main() {
                vN = normalize(normalMatrix * normal);
                vec4 mv = modelViewMatrix * vec4(position, 1.0);
                vV = -mv.xyz;
                gl_Position = projectionMatrix * mv;
            }`,
        fragmentShader: /* glsl */`
            uniform vec3 u_color; uniform float u_alpha;
            varying vec3 vN; varying vec3 vV;
            void main() {
                float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));
                gl_FragColor = vec4(u_color, u_alpha * (0.25 + 2.2 * f * f * f));
            }`,
        transparent: true, depthWrite: false, side: THREE.DoubleSide,
    });
    const shell = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 48), shellMat);
    shell.renderOrder = 10;
    root.add(shell);

    // The hyperbolic plane of a Fuchsian group: the ball's y = 0 disk.
    const planeMat = new THREE.MeshBasicMaterial({ color: THEME.light.plane, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false });
    const planeDisk = new THREE.Mesh(new THREE.CircleGeometry(0.999, 128), planeMat);
    planeDisk.rotation.x = -Math.PI / 2;      // the disk's normal along the ball's y axis
    planeDisk.renderOrder = 1;
    planeDisk.visible = false;
    root.add(planeDisk);

    // CPU copy of the face mesh for picking.
    const pickMesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
    pickMesh.visible = false;
    root.add(pickMesh);
    let pickHome = null;      // Float32Array of home positions
    let pickTags = null;
    let pickS = null;         // the S the pick mesh was mapped with

    let built = null;         // { key, meshes… }
    let labels = [];          // { sprite, home (ball point), wall }
    let tilesFor = null;

    const disposeGroup = (g) => {
        g.traverse(o => { if (o.geometry && !o.userData.keepGeometry) o.geometry.dispose(); });
        g.clear();
    };

    function addMesh(g, geo, mat, order) {
        if (!geo) return null;
        const m = new THREE.Mesh(geo, mat);
        m.frustumCulled = false;
        m.renderOrder = order;
        g.add(m);
        return m;
    }

    function washed(colors) {
        const w = THEME[app.settings.theme].wash;
        return colors.map(c => c.map(x => x + (1 - x) * w));
    }

    /** What is shown: 'plane' (Fuchsian polygon), 'delaunay' or 'dirichlet'. */
    function kind() {
        if (app.planar && app.settings.plane) return 'plane';
        if (app.settings.domain === 'delaunay' && app.delaunay && app.delaunay.ok) return 'delaunay';
        return 'dirichlet';
    }

    // ---------------- building ----------------

    function rebuild() {
        disposeGroup(domainG);
        disposeGroup(tileG);
        disposeGroup(labelG);
        labels = [];
        built = null;
        tilesFor = null;
        const H = app.home;
        planeDisk.visible = false;
        if (!H) { setPick(null); return; }
        const k = kind();
        let m, lite;
        if (k === 'plane') {
            const fill = THEME[app.settings.theme].fill;
            m = planarMeshes(H, washed(app.faceColors), buildPolyhedron, { fill });
            lite = planarMeshes(H, washed(app.faceColors), buildPolyhedron, { lite: true, fill });
            planeDisk.visible = true;
        } else if (k === 'delaunay') {
            const cols = washed(app.delaunayColors);
            m = delaunayMeshes(app.delaunay, cols);
            lite = delaunayMeshes(app.delaunay, cols, { lite: true });
        } else {
            const cols = washed(app.faceColors);
            m = dirichletMeshes(H, cols, app.report, { classes: app.vertexClass });
            lite = dirichletMeshes(H, cols, app.report, { lite: true });
        }
        built = {
            kind: k,
            faces: addMesh(domainG, m.faces, faceMat, 2),
            edges: addMesh(domainG, m.edges, edgeMat, 3),
            vertices: addMesh(domainG, m.vertices, vertMat, 4),
            lite, centres: m.centres || null,
            sides: m.sides || null,
        };
        built.reach = reachOf(k, H, m);
        if (k === 'plane' && built.faces) { built.faces.renderOrder = 2; }
        setPick(m.faces);
        buildLabels();
        syncVisibility();
        syncSelection();
        rebuildTiles();
    }

    /** How far the domain reaches from its centre (finite corners), capped: tiles are counted beyond it. */
    function reachOf(k, H, m) {
        const c = H.q0 || new THREE.Vector3();
        const pts = [];
        if (k === 'plane') {
            for (const sd of m.sides) for (const q of [sd.a, sd.b]) if (q.lengthSq() < 0.998) pts.push(kleinToBall(q));
        } else if (k === 'delaunay') {
            for (const v of app.delaunay.vertices) if (v.corner && !v.ideal) pts.push(kleinToBall(v.k));
        } else {
            for (const v of H.poly.vertices) if (!v.ideal) pts.push(kleinToBall(v.k));
        }
        let r = 0;
        for (const p of pts) {
            const den = (1 - p.lengthSq()) * (1 - c.lengthSq());
            if (den > 0) r = Math.max(r, Math.acosh(1 + 2 * p.distanceToSquared(c) / den));
        }
        return pts.length ? Math.min(r, 3) : 1.2;
    }

    function setPick(geo) {
        if (!geo) { pickHome = null; pickMesh.geometry = new THREE.BufferGeometry(); return; }
        pickHome = geo.attributes.position.array.slice();
        pickTags = geo.attributes.a_tag.array;
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pickHome.slice(), 3));
        g.setIndex(geo.index.clone());
        pickMesh.geometry.dispose();
        pickMesh.geometry = g;
        pickS = null;
    }

    /** Map the pick mesh through the current S (only when it changed and no animation runs). */
    function syncPick() {
        if (!pickHome || app.anim) return;
        if (pickS === app.S) return;
        pickS = app.S;
        const L = lorentzMatrix(app.S);
        const out = pickMesh.geometry.attributes.position.array;
        for (let i = 0; i < pickHome.length; i += 3) {
            const x = pickHome[i], y = pickHome[i + 1], z = pickHome[i + 2];
            const r2 = Math.min(x * x + y * y + z * z, 0.9999995), f = 1 / (1 - r2);
            const X = 2 * x * f, Y = 2 * y * f, Z = 2 * z * f, T = (1 + r2) * f;
            const x2 = L[0] * X + L[1] * Y + L[2] * Z + L[3] * T;
            const y2 = L[4] * X + L[5] * Y + L[6] * Z + L[7] * T;
            const z2 = L[8] * X + L[9] * Y + L[10] * Z + L[11] * T;
            const t2 = L[12] * X + L[13] * Y + L[14] * Z + L[15] * T;
            out[i] = x2 / (1 + t2); out[i + 1] = y2 / (1 + t2); out[i + 2] = z2 / (1 + t2);
        }
        pickMesh.geometry.attributes.position.needsUpdate = true;
        pickMesh.geometry.computeBoundingSphere();
    }

    /** Face tag under a world ray, or −1. */
    function pick(raycaster) {
        if (!pickHome || !built || !built.faces || !built.faces.visible || app.anim) return { tag: -1 };
        syncPick();
        const hit = raycaster.intersectObject(pickMesh, false)[0];
        if (!hit) return { tag: -1 };
        let tag = pickTags[hit.face.a];
        if (built.kind === 'plane' && built.sides) {
            // The polygon: pick the side nearest the hit (Klein segments, home frame).
            const local = root.worldToLocal(hit.point.clone());
            const k = ballToKlein(applyMatrixToBall(app.S.inv().normalized(), local));
            let best = Infinity;
            for (const sd of built.sides) {
                const ab = sd.b.clone().sub(sd.a);
                const t = Math.max(0, Math.min(1, k.clone().sub(sd.a).dot(ab) / Math.max(1e-12, ab.lengthSq())));
                const d = sd.a.clone().addScaledVector(ab, t).distanceTo(k);
                if (d < best) { best = d; tag = sd.wall; }
            }
        }
        return { tag: tag >= 0 ? Math.round(tag) : -1, point: hit.point, distance: hit.distance };
    }

    // ---------------- tiles ----------------

    function rebuildTiles() {
        disposeGroup(tileG);
        tilesFor = null;
        if (!built || !app.home) return;
        const s = app.settings;
        const want = app.inside || s.tiling;
        if (!want) return;
        const H = app.home;
        // Flat tiles are cheap: the plane picture shows a few rings, like the classic disk pictures.
        const flat = built.kind === 'plane' && !app.inside;
        const radius = app.inside ? Math.max(3.6, built.reach + 1.6) : built.reach + s.tilingRadius * (flat ? 2 : 1) + (flat ? 0.6 : 0);
        const max = app.inside ? 160 : flat ? 400 : 90;
        let gens = H.walls;
        if (built.kind === 'delaunay' && app.delaunay && app.delaunay.ok) {
            gens = app.delaunay.sides.map(S => ({ elem: S.el.m }));
        }
        const centre = H.q0 || new THREE.Vector3();
        const tiles = tilesNear(gens, { centre, eye: centre, radius, max });
        const els = app.inside ? tiles : tiles.slice(1);    // outside: D itself is drawn opaque
        if (!els.length) return;
        const mats = els.map(t => lorentz4(t.M));
        const inst = (geo, mat, order) => {
            if (!geo) return null;
            const m = new THREE.InstancedMesh(geo, mat, mats.length);
            mats.forEach((M, i) => m.setMatrixAt(i, M));
            m.instanceMatrix.needsUpdate = true;
            m.frustumCulled = false;
            m.renderOrder = order;
            m.userData.keepGeometry = true;
            tileG.add(m);
            return m;
        };
        const lite = built.lite;
        // A plane picture is flat, so its tiles can be shown nearly to the circle at infinity.
        const plane = built.kind === 'plane';
        const faceAlpha = app.inside ? (s.honeycomb ? 0 : 0.10) : plane ? 0.45 : 0.16;
        tileFaceMat.uniforms.u_opacity.value = faceAlpha;
        tileFaceMat.uniforms.u_fade.value = app.inside ? 0.93 : plane ? 0.97 : 0.82;
        tileEdgeMat.uniforms.u_fade.value = app.inside ? 0.96 : plane ? 0.99 : 0.9;
        if (faceAlpha > 0) inst(lite.faces, tileFaceMat, 5);
        if (app.inside || s.edges) inst(lite.edges, tileEdgeMat, 6);
        tilesFor = { count: els.length };
    }

    // ---------------- labels ----------------

    function buildLabels() {
        disposeGroup(labelG);
        labels = [];
        if (!built || !app.home) return;
        const theme = app.settings.theme;
        if (built.kind === 'dirichlet' && built.centres) {
            const gens = pairingGenerators();
            built.centres.forEach((c, i) => {
                if (!c) return;
                const sprite = makeLabel(faceLabel(i, gens), theme);
                labelG.add(sprite);
                labels.push({ sprite, home: c, tag: i });
            });
        } else if (built.kind === 'plane') {
            const gens = pairingGenerators();
            const seen = new Set();
            const H = app.home;
            // One label per side, at the midpoint of the side's Klein segment (pulled toward the centre).
            const m = planarMeshes(H, app.faceColors, buildPolyhedron, { lite: true });
            for (const sd of m.sides) {
                if (seen.has(sd.wall)) continue;
                seen.add(sd.wall);
                const k = sd.a.clone().add(sd.b).multiplyScalar(0.5);
                if (k.lengthSq() > 0.98) k.multiplyScalar(0.98 / k.length());
                k.multiplyScalar(0.86);
                const s = 1 / (1 + Math.sqrt(Math.max(0, 1 - k.lengthSq())));
                const sprite = makeLabel(faceLabel(sd.wall, gens), theme);
                labelG.add(sprite);
                labels.push({ sprite, home: k.multiplyScalar(s), tag: sd.wall, flat: true });
            }
        }
        labelG.visible = app.settings.labels;
    }

    const tmpV = new THREE.Vector3();
    /** Move labels with S (cheap: a few dozen points per frame). */
    function updateLabels() {
        if (!labelG.visible || !labels.length) return;
        const centre = applyMatrixToBall(app.S, app.home && app.home.q0 ? app.home.q0 : tmpV.set(0, 0, 0));
        for (const L of labels) {
            const p = applyMatrixToBall(app.S, L.home);
            if (!L.flat) {
                // Just outside the face, so the face does not hide its own label.
                const out = p.clone().sub(centre);
                if (out.lengthSq() > 1e-12) p.addScaledVector(out.normalize(), 0.035 * (1 - p.lengthSq()));
            }
            L.sprite.position.copy(p);
            const s = Math.max(0.25, 1 - p.lengthSq());
            L.sprite.scale.set(L.sprite.userData.aspect * 0.07 * s, 0.07 * s, 1);
            L.sprite.visible = p.lengthSq() < 0.96;
        }
    }

    // ---------------- Cayley graph & limit set ----------------

    const GEN_COLORS = [[0.37, 0.4, 0.81], [0.0, 0.62, 0.78], [0.83, 0.42, 0.33], [0.53, 0.6, 0.22], [0.8, 0.37, 0.59], [0.85, 0.63, 0.08]];

    function homeGens() {
        const B = app.basepoint, Bi = B.inv();
        return app.matrices.map(m => Bi.mul(m).mul(B).normalized());
    }

    function rebuildExtras() {
        disposeGroup(extraG);
        if (!app.home) return;
        const centre = app.home.q0 || new THREE.Vector3();
        if (app.settings.cayley) {
            const gens = homeGens();
            const letters = gens.flatMap((g, i) => [{ g, i }, { g: g.inv().normalized(), i }]);
            const nodes = new Map();
            const key = (M) => pslKey(M);
            const start = new THREE.Vector3().copy(centre);
            if (!gens.length) return;
            let layer = [{ M: Matrix2x2.identity() }];
            nodes.set(key(layer[0].M), applyMatrixToBall(layer[0].M, start));
            const buf = new Buf();
            const edgeSeen = new Set();
            for (let depth = 0; depth < 5 && nodes.size < 500; depth++) {
                const next = [];
                for (const { M } of layer) {
                    const p = nodes.get(key(M));
                    for (const { g, i } of letters) {
                        const N = M.mul(g).normalized();
                        const kN = key(N);
                        let q = nodes.get(kN);
                        if (!q) {
                            q = applyMatrixToBall(N, start);
                            if (q.lengthSq() > 0.985) continue;
                            nodes.set(kN, q);
                            next.push({ M: N });
                        }
                        const ek = [key(M), kN].sort().join('|');
                        if (edgeSeen.has(ek)) continue;
                        edgeSeen.add(ek);
                        ballTube(buf, geodesicPoints(p, q, 14), { radius: 0.012, color: GEN_COLORS[i % GEN_COLORS.length], sides: 6 });
                    }
                }
                layer = next;
            }
            for (const p of nodes.values()) ballSphere(buf, p, 0.03 * (1 - p.lengthSq()), [0.12, 0.13, 0.17], -1, 1);
            addMesh(extraG, buf.geometry(), extraMat, 7);
        }
        if (app.settings.limit) {
            const gens = homeGens();
            const letters = gens.flatMap((g) => [g, g.inv().normalized()]);
            const n = letters.length;
            const pos = [], col = [];
            const o = new THREE.Vector3().copy(centre);
            for (let s = 0; s < 9000; s++) {
                let M = null, last = -1, first = -1;
                const len = 9 + Math.floor(Math.random() * 10);
                for (let j = 0; j < len; j++) {
                    let k;
                    do { k = Math.floor(Math.random() * n); } while (last >= 0 && (k ^ 1) === last);
                    M = M ? M.mul(letters[k]) : letters[k];
                    if (first < 0) first = k;
                    last = k;
                }
                const p = applyMatrixToBall(M.normalized(), o);
                if (!(p.lengthSq() > 0.9)) continue;
                p.multiplyScalar(0.997 / p.length());
                pos.push(p.x, p.y, p.z);
                const c = GEN_COLORS[(first >> 1) % GEN_COLORS.length];
                col.push(c[0], c[1], c[2]);
            }
            const g = new THREE.BufferGeometry();
            g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
            g.setAttribute('a_color', new THREE.Float32BufferAttribute(col, 3));
            const pts = new THREE.Points(g, dustMat);
            pts.frustumCulled = false;
            pts.renderOrder = 8;
            extraG.add(pts);
        }
    }

    // ---------------- state sync ----------------

    function syncVisibility() {
        if (!built) return;
        const s = app.settings;
        const insideHide = app.inside;
        if (built.faces) {
            built.faces.visible = s.faces && !insideHide;
            const op = built.kind === 'plane' ? Math.min(s.opacity, 0.9) : s.opacity;
            faceMat.uniforms.u_opacity.value = op;
            faceMat.transparent = op < 1;
            faceMat.depthWrite = op >= 1;
            faceMat.needsUpdate = true;
        }
        if (built.edges) built.edges.visible = s.edges && !insideHide;
        if (built.vertices) built.vertices.visible = s.vertices && !insideHide;
        labelG.visible = s.labels && !insideHide;
        shell.visible = !app.inside;
    }

    function syncSelection() {
        let a = -9, b = -9;
        const sel = app.selected;
        if (sel >= 0 && built) {
            a = sel;
            if (built.kind === 'delaunay' && app.delaunay && app.delaunay.ok) {
                const S = app.delaunay.sides[sel];
                if (S) { const P = app.delaunay.pairs[S.pair]; b = P.minus === sel ? P.plus : P.minus; }
            } else if (app.home && app.home.walls[sel] && app.home.walls[sel].pairing) {
                b = app.home.walls[sel].pairing.partner;
            }
        }
        // In the plane the sides are the edge tubes; in 3D the faces carry the highlight.
        const plane = built && built.kind === 'plane';
        faceMat.uniforms.u_selA.value = plane ? -9 : a;
        faceMat.uniforms.u_selB.value = plane ? -9 : b;
        edgeMat.uniforms.u_selA.value = plane ? a : -9;
        edgeMat.uniforms.u_selB.value = plane ? b : -9;
    }

    function setTheme(name) {
        const T = THEME[name] || THEME.light;
        shellMat.uniforms.u_color.value.setHex(T.shell);
        shellMat.uniforms.u_alpha.value = T.shellAlpha;
        planeMat.color.setHex(T.plane);
        faceMat.uniforms.u_selColor.value.setRGB(...T.sel);
        rebuild();
    }

    /** Per frame: the isometry uniform, label positions, the selection pulse. */
    function frame(now) {
        L4.set(...lorentzMatrix(app.S));
        shared.u_time.value = now / 1000;
        const plane = built && built.kind === 'plane';
        faceMat.uniforms.u_hover.value = plane ? -9 : app.hover;
        edgeMat.uniforms.u_hover.value = plane ? app.hover : -9;
        updateLabels();
    }

    return {
        root, rebuild, rebuildTiles, rebuildExtras, syncVisibility, syncSelection, setTheme, frame, pick,
        get kind() { return built ? built.kind : null; },
        get tileCount() { return tilesFor ? tilesFor.count : 0; },
        shell,
    };
}
