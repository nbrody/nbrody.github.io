"""SQLite database for storing successful right-angled polygon searches."""
from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from typing import Iterable, List, Optional, Sequence

from .core import PolygonSolution, verify_solution_data

SCHEMA = """
CREATE TABLE IF NOT EXISTS solutions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    primes TEXT NOT NULL,
    polygon_sides INTEGER NOT NULL,
    height INTEGER NOT NULL,
    norm_product TEXT NOT NULL,
    source TEXT NOT NULL,
    notes TEXT,
    data TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(primes, polygon_sides, data)
);
CREATE INDEX IF NOT EXISTS idx_solutions_lookup
ON solutions(primes, polygon_sides, height);
"""


def connect(path: str | Path) -> sqlite3.Connection:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(path)
    con.executescript(SCHEMA)
    return con


def primes_key(primes: Sequence[int]) -> str:
    return ",".join(map(str, sorted(set(primes))))


def insert_solution(con: sqlite3.Connection, sol: PolygonSolution) -> bool:
    data = sol.to_dict()
    if not verify_solution_data(data):
        raise ValueError("Refusing to insert invalid solution")
    try:
        con.execute(
            """INSERT INTO solutions
            (primes, polygon_sides, height, norm_product, source, notes, data)
            VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (
                primes_key(sol.primes),
                sol.polygon_sides,
                sol.height,
                str(sol.norm_product),
                sol.source,
                sol.notes,
                json.dumps(data, sort_keys=True),
            ),
        )
        con.commit()
        return True
    except sqlite3.IntegrityError:
        # A failed INSERT leaves the deferred transaction open; roll back so
        # later writers on this connection are not blocked.
        con.rollback()
        return False


def list_solutions(
    con: sqlite3.Connection,
    primes: Optional[Sequence[int]] = None,
    polygon_sides: Optional[int] = None,
    limit: int = 100,
) -> List[dict]:
    where = []
    params = []
    if primes is not None:
        where.append("primes=?")
        params.append(primes_key(primes))
    if polygon_sides is not None:
        where.append("polygon_sides=?")
        params.append(int(polygon_sides))
    sql = "SELECT id, primes, polygon_sides, height, norm_product, source, notes, data, created_at FROM solutions"
    if where:
        sql += " WHERE " + " AND ".join(where)
    sql += " ORDER BY polygon_sides, height, CAST(norm_product AS INTEGER) LIMIT ?"
    params.append(int(limit))
    rows = con.execute(sql, params).fetchall()
    out = []
    for row in rows:
        out.append({
            "id": row[0],
            "primes": row[1],
            "polygon_sides": row[2],
            "height": row[3],
            "norm_product": row[4],
            "source": row[5],
            "notes": row[6] or "",
            "data": json.loads(row[7]),
            "created_at": row[8],
        })
    return out


def summary(con: sqlite3.Connection) -> List[dict]:
    rows = con.execute(
        """SELECT primes, polygon_sides, COUNT(*), MIN(height), MAX(height)
           FROM solutions
           GROUP BY primes, polygon_sides
           ORDER BY polygon_sides, primes"""
    ).fetchall()
    return [
        {"primes": r[0], "polygon_sides": r[1], "count": r[2], "min_height": r[3], "max_height": r[4]}
        for r in rows
    ]
