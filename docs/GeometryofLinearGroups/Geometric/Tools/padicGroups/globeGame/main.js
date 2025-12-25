import * as THREE from 'three';
import { I3, matMul3, cloneMat3, transpose3 } from './math.js';
import { setupScene, computeGeodesicMiles } from './scene.js';
import { UIManager } from './ui.js';
import { ControlsManager } from './controls.js';
import {
    MAT_L_FLOAT, MAT_U_FLOAT,
    MAT_L_EXACT, MAT_LINV_EXACT, MAT_U_EXACT, MAT_UINV_EXACT
} from './constants.js';

class GameState {
    constructor() {
        // Rotation matrices (Float for THREE.js)
        this.L = MAT_L_FLOAT;
        this.Linv = this.L.clone().invert();
        this.U = MAT_U_FLOAT;
        this.Uinv = this.U.clone().invert();

        // Exact rational versions
        this.Lx = MAT_L_EXACT;
        this.Linvx = MAT_LINV_EXACT;
        this.Ux = MAT_U_EXACT;
        this.Uinvx = MAT_UINV_EXACT;

        // Quaternions for smooth interpolation
        this.qL = new THREE.Quaternion().setFromRotationMatrix(this.L);
        this.qLinv = new THREE.Quaternion().setFromRotationMatrix(this.Linv);
        this.qU = new THREE.Quaternion().setFromRotationMatrix(this.U);
        this.qUinv = new THREE.Quaternion().setFromRotationMatrix(this.Uinv);

        this.targetQuaternion = new THREE.Quaternion();
        this.moves = [];
        this.cumulativeMatrixExact = I3();
        this.savedGens = [];

        // History for Undo
        this.history = [];

        // Keep reference to matMul3
        this.matMul3 = matMul3;
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

    // O(N) Stack-based reduction
    reduceWordArray(wordArr) {
        const stack = [];
        for (const char of wordArr) {
            if (stack.length > 0 && this.areInverseTokens(stack[stack.length - 1], char)) {
                stack.pop();
            } else {
                stack.push(char);
            }
        }
        return stack;
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

    // Capture state before mutation
    pushHistory() {
        this.history.push({
            moves: [...this.moves],
            q: this.targetQuaternion.clone(),
            exact: cloneMat3(this.cumulativeMatrixExact)
        });
        if (this.history.length > 50) this.history.shift();
    }

    undo() {
        if (this.history.length === 0) return false;
        const prev = this.history.pop();
        this.moves = prev.moves;
        this.targetQuaternion.copy(prev.q);
        this.cumulativeMatrixExact = prev.exact;
        return true;
    }

    reset() {
        this.pushHistory(); // Allow undoing the reset
        this.moves = [];
        // Reset to initial Earth orientation? 
        if (this.initialQuaternion) {
            this.targetQuaternion.copy(this.initialQuaternion);
        }
        this.cumulativeMatrixExact = I3();
    }

    applyMove(moveChar) {
        this.pushHistory();

        let moveQ = null;
        let moveExact = null;

        switch (moveChar) {
            case 'L': moveQ = this.qL; moveExact = this.Lx; break;
            case 'R': moveQ = this.qLinv; moveExact = this.Linvx; break;
            case 'U': moveQ = this.qU; moveExact = this.Ux; break;
            case 'D': moveQ = this.qUinv; moveExact = this.Uinvx; break;
        }

        if (moveExact && moveQ) {
            this.targetQuaternion.premultiply(moveQ);
            this.cumulativeMatrixExact = matMul3(moveExact, this.cumulativeMatrixExact);
            this.moves.push(moveChar);
            this.simplifyMovesInPlace();
        }
    }

    applySavedGenerator(g, inverse) {
        this.pushHistory();
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
    gameState.initialQuaternion = earthMesh.quaternion.clone(); // Save for reset

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
