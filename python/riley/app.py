from flask import Flask, render_template, request, jsonify
import sys
import os
import threading
import numpy as np

# Ensure we can import from the current directory
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from searcher import SanovProblem, ModularSanovProblem
from flashbeam import FlashBeam

app = Flask(__name__)

# Shared state
search_status = {
    'running': False,
    'solutions': [],
    'iteration': 0,
    'best_score': 0,
    'roots': [] # List of [re, im]
}

import itertools
try:
    from flint import fmpz_poly
except ImportError:
    pass

def generate_polynomials(max_degree, coeff_range=2):
    # Yields fmpz_poly for monic polynomials
    for degree in range(2, max_degree + 1):
        # Using a fixed range or dynamic range based on degree
        ranges = []
        for i in range(degree):
            # limit = coeff_range (simplified)
            ranges.append(range(-coeff_range, coeff_range + 1))
            
        for coeffs in itertools.product(*ranges):
            # Construct monic polynomial
            p = fmpz_poly(list(coeffs) + [1])
            if p.degree() < 2: continue
            yield p

def search_loop(beam_width, flash_size, iterations, max_degree=3, coeff_range=2):
    global search_status
    search_status['running'] = True
    search_status['solutions'] = []
    search_status['roots'] = []
    search_status['iteration'] = 0
    search_status['best_score'] = 0
    
    seen_polys = set()
    
    # Iterate through polynomials
    poly_gen = generate_polynomials(max_degree, coeff_range)
    
    for idx, p in enumerate(poly_gen):
        if not search_status['running']: break
        
        search_status['iteration'] = idx
        poly_str = str(p)
        
        # Quick FlashBeam for this specific polynomial
        problem = ModularSanovProblem(p)
        # For poly-indexing, we use small iterations per poly
        solver = FlashBeam(problem, beam_width=beam_width, flash_size=flash_size, max_iterations=20)
        
        # We don't need a callback for internal solver steps here
        # just check the result
        solutions = solver.solve()
        
        if solutions:
            # Found a relation for this polynomial!
            sol_node = solutions[0]
            sol_info = {
                'word': sol_node.identifier,
                'rel_poly': poly_str,
                'score': sol_node.score
            }
            search_status['solutions'].append(sol_info)
            
            # Add roots
            coeffs = [int(c) for c in p.coeffs()]
            try:
                rts = np.roots(coeffs[::-1])
                for r in rts:
                    search_status['roots'].append([float(r.real), float(r.imag)])
            except:
                pass

    search_status['running'] = False

@app.route('/')
def index():
    return render_template('index.html')
@app.route('/start', methods=['POST'])
def start():
    if search_status['running']:
        # Allow stopping if already running? Or just skip
        return jsonify({'success': False, 'message': 'Search already running'})
    
    data = request.json
    beam_width = int(data.get('beam_width', 200))
    flash_size = int(data.get('flash_size', 20))
    iterations = int(data.get('iterations', 100)) # This is now unused or redefined
    max_degree = int(data.get('max_degree', 3))
    coeff_range = int(data.get('coeff_range', 2))
    
    t = threading.Thread(target=search_loop, args=(beam_width, flash_size, iterations, max_degree, coeff_range))
    t.start()
    
    return jsonify({'success': True})

@app.route('/status')
def status():
    return jsonify({
        'running': search_status['running'],
        'iteration': search_status['iteration'],
        'best_score': search_status['best_score'],
        'solutions': search_status['solutions'],
        'solution_count': len(search_status['solutions']),
        'roots': search_status['roots']
    })

if __name__ == '__main__':
    # Using a different port to avoid conflicts
    # Disabling reloader to prevent background exit issues
    app.run(debug=True, use_reloader=False, port=5051, host='0.0.0.0')
