// Haight Street Liftoff — standing at Haight & Ashbury at golden hour, then straight up:
// rooftops, the city, the marine layer and the Bay, the thinning sky, orbit.
import { startSphere, $, num, on, mirror } from '../sphereKit/kit.js';

const glsl = `
uniform float uJourney;   // 0 on the corner … 1 in orbit
// Ground units are 10 m: x east, z south, the crossing at the origin.
const float RE = 637100.0;                           // Earth's radius
const vec3 SUN = vec3(-0.6215, 0.2205, -0.7518);     // low in the west-northwest

float altitude(float j) {
  float u = smoothstep(0.0, 1.0, clamp((j - 0.12) / 0.58, 0.0, 1.0));
  return 0.17 * pow(247000.0, u);                    // eye height to 420 km
}

vec3 daySky(vec3 d, float e) {
  vec3 c = mix(vec3(1.0, 0.72, 0.46), vec3(0.18, 0.38, 0.8), pow(clamp(e, 0.0, 1.57) / 1.57, 0.4));
  return c + vec3(1.0, 0.55, 0.25) * pow(max(dot(d, SUN), 0.0), 6.0) * 0.55;
}

vec3 cityGround(vec2 g, float fp, float t) {
  float coast = -520.0 + 60.0 * (fbm(g * 0.004) - 0.5) + 1400.0 * (fbm(vec2(g.y * 0.00025, 1.3)) - 0.5) * smoothstep(300.0, 3000.0, abs(g.y));
  bool pacific = g.x < coast;
  float wob = (fbm(g * 0.003 + 7.0) - 0.5) * 0.35;
  bool bay = min(length((g - vec2(300.0, -620.0)) / vec2(900.0, 290.0)),      // north of the city, out to the Golden Gate
                 length((g - vec2(950.0, 200.0)) / vec2(470.0, 1100.0))) + wob < 1.0;   // and down the east side
  if (pacific || bay) {
    float fog = pacific ? smoothstep(0.5, 0.75, fbm(g * 0.006 + vec2(t * 0.02, 0.0))) : 0.0;   // the marine layer
    return mix(vec3(0.1, 0.22, 0.32), vec3(0.96, 0.92, 0.88), fog);
  }
  if (g.y < -880.0) return mix(vec3(0.38, 0.36, 0.22), vec3(0.18, 0.27, 0.14), fbm(g * 0.004)) * vec3(1.0, 0.9, 0.8);   // Marin headlands
  bool park = (g.x < -8.0 && g.y > -110.0 && g.y < -30.0) ||             // Golden Gate Park
              (g.x > -8.0 && g.x < 110.0 && g.y > -60.0 && g.y < -52.0) || // the Panhandle
              length(g - vec2(40.0, 20.0)) < 14.0;                         // Buena Vista
  vec3 c;
  if (park) {
    c = vec3(0.16, 0.3, 0.12) * (0.7 + 0.5 * vnoise(g * 1.5));
  } else if (length(g - vec2(60.0, 190.0)) < 60.0) {
    c = vec3(0.42, 0.4, 0.26) * (0.8 + 0.3 * vnoise(g * 0.3));             // Twin Peaks
  } else {
    float fx = mod(g.x + 1.0, 12.5), fz = mod(g.y + 1.0, 27.0);          // streets every block
    vec2 blk = floor((g + 1.0) / vec2(12.5, 27.0));
    bool ns = fx < 2.0, ew = fz < 2.0;
    if (ns || ew) {
      float across = ns ? fx - 1.0 : fz - 1.0;
      // asphalt: grain, patched tar seams, and a manhole cover in the crossing, all fading with distance
      float fine = smoothstep(0.08, 0.01, fp);
      c = vec3(0.2, 0.2, 0.21) * (0.9 + 0.2 * vnoise(g * 2.0)) * mix(1.0, 0.8 + 0.35 * vnoise(g * 18.0), fine);
      c *= 1.0 - 0.45 * smoothstep(0.02, 0.0, abs(fbm(g * 1.3) - 0.5)) * fine;
      float hole = length(g - vec2(0.35, -0.4));
      c = mix(c, vec3(0.13, 0.12, 0.12) * (0.85 + 0.3 * step(0.5, fract((g.x + g.y) * 60.0))), smoothstep(0.032, 0.03, hole) * fine);
      // a mural painted in the middle of the crossing: flat spiral bands round a peace sign, worn by traffic
      float rr = length(g);
      if (rr < 0.56) {
        float s = rr * 7.0 + atan(g.y, g.x) / TAU * 3.0;
        vec3 paint = hsv(floor(s) / 6.0, 0.75, 0.92);
        paint = mix(paint, vec3(0.95, 0.92, 0.85), smoothstep(0.1, 0.0, min(fract(s), 1.0 - fract(s))));   // brush seams
        paint = mix(paint, vec3(0.95, 0.92, 0.85), smoothstep(0.02, 0.012, abs(rr - 0.53)) + smoothstep(0.125, 0.12, rr));
        float peace = min(abs(rr - 0.1), min(sdSeg(g, vec2(0.0, -0.1), vec2(0.0, 0.1)),
                          min(sdSeg(g, vec2(0.0), vec2(0.0707, 0.0707)), sdSeg(g, vec2(0.0), vec2(-0.0707, 0.0707)))));   // legs toward you (+z)
        paint = mix(paint, vec3(0.08), smoothstep(0.014, 0.01, peace) * step(rr, 0.115));
        float wear = smoothstep(0.4, 0.75, vnoise(g * 9.0) * 0.6 + vnoise(g * 40.0) * 0.4);
        c = mix(c, paint * 0.8, smoothstep(0.56, 0.55, rr) * (1.0 - 0.5 * wear));
      }
      if (abs(across) > 0.75 && !(ns && ew)) c = vec3(0.55, 0.53, 0.5);                  // sidewalk
      if (!(ns && ew) && abs(abs(across) - 0.035) < 0.014) c = vec3(0.85, 0.7, 0.15);     // double yellow
      float along = ns ? fz : fx;
      float span = ns ? 27.0 : 12.5;
      if (!(ns && ew) && (along < 2.4 || along > span - 0.4) && abs(across) < 0.75)
        c = mix(c, vec3(0.85), step(0.5, fract(across * 5.0)));                          // crosswalks
    } else {
      vec2 b = vec2(fx - 2.0, fz - 2.0);
      float edge = min(min(b.x, 10.5 - b.x), min(b.y, 25.0 - b.y));
      if (edge < 3.4) {
        bool onEW = min(b.y, 25.0 - b.y) < min(b.x, 10.5 - b.x);
        float lot = floor((onEW ? b.x : b.y) / 0.76);
        float hr = hash12(vec2(lot, blk.x * 17.0 + blk.y * 3.0 + (onEW ? 0.5 : 0.0)));
        c = mix(vec3(0.55, 0.52, 0.5), hsv(hr, 0.25, 0.85), 0.35) * (0.75 + 0.35 * hash12(vec2(lot, hr)));
        c *= 0.75 + 0.25 * smoothstep(0.0, 0.08, abs(fract((onEW ? b.x : b.y) / 0.76) - 0.5) * 2.0);
      } else {
        c = mix(vec3(0.24, 0.32, 0.16), vec3(0.4, 0.36, 0.3), vnoise(g * 2.0));           // backyards
      }
    }
    // lots and streets blur together once they are smaller than a pixel
    c = mix(c, vec3(0.56, 0.56, 0.57) * (0.8 + 0.35 * vnoise(g * 0.05)), smoothstep(0.4, 2.5, fp));
  }
  return c * vec3(1.0, 0.9, 0.8);
}

vec3 earthFar(vec2 g, float t) {
  vec2 q = g * 0.00003;
  float coastX = -0.0156 + 0.35 * (fbm(vec2(q.y * 0.8, 2.0)) - 0.5) - q.y * 0.25;
  float land = smoothstep(-0.01, 0.01, q.x - coastX + 0.12 * (fbm(q * 3.0) - 0.5));
  vec3 lc = mix(vec3(0.62, 0.52, 0.34), vec3(0.42, 0.4, 0.25), fbm(q * 6.0));
  lc = mix(lc, vec3(0.18, 0.3, 0.14), smoothstep(0.45, 0.75, fbm(q * 2.0 + 4.0)) * smoothstep(0.3, 1.2, q.x));  // Sierra forests
  lc = mix(lc, vec3(0.92), smoothstep(0.68, 0.8, fbm(q * 4.0 + 9.0)) * smoothstep(0.9, 1.5, q.x));               // snow on the crest
  vec3 c = mix(vec3(0.04, 0.12, 0.28), lc, land);
  float marine = smoothstep(0.4, 0.62, fbm(q * 5.0 + vec2(t * 0.002, 0.0))) * (1.0 - land);
  float scattered = smoothstep(0.62, 0.8, fbm(q * 9.0 - 3.0));
  return mix(c, vec3(0.95, 0.93, 0.9), max(marine, scattered) * 0.9) * vec3(1.0, 0.9, 0.8);
}

// The painted ladies lining both streets. Returns false when the ray misses them.
bool facade(vec3 d, float h, out vec3 col) {
  col = vec3(0.0);
  float hl = length(d.xz);
  if (hl < 1e-4 || h > 3.2) return false;
  vec2 hd = d.xz / hl;
  float ax = abs(hd.x), az = abs(hd.y);
  float tH = 1.0 / max(min(ax, az), 1e-4);   // horizontal distance to the first frontage
  float s = tH * max(ax, az);                // how far down the street that is
  if (s > 25.9) return false;                // past the block: the cross street
  float y = h + d.y / hl * tH;
  if (y < 0.0) return false;
  bool alongX = ax < az;
  float side = alongX ? (hd.x > 0.0 ? 0.0 : 1.0) : (hd.y > 0.0 ? 2.0 : 3.0);
  float half_ = alongX ? (hd.y > 0.0 ? 0.0 : 1.0) : (hd.x > 0.0 ? 0.0 : 1.0);
  float lu = (s - 1.0) / 0.76;
  float u = fract(lu);
  vec2 key = vec2(floor(lu), side * 2.0 + half_);
  float H = 0.95 + 0.4 * hash12(key + 3.7);
  bool gable = hash12(key + 9.1) > 0.45;
  float top = H + (gable ? 0.24 * (1.0 - abs(2.0 * u - 1.0)) : 0.04);
  if (y > top) return false;
  float dist = tH / hl;
  float px = dist * gPix;
  vec3 paint = hsv(hash12(key + 1.3), 0.32 + 0.25 * hash12(key + 5.5), 0.92);
  vec3 trim = vec3(0.95, 0.93, 0.88);
  vec3 accent = hsv(hash12(key + 7.7), 0.55, 0.55);
  vec3 c = paint;
  float fy = mod(y, 0.33);
  float storey = floor(y / 0.33);
  if (y > H) {
    c = gable ? mix(accent, trim, 0.4) : trim;
    if (gable && length(vec2((u - 0.5) * 0.76, y - H - 0.09)) < 0.045) c = vec3(0.15, 0.12, 0.2);  // oculus
  } else {
    c = mix(c, trim, smoothstep(0.014 + px, 0.014, min(fy, 0.33 - fy)) * step(0.2, y));
    if (y > H - 0.05) c = trim;
    if (y > H - 0.08 && y < H - 0.05) c = mix(c, accent, step(0.5, fract(u * 12.0)));   // dentils
    vec2 bw = vec2((u - 0.08) / 0.44, (fy - 0.06) / 0.21);
    vec2 sw = vec2((u - 0.62) / 0.26, (fy - 0.06) / 0.21);
    bool upper = y > 0.34 && y < H - 0.09;
    bool inBay = upper && bw.x > 0.0 && bw.x < 1.0 && bw.y > 0.0 && bw.y < 1.0;
    bool inOne = upper && sw.x > 0.0 && sw.x < 1.0 && sw.y > 0.0 && sw.y < 1.0;
    if (inBay || inOne) {
      vec2 w = inBay ? vec2(fract(bw.x * 3.0), bw.y) : sw;
      float lit = step(0.55, hash12(key + storey * 3.1 + (inBay ? floor(bw.x * 3.0) : 7.0)));
      vec3 glass = mix(vec3(0.5, 0.55, 0.7) * (0.6 + 0.4 * w.y), vec3(1.0, 0.72, 0.38) * (0.9 + 0.8 * uPulse), lit);
      c = mix(trim, glass, smoothstep(0.08, 0.14, min(min(w.x, 1.0 - w.x), min(w.y, 1.0 - w.y))));
    }
    if (y < 0.34) {
      if (u > 0.1 && u < 0.5 && y < 0.24) c = mix(accent, trim, 0.3) * (0.8 + 0.2 * step(0.5, fract(y * 30.0)));
      if (u > 0.62 && u < 0.86 && y > 0.08 && y < 0.3) c = accent * 0.6;
      if (u > 0.58 && u < 0.92 && y < 0.08) c = trim * (0.7 + 0.3 * step(0.5, fract(y * 40.0)));
    }
  }
  c *= mix(0.6, 1.0, smoothstep(0.0, 0.02 + px / 0.76, min(u, 1.0 - u)));
  vec3 n = alongX ? vec3(-sign(hd.x), 0.0, 0.0) : vec3(0.0, 0.0, -sign(hd.y));
  c *= vec3(0.42, 0.4, 0.48) + vec3(1.0, 0.78, 0.55) * max(dot(n, SUN), 0.0) * 0.95;
  col = mix(c, vec3(0.9, 0.75, 0.62), 1.0 - exp(-dist * 0.015));
  return true;
}

vec3 scene(vec3 d, float t) {
  float h = altitude(uJourney);
  float hd = sqrt(h * (2.0 * RE + h));   // distance to the horizon
  float dip = atan(hd / RE);
  vec3 col;
  if (facade(d, h, col)) return col;
  if (d.y < -sin(dip)) {
    float den = -(RE + h) * d.y;
    float tg = h * (2.0 * RE + h) / (den + sqrt(max(den * den - h * (2.0 * RE + h), 0.0)));
    vec2 g = d.xz * tg;
    float fp = tg * gPix / max(-d.y, 0.03);
    float far = smoothstep(20000.0, 80000.0, tg);
    col = far < 1.0 ? cityGround(g, fp, t) : vec3(0.0);
    if (far > 0.0) col = mix(col, earthFar(g, t), far);
    float k = exp(-h / 1500.0) / 3000.0 + 1.0 / 900000.0;
    vec3 haze = mix(vec3(0.95, 0.78, 0.62), vec3(0.55, 0.7, 0.95), smoothstep(100.0, 20000.0, h));
    col = mix(col, haze, 1.0 - exp(-tg * k));
  } else {
    float e = asin(clamp(d.y, -1.0, 1.0)) + dip;
    float air = max(exp(-h / 900.0), exp(-max(e, 0.0) * hd / 5000.0));
    col = mix(stars(d) * 1.2, daySky(d, e), air);
    col += vec3(0.35, 0.6, 1.0) * exp(-max(e, 0.0) * hd / 1500.0) * (1.0 - exp(-h / 900.0)) * 0.6;   // the limb
    if (h < 180.0 && d.y > 0.02) {
      vec2 cg = d.xz * ((180.0 - h) / d.y);
      float cov = smoothstep(0.55, 0.8, fbm(cg * 0.004 + vec2(t * 0.01, 0.0))) * exp(-length(cg) / 30000.0);
      col = mix(col, vec3(1.0, 0.82, 0.7) * (0.8 + 0.3 * max(dot(d, SUN), 0.0)), cov * 0.8);
    }
    float sd = max(dot(d, SUN), 0.0);
    col += vec3(1.0, 0.92, 0.75) * (smoothstep(0.99985, 0.99993, sd) * 8.0 + pow(sd, 400.0) * 1.5);
  }
  return col;
}
`;

// The journey is kept as a float and mirrored into its slider, which only shows whole tenths.
const JOURNEY_SECONDS = 90;
let journey = num('journey') / 100;
$('journey').addEventListener('input', () => { journey = num('journey') / 100; });
$('restart').addEventListener('click', () => { journey = 0; });

startSphere({
  glsl,
  pitch: 4,
  uniforms: { uJourney: () => journey },
  onFrame(_, dt) {
    if (!on('ascend')) return;
    journey = (journey + dt * num('speed') / JOURNEY_SECONDS) % 1;
    mirror('journey', (journey * 100).toFixed(1));
  },
});
