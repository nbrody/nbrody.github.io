"""Combinatorial types of Ford domains on the exterior of the Riley slice.

Coordinates.  G_mu = < X, Y > with
    X = [[1, 2], [0, 1]]    z -> z + 2       (parabolic, fixes infinity)
    Y = [[1, 0], [mu, 1]]   z -> z/(mu z + 1) (parabolic, fixes 0)
so mu = z/2 for the z of riley.py (tr X Y^-1 = 2 - 2 mu = Phi_{0/1}(z)).  The
Riley slice boundary meets the real axis at +-2 (slopes 0/1, 1/1) and the
imaginary axis at +-i (slope 1/2).

Ford domain.  Infinity is the fixed point of X, so the Ford domain of G_mu in
H^3 is the slab  |Re z| <= 1  above every isometric hemisphere: the
hemisphere over the circle |c z + d| = 1 (centre -d/c, radius 1/|c|) for each
g = [[a, b], [c, d]].  Left-multiplying g by X^k leaves (c, d) unchanged, and
right-multiplying translates the hemisphere by 2k, so it suffices to take
reduced words that begin and end in Y^{+-1}, centres mod 2.  A hemisphere is a
FACE of the Ford domain when, somewhere over the strip, it is the highest one
(and above the plane).  Seen from infinity the faces tile the strip like a
power diagram: hemisphere i is highest at p iff it maximises
r_i^2 - |p - c_i|^2.

Regions.  The set of words giving faces is locally constant on the exterior
of the Riley slice.  The coloured regions are its level sets, coloured by
DEPTH: the least number of region walls crossed coming in from the outermost
region (faces Y and Y^-1 only).  Depth accumulates at every cusp of the
boundary, which gives the nested scallops.

Candidate words.  The face words are suffix-closed in practice (each is
Y^{+-1} X^{+-1} times a shorter face word), so candidates are grown one
Y-syllable at a time, keeping the extensions that become faces somewhere on a
sample of parameters.

The white region is the complement of the Riley slice: the polygon through
the rational cusps, found by tracing the principal pleating rays exactly as in
riley.py.  The rays themselves are not drawn.

Run time: a few minutes on 4 cores (labels are computed in parallel).
"""
import os
import time
import numpy as np
from multiprocessing import Pool

XLIM, YLIM = 2.1, 1.5     # window [-XLIM, XLIM] x [-YLIM, YLIM]
NX = 1680                 # raster width over [-XLIM, XLIM] (quadrant: NX/2)
STRIDE0 = 8               # first labelling stride; refined 8 -> 4 -> 2 -> 1
NP = 56                   # sample grid (NP x NP) over the strip per parameter
MAXLEVEL = 8              # candidate words have <= MAXLEVEL Y-syllables
RMIN = 1.5e-3             # ignore hemispheres smaller than this
QRAY = 64                 # pleating-ray slopes for the boundary polygon

# Palette indexed by depth (cycled past the end): ink -> teal -> sage ->
# straw -> apricot -> rose -> plum, a calmer take on the original's rainbow.
PALETTE = ["#1f2a44", "#2e5e7e", "#3f8f8a", "#7dbb8a", "#cfdc8f",
           "#f4cf7a", "#f2a167", "#e0706a", "#b8557f", "#7c4d8f"]
OUTFILE = "fordDomains.png"


