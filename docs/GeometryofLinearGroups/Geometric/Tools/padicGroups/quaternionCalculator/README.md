# Quaternion Calculator - General Primes

This tool dynamically computes generators and relations for quaternion groups based on user-specified odd primes, providing a comprehensive set of visualizations for exploration and algorithmic analysis.

## Project Structure

The codebase is organized into modular ES modules, separating mathematical logic from UI and visualization.

### Core Mathematics (located in `/quaternionPackage/`)
- **`projectiveQuaternion.js`**: Core arithmetic library.
  - `QMath`: Low-level quaternion operations (multiply, conjugate, norm).
  - `ProjectiveQuaternion`: Class representing quaternions in projective space ($q \sim \lambda q$).
  - `formatQuaternion`: High-fidelity LaTeX formatting for quaternion expressions.
  - `findXYSolution`: Efficiently finds $x^2 + y^2 \equiv -1 \pmod p$ to establish the bijection with $\mathbb{F}_p\mathbb{P}^1$.
- **`primeQuaternion.js`**: Group-theoretic computation engine.
  - `generateCanonicalGenerators`: Finds the $p+1$ canonical generators for a prime $p$.
  - `createGeneratorObject`: Handles color assignment and labeling for generators and their conjugates.
  - `computeProjectiveRelations`: Discovers commutation relations ($a \cdot b = b' \cdot a'$) in the projective group.
- **`factorization.js`**: Algorithms for quaternion factorization.
  - `computeFactorizationLattice`: Generates the lattice of all possible factorizations for a given quaternion.
  - `calculateTreePath`: Computes the unique non-backtracking path in the Bruhat-Tits tree.
- **`so3z.js`**: Generates elements of the finite group $SO(3, \mathbb{Z})$.

### Visualizations (located in `/vis/`)
- **`vis_generators.js`**: 
  - **Pinwheel Diagrams**: SVG-based displays showing the bijection between $\mathbb{F}_p\mathbb{P}^1$ and the quaternions.
  - **3D Sphere**: Interactive point cloud of generators in space with raycasting selection.
- **`vis_square.js`**: Renders the square complex tiling derived from the commutation relations.
- **`vis_main.js`**: Visualizes the interactive Cayley graph acting on the sphere.
- **`vis_tree.js`**: Generates SVG representations of p-adic trees.
- **`vis_factor.js`**: D3-like force-directed visualization of the factorization lattice.
- **`vis_so3z.js`**: Interactive cube rotation tool for $SO(3, \mathbb{Z})$ elements.

### UI and Orchestration
- **`main.js`**: The central entry point and controller, managing state, event listeners, and data flow between modules.
- **`index.html`**: The main entry point, integrating MathQuill for interactive LaTeX input and MathJax for rendering.

## How It Works

### Canonical Generator Computation

For each odd prime $p$, we find canonical generators using the following mathematical framework:

1. **Four-Square Search**: We find all integer solutions to $a^2 + b^2 + c^2 + d^2 = p$.
2. **Q8 Filtering**: We normalize solutions to ensure a unique representative under the action of the unit group $Q_8$.
3. **P¹(F_p) Bijection**: Each generator is mapped to a point in the projective line over $\mathbb{F}_p$. This is done by representing the quaternion as a $2 \times 2$ matrix modulo $p$ and finding its kernel.
4. **Canonical Choice**: We select representatives such that $a > 0$, $a$ is odd, and $d$ is even where possible.

### Relation Computation

The tool automatically identifies "squares" in the group: pairs $(a, b)$ and $(b', a')$ such that $a \cdot b = b' \cdot a'$ in the projective group. These relations are the building blocks of the **Square Complex**, which is visualized as a grid of commuting squares.

## Interactive Features

- **MathQuill Integration**: All quaternion and prime inputs support real-time LaTeX editing.
- **Dynamic Resizing**: Visualizations automatically scale and respond to window changes.
- **Cross-Module Interaction**: Selecting a generator in the "Generators" section highlights its occurrences in the Cayley graph and the Square Complex.
- **Export/Analysis**: View the P¹ labels and exact integer coordinates for every computed element.

## Usage

1. Serve the directory using a local web server (e.g., `python3 -m http.server`).
2. Enter primes in the input field (e.g., `5, 13`).
3. Explore the resulting visualizations across the collapsible sections.
