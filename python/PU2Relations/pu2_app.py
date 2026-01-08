from flask import Flask, render_template, request, Response, stream_with_context
import json
import time
from PU2Relations import solve_gen

app = Flask(__name__)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/solve')
def solve():
    x = int(request.args.get('x', 4))
    y = int(request.args.get('y', 5))
    a = int(request.args.get('a', 3))
    b = int(request.args.get('b', 1))
    c = int(request.args.get('c', 3))
    d = int(request.args.get('d', 9))
    
    beam = int(request.args.get('beam', 5000))
    max_iter = int(request.args.get('max_iter', 100000))
    stop = int(request.args.get('stop', 3))
    random_rate = float(request.args.get('random_rate', 0.1))

    def generate():
        try:
            gen = solve_gen(x, y, a, b, c, d, beam_width=beam, max_iter=max_iter, random_rate=random_rate, stop_after=stop)
            for update in gen:
                yield f"data: {json.dumps(update)}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"

    return Response(stream_with_context(generate()), mimetype='text/event-stream')

if __name__ == '__main__':
    app.run(debug=True, port=5008)
