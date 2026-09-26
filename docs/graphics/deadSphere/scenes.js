// scenes.js — what plays on the dome. Each scene is one GLSL function
//   vec3 scene(vec3 d, float t)
// of the unit direction d from the Sphere's centre and the scene's own clock t.
// Each compiles into its own program (see shaders.js), so helper names only
// need to be unique within a scene. The list order is the autopilot setlist.

const liftoff = `
// Haight & Ashbury at golden hour, then straight up: rooftops, the city, the fog, orbit.
// Ground units are 10 m: x east, z south, the crossing at the origin.
const float RE = 637100.0;                           // Earth's radius
const vec3 SUN = vec3(-0.6215, 0.2205, -0.7518);     // low in the west-northwest

float altitude(float t) { return min(0.17 + 0.6 * (exp(max(t - 8.0, 0.0) * 0.33) - 1.0), 42000.0); }

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
      c = vec3(0.2, 0.2, 0.21);
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
  t = mod(t, 80.0);
  float h = altitude(t);
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

const wall = `
// The Wall of Sound wrapped around the dome: amps, then woofers, mids and tweeters to the crown.
vec3 wash(vec3 d, float t) {
  vec3 w = vec3(0.0);
  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    vec3 c = dirAzEl(sin(t * 0.13 + fi * 1.9) * 1.3 + fi * 1.2566 - 2.5, 0.25 + 0.3 * sin(t * 0.21 + fi * 2.7));
    float a = acos(clamp(dot(d, c), -1.0, 1.0));
    w += rainbow(fi * 0.21 + t * 0.015) * exp(-a * a * 5.0);
  }
  return w;
}

vec3 cone(vec2 q, float R, float px, float pump, float ring, vec3 L) {
  float r = length(q) / R, aa = px / R + 0.002;
  float lit = 0.5 + 0.5 * dot(normalize(q + 1e-6), vec2(-0.45, -0.9));   // the bowl's lower wall faces the light
  vec3 c = vec3(0.02);
  c = mix(c, vec3(0.03) + L * 0.05 * lit, smoothstep(1.0 + aa, 1.0 - aa, r));
  float paper = smoothstep(0.86 + aa, 0.86 - aa, r);
  c = mix(c, vec3(0.07, 0.068, 0.065) * (0.85 + 0.15 * sin(atan(q.y, q.x) * 24.0)) + L * (0.05 + 0.18 * lit * (1.0 - r)), paper);
  vec2 hq = q / R - vec2(-0.08, 0.1);
  float cap = smoothstep(0.3 + aa, 0.3 - aa, r);
  c = mix(c, vec3(0.1) + L * (0.25 + 1.4 * pump) + exp(-dot(hq, hq) * 90.0) * (0.6 + pump), cap);
  c += L * exp(-pow((r - ring) * 14.0, 2.0)) * (1.0 - ring) * paper * 0.8;   // pressure ring
  c += vec3(0.5) * smoothstep(0.035 + aa, 0.0, abs(r - 1.05)) * (0.3 + 0.7 * lit);  // chrome trim
  return c;
}

vec3 scene(vec3 d, float t) {
  vec2 ae = azel(d);
  float el = clamp(ae.y, -1.3, 1.3);
  const float COLS = 44.0;
  vec2 g = vec2(ae.x / TAU * COLS + t * 0.06, asinh(tan(el)) / TAU * COLS);   // Mercator: square cabinets
  vec2 id = floor(g), f = fract(g) - 0.5;
  float cellPx = gPix / (TAU / COLS * cos(el));
  vec3 L = wash(d, t) * 1.3 + 0.08;
  float sa = acos(clamp(dot(d, normalize(vec3(0.0, -0.45, -1.0))), -1.0, 1.0));
  L += vec3(1.0, 0.95, 0.85) * exp(-pow((sa - fract(uBeat) * 2.6) * 5.0, 2.0)) * (1.0 - fract(uBeat)) * 0.9;
  float pump = uPulse, ring = fract(uBeat);
  float face = smoothstep(0.46 + cellPx, 0.46 - cellPx, max(abs(f.x), abs(f.y)));
  vec3 col = mix(vec3(0.004), vec3(0.055, 0.04, 0.03) + L * 0.02, face);
  if (id.y < -1.5) {
    // amplifiers: black glass, blue meters, green logo, silver handles
    col = mix(col, vec3(0.01), face * 0.8);
    vec2 m = vec2(abs(f.x) - 0.2, f.y - 0.07);
    float lvl = clamp(0.25 + 0.55 * uLevel * (0.7 + 0.6 * hash12(id + step(0.0, f.x))) + 0.3 * pump, 0.0, 1.0);
    vec3 meter = vec3(0.1, 0.5, 1.0) * (0.9 + 0.3 * (1.0 - length(m / vec2(0.15, 0.1))));
    float needle = sdSeg(m, vec2(0.0, -0.09), vec2(0.0, -0.09) + 0.17 * vec2(sin((lvl - 0.5) * 1.6), cos((lvl - 0.5) * 1.6)));
    meter = mix(meter, vec3(0.02), smoothstep(0.008 + cellPx, 0.0, needle));
    col = mix(col, meter, smoothstep(cellPx, -cellPx, max(abs(m.x) - 0.15, abs(m.y) - 0.1)));
    col = mix(col, vec3(0.2, 1.0, 0.45), smoothstep(cellPx, -cellPx, max(abs(f.x) - 0.12, abs(f.y + 0.2) - 0.018)) * 0.9);
    col = mix(col, vec3(0.35) + L * 0.2, smoothstep(0.045 + cellPx, 0.045, length(vec2(abs(f.x) - 0.3, f.y + 0.3))));
    col = mix(col, vec3(0.7) + L * 0.3, smoothstep(cellPx, 0.0, max(abs(abs(f.x) - 0.44) - 0.015, abs(f.y) - 0.3)));
  } else if (id.y < 6.5) {
    col = mix(col, cone(f, 0.38, cellPx, pump, ring, L), face);
  } else if (id.y < 10.5) {
    col = mix(col, cone(fract(f * 2.0 + 0.5) - 0.5, 0.38, cellPx * 2.0, pump, ring, L), face);
  } else if (id.y < 14.5) {
    col = mix(col, cone(fract(f * 3.0 + 0.5) - 0.5, 0.34, cellPx * 3.0, pump * 0.7, ring, L), face);
  }
  vec3 crown = L * 0.6 + vec3(1.0, 0.9, 0.7) * (0.2 + 0.8 * pump) * exp(-(1.5708 - ae.y) * 5.0);
  return mix(col, crown, smoothstep(1.2, 1.38, ae.y));
}
`;

const darkStar = `
// A black hole above the stage: lensed nebula, photon ring, accretion disk.
const vec3 BH = vec3(0.0, 0.3872, -0.9220);
const vec3 BH_V = vec3(0.0, 0.9220, 0.3872);

