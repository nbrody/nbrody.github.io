/* Hyperbolic Wythoff explorer, by mattz
   License https://creativecommons.org/licenses/by-nc-sa/3.0/

   Based on:

     - "Wythoff explorer" 
       https://www.shadertoy.com/view/Md3yRB

     - "Fun with the Poincaré disk" 
       https://www.shadertoy.com/view/3tBGDD

   These links were helpful when creating this shader:

     - https://en.wikipedia.org/wiki/Wythoff_construction
     - https://en.wikipedia.org/wiki/Wythoff_symbol

*/

///////////////////////////////////////////////////
// global vars for drawing

float textDist;
vec2 textPos;

float lineWidth;
float inkDist;
vec3 colorOut;

ivec3 drawCodes;

const vec3 colors[3] = vec3[3](PCOLOR, QCOLOR, RCOLOR);

///////////////////////////////////////////////////
// utility functions for drawing:

// construct a line from 2 points
vec3 line2D(vec2 a, vec2 b) {
    vec2 n = perp(b - a);
    return vec3(n, -dot(n, a));
}

// 2D distance to line
float lineDist2D(vec3 l, vec2 p) {
    float s = length(l.xy);
    return (dot(l.xy, p) + l.z)/s;
}

// 2D distance to line
float lineDist2D(vec2 a, vec2 b, vec2 p) {
    return lineDist2D(line2D(a, b), p);
}

// 2D distances to line and line segment
vec2 lineSegDist2D(vec2 a, vec2 b, vec2 p) {

    p -= a;
    b -= a;
    
    vec2 n = normalize(perp(b));
    
    float u = clamp(dot(p, b)/dot(b, b), 0., 1.);
    
    return vec2(dot(b, n) - dot(p, n), length(p-u*b));
    
}

// mix src into dst by smoothstepping k with threshold d
void ink(vec3 src) {
    colorOut = mix(src, colorOut, smoothstep(0.0, 1.0, inkDist));
    inkDist = 1e5;
}

// draw either line or circle (using geodesicDist above)
void drawLine(in vec3 l, in vec3 p) {
    inkDist = min(inkDist, (abs(geodesicDist(l, p.xy))-lineWidth)/p.z);
}

// draw a 2D point
void drawPoint(in vec2 x, in vec3 p) {
	inkDist = min(inkDist, (length(x-p.xy)-pointSize)/p.z);
}

// draw an open dot
void drawDot(in vec2 x, in vec3 p) {
    float d = (length(x-p.xy)-pointSize)/p.z;
    colorOut = mix(colorOut, WHITE, smoothstep(1.0, 0.0, d));
	inkDist = min(inkDist, abs(d)-0.5);
}

// draw a geodesic segment between two points
void drawSeg(vec2 p, vec2 q, vec3 cpq, vec3 uv) {
    
    float d = abs(geodesicDist(cpq, uv.xy))-lineWidth;
    
    vec2 diff = normalize(q - p);
    
    d = max(d, dot(p - uv.xy, diff)-lineWidth);
    d = max(d, dot(uv.xy - q, diff)-lineWidth);
    d = max(d, length(uv.xy)-1.);
    
    inkDist = min(inkDist, d/uv.z);

}

// distance to character in SDF font texture
float fontDist(vec2 tpos, float size, vec2 offset) {

    float scl = 0.63/size;
      
    vec2 uv = tpos*scl;
    vec2 font_uv = (uv+offset+0.5)*(1.0/16.0);
    
    float k = texture(iChannel1, font_uv, -100.0).w + 1e-6;
    
    vec2 box = abs(uv)-0.5;
        
    return max(k-127.0/255.0, max(box.x, box.y))/scl;
    
}

// distance to triangle for spin box
float spinIconDist(vec2 pos, float size, bool flip, bool dim) {
    
    if (flip) { pos.y = -pos.y; }  
    pos.x = abs(pos.x);
    
    vec2 p0 = vec2(0, -0.7)*textSize;
    vec2 p1 = vec2(0.35, -0.7)*textSize;
    vec2 p2 = vec2(0.0, -1.1)*textSize;
    
    float d = max(lineDist2D(p0, p1, pos), 
                  lineDist2D(p1, p2, pos));
    
    if (dim) { 
        d = abs(d + 0.02*textSize) - 0.02*textSize;
    }
    
    return d;
       
}

