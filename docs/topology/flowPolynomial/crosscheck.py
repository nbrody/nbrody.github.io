#!/usr/bin/env python3
"""Cross-check audition.js results: golden identity should hold iff planar.

Usage: python3 crosscheck.py results1.json [results2.json ...]
Uses networkx's left-right planarity test as the independent referee.
"""
import json
import sys

import networkx as nx

total = 0
mismatches = []
holds_planar = holds_nonplanar = fails_planar = fails_nonplanar = 0

for path in sys.argv[1:]:
    with open(path) as f:
        records = json.load(f)
    for rec in records:
        G = nx.MultiGraph()
        G.add_edges_from(rec["edges"])
        planar, _ = nx.check_planarity(G)
        total += 1
        if rec["holds"] and planar:
            holds_planar += 1
        elif rec["holds"] and not planar:
            holds_nonplanar += 1  # counterexample to Agol-Krushkal!
            mismatches.append((rec["n"], "IDENTITY HOLDS but NON-PLANAR", rec["edges"]))
        elif not rec["holds"] and planar:
            fails_planar += 1  # would contradict Tutte's theorem => bug
            mismatches.append((rec["n"], "identity fails but PLANAR (bug!)", rec["edges"]))
        else:
            fails_nonplanar += 1

print(f"checked {total} graphs")
print(f"  identity holds & planar      : {holds_planar}   (Tutte, as required)")
print(f"  identity fails & non-planar  : {fails_nonplanar}   (consistent with Agol-Krushkal)")
print(f"  identity holds & NON-planar  : {holds_nonplanar}   (Agol-Krushkal COUNTEREXAMPLES)")
print(f"  identity fails & planar      : {fails_planar}   (impossible unless we have a bug)")
if mismatches:
    print("\nMISMATCHES:")
    for n, kind, edges in mismatches:
        print(f"  n={n}: {kind}\n    {edges}")
    sys.exit(1)
print("\nPerfect correspondence: identity holds <=> planar, on every audited graph.")
