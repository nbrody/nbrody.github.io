/**
 * shortenWord.js — shorter words for the same elements, checked in the group itself.
 *
 * A dictionary holds the shortest word found for each element in a ball around the identity
 * (breadth-first in the generators and their inverses, up to maxElements). Then a window slides over
 * the word, longest windows first, and replaces a subword by the dictionary's word for the same
 * element whenever that is shorter. Every replacement is an identity in the group (equal keys),
 * so the result is equal to the input; it is checked again at the end.
 *
 * ops: { mul(X, Y), inv(X), key(X) (equal exactly for equal elements, e.g. projectively), one }.
 * Words: letters ±(i+1) for gens[i].
 */
export function makeShortener(gens, ops, { maxElements = 30000, seconds = 1 } = {}) {
    const deadline = Date.now() + 1000 * seconds;
    const letters = gens.flatMap((G, i) => [{ x: i + 1, M: G }, { x: -(i + 1), M: ops.inv(G) }]);
    const best = new Map([[ops.key(ops.one), []]]);
    let frontier = [{ M: ops.one, w: [] }];
    let radius = 0;
    while (frontier.length && best.size < maxElements && Date.now() < deadline) {
        const next = [];
        for (const { M, w } of frontier) for (const { x, M: G } of letters) {
            if (w.length && w[w.length - 1] === -x) continue;
            const N = ops.mul(M, G), k = ops.key(N);
            if (best.has(k)) continue;
            const v = w.concat([x]);
            best.set(k, v);
            next.push({ M: N, w: v });
            if (best.size >= maxElements) break;
        }
        frontier = next;
        radius++;
    }
    const letterMat = new Map(letters.map(({ x, M }) => [x, M]));
    const evalWord = (w) => w.reduce((X, x) => ops.mul(X, letterMat.get(x)), ops.one);
    const freeReduce = (w) => { const o = []; for (const x of w) { if (o.length && o[o.length - 1] === -x) o.pop(); else o.push(x); } return o; };
    /** a shorter word for the same element (never longer); maxWindow bounds the subwords tried */
    const shorten = (w0, { maxWindow = 24, seconds: s2 = 1 } = {}) => {
        const stop = Date.now() + 1000 * s2;
        let w = freeReduce(w0);
        for (let changed = true; changed && Date.now() < stop;) {
            changed = false;
            for (let len = Math.min(maxWindow, w.length); len >= 2 && !changed; len--) {
                // the windows of this length, left to right, with running products
                for (let i = 0; i + len <= w.length; i++) {
                    const sub = w.slice(i, i + len);
                    const rep = best.get(ops.key(evalWord(sub)));
                    if (rep && rep.length < len) {
                        w = freeReduce(w.slice(0, i).concat(rep, w.slice(i + len)));
                        changed = true;
                        break;
                    }
                }
                if (Date.now() > stop) break;
            }
        }
        if (ops.key(evalWord(w)) !== ops.key(evalWord(w0))) throw new Error('internal: the shortened word is a different element');
        return w;
    };
    return { shorten, size: best.size, radius };
}