vec3 nebula(vec3 q, float t) {
  float n1 = fbm3(q * 1.8 + vec3(0.0, 0.0, t * 0.01));
  float n2 = fbm3(q * 3.7 + n1 * 1.6 + 5.0);
  vec3 c = mix(vec3(0.02, 0.0, 0.06), vec3(0.55, 0.06, 0.4), smoothstep(0.35, 0.75, n1));
  c = mix(c, vec3(0.05, 0.4, 0.6), smoothstep(0.5, 0.85, n2) * 0.8);
  c = mix(c, vec3(1.0, 0.55, 0.2), smoothstep(0.72, 0.9, n1 * n2 * 1.6) * 0.6);
  c *= smoothstep(0.2, 0.65, n1 * 0.6 + n2 * 0.5);
  c *= 1.0 - 0.75 * smoothstep(0.55, 0.72, fbm3(q * 7.0 + 3.0));   // dust lanes
  return c * 1.1;
}

vec3 scene(vec3 d, float t) {
  float Rs = 0.1 * (1.0 + 0.05 * uPulse);
  float a = acos(clamp(dot(d, BH), -1.0, 1.0));
  // light bends toward the hole, so each pixel sees sky from nearer it (or from across it)
  vec3 ld = d;
  vec3 k = cross(BH, d);
  float kl = length(k);
  if (kl > 1e-5) {
    k /= kl;
    float defl = min(2.2 * Rs * Rs / max(a, Rs), 2.5);
    ld = normalize(d * cos(defl) - cross(k, d) * sin(defl));
  }
  float spin = t * 0.01;
  vec3 q = vec3(ld.x * cos(spin) - ld.z * sin(spin), ld.y, ld.x * sin(spin) + ld.z * cos(spin));
  vec3 col = nebula(q, t) + stars(q) * 1.1;

  vec2 w = vec2(d.x, dot(d, BH_V));
  w = w / max(length(w), 1e-6) * a;              // angular offset from the hole
  vec2 e = vec2(w.x, w.y / 0.2);                 // the disk, tilted nearly edge-on
  float rr = length(e) / Rs;
  float ang = atan(e.y, e.x) - t * 1.6 / pow(max(rr, 1.0), 1.5);
  float tex = fbm3(vec3(cos(ang) * 2.5, sin(ang) * 2.5, rr * 2.2));
  vec3 dc = mix(vec3(1.0, 0.35, 0.08), vec3(1.0, 0.92, 0.75), clamp(1.6 - rr * 0.3, 0.0, 1.0)) * (0.5 + tex);
  float doppler = 1.0 - 0.75 * e.x / max(length(e), 1e-4);   // the approaching side is brighter
  dc *= doppler * (1.1 + 0.9 * uPulse) * smoothstep(1.5, 1.7, rr) * smoothstep(5.0, 3.6, rr);
  // the far side of the disk, lensed up and over the shadow
  float ha = atan(w.y, w.x);
  float halo = smoothstep(1.0, 1.12, a / Rs) * smoothstep(2.1, 1.25, a / Rs);
  vec3 hc = vec3(1.0, 0.65, 0.4) * halo * (0.35 + 0.65 * smoothstep(-0.3, 0.9, sin(ha))) *
            (0.8 + 0.6 * fbm3(vec3(cos(ha - t * 0.4) * 3.0, sin(ha - t * 0.4) * 3.0, 1.0)));
  if (w.y > 0.0) col += dc;
  col += hc * (1.0 + 0.5 * uPulse);
  col *= 1.0 - smoothstep(Rs + gPix, Rs - gPix, a);
  col += vec3(1.0, 0.85, 0.6) * exp(-pow((a - Rs * 1.04) / (0.003 + gPix), 2.0)) * 1.2;   // photon ring
  if (w.y <= 0.0) col += dc;
  float ph = fract(uBeat * 0.5);
  col += vec3(0.2, 0.6, 1.0) * exp(-pow((a - Rs * 1.5 - ph * 1.4) * 18.0, 2.0)) * (1.0 - ph) * 0.35;  // ripples on the beat
  return col;
}
`;

const tieDye = `
// A loxodrome tie-dye spiral running pole to pole through the focus.
vec3 dye(float i) {
  i = mod(i, 6.0);
  return i < 1.0 ? vec3(0.88, 0.08, 0.2) : i < 2.0 ? vec3(1.0, 0.45, 0.04) : i < 3.0 ? vec3(1.0, 0.84, 0.1)
       : i < 4.0 ? vec3(0.1, 0.72, 0.32) : i < 5.0 ? vec3(0.1, 0.36, 0.92) : vec3(0.52, 0.14, 0.76);
}

