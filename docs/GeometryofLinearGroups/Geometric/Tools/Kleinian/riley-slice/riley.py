"""Reconstruction of the Riley slice with rational pleating rays,
after Elzenaar-Martin-Schillewaert.

Farey polynomials Phi_{p/q}(z) via the recursion
  Phi_{0/1} = 2 - z,  Phi_{1/1} = 2 + z,  Phi_{1/0} = 2 (constant)
  Phi_{L (+) R} = 8 - Phi_L * Phi_R - Phi_{R - L}
Pleating rays: the PRINCIPAL branch of Phi^{-1}((-inf, -2]) for each slope --
the unique branch asymptotic to arg(z) = pi*p/q (Keen-Series). Traced inward
from infinity (Phi = -2 - t, t decreasing to 0), landing on the boundary cusp.
These rays are pairwise disjoint and never enter the complement region.
Extensions continue each ray past its cusp along Phi = -2 + s, s: 0 -> 4, the
locus where the p/q word is elliptic; the beads on them sit at
Phi = -2cos(pi/n), the order-n Heckoid parameters of slope p/q.

NUMERICS.  Phi_{p/q} must never be evaluated from its expanded coefficients.
They reach 1e25 by q = 64 while |Phi| ~ 2 on the boundary, so float64 Horner
returns pure noise there -- measured 2.2e7 instead of -2 at the 31/64 cusp.
Everything below evaluates Phi through the Farey recursion instead (error
5e-13 at that same point).  Exact roots, used to certify the cusps, come from
python-flint; np.roots is wrong for two thirds of these polynomials.
"""
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.collections import LineCollection
from matplotlib.colors import hsv_to_rgb

try:
    from flint import ctx as flint_ctx, acb_poly
except ImportError:                      # required: mpmath is ~50x slower and
    raise SystemExit(                    # np.roots is simply wrong here
        "python-flint is required for exact Farey-polynomial roots.\n"
        "    pip install python-flint")
flint_ctx.prec = 250

QRAY = 64                                # slopes for pleating rays
QEXT = 20                                # slopes extended past the cusp
QVER = 30                                # slopes cusp-certified against flint
BEAD_NMAX = 24                           # Heckoid orders n = 1 .. NMAX
R0 = 30.0                                # radius at which rays are picked up
XLIM, YLIM = 5.6, 3.67

# ------------- Farey polynomials + Stern-Brocot paths ------------------------
# Exact integer coefficients (root-finding) and the L/R descent path from the
# root of the Stern-Brocot tree (cancellation-free evaluation).
phi = {(0, 1): np.array([2, -1], object),
       (1, 1): np.array([2, 1], object),
       (1, 0): np.array([2], object)}
path = {(0, 1): None, (1, 1): None}      # the two endpoint slopes are linear

def padd(a, b):
    n = max(len(a), len(b))
    out = np.zeros(n, object)
    out[:len(a)] += a
    out[:len(b)] += b
    return out

stack = [((0, 1), (1, 1), ())]
while stack:
    L, R, pth = stack.pop()
    pm, qm = L[0] + R[0], L[1] + R[1]
    if qm > QRAY:
        continue
    d = (abs(R[0] - L[0]), abs(R[1] - L[1]))
    phi[(pm, qm)] = padd(np.array([8], object),
                         -padd(np.convolve(phi[L], phi[R]), phi[d]))
    path[(pm, qm)] = pth
    stack.append((L, (pm, qm), pth + (0,)))
    stack.append(((pm, qm), R, pth + (1,)))

ray_fracs = sorted(path, key=lambda f: (f[1], f[0]))
print(f"{len(ray_fracs)} slopes up to denominator {QRAY}")

# ------------- cancellation-free evaluation of Phi ---------------------------
# Descending the Stern-Brocot tree, the state is the triple
#   (Phi_L, Phi_R, Phi_{R-L})  for the current Farey pair (L, R),
# with mediant value m = 8 - Phi_L*Phi_R - Phi_{R-L}.  Stepping left gives the
# pair (L, M) whose difference is M - L = R; stepping right gives (M, R) whose
# difference is R - M = L.  So the whole tree is one 3-term recursion.
class Batch:
    """Packs a set of slopes so Phi_i can be evaluated at z_i for all i at
    once.  Slopes are ordered by path length descending, so each depth level
    of the recursion acts on an array prefix."""
    def __init__(self, fracs):
        key = lambda f: -(len(path[f]) if path[f] is not None else -1)
        self.fracs = sorted(fracs, key=key)
        self.slopes = np.array([p / q for p, q in self.fracs])
        self.qs = np.array([q for p, q in self.fracs])
        maxd = max(len(path[f]) for f in self.fracs if path[f] is not None)
        self.P = np.full((len(self.fracs), maxd), -1, np.int8)
        for i, f in enumerate(self.fracs):
            if path[f] is not None:
                self.P[i, :len(path[f])] = path[f]
        self.nact = [int((self.P[:, k] >= 0).sum()) for k in range(maxd)]
        self.endpt = np.array([path[f] is None for f in self.fracs])
        self.sgn = np.where(self.slopes < 0.5, -1.0, 1.0)

    def __call__(self, z):
        """Phi and Phi' for slope i evaluated at z[i]."""
        one = np.ones_like(z)
        a, b, c = 2 - z, 2 + z, 2 * one
        da, db, dc = -one, one, 0 * one
        m, dm = 8 - a * b - c, -(da * b + a * db) - dc
        val, dval = m.copy(), dm.copy()
        for k, n in enumerate(self.nact):
            if n == 0:
                break
            s = slice(0, n)
            gl = self.P[s, k] == 0
            ak, bk, mk = a[s].copy(), b[s].copy(), m[s].copy()
            dak, dbk, dmk = da[s].copy(), db[s].copy(), dm[s].copy()
            a[s] = np.where(gl, ak, mk);  da[s] = np.where(gl, dak, dmk)
            b[s] = np.where(gl, mk, bk);  db[s] = np.where(gl, dmk, dbk)
            c[s] = np.where(gl, bk, ak);  dc[s] = np.where(gl, dbk, dak)
            m[s] = 8 - a[s] * b[s] - c[s]
            dm[s] = -(da[s] * b[s] + a[s] * db[s]) - dc[s]
            val[s], dval[s] = m[s], dm[s]
        val = np.where(self.endpt, 2 + self.sgn * z, val)   # 2-z and 2+z
        dval = np.where(self.endpt, self.sgn, dval)
        return val, dval