# =============================================================================
# 1. Riley slice boundary (cusp polygon) via principal pleating rays.
#    Condensed from riley.py: Stern-Brocot paths, cancellation-free Farey
#    recursion, rays traced in from |z| = 30 to their cusps.
# =============================================================================
def riley_boundary():
    path = {(0, 1): None, (1, 1): None}
    stack = [((0, 1), (1, 1), ())]
    while stack:
        L, R, pth = stack.pop()
        m = (L[0] + R[0], L[1] + R[1])
        if m[1] > QRAY:
            continue
        path[m] = pth
        stack.append((L, m, pth + (0,)))
        stack.append((m, R, pth + (1,)))
    fracs = sorted(path, key=lambda f: -(len(path[f]) if path[f] else -1))
    slopes = np.array([p / q for p, q in fracs])
    maxd = max(len(path[f]) for f in fracs if path[f])
    P = np.full((len(fracs), maxd), -1, np.int8)
    for i, f in enumerate(fracs):
        if path[f]:
            P[i, :len(path[f])] = path[f]
    nact = [int((P[:, k] >= 0).sum()) for k in range(maxd)]
    endpt = np.array([path[f] is None for f in fracs])
    sgn = np.where(slopes < 0.5, -1.0, 1.0)

    def phi(z):
        one = np.ones_like(z)
        a, b, c = 2 - z, 2 + z, 2 * one
        da, db, dc = -one, one, 0 * one
        m, dm = 8 - a * b - c, -(da * b + a * db) - dc
        val, dval = m.copy(), dm.copy()
        for k, n in enumerate(nact):
            s = slice(0, n)
            gl = P[s, k] == 0
            ak, bk, mk = a[s].copy(), b[s].copy(), m[s].copy()
            dak, dbk, dmk = da[s].copy(), db[s].copy(), dm[s].copy()
            a[s] = np.where(gl, ak, mk); da[s] = np.where(gl, dak, dmk)
            b[s] = np.where(gl, mk, bk); db[s] = np.where(gl, dmk, dbk)
            c[s] = np.where(gl, bk, ak); dc[s] = np.where(gl, dbk, dak)
            m[s] = 8 - a[s] * b[s] - c[s]
            dm[s] = -(da[s] * b[s] + a[s] * db[s]) - dc[s]
            val[s], dval[s] = m[s], dm[s]
        return np.where(endpt, 2 + sgn * z, val), np.where(endpt, sgn, dval)

    z = 30.0 * np.exp(1j * np.pi * slopes)
    T = np.abs(phi(z)[0])
    for _ in range(12):
        v, dv = phi(z)
        z = z - (v + T) / dv
    t, scale = T - 2.0, np.ones(len(z))
    alive = np.ones(len(z), bool)
    for _ in range(1600):
        if not alive.any():
            break
        cap = np.maximum(0.06, 0.05 * np.abs(z))
        dp = phi(z)[1]
        dp = np.where(np.abs(dp) < 1e-300, 1e-300, dp)
        dt = np.minimum(scale * cap * np.abs(dp), 0.6 * t)
        tn = np.maximum(t - dt, 0.0)
        target = -2.0 - tn
        zn = z + (t - tn) / dp
        for _ in range(3):
            vn, dpn = phi(zn)
            dpn = np.where(np.abs(dpn) < 1e-300, 1e-300, dpn)
            zn = zn - (vn - target) / dpn
        err = np.abs(phi(zn)[0] - target)
        ok = (alive & (err < 1e-7 * (1 + np.abs(target)))
              & (np.abs(zn - z) < cap * 1.001))
        z = np.where(ok, zn, z)
        t = np.where(ok, tn, t)
        scale = np.where(ok, np.minimum(scale * 1.4, 1.0), scale * 0.5)
        alive = alive & ~(alive & ~ok & (scale < 1e-9)) & (t > 1e-9)
    cusp = z[np.argsort(slopes)] / 2                     # z -> mu
    return np.concatenate([np.column_stack([cusp.real, cusp.imag]),
                           np.column_stack([cusp.real[::-1], -cusp.imag[::-1]])])


# =============================================================================
# 2. Isometric hemispheres and Ford faces (vectorised over parameters).
# =============================================================================
def bottom_rows(words, mu):
    """(c, d) of every word at every parameter; shared prefixes once.
    Words are strings in X, x = X^-1, Y, y = Y^-1."""
    one, zero = np.ones_like(mu), np.zeros_like(mu)
    gen = {"X": (one, 2 * one, zero, one), "x": (one, -2 * one, zero, one),
           "Y": (one, zero, mu, one), "y": (one, zero, -mu, one)}
    memo = {"": (one, zero, zero, one)}

    def mat(w):
        if w not in memo:
            a, b, c, d = mat(w[:-1])
            e, f, g, h = gen[w[-1]]
            memo[w] = (a * e + b * g, a * f + b * h, c * e + d * g, c * f + d * h)
        return memo[w]
    return (np.array([mat(w)[2] for w in words]),
            np.array([mat(w)[3] for w in words]))


_PX = np.linspace(-1, 1, NP, endpoint=False) + 1 / NP
_TQ = np.linspace(0, 1, NP)