vec3 scene(vec3 d, float t) {
  vec2 p = focusPlane(d);
  float r = length(p) + 1e-5;
  float a = atan(p.y, p.x);
  float warp = fbm3(d * 3.2 + vec3(0.0, t * 0.03, 0.0));
  float s = a / TAU * 3.0 + log(r) * 0.85 - t * 0.07 + 0.45 * warp + 0.06 * uPulse;
  float b = s * 6.0;
  float fw = 6.0 * length(fwidth(p)) / r * (3.0 / TAU + 0.85);   // band density, free of the atan seam
  float fb = fract(b);
  float bleed = 0.1 + 0.35 * fbm3(d * 8.0 + 2.0);
  vec3 col = mix(dye(floor(b)), dye(floor(b) + 1.0), smoothstep(1.0 - bleed, 1.0, fb));
  float fold = abs(sin(a * 6.0 + 2.5 * warp + log(r) * 0.5));
  col = mix(col, vec3(0.97, 0.94, 0.9), smoothstep(0.12, 0.0, fold) * smoothstep(0.3, 0.7, fbm3(d * 14.0)) * 0.75);
  col *= 0.72 + 0.4 * fbm3(d * 26.0 + 5.0);
  col = mix(col, vec3(0.62, 0.45, 0.5), smoothstep(0.35, 1.2, fw));
  return mix(col, vec3(1.0, 0.97, 0.9), smoothstep(0.05 + 0.03 * uPulse, 0.0, r));
}
`;

const liquid = `
// Oil, water and dye on an overhead projector: domain-warped color with drifting oil blobs.
vec3 oil(float i) {
  i = mod(i, 5.0);
  return i < 1.0 ? vec3(0.95, 0.1, 0.45) : i < 2.0 ? vec3(1.0, 0.62, 0.05) : i < 3.0 ? vec3(0.1, 0.85, 0.55)
       : i < 4.0 ? vec3(0.2, 0.3, 1.0) : vec3(0.75, 0.2, 0.95);
}

vec3 scene(vec3 d, float t) {
  vec2 p = rot(t * 0.02) * focusPlane(d) * 1.5;
  p = p / (1.0 + 0.15 * dot(p, p));
  vec2 q = p + 1.1 * vec2(fbm(p * 1.3 + vec2(0.0, t * 0.05)), fbm(p * 1.3 + vec2(5.2, 1.3) - t * 0.04));
  float n = fbm(q * 1.7 + vec2(t * 0.03, -t * 0.02));
  vec3 bg = pal(n * 1.3 + t * 0.012, vec3(0.5), vec3(0.5), vec3(1.0), vec3(0.0, 0.15, 0.3)) * (0.15 + 0.95 * n * n);
  float F = 0.0;
  vec3 C = vec3(0.0);
  vec2 grad = vec2(0.0);
  for (int i = 0; i < 10; i++) {
    float fi = float(i);
    vec2 c = vec2(sin(t * (0.05 + 0.011 * fi) + fi * 2.1), cos(t * (0.04 + 0.013 * fi) + fi * 1.3)) * (0.3 + 0.09 * fi);
    float rr = (0.12 + 0.07 * hash11(fi * 7.3)) * (1.0 + 0.2 * uPulse);
    vec2 dp = p - c;
    float w = rr * rr / (dot(dp, dp) + 1e-4);
    F += w;
    C += w * oil(fi);
    grad -= 2.0 * w * w / (rr * rr) * dp;
  }
  float e = F - 1.0;
  float px = fwidth(F) + 1e-4;
  float m = smoothstep(-px, px, e);
  vec3 nrm = normalize(vec3(-grad * 0.05, 1.0));
  float spec = pow(max(dot(nrm, normalize(vec3(-0.35, 0.45, 1.0))), 0.0), 40.0);
  vec3 inside = C / max(F, 1e-4) * (0.55 + 0.6 * nrm.z) * (0.85 + 0.3 * fbm(p * 6.0 + t * 0.1));
  vec2 bq = p * 14.0;
  vec2 bid = floor(bq);
  vec2 bf = fract(bq) - 0.5 - (hash22(bid) - 0.5) * 0.5;
  inside += step(0.8, hash12(bid)) * smoothstep(0.09, 0.06, abs(length(bf) - 0.1)) * 0.5;   // trapped bubbles
  return mix(bg, inside, m) + rainbow(F * 1.8 - t * 0.12) * exp(-abs(e) * 9.0) * 0.55 + spec * m * 0.7;
}
`;

const fire = `
// Fire on the Mountain: a ridge ringing the dome, an erupting peak dead ahead, embers rising.
vec3 fireRamp(float x) { x = clamp(x, 0.0, 1.5); return vec3(1.6 * x, 1.2 * x * x, 0.9 * x * x * x * x) * 1.1; }

