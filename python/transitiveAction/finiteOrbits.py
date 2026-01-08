#!/usr/bin/env python3
from __future__ import annotations

from dataclasses import dataclass
from collections import deque
from typing import Dict, Iterable, List, Optional, Set, Tuple

from flint import fmpz

# -----------------------------
# Types
# -----------------------------
Z = fmpz
Point = Tuple[Z, Z]          # (p:q) representing p/q, with infinity = (1:0)
Mat = Tuple[Z, Z, Z, Z]      # (a,b,c,d) for [[a,b],[c,d]]

# -----------------------------
# Projective line representation
# -----------------------------
INF: Point = (Z(1), Z(0))
ZERO: Point = (Z(0), Z(1))

def normalize(p: Z, q: Z) -> Point:
    """Normalize (p:q) to reduced form; q>=0; infinity=(1:0)."""
    if q == 0:
        return INF
    if p == 0:
        return ZERO
    if q < 0:
        p, q = -p, -q
    g = fmpz.gcd(abs(p), q)
    return (p // g, q // g)

def height_int(x: Point) -> int:
    """Height of p/q as max(|p|, q), height(infinity)=0."""
    p, q = x
    if q == 0:
        return 0
    ap = abs(p)
    return int(ap if ap > q else q)

def point_str(x: Point) -> str:
    p, q = x
    if q == 0:
        return "∞"
    if q == 1:
        return str(int(p))
    return f"{int(p)}/{int(q)}"

# -----------------------------
# Möbius action (integer matrices, projectively)
# -----------------------------
def inv_proj(M: Mat) -> Mat:
    """Inverse up to scalar (adjugate), sufficient for Möbius action on P^1."""
    a, b, c, d = M
    return (d, -b, -c, a)

def mobius(M: Mat, x: Point) -> Point:
    """Apply Möbius transform M to x in P^1(Q)."""
    a, b, c, d = M
    p, q = x

    if q == 0:  # infinity -> a/c
        if c == 0:
            return INF
        return normalize(a, c)

    num = a * p + b * q
    den = c * p + d * q
    if den == 0:
        return INF
    return normalize(num, den)

# -----------------------------
# Your generators (integer representatives)
# -----------------------------
# -----------------------------
# Generators
# -----------------------------
def get_generators(name: str) -> List[Tuple[str, Mat]]:
    if name == "Z1/2":
        # Original generators:
        # A0 = [[2,-2],[0,1/2]] ; B0 = [[3,4],[2,3]]
        # Scale A0 by 2 (same Möbius map) -> [[4,-4],[0,1]]
        A: Mat = (Z(4), Z(-4), Z(0), Z(1))
        B: Mat = (Z(3), Z(4),  Z(2), Z(3))
        return [("A", A), ("B", B), ("A'", inv_proj(A)), ("B'", inv_proj(B))]
    elif name == "Modular":
        # Standard SL(2,Z) generators
        # S = [[0,-1],[1,0]] ; T = [[1,1],[0,1]]
        S: Mat = (Z(0), Z(-1), Z(1), Z(0))
        T: Mat = (Z(1), Z(1),  Z(0), Z(1))
        return [("S", S), ("T", T), ("S'", inv_proj(S)), ("T'", inv_proj(T))]
    elif name == "Triangle":
        # Three generators: S, A, B
        # S = [[0,-1],[1,0]]
        # A = [[2,0],[0,1]]
        # B = [[1,2],[2,5]]
        S: Mat = (Z(0), Z(-1), Z(1), Z(0))
        A: Mat = (Z(2), Z(0),  Z(0), Z(1))
        B: Mat = (Z(1), Z(2),  Z(2), Z(5))
        return [("S", S), ("A", A), ("B", B), ("S'", inv_proj(S)), ("A'", inv_proj(A)), ("B'", inv_proj(B))]
    else:
        raise ValueError(f"Unknown generator set: {name}")

# -----------------------------
# Orbit exploration (BFS) with pruning
# -----------------------------
def orbit_pruned(
    seed: Point,
    gens: List[Tuple[str, Mat]],
    *,
    max_depth: int,
    height_cap: int,
    max_nodes: int,
) -> Tuple[Dict[Point, int], bool]:
    """
    BFS orbit exploration from seed.
    - stops at word length max_depth
    - prunes intermediate states with height > height_cap (except infinity)
    - stops if visited nodes reaches max_nodes
    Returns (dist, hit_cap).
    """
    dist: Dict[Point, int] = {seed: 0}
    Q = deque([seed])

    while Q:
        x = Q.popleft()
        d = dist[x]
        if d >= max_depth:
            continue
        for name, M in gens:
            y = mobius(M, x)
            if y[1] != 0 and height_int(y) > height_cap:
                continue
            if y not in dist:
                dist[y] = d + 1
                Q.append(y)
                if len(dist) >= max_nodes:
                    return dist, True
    return dist, False

def find_path_to_reps(
    start: Point,
    target_reps: Set[Point],
    gens: List[Tuple[str, Mat]],
    max_depth: int = 50,
    height_cap: int = 10000,
    max_nodes: int = 100_000, # Used as a safety break if needed, but beam_width controls main size
    beam_width: int = 5000,
) -> Optional[List[Tuple[Point, str, Point]]]:
    """
    Beam Search to find a path from 'start' to the *simplest* point in 'target_reps'.
    Simplest is defined by minimum height.
    """
    
    # helper to reconstruct path
    def get_path(node, parent_map):
        path = []
        curr = node
        while curr in parent_map:
            p_node, p_name = parent_map[curr]
            path.append((p_node, p_name, curr))
            curr = p_node
        path.reverse()
        return path

    best_rep = None
    best_path = None
    
    # Check start point
    if start in target_reps:
        best_rep = start
        best_path = []
        if height_int(start) == 0:
            return best_path

    # parent[child] = (parent_node, move_name)
    parent: Dict[Point, Tuple[Point, str]] = {}
    visited: Set[Point] = {start}
    
    # Beam: List of Points
    beam = [start]

    for _ in range(max_depth):
        candidates = []
        
        # Expand beam
        for curr in beam:
            for name, M in gens:
                nxt = mobius(M, curr)
                
                if nxt in visited:
                    continue
                
                # Check height cap
                if nxt[1] != 0 and height_int(nxt) > height_cap:
                    continue

                visited.add(nxt)
                parent[nxt] = (curr, name)
                candidates.append(nxt)

                # Check if we hit a representative
                if nxt in target_reps:
                    is_better = False
                    if best_rep is None:
                        is_better = True
                    else:
                        h_new = height_int(nxt)
                        h_best = height_int(best_rep)
                        if h_new < h_best:
                            is_better = True
                    
                    if is_better:
                        best_rep = nxt
                        best_path = get_path(nxt, parent)
                        if height_int(best_rep) == 0:
                            return best_path
        
        if not candidates:
            break
            
        # Select best candidates for next beam (lowest height)
        # Optimization: We only need to sort if len > beam_width
        if len(candidates) > beam_width:
            # Sort by height
            candidates.sort(key=height_int)
            beam = candidates[:beam_width]
        else:
            beam = candidates
            
    return best_path

# -----------------------------
# Test set S_H and ordering
# -----------------------------
def S_height(H: int) -> Set[Point]:
    """
    S_H = {p/q: |p|<=H, 1<=q<=H, gcd(p,q)=1} U {∞}.
    """
    S: Set[Point] = {INF}
    H = int(H)
    for q in range(1, H + 1):
        fq = Z(q)
        for p in range(-H, H + 1):
            fp = Z(p)
            if fmpz.gcd(abs(fp), fq) == 1:
                S.add((fp, fq))
    return S

def ordered_points(H: int) -> List[Point]:
    """Order by (height, denom, numer), with ∞ first."""
    S = S_height(H)

    def key(x: Point):
        p, q = x
        if q == 0:
            return (0, 0, 0)
        h = max(int(abs(p)), int(q))
        return (h, int(q), int(p))

    return sorted(S, key=key)

# -----------------------------
# Empirical covering procedure
# -----------------------------
@dataclass
class CoverResult:
    H: int
    depth: int
    height_cap: int
    max_nodes: int
    reps: List[Point]                 # representatives chosen (one per "orbit found" by heuristic)
    hit_node_cap: bool
    stopped_reason: Optional[str] = None

def empirical_cover(
    H_bound: int,
    gens: List[Tuple[str, Mat]],
    *,
    max_depth: int,
    height_cap: int,
    max_nodes: int,
) -> Tuple[List[Point], int]:
    """
    Cover S_H with orbits. 
    Returns (representatives, total_points_in_S_H).
    """
    pts = ordered_points(H_bound)
    total_points = len(pts)
    
    covered: Set[Point] = set()
    reps: List[Point] = []
    
    for x in pts:
        if x in covered:
            continue
        
        reps.append(x)
        orbit_points, _ = orbit_pruned(
            x, gens, max_depth=max_depth, height_cap=height_cap, max_nodes=max_nodes
        )
        covered.update(orbit_points.keys())

    return reps, total_points

# -----------------------------
# Pretty-print representatives
# -----------------------------
def print_reps(res: CoverResult, *, per_line: int = 12) -> None:
    print(f"\nH={res.H}  depth={res.depth}  height_cap={res.height_cap}  max_nodes={res.max_nodes}")
    print(f"reps_needed={len(res.reps)}  hit_node_cap={res.hit_node_cap}  stopped_reason={res.stopped_reason}")
    print("Representatives (heuristic orbit seeds):")
    for i, r in enumerate(res.reps, 1):
        end = "\n" if (i % per_line == 0) else "  "
        print(f"{point_str(r):>6}", end=end)
    if len(res.reps) % per_line != 0:
        print()

# -----------------------------
# Main
# -----------------------------
if __name__ == "__main__":
    # Adjust these parameters to push harder:
    DEPTH = 18
    HEIGHT_CAP_FACTOR = 2000
    MAX_NODES = 5_000_000

    # Choose H values to sample
    H_values = [10, 12, 15, 18, 20, 25, 30]

    gens = get_generators("Z1/2")
    for H in H_values:
        height_cap = H * HEIGHT_CAP_FACTOR
        reps, total = empirical_cover(
            H,
            gens,
            max_depth=DEPTH,
            height_cap=height_cap,
            max_nodes=MAX_NODES,
        )
        print(f"H={H}: {len(reps)} reps out of {total} points")