def faces(words, mu, chunk=24):
    """Boolean (len(mu), len(words)): which hemispheres are Ford faces.
    Over each sample point p of the strip the face is the hemisphere
    maximising r^2 - |p - c|^2; only the nearest translate (mod 2) of a
    hemisphere can win, so no copies are needed."""
    vis = np.zeros((len(mu), len(words)), bool)
    for s in range(0, len(mu), chunk):
        m = mu[s:s + chunk]
        C, D = bottom_rows(words, m)                       # (W, n)
        r = 1 / np.abs(C)
        ctr = -D / C
        big = r > RMIN
        r2 = np.where(big, r * r, -np.inf)
        ylo = np.where(big, ctr.imag - r, np.inf).min(0)
        yhi = np.where(big, ctr.imag + r, -np.inf).max(0)
        py = ylo[:, None] + (yhi - ylo)[:, None] * _TQ      # (n, NP)
        dx = (_PX[None, None, :] - ctr.real[:, :, None] + 1) % 2 - 1
        dy = py[None, :, :] - ctr.imag[:, :, None]
        f = r2[:, :, None, None] - dy[:, :, :, None] ** 2 - dx[:, :, None, :] ** 2
        a = f.argmax(0)
        ok = np.take_along_axis(f, a[None], 0)[0] > 0
        rows = np.broadcast_to(np.arange(len(m))[:, None, None], a.shape)
        vis[s + rows[ok], a[ok]] = True
    return vis


def faces_parallel(pool, words, mu, nproc):
    if pool is None or len(mu) < 400:
        return faces(words, mu)
    parts = np.array_split(mu, 8 * nproc)
    return np.concatenate(pool.starmap(faces, [(words, p) for p in parts]))


