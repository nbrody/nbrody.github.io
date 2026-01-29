export class Gecko {
    constructor(id, color, body, properties = {}) {
        this.id = id;
        this.color = color;
        this.body = body; // Array of {r, c}
        this.innerGecko = properties.innerGecko || null; // Another Gecko object!
        this.attachedHole = properties.attachedHole || null; // { color } - always at tail
    }

    get head() { return this.body[0]; }
    get tail() { return this.body[this.body.length - 1]; }

    clone() {
        const inner = this.innerGecko ? this.innerGecko.clone() : null;
        return new Gecko(this.id, this.color, this.body.map(p => ({ ...p })), {
            innerGecko: inner,
            attachedHole: this.attachedHole ? { ...this.attachedHole } : null
        });
    }
}

export class Board {
    constructor(rows, cols) {
        this.rows = rows;
        this.cols = cols;
        this.cells = Array(rows).fill(null).map(() => Array(cols).fill({ type: 'empty' }));
        this.geckos = [];
        this.holes = []; // {r, c, color}
    }

    setCell(r, c, type, data = {}) {
        if (r < 0 || r >= this.rows || c < 0 || c >= this.cols) return;
        this.cells[r][c] = { type, ...data };
    }

    getCell(r, c) {
        if (r < 0 || r >= this.rows || c < 0 || c >= this.cols) return { type: 'wall' };

        // Check if a gecko is there
        for (const gecko of this.geckos) {
            const index = gecko.body.findIndex(p => p.r === r && p.c === c);
            if (index !== -1) {
                return { type: 'gecko', geckoId: gecko.id, part: index };
            }
        }

        return this.cells[r][c];
    }

    addGecko(id, color, body) {
        const gecko = new Gecko(id, color, body);
        this.geckos.push(gecko);
        return gecko;
    }

    addHole(r, c, color, isPermanent = false) {
        const hole = { r, c, color, isPermanent };
        this.holes.push(hole);
        this.setCell(r, c, 'hole', { color, isPermanent });
    }

    isValidMove(geckoId, targetPos, fromEnd = 'head') {
        const gecko = this.geckos.find(g => g.id === geckoId);
        if (!gecko) return false;

        const { r, c } = targetPos;
        if (r < 0 || r >= this.rows || c < 0 || c >= this.cols) return false;

        const end = fromEnd === 'head' ? gecko.head : gecko.tail;
        const dr = Math.abs(r - end.r);
        const dc = Math.abs(c - end.c);
        if (dr + dc !== 1) return false;

        const cell = this.getCell(r, c);

        // If the cell is this gecko's own attached hole, it's passable (hole moves with gecko)
        if (gecko.attachedHole && cell.type === 'hole') {
            const attachedHoleObj = this.holes.find(h => h.color === gecko.attachedHole.color && !h.isPermanent);
            if (attachedHoleObj && attachedHoleObj.r === r && attachedHoleObj.c === c) {
                return true; // Can pass through own attached hole - it will move too
            }
        }

        if (cell.type === 'empty') {
            return true;
        }

        if (cell.type === 'hole') {
            // Rule 1: Gecko can only enter a hole if its OUTERMOST color matches the hole
            const hole = this.holes.find(h => h.r === r && h.c === c);
            if (!hole) return true; // No matching hole found, treat as passable

            // Rule 2: Gecko cannot enter a hole if it has an attached hole (rope)
            if (gecko.attachedHole) {
                return false; // Can't enter hole while dragging another hole
            }

            // Check if outermost color matches hole color
            if (gecko.color === hole.color) {
                return true; // Can enter matching hole
            }

            // Non-matching holes block movement
            return false;
        }

        return false;
    }

    moveGecko(geckoId, targetPos, fromEnd = 'head') {
        if (!this.isValidMove(geckoId, targetPos, fromEnd)) return false;

        const gecko = this.geckos.find(g => g.id === geckoId);

        // Track the cell that will be vacated (for attached hole to move to)
        // When moving head: tail cell is vacated
        // When moving tail: head cell is vacated
        let vacatedCell;

        if (fromEnd === 'head') {
            // Save old tail position before it's removed
            vacatedCell = { r: gecko.tail.r, c: gecko.tail.c };
            gecko.body.unshift({ ...targetPos });
            gecko.body.pop();
        } else {
            // Save old head position before it's removed
            vacatedCell = { r: gecko.head.r, c: gecko.head.c };
            gecko.body.push({ ...targetPos });
            gecko.body.shift();
        }

        // If the gecko has an attached hole, move it to the vacated cell
        // The hole trails behind the gecko like a rope
        if (gecko.attachedHole) {
            const holeIdx = this.holes.findIndex(h => h.color === gecko.attachedHole.color && !h.isPermanent);
            if (holeIdx !== -1) {
                // Remove old cell data
                const oldHole = this.holes[holeIdx];
                this.setCell(oldHole.r, oldHole.c, 'empty');

                // Update hole position to the vacated cell
                this.holes[holeIdx].r = vacatedCell.r;
                this.holes[holeIdx].c = vacatedCell.c;
                this.setCell(vacatedCell.r, vacatedCell.c, 'hole', { color: oldHole.color, isPermanent: false });
            }
        }

        // Check if this move solved this gecko
        this.checkGeckoCompletion(gecko);

        return true;
    }

    checkGeckoCompletion(gecko) {
        // Check if gecko's head OR tail is on a matching hole (same color as outermost layer)
        const headHole = this.holes.find(h => h.color === gecko.color && h.r === gecko.head.r && h.c === gecko.head.c);
        const tailHole = this.holes.find(h => h.color === gecko.color && h.r === gecko.tail.r && h.c === gecko.tail.c);
        const hole = headHole || tailHole;
        if (!hole) return;

        // Gecko's outermost layer gets sucked into the hole!
        // Remove the outer gecko from the board
        this.geckos = this.geckos.filter(g => g.id !== gecko.id);

        // If there's an inner gecko, reveal it with the same body path
        if (gecko.innerGecko) {
            const newGecko = gecko.innerGecko;
            newGecko.body = gecko.body.map(p => ({ ...p }));

            // Inner gecko inherits any attached hole from the outer gecko
            if (gecko.attachedHole) {
                newGecko.attachedHole = { ...gecko.attachedHole };
            }

            this.geckos.push(newGecko);
        }
        // If no inner gecko, the whole snake disappears (which already happened above)

        // Remove the hole if not permanent
        if (!hole.isPermanent) {
            this.holes = this.holes.filter(h => h !== hole);
            this.setCell(hole.r, hole.c, 'empty');
        }
    }

    isSolved() {
        return this.geckos.length === 0;
    }

    serialize() {
        // Must serialize geckos (id, color, body) AND holes (since they move)
        return JSON.stringify({
            geckos: this.geckos.map(g => ({ id: g.id, color: g.color, body: g.body })),
            holes: this.holes.map(h => ({ r: h.r, c: h.c, color: h.color }))
        });
    }

    clone() {
        const newBoard = new Board(this.rows, this.cols);
        newBoard.cells = JSON.parse(JSON.stringify(this.cells));
        newBoard.holes = JSON.parse(JSON.stringify(this.holes));
        newBoard.geckos = this.geckos.map(g => g.clone());
        return newBoard;
    }
}
