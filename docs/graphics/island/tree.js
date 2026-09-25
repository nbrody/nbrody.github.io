// Tree geometry is isolated here so the future island shader can reuse treeField.
export const treeGLSL = `
uniform float uHeight, uRadius, uSpread, uAmplitude, uFrequency, uDetail;
uniform int uStage, uSpecies, uBranchCount, uCrownCount;
uniform vec4 uBranchA[24], uBranchB[24], uCrown[16], uCrownR[16];
uniform float uBranchBound, uSkeleton;
float capsule(vec3 p, vec3 a, vec3 b, float r) {
    vec3 pa=p-a, ba=b-a;
    return length(pa-ba*clamp(dot(pa,ba)/dot(ba,ba),0.,1.))-r;
}
// Polynomial smooth minimum (Inigo Quilez).
float smin(float a,float b,float k) {
    float h=max(k-abs(a-b),0.)/k;
    return min(a,b)-h*h*k*.25;
}
float waves(vec3 p,float f) {
    return (sin(f*p.x+.5)*sin(f*p.y)*sin(f*p.z+1.)
        +.5*sin(f*1.93*p.x-1.)*sin(f*1.93*p.y+.7)*sin(f*1.93*p.z)) / 1.5;
}
// x = field value, y = foliage material weight.
vec2 studyField(vec3 p) {
    float trunk=capsule(p,vec3(0.,.13,0.),vec3(0.,uHeight+.25,0.),.13);
    vec3 center=vec3(0.,uHeight+uRadius*.65,0.);
    float crown=length(p-center)-uRadius;
    if(uStage>=1) {
        for(int i=0;i<5;i++) {
            float angle=float(i)*2.39996;
            vec3 tip=vec3(cos(angle)*uSpread,uHeight+.15+float(i)*.14,sin(angle)*uSpread);
            trunk=smin(trunk,capsule(p,vec3(0.,uHeight*.55,0.),tip,.065),.12);
            crown=smin(crown,length(p-tip-vec3(0.,uRadius*.35,0.))-uRadius*.68,.22);
        }
    }
    if(uStage>=2) crown+=uAmplitude*waves(p,uFrequency);
    if(uStage>=3) crown=100.;
    if(uSkeleton>.5) return vec2(trunk,0.);
    return vec2(min(trunk,crown),step(crown,trunk));
}
// Ellipsoid lower distance bound; each radius remains strictly positive.
float ellipsoid(vec3 p,vec3 radii) {
    return (length(p/radii)-1.)*min(radii.x,min(radii.y,radii.z));
}
vec2 treeField(vec3 p) {
    if(uSpecies==0) return studyField(p);
    float wood=100., crown=100.;
    for(int i=0;i<24;i++) {
        if(i>=uBranchCount) break;
        vec3 a=uBranchA[i].xyz,b=uBranchB[i].xyz,ba=b-a;
        float t=clamp(dot(p-a,ba)/max(dot(ba,ba),.000001),0.,1.);
        float d=length(p-a-ba*t)-mix(uBranchA[i].w,uBranchB[i].w,t);
        wood=min(wood,d);
    }
    if(uSkeleton<.5) for(int i=0;i<16;i++) {
        if(i>=uCrownCount) break;
        vec3 q=p-uCrown[i].xyz;
        float angle=uCrown[i].w,c=cos(angle),s=sin(angle);
        q.xz=mat2(c,-s,s,c)*q.xz;
        crown=smin(crown,ellipsoid(q,uCrownR[i].xyz),.055);
    }
    if(uStage>=2) crown+=uAmplitude*waves(p,uFrequency);
    if(uStage>=3) crown=100.;
    return vec2(min(wood,crown),step(crown,wood));
}
// Lipschitz upper bound for the added trigonometric displacement gradients.
float treeStepBound() {
    return max(1.,uBranchBound)+(uStage==2 ? 2.27*uAmplitude*uFrequency : 0.);
}
`;
