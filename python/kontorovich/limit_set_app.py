
from flask import Flask, render_template, request, jsonify
import numpy as np
import time

app = Flask(__name__)



CURRENT_PARAMS = {'u': 9.0, 'v': -9.0}

def calculate_generators(u, v):
    # Auxiliary terms
    # C = (u - v)**2 * (u + v)
    # D = (u*v - 4)**2 - 4*(u + v + 5)*(u - v)**2 - 16
    D = (u*v - 4)**2 - 4*(u + v + 5)*(u - v)**2 - 16
    tau = 2 * (u**2 + v**2) * (u**2 - u*v + v**2)
    
    sqrt_D = np.sqrt(D + 0j) 
    
    if abs(tau) < 1e-9: tau = 1e-9 

    # A matrix
    a13 = (-u**4 * v + 4 * u**2 * v**2 - 6 * u**3 * v - 2 * u * v**3 + u**3 * sqrt_D) / tau
    a22 = -v/u
    a32 = -(u**2 - u*v + v**2)/(u**2)
    a33 = -1 + v/u
    
    MatA = np.array([
        [1, 1, a13],
        [0, a22, 1],
        [0, a32, a33]
    ], dtype=complex)

    # B matrix
    C = (u - v)**2 * (u + v)
    
    b11 = -1 + v/u
    b13 = u * (-u**2 * v**2 + 2 * C + u * v * sqrt_D) / tau
    b21 = (-2 * v**2 + 2 * u**2 + u**2 * v + 4 * u * v + u * sqrt_D) / (2 * u**2)
    b31 = (u**2 * v**2 - 2 * C + u * v * sqrt_D) / (2 * u**3)
    b33 = -v/u
    
    MatB = np.array([
        [b11, 0, b13],
        [b21, 1, -1],
        [b31, 0, b33]
    ], dtype=complex)
    
    if np.all(np.abs(np.imag(MatA)) < 1e-9) and np.all(np.abs(np.imag(MatB)) < 1e-9):
        MatA = np.real(MatA)
        MatB = np.real(MatB)
        
    return MatA, MatB

# Initial Generators
a, b = calculate_generators(9, -9)

A = a @ a
B = b @ b

GENERATORS = [a, A, b, B]
GEN_TYPES = [0, 0, 1, 1] 

GROUP_CACHE = {}

def get_orbit_points(depth, start_vec=np.array([0,0,1])):
    cache_key = depth
    if cache_key in GROUP_CACHE:
        return GROUP_CACHE[cache_key]

    current_level = [(np.eye(3), -1)]
    all_vectors = [start_vec]
    
    for d in range(depth):
        next_level = []
        for mat, last_type in current_level:
            for i, gen in enumerate(GENERATORS):
                this_type = GEN_TYPES[i]
                if last_type != -1 and this_type == last_type:
                    continue
                new_mat = gen @ mat
                next_level.append((new_mat, this_type))
                v = new_mat @ start_vec
                all_vectors.append(v)
        current_level = next_level
    
    result = []
    for v in all_vectors:
        result.append(np.real(v).tolist())
        
    GROUP_CACHE[cache_key] = result
    return result

def get_random_orbit_points(count, length, start_vec=np.array([0,0,1])):
    import random
    points = []
    gens = GENERATORS
    gen_indices_by_type = {0: [2, 3], 1: [0, 1]}
    start_indices = [0, 1, 2, 3]
    
    for _ in range(count):
        mat = np.eye(3)
        last_type = -1
        for step in range(length):
            if last_type == -1: idx = random.choice(start_indices)
            else: idx = random.choice(gen_indices_by_type[last_type])
            mat = gens[idx] @ mat
            last_type = GEN_TYPES[idx]
        v = mat @ start_vec
        points.append(np.real(v).tolist())
    return points

@app.route('/')
def index():
    return render_template('limit_set.html')

@app.route('/api/squares')
def get_squares():
    squares = []
    for u in range(-20, 21):
        for v in range(-20, 21):
            if u == 0: continue 
            
            # D = (u*v - 4)**2 - 4*(u + v + 5)*(u - v)**2 - 16
            D = (u*v - 4)**2 - 4*(u + v + 5)*(u - v)**2 - 16
            
            if D >= 0:
                root = int(np.isqrt(D))
                if root * root == D:
                    squares.append({'u': u, 'v': v, 'D': D})
    return jsonify(squares)

@app.route('/api/points')
def get_points():
    mode = request.args.get('mode', 'random')
    
    try:
        u = float(request.args.get('u', CURRENT_PARAMS['u']))
        v = float(request.args.get('v', CURRENT_PARAMS['v']))
    except ValueError:
        u = CURRENT_PARAMS['u']
        v = CURRENT_PARAMS['v']
        
    global GENERATORS, a, b, A, B, GROUP_CACHE
    
    if abs(u - CURRENT_PARAMS['u']) > 1e-9 or abs(v - CURRENT_PARAMS['v']) > 1e-9:
        if abs(u) < 1e-9: u = 1e-9 
        
        print(f"Updating parameters: u={u}, v={v}")
        CURRENT_PARAMS['u'] = u
        CURRENT_PARAMS['v'] = v
        
        a, b = calculate_generators(u, v)
        A = a @ a
        B = b @ b
        GENERATORS = [a, A, b, B]
        GROUP_CACHE = {}

    start_time = time.time()
    
    if mode == 'bfs':
        try:
            depth = int(request.args.get('depth', 10))
        except ValueError:
            depth = 10
        if depth > 12: depth = 12
        points = get_orbit_points(depth)
        
    else: # random
        try:
            count = int(request.args.get('count', 10000))
            length = int(request.args.get('length', 50))
        except ValueError:
            count = 10000
            length = 50
        if count > 50000: count = 50000
        if length > 200: length = 200
        points = get_random_orbit_points(count, length)

    print(f"Generated {len(points)} points in {time.time() - start_time:.4f}s")
    

    # helper for clean json
    def mat_to_list(M):
        # return strings if complex to avoid issues, or round
        if np.iscomplexobj(M):
             return [[str(x) for x in row] for row in M]
        return M.tolist()

    return jsonify({
        'points': points,
        'count': len(points),
        'matrices': {
            'A': mat_to_list(a),
            'B': mat_to_list(b),
            'AB': mat_to_list(a @ b)
        }
    })

if __name__ == '__main__':
    app.run(debug=True, port=5001)
