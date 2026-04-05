import { C, R } from './config.js';
import { ease, lerp, lerpColor, drawCircle, drawText, drawLine } from './utils.js';

// ═══════════════════════════════════════════════════════════
// SCENE 1: BINARY TREE
// ═══════════════════════════════════════════════════════════
let treeNodes = [], treeEdges = [];

export function buildTree(W, H) {
    treeNodes = []; treeEdges = [];
    const baseSpread = Math.min(140, W * 0.15);
    const dy = Math.min(65, H * 0.12);
    function add(pid, x, y, sp, d, sub) {
        const idx = treeNodes.length;
        treeNodes.push({ x, y, d, sub });
        if (pid >= 0) treeEdges.push([pid, idx]);
        if (d < 3) {
            add(idx, x - sp, y + dy, sp * 0.5, d + 1, sub || 'L');
            add(idx, x + sp, y + dy, sp * 0.5, d + 1, sub || 'R');
        }
    }
    const treeTop = H * 0.18;
    add(-1, W / 2, treeTop, baseSpread, 0, 'root');
}

export function renderTree(ctx, W, H, localStep, t) {
    const e = ease(t);
    const slideX = Math.min(120, W * 0.12);

    // Edges
    for (let ei = 0; ei < treeEdges.length; ei++) {
        const [pi, ci] = treeEdges[ei];
        const pn = treeNodes[pi], cn = treeNodes[ci];
        let px = pn.x, py = pn.y, cx = cn.x, cy = cn.y;
        let alpha = 1;

        if (localStep >= 2) {
            if (pn.sub === 'root') { alpha = 1 - (localStep === 2 ? e : 1); }
            const offL = localStep === 2 ? -slideX * e : -slideX;
            const offR = localStep === 2 ? slideX * e : slideX;
            if (pn.sub === 'L' || (pn.sub === 'root' && cn.sub === 'L')) px += (pn.sub === 'root' ? 0 : offL);
            if (pn.sub === 'R' || (pn.sub === 'root' && cn.sub === 'R')) px += (pn.sub === 'root' ? 0 : offR);
            if (cn.sub === 'L') cx += offL;
            if (cn.sub === 'R') cx += offR;
        }
        if (localStep >= 1) {
            // color is set below per edge
        }
        if (localStep === 1 && t < 1) {
            // hold off coloring during transition
        }

        const lineAlpha = localStep === 1 ? lerp(0.25, 0.5, e) : (alpha > 0.01 ? 0.5 : 0);
        const edgeCol = localStep >= 1
            ? (cn.sub === 'L' ? C.teal : cn.sub === 'R' ? C.rose : C.edge)
            : C.edge;
        drawLine(ctx, px, py, cx, cy, edgeCol, 1.5, lineAlpha * alpha);
    }

    // Nodes
    for (let ni = 0; ni < treeNodes.length; ni++) {
        const nd = treeNodes[ni];
        let x = nd.x, y = nd.y;
        let col = C.nodeBorder;
        let alpha = 1;

        if (localStep >= 1) {
            if (nd.sub === 'root') col = C.warm;
            else if (nd.sub === 'L') col = C.teal;
            else col = C.rose;
        }
        if (localStep === 1 && t < 1) {
            col = lerpColor('#7c8aff', nd.sub === 'root' ? C.warm : nd.sub === 'L' ? C.teal : C.rose, e);
        }

        if (localStep >= 2) {
            if (nd.sub === 'root') {
                alpha = 1 - (localStep === 2 ? e : 1);
            }
            const off = localStep === 2 ? slideX * e : slideX;
            if (nd.sub === 'L') x -= off;
            if (nd.sub === 'R') x += off;
        }

        if (alpha > 0.01) {
            drawCircle(ctx, x, y, R * 0.6, C.node, col, alpha);
        }
    }

    // Step 3: labels
    if (localStep >= 3) {
        const a = localStep === 3 ? e : 1;
        const leftCx = W / 2 - slideX;
        const rightCx = W / 2 + slideX;
        const labelY = treeNodes[0].y - 30;
        drawText(ctx, '≅ T', leftCx, labelY, 20, C.teal, a);
        drawText(ctx, '≅ T', rightCx, labelY, 20, C.rose, a);
        if (t >= 0.4) {
            const fa = ease((t - 0.4) / 0.6);
            const botY = treeNodes[treeNodes.length - 1].y + 50;
            drawText(ctx, 'T  =  T  ⊔  T  ⊔ {pt}', W / 2, botY, 18, C.accent, fa * a);
        }
    }
}
