#!/usr/bin/env python3
"""
make_census.py — export SnapPy triangulations for the Dehn filling calculator.

For every manifold in ENTRIES this writes, to tools/census.json:
  * the ideal triangulation (neighbors, gluing permutations, cusp of each
    vertex, SnapPy's maximal tree and face-pairing generator labels, and the
    meridian/longitude of each cusp as normal curves in the cusp triangles);
  * the complete structure's shapes, volume and cusp shapes;
  * SnapPy's gluing equations for the peripheral curves (the edge equations
    are rebuilt in JavaScript and checked against SnapPy in the tests);
  * the simplified presentation of pi_1, its peripheral words, and the
    simplified generators as words in the face-pairing generators;
  * a signed Gauss code of a diagram (knots), for the 3D picture;
  * exceptional slopes (where SnapPy finds no hyperbolic structure), the
    closed-census names of small fillings, and reference fillings for tests.

Then run `node tools/knot_curves.mjs` to relax the diagrams into smooth
3D curves and write js/census.js.

Usage:  python3 tools/make_census.py
"""
import cmath
import json
import math
import os
import re
import sys
from math import gcd

import snappy

HERE = os.path.dirname(os.path.abspath(__file__))

# id, SnapPy name, kind, title, note
ENTRIES = [
    ('4_1', '4_1', 'knot', 'Figure-eight knot',
     'Two regular ideal tetrahedra (Thurston). Amphichiral; exceptional slopes 0, ±1, ±2, ±3, ±4.'),
    ('m003', 'm003', 'census', 'Figure-eight sister m003',
     'The other manifold made of two regular ideal tetrahedra: a knot complement in the lens space L(5,1). Its fillings include the Weeks, Meyerhoff and FLMS manifolds.'),
    ('5_2', '5_2', 'knot', 'Three-twist knot 5_2',
     'Twist knot; a filling of the Whitehead link. Exceptional slopes 0, 1, 2, 3, 4.'),
    ('6_1', '6_1', 'knot', 'Stevedore knot 6_1', 'Twist knot (slice).'),
    ('6_2', '6_2', 'knot', 'Knot 6_2', 'Two-bridge knot.'),
    ('6_3', '6_3', 'knot', 'Knot 6_3', 'Amphichiral two-bridge knot.'),
    ('7_2', '7_2', 'knot', 'Knot 7_2', 'Twist knot.'),
    ('7_3', '7_3', 'knot', 'Knot 7_3', 'Two-bridge knot.'),
    ('7_4', '7_4', 'knot', 'Knot 7_4', 'Two-bridge knot.'),
    ('8_20', '8_20', 'knot', 'Knot 8_20', 'A non-alternating knot (a pretzel knot).'),
    ('12n242', '12n242', 'knot', '(−2, 3, 7) pretzel knot',
     'Fintushel–Stern: lens space surgeries 18 and 19; exceptional slopes 16, 17, 18, 37/2, 19, 20.'),
    ('L5a1', 'L5a1', 'link', 'Whitehead link',
     'One regular ideal octahedron. Filling one cusp gives the twist knots.'),
    ('L6a4', 'L6a4', 'link', 'Borromean rings', 'Two regular ideal octahedra.'),
]
# manifolds obtained by drilling a short geodesic: (id, parent id, dual curve index, title, note)
DRILLS = [
    ('4_1-drill', '4_1', 0, 'Figure-eight knot, shortest geodesic drilled',
     'Filling the new cusp along its meridian (1,0) gives back the figure-eight knot complement.'),
    ('5_2-drill', '5_2', 0, '5_2, shortest geodesic drilled',
     'Isometric to the Whitehead link complement: twist knots are fillings of the Whitehead link.'),
]

FAMOUS = {
    'm003(-3,1)': 'the Weeks manifold, the smallest closed hyperbolic 3-manifold',
    'm003(-2,3)': 'the Meyerhoff manifold, the second smallest closed hyperbolic 3-manifold',
    'm007(3,1)': 'the third smallest known closed hyperbolic 3-manifold',
    'm003(-4,1)': 'the FLMS manifold (no immersed totally geodesic surfaces)',
}
# closed manifolds with exact presets in Kleinian/poincare (library names)
POINCARE = {
    'm003(-3,1)': 'Weeks manifold (closed)',
    'm003(-2,3)': 'Meyerhoff manifold (closed)',
    'm003(-4,1)': 'FLMS',
}

