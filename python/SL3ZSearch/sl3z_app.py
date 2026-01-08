
from flask import Flask, render_template, Response, request, stream_with_context
import json
import time
from sl3z_search_logic import SL3ZSearchLogic

app = Flask(__name__, template_folder='templates')

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/search')
def search():
    # Get parameters from query string
    config = {
        'BEAM_WIDTH_PHASE_1': int(request.args.get('beam1', 2000)),
        'BEAM_WIDTH_PHASE_2': int(request.args.get('beam2', 10000)),
        'MAX_DEPTH_PHASE_1': int(request.args.get('depth1', 50)),
        'MAX_DEPTH_PHASE_2': int(request.args.get('depth2', 50)),
        'GEN_A_POWER': int(request.args.get('apower', 1)),
        'GEN_B_POWER': int(request.args.get('bpower', 2)),
        'T_MODIFIERS': request.args.get('tmods', ""),
        'POLY_CHOICE': request.args.get('poly', 'default')
    }
    
    def generate():
        searcher = SL3ZSearchLogic(config)
        for event in searcher.run():
            # Format as SSE
            yield f"data: {json.dumps(event)}\n\n"
    
    return Response(stream_with_context(generate()), mimetype='text/event-stream')

if __name__ == '__main__':
    app.run(debug=True, port=5000)