float ridgeAt(float az) {
  vec2 cs = vec2(cos(az), sin(az));
  float r = 0.03 + 0.12 * fbm3(vec3(cs * 2.2, 0.5)) + 0.05 * fbm3(vec3(cs * 7.0, 3.0));
  return r + 0.36 * exp(-az * az * 3.5) - 0.05 * exp(-az * az * 180.0);   // the mountain and its crater
}

vec3 scene(vec3 d, float t) {
  vec2 ae = azel(d);
  float az = ae.x, el = ae.y;
  float hh = el - ridgeAt(az);
  vec2 cs = vec2(cos(az), sin(az));
  vec3 col = mix(vec3(0.16, 0.02, 0.02), vec3(0.01, 0.0, 0.03), smoothstep(-0.1, 1.0, hh));
  col += stars(d) * smoothstep(0.4, 1.0, el) * 0.8;
  float smoke = fbm3(vec3(cs * 2.0, el * 2.5 - t * 0.05) + 1.0);
  col = mix(col, vec3(0.35, 0.08, 0.03) * (1.0 + uPulse), smoothstep(0.45, 0.8, smoke) * exp(-max(hh, 0.0) * 1.2) * 0.8);
  float column = exp(-az * az * 40.0);
  float height = 0.12 + 0.35 * column + 0.08 * uPulse + 0.06 * uLevel;
  float n = fbm3(vec3(cs * 5.0, hh * 5.0 - t * 1.4)) * 0.6 + fbm3(vec3(cs * 11.0, hh * 9.0 - t * 2.2)) * 0.4;
  col += fireRamp(clamp(n * 1.25 - hh / height, 0.0, 1.5) * step(-0.02, hh) * 1.2);
  for (int i = 0; i < 2; i++) {
    float fi = float(i), sc = 26.0 + fi * 14.0;
    vec2 g = vec2(az * sc, el * sc - t * (1.2 + fi * 0.7));
    vec2 id = floor(g);
    vec2 f = fract(g) - 0.5 - (hash22(id + fi * 31.0) - 0.5) * 0.6;
    f.x += 0.15 * sin(t * 2.0 + id.y);
    float spark = exp(-dot(f, f) * 240.0) * step(0.82, hash12(id + fi * 7.0));
    col += vec3(1.0, 0.55, 0.15) * spark * smoothstep(0.8, 0.0, hh) * step(0.0, hh) * 1.5;
  }
  if (hh < 0.0) {
    // lava runs downhill: veins stretched vertically, brightest under the crater
    float veins = abs(fbm3(vec3(cs * 9.0, el * 1.2 + t * 0.03)) - 0.5);
    float lava = smoothstep(0.03, 0.0, veins) * exp(hh * 4.0) * (0.7 + 0.6 * uPulse) * (0.3 + column * 1.8);
    float strata = fbm3(vec3(cs * 16.0, el * 20.0));
    col = vec3(0.03, 0.014, 0.012) * (0.5 + strata) + vec3(0.3, 0.06, 0.01) * exp(hh * 16.0) + fireRamp(lava) * 0.9;
  }
  return col;
}
`;

const bears = `
// Rings of dancing bears circling a seventies sunburst.
float sdCap2(vec2 p, vec2 a, vec2 b, float r) { return sdSeg(p, a, b) - r; }

float bear(vec2 p, float ph) {
  float s1 = sin(ph), s2 = sin(ph + PI);
  float d = sdEllipse(p - vec2(0.0, -0.03), vec2(0.18, 0.23));
  d = smin(d, length(p - vec2(0.07, 0.28)) - 0.13, 0.05);
  d = smin(d, sdEllipse(p - vec2(0.2, 0.25), vec2(0.08, 0.055)), 0.03);
  d = min(d, length(p - vec2(-0.02, 0.4)) - 0.05);
  d = smin(d, sdCap2(p, vec2(0.06, 0.12), vec2(0.24, 0.17 + 0.12 * s1), 0.045), 0.02);
  d = smin(d, sdCap2(p, vec2(-0.06, 0.12), vec2(-0.2, 0.2 + 0.12 * s2), 0.045), 0.02);
  d = smin(d, sdCap2(p, vec2(0.06, -0.2), vec2(0.13 + 0.07 * s1, -0.47 + 0.12 * max(s1, 0.0)), 0.06), 0.02);
  d = smin(d, sdCap2(p, vec2(-0.06, -0.2), vec2(-0.1 - 0.07 * s1, -0.47 + 0.12 * max(s2, 0.0)), 0.06), 0.02);
  return d;
}

