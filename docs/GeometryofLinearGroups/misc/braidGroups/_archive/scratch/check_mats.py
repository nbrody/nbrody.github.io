import numpy as np
from fractions import Fraction

t = 1.5
ti = 1/t

def sig(i, n=4):
    d=n-1; M=np.eye(d, dtype=float); r=i-1
    M[r][r]=-t
    if i>1: M[r][r-1]=t
    if r+1<d: M[r][r+1]=1
    return M

def siginv(i, n=4):
    d=n-1; M=np.eye(d, dtype=float); r=i-1
    M[r][r]=-ti
    if i>1: M[r][r-1]=1
    if r+1<d: M[r][r+1]=ti
    return M

s1,s2,s3 = sig(1),sig(2),sig(3)
S1,S2,S3 = siginv(1),siginv(2),siginv(3)

X=s3@S1; x=s1@S3; Y=s2@s3@S1@S2; y=s2@s1@S3@S2
print("X:"); print(X)
print("x:"); print(x)
print("Y:"); print(Y)
print("y:"); print(y)
