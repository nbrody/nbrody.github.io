/* ================================================================
   Tessellation Engine — {6,4} Hyperbolic Tiling
   
   Generates the tiling by BFS, computing the neighbor across each
   edge via half-turn (rotation by π) about the edge's hyperbolic
   midpoint. This is mathematically exact: every edge midpoint of
   a {p,q} tiling is a center of 2-fold rotational symmetry.
   ================================================================ */

const Tess = {
    p: 6,
    q: 4,
    maxDepth: 4,
    tiles: [],
    centralVertices: [],
    vertexRadius: 0,
    apothemRadius: 0
};

/**
 * Initialize tessellation geometry.
 */
function initTessellation() {
    Tess.vertexRadius  = regularPolygonRadius(Tess.p, Tess.q);
    Tess.apothemRadius = regularPolygonApothem(Tess.p, Tess.q);
    Tess.centralVertices = regularHypPolygon(Tess.p, Tess.q, -Math.PI / 2);
}

/**
 * Generate tiles by BFS.
 * 
 * For each tile, for each edge, compute:
 *   1. The hyperbolic midpoint of the edge
 *   2. The half-turn Möbius transform about that midpoint
 *   3. Apply it to all vertices of the current tile → neighbor tile
 * 
 * This avoids any issues with generator composition order or
 * orientation tracking, because each generator is computed from
 * the actual geometry of the parent tile.
 */
function generateTiles(maxDepth) {
    Tess.maxDepth = maxDepth;
    Tess.tiles = [];
    
    const p = Tess.p;
    const visited = new Set();
    
    function tileKey(center) {
        // Coarser key to avoid floating-point near-misses
        return Math.round(center[0] * 5000) + ',' + Math.round(center[1] * 5000);
    }
    
    // Central tile
    const centralTile = {
        vertices: Tess.centralVertices.map(v => [v[0], v[1]]),
        center: [0, 0],
        depth: 0,
        colorIndex: 0  // 0 = angel (white), 1 = devil (dark)
    };
    
    Tess.tiles.push(centralTile);
    visited.add(tileKey([0, 0]));
    
    const queue = [centralTile];
    
    while (queue.length > 0) {
        const tile = queue.shift();
        if (tile.depth >= maxDepth) continue;
        
        for (let i = 0; i < p; i++) {
            const v1 = tile.vertices[i];
            const v2 = tile.vertices[(i + 1) % p];
            
            // Hyperbolic midpoint of this edge
            const mid = hypMidpoint(v1, v2);
            
            // Half-turn about the midpoint
            const ht = halfTurnAbout(mid);
            
            // Neighbor center = image of this tile's center
            const newCenter = mobius(ht, tile.center);
            
            // Cull tiles too close to the boundary
            if (cAbs2(newCenter) > 0.997) continue;
            
            const key = tileKey(newCenter);
            if (visited.has(key)) continue;
            visited.add(key);
            
            // Neighbor vertices = images of this tile's vertices
            const newVerts = tile.vertices.map(v => mobius(ht, v));
            
            const newTile = {
                vertices: newVerts,
                center: newCenter,
                depth: tile.depth + 1,
                colorIndex: 1 - tile.colorIndex  // alternate
            };
            
            Tess.tiles.push(newTile);
            queue.push(newTile);
        }
    }
}

/**
 * Apply a Möbius transformation to all stored tile data.
 */
function transformAllTiles(m) {
    for (const tile of Tess.tiles) {
        tile.vertices = tile.vertices.map(v => mobius(m, v));
        tile.center = mobius(m, tile.center);
    }
}

/**
 * Regenerate tiles from scratch.
 */
function regenerateTiles() {
    initTessellation();
    generateTiles(Tess.maxDepth);
}
