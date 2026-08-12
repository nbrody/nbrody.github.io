#!/usr/bin/env python3
"""Todd--Coxeter experiments for Rattaggi's Gamma_{5,13}.

The presentation is reconstructed from quaternion multiplication.  The
default ``validation`` run should close with index 96.  A power run that
does not close before ``--max-cosets`` is inconclusive: it does not prove
that the subgroup has infinite index.
"""

from __future__ import annotations

import argparse
from collections.abc import Iterable

from sympy.combinatorics.fp_groups import FpGroup
from sympy.combinatorics.free_groups import FreeGroupElement, free_group

Quaternion = tuple[int, int, int, int]
Letter = tuple[str, int, int]


def qmul(u: Quaternion, v: Quaternion) -> Quaternion:
    a, b, c, d = u
    e, f, g, h = v
    return (
        a * e - b * f - c * g - d * h,
        a * f + b * e + c * h - d * g,
        a * g - b * h + c * e + d * f,
        a * h + b * g - c * f + d * e,
    )


def qbar(u: Quaternion) -> Quaternion:
    a, b, c, d = u
    return (a, -b, -c, -d)


def qneg(u: Quaternion) -> Quaternion:
    return tuple(-coordinate for coordinate in u)  # type: ignore[return-value]


def signed_letters(
    quaternions: Iterable[Quaternion],
) -> list[tuple[int, int, Quaternion]]:
    result = []
    for index, quaternion in enumerate(quaternions):
        result.append((index, 1, quaternion))
        result.append((index, -1, qbar(quaternion)))
    return result


def canonical_square(word: tuple[Letter, ...]) -> tuple[Letter, ...]:
    variants = []
    for shift in range(4):
        variants.append(word[shift:] + word[:shift])
    inverse = tuple(
        (kind, index, -exponent)
        for kind, index, exponent in reversed(word)
    )
    for shift in range(4):
        variants.append(inverse[shift:] + inverse[:shift])
    return min(variants)


def square_relations() -> list[tuple[Letter, ...]]:
    horizontal: list[Quaternion] = [
        (1, 2, 0, 0),
        (1, 0, 2, 0),
        (1, 0, 0, 2),
    ]
    vertical: list[Quaternion] = [
        (3, 2, 0, 0),
        (3, 0, 2, 0),
        (3, 0, 0, 2),
        (1, 2, 2, 2),
        (1, 2, 2, -2),
        (1, 2, -2, 2),
        (1, 2, -2, -2),
    ]
    signed_horizontal = signed_letters(horizontal)
    signed_vertical = signed_letters(vertical)
    relations: dict[tuple[Letter, ...], tuple[Letter, ...]] = {}

    for i, epsilon_a, quaternion_a in signed_horizontal:
        for j, epsilon_b, quaternion_b in signed_vertical:
            target = qmul(quaternion_a, quaternion_b)
            matches = []
            for ell, epsilon_d, quaternion_d in signed_vertical:
                for k, epsilon_c, quaternion_c in signed_horizontal:
                    candidate = qmul(quaternion_d, quaternion_c)
                    if candidate == target or qneg(candidate) == target:
                        matches.append((ell, epsilon_d, k, epsilon_c))
            if len(matches) != 1:
                raise RuntimeError(
                    f"Expected one VH factorization, found {len(matches)}"
                )
            ell, epsilon_d, k, epsilon_c = matches[0]
            word = (
                ("a", i, epsilon_a),
                ("b", j, epsilon_b),
                ("a", k, -epsilon_c),
                ("b", ell, -epsilon_d),
            )
            relations[canonical_square(word)] = word

    if len(relations) != 21:
        raise RuntimeError(f"Expected 21 square relations, found {len(relations)}")
    return list(relations.values())


def presentation() -> tuple[
    FpGroup,
    list[FreeGroupElement],
    list[FreeGroupElement],
]:
    free, a1, a2, a3, b1, b2, b3, b4, b5, b6, b7 = free_group(
        "a1,a2,a3,b1,b2,b3,b4,b5,b6,b7"
    )
    horizontal = [a1, a2, a3]
    vertical = [b1, b2, b3, b4, b5, b6, b7]
    relators = []
    for word in square_relations():
        relator = free.identity
        for kind, index, exponent in word:
            generator = horizontal[index] if kind == "a" else vertical[index]
            relator *= generator**exponent
        relators.append(relator)
    return FpGroup(free, relators), horizontal, vertical


def enumerate_subgroup(
    group: FpGroup,
    generators: list[FreeGroupElement],
    *,
    name: str,
    strategy: str,
    max_cosets: int,
) -> None:
    print(f"{name}: starting (strategy={strategy}, max_cosets={max_cosets})")
    table = group.coset_enumeration(
        generators,
        strategy=strategy,
        max_cosets=max_cosets,
        incomplete=True,
    )
    if table.is_complete():
        table.compress()
        print(f"{name}: complete, index={len(table.table)}")
    else:
        print(
            f"{name}: incomplete after {len(table.table)} allocated "
            f"coset rows; no index conclusion"
        )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--test",
        choices=("validation", "symmetric", "power", "all"),
        default="validation",
        help=(
            "validation=<a1,b2>, symmetric=<a3,b1>, "
            "power=<a3^M,b1^M>"
        ),
    )
    parser.add_argument(
        "--power",
        type=int,
        default=2,
        help="M in the power-subgroup test (default: 2)",
    )
    parser.add_argument(
        "--strategy",
        choices=("relator_based", "coset_table_based"),
        default="relator_based",
    )
    parser.add_argument("--max-cosets", type=int, default=200_000)
    args = parser.parse_args()
    if args.power < 1:
        parser.error("--power must be positive")
    if args.max_cosets < 1:
        parser.error("--max-cosets must be positive")
    return args


def main() -> None:
    args = parse_args()
    group, horizontal, vertical = presentation()
    print("constructed Gamma_{5,13} with 10 generators and 21 square relations")

    tests: list[tuple[str, list[FreeGroupElement]]] = []
    if args.test in ("validation", "all"):
        tests.append(("published validation pair <a1,b2>", [horizontal[0], vertical[1]]))
    if args.test in ("symmetric", "all"):
        tests.append(("5-13 pair <a3,b1>", [horizontal[2], vertical[0]]))
    if args.test in ("power", "all"):
        tests.append(
            (
                f"power pair <a3^{args.power},b1^{args.power}>",
                [horizontal[2] ** args.power, vertical[0] ** args.power],
            )
        )

    for name, generators in tests:
        enumerate_subgroup(
            group,
            generators,
            name=name,
            strategy=args.strategy,
            max_cosets=args.max_cosets,
        )


if __name__ == "__main__":
    main()
