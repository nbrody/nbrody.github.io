//#define DEMO_MODE 1

#define PQR ivec2(0,0)
#define MOUSE ivec2(0,1)
#define GENERATOR ivec2(0,2)
#define STYLE ivec2(0,3)
#define SCROLL ivec2(0,4)
#define TIME ivec2(0,5)

#define STYLE_DRAW_GENERATOR  1
#define STYLE_DRAW_POLYGONS   2
#define STYLE_DRAW_TRIANGLES  4
#define STYLE_SHADE_TRIANGLES 8
#define STYLE_COLOR_BY_REGION 16

#define LOADC(c, var) texelFetch(c, var, 0)
#define LOAD(var) texelFetch(iChannel0, var, 0)

#define PCOLOR vec3(1, 0, 0)
#define QCOLOR vec3(1, 1, 0)
#define RCOLOR vec3(0, 0, 1)

#define BLACK vec3(0)
#define GRAY vec3(.5)
#define LIGHTGRAY vec3(.8)
#define WHITE vec3(1)


#define PI 3.141592653589793

#define MIN_PQR 2.
#define MAX_PQR 9.

const vec4 NO_INTERSECT = vec4(-1e5);

const float TOL = 1e-3;
const float TOL_SQR = TOL*TOL;

const float SNAP_TOL = 12.0;

//////////////////////////////////////////////////
// drawing globals

vec2 theResolution; 

float px;
float perpSize;

float textSize;
float pointSize;
float insetSize;
float iconSize;

vec2 sceneCenter;
vec4 insetBox;
vec2 textCenter;
vec2 iconCenter;

//////////////////////////////////////////////////
// triangle globals

vec3 pqr;     
vec2 verts[7];  // 0,1,2 are triangle vertices near origin; 3,4,5,6 are special points

vec3 edges[3];
vec2 generator;

vec3 perps[3];

mat2 insetR; 
vec3 insetOffsetPx;

vec2 insetVerts[7];

//////////////////////////////////////////////////
// setup transforms and sizes

void setupScene(vec2 res) {
        
    const float diam = 2.0;
        
    theResolution = res;

    float rmax = max(res.x, res.y);
    float rmin = min(res.x, res.y);

    float csize = (rmin * 0.98);
    
    insetSize = 0.5*(rmax - csize);

    if (res.x > res.y) {
        insetBox = vec4(0.5*insetSize);
        textCenter = vec2(0.5*insetSize, 0.5*res.y);
    } else {
        insetBox = vec4(res-vec2(0.5*insetSize), vec2(0.5*insetSize));
        textCenter = vec2(0.5*res.x, res.y-0.5*insetSize);
    }

    iconCenter = vec2(0.5*insetSize, res.y-0.5*insetSize);
    
    textSize = insetSize * 0.2;
        
    px = diam / csize;
    pointSize = max(0.025, 4.0 * px);
    perpSize = textSize * px;
    
    iconSize = insetSize * 0.08;

}

// scene coords + pixel size from fragment
vec3 sceneFromFrag(vec2 frag) {
    return vec3((frag.xy - 0.5*theResolution) * px, px);
}

// distance to 2D box given by (ctr, radius)
float boxDist(vec2 p, vec4 b) {
    
    p = abs(p - b.xy) - b.zw;
    return max(p.x, p.y);
    
}

// box for icon in grid
vec4 iconUIBox(ivec2 idx) {
    
    vec2 iconCtr = iconCenter;
    
    iconCtr = floor(iconCtr+0.5);
    
    vec2 scl = vec2(2.5*iconSize, 3.*iconSize);
    iconCtr += vec2(float(idx.x), float(-idx.y))*scl + vec2(-1.5, 0.5)*scl; 
    
    return vec4(iconCtr, vec2(iconSize));
    
}

// box for digit in triplet
vec4 digitUIBox(int idx) {
    
    const vec2 digitRad = vec2(0.35, 0.5);
    
    return vec4(textCenter.x + (float(idx - 1))*textSize,
                textCenter.y,
                digitRad*textSize);

}

// box for triangle above digit
vec4 triUIBox(int idx, float delta) {
    
    return vec4(digitUIBox(idx).xy + vec2(0, 0.9*delta*textSize), 
                0.4*textSize, 0.3*textSize);
    
}

//////////////////////////////////////////////////
// geometric utility functions

// are two points on the same diameter of the unit circle?
bool alongDiameter(vec2 p, vec2 q) {
   
    vec4 pq = abs(vec4(p, q));
    float m = max(max(pq.x, pq.y), max(pq.z, pq.w));
    
    float k = abs(p.x*q.y - p.y*q.x);
    
    return k < TOL*m;
    
}