// draw color icon (RGB or facet-shaded selectors)
void drawColorIcon(vec2 p, float sz, int i, bool enable, inout vec3 color) {
    
    const float k = 0.8660254037844387;
    
    mat2 R = mat2(-0.5, k, -k, -0.5);
    
    vec2 p1 = vec2(k*sz, 0);
    vec2 p2 = vec2(0, 0.5*sz);
    
    mat3 colors;
    
    if (i == 0) {
        colors = mat3(vec3(1, 0, 0),
                      vec3(1, 1, 0),
                      vec3(0, 0, 1));
    } else {
        colors = mat3(vec3(0.6, 0, 0.6),
                      vec3(0.7, 0.4, 0.7),
                      vec3(0.1, 0.5, 0.5));
    }
    
    float ue = enable ? 1. : 0.3;
    float ds = 1e5;
    
    for (int j=0; j<3; ++j) {
        
        vec2 ap = vec2(abs(p.x), abs(p.y-0.5*sz));
        
        vec2 dls = lineSegDist2D(p2, p1, ap);
        
        p = R*p;
        
        color = mix(color, colors[j], smoothstep(1.0, 0.0, -dls.x+0.5) * ue);
        ds = min(ds, dls.y);
    
    }

    color = mix(color, vec3(0), smoothstep(1.0, 0.0, ds-0.05*sz) * ue);
    
}

// distance to decor icon
float decorIconDist(vec2 p, float sz, int style) {
    
    float s = sign(p.x*p.y);
    
    p = abs(p);
    
    vec2 a = vec2(0, sz);
    vec2 b = vec2(sz, 0);
    
    float l = lineDist2D(a, b, p);
    float c = length( p - (p.x > p.y ? b : a)*0.8 );
    
    if (style == 0) {
        return c - 0.2*sz;
    } else if (style == 1) {
        return abs(l + 0.04*sz) - 0.08*sz;
    } else if (style == 2) {
        return min(abs(l), max(min(p.x, p.y), l)) - 0.03*sz;
    } else {
        return min(max(min(s*p.x, s*p.y), l), abs(l)-0.03*sz);
        
    }
    
}

//////////////////////////////////////////////////////////////////////
// hyperbolic tiling drawing functions

// decide between two region colors
vec3 decide2(vec3 uv, int i, int j) {
    
    int k = 3 - i - j;
    
    float d = geodesicDist(perps[k], uv.xy);
    
    vec3 fg, bg;
    
    if (d * geodesicDist(perps[k], verts[i]) >= 0.) {
        fg = colors[i];
        bg = colors[j];
    } else {
        fg = colors[j];
        bg = colors[i];
    }
    
    return mix(fg, bg, 0.5*smoothstep(0.5*uv.z, 0.0, abs(d)));
    
}

// decide between three region colors when generator on edge
vec3 decide3Edge(vec3 uv, int i, int j) {
    
    int k = 3 - i - j;
    vec3 g = geodesicFromPoints(generator, verts[k]);
    
    if (geodesicDist(g, uv.xy) * geodesicDist(g, verts[j]) >= 0.) {
        return decide2(uv, j, k);
    } else {
        return decide2(uv, i, k);
    }
    
}


// decide between three region colors
vec3 decide3(vec3 uv) {

    int perpCode = drawCodes.y;

    if (perpCode == 3) {
        return decide3Edge(uv, 0, 1);
    } else if (perpCode == 5) {
        return decide3Edge(uv, 0, 2);
    } else if (perpCode == 6) {
        return decide3Edge(uv, 1, 2);
    } else {
        
        int j;
        
        if (geodesicDist(perps[0], uv.xy)*geodesicDist(perps[0], verts[1]) >= 0.) {
            j = 1;
        } else {
            j = 2;
        }
        
        vec3 g = geodesicFromPoints(verts[j], generator);
        
        if (geodesicDist(g, uv.xy)*geodesicDist(g, verts[0]) >= 0.) {
            return decide2(uv, 0, j);
        } else {
            return decide2(uv, 1, 2);
        }
        
    }
    
}

// decide region color based on triangle setup
vec3 getFaceColor(vec3 uv) {
    
    int regionCode = drawCodes.x;
    
    if (regionCode == 1) {
        return colors[0];
    } else if (regionCode == 2) {
        return colors[1];
    } else if (regionCode == 4) {
        return colors[2];
    } else if (regionCode == 3) {
        return decide2(uv, 0, 1);
    } else if (regionCode == 5) {
        return decide2(uv, 0, 2);
    } else if (regionCode == 6) { 
        return decide2(uv, 1, 2);
    } else {
        return decide3(uv);
    }
    
}

