from flask import Flask, render_template, request, jsonify
import sys
import os
import threading
import uuid

# Ensure we can import from the current directory
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from lyndonBeam import BeamSearcher

app = Flask(__name__)

# Dictionary to store stop events for active searches
stop_events = {}

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/search', methods=['POST'])
def search():
    data = request.json
    
    poly_str = data.get('poly', 't^2 + 1')
    width = int(data.get('width', 1000))
    randomness = float(data.get('randomness', 0.2))
    max_depth = int(data.get('depth', 50))
    search_id = data.get('search_id')
    
    # Create a stop event for this search
    stop_event = threading.Event()
    if search_id:
        stop_events[search_id] = stop_event
    
    try:
        # Initialize searcher
        searcher = BeamSearcher(poly_str, width=width, randomness=randomness)
        
        # Run search with stop_event
        result = searcher.search(max_depth=max_depth, stop_event=stop_event)
        
        if result:
            return jsonify({
                'success': True, 
                'word': result['word'], 
                'matrix': result['matrix'],
                'matrix_latex': result.get('matrix_latex', '')
            })
        elif stop_event.is_set():
            return jsonify({'success': False, 'message': 'Search stopped by user.'})
        else:
            return jsonify({'success': False, 'message': 'No relation found within max depth.'})
            
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)})
    finally:
        # Clean up stop event
        if search_id and search_id in stop_events:
            del stop_events[search_id]

@app.route('/stop', methods=['POST'])
def stop_search():
    data = request.json
    search_id = data.get('search_id')
    
    if search_id and search_id in stop_events:
        stop_events[search_id].set()
        return jsonify({'success': True})
    
    return jsonify({'success': False, 'message': 'Search not found or already completed'})

if __name__ == '__main__':
    app.run(debug=True, port=5000)
