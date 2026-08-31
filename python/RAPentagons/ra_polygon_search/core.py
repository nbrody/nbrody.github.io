"""Core arithmetic and search routines for right-angled polygon reflection groups.

The model is the trace-zero representation

    R(x,y,z) = [[x, y], [z, -x]],      q(x,y,z)=x^2+yz,

with bilinear form

    B(v,w)=2xx' + yz' + zy'.

A primitive integral vector v with q(v) an S-unit gives a reflection in
PGL_2(Z[S^{-1}]).  A right-angled n-gon is a cyclic list v_0,...,v_{n-1}
with B(v_i,v_{i+1})=0 and all non-adjacent pairs hyperbolic:

    B(v_i,v_j)^2 > 4 q(v_i) q(v_j).

This module uses python-flint's fmpz integers when available, but keeps the
public interface as ordinary Python ints/lists so JSON/SQLite integration stays
simple.
"""
from __future__ import annotations

from dataclasses import dataclass, asdict
from functools import reduce
from math import gcd, isqrt
from typing import Dict, Iterable, Iterator, List, Optional, Sequence, Set, Tuple

try:
    from flint import fmpz
except Exception:  # pragma: no cover - allows editing/running without python-flint
    fmpz = int

Vec = Tuple[int, int, int]


@dataclass(frozen=True)
class SearchConfig:
    primes: Tuple[int, ...]
    polygon_sides: int = 5
    max_norm: int = 10_000
    coord_bound: int = 500
    max_vectors: int = 200_000
    max_solutions: int = 20
    normalize_sign: bool = True
    require_primitive: bool = True

    def __post_init__(self) -> None:
        bad = [p for p in self.primes if int(p) <= 1]
        if bad:
            raise ValueError(f"primes must be integers > 1, got {bad}")


@dataclass(frozen=True)
class PolygonSolution:
    primes: Tuple[int, ...]
    polygon_sides: int
    vectors: Tuple[Vec, ...]
    norms: Tuple[int, ...]
    gram: Tuple[Tuple[int, ...], ...]
    matrices: Tuple[Tuple[Tuple[int, int], Tuple[int, int]], ...]
    height: int
    norm_product: int
    source: str = "search"
    notes: str = ""

    def to_dict(self) -> Dict:
        d = asdict(self)
        d["primes"] = list(self.primes)
        d["vectors"] = [list(v) for v in self.vectors]
        d["norms"] = list(self.norms)
        d["gram"] = [list(row) for row in self.gram]
        d["matrices"] = [[[a, b], [c, d_]] for ((a, b), (c, d_)) in self.matrices]
        return d


def q(v: Vec) -> int:
    x, y, z = map(fmpz, v)
    return int(x*x + y*z)


def B(v: Vec, w: Vec) -> int:
    x, y, z = map(fmpz, v)
    X, Y, Z = map(fmpz, w)
    return int(2*x*X + y*Z + z*Y)


def matrix(v: Vec) -> Tuple[Tuple[int, int], Tuple[int, int]]:
    x, y, z = v
    return ((x, y), (z, -x))


def vec_height(v: Vec) -> int:
    return max(abs(v[0]), abs(v[1]), abs(v[2]))


def primitive(v: Vec) -> bool:
    return gcd(gcd(abs(v[0]), abs(v[1])), abs(v[2])) == 1


def canonical_vec(v: Vec, normalize_sign: bool = True) -> Vec:
    """Primitive projective representative, with optional sign convention."""
    x, y, z = v
    g = gcd(gcd(abs(x), abs(y)), abs(z))
    if g:
        x, y, z = x // g, y // g, z // g
    if normalize_sign:
        # Make first nonzero coordinate positive.
        for a in (x, y, z):
            if a < 0:
                return (-x, -y, -z)
            if a > 0:
                break
    return (x, y, z)


def is_s_unit(n: int, primes: Sequence[int]) -> bool:
    if n <= 0:
        return False
    m = abs(n)
    for p in primes:
        # p<=1 would make `m % p == 0` and `m //= p` a no-op / non-progress loop.
        if int(p) <= 1:
            return False
        while m % p == 0:
            m //= p
    return m == 1


def generate_s_unit_norms(primes: Sequence[int], max_norm: int) -> List[int]:
    primes = tuple(sorted({int(p) for p in primes if int(p) > 1}))
    if not primes:
        return [1] if max_norm >= 1 else []
    vals: Set[int] = {1}
    frontier = [1]
    for p in primes:
        new_vals = set(vals)
        for v in list(vals):
            m = v * p
            while m <= max_norm:
                new_vals.add(m)
                m *= p
        vals = new_vals
    return sorted(vals)


def divisors_signed(n: int) -> Iterator[int]:
    if n == 0:
        return
    N = abs(n)
    for d in range(1, isqrt(N) + 1):
        if N % d == 0:
            yield d
            yield -d
            e = N // d
            if e != d:
                yield e
                yield -e