// 16 repeated involutions to flip a point into the fundamental domain
// covers the entire visible circle
void flipIntoFundamental(inout vec4 uvsf) {
	
    for (int i=0; i<16; ++i) {
        
        vec2 diff = uvsf.xy - edges[0].xy;
        float d0 = dot(diff, diff);
                
        if (d0 < edges[0].z) {
                        
            float k = edges[0].z / d0;
            uvsf.xy = edges[0].xy + k*diff;
            uvsf.z *= k;
            uvsf.w = -uvsf.w;
            
        }
        
        float d1 = dot(uvsf.xy, edges[1].xy);
        
        if (d1 < 0.) {

            uvsf.xy -= 2.*d1*edges[1].xy;
            uvsf.w = -uvsf.w;            
 
        }
        
        float d2 = dot(uvsf.xy, edges[2].xy);

        if (d2 < 0.) {
            
            uvsf.xy -= 2.*d2*edges[2].xy;
            uvsf.w = -uvsf.w;   
                        
        }        

    }
    
}

// for shading alternate triangles and coloring triangle edges
vec2 getEdgeDistAndShading(vec4 uvsf) {
    
    float d = abs(geodesicDist(edges[2], uvsf.xy));
    d = min(d, abs(geodesicDist(edges[1], uvsf.xy)));
    d = min(d, abs(geodesicDist(edges[0], uvsf.xy)));
    
    return vec2(d, mix(uvsf.w < 0. ? 0.8 : 1.0, 0.9, smoothstep(0.5*uvsf.z, 0.0, d)));

}

// hue from color in [0, 1]
vec3 hue(float h) {
    vec3 c = mod(h*6.0 + vec3(2, 0, 4), 6.0);
	return clamp(min(c, -c+4.0), 0.0, 1.0);
}

// convert triplet of bools to bitmask
int intFromBool3(bool v[3]) {
    return ((v[0] ? 1 : 0) | (v[1] ? 2 : 0) | (v[2] ? 4 : 0));
}

// compute some globals to help with triangle drawing
void setupTriangleDrawing(vec3 gbary) {
    
    if (gbary.z >= 0.) {
        generator = verts[int(gbary.z)];  
    } else {
        generator = diskFromBary(gbary.xy);
    }
    
    bool regionValid[3] = bool[3](true, true, true);
    bool perpValid[3];
    bool perpDrawable[3];
    
    for (int i=0; i<3; ++i) {
        
        perps[i] = geodesicPerpThruPoint(edges[i], generator.xy);
        perpValid[i] = abs(geodesicDist(edges[i], generator.xy)) > TOL;
        perpDrawable[i] = perpValid[i];
        
        int j = (i + 1) % 3;
        int k = (i + 2) % 3;
                
        if (abs(geodesicDist(perps[i], verts[j])) < TOL) { 
            regionValid[j] = false; 
            perpValid[i] = false;
        }
        
        if (abs(geodesicDist(perps[i], verts[k])) < TOL) { 
            regionValid[k] = false;
            perpValid[i] = false;
        }
        
    }
    
    drawCodes = ivec3(intFromBool3(regionValid),
                      intFromBool3(perpValid),
                      intFromBool3(perpDrawable));
    
    
}

