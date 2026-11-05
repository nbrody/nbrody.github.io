(function() {
  "use strict";
  function quatRotate(q, v) {
    const [qx, qy, qz, qw] = q;
    const tx = 2 * (qy * v[2] - qz * v[1]);
    const ty = 2 * (qz * v[0] - qx * v[2]);
    const tz = 2 * (qx * v[1] - qy * v[0]);
    return [
      v[0] + qw * tx + qy * tz - qz * ty,
      v[1] + qw * ty + qz * tx - qx * tz,
      v[2] + qw * tz + qx * ty - qy * tx
    ];
  }
  function similarityApplyDirection(g, d) {
    return quatRotate(g.rotation, d);
  }
  var sphereGLSL = "// Sphere — one primitive, both backends' math (included wholesale when present, §2.12).\n// The struct is the shape's record (house convention — MaterialProperties/MediumProperties\n// pattern); call sites construct it from compile-time literals (constant placement) or\n// s-scaled expressions (driven rigid frame, fable-transforms §6.1).\n// Provides (struct GENERATED from descriptor rows — A1): sphere_sdf() (signed distance — also the analytic backend's\n// containment query), sphere_intersect() (closed-form intersection), sphere_normal().\n\nfloat sphere_sdf(vec3 p, Sphere sp) {\n    return length(p - sp.center) - sp.radius;\n}\n\n// The roots of |oc + t·d|² = r² (d unit) in the robust form of Haines, Günther & Akenine-Möller,\n// \"Precision Improvements for Ray/Sphere Intersection\" (Ray Tracing Gems, ch. 7, 2019): the\n// discriminant from the perpendicular offset, r² − |oc − b·d|², instead of b² − c, and the\n// near root as c/q instead of −b − √disc. b² − c subtracts two numbers of size |oc|², so for a\n// sphere small against its distance it keeps few bits of r²: in f32 emulation at r/|oc| = 1e-3\n// (an instance-cloud sphere seen from across the cloud) 1.6% of rays aimed near the sphere got\n// the wrong hit/miss answer and hit points moved by up to 27% of r; at 2.5e-4, 36% (Sep 25\n// 2026 audit). The perpendicular form loses only relative precision in |oc − b·d| ≈ r.\n// q takes the sign that avoids cancellation; q = 0 only for a tangent ray through the origin.\n\n// Nearest intersection strictly ahead of the ray (t > 0). direction is unit → a = 1.\n// The FAR bound is the caller's job (t < hit.t for nearest-hit, t < maxDist for occlusion).\n// The floor is 0, not an epsilon: self-intersection escape is OWNED by ray_spawn's\n// provenance offset (hit.eps — impl-plan-epsilon-discipline), under which a spawned\n// origin's re-root is strictly behind the ray, so a floor here would only delete real\n// shallow hits (the measured slab-albedo J2 leak).\nbool sphere_intersect(Ray ray, Sphere sp, out float t) {\n    vec3 oc = ray.origin - sp.center;\n    float b = dot(oc, ray.direction);\n    vec3 perp = oc - b * ray.direction;\n    float disc = sp.radius * sp.radius - dot(perp, perp);\n    if (disc < 0.0) return false;\n    float c = dot(oc, oc) - sp.radius * sp.radius;\n    float q = (b >= 0.0) ? -b - sqrt(disc) : -b + sqrt(disc);\n    if (q == 0.0) return false;\n    float ta = q, tb = c / q;\n    // Root selection by the INSIDE test (c < 0), never by a t-threshold: an outside origin\n    // near the surface must NOT fall through to the far root — that skips the entry\n    // interface and fakes an exit from a region the ray never entered (review finding).\n    // The sign of c is trustworthy for spawned origins: the fp-relative offset (≥256 ulps\n    // of |p|) exceeds the discriminant's rounding noise (a few ulps) by ~2 orders — the\n    // margin the six-agent audit derived; shrink FP_UNCERTAINTY_REL and re-derive.\n    t = (c < 0.0) ? max(ta, tb) : min(ta, tb);\n    return (t > 0.0);\n}\n\n// Outward surface normal at p (a point on/near the surface).\nvec3 sphere_normal(vec3 p, Sphere sp) {\n    return normalize(p - sp.center);\n}\n\n// The INTERVAL form (impl-plan-sdf-as-shape T2) — entry and exit, not the nearest\n// root: this is what a shape declaring `marchBound` hands its marched intersect, and\n// what a shape bounded BY a sphere gets. Entry is clamped to 0 (an origin inside the\n// sphere enters at once); false = the ray misses entirely. Deliberately a sibling of\n// sphere_intersect rather than a rewrite of it — the closed-form arm's root-selection\n// discipline must not move.\nbool sphere_interval(Ray ray, Sphere sp, out float t0, out float t1) {\n    vec3 oc = ray.origin - sp.center;\n    float b = dot(oc, ray.direction);\n    vec3 perp = oc - b * ray.direction;\n    float disc = sp.radius * sp.radius - dot(perp, perp);   // robust form: see sphere_intersect\n    if (disc < 0.0) return false;\n    float c = dot(oc, oc) - sp.radius * sp.radius;\n    float q = (b >= 0.0) ? -b - sqrt(disc) : -b + sqrt(disc);\n    if (q == 0.0) return false;\n    float ta = q, tb = c / q;\n    t1 = max(ta, tb);\n    if (t1 <= 0.0) return false;   // the whole sphere is behind the ray (sliver intervals\n                                   // are the marcher's own t_stop guard's job)\n    t0 = max(min(ta, tb), 0.0);\n    return true;\n}\n\n// Marching (`sphere_sdf_intersect`) and the gradient normal (`sphere_sdf_normal`)\n// are GENERATED from sphere_sdf when a program marches this shape — fable-sdf-contract\n// §4 (emitSdfIntersect/emitSdfNormal in geometry/index.ts carry the rules).\n\n// Surface parameterization — the (θ,φ) equirectangular chart from the outward direction.\n// u = longitude ∈ [0,1), v = latitude (v=0 at the +y pole). AXIS-ALIGNED (fable-imagery P1\n// §7.2 v1): the analytic fold dissolves a sphere's rotation (a sphere IS rotation-invariant),\n// so this chart has no authored orientation to inherit — a chart-frame carry is the deferred fix.\nvec2 sphere_uv(vec3 p, Sphere sp) {\n    vec3 d = normalize(p - sp.center);\n    float u = atan(d.z, d.x) / TWO_PI + 0.5;\n    float v = acos(clamp(d.y, -1.0, 1.0)) / PI;\n    return vec2(u, v);\n}\n";
  const sphereDescriptor = {
    type: "sphere",
    params: [
      { name: "center", kind: "point", shape: "vec3", required: false, default: [0, 0, 0] },
      { name: "radius", kind: "length", shape: "number", required: true, constraint: { kind: "positive" } }
    ],
    glsl: sphereGLSL,
    provides: { sdf: true, analytic: true },
    // The march bound (impl-plan-sdf-as-shape §2.2): its own analytic form bounds it
    // exactly, so a marched arm is confined to precisely this shape's interval.
    marchBound: "self",
    similarityClosed: true,
    // isotropic: R fixes the canonical center — the fold is total
    uvChart: true,
    // (θ,φ) chart — sphere_uv (fable-imagery P1)
    bounds(v) {
      const c = v.center ?? [0, 0, 0];
      const r = v.radius;
      return { min: [c[0] - r, c[1] - r, c[2] - r], max: [c[0] + r, c[1] + r, c[2] + r] };
    }
  };
  var planeGLSL = "// Plane — one primitive, both backends' math (included wholesale when present, §2.12).\n// Convention: the surface dot(p, normal) + offset = 0, normal unit (canonicalPlane\n// normalizes at plan time — the SDF expression is a true distance bound only then).\n// Provides (struct GENERATED from descriptor rows — A1): plane_sdf() (signed distance / containment), plane_intersect(),\n// plane_normal().\n\nfloat plane_sdf(vec3 p, Plane pl) {\n    return dot(p, pl.normal) + pl.offset;\n}\n\n// Intersection with the plane dot(p, normal) + offset = 0 (matches the SDF convention).\n// Floor 0, not an epsilon: a ray_spawn'd origin sits hit.eps off the plane, so its\n// re-root is strictly negative (impl-plan-epsilon-discipline — escape is the offset's job).\nbool plane_intersect(Ray ray, Plane pl, out float t) {\n    float denom = dot(ray.direction, pl.normal);\n    if (abs(denom) < 1e-8) return false;   // ray parallel to the plane\n    t = -(dot(ray.origin, pl.normal) + pl.offset) / denom;\n    return (t > 0.0);\n}\n\n// Outward surface normal — a plane's normal IS its parameter (trivial body, uniform signature).\nvec3 plane_normal(vec3 p, Plane pl) {\n    return pl.normal;\n}\n\n// Marching (`plane_sdf_intersect`) and the gradient normal (`plane_sdf_normal`) are\n// GENERATED from plane_sdf when a program marches this shape — fable-sdf-contract §4.\n// The plane is the UNBOUNDED shape (impl-plan-sdf-as-shape §2.3): it declares no\n// bound, so it is always visited and the caller passes the open interval\n// [near, running nearest] — the generated loop is unchanged by that, it simply\n// never leaves early.\n";
  function canonicalPlane(normal, offset = 0) {
    const invLen = 1 / Math.hypot(normal[0], normal[1], normal[2]);
    return {
      normal: [normal[0] * invLen, normal[1] * invLen, normal[2] * invLen],
      offset: offset * invLen
    };
  }
  const planeDescriptor = {
    type: "plane",
    params: [
      { name: "normal", kind: "direction", shape: "vec3", required: true, constraint: { kind: "min-length", value: 1e-8 } },
      { name: "offset", kind: "length", shape: "number", required: false, default: 0 }
    ],
    glsl: planeGLSL,
    provides: { sdf: true, analytic: true },
    // THE unbounded shape (impl-plan-sdf-as-shape §2.3): a plane has no finite bound to
    // declare, so a marched plane is always visited and marches the open interval. This
    // is the declaration the rule demands — silence would be a compile error.
    marchBound: "unbounded",
    similarityClosed: true,
    // orientation lives in the normal row (coupled fold below)
    // Canonical form: unit normal + rescaled offset (the framework applies this ONCE
    // on every Planner path — the SDF expression is a true distance bound only then).
    canonicalize: (v) => ({ ...v, ...canonicalPlane(v.normal, v.offset) }),
    // (R·n̂, s·d − ⟨t, R·n̂⟩) — the coupled rule, over already-canonical values.
    fold: (v, g) => {
      const n = similarityApplyDirection(g, v.normal);
      const t = g.translation;
      return {
        ...v,
        normal: n,
        offset: g.scale * v.offset - (t[0] * n[0] + t[1] * n[1] + t[2] * n[2])
      };
    }
  };
  var boxGLSL = "// Box (axis-aligned canonical form — rotation comes from placement: the rigid-residual\n// arm for constant rotations, the frame tier for instanced placements). Both backends'\n// math in one wholesale file (§2.12); placement-fold stage 4 added the analytic pair.\n// Provides (struct GENERATED from descriptor rows — A1): box_sdf() (also the analytic\n// backend's containment query), box_intersect(), box_normal().\n\nfloat box_sdf(vec3 p, Box b) {\n    vec3 d = abs(p - b.center) - b.halfSize;\n    return length(max(d, 0.0)) + min(max(d.x, max(d.y, d.z)), 0.0);\n}\n\n// Nearest intersection strictly ahead of the ray (t > 0) — the slab method. direction is\n// unit; a zero component gives ±inf slab times that min/max resolve (the bvh_aabb_hit\n// convention). The FAR bound is the caller's job (t < hit.t / t < maxDist).\n// Root selection by the INSIDE test (tn < 0 ⇔ origin inside the box), never by a\n// t-threshold: an outside origin near a face must NOT fall through to the exit face —\n// that skips the entry interface and fakes an exit from a region the ray never entered\n// (the sphere_intersect review finding, transcribed). The floor is 0, not an epsilon:\n// self-intersection escape is OWNED by ray_spawn's provenance offset (hit.eps —\n// impl-plan-epsilon-discipline); a floor here deleted real shallow hits (the measured\n// slab-albedo J2 leak — this box IS that witness's geometry).\nbool box_intersect(Ray ray, Box b, out float t) {\n    vec3 inv = 1.0 / ray.direction;\n    vec3 t0 = (b.center - b.halfSize - ray.origin) * inv;\n    vec3 t1 = (b.center + b.halfSize - ray.origin) * inv;\n    vec3 tsm = min(t0, t1), tbg = max(t0, t1);\n    float tn = max(max(tsm.x, tsm.y), tsm.z);\n    float tf = min(min(tbg.x, tbg.y), tbg.z);\n    if (tf < tn) return false;\n    t = (tn < 0.0) ? tf : tn;\n    return t > 0.0;\n}\n\n// Outward surface normal at p (a point on/near the surface): the dominant axis of the\n// unit-cube map — exact on faces, the nearer face at edges/corners.\nvec3 box_normal(vec3 p, Box b) {\n    vec3 q = (p - b.center) / b.halfSize;\n    vec3 a = abs(q);\n    if (a.x >= a.y && a.x >= a.z) return vec3(sign(q.x), 0.0, 0.0);\n    if (a.y >= a.z) return vec3(0.0, sign(q.y), 0.0);\n    return vec3(0.0, 0.0, sign(q.z));\n}\n\n// The INTERVAL form (impl-plan-sdf-as-shape T2) — entry/exit of the slab intersection,\n// the shape a marched arm consumes. Entry clamped to 0; sibling of box_intersect, which\n// stays untouched.\nbool box_interval(Ray ray, Box b, out float t0, out float t1) {\n    vec3 inv = 1.0 / ray.direction;\n    vec3 ta = (b.center - b.halfSize - ray.origin) * inv;\n    vec3 tb = (b.center + b.halfSize - ray.origin) * inv;\n    vec3 tsm = min(ta, tb), tbg = max(ta, tb);\n    float tn = max(max(tsm.x, tsm.y), tsm.z);\n    float tf = min(min(tbg.x, tbg.y), tbg.z);\n    if (tf < tn || tf <= 0.0) return false;   // behind the ray — see sphere_interval\n    t0 = max(tn, 0.0);\n    t1 = tf;\n    return true;\n}\n\n// Marching (`box_sdf_intersect`) and the gradient normal (`box_sdf_normal`) are\n// GENERATED from box_sdf when a program marches this shape — fable-sdf-contract §4.\n";
  const boxDescriptor = {
    type: "box",
    params: [
      { name: "center", kind: "point", shape: "vec3", required: false, default: [0, 0, 0] },
      { name: "halfSize", kind: "length", shape: "vec3", required: true, constraint: { kind: "positive" } }
    ],
    glsl: boxGLSL,
    provides: { sdf: true, analytic: true },
    // The march bound (impl-plan-sdf-as-shape §2.2): its own analytic form bounds it
    // exactly, so a marched arm is confined to precisely this shape's interval.
    marchBound: "self",
    similarityClosed: false,
    // axis-aligned canonical form: no row can absorb R (T,s still fold)
    bounds(v) {
      const c = v.center ?? [0, 0, 0];
      const h = v.halfSize;
      return { min: [c[0] - h[0], c[1] - h[1], c[2] - h[2]], max: [c[0] + h[0], c[1] + h[1], c[2] + h[2]] };
    }
  };
  var quadGLSL = "// Quad (parallelogram, analytic backend only) — corner + u·edge1 + v·edge2, u,v ∈ [0,1].\n// Zero-thickness: it never claims containment in scene_region_at, so it is naturally\n// ONE-SIDED under the region_to emission convention (impl-plan-area-lights pinned\n// deviation). The `normal` FIELD is the precompiled unit cross(edge1, edge2) — the\n// emitting side, the SAME compile-time literal the quad light's sampler bakes (hit side\n// and sample side agree bit-exactly by construction; never recompute it per-fragment).\n// Provides (struct GENERATED from descriptor rows — A1): quad_intersect(), quad_normal().\n\nbool quad_intersect(Ray ray, Quad q, out float t) {\n    float denom = dot(ray.direction, q.normal);\n    if (abs(denom) < 1e-8) return false;                   // parallel to the quad's plane\n    t = dot(q.corner - ray.origin, q.normal) / denom;\n    if (t <= 0.0) return false;   // floor 0: escape is ray_spawn's offset (impl-plan-epsilon-discipline)\n    vec3 local = ray.origin + ray.direction * t - q.corner;  // Euclidean backend\n    // Inside test via the plane's 2x2 Gram system (edges need not be orthogonal).\n    float e11 = dot(q.edge1, q.edge1), e22 = dot(q.edge2, q.edge2), e12 = dot(q.edge1, q.edge2);\n    float d1 = dot(local, q.edge1), d2 = dot(local, q.edge2);\n    float det = e11 * e22 - e12 * e12;                     // > 0 (Validator rejects degenerate)\n    float u = (d1 * e22 - d2 * e12) / det;\n    float v = (d2 * e11 - d1 * e12) / det;\n    return (u >= 0.0 && u <= 1.0 && v >= 0.0 && v <= 1.0);\n}\n\n// The emitting-side normal — stored, never recomputed (see the struct comment).\nvec3 quad_normal(vec3 p, Quad q) {\n    return q.normal;\n}\n\n// Surface parameterization — the natural [0,1]² along the quad's own edges (edge1 = u,\n// edge2 = v). Placement-correct for FREE: the similarity fold carries the quad's orientation\n// in its edge vectors, so no chart frame is needed. Same 2×2 Gram solve as quad_intersect\n// (edges need not be orthogonal).\nvec2 quad_uv(vec3 p, Quad q) {\n    vec3 local = p - q.corner;\n    float e11 = dot(q.edge1, q.edge1), e22 = dot(q.edge2, q.edge2), e12 = dot(q.edge1, q.edge2);\n    float d1 = dot(local, q.edge1), d2 = dot(local, q.edge2);\n    float det = e11 * e22 - e12 * e12;\n    float u = (d1 * e22 - d2 * e12) / det;\n    float v = (d2 * e11 - d1 * e12) / det;\n    return vec2(u, v);\n}\n";
  function quadCross(edge1, edge2) {
    return [
      edge1[1] * edge2[2] - edge1[2] * edge2[1],
      edge1[2] * edge2[0] - edge1[0] * edge2[2],
      edge1[0] * edge2[1] - edge1[1] * edge2[0]
    ];
  }
  function quadNormal(edge1, edge2) {
    const [cx, cy, cz] = quadCross(edge1, edge2);
    const len = Math.hypot(cx, cy, cz);
    return [cx / len, cy / len, cz / len];
  }
  const quadDescriptor = {
    type: "quad",
    params: [
      { name: "corner", kind: "point", shape: "vec3", required: true },
      { name: "edge1", kind: "vector", shape: "vec3", required: true },
      { name: "edge2", kind: "vector", shape: "vec3", required: true }
    ],
    glsl: quadGLSL,
    provides: { sdf: false, analytic: true },
    similarityClosed: true,
    // orientation lives in the edge vector rows
    uvChart: true,
    // natural [0,1]² along the edges — quad_uv (fable-imagery P1)
    // Zero-thickness: never claims containment in scene_region_at — which is exactly
    // what makes it ONE-SIDED under region_to emission (and why back-face hits need
    // the entering-side probe, audit H2).
    thin: true,
    // Quad.normal — the precompiled emitting side (unit cross is scale-invariant
    // under s>0, so it is never scaled).
    derivedFields: [{ name: "normal", kind: "direction", shape: "vec3" }],
    derivedCtorFields: (v) => [quadNormal(v.edge1, v.edge2)],
    // COUPLED rule (C5): area relates edge1 AND edge2 — a zero cross product is NaN in
    // the normal formatter; near-zero areas make Inf pdfs if emissive. ONE formula
    // (quadCross) with the quad LIGHT's identical rule (both routes, one truth).
    validateValues(v) {
      const c = quadCross(v.edge1, v.edge2);
      return Math.hypot(c[0], c[1], c[2]) < 1e-8 ? ["edges are parallel or near-parallel — area |edge1 × edge2| must be >= 1e-8"] : [];
    },
    // AABB of the four corners: corner, +edge1, +edge2, +edge1+edge2.
    bounds(v) {
      const p = v.corner, e1 = v.edge1, e2 = v.edge2;
      const corners = [p, [p[0] + e1[0], p[1] + e1[1], p[2] + e1[2]], [p[0] + e2[0], p[1] + e2[1], p[2] + e2[2]], [p[0] + e1[0] + e2[0], p[1] + e1[1] + e2[1], p[2] + e1[2] + e2[2]]];
      const min = [Infinity, Infinity, Infinity];
      const max = [-Infinity, -Infinity, -Infinity];
      for (const q of corners) for (let a = 0; a < 3; a++) {
        if (q[a] < min[a]) min[a] = q[a];
        if (q[a] > max[a]) max[a] = q[a];
      }
      return { min, max };
    }
  };
  var cylinderGLSL = "// Cylinder (finite, capped, canonical Y-axis — orientation is PLACEMENT, not shape:\n// a tilted cylinder is transform.rotation through the rigid-residual/frame arms,\n// exactly like box). Both backends' math in one wholesale file (§2.12);\n// placement-fold stage 4 added the analytic pair.\n// Provides (struct GENERATED from descriptor rows — A1): cylinder_sdf() (also the\n// analytic backend's containment query), cylinder_intersect(), cylinder_normal().\n\n// Exact signed distance to the capped cylinder (not a bound): correct sign, never\n// overestimates, exact near the surface — full quality for marching, containment,\n// and gradient normals alike.\nfloat cylinder_sdf(vec3 p, Cylinder c) {\n    vec3 q = p - c.center;\n    vec2 d = vec2(length(q.xz) - c.radius, abs(q.y) - c.halfHeight);\n    return min(max(d.x, d.y), 0.0) + length(max(d, 0.0));\n}\n\n// Nearest intersection strictly ahead of the ray (t > 0): the capped cylinder as the\n// INTERVAL intersection of the axis slab and the infinite tube — caps and side fall\n// out of one [tn, tf] pair, no per-face candidate juggling. Root selection by the\n// INSIDE test (tn < 0 ⇔ origin inside), the sphere_intersect discipline.\nbool cylinder_intersect(Ray ray, Cylinder c, out float t) {\n    vec3 q = ray.origin - c.center;\n    vec3 d = ray.direction;\n    float tn, tf;\n    if (abs(d.y) > 1e-12) {\n        float ta = (-c.halfHeight - q.y) / d.y;\n        float tb = ( c.halfHeight - q.y) / d.y;\n        tn = min(ta, tb); tf = max(ta, tb);\n    } else {\n        if (abs(q.y) > c.halfHeight) return false;   // axis-normal ray outside the slab\n        tn = -1.0e30; tf = 1.0e30;\n    }\n    float a  = d.x * d.x + d.z * d.z;\n    float bq = q.x * d.x + q.z * d.z;\n    float cc = q.x * q.x + q.z * q.z - c.radius * c.radius;\n    if (a > 1e-12) {\n        // The sphere_intersect robust form in 2D: bq² − a·cc = a·r² − (q × d)² (Lagrange's\n        // identity), which avoids subtracting two numbers of size |q|² for thin, distant\n        // tubes; the near root as cc/Q.\n        float cross_qd = q.x * d.z - q.z * d.x;\n        float disc = a * c.radius * c.radius - cross_qd * cross_qd;\n        if (disc < 0.0) return false;\n        float Q = (bq >= 0.0) ? -bq - sqrt(disc) : -bq + sqrt(disc);\n        if (Q == 0.0) return false;   // tangent through the origin\n        float ra = Q / a, rb = cc / Q;\n        tn = max(tn, min(ra, rb));\n        tf = min(tf, max(ra, rb));\n        if (tf < tn) return false;\n    } else if (cc > 0.0) {\n        return false;   // axis-parallel ray outside the tube\n    }\n    t = (tn < 0.0) ? tf : tn;\n    return t > 0.0;   // floor 0: escape is ray_spawn's offset (impl-plan-epsilon-discipline)\n}\n\n// Outward surface normal at p (a point on/near the surface): the smaller surface\n// residual picks the face — exact on caps and side, the nearer face at the rim.\nvec3 cylinder_normal(vec3 p, Cylinder c) {\n    vec3 q = p - c.center;\n    float dy = c.halfHeight - abs(q.y);\n    float dr = c.radius - length(q.xz);\n    if (dy < dr) return vec3(0.0, sign(q.y), 0.0);\n    return normalize(vec3(q.x, 0.0, q.z));\n}\n\n// The INTERVAL form (impl-plan-sdf-as-shape T2) — the slab ∩ tube interval that\n// cylinder_intersect already computes internally, exposed as entry/exit for a marched\n// arm. Entry clamped to 0; cylinder_intersect stays untouched.\nbool cylinder_interval(Ray ray, Cylinder c, out float t0, out float t1) {\n    vec3 q = ray.origin - c.center;\n    vec3 d = ray.direction;\n    float tn, tf;\n    if (abs(d.y) > 1e-12) {\n        float ta = (-c.halfHeight - q.y) / d.y;\n        float tb = ( c.halfHeight - q.y) / d.y;\n        tn = min(ta, tb); tf = max(ta, tb);\n    } else {\n        if (abs(q.y) > c.halfHeight) return false;\n        tn = -1.0e30; tf = 1.0e30;\n    }\n    float a  = d.x * d.x + d.z * d.z;\n    float bq = q.x * d.x + q.z * d.z;\n    float cc = q.x * q.x + q.z * q.z - c.radius * c.radius;\n    if (a > 1e-12) {\n        // The sphere_intersect robust form in 2D: bq² − a·cc = a·r² − (q × d)² (Lagrange's\n        // identity), which avoids subtracting two numbers of size |q|² for thin, distant\n        // tubes; the near root as cc/Q.\n        float cross_qd = q.x * d.z - q.z * d.x;\n        float disc = a * c.radius * c.radius - cross_qd * cross_qd;\n        if (disc < 0.0) return false;\n        float Q = (bq >= 0.0) ? -bq - sqrt(disc) : -bq + sqrt(disc);\n        if (Q == 0.0) return false;   // tangent through the origin\n        float ra = Q / a, rb = cc / Q;\n        tn = max(tn, min(ra, rb));\n        tf = min(tf, max(ra, rb));\n    } else if (cc > 0.0) {\n        return false;\n    }\n    if (tf < tn || tf <= 0.0) return false;   // behind the ray — see sphere_interval\n    t0 = max(tn, 0.0);\n    t1 = tf;\n    return true;\n}\n\n// Marching (`cylinder_sdf_intersect`) and the gradient normal (`cylinder_sdf_normal`)\n// are GENERATED from cylinder_sdf when a program marches this shape — fable-sdf-contract §4.\n";
  const cylinderDescriptor = {
    type: "cylinder",
    params: [
      { name: "center", kind: "point", shape: "vec3", required: false, default: [0, 0, 0] },
      { name: "radius", kind: "length", shape: "number", required: true, constraint: { kind: "positive" } },
      { name: "halfHeight", kind: "length", shape: "number", required: true, constraint: { kind: "positive" } }
    ],
    glsl: cylinderGLSL,
    provides: { sdf: true, analytic: true },
    // The march bound (impl-plan-sdf-as-shape §2.2): its own analytic form bounds it
    // exactly, so a marched arm is confined to precisely this shape's interval.
    marchBound: "self",
    similarityClosed: false,
    // canonical y-axis, no axis row (orientation-is-placement): R cannot fold
    bounds(v) {
      const c = v.center ?? [0, 0, 0];
      const r = v.radius, h = v.halfHeight;
      return { min: [c[0] - r, c[1] - h, c[2] - r], max: [c[0] + r, c[1] + h, c[2] + r] };
    }
  };
  var diskGLSL = "// Disk (flat circular, ZERO-THICKNESS, analytic backend only) — center + unit normal +\n// radius. Included wholesale when present (§2.12). Second tenant of the thin machinery\n// (quad's sibling): never claims containment, one-sided under region_to emission,\n// back-face hits probe the entering side (audit H2).\n// The `normal` is a canonical UNIT parameter (descriptor canonicalize — framework-applied\n// once; the disk light's sampler shares the SAME normalized value, the one-sided pin).\n// Transcribed from pbrt-v4 Disks: plane intersection + squared-radial test, no quadratic.\n// Provides (struct GENERATED from descriptor rows — A1): disk_intersect(), disk_normal().\n\nbool disk_intersect(Ray ray, Disk d, out float t) {\n    float denom = dot(ray.direction, d.normal);\n    if (abs(denom) < 1e-8) return false;                   // parallel to the disk's plane\n    t = dot(d.center - ray.origin, d.normal) / denom;\n    if (t <= 0.0) return false;   // floor 0: escape is ray_spawn's offset (impl-plan-epsilon-discipline)\n    vec3 local = ray.origin + ray.direction * t - d.center;  // ~in-plane (O(t·ulp) residual,\n    return dot(local, local) <= d.radius * d.radius;         //  same class as quad's Gram solve)\n}\n\n// The emitting-side normal — stored, unit by canonicalization (never recompute).\nvec3 disk_normal(vec3 p, Disk d) {\n    return d.normal;\n}\n\n// Surface parameterization — polar (r/R, θ/2π) in the disk's plane. The RADIAL coordinate is\n// orientation-free; the ANGULAR reference comes from build_basis(normal) (fable-imagery P1\n// §7.2 v1): the fold dissolves the disk's in-plane rotation, so θ=0 is a derived direction,\n// not an authored one — the chart-frame carry is the deferred fix.\nvec2 disk_uv(vec3 p, Disk d) {\n    vec3 local = p - d.center;\n    vec3 t, b;\n    build_basis(d.normal, t, b);\n    float r = length(local) / d.radius;\n    float theta = atan(dot(local, b), dot(local, t)) / TWO_PI + 0.5;\n    return vec2(r, theta);\n}\n";
  function unitVec3(v) {
    const invLen = 1 / Math.hypot(v[0], v[1], v[2]);
    return [v[0] * invLen, v[1] * invLen, v[2] * invLen];
  }
  const diskDescriptor = {
    type: "disk",
    params: [
      { name: "center", kind: "point", shape: "vec3", required: false, default: [0, 0, 0] },
      { name: "radius", kind: "length", shape: "number", required: true, constraint: { kind: "positive" } },
      // bounds() below reads center+radius
      // A flat (+Y) disk is a sensible disk — normal defaults rather than requires
      // (plane's normal stays required: it IS the plane's identity).
      { name: "normal", kind: "direction", shape: "vec3", required: false, default: [0, 1, 0], constraint: { kind: "min-length", value: 1e-8 } }
    ],
    glsl: diskGLSL,
    provides: { sdf: false, analytic: true },
    similarityClosed: true,
    // orientation lives in the normal row; rotation about it is a symmetry
    uvChart: true,
    // polar (r/R, θ/2π) — disk_uv (fable-imagery P1)
    // Zero-thickness (the dichotomy: no sdf ⇒ thin): never claims containment, so it
    // is one-sided under region_to emission; back-face hits probe the entering side.
    thin: true,
    // Unit normal — framework-applied ONCE per parameter set; folds preserve it
    // (direction kinds transform by R alone).
    canonicalize: (v) => ({ ...v, normal: unitVec3(v.normal) }),
    // Conservative box: the disk lies within radius of its center in every axis.
    bounds(v) {
      const c = v.center ?? [0, 0, 0];
      const r = v.radius;
      return { min: [c[0] - r, c[1] - r, c[2] - r], max: [c[0] + r, c[1] + r, c[2] + r] };
    }
  };
  var torusGLSL = "// Torus — the ring standing about the canonical Y axis (orientation is PLACEMENT,\n// like box and cylinder). `ringRadius` runs from the centre to the middle of the tube,\n// `tubeRadius` is the tube itself.\n//\n// MARCHED ONLY. A torus has a closed form — a quartic — but its roots need a numerically\n// delicate solver, and its field is exact and cheap, so this is the shape that shows what\n// the merge means: nothing here differs from sphere.glsl except which intersect line the\n// generator emits. It is also the first shape whose march bound is a DIFFERENT primitive\n// (a cylinder of radius R+r and half-height r — see torus.ts), which is the interesting\n// half: the marched arm only ever runs inside that cylinder's ray interval.\n// Provides (struct + march/normal GENERATED — A1, fable-sdf-contract §4): torus_sdf(), torus_uv().\n\n// Exact signed distance: the distance in the (radial, axial) half-plane from the tube's\n// circular cross-section — the standard revolution form, correct sign, never overestimating.\nfloat torus_sdf(vec3 p, Torus t) {\n    vec2 c = vec2(length(p.xz) - t.ringRadius, p.y);\n    return length(c) - t.tubeRadius;\n}\n\n// Marching (`torus_sdf_intersect`) and the gradient normal (`torus_sdf_normal`) are\n// GENERATED from torus_sdf when a program marches this shape — fable-sdf-contract §4.\n\n// Surface parameterization — the torus's OWN two angles, which is the whole appeal of\n// charting one: u runs around the ring, v around the tube. Both in [0,1).\nvec2 torus_uv(vec3 p, Torus t) {\n    float u = atan(p.z, p.x) / TWO_PI + 0.5;\n    float v = atan(p.y, length(p.xz) - t.ringRadius) / TWO_PI + 0.5;\n    return vec2(u, v);\n}\n";
  const torusDescriptor = {
    type: "torus",
    // CANONICAL (fable-sdf-contract §2): origin-centred, ring about Y — position and
    // orientation are placement's alone, so there is no center row and no bounds()
    // (the AABB derives from the marchBound cylinder).
    params: [
      { name: "ringRadius", kind: "length", shape: "number", required: true, constraint: { kind: "positive" } },
      { name: "tubeRadius", kind: "length", shape: "number", required: true, constraint: { kind: "positive" } }
    ],
    glsl: torusGLSL,
    provides: { sdf: true, analytic: false },
    // The bound: a cylinder of radius R+r and half-height r, which is the TIGHT one —
    // the torus touches it on the rim and on both flat faces (the "bound is reached"
    // half of the containment test). A sphere of radius R+r would also be legal and
    // rotation-invariant, but it is mostly empty: the marched arm would run over a
    // long interval of nothing on every grazing ray.
    marchBound: {
      type: "cylinder",
      values: (v) => ({
        radius: v.ringRadius + v.tubeRadius,
        halfHeight: v.tubeRadius
      })
    },
    // The canonical ring axis is Y: no row can absorb a rotation (s still folds).
    similarityClosed: false,
    uvChart: true,
    // (ring, tube) angles — torus_uv
    // A ring whose tube is thicker than its radius is a solid blob with a self-
    // intersecting cross-section — the field stops being the distance to a torus.
    validateValues(v) {
      return v.tubeRadius >= v.ringRadius ? [`torus: tubeRadius (${v.tubeRadius}) must be smaller than ringRadius (${v.ringRadius}) — the tube would swallow the hole`] : [];
    }
  };
  var bottleGLSL = "// Bottle — a rounded-cylinder body and neck, smooth-unioned, hollowed to a glass shell\n// and chopped open at the lip, with a punt dimple pushed up into the base.\n//\n// The point of having it here: it is the first occupant that is a CONSTRUCTION rather\n// than a formula — five operators over two primitives — and it costs the compiler\n// exactly what a sphere costs. Everything it needs is in this file, prefixed and\n// file-private, exactly like the vendored knob's helpers: a shape's internal maths is\n// its own business. (Composing shapes at the SCENE level is a different question, and\n// a deliberately open one — nothing here anticipates it.)\n//\n// Fill it with a dielectric and the interior-marching path (|d| stepping, region\n// classification) is what renders the glass.\n//\n// The local frame: origin at the CENTRE of the body cylinder, +Y up the neck. So the\n// body spans y ∈ [−baseHeight, +baseHeight] and the neck sits on top of it — see\n// bottle.ts, whose bound is derived from exactly these extents.\n// Provides (struct + march/normal GENERATED — A1, fable-sdf-contract §4): bottle_sdf().\n\n// ---- the operators this shape is built from (file-private) ------------------\n// All three are 1-Lipschitz in 1-Lipschitz operands, which is what keeps the composed\n// field safe to march: a 1-Lipschitz function vanishing on the surface can never\n// OVERESTIMATE the distance to it (moving to the nearest zero changes the value by at\n// most the distance travelled). For the quadratic smooth union that holds because its\n// gradient is a convex combination of its operands' — ∂/∂a = 1−u, ∂/∂b = u with\n// u = ½(k−|a−b|)/k ∈ [0, ½].\n//\n// Blends do move the SURFACE: a smooth union is up to k/4 LARGER than the hard one, a\n// smooth intersection up to k/4 smaller. bottle.ts pays that k/4 in the bound.\n\nfloat bottle_smooth_union(float a, float b, float k) {\n    float h = max(k - abs(a - b), 0.0);\n    return min(a, b) - 0.25 * h * h / k;\n}\n\nfloat bottle_smooth_intersect(float a, float b, float k) {\n    return -bottle_smooth_union(-a, -b, k);\n}\n\n// Rounded capped cylinder about the canonical Y axis. The fillet is inset from BOTH the\n// radius and the half-height, so the extents are exactly (radius, halfHeight) whatever\n// `rounded` is — the other convention (inset radially, added axially) would make every\n// derived bound rounded-dependent in one axis only. Requires rounded ≤ min(radius,\n// halfHeight), which bottle.ts checks.\nfloat bottle_cylinder(vec3 p, float radius, float halfHeight, float rounded) {\n    vec2 q = vec2(length(p.xz), p.y);\n    vec2 w = abs(q) - vec2(radius - rounded, halfHeight - rounded);\n    return min(max(w.x, w.y), 0.0) + length(max(w, 0.0)) - rounded;\n}\n\n// ---- the shape --------------------------------------------------------------\n\n// The SOLID profile, before hollowing — the shared source for the shell and (later, if\n// a liquid region wants it) the cavity, so the two can never drift.\nfloat bottle_solid(vec3 q, Bottle b) {\n    float body = bottle_cylinder(q, b.baseRadius, b.baseHeight, b.rounded);\n    vec3 qn = q - vec3(0.0, b.baseHeight + b.neckHeight, 0.0);\n    float neck = bottle_cylinder(qn, b.neckRadius, b.neckHeight, b.rounded);\n    float solid = bottle_smooth_union(body, neck, b.smoothJoin);\n    if (b.punt > 0.0) {\n        // The dimple: a sphere pushed up into the underside of the body.\n        float dimple = length(q + vec3(0.0, b.baseHeight, 0.0)) - b.punt;\n        solid = bottle_smooth_intersect(solid, -dimple, b.smoothJoin);\n    }\n    return solid;\n}\n\n// The glass SHELL: the solid hollowed to a wall of `thickness` (|d| − t, the onion),\n// neck chopped open a third of a neck-height above the lip joint. Both the chop and the\n// punt SHRINK the solid — a smooth intersection can only add to the field — so the\n// extent is the solid's plus the onion's one `thickness` outward, which is what makes\n// bottle.ts's bound derivable.\nfloat bottle_sdf(vec3 p, Bottle b) {\n    float shell = abs(bottle_solid(p, b)) - b.thickness;\n    float top = p.y - (b.baseHeight + b.neckHeight + b.neckHeight / 3.0);\n    return bottle_smooth_intersect(shell, top, b.thickness);\n}\n\n// Marching (`bottle_sdf_intersect`) and the gradient normal (`bottle_sdf_normal`) are\n// GENERATED from bottle_sdf when a program marches this shape — fable-sdf-contract §4.\n// A shell this thin is exactly the case the gradient normal exists for: no face of it\n// has a closed form.\n";
  function bottleExtent(v) {
    const baseRadius = v.baseRadius, baseHeight = v.baseHeight;
    const neckHeight = v.neckHeight, thickness = v.thickness;
    const join = v.smoothJoin;
    return {
      radius: baseRadius + thickness + 0.25 * join,
      yTop: baseHeight + neckHeight + neckHeight / 3,
      yBot: -(baseHeight + thickness + 0.25 * join)
    };
  }
  const bottleDescriptor = {
    type: "bottle",
    // CANONICAL (fable-sdf-contract §2): origin at the body centre; no center row, no
    // bounds() — the AABB derives from the marchBound cylinder, which carries the one
    // asymmetry (the neck's y-offset) in the shape's own frame.
    params: [
      { name: "baseRadius", kind: "length", shape: "number", required: true, constraint: { kind: "positive" } },
      { name: "baseHeight", kind: "length", shape: "number", required: true, constraint: { kind: "positive" } },
      { name: "neckRadius", kind: "length", shape: "number", required: true, constraint: { kind: "positive" } },
      { name: "neckHeight", kind: "length", shape: "number", required: true, constraint: { kind: "positive" } },
      { name: "thickness", kind: "length", shape: "number", required: false, default: 0.03, constraint: { kind: "positive" } },
      { name: "rounded", kind: "length", shape: "number", required: false, default: 0.05, constraint: { kind: "nonnegative" } },
      { name: "smoothJoin", kind: "length", shape: "number", required: false, default: 0.3, constraint: { kind: "positive" } },
      { name: "punt", kind: "length", shape: "number", required: false, default: 0, constraint: { kind: "nonnegative" } }
    ],
    glsl: bottleGLSL,
    provides: { sdf: true, analytic: false },
    // A cylinder about the shape's own axis: the body IS one, so the bound is tight
    // where it matters and loose only over the neck (a cheap, mostly-empty slab).
    marchBound: {
      type: "cylinder",
      values: (v) => {
        const e = bottleExtent(v);
        return {
          center: [0, (e.yTop + e.yBot) / 2, 0],
          radius: e.radius,
          halfHeight: (e.yTop - e.yBot) / 2
        };
      }
    },
    similarityClosed: false,
    // canonical +Y axis: no row absorbs a rotation
    // Coupled rules the separable row constraints cannot state (C5 / the validateValues
    // slot): the fillet is inset from both extents (bottle.glsl's convention), the wall
    // must fit inside the neck, and the neck must be the narrower of the two.
    validateValues(v) {
      const out = [];
      const rounded = v.rounded;
      const neckRadius = v.neckRadius, baseRadius = v.baseRadius;
      const thickness = v.thickness;
      const minExtent = Math.min(baseRadius, v.baseHeight, neckRadius, v.neckHeight);
      if (rounded > minExtent) out.push(`bottle: rounded (${rounded}) exceeds the smallest half-extent (${minExtent}) — the fillet is inset from both, so it cannot be larger`);
      if (thickness >= neckRadius) out.push(`bottle: thickness (${thickness}) must be less than neckRadius (${neckRadius}) — the wall would close the bore`);
      if (neckRadius > baseRadius) out.push(`bottle: neckRadius (${neckRadius}) must not exceed baseRadius (${baseRadius}) — the neck is the narrow end`);
      if (v.punt > 0 && v.punt >= v.baseHeight) out.push(`bottle: punt (${v.punt}) must be less than baseHeight (${v.baseHeight}) — the dimple would push through the shoulder`);
      return out;
    }
  };
  var knobGLSL = "// Knob — a VENDORED model from NVIDIA's sdf-explorer corpus, and the family's first.\n//\n// VENDORED, NOT OURS. The copyright and licence block below is verbatim and governs the\n// maths under it. This file was chosen deliberately: most of that corpus is CC BY-NC-SA\n// 3.0, and this one is MIT, so it can sit in the library on the same terms as everything\n// else. A CC-licensed model would need its own answer before it lands here.\n//\n// PORTED, minimally, and the port is entirely mechanical:\n//   · every helper is PREFIXED (`knob_sd_sphere`, `knob_rot`, …). The corpus was written\n//     to be compiled ONE MODEL AT A TIME and its helper names collide across files; here\n//     every occupant's file is included wholesale into one program, so the prefix is what\n//     makes a second vendored model possible at all.\n//   · the bare `sdf(vec3)` became `knob_sdf(vec3, Knob)`, reading `radius` off the\n//     struct — the corpus has no placement or scale of its own (position/rotation are\n//     placement's, per the canonical-field rule — fable-sdf-contract §2).\n//   · `pi` (a host global there) became the core PI.\n// Nothing inside the maths was touched, including the vendored file's own smooth\n// operators — a vendored model brings its own vocabulary, and swapping in shared\n// operators would quietly change the model.\n//\n// THE BOUND IS MEASURED, not guessed (knob.ts): the corpus documents no per-model\n// extent, so the field was transcribed to TS and sampled — the same twin the containment\n// vitest runs. That is the recipe every future vendored model follows.\n// Provides (struct + march/normal GENERATED — A1, fable-sdf-contract §4): knob_sdf().\n\n/*******************************************************************************\n * The MIT License (MIT)\n * Copyright (c) 2021, NVIDIA CORPORATION.\n * Permission is hereby granted, free of charge, to any person obtaining a copy of\n * this software and associated documentation files (the \"Software\"), to deal in\n * the Software without restriction, including without limitation the rights to\n * use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of\n * the Software, and to permit persons to whom the Software is furnished to do so,\n * subject to the following conditions:\n * The above copyright notice and this permission notice shall be included in all\n * copies or substantial portions of the Software.\n * THE SOFTWARE IS PROVIDED \"AS IS\", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR\n * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS\n * FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR\n * COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER\n * IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN\n * CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.\n ******************************************************************************/\n\n// ---- helper maths (vendored) ------------------------------------------------\n\nmat3 knob_rot(vec3 axis, float angle) {\n    // http://www.neilmendoza.com/glsl-rotation-about-an-arbitrary-axis/\n    axis = normalize(axis);\n    float s = sin(angle);\n    float c = cos(angle);\n    float oc = 1.0 - c;\n    return mat3(oc*axis.x*axis.x+c,         oc*axis.x*axis.y-axis.z*s,  oc*axis.z*axis.x+axis.y*s,\n                oc*axis.x*axis.y+axis.z*s,  oc*axis.y*axis.y+c,         oc*axis.y*axis.z-axis.x*s,\n                oc*axis.z*axis.x-axis.y*s,  oc*axis.y*axis.z+axis.x*s,  oc*axis.z*axis.z+c);\n}\n\n// distance functions, from https://iquilezles.org/articles/distfunctions/\nfloat knob_sd_sphere(vec3 v, float r) {\n    return length(v) - r;\n}\n\nfloat knob_sd_torus(vec3 p, vec2 t) {\n    vec2 q = vec2(length(p.xz) - t.x, p.y);\n    return length(q) - t.y;\n}\n\nfloat knob_sd_cone(vec3 p, vec2 c) {\n    // c is the sin/cos of the angle\n    float q = length(p.xy);\n    return dot(c, vec2(q, p.z));\n}\n\nfloat knob_sd_capped_cylinder(vec3 p, float h, float r) {\n    vec2 d = abs(vec2(length(p.xz), p.y)) - vec2(h, r);\n    return min(max(d.x, d.y), 0.0) + length(max(d, 0.0));\n}\n\nfloat knob_sd_tri_prism(vec3 p, vec2 h) {\n    vec3 q = abs(p);\n    return max(q.z - h.y, max(q.x*0.866025 + p.y*0.5, -p.y) - h.x*0.5);\n}\n\nfloat knob_smooth_union(float d1, float d2, float k) {\n    float h = clamp(0.5 + 0.5*(d2 - d1)/k, 0.0, 1.0);\n    return mix(d2, d1, h) - k*h*(1.0 - h);\n}\n\nfloat knob_ssub(float d1, float d2, float k) {\n    float h = clamp(0.5 - 0.5*(d2 + d1)/k, 0.0, 1.0);\n    return mix(d2, -d1, h) + k*h*(1.0 - h);\n}\n\n// ---- the model (vendored) ---------------------------------------------------\n\nfloat knob_base(vec3 p) {\n    // Intersect two cones\n    float base = knob_smooth_union(knob_sd_cone((p + vec3(0.0, 0.9, 0.0)) * knob_rot(vec3(1.0, 0.0, 0.0), -PI/2.0),\n                                                vec2(PI/3.0, PI/3.0)),\n                                   knob_sd_cone((p - vec3(0.0, 0.9, 0.0)) * knob_rot(vec3(1.0, 0.0, 0.0), PI/2.0),\n                                                vec2(PI/3.0, PI/3.0)),\n                                   0.02);\n    // Bound the base radius\n    base = max(base, knob_sd_capped_cylinder(p, 1.1, 0.25)) * 0.7;\n    // Dig out the center\n    base = max(-knob_sd_capped_cylinder(p, 0.6, 0.3), base);\n    // Cut a slice of the pie\n    base = max(-knob_sd_tri_prism((p + vec3(0.0, 0.0, -1.0)) * knob_rot(vec3(1.0, 0.0, 0.0), PI/2.0), vec2(1.2, 0.3)), base);\n    return base;\n}\n\nfloat knob_shape(vec3 p) {\n    float sphere = knob_sd_sphere(p, 1.0);\n    float cutout = knob_sd_sphere(p - vec3(0.0, 0.5, 0.5), 0.7);\n    float cutout_etch = knob_sd_torus((p - vec3(0.0, 0.2, 0.2)) * knob_rot(vec3(1.0, 0.0, 0.0), -PI/4.0), vec2(1.0, 0.05));\n    float innersphere = knob_sd_sphere(p - vec3(0.0, 0.0, 0.0), 0.75);\n\n    // Cutout sphere\n    float d = knob_ssub(cutout, sphere, 0.1);\n\n    // Add eye, etch the sphere\n    d = min(d, innersphere);\n    d = max(-cutout_etch, d);\n\n    // Add base\n    d = min(knob_ssub(sphere, knob_base(p - vec3(0.0, -0.775, 0.0)), 0.1), d);\n    return d;\n}\n\n// ---- ours: placement + the marched intersect --------------------------------\n\n// `radius` is the model's own unit sphere in world units: the corpus model is authored\n// at radius 1 (its 0.8 internal scale is part of the vendored maths and stays inside).\nfloat knob_sdf(vec3 p, Knob k) {\n    vec3 q = p / k.radius;\n    const float scale = 0.8;\n    return knob_shape(q / scale) * scale * k.radius;\n}\n\n// Marching (`knob_sdf_intersect`) and the gradient normal (`knob_sdf_normal`) are\n// GENERATED from knob_sdf when a program marches this shape — fable-sdf-contract §4.\n";
  const KNOB_RADIAL = 0.88;
  const KNOB_TOP = 0.8;
  const KNOB_BOTTOM = -0.86;
  const knobDescriptor = {
    type: "knob",
    // CANONICAL (fable-sdf-contract §2): origin at the model's unit-sphere centre; no
    // center row, no bounds() — the AABB derives from the marchBound cylinder.
    params: [
      { name: "radius", kind: "length", shape: "number", required: true, constraint: { kind: "positive" } }
    ],
    glsl: knobGLSL,
    provides: { sdf: true, analytic: false },
    // A solid of revolution (bar the pie-slice cut in the base), so a cylinder is the
    // natural bound: it is 3.4× tighter than the sphere the corpus's own scenes use
    // (which would need radius 1.20 — the corner of the base disc, not the top of the ball).
    marchBound: {
      type: "cylinder",
      values: (v) => {
        const r = v.radius;
        return {
          center: [0, r * (KNOB_TOP + KNOB_BOTTOM) / 2, 0],
          radius: r * KNOB_RADIAL,
          halfHeight: r * (KNOB_TOP - KNOB_BOTTOM) / 2
        };
      }
    },
    similarityClosed: false
    // the model has a canonical axis and a canonical facing
  };
  var mengerGLSL = "// Menger sponge — IQ's classic, as an ordinary occupant. `size` is the half-extent of\n// the enclosing cube (the sponge is that cube, carved down).\n//\n// The construction is subtractive, which is what makes it cheap: start with a box, then\n// at each scale fold space into a 3×3×3 cell (`mod(q·s, 2) − 1`) and MAX out a cross of\n// three square tubes. Each iteration triples s, so the holes get three times finer.\n// Seven levels is past the point where more resolves on screen at ordinary framing.\n//\n// SUBTRACTIVE ⇒ THE BOUND IS FREE, the same argument the eroded shapes make: max() only\n// raises the field, so the sponge never leaves its cube and `marchBound` is that cube\n// exactly (menger.ts). The reference library bounded it with a sphere of radius 1.9·size\n// — 6× the volume, all of it empty corner.\n// Provides (struct + march/normal GENERATED — A1, fable-sdf-contract §4): menger_sdf().\n\n// The cheap max-form box the sponge's own iteration is tuned around (file-private).\n// NOT box_sdf: that one is exact, this one underestimates outside the box — legal under\n// the sdf clauses (never overestimates), and the DE's tuning assumes it.\nfloat menger_cell_box(vec3 p, vec3 b) {\n    vec3 d = abs(p) - b;\n    return min(max(d.x, max(d.y, d.z)), length(max(d, 0.0)));\n}\n\nfloat menger_sdf(vec3 p, Menger m) {\n    vec3 q = p / m.size;\n    float d = menger_cell_box(q, vec3(1.0));\n    float s = 1.0;\n    for (int i = 0; i < int(m.iterations); i++) {\n        vec3 a = mod(q * s, 2.0) - 1.0;\n        s *= 3.0;\n        vec3 r = abs(1.0 - 3.0 * abs(a));\n        // the cross of three square tubes carved out of this cell\n        float da = max(r.x, r.y);\n        float db = max(r.y, r.z);\n        float dc = max(r.z, r.x);\n        d = max(d, (min(da, min(db, dc)) - 1.0) / s);\n    }\n    return m.size * d;   // back to world units — a field in q-space is a distance in q-space\n}\n\n// Marching (`menger_sdf_intersect`) and the gradient normal (`menger_sdf_normal`) are\n// GENERATED from menger_sdf when a program marches this shape — fable-sdf-contract §4.\n// The sponge is flat-faced everywhere, so the gradient taps read a face normal except\n// exactly on an edge.\n";
  const mengerDescriptor = {
    type: "menger",
    // CANONICAL (fable-sdf-contract §2): origin-centred; no center row, no bounds()
    // (the AABB derives from the marchBound cube).
    params: [
      // Half-extent of the enclosing cube (the sponge spans [−size, size]³).
      { name: "size", kind: "length", shape: "number", required: true, constraint: { kind: "positive" } },
      { name: "iterations", kind: "scalar", shape: "number", required: false, default: 5, constraint: { kind: "positive" } }
    ],
    glsl: mengerGLSL,
    provides: { sdf: true, analytic: false },
    marchBound: {
      type: "box",
      values: (v) => ({ halfSize: [v.size, v.size, v.size] })
    },
    similarityClosed: false,
    // the 3×3×3 fold has canonical axes: no row absorbs R
    // Each level triples the frequency, so the cost is linear in iterations while the
    // feature size falls as 3⁻ⁿ. Past ~7 the finest tubes are far below a pixel at any
    // sane framing and the marcher just burns steps resolving them.
    validateValues(v) {
      const n = v.iterations;
      return !Number.isInteger(n) || n < 1 || n > 8 ? [`menger: iterations (${n}) must be a whole number in 1…8 — level n has feature size 3⁻ⁿ, and past 8 that is far below a pixel`] : [];
    }
  };
  var apollonianGLSL = "// Apollonian gasket — the sphere-inversion IFS (evilryu/mla lineage), wrapped in an\n// outer inversion that maps the space-filling gasket to a bounded object. `morph` is the\n// inversion radius² that deforms it (~0.8…1.5; 1.2 is the classic still).\n//\n// WHY THIS SHAPE HAS A `thickness` ROW, which is the one real decision in the port. The\n// gasket's limit set has EMPTY INTERIOR — the distance estimate is ≥ 0 everywhere and\n// reaches 0 only ON the fractal (measured: zero negative samples over a 200³ grid). A\n// marcher still renders it, because acceptance is `d < march_epsilon(t)` — but then the\n// SHAPE IS A FUNCTION OF THE MARCHER'S TOLERANCE: change MARCH_EPSILON, or just look\n// from further away (the epsilon grows with t), and the object thickens. That is exactly\n// the class of accident this codebase legislates away elsewhere (the heterogeneous\n// medium IS min(σ, majorant), with the clamp emitted in the lookup — fable-heterogeneous\n// -media). So the object here is DECLARED to be the ε-neighbourhood of the limit set:\n// `thickness` is that ε, authored in world units, and the field is a true signed\n// distance to it with a genuine interior. A dielectric apollonian is then meaningful,\n// containment works, and the picture no longer moves when the tolerance does.\n//\n// Subtracting a constant keeps the estimate conservative: if f ≤ dist(p, Z) then for p\n// outside the thickened set, dist(p, Z_t) = dist(p, Z) − t ≥ f − t. Never overestimates.\n//\n// Deferred: the ORBIT TRAP. The reference exposes min(|p|, |p|²) over the orbit as\n// colouring data, which wants a per-shape data channel this repo does not have yet\n// (Hit.uv is a surface chart, and an orbit trap is not one — faking it there would be\n// the kind of magic fable-imagery P2 explicitly refused).\n// Provides (struct + march/normal GENERATED — A1, fable-sdf-contract §4): apollonian_sdf().\n\n// The core gasket: fold into ±1 cells, invert in a sphere of radius² `morph`, and\n// accumulate the conformal scale — the estimate is the folded distance divided by it.\nfloat apollonian_gasket(vec3 p, float morph, int iterations) {\n    float scale = 1.0;\n    for (int i = 0; i < iterations; i++) {\n        p -= 2.0 * round(0.5 * p);\n        float p2 = dot(p, p);\n        float k = morph / max(p2, 1e-12);\n        p *= k;\n        scale *= k;\n    }\n    float res = min(abs(p.z) + abs(p.x), min(abs(p.x) + abs(p.y), abs(p.y) + abs(p.z)));\n    return res / scale;\n}\n\nfloat apollonian_sdf(vec3 p, Apollonian a) {\n    vec3 q = p / a.size;\n    // The outer inversion. Its POLE is the local origin, where the gasket genuinely\n    // accumulates (the origin is the pre-image of infinity, and the gasket fills space\n    // there) — so the field going to zero at q = 0 is the shape, not an artifact. The\n    // guard is only against the division itself.\n    float s = 4.0 / max(dot(q, q), 1e-12);\n    float d = 0.25 * apollonian_gasket(q * s + vec3(1.0), a.morph, int(a.iterations)) / s;\n    return a.size * d - a.thickness;\n}\n\n// Marching (`apollonian_sdf_intersect`) and the gradient normal (`apollonian_sdf_normal`)\n// are GENERATED from apollonian_sdf when a program marches this shape — fable-sdf-contract\n// §4. This is the shape that leans on the step budget hardest: a distance ESTIMATE\n// underestimates, so approach near the limit set is geometric rather than quadratic and\n// the step count is the real cost.\n";
  const apollonianExtent = (v) => v.size * (1.6 + 0.8 * v.morph) + v.thickness;
  const apollonianDescriptor = {
    type: "apollonian",
    // CANONICAL (fable-sdf-contract §2): origin-centred; no center row, no bounds()
    // (the AABB derives from the marchBound cube).
    params: [
      { name: "size", kind: "length", shape: "number", required: true, constraint: { kind: "positive" } },
      // The inversion radius² — the morph dial. 1.2 is the classic still.
      { name: "morph", kind: "scalar", shape: "number", required: false, default: 1.2, constraint: { kind: "positive" } },
      // The declared ε-neighbourhood of the limit set (apollonian.glsl's header): what
      // makes this a solid with an interior rather than a picture of the marcher's
      // tolerance. A world length, so it scales with a driven placement like `size`.
      { name: "thickness", kind: "length", shape: "number", required: false, default: 0.012, constraint: { kind: "positive" } },
      { name: "iterations", kind: "scalar", shape: "number", required: false, default: 8, constraint: { kind: "positive" } }
    ],
    glsl: apollonianGLSL,
    provides: { sdf: true, analytic: false },
    marchBound: {
      type: "box",
      values: (v) => {
        const h = apollonianExtent(v);
        return { halfSize: [h, h, h] };
      }
    },
    similarityClosed: false,
    // the ±1 cell fold has canonical axes
    // `morph` outside the fitted band would walk the shape out of its bound (the extent
    // grows roughly linearly in it) — rejected rather than silently clipped. Iterations
    // past ~12 add structure below any sane thickness and only cost march steps.
    validateValues(v) {
      const out = [];
      const morph = v.morph, n = v.iterations;
      if (morph < 0.7 || morph > 1.5) out.push(`apollonian: morph (${morph}) must be in 0.7…1.5 — the bound fit (apollonian.ts) is measured over that band, and outside it the gasket grows past its own envelope`);
      if (!Number.isInteger(n) || n < 1 || n > 12) out.push(`apollonian: iterations (${n}) must be a whole number in 1…12`);
      return out;
    }
  };
  const PRIMITIVES = {
    sphere: sphereDescriptor,
    plane: planeDescriptor,
    box: boxDescriptor,
    quad: quadDescriptor,
    cylinder: cylinderDescriptor,
    disk: diskDescriptor,
    torus: torusDescriptor,
    bottle: bottleDescriptor,
    knob: knobDescriptor,
    menger: mengerDescriptor,
    apollonian: apollonianDescriptor
  };
  function primitive(type) {
    const d = PRIMITIVES[type];
    if (!d) throw new Error(`geometry: primitive '${type}' has no descriptor (Planner/Validator should have rejected it)`);
    return d;
  }
  function resolvePrimitiveValues(d, values) {
    const out = { ...values };
    for (const f of d.params) {
      if (out[f.name] === void 0 && f.default !== void 0) out[f.name] = f.default;
    }
    return out;
  }
  const BVH_LEAF_SIZE = 2;
  const TLAS_LEAF_SIZE = 2;
  const BVH_BINS = 12;
  const BVH_STACK_DEPTH = 64;
  function buildBVHCore(boxes, n, opts) {
    const { leafSize, weights, alwaysSplit = false, depthCap } = opts;
    const cx = new Float32Array(n), cy = new Float32Array(n), cz = new Float32Array(n);
    for (let t = 0; t < n; t++) {
      cx[t] = (boxes[6 * t] + boxes[6 * t + 3]) * 0.5;
      cy[t] = (boxes[6 * t + 1] + boxes[6 * t + 4]) * 0.5;
      cz[t] = (boxes[6 * t + 2] + boxes[6 * t + 5]) * 0.5;
    }
    const centroidOf = (a) => a === 0 ? cx : a === 1 ? cy : cz;
    const order = new Uint32Array(n);
    for (let i = 0; i < n; i++) order[i] = i;
    let nodeCount = 0;
    const bounds = new Float64Array(6);
    const cb = new Float64Array(6);
    const acc = new Float64Array(6);
    const binBox = new Float64Array(3 * BVH_BINS * 6);
    const binCnt = new Int32Array(3 * BVH_BINS);
    const binW = new Float64Array(3 * BVH_BINS);
    const leftArea = new Float32Array(BVH_BINS - 1), rightArea = new Float32Array(BVH_BINS - 1);
    const leftCnt = new Int32Array(BVH_BINS - 1), rightCnt = new Int32Array(BVH_BINS - 1);
    const leftW = new Float64Array(BVH_BINS - 1), rightW = new Float64Array(BVH_BINS - 1);
    let maxDepth = 0;
    const resetBox = (b, at) => {
      b[at] = Infinity;
      b[at + 1] = Infinity;
      b[at + 2] = Infinity;
      b[at + 3] = -Infinity;
      b[at + 4] = -Infinity;
      b[at + 5] = -Infinity;
    };
    const growBox = (b, at, src, sat) => {
      for (let a = 0; a < 3; a++) {
        if (src[sat + a] < b[at + a]) b[at + a] = src[sat + a];
        if (src[sat + 3 + a] > b[at + 3 + a]) b[at + 3 + a] = src[sat + 3 + a];
      }
    };
    const area = (b, at) => {
      const dx = b[at + 3] - b[at], dy = b[at + 4] - b[at + 1], dz = b[at + 5] - b[at + 2];
      if (dx < 0 || dy < 0 || dz < 0) return 0;
      return 2 * (dx * dy + dy * dz + dz * dx);
    };
    const ceilLog2 = (c) => c <= 1 ? 0 : 32 - Math.clz32(c - 1);
    const emit = (start, end, depth, lo, hi) => {
      if (depth > maxDepth) maxDepth = depth;
      const nodeIdx = nodeCount++;
      resetBox(bounds, 0);
      resetBox(cb, 0);
      let w = 0;
      for (let i = start; i < end; i++) {
        const t = order[i];
        const at = 6 * t;
        if (boxes[at] < bounds[0]) bounds[0] = boxes[at];
        if (boxes[at + 1] < bounds[1]) bounds[1] = boxes[at + 1];
        if (boxes[at + 2] < bounds[2]) bounds[2] = boxes[at + 2];
        if (boxes[at + 3] > bounds[3]) bounds[3] = boxes[at + 3];
        if (boxes[at + 4] > bounds[4]) bounds[4] = boxes[at + 4];
        if (boxes[at + 5] > bounds[5]) bounds[5] = boxes[at + 5];
        if (cx[t] < cb[0]) cb[0] = cx[t];
        if (cx[t] > cb[3]) cb[3] = cx[t];
        if (cy[t] < cb[1]) cb[1] = cy[t];
        if (cy[t] > cb[4]) cb[4] = cy[t];
        if (cz[t] < cb[2]) cb[2] = cz[t];
        if (cz[t] > cb[5]) cb[5] = cz[t];
        if (weights !== void 0) w += weights[t];
      }
      const count = end - start;
      const makeLeaf = () => {
        opts.emitLeaf(nodeIdx, start, count, bounds[0], bounds[1], bounds[2], bounds[3], bounds[4], bounds[5], w, lo, hi, order);
        return nodeIdx;
      };
      if (count <= leafSize) return makeLeaf();
      const balancedOnly = depthCap !== void 0 && depth + ceilLog2(count) >= depthCap;
      let bestAxis = -1, bestSplit = -1, bestCost = Infinity;
      const v0 = cb[3] - cb[0] >= 1e-12, v1 = cb[4] - cb[1] >= 1e-12, v2 = cb[5] - cb[2] >= 1e-12;
      if (!balancedOnly && (v0 || v1 || v2)) {
        const s0 = v0 ? BVH_BINS / (cb[3] - cb[0]) : 0;
        const s1 = v1 ? BVH_BINS / (cb[4] - cb[1]) : 0;
        const s2 = v2 ? BVH_BINS / (cb[5] - cb[2]) : 0;
        const lo0 = cb[0], lo1 = cb[1], lo2 = cb[2];
        for (let b = 0; b < 3 * BVH_BINS; b++) {
          resetBox(binBox, 6 * b);
          binCnt[b] = 0;
          binW[b] = 0;
        }
        for (let i = start; i < end; i++) {
          const tri = order[i];
          const at = 6 * tri;
          const bx0 = boxes[at], bx1 = boxes[at + 1], bx2 = boxes[at + 2];
          const bx3 = boxes[at + 3], bx4 = boxes[at + 4], bx5 = boxes[at + 5];
          for (let axis = 0; axis < 3; axis++) {
            let b;
            if (axis === 0) {
              if (!v0) continue;
              b = Math.floor((cx[tri] - lo0) * s0);
            } else if (axis === 1) {
              if (!v1) continue;
              b = Math.floor((cy[tri] - lo1) * s1);
            } else {
              if (!v2) continue;
              b = Math.floor((cz[tri] - lo2) * s2);
            }
            if (b < 0) b = 0;
            if (b >= BVH_BINS) b = BVH_BINS - 1;
            const slot = axis * BVH_BINS + b;
            binCnt[slot]++;
            binW[slot] += weights !== void 0 ? weights[tri] : 1;
            const bt = 6 * slot;
            if (bx0 < binBox[bt]) binBox[bt] = bx0;
            if (bx1 < binBox[bt + 1]) binBox[bt + 1] = bx1;
            if (bx2 < binBox[bt + 2]) binBox[bt + 2] = bx2;
            if (bx3 > binBox[bt + 3]) binBox[bt + 3] = bx3;
            if (bx4 > binBox[bt + 4]) binBox[bt + 4] = bx4;
            if (bx5 > binBox[bt + 5]) binBox[bt + 5] = bx5;
          }
        }
        for (let axis = 0; axis < 3; axis++) {
          if (axis === 0 ? !v0 : axis === 1 ? !v1 : !v2) continue;
          const base = axis * BVH_BINS;
          resetBox(acc, 0);
          let accCnt = 0;
          let accW = 0;
          for (let b = 0; b < BVH_BINS - 1; b++) {
            growBox(acc, 0, binBox, 6 * (base + b));
            accCnt += binCnt[base + b];
            accW += binW[base + b];
            leftArea[b] = area(acc, 0);
            leftCnt[b] = accCnt;
            leftW[b] = accW;
          }
          resetBox(acc, 0);
          accCnt = 0;
          accW = 0;
          for (let b = BVH_BINS - 1; b > 0; b--) {
            growBox(acc, 0, binBox, 6 * (base + b));
            accCnt += binCnt[base + b];
            accW += binW[base + b];
            rightArea[b - 1] = area(acc, 0);
            rightCnt[b - 1] = accCnt;
            rightW[b - 1] = accW;
          }
          for (let b = 0; b < BVH_BINS - 1; b++) {
            if (leftCnt[b] === 0 || rightCnt[b] === 0) continue;
            const cost = leftArea[b] * leftW[b] + rightArea[b] * rightW[b];
            if (cost < bestCost) {
              bestCost = cost;
              bestAxis = axis;
              bestSplit = b;
            }
          }
        }
      }
      if (!alwaysSplit) {
        const leafCost = area(bounds, 0) * (weights !== void 0 ? w : count);
        if (bestAxis === -1 || bestCost >= leafCost) return makeLeaf();
      }
      let mid = -1;
      if (bestAxis !== -1) {
        const plo = cb[bestAxis], scale = BVH_BINS / (cb[3 + bestAxis] - cb[bestAxis]);
        const cen = centroidOf(bestAxis);
        let m = start;
        for (let i = start; i < end; i++) {
          const tri = order[i];
          let b = Math.floor((cen[tri] - plo) * scale);
          if (b < 0) b = 0;
          if (b >= BVH_BINS) b = BVH_BINS - 1;
          if (b <= bestSplit) {
            const tmp = order[i];
            order[i] = order[m];
            order[m] = tmp;
            m++;
          }
        }
        if (m > start && m < end) mid = m;
      }
      if (mid === -1) {
        mid = start + end >> 1;
      }
      const minx = bounds[0], miny = bounds[1], minz = bounds[2];
      const maxx = bounds[3], maxy = bounds[4], maxz = bounds[5];
      const rlo = depth < 24 ? lo | 1 << depth : lo;
      const rhi = depth < 24 ? hi : hi | 1 << depth - 24;
      emit(start, mid, depth + 1, lo, hi);
      const rightIdx = emit(mid, end, depth + 1, rlo, rhi);
      opts.emitInternal(nodeIdx, bestAxis, rightIdx, minx, miny, minz, maxx, maxy, maxz, w);
      return nodeIdx;
    };
    if (n > 0) emit(0, n, 0, 0, 0);
    return { order, nodeCount, maxDepth };
  }
  function buildBVHNodesFlat(boxes, n, leafSize = BVH_LEAF_SIZE, alwaysSplit = false) {
    const nodes = new Float32Array(n > 0 ? 8 * (2 * n - 1) : 0);
    const { order, nodeCount, maxDepth } = buildBVHCore(boxes, n, {
      leafSize,
      alwaysSplit,
      fallback: "median",
      emitLeaf: (ni, start, count, mnx, mny, mnz, mxx, mxy, mxz) => {
        nodes[ni * 8 + 0] = mnx;
        nodes[ni * 8 + 1] = mny;
        nodes[ni * 8 + 2] = mnz;
        nodes[ni * 8 + 3] = count;
        nodes[ni * 8 + 4] = mxx;
        nodes[ni * 8 + 5] = mxy;
        nodes[ni * 8 + 6] = mxz;
        nodes[ni * 8 + 7] = start;
      },
      emitInternal: (ni, axis, rightIdx, mnx, mny, mnz, mxx, mxy, mxz) => {
        nodes[ni * 8 + 0] = mnx;
        nodes[ni * 8 + 1] = mny;
        nodes[ni * 8 + 2] = mnz;
        nodes[ni * 8 + 3] = -1 - Math.max(axis, 0);
        nodes[ni * 8 + 4] = mxx;
        nodes[ni * 8 + 5] = mxy;
        nodes[ni * 8 + 6] = mxz;
        nodes[ni * 8 + 7] = rightIdx;
      }
    });
    if (maxDepth >= BVH_STACK_DEPTH) {
      console.warn(`BVH depth ${maxDepth} >= BVH_STACK_DEPTH ${BVH_STACK_DEPTH} for ${n} items — the GLSL walk may drop deep subtrees; raise BVH_STACK_DEPTH or check for degenerate geometry.`);
    }
    return { nodes: nodes.subarray(0, nodeCount * 8), nodeCount, order, maxDepth };
  }
  const CWBVH_NODE_WORDS = 20;
  const CWBVH_MAX_PRIMS_PER_LEAF = 3;
  const CWBVH_MAX_PRIMS_PER_NODE = 24;
  const CWBVH_C_NODE = 1;
  const CWBVH_C_PRIM_DEFAULT = 0.3;
  const CWBVH_STACK_DEPTH = 24;
  const f32buf = new ArrayBuffer(4);
  const f32view = new Float32Array(f32buf);
  const u32view = new Uint32Array(f32buf);
  const floatBits = (f) => {
    f32view[0] = f;
    return u32view[0];
  };
  const bitsFloat = (u) => {
    u32view[0] = u;
    return f32view[0];
  };
  function buildCWBVH(boxes, n, cPrim = CWBVH_C_PRIM_DEFAULT) {
    if (n === 0) return { nodes: new Uint32Array(0), nodeCount: 0, order: new Uint32Array(0), maxDepth: 0 };
    const bin = buildBVHNodesFlat(boxes, n, 1, true);
    const bn = bin.nodes;
    const BN = bin.nodeCount;
    const isLeaf = (i) => bn[8 * i + 3] >= 0;
    const rightOf = (i) => bn[8 * i + 7];
    const start = new Uint32Array(BN);
    const end = new Uint32Array(BN);
    const areaOf = new Float32Array(BN);
    const fb = new Float64Array(6 * BN);
    for (let i = BN - 1; i >= 0; i--) {
      const dx = bn[8 * i + 4] - bn[8 * i], dy = bn[8 * i + 5] - bn[8 * i + 1], dz = bn[8 * i + 6] - bn[8 * i + 2];
      areaOf[i] = Math.max(0, 2 * (dx * dy + dy * dz + dz * dx));
      if (isLeaf(i)) {
        start[i] = bn[8 * i + 7];
        end[i] = start[i] + bn[8 * i + 3];
        for (let a = 0; a < 3; a++) {
          fb[6 * i + a] = Infinity;
          fb[6 * i + 3 + a] = -Infinity;
        }
        for (let k = start[i]; k < end[i]; k++) {
          const item = bin.order[k];
          for (let a = 0; a < 3; a++) {
            fb[6 * i + a] = Math.min(fb[6 * i + a], boxes[6 * item + a]);
            fb[6 * i + 3 + a] = Math.max(fb[6 * i + 3 + a], boxes[6 * item + 3 + a]);
          }
        }
      } else {
        start[i] = start[i + 1];
        end[i] = end[rightOf(i)];
        const l = i + 1, r = rightOf(i);
        for (let a = 0; a < 3; a++) {
          fb[6 * i + a] = Math.min(fb[6 * l + a], fb[6 * r + a]);
          fb[6 * i + 3 + a] = Math.max(fb[6 * l + 3 + a], fb[6 * r + 3 + a]);
        }
      }
    }
    const primsOf = (i) => end[i] - start[i];
    const COST = new Float32Array(7 * BN);
    const CHOICE = new Uint8Array(7 * BN);
    const INF = Infinity;
    const distribute = (l, r, j) => {
      let best = INF;
      for (let k = Math.max(1, j - 7); k < j && k <= 7; k++) {
        const c = COST[7 * l + k - 1] + COST[7 * r + (j - k) - 1];
        if (c < best) best = c;
      }
      return best;
    };
    for (let i2 = BN - 1; i2 >= 0; i2--) {
      const A = areaOf[i2];
      if (isLeaf(i2)) {
        for (let i = 0; i < 7; i++) {
          COST[7 * i2 + i] = A * cPrim;
          CHOICE[7 * i2 + i] = 0;
        }
        continue;
      }
      const l = i2 + 1, r = rightOf(i2);
      const P = primsOf(i2);
      const cLeaf = P <= CWBVH_MAX_PRIMS_PER_LEAF ? A * P * cPrim : INF;
      const cInternal = distribute(l, r, 8) + A * CWBVH_C_NODE;
      if (cLeaf <= cInternal) {
        COST[7 * i2] = cLeaf;
        CHOICE[7 * i2] = 0;
      } else {
        COST[7 * i2] = cInternal;
        CHOICE[7 * i2] = 1;
      }
      for (let i = 2; i <= 7; i++) {
        const carry = COST[7 * i2 + i - 2];
        const dist = distribute(l, r, i);
        if (dist < carry) {
          COST[7 * i2 + i - 1] = dist;
          CHOICE[7 * i2 + i - 1] = 3;
        } else {
          COST[7 * i2 + i - 1] = carry;
          CHOICE[7 * i2 + i - 1] = 2;
        }
      }
    }
    const forestOf = (node, i, out) => {
      if (i === 1 || isLeaf(node)) {
        out.push(node);
        return;
      }
      const ch = CHOICE[7 * node + i - 1];
      if (ch === 2) {
        forestOf(node, i - 1, out);
        return;
      }
      const l = node + 1, r = rightOf(node);
      let bestK = -1, best = INF;
      for (let k = Math.max(1, i - 7); k < i && k <= 7; k++) {
        const c = COST[7 * l + k - 1] + COST[7 * r + (i - k) - 1];
        if (c < best) {
          best = c;
          bestK = k;
        }
      }
      forestOf(l, bestK, out);
      forestOf(r, i - bestK, out);
    };
    const childrenOf = (node) => {
      const out = [];
      if (isLeaf(node)) {
        out.push(node);
        return out;
      }
      const l = node + 1, r = rightOf(node);
      let bestK = -1, best = INF;
      for (let k = 1; k <= 7; k++) {
        const c = COST[7 * l + k - 1] + COST[7 * r + (8 - k) - 1];
        if (c < best) {
          best = c;
          bestK = k;
        }
      }
      forestOf(l, bestK, out);
      forestOf(r, 8 - bestK, out);
      return out;
    };
    const isLeafChild = (member) => CHOICE[7 * member] === 0;
    let wideCount = 0;
    const countWide = (node) => {
      wideCount++;
      for (const m of childrenOf(node)) if (!isLeafChild(m)) countWide(m);
    };
    countWide(0);
    const nodes = new Uint32Array(wideCount * CWBVH_NODE_WORDS);
    const order = new Uint32Array(n);
    let nodeCursor = 0;
    let itemCursor = 0;
    let maxDepth = 0;
    const slotFor = (node, px, py, pz) => {
      const cx = (bn[8 * node] + bn[8 * node + 4]) * 0.5;
      const cy = (bn[8 * node + 1] + bn[8 * node + 5]) * 0.5;
      const cz = (bn[8 * node + 2] + bn[8 * node + 6]) * 0.5;
      return (cx - px > 0 ? 1 : 0) | (cy - py > 0 ? 2 : 0) | (cz - pz > 0 ? 4 : 0);
    };
    const emit = (node, wideIdx, depth) => {
      if (depth > maxDepth) maxDepth = depth;
      const members = childrenOf(node);
      let bx0 = Infinity, by0 = Infinity, bz0 = Infinity, bx1 = -Infinity, by1 = -Infinity, bz1 = -Infinity;
      for (const m of members) {
        bx0 = Math.min(bx0, fb[6 * m]);
        by0 = Math.min(by0, fb[6 * m + 1]);
        bz0 = Math.min(bz0, fb[6 * m + 2]);
        bx1 = Math.max(bx1, fb[6 * m + 3]);
        by1 = Math.max(by1, fb[6 * m + 4]);
        bz1 = Math.max(bz1, fb[6 * m + 5]);
      }
      const pcx = (bx0 + bx1) * 0.5, pcy = (by0 + by1) * 0.5, pcz = (bz0 + bz1) * 0.5;
      const nextDown = (f) => {
        if (f === 0) return -Math.pow(2, -149);
        const u = floatBits(f);
        return bitsFloat(f > 0 ? u - 1 : u + 1);
      };
      const f32Floor = (v) => {
        const f = Math.fround(v);
        return f > v ? nextDown(f) : f;
      };
      const slotOf = new Int32Array(8).fill(-1);
      for (let mi = 0; mi < members.length; mi++) {
        const want = slotFor(members[mi], pcx, pcy, pcz);
        let s = want;
        while (slotOf[s] >= 0) s = s + 1 & 7;
        slotOf[s] = mi;
      }
      const p0 = f32Floor(bx0), p1 = f32Floor(by0), p2 = f32Floor(bz0);
      const expByte = (p, hi) => {
        const extent = hi - p;
        let b;
        if (!(extent > 0)) b = 1;
        else b = Math.max(1, Math.ceil(Math.log2(extent / 255)) + 127);
        while (b < 255 && Math.fround(p + 255 * bitsFloat(b << 23)) < hi) b++;
        if (b > 254) throw new Error(`cwbvh: extent ${extent} exceeds the exponent range`);
        return b;
      };
      const ebx = expByte(p0, bx1), eby = expByte(p1, by1), ebz = expByte(p2, bz1);
      const sx = bitsFloat(ebx << 23), sy = bitsFloat(eby << 23), sz = bitsFloat(ebz << 23);
      const base = wideIdx * CWBVH_NODE_WORDS;
      nodes[base] = floatBits(p0);
      nodes[base + 1] = floatBits(p1);
      nodes[base + 2] = floatBits(p2);
      let imask = 0;
      let internalCount = 0;
      for (let s = 0; s < 8; s++) if (slotOf[s] >= 0 && !isLeafChild(members[slotOf[s]])) internalCount++;
      const childBase = nodeCursor;
      nodeCursor += internalCount;
      const primBase = itemCursor;
      const qlo = new Uint8Array(24), qhi = new Uint8Array(24);
      const meta = new Uint8Array(8);
      const quant = (v, p, s, up) => {
        let q = up ? Math.ceil((v - p) / s) : Math.floor((v - p) / s);
        q = Math.max(0, Math.min(255, q));
        while (up ? Math.fround(p + q * s) < v && q < 255 : Math.fround(p + q * s) > v && q > 0) q += up ? 1 : -1;
        return q;
      };
      for (let s = 0; s < 8; s++) {
        qlo[s] = 255;
        qlo[8 + s] = 255;
        qlo[16 + s] = 255;
        qhi[s] = 0;
        qhi[8 + s] = 0;
        qhi[16 + s] = 0;
      }
      for (let s = 0; s < 8; s++) {
        const mi = slotOf[s];
        if (mi < 0) continue;
        const m = members[mi];
        qlo[s] = quant(fb[6 * m], p0, sx, false);
        qlo[8 + s] = quant(fb[6 * m + 1], p1, sy, false);
        qlo[16 + s] = quant(fb[6 * m + 2], p2, sz, false);
        qhi[s] = quant(fb[6 * m + 3], p0, sx, true);
        qhi[8 + s] = quant(fb[6 * m + 4], p1, sy, true);
        qhi[16 + s] = quant(fb[6 * m + 5], p2, sz, true);
        if (isLeafChild(m)) {
          const count = primsOf(m);
          if (count > CWBVH_MAX_PRIMS_PER_LEAF) throw new Error("cwbvh: leaf child over P_max (DP invariant broken)");
          const offset = itemCursor - primBase;
          if (offset + count > CWBVH_MAX_PRIMS_PER_NODE) throw new Error("cwbvh: node item run over 24 (DP invariant broken)");
          meta[s] = (1 << count) - 1 << 5 | offset;
          for (let i = start[m]; i < end[m]; i++) order[itemCursor++] = bin.order[i];
        } else {
          imask |= 1 << s;
          meta[s] = 32 | 24 + s;
        }
      }
      nodes[base + 3] = ebx | eby << 8 | ebz << 16 | imask << 24;
      nodes[base + 4] = childBase;
      nodes[base + 5] = primBase;
      nodes[base + 6] = meta[0] | meta[1] << 8 | meta[2] << 16 | meta[3] << 24;
      nodes[base + 7] = meta[4] | meta[5] << 8 | meta[6] << 16 | meta[7] << 24;
      for (let w = 0; w < 6; w++) {
        const src = w < 3 ? qlo : qhi;
        const off = w % 3 * 8;
        nodes[base + 8 + 2 * w] = src[off] | src[off + 1] << 8 | src[off + 2] << 16 | src[off + 3] << 24;
        nodes[base + 9 + 2 * w] = src[off + 4] | src[off + 5] << 8 | src[off + 6] << 16 | src[off + 7] << 24;
      }
      let ci = 0;
      for (let s = 0; s < 8; s++) {
        const mi = slotOf[s];
        if (mi >= 0 && !isLeafChild(members[mi])) emit(members[mi], childBase + ci++, depth + 1);
      }
    };
    nodeCursor = 1;
    emit(0, 0, 1);
    if (nodeCursor !== wideCount) throw new Error(`cwbvh: emitted ${nodeCursor} nodes, counted ${wideCount}`);
    if (itemCursor !== n) throw new Error(`cwbvh: emitted ${itemCursor} items of ${n}`);
    if (maxDepth >= CWBVH_STACK_DEPTH) {
      console.warn(`CWBVH depth ${maxDepth} >= CWBVH_STACK_DEPTH ${CWBVH_STACK_DEPTH} for ${n} items — the GLSL walk may drop deep subtrees; raise CWBVH_STACK_DEPTH or check for degenerate input.`);
    }
    return { nodes, nodeCount: wideCount, order, maxDepth };
  }
  function decodePlacement(placements, i, out) {
    if (Array.isArray(placements)) {
      const g = placements[i];
      out.qx = g.rotation[0];
      out.qy = g.rotation[1];
      out.qz = g.rotation[2];
      out.qw = g.rotation[3];
      out.s = g.scale;
      out.tx = g.translation[0];
      out.ty = g.translation[1];
      out.tz = g.translation[2];
      return;
    }
    if (placements.orientations !== void 0) {
      const o = placements.orientations;
      const len = Math.hypot(o[4 * i], o[4 * i + 1], o[4 * i + 2], o[4 * i + 3]);
      out.qx = o[4 * i] / len;
      out.qy = o[4 * i + 1] / len;
      out.qz = o[4 * i + 2] / len;
      out.qw = o[4 * i + 3] / len;
    } else {
      out.qx = 0;
      out.qy = 0;
      out.qz = 0;
      out.qw = 1;
    }
    out.s = placements.sizes !== void 0 ? placements.sizes[i] : 1;
    out.tx = placements.positions[3 * i];
    out.ty = placements.positions[3 * i + 1];
    out.tz = placements.positions[3 * i + 2];
  }
  function attributeTexel(instance, slot, rows) {
    return instance * rows + slot;
  }
  function packInstanceBatch(localBox, placements, attributeRows, paramsRecord, buildCwbvh = false) {
    const n = Array.isArray(placements) ? placements.length : placements.count;
    const d = { qx: 0, qy: 0, qz: 0, qw: 1, s: 1, tx: 0, ty: 0, tz: 0 };
    const boxes = new Float64Array(6 * n);
    for (let i = 0; i < n; i++) {
      decodePlacement(placements, i, d);
      let minx = Infinity, miny = Infinity, minz = Infinity, maxx = -Infinity, maxy = -Infinity, maxz = -Infinity;
      for (let c = 0; c < 8; c++) {
        const px = c & 1 ? localBox.max[0] : localBox.min[0];
        const py = c & 2 ? localBox.max[1] : localBox.min[1];
        const pz = c & 4 ? localBox.max[2] : localBox.min[2];
        const rtx = 2 * (d.qy * pz - d.qz * py);
        const rty = 2 * (d.qz * px - d.qx * pz);
        const rtz = 2 * (d.qx * py - d.qy * px);
        const wx = (px + d.qw * rtx + d.qy * rtz - d.qz * rty) * d.s + d.tx;
        const wy = (py + d.qw * rty + d.qz * rtx - d.qx * rtz) * d.s + d.ty;
        const wz = (pz + d.qw * rtz + d.qx * rty - d.qy * rtx) * d.s + d.tz;
        if (wx < minx) minx = wx;
        if (wx > maxx) maxx = wx;
        if (wy < miny) miny = wy;
        if (wy > maxy) maxy = wy;
        if (wz < minz) minz = wz;
        if (wz > maxz) maxz = wz;
      }
      boxes[6 * i] = minx;
      boxes[6 * i + 1] = miny;
      boxes[6 * i + 2] = minz;
      boxes[6 * i + 3] = maxx;
      boxes[6 * i + 4] = maxy;
      boxes[6 * i + 5] = maxz;
    }
    const { nodes, nodeCount, order } = buildBVHNodesFlat(boxes, n, TLAS_LEAF_SIZE);
    const place = paramsRecord !== void 0 ? packParamsRecords(paramsRecord, placements, order, n, d) : packFrameRecords(placements, order, n, d);
    let attributes;
    if (attributeRows !== void 0 && attributeRows.length > 0) {
      const A = attributeRows.length;
      attributes = new Float32Array(n * A * 4);
      for (let i = 0; i < n; i++) {
        for (let a = 0; a < A; a++) {
          const { values, shape } = attributeRows[a];
          const src = order[i];
          const t = attributeTexel(i, a, A) * 4;
          if (values instanceof Float32Array) {
            if (shape === "vec3") {
              attributes[t + 0] = values[3 * src];
              attributes[t + 1] = values[3 * src + 1];
              attributes[t + 2] = values[3 * src + 2];
            } else {
              attributes[t + 0] = values[src];
            }
            continue;
          }
          const v = values[src];
          if (typeof v === "number") {
            attributes[t + 0] = v;
            attributes[t + 1] = shape === "vec3" ? v : 0;
            attributes[t + 2] = shape === "vec3" ? v : 0;
          } else {
            attributes[t + 0] = v[0];
            attributes[t + 1] = v[1];
            attributes[t + 2] = v[2];
          }
        }
      }
    }
    let cwbvh;
    if (buildCwbvh) {
      if (paramsRecord === void 0) throw new Error("packInstanceBatch: a CWBVH needs the params-tier record spec");
      const w = buildCWBVH(boxes, n);
      cwbvh = {
        nodes: w.nodes,
        nodeCount: w.nodeCount,
        records: packParamsRecords(paramsRecord, placements, w.order, n, d)
      };
    }
    return { placements: place, nodes, nodeCount, ...attributes !== void 0 ? { attributes } : {}, ...cwbvh !== void 0 ? { cwbvh } : {} };
  }
  function packFrameRecords(placements, order, n, d) {
    const place = new Float32Array(n * 8);
    for (let i = 0; i < n; i++) {
      decodePlacement(placements, order[i], d);
      const cx = -d.qx, cy = -d.qy, cz = -d.qz, cw = d.qw;
      const rx = 2 * (cy * d.tz - cz * d.ty);
      const ry = 2 * (cz * d.tx - cx * d.tz);
      const rz = 2 * (cx * d.ty - cy * d.tx);
      place[i * 8 + 0] = cx;
      place[i * 8 + 1] = cy;
      place[i * 8 + 2] = cz;
      place[i * 8 + 3] = cw;
      place[i * 8 + 4] = -(d.tx + cw * rx + cy * rz - cz * ry);
      place[i * 8 + 5] = -(d.ty + cw * ry + cz * rx - cx * rz);
      place[i * 8 + 6] = -(d.tz + cw * rz + cx * ry - cy * rx);
      place[i * 8 + 7] = d.s;
    }
    return place;
  }
  function packParamsRecords(spec, placements, order, n, d) {
    const desc = primitive(spec.type);
    const resolved = resolvePrimitiveValues(desc, spec.parameters);
    const rows = desc.params.map((p) => {
      const v = resolved[p.name];
      return Array.isArray(v) ? { point: p.kind === "point", width: 3, v0: v[0], v1: v[1], v2: v[2] } : { point: p.kind === "point", width: 1, v0: v, v1: 0, v2: 0 };
    });
    const place = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      decodePlacement(placements, order[i], d);
      let off = i * 4;
      for (const row of rows) {
        if (row.point) {
          const rx = 2 * (d.qy * row.v2 - d.qz * row.v1);
          const ry = 2 * (d.qz * row.v0 - d.qx * row.v2);
          const rz = 2 * (d.qx * row.v1 - d.qy * row.v0);
          place[off++] = (row.v0 + d.qw * rx + d.qy * rz - d.qz * ry) * d.s + d.tx;
          place[off++] = (row.v1 + d.qw * ry + d.qz * rx - d.qx * rz) * d.s + d.ty;
          place[off++] = (row.v2 + d.qw * rz + d.qx * ry - d.qy * rx) * d.s + d.tz;
        } else if (row.width === 3) {
          place[off++] = row.v0 * d.s;
          place[off++] = row.v1 * d.s;
          place[off++] = row.v2 * d.s;
        } else {
          place[off++] = row.v0 * d.s;
        }
      }
    }
    return place;
  }
  function answerWorkerTask(task) {
    const scope = self;
    try {
      const { result, transfers } = task();
      scope.postMessage(result, transfers);
    } catch (err) {
      scope.postMessage({ workerError: err instanceof Error ? err.message : String(err) });
    }
  }
  self.onmessage = (e) => answerWorkerTask(() => {
    const { localBox, placements, attrs, paramsRecord, buildCwbvh } = e.data;
    const packed = packInstanceBatch(localBox, placements, attrs, paramsRecord, buildCwbvh);
    const transfers = [packed.placements.buffer, packed.nodes.buffer];
    if (packed.attributes !== void 0) transfers.push(packed.attributes.buffer);
    if (packed.cwbvh !== void 0) transfers.push(packed.cwbvh.nodes.buffer, packed.cwbvh.records.buffer);
    return { result: packed, transfers };
  });
})();
