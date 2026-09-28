#!/usr/bin/env python3
"""Serveur local de développement (sans cache) : python tools/dev-server.py [port]

Port : argument, sinon variable d'environnement PORT, sinon 5193."""
import os
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


class NoCacheHandler(SimpleHTTPRequestHandler):
    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript",
        ".mjs": "text/javascript",
        ".webmanifest": "application/manifest+json",
        ".svg": "image/svg+xml",
        ".webp": "image/webp",
        ".txt": "text/plain; charset=utf-8",
    }

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


class Serveur(ThreadingHTTPServer):
    # la file d'attente par défaut (5) déborde quand plusieurs navigateurs chargent la page en même
    # temps (une trentaine de fichiers chacun) : Windows refuse alors des connexions
    request_queue_size = 256
    daemon_threads = True


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else int(os.environ.get("PORT", 5193))
    handler = partial(NoCacheHandler, directory=str(ROOT))
    print(f"Cordo 63 - http://localhost:{port}", flush=True)
    Serveur(("127.0.0.1", port), handler).serve_forever()
