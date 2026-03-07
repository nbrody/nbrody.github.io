from flint import fmpq, fmpq_mat
t = fmpq(3, 2); ti = fmpq(2, 3)
mat_X = fmpq_mat([[-ti, 1, 0], [0, 1, 0], [0, fmpq(3, 2), fmpq(-3, 2)]])
mat_x = fmpq_mat([[-fmpq(3, 2), 1, 0], [0, 1, 0], [0, 1, fmpq(-2, 3)]])
mat_Y = fmpq_mat([[0, fmpq(-4, 9), fmpq(4, 9)], [0, fmpq(-2, 3), fmpq(-5, 6)], [fmpq(3, 2), -1, fmpq(-1, 2)]])
mat_y = fmpq_mat([[fmpq(-1, 2), fmpq(-2, 3), fmpq(2, 3)], [fmpq(-5, 4), fmpq(-2, 3), 0], [1, fmpq(-2, 3), 0]])

w = "Y x x Y X X".split()
M = fmpq_mat([[1,0,0], [0,1,0], [0,0,1]])
gens = {'X': mat_X, 'x': mat_x, 'Y': mat_Y, 'y': mat_y}
for s in w:
    M = M * gens[s]
print(M)
