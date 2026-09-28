// Haight Street Liftoff — the corner of Haight and Ashbury at golden hour, the sun setting
// straight down Haight Street; then straight up over the rooftops, the Panhandle, the fog
// and the Bay to orbit.
import { startSphere, $, num, on, mirror } from '../kit/kit.js';

const glsl = `
uniform float uJourney;   // 0 on the corner … 1 in orbit
// Ground units are 10 m: x east, z south, the crossing at the origin. Streets are the
// corridors |x| < 1 (Ashbury) and |z| < 1 (Haight); blocks are 12.5 × 27 between centrelines.
const float RE = 637100.0;                            // Earth's radius
const vec3 SUN = vec3(-0.9569, 0.2104, 0.2004);       // 12° up, just south of the far end of Haight
const vec3 SUNC = vec3(1.35, 0.9, 0.58);              // golden-hour sunlight
const vec3 AMB = vec3(0.46, 0.49, 0.62);              // skylight in the shade

float altitude(float j) {
  float u = smoothstep(0.0, 1.0, clamp((j - 0.12) / 0.58, 0.0, 1.0));
  return 0.17 * pow(247000.0, u);                     // eye height to 420 km
}

vec3 daySky(vec3 d, float e) {
  vec3 c = mix(vec3(1.0, 0.7, 0.45), vec3(0.2, 0.4, 0.8), pow(clamp(e, 0.0, 1.57) / 1.57, 0.4));
  float sd = max(dot(d, SUN), 0.0);
  return c + vec3(1.0, 0.5, 0.2) * pow(sd, 5.0) * 0.6 + vec3(1.0, 0.75, 0.4) * pow(sd, 40.0) * 0.5;
}

// ── the corner: frontages, their heights, and who is in the sun ──────────────────────────
// A frontage is one side of a street: side 0 is x = +1, 1 is x = −1 (Ashbury), 2 is z = +1,
// 3 is z = −1 (Haight); half is which way from the crossing; s is the distance along it.
float period(float side) { return side < 1.5 ? 27.0 : 12.5; }
bool gap(float s, float side) { return mod(s + 1.0, period(side)) < 2.0; }    // a cross street
vec2 lotKey(float s, float side, float half_) { return vec2(floor((s - 1.0) / 0.76), side * 2.0 + half_); }
float lotHeight(vec2 key) { return 0.95 + 0.4 * hash12(key + 3.7); }
float frontTop(float s, float side, float half_) { return gap(s, side) ? -1.0 : lotHeight(lotKey(s, side, half_)) + 0.08; }

// 1 in sunlight, 0 in the shadow of the houses across the way. The sun is in the west and a
// little south, so its rays out of the street are stopped by frontages x = −1 or z = +1.
float sunlit(vec2 g, float y) {
  float lit = 1.0;
  if (g.x > -1.0) {
    float t = (g.x + 1.0) / -SUN.x;
    float zAt = g.y + t * SUN.z;
    if (abs(zAt) > 1.0) lit = min(lit, smoothstep(-0.04, 0.04, y + t * SUN.y - frontTop(abs(zAt), 1.0, zAt > 0.0 ? 0.0 : 1.0)));
  }
  if (g.y < 1.0) {
    float t = (1.0 - g.y) / SUN.z;
    float xAt = g.x + t * SUN.x;
    if (abs(xAt) > 1.0) lit = min(lit, smoothstep(-0.04, 0.04, y + t * SUN.y - frontTop(abs(xAt), 2.0, xAt > 0.0 ? 0.0 : 1.0)));
  }
  return lit;
}

// ── the city seen from anywhere ─────────────────────────────────────────────────────────
const int PACIFIC = 0, BAY = 1, PARK = 2, HILL = 3, STREET = 4, LOT = 5, YARD = 6, MARIN = 7;
int landUse(vec2 g) {
  float coast = -520.0 + 60.0 * (fbm(g * 0.004) - 0.5) + 1400.0 * (fbm(vec2(g.y * 0.00025, 1.3)) - 0.5) * smoothstep(300.0, 3000.0, abs(g.y));
  if (g.x < coast) return PACIFIC;
  float wob = (fbm(g * 0.003 + 7.0) - 0.5) * 0.35;
  if (min(length((g - vec2(300.0, -620.0)) / vec2(900.0, 290.0)),        // north of the city, out to the Golden Gate
          length((g - vec2(950.0, 200.0)) / vec2(470.0, 1100.0))) + wob < 1.0) return BAY;   // and down the east side
  if (g.y < -880.0) return MARIN;
  if ((g.x < -8.0 && g.y > -110.0 && g.y < -30.0) ||                      // Golden Gate Park
      (g.x > -8.0 && g.x < 110.0 && g.y > -60.0 && g.y < -52.0) ||        // the Panhandle
      length(g - vec2(40.0, 20.0)) < 14.0) return PARK;                   // Buena Vista
  if (length(g - vec2(60.0, 190.0)) < 60.0) return HILL;                  // Twin Peaks
  float fx = mod(g.x + 1.0, 12.5), fz = mod(g.y + 1.0, 27.0);
  if (fx < 2.0 || fz < 2.0) return STREET;
  vec2 b = vec2(fx - 2.0, fz - 2.0);
  return min(min(b.x, 10.5 - b.x), min(b.y, 25.0 - b.y)) < 3.4 ? LOT : YARD;
}

// Albedo of the ground at g; fp is a pixel's footprint there, in ground units.
vec3 cityGround(vec2 g, float fp, float t, int use) {
  if (use == PACIFIC || use == BAY) {
    float fog = use == PACIFIC ? smoothstep(0.5, 0.75, fbm(g * 0.006 + vec2(t * 0.02, 0.0))) : 0.0;   // the marine layer
    return mix(vec3(0.1, 0.22, 0.34), vec3(1.0, 0.97, 0.94), fog);
  }
  if (use == MARIN) return mix(vec3(0.42, 0.4, 0.25), vec3(0.2, 0.3, 0.16), fbm(g * 0.004));
  if (use == PARK) {
    vec3 c = mix(vec3(0.07, 0.16, 0.06), vec3(0.2, 0.34, 0.12), smoothstep(0.3, 0.7, fbm(g * 1.8)));   // canopy
    c = mix(c, vec3(0.36, 0.46, 0.2), smoothstep(0.62, 0.72, vnoise(g * 0.06)) * 0.8);                // meadows
    return mix(c, vec3(0.28, 0.4, 0.48), smoothstep(0.84, 0.88, vnoise(g * 0.08 + 9.0)) * 0.8);        // ponds
  }
  if (use == HILL) return vec3(0.46, 0.43, 0.28) * (0.8 + 0.3 * vnoise(g * 0.3));
  float fx = mod(g.x + 1.0, 12.5), fz = mod(g.y + 1.0, 27.0);
  vec2 blk = floor((g + 1.0) / vec2(12.5, 27.0));
  float fine = smoothstep(0.08, 0.01, fp);
  vec3 c;
  if (use == STREET) {
    bool ns = fx < 2.0, ew = fz < 2.0;
    float across = ns ? fx - 1.0 : fz - 1.0;
    float along = ns ? fz : fx;
    float span = ns ? 27.0 : 12.5;
    // asphalt: grain and patched tar seams, fading with distance
    c = vec3(0.27, 0.27, 0.29) * (0.92 + 0.16 * vnoise(g * 2.0)) * mix(1.0, 0.86 + 0.24 * vnoise(g * 18.0), fine);
    c *= 1.0 - 0.25 * smoothstep(0.012, 0.0, abs(fbm(g * 0.7) - 0.5)) * fine;
    if (!(ns && ew)) {
      if (abs(across) > 0.75) {
        c = vec3(0.6, 0.58, 0.55) * (0.94 + 0.12 * vnoise(g * 6.0));                   // sidewalk
        c *= 1.0 - 0.25 * smoothstep(0.012, 0.0, abs(fract(along / 0.15) - 0.5) - 0.48) * fine;   // scored slabs
      }
      c *= 1.0 - 0.5 * smoothstep(0.012, 0.0, abs(abs(across) - 0.75)) * fine;               // curb
      if (abs(abs(across) - 0.035) < 0.014) c = vec3(0.86, 0.7, 0.16);                        // double yellow
      if ((along < 2.4 || along > span - 0.4) && abs(across) < 0.72) c = mix(c, vec3(0.88), step(0.5, fract(across * 5.0)));   // crosswalks
    }
    c = mix(c, vec3(0.12, 0.11, 0.11) * (0.85 + 0.3 * step(0.5, fract((g.x + g.y) * 60.0))),
            smoothstep(0.032, 0.03, length(g - vec2(0.35, -0.4))) * fine);                  // a manhole cover
  } else if (use == LOT) {
    vec2 b = vec2(fx - 2.0, fz - 2.0);
    bool onEW = min(b.y, 25.0 - b.y) < min(b.x, 10.5 - b.x);
    float along = onEW ? b.x : b.y;
    float lot = floor(along / 0.76);
    float hr = hash12(vec2(lot, blk.x * 17.0 + blk.y * 3.0 + (onEW ? 0.5 : 0.0)));
    // roofs from above: tar, gravel, white membrane, the odd painted one, and dark light wells
    float kind = hash12(vec2(lot, hr) + 5.0);
    c = kind < 0.45 ? vec3(0.4, 0.39, 0.38) : kind < 0.75 ? vec3(0.6, 0.58, 0.55) : kind < 0.92 ? vec3(0.76, 0.75, 0.72) : hsv(hr, 0.3, 0.7);
    c *= 0.85 + 0.25 * hash12(vec2(lot, hr + 1.0));
    vec2 lp = vec2(fract(along / 0.76), (onEW ? min(b.y, 25.0 - b.y) : min(b.x, 10.5 - b.x)) / 3.4);
    c *= 1.0 - 0.6 * step(0.6, hash12(vec2(lot, hr + 2.0))) * step(abs(lp.x - 0.5), 0.16) * step(abs(lp.y - 0.45), 0.07) * fine;
    c *= 0.8 + 0.2 * smoothstep(0.0, 0.06, abs(lp.x - 0.5) * 2.0 - 0.9 + 0.06);                          // party walls
  } else {
    c = mix(vec3(0.16, 0.26, 0.11), vec3(0.38, 0.35, 0.28), vnoise(g * 2.0));                           // backyard gardens
  }
  // lots and streets blur together once they are smaller than a pixel
  return mix(c, vec3(0.53, 0.53, 0.53) * (0.82 + 0.3 * vnoise(g * 0.05)), smoothstep(0.15, 1.2, fp));
}

vec3 earthFar(vec2 g, float t) {
  vec2 q = g * 0.00003;
  float coastX = -0.0156 + 0.35 * (fbm(vec2(q.y * 0.8, 2.0)) - 0.5) - q.y * 0.25;
  float land = smoothstep(-0.01, 0.01, q.x - coastX + 0.12 * (fbm(q * 3.0) - 0.5) + 0.05 * (fbm(q * 9.0 + 4.0) - 0.5));
  vec3 lc = mix(vec3(0.62, 0.52, 0.34), vec3(0.42, 0.4, 0.25), fbm(q * 6.0));
  lc = mix(lc, vec3(0.18, 0.3, 0.14), smoothstep(0.45, 0.75, fbm(q * 2.0 + 4.0)) * smoothstep(0.3, 1.2, q.x));  // Sierra forests
  lc = mix(lc, vec3(0.92), smoothstep(0.68, 0.8, fbm(q * 4.0 + 9.0)) * smoothstep(0.9, 1.5, q.x));               // snow on the crest
  lc = mix(lc, vec3(0.5, 0.49, 0.48), smoothstep(0.06, 0.02, length((q - vec2(0.03, 0.01)) * vec2(1.0, 0.6))) * 0.8);   // the Bay Area's cities
  vec3 c = mix(vec3(0.04, 0.12, 0.28), lc, land);
  // cloud decks, soft-edged: the marine layer offshore and scattered cumulus inland
  float marine = smoothstep(0.42, 0.66, fbm(q * 2.5 + vec2(t * 0.002, 0.0))) * (1.0 - land * 0.85);
  float scattered = smoothstep(0.6, 0.78, fbm(q * 4.0 - 3.0)) * 0.8;
  return mix(c, vec3(0.95, 0.93, 0.9), max(marine, scattered) * 0.9);
}

// ── the painted ladies ──────────────────────────────────────────────────────────────────
// Frame and glass of a window; w is 0..1 across the glass, returns the glass colour.
vec3 glass(vec2 w, float lamp, float sunAmt) {
  vec3 g = mix(vec3(0.2, 0.26, 0.38), vec3(0.5, 0.6, 0.78), w.y);                  // the sky in the glass
  g = mix(g, vec3(1.0, 0.74, 0.42), sunAmt * 0.6);                                    // the setting sun caught in it
  g = mix(g, vec3(1.0, 0.76, 0.44) * (0.85 + 0.6 * uPulse), lamp);                   // a lamp on inside
  return g * (0.55 + 0.45 * smoothstep(0.0, 0.3, 1.0 - w.y));                        // shadow of the head casing
}

bool facade(vec3 d, float h, out vec3 col, out float dist) {
  col = vec3(0.0);
  dist = 1e9;
  float hl = length(d.xz);
  if (hl < 1e-4 || h > 3.2) return false;
  vec2 hd = d.xz / hl;
  float ax = abs(hd.x), az = abs(hd.y);
  float tH = 1.0 / max(min(ax, az), 1e-4);   // horizontal distance to the first frontage
  float s = tH * max(ax, az);                // how far along the street that is
  bool alongX = ax < az;                     // a frontage x = ±1, on Ashbury
  float side = alongX ? (hd.x > 0.0 ? 0.0 : 1.0) : (hd.y > 0.0 ? 2.0 : 3.0);
  float half_ = alongX ? (hd.y > 0.0 ? 0.0 : 1.0) : (hd.x > 0.0 ? 0.0 : 1.0);
  if (s > 60.0 || gap(s, side)) return false;
  float y = h + d.y / hl * tH;
  if (y < 0.0) return false;
  float lu = (s - 1.0) / 0.76;
  float u = fract(lu);
  vec2 key = vec2(floor(lu), side * 2.0 + half_);
  float H = lotHeight(key);
  bool gable = hash12(key + 9.1) > 0.45;
  float top = H + (gable ? 0.24 * (1.0 - abs(2.0 * u - 1.0)) : 0.03);
  if (y > top) return false;
  dist = tH / hl;
  float px = dist * gPix;
  float fine = smoothstep(0.02, 0.005, px);                    // small details fade with distance

  // three colours per house: body, trim, accent
  float hue = hash12(key + 1.3);
  vec3 body = hsv(hue, 0.26 + 0.2 * hash12(key + 5.5), 0.93);
  vec3 trim = mix(vec3(0.97, 0.94, 0.86), hsv(fract(hue + 0.5), 0.45, 0.5), step(0.82, hash12(key + 2.2)));
  vec3 accent = hsv(fract(hue + 0.08 + 0.4 * hash12(key + 7.7)), 0.62, 0.55);
  vec3 n = alongX ? vec3(-sign(hd.x), 0.0, 0.0) : vec3(0.0, 0.0, -sign(hd.y));
  vec3 P = vec3(hd.x * tH, y, hd.y * tH);
  float sunAmt = max(dot(n, SUN), 0.0) * sunlit(P.xz, y);
  float fy = mod(y, 0.33), storey = floor(y / 0.33);
  vec3 c = body;
  float shade = 1.0, gl = 0.0;
  vec3 gc = vec3(0.0);

  if (y > H) {
    // the gable: fish-scale shingles, raking trim, a round window
    vec2 sc = vec2(u * 18.0, (y - H) * 36.0);
    sc.x += 0.5 * mod(floor(sc.y), 2.0);
    c = mix(accent, accent * 0.72, smoothstep(0.42, 0.52, length(fract(sc) - vec2(0.5, 1.0))) * fine);
    c = mix(c, trim, smoothstep(0.024, 0.016, top - y));
    float oc = length(vec2((u - 0.5) * 0.76, y - H - 0.09));
    c = mix(c, trim, smoothstep(0.053, 0.048, oc));
    c = mix(c, glass(vec2(0.5, 0.5), 0.0, sunAmt), smoothstep(0.038, 0.034, oc));
  } else {
    c *= 1.0 - 0.07 * step(0.5, fract(y * 110.0)) * fine;                         // clapboard siding
    float line = floor(y / 0.33 + 0.5) * 0.33;                                    // belt courses at the floors
    if (line > 0.1) {
      float bc = y - line;
      c = mix(c, trim, smoothstep(0.013 + px, 0.009, abs(bc)));
      shade *= 1.0 - 0.3 * smoothstep(-0.04, -0.013, bc) * step(bc, -0.013);   // shadow beneath the moulding
    }
    if (y > H - 0.075) {
      c = mix(trim, accent, step(0.55, fract(u * 11.0)) * step(y, H - 0.02) * 0.8 * fine);   // cornice and brackets
    } else if (y > H - 0.11) {
      shade *= 0.55;                                                              // shadow under the cornice
    } else if (y > 0.34) {
      // the bay: three facets, the side ones turned away
      if (u > 0.05 && u < 0.53) {
        float fu = (u - 0.05) / 0.48 * 3.0;
        float facet = floor(fu);
        shade *= facet < 0.5 ? 0.74 : (facet > 1.5 ? 0.88 : 1.0);
        vec2 w = vec2((fract(fu) - 0.16) / 0.68, (fy - 0.05) / 0.22);
        vec2 fr = abs(vec2(fract(fu) - 0.5, fy - 0.16)) - vec2(0.4, 0.13);          // the casing
        c = mix(c, trim, step(max(fr.x, fr.y), 0.0));
        c = mix(c, accent, step(abs(fy - 0.015), 0.012) * step(abs(fract(fu) - 0.5), 0.44));   // sill
        if (w.x > 0.0 && w.x < 1.0 && w.y > 0.0 && w.y < 1.0) {
          gl = 1.0;
          gc = glass(w, step(0.6, hash12(key + storey * 3.1 + facet)), sunAmt * (facet > 0.5 && facet < 1.5 ? 1.0 : 0.6));
          gc = mix(gc, trim * 0.9, smoothstep(0.03, 0.0, abs(w.y - 0.62)) * fine);   // the sash bar
        }
      }
      // the tall window with a round head
      vec2 q = vec2((u - 0.75) * 0.76, fy - 0.18);
      float win = q.y < 0.0 ? max(abs(q.x) - 0.09, 0.04 - fy) : length(q) - 0.09;
      c = mix(c, trim, step(win, 0.018));
      if (win < 0.0) {
        gl = 1.0;
        gc = glass(vec2(q.x / 0.18 + 0.5, (fy - 0.04) / 0.23), step(0.6, hash12(key + storey * 5.3)), sunAmt);
      }
    } else {
      // the ground floor: a garage door, and the stoop up to a panelled front door
      if (u > 0.08 && u < 0.5 && y < 0.25) {
        c = mix(trim, accent * 1.15, step(0.02, min(min(u - 0.08, 0.5 - u), 0.25 - y)));
        c *= 1.0 - 0.18 * step(0.5, fract(y * 18.0)) * fine;
      }
      if (u > 0.6 && u < 0.93 && y < 0.1) c = mix(trim, vec3(0.55), 0.3) * (0.78 + 0.22 * step(0.5, fract(y * 45.0)));   // steps
      if (u > 0.67 && u < 0.86 && y > 0.1 && y < 0.3) {
        c = accent * 0.5;
        if (y > 0.26) { gl = 1.0; gc = glass(vec2(0.5, 0.5), 1.0, sunAmt) * 0.9; }                        // transom
        shade *= 0.8;
      }
    }
  }
  c = mix(c, trim, smoothstep(0.03, 0.022, min(u, 1.0 - u)) * step(y, H));    // corner boards between houses
  vec3 light = AMB * (0.7 + 0.3 * smoothstep(0.0, 0.3, y)) + SUNC * sunAmt
              + vec3(0.2, 0.13, 0.07) * (1.0 - smoothstep(0.0, 0.6, y));   // warm light bounced off the street
  vec3 lit = mix(c * shade * light, gc, gl);
  col = mix(lit, vec3(0.92, 0.76, 0.6), 1.0 - exp(-dist * 0.012));
  return true;
}

// ── street trees, Muni trolley wires and their poles ───────────────────────────────────
// Trees stand on the curb lines x = ±0.86 and z = ±0.86 near the corner. Tests the two nearest
// to where the ray crosses the line off; keeps the nearest hit.
void treeLine(vec3 ro, vec3 d, vec2 hd, float hl, bool xLine, float off, inout float tBest, inout vec3 col) {
  float denom = xLine ? hd.x : hd.y;
  if (denom * off <= 0.0) return;
  float th = off / denom;
  float along = (xLine ? hd.y : hd.x) * th;
  float sgn = along >= 0.0 ? 1.0 : -1.0;
  float a = abs(along);
  if (a < 1.2 || a > 24.0) return;
  float k0 = floor((a - 1.7) / 1.9);
  for (int i = 0; i < 2; i++) {
    float k = k0 + float(i);
    float s = 1.7 + 1.9 * k;
    vec2 tkey = vec2(k, (xLine ? 0.0 : 2.0) + (off > 0.0 ? 0.0 : 1.0) + (sgn > 0.0 ? 0.0 : 4.0));
    if (k < 0.0 || hash12(tkey + 0.7) < 0.35 || mod(s + 1.0, xLine ? 27.0 : 12.5) < 2.4) continue;
    vec3 C = xLine ? vec3(off, 0.0, sgn * s) : vec3(sgn * s, 0.0, off);
    float sz = 0.9 + 0.25 * hash12(tkey + 1.9);
    for (int j = 0; j < 3; j++) {
      // three lumps of leaves, jostled a little differently on every tree
      vec3 jit = (hash33(vec3(tkey, float(j))) - 0.5) * vec3(0.14, 0.1, 0.14);
      vec3 cc = C + vec3(0.0, (0.46 + 0.1 * float(j)) * sz, 0.0) + jit * sz;
      float r = (0.19 - 0.03 * float(j)) * sz;
      vec3 oc = ro - cc;
      float b = dot(oc, d), disc = b * b - dot(oc, oc) + r * r;
      if (disc <= 0.0) continue;
      float t = -b - sqrt(disc);
      if (t <= 0.0 || t >= tBest) continue;
      tBest = t;
      vec3 p = ro + d * t;
      vec3 nrm = normalize(normalize(p - cc) + (vec3(vnoise3(p * 40.0), vnoise3(p * 40.0 + 7.0), vnoise3(p * 40.0 + 13.0)) - 0.5) * 0.9);
      vec3 leaf = mix(vec3(0.1, 0.2, 0.07), vec3(0.34, 0.48, 0.17), fbm3(p * 25.0));
      float sun = sunlit(p.xz, p.y);
      col = leaf * (AMB * 0.85 + SUNC * max(dot(nrm, SUN), 0.0) * sun * 1.2);
      col += vec3(0.75, 0.62, 0.2) * pow(max(dot(d, SUN), 0.0), 3.0) * sun * (0.4 + 0.6 * fbm3(p * 30.0));   // the low sun through the leaves
    }
    // the trunk, a thin post under the crown
    float tt = dot(C.xz, hd);
    float yAt = ro.y + d.y / hl * tt;
    if (tt > 0.0 && tt / hl < tBest && length(C.xz - hd * tt) < 0.02 && yAt > 0.0 && yAt < 0.45 * sz) {
      tBest = tt / hl;
      col = vec3(0.2, 0.15, 0.11) * (AMB + SUNC * 0.4 * sunlit(C.xz, yAt));
    }
  }
}

// How much of this pixel a wire of radius r covers, given its distance from the ray and the ray length t.
float wireCover(float dist, float t, float r) {
  float px = max(t * gPix, 1e-5);
  return (1.0 - smoothstep(0.0, px, dist - r)) * min(1.0, 2.0 * r / px + 0.15);
}

// Overhead: two pairs of trolley wires along Haight, span wires across it, poles at the curbs.
float wires(vec3 ro, vec3 d, vec2 hd, float hl, float tMax) {
  float cover = 0.0;
  const float Y = 0.58;
  float yr = Y - ro.y;
  float den = d.y * d.y + d.z * d.z;
  for (int i = 0; i < 4; i++) {
    float Z = (i < 2 ? 0.27 : -0.27) + (mod(float(i), 2.0) < 0.5 ? 0.06 : 0.0);
    float t = (yr * d.y + Z * d.z) / den;
    if (t > 0.0 && t < tMax) cover = max(cover, wireCover(abs(yr * d.z - Z * d.y) / sqrt(den), t, 0.0015));
  }
  if (abs(d.y) > 1e-3) {
    float tY = (Y + 0.04 - ro.y) / d.y;
    if (tY > 0.0) {
      float X = floor(d.x * tY / 3.0 + 0.5) * 3.0;
      float yr2 = Y + 0.04 - ro.y, den2 = d.x * d.x + d.y * d.y;
      float t = (yr2 * d.y + X * d.x) / den2;
      if (t > 0.0 && t < tMax && abs(d.z * t) < 0.8 && abs(X) > 1.5) cover = max(cover, wireCover(abs(yr2 * d.x - X * d.y) / sqrt(den2), t, 0.0012));
    }
  }
  for (int i = 0; i < 2; i++) {
    float Z = i == 0 ? 0.8 : -0.8;
    if (hd.y * Z <= 0.0) continue;
    float X = floor(Z * hd.x / hd.y / 3.0 + 0.5) * 3.0;
    if (abs(X) < 1.5) X = sign(hd.x + 1e-5) * 3.0;
    float tt = X * hd.x + Z * hd.y;
    float yAt = ro.y + d.y / hl * tt;
    if (tt > 0.0 && tt / hl < tMax && yAt > 0.0 && yAt < Y + 0.08) cover = max(cover, wireCover(abs(X * hd.y - Z * hd.x), tt / hl, 0.012));
  }
  return cover;
}

vec3 scene(vec3 d, float t) {
  float h = altitude(uJourney);
  float hd = sqrt(h * (2.0 * RE + h));   // distance to the horizon
  float dip = atan(hd / RE);
  vec3 ro = vec3(0.0, h, 0.0);
  vec3 col;
  float tBest = 1e9;
  bool front = facade(d, h, col, tBest);
  if (!front && d.y < -sin(dip)) {
    float den = -(RE + h) * d.y;
    float tg = h * (2.0 * RE + h) / (den + sqrt(max(den * den - h * (2.0 * RE + h), 0.0)));
    vec2 g = d.xz * tg;
    int use = landUse(g);
    // during the climb the roofs stand 1.15 above the street, not on it
    if (h > 1.25 && h < 2000.0) {
      float tr = (h - 1.15) / -d.y;
      vec2 gr = d.xz * tr;
      if (landUse(gr) == LOT) { g = gr; tg = tr; use = LOT; }
    }
    float fp = tg * gPix / max(-d.y, 0.03);
    float far = max(smoothstep(20000.0, 80000.0, tg), smoothstep(2500.0, 12000.0, h));   // the planet takes over, far off or from high up
    vec3 alb = far < 1.0 ? cityGround(g, fp, t, use) : vec3(0.0);
    if (far > 0.0) alb = mix(alb, earthFar(g, t), far);
    float lit = tg < 40.0 && use != LOT ? sunlit(g, 0.0) : 1.0;
    col = alb * (AMB * 1.1 + SUNC * SUN.y * 2.2 * lit);
    // a golden sheen on the pavement toward the low sun
    if (tg < 60.0) col += SUNC * pow(max(dot(vec3(d.x, -d.y, d.z), SUN), 0.0), 10.0) * lit * (use == STREET ? 0.45 : 0.15);
    float k = exp(-h / 1500.0) / 3000.0 + 1.0 / 900000.0;
    vec3 haze = mix(vec3(0.95, 0.76, 0.6), vec3(0.55, 0.7, 0.95), smoothstep(100.0, 20000.0, h));
    col = mix(col, haze, 1.0 - exp(-tg * k));
    tBest = tg;
  } else if (!front) {
    float e = asin(clamp(d.y, -1.0, 1.0)) + dip;
    float air = max(exp(-h / 900.0), exp(-max(e, 0.0) * hd / 5000.0));
    col = mix(stars(d) * 1.2, daySky(d, e), air);
    col += vec3(0.35, 0.6, 1.0) * exp(-max(e, 0.0) * hd / 1500.0) * (1.0 - exp(-h / 900.0)) * 0.6;   // the limb
    if (h < 180.0 && d.y > 0.02) {
      // cirrus lit pink and gold by the low sun
      vec2 cg = d.xz * ((180.0 - h) / d.y);
      float cov = smoothstep(0.52, 0.8, fbm(cg * vec2(0.0012, 0.004) + vec2(t * 0.004, 0.0))) * exp(-length(cg) / 30000.0);
      col = mix(col, mix(vec3(1.0, 0.64, 0.6), vec3(1.0, 0.86, 0.6), pow(max(dot(d, SUN), 0.0), 3.0)), cov * 0.75);
    }
    float sd = max(dot(d, SUN), 0.0);
    col += vec3(1.0, 0.92, 0.75) * (smoothstep(0.99985, 0.99993, sd) * 8.0 + pow(sd, 400.0) * 1.5);
  }
  if (h < 3.0) {
    float hl = length(d.xz);
    if (hl > 1e-4) {
      vec2 hdir = d.xz / hl;
      treeLine(ro, d, hdir, hl, true, 0.86, tBest, col);
      treeLine(ro, d, hdir, hl, true, -0.86, tBest, col);
      treeLine(ro, d, hdir, hl, false, 0.86, tBest, col);
      treeLine(ro, d, hdir, hl, false, -0.86, tBest, col);
      col = mix(col, vec3(0.05, 0.045, 0.05), wires(ro, d, hdir, hl, tBest));
    }
  }
  return col;
}
`;

// The journey is kept as a float and mirrored into its slider, which only shows tenths.
const JOURNEY_SECONDS = 90;
let journey = num('journey') / 100;
$('journey').addEventListener('input', () => { journey = num('journey') / 100; });
$('restart').addEventListener('click', () => { journey = 0; });

startSphere({
  glsl,
  yaw: -75,
  pitch: 4,
  uniforms: { uJourney: () => journey },
  onFrame(_, dt) {
    if (!on('ascend')) return;
    journey = (journey + dt * num('speed') / JOURNEY_SECONDS) % 1;
    mirror('journey', (journey * 100).toFixed(1));
  },
});
