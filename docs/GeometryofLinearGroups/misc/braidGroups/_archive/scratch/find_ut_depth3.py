import time
from flint import fmpq, fmpq_mat

t = fmpq(3, 2)
ti = fmpq(2, 3)

mat_X = fmpq_mat([[-ti, 1, 0], [0, 1, 0], [0, fmpq(3, 2), fmpq(-3, 2)]])
mat_x = fmpq_mat([[-fmpq(3, 2), 1, 0], [0, 1, 0], [0, 1, fmpq(-2, 3)]])
mat_Y = fmpq_mat([[0, fmpq(-4, 9), fmpq(4, 9)], [0, fmpq(-2, 3), fmpq(-5, 6)], [fmpq(3, 2), -1, fmpq(-1, 2)]])
mat_y = fmpq_mat([[fmpq(-1, 2), fmpq(-2, 3), fmpq(2, 3)], [fmpq(-5, 4), fmpq(-2, 3), 0], [1, fmpq(-2, 3), 0]])

gens = [('X', mat_X), ('x', mat_x), ('Y', mat_Y), ('y', mat_y)]
inv_map = {'X': 'x', 'x': 'X', 'Y': 'y', 'y': 'Y'}
def combine_words(w1, w2):
    if not w1: return w2
    if not w2: return w1
    t1 = w1.split()
    t2 = w2.split()
    while t1 and t2 and inv_map.get(t1[-1]) == t2[0]:
        t1.pop(); t2.pop(0)
    return " ".join(t1 + t2)

mat_U = mat_X * mat_y * mat_x * mat_Y
mat_Ui = mat_U.inv()
def get_hashable(M): return tuple(M[i, j] for i in range(3) for j in range(3))
U_powers = set()
M = fmpq_mat([[1,0,0], [0,1,0], [0,0,1]])
for k in range(500):
    U_powers.add(get_hashable(M))
    M = M * mat_U
M = fmpq_mat([[1,0,0], [0,1,0], [0,0,1]])
for k in range(500):
    U_powers.add(get_hashable(M))
    M = M * mat_Ui

beam = [('', fmpq_mat([[1,0,0], [0,1,0], [0,0,1]]))]
for d in range(1, 6):
    next_beam = []
    for word, M in beam:
        for sym, g in gens:
            cw = combine_words(word, sym)
            if not cw: continue
            cm = M * g
            if cm[2,0] == 0 and cm[2,1] == 0 and cm[1,0] == 0:
                if get_hashable(cm) not in U_powers:
                    print(f"FOUND INDEPENDENT UT: {cw}")
                    print(cm)
                else:
                    print(f"Found U^k: {cw}")
            next_beam.append((cw, cm))
    beam = next_beam
