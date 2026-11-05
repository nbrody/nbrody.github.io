/** The Quest renderer's instanced, edge-only view of nearby domain tiles. */
import * as THREE from 'three';
import { lorentzMatrix } from './math.js';
import { dirichletMeshes, mapMaterial, sharedUniforms } from '../../../../../../quest/questGOLG/poincare/js/meshes.js';
import { tilesNear, lorentz4 } from '../../../../../../quest/questGOLG/poincare/js/hyper.js';

export function createInsideHoneycomb(scene) {
    const group = new THREE.Group();
    group.visible = false;
    scene.add(group);
    const shared = sharedUniforms();
    const material = mapMaterial(shared, { opacity: 0.85, gloss: 0.2, fade: 0.96,
        side: THREE.FrontSide, transparent: true, depthWrite: true });
    let geometry = null;

    function rebuild(home, report, colors) {
        group.clear();
        if (geometry) geometry.dispose();
        geometry = null;
        if (!home || !home.poly || !home.walls.some(w => w.elem)) return;
        const meshes = dirichletMeshes(home, colors, report, { lite: true });
        // Only the edges are needed in this view.
        if (meshes.faces) meshes.faces.dispose();
        if (meshes.vertices) meshes.vertices.dispose();
        geometry = meshes.edges;
        if (!geometry) return;
        const centre = home.q0 || new THREE.Vector3();
        let reach = 0;
        for (const v of home.poly.vertices) {
            if (v.ideal) continue;
            const k = v.k, p = k.clone().multiplyScalar(1 / (1 + Math.sqrt(Math.max(0, 1 - k.lengthSq()))));
            const den = (1 - p.lengthSq()) * (1 - centre.lengthSq());
            if (den > 0) reach = Math.max(reach, Math.acosh(1 + 2 * p.distanceToSquared(centre) / den));
        }
        const radius = Math.max(3.6, Math.min(reach || 1.2, 3) + 1.6);
        const tiles = tilesNear(home.walls, { centre, eye: centre, radius, max: 160 });
        if (!tiles.length) return;
        const mesh = new THREE.InstancedMesh(geometry, material, tiles.length);
        tiles.forEach((tile, i) => mesh.setMatrixAt(i, lorentz4(tile.M)));
        mesh.instanceMatrix.needsUpdate = true;
        mesh.frustumCulled = false;
        group.add(mesh);
    }
    return {
        rebuild,
        setVisible(on) { group.visible = on; },
        setFrame(matrix) { shared.u_L.value.set(...lorentzMatrix(matrix)); },
    };
}
