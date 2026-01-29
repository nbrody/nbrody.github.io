# Gecko Out Solver Implementation Plan

Building an automated Geck Out solver that takes a screenshot as input.

## Phase 1: Core Engine & Visuals
- Create a grid-based representation of the board.
- Implement gecko movement (snaking/slithering forward/backward).
- Add support for obstacles and matching holes.
- Build a premium UI using glassmorphism and smooth animations.

## Phase 2: Vision System
- Implement a canvas-based image analyzer.
- Detect grid dimensions and alignment from the screenshot.
- Sample colors to identify geckos and holes.
- Provide a "correction" UI for the user to tweak the parsed grid.

## Phase 3: AI Solver
- Implement BFS (Breadth-First Search) to find the shortest path of moves.
- Define the state as a serializable representation of all gecko positions.
- Add an "Auto-Play" mode that executes the solver's steps.

## Phase 5: Advanced Mechanics (Implemented)
- **Moving Holes (Ropes)**: Support for geckos that drag holes behind them on a rope. The hole moves as the gecko slithers.
- **Nested Geckos (Matryoshka)**: Geckos that contain another gecko inside. Solving the outer gecko reveals the inner one.
- **Dynamic Board State**: Geckos and temporary holes now disappear upon completion, opening up new paths.
- **Visual Enhancements**: Ropes are drawn as dashed lines, and nested geckos show their internal colors.
