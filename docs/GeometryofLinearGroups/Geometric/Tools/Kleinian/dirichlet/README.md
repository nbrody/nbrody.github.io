# Dirichlet Polyhedron Viewer

A modular web application for visualizing Dirichlet fundamental domains of Kleinian groups in hyperbolic 3-space.

## Project Structure

```
dirichlet/
├── index.html          # Main HTML page
├── css/
│   └── styles.css      # All styles
├── js/
│   ├── main.js         # Application entry point
│   ├── geometry.js     # Complex numbers & matrix algebra
│   ├── textures.js     # Visual appearance & color palettes
│   ├── groups.js       # Group theory operations
│   ├── rendering.js    # Three.js rendering logic
│   └── ui.js          # User interface & event handlers
└── README.md          # This file
```

## Modules

### geometry.js
Core mathematical structures:
- `Complex`: Complex number class with arithmetic operations
- `Matrix2`: 2×2 complex matrix class for PSL(2,C) matrices
- Parsing functions for LaTeX expressions
- Matrix canonicalization and comparison utilities

### textures.js
Visual appearance management:
- Color palette definitions (UC, B4L, Teal-Fuchsia, etc.)
- B4L logo texture generation
- Material creation with proper opacity and colors

### groups.js
Hyperbolic geometry and group theory:
- Group element generation via BFS
- Hyperbolic distance computation
- Delaunay neighbor computation
- Orbit calculations

### rendering.js
Three.js visualization:
- Scene initialization and management
- Bisector (hemisphere/plane) rendering
- Cayley graph visualization
- User interaction (raycasting, clicks)

### ui.js
User interface:
- MathQuill matrix input fields
- Control panel event handlers
- Example group library
- Export functionality

### main.js
Application bootstrapping:
- Module imports and initialization
- Global setup for Three.js and CSG
- Animation loop start

## Features

- **Interactive 3D Visualization**: Rotate, zoom, and explore Dirichlet domains
- **Multiple Display Modes**:
  - Dirichlet domain only
  - Full tiling of hyperbolic space
  - Cayley graph overlay
  - Orbit visualization
- **Color Palettes**: UC gradient, B4L logo pattern, Teal-Fuchsia, and more
- **Example Library**: 14 predefined groups including modular group, Apollonian, and more
- **Export Options**: Save images, export to SO(3,1)
- **Click Interaction**: Click walls to see generating matrices

## Usage

Simply open `index.html` in a modern web browser. All dependencies are loaded from CDNs.

## Dependencies

- Three.js r171 - 3D rendering
- three-csg-ts - Constructive solid geometry
- MathQuill - Mathematical formula editing
- MathJax - LaTeX rendering
- math.js - Mathematical expression evaluation
- Tailwind CSS - Styling framework

## Development

The codebase uses ES6 modules. To make changes:

1. Edit the relevant module in `js/`
2. Refresh the browser to see changes
3. No build step required

## Browser Support

Requires a modern browser with support for:
- ES6 modules
- WebGL
- Import maps