GEOMETRIC = ('all tetrahedra positively oriented', 'contains negatively oriented tetrahedra')


def cx(z):
    z = complex(z)
    return [round(z.real, 14), round(z.imag, 14)]


def parse_tri_file(text):
    """The per-tetrahedron records of a SnapPea triangulation file."""
    lines = [ln for ln in text.splitlines() if ln.strip() and not ln.lstrip().startswith('%')]
    # header: name, solution type, orientability, CS line, cusp counts, cusp lines
    i = 0
    while not re.match(r'^\s*\d+\s+\d+\s*$', lines[i]):
        i += 1
    n_or, n_non = map(int, lines[i].split())
    i += 1 + n_or + n_non
    ntet = int(lines[i])
    i += 1
    toks = ' '.join(lines[i:]).split()
    tets, k = [], 0
    for _ in range(ntet):
        nbr = [int(t) for t in toks[k:k + 4]]; k += 4
        glu = [[int(ch, 16) for ch in t] for t in toks[k:k + 4]]; k += 4
        cusp = [int(t) for t in toks[k:k + 4]]; k += 4
        curves = [int(t) for t in toks[k:k + 64]]; k += 64
        shape = [float(toks[k]), float(toks[k + 1])]; k += 2
        tets.append(dict(nbr=nbr, glu=glu, cusp=cusp,
                         mR=curves[0:16], mL=curves[16:32], lR=curves[32:48], lL=curves[48:64], shape=shape))
    return tets


def gauss_code(link):
    """Signed Gauss code of a one-component diagram, as knots.js reads it."""
    comp = link.link_components[0]
    idx = {c: i + 1 for i, c in enumerate(link.crossings)}
    toks = []
    for cs in comp:
        kind = 'U' if cs.strand_index % 2 == 0 else 'O'
        toks.append(f"{kind}{idx[cs.crossing]}{'+' if cs.crossing.sign > 0 else '-'}")
    return ' '.join(toks)


def homology_str(H):
    return str(H).replace(' ', '')


def slope_list(pmax2=40):
    out = []
    for q in range(0, 5):
        pm = 22 if q <= 1 else (pmax2 if q == 2 else 24)
        for p in range(-pm, pm + 1):
            if q == 0 and p != 1:
                continue
            if gcd(abs(p), q) != 1:
                continue
            out.append((p, q))
    return out


def log_shapes(F):
    out = []
    for x in F.tetrahedra_shapes('rect'):
        x = complex(x)
        out += [cmath.log(x), -cmath.log(1 - x), cmath.log(1 - 1 / x)]
    return out


def cusp_rows_in_fill_order(M, rows, ncusp):
    """
    SnapPy's gluing_equations() does not always list the cusp rows in the order that
    dehn_fill, the peripheral words and the triangulation file use (it is reversed for
    the Whitehead link). Match each (meridian, longitude) row pair to its cusp by
    filling one cusp at a time and seeing which pair satisfies the filling equation.
    """
    assert len(rows) == 2 * ncusp
    if ncusp == 1:
        return rows
    order = []
    for k in range(ncusp):
        found = None
        for (p, q) in [(5, 1), (6, 1), (7, 2), (-5, 1), (8, 1), (11, 3)]:
            F = M.copy()
            F.dehn_fill([(p, q) if j == k else (0, 0) for j in range(ncusp)])
            if F.solution_type() not in GEOMETRIC:
                continue
            L = log_shapes(F)
            vals = [sum(a * l for a, l in zip(row, L)) for row in rows]
            hits = [j for j in range(ncusp)
                    if abs(p * vals[2 * j] + q * vals[2 * j + 1] - 2j * math.pi) < 1e-7 and abs(vals[2 * j]) > 1e-7]
            if len(hits) == 1:
                found = hits[0]
                break
        assert found is not None, ('could not match cusp rows', M.name(), k)
        order.append(found)
    assert sorted(order) == list(range(ncusp)), order
    out = []
    for j in order:
        out += [rows[2 * j], rows[2 * j + 1]]
    return out


