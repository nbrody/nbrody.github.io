"""Beam search over the orbit of o for rho_{s,r} : <a,b|[a,b]^2> -> SL3(Z[1/p]).

State = vertex x_w = rho(w).o of the Bruhat-Tits building, words built by
PREPENDING letters (x_{gw} = rho(g) x_w), stored exactly as the normalised
Hermite basis of the lattice (v0, v1, v2, h10, h20, h21).
Score = (D, -d_H): D = d(o, x_w) (0 <=> rho(w) in SL3(Z)), d_H = hyperbolic
displacement of w in a Fuchsian model (prefer distorted elements).

Words are Dehn-reduced (Newman), so never trivial and never secretly short.
A child landing on an already-seen vertex is a loop: if u = alpha_u tau and
w = alpha_w tau share the beam-tree suffix tau, then alpha_u^-1 alpha_w fixes
the orbit vertex rho(tau).o.  Infinite order in G (Dehn: g^2 != 1) => the
action is NOT proper (witness).  Revisits are tested and then dropped, so the
beam always moves to new vertices.
"""
import argparse, json, math, os, sys, time
from array import array
from multiprocessing import Pool
from fractions import Fraction as F

from sl3core import to_int, INV, _PIECES, word_matrix, tr, sigma2, mmul, minv
from family import family_gens
from displacement import fuchsian

LET = 'ABab'
FORB5 = {u for u, _ in _PIECES if len(u) == 5}

# ------------------------------------------------------------------ fast Dehn
_PIECE_MAP = {u: repl for u, repl in _PIECES}
_PLENS = sorted({len(u) for u in _PIECE_MAP}, reverse=True)   # 8..5

def dehn_fast(w):
    st = []
    todo = list(reversed(w))
    while todo:
        c = todo.pop()
        if st and st[-1] == INV[c]:
            st.pop()
            continue
        st.append(c)
        for k in _PLENS:
            if len(st) >= k:
                u = ''.join(st[-k:])
                repl = _PIECE_MAP.get(u)
                if repl is not None:
                    del st[-k:]
                    todo.extend(reversed(repl))
                    break
    return ''.join(st)

def is_torsion_fast(g):
    return dehn_fast(g + g) == ''

def inverse(w):
    return ''.join(INV[c] for c in reversed(w))

# ------------------------------------------------------------------ vertex arithmetic
P = None; GENS_INT = None; FU = None

def init(p, gens_int, fu):
    global P, GENS_INT, FU
    P, GENS_INT, FU = p, gens_int, fu

def val(x, p):
    if x == 0:
        return 1 << 30
    v = 0
    while x % p == 0:
        x //= p; v += 1
    return v

