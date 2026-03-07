vec4 data;
ivec2 fc;

#define STORE(oc, value) if(fc == (oc)) { data = (value); }

void mainImage( out vec4 fragColor, in vec2 fragCoord ) {
   
    // set up coordinate conversions
    setupScene(iResolution.xy);

    // get integer frag coords and texel data from last frame
    fc = ivec2(fragCoord);
    
    data = texelFetch(iChannel0, fc, 0);
    
    // load all the important variables
    pqr = LOAD(PQR).xyz;
    vec3 gbary = LOAD(GENERATOR).xyz;
    vec4 mstate = LOAD(MOUSE);
    float style = LOAD(STYLE).x;
    vec4 scroll = LOAD(SCROLL);
    vec4 time = LOAD(TIME);
    
    // update time (for pause detection)
    time.x = time.y;
    time.y = iTime;
    
    
    // setup for initial frame
    if (iFrame == 0) { 

#ifdef DEMO_MODE
        pqr = vec3(6,4,3);
        gbary = vec3(0, 0, 6);
        style = 43.;
#else
        pqr = vec3(5,4,2); 
        gbary = vec3(0, 0, 6);
        style = 26.;
#endif
        
    } 
    
    // see https://www.shadertoy.com/view/XdtyWB for explanation of this
    bool paused = (time.x == iTime);
    
    
#ifdef DEMO_MODE    
    bool gui = false;
#else
    // space toggles GUI
    bool gui = texelFetch(iChannel1, ivec2(32, 2), 0).x == 0.;
#endif
    
    
    // update motion if not paused
    if (!paused && scroll.z == 0.) {
            
        scroll.w += iTimeDelta;
        float t = scroll.w*PI/10.0;
        float r = 0.5*smoothstep(0.0, 4.0, scroll.w);
        scroll.xy = r*vec2(cos(t), sin(t));
        
    }
    
#ifdef DEMO_MODE
    
    float t = iTime*2.*PI/5.0;
    float r = 0.4;
    scroll.xy = r*vec2(cos(t), sin(t));
    
#endif

    // is moue down?
    bool mouseIsDown = min(iMouse.z, iMouse.w) > 0.; 
    
    // are we clicking?
    bool click = mouseIsDown && mstate.w == 0.;
    
    // update mouse state
    if (mouseIsDown) {
        mstate.w = 1.;
    } else {
        mstate = vec4(0); 
    }

	// handle clicking on triangles
    if (gui && click && fc == PQR) {

        for (int i=0; i<3; ++i) {

            int j = (i+1)%3;
            int k = 3-i-j;

            for (float delta=-1.; delta <= 1.; delta += 2.) {
            
                bool enabled = (delta < 0.) ? data[i] > MIN_PQR : data[i] < MAX_PQR;
                if (!enabled) { continue; }

                float d = boxDist(iMouse.xy, triUIBox(i, delta));       
                if (d > 0.) { continue; }

                pqr[i] += delta;
                
                for (int try=0; try<10; ++try) {
                    if (isValidPQR(pqr)) { continue; }
                    int m = pqr[j]*delta > pqr[k]*delta ? j : k;
                    pqr[m] -= delta;
                }
                
            }
        }
        
        
    }
    
    // handle mouse to move generator
    if (gui && (fc == GENERATOR || fc == MOUSE)) {
                
        setupTriangle(pqr);

        if (click && boxDist(iMouse.xy, insetBox) < SNAP_TOL) {
            
            vec3 ipos = insetFromFrag(iMouse.xy);

            float dmin = 1e5; 

            int imin;
            vec2 omin;

            for (int i=0; i<7; ++i) {
                vec2 o = (insetVerts[i] - ipos.xy) / ipos.z;
                float d = length(o);
                if (d < dmin) {
                    dmin = d;
                    imin = i;
                    omin = o;
                }
            }

            if (dmin < SNAP_TOL) {
                gbary.xy = baryFromDisk(verts[imin]);
                gbary.z = float(imin);
                mstate.xy = omin;
                mstate.z = 1.;
            } else {
                vec3 opos = origFromInset(ipos);
                vec3 newbary = vec3(baryFromDisk(opos.xy), -1.);
                vec3 newdisk = vec3(diskFromBary(newbary.xy), opos.z);
                vec3 newipos = insetFromOrig(newdisk);
                if (length(newipos.xy - ipos.xy)/ipos.z < SNAP_TOL) {
                    gbary = newbary;
                    mstate.z = 2.;
                } 
            }
                
        } else {
            
            if (mstate.z == 1.) {
                if (length(iMouse.xy - iMouse.zw) > 0.25*SNAP_TOL) {
                    mstate.z = 2.;
                }
            } 
                
            if (mstate.z == 2.) {
                vec3 ipos = insetFromFrag(iMouse.xy + mstate.xy);
                vec3 opos = origFromInset(ipos);
                gbary = vec3(baryFromDisk(opos.xy), -1.);
            }
            
        }
        
   
    }
    
    // handle clicking to change display style
    if (fc == STYLE && click && gui) {
        
        int istyle = int(style);
        
        for (int i=0; i<4; ++i) {
            if (boxDist(iMouse.xy, iconUIBox(ivec2(i, 0))) <= 0.) {
                istyle ^= (1 << i);
            }
        }
        
        for (int i=0; i<2; ++i) {
            if (boxDist(iMouse.xy, iconUIBox(ivec2(i+1, 1))) <= 0.) {
                if (i == 0) {
                    istyle |= STYLE_COLOR_BY_REGION;
                } else {
                    istyle &= ~STYLE_COLOR_BY_REGION;
                }
            }
        }

        style = float(istyle);
        
    }
    
    // handle mouse to do motion
    if (fc == SCROLL || fc == MOUSE) {
        
        vec3 uv = sceneFromFrag(iMouse.xy);
        float l = length(uv);
        bool insideCircle = l < 0.85;
        
        if (click) {
            if (insideCircle) {
                mstate.z = 3.;
                scroll.xy = uv.xy;
                scroll.z = 1.;
            } else if (!gui || iMouse.x > insetSize) {
                scroll.z = 0.;
            }
        } else if (mstate.z == 3.) {
            if (l > 0.85) { uv.xy *= 0.85/l; }
            scroll.xy = uv.xy;
        } else if (texelFetch(iChannel1, ivec2(67, 1), 0).x == 1.) {
            scroll.z = 1.;
            scroll.xy = vec2(0.);
        } else if (texelFetch(iChannel1, ivec2(77, 1), 0).x == 1.) {
            scroll.z = 0.;
        }
        
    }

	// store all of the things
    STORE(PQR, vec4(pqr, gui ? 1. : 0.));
    STORE(MOUSE, mstate);
    STORE(GENERATOR, vec4(gbary, 0));
    STORE(STYLE, vec4(style, 0, 0, 0));
    STORE(SCROLL, scroll);
    STORE(TIME, time);
        
    // stash result
    fragColor = data;
                
    
}
