# Dirichlet Polyhedron Viewer: Technical Specification & Implementation Guide

This project is a high-performance, modular web application for the interactive visualization of **Dirichlet fundamental domains** for Kleinian groups acting on hyperbolic 3-space ($\mathbb{H}^3$) using the **Poincaré Upper Half-Space model**.

## 1. Mathematical Foundation

### 1.1 Hyperbolic Geometry ($\mathbb{H}^3$)
The application represents $\mathbb{H}^3$ as the set $\{(x, y, z) \in \mathbb{R}^3 : z > 0\}$. Isometries are given by the action of $PSL(2, \mathbb{C})$ via M\u00f6bius transformations on the boundary $\hat{\mathbb{C}}$ extended to the interior.

- **Action on Basepoint**: The image of the basepoint $o = (0, 0, 1)$ under $m = \begin{pmatrix} a & b \\ c & d \end{pmatrix}$ is calculated as:
  $$m \cdot o = \left( \frac{a\bar{c} + b\bar{d}}{|c|^2 + |d|^2}, \frac{1}{|c|^2 + |d|^2} \right)$$
  In the code, this maps to THREE.js coordinates as $(x, y, z) = (\text{Re}(u), \text{Im}(u), t)$.
- **Hyperbolic Distance**: The distance $d(P, Q)$ between two points in the upper half-space is:
  $$\cosh(d(P, Q)) = 1 + \frac{|P - Q|^2}{2 P_z Q_z}$$
- **Dirichlet Domain**: For a discrete group $\Gamma$ and basepoint $o$, the domain $D(o)$ is:
  $$D(o) = \{ P \in \mathbb{H}^3 : d(P, o) \le d(P, \gamma o) \text{ for all } \gamma \in \Gamma \}$$
  The boundary walls are perpendicular bisectors in the hyperbolic metric, which appear as Euclidean hemispheres centered on the $z=0$ plane or vertical planes.

### 1.2 Algebra
- **$PSL(2, \mathbb{C})$**: Matrices are treated as elements of the Projective Special Linear group, meaning $M \sim -M$. The `geometry.js` module provides a `canonicalizePSL` function to ensure deterministic deduplication.
- **Trace & Type**: The trace $\text{Tr}(M) = a + d$ determines the transformation type:
  - $|\text{Tr}(M)| > 2$: Loxodromic/Hyperbolic (translation along an axis).
  - $|\text{Tr}(M)| < 2$: Elliptic (rotation around an axis).
  - $|\text{Tr}(M)| = 2$: Parabolic (translation fixing a point on the boundary).

## 2. Technical Stack

- **Core**: Vanilla ES6 JavaScript (Modules).
- **Rendering**: **Three.js (r171)** utilizing `WebGLRenderer` with `preserveDrawingBuffer` for screenshots.
- **Math Arithmetic**: 
  - `geometry.js`: Custom `Complex` and `Matrix2` classes.
  - **math.js**: Used for robust expression evaluation of user-inputted strings (e.g., `\sqrt{2}`, `e^{i\pi/3}`).
- **UI & Input**:
  - **MathQuill (0.10.1)**: Provides a "What You See Is What You Get" LaTeX editing experience for matrix entries.
  - **MathJax 3**: Renders static mathematical formulas in the control panel.
  - **Tailwind CSS**: Utility-first styling for the responsive sidebar.
- **Concurrency**: **Web Workers** execute the BFS group expansion and Delaunay neighbor searches to prevent blocking the UI thread during deep word-length explorations.

## 3. Module Architecture

### 3.1 `geometry.js` (Algebraic Core)
- Implements complex multiplication, division, and conjugation.
- Handles matrix inversion via the adjugate formula divided by the determinant.
- **LaTeX Parser**: Converts MathQuill-generated LaTeX (e.g., `\frac{1+\sqrt{3}i}{2}`) into normalized strings for `math.js`.
- **Deduplication**: Generates unique string keys for matrices to prevent redundant computations in the group BFS.

### 3.2 `groups.js` (Hyperbolic Logic)
- **Group Generation**: A Breadth-First Search (BFS) generates all products of generators up to a specified word length.
- **Delaunay Neighbors**: Identifies the "standard generators" (the set of elements whose bisectors form the walls of the Dirichlet domain). It samples points on each bisector and verifies if any other group image is closer.
- **Orbit Calculation**: Maps the group action onto the basepoint to generate the point cloud for the limit set and tiling.

### 3.3 `rendering.js` (3D Visualization)
- **Scene Setup**: Configures a dark-themed environment with an `AmbientLight`, `HemisphereLight`, and multiple `DirectionalLight` sources for vibrant wall colors.
- **Bisector Drawing**:
  - `drawBisector`: Renders spheres (hemispheres) via `SphereGeometry` or `PlaneGeometry` for vertical walls.
  - `drawGeodesicArc`: Draws hyperbolic geodesics as circular arcs or vertical lines.
