import { matMul3, transpose3, cloneMat3 } from './math.js';

export class UIManager {
    constructor(gameState) {
        this.gameState = gameState;
        this.movesDisplay = document.getElementById('moves-display');
        this.matrixDisplay = document.getElementById('matrix-display');
        this.saveBtn = document.getElementById('save-rotation-btn');
        this.savedListEl = document.getElementById('saved-list');
        this.plusButton = document.getElementById('plus-button');
        this.sidePanel = document.getElementById('side-panel');
        this.panelOpen = false;

        this.initLegend();
        this.initPanelToggle();
        if (this.saveBtn) {
            this.saveBtn.addEventListener('click', () => this.handleSaveCurrentRotation());
        }
    }

    initLegend() {
        const legendEl = document.getElementById('legend-box');
        const round4 = (n) => Math.round(n * 1e4) / 1e4;
        const xDeg = round4(Math.atan2(4/5, 3/5) * 180 / Math.PI);
        const yDeg = round4(Math.atan2(12/13, 5/13) * 180 / Math.PI);
        legendEl.innerHTML = `Left/Right: rotate by ${xDeg}&deg;.<br>Up/Down: rotate by ${yDeg}&deg;.`;
    }

    initPanelToggle() {
        this.plusButton.addEventListener('click', () => {
            this.panelOpen = !this.panelOpen;

            if (this.panelOpen) {
                this.sidePanel.classList.add('open');
                this.plusButton.classList.add('active');
            } else {
                this.sidePanel.classList.remove('open');
                this.plusButton.classList.remove('active');
            }

            setTimeout(() => {
                this.gameState.handleResize();
            }, 50);
        });
    }

    updateDisplays() {
        // Update moves display
        const reduced = this.gameState.reduceWordArray([...this.gameState.moves]);
        this.movesDisplay.textContent = reduced.length > 0 ? reduced.join('') : '(no moves yet)';

        // Update matrix display
        const M = this.gameState.cumulativeMatrixExact;
        const row = (r) => `${M[r][0].toLatex()} & ${M[r][1].toLatex()} & ${M[r][2].toLatex()}`;
        const latex = `\\[\\begin{pmatrix} ${row(0)} \\\\ ${row(1)} \\\\ ${row(2)} \\end{pmatrix}\\]`;
        this.matrixDisplay.innerHTML = latex;
        if (window.MathJax && window.MathJax.typesetPromise) {
            window.MathJax.typesetPromise([this.matrixDisplay]);
        }
    }

    renderSavedList() {
        if (!this.savedListEl) return;
        this.savedListEl.innerHTML = '';
        this.gameState.savedGens.forEach((g) => {
            const row = document.createElement('div');
            row.className = 'saved-item';

            const btn = document.createElement('button');
            btn.className = 'saved-rot-btn';
            btn.textContent = g.name;
            btn.title = 'Click to apply; Shift-click for inverse';
            btn.addEventListener('click', (ev) => {
                this.gameState.applySavedGenerator(g, ev.shiftKey);
                this.updateDisplays();
            });

            const input = document.createElement('input');
            input.className = 'saved-word';
            input.placeholder = 'Word (e.g., LURRD)';
            input.value = g.word || '';
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') { e.currentTarget.blur(); }
            });
            input.addEventListener('blur', () => {
                const proposal = (input.value || '').toUpperCase();
                if (/^[LRUD]*$/.test(proposal)) {
                    const parsed = this.gameState.parseWordToRotation(proposal);
                    g.q = parsed.q;
                    g.exact = parsed.exact;
                    g.word = parsed.word;
                    input.classList.remove('invalid');
                } else {
                    input.classList.add('invalid');
                }
            });

            row.appendChild(btn);
            row.appendChild(input);
            this.savedListEl.appendChild(row);
        });
    }

    handleSaveCurrentRotation() {
        const name = `g${this.gameState.savedGens.length + 1}`;
        const qSnap = this.gameState.targetQuaternion.clone();
        const exactSnap = cloneMat3(this.gameState.cumulativeMatrixExact);
        const currentWord = this.gameState.reduceWordArray([...this.gameState.moves]).join('');
        this.gameState.savedGens.push({ name, q: qSnap, exact: exactSnap, word: currentWord });
        this.renderSavedList();
    }
}
