#!/usr/bin/env python3
"""
Generate a graphic showing rational numbers grouped by the first generator
applied in their solution path for the Triangle group.
"""
import sys
import os

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import finiteOrbits
from finiteOrbits import Z, Point, Mat, INF, ZERO, normalize, height_int, point_str, mobius
from collections import defaultdict
from typing import Dict, List, Set, Tuple, Optional

def find_first_generator_paths(
    H: int,
    gens: List[Tuple[str, Mat]],
    target_reps: Set[Point],
    max_depth: int = 30,
    height_cap: int = 10000,
    beam_width: int = 5000,
) -> Dict[str, List[str]]:
    """
    For all rational numbers with height <= H, find the path to the target_reps
    and record the first generator used.
    
    Returns: Dict mapping generator name -> list of rational number strings
    """
    pts = finiteOrbits.ordered_points(H)
    
    # Group by first generator
    first_gen_map: Dict[str, List[str]] = defaultdict(list)
    already_at_target: List[str] = []
    no_path_found: List[str] = []
    
    print(f"Computing paths for {len(pts)} points with height <= {H}...")
    
    for i, pt in enumerate(pts):
        if (i + 1) % 50 == 0:
            print(f"  Processed {i + 1}/{len(pts)} points...")
        
        # If pt is already in target_reps, it goes to "already_at_target"
        if pt in target_reps:
            already_at_target.append(point_str(pt))
            continue
        
        # Find path to target_reps
        path = finiteOrbits.find_path_to_reps(
            pt,
            target_reps,
            gens,
            max_depth=max_depth,
            height_cap=height_cap,
            beam_width=beam_width,
        )
        
        if path is None or len(path) == 0:
            no_path_found.append(point_str(pt))
        else:
            # path is list of (start_pt, generator_name, end_pt)
            first_gen = path[0][1]  # The generator name
            first_gen_map[first_gen].append(point_str(pt))
    
    # Add special categories
    if already_at_target:
        first_gen_map["(Already at Target)"] = already_at_target
    if no_path_found:
        first_gen_map["(No Path Found)"] = no_path_found
    
    return first_gen_map


