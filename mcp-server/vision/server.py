"""Persistent local face-analysis service for the Photoshop bridge."""

from __future__ import annotations

import json
import sys
from collections import OrderedDict
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Lock

from analyze_face import analyze


_ANALYSIS_LOCK = Lock()
_CACHE: OrderedDict[tuple[str, int, int], dict] = OrderedDict()
_CACHE_LIMIT = 64


def analyze_cached(image_path: Path) -> dict:
    resolved = image_path.resolve(strict=True)
    if not resolved.is_file():
        raise ValueError(f"Image path is not a file: {resolved}")
    stat = resolved.stat()
    key = (str(resolved).lower(), stat.st_mtime_ns, stat.st_size)
    with _ANALYSIS_LOCK:
        cached = _CACHE.get(key)
        if cached is not None:
            _CACHE.move_to_end(key)
            return cached
        result = analyze(resolved)
        _CACHE[key] = result
        _CACHE.move_to_end(key)
        while len(_CACHE) > _CACHE_LIMIT:
            _CACHE.popitem(last=False)
        return result


class Handler(BaseHTTPRequestHandler):
    def _send(self, status: int, payload: dict) -> None:
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(data)

    def do_POST(self) -> None:  # noqa: N802
        if self.path != "/analyze":
            self._send(404, {"ok": False, "message": "Not found"})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            body = json.loads(self.rfile.read(length).decode("utf-8"))
            raw_path = str(body.get("path", "")).strip()
            if not raw_path:
                raise ValueError("Image path is required")
            self._send(200, analyze_cached(Path(raw_path)))
        except Exception as error:  # Keep the service alive for the next image.
            self._send(400, {"ok": False, "message": str(error)})

    def log_message(self, *_args) -> None:
        return


def main() -> None:
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 61235
    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    server.serve_forever()


if __name__ == "__main__":
    main()
