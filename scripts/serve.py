"""Serve public/ the way GitHub Pages will, rebuilding it with drafts on every change.

scripts/serve runs this after its first build. It watches the sources, runs
`scripts/build.py --drafts` when one changes, and the open pages reload
themselves. The reload script is added as pages are served, so public/ stays
as the build wrote it.
"""

import os
import subprocess
import sys
import threading
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from io import BytesIO
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "public"
WATCHED = [ROOT / name for name in ("posts", "pages", "leaflets", "static", "templates", "scripts/build.py")]

# Changes with every build, and with every start, so open pages reload after either
build_id = str(time.time_ns())

# Polls rather than holding a connection open, which would use up the
# browser's six connections to localhost with six tabs open
RELOAD = b"""<script>
  (() => {
    let seen;
    setInterval(async () => {
      try {
        const id = await (await fetch("/__build", { cache: "no-store" })).text();
        if (seen && id !== seen) location.reload();
        seen = id;
      } catch {}  // scripts/serve is stopped or restarting; keep asking
    }, 1000);
  })();
</script>
"""


# Watching

def snapshot():
    """Every watched file's mtime and size, leaving out dotfiles like editors' swap files."""
    files = {}
    for top in WATCHED:
        for path in top.rglob("*") if top.is_dir() else [top]:
            if path.name.startswith("."):
                continue
            try:
                stat = path.stat()
            except OSError:  # deleted between listing and looking
                continue
            if path.is_file():
                files[path] = (stat.st_mtime_ns, stat.st_size)
    return files


def watch():
    global build_id
    before = snapshot()
    while True:
        time.sleep(0.3)
        now = snapshot()
        if now == before:
            continue
        changed = sorted(str(p.relative_to(ROOT)) for p in before.keys() ^ now.keys() | {
            p for p in now.keys() & before.keys() if now[p] != before[p]})
        before = now
        names = ", ".join(changed[:3]) + (f" and {len(changed) - 3} more" if len(changed) > 3 else "")
        print(f"\nChanged {names}, rebuilding")
        build = subprocess.run([sys.executable, str(ROOT / "scripts" / "build.py"), "--drafts"])
        if build.returncode == 0:
            build_id = str(time.time_ns())
        else:
            print("The build failed, so the last good build is still being served. Fix it and save again.")


# Serving

class Handler(SimpleHTTPRequestHandler):
    index_pages = ("index.html", "index.xml")  # /feed/ is feed/index.xml

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(PUBLIC), **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")  # so a reload picks up rebuilt CSS and images
        super().end_headers()

    def log_request(self, code="-", size="-"):
        if urlsplit(self.path).path != "/__build":  # once a second from every open page
            super().log_request(code, size)

    def do_GET(self):
        if urlsplit(self.path).path == "/__build":
            body = build_id.encode()
            self.send_response(200)
            self.send_header("Content-Type", "text/plain")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        super().do_GET()

    def send_head(self):
        path = self.translate_path(self.path)
        if os.path.isdir(path) and urlsplit(self.path).path.endswith("/"):
            path = os.path.join(path, "index.html")
        if path.endswith(".html"):
            try:
                return self.send_page(200, path)
            except OSError:  # missing, or mid-rebuild
                pass
        return super().send_head()

    def send_error(self, code, message=None, explain=None):
        if code == 404:  # GitHub Pages serves 404.html
            try:
                body = self.send_page(404, PUBLIC / "404.html")
            except OSError:
                return super().send_error(code, message, explain)
            self.wfile.write(body.read())
            return
        super().send_error(code, message, explain)

    def send_page(self, code, path):
        """Send the headers for an HTML page with the reload script added, and return its body."""
        body = Path(path).read_bytes().replace(b"</body>", RELOAD + b"</body>", 1)
        self.send_response(code)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        return BytesIO(body)


def main():
    port = int(sys.argv[1])
    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    threading.Thread(target=watch, daemon=True).start()
    print(f"Serving {PUBLIC} at http://localhost:{port}/ with drafts")
    print("Saving a post, page, leaflet, or the theme rebuilds it and reloads the browser. Ctrl-C to stop.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")


if __name__ == "__main__":
    main()