# ------------- principal pleating rays, traced in from infinity --------------
# The ray is picked up far out, where Phi ~ +-z^q and the q branches of
# Phi^{-1}((-inf,-2]) are cleanly separated by 2*pi/q in argument.  R0 must be
# large: at R0 = 7.2 the initial Newton settle drifts by more than half the
# branch spacing for a third of the slopes, i.e. it lands on the WRONG branch
# and those rays then cross their neighbours all the way in.
B = Batch(ray_fracs)
nray = len(B.fracs)

z = R0 * np.exp(1j * np.pi * B.slopes)
T = np.abs(B(z)[0])                      # FIXED target modulus: a moving
for _ in range(12):                      # target lets the iterate drift
    v, dv = B(z)                         # inward and hop branches
    z = z - (v + T) / dv
t = T - 2.0
scale = np.ones(nray)
alive = np.ones(nray, bool)
snaps = [z.copy()]
for _ in range(1600):
    if not alive.any():
        break
    cap = np.maximum(0.06, 0.05 * np.abs(z))     # arclength cap: loose far out,
    dp = B(z)[1]                                 # tight near the boundary
    dp = np.where(np.abs(dp) < 1e-300, 1e-300, dp)
    dt = np.minimum(scale * cap * np.abs(dp), 0.6 * t)
    tn = np.maximum(t - dt, 0.0)
    target = -2.0 - tn
    znew = z + (t - tn) / dp                     # predictor: dPhi = t - tn
    for _ in range(3):
        vn, dpn = B(znew)
        dpn = np.where(np.abs(dpn) < 1e-300, 1e-300, dpn)
        znew = znew - (vn - target) / dpn
    err = np.abs(B(znew)[0] - target)
    ok = alive & (err < 1e-7 * (1 + np.abs(target))) & (np.abs(znew - z) < cap * 1.001)
    z = np.where(ok, znew, z)
    t = np.where(ok, tn, t)
    scale = np.where(ok, np.minimum(scale * 1.4, 1.0), scale * 0.5)
    alive = alive & ~(alive & ~ok & (scale < 1e-9)) & (t > 1e-9)
    snaps.append(np.where(alive | ok, z, np.nan + 0j).copy())
paths_ray = np.array(snaps).T
landed = t <= 1e-6
print(f"{landed.sum()}/{nray} rays landed on their cusp")

ray_segments, ray_colors, cusp = [], [], np.full(nray, np.nan + 0j)
for i in range(nray):
    row = paths_ray[i][~np.isnan(paths_ray[i])]
    if len(row) < 2:
        continue
    cusp[i] = row[-1]
    hue = 0.83 * (1.0 - B.slopes[i]) ** 1.25
    col = hsv_to_rgb([hue, 0.9, 0.8])
    ray_segments.append(np.column_stack([row.real, row.imag]))
    ray_colors.append(col)
    if np.abs(row.imag).max() > 1e-9:             # conjugate mirror
        ray_segments.append(np.column_stack([row.real, -row.imag]))
        ray_colors.append(col)
print(f"{len(ray_segments)} principal pleating rays (QRAY={QRAY})")

# ------------- white region: the cusps in slope order -------------------------
# The p/q cusps sit on the boundary in slope order, from 4 (slope 0) round to
# -4 (slope 1), so the landing points ARE the boundary polygon.
o = np.argsort(B.slopes)
bnd = cusp[o]
poly = np.concatenate([np.column_stack([bnd.real, bnd.imag]),
                       np.column_stack([bnd.real[::-1], -bnd.imag[::-1]])])