vec3 bearCol(float i) {
  i = mod(i, 6.0);
  return i < 1.0 ? vec3(0.92, 0.16, 0.2) : i < 2.0 ? vec3(1.0, 0.55, 0.08) : i < 3.0 ? vec3(1.0, 0.86, 0.15)
       : i < 4.0 ? vec3(0.2, 0.78, 0.3) : i < 5.0 ? vec3(0.2, 0.45, 0.95) : vec3(0.95, 0.4, 0.72);
}

vec3 scene(vec3 d, float t) {
  vec2 p = focusPlane(d);
  float r = length(p), a = atan(p.y, p.x);
  float rayW = length(fwidth(p)) / max(r, 1e-3) * 14.0;
  float rays = mix(smoothstep(-0.1, 0.1, sin(a * 14.0 + t * 0.15)), 0.5, smoothstep(0.3, 1.0, rayW));
  vec3 col = mix(vec3(1.0, 0.58, 0.22), vec3(0.98, 0.36, 0.38), rays * 0.55);
  col = mix(col, vec3(0.32, 0.12, 0.5), smoothstep(0.3, 2.2, r));
  col = mix(col, vec3(1.0, 0.9, 0.45) * (1.0 + 0.3 * uPulse), smoothstep(0.17, 0.16, r));
  col = mix(col, vec3(1.0, 0.75, 0.3), smoothstep(0.012, 0.0, abs(r - 0.21 - 0.02 * uPulse)));
  vec2 ae = azel(d);
  for (int k = 0; k < 3; k++) {
    float fk = float(k);
    float elk = k == 0 ? 0.1 : (k == 1 ? 0.62 : 1.05);
    float N = k == 0 ? 16.0 : (k == 1 ? 11.0 : 6.0);
    float dir = k == 1 ? -1.0 : 1.0;
    float S = TAU / N * cos(elk) * 0.68;        // a bear's height, in radians
    float u = ae.x / TAU * N - dir * t * (0.05 + 0.02 * fk);
    float id = floor(u);
    float ph = uBeat * PI + id * 1.7 + fk;
    vec2 bq = vec2((fract(u) - 0.5) * TAU / N * cos(ae.y) * dir, ae.y - elk) / S;
    bq.y -= 0.035 * abs(sin(ph));
    float sd = bear(bq, ph);
    if (sd < 0.05) {
      float px = gPix / S;
      vec3 fill = bearCol(id + fk * 2.0) * (0.85 + 0.3 * smoothstep(0.2, -0.3, bq.y - bq.x * 0.3));
      fill = mix(fill, vec3(1.0), smoothstep(0.03, 0.0, length(bq - vec2(0.02, 0.33)) - 0.02) * 0.35);
      vec3 c = mix(vec3(0.03), fill, smoothstep(px, -px, sd + 0.028));   // black outline
      c = mix(c, vec3(0.02), smoothstep(px, -px, length(bq - vec2(0.12, 0.31)) - 0.024));   // eye
      c = mix(c, vec3(0.02), smoothstep(px, -px, length(bq - vec2(0.275, 0.26)) - 0.028));  // nose
      col = mix(col, c, smoothstep(px, -px, sd));
    }
  }
  return col;
}
`;

const eyes = `
// Eyes of the World: one great eye where you look, a world of smaller ones around it.
vec3 eyeBall(vec2 q, float open, vec2 gaze, float hue, float dil, float px, out float mask) {
  float xx = 1.0 - q.x * q.x;
  float lidT = 0.55 * xx * open, lidB = -0.42 * xx * open;
  float inside = min(lidT - q.y, q.y - lidB);
  float sx = 1.0 - q.x * q.x / 1.3225;
  float socket = min(0.7 * sx - q.y, q.y + 0.55 * sx);
  mask = smoothstep(-px, px, socket);
  vec3 c = hsv(hue + 0.55, 0.45, 0.35) * (0.6 + 0.4 * smoothstep(0.0, 0.3, socket));
  vec2 iq = q - gaze;
  float ri = length(iq);
  vec3 ball = vec3(0.96, 0.93, 0.9) * (0.55 + 0.45 * smoothstep(0.0, 0.22, inside));
  float vein = smoothstep(0.03, 0.0, abs(fbm(q * 7.0 + hue * 10.0) - 0.5)) * smoothstep(0.25, 0.8, abs(q.x));
  ball = mix(ball, vec3(0.8, 0.15, 0.15), vein * 0.5);
  if (ri < 0.38) {
    float ang = atan(iq.y, iq.x);
    float fib = fbm3(vec3(cos(ang) * 4.0, sin(ang) * 4.0, ri * 9.0 + hue * 5.0));
    float streak = 0.5 + 0.5 * sin(ang * 50.0 + fib * 8.0);
    vec3 ic = mix(hsv(hue, 0.75, 0.35), hsv(hue + 0.08, 0.7, 0.95), fib * 0.7 + streak * 0.3);
    ic = mix(ic, vec3(0.95, 0.65, 0.2), smoothstep(0.22, 0.12, ri) * 0.6);   // golden collarette
    ic *= smoothstep(0.37, 0.3, ri) * 0.65 + 0.35;                           // limbal ring
    float PR = 0.1 + 0.07 * dil;
    ic = mix(ic, vec3(0.005), smoothstep(PR + px, PR - px, ri));
    ball = mix(ball, ic, smoothstep(0.36 + px, 0.36 - px, ri));
  }
  ball += smoothstep(0.06 + px, 0.05, length(iq - vec2(-0.12, 0.13))) * 0.9;   // catchlights
  ball += smoothstep(0.025 + px, 0.02, length(iq - vec2(0.1, -0.1))) * 0.6;
  ball *= 0.55 + 0.45 * smoothstep(0.0, 0.16, lidT - q.y);
  c = mix(c, ball, smoothstep(-px, px, inside));
  c = mix(c, vec3(0.02), smoothstep(0.03 + px, 0.0, abs(lidT - q.y)) * step(abs(q.x), 1.0));   // lash line
  return c;
}