// are two points the same length?
bool sameLength(float pp, float qq) {
    return abs(pp - qq) < TOL*max(pp, qq);
}

// rotate by 90 degrees
vec2 perp(vec2 p) {
    return vec2(-p.y, p.x);
}

// circle centered at center containing point p
vec3 compass2D(vec2 ctr, vec2 p) {
    vec2 diff = p - ctr;
    return vec3(ctr, dot(diff, diff));
}

// Construction 1.2: invert a point through a circle
vec2 invertPC(vec2 p, vec3 c) {
    vec2 po = p - c.xy;    
    return c.xy + po * c.z / dot(po, po);
}

//////////////////////////////////////////////////
// hyperbolic geometry functions

// distance from a point to a line or circle
float geodesicDist(vec3 l, vec2 p) {
	if (l.z > 0.0) {
		return length(p-l.xy) - sqrt(l.z);
	} else {
		return dot(normalize(l.xy), p);
	}
}

// return the point of the pair with the smaller norm
vec3 smaller(vec4 ab) {
    return vec3(dot(ab.xy, ab.xy) < dot(ab.zw, ab.zw) ? ab.xy : ab.zw,
                ab == NO_INTERSECT ? 0 : 1);
}

// intersection of a circle with a line thru the origin perpendicular
// to normal n (must be a unit vector)
vec4 intersectCL(vec3 c, vec2 n) {

    float d = dot(n, c.xy);
    vec2 p = c.xy - d * n;
    
    float d2 = d*d;
    
    if (d2 >= c.z) {
        return NO_INTERSECT;
    }
    
    vec2 t = perp(n);
    
    float a = sqrt(c.z - d2);
    
    return vec4(p + a*t, p - a*t);
    
}

// intersection of two circles
vec4 intersectCC(vec3 c1, vec3 c2) {
    
    vec2 diff = c2.xy - c1.xy;
    
    float d2 = dot(diff, diff);
    float d2inv = 1.0/d2;

    vec2 n = perp(diff);

    float ad = 0.5*(c1.z - c2.z + d2);

    float a2 = ad*ad*d2inv;
    
    if (c1.z < a2) {
        return NO_INTERSECT;
    }

    float h = sqrt((c1.z - a2)*d2inv);

    vec2 mid = c1.xy + (ad*d2inv)*diff;
    
    return vec4(mid + h*n, mid - h*n);
    
}

// intersection of two geodesics
vec3 intersectGG(vec3 c1, vec3 c2) {
    if (c1.z == 0.) {
        if (c2.z == 0.) {
            return vec3(0, 0, 1);
        } else {
            return smaller(intersectCL(c2, c1.xy));
        }
    } else if (c2.z == 0.) {
        return smaller(intersectCL(c1, c2.xy));
    } else {
        return smaller(intersectCC(c1, c2));
    }
}


// special case of Construction 1.6 for unit circle
vec3 geodesicFromPole(vec2 p) {
    float h2 = dot(p, p);
    float r2 = (h2 - 1.);
    return vec3(p, r2);
}

// Polar of a point p about the unit circle
// 2D line passing thru the midpoint of p and its inverse, perp. to p.
vec3 polarFromPoint(vec2 p) {
    return vec3(p, -0.5*dot(p, p) - 0.5);
}

// invert point about geodesic (either arc or line)
vec2 reflectPG(vec2 p, vec3 c) {
    if (c.z == 0.) {
        return p - (2.*dot(p, c.xy))*c.xy;
    } else {
        return invertPC(p, c);
    }
}

// Construction 2.2: geodesic from polars of points
vec3 geodesicFromPoints(vec2 p, vec2 q) {
    
    if (alongDiameter(p, q)) {
        vec2 n = normalize(perp(p - q));
        return vec3(n, 0);
    }

    vec3 ppolar = polarFromPoint(p);
    vec3 qpolar = polarFromPoint(q);
    vec3 inter = cross(ppolar, qpolar);

    return compass2D(inter.xy/inter.z, p);
    
}

// Construction 3.4: geodesic from point & direction
vec3 geodesicFromPointDir(vec2 p, vec2 d) {
    
    if (alongDiameter(p, d)) {
        return vec3(normalize(perp(d)), 0);
    } 
        
    vec3 ppolar = polarFromPoint(p);
    vec3 l = vec3(d, -dot(d, p));
    
    vec3 pinter = cross(ppolar, l);
    
    return geodesicFromPole(pinter.xy/pinter.z);
    
}   

