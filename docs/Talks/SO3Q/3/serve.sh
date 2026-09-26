#!/bin/bash
# Serve the SO₃(ℚ) talk locally — works with NO internet connection
# (only the phone remote needs the network).
# Run this script, then open:  http://localhost:8780/Talks/SO3Q/3/
#
# A deeper listen queue than `python3 -m http.server` (whose default of 5
# drops connections when the deck and its scenes load at once) and no caching.
cd "$(dirname "$0")/../../.." && exec python3 - 8780 <<'PY'
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
