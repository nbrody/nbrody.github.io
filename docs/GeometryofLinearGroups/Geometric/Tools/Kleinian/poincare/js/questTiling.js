/** The Quest outside view: a solid home domain amid translucent instanced tiles. */
import * as THREE from 'three';
import { lorentzMatrix } from './math.js';
import { dirichletMeshes, mapMaterial, sharedUniforms } from '../../../../../../quest/questGOLG/poincare/js/meshes.js';
import { tilesNear, lorentz4 } from '../../../../../../quest/questGOLG/poincare/js/hyper.js';

export function createQuestTiling(scene) {
    const group = new THREE.Group();
    scene.add(group);
    group.visible = false;
    const shared = sharedUniforms();
    const face = mapMaterial(shared, { opacity: 1, gloss: 0.16, polygonOffset: true });
    const edge = mapMaterial(shared, { opacity: 1, gloss: 0.3, side: THREE.FrontSide });
    const vertex = mapMaterial(shared, { opacity: 1, gloss: 0.4, side: THREE.FrontSide });
    const tileFace = mapMaterial(shared, { opacity: 0.16, gloss: 0.04, fade: 0.82, depthWrite: false });
    const tileEdge = mapMaterial(shared, { opacity: 0.85, gloss: 0.2, fade: 0.9, side: THREE.FrontSide, transparent: true, depthWrite: true });
    const shellMaterial = new THREE.ShaderMaterial({
        uniforms: { u_color: { value: new THREE.Color(0x9aa3b5) }, u_alpha: { value: 0.10 } },
        vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){vN=normalize(normalMatrix*normal); vec4 mv=modelViewMatrix*vec4(position,1.); vV=-mv.xyz; gl_Position=projectionMatrix*mv;}',
        fragmentShader: 'uniform vec3 u_color; uniform float u_alpha; varying vec3 vN; varying vec3 vV; void main(){float f=1.-abs(dot(normalize(vN),normalize(vV))); gl_FragColor=vec4(u_color,u_alpha*(0.25+2.2*f*f*f));}',
        transparent: true, depthWrite: false, side: THREE.DoubleSide,
    });
    const shell = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 48), shellMaterial);
    shell.renderOrder = 10;
    scene.add(shell);
    shell.visible = false;
    const geometries = [];
    function add(geometry, mat, order, tiles = null) {
        if (!geometry) return;
        geometries.push(geometry);
        const mesh = tiles ? new THREE.InstancedMesh(geometry, mat, tiles.length) : new THREE.Mesh(geometry, mat);
        if (tiles) {
            tiles.forEach((t, i) => mesh.setMatrixAt(i, lorentz4(t.M)));
            mesh.instanceMatrix.needsUpdate = true;
        }
        mesh.frustumCulled = false;
        mesh.renderOrder = order;
        group.add(mesh);
    }
    function rebuild(home, report, colors, theme) {
        group.clear();
        geometries.splice(0).forEach(g => g.dispose());
        shellMaterial.uniforms.u_color.value.setHex(theme === 'light' ? 0x9aa3b5 : 0xc9d2e6);
        shellMaterial.uniforms.u_alpha.value = theme === 'light' ? 0.10 : 0.12;
        if (!home || !home.poly) return;
        const wash = theme === 'light' ? 0.18 : 0;
        const cols = colors.map(c => c.map(x => x + (1 - x) * wash));
        const full = dirichletMeshes(home, cols, report);
        const lite = dirichletMeshes(home, cols, report, { lite: true });
        add(full.faces, face, 2); add(full.edges, edge, 3); add(full.vertices, vertex, 4);
        const centre = home.q0 || new THREE.Vector3();
        let reach = 0, finite = false;
        for (const v of home.poly.vertices) {
            if (v.ideal) continue;
            finite = true;
            const k = v.k, p = k.clone().multiplyScalar(1 / (1 + Math.sqrt(Math.max(0, 1 - k.lengthSq()))));
            const den = (1 - p.lengthSq()) * (1 - centre.lengthSq());
            if (den > 0) reach = Math.max(reach, Math.acosh(1 + 2 * p.distanceToSquared(centre) / den));
        }
        reach = finite ? Math.min(reach, 3) : 1.2;
        const tiles = tilesNear(home.walls, { centre, eye: centre, radius: reach + 1.4, max: 90 }).slice(1);
        if (tiles.length) { add(lite.faces, tileFace, 5, tiles); add(lite.edges, tileEdge, 6, tiles); }
        else { if (lite.faces) lite.faces.dispose(); if (lite.edges) lite.edges.dispose(); }
        if (lite.vertices) lite.vertices.dispose();
    }
    return {
        rebuild,
        setVisible(on) { group.visible = on; shell.visible = on; },
        setFrame(matrix) { shared.u_L.value.set(...lorentzMatrix(matrix)); },
    };
}