def generate_html_graphic(
    first_gen_map: Dict[str, List[str]],
    H: int,
    output_path: str
):
    """
    Generate an HTML file showing the graphic.
    """
    # Define colors for each generator
    colors = {
        "S": "#4FC3F7",   # Light blue
        "S'": "#29B6F6",  # Darker blue
        "A": "#81C784",   # Light green
        "A'": "#66BB6A",  # Darker green
        "B": "#FFB74D",   # Light orange
        "B'": "#FFA726",  # Darker orange
        "(Already at Target)": "#CE93D8",  # Purple
        "(No Path Found)": "#EF5350",       # Red
    }
    
    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Triangle Group - First Generator Analysis</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
    <style>
        * {{
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }}
        
        body {{
            font-family: 'Inter', sans-serif;
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
            min-height: 100vh;
            padding: 2rem;
            color: #e0e0e0;
        }}
        
        .container {{
            max-width: 1400px;
            margin: 0 auto;
        }}
        
        h1 {{
            text-align: center;
            font-size: 2.5rem;
            font-weight: 700;
            margin-bottom: 0.5rem;
            background: linear-gradient(90deg, #4FC3F7, #81C784, #FFB74D);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
        }}
        
        .subtitle {{
            text-align: center;
            font-size: 1.1rem;
            color: #9e9e9e;
            margin-bottom: 2rem;
        }}
        
        .generators-info {{
            background: rgba(255, 255, 255, 0.05);
            backdrop-filter: blur(10px);
            border-radius: 16px;
            padding: 1.5rem;
            margin-bottom: 2rem;
            border: 1px solid rgba(255, 255, 255, 0.1);
        }}
        
        .generators-info h2 {{
            font-size: 1.3rem;
            margin-bottom: 1rem;
            color: #fff;
        }}
        
        .matrix-row {{
            display: flex;
            gap: 2rem;
            flex-wrap: wrap;
            justify-content: center;
        }}
        
        .matrix-item {{
            text-align: center;
        }}
        
        .matrix-name {{
            font-weight: 600;
            font-size: 1.2rem;
            margin-bottom: 0.5rem;
        }}
        
        .matrix {{
            font-family: monospace;
            font-size: 1rem;
            background: rgba(0, 0, 0, 0.3);
            padding: 0.5rem 1rem;
            border-radius: 8px;
        }}
        
        .generator-sections {{
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 1.5rem;
        }}
        
        .generator-card {{
            background: rgba(255, 255, 255, 0.05);
            backdrop-filter: blur(10px);
            border-radius: 16px;
            padding: 1.5rem;
            border: 1px solid rgba(255, 255, 255, 0.1);
            transition: transform 0.3s ease, box-shadow 0.3s ease;
        }}
        
        .generator-card:hover {{
            transform: translateY(-5px);
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
        }}
        
        .generator-header {{
            display: flex;
            align-items: center;
            gap: 1rem;
            margin-bottom: 1rem;
        }}
        
        .generator-badge {{
            width: 50px;
            height: 50px;
            border-radius: 12px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 1.4rem;
            font-weight: 700;
            color: #1a1a2e;
        }}
        
        .generator-title {{
            font-size: 1.2rem;
            font-weight: 600;
        }}
        
        .generator-count {{
            font-size: 0.9rem;
            color: #9e9e9e;
        }}
        
        .rational-list {{
            display: flex;
            flex-wrap: wrap;
            gap: 0.5rem;
        }}
        
        .rational-tag {{
            background: rgba(255, 255, 255, 0.1);
            padding: 0.3rem 0.6rem;
            border-radius: 6px;
            font-size: 0.85rem;
            font-family: monospace;
            transition: background 0.2s ease;
        }}
        
        .rational-tag:hover {{
            background: rgba(255, 255, 255, 0.2);
        }}
        
        .summary {{
            margin-top: 2rem;
            background: rgba(255, 255, 255, 0.05);
            backdrop-filter: blur(10px);
            border-radius: 16px;
            padding: 1.5rem;
            border: 1px solid rgba(255, 255, 255, 0.1);
        }}
        
        .summary h2 {{
            font-size: 1.3rem;
            margin-bottom: 1rem;
            color: #fff;
        }}
        
        .stats-grid {{
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
            gap: 1rem;
        }}
        
        .stat-item {{
            text-align: center;
            padding: 1rem;
            background: rgba(0, 0, 0, 0.2);
            border-radius: 12px;
        }}
        
        .stat-value {{
            font-size: 2rem;
            font-weight: 700;
            color: #4FC3F7;
        }}
        
        .stat-label {{
            font-size: 0.9rem;
            color: #9e9e9e;
            margin-top: 0.3rem;
        }}
    </style>
</head>
<body>
    <div class="container">
        <h1>Triangle Group Generator Analysis</h1>
        <p class="subtitle">Rational numbers with height ≤ {H}, grouped by first generator in path to ∞</p>
        
        <div class="generators-info">
            <h2>Triangle Group Generators</h2>
            <div class="matrix-row">
                <div class="matrix-item">
                    <div class="matrix-name" style="color: {colors['S']}">S</div>
                    <div class="matrix">[0, -1]<br>[1, &nbsp;0]</div>
                </div>
                <div class="matrix-item">
                    <div class="matrix-name" style="color: {colors['A']}">A</div>
                    <div class="matrix">[2, 0]<br>[0, 1]</div>
                </div>
                <div class="matrix-item">
                    <div class="matrix-name" style="color: {colors['B']}">B</div>
                    <div class="matrix">[1, 2]<br>[2, 5]</div>
                </div>
            </div>
        </div>
        
        <div class="generator-sections">
"""
    
    # Sort generators: S, A, B first, then inverses, then special categories
    gen_order = ["S", "A", "B", "S'", "A'", "B'", "(Already at Target)", "(No Path Found)"]
    sorted_gens = sorted(first_gen_map.keys(), key=lambda g: gen_order.index(g) if g in gen_order else 100)
    
    total_points = sum(len(v) for v in first_gen_map.values())
    
    for gen in sorted_gens:
        rationals = first_gen_map[gen]
        if not rationals:
            continue
            
        color = colors.get(gen, "#9e9e9e")
        
        html += f"""
            <div class="generator-card">
                <div class="generator-header">
                    <div class="generator-badge" style="background: {color};">{gen}</div>
                    <div>
                        <div class="generator-title">First Move: {gen}</div>
                        <div class="generator-count">{len(rationals)} rational numbers</div>
                    </div>
                </div>
                <div class="rational-list">
"""
        for r in rationals:
            html += f'                    <span class="rational-tag">{r}</span>\n'
        
        html += """                </div>
            </div>
"""
    
    html += f"""
        </div>
        
        <div class="summary">
            <h2>Summary Statistics</h2>
            <div class="stats-grid">
                <div class="stat-item">
                    <div class="stat-value">{total_points}</div>
                    <div class="stat-label">Total Points</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">{H}</div>
                    <div class="stat-label">Height Bound</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">{len([g for g in first_gen_map if not g.startswith("(")])}</div>
                    <div class="stat-label">Generators Used</div>
                </div>
            </div>
        </div>
    </div>
</body>
</html>
"""
    
    with open(output_path, 'w') as f:
        f.write(html)
    
    print(f"\nGraphic saved to: {output_path}")


def main():
    # Get Triangle group generators
    gens = finiteOrbits.get_generators("Triangle")
    
    # Use height bound H
    H = 10  # Adjust as needed
    
    # Target: infinity (the simplest representative)
    target_reps = {INF}
    
    print("=" * 60)
    print("Triangle Group First Generator Analysis")
    print("=" * 60)
    print(f"\nGenerators:")
    for name, M in gens:
        a, b, c, d = M
        print(f"  {name}: [[{a}, {b}], [{c}, {d}]]")
    
    print(f"\nTarget set: {{∞}}")
    print(f"Height bound: H = {H}")
    
    # Compute first generators
    first_gen_map = find_first_generator_paths(
        H=H,
        gens=gens,
        target_reps=target_reps,
        max_depth=30,
        height_cap=H * 500,
        beam_width=5000,
    )
    
    # Print summary
    print("\n" + "=" * 60)
    print("Results")
    print("=" * 60)
    
    for gen_name in ["S", "A", "B", "S'", "A'", "B'", "(Already at Target)", "(No Path Found)"]:
        if gen_name in first_gen_map:
            rationals = first_gen_map[gen_name]
            print(f"\n{gen_name} ({len(rationals)} points):")
            print("  " + ", ".join(rationals[:20]))
            if len(rationals) > 20:
                print(f"  ... and {len(rationals) - 20} more")
    
    # Generate HTML graphic
    output_path = os.path.join(os.path.dirname(__file__), "static", "generator_analysis.html")
    generate_html_graphic(first_gen_map, H, output_path)


if __name__ == "__main__":
    main()
