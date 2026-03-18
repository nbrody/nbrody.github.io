self.onmessage = function (e) {
    const { board, solverClass } = e.data;
    // We can't pass classes easily, so we'll just implement the logic here
    // or re-import it if it were a local server.
    // For now, let's assume we implement BFS here.

    const startTime = performance.now();
    const solution = solve(board);
    const endTime = performance.now();

    self.postMessage({ solution, time: endTime - startTime });
};

function solve(board) {
    // BFS solving logic...
    return null; // Placeholder
}
