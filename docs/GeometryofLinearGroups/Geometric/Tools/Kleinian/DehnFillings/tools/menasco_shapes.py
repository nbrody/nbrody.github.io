#!/usr/bin/env python3
"""
menasco_shapes.py — check each diagram triangulation (tools/menasco_tris.json, written by
tools/fold_data.mjs from js/menasco.js) with SnapPy and solve for its complete hyperbolic shapes.

For every knot it requires: the triangulation is the census knot's complement, by an
orientation-preserving isometry (so the Fold view's halves are not mirror images); the volume
agrees; and the gluing equations hold at the shapes. Writes tools/menasco_shapes.json.

Usage:  python3 tools/menasco_shapes.py
"""
import cmath
import json
import os
import sys

import snappy

HERE = os.path.dirname(os.path.abspath(__file__))


def snappea_text(name, tets):
    lines = ['% Triangulation', name, 'not_attempted 0.0', 'oriented_manifold', 'CS_unknown', '',
             '1 0', '    torus   0.000000000000   0.000000000000', '', str(len(tets))]
    for t in tets:
        lines.append('   ' + ' '.join(f'{x:4d}' for x in t['nbr']))
        lines.append(' ' + ' '.join(''.join('%x' % g[i] for i in range(4)) for g in t['glu']))
        lines.append('   0    0    0    0 ')
        for _ in range(4):
            lines.append(' ' + ' '.join(['0'] * 16))
        lines.append('  0.0 0.0')
        lines.append('')
    return '\n'.join(lines)


def main():
    tris = json.load(open(os.path.join(HERE, 'menasco_tris.json')))
    out, ok = {}, True
    for name, tets in tris.items():
        T = snappy.Manifold(snappea_text('diagram_' + name, tets))
        C = snappy.Manifold(name)
        isos = T.is_isometric_to(C, return_isometries=True)
        preserving = [i for i in isos if i.cusp_maps()[0].det() > 0]
        vol, cvol = float(T.volume()), float(C.volume())
        shapes = [complex(z) for z in T.tetrahedra_shapes('rect')]
        # the gluing equations (log form) at the shapes
        logs = []
        for z in shapes:
            logs += [cmath.log(z), -cmath.log(1 - z), cmath.log(1 - 1 / z)]
        res = 0.0
        for row in T.gluing_equations()[:len(tets)]:
            v = sum(int(a) * l for a, l in zip(row, logs)) - 2j * cmath.pi
            res = max(res, abs(v - 2j * cmath.pi * round(v.imag / (2 * cmath.pi))))
        good = bool(preserving) and abs(vol - cvol) < 1e-8 and res < 1e-9
        ok = ok and good
        print(f'{name:6s} {len(tets):2d} tets  {T.solution_type():40s} volume {vol:.10f} (census {cvol:.10f})  '
              f'orientation-preserving isometry {bool(preserving)}  residual {res:.1e}  {"ok" if good else "FAILED"}',
              file=sys.stderr)
        if good:
            out[name] = {'gluing': tets, 'shapes': [[round(z.real, 13), round(z.imag, 13)] for z in shapes],
                         'volume': vol, 'type': T.solution_type()}
    with open(os.path.join(HERE, 'menasco_shapes.json'), 'w') as fh:
        json.dump(out, fh, separators=(',', ':'))
    print('wrote tools/menasco_shapes.json', file=sys.stderr)
    sys.exit(0 if ok else 1)


if __name__ == '__main__':
    main()
