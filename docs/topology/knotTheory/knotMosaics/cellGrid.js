/**
 * cellGrid.js — membership checks for mosaic cells against the live grid.
 *
 * Disk/torus cells are {row, col}. Sphere cells are {face, row, col}.
 * After a surface or size change, leftover selection/paint cells can
 * point at the wrong topology (or past the new bounds). Writing those
 * without a check either throws or silently mutates the wrong tile.
 */
'use strict';

function cellBelongsToGrid(grid, surface, cell) {
    if (!cell || !grid) return false;
    if (surface === 'sphere') {
        if (typeof cell.face !== 'string') return false;
        const face = grid[cell.face];
        if (!face) return false;
        const row = face[cell.row];
        return Array.isArray(row) && Number.isInteger(cell.col) &&
            cell.col >= 0 && cell.col < row.length;
    }
    // Sphere leftover cells still have row/col and would silently write
    // into the flat grid if we only bounds-checked those fields.
    if (cell.face != null) return false;
    if (!Number.isInteger(cell.row) || !Number.isInteger(cell.col)) return false;
    const row = grid[cell.row];
    return Array.isArray(row) && cell.col >= 0 && cell.col < row.length;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { cellBelongsToGrid };
} else if (typeof window !== 'undefined') {
    window.cellBelongsToGrid = cellBelongsToGrid;
}