def generate_vectors(config: SearchConfig) -> List[Vec]:
    """Enumerate primitive integral vectors with S-unit norm in the bounds.

    This is deterministic and useful for reproducibility.  It is not meant to be
    the final fastest possible enumerator; the rest of the framework isolates it
    so orbit enumerators can be swapped in later.
    """
    norms = generate_s_unit_norms(config.primes, config.max_norm)
    out: List[Vec] = []
    seen: Set[Vec] = set()
    BOUND = config.coord_bound

    for Q in norms:
        # q=x^2+yz=Q.  If |y|,|z|<=BOUND, then x^2 can be as large as Q+BOUND^2.
        max_x = min(BOUND, isqrt(Q + BOUND*BOUND) + 1)
        for x in range(-max_x, max_x + 1):
            n = Q - x*x
            if n == 0:
                candidates = ((x, 1, 0), (x, -1, 0), (x, 0, 1), (x, 0, -1))
            else:
                candidates = []
                for y in divisors_signed(n):
                    z = n // y
                    if abs(y) <= BOUND and abs(z) <= BOUND:
                        candidates.append((x, y, z))
            for v in candidates:
                if config.require_primitive and not primitive(v):
                    continue
                cv = canonical_vec(v, config.normalize_sign)
                if cv in seen:
                    continue
                if q(cv) <= 0 or not is_s_unit(q(cv), config.primes):
                    continue
                seen.add(cv)
                out.append(cv)
                if len(out) >= config.max_vectors:
                    return sort_vectors(out)
    return sort_vectors(out)


def sort_vectors(vectors: Iterable[Vec]) -> List[Vec]:
    return sorted(vectors, key=lambda v: (vec_height(v), q(v), v))


def adjacent(i: int, j: int, n: int) -> bool:
    return (i - j) % n in (1, n - 1)


def hyperbolic(v: Vec, w: Vec) -> bool:
    return B(v, w)**2 > 4 * q(v) * q(w)


def gram_matrix(cycle: Sequence[Vec]) -> Tuple[Tuple[int, ...], ...]:
    return tuple(tuple(B(v, w) for w in cycle) for v in cycle)


def is_valid_polygon(cycle: Sequence[Vec]) -> bool:
    n = len(cycle)
    for i in range(n):
        if B(cycle[i], cycle[(i + 1) % n]) != 0:
            return False
    for i in range(n):
        for j in range(i + 1, n):
            if not adjacent(i, j, n):
                if not hyperbolic(cycle[i], cycle[j]):
                    return False
    return True


def make_solution(
    primes: Sequence[int], cycle: Sequence[Vec], source: str = "search", notes: str = ""
) -> PolygonSolution:
    norms = tuple(q(v) for v in cycle)
    prod = 1
    for n in norms:
        prod *= n
    return PolygonSolution(
        primes=tuple(sorted(set(primes))),
        polygon_sides=len(cycle),
        vectors=tuple(cycle),
        norms=norms,
        gram=gram_matrix(cycle),
        matrices=tuple(matrix(v) for v in cycle),
        height=max(vec_height(v) for v in cycle),
        norm_product=prod,
        source=source,
        notes=notes,
    )


def build_adjacency(vectors: Sequence[Vec]) -> Dict[int, List[int]]:
    """Sparse orthogonality graph.  O(N^2), good enough for moderate N."""
    adj: Dict[int, List[int]] = {i: [] for i in range(len(vectors))}
    for i in range(len(vectors)):
        vi = vectors[i]
        for j in range(i + 1, len(vectors)):
            if B(vi, vectors[j]) == 0:
                adj[i].append(j)
                adj[j].append(i)
    return adj


def find_polygons(config: SearchConfig, vectors: Optional[List[Vec]] = None) -> List[PolygonSolution]:
    """Find right-angled polygon cycles in the orthogonality graph.

    This is intentionally conservative: it canonicalizes cycles up to rotation and
    reversal, and it verifies the hyperbolic diagonal inequalities before saving.
    """
    if vectors is None:
        vectors = generate_vectors(config)
    n = config.polygon_sides
    adj = build_adjacency(vectors)
    solutions: List[PolygonSolution] = []
    seen_cycles: Set[Tuple[int, ...]] = set()

    def canon_cycle(cyc: Sequence[int]) -> Tuple[int, ...]:
        c = list(cyc)
        rotations = []
        for seq in (c, list(reversed(c))):
            for k in range(n):
                rotations.append(tuple(seq[k:] + seq[:k]))
        return min(rotations)

    def dfs(path: List[int]) -> None:
        if len(solutions) >= config.max_solutions:
            return
        if len(path) == n:
            if path[0] not in adj[path[-1]]:
                return
            key = canon_cycle(path)
            if key in seen_cycles:
                return
            cyc = [vectors[i] for i in path]
            if is_valid_polygon(cyc):
                seen_cycles.add(key)
                solutions.append(make_solution(config.primes, cyc))
            return
        last = path[-1]
        for nb in adj[last]:
            if nb in path:
                continue
            # Symmetry break: make the first vertex the minimum index in the cycle.
            if nb < path[0]:
                continue
            # Early hyperbolicity for new non-adjacent pairs, except eventual closing edge.
            ok = True
            new_pos = len(path)
            for old_pos, old_idx in enumerate(path[:-1]):
                # If adding final vertex, old_pos=0 is adjacent via closing edge.
                if new_pos == n - 1 and old_pos == 0:
                    continue
                if not hyperbolic(vectors[old_idx], vectors[nb]):
                    ok = False
                    break
            if ok:
                dfs(path + [nb])
                if len(solutions) >= config.max_solutions:
                    return

    # Start from low-height vertices first. Limit degree explosion by using the sorted order.
    for start in range(len(vectors)):
        dfs([start])
        if len(solutions) >= config.max_solutions:
            break
    return solutions


def verify_solution_data(data: Dict) -> bool:
    cycle = [tuple(map(int, v)) for v in data["vectors"]]
    return is_valid_polygon(cycle)
