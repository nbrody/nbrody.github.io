/**
 * The 3D tower (after the model of SO3DecisionAlgorithm's local-tree viewer
 * and the Boise talk). Level k is a circle at height −k whose radius grows
 * like q^{s·k}; the vertex ⌊x⌋_k sits at the angle Σ d_j q^{j−k} (mod 1)
 * read off its π-adic digits — over ℚ_p, simply x/p^k. Vertices above one
 * another at the same angle are the same point of K_𝔭 seen at different
 * precision, so the tower shows the level structure and the ends at once.
 *
 * The true growth s = 1 spreads levels by a factor q each; the Spread
 * control compresses it so several levels can be read together.
 */
import * as THREE from 'three';
import { OrbitControls } from '../../../Kleinian/vendor/three/addons/controls/OrbitControls.js';

const STEP_Y = 220;
const BASE_RADIUS = 260;

const css = (name, fallback) => (getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback);

/**
 * By default the level circles grow by a factor of at most 1.3 per level and
 * about 30 across the whole picture (the true factor is q per level).
 */
export function defaultSpread(q, span = 6) {
    const ratio = Math.min(1.3, Math.max(1.06, Math.pow(30, 1 / Math.max(1, span))));
    return Math.min(1, Math.log(ratio) / Math.log(q));
}

/** The angular coordinate of a vertex, in [0, 1). */
export function angleFraction(place, vt) {
    let s = 0;
    for (let i = 0; i < vt.d.length; i++) s += vt.d[i] * Math.pow(place.q, vt.lo + i - vt.k);
    return s - Math.floor(s);
}

/**
 * Mount the tower into `host`. ctx: { root (d3 hierarchy), hull, voronoi,
 * place, baseId, imageId, orbitIds, selectedId, spread, onVertexClick(vt) }.
 * Returns { destroy, resetView }.
 */
