"""Optional Windows wrapper for LUT Deluxe: a local HTTP server + native WebView2 window.

Not required for GitHub Pages. Use build_windows.bat on Windows to create an EXE.
"""
import base64
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
import sys

import webview

ROOT = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parent.parent))


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_):
        return


class NativeSave:
    def save_file(self, filename, base64_data):
        """Called by the web app. Save As dialog then write the downloaded bytes."""
        try:
            safe_name = Path(filename).name
            selected = webview.windows[0].create_file_dialog(
                webview.SAVE_DIALOG, save_filename=safe_name
            )
            if not selected:
                return "cancelled"
            destination = Path(selected[0] if isinstance(selected, (tuple, list)) else selected)
            destination.write_bytes(base64.b64decode(base64_data, validate=True))
            return "saved"
        except Exception as exc:
            print(f"LUT Deluxe native Save As failed: {exc}")
            return "error"


def main():
    handler = partial(QuietHandler, directory=str(ROOT))
    server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    Thread(target=server.serve_forever, daemon=True).start()
    url = f"http://127.0.0.1:{server.server_port}/index.html"
    try:
        webview.create_window(
            "LUT Deluxe — Waveform Laboratory", url, js_api=NativeSave(),
            width=1480, height=930, min_size=(850, 620),
            background_color="#0b1019"
        )
        webview.start()
    finally:
        server.shutdown()


if __name__ == "__main__":
    main()
