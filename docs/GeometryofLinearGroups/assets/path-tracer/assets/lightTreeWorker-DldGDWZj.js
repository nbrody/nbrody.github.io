(function() {
  "use strict";
  const BVH_BINS = 12;
  function buildBVHCore(boxes, n, opts) {
    const { leafSize, weights, alwaysSplit = false, depthCap } = opts;
    const cx = new Float32Array(n), cy = new Float32Array(n), cz = new Float32Array(n);
    for (let t = 0; t < n; t++) {
      cx[t] = (boxes[6 * t] + boxes[6 * t + 3]) * 0.5;
      cy[t] = (boxes[6 * t + 1] + boxes[6 * t + 4]) * 0.5;
      cz[t] = (boxes[6 * t + 2] + boxes[6 * t + 5]) * 0.5;
    }
    const centroidOf = (a) => a === 0 ? cx : a === 1 ? cy : cz;
    const order = new Uint32Array(n);
    for (let i = 0; i < n; i++) order[i] = i;
    let nodeCount = 0;
    const bounds = new Float64Array(6);
    const cb = new Float64Array(6);
    const acc = new Float64Array(6);
    const binBox = new Float64Array(3 * BVH_BINS * 6);
    const binCnt = new Int32Array(3 * BVH_BINS);
    const binW = new Float64Array(3 * BVH_BINS);
    const leftArea = new Float32Array(BVH_BINS - 1), rightArea = new Float32Array(BVH_BINS - 1);
    const leftCnt = new Int32Array(BVH_BINS - 1), rightCnt = new Int32Array(BVH_BINS - 1);
    const leftW = new Float64Array(BVH_BINS - 1), rightW = new Float64Array(BVH_BINS - 1);
    let maxDepth = 0;
    const resetBox = (b, at) => {
      b[at] = Infinity;
      b[at + 1] = Infinity;
      b[at + 2] = Infinity;
      b[at + 3] = -Infinity;
      b[at + 4] = -Infinity;
      b[at + 5] = -Infinity;
    };
    const growBox = (b, at, src, sat) => {
      for (let a = 0; a < 3; a++) {
        if (src[sat + a] < b[at + a]) b[at + a] = src[sat + a];
        if (src[sat + 3 + a] > b[at + 3 + a]) b[at + 3 + a] = src[sat + 3 + a];
      }
    };
    const area = (b, at) => {
      const dx = b[at + 3] - b[at], dy = b[at + 4] - b[at + 1], dz = b[at + 5] - b[at + 2];
      if (dx < 0 || dy < 0 || dz < 0) return 0;
      return 2 * (dx * dy + dy * dz + dz * dx);
    };
    const ceilLog2 = (c) => c <= 1 ? 0 : 32 - Math.clz32(c - 1);
    const emit = (start, end, depth, lo, hi) => {
      if (depth > maxDepth) maxDepth = depth;
      const nodeIdx = nodeCount++;
      resetBox(bounds, 0);
      resetBox(cb, 0);
      let w = 0;
      for (let i = start; i < end; i++) {
        const t = order[i];
        const at = 6 * t;
        if (boxes[at] < bounds[0]) bounds[0] = boxes[at];
        if (boxes[at + 1] < bounds[1]) bounds[1] = boxes[at + 1];
        if (boxes[at + 2] < bounds[2]) bounds[2] = boxes[at + 2];
        if (boxes[at + 3] > bounds[3]) bounds[3] = boxes[at + 3];
        if (boxes[at + 4] > bounds[4]) bounds[4] = boxes[at + 4];
        if (boxes[at + 5] > bounds[5]) bounds[5] = boxes[at + 5];
        if (cx[t] < cb[0]) cb[0] = cx[t];
        if (cx[t] > cb[3]) cb[3] = cx[t];
        if (cy[t] < cb[1]) cb[1] = cy[t];
        if (cy[t] > cb[4]) cb[4] = cy[t];
        if (cz[t] < cb[2]) cb[2] = cz[t];
        if (cz[t] > cb[5]) cb[5] = cz[t];
        if (weights !== void 0) w += weights[t];
      }
      const count = end - start;
      const makeLeaf = () => {
        opts.emitLeaf(nodeIdx, start, count, bounds[0], bounds[1], bounds[2], bounds[3], bounds[4], bounds[5], w, lo, hi, order);
        return nodeIdx;
      };
      if (count <= leafSize) return makeLeaf();
      const balancedOnly = depth + ceilLog2(count) >= depthCap;
      let bestAxis = -1, bestSplit = -1, bestCost = Infinity;
      const v0 = cb[3] - cb[0] >= 1e-12, v1 = cb[4] - cb[1] >= 1e-12, v2 = cb[5] - cb[2] >= 1e-12;
      if (!balancedOnly && (v0 || v1 || v2)) {
        const s0 = v0 ? BVH_BINS / (cb[3] - cb[0]) : 0;
        const s1 = v1 ? BVH_BINS / (cb[4] - cb[1]) : 0;
        const s2 = v2 ? BVH_BINS / (cb[5] - cb[2]) : 0;
        const lo0 = cb[0], lo1 = cb[1], lo2 = cb[2];
        for (let b = 0; b < 3 * BVH_BINS; b++) {
          resetBox(binBox, 6 * b);
          binCnt[b] = 0;
          binW[b] = 0;
        }
        for (let i = start; i < end; i++) {
          const tri = order[i];
          const at = 6 * tri;
          const bx0 = boxes[at], bx1 = boxes[at + 1], bx2 = boxes[at + 2];
          const bx3 = boxes[at + 3], bx4 = boxes[at + 4], bx5 = boxes[at + 5];
          for (let axis = 0; axis < 3; axis++) {
            let b;
            if (axis === 0) {
              if (!v0) continue;
              b = Math.floor((cx[tri] - lo0) * s0);
            } else if (axis === 1) {
              if (!v1) continue;
              b = Math.floor((cy[tri] - lo1) * s1);
            } else {
              if (!v2) continue;
              b = Math.floor((cz[tri] - lo2) * s2);
            }
            if (b < 0) b = 0;
            if (b >= BVH_BINS) b = BVH_BINS - 1;
            const slot = axis * BVH_BINS + b;
            binCnt[slot]++;
            binW[slot] += weights !== void 0 ? weights[tri] : 1;
            const bt = 6 * slot;
            if (bx0 < binBox[bt]) binBox[bt] = bx0;
            if (bx1 < binBox[bt + 1]) binBox[bt + 1] = bx1;
            if (bx2 < binBox[bt + 2]) binBox[bt + 2] = bx2;
            if (bx3 > binBox[bt + 3]) binBox[bt + 3] = bx3;
            if (bx4 > binBox[bt + 4]) binBox[bt + 4] = bx4;
            if (bx5 > binBox[bt + 5]) binBox[bt + 5] = bx5;
          }
        }
        for (let axis = 0; axis < 3; axis++) {
          if (axis === 0 ? !v0 : axis === 1 ? !v1 : !v2) continue;
          const base = axis * BVH_BINS;
          resetBox(acc, 0);
          let accCnt = 0;
          let accW = 0;
          for (let b = 0; b < BVH_BINS - 1; b++) {
            growBox(acc, 0, binBox, 6 * (base + b));
            accCnt += binCnt[base + b];
            accW += binW[base + b];
            leftArea[b] = area(acc, 0);
            leftCnt[b] = accCnt;
            leftW[b] = accW;
          }
          resetBox(acc, 0);
          accCnt = 0;
          accW = 0;
          for (let b = BVH_BINS - 1; b > 0; b--) {
            growBox(acc, 0, binBox, 6 * (base + b));
            accCnt += binCnt[base + b];
            accW += binW[base + b];
            rightArea[b - 1] = area(acc, 0);
            rightCnt[b - 1] = accCnt;
            rightW[b - 1] = accW;
          }
          for (let b = 0; b < BVH_BINS - 1; b++) {
            if (leftCnt[b] === 0 || rightCnt[b] === 0) continue;
            const cost = leftArea[b] * leftW[b] + rightArea[b] * rightW[b];
            if (cost < bestCost) {
              bestCost = cost;
              bestAxis = axis;
              bestSplit = b;
            }
          }
        }
      }
      if (!alwaysSplit) {
        const leafCost = area(bounds, 0) * (weights !== void 0 ? w : count);
        if (bestAxis === -1 || bestCost >= leafCost) return makeLeaf();
      }
      let mid = -1;
      if (bestAxis !== -1) {
        const plo = cb[bestAxis], scale = BVH_BINS / (cb[3 + bestAxis] - cb[bestAxis]);
        const cen = centroidOf(bestAxis);
        let m = start;
        for (let i = start; i < end; i++) {
          const tri = order[i];
          let b = Math.floor((cen[tri] - plo) * scale);
          if (b < 0) b = 0;
          if (b >= BVH_BINS) b = BVH_BINS - 1;
          if (b <= bestSplit) {
            const tmp = order[i];
            order[i] = order[m];
            order[m] = tmp;
            m++;
          }
        }
        if (m > start && m < end) mid = m;
      }
      if (mid === -1) {
        {
          const ext0 = cb[3] - cb[0], ext1 = cb[4] - cb[1], ext2 = cb[5] - cb[2];
          const axis = ext0 >= ext1 && ext0 >= ext2 ? 0 : ext1 >= ext2 ? 1 : 2;
          const cen = centroidOf(axis);
          const slice = Array.from(order.subarray(start, end));
          slice.sort((a, b) => cen[a] - cen[b]);
          order.set(slice, start);
        }
        mid = start + end >> 1;
      }
      const minx = bounds[0], miny = bounds[1], minz = bounds[2];
      const maxx = bounds[3], maxy = bounds[4], maxz = bounds[5];
      const rlo = depth < 24 ? lo | 1 << depth : lo;
      const rhi = depth < 24 ? hi : hi | 1 << depth - 24;
      emit(start, mid, depth + 1, lo, hi);
      const rightIdx = emit(mid, end, depth + 1, rlo, rhi);
      opts.emitInternal(nodeIdx, bestAxis, rightIdx, minx, miny, minz, maxx, maxy, maxz, w);
      return nodeIdx;
    };
    if (n > 0) emit(0, n, 0, 0, 0);
    return { order, nodeCount, maxDepth };
  }
  function bvhNodeBound(n) {
    return n > 0 ? 2 * n - 1 : 0;
  }
  const LIGHT_TREE_MAX_DEPTH = 48;
  function buildLightTree(boxes, powers, n) {
    if (n === 0) return { nodes: new Float32Array(0), nodeCount: 0, trails: new Float32Array(0), maxDepth: 0 };
    const nodes = new Float32Array(8 * bvhNodeBound(n));
    const trails = new Float32Array(4 * n);
    const { nodeCount, maxDepth } = buildBVHCore(boxes, n, {
      leafSize: 1,
      weights: powers,
      alwaysSplit: true,
      depthCap: LIGHT_TREE_MAX_DEPTH,
      fallback: "sorted-median",
      emitLeaf: (ni, start, _count, mnx, mny, mnz, mxx, mxy, mxz, phi, lo, hi, order) => {
        const light = order[start];
        nodes[ni * 8 + 0] = mnx;
        nodes[ni * 8 + 1] = mny;
        nodes[ni * 8 + 2] = mnz;
        nodes[ni * 8 + 3] = phi;
        nodes[ni * 8 + 4] = mxx;
        nodes[ni * 8 + 5] = mxy;
        nodes[ni * 8 + 6] = mxz;
        nodes[ni * 8 + 7] = -(light + 1);
        trails[light * 4] = lo;
        trails[light * 4 + 1] = hi;
      },
      emitInternal: (ni, _axis, rightIdx, mnx, mny, mnz, mxx, mxy, mxz, phi) => {
        nodes[ni * 8 + 0] = mnx;
        nodes[ni * 8 + 1] = mny;
        nodes[ni * 8 + 2] = mnz;
        nodes[ni * 8 + 3] = phi;
        nodes[ni * 8 + 4] = mxx;
        nodes[ni * 8 + 5] = mxy;
        nodes[ni * 8 + 6] = mxz;
        nodes[ni * 8 + 7] = rightIdx;
      }
    });
    return { nodes, nodeCount, trails, maxDepth };
  }
  function answerWorkerTask(task) {
    const scope = self;
    try {
      const { result, transfers } = task();
      scope.postMessage(result, transfers);
    } catch (err) {
      scope.postMessage({ workerError: err instanceof Error ? err.message : String(err) });
    }
  }
  self.onmessage = (e) => answerWorkerTask(() => {
    const { boxes, powers, n } = e.data;
    const tree = buildLightTree(boxes, powers, n);
    return { result: tree, transfers: [tree.nodes.buffer, tree.trails.buffer] };
  });
})();
