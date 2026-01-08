from hurwitz import HurwitzQuaternion, epsilon
from flint import fmpz

def test_primes(p):
    print(f"Testing primes above p={p}")
    primes = HurwitzQuaternion.primes_above(p)
    print(f"Found {len(primes)} primes.")
    for q in primes:
        print(f"  {q}, norm={q.norm()}")
        assert q.norm() == p
    
    expected_count = p + 1
    if len(primes) == expected_count:
        print(f"SUCCESS: Found exactly {expected_count} primes.")
    else:
        print(f"FAILURE: Expected {expected_count}, found {len(primes)}.")

def test_arithmetic():
    print("\nTesting Arithmetic")
    q1 = HurwitzQuaternion(2, 0, 0, 0) # 1
    q2 = HurwitzQuaternion(0, 2, 0, 0) # i
    prod = q1 * q2
    print(f"1 * i = {prod}")
    assert prod == q2
    
    # Epsilon squared
    # e = (-1+i+j+k)/2. e^2 = ?
    # (-1+i+j+k)/2 * (-1+i+j+k)/2
    # = (1 - 1 - 1 - 1 + 2(-i -j -k + k - j + i)) / 4 ... manual calculation is prone to error.
    # Let code do it.
    e2 = epsilon * epsilon
    print(f"epsilon^2 = {e2}")
    
    # Norm of epsilon
    print(f"norm(epsilon) = {epsilon.norm()}")
    assert epsilon.norm() == 1

if __name__ == "__main__":
    test_arithmetic()
    test_primes(3)
    test_primes(5)
    test_primes(7)
