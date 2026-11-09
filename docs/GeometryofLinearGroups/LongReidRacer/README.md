# Long–Reid Racer

Drive through a Cayley graph for the Long–Reid group, searching for an integral matrix of infinite order. The game uses exact arithmetic over ℤ[1/6]; its displayed height is the sum of the exponents in a minimal common denominator.

A win requires a determinant-one integral matrix other than ±I whose trace has absolute value at least 2. This includes nontrivial parabolics with trace ±2. The built-in 82-move route is checked in the test suite.

Controls: WASD or arrow keys to move, Down to undo, R to restart, P or comma to step the route, and ! to autoplay. Touch controls are available.

The MathFest iframe sends same-origin parent messages `{type: 'tutorial', cmd: 'next' | 'prev' | 'reset' | 'autoplay'}`. It can start the game, step or undo the route, reset, and autoplay. The historic Cayley visualization remains available at `legacy-cayley/`.

Run `node tests/verify.mjs` and `node tests/verify-mathfest.cjs` to check the arithmetic and talk controls.
