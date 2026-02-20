import os
import threading
import sys
import time
import logging
import html
import urllib.request

import pystray
import uvicorn
import webview
from PIL import Image, ImageDraw

# Import the FastAPI app
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from main import app

if getattr(sys, "frozen", False):
    BASE_DIR = os.path.dirname(sys.executable)
else:
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
LOG_FILE_PATH = os.path.join(BASE_DIR, "ai_studio_desktop.log")

logger = logging.getLogger("ai_studio_desktop")
if not logger.handlers:
    logger.setLevel(logging.INFO)
    file_handler = logging.FileHandler(LOG_FILE_PATH, encoding="utf-8")
    file_handler.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(message)s"))
    logger.addHandler(file_handler)

# Global state
window = None
tray_icon = None
server_error = None


def log_exception(context: str, exc: BaseException):
    logger.exception("%s | %s", context, exc)


def global_excepthook(exc_type, exc_value, exc_traceback):
    logger.error("Unhandled desktop exception", exc_info=(exc_type, exc_value, exc_traceback))


sys.excepthook = global_excepthook


def backend_is_ready() -> bool:
    try:
        with urllib.request.urlopen("http://127.0.0.1:8000/api/config", timeout=1.5) as response:
            return response.status == 200
    except Exception:
        return False


def start_server():
    global server_error
    try:
        config = uvicorn.Config(app, host="127.0.0.1", port=8000, log_level="error")
        logger.info("Starting backend server at http://127.0.0.1:8000")
        server = uvicorn.Server(config)
        server.run()
    except Exception as exc:
        server_error = str(exc)
        log_exception("Backend startup failed", exc)


def create_icon():
    width = 64
    height = 64
    image = Image.new("RGB", (width, height), (33, 150, 243))
    dc = ImageDraw.Draw(image)
    dc.rectangle((16, 16, 48, 48), fill="white")
    return image


def on_quit(icon, item):
    icon.stop()
    if window:
        window.destroy()
    os._exit(0)


def on_open(icon, item):
    if window:
        window.restore()
        window.show()
        window.focus()


def setup_tray():
    icon_image = create_icon()
    menu = pystray.Menu(
        pystray.MenuItem("Open AI Studio", on_open, default=True),
        pystray.MenuItem("Quit", on_quit),
    )
    return pystray.Icon("AI Studio", icon_image, "AI Studio", menu)


def build_startup_error_html(error_text: str) -> str:
    safe_error = html.escape(error_text or "Unknown startup error")
    safe_log_path = html.escape(LOG_FILE_PATH)
    return f"""
<!doctype html>
<html>
<head>
  <meta charset=\"utf-8\" />
  <title>AI Studio startup error</title>
  <style>
    body {{ font-family: Segoe UI, Arial, sans-serif; margin: 0; background: #151617; color: #e8e8e8; }}
    .wrap {{ max-width: 920px; margin: 0 auto; padding: 28px; }}
    .card {{ background: #1e1f20; border: 1px solid #333; border-radius: 14px; padding: 20px; }}
    h1 {{ margin-top: 0; font-size: 24px; }}
    code {{ display: block; background: #0f1011; border: 1px solid #2f2f2f; border-radius: 8px; padding: 10px; word-break: break-all; }}
    p {{ color: #c5c5c5; line-height: 1.4; }}
  </style>
</head>
<body>
  <div class=\"wrap\">
    <div class=\"card\">
      <h1>AI Studio failed to start</h1>
      <p>The backend server did not start, so the interface could not be loaded.</p>
      <p>Error details:</p>
      <code>{safe_error}</code>
      <p>Desktop log:</p>
      <code>{safe_log_path}</code>
      <p>Try launching again after checking API key and local files.</p>
    </div>
  </div>
</body>
</html>
"""


def start_webview():
    global window

    logger.info("Waiting for backend readiness")
    deadline_seconds = 25
    start_ts = time.time()
    backend_ready = False

    while time.time() - start_ts < deadline_seconds:
        if backend_is_ready():
            backend_ready = True
            break
        if server_error:
            break
        time.sleep(0.5)

    if backend_ready:
        logger.info("Backend is ready; opening app window")
        window = webview.create_window(
            "AI Studio",
            "http://localhost:8000",
            width=1200,
            height=800,
            min_size=(800, 600),
            minimized=False,
            text_select=True,
        )
    else:
        message = server_error or "Timeout waiting for backend at http://127.0.0.1:8000"
        logger.error("Opening startup error page: %s", message)
        window = webview.create_window(
            "AI Studio - Startup Error",
            html=build_startup_error_html(message),
            width=1000,
            height=720,
            min_size=(760, 520),
            text_select=True,
        )

    webview.start()


if __name__ == "__main__":
    try:
        t_server = threading.Thread(target=start_server, daemon=True)
        t_server.start()

        tray_icon = setup_tray()
        t_tray = threading.Thread(target=tray_icon.run, daemon=True)
        t_tray.start()

        start_webview()
    except Exception as exc:
        log_exception("Desktop bootstrap failed", exc)
    finally:
        os._exit(0)
