"""
Run all three searches and save results for the visualization.
"""

import json
import time
import os

# Set working directory to script location
os.chdir(os.path.dirname(os.path.abspath(__file__)))

from randomSearch import random_search, mobius_fixed_point, half_plane_to_disk, mat_score
from beamSearch import beam_search
from flashBeamSearch import flash_beam_search

def collect_elements(visited):
    """Convert visited dict to visualization-friendly list."""
    elements = []
    for uid, (m, w, s) in visited.items():
        fp = mobius_fixed_point(m)
        dx, dy = half_plane_to_disk(fp)
        elements.append({
            'word': w,
            'score': s,
            'x': dx,
            'y': dy,
            'matrix': [int(x) for x in m.entries()]
        })
    return elements


def run_all():
    all_results = {}

    print("=" * 70)
    print("  Search Comparison: Random vs Beam vs FlashBeam")
    print("  Group: PGL_2(Z[1/6]) with Long-Reid generators")
    print("=" * 70)

    # --- Random Search ---
    print("\n" + "─" * 40)
    print("  1. RANDOM SEARCH")
    print("─" * 40)
    t0 = time.time()
    random_sols, random_visited = random_search()
    random_time = time.time() - t0
    all_results['random'] = {
        'method': 'random',
        'elapsed': random_time,
        'total_visited': len(random_visited),
        'solutions': random_sols,
        'elements': collect_elements(random_visited)
    }
    print(f"  → {len(random_sols)} solutions in {random_time:.1f}s ({len(random_visited)} elements)\n")

    # --- Beam Search ---
    print("─" * 40)
    print("  2. BEAM SEARCH")
    print("─" * 40)
    t0 = time.time()
    beam_sols, beam_visited = beam_search()
    beam_time = time.time() - t0
    all_results['beam'] = {
        'method': 'beam',
        'elapsed': beam_time,
        'total_visited': len(beam_visited),
        'solutions': beam_sols,
        'elements': collect_elements(beam_visited)
    }
    print(f"  → {len(beam_sols)} solutions in {beam_time:.1f}s ({len(beam_visited)} elements)\n")

    # --- FlashBeam Search ---
    print("─" * 40)
    print("  3. FLASHBEAM SEARCH")
    print("─" * 40)
    t0 = time.time()
    flash_sols, flash_visited = flash_beam_search()
    flash_time = time.time() - t0
    all_results['flashbeam'] = {
        'method': 'flashbeam',
        'elapsed': flash_time,
        'total_visited': len(flash_visited),
        'solutions': flash_sols,
        'elements': collect_elements(flash_visited)
    }
    print(f"  → {len(flash_sols)} solutions in {flash_time:.1f}s ({len(flash_visited)} elements)\n")

    # --- Save combined results ---
    output_file = 'comparison_results.json'
    with open(output_file, 'w') as f:
        json.dump(all_results, f)
    print(f"\nAll results saved to {output_file}")

    # --- Summary ---
    print("\n" + "=" * 70)
    print("  SUMMARY")
    print("=" * 70)
    for name in ['random', 'beam', 'flashbeam']:
        r = all_results[name]
        print(f"  {name:12s}: {len(r['solutions']):3d} solutions | {r['total_visited']:8d} visited | {r['elapsed']:.1f}s")
    print("=" * 70)


if __name__ == '__main__':
    run_all()
