/*
Created by soma_arc - 2016
This work is licensed under Creative Commons Attribution-NonCommercial-ShareAlike 3.0 Unported.
*/


vec3 ROTATION_AXIS = normalize(vec3(0.1, 1, 0.5));
vec3 rotate(vec3 p, float angle){
  float s = sin(angle);
  float c = cos(angle);
  float r = 1.0 - c;
  mat3 m = mat3(ROTATION_AXIS.x * ROTATION_AXIS.x * r + c,
                ROTATION_AXIS.y * ROTATION_AXIS.x * r + ROTATION_AXIS.z * s,
                ROTATION_AXIS.z * ROTATION_AXIS.x * r - ROTATION_AXIS.y * s,
                ROTATION_AXIS.x * ROTATION_AXIS.y * r - ROTATION_AXIS.z * s,
                ROTATION_AXIS.y * ROTATION_AXIS.y * r + c,
                ROTATION_AXIS.z * ROTATION_AXIS.y * r + ROTATION_AXIS.x * s,
                ROTATION_AXIS.x * ROTATION_AXIS.z * r + ROTATION_AXIS.y * s,
                ROTATION_AXIS.y * ROTATION_AXIS.z * r - ROTATION_AXIS.x * s,
                ROTATION_AXIS.z * ROTATION_AXIS.z * r + c);
  return m * p;
}

const vec3 SPHERE_POS1 = vec3(300, 300, 0);
const vec3 SPHERE_POS2 = vec3(300, -300, 0);
const vec3 SPHERE_POS3 = vec3(-300, 300, 0);
const vec3 SPHERE_POS4 = vec3(-300, -300, 0);
const vec3 SPHERE_POS5 = vec3(300. + 300. * sqrt(3.), 0, 0);
const vec3 SPHERE_POS6 = vec3(-300. - 300. * sqrt(3.), 0, 0);
const vec3 SPHERE_POS7 = vec3(0, 0, 424.26);
const vec3 SPHERE_POS8 = vec3(0, 0, -424.26);
const float SPHERE_R = 300.;
const float SPHERE_R2 = SPHERE_R * SPHERE_R;

vec3 sphereInvert(vec3 pos, vec3 circlePos, float circleR){
  return ((pos - circlePos) * circleR * circleR)/(distance(pos, circlePos) * distance(pos, circlePos) ) + circlePos;
}

float loopNum = 0.;
float kleinSphereR = 125.;
//float kleinSphereR = 300.;
//float kleinSphereR = 400.;
const int MAX_KLEIN_ITARATION = 50;
float distKlein(vec3 pos){
  pos = rotate(pos, radians(iTime * 30.));
  float scalingFactor= .08;
  loopNum = 0.;
  float dr = 1.;
  bool loopEnd = true;
  for(int i = 0 ; i < MAX_KLEIN_ITARATION ; i++){
    loopEnd = true;
    if(distance(pos, SPHERE_POS1) < SPHERE_R){
      vec3 diff = (pos - SPHERE_POS1);
      dr *= SPHERE_R2 / dot(diff, diff);
      pos = sphereInvert(pos, SPHERE_POS1, SPHERE_R);
      loopEnd = false;
      loopNum++;
    }else if(distance(pos, SPHERE_POS2) < SPHERE_R){
      vec3 diff = (pos- SPHERE_POS2);
      dr *= SPHERE_R2 / dot(diff, diff);
      pos = sphereInvert(pos, SPHERE_POS2, SPHERE_R);
      loopEnd = false;
      loopNum++;
    }else if(distance(pos, SPHERE_POS3) < SPHERE_R){
      vec3 diff = (pos- SPHERE_POS3);
      dr *= SPHERE_R2 / dot(diff, diff);
      pos = sphereInvert(pos, SPHERE_POS3, SPHERE_R);
      loopEnd = false;
      loopNum++;
    }else if(distance(pos, SPHERE_POS4) < SPHERE_R){
      vec3 diff = (pos- SPHERE_POS4);
      dr *= SPHERE_R2 / dot(diff, diff);
      pos = sphereInvert(pos, SPHERE_POS4, SPHERE_R);
      loopEnd = false;
      loopNum++;
    }else if(distance(pos, SPHERE_POS5) < SPHERE_R){
      vec3 diff = (pos- SPHERE_POS5);
      dr *= SPHERE_R2 / dot(diff, diff);
      pos = sphereInvert(pos, SPHERE_POS5, SPHERE_R);
      loopEnd = false;
      loopNum++;
    }else if(distance(pos, SPHERE_POS6) < SPHERE_R){
      vec3 diff = (pos- SPHERE_POS6);
      dr *= SPHERE_R2 / dot(diff, diff);
      pos = sphereInvert(pos, SPHERE_POS6, SPHERE_R);
      loopEnd = false;
      loopNum++;
    }else if(distance(pos, SPHERE_POS7) < SPHERE_R){
      vec3 diff = (pos- SPHERE_POS7);
      dr *= SPHERE_R2 / dot(diff, diff);
      pos = sphereInvert(pos, SPHERE_POS7, SPHERE_R);
      loopEnd = false;
      loopNum++;
    }else if(distance(pos, SPHERE_POS8) < SPHERE_R){
      vec3 diff = (pos- SPHERE_POS8);
      dr *= SPHERE_R2 / dot(diff, diff);
      pos = sphereInvert(pos, SPHERE_POS8, SPHERE_R);
      loopEnd = false;
      loopNum++;
    }
    if(loopEnd == true) break;
  }
  float f = (length(pos - (SPHERE_POS1 + SPHERE_POS2 + SPHERE_POS5)/3. ) - 50.) / abs(dr) * scalingFactor;
  float f2 = (length(pos - (SPHERE_POS3 + SPHERE_POS4 + SPHERE_POS6)/3. ) - 50.) / abs(dr) * scalingFactor;

    return min(f2, min(f, (length(pos) - kleinSphereR) / abs(dr) * scalingFactor));
}

