#!/usr/bin/env python3
"""Web frontend for the flashBeam search scripts.

Usage:
    python3 server.py [port]        # default port 8517

Then open http://localhost:8517 — pick a search, tweak its parameters,
hit Run, and watch the output stream in. Searches run as subprocesses
(python3 -u runner.py <script> [overrides]) so they can be stopped cleanly.
"""
import json
import os
import sqlite3
import subprocess
import sys
import threading
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

HERE = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(HERE, "outputs", "results.db")
DEFAULT_PORT = 8517

# Catalog of runnable searches. "params" holds the defaults each script uses
# in its own __main__ block, so an untouched form reproduces the script as-is.
SEARCHES = [
    {
        "file": "button.py",
        "title": "Button surface group — integral elements",
        "group": "SL₂(F₃(x,y))",
        "description": ("Genus-2 surface group from Button Thm 5.4. Hunts for "
                        "nontrivial words whose four matrix entries are all "
                        "polynomials. Pure-Python arithmetic — dependency-free "
                        "but slow."),
        "params": {"beam_width": 5000, "flash_size": 20,
                   "max_iterations": 200, "max_solutions": 3},
    },
    {
        "file": "buttonBeam.py",
        "title": "Button surface group — flint beam",
        "group": "SL₂(F₃(x,y))",
        "description": ("Same integral-element hunt as button.py, but a "
                        "classical beam search on python-flint nmod_poly "
                        "arithmetic with an AB/CD split beam. Much faster."),
        "params": {"beam_width": 50000,
                   "max_iterations": 300, "max_solutions": 3},
    },
    {
        "file": "benoist.py",
        "title": "Benoist relations",
        "group": "SL₂(ℤ[√2])",
        "description": ("Searches for words in M₁ = [[1+√2, −1],[1, 0]] and "
                        "M₂ = [[1−√2, −1],[1, 0]] that equal ±I."),
        "params": {"beam_width": 100000, "flash_size": 12,
                   "max_iterations": 600, "max_solutions": 5},
    },
    {
        "file": "longReidGroup.py",
        "title": "Long–Reid group (variable t)",
        "group": "GL₂",
        "description": ("⟨[[t,0],[0,1]], [[1+t²,2],[t,1]]⟩: hunts for words "
                        "of determinant ±1 after dividing out the primes of "
                        "p·q·(p−q) where t = p/q. Any rational t ≠ 0, 1 "
                        "(e.g. 9, 5/2); results are stored per t."),
        "params": {"t_param": 9, "beam_width": 5000, "flash_size": 50,
                   "max_iterations": 1000, "max_solutions": 10},
    },
    {
        "file": "lyndonUllman.py",
        "title": "Lyndon–Ullman relations (variable μ)",
        "group": "parabolic pair",
        "description": ("A = [[1,t],[0,1]], B = [[1,0],[t,1]] with μ = t "
                        "rational: hunts reduced words equal to ±I — a "
                        "relation proves ⟨A,B⟩ is NOT free at μ. Sanov: "
                        "|μ| ≥ 2 is free, so those are negative controls."),
        "params": {"t_param": 1, "beam_width": 3000, "flash_size": 10,
                   "max_iterations": 50, "max_solutions": 3},
    },
    {
        "file": "lyndonUllmanUpper.py",
        "title": "Lyndon–Ullman upper-triangular trick (variable μ)",
        "group": "parabolic pair",
        "description": ("Hunts words with bottom-left entry 0 (upper "
                        "triangular) that are not powers of a: each witness "
                        "w yields the relation (waw⁻¹)a(wa⁻¹w⁻¹)a⁻¹ = I, "
                        "proving ⟨A,B⟩ not free at μ = t. Witnesses are ~¼ "
                        "the length of direct relations, so this reaches "
                        "deeper. Scored by complexity of the (2,1) entry."),
        "params": {"t_param": 1, "beam_width": 3000, "flash_size": 10,
                   "max_iterations": 60, "max_solutions": 3},
    },
    {
        "file": "longReidSL3Z.py",
        "title": "Long–Reid SL₃(ℤ) relations",
        "group": "SL₃(ℤ)",
        "description": ("Searches for relations (words equal to I) among A, "
                        "B² and the matrix T; only words that actually use "
                        "T count as solutions."),
        "params": {"beam_width": 50000, "flash_size": 8,
                   "max_iterations": 500, "max_solutions": 5},
    },
    {
        "file": "SU2relations.py",
        "title": "SU(2) integer relations",
        "group": "SU(2)",
        "description": ("Relations between the scaled-integer SU(2) matrices "
                        "A (1/85 scale) and B (1/154 scale): words that "
                        "canonicalize to ±I, with the known commutator-square "
                        "suffixes pruned."),
        "params": {"beam_width": 5000, "flash_size": 100,
                   "max_iterations": 1000, "max_solutions": 1},
    },
    {
        "file": "PU2_Z65_search.py",
        "title": "PU(2) quaternion targets",
        "group": "Hurwitz quaternions",
        "description": ("Expresses target quaternions (1+2j, 1+2k, 1±2i±2j±2k, "
                        "…) as words in a = 1+2i and b = 3+2j, up to scalars. "
                        "Uses an angular score plus a local BFS near-hits."),
        "params": {"beam_width": 20000, "flash_size": 10,
                   "max_iterations": 1000, "max_solutions": 20},
    },
    {
        "file": "verify_new_relation.py",
        "title": "Verify: (baab)³ relation",
        "group": "check",
        "description": ("One-shot check that baabbaabbaab evaluates to ±I for "
                        "A = [[1+√2, −1],[1,0]], B = [[1−√2, −1],[1,0]]. "
                        "No parameters, runs instantly."),
        "params": {},
    },
]
KNOWN_FILES = {s["file"] for s in SEARCHES}

