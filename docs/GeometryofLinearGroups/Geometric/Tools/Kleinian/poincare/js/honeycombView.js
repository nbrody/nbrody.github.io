/** A finite, smoothly rendered neighborhood of the hyperbolic honeycomb. */
import * as THREE from 'three';
import { lorentzMatrix } from './math.js';
import { faceInradii } from './tessellation.js';
import { dirichletMeshes, delaunayMeshes, mapMaterial, sharedUniforms } from '../../../../../../quest/questGOLG/poincare/js/meshes.js';
import { tilesNear, lorentz4 } from '../../../../../../quest/questGOLG/poincare/js/hyper.js';

/** Normalized distance to the edge of each home-frame Dirichlet face. */
export function faceEdgeDistances(geometry, home) {
    const positions = geometry.getAttribute('position');
    const tags = geometry.getAttribute('a_tag');
    const radii = faceInradii(home);
    const walls = home.walls.map(w => w.cov);
    const neighbors = walls.map((wall, i) => walls.flatMap((other, j) => {
        if (i === j) return [];
        const c = wall.x * other.x + wall.y * other.y + wall.z * other.z - wall.w * other.w;
        const det = 1 - c * c;
        return det > 1e-6 ? [{ wall: other, scale: 1 / Math.sqrt(det) }] : [];
    }));
    const values = new Float32Array(positions.count);
    for (let i = 0; i < positions.count; i++) {
        const tag = Math.round(tags.getX(i));
        if (tag < 0 || tag >= walls.length) continue;
        const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
        const r2 = Math.min(x*x + y*y + z*z, 0.9999995), f = 1 / (1 - r2);
        const X = 2*x*f, Y = 2*y*f, Z = 2*z*f, T = (1+r2)*f;
        let distance = Infinity;
        for (const n of neighbors[tag]) {
            const w = n.wall;
            distance = Math.min(distance, Math.asinh(Math.abs(w.x*X + w.y*Y + w.z*Z - w.w*T) * n.scale));
        }
        values[i] = Math.min(1, distance / Math.max(radii[tag], 1e-6));
    }
    return values;
}