// return the geodesic passing through p that is perpendicular to g
vec3 geodesicPerpThruPoint(vec3 g, vec2 p) {

    if (abs(geodesicDist(g, p)) > TOL) {
        return geodesicFromPoints(p, reflectPG(p, g));
    } else if (g.z > 0.) {
        return geodesicFromPointDir(p, p - g.xy);
    } else {
        return geodesicFromPointDir(p, g.xy);
    }
    
}


// Construction 3.1: Perpendicular bisector
vec3 hyperbolicBisector(vec2 p, vec2 q) {

    float pp = dot(p, p);
    float qq = dot(q, q);
    
    if (pp < TOL_SQR) { 
        
        // p is at origin
        float h2 = 1.0/qq;
        return vec3(q*h2, (h2 - 1.));
       
    } else if (qq < TOL_SQR) { 
        
        // q is at origin                
        float h2 = 1.0/pp;
        return vec3(p*h2, (h2 - 1.));
        
    } else if (sameLength(pp, qq)) {
        
        // p and q are same length, return the diameter
        return vec3(normalize(p - q), 0);
        
    }
    
    // this remarkably small piece of code reflects the following algebra:
    //
    // let d = q - p be the difference between p & q
    // let x be the pole of the bisector
    //
    // since the pole of the bisector is on the line from p to q, we know
    //
    //   x = p + k*d
    //
    // for some unknown k with abs(k) > 1 (because the pole isn't between p & q)
    //
    // now let's try to solve for k.
    //
    // we know that since the pole x is orthogonal to the unit circle, 
    // the radius of the bisector circle is governed by
    //
    //   r^2 = ||x||^2 - 1
    //       = ||p + k*d ||^2 - 1
    //       = p.p + 2k*p.d + k^2*d.d
    //
    // also since p and q are inverted through the bisector circle with radius
    // r we know
    //
    //   r^2 = || x-p || * || x-q || = ||d|| * || k*d - d ||
    //       = k*(k-1)*d.d 
    //
    // now we can set the two equations equal and solve for k

    vec2 d = q - p;
    float k = (1.0 - dot(p,p))/(dot(d,d) + 2.0*dot(p,d));
    
    return geodesicFromPole( p + k*d );
    
}

// hyperbolic translation to move the origin to point m
vec3 hyperTranslate(vec3 uv, vec2 m) {

    float mm = dot(m, m);
    if (mm < TOL_SQR || mm >= 1.) { return uv; }

    vec3 g1 = hyperbolicBisector(vec2(0), m);

    vec2 diff = uv.xy - g1.xy;
    float k = g1.z / dot(diff, diff);
    uv.xy = g1.xy + k*diff; 
    uv.z *= k;

    vec2 n = m / sqrt(mm);
    uv.xy -= 2.*dot(uv.xy, n)*n;
    
    return uv;
    
}

// is this a valid pqr for hyperbolic tiling (such that 1/p + 1/q + 1/r < 1)?
bool isValidPQR(vec3 pqr) {
    return (pqr.x*pqr.y + pqr.x*pqr.z + pqr.y*pqr.z) < pqr.x*pqr.y*pqr.z;   
}

// setup the fundamental triangle domain for tiling
void setupTriangle(vec3 scenePQR) {

    // setup triangle

    pqr = scenePQR;
    vec3 angles = PI/pqr;
    
    vec3 c = cos(angles);
    vec3 s = sin(angles);

    float cpqr = (c.x*c.y + c.z);
    
    float f2 = 1./(cpqr*cpqr - s.x*s.x*s.y*s.y);
    float f = sqrt(f2);
   
    float d2 = s.x*s.x*f2;
    
    float k = (cpqr - s.x*s.y)*f;

    float bsz = (c.x*c.z + c.y - s.x*s.z)*f;

    edges[0] = vec3(f*cpqr, s.x*f*c.y, d2);    
    edges[1] = vec3(s.x, -c.x, 0);
    edges[2] = vec3(0, 1, 0);

    verts[0] = vec2(0);
    verts[1] = vec2(k, 0);
    verts[2] = bsz*vec2(c.x, s.x);
    
    vec2 dA = normalize(perp(verts[1] - edges[0].xy));
    vec2 dB = normalize(perp(edges[0].xy - verts[2]));

    vec3 bisectors[3];

    bisectors[0] = vec3(sin(0.5*angles.x), -cos(0.5*angles.x), 0);
    bisectors[1] = geodesicFromPointDir(verts[1], dA + vec2(1, 0));
    bisectors[2] = geodesicFromPointDir(verts[2], dB + vec2(c.x, s.x));
    
    verts[3] = intersectGG(bisectors[0], edges[0]).xy;
    verts[4] = intersectGG(bisectors[1], edges[1]).xy;
    verts[5] = intersectGG(bisectors[2], edges[2]).xy;
    verts[6] = intersectGG(bisectors[0], bisectors[1]).xy;
    
    
    //////////////////////////////////////////////////
        
    for (int i=0; i<7; ++i) {
        insetVerts[i] = hyperTranslate(vec3(verts[i], 0), verts[6]).xy;
    }
    
    float pqrMin = min(pqr.x, min(pqr.y, pqr.z));
    
    vec2 b;
    
    b = insetVerts[1] - insetVerts[0];
    
    b = normalize(b);

    if (theResolution.x > theResolution.y) {
        insetR = mat2(b.x, -b.y, b.y, b.x);
    } else {
        insetR = mat2(b.y, b.x, -b.x, b.y);
    }
    
    vec2 p0 = vec2(1e5);
    vec2 p1 = vec2(-1e5);
    
    for (int i=0; i<7; ++i) {
        insetVerts[i] = insetR*insetVerts[i];
        p0 = min(p0, insetVerts[i]);
        p1 = max(p1, insetVerts[i]);
    }
        
    vec2 psz = p1 - p0;
    float insetBaseline = max(psz.x, psz.y);
    
    float insetMargin = max(20.0, 0.05*theResolution.y);
    float baselinePx = max(0., insetSize - 2.*insetMargin);
    
    insetOffsetPx = vec3(0.5*(p1 + p0), insetBaseline/baselinePx);
    
}

