"""Serve the checkout locally; feature overrides never modify published files."""
import argparse
import json
import os
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

DIST = Path(__file__).resolve().parents[1] / "dist"


def feature_flags(environ):
    return {"aiReplay": environ.get("BANANA_AI_REPLAY", "").lower() in ("1", "true")}


def feature_script(environ):
    flags = json.dumps(feature_flags(environ), separators=(",", ":"))
    return f"globalThis.BANANA_FEATURES=Object.freeze({flags});\n".encode()


class LocalHandler(SimpleHTTPRequestHandler):
    def send_head(self):
        if urlsplit(self.path).path == "/features.js":
            from io import BytesIO
            content = feature_script(os.environ)
            self.send_response(200)
            self.send_header("Content-Type", "text/javascript; charset=utf-8")
            self.send_header("Content-Length", str(len(content)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            return BytesIO(content)
        return super().send_head()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--bind", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8893)
    parser.add_argument("--print-features", action="store_true")
    parser.add_argument("--check-features", action="store_true")
    args = parser.parse_args()
    if args.print_features:
        print(feature_script(os.environ).decode(), end="")
        return
    if args.check_features:
        if (DIST / "features.js").read_bytes() != feature_script({}):
            raise SystemExit("Published features.js must keep development features disabled")
        print("Published AI/Replay feature flag is disabled")
        return
    handler = partial(LocalHandler, directory=str(DIST))
    with ThreadingHTTPServer((args.bind, args.port), handler) as server:
        print(f"Serving {DIST} at http://{args.bind}:{args.port}/; "
              f"AI/Replay={'on' if feature_flags(os.environ)['aiReplay'] else 'off'}", flush=True)
        server.serve_forever()


if __name__ == "__main__":
    main()