# ------------- extensions past the cusp + Heckoid beads ----------------------
# Phi = -2 + s, s: 0 -> 4.  Beads at Phi = -2cos(pi/n)  <=>  s = 2 - 2cos(pi/n).
BEAD_S = np.array([2 - 2 * np.cos(np.pi / n)
                   for n in range(BEAD_NMAX, 0, -1)])       # ascending
BEAD_N = np.arange(BEAD_NMAX, 0, -1)

esel = [i for i in range(nray) if landed[i] and B.qs[i] <= QEXT]
E = Batch([B.fracs[i] for i in esel])
# Batch reorders; map each extension back to its cusp
start = {f: cusp[i] for i, f in enumerate(B.fracs)}
z = np.array([start[f] for f in E.fracs])
n = len(z)
s = np.zeros(n)
scale = np.ones(n)
bi = np.zeros(n, int)
alive = np.ones(n, bool)
beads, bead_n = [], []
snaps = [z.copy()]
for _ in range(900):
    if not alive.any():
        break
    dp = E(z)[1]
    dp = np.where(np.abs(dp) < 1e-300, 1e-300, dp)
    ds = np.minimum(0.035 * scale * np.abs(dp), 0.3 * (4 - s) + 0.005)
    sn = np.minimum(s + ds, 4.0)
    nxt = BEAD_S[np.minimum(bi, len(BEAD_S) - 1)]
    hit = alive & (bi < len(BEAD_S)) & (sn >= nxt - 1e-12)
    sn = np.where(hit, nxt, sn)
    target = -2.0 + sn
    znew = z + (sn - s) / dp
    for _ in range(4):
        vn, dpn = E(znew)
        dpn = np.where(np.abs(dpn) < 1e-300, 1e-300, dpn)
        znew = znew - (vn - target) / dpn
    err = np.abs(E(znew)[0] - target)
    ok = alive & (err < 1e-7 * (1 + np.abs(target))) & (np.abs(znew - z) < 0.08)
    z = np.where(ok, znew, z)
    s = np.where(ok, sn, s)
    scale = np.where(ok, np.minimum(scale * 1.4, 1.0), scale * 0.5)
    got = ok & hit
    if got.any():
        beads.append(z[got].copy())
        bead_n.append(BEAD_N[bi[got]].copy())
    bi = np.where(got, bi + 1, bi)
    out = np.abs(z.real) > 6.0
    alive = alive & ~(alive & ~ok & (scale < 1e-9)) & ~out & (s < 4.0 - 1e-9)
    snaps.append(np.where(alive | ok, z, np.nan + 0j).copy())
ext_paths = np.array(snaps).T
beads = np.concatenate(beads) if beads else np.zeros(0, complex)
bead_n = np.concatenate(bead_n) if len(bead_n) else np.zeros(0, int)

ext_segments = []
for i in range(n):
    row = ext_paths[i][~np.isnan(ext_paths[i])]
    if len(row) < 2:
        continue
    ext_segments.append(np.column_stack([row.real, row.imag]))
    if np.abs(row.imag).max() > 1e-9:
        ext_segments.append(np.column_stack([row.real, -row.imag]))
inb = (np.abs(beads.real) <= XLIM) & (np.abs(beads.imag) <= YLIM)
beads, bead_n = beads[inb], bead_n[inb]
mirror = np.abs(beads.imag) > 1e-9
beads = np.concatenate([beads, np.conj(beads[mirror])])
bead_n = np.concatenate([bead_n, bead_n[mirror]])
print(f"{len(ext_segments)} extensions (QEXT={QEXT}), {len(beads)} Heckoid beads")

# ------------- certify the cusps against exact roots --------------------------
worst = 0.0
for i, f in enumerate(B.fracs):
    if B.qs[i] > QVER or path[f] is None or not landed[i]:
        continue
    c = phi[f].copy(); c[0] += 2
    r = np.array([complex(x) for x in acb_poly([int(x) for x in c]).roots()])
    worst = max(worst, np.abs(r - cusp[i]).min())
print(f"cusps certified against exact roots for q <= {QVER}: "
      f"max deviation {worst:.1e}")

# ------------- render --------------------------------------------------------
fig, ax = plt.subplots(figsize=(11.06, 7.26), dpi=150)
fig.patch.set_facecolor("#e3e3e3")
ax.set_facecolor("#e3e3e3")
ax.add_collection(LineCollection(ray_segments, colors=ray_colors,
                                 linewidths=0.4, alpha=0.65))
ax.fill(poly[:, 0], poly[:, 1], color="white", zorder=2)
ax.add_collection(LineCollection(ext_segments, colors="#909090",
                                 linewidths=0.45, alpha=0.5, zorder=3))
sizes = np.minimum(2.4, 0.5 + 2.2 / bead_n) ** 2 * 1.8
ax.scatter(beads.real, beads.imag, s=sizes, c="black", zorder=4, linewidths=0)
ax.set_xlim(-XLIM, XLIM); ax.set_ylim(-YLIM, YLIM)
ax.set_aspect("equal"); ax.axis("off")
plt.subplots_adjust(0, 0, 1, 1)
out = __file__.replace("riley.py", "riley.png")
plt.savefig(out, facecolor=fig.get_facecolor())
print("saved", out)
