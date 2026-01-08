from flask import Flask, render_template, request, jsonify
import flint
from flint import arb_mat
import json
from fractions import Fraction
from pingpong import analyze_ping_pong

app = Flask(__name__)

def parse_value(val):
    """
    Parse a value that may be a number, fraction string (e.g., "1/4"), or expression.
    """
    if isinstance(val, (int, float)):
        return float(val)
    
    val_str = str(val).strip()
    
    # Handle fractions like "1/4", "-3/7", etc.
    if '/' in val_str:
        try:
            return float(Fraction(val_str))
        except (ValueError, ZeroDivisionError):
            pass
    
    # Try direct float conversion
    try:
        return float(val_str)
    except ValueError:
        pass
    
    # Try evaluating simple expressions (be careful with this in production!)
    # For now, just support basic arithmetic
    try:
        # Only allow safe characters
        if all(c in '0123456789.+-*/() ' for c in val_str):
            return float(eval(val_str))
    except:
        pass
    
    raise ValueError(f"Cannot parse value: {val}")

def parse_matrix(matrix_data):
    """
    Parses a 3x3 matrix from a list of lists (row-major).
    Supports fractions like "1/4" and simple expressions.
    """
    mat = arb_mat(3, 3)
    for i in range(3):
        for j in range(3):
            mat[i, j] = parse_value(matrix_data[i][j])
    return mat

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/analyze', methods=['POST'])
def analyze():
    data = request.json
    try:
        k = int(data.get('k', 1))
        
        # New input format: 'generators' dict
        generators_data = data.get('generators', {})
        extra_words = data.get('extraWords', [])
        
        # Backward compatibility or fallback if needed (though we'll update frontend)
        if not generators_data and 'matrixA' in data:
            generators_data = {
                'a': data.get('matrixA'),
                't': data.get('matrixT')
            }
            
        # Parse matrices
        parsed_generators = {}
        for name, mat_data in generators_data.items():
            parsed_generators[name] = parse_matrix(mat_data)
        
        result = analyze_ping_pong(k, parsed_generators, extra_words)
        
        if result.get('error'):
             return jsonify({'success': False, 'error': result['error']}), 400
        
        # Sanitize results
        sanitized_gens = {}
        if 'generators' in result:
            for name, gen_data in result['generators'].items():
                sanitized_gens[name] = {
                    'att_vec': gen_data['att_vec'],
                    'rep_norm_vec': gen_data['rep_norm_vec'],
                    'ratio': gen_data['ratio'],
                    'radius': gen_data.get('radius'),
                    'mat': gen_data.get('mat'),
                    'conic': gen_data.get('conic')
                }
            
        return jsonify({
            'success': True,
            'k': result['k'],
            'min_separation': result['min_separation'],
            'max_radius': result['max_radius'],
            'valid': result['valid'],
            'warnings': result['warnings'],
            'generators': sanitized_gens,
            'words': result.get('words', [])
        })

        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400

if __name__ == '__main__':
    app.run(debug=True, port=5005)