// draw the image
void mainImage( out vec4 fragColor, in vec2 fragCoord ) {

    // load variables from buffer A
    vec4 pqrg = LOAD(PQR);
    vec3 gbary = LOAD(GENERATOR).xyz;
    int style = int(LOAD(STYLE).x);
    vec2 m = LOAD(SCROLL).yx; // note flip along y=x line

    // set up options from loaded things
    pqr = pqrg.xyz;
    
    bool gui = (pqrg.w != 0.);
    bool colorByRegion = bool(style & STYLE_COLOR_BY_REGION);
    bool shadeTriangles = bool(style & STYLE_SHADE_TRIANGLES);
    bool drawPolygonEdges = bool(style & STYLE_DRAW_POLYGONS);
    bool drawTriangleEdges = bool(style & STYLE_DRAW_TRIANGLES);
    bool drawGenerator = bool(style & STYLE_DRAW_GENERATOR);
    
    // set up coordinate transforms
    setupScene(iResolution.xy);
    
    // note flip along y=x line
    vec4 uvsf = vec4(sceneFromFrag(fragCoord).yxz, -1.);
         
    // set up drawing globals
    colorOut = WHITE;

    textDist = 1e5;
    inkDist = 1e5;
            
    // don't do triangle setup math if not needed
    bool insideUnit = dot(uvsf.xy, uvsf.xy) < 1.;
    bool insideInset = boxDist(fragCoord, insetBox) <= 0.;

    if (insideUnit || (insideInset && gui)) {
        setupTriangle(pqr);
        setupTriangleDrawing(gbary);
    }

	// draw unit circle
    const vec3 unitCircle = vec3(0., 0., 1.);
    lineWidth = 0.005;
    drawLine(unitCircle, uvsf.xyz);
    
    // are we in the poincare disk?
    if (insideUnit) {
            
        // apply scrolling transform
        uvsf.xyz = hyperTranslate(uvsf.xyz, m);

        // stash where we were for coloring, before we flip into fundamental domain
        vec3 shadeUV = uvsf.xyz;
        
        // flip into fundamental domain
        flipIntoFundamental(uvsf);
        
        // get edge distance and shading fraction
        vec2 es = getEdgeDistAndShading(uvsf);
        
        // choose background color
        if (colorByRegion) {
            
            colorOut = getFaceColor(uvsf.xyz);
            
        } else {
            
            vec3 rgb = hue(0.5*atan(shadeUV.x, shadeUV.y)/PI);
            colorOut = mix(rgb, WHITE, 1.-dot(shadeUV.xy, shadeUV.xy));
            
        }

        // shade triangles if needed
        if (shadeTriangles) { colorOut *= es.y; }
        
        // draw polygon edges if needed
        if (drawPolygonEdges) {
            lineWidth = 0.01;
            for (int i=0; i<3; ++i) {
                if (bool(drawCodes.z & (1 << i))) {
                    vec2 pinter = intersectGG(perps[i], edges[i]).xy;
                    drawSeg(generator.xy, pinter, perps[i], uvsf.xyz);
                }
            }
        }
        
        // draw generator point if needed
        if (drawGenerator) { drawPoint(generator.xy, uvsf.xyz); }
        
        // draw triangle edges if needed
        if (drawTriangleEdges) {
            lineWidth = 0.005;
            inkDist = min(inkDist, (es.x-lineWidth)/uvsf.z);
        }
        
    } // done drawing inside circle
    
    // ink the lines that were drawn
    ink(BLACK);

    if (gui) {

        // inset triangle
        if (insideInset) {

            vec3 ipos = insetFromFrag(fragCoord);

            // shade triangle
            colorOut = mix(colorOut, LIGHTGRAY, step(insetTriDist(ipos), 0.));

            // draw triangle outline
            lineWidth = 0.5*ipos.z;

            for (int i=0; i<3; ++i) {

                int j = (i+1)%3;
                int k = 3-i-j;
                vec3 edge = geodesicFromPoints(insetVerts[j], insetVerts[k]);

                drawSeg(insetVerts[j], insetVerts[k], edge, ipos.xyz);

            }

            // ink the lines
            ink(BLACK);

            // draw all 7 vertices
            pointSize = max(4.0*ipos.z, 0.06*insetBox.z*insetOffsetPx.z);

            for (int i=0; i<7; ++i) {
                drawDot(insetVerts[i], ipos.xyz);
            }

            // ink outlines
            ink(BLACK);
            
            // draw generator in red
            vec2 insetGenerator = insetFromOrig(vec3(generator,0)).xy;

            pointSize -= ipos.z;
            drawPoint(insetGenerator, ipos.xyz);
            ink(vec3(0.7, 0, 0));    

        } // done drawing inset


        float dBlack = 1e5;
        float dGray = 1e5;

        // text and spin icons
        for (int i=0; i<3; ++i) {

            textPos = fragCoord.xy - digitUIBox(i).xy;
            dBlack = min(dBlack, fontDist(textPos, textSize, vec2(pqr[i], 12.0)));

            dGray = min(dGray, spinIconDist(textPos, textSize, true, pqr[i] == MAX_PQR));
            dGray = min(dGray, spinIconDist(textPos, textSize, false, pqr[i] == MIN_PQR));

        }


        // top row of clickable icons
        for (int i=0; i<4; ++i) {

            vec2 p = iconUIBox(ivec2(i, 0)).xy;
            float idist = decorIconDist(fragCoord - p, iconSize, i);

            if (bool(style & (1 << i))) {
                dBlack = min(dBlack, idist);
            } else {
                dGray = min(dGray, idist);
            }

        }

        // bottom row of clickable icons
        for (int i=0; i<2; ++i) {
            bool enable = (colorByRegion && i == 0) || (!colorByRegion && i == 1); 
            vec2 pos = iconUIBox(ivec2(i+1, 1)).xy;
            drawColorIcon(fragCoord - pos, iconSize, i, enable, colorOut);
        }

        // draw the things
        colorOut = mix(GRAY, colorOut, smoothstep(0.0, 1.0, dGray));
        colorOut = mix(BLACK, colorOut, smoothstep(0.0, 1.0, dBlack));
        
    }

    // gamma correction & display
    colorOut = sqrt(colorOut);
    fragColor = vec4(colorOut, 1);
 
}