jobs = {}
jobs_lock = threading.Lock()


def _watch(job):
    proc = job["proc"]
    for line in proc.stdout:
        with jobs_lock:
            job["lines"].append(line.rstrip("\n"))
    proc.wait()
    with jobs_lock:
        job["returncode"] = proc.returncode
        job["ended"] = time.time()
        if job.get("stop_requested"):
            job["status"] = "stopped"
        elif proc.returncode == 0:
            job["status"] = "done"
        else:
            job["status"] = "error"


def start_job(script, params):
    cmd = [sys.executable, "-u", os.path.join(HERE, "runner.py"), script]
    for flag, key in (("--beam-width", "beam_width"),
                      ("--flash-size", "flash_size"),
                      ("--max-iterations", "max_iterations"),
                      ("--max-solutions", "max_solutions"),
                      ("--t-param", "t_param")):
        val = params.get(key)
        if val in (None, ""):
            continue
        # t_param may be rational ("5/2"); everything else is an integer
        cmd += [flag, str(val).strip() if key == "t_param" else str(int(val))]
    proc = subprocess.Popen(cmd, cwd=HERE, stdout=subprocess.PIPE,
                            stderr=subprocess.STDOUT, text=True, bufsize=1)
    job = {
        "id": uuid.uuid4().hex[:12], "script": script, "params": params,
        "proc": proc, "lines": [], "status": "running",
        "started": time.time(), "ended": None, "returncode": None,
    }
    with jobs_lock:
        jobs[job["id"]] = job
    threading.Thread(target=_watch, args=(job,), daemon=True).start()
    return job


def stop_job(job):
    with jobs_lock:
        already_requested = job.get("stop_requested", False)
        job["stop_requested"] = True
    if job["proc"].poll() is None:
        if already_requested:
            job["proc"].kill()
        else:
            job["proc"].terminate()
            # Escalate to SIGKILL if it ignores SIGTERM.
            def _kill_later(p=job["proc"]):
                if p.poll() is None:
                    p.kill()
            threading.Timer(5.0, _kill_later).start()


