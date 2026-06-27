"""Verified known examples from the exploratory search conversation."""
from __future__ import annotations

from typing import List

from .core import PolygonSolution, make_solution


def known_examples() -> List[PolygonSolution]:
    examples = []

    examples.append(make_solution(
        [2, 3],
        [
            (-1, -1, 0),
            (-1, 1, 2),
            (-3, 1, -8),
            (0, -1, -8),
            (4, 1, -8),
        ],
        source="seed",
        notes="Small right-angled pentagon over Z[1/6].",
    ))

    examples.append(make_solution(
        [2, 5],
        [
            (1, 1, 0),
            (1, -2, -2),
            (2, -1, 3),
            (11, -12, 8),
            (4, -23, -8),
        ],
        source="seed",
        notes="Small right-angled pentagon over Z[1/10].",
    ))

    examples.append(make_solution(
        [3, 5],
        [
            (-10, -7, -5),
            (-2, 1, 5),
            (-1, 0, -4),
            (-2, 1, -1),
            (-1, 4, 0),
        ],
        source="seed",
        notes="Small right-angled pentagon over Z[1/15].",
    ))

    return examples


def legacy_hexagon_candidate():
    """The previously discussed Z[1/2] hexagon candidate.

    The validator intentionally does not seed this as a success: with the listed
    order, B(v5,v6)=-141, so the last adjacent right-angle relation fails.  It is
    kept here so experiments can compare against or repair it.
    """
    return [
        (1, 0, 0),
        (0, -1, -1),
        (-3, -1, 1),
        (-6, -35, 1),
        (-13, -51, 3),
        (0, -64, -1),
    ]
