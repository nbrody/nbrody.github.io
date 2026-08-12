#!/usr/bin/env python3
"""Run a flashBeam search script, optionally overriding its search parameters.

Used by server.py, but also handy standalone:

    python3 runner.py benoist.py --beam-width 20000 --max-iterations 50

Overrides work by patching FlashBeam.__init__ before the script runs, so they
apply no matter where the script hard-codes its configuration. buttonBeam.py
(which does not use the FlashBeam class) is special-cased.

Every solution a search finds is also saved to outputs/results.db (SQLite),
deduplicated on (script, word). The hook lives in the patched FlashBeam:
solve() appends a solution exactly when is_solution() and then is_nontrivial()
both pass, so wrapping the problem's is_nontrivial records solutions the
moment they are found — surviving a later Stop or crash.
"""
import argparse
import json
import os
import re
import runpy
import sqlite3
import sys
from datetime import datetime

HERE = os.path.dirname(os.path.abspath(__file__))
OUTPUTS = os.path.join(HERE, "outputs")
DB_PATH = os.path.join(OUTPUTS, "results.db")

SCHEMA = """
CREATE TABLE IF NOT EXISTS solutions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    found_at    TEXT NOT NULL,
    script      TEXT NOT NULL,
    variant     TEXT NOT NULL DEFAULT '',
    word        TEXT NOT NULL,
    word_length INTEGER,
    score       REAL,
    matrix      TEXT,
    params      TEXT,
    extra       TEXT,
    UNIQUE(script, variant, word)
)
"""


class Recorder:
    """Appends found solutions to outputs/results.db."""

    def __init__(self, script, params, variant=""):
        self.script = script
        self.variant = variant
        self.params = json.dumps(params, sort_keys=True)
        os.makedirs(OUTPUTS, exist_ok=True)
        self.conn = sqlite3.connect(DB_PATH, timeout=15)
        self.conn.execute(SCHEMA)
        cols = {r[1] for r in self.conn.execute("PRAGMA table_info(solutions)")}
        if "variant" not in cols:
            # migrate a pre-variant table in place
            self.conn.executescript(
                "ALTER TABLE solutions RENAME TO solutions_old;\n"
                + SCHEMA + ";\n"
                "INSERT INTO solutions (found_at, script, variant, word, "
                "word_length, score, matrix, params, extra) "
                "SELECT found_at, script, '', word, word_length, score, "
                "matrix, params, extra FROM solutions_old;\n"
                "DROP TABLE solutions_old;")
        self.conn.commit()

    def save(self, word, matrix, score=None, extra=None):
        word = (word or "").strip()
        if not word:
            return
        tokens = [t for t in re.split(r"[ .]+", word) if t]
        cur = self.conn.execute(
            "INSERT OR IGNORE INTO solutions "
            "(found_at, script, variant, word, word_length, score, matrix, params, extra) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (datetime.now().astimezone().isoformat(timespec="seconds"),
             self.script, self.variant, word, len(tokens), score, matrix,
             self.params, extra))
        self.conn.commit()
        if cur.rowcount:
            print(f"[outputs] saved solution ({len(tokens)} letters): {word}",
                  flush=True)


def _install_recording(problem, rec):
    orig_nontrivial = problem.is_nontrivial

    def recording_is_nontrivial(node):
        ok = orig_nontrivial(node)
        if ok:
            try:
                matrix = problem.format_state(node)
            except Exception:
                matrix = str(node.state)
            rec.save(node.identifier, matrix, getattr(node, "score", None))
        return ok

    problem.is_nontrivial = recording_is_nontrivial


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("script")
    ap.add_argument("--beam-width", type=int)
    ap.add_argument("--flash-size", type=int)
    ap.add_argument("--max-iterations", type=int)
    ap.add_argument("--max-solutions", type=int)
    ap.add_argument("--t-param",
                    help="group parameter t (longReidGroup.py): integer or "
                         "rational like 5/2 or 2.5, passed via the "
                         "FLASHBEAM_T_PARAM environment variable")
    args = ap.parse_args()

    script_name = os.path.basename(args.script)
    script_path = os.path.join(HERE, script_name)
    if not os.path.isfile(script_path):
        sys.exit(f"unknown script: {args.script}")

    overrides = {k: v for k, v in {
        "beam_width": args.beam_width,
        "flash_size": args.flash_size,
        "max_iterations": args.max_iterations,
        "max_solutions": args.max_solutions,
    }.items() if v is not None}

    os.chdir(HERE)
    if HERE not in sys.path:
        sys.path.insert(0, HERE)

    variant = ""
    record_params = dict(overrides)
    if args.t_param is not None:
        from fractions import Fraction
        try:
            tstr = str(Fraction(args.t_param))  # normalize "2.5", "10/4"
        except (ValueError, ZeroDivisionError):
            # algebraic spec ("sqrt(2)", "(1+sqrt(5))/2", "x^3+x^2-2x-1");
            # the target script validates it
            tstr = args.t_param.strip()
        os.environ["FLASHBEAM_T_PARAM"] = tstr
        record_params["t_param"] = tstr
        variant = f"t={tstr}"

    rec = Recorder(script_name, record_params, variant)

    if script_name == "buttonBeam.py":
        run_button_beam(overrides, rec)
        return

    import flashbeam
    orig_init = flashbeam.FlashBeam.__init__
    problems = []

    def patched_init(self, *pos, **kw):
        names = ["problem", "beam_width", "flash_size",
                 "max_iterations", "max_solutions"]
        kw.update(dict(zip(names, pos)))
        kw.update(overrides)
        _install_recording(kw["problem"], rec)
        problems.append(kw["problem"])
        orig_init(self, **kw)

    flashbeam.FlashBeam.__init__ = patched_init

    runpy.run_path(script_path, run_name="__main__")

    # PU2-style problems keep a found_targets dict whose words can differ from
    # the triggering node (local BFS refinement) — save those too.
    for problem in problems:
        for target, word in getattr(problem, "found_targets", {}).items():
            rec.save(word, target, extra="target")


def run_button_beam(overrides, rec):
    """buttonBeam.py hard-codes its parameters in __main__, so replicate it."""
    import buttonBeam
    buttonBeam.verify()
    print()
    results = buttonBeam.beam_search(
        beam_width=overrides.get("beam_width", 50000),
        max_iters=overrides.get("max_iterations", 300),
        max_solutions=overrides.get("max_solutions", 3),
    )
    if results:
        print(f"\nFound {len(results)} integral element(s):")
        for word, mat in results:
            matrix = f"[{mat.a},  {mat.b}]\n[{mat.c},  {mat.d}]"
            rec.save(" ".join(word), matrix)
            print(f"\n  Word (length {len(word)}): {' '.join(word)}")
            print(f"  [{mat.a},  {mat.b}]")
            print(f"  [{mat.c},  {mat.d}]")
    else:
        print("\nNo integral elements found.")


if __name__ == "__main__":
    main()
