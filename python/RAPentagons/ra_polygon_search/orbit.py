"""Orbit-generation utilities for the trace-zero model.

Conjugation by A in PGL_2 acts on trace-zero matrices R(v) by A R(v) A^{-1}.
For A=T,S,D_p, the induced maps are included below.  The output is always
primitive/canonicalized and filtered to positive S-unit norm.
"""
from __future__ import annotations

from collections import deque
from typing import Iterable, List, Sequence, Set, Tuple

from .core import Vec, SearchConfig, canonical_vec, is_s_unit, q, sort_vectors, vec_height


def act_T(v: Vec) -> Vec:
    x, y, z = v
    return (x + z, y - 2*x - z, z)


def act_T_inv(v: Vec) -> Vec:
    x, y, z = v
    return (x - z, y + 2*x - z, z)


def act_S(v: Vec) -> Vec:
    x, y, z = v
    return (-x, -z, -y)


def act_D(v: Vec, p: int) -> Vec:
    # D=diag(p,1): [[x, p y], [z/p, -x]].  Clear denominators by p.
    x, y, z = v
    return (p*x, p*p*y, z)


def act_D_inv(v: Vec, p: int) -> Vec:
    # D^{-1}=diag(1/p,1): [[x, y/p], [p z, -x]].  Clear denominators by p.
    x, y, z = v
    return (p*x, y, p*p*z)


def orbit_vectors(
    config: SearchConfig,
    seeds: Iterable[Vec],
    generator_primes: Sequence[int] | None = None,
) -> List[Vec]:
    generator_primes = tuple(generator_primes or config.primes)
    seen: Set[Vec] = set()
    dq = deque()

    for s in seeds:
        cs = canonical_vec(s, config.normalize_sign)
        if q(cs) > 0 and is_s_unit(q(cs), config.primes):
            seen.add(cs)
            dq.append(cs)

    maps = [act_T, act_T_inv, act_S]

    while dq and len(seen) < config.max_vectors:
        v = dq.popleft()
        candidates = [f(v) for f in maps]
        for p in generator_primes:
            candidates.append(act_D(v, p))
            candidates.append(act_D_inv(v, p))
        for w in candidates:
            cw = canonical_vec(w, config.normalize_sign)
            if cw in seen:
                continue
            if vec_height(cw) > config.coord_bound:
                continue
            Q = q(cw)
            if Q <= 0 or Q > config.max_norm or not is_s_unit(Q, config.primes):
                continue
            seen.add(cw)
            dq.append(cw)
            if len(seen) >= config.max_vectors:
                break
    return sort_vectors(seen)


def default_seeds(primes: Sequence[int]) -> List[Vec]:
    """A small seed set for common S-unit square classes.

    Includes q=1 and q=p representatives (1,1,p-1), plus some isotropic-adjacent
    low-height variants useful in practice.
    """
    seeds: List[Vec] = [(1, 0, 0), (0, 1, 1), (1, 1, 0)]
    for p in sorted(set(primes)):
        seeds.append((1, 1, p - 1))
        seeds.append((0, 1, p))
    return seeds