export function createHoneycombView(scene) {
    const group = new THREE.Group();
    group.visible = false;
    scene.add(group);
    const shared = sharedUniforms();
    const edges = mapMaterial(shared, { opacity: 0.92, gloss: 0.22, fade: 0.93,
        side: THREE.FrontSide, transparent: true, depthWrite: true });
    const walls = mapMaterial(shared, { opacity: 0, gloss: 0.04, fade: 0.86,
        transparent: true, depthWrite: false });
    const faces = mapMaterial(shared, { opacity: 0, gloss: 0.16, fade: 0.96,
        transparent: true, depthWrite: false, polygonOffset: true });
    // The band is measured in the home face, before the instance isometry.
    faces.uniforms.u_faceFill = { value: 0 };
    faces.uniforms.u_banded = { value: true };
    faces.vertexShader = faces.vertexShader.replace('varying vec3 vC;', 'attribute float a_faceDistance; varying float vFaceDistance; varying vec3 vC;')
        .replace('    vC = a_color;', '    vFaceDistance = a_faceDistance;\n    vC = a_color;');
    faces.fragmentShader = faces.fragmentShader.replace('varying vec3 vC;', 'uniform float u_faceFill; uniform bool u_banded; varying float vFaceDistance; varying vec3 vC;')
        .replace('    float a = u_opacity;', `    float a = u_opacity;
    if (u_banded && u_faceFill < 0.999) {
        float feather = max(fwidth(vFaceDistance), 0.002);
        a *= 1.0 - smoothstep(u_faceFill - feather, u_faceFill + feather, vFaceDistance);
    }`);
    const geometries = [];
    let wallMesh = null, faceMesh = null;
    let wallOpacity = 0, faceFill = 0, isDelaunay = false;
    function add(geo, mat, tiles, order) {
        if (!geo) return;
        geometries.push(geo);
        if (!tiles.length) return;
        const mesh = new THREE.InstancedMesh(geo, mat, tiles.length);
        tiles.forEach((t, i) => mesh.setMatrixAt(i, lorentz4(t.M)));
        mesh.instanceMatrix.needsUpdate = true;
        mesh.frustumCulled = false;
        mesh.renderOrder = order;
        group.add(mesh);
        return mesh;
    }
    function rebuild(home, report, colors, delaunay, delaunayColors, theme, tileLimit = 200) {
        group.clear();
        wallMesh = faceMesh = null;
        geometries.splice(0).forEach(g => g.dispose());
        if (!home || !home.poly) return;
        const dl = delaunay && delaunay.ok && delaunay.dim === 3 ? delaunay : null;
        isDelaunay = !!dl;
        faces.uniforms.u_banded.value = !isDelaunay;
        faces.uniforms.u_opacity.value = isDelaunay ? 0.65 * faceFill : 0.85;
        const wash = theme === 'light' ? 0.18 : 0;
        const color = (dl ? delaunayColors : colors).map(c => c.map(x => x + (1 - x) * wash));
        const m = dl ? delaunayMeshes(dl, color, { lite: true }) : dirichletMeshes(home, color, report, { lite: true });
        if (m.vertices) m.vertices.dispose();
        if (m.faces) {
            const values = dl ? new Float32Array(m.faces.getAttribute('position').count) : faceEdgeDistances(m.faces, home);
            m.faces.setAttribute('a_faceDistance', new THREE.BufferAttribute(values, 1));
        }
        const centre = home.q0 || new THREE.Vector3();
        let reach = 0, finite = false;
        const vertices = dl ? dl.vertices.filter(v => v.corner) : home.poly.vertices;
        for (const v of vertices) {
            if (v.ideal) continue;
            finite = true;
            const k = v.k;
            const p = k.clone().multiplyScalar(1 / (1 + Math.sqrt(Math.max(0, 1 - k.lengthSq()))));
            const den = (1 - p.lengthSq()) * (1 - centre.lengthSq());
            if (den > 0) reach = Math.max(reach, Math.acosh(1 + 2 * p.distanceToSquared(centre) / den));
        }
        reach = finite ? Math.min(reach, 3) : 1.2;
        const gens = dl ? dl.sides.map(s => ({ elem: s.el.m })) : home.walls;
        const radius = reach + 2.2 + 1.2 * Math.log(Math.max(1, tileLimit / 200));
        const tiles = tilesNear(gens, { centre, eye: centre, radius, max: tileLimit });
        // The central tile and its neighbors can be filled separately from the films on all tiles.
        const nearby = tiles.filter(t => t.d <= reach * 2 + 0.05);
        if (dl && m.edges) {
            // Quest's Delaunay mesh uses dark neutral edges; give them contrast on both themes.
            const c = m.edges.getAttribute('a_color');
            for (let i = 0; i < c.count; i++) c.setXYZ(i, 0.43, 0.59, 0.86);
        }
        add(m.edges, edges, tiles, 4);
        wallMesh = add(m.faces, walls, tiles, 5) || null;
        if (wallMesh) wallMesh.visible = wallOpacity > 0;
        if (m.faces && nearby.length) {
            // The two meshes share geometry and dispose it once on rebuild.
            const mesh = new THREE.InstancedMesh(m.faces, faces, nearby.length);
            nearby.forEach((t, i) => mesh.setMatrixAt(i, lorentz4(t.M)));
            mesh.instanceMatrix.needsUpdate = true;
            mesh.frustumCulled = false;
            mesh.renderOrder = 6;
            mesh.visible = faceFill > 0;
            group.add(mesh);
            faceMesh = mesh;
        }
    }
    return {
        rebuild,
        setVisible(on) { group.visible = on; },
        setFrame(matrix) { shared.u_L.value.set(...lorentzMatrix(matrix)); },
        setWalls(v) { wallOpacity = 0.16 * v; walls.uniforms.u_opacity.value = wallOpacity; if (wallMesh) wallMesh.visible = wallOpacity > 0; },
        setFaces(v) { faceFill = v; faces.uniforms.u_faceFill.value = v; faces.uniforms.u_opacity.value = isDelaunay ? 0.65 * v : 0.85; if (faceMesh) faceMesh.visible = v > 0; },
    };
}
