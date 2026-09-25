const SQRT_THREE = Math.sqrt(3);
const ROW_HEIGHT = SQRT_THREE / 2;
const HEX_RADIUS = 1 / SQRT_THREE;
const NATIVE_SCALE = 4;
const MAX_RASTER_SIZE = 1600;

/** Embed x + yω with ω = exp(2πi/3); adjacent sites have distance one. */
export function eisensteinToWorld(x, y) {
  return { x: x - y / 2, y: ROW_HEIGHT * y };
}

/** Round in cube coordinates, giving the regular hexagonal Voronoi cells. */
export function nearestEisensteinCell(worldX, worldY) {
  const y = worldY / ROW_HEIGHT;
  const x = worldX + y / 2;
  const a = x, b = -y, c = y - x;
  let ra = Math.round(a), rb = Math.round(b);
  const rc = Math.round(c);
  const da = Math.abs(ra - a), db = Math.abs(rb - b), dc = Math.abs(rc - c);
  if (da > db && da > dc) ra = -rb - rc;
  else if (db > dc) rb = -ra - rc;
  // If c has the greatest error, correcting it leaves our x and y unchanged.
  return { x: ra === 0 ? 0 : ra, y: rb === 0 ? 0 : -rb };
}

/**
 * Map the canvas raster to lattice sites. The Eisenstein domain is the union
 * of the hexagons at 0 <= x < width, 0 <= y < height, with a sloping outline.
 * A common scale (at most four pixels per site spacing) preserves angles and
 * distances. Raster dimensions round up; spare subpixels pad both sides.
 * `worldLeft` and `worldTop` identify the raster's top-left pixel edge.
 * `cellAt` samples the containing pixel, exactly matching `cellIndices`, so
 * painting targets the same cell the renderer displays at every zoom level.
 */
export function createFieldGeometry(width, height, neighborhood) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new RangeError('Lattice dimensions must be positive integers.');
  }
  if (neighborhood !== 'eisenstein') {
    return {
      width, height, scale: 1, worldLeft: 0, worldTop: 0, cellIndices: null,
      cellCenter: (x, y) => ({ x: x + 0.5, y: y + 0.5 }),
      cellAt(px, py) {
        if (!Number.isFinite(px) || !Number.isFinite(py) || px < 0 || py < 0 || px >= width || py >= height) return null;
        return { x: Math.floor(px), y: Math.floor(py) };
      },
    };
  }

  const minX = -(height - 1) / 2 - 0.5, maxX = width - 0.5;
  const minY = -HEX_RADIUS, maxY = ROW_HEIGHT * (height - 1) + HEX_RADIUS;
  const worldWidth = maxX - minX, worldHeight = maxY - minY;
  const scale = Math.min(NATIVE_SCALE, MAX_RASTER_SIZE / worldWidth, MAX_RASTER_SIZE / worldHeight);
  const rasterWidth = Math.min(MAX_RASTER_SIZE, Math.ceil(worldWidth * scale));
  const rasterHeight = Math.min(MAX_RASTER_SIZE, Math.ceil(worldHeight * scale));
  const worldLeft = minX - (rasterWidth / scale - worldWidth) / 2;
  const worldTop = minY - (rasterHeight / scale - worldHeight) / 2;
  const cellIndices = new Int32Array(rasterWidth * rasterHeight);
  cellIndices.fill(-1);
  for (let py = 0; py < rasterHeight; py++) {
    const worldY = worldTop + (py + 0.5) / scale;
    for (let px = 0; px < rasterWidth; px++) {
      const cell = nearestEisensteinCell(worldLeft + (px + 0.5) / scale, worldY);
      if (cell.x >= 0 && cell.x < width && cell.y >= 0 && cell.y < height) {
        cellIndices[py * rasterWidth + px] = cell.y * width + cell.x;
      }
    }
  }
  return {
    width: rasterWidth, height: rasterHeight, scale, worldLeft, worldTop, cellIndices,
    cellCenter(x, y) {
      const point = eisensteinToWorld(x, y);
      return { x: (point.x - worldLeft) * scale, y: (point.y - worldTop) * scale };
    },
    cellAt(px, py) {
      if (!Number.isFinite(px) || !Number.isFinite(py) || px < 0 || py < 0 || px >= rasterWidth || py >= rasterHeight) return null;
      const index = cellIndices[Math.floor(py) * rasterWidth + Math.floor(px)];
      return index < 0 ? null : { x: index % width, y: Math.floor(index / width) };
    },
  };
}
