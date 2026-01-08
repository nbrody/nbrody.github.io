from flask import Flask, render_template, request, jsonify
import sys
import os

# Add parent directory to path to import finiteOrbits
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import finiteOrbits

app = Flask(__name__)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/run', methods=['POST'])
def run_simulation():
    data = request.json
    generator_name = data.get('generator', 'Z1/2')
    H = int(data.get('H', 10))
    depth = int(data.get('depth', 16))
    height_cap_factor = int(data.get('height_cap_factor', 500))
    height_cap = H * height_cap_factor
    max_nodes = int(data.get('max_nodes', 2000000))
    max_reps = int(data.get('max_reps', 50000))

    MAX_NODES_LIMIT = 10_000_000 # Safety limit

    def process_custom_gens(custom_json):
        # custom_json is list of {name: "A", a: 1, b: 0, c: 0, d: 1}
        # Expected input: list of dicts with matrix elements
        gens = []
        for g in custom_json:
            name = g.get('name', 'G')
            try:
                # Parse as strings to support large integers if needed, but int is fine for now
                a = finiteOrbits.Z(int(g['a']))
                b = finiteOrbits.Z(int(g['b']))
                c = finiteOrbits.Z(int(g['c']))
                d = finiteOrbits.Z(int(g['d']))
                M = (a, b, c, d)
                gens.append((name, M))
                gens.append((name + "'", finiteOrbits.inv_proj(M)))
            except ValueError:
                continue
        return gens

    try:
        if generator_name == 'Custom':
            custom_gens_data = data.get('custom_generators', [])
            gens = process_custom_gens(custom_gens_data)
            if not gens:
                raise ValueError("No valid custom generators provided")
        else:
            gens = finiteOrbits.get_generators(generator_name)

        # Run empirical cover with standard arguments
        reps, total_points = finiteOrbits.empirical_cover(H, gens, max_depth=depth, height_cap=height_cap, max_nodes=max_nodes)
        
        response = {
            'status': 'success',
            'reps': [str(finiteOrbits.point_str(r)) for r in reps], # Using point_str
            'total_points': total_points
        }
        return jsonify(response)
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/match', methods=['POST'])
def match_orbit():
    data = request.json
    rational_str = data.get('rational')
    reps_strs = data.get('reps', [])
    generator_name = data.get('generator', 'Z1/2')
    depth = int(data.get('depth', 20))
    height_cap = int(data.get('height_cap', 10000))
    max_nodes = int(data.get('max_nodes', 100000))
    beam_width = int(data.get('beam_width', 5000))

    try:
        # Helper to parse string "p/q" or "inf" to Point
        def parse_pt(s):
            s = str(s).strip().lower()
            if s in ['inf', 'infinity', '∞']:
                return finiteOrbits.INF
            if '/' in s:
                p, q = s.split('/')
                return finiteOrbits.normalize(finiteOrbits.Z(int(p)), finiteOrbits.Z(int(q)))
            else:
                return finiteOrbits.normalize(finiteOrbits.Z(int(s)), finiteOrbits.Z(1))

        start_pt = parse_pt(rational_str)
        target_reps = {parse_pt(r) for r in reps_strs}
        
        if generator_name == 'Custom':
            def process_custom_gens_local(custom_json):
                gens = []
                for g in custom_json:
                    name = g.get('name', 'G')
                    try:
                        a = finiteOrbits.Z(int(g['a']))
                        b = finiteOrbits.Z(int(g['b']))
                        c = finiteOrbits.Z(int(g['c']))
                        d = finiteOrbits.Z(int(g['d']))
                        M = (a, b, c, d)
                        gens.append((name, M))
                        gens.append((name + "'", finiteOrbits.inv_proj(M)))
                    except ValueError:
                        continue
                return gens
            
            custom_gens_data = data.get('custom_generators', [])
            gens = process_custom_gens_local(custom_gens_data)
        else:
            gens = finiteOrbits.get_generators(generator_name)
        
        path = finiteOrbits.find_path_to_reps(
            start_pt,
            target_reps,
            gens,
            max_depth=depth,
            height_cap=height_cap,
            max_nodes=max_nodes,
            beam_width=beam_width
        )
        
        if path is None:
            return jsonify({'status': 'not_found'})
            
        # Serialize path
        path_data = []
        for p1, move, p2 in path:
            path_data.append({
                'start': finiteOrbits.point_str(p1),
                'move': move,
                'end': finiteOrbits.point_str(p2)
            })
            
        return jsonify({
            'status': 'success',
            'path': path_data,
            'target': path_data[-1]['end'] if path_data else finiteOrbits.point_str(start_pt)
        })

    except Exception as e:
        print(e)
        return jsonify({'status': 'error', 'message': str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5001)