def apply_gen(Nc, ec, key, p):
    v0, v1, v2, h10, h20, h21 = key
    p0, p1, p2 = p**v0, p**v1, p**v2
    # columns of H: (p0,h10,h20), (0,p1,h21), (0,0,p2)
    n = Nc
    c0 = (n[0]*p0 + n[1]*h10 + n[2]*h20, n[3]*p0 + n[4]*h10 + n[5]*h20, n[6]*p0 + n[7]*h10 + n[8]*h20)
    c1 = (n[1]*p1 + n[2]*h21, n[4]*p1 + n[5]*h21, n[7]*p1 + n[8]*h21)
    c2 = (n[2]*p2, n[5]*p2, n[8]*p2)
    K = 3 * ec + v0 + v1 + v2 + 2
    M = p**K
    cols = [[x % M for x in c0], [x % M for x in c1], [x % M for x in c2]]
    vs = []
    for i in range(3):
        best, bv = i, 1 << 30
        for j in range(i, 3):
            vv = val(cols[j][i], p)
            if vv < bv:
                best, bv = j, vv
        cols[i], cols[best] = cols[best], cols[i]
        pv = p**bv
        ui = pow(cols[i][i] // pv, -1, M)
        cols[i] = [(x * ui) % M for x in cols[i]]
        for j in range(i + 1, 3):
            m = cols[j][i] // pv
            if m:
                cols[j] = [(a - m * b) % M for a, b in zip(cols[j], cols[i])]
        vs.append(bv)
    for i in range(3):
        for k in range(i + 1, 3):
            m = cols[i][k] // p**vs[k]
            if m:
                cols[i] = [(a - m * b) % M for a, b in zip(cols[i], cols[k])]
    h10, h20, h21 = cols[0][1], cols[0][2], cols[1][2]
    mn = min(vs[0], vs[1], vs[2], val(h10, p), val(h20, p), val(h21, p))
    if mn:
        pm = p**mn
        vs = [v - mn for v in vs]; h10 //= pm; h20 //= pm; h21 //= pm
    v0, v1, v2 = vs
    # 2x2 minors of lower-triangular basis -> a1+a2 (a1 = 0 after normalisation)
    a12 = min(v0 + v1, v0 + val(h21, p), v0 + v2, val(h10 * h21 - p**v1 * h20, p),
              val(h10, p) + v2, v1 + v2)
    D = v0 + v1 + v2 - a12
    return (v0, v1, v2, h10, h20, h21), D

def fu_mul(G, S):
    a, b, c, d, ls = S
    g0, g1, g2, g3 = G
    x0, x1, x2, x3 = g0*a + g1*c, g0*b + g1*d, g2*a + g3*c, g2*b + g3*d
    m = max(abs(x0), abs(x1), abs(x2), abs(x3))
    return (x0/m, x1/m, x2/m, x3/m, ls + math.log(m))

def dH_of(S):
    a, b, c, d, ls = S
    ss = a*a + b*b + c*c + d*d
    lx = math.log(ss) + 2*ls - math.log(2)       # log(||M||^2/2)
    if lx > 20:
        return lx + math.log(2)                  # acosh(x) ~ log 2x
    return math.acosh(max(1.0, math.exp(lx)))

def expand(chunk):
    """chunk: (offset, [(key, pre4, fu)]) -> children list"""
    off, states = chunk
    out = []
    for i, (key, pre4, fu) in enumerate(states):
        for c in LET:
            if pre4 and c == INV[pre4[0]]:
                continue
            p5 = c + pre4
            if len(p5) == 5 and p5 in FORB5:
                continue
            Nc, ec = GENS_INT[c]
            k2, D = apply_gen(Nc, ec, key, P)
            f2 = fu_mul(FU[c], fu)
            out.append((off + i, c, k2, D, dH_of(f2), p5[:4], f2))
    return out

# ------------------------------------------------------------------ driver
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--s', default='1/3'); ap.add_argument('--r', default='1'); ap.add_argument('-p', type=int, default=3)
    ap.add_argument('-w', '--width', type=int, default=100000)
    ap.add_argument('-d', '--depth', type=int, default=500)
    ap.add_argument('--window', type=int, default=8, help='depths of vertex memory for loop detection')
    ap.add_argument('--keepD', type=int, default=6, help='remember vertices with D <= keepD forever')
    ap.add_argument('--procs', type=int, default=os.cpu_count())
    ap.add_argument('--out', default=None)
    a = ap.parse_args()
    p = a.p
    gens = family_gens(F(a.s), F(a.r))
    gens_int = {c: to_int(X, p) for c, X in gens.items()}
    fu = fuchsian()
    out_path = a.out or f'../data/beam_s{a.s.replace("/", "_")}_r{a.r.replace("/", "_")}_p{p}_w{a.width}_d{a.depth}.json'
    log = lambda *x: print(*x, flush=True)
    log(f'beam: rho_(s={a.s}, r={a.r}) p={p} width={a.width} depth={a.depth} window={a.window} procs={a.procs}')

    root_key = (0, 0, 0, 0, 0, 0)
    parents = [array('i', [-1])]
    letters = [bytearray(b'.')]
    beam = [(root_key, '', (1.0, 0.0, 0.0, 1.0, 0.0))]
    permanent = {root_key: (0, 0)}
    window = [{root_key: 0}]
    stats, witnesses, tors_events, tors_short, best_words = [], [], 0, {}, []
    t0 = time.time()

    def word_of(dep, idx):
        out = []
        while dep > 0:
            out.append(chr(letters[dep][idx]))
            idx = parents[dep][idx]
            dep -= 1
        return ''.join(out)

    def loop_element(du, iu, pre_u, dw, iw, pre_w):
        """u = pre_u + word(du,iu), w = pre_w + word(dw,iw).  Strip the common
        beam-tree suffix tau; return (alpha_u^-1 alpha_w, |tau|)."""
        au, aw = [pre_u], [pre_w]
        while dw > du:
            aw.append(chr(letters[dw][iw])); iw = parents[dw][iw]; dw -= 1
        while du > dw:
            au.append(chr(letters[du][iu])); iu = parents[du][iu]; du -= 1
        while iu != iw:
            au.append(chr(letters[du][iu])); iu = parents[du][iu]; du -= 1
            aw.append(chr(letters[dw][iw])); iw = parents[dw][iw]; dw -= 1
        return free_reduce_s(inverse(''.join(au)) + ''.join(aw)), du

    with Pool(a.procs, initializer=init, initargs=(p, gens_int, fu)) as pool:
        for dep in range(1, a.depth + 1):
            nchunk = max(1, min(a.procs * 4, len(beam) // 500 + 1))
            size = (len(beam) + nchunk - 1) // nchunk
            chunks = [(k * size, [(key, pre4, f) for key, pre4, f in beam[k*size:(k+1)*size]]) for k in range(nchunk)]
            children = [ch for part in pool.map(expand, chunks) for ch in part]
            # dedupe + loop detection
            fresh = {}
            n_loop = 0
            for ch in children:
                pidx, c, key, D, dh, pre4, f = ch
                prev = permanent.get(key)
                if prev is None:
                    for k, wd in enumerate(window):
                        j = wd.get(key)
                        if j is not None:
                            prev = (dep - len(window) + k, j)
                            break
                if prev is None and key in fresh:
                    prev = ('fresh', fresh[key])
                if prev is None:
                    fresh[key] = ch
                    continue
                # a loop: build the stabiliser element
                n_loop += 1
                if prev[0] == 'fresh':
                    other = prev[1]
                    g, anc = loop_element(dep - 1, other[0], other[1], dep - 1, pidx, c)
                    if dh > other[4]:
                        fresh[key] = ch
                else:
                    du, iu = prev
                    g, anc = loop_element(du, iu, '', dep - 1, pidx, c)
                if not g:
                    continue
                if is_torsion_fast(g):
                    tors_events += 1
                    tors_short[len(g)] = tors_short.get(len(g), 0) + 1
                    continue
                gd = dehn_fast(g)
                rec = dict(depth=dep, element=gd, length=len(gd), anchor_depth=anc)
                try:
                    X = word_matrix(gd, gens)
                    rec['tr'], rec['tr_inv'] = str(tr(X)), str(sigma2(X))
                    rec['charpoly_integral'] = tr(X).denominator == 1 and sigma2(X).denominator == 1
                except Exception as e:
                    rec['err'] = str(e)
                witnesses.append(rec)
                if len(witnesses) <= 20: log(f'  *** WITNESS at depth {dep}: element of length {len(gd)} fixing an orbit vertex '
                    f'(charpoly integral: {rec.get("charpoly_integral")}): {gd[:120]}')
            # select
            cand = sorted(fresh.values(), key=lambda ch: (ch[3], -ch[4]))[:a.width]
            par = array('i', (ch[0] for ch in cand))
            let = bytearray(ord(ch[1]) for ch in cand)
            parents.append(par); letters.append(let)
            beam = [(ch[2], ch[5], ch[6]) for ch in cand]
            wd = {}
            for i, ch in enumerate(cand):
                wd[ch[2]] = i
                if ch[3] <= a.keepD:
                    permanent.setdefault(ch[2], (dep, i))
            window.append(wd)
            if len(window) > a.window:
                window.pop(0)
            Ds = [ch[3] for ch in cand]
            st = dict(depth=dep, beam=len(cand), children=len(children), fresh=len(fresh), loops=n_loop,
                      minD=Ds[0] if Ds else None, medD=Ds[len(Ds)//2] if Ds else None, maxD=Ds[-1] if Ds else None,
                      maxdH=round(max(ch[4] for ch in cand), 2) if cand else None,
                      dH_at_minD=round(cand[0][4], 2) if cand else None, permanent=len(permanent),
                      secs=round(time.time() - t0, 1))
            stats.append(st)
            if dep <= 20 or dep % 10 == 0 or witnesses and witnesses[-1]['depth'] == dep:
                log(f'  d={dep:3d} beam={st["beam"]:6d} fresh={st["fresh"]:6d} loops={n_loop:6d} '
                    f'D[min/med/max]={st["minD"]}/{st["medD"]}/{st["maxD"]} dH@minD={st["dH_at_minD"]} '
                    f'maxdH={st["maxdH"]} perm={len(permanent)} tors={tors_events} wit={len(witnesses)} [{st["secs"]}s]')
            if dep % 25 == 0 or dep == a.depth or not cand:
                best = word_of(dep, 0) if cand else ''
                best_words.append(dict(depth=dep, D=cand[0][3] if cand else None, dH=round(cand[0][4], 2) if cand else None, word=best))
                log(f'  best@{dep}: D={best_words[-1]["D"]} dH={best_words[-1]["dH"]} {best[:100]}{"..." if len(best) > 100 else ""}')
                json.dump(dict(params=vars(a), stats=stats, witnesses=witnesses, torsion_loop_lengths=tors_short,
                               best_words=best_words), open(out_path, 'w'), indent=1)
            if not cand:
                log('  beam exhausted'); break
    log(f'done: {len(witnesses)} witnesses, {tors_events} torsion loops, {time.time()-t0:.0f}s -> {out_path}')

def free_reduce_s(w):
    out = []
    for c in w:
        if out and out[-1] == INV[c]:
            out.pop()
        else:
            out.append(c)
    return ''.join(out)

if __name__ == '__main__':
    main()
