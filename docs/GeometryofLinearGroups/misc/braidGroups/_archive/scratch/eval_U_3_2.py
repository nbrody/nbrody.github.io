from eval_3_2 import *

M = mi()
for i in range(1, 10):
    M = mm(M, word_mat("X y x Y"))
    
    print(f"\nU^{i}:")
    print(f"M[2][0] = {M[2][0].show()}")
    print(f"M[2][1] = {M[2][1].show()}")
    print(f"M[1][0] = {M[1][0].show()}")
    
    print(f"M[0][0] = {M[0][0].show()}")
    print(f"M[1][1] = {M[1][1].show()}")
    print(f"M[2][2] = {M[2][2].show()}")
