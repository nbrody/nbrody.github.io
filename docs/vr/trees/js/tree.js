/** A finite patch of the tree of hyperbolic planes, using the desktop viewer's exact frame and action engines. */
import { baseDiskSet, diskSet, B, fmt } from '../../../GeometryofLinearGroups/Algebraic/Tools/2dimFields/js/farey.js';
import { rootFrame, standardFrame, frameAt } from '../../../GeometryofLinearGroups/Algebraic/Tools/2dimFields/js/layout.js';
import { L } from '../../../GeometryofLinearGroups/Algebraic/Tools/2dimFields/js/laurent.js';
import { Q } from '../../../GeometryofLinearGroups/Algebraic/Tools/2dimFields/js/rational.js';
import { localMap, cuspKey } from '../../../GeometryofLinearGroups/Algebraic/Tools/2dimFields/js/treeAction.js';

export { B, fmt, baseDiskSet, diskSet };
const Z=L.ZERO, O=L.ONE, M=L.of(Q.int(-1)), t=L.of(Q.ONE,-1);
export const actions={S:[Z,M,O,Z], T:[O,O,Z,O], U:[O,t,Z,O]};
export const labelText = labels => labels.length ? labels.map(cuspKey).join(' → ') : 'v₀';
export function applyAction(key, labels) { return localMap(actions[key], labels).labels; }
export function getFrame(labels, settings) { return frameAt(labels, settings).F; }
// Breadth-first so that a finite budget does not consume one branch first.
export function buildTree(settings, cap=160, minRadius=.025) {
    const recs=[{F:rootFrame(settings),labels:[],parent:-1,gap:0,depth:0}], queue=[0];
    let truncated=false;
    for(let qi=0;qi<queue.length;qi++) {
        const parent=queue[qi], rec=recs[parent];
        if(rec.depth>=settings.depth)continue;
        const kids=(rec.depth===0 ? baseDiskSet(settings.N):diskSet(settings.N)).v;
        for(const [p,q] of kids) {
            const labels=[...rec.labels,[BigInt(p),BigInt(q)]];
            const {F,gap}=standardFrame(rec.F,p,q,settings);
            if(F.R<minRadius)continue;
            if(recs.length>=cap){truncated=true;break;}
            recs.push({F,labels,parent,gap,depth:rec.depth+1});queue.push(recs.length-1);
        }
        if(truncated)break;
    }
    return {recs,truncated};
}
