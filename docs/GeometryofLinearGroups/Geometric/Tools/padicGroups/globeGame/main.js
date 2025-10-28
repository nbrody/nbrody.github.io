import * as THREE from 'three';
import { F, I3, matMul3, cloneMat3, transpose3 } from './math.js';
import { setupScene, computeGeodesicMiles } from './scene.js';
import { UIManager } from './ui.js';
import { ControlsManager } from './controls.js';

class GameState {
    constructor() {
        // Rotation matrices
        this.L = this.makeM4(3 / 5, 0, 4 / 5, 0, 1, 0, -4 / 5, 0, 3 / 5);
        this.Linv = this.L.clone().invert();
        this.U = this.makeM4(1, 0, 0, 0, 5 / 13, -12 / 13, 0, 12 / 13, 5 / 13);
        this.Uinv = this.U.clone().invert();

        // Exact rational versions
        this.Lx = [[F(3,5), F(0), F(4,5)], [F(0), F(1), F(0)], [F(-4,5), F(0), F(3,5)]];
        this.Linvx = [[F(3,5), F(0), F(-4,5)], [F(0), F(1), F(0)], [F(4,5), F(0), F(3,5)]];
        this.Ux = [[F(1), F(0), F(0)], [F(0), F(5,13), F(-12,13)], [F(0), F(12,13), F(5,13)]];
        this.Uinvx = [[F(1), F(0), F(0)], [F(0), F(5,13), F(12,13)], [F(0), F(-12,13), F(5,13)]];

        // Quaternions for smooth interpolation
        this.qL = new THREE.Quaternion().setFromRotationMatrix(this.L);
        this.qLinv = new THREE.Quaternion().setFromRotationMatrix(this.Linv);
        this.qU = new THREE.Quaternion().setFromRotationMatrix(this.U);
        this.qUinv = new THREE.Quaternion().setFromRotationMatrix(this.Uinv);

        this.targetQuaternion = new THREE.Quaternion();
        this.moves = [];
        this.cumulativeMatrixExact = I3();
        this.savedGens = [];

        // Keep reference to matMul3
        this.matMul3 = matMul3;
    }

    makeM4(a11, a12, a13, a21, a22, a23, a31, a32, a33) {
        const m = new THREE.Matrix4();
        m.set(
            a11, a12, a13, 0,
            a21, a22, a23, 0,
            a31, a32, a33, 0,
            0, 0, 0, 1
        );
        return m;
    }

    areInverseTokens(a, b) {
        if ((a === 'L' && b === 'R') || (a === 'R' && b === 'L')) return true;
        if ((a === 'U' && b === 'D') || (a === 'D' && b === 'U')) return true;
        const INV = '⁻¹';
        if (typeof a === 'string' && typeof b === 'string') {
            if (a.endsWith(INV)) return b === a.slice(0, -INV.length);
            return b === a + INV;
        }
        return false;
    }

    reduceWordArray(wordArr) {
        let changed = true;
        while (changed) {
            changed = false;
            for (let i = 0; i < wordArr.length - 1; i++) {
                if (this.areInverseTokens(wordArr[i], wordArr[i+1])) {
                    wordArr.splice(i, 2);
                    changed = true;
                    break;
                }
            }
        }
        return wordArr;
    }

    simplifyMovesInPlace() {
        this.moves = this.reduceWordArray([...this.moves]);
    }

    parseWordToRotation(wordStr) {
        const clean = (wordStr || '').toUpperCase().replace(/[^LRUD]/g, '');
        let q = new THREE.Quaternion();
        let M = I3();
        for (const ch of clean) {
            switch (ch) {
                case 'L': q.premultiply(this.qL); M = matMul3(this.Lx, M); break;
                case 'R': q.premultiply(this.qLinv); M = matMul3(this.Linvx, M); break;
                case 'U': q.premultiply(this.qU); M = matMul3(this.Ux, M); break;
                case 'D': q.premultiply(this.qUinv); M = matMul3(this.Uinvx, M); break;
                default: break;
            }
        }
        return { q, exact: M, word: clean };
    }

    applySavedGenerator(g, inverse) {
        if (inverse) {
            const qInv = g.q.clone().invert();
            this.targetQuaternion.premultiply(qInv);
            this.cumulativeMatrixExact = matMul3(transpose3(g.exact), this.cumulativeMatrixExact);
            this.moves.push(g.name + '⁻¹');
            this.simplifyMovesInPlace();
        } else {
            this.targetQuaternion.premultiply(g.q);
            this.cumulativeMatrixExact = matMul3(g.exact, this.cumulativeMatrixExact);
            this.moves.push(g.name);
            this.simplifyMovesInPlace();
        }
    }

    setHandleResize(fn) {
        this.handleResize = fn;
    }
}

export function init() {
    const gameState = new GameState();
    const sceneData = setupScene();
    const { scene, camera, renderer, controls, earthMesh, NashBeacon, character } = sceneData;

    // Initialize target quaternion
    gameState.targetQuaternion.copy(earthMesh.quaternion);

    const uiManager = new UIManager(gameState);
    const controlsManager = new ControlsManager(gameState, uiManager);

    // Distance element
    const distanceEl = document.getElementById('distance-box');

    // Window resize handler
    const handleResize = () => {
        const width = uiManager.panelOpen ? window.innerWidth - 320 : window.innerWidth;
        camera.aspect = width / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(width, window.innerHeight);
    };
    gameState.setHandleResize(handleResize);
    window.addEventListener('resize', handleResize);

    // Initialize displays
    uiManager.updateDisplays();
    uiManager.renderSavedList();

    // Animation loop
    function animate() {
        requestAnimationFrame(animate);

        // Smoothly interpolate the earth's current quaternion towards the target
        const animationStep = 0.08;
        if (!earthMesh.quaternion.equals(gameState.targetQuaternion)) {
            earthMesh.quaternion.slerp(gameState.targetQuaternion, animationStep);
        }

        // Update distance-to-target UI
        if (distanceEl) {
            const miles = computeGeodesicMiles(earthMesh, character, NashBeacon);
            distanceEl.textContent = `Distance to Target: ${miles.toFixed(1)} miles`;
        }

        controls.update();
        renderer.render(scene, camera);
    }

    animate();
}
