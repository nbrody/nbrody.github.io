# Simple KnotFolio

A simplified version of KnotFolio that focuses on the core knot drawing interface without the computational invariants.

## What's Included

- **Knot Drawing Interface**: Full painting and erasing tools for drawing knot diagrams
- **Image Import**: Drag-and-drop or paste images to trace knot diagrams
- **Undo/Redo**: Complete undo stack for drawing operations
- **Data Structure**: Uses the same `Int8Array` buffer format as the original KnotFolio

## What's Excluded

- Jones polynomial computation
- Alexander polynomial computation
- Conway polynomial computation
- Knot identification using KnotInfo database
- All other invariant calculations

## Data Structure

The knot is stored as a raster representation in an `Int8Array` buffer:
- Width × Height array where each pixel stores drawing information
- Located in `KnotRasterView.buffer` property
- Can be accessed via `undo_stack.get().buffer`

## Building

```bash
npm install
npm run build
```

This generates `main.js` which is referenced by `index.html`.

## Running

Simply open `index.html` in a web browser. No server needed.

## File Size

The simplified version is about 20% smaller than the full version:
- Simple KnotFolio: ~82 KB (minified)
- Full KnotFolio: ~102 KB (minified)

## Credits

Based on [KnotFolio](https://github.com/kmill/knotfolio) by Kyle Miller.
