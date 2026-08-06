// Regression: live validate must not O(√n)-freeze on large quaternion norms.
// Run: node --experimental-default-type=module web/js/test_prime_power.js
import { primePower, isPrime, sqrtModPrime, ithRoot, MAX_INTERACTIVE_PRIME } from "./numbertheory.js";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

// Correctness on small LPS-style norms
assert(primePower(5n)?.p === 5n && primePower(5n)?.e === 1, "5 = 5^1");
assert(primePower(13n)?.p === 13n && primePower(13n)?.e === 1, "13 = 13^1");
assert(primePower(25n)?.p === 5n && primePower(25n)?.e === 2, "25 = 5^2");
assert(primePower(125n)?.p === 5n && primePower(125n)?.e === 3, "125 = 5^3");
assert(primePower(49n)?.p === 7n && primePower(49n)?.e === 2, "49 = 7^2");
assert(primePower(15n) === null, "15 not a prime power");
assert(primePower(1n) === null, "1 not a prime power");
assert(primePower(4n)?.p === 2n && primePower(4n)?.e === 2, "4 = 2^2");
assert(primePower(9n * 25n) === null, "225 = 3^2*5^2 not a pure prime power");

// Perfect-power root helper
assert(ithRoot(81n, 4) === 3n, "81 = 3^4");
assert(ithRoot(80n, 4) === null, "80 not a 4th power");

// Large N = p^2 that previously froze validate (~2s at p≈1e9; minutes at ~1e12)
const bigPrimes = [1000000007n, 1000000009n, 999999999989n];
for (const p of bigPrimes) {
  assert(isPrime(p), `${p} should be prime`);
  const t0 = Date.now();
  const r = primePower(p * p);
  const ms = Date.now() - t0;
  assert(r && r.p === p && r.e === 2, `primePower(${p}^2)`);
  assert(ms < 200, `primePower(${p}^2) took ${ms}ms (must stay <200ms for live input)`);
  console.log(`ok primePower(${p}^2) in ${ms}ms`);
}

// Large prime norm (e=1)
{
  const p = 10000000019n;
  const t0 = Date.now();
  const r = primePower(p);
  const ms = Date.now() - t0;
  assert(r && r.p === p && r.e === 1, "large prime norm");
  assert(ms < 200, `primePower(large prime) took ${ms}ms`);
  console.log(`ok primePower(${p}) in ${ms}ms`);
}

// Semiprime must return null quickly (old code scanned to √n)
{
  const a = 1000000007n, b = 1000000009n;
  const t0 = Date.now();
  const r = primePower(a * b);
  const ms = Date.now() - t0;
  assert(r === null, "semiprime not a prime power");
  assert(ms < 200, `primePower(semiprime) took ${ms}ms`);
  console.log(`ok primePower(semiprime) null in ${ms}ms`);
}

// Tonelli–Shanks: known residues
assert(sqrtModPrime(2n, 17n) !== null, "2 QR mod 17");
assert((sqrtModPrime(2n, 17n) ** 2n) % 17n === 2n, "sqrt^2 = 2 mod 17");
assert(sqrtModPrime(3n, 17n) === null, "3 non-residue mod 17");
assert(sqrtModPrime(0n, 13n) === 0n, "0 sqrt");
// q ≡ 3 (mod 4) fast path
assert((sqrtModPrime(5n, 19n) ** 2n) % 19n === 5n, "5 QR mod 19");

assert(MAX_INTERACTIVE_PRIME === 10007n, "interactive prime cap");

console.log("All primePower / sqrtModPrime tests passed.");