def query_results(script=None):
    if not os.path.exists(DB_PATH):
        return []
    conn = sqlite3.connect(DB_PATH, timeout=5)
    conn.row_factory = sqlite3.Row
    sql = ("SELECT id, found_at, script, variant, word, word_length, score, "
           "matrix, params, extra FROM solutions")
    args = ()
    if script:
        sql += " WHERE script = ?"
        args = (script,)
    sql += " ORDER BY found_at DESC, id DESC"
    try:
        rows = [dict(r) for r in conn.execute(sql, args)]
    finally:
        conn.close()
    return rows


def delete_result(result_id):
    if not os.path.exists(DB_PATH):
        return 0
    conn = sqlite3.connect(DB_PATH, timeout=5)
    try:
        cur = conn.execute("DELETE FROM solutions WHERE id = ?", (result_id,))
        conn.commit()
        return cur.rowcount
    finally:
        conn.close()


def job_summary(job):
    return {
        "id": job["id"], "script": job["script"], "status": job["status"],
        "started": job["started"], "ended": job["ended"],
        "returncode": job["returncode"], "params": job["params"],
        "nlines": len(job["lines"]),
    }


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def _json(self, obj, code=200):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        url = urlparse(self.path)
        parts = [p for p in url.path.split("/") if p]

        if url.path in ("/", "/index.html"):
            with open(os.path.join(HERE, "index.html"), "rb") as f:
                body = f.read()
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        if url.path == "/api/searches":
            self._json(SEARCHES)
            return

        if url.path == "/api/results":
            script = parse_qs(url.query).get("script", [None])[0]
            self._json(query_results(script))
            return

        if url.path == "/api/jobs":
            with jobs_lock:
                out = sorted((job_summary(j) for j in jobs.values()),
                             key=lambda s: s["started"], reverse=True)
            self._json(out)
            return

        if len(parts) == 3 and parts[:2] == ["api", "jobs"]:
            job = jobs.get(parts[2])
            if not job:
                self._json({"error": "no such job"}, 404)
                return
            offset = int(parse_qs(url.query).get("offset", ["0"])[0])
            with jobs_lock:
                lines = job["lines"][offset:]
                out = job_summary(job)
            out.update({"offset": offset, "lines": lines,
                        "next_offset": offset + len(lines)})
            self._json(out)
            return

        self._json({"error": "not found"}, 404)

    def do_POST(self):
        url = urlparse(self.path)
        parts = [p for p in url.path.split("/") if p]
        length = int(self.headers.get("Content-Length") or 0)
        try:
            payload = json.loads(self.rfile.read(length) or b"{}")
        except json.JSONDecodeError:
            self._json({"error": "bad json"}, 400)
            return

        if url.path == "/api/run":
            script = payload.get("script")
            if script not in KNOWN_FILES:
                self._json({"error": f"unknown script: {script}"}, 400)
                return
            try:
                job = start_job(script, payload.get("params") or {})
            except (ValueError, OSError) as e:
                self._json({"error": str(e)}, 400)
                return
            self._json(job_summary(job))
            return

        if len(parts) == 4 and parts[:2] == ["api", "results"] and parts[3] == "delete":
            try:
                n = delete_result(int(parts[2]))
            except ValueError:
                self._json({"error": "bad id"}, 400)
                return
            self._json({"deleted": n})
            return

        if len(parts) == 4 and parts[:2] == ["api", "jobs"] and parts[3] == "stop":
            job = jobs.get(parts[2])
            if not job:
                self._json({"error": "no such job"}, 404)
                return
            stop_job(job)
            self._json(job_summary(job))
            return

        self._json({"error": "not found"}, 404)


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_PORT
    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    print(f"flashBeam frontend: http://localhost:{port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        with jobs_lock:
            running = [j for j in jobs.values() if j["proc"].poll() is None]
        for j in running:
            j["proc"].terminate()


if __name__ == "__main__":
    main()
