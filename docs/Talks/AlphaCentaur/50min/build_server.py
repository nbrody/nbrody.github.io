#!/usr/bin/env python3
"""Static server over Dropbox/Code, so this folder and the slide editor in
private/alphaCentaur/presentations share one origin. PUT is allowed only for
.html files directly in this folder (build.html writes the exported deck).

  python3 build_server.py            # http://localhost:8799/
  deck:    /nbrody.github.io/docs/Talks/AlphaCentaur/
  build:   /nbrody.github.io/docs/Talks/AlphaCentaur/build.html
  editor:  /private/alphaCentaur/presentations/
"""
import http.server, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..', '..', '..'))


class H(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map,
                      '.js': 'text/javascript', '.mjs': 'text/javascript', '.woff2': 'font/woff2'}

    def __init__(self, *a, **k):
        super().__init__(*a, directory=ROOT, **k)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def log_message(self, *a):
        pass

    def do_PUT(self):
        path = os.path.abspath(os.path.join(ROOT, self.path.lstrip('/').split('?')[0]))
        if os.path.dirname(path) != HERE or not path.endswith('.html') or os.path.basename(path) == 'build.html':
            self.send_error(403)
            return
        data = self.rfile.read(int(self.headers['Content-Length']))
        with open(path, 'wb') as f:
            f.write(data)
        self.send_response(204)
        self.end_headers()


class Server(http.server.ThreadingHTTPServer):
    request_queue_size = 64
    daemon_threads = True


port = int(sys.argv[1]) if len(sys.argv) > 1 else 8799
print(f'http://localhost:{port}/nbrody.github.io/docs/Talks/AlphaCentaur/', flush=True)
Server(('127.0.0.1', port), H).serve_forever()