- **Transparency Optimization**: Implements a manual back-to-front sorting of walls based on camera distance every frame to fix standard WebGL transparency artifacts.
- **Raycasting**: Allows users to click on any polyhedron wall to retrieve the generating matrix and its word representation.

### 3.4 `worker.js` (Background Processing)
- Listens for messages from `ui.js` containing generator matrices and search parameters.
- Re-hydrates plain objects into `Matrix2` instances.
- Returns a serialized bundle of orbit points, limit set projections, wall parameters, and Delaunay edges.

### 3.5 `textures.js` (Aesthetics)
- **Color Palettes**: Includes "UC Blue/Gold", "Teal-Fuchsia", "Luna", and "Leo".
- **Coloring Modes**:
  - `index`: Gradient based on BFS order.
  - `generator`: Color depends on the last generator applied in the word.
  - `alternating`: Sharp contrast between adjacent walls.
- **B4L Texture**: Programmatically generates a quartered-circle logo pattern on a canvas for use as a material map.

## 4. Implementation Details & Nuances

### 4.1 The "Transparency Problem"
Hyperbolic bisectors are often intersecting hemispheres. Standard WebGL depth testing fails with transparency when objects are not rendered in back-to-front order. 
- **Solution**: `rendering.js` implements a custom sorting algorithm in the `animate()` loop. It calculates the squared distance from each wall's world position to the camera, sets `child.renderOrder = 0`, and then sorts the `polyhedronGroup.children` array by distance (descending) before every render call.

### 4.2 Group Canonicalization Bridge
To ensure that $M$ and $-M$ are treated as the same transformation in $PSL(2, \mathbb{C})$, `geometry.js` uses a "first-nonzero" tie-break:
```javascript
const arr = [m.a.re, m.a.im, m.b.re, m.b.im, m.c.re, m.c.im, m.d.re, m.d.im];
// ... identify first v such that |v| > 1e-12. If v < 0, flip sign.
```
This is critical for the BFS queue to terminate and for correctly identifying "Stabilizer" elements.

### 4.3 Delaunay Sampling Algorithm
In `groups.js`, the `computeDelaunayNeighbors` function uses a sampling approach:
1. Sample ~160 points on the candidate bisector using a spherical ring-segment distribution.
2. For each sample point $s$, calculate the hyperbolic distance $d(s, o)$ to the basepoint and $d(s, \gamma o)$ to the image.
3. If $d(s, o) \approx d(s, \gamma o)$ AND no other $\gamma' \in \Gamma$ satisfies $d(s, \gamma' o) < d(s, o)$, the point $s$ is on a face of the fundamental domain.
4. If at least one such $s$ exists, $\gamma$ is identified as a face-pairing transformation (Delaunay neighbor).

### 4.4 UI Bridge: MathQuill to math.js
User input undergoes a three-stage transformation:
1. **MathQuill**: Capture visual LaTeX (e.g., `\frac{1}{2}`).
2. **`latexToExpr`**: Regex-heavy normalization (e.g., `\frac{a}{b} \to (a)/(b)`, `\sqrt{x} \to sqrt(x)`).
3. **`math.evaluate`**: The `evalComplexExpression` function handles the final calculation, converting `math.js` complex objects back to the project's internal `Complex` class.

## 5. Interaction & UI Features

- **Tabbed Sidebar**:
  - **Generators**: Add/remove matrices, adjust word length (1-10+), and select from a library of 14+ predefined groups (e.g., Apollonian Gasket, Figure Eight Knot).
  - **Display**: Toggle the Cayley graph, limit set, orbit points, and the boundary floor ($z \approx 0$).
  - **Appearance**: Adjust wall opacity (0 to 1) via a custom-built, canvas-integrated dragging slider.
- **Stabilizer Search**: Uses `isUnitary` check ($M \in SU(2)$) which verifies columns are orthonormal and $\det(M) \approx 1$.
- **Exporting**: 
  - **SO(3,1)**: Provides a path to relativistic visualization by mapping complex 2x2 matrices to 4x4 Lorentz transformations.
  - **PNG**: Captures a high-resolution screenshot using `toDataURL` from the WebGL context.

## 6. CSS & Design System
- **Glassmorphism**: The control panel uses `backdrop-filter: blur(8px)` and `rgba` backgrounds for a premium, semi-transparent look.
- **Resizable Sidebar**: A custom `resize-handle-bl` allows users to drag-resize the panel width (220px to 640px) and height.
- **Animation**: The "Refresh" icon rotates via a `.spinning` CSS class during worker computations to provide visual feedback.