# =============================================================================
# 3. Main: candidates, labels on the first quadrant, depth, render.
# =============================================================================
def main():
    t0 = time.time()
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from matplotlib.path import Path
    from matplotlib.colors import ListedColormap

    poly = riley_boundary()
    slice_path = Path(poly)

    def outside(mu):
        return ~slice_path.contains_points(np.column_stack([mu.real, mu.imag]))
    print(f"boundary through {len(poly) // 2} cusps  [{time.time() - t0:.0f}s]")

    nproc = os.cpu_count() or 1
    pool = Pool(nproc) if nproc > 1 else None

    # ---- grow candidate words on a sample: grid + points near the boundary
    gx, gy = np.meshgrid(np.linspace(0, XLIM, 60), np.linspace(0, YLIM, 44))
    bq = poly[: len(poly) // 2]
    bz = bq[:, 0] + 1j * bq[:, 1]
    bz = bz[(bz.real >= -1e-9) & (bz.imag >= -1e-9)][::2]
    nrm = bz / np.abs(bz)
    sample = np.concatenate([(gx + 1j * gy).ravel()] +
                            [bz + d * nrm for d in (0.008, 0.02, 0.04, 0.08, 0.15)])
    sample = sample[outside(sample)]
    words, frontier = ["Y", "y"], ["Y", "y"]
    for level in range(2, MAXLEVEL + 1):
        ext = sorted({a + b + w for w in frontier for a in "Yy" for b in "Xx"})
        vis = faces_parallel(pool, words + ext, sample, nproc).any(0)
        frontier = [w for w, v in zip(ext, vis[len(words):]) if v]
        words += frontier
        print(f"  level {level}: kept {len(frontier):3d} of {len(ext):3d} "
              f"extensions -> {len(words)} words  [{time.time() - t0:.0f}s]")
        if not frontier:
            break
    words = [w for w, v in zip(words, faces_parallel(pool, words, sample, nproc).any(0)) if v]

    # ---- label the first quadrant, refining 8 -> 4 -> 2 -> 1 near walls
    dx = 2 * XLIM / NX
    nx, ny = int(round(XLIM / dx)), int(round(YLIM / dx))
    MU = ((np.arange(nx) + 0.5) * dx)[None, :] + 1j * ((np.arange(ny) + 0.5) * dx)[:, None]
    OUT = outside(MU.ravel()).reshape(MU.shape)
    ids = {}

    def label(mu):
        keys = np.packbits(faces_parallel(pool, words, mu, nproc), axis=1)
        return np.array([ids.setdefault(bytes(k), len(ids)) for k in keys], int)

    s = STRIDE0
    sub = (slice(0, None, s), slice(0, None, s))
    lab = np.full(MU[sub].shape, -1)
    lab[OUT[sub]] = label(MU[sub][OUT[sub]])
    ncomp = OUT[sub].sum()
    while s > 1:
        s //= 2
        sub = (slice(0, None, s), slice(0, None, s))
        shp = MU[sub].shape
        prev = lab
        up = np.repeat(np.repeat(prev, 2, 0), 2, 1)[:shp[0], :shp[1]]
        pad = np.pad(prev, 1, mode="edge")
        uni = prev >= 0
        for oy in (-1, 0, 1):
            for ox in (-1, 0, 1):
                uni &= pad[1 + oy:1 + oy + prev.shape[0], 1 + ox:1 + ox + prev.shape[1]] == prev
        uni = np.repeat(np.repeat(uni, 2, 0), 2, 1)[:shp[0], :shp[1]]
        known = np.zeros(shp, bool)
        known[::2, ::2] = True
        out = OUT[sub]
        lab = np.where(out & (uni | known), up, -1)
        todo = out & ~uni & ~known
        lab[todo] = label(MU[sub][todo])
        ncomp += todo.sum()
        print(f"  stride {s}: computed {todo.sum()} new pixels  "
              f"[{time.time() - t0:.0f}s]")
    if pool is not None:
        pool.close()
    print(f"{ncomp} of {OUT.sum()} pixels computed directly; "
          f"{len(words)} candidate words, {len(ids)} Ford-domain types")

    # ---- depth: least walls crossed from the outermost region (top corner)
    BIG = 1 << 30
    depth = np.where(lab == lab[-1, -1], 0, BIG)
    valid = lab >= 0
    for sweep in range(100000):
        new = depth.copy()
        np.minimum(new[1:], depth[:-1] + (lab[1:] != lab[:-1]), out=new[1:])
        np.minimum(new[:-1], depth[1:] + (lab[:-1] != lab[1:]), out=new[:-1])
        np.minimum(new[:, 1:], depth[:, :-1] + (lab[:, 1:] != lab[:, :-1]), out=new[:, 1:])
        np.minimum(new[:, :-1], depth[:, 1:] + (lab[:, :-1] != lab[:, 1:]), out=new[:, :-1])
        new[~valid] = BIG
        if np.array_equal(new, depth):
            break
        depth = new
    print(f"depth: {sweep} sweeps, max {depth[valid].max()}  [{time.time() - t0:.0f}s]")

    # ---- render; mu -> -mu and mu -> conj(mu) are symmetries of the picture
    q = np.where(valid, depth % len(PALETTE), -1).astype(float)
    top = np.hstack([q[:, ::-1], q])
    img = np.vstack([top[::-1], top])
    img[img < 0] = np.nan
    cmap = ListedColormap(PALETTE)
    cmap.set_bad("white")

    fig, ax = plt.subplots(figsize=(10.5, 7.9), dpi=200)
    ax.imshow(img, cmap=cmap, vmin=-0.5, vmax=len(PALETTE) - 0.5,
              origin="lower", extent=(-XLIM, XLIM, -YLIM, YLIM),
              interpolation="nearest")
    ax.fill(poly[:, 0], poly[:, 1], color="white", lw=0, zorder=2)
    ax.plot(np.append(poly[:, 0], poly[0, 0]), np.append(poly[:, 1], poly[0, 1]),
            color="#1f2a44", lw=0.5, zorder=3)
    ax.axhline(0, color="#555555", lw=0.6, zorder=4)
    ax.axvline(0, color="#555555", lw=0.6, zorder=4)
    ax.set_xlim(-XLIM, XLIM)
    ax.set_ylim(-YLIM, YLIM)
    ax.set_aspect("equal")
    ax.set_xticks(np.arange(-2, 2.01, 0.5))
    ax.set_yticks(np.arange(-1.5, 1.51, 0.5))
    ax.set_xlabel(r"Re $\mu$")
    ax.set_ylabel(r"Im $\mu$")
    ax.set_title(r"Ford domain types of $\langle\, z\mapsto z+2,\ "
                 r"z\mapsto z/(\mu z+1)\,\rangle$ outside the Riley slice",
                 fontsize=11)
    fig.tight_layout()
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), OUTFILE)
    fig.savefig(out)
    print(f"saved {out}  [{time.time() - t0:.0f}s]")


if __name__ == "__main__":
    main()