export function mountTower(host, ctx) {
    const width = host.clientWidth, height = host.clientHeight;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, width / height, 1, 1e7);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    host.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 0.75));
    const key = new THREE.PointLight(0xffffff, 1.2, 0, 0);
    key.position.set(600, 1200, 600);
    scene.add(key);
    const fill = new THREE.PointLight(0x818cf8, 0.8, 0, 0);
    fill.position.set(-600, -400, -600);
    scene.add(fill);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;

    const world = new THREE.Group();
    scene.add(world);
    const disposables = [];
    const track = (o) => { disposables.push(o); return o; };

    const { root, hull, voronoi, place, baseId, imageId, orbitIds } = ctx;
    const nodes = root.descendants();
    const baseNode = nodes.find((n) => n.data.id === baseId) || root;
    const kBase = baseNode.data.k;
    const ks = nodes.map((n) => n.data.k);
    const span = Math.max(...ks) - Math.min(...ks);
    const spread = ctx.spread ?? defaultSpread(place.q, span);
    const radius = (k) => BASE_RADIUS * Math.pow(place.q, (k - kBase) * spread);
    const at = new Map();
    for (const n of nodes) {
        const th = 2 * Math.PI * angleFraction(place, n.data.vt);
        const r = radius(n.data.k);
        at.set(n, new THREE.Vector3(r * Math.cos(th), -(n.data.k - kBase) * STEP_Y, r * Math.sin(th)));
    }

    // level rings and the axis — the end ∞ that every level circles
    const levels = [...new Set(nodes.map((n) => n.data.k))].sort((a, b) => a - b);
    const ringColor = new THREE.Color(css('--ink-faint', '#5e6880'));
    const accent = new THREE.Color(css('--accent', '#818cf8'));
    for (const k of levels) {
        const r = radius(k);
        const geo = track(new THREE.TorusGeometry(r, Math.max(0.6, r * 0.0025), 6, 160));
        const mat = track(new THREE.MeshBasicMaterial({ color: k === kBase ? accent : ringColor, transparent: true, opacity: k === kBase ? 0.5 : 0.2 }));
        const ring = new THREE.Mesh(geo, mat);
        ring.rotation.x = Math.PI / 2;
        ring.position.y = -(k - kBase) * STEP_Y;
        world.add(ring);
    }
    {
        const y0 = -(levels[0] - kBase) * STEP_Y + STEP_Y, y1 = -(levels[levels.length - 1] - kBase) * STEP_Y;
        const geo = track(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, y0, 0), new THREE.Vector3(0, y1, 0)]));
        world.add(new THREE.Line(geo, track(new THREE.LineBasicMaterial({ color: ringColor, transparent: true, opacity: 0.35 }))));
    }

    // edges, batched by style
    const keyOf = (l) => `${l.source.data.id}->${l.target.data.id}`;
    const buckets = {
        plain: { pts: [], color: '#64748b', opacity: 0.35 },
        hull: { pts: [], color: '#60a5fa', opacity: 0.95 },
        cell: { pts: [], color: '#fbbf24', opacity: 0.9 },
        rational: { pts: [], color: '#f5f5f4', opacity: 0.6 },
    };
    for (const l of root.links()) {
        const a = at.get(l.source), b = at.get(l.target), k = keyOf(l);
        (hull.edges.has(k) ? buckets.hull : buckets.plain).pts.push(a, b);
        if (voronoi.fullEdges.has(k)) buckets.cell.pts.push(a, b);
        else if (voronoi.partialEdges.has(k)) {
            const { fromChild, t } = voronoi.partialEdges.get(k);
            const [p, q] = fromChild ? [b, a] : [a, b];
            buckets.cell.pts.push(p, p.clone().lerp(q, t));
        }
        if (ctx.rationalSubtree && place.isRational(l.source.data.vt) && place.isRational(l.target.data.vt)) buckets.rational.pts.push(a, b);
    }
    for (const B of Object.values(buckets)) {
        if (!B.pts.length) continue;
        const geo = track(new THREE.BufferGeometry().setFromPoints(B.pts));
        world.add(new THREE.LineSegments(geo, track(new THREE.LineBasicMaterial({ color: B.color, transparent: true, opacity: B.opacity }))));
    }

    // vertices: one instanced mesh per role
    const role = (id) => (id === ctx.selectedId ? 'selected' : id === baseId ? 'base' : id === imageId ? 'image' : orbitIds.has(id) ? 'orbit' : hull.vertices.has(id) ? 'hull' : 'plain');
    const STYLE = {
        selected: ['#f472b6', 30], base: ['#2563eb', 30], image: ['#059669', 26], orbit: ['#10b981', 22],
        hull: ['#93c5fd', 15], plain: ['#475569', 7],
    };
    const sphere = track(new THREE.SphereGeometry(1, 16, 12));
    const picking = [];
    const byRole = {};
    for (const n of nodes) (byRole[role(n.data.id)] ||= []).push(n);
    for (const [r, list] of Object.entries(byRole)) {
        const [color, size] = STYLE[r];
        const mat = track(new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.1, transparent: r === 'plain', opacity: r === 'plain' ? 0.55 : 1 }));
        const mesh = new THREE.InstancedMesh(sphere, mat, list.length);
        const m = new THREE.Matrix4();
        list.forEach((n, i) => {
            const s = size * Math.pow(Math.max(0.5, radius(n.data.k) / BASE_RADIUS), 0.8);   // grow with the circle
            m.makeScale(s, s, s); m.setPosition(at.get(n)); mesh.setMatrixAt(i, m);
        });
        mesh.instanceMatrix.needsUpdate = true;
        mesh.userData.nodes = list;
        world.add(mesh);
        picking.push(mesh);
    }
    // Dirichlet-cell halos
    {
        const cell = nodes.filter((n) => voronoi.vertices.has(n.data.id));
        if (cell.length) {
            const mat = track(new THREE.MeshBasicMaterial({ color: '#fbbf24', transparent: true, opacity: 0.18, depthWrite: false }));
            const mesh = new THREE.InstancedMesh(sphere, mat, cell.length);
            const m = new THREE.Matrix4();
            cell.forEach((n, i) => {
                const s = 40 * Math.pow(Math.max(0.5, radius(n.data.k) / BASE_RADIUS), 0.8);
                m.makeScale(s, s, s); m.setPosition(at.get(n)); mesh.setMatrixAt(i, m);
            });
            mesh.instanceMatrix.needsUpdate = true;
            world.add(mesh);
        }
    }

    // click to select (ignoring the pointer-up that ends a drag)
    const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2();
    let downAt = null;
    const onDown = (e) => { downAt = { x: e.clientX, y: e.clientY }; };
    const onUp = (e) => {
        if (!downAt) return;
        const moved = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y);
        downAt = null;
        if (moved > 4) return;
        const rect = renderer.domElement.getBoundingClientRect();
        pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
        raycaster.setFromCamera(pointer, camera);
        const hit = raycaster.intersectObjects(picking, false)[0];
        if (hit) {
            const n = hit.object.userData.nodes[hit.instanceId];
            if (n && ctx.onVertexClick) ctx.onVertexClick(n.data.vt);
        }
    };
    renderer.domElement.addEventListener('pointerdown', onDown);
    renderer.domElement.addEventListener('pointerup', onUp);

    const frame = () => {
        // frame the vertices, not the (much wider) level rings
        const box = new THREE.Box3();
        for (const p of at.values()) box.expandByPoint(p);
        if (box.isEmpty()) return;
        const s = box.getBoundingSphere(new THREE.Sphere());
        const d = s.radius / Math.sin((camera.fov * Math.PI / 180) / 2);
        controls.target.copy(s.center);
        camera.position.copy(s.center).add(new THREE.Vector3(1, 0.75, 1).normalize().multiplyScalar(d * 0.9));
        camera.near = Math.max(0.1, d * 0.001);
        camera.far = d * 20;
        camera.updateProjectionMatrix();
        controls.update();
    };
    frame();

    let running = true;
    const tick = () => {
        if (!running) return;
        controls.update();
        renderer.render(scene, camera);
        requestAnimationFrame(tick);
    };
    tick();

    const onResize = () => {
        const w = host.clientWidth, h = host.clientHeight;
        if (!w || !h) return;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
    };
    addEventListener('resize', onResize);

    return {
        spread,
        resetView: frame,
        renderOnce: () => renderer.render(scene, camera),
        destroy() {
            running = false;
            removeEventListener('resize', onResize);
            renderer.domElement.removeEventListener('pointerdown', onDown);
            renderer.domElement.removeEventListener('pointerup', onUp);
            controls.dispose();
            for (const d of disposables) d.dispose?.();
            for (const m of picking) m.dispose?.();
            renderer.dispose();
            renderer.domElement.remove();
        },
    };
}
