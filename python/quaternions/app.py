from flask import Flask, render_template, request, jsonify
from hurwitz import HurwitzQuaternion
from flint import fmpz
import sys
import os

# Add current directory to path so we can import hurwitz if run from elsewhere, 
# though usually we run from the root or the folder itself.
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

app = Flask(__name__)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/factor', methods=['POST'])
def factor():
    try:
        data = request.get_json()
        raw_input = data.get('number')
        mode = data.get('mode', 'auto') # 'auto', 'primes', 'factor'
        
        if not raw_input:
            return jsonify({'error': 'Please enter a number or quaternion'}), 400
            
        str_input = str(raw_input).strip()
        
        # Determine mode if auto
        if mode == 'auto':
            # Check if integer
            try:
                n = int(str_input)
                # It is an integer.
                # If it looks like a quaternion (e.g. 3+0i), treat as quaternion?
                # But int("3+0i") fails.
                # So if int() succeeds, it's a plain integer.
                # Check for explicit i,j,k just in case (e.g. variable names? no)
                mode = 'primes'
            except ValueError:
                mode = 'factor' # Not an integer, must be quaternion string
        
        if mode == 'primes':
            try:
                n = int(str_input)
            except ValueError:
                return jsonify({'error': 'Invalid integer for prime search.'}), 400

            if n == 1:
                units = HurwitzQuaternion.units()
                results = [u.to_latex() for u in units]
                return jsonify({
                    'type': 'units',
                    'count': len(results),
                    'title': f'The {len(results)} Units of Hurwitz Integers',
                    'results': results
                })
            elif n > 1:
                try:
                    primes = HurwitzQuaternion.primes_above(n)
                    results = [p.to_latex() for p in primes]
                    return jsonify({
                        'type': 'primes',
                        'count': len(results),
                        'title': f'Primes above {n}',
                        'results': results
                    })
                except Exception as e:
                    return jsonify({'error': f'Computation failed: {str(e)}'}), 500
            else:
                return jsonify({'error': 'Please enter a positive integer > 0'}), 400

        elif mode == 'factor':
            try:
                q = HurwitzQuaternion.from_string(str_input)
                norm = int(q.norm())
                
                # Factor norm itself
                norm_factors = fmpz(norm).factor()
                norm_str_parts = []
                for base, exp in norm_factors:
                    if exp == 1:
                        norm_str_parts.append(str(base))
                    else:
                        norm_str_parts.append(f"{base}^{{{exp}}}") # Latex exponent
                norm_factor_str = f"Norm = {norm} = {' \\cdot '.join(norm_str_parts)}"
                
                factor_chains = q.factorizations()
                
                # Format output: (unit)(q1)(q2)...
                formatted_results = []
                for chain in factor_chains:
                    # Wrap each term in parentheses. 
                    # Use \left( \right) for clearer height matching if fractions involved
                    terms = [f"\\left({term.to_latex()}\\right)" for term in chain]
                    formatted_results.append("".join(terms))
                
                return jsonify({
                    'type': 'factorization',
                    'count': len(formatted_results),
                    'title': f'Factorizations of $${q.to_latex()}$$',
                    'norm_info': f'$${norm_factor_str}$$',
                    'results': formatted_results
                })
            except Exception as e:
                 return jsonify({'error': f'Invalid quaternion: {str(e)}'}), 400
                 
        else:
            return jsonify({'error': 'Invalid mode'}), 400

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/multiply', methods=['POST'])
def multiply():
    try:
        data = request.get_json()
        s1 = data.get('q1')
        s2 = data.get('q2')
        
        if not s1 or not s2:
            return jsonify({'error': 'Please enter both quaternions'}), 400
            
        q1 = HurwitzQuaternion.from_string(str(s1))
        q2 = HurwitzQuaternion.from_string(str(s2))
        product = q1 * q2
        
        return jsonify({
            'type': 'product',
            'title': f'Product',
            'norm_info': f'Norm = {product.norm()}',
            'count': 1,
            'results': [product.to_latex()]
        })
    except Exception as e:
        return jsonify({'error': f'Computation failed: {str(e)}'}), 400

@app.route('/relations', methods=['POST'])
def relations():
    from flask import Response, stream_with_context
    import json
    try:
        from relationSearch import find_relations
        data = request.get_json()
        raw_quats = data.get('quats', [])
        
        if not raw_quats:
            return jsonify({'error': 'No quaternions provided'}), 400
            
        quats = []
        for s in raw_quats:
            s = str(s).strip()
            if s:
                try:
                    quats.append(HurwitzQuaternion.from_string(s))
                except Exception as e:
                     return jsonify({'error': f'Invalid quaternion "{s}": {str(e)}'}), 400
        
        if not quats:
             return jsonify({'error': 'No valid quaternions provided'}), 400
             
        bw = int(data.get('beam_width', 50))
        depth = int(data.get('depth', 12))
        filt_comm = bool(data.get('filter_commutator', False))
        
        def generate():
            found_count = 0
            # Limit relations found
            limit = 50
            
            try:
                for res, val in find_relations(quats, beam_width=bw, depth=depth, filter_commutator=filt_comm): 
                    if res == 'progress':
                        yield json.dumps({'type': 'progress', 'data': val}) + '\n'
                    elif res is None:
                        yield json.dumps({'type': 'log', 'msg': val}) + '\n'
                    else:
                        yield json.dumps({'type': 'relation', 'rel': res, 'val': val}) + '\n'
                        found_count += 1
                        if found_count >= limit: 
                            break
                            
                yield json.dumps({'type': 'done', 'count': found_count}) + '\n'
                
            except Exception as e:
                yield json.dumps({'type': 'error', 'msg': str(e)}) + '\n'

        return Response(stream_with_context(generate()), mimetype='application/x-ndjson')
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5003)