float blink(float t, float period, float off) { return smoothstep(0.02, 0.16, abs(mod(t + off, period) - 0.2)); }

vec3 scene(vec3 d, float t) {
  vec2 p = focusPlane(d);
  vec3 col = mix(vec3(0.03, 0.0, 0.07), vec3(0.12, 0.02, 0.18), fbm3(d * 2.0 + t * 0.02)) + stars(d) * 0.6;
  vec2 ae = azel(d);
  const float COLS = 18.0;
  vec2 g = vec2(ae.x / TAU * COLS, asinh(tan(clamp(ae.y, -1.35, 1.35))) / TAU * COLS);
  vec2 id = floor(g), f = fract(g) - 0.5;
  float cell = TAU / COLS * cos(ae.y);
  float h = hash12(id + 4.0);
  vec2 cc = (id + 0.5) / COLS * TAU;                     // the cell's centre: azimuth, Mercator y
  vec3 centre = dirAzEl(cc.x, atan(sinh(cc.y)));
  if (h > 0.3 && length(focusPlane(centre)) > 0.75 && cc.y < 2.2) {
    float m;
    vec2 gaze = 0.18 * vec2(sin(t * 0.4 + h * 20.0), 0.6 * cos(t * 0.3 + h * 13.0));
    vec3 e = eyeBall((f - (hash22(id) - 0.5) * 0.12) / 0.3, blink(t, 3.0 + 5.0 * h, h * 17.0), gaze, h + t * 0.01, uPulse, gPix / (cell * 0.3), m);
    col = mix(col, e, m);
  }
  col += vec3(0.5, 0.25, 0.9) * exp(-max(length(p) - 0.55, 0.0) * 8.0) * (0.25 + 0.4 * uPulse);
  float bm;
  vec2 gaze = vec2(0.22 * sin(t * 0.21) + 0.1 * sin(t * 0.73), 0.1 * sin(t * 0.17));
  vec3 big = eyeBall(p / 0.5, blink(t, 7.0, 3.0), gaze, 0.5 + t * 0.005, uPulse, gPix * (1.0 + dot(p, p)), bm);
  return mix(col, big, bm);
}
`;

const bolt = `
// A red-and-blue disc split by a white lightning bolt, a ring of small bolts, arcs on the beat.
const vec2 BOLT[11] = vec2[11](vec2(-0.10, 1.00), vec2(0.16, 1.00), vec2(0.00, 0.42), vec2(0.22, 0.42),
  vec2(0.04, -0.10), vec2(0.21, -0.10), vec2(-0.10, -1.00), vec2(-0.02, -0.28), vec2(-0.19, -0.28),
  vec2(-0.01, 0.24), vec2(-0.18, 0.24));

float sdBolt(vec2 p) {
  float d = dot(p - BOLT[0], p - BOLT[0]);
  float s = 1.0;
  int j = 10;
  for (int i = 0; i < 11; i++) {
    vec2 e = BOLT[j] - BOLT[i], w = p - BOLT[i];
    vec2 b = w - e * clamp(dot(w, e) / dot(e, e), 0.0, 1.0);
    d = min(d, dot(b, b));
    bvec3 c = bvec3(p.y >= BOLT[i].y, p.y < BOLT[j].y, e.x * w.y > e.y * w.x);
    if (all(c) || all(not(c))) s = -s;
    j = i;
  }
  return s * sqrt(d);
}

