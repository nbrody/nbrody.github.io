#!/bin/bash
# Serve "The other side of the prompt" locally (no internet needed).
# Run this script, then open:
#     http://localhost:8817/nbrody.github.io/docs/Talks/OtherSide/
#
# Rooted at Dropbox/Code (not docs/), so the deck can embed the GoLG tools AND
# nicjams.github.io/musicalCanvas from one origin. A deep listen queue (the apps
# load many modules and workers at once) and no caching.
cd "$(dirname "$0")/../../../.." && exec python3 - 8817 <<'PY'
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

class Handler(SimpleHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map,
                      '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm'}
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, max-age=0')
        super().end_headers()
    def log_message(self, *args):
        pass

class Server(ThreadingHTTPServer):
    request_queue_size = 128
    daemon_threads = True

print('Serving on http://localhost:%s/nbrody.github.io/docs/Talks/OtherSide/' % sys.argv[1])
Server(('', int(sys.argv[1])), Handler).serve_forever()
PY
