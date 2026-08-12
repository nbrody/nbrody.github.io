#!/usr/bin/env python3
"""Analyze the Long-Reid solutions stored in outputs/results.db.

For each t = p/q (lowest terms) the search hunts words in
  a ~ [[p,0],[0,q]]   (det pq),
  b ~ [[q^2+p^2, 2q^2],[pq, q^2]]   (det q^2(p-q)^2)
whose canonicalized matrix has det +-1.

Structural facts this script tests against the data:

1. Parity constraint. det(word) = (pq)^{n_a} * (q(p-q))^{2 n_b}, where n_a
   counts a/ai letters. Canonicalization divides det by a perfect square, so
   a solution forces |pq|^{n_a} to be a perfect square: n_a must be EVEN
   unless |pq| is itself a square.

2. S3 (cross-ratio) orbits. The set {t, 1/t, 1-t, 1/(1-t), (t-1)/t, t/(t-1)}
   has the same prime set of p*q*(p-q) for every member. If the groups are
   equivalent along the orbit, search difficulty (shortest word length)
   should be roughly orbit-invariant.
"""
import os
import sqlite3
from fractions import Fraction

from sympy import factorint

HERE = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(HERE, "outputs", "results.db")


def load():
    conn = sqlite3.connect(DB_PATH)
    rows = conn.execute(
        "SELECT variant, word, word_length FROM solutions "
        "WHERE script='longReidGroup.py' AND variant != ''").fetchall()
    conn.close()
    per_t = {}
    for variant, word, wl in rows:
        t = Fraction(variant[2:])
        per_t.setdefault(t, []).append((word, wl))
    return per_t


def letter_stats(word):
    toks = word.split(" . ")
    na = sum(1 for x in toks if x in ("a", "ai"))
    nb = sum(1 for x in toks if x in ("b", "bi"))
    ea = sum(1 if x == "a" else -1 for x in toks if x in ("a", "ai"))
    eb = sum(1 if x == "b" else -1 for x in toks if x in ("b", "bi"))
    return na, nb, ea, eb


def prime_set(t):
    p, q = t.numerator, t.denominator
    n = abs(p * q * (p - q))
    return sorted(factorint(n)) if n > 1 else []


def is_square(n):
    n = abs(n)
    r = int(n ** 0.5)
    while r * r < n:
        r += 1
    return r * r == n


def orbit(t):
    """Cross-ratio S3 orbit of t (excluding 0, 1, and infinities)."""
    vals = set()
    for f in (lambda x: x, lambda x: 1 / x, lambda x: 1 - x,
              lambda x: 1 / (1 - x), lambda x: (x - 1) / x,
              lambda x: x / (x - 1)):
        try:
            vals.add(f(t))
        except ZeroDivisionError:
            pass
    return frozenset(vals)


def main():
    per_t = load()
    if not per_t:
        print("no longReidGroup solutions in the database yet")
        return

    # ---------- per-t table ----------
    print(f"{'t':>6} | {'p':>3} {'q':>2} | {'primes of pq(p-q)':<18} | "
          f"{'minlen':>6} | {'n_a':>3} {'n_b':>3} | {'e_a':>3} {'e_b':>3} | pq")
    print("-" * 78)
    for t in sorted(per_t):
        word, wl = min(per_t[t], key=lambda x: x[1])
        na, nb, ea, eb = letter_stats(word)
        p, q = t.numerator, t.denominator
        pq = p * q
        sq = " sq" if is_square(pq) else ""
        print(f"{str(t):>6} | {p:>3} {q:>2} | {str(prime_set(t)):<18} | "
              f"{wl:>6} | {na:>3} {nb:>3} | {ea:>3} {eb:>3} | {pq}{sq}")

    # ---------- parity check over ALL solutions ----------
    print()
    total = viol = 0
    for t, sols in per_t.items():
        pq = t.numerator * t.denominator
        for word, _ in sols:
            na, nb, ea, eb = letter_stats(word)
            total += 1
            if not is_square(abs(pq)) and na % 2 == 1:
                viol += 1
                print(f"  PARITY VIOLATION at t={t}: n_a={na}, word={word[:60]}")
    print(f"Parity constraint (n_a even unless |pq| is a square): "
          f"{total - viol}/{total} solutions conform")

    # ---------- exponent-sum stats ----------
    ea_vals, eb_vals = set(), set()
    for sols in per_t.values():
        for word, _ in sols:
            _, _, ea, eb = letter_stats(word)
            ea_vals.add(ea)
            eb_vals.add(eb)
    print(f"a-exponent sums seen across all solutions: {sorted(ea_vals)}")
    print(f"b-exponent sums seen across all solutions: {sorted(eb_vals)}")

    # ---------- S3 orbit grouping ----------
    print()
    print("S3 (cross-ratio) orbits — shortest length per member:")
    seen = set()
    for t in sorted(per_t):
        orb = orbit(t)
        if orb in seen:
            continue
        seen.add(orb)
        members = sorted(orb & set(per_t), key=lambda x: (x.denominator, x))
        missing = sorted(orb - set(per_t), key=lambda x: (x.denominator, x))
        parts = [f"t={m}: {min(wl for _, wl in per_t[m])}" for m in members]
        line = "  {" + ", ".join(str(x) for x in sorted(orb)) + "}  ->  "
        line += ",  ".join(parts)
        if missing:
            line += f"   (no data: {', '.join(str(x) for x in missing)})"
        print(line)


if __name__ == "__main__":
    main()
