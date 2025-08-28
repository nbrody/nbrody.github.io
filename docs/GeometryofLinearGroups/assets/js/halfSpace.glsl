//------------------------------------------------------------------
// Half-space shader
//------------------------------------------------------------------

float halfspaceSDF(vec4 p, vec4 normal, float offset){
    float dot = p.x*normal.x + p.y*normal.y + p.z*normal.z - p.w*normal.w;
    return dot-offset;
}

float polytopeScene(vec4 p){
    float dist=MAX_DIST;

    float dist1 = halfspaceSDF(p, vec4(1,0,0,0), 0.1);
    float dist2 = halfspaceSDF(p, vec4(-1,0,0,0), 0.1);
    float dist3 = halfspaceSDF(p, vec4(0,1,0,0), 0.1);
    float dist4 = halfspaceSDF(p, vec4(0,-1,0,0), 0.1);
    float dist5 = halfspaceSDF(p, vec4(0,0,1,0), 0.1);
    float dist6 = halfspaceSDF(p, vec4(0,0,-1,0), 0.1);

    dist = max(dist1, max(dist2, max(dist3, max(dist4, max(dist5, dist6)))));

    if (dist < u_eps) {
        hitWhich = 4;
        return dist;
    }
    
    return dist;
}