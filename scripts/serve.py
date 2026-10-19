"""Serve the checkout locally; feature overrides never modify published files."""
import argparse
import json
import os
import sqlite3
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlsplit
from training_store import TrainingStore

DIST = Path(__file__).resolve().parents[1] / "dist"


def feature_flags(environ):
    return {"aiReplay": environ.get("BANANA_AI_REPLAY", "").lower() in ("1", "true")}


def feature_script(environ):
    flags = json.dumps(feature_flags(environ), separators=(",", ":"))
    return f"globalThis.BANANA_FEATURES=Object.freeze({flags});\n".encode()


class LocalHandler(SimpleHTTPRequestHandler):
    def training_store(self):
        return TrainingStore(os.environ.get("BANANA_TRAINING_DIR"))

    def json_response(self, value, status=200):
        from io import BytesIO
        content = json.dumps(value, allow_nan=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(content)))
        self.end_headers()
        return BytesIO(content)

    def do_POST(self):
        if not feature_flags(os.environ)["aiReplay"] or urlsplit(self.path).path != "/training/api/generations":
            self.send_error(404)
            return
        if self.headers.get_content_type() != "application/json":
            self.send_error(415)
            return
        try:
            size = int(self.headers.get("Content-Length", "0"))
            if not 0 < size <= 101_000_000:
                self.send_error(413)
                return
            payload = json.loads(self.rfile.read(size))
            if not isinstance(payload, dict):
                raise ValueError("Expected a JSON object")
            replay = payload.pop("replay", None)
            result = self.training_store().record_generation(payload, replay)
            response = self.json_response(result, 201)
        except (ValueError, TypeError, OverflowError) as error:
            response = self.json_response({"error": str(error)}, 400)
        except (OSError, sqlite3.Error):
            response = self.json_response({"error": "無法寫入訓練資料，請檢查磁碟空間與目錄權限"}, 500)
        self.copyfile(response, self.wfile)
        response.close()

    def send_head(self):
        from io import BytesIO
        parsed = urlsplit(self.path)
        if parsed.path.startswith("/training"):
            if not feature_flags(os.environ)["aiReplay"]:
                self.send_error(404)
                return None
            try:
                if parsed.path == "/training/api/generations":
                    query = parse_qs(parsed.query)
                    after = int(query.get("after", ["0"])[0])
                    if after < 0:
                        raise ValueError("Invalid generation cursor")
                    return self.json_response(self.training_store().snapshot(query.get("run", [None])[0], after))
                if parsed.path.startswith("/training/api/replays/"):
                    content = self.training_store().replay(parsed.path.rsplit("/", 1)[-1])
                    self.send_response(200)
                    self.send_header("Content-Type", "application/json; charset=utf-8")
                    self.send_header("Cache-Control", "no-store")
                    self.send_header("Content-Length", str(len(content)))
                    self.end_headers()
                    return BytesIO(content)
                names = {"/training/": "index.html", "/training": "index.html", "/training/app.js": "app.js", "/training/style.css": "style.css"}
                if parsed.path in names:
                    file = DIST.parent / "tools" / "training" / names[parsed.path]
                    content = file.read_bytes()
                    self.send_response(200)
                    self.send_header("Content-Type", self.guess_type(str(file)) + "; charset=utf-8")
                    self.send_header("Cache-Control", "no-store")
                    self.send_header("Content-Length", str(len(content)))
                    self.end_headers()
                    return BytesIO(content)
                self.send_error(404)
                return None
            except FileNotFoundError:
                self.send_error(404, "Replay was rotated out or does not exist")
                return None
            except (ValueError, TypeError) as error:
                return self.json_response({"error": str(error)}, 400)
            except (OSError, sqlite3.Error):
                return self.json_response({"error": "無法讀取訓練資料，請檢查資料目錄"}, 500)
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