// convert from poincare disk coords to barycentric coords within
// fundamental triangle
vec2 baryFromDisk(vec2 p) {
    
    mat2 m = mat2(verts[1], verts[2]);
    
    return inverse(m)*p;
    
}

// convert from barycentric coords to poincare disk coords,
// clamping result to fundamental triangle
vec2 diskFromBary(vec2 b) {
        
    mat2 m = mat2(verts[1], verts[2]);
    vec2 p = m*b;
    
    vec2 diff = p - edges[0].xy;
    
    float d0 = dot(diff, diff);
    float d1 = dot(p, edges[1].xy);
    float d2 = dot(p, edges[2].xy);
    
    if (d0 > edges[0].z && d1 >= 0. && d2 >= 0.) {
        return p;
    }
    
    vec2 pc[3];

    vec2 d21 = verts[2] - verts[1];
    pc[0] = edges[0].xy + diff*sqrt(edges[0].z/d0);
    
    vec2 dp2 = p - verts[2];
    vec2 dp1 = p - verts[1];
    
    if (dot(dp2, d21) > 0. || dot(dp2, perp(verts[2] - edges[0].xy)) < 0.) {
        pc[0] = verts[2];
    } else if (dot(dp1, d21) < 0. || dot(dp1, perp(verts[1] - edges[0].xy)) > 0.) {
        pc[0] = verts[1];
    }
    
    pc[1] = verts[1]*clamp(dot(p, verts[1])/dot(verts[1], verts[1]), 0., 1.);
    pc[2] = verts[2]*clamp(dot(p, verts[2])/dot(verts[2], verts[2]), 0., 1.);
    
    vec2 pmin = p;
    float dmin = 1e5;
    
    for (int i=0; i<3; ++i) {
        diff = p - pc[i];
        float d = dot(diff, diff);
        if (d < dmin) { 
            dmin = d;
            pmin = pc[i];
        }
    }
    
    return pmin;
    
}

// convert between original pose (triangle at origin) and inset pose (translated, rotated)
vec3 origFromInset(vec3 ipos) {

    ipos.xy = ipos.xy * insetR;
    return hyperTranslate(ipos, -verts[6]);

}

// inverse of above
vec3 insetFromOrig(vec3 opos) {
    
    vec3 ipos = hyperTranslate(opos, verts[6]);
    ipos.xy = insetR * ipos.xy;
    
    return ipos;
    
}

// distance to inset triangle
float insetTriDist(vec3 ipos) {
    
    vec3 opos = origFromInset(ipos);
    
    float d0 = -geodesicDist(edges[0], opos.xy);
    float d1 = -geodesicDist(edges[1], opos.xy);
    float d2 = -geodesicDist(edges[2], opos.xy);
    
    return max(d0, max(d1, d2)) / opos.z;
    
}

// inset triangle coords from fragment coords
vec3 insetFromFrag(vec2 fragCoord) {
            
    vec3 ipos = vec3(fragCoord - insetBox.xy, 1)*insetOffsetPx.z;
    ipos.xy += insetOffsetPx.xy;

    return ipos;
    
}