vec3 calcRay (const vec3 eye, const vec3 target, const vec3 up, const float fov,
              const float width, const float height, const vec2 coord){
  float imagePlane = (height * .5) / tan(fov * .5);
  vec3 v = normalize(target - eye);
  vec3 xaxis = normalize(cross(v, up));
  vec3 yaxis =  normalize(cross(v, xaxis));
  vec3 center = v * imagePlane;
  vec3 origin = center - (xaxis * (width  *.5)) - (yaxis * (height * .5));
  return normalize(origin + (xaxis * coord.x) + (yaxis * (height - coord.y)));
}

const vec4 K = vec4(1.0, .666666, .333333, 3.0);
vec3 hsv2rgb(const vec3 c){
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

float distFunc(vec3 p){
  return distKlein(p);
}

const vec2 d = vec2(0.01, 0.);
vec3 getNormal(const vec3 p){
  return normalize(vec3(distFunc(p + d.xyy) - distFunc(p - d.xyy),
                        distFunc(p + d.yxy) - distFunc(p - d.yxy),
                        distFunc(p + d.yyx) - distFunc(p - d.yyx)));
}

const float PI_4 = 12.566368;
const vec3 LIGHTING_FACT = vec3(0.1);
vec3 diffuseLighting(const vec3 p, const vec3 n, const vec3 diffuseColor,
                     const vec3 lightPos, const vec3 lightPower){
  vec3 v = lightPos - p;
  float dot = dot(n, normalize(v));
  float r = length(v);
  return (dot > 0.) ?
    (lightPower * (dot / (PI_4 * r * r))) * diffuseColor
    : LIGHTING_FACT * diffuseColor;
}

const vec3 lightPos = vec3(400, 0, 500);
const vec3 lightPos2 = vec3(-300., -300., -300);
const vec3 lightPower = vec3(800000.);
const vec3 lightPoweSPHERE_R2 = vec3(10000.);

const int MAX_MARCHING_LOOP = 800;
vec2 march(const vec3 origin, const  vec3 ray, const float threshold){
  vec3 rayPos = origin;
  float dist;
  float rayLength = 0.;
  for(int i = 0 ; i < MAX_MARCHING_LOOP ; i++){
    dist = distFunc(rayPos);
    rayLength += dist;
    rayPos = origin + ray * rayLength ;
    if(dist < threshold) break;
  }
  return vec2(dist, rayLength);
}

const vec3 BLACK = vec3(0);
vec3 calcColor(vec3 eye, vec3 ray){
  vec3 l = BLACK;
  float coeff = 1.;
  vec2 result = march(eye, ray, 0.01);
  vec3 intersection = eye + ray * result.y;
  vec3 matColor = vec3(0);
  vec3 normal = getNormal(intersection);
  if(result.x < 0.01){
    matColor = hsv2rgb(vec3(0.1 + loopNum * 0.1 , 1., 1.));
    l += diffuseLighting(intersection, normal, matColor, lightPos, lightPower);
    l += diffuseLighting(intersection, normal, matColor, lightPos2, lightPower);
  }
  return l;
}

const float DISPLAY_GAMMA_COEFF = 1. / 2.2;
vec3 gammaCorrect(vec3 rgb) {
  return vec3((min(pow(rgb.r, DISPLAY_GAMMA_COEFF), 1.)),
              (min(pow(rgb.g, DISPLAY_GAMMA_COEFF), 1.)),
              (min(pow(rgb.b, DISPLAY_GAMMA_COEFF), 1.)));
}

const vec3 eye = vec3(300 , 0., 700 );
const vec3 target = vec3(0, 0, 0);
const vec3 up = vec3(0, 1, 0);
float fov = radians(60.);

void mainImage( out vec4 fragColor, in vec2 fragCoord ){
  const vec2 coordOffset = vec2(0.5);
  vec3 ray = calcRay(eye, target, up, fov,
                     iResolution.x, iResolution.y,
                     gl_FragCoord.xy + coordOffset);

  fragColor = vec4(gammaCorrect(calcColor(eye, ray)), 1.);
}