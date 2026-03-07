#!/usr/bin/env python3
"""
Flask frontend for FlashBeam / Beam Search relation finder
in the Burau image of F₂ ⊂ B₄.
"""

import threading
import time
import uuid
import numpy as np
from flask import Flask, render_template, request, jsonify

from flashbeam_f2 import FlashBeamF2, build_f2_at, mat_dist

app = Flask(__name__)

# ── Global search state ──────────────────────────────────────

search_state = {
    'running': False,
    'search_id': None,
    'algorithm': 'flashbeam',
    'params': {},
    'iteration': 0,
    'best_score': 999,
    'best_word': '',
    'beam_size': 0,
    'flash_size_actual': 0,
    'visited': 0,
    'elapsed': 0.0,
    'solutions': [],
    'flash_top': [],
    'log': [],
    'finished': False,
}

stop_event = threading.Event()


def _reset_state():
    search_state.update({
        'running': False,
        'search_id': None,
        'iteration': 0,
        'best_score': 999,
        'best_word': '',
        'beam_size': 0,
        'flash_size_actual': 0,
        'visited': 0,
        'elapsed': 0.0,
        'solutions': [],
        'flash_top': [],
        'log': [],
        'finished': False,
    })


# ── Search thread ────────────────────────────────────────────

def _run_search(params):
    """Background search thread."""
    global search_state

    t_map = {'-1': -1, 'i': 1j, '-i': -1j, '2': 2, '-2': -2, '3': 3}
    t_val = t_map.get(params['t_val'], -1)

    beam_width = int(params.get('beam_width', 3000))
    max_iters = int(params.get('max_iters', 100))
    algorithm = params.get('algorithm', 'flashbeam')

    # Flash size: 0 for plain beam search, user value for FlashBeam
    if algorithm == 'beam':
        flash_size = 0
    else:
        flash_size = int(params.get('flash_size', 60))

    search_state['algorithm'] = algorithm
    search_state['params'] = {
        't': str(params['t_val']),
        'W': beam_width,
        'F': flash_size,
        'I': max_iters,
    }

    # Build generators for display
    generators, inverse_map, dtype = build_f2_at(t_val)
    identity = np.eye(3, dtype=dtype)

    gen_nodes = []
    for g in generators:
        score = mat_dist(g['matrix'], dtype)
        gen_nodes.append({
            'symbol': g['symbol'],
            'name': g['name'],
            'matrix': g['matrix'],
            'score': score,
        })

    # Init solver state
    root_mat = identity.copy()
    current_beam = [{'matrix': root_mat, 'word': '', 'score': 0}]
    for gn in gen_nodes:
        current_beam.append({
            'matrix': gn['matrix'].copy(),
            'word': gn['symbol'],
            'score': gn['score'],
        })

    if flash_size > 0:
        persistent_flash = [
            {'matrix': gn['matrix'].copy(), 'word': gn['symbol'], 'score': gn['score']}
            for gn in gen_nodes
        ]
    else:
        persistent_flash = []

    visited = set()
    visited.add(root_mat.tobytes())
    for n in current_beam:
        visited.add(n['matrix'].tobytes())

    solutions = []
    solution_words = set()
    t_start = time.time()

    def free_reduce(word):
        parts = word.split()
        stack = []
        for sym in parts:
            if stack and inverse_map.get(stack[-1]) == sym:
                stack.pop()
            else:
                stack.append(sym)
        return ' '.join(stack)

    def would_cancel(last_sym, gen_word):
        if last_sym is None:
            return False
        return inverse_map.get(last_sym) == gen_word.split()[0]

    for iteration in range(1, max_iters + 1):
        if stop_event.is_set():
            break

        candidates = []

        # Expansion pool
        pool_map = {}
        for gn in gen_nodes:
            pool_map[gn['matrix'].tobytes()] = gn
        for f in persistent_flash:
            pool_map[f['matrix'].tobytes()] = f
        pool = list(pool_map.values())

        def _check(child):
            if child['score'] < 1e-10:
                if np.array_equal(child['matrix'], identity):
                    reduced = free_reduce(child['word'])
                    if reduced and len(reduced.split()) > 1 and reduced not in solution_words:
                        solution_words.add(reduced)
                        sol = {
                            'word': reduced,
                            'length': len(reduced.split()),
                            'iteration': iteration,
                            'time': round(time.time() - t_start, 2),
                        }
                        solutions.append(sol)
                        search_state['solutions'] = list(solutions)
                return
            h = child['matrix'].tobytes()
            if h in visited:
                return
            visited.add(h)
            candidates.append(child)

        # beam × pool (right mult)
        for b in current_beam:
            b_last = b['word'].split()[-1] if b['word'] else None
            for p in pool:
                if would_cancel(b_last, p['word'] if isinstance(p.get('word'), str) else p['symbol']):
                    continue
                mat = b['matrix'] @ p['matrix']
                pw = p.get('word', p.get('symbol', ''))
                word = pw if b['word'] == '' else b['word'] + ' ' + pw
                score = float(np.sum(np.abs(mat - identity)))
                _check({'matrix': mat, 'word': word, 'score': score})

        # pool × beam (left mult)
        for p in pool:
            for b in current_beam:
                if b['word'] == '':
                    continue
                mat = p['matrix'] @ b['matrix']
                pw = p.get('word', p.get('symbol', ''))
                word = pw + ' ' + b['word']
                score = float(np.sum(np.abs(mat - identity)))
                _check({'matrix': mat, 'word': word, 'score': score})

        candidates.sort(key=lambda n: (n['score'], len(n['word'].split())))
        current_beam = candidates[:beam_width]

        # Update flash (skip for plain beam search)
        if flash_size > 0:
            fc = [n for n in (persistent_flash + current_beam)
                  if n['score'] > 0 and n['word']]
            fc.sort(key=lambda n: n['score'])
            fm = {}
            for c in fc:
                h = c['matrix'].tobytes()
                if h not in fm:
                    fm[h] = c
                if len(fm) >= flash_size:
                    break
            persistent_flash = list(fm.values())

        best = current_beam[0] if current_beam else None
        elapsed = time.time() - t_start

        # Update telemetry
        search_state.update({
            'iteration': iteration,
            'best_score': round(best['score'], 2) if best else 999,
            'best_word': best['word'][:80] if best else '',
            'beam_size': len(current_beam),
            'flash_size_actual': len(persistent_flash),
            'visited': len(visited),
            'elapsed': round(elapsed, 2),
            'solutions': list(solutions),
            'flash_top': [
                {'word': f.get('word', f.get('symbol', ''))[:30],
                 'score': round(f['score'], 1)}
                for f in persistent_flash[:6]
            ],
        })

        if not current_beam:
            break

    search_state['running'] = False
    search_state['finished'] = True