vec3 scene(vec3 d, float t) {
  vec2 p = focusPlane(d);
  float r0 = length(p), a0 = atan(p.y, p.x);
  float px0 = gPix * 0.5 * (1.0 + r0 * r0);
  vec3 col = mix(vec3(0.05, 0.02, 0.14), vec3(0.0, 0.0, 0.02), smoothstep(0.3, 2.5, r0));
  col += vec3(0.2, 0.3, 0.9) * pow(max(0.0, sin(a0 * 13.0 + t * 0.4)), 12.0) * smoothstep(0.1, 0.5, r0) * exp(-r0 * 0.8) * (0.4 + 0.6 * uPulse);
  float sector = TAU / 13.0;
  float aa = mod(a0 + t * 0.12, sector) - sector * 0.5;
  vec2 sp = vec2(cos(aa), sin(aa)) * r0;
  float mb = sdBolt(vec2(-sp.y, sp.x - 0.64) / 0.1) * 0.1;
  col += vec3(0.5, 0.75, 1.0) * (smoothstep(px0, -px0, mb) * (0.6 + 0.8 * uPulse) + exp(-max(mb, 0.0) * 60.0) * 0.35);
  float bt = floor(uBeat), bf = fract(uBeat);
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float ang = hash11(bt * 7.1 + fi * 3.3) * TAU;
    float sda = (mod(a0 - ang + PI, TAU) - PI) * r0;
    float arc = abs(sda - (fbm(vec2(r0 * 9.0, bt + fi * 5.0)) - 0.5) * 0.18 * r0);
    col += vec3(0.7, 0.8, 1.0) * (exp(-arc * 180.0) + exp(-arc * 25.0) * 0.25) * (1.0 - bf) * step(0.46, r0) * step(r0, 1.6);
  }
  // the emblem flips like a coin every sixteen beats
  float sx = cos(smoothstep(0.86, 1.0, fract(uBeat / 16.0)) * TAU);
  float sxs = sign(sx) * max(abs(sx), 0.03);
  vec2 q = p / (0.4 * (1.0 + 0.025 * uPulse));
  q.x /= sxs;
  float r = length(q);
  float px = px0 / 0.4 / abs(sxs);
  col += vec3(0.5, 0.6, 1.0) * exp(-max(length(p) / 0.4 - 1.12, 0.0) * 6.0) * (0.25 + 0.5 * uPulse);
  if (r < 1.2) {
    float xm = q.y < -0.1 ? mix(-0.08, 0.03, (q.y + 1.0) / 0.9) : 0.0;
    vec3 em = (q.x < xm ? vec3(0.85, 0.08, 0.12) : vec3(0.1, 0.3, 0.85)) * (0.85 + 0.25 * smoothstep(1.0, 0.0, r));
    float bd = sdBolt(q);
    em = mix(em, vec3(0.02), smoothstep(px, -px, bd - 0.035));
    em = mix(em, vec3(0.97, 0.95, 0.9), smoothstep(px, -px, bd));
    em = mix(em, vec3(0.02), smoothstep(px, -px, abs(r - 1.0) - 0.012));
    em = mix(em, vec3(0.97, 0.95, 0.9), smoothstep(px, -px, abs(r - 1.05) - 0.035));
    em = mix(em, vec3(0.02), smoothstep(px, -px, abs(r - 1.1) - 0.015));
    em *= sx < 0.0 ? 0.55 : 1.0;
    col = mix(col, em, smoothstep(px, -px, r - 1.115));
  }
  return col;
}
`;

const roses = `
// Scarlet roses: one great bloom where you look, a garden of smaller roses and leaves, falling petals.
vec3 rose(vec2 q, float seed, float px, out float m) {
  float r = length(q), a = atan(q.y, q.x);
  float outer = 0.995 * (0.8 + 0.2 * sqrt(sin(fract(a / TAU * 6.0 + 1.85 + seed) * PI)));
  m = smoothstep(px, -px, r - outer);
  vec3 deep = vec3(0.22, 0.0, 0.03), mid = vec3(0.75, 0.03, 0.09), lite = vec3(1.0, 0.32, 0.3);
  vec3 col = deep;
  if (r > 1.0) return col;
  for (int n = 0; n < 6; n++) {
    float fn = float(n);
    float R = 0.22 + 0.155 * fn;
    float ph = fract(a / TAU * (3.0 + floor(fn * 0.7)) + fn * 0.37 + seed);
    float edge = R * (0.8 + 0.2 * sqrt(sin(ph * PI)));
    if (r < edge) {
      float inner = n == 0 ? 0.0 : (R - 0.155) * 0.56;
      float k = clamp((r - inner) / max(edge - inner, 1e-3), 0.0, 1.0);
      col = mix(deep, mid, smoothstep(0.0, 0.75, k));
      col = mix(col, lite, smoothstep(0.78, 1.0, k) * 0.65);
      col *= mix(0.4, 1.0, smoothstep(0.0, 0.012 + px, edge - r));
      col *= 0.8 + 0.2 * smoothstep(0.0, 0.2, min(ph, 1.0 - ph));
      if (n == 0 && r < 0.16) col = mix(deep, mid, 0.5 + 0.5 * sin(a + r * 60.0));   // the bud
      break;
    }
  }
  return col;
}

