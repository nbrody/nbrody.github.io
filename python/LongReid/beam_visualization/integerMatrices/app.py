from flask import Flask, render_template, request, Response, stream_with_context
import json
import time
from integerMatrices import IntegerMatrixSearch

app = Flask(__name__)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/search')
def search():
    try:
        t_param = int(request.args.get('t', 25))
        beam_width = int(request.args.get('beam_width', 10000))
        max_iterations = int(request.args.get('max_iterations', 100))
    except ValueError:
        return "Invalid parameters", 400

    def generate():
        solver = IntegerMatrixSearch(t_param, beam_width=beam_width, max_iterations=max_iterations)
        
        # We need to capture the results as they come in.
        # The search is blocking, but we can pass a callback that yields data.
        # However, Python generators don't easily work with callbacks like that directly unless we yield FROM the search
        # or the search itself is a generator.
        
        # Simpler approach for now given the existing class structure:
        # We can unfortunately NOT easily stream line-by-line if the search method fully controls the loop 
        # unless we modify IntegerMatrixSearch to yield instead of return list.
        # But wait, I modified it to take a callback!
        
        # Actually, yielding from a callback inside a blocking function call is tricky in a single thread context (flask default).
        # A better way with the current structure is to have the callback put items in a queue, and have a separate thread run the search?
        # Or just modify IntegerMatrixSearch slightly to be a generator or allow yielding?
        
        # Let's try the Queue approach, it's robust.
        import queue
        import threading
        
        q = queue.Queue()
        stop_event = threading.Event()
        
        def callback(word):
            q.put(word)
            
        def run_search():
            solver.search(callback=callback)
            stop_event.set()
            
        t = threading.Thread(target=run_search)
        t.start()
        
        while not stop_event.is_set() or not q.empty():
            try:
                # Wait for a bit, yield if found
                word = q.get(timeout=0.1)
                yield f"data: {json.dumps({'word': word})}\n\n"
            except queue.Empty:
                # Send a keepalive or just wait
                yield ": keepalive\n\n"
                
        yield "event: done\ndata: Search complete\n\n"
        t.join()

    return Response(stream_with_context(generate()), mimetype='text/event-stream')

if __name__ == '__main__':
    app.run(debug=True, port=8034)
