export class ControlsManager {
    constructor(gameState, uiManager) {
        this.gameState = gameState;
        this.uiManager = uiManager;
        this.initKeyboard();
        this.initTouch();
    }

    applyMove(moveChar) {
        let moveMatrix = null;
        let moveExact = null;

        switch (moveChar) {
            case 'L':
                this.gameState.targetQuaternion.premultiply(this.gameState.qL);
                moveExact = this.gameState.Lx;
                break;
            case 'R':
                this.gameState.targetQuaternion.premultiply(this.gameState.qLinv);
                moveExact = this.gameState.Linvx;
                break;
            case 'U':
                this.gameState.targetQuaternion.premultiply(this.gameState.qU);
                moveExact = this.gameState.Ux;
                break;
            case 'D':
                this.gameState.targetQuaternion.premultiply(this.gameState.qUinv);
                moveExact = this.gameState.Uinvx;
                break;
            default:
                return;
        }

        if (moveExact) {
            this.gameState.moves.push(moveChar);
            this.gameState.simplifyMovesInPlace();
            this.gameState.cumulativeMatrixExact = this.gameState.matMul3(
                moveExact,
                this.gameState.cumulativeMatrixExact
            );
            this.uiManager.updateDisplays();
        }
    }

    initKeyboard() {
        window.addEventListener('keydown', (e) => {
            let move = null;
            switch (e.key) {
                case 'ArrowLeft':  move = 'L'; break;
                case 'ArrowRight': move = 'R'; break;
                case 'ArrowUp':    move = 'U'; break;
                case 'ArrowDown':  move = 'D'; break;
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
                ev.preventDefault();
                ev.stopPropagation();
                this.applyMove(moveChar);
            };
            btn.addEventListener('pointerdown', fire);
            btn.addEventListener('click', fire);
        };

        bindButton(btnUp, 'U');
        bindButton(btnDown, 'D');
        bindButton(btnLeft, 'L');
        bindButton(btnRight, 'R');
    }
}