# ── Routes ───────────────────────────────────────────────────

@app.route('/')
def index():
    return render_template('index.html')


@app.route('/start', methods=['POST'])
def start_search():
    global stop_event
    if search_state['running']:
        return jsonify({'error': 'Search already running'}), 400

    stop_event = threading.Event()
    _reset_state()

    params = request.json or {}
    search_state['running'] = True
    search_state['search_id'] = str(uuid.uuid4())[:8]

    t = threading.Thread(target=_run_search, args=(params,), daemon=True)
    t.start()
    return jsonify({'success': True, 'search_id': search_state['search_id']})


@app.route('/stop', methods=['POST'])
def stop_search():
    stop_event.set()
    search_state['running'] = False
    return jsonify({'success': True})


@app.route('/status')
def status():
    return jsonify(search_state)


@app.route('/generators')
def generators():
    """Return the generators for a specific t value for display."""
    t_str = request.args.get('t', '-1')
    t_map = {'-1': -1, 'i': 1j, '-i': -1j, '2': 2, '-2': -2, '3': 3}
    t_val = t_map.get(t_str, -1)

    gens, _, dtype = build_f2_at(t_val)
    result = []
    for g in gens:
        m = g['matrix']
        rows = []
        for i in range(3):
            row = []
            for j in range(3):
                v = m[i][j]
                if isinstance(v, complex):
                    if v.imag == 0:
                        row.append(str(int(v.real)))
                    elif v.real == 0:
                        row.append(f'{int(v.imag)}i')
                    else:
                        row.append(f'{int(v.real)}+{int(v.imag)}i')
                else:
                    row.append(str(int(v)))
            rows.append(row)
        result.append({
            'name': g['name'],
            'symbol': g['symbol'],
            'matrix': rows,
            'dist': round(float(mat_dist(m, dtype)), 1),
        })
    return jsonify(result)


if __name__ == '__main__':
    app.run(debug=True, use_reloader=False, port=5051, host='0.0.0.0')
