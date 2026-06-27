"""CLI-friendly search orchestration."""
from __future__ import annotations

from argparse import ArgumentParser
from pathlib import Path
from typing import List

from .core import SearchConfig, find_polygons, generate_vectors
from .db import connect, insert_solution, summary
from .examples import known_examples
from .orbit import default_seeds, orbit_vectors


def run_search(
    primes: List[int],
    sides: int,
    max_norm: int,
    coord_bound: int,
    max_vectors: int,
    max_solutions: int,
    method: str,
):
    config = SearchConfig(
        primes=tuple(sorted(set(primes))),
        polygon_sides=sides,
        max_norm=max_norm,
        coord_bound=coord_bound,
        max_vectors=max_vectors,
        max_solutions=max_solutions,
    )
    if method == "orbit":
        vectors = orbit_vectors(config, default_seeds(config.primes))
    elif method == "enumerate":
        vectors = generate_vectors(config)
    else:
        raise ValueError("method must be 'orbit' or 'enumerate'")
    sols = find_polygons(config, vectors)
    return vectors, sols


def main() -> None:
    parser = ArgumentParser(description="Search for right-angled polygon reflection groups in PGL_2(Z[S^-1]).")
    parser.add_argument("--primes", default="2,3", help="Comma-separated primes, e.g. 2,3")
    parser.add_argument("--sides", type=int, default=5)
    parser.add_argument("--max-norm", type=int, default=10000)
    parser.add_argument("--coord-bound", type=int, default=500)
    parser.add_argument("--max-vectors", type=int, default=100000)
    parser.add_argument("--max-solutions", type=int, default=10)
    parser.add_argument("--method", choices=["orbit", "enumerate"], default="orbit")
    parser.add_argument("--db", default="outputs/solutions.sqlite")
    parser.add_argument("--seed", action="store_true", help="Insert known examples before searching")
    args = parser.parse_args()

    primes = [int(x) for x in args.primes.split(",") if x.strip()]
    con = connect(args.db)
    if args.seed:
        for ex in known_examples():
            insert_solution(con, ex)

    vectors, sols = run_search(
        primes, args.sides, args.max_norm, args.coord_bound,
        args.max_vectors, args.max_solutions, args.method,
    )
    for sol in sols:
        insert_solution(con, sol)

    print(f"Generated {len(vectors)} vectors; found {len(sols)} solution(s).")
    for sol in sols:
        print(f"height={sol.height}, norms={sol.norms}, vectors={sol.vectors}")
    print("\nDatabase summary:")
    for row in summary(con):
        print(row)


if __name__ == "__main__":
    main()