def fill_one(M, slopes):
    """Fill every cusp of M (a list of slopes, None = complete)."""
    F = M.copy()
    F.dehn_fill([(0, 0) if s is None else s for s in slopes])
    return F


def export(mid, M, kind, title, note, parent=None):
    link = M.link() if kind == 'knot' else None     # copies forget the diagram
    M = M.copy()
    ntet, ncusp = M.num_tetrahedra(), M.num_cusps()
    M._choose_generators(True, False)       # compute_corners, centroid_at_origin
    info = M._choose_generators_info()
    filetets = parse_tri_file(M._to_string())
    assert len(filetets) == ntet
    shapes = M.tetrahedra_shapes('rect')
    tets = []
    for t, (d, f) in enumerate(zip(info, filetets)):
        glu = [list(g) for g in d['gluings']]
        assert glu == f['glu'], (mid, t, glu, f['glu'])
        assert list(d['neighbors']) == f['nbr']
        assert not any(f['mL']) and not any(f['lL']), 'expected an oriented manifold'
        corners = []
        for c in d['corners']:
            c = complex(c)
            corners.append(None if abs(c) > 1e30 else cx(c))
        tets.append(dict(nbr=f['nbr'], glu=glu, cusp=f['cusp'], gen=list(d['generators']),
                         m=f['mR'], l=f['lR'], corners=corners))
    root = [d['generator_path'] for d in info].index(-1)
    # gluing inverse consistency
    for t, T in enumerate(tets):
        for face in range(4):
            u, s = T['nbr'][face], T['glu'][face]
            back = tets[u]['glu'][s[face]]
            assert all(back[s[i]] == i for i in range(4)), (mid, t, face)

    eqs = [[int(x) for x in row] for row in M.gluing_equations()]
    nedge = ntet
    cusp_rows = cusp_rows_in_fill_order(M, eqs[nedge:], ncusp)

    G = M.fundamental_group()
    pres = dict(gens=list(G.generators()), rels=list(G.relators()),
                periph=[list(pc) for pc in G.peripheral_curves()],
                inOrig=list(G.generators_in_originals()))
    norig = max(abs(g) for T in tets for g in T['gen'])
    pres['nOrig'] = norig
    # reference traces for the tests (complete structure)
    words = list(pres['gens'])
    if len(words) >= 2:
        a, b = words[0], words[1]
        words += [a + b, a + b.upper(), a + a + b, a + b + b.upper() * 0 + b]
    words += [w for pc in pres['periph'] for w in pc]
    traces = {w: cx(G.SL2C(w).trace()) for w in words if w}

    cinfo = M.cusp_info()
    entry = dict(
        id=mid, kind=kind, title=title, note=note, name=str(M.name()),
        aliases=[str(x).split('(')[0] for x in M.identify()],
        nTet=ntet, nCusp=ncusp, root=root, tets=tets,
        shapes=[cx(z) for z in shapes],
        volume=float(M.volume()),
        cuspShapes=[cx(c['shape']) for c in cinfo],
        cuspRows=cusp_rows, pres=pres,
        homology=homology_str(M.homology()),
    )
    if parent:
        entry['parent'] = parent
    ref = dict(edgeRows=eqs[:nedge], traces=traces, fillings=[])

    if kind == 'knot':
        L = link
        entry['gauss'] = gauss_code(L)
        entry['crossings'] = len(L.crossings)
        entry['pd'] = [list(x) for x in L.PD_code()]

    # one-cusped: exceptional slopes, names of small fillings, reference fillings
    if ncusp == 1:
        exceptional, named = [], []
        for (p, q) in slope_list():
            F = fill_one(M, [(p, q)])
            st = F.solution_type()
            vol = float(F.volume())
            # SnapPy keeps the cusped structure for some trivial fillings (e.g. a
            # knot's meridian), so also call a slope exceptional when pi_1 of the
            # filling is cyclic (a lens space or S^3)
            cyclic = len(F.fundamental_group().generators()) <= 1
            if st not in GEOMETRIC or vol < 0.3 or cyclic:
                exceptional.append([p, q])
                continue
            if abs(p) <= 10 and q <= 3:
                try:
                    ids = [str(x) for x in F.identify()]
                except Exception:
                    ids = []
                rec = dict(slope=[p, q], volume=round(vol, 10), homology=homology_str(F.homology()))
                if ids:
                    rec['census'] = ids[0]
                    if ids[0] in FAMOUS:
                        rec['famous'] = FAMOUS[ids[0]]
                    if ids[0] in POINCARE:
                        rec['poincare'] = POINCARE[ids[0]]
                named.append(rec)
        entry['exceptional'] = exceptional
        entry['fillings'] = named
        for (p, q) in [(5, 1), (-5, 1), (6, 1), (7, 2), (-7, 3), (10, 1), (1, 2), (13, 4), (-6, 1), (8, 1)]:
            F = fill_one(M, [(p, q)])
            st = F.solution_type()
            if st not in GEOMETRIC or F.volume() < 0.3:
                continue
            core = complex(F.cusp_info('core_length')[0])
            ref['fillings'].append(dict(slopes=[[p, q]], volume=float(F.volume()), core=[cx(core)],
                                        type=st, homology=homology_str(F.homology())))
    else:
        # fill one cusp at a time (the others complete), and all cusps
        tests = [[(1, 0)] + [None] * (ncusp - 1), [(5, 1)] + [None] * (ncusp - 1),
                 [None] * (ncusp - 1) + [(3, 2)], [(6, 1)] * ncusp]
        for sl in tests:
            F = fill_one(M, sl)
            st = F.solution_type()
            if st not in GEOMETRIC or F.volume() < 0.3:
                continue
            cores = []
            for i, s in enumerate(sl):
                cores.append(None if s is None else cx(complex(F.cusp_info(i)['core_length'])))
            ref['fillings'].append(dict(slopes=[None if s is None else list(s) for s in sl],
                                        volume=float(F.volume()), core=cores, type=st,
                                        homology=homology_str(F.homology())))
        if parent:
            # the new cusp filled along (1,0) recovers the parent
            sl = [None] * (ncusp - 1) + [(1, 0)]
            F = fill_one(M, sl)
            core = complex(F.cusp_info(ncusp - 1)['core_length'])
            ref['fillings'].append(dict(slopes=[None] * (ncusp - 1) + [[1, 0]], volume=float(F.volume()),
                                        core=[None] * (ncusp - 1) + [cx(core)], type=F.solution_type(),
                                        homology=homology_str(F.homology())))
            entry['drilledLength'] = cx(core)
    return entry, ref


