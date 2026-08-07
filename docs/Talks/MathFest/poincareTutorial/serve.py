#!/usr/bin/env python3
"""Dev server with no-cache headers (so module edits show up on reload)."""
import http.server
import sys


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        super().end_headers()


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8741
    http.server.ThreadingHTTPServer(('', port), NoCacheHandler).serve_forever()
