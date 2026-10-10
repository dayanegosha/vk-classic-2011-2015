"""Serve only local regression fixtures; never contacts VK or proxies an account."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit
import argparse

root = Path(__file__).resolve().parents[1]
class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def do_GET(self):
        route = urlsplit(self.path).path.rstrip('/')
        if route == '/feed':
            self.path = '/preview/feed.html'
        elif route == '/im' or route.startswith('/im/'):
            self.path = '/preview/messages.html'
        super().do_GET()

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=8765)
    args = parser.parse_args()
    handler = lambda *a, **k: Handler(*a, directory=str(root), **k)
    print(f'Local fixtures: http://127.0.0.1:{args.port}/preview/', flush=True)
    ThreadingHTTPServer(('127.0.0.1', args.port), handler).serve_forever()
