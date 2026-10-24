#!/bin/bash
# Serve the "Unwrapping an indiscrete group" talk locally (no internet needed).
# Run this script, then open:  http://localhost:8795/Talks/Unwrapping/
#
# Rooted at docs/, so the deck can embed poincare and 2dimFields from the same origin.
# A deeper listen queue than `python3 -m http.server` (whose default drops connections
# when the deck and both apps load their modules at once) and no caching.
cd "$(dirname "$0")/../.." && exec python3 - 8795 <<'PY'
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

class Handler(SimpleHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, max-age=0')
        super().end_headers()
    def log_message(self, *args):
        pass

class Server(ThreadingHTTPServer):
    request_queue_size = 128
    daemon_threads = True

print('Serving on http://localhost:%s/' % sys.argv[1])
Server(('', int(sys.argv[1])), Handler).serve_forever()
PY