float sdVesica(vec2 p, float r, float dd) {
  p = abs(p);
  float b = sqrt(r * r - dd * dd);
  return (p.y - b) * dd > p.x * b ? length(p - vec2(0.0, b)) : length(p - vec2(-dd, 0.0)) - r;
}

vec3 scene(vec3 d, float t) {
  vec2 p = focusPlane(d);
  vec2 ae = azel(d);
  vec3 col = mix(vec3(0.01, 0.04, 0.02), vec3(0.03, 0.0, 0.02), smoothstep(-0.3, 1.2, ae.y));
  col *= 0.7 + 0.6 * fbm3(d * 3.0 + t * 0.02);
  const float COLS = 22.0;
  vec2 g = vec2(ae.x / TAU * COLS + t * 0.02, asinh(tan(clamp(ae.y, -1.35, 1.35))) / TAU * COLS);
  vec2 id = floor(g), f = fract(g) - 0.5;
  float cell = TAU / COLS * cos(ae.y);
  float px = gPix / cell;
  for (int i = 0; i < 2; i++) {
    float ang = hash12(id + float(i) * 3.1) * TAU;
    vec2 lp = rot(-ang) * f - vec2(0.0, 0.26);
    float ld = sdVesica(lp / 0.2, 1.0, 0.7) * 0.2;
    vec3 leaf = mix(vec3(0.03, 0.14, 0.05), vec3(0.1, 0.32, 0.1), smoothstep(-0.12, 0.2, lp.y));
    leaf = mix(leaf, vec3(0.16, 0.4, 0.14), smoothstep(0.006 + px, 0.0, abs(lp.x)) * 0.7);   // vein
    col = mix(col, leaf, smoothstep(px, -px, ld));
  }
  float h = hash12(id);
  vec2 cc = vec2((id.x + 0.5) / COLS * TAU - t * 0.02 / COLS * TAU, atan(sinh((id.y + 0.5) / COLS * TAU)));
  if (h > 0.3 && length(focusPlane(dirAzEl(cc.x, cc.y))) > 0.66) {
    float m;
    float rr = 0.3 + 0.12 * hash12(id + 7.0);
    vec3 rc = rose(rot(t * 0.05 * (h - 0.5) + h * 6.0) * (f - (hash22(id) - 0.5) * 0.12) / rr, h * 3.0, px / rr, m);
    col = mix(col, rc * (1.0 + 0.25 * uPulse), m);
  }
  for (int i = 0; i < 2; i++) {
    float fi = float(i), sc = 30.0 + fi * 16.0;
    vec2 pg = vec2(ae.x * sc, ae.y * sc + t * (0.6 + fi * 0.3));
    vec2 pid = floor(pg);
    vec2 pf = fract(pg) - 0.5 - (hash22(pid + fi * 9.0) - 0.5) * 0.5;
    float pd = sdEllipse(rot(t * 2.0 + hash12(pid) * 6.0) * pf, vec2(0.14, 0.08));
    col = mix(col, vec3(0.8, 0.05, 0.12), smoothstep(0.03, -0.03, pd) * step(0.85, hash12(pid + fi)));
  }
  float bloom = 0.46 * (1.0 + 0.03 * sin(t * 0.5) + 0.04 * uPulse);
  col += vec3(0.6, 0.02, 0.08) * exp(-max(length(p) - bloom, 0.0) * 9.0) * (0.3 + 0.4 * uPulse);
  float bm;
  vec3 br = rose(rot(t * 0.04) * p / bloom, 0.1, gPix * 0.5 * (1.0 + dot(p, p)) / bloom, bm);
  return mix(col, br, bm);
}
`;

export const SCENES = [
  { id: 'liftoff', title: 'Haight Street Liftoff', sub: 'Haight & Ashbury at golden hour, then straight up past the fog to orbit', glsl: liftoff },
  { id: 'wall', title: 'Wall of Sound', sub: 'The 1974 sound system wrapped around the dome, pumping on every beat', glsl: wall },
  { id: 'darkStar', title: 'Dark Star', sub: 'A black hole over the stage bends the nebula behind it', glsl: darkStar },
  { id: 'tieDye', title: 'Tie-Dye Sky', sub: 'One spiral, pole to pole', glsl: tieDye },
  { id: 'liquid', title: 'Liquid Light Show', sub: 'Oil, water and dye on an overhead projector', glsl: liquid },
  { id: 'fire', title: 'Fire on the Mountain', sub: 'Flames and embers pour off the ridge', glsl: fire },
  { id: 'bears', title: 'Marching Bears', sub: 'Rings of dancing bears circle the dome', glsl: bears },
  { id: 'eyes', title: 'Eyes of the World', sub: 'The Sphere looks back', glsl: eyes },
  { id: 'bolt', title: 'Lightning Bolt', sub: 'Red, white and blue, with lightning on the beat', glsl: bolt },
  { id: 'roses', title: 'Scarlet Roses', sub: 'A garden around one great bloom', glsl: roses },
];
