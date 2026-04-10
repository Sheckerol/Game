#!/usr/bin/env python3
"""
Dev server for the game — serves files with no-cache headers so
Chrome always loads the latest version without manual cache clearing.

Usage (in Termux):
    python3 serve.py
Then open Chrome → localhost:8080
"""
import http.server
import socketserver

PORT = 8080

class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def log_message(self, format, *args):
        # Quieter output — only print requests, not full timestamps
        print(f'{self.address_string()} {args[0]}')

with socketserver.TCPServer(('', PORT), NoCacheHandler) as httpd:
    print(f'Serving on http://localhost:{PORT}  (no-cache mode)')
    httpd.serve_forever()