def main():
    census, refs = [], {}
    for (mid, name, kind, title, note) in ENTRIES:
        M = snappy.Manifold(name)
        e, r = export(mid, M, kind, title, note)
        census.append(e)
        refs[mid] = r
        print(f'{mid:10s} {e["nTet"]:2d} tets  {e["nCusp"]} cusp(s)  vol {e["volume"]:.10f}  '
              f'{len(e.get("exceptional", []))} exceptional', file=sys.stderr)
    for (mid, pid, k, title, note) in DRILLS:
        P = snappy.Manifold(dict((x[0], x[1]) for x in ENTRIES)[pid])
        D = P.drill(k)
        length = complex(P.dual_curves()[k]['complete_length'])
        e, r = export(mid, D, 'drilled', title, note, parent=pid)
        e['drilledCurveLength'] = cx(length)
        census.append(e)
        refs[mid] = r
        print(f'{mid:10s} {e["nTet"]:2d} tets  {e["nCusp"]} cusps  vol {e["volume"]:.10f}  '
              f'drilled curve {length:.6f}', file=sys.stderr)
    with open(os.path.join(HERE, 'census.json'), 'w') as fh:
        json.dump(census, fh, separators=(',', ':'))
    with open(os.path.join(HERE, '..', 'tests', 'reference.json'), 'w') as fh:
        json.dump(refs, fh, indent=1)
    print('wrote tools/census.json and tests/reference.json', file=sys.stderr)


if __name__ == '__main__':
    main()
