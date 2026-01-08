from flask import Flask, render_template, request, Response, stream_with_context
import json
import time
from FLSS import beam_search

app = Flask(__name__)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/solve')
def solve():
    p = int(request.args.get('p', 3))
    beam = int(request.args.get('beam', 1000))
    depth = int(request.args.get('depth', 100))
    minlen = int(request.args.get('minlen', 8))
    stop = int(request.args.get('stop', 3))
    samples = int(request.args.get('samples', 5))
    seed = int(request.args.get('seed', 0))

    def generate():
        try:
            gen = beam_search(p, beam, depth, samples, seed, minlen, stop)
            for update in gen:
                yield f"data: {json.dumps(update)}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"

    return Response(stream_with_context(generate()), mimetype='text/event-stream')

if __name__ == '__main__':
    app.run(debug=True, port=5010)
