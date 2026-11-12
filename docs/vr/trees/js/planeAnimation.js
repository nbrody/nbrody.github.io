/** Whole-tree action for the rational-field VR viewer.
 *
 * The layout and exact tree action are shared with the desktop 2dimFields
 * explorer.  A moving child rides its parent's changing cusp; vertices on the
 * action's spine interpolate between their old and new frames.  Each record's
 * C is the local Möbius map carrying its Farey decoration, not merely a rigid
 * rotation of its disk.
 */
import { mmul, adj, IDENTITY, isScalar, normalizePGL } from '../../../GeometryofLinearGroups/Algebraic/Tools/2dimFields/js/laurent.js';
import { frameOf, vertexOf, localMap, keyOf, isPrefix, toFloat, fmul, finv, fdet, fnorm, RHO, mobiusPath } from '../../../GeometryofLinearGroups/Algebraic/Tools/2dimFields/js/treeAction.js';
import { frameAt, lerpFrame, standardChild, edgeGap, edgeSign, childFrame, scaleOf } from '../../../GeometryofLinearGroups/Algebraic/Tools/2dimFields/js/layout.js';

const ID = [1, 0, 0, 1];
const clamp = n => Math.max(0, Math.min(1, n));
export const easePlane = t => { const s=clamp(t);return s<.5 ? 2*s*s : 1-(-2*s+2)**2/2; };
/** Transform an exact/rational cusp by a real projective matrix. */
export function mapPlaneCusp(C, p, q) {
    C = C || ID; p=Number(p); q=Number(q);
    return [C[0]*p+C[1]*q, C[2]*p+C[3]*q];
}
function decorAt(labels,current) {
    if (isScalar(current)) return ID;
    const { h }=localMap(adj(current),labels);
    return fnorm(finv(toFloat(h)));
}
/** Attach the already accumulated action to a newly rebuilt finite patch. */
export function decoratePlaneRecords(recs,current=IDENTITY) {
    return recs.map(r=>({...r,C:decorAt(r.labels,current)}));
}
/**
 * @param {{recs: Array, settings: Object, matrix: Array, current?: Array}} options
 * @returns {{at: function(number): Array, current: Array, count: number}}
 * t is linear time in [0,1], internally eased. Each returned record describes
 * a moving source plane and contains F, gap, labels, imageLabels, depth, C.
 */
export function createPlaneAnimation({recs,settings,matrix,current=IDENTITY}) {
    if(settings.base!=='disk') throw new Error('VR plane animation requires disk layout');
    const inverse=adj(matrix), items=new Map(), cache=new Map();
    const add=labels=>{const key=keyOf(labels);if(!items.has(key))items.set(key,{labels,key});};
    // Include visible planes and planes about to arrive in the visible patch.
    for(const r of recs)add(r.labels);
    for(const r of recs)add(vertexOf(mmul(inverse,frameOf(r.labels))));
    const spine=vertexOf(inverse);
    for(const it of items.values()){
        const {labels:image,h}=localMap(matrix,it.labels), hf=toFloat(h), flip=fdet(hf)<0;
        it.imageLabels=image;it.depth=it.labels.length;it.flip=flip;
        it.path=mobiusPath(flip?fmul(RHO,hf):hf);it.decor=decorAt(it.labels,current);
        const a=frameAt(it.labels,settings,cache),b=frameAt(image,settings,cache);
        it.F0=a.F;it.F1=b.F;it.gap0=a.gap;it.gap1=b.gap;it.spine=isPrefix(it.labels,spine);
        if(it.spine)continue;
        it.parentKey=keyOf(it.labels.slice(0,-1));
        const [p,q]=it.labels[it.labels.length-1].map(Number),[p1,q1]=image[image.length-1].map(Number);
        const c0=standardChild(frameAt(it.labels.slice(0,-1),settings,cache).F,p,q,settings);
        const c1=standardChild(frameAt(image.slice(0,-1),settings,cache).F,p1,q1,settings);
        Object.assign(it,{cusp:[p,q],sig0:c0.sigma,sig1:c1.sigma,ell0:c0.ell,ell1:c1.ell,sg0:edgeSign(it.labels,settings),sg1:edgeSign(image,settings)});
    }
    const order=[...items.values()].sort((a,b)=>a.depth-b.depth);
    // A finite patch can omit a parent of an incoming plane. Fly that root of
    // the clipped branch between frames instead of referring to a missing node.
    for(const it of order)if(!it.spine&&!items.has(it.parentKey))it.spine=true;
    return {
        current:normalizePGL(mmul(matrix,current)),
        count:order.length,
        at(t){
            const e=easePlane(t),frames=new Map(),out=[];
            for(const it of order){
                let F,gap;
                if(it.spine){F=lerpFrame(it.F0,it.F1,e);gap=it.gap0+(it.gap1-it.gap0)*e;}
                else {
                    const parent=frames.get(it.parentKey),H=items.get(it.parentKey).Hs;
                    const [p,q]=mapPlaneCusp(H,...it.cusp);
                    const sig=Math.exp(Math.log(it.sig0)+(Math.log(it.sig1)-Math.log(it.sig0))*e);
                    gap=(it.sg0+(it.sg1-it.sg0)*e)*edgeGap(it.ell0+(it.ell1-it.ell0)*e,scaleOf(parent),settings);
                    F=childFrame(parent,p,q,sig*scaleOf(parent),gap);
                }
                if(it.flip)F={...F,flip:Math.PI*e};
                it.Hs=it.path(e);frames.set(it.key,F);
                out.push({F,gap,labels:it.labels,imageLabels:it.imageLabels,depth:it.depth,targetDepth:it.imageLabels.length,colorMix:e,C:fmul(it.Hs,it.decor)});
            }
            return out;
        },
    };
}
