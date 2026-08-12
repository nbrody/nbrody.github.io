#!/usr/bin/env python3
"""Analyze Lyndon-Ullman relations stored in outputs/results.db.

For each rational mu the search stores reduced words in A = [[1,mu],[0,1]],
B = [[1,0],[mu,1]] equal to +-I (relations => <A,B> not free at mu).

Reported per mu: shortest relation, its block decomposition (signed exponent
runs, e.g. a^2 b^-2 a^4 b^-2 a^2 -> [2,-2,4,-2,2]), palindrome / periodicity
structure, and exponent sums. Also checks Sanov consistency (no relations at
|mu| >= 2) and the mu <-> -mu conjugation symmetry.
"""
import os
import sqlite3
from fractions import Fraction

HERE = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(HERE, "outputs", "results.db")


def load():
    conn = sqlite3.connect(DB_PATH)
    rows = conn.execute(
        "SELECT variant, word, word_length, matrix FROM solutions "
        "WHERE script='lyndonUllman.py'").fetchall()
    conn.close()
    per_mu = {}
    for variant, word, wl, matrix in rows:
        mu = Fraction(variant[2:])
        sign = "-I" if (matrix or "").strip().endswith("-I") else "+I"
        per_mu.setdefault(mu, []).append((word, wl, sign))
    return per_mu


def blocks(word):
    """Signed exponent runs: a.a.bi.bi -> [('a',2), ('b',-2)]."""
    out = []
    for tok in word.split(" . "):
        base = tok[0]                      # 'a' or 'b'
        step = -1 if tok.endswith("i") else 1
        if out and out[-1][0] == base and (out[-1][1] > 0) == (step > 0):
            out[-1] = (base, out[-1][1] + step)
        else:
            out.append((base, step))
    return out


def describe(bl):
    return " ".join(f"{b}^{e}" if e != 1 else b for b, e in bl)


def main():
    per_mu = load()
    if not per_mu:
        print("no lyndonUllman solutions in the database yet")
        return

    print(f"{'mu':>6} | {'|mu|':>5} | {'minlen':>6} | {'sign':>4} | "
          f"{'e_a':>4} {'e_b':>4} | structure")
    print("-" * 100)
    for mu in sorted(per_mu):
        word, wl, sign = min(per_mu[mu], key=lambda x: x[1])
        bl = blocks(word)
        exps = [e for _, e in bl]
        pal = "palindrome" if exps == exps[::-1] else ""
        ea = sum(e for b, e in bl if b == "a")
        eb = sum(e for b, e in bl if b == "b")
        print(f"{str(mu):>6} | {float(abs(mu)):>5.2f} | {wl:>6} | {sign:>4} | "
              f"{ea:>4} {eb:>4} | {describe(bl)}  {pal}")

    # Sanov consistency
    bad = [mu for mu in per_mu if abs(mu) >= 2]
    print()
    if bad:
        print(f"!!! SANOV VIOLATION: relations found at |mu| >= 2: {bad}")
    else:
        print("Sanov consistency: no relations at any |mu| >= 2  ✓")

    # mu <-> -mu symmetry (conjugate by diag(1,-1))
    pairs = [(mu, -mu) for mu in per_mu if -mu in per_mu and mu > 0]
    for mu, neg in pairs:
        l1 = min(wl for _, wl, _ in per_mu[mu])
        l2 = min(wl for _, wl, _ in per_mu[neg])
        mark = "✓" if l1 == l2 else f"MISMATCH ({l1} vs {l2})"
        print(f"symmetry mu={mu} vs {neg}: minlen {l1} vs {l2}  {mark}")


if __name__ == "__main__":
    main()
