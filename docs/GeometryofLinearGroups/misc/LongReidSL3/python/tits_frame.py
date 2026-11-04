"""Tits/Venkataramana frame for rho_{1,1/3}: explicit elementary matrices in Gamma."""
from sympy import Matrix, Rational, eye, diag, zeros, ilcm, igcd, gcd
from functools import reduce
from transvections import family, ev, flag

G = family(1, Rational(1, 3))
W = lambda w: ev(w, G)
u_w = 'BBAbABaabbbbABBBABabbbbaBB'          # transvection (length 26)
g_w = 'bbABBBBabb'                          # fixes center v, moves axis
h_w = 'babABB'                              # fixes axis L, moves center
u, g, h, A = W(u_w), W(g_w), W(h_w), G['A']
v, phi, c = flag(u)
v = Matrix(v); phi = Matrix([list(phi)])
print('u = I + c v phi with v =', list(v), ' phi =', list(phi), ' c =', c, ' phi.v =', (phi*v)[0])
print('g v =', list(g*v), ' (parallel to v:', Matrix.hstack(g*v, v).rank() == 1, ')')
print('phi h =', list(phi*h), ' (parallel to phi:', Matrix.vstack(phi*h, phi).rank() == 1, ')')

u1 = u                      # center v, axis L
u2 = g*u*g.inv()            # center v, axis phi g^-1
u3 = A*u*A.inv()            # axis A L
u4 = A*(h.inv()*u*h)*A.inv()  # axis A L (h^-1 u h has axis L), center A h^-1 v
axisAL = phi*A.inv()
print('v on A.L ?', (axisAL*v)[0] == 0, '  (need False: opposite parabolics)')

# basis: e1 = v, e2, e3 spanning A.L = ker(axisAL)
ker = Matrix(axisAL).nullspace()
P = Matrix.hstack(v, *ker)
Pi = P.inv()
names = ['u', 'g u g^-1', 'A u A^-1', 'A h^-1 u h A^-1']
coef = []
for nm, T in zip(names, [u1, u2, u3, u4]):
    E = (Pi*T*P - eye(3)).applyfunc(lambda x: x)
    nz = [(i+1, j+1, E[i, j]) for i in range(3) for j in range(3) if E[i, j] != 0]
    print(f'  P^-1 ({nm}) P = I +', nz)
    coef.append(E)
# U_v part: entries (1,2),(1,3); U^{AL} part: entries (2,1),(3,1)
Uv = Matrix([[coef[0][0,1], coef[0][0,2]], [coef[1][0,1], coef[1][0,2]]])
Ul = Matrix([[coef[2][1,0], coef[2][2,0]], [coef[3][1,0], coef[3][2,0]]])
print('U_v lattice basis rows:', Uv.tolist(), ' det =', Uv.det())
print('U^AL lattice basis rows:', Ul.tolist(), ' det =', Ul.det())

def common_multiple(Mb):
    # smallest positive integer-ish m with m*Z^2 inside the Z-span of the rows of Mb (rational)
    # m e_k = integer combination  <=>  m * (e_k Mb^-1) integral
    Inv = Mb.inv()
    dens = [x.q for x in Inv]
    return reduce(ilcm, dens, 1)
m1, m2 = common_multiple(Uv), common_multiple(Ul)
print('U_v  contains E12(m),E13(m) for m multiple of', m1)
print('U^AL contains E21(m),E31(m) for m multiple of', m2)
