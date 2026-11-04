"""Parametrised Tits frame: given a transvection u in Gamma, g fixing its center,
h fixing its axis, build elementary matrices in all six root positions."""
import sys
from functools import reduce
from sympy import Matrix, Rational, eye, ilcm, factorint
from transvections import family, ev, flag

def frame(s, r, u_w, g_w, h_w):
    G = family(s, r)
    u, g, h = ev(u_w, G), ev(g_w, G), ev(h_w, G)
    v, phi, c = flag(u); v = Matrix(v); phi = Matrix([list(phi)])
    assert Matrix.hstack(g*v, v).rank() == 1, 'g must fix the center'
    assert Matrix.vstack(phi*h, phi).rank() == 1, 'h must fix the axis'
    for name, conj in [('A', G['A']), ('B', G['B']), ('AB', G['A']*G['B'])]:
        axis = phi*conj.inv()
        if (axis*v)[0] != 0: break
    P = Matrix.hstack(v, *axis.nullspace()); Pi = P.inv()
    Ts = [u, g*u*g.inv(), conj*u*conj.inv(), conj*h.inv()*u*h*conj.inv()]
    Es = [Pi*T*P - eye(3) for T in Ts]
    ok_shape = all(E[i, j] == 0 for E in Es[:2] for i in range(3) for j in range(3) if (i, j) not in [(0, 1), (0, 2)]) and \
               all(E[i, j] == 0 for E in Es[2:] for i in range(3) for j in range(3) if (i, j) not in [(1, 0), (2, 0)])
    Uv = Matrix([[Es[0][0, 1], Es[0][0, 2]], [Es[1][0, 1], Es[1][0, 2]]])
    Ul = Matrix([[Es[2][1, 0], Es[2][2, 0]], [Es[3][1, 0], Es[3][2, 0]]])
    m = reduce(ilcm, [x.q for x in list(Uv.inv()) + list(Ul.inv())], 1)
    print(f'(s,r)=({s},{r}): u={u_w} g={g_w} h={h_w} conj={name}')
    print(f'   root-group shape ok: {ok_shape};  det U_v-lattice = {Uv.det()},  det U^(conj L)-lattice = {Ul.det()}')
    print(f'   => E12,E13,E21,E31(m) in Gamma (frame P) for m = {m} = {factorint(m)}; E23,E32(m^2) by commutators')
    return ok_shape and Uv.det() != 0 and Ul.det() != 0

frame(1, Rational(1, 3), 'BBAbABaabbbbABBBABabbbbaBB', 'bbABBBBabb', 'babABB')
frame(Rational(1, 3), 1, 'BBabbaBABAbbabAAbABaaaBA', 'BBabaaaBA', 'aBABaBabAAbabA')
