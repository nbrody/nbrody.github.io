export class ControlsManager {
    constructor(gameState, uiManager) {
        this.gameState = gameState;
        this.uiManager = uiManager;
        this.initKeyboard();
        this.initTouch();
    }

    applyMove(moveChar) {
        this.gameState.applyMove(moveChar);
        this.uiManager.updateDisplays();
    }

    initKeyboard() {
        window.addEventListener('keydown', (e) => {
            let move = null;
            switch (e.key) {
                case 'ArrowLeft': move = 'L'; break;
                case 'ArrowRight': move = 'R'; break;
                case 'ArrowUp': move = 'U'; break;
                case 'ArrowDown': move = 'D'; break;
                default: return;
            }
            e.preventDefault();
            this.applyMove(move);
        });
    }

    initTouch() {
        const btnUp = document.getElementById('btn-up');
        const btnDown = document.getElementById('btn-down');
        const btnLeft = document.getElementById('btn-left');
        const btnRight = document.getElementById('btn-right');

        const bindButton = (btn, moveChar) => {
            if (!btn) return;
            const fire = (ev) => {
                if (ev.cancelable) ev.preventDefault();
                ev.stopPropagation();
                this.applyMove(moveChar);
            };
            // Use pointerdown to avoid delay and ghost clicks
            btn.addEventListener('pointerdown', fire);
        };

        bindButton(btnUp, 'U');
        bindButton(btnDown, 'D');
        bindButton(btnLeft, 'L');
        bindButton(btnRight, 'R');
    }
}
