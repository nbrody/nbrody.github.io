#!/usr/bin/env python3
"""Benchmark FlashBeam configurations on the Long-Reid search.

Runs a matrix of (t, beam_width, flash_size) configurations through the local
server (which must already be running: python3 server.py), measures
time-to-first-solution under a fixed wall-clock budget, and prints a summary.

flash_size 0 = standard beam search (expansion pool is just the generators).
Standard beam grows words one letter per iteration while flash mode grows
them multiplicatively, so iteration caps are set high enough that the time
budget, not the iteration count, is the binding constraint for both.

Results are also written to outputs/benchmark_results.json.
"""
import json
import os
import time
import urllib.request

BASE = "http://localhost:8517"
HERE = os.path.dirname(os.path.abspath(__file__))
OUT_JSON = os.path.join(HERE, "outputs", "benchmark_results.json")

TIME_BUDGET_S = 120          # per-run wall clock
ITER_CAP_FLASH = 60
ITER_CAP_STANDARD = 400      # standard beam needs ~1 iteration per letter

T_VALUES = ["5", "8", "9", "13", "5/3"]
PHASE1_BEAM = 3000
PHASE1_FLASH = [0, 5, 20, 50, 100]
PHASE2_BEAMS = [1000, 8000]
PHASE2_FLASH = [0, 20]


def api(path, payload=None):
    url = BASE + path
    if payload is None:
        req = urllib.request.Request(url)
    else:
        req = urllib.request.Request(
            url, data=json.dumps(payload).encode(),
            headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())


def run_one(t, beam, flash, budget=TIME_BUDGET_S):
    iters_cap = ITER_CAP_STANDARD if flash == 0 else ITER_CAP_FLASH
    job = api("/api/run", {"script": "longReidGroup.py", "params": {
        "t_param": t, "beam_width": beam, "flash_size": flash,
        "max_iterations": iters_cap, "max_solutions": 1}})
    jid = job["id"]
    start = time.time()
    stopped = False
    while True:
        j = api(f"/api/jobs/{jid}?offset=0")
        if j["status"] != "running":
            break
        if time.time() - start > budget and not stopped:
            api(f"/api/jobs/{jid}/stop", {})
            stopped = True
        time.sleep(2)

    lines = j["lines"]
    # "SOLUTION FOUND (Length N)" comes from the solver itself and prints for
    # every solution; "[outputs] saved" only prints for NEW database rows, so
    # it undercounts when a run rediscovers an already-recorded word.
    lens = [int(l.split("Length")[1].strip(" )")) for l in lines
            if l.startswith("SOLUTION FOUND")]
    lens += [int(l.split("(")[1].split()[0]) for l in lines
             if l.startswith("[outputs] saved solution")]
    iters = sum(1 for l in lines if l.startswith("Iter ") and "Complete" in l)
    visited = 0
    for l in lines:
        if "Total Visited" in l:
            try:
                visited = int(l.split("Total Visited")[1].split("|")[0].strip())
            except ValueError:
                pass
    elapsed = (j["ended"] or time.time()) - j["started"]
    solved = bool(lens)
    return {"t": t, "beam": beam, "flash": flash,
            "solved": solved, "status": j["status"],
            "time": round(elapsed, 1),
            "minlen": min(lens) if lens else None,
            "iters": iters, "visited": visited}


def sweep(configs, results, budget=TIME_BUDGET_S):
    for t, beam, flash in configs:
        r = run_one(t, beam, flash, budget)
        results.append(r)
        tag = f"len={r['minlen']}" if r["solved"] else "NO SOLUTION"
        print(f"  t={t:>4} beam={beam:>5} flash={flash:>3} -> "
              f"{'ok ' if r['solved'] else '---'} {r['time']:>6.1f}s  {tag}  "
              f"(iters {r['iters']}, visited {r['visited']})", flush=True)


def main():
    results = []

    print(f"Phase 1: flash sweep at beam {PHASE1_BEAM} "
          f"(budget {TIME_BUDGET_S}s/run)", flush=True)
    sweep([(t, PHASE1_BEAM, f) for t in T_VALUES for f in PHASE1_FLASH],
          results)

    print("\nPhase 2: beam sweep", flush=True)
    sweep([(t, b, f) for t in T_VALUES for b in PHASE2_BEAMS
           for f in PHASE2_FLASH], results)

    # Phase 3: flagship attempt on unsolved t=14 with the best flash setting
    by_flash = {}
    for r in results:
        by_flash.setdefault(r["flash"], []).append(r)
    def score(rs):
        solved = [r for r in rs if r["solved"]]
        times = sorted(r["time"] for r in solved)
        med = times[len(times) // 2] if times else float("inf")
        return (-len(solved), med)
    best_flash = min(by_flash, key=lambda f: score(by_flash[f]))
    print(f"\nPhase 3: t=14 at beam 20000, flash {best_flash} vs standard "
          f"(budget 480s)", flush=True)
    sweep([("14", 20000, best_flash), ("14", 20000, 0)], results, budget=480)

    with open(OUT_JSON, "w") as f:
        json.dump(results, f, indent=1)
    print(f"\nwrote {OUT_JSON}")

    # summary: per t, best config
    print("\nBest config per t (fastest solve):")
    for t in T_VALUES + ["14"]:
        rs = [r for r in results if r["t"] == t and r["solved"]]
        if not rs:
            print(f"  t={t:>4}: unsolved in all configs")
            continue
        b = min(rs, key=lambda r: r["time"])
        print(f"  t={t:>4}: beam {b['beam']}, flash {b['flash']} "
              f"-> {b['time']}s, len {b['minlen']}")


if __name__ == "__main__":
    main()
