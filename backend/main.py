from fastapi import FastAPI, HTTPException, UploadFile, File, Form, WebSocket, WebSocketDisconnect, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel
from typing import Any, Dict, List, Optional, Set, Tuple
from google import genai
from google.genai import types
from logging.handlers import RotatingFileHandler
import logging
import json
import os
import subprocess
import tempfile
import uuid
import time
import re
import html
import zipfile
import urllib.request
from datetime import datetime, timezone, timedelta

app = FastAPI()

# Mount attachments directory to serve downloaded files
import sys

DATA_ROOT_OVERRIDE = (os.environ.get("WORKBOOST_DATA_DIR") or "").strip()

# Determine if running in a frozen bundle
if getattr(sys, 'frozen', False):
    # If frozen, we are effectively running from the temp folder
    # but we want "user data" (attachments, history) to be near the EXE
    EXE_DIR = os.path.dirname(sys.executable)
    
    # Static assets (like frontend) are in the temp folder (_MEIPASS)
    BUNDLE_DIR = sys._MEIPASS 
    
    BASE_DIR = EXE_DIR # storage root
    HISTORY_FILE_DIR = DATA_ROOT_OVERRIDE or BASE_DIR
    ATTACHMENTS_PATH = os.path.join(HISTORY_FILE_DIR, "attachments")
    
    # Frontend dist will be bundled inside the temp folder
    # We will configure spec to put 'frontend/dist' at root of bundle or similar
    # Let's say we put it at 'frontend/dist' inside bundle
    FRONTEND_DIST_DIR = os.path.join(BUNDLE_DIR, "frontend", "dist")

else:
    # Running normally
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    default_history_dir = os.path.dirname(os.path.dirname(BASE_DIR)) # E:\work\work boost
    HISTORY_FILE_DIR = DATA_ROOT_OVERRIDE or default_history_dir
    ATTACHMENTS_PATH = os.path.join(HISTORY_FILE_DIR, "attachments") if DATA_ROOT_OVERRIDE else os.path.join(BASE_DIR, "attachments")
    FRONTEND_DIST_DIR = os.path.join(os.path.dirname(BASE_DIR), "frontend", "dist")


LOG_FILE_PATH = os.path.join(BASE_DIR, "ai_studio_backend.log")
DESKTOP_LOG_FILE_PATH = os.path.join(BASE_DIR, "ai_studio_desktop.log")
WRITER_MODEL = "gemini-3-flash-preview"
DEFAULT_CHUNK_SIZE = 40
DEFAULT_CHUNK_OVERLAP = 4
DEFAULT_WRITER_TOKEN_BUDGET = 1000
if HISTORY_FILE_DIR:
    os.makedirs(HISTORY_FILE_DIR, exist_ok=True)
OPS_DIR = os.path.join(HISTORY_FILE_DIR, ".ai", "ops")
OPS_STORE_PATH = os.path.join(OPS_DIR, "phase1_store.json")
BACKUP_DIR = os.path.join(HISTORY_FILE_DIR, ".ai", "backups")
PIPELINE_STAGE_ORDER = [
    "discovery",
    "qualified",
    "proposal",
    "interview",
    "negotiation",
    "won",
    "lost",
]
TERMINAL_PIPELINE_STAGES = {"won", "lost"}
EXECUTION_STATUS_ORDER = ["planning", "active", "at_risk", "blocked", "done", "archived"]
MILESTONE_STATUS_ORDER = ["todo", "in_progress", "blocked", "done"]
TEXT_ATTACHMENT_EXTENSIONS = {
    ".txt", ".md", ".json", ".csv", ".xml", ".html", ".css",
    ".js", ".ts", ".py", ".java", ".c", ".cpp", ".yml", ".yaml",
}
AUTOFILL_MAX_SOURCE_CHARS = 16000
AUTOFILL_MAX_URL_FETCH_CHARS = 9000
AUTOFILL_MAX_FILE_TEXT_CHARS = 9000
AUTOFILL_MIME_MAP = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".pdf": "application/pdf",
    ".txt": "text/plain",
    ".md": "text/markdown",
    ".py": "text/x-python",
    ".js": "text/javascript",
    ".ts": "text/typescript",
    ".json": "application/json",
    ".csv": "text/csv",
}
logger = logging.getLogger("ai_studio_backend")
if not logger.handlers:
    logger.setLevel(logging.INFO)
    formatter = logging.Formatter("%(asctime)s [%(levelname)s] %(message)s")
    handler = RotatingFileHandler(LOG_FILE_PATH, maxBytes=2_000_000, backupCount=3, encoding="utf-8")
    handler.setFormatter(formatter)
    logger.addHandler(handler)


def log_exception(context: str, exc: Exception) -> str:
    error_id = str(uuid.uuid4())[:8]
    logger.exception("%s | error_id=%s | %s", context, error_id, exc)
    return error_id


def to_user_error(message: str, error_id: str) -> str:
    return f"{message} (error_id: {error_id}). Log: {LOG_FILE_PATH}"


def load_env_file():
    """Load KEY=VALUE pairs from .env into os.environ without overriding existing vars."""
    candidate_paths = []

    if getattr(sys, 'frozen', False):
        candidate_paths.extend([
            os.path.join(BASE_DIR, ".env"),
            os.path.join(os.path.dirname(BASE_DIR), ".env"),
        ])
    else:
        candidate_paths.extend([
            os.path.join(HISTORY_FILE_DIR, ".env"),
            os.path.join(os.path.dirname(BASE_DIR), ".env"),
            os.path.join(BASE_DIR, ".env"),
        ])

    for env_path in candidate_paths:
        if not os.path.exists(env_path):
            continue

        try:
            with open(env_path, "r", encoding="utf-8") as env_file:
                for raw_line in env_file:
                    line = raw_line.strip()
                    if not line or line.startswith("#") or "=" not in line:
                        continue
                    key, value = line.split("=", 1)
                    key = key.strip()
                    value = value.strip().strip('"').strip("'")
                    if re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", key):
                        os.environ.setdefault(key, value)
            logger.info("Loaded environment from %s", env_path)
            return env_path
        except Exception as e:
            logger.warning("Failed loading .env from %s: %s", env_path, e)

    return None


ENV_FILE_PATH = load_env_file()
DEFAULT_API_KEY = os.environ.get("GOOGLE_API_KEY") or os.environ.get("GEMINI_API_KEY")

if not os.path.exists(ATTACHMENTS_PATH):
    os.makedirs(ATTACHMENTS_PATH)
app.mount("/attachments", StaticFiles(directory=ATTACHMENTS_PATH), name="attachments")

if os.path.exists(FRONTEND_DIST_DIR):
    app.mount("/assets", StaticFiles(directory=os.path.join(FRONTEND_DIST_DIR, "assets")), name="assets")

@app.get("/")
async def read_index():
    return FileResponse(os.path.join(FRONTEND_DIST_DIR, "index.html"))


@app.get("/api/config")
async def get_config():
    return {
        "api_key_available": bool(DEFAULT_API_KEY),
        "env_file": ENV_FILE_PATH,
        "log_file": LOG_FILE_PATH,
        "desktop_log_file": DESKTOP_LOG_FILE_PATH,
    }


@app.post("/api/open_log")
async def open_log(data: dict):
    target = (data.get("target") or "backend").strip().lower()
    if target == "desktop":
        log_path = DESKTOP_LOG_FILE_PATH
    else:
        log_path = LOG_FILE_PATH

    if not os.path.exists(log_path):
        raise HTTPException(status_code=404, detail=f"Log file not found: {log_path}")

    try:
        if os.name == "nt":
            os.startfile(log_path)  # type: ignore[attr-defined]
        elif sys.platform == "darwin":
            subprocess.Popen(["open", log_path])
        else:
            subprocess.Popen(["xdg-open", log_path])
        return {"status": "success", "path": log_path}
    except Exception as e:
        error_id = log_exception(f"Failed to open log file: {log_path}", e)
        raise HTTPException(status_code=500, detail=to_user_error("Cannot open log file", error_id))


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    error_id = log_exception(f"Unhandled error on {request.method} {request.url.path}", exc)
    return JSONResponse(
        status_code=500,
        content={"detail": to_user_error("Internal server error", error_id)},
    )

BASE_URL = "http://localhost:8000"

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global chat session storage (simple in-memory for this single-user tool)
client = None  # genai.Client instance
chat_session = None
current_history = [] 
total_tokens = 0
current_file_path = None
current_model_name = None
current_google_search = "false"
current_code_execution = "false"
current_system_instructions = ""
canonical_memory: Dict[str, Any] = {}
memory_dirty = True


class ConnectionManager:
    def __init__(self):
        self.connections: Set[WebSocket] = set()

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.connections.add(websocket)

    def disconnect(self, websocket: WebSocket):
        self.connections.discard(websocket)

    async def broadcast_json(self, payload: dict):
        dead_connections = []
        for ws in self.connections:
            try:
                await ws.send_json(payload)
            except Exception:
                dead_connections.append(ws)
        for ws in dead_connections:
            self.disconnect(ws)


ws_manager = ConnectionManager()


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await ws_manager.connect(websocket)
    try:
        await websocket.send_json({
            "type": "connected",
            "file": current_file_path,
        })
        while True:
            # Keep the socket alive; we don't require client messages now.
            await websocket.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)
    except Exception:
        ws_manager.disconnect(websocket)


def estimate_tokens_from_text(text: str) -> int:
    if not text:
        return 0
    return max(1, int(len(text) / 3.3))


def normalize_whitespace(text: str) -> str:
    return re.sub(r"\s+", " ", text or "").strip()


def truncate_text(text: str, max_chars: int) -> str:
    cleaned = normalize_whitespace(text)
    if len(cleaned) <= max_chars:
        return cleaned
    return cleaned[: max_chars - 3].rstrip() + "..."


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def normalize_timestamp(value: Any) -> str:
    if value is None:
        return now_iso()
    if isinstance(value, (int, float)):
        # Heuristic: values > 10^11 are likely milliseconds.
        ts = float(value) / 1000.0 if float(value) > 1e11 else float(value)
        return datetime.fromtimestamp(ts, timezone.utc).isoformat(timespec="seconds")
    if isinstance(value, str):
        raw = value.strip()
        if not raw:
            return now_iso()
        if raw.endswith("Z"):
            return raw[:-1] + "+00:00"
        return raw
    return now_iso()


def parse_number(value: Any) -> Optional[float]:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        cleaned = value.strip().replace(",", "")
        cleaned = re.sub(r"[^0-9.\-]", "", cleaned)
        if not cleaned:
            return None
        try:
            return float(cleaned)
        except ValueError:
            return None
    return None


def parse_bool(value: Any, default: bool = False) -> bool:
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    if isinstance(value, str):
        lowered = normalize_whitespace(value).lower()
        if lowered in {"1", "true", "yes", "y", "on"}:
            return True
        if lowered in {"0", "false", "no", "n", "off"}:
            return False
    return default


def normalize_string_list(value: Any) -> List[str]:
    if isinstance(value, list):
        items = value
    elif isinstance(value, str):
        items = re.split(r",|\n|;", value)
    else:
        return []

    normalized: List[str] = []
    seen = set()
    for item in items:
        text = normalize_whitespace(str(item))
        if not text:
            continue
        key = text.lower()
        if key in seen:
            continue
        seen.add(key)
        normalized.append(text)
    return normalized


def normalize_pipeline_stage(value: Any) -> str:
    candidate = normalize_whitespace(str(value or "")).lower()
    aliases = {
        "lead": "discovery",
        "new": "discovery",
        "screening": "qualified",
        "shortlist": "qualified",
        "applied": "proposal",
        "proposal_sent": "proposal",
        "call": "interview",
        "meeting": "interview",
        "negotiating": "negotiation",
        "closed_won": "won",
        "closed_lost": "lost",
    }
    candidate = aliases.get(candidate, candidate)
    if candidate in PIPELINE_STAGE_ORDER:
        return candidate
    return "discovery"


def normalize_execution_status(value: Any) -> str:
    candidate = normalize_whitespace(str(value or "")).lower()
    aliases = {
        "todo": "planning",
        "in_progress": "active",
        "in-progress": "active",
        "risk": "at_risk",
        "at-risk": "at_risk",
        "paused": "blocked",
        "completed": "done",
        "closed": "done",
    }
    candidate = aliases.get(candidate, candidate)
    if candidate in EXECUTION_STATUS_ORDER:
        return candidate
    return "planning"


def normalize_milestone_status(value: Any) -> str:
    candidate = normalize_whitespace(str(value or "")).lower()
    aliases = {
        "pending": "todo",
        "active": "in_progress",
        "in-progress": "in_progress",
        "in progress": "in_progress",
        "complete": "done",
        "completed": "done",
        "pause": "blocked",
    }
    candidate = aliases.get(candidate, candidate)
    if candidate in MILESTONE_STATUS_ORDER:
        return candidate
    return "todo"


def normalize_iso_date(value: Any) -> str:
    text = normalize_whitespace(str(value or ""))
    if not text:
        return ""
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", text):
        return text
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}T.*", text):
        return text[:10]
    try:
        return datetime.fromisoformat(text.replace("Z", "+00:00")).date().isoformat()
    except Exception:
        return ""


def parse_iso_date(value: Any):
    normalized = normalize_iso_date(value)
    if not normalized:
        return None
    try:
        return datetime.fromisoformat(normalized).date()
    except Exception:
        return None


def compute_milestone_progress(milestones: List[Dict[str, Any]]) -> float:
    if not milestones:
        return 0.0
    done = 0
    for item in milestones:
        if normalize_milestone_status(item.get("status")) == "done":
            done += 1
    return round((done / len(milestones)) * 100.0, 1)


def normalize_milestones(value: Any) -> List[Dict[str, Any]]:
    raw_items: List[Any] = []
    if isinstance(value, list):
        raw_items = value
    elif isinstance(value, str):
        raw_items = normalize_string_list(value)

    normalized: List[Dict[str, Any]] = []
    for item in raw_items:
        if isinstance(item, str):
            title = truncate_text(item, 120)
            if not title:
                continue
            normalized.append(
                {
                    "id": str(uuid.uuid4()),
                    "title": title,
                    "status": "todo",
                    "due_date": "",
                    "completed_at": "",
                    "estimate_hours": None,
                    "actual_hours": None,
                }
            )
            continue

        if not isinstance(item, dict):
            continue
        title = truncate_text(str(item.get("title", "")), 120)
        if not title:
            continue
        status = normalize_milestone_status(item.get("status"))
        completed_at = normalize_iso_date(item.get("completed_at"))
        if status == "done" and not completed_at:
            completed_at = now_iso()[:10]
        normalized.append(
            {
                "id": normalize_whitespace(str(item.get("id", ""))) or str(uuid.uuid4()),
                "title": title,
                "status": status,
                "due_date": normalize_iso_date(item.get("due_date")),
                "completed_at": completed_at,
                "estimate_hours": round(parse_number(item.get("estimate_hours")), 2) if parse_number(item.get("estimate_hours")) is not None else None,
                "actual_hours": round(parse_number(item.get("actual_hours")), 2) if parse_number(item.get("actual_hours")) is not None else None,
            }
        )

    return normalized[:20]


def infer_mime_type(filename: str, provided_mime: Optional[str] = None) -> str:
    mime = normalize_whitespace(str(provided_mime or "")).lower()
    if mime and mime != "application/octet-stream":
        return mime
    suffix = os.path.splitext(filename or "")[1].lower()
    return AUTOFILL_MIME_MAP.get(suffix, "text/plain")


def strip_html_to_text(raw_html: str) -> str:
    text = re.sub(r"(?is)<(script|style).*?>.*?</\1>", " ", raw_html or "")
    text = re.sub(r"(?s)<[^>]+>", " ", text)
    text = html.unescape(text)
    return normalize_whitespace(text)


def fetch_url_text_snippet(url: str, max_chars: int = AUTOFILL_MAX_URL_FETCH_CHARS) -> str:
    target_url = normalize_whitespace(url)
    if not target_url.lower().startswith(("http://", "https://")):
        return ""
    request = urllib.request.Request(
        target_url,
        headers={"User-Agent": "Mozilla/5.0 AIStudioClone/1.0"},
    )
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            content_type = str(response.headers.get("Content-Type", "")).lower()
            raw = response.read(800_000)
        decoded = raw.decode("utf-8", errors="ignore")
        text = strip_html_to_text(decoded) if "text/html" in content_type else normalize_whitespace(decoded)
        return truncate_text(text, max_chars)
    except Exception as e:
        logger.info("Autofill URL fetch failed for %s: %s", target_url, e)
        return ""


def extract_json_object(text: str) -> Optional[Dict[str, Any]]:
    raw = str(text or "").strip()
    if not raw:
        return None

    fenced = re.search(r"```(?:json)?\s*(\{.*\})\s*```", raw, re.IGNORECASE | re.DOTALL)
    if fenced:
        raw = fenced.group(1).strip()

    try:
        parsed = json.loads(raw)
        if isinstance(parsed, dict):
            return parsed
    except Exception:
        pass

    first = raw.find("{")
    last = raw.rfind("}")
    if first >= 0 and last > first:
        candidate = raw[first:last + 1]
        try:
            parsed = json.loads(candidate)
            if isinstance(parsed, dict):
                return parsed
        except Exception:
            return None
    return None


def normalize_autofill_labels(value: Any, limit: int = 8) -> List[str]:
    labels = normalize_string_list(value)
    cleaned: List[str] = []
    for label in labels:
        normalized = truncate_text(label, 80)
        if normalized:
            cleaned.append(normalized)
        if len(cleaned) >= limit:
            break
    return cleaned


def detect_keyword_hits(text_blob: str, keywords: List[str], limit: int = 8) -> List[str]:
    hits: List[str] = []
    normalized_blob = normalize_whitespace(text_blob).lower()
    if not normalized_blob:
        return hits
    seen = set()
    for keyword in keywords:
        token = normalize_whitespace(str(keyword)).lower()
        if not token or token in seen:
            continue
        if token in normalized_blob:
            hits.append(token)
            seen.add(token)
        if len(hits) >= limit:
            break
    return hits


def parse_compact_number_token(value: Any) -> Optional[float]:
    if value is None:
        return None

    token = normalize_whitespace(str(value)).lower()
    if not token:
        return None

    token = token.replace("usd", "").replace("us$", "").replace("$", "")
    token = token.replace(",", "").replace(" ", "")
    match = re.match(r"^([0-9]+(?:\.[0-9]+)?)([km])?\+?$", token)
    if not match:
        return parse_number(token)

    number = float(match.group(1))
    suffix = match.group(2)
    if suffix == "k":
        number *= 1000.0
    elif suffix == "m":
        number *= 1000000.0
    return number


def extract_budget_signals(text_blob: str) -> Dict[str, Any]:
    text = normalize_whitespace(text_blob).lower()
    if not text:
        return {
            "fixed_values": [],
            "hourly_values": [],
            "fixed_min": None,
            "fixed_max": None,
            "hourly_min": None,
            "hourly_max": None,
        }

    fixed_values: List[float] = []
    hourly_values: List[float] = []
    number_token = r"[0-9][0-9,\s]*(?:\.\d+)?\s*[km]?"

    # Hourly ranges, e.g. "$20-$35/hr" or "20 to 35 per hour"
    for match in re.finditer(
        rf"\$?\s*({number_token})\s*(?:-|to|–)\s*\$?\s*({number_token})\s*(?:/h|/hr|per hour|hourly)\b",
        text,
    ):
        v1 = parse_compact_number_token(match.group(1))
        v2 = parse_compact_number_token(match.group(2))
        if v1 is not None and 3 <= v1 <= 800:
            hourly_values.append(float(v1))
        if v2 is not None and 3 <= v2 <= 800:
            hourly_values.append(float(v2))

    # Hourly ranges with explicit hourly wording in the same phrase.
    for match in re.finditer(
        rf"(?:hourly|per hour|rate)[^.\n]{{0,28}}\$?\s*({number_token})\s*(?:-|to|–)\s*\$?\s*({number_token})",
        text,
    ):
        v1 = parse_compact_number_token(match.group(1))
        v2 = parse_compact_number_token(match.group(2))
        if v1 is not None and 3 <= v1 <= 800:
            hourly_values.append(float(v1))
        if v2 is not None and 3 <= v2 <= 800:
            hourly_values.append(float(v2))

    # Hourly singles, e.g. "$25/hr"
    for match in re.finditer(rf"\$?\s*({number_token})\s*(?:/h|/hr|per hour|hourly)\b", text):
        value = parse_compact_number_token(match.group(1))
        if value is not None and 3 <= value <= 800:
            hourly_values.append(float(value))

    # Hourly single values near hourly words, e.g. "hourly rate 60"
    for match in re.finditer(rf"(?:hourly|per hour|rate)[^.\n]{{0,16}}\$?\s*({number_token})", text):
        value = parse_compact_number_token(match.group(1))
        if value is not None and 3 <= value <= 800:
            hourly_values.append(float(value))

    # Fixed budget ranges near budget words
    for match in re.finditer(
        rf"(?:budget|fixed|price|payment|pay)[^.\n]{{0,40}}\$?\s*({number_token})\s*(?:-|to|–)\s*\$?\s*({number_token})",
        text,
    ):
        v1 = parse_compact_number_token(match.group(1))
        v2 = parse_compact_number_token(match.group(2))
        if v1 is not None and 50 <= v1 <= 250000:
            fixed_values.append(float(v1))
        if v2 is not None and 50 <= v2 <= 250000:
            fixed_values.append(float(v2))

    # Fixed singles near budget words
    for match in re.finditer(rf"(?:budget|fixed|price|payment|pay)[^.\n]{{0,24}}\$?\s*({number_token})", text):
        value = parse_compact_number_token(match.group(1))
        if value is not None and 50 <= value <= 250000:
            fixed_values.append(float(value))

    # Explicit upper-bound budget phrasing.
    for match in re.finditer(
        rf"(?:budget|fixed|price|payment|pay)[^.\n]{{0,40}}(?:up to|max(?:imum)?|under|below|less than|not more than)\s*\$?\s*({number_token})",
        text,
    ):
        value = parse_compact_number_token(match.group(1))
        if value is not None and 50 <= value <= 250000:
            fixed_values.append(float(value))

    # Generic "$1234" mentions (excluding explicit hourly snippets)
    for match in re.finditer(rf"\$\s*({number_token})", text):
        value = parse_compact_number_token(match.group(1))
        snippet = text[max(0, match.start() - 10): match.end() + 12]
        if value is None:
            continue
        if "/h" in snippet or "/hr" in snippet or "hour" in snippet:
            if 3 <= value <= 800:
                hourly_values.append(float(value))
            continue
        if 50 <= value <= 250000:
            fixed_values.append(float(value))

    fixed_values = sorted(set(round(v, 2) for v in fixed_values))
    hourly_values = sorted(set(round(v, 2) for v in hourly_values))

    return {
        "fixed_values": fixed_values,
        "hourly_values": hourly_values,
        "fixed_min": fixed_values[0] if fixed_values else None,
        "fixed_max": fixed_values[-1] if fixed_values else None,
        "hourly_min": hourly_values[0] if hourly_values else None,
        "hourly_max": hourly_values[-1] if hourly_values else None,
    }


def extract_effort_signals(text_blob: str) -> Dict[str, Any]:
    text = normalize_whitespace(text_blob).lower()
    if not text:
        return {
            "hours_values": [],
            "hours_min": None,
            "hours_max": None,
        }

    hours_values: List[float] = []
    number_token = r"[0-9][0-9,\s]*(?:\.\d+)?"
    hours_per_day = 6.0
    hours_per_week = 28.0

    # Explicit hour ranges, e.g. "10-20 hours".
    for match in re.finditer(
        rf"({number_token})\s*(?:-|to|–)\s*({number_token})\s*(?:hours?|hrs?)\b",
        text,
    ):
        v1 = parse_number(match.group(1))
        v2 = parse_number(match.group(2))
        if v1 is not None and 1 <= v1 <= 1200:
            hours_values.append(float(v1))
        if v2 is not None and 1 <= v2 <= 1200:
            hours_values.append(float(v2))

    # Explicit hour single, e.g. "40 hours".
    for match in re.finditer(rf"(?<!/)\b({number_token})\s*(?:hours?|hrs?)\b", text):
        value = parse_number(match.group(1))
        if value is not None and 1 <= value <= 1200:
            hours_values.append(float(value))

    # Day ranges to hours.
    for match in re.finditer(
        rf"({number_token})\s*(?:-|to|–)\s*({number_token})\s*(?:days?|d)\b",
        text,
    ):
        v1 = parse_number(match.group(1))
        v2 = parse_number(match.group(2))
        if v1 is not None and 1 <= v1 <= 180:
            hours_values.append(float(v1) * hours_per_day)
        if v2 is not None and 1 <= v2 <= 180:
            hours_values.append(float(v2) * hours_per_day)

    # Week ranges to hours.
    for match in re.finditer(
        rf"({number_token})\s*(?:-|to|–)\s*({number_token})\s*(?:weeks?|wks?|wk)\b",
        text,
    ):
        v1 = parse_number(match.group(1))
        v2 = parse_number(match.group(2))
        if v1 is not None and 0.5 <= v1 <= 52:
            hours_values.append(float(v1) * hours_per_week)
        if v2 is not None and 0.5 <= v2 <= 52:
            hours_values.append(float(v2) * hours_per_week)

    # Single day/week values.
    for match in re.finditer(rf"\b({number_token})\s*(?:days?|d)\b", text):
        value = parse_number(match.group(1))
        if value is not None and 1 <= value <= 180:
            hours_values.append(float(value) * hours_per_day)
    for match in re.finditer(rf"\b({number_token})\s*(?:weeks?|wks?|wk)\b", text):
        value = parse_number(match.group(1))
        if value is not None and 0.5 <= value <= 52:
            hours_values.append(float(value) * hours_per_week)

    # Keep a compact, deduplicated set.
    hours_values = sorted(set(round(v, 2) for v in hours_values if 1 <= v <= 1200))
    return {
        "hours_values": hours_values,
        "hours_min": hours_values[0] if hours_values else None,
        "hours_max": hours_values[-1] if hours_values else None,
    }


def evaluate_intake_gate(
    text_blob: str,
    expected_revenue_usd: Optional[float],
    estimated_hourly_usd: Optional[float],
    scoring_profile: Dict[str, Any],
) -> Dict[str, Any]:
    merged_profile = merge_scoring_profile(scoring_profile)
    guardrails = merged_profile.get("intake_guardrails", {})

    min_budget_usd = float(parse_number(guardrails.get("min_budget_usd")) or 1000.0)
    min_hourly_usd = float(parse_number(guardrails.get("min_hourly_usd")) or 45.0)
    min_hourly_exception_usd = float(parse_number(guardrails.get("min_hourly_exception_usd")) or 50.0)
    reject_score_threshold = float(parse_number(guardrails.get("reject_score_threshold")) or 50.0)
    skip_model_on_reject = parse_bool(guardrails.get("skip_model_on_reject"), default=True)
    hard_reject_on_low_budget = parse_bool(guardrails.get("hard_reject_on_low_budget"), default=True)

    budget_signals = extract_budget_signals(text_blob)
    fixed_max = budget_signals.get("fixed_max")
    hourly_max = budget_signals.get("hourly_max")
    hard_reject_keywords = list(merged_profile.get("hard_reject_keywords", []))
    heavy_penalty_keywords = list(merged_profile.get("heavy_penalty_keywords", []))
    risk_marker_keywords = list(merged_profile.get("risk_marker_keywords", merged_profile.get("risk_keywords", [])))

    normalized_text = normalize_whitespace(text_blob).lower()
    hard_reject_hits = detect_keyword_hits(normalized_text, hard_reject_keywords, limit=8)
    heavy_penalty_hits = detect_keyword_hits(normalized_text, heavy_penalty_keywords, limit=8)
    risk_marker_hits = detect_keyword_hits(normalized_text, risk_marker_keywords, limit=8)

    heavy_penalty_total = len(heavy_penalty_hits) * 50.0
    risk_penalty_total = len(risk_marker_hits) * 20.0
    intake_score = max(0.0, 100.0 - heavy_penalty_total - risk_penalty_total)

    reject_reasons: List[str] = []
    low_budget_reject = False
    low_hourly_reject = False
    hard_term_reject = False
    low_score_reject = False

    parsed_budget = expected_revenue_usd if expected_revenue_usd is not None else fixed_max
    parsed_hourly = estimated_hourly_usd if estimated_hourly_usd is not None else hourly_max

    if parsed_budget is not None and parsed_budget < min_budget_usd:
        if parsed_hourly is None or parsed_hourly < min_hourly_exception_usd:
            low_budget_reject = True
            reject_reasons.append(
                f"Budget ${parsed_budget:.0f} is below minimum ${min_budget_usd:.0f} and hourly exception ${min_hourly_exception_usd:.0f}/h is not met."
            )

    if estimated_hourly_usd is not None and estimated_hourly_usd < min_hourly_usd:
        low_hourly_reject = True
        reject_reasons.append(f"Estimated hourly ${estimated_hourly_usd:.0f}/h is below minimum ${min_hourly_usd:.0f}/h.")
    elif hourly_max is not None and hourly_max < min_hourly_usd:
        low_hourly_reject = True
        reject_reasons.append(f"Detected hourly up to ${hourly_max:.0f}/h, below minimum ${min_hourly_usd:.0f}/h.")

    if hard_reject_hits:
        hard_term_reject = True
        reject_reasons.append(f"Hard reject terms detected: {', '.join(hard_reject_hits)}.")

    if intake_score < reject_score_threshold:
        low_score_reject = True
        reject_reasons.append(
            f"Intake risk score {intake_score:.0f} is below threshold {reject_score_threshold:.0f}."
        )

    rejected = low_budget_reject or low_hourly_reject or hard_term_reject or low_score_reject
    return {
        "status": "reject" if rejected else "allow",
        "rejected": rejected,
        "reasons": reject_reasons[:6],
        "min_budget_usd": min_budget_usd,
        "min_hourly_usd": min_hourly_usd,
        "min_hourly_exception_usd": min_hourly_exception_usd,
        "reject_score_threshold": reject_score_threshold,
        "skip_model_on_reject": skip_model_on_reject,
        "hard_reject_on_low_budget": hard_reject_on_low_budget,
        "parsed_budget_usd": parsed_budget,
        "parsed_hourly_usd": parsed_hourly,
        "hard_reject_hits": hard_reject_hits,
        "heavy_penalty_hits": heavy_penalty_hits,
        "risk_marker_hits": risk_marker_hits,
        "intake_score": round(intake_score, 2),
        "low_budget_reject": low_budget_reject,
        "low_hourly_reject": low_hourly_reject,
        "hard_term_reject": hard_term_reject,
        "low_score_reject": low_score_reject,
        "decision": "REJECTED" if rejected else "PROCEED_TO_STRATEGIST_AI",
        "penalties": {
            "heavy_penalty_per_hit": 50.0,
            "risk_marker_penalty_per_hit": 20.0,
            "heavy_penalty_total": heavy_penalty_total,
            "risk_marker_penalty_total": risk_penalty_total,
        },
        "signals": budget_signals,
    }


def guess_title_from_text(text_blob: str) -> str:
    raw = str(text_blob or "")
    if not raw:
        return ""
    lines = [line.strip() for line in re.split(r"[\r\n]+", raw) if line.strip()]
    for line in lines[:12]:
        normalized = normalize_whitespace(line)
        if len(normalized) < 12 or len(normalized) > 160:
            continue
        if normalized.lower().startswith(("job url:", "budget:", "hourly:", "payment:")):
            continue
        return normalized
    return ""


def default_scoring_profile() -> Dict[str, Any]:
    return {
        "version": 2,
        "preferred_keywords": [
            "react", "next.js", "typescript", "javascript",
            "python", "fastapi", "api", "saas", "automation", "web",
        ],
        "risk_keywords": [
            "strict deadline", "penalty", "refund", "pixel perfect", "mobile optimization",
            "urgent", "asap", "rush",
        ],
        "heavy_penalty_keywords": [
            "simple fix", "should take 5 minutes", "easy job",
            "i am a developer too", "technical background",
            "need it yesterday", "asap", "urgent",
            "time tracker", "screen record",
        ],
        "risk_marker_keywords": [
            "strict deadline", "penalty", "refund",
            "pixel perfect", "mobile optimization",
        ],
        "toxicity_keywords": [
            "arbitration", "refund", "chargeback", "dispute", "legal action",
            "escalate", "threat", "lawsuit", "fraud", "scam",
            "you must do this for free", "we won't pay", "non payment",
        ],
        "hard_reject_keywords": [
            "unlimited revisions",
            "profit share", "equity", "co-founder", "cofounder",
            "unpaid test", "sample work",
            "trial free", "student rate", "pay later",
            "work now pay later", "free work", "only for portfolio",
        ],
        "intake_guardrails": {
            "min_budget_usd": 1000.0,
            "min_hourly_usd": 45.0,
            "min_hourly_exception_usd": 50.0,
            "reject_score_threshold": 50.0,
            "skip_model_on_reject": True,
            "hard_reject_on_low_budget": True,
        },
        "weights": {
            "hourly_fit": 0.28,
            "budget": 0.30,
            "clarity": 0.15,
            "strategic_fit": 0.17,
            "risk": 0.10,
        },
    }


def merge_scoring_profile(profile: Any) -> Dict[str, Any]:
    default_profile = default_scoring_profile()
    source = profile if isinstance(profile, dict) else {}
    merged = dict(default_profile)
    merged.update(source)

    for key in ["preferred_keywords", "risk_keywords", "heavy_penalty_keywords", "toxicity_keywords", "hard_reject_keywords"]:
        values = normalize_string_list(source.get(key, default_profile.get(key, [])))
        merged[key] = values or list(default_profile.get(key, []))

    risk_marker_values = normalize_string_list(
        source.get(
            "risk_marker_keywords",
            source.get("risk_keywords", default_profile.get("risk_marker_keywords", [])),
        )
    )
    merged["risk_marker_keywords"] = risk_marker_values or list(default_profile.get("risk_marker_keywords", []))

    weights = dict(default_profile.get("weights", {}))
    source_weights = source.get("weights", {})
    if isinstance(source_weights, dict):
        for weight_key, default_weight in weights.items():
            parsed = parse_number(source_weights.get(weight_key))
            if parsed is not None and parsed >= 0:
                weights[weight_key] = float(parsed)
            else:
                weights[weight_key] = float(default_weight)
    merged["weights"] = weights

    guardrails = dict(default_profile.get("intake_guardrails", {}))
    source_guardrails = source.get("intake_guardrails", {})
    if isinstance(source_guardrails, dict):
        min_budget_usd = parse_number(source_guardrails.get("min_budget_usd"))
        min_hourly_usd = parse_number(source_guardrails.get("min_hourly_usd"))
        min_hourly_exception_usd = parse_number(source_guardrails.get("min_hourly_exception_usd"))
        reject_score_threshold = parse_number(source_guardrails.get("reject_score_threshold"))
        if min_budget_usd is not None and min_budget_usd > 0:
            guardrails["min_budget_usd"] = float(min_budget_usd)
        if min_hourly_usd is not None and min_hourly_usd > 0:
            guardrails["min_hourly_usd"] = float(min_hourly_usd)
        if min_hourly_exception_usd is not None and min_hourly_exception_usd > 0:
            guardrails["min_hourly_exception_usd"] = float(min_hourly_exception_usd)
        if reject_score_threshold is not None and 0 <= reject_score_threshold <= 100:
            guardrails["reject_score_threshold"] = float(reject_score_threshold)
        if "skip_model_on_reject" in source_guardrails:
            guardrails["skip_model_on_reject"] = parse_bool(
                source_guardrails.get("skip_model_on_reject"),
                default=bool(guardrails.get("skip_model_on_reject", True)),
            )
        if "hard_reject_on_low_budget" in source_guardrails:
            guardrails["hard_reject_on_low_budget"] = parse_bool(
                source_guardrails.get("hard_reject_on_low_budget"),
                default=bool(guardrails.get("hard_reject_on_low_budget", True)),
            )
    merged["intake_guardrails"] = guardrails

    min_version = int(parse_number(default_profile.get("version")) or 1)
    source_version = int(parse_number(source.get("version")) or min_version)
    merged["version"] = max(min_version, source_version)
    return merged


def default_outcome_taxonomy() -> Dict[str, Any]:
    return {
        "version": 1,
        "labels": [
            {"id": "budget_mismatch", "name": "Budget mismatch", "keywords": ["budget", "cheap", "price", "rate"]},
            {"id": "scope_mismatch", "name": "Scope mismatch", "keywords": ["scope", "requirement", "fit", "complexity"]},
            {"id": "timeline_risk", "name": "Timeline risk", "keywords": ["deadline", "urgent", "asap", "rush", "time"]},
            {"id": "communication", "name": "Communication", "keywords": ["communication", "clarity", "response", "meeting"]},
            {"id": "trust_social_proof", "name": "Trust / proof", "keywords": ["trust", "portfolio", "reviews", "credibility"]},
            {"id": "proposal_quality", "name": "Proposal quality", "keywords": ["proposal", "cover letter", "pitch"]},
            {"id": "technical_fit", "name": "Technical fit", "keywords": ["stack", "react", "python", "api", "architecture"]},
            {"id": "client_change", "name": "Client-side change", "keywords": ["cancel", "paused", "internal", "hired"]},
            {"id": "upsell_potential", "name": "Upsell potential", "keywords": ["upsell", "retainer", "maintenance", "long-term"]},
        ],
    }


def default_playbooks() -> List[Dict[str, Any]]:
    now = now_iso()
    return [
        {
            "id": "pb_architecture_hardening",
            "title": "Architecture Hardening Upsell",
            "objective": "Convert emergency rescue into scoped stabilization retainer.",
            "trigger_keywords": [
                "broken", "corrupted", "panic", "restore", "hotfix",
                "emergency", "crash", "client edited files",
            ],
            "actions": [
                "Stabilize current incident with a minimal hotfix and rollback point.",
                "Document root cause and define 3 concrete hardening tasks.",
                "Offer paid hardening package with scope, timeline, and acceptance criteria.",
            ],
            "offer_template": (
                "I can resolve the immediate issue first, then run an Architecture Hardening pass "
                "to prevent repeat failures. I propose a scoped package: backup discipline, "
                "file-boundary protections, and deployment safety checks."
            ),
            "tags": ["upsell", "stabilization", "delivery"],
            "active": True,
            "priority": 92.0,
            "usage_count": 0,
            "last_used_at": "",
            "updated_at": now,
            "created_at": now,
        },
        {
            "id": "pb_scope_lock_change_order",
            "title": "Scope Lock + Change Order",
            "objective": "Protect effective hourly when scope starts expanding.",
            "trigger_keywords": [
                "out of scope", "one more thing", "extra feature", "quick change",
                "small tweak", "unlimited revisions", "additional revisions",
            ],
            "actions": [
                "Restate current agreed scope in one message.",
                "Split new asks into a separate change order with estimate.",
                "Continue work only after client confirms new scope and budget.",
            ],
            "offer_template": (
                "To keep delivery predictable, I suggest we lock the current scope and ship it first. "
                "I can add the new requests as a separate change order with a clear estimate."
            ),
            "tags": ["negotiation", "scope", "profitability"],
            "active": True,
            "priority": 88.0,
            "usage_count": 0,
            "last_used_at": "",
            "updated_at": now,
            "created_at": now,
        },
        {
            "id": "pb_risk_premium_urgent",
            "title": "Urgency Risk Premium",
            "objective": "Convert deadline pressure into paid risk premium.",
            "trigger_keywords": [
                "urgent", "asap", "need it yesterday", "strict deadline", "penalty",
            ],
            "actions": [
                "Acknowledge urgency and define realistic options.",
                "Offer two tracks: standard timeline vs rush delivery with premium.",
                "Require explicit acceptance criteria to avoid refund disputes.",
            ],
            "offer_template": (
                "I can prioritize this urgently, but rush work changes delivery risk. "
                "I suggest two options: standard plan at base rate, or rush slot with risk premium."
            ),
            "tags": ["negotiation", "deadline", "pricing"],
            "active": True,
            "priority": 80.0,
            "usage_count": 0,
            "last_used_at": "",
            "updated_at": now,
            "created_at": now,
        },
        {
            "id": "pb_comms_boundary_reset",
            "title": "Communication Boundary Reset",
            "objective": "De-escalate toxic interaction and restore working boundaries.",
            "trigger_keywords": [
                "refund", "arbitration", "dispute", "chargeback", "screen record",
                "time tracker", "technical background", "i am a developer too",
            ],
            "actions": [
                "Move conversation to written checklist with concrete deliverables.",
                "Restate boundaries: scope, communication cadence, and acceptance criteria.",
                "Escalate internally: pause work until terms are explicitly confirmed.",
            ],
            "offer_template": (
                "To avoid misunderstandings, let's align on a written checklist: exact deliverables, "
                "timeline, and acceptance criteria. Once confirmed, I continue immediately."
            ),
            "tags": ["communication", "risk", "client_management"],
            "active": True,
            "priority": 84.0,
            "usage_count": 0,
            "last_used_at": "",
            "updated_at": now,
            "created_at": now,
        },
    ]


def normalize_taxonomy_id(value: Any) -> str:
    text = normalize_whitespace(str(value or "")).lower()
    text = re.sub(r"[^a-z0-9]+", "_", text).strip("_")
    return text


def default_ops_store() -> Dict[str, Any]:
    return {
        "schema_version": 1,
        "success_targets": {
            "effective_hourly_min_usd": 85.0,
            "win_rate_min_percent": 25.0,
            "notes": "Phase 1 baseline targets. Tighten after 4-6 weeks of tracked data.",
        },
        "scoring_profile": default_scoring_profile(),
        "outcome_taxonomy": default_outcome_taxonomy(),
        "decisions": [],
        "opportunities": [],
        "postmortems": [],
        "execution_projects": [],
        "weekly_reviews": [],
        "playbooks": default_playbooks(),
        "playbook_usage_events": [],
        "updated_at": now_iso(),
    }


def ensure_ops_store() -> Dict[str, Any]:
    os.makedirs(OPS_DIR, exist_ok=True)
    if not os.path.exists(OPS_STORE_PATH):
        store = default_ops_store()
        with open(OPS_STORE_PATH, "w", encoding="utf-8") as f:
            json.dump(store, f, ensure_ascii=False, indent=2)
        return store

    try:
        with open(OPS_STORE_PATH, "r", encoding="utf-8") as f:
            store = json.load(f)
    except Exception as e:
        error_id = log_exception("Failed reading phase1 ops store", e)
        raise HTTPException(status_code=500, detail=to_user_error("Cannot read ops store", error_id))

    if not isinstance(store, dict):
        store = default_ops_store()

    # forward-compat defaults
    store.setdefault("schema_version", 1)
    store.setdefault("success_targets", default_ops_store()["success_targets"])
    store["scoring_profile"] = merge_scoring_profile(store.get("scoring_profile", {}))
    store.setdefault("outcome_taxonomy", default_outcome_taxonomy())
    store.setdefault("decisions", [])
    store.setdefault("opportunities", [])
    store.setdefault("postmortems", [])
    store.setdefault("execution_projects", [])
    store.setdefault("weekly_reviews", [])
    store.setdefault("playbooks", default_playbooks())
    store.setdefault("playbook_usage_events", [])
    store["playbooks"] = [
        normalize_playbook_record(item)
        for item in store.get("playbooks", [])
        if isinstance(item, dict)
    ]
    store["playbook_usage_events"] = [
        normalize_playbook_usage_event(item)
        for item in store.get("playbook_usage_events", [])
        if isinstance(item, dict)
    ]
    store.setdefault("updated_at", now_iso())
    return store


def save_ops_store(store: Dict[str, Any]) -> None:
    try:
        os.makedirs(OPS_DIR, exist_ok=True)
        store["updated_at"] = now_iso()
        with open(OPS_STORE_PATH, "w", encoding="utf-8") as f:
            json.dump(store, f, ensure_ascii=False, indent=2)
    except Exception as e:
        error_id = log_exception("Failed writing phase1 ops store", e)
        raise HTTPException(status_code=500, detail=to_user_error("Cannot persist ops store", error_id))


def list_ops_backups(limit: int = 12) -> List[Dict[str, Any]]:
    os.makedirs(BACKUP_DIR, exist_ok=True)
    items: List[Dict[str, Any]] = []
    for filename in os.listdir(BACKUP_DIR):
        if not filename.lower().endswith(".zip"):
            continue
        full_path = os.path.join(BACKUP_DIR, filename)
        try:
            stat = os.stat(full_path)
        except Exception:
            continue
        items.append(
            {
                "filename": filename,
                "path": full_path,
                "size_bytes": int(stat.st_size),
                "updated_at": datetime.fromtimestamp(stat.st_mtime, timezone.utc).isoformat(timespec="seconds"),
            }
        )
    items = sorted(items, key=lambda item: str(item.get("updated_at", "")), reverse=True)
    return items[: max(1, min(limit, 100))]


def create_ops_backup_zip() -> Dict[str, Any]:
    os.makedirs(BACKUP_DIR, exist_ok=True)
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    backup_name = f"ops_backup_{timestamp}.zip"
    backup_path = os.path.join(BACKUP_DIR, backup_name)

    with zipfile.ZipFile(backup_path, mode="w", compression=zipfile.ZIP_DEFLATED) as archive:
        if os.path.exists(OPS_DIR):
            for root, _, files in os.walk(OPS_DIR):
                for file_name in files:
                    source_path = os.path.join(root, file_name)
                    rel_path = os.path.relpath(source_path, start=OPS_DIR)
                    archive_path = os.path.join("ops", rel_path).replace("\\", "/")
                    archive.write(source_path, arcname=archive_path)

    try:
        stat = os.stat(backup_path)
        size_bytes = int(stat.st_size)
    except Exception:
        size_bytes = 0

    return {
        "filename": backup_name,
        "path": backup_path,
        "size_bytes": size_bytes,
        "updated_at": now_iso(),
    }


def sort_by_updated_desc(items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    return sorted(items, key=lambda item: str(item.get("updated_at", "")), reverse=True)


def get_taxonomy_labels(store: Dict[str, Any]) -> List[Dict[str, Any]]:
    taxonomy = store.get("outcome_taxonomy", default_outcome_taxonomy())
    labels = taxonomy.get("labels", [])
    if not isinstance(labels, list) or not labels:
        labels = default_outcome_taxonomy()["labels"]

    normalized_labels: List[Dict[str, Any]] = []
    seen_ids = set()
    for item in labels:
        if not isinstance(item, dict):
            continue
        tag_id = normalize_taxonomy_id(item.get("id") or item.get("name"))
        if not tag_id or tag_id in seen_ids:
            continue
        seen_ids.add(tag_id)
        name = normalize_whitespace(str(item.get("name", tag_id.replace("_", " ").title())))
        keywords = normalize_string_list(item.get("keywords", []))
        normalized_labels.append({
            "id": tag_id,
            "name": name,
            "keywords": [k.lower() for k in keywords],
        })
    return normalized_labels


def infer_taxonomy_tags(text_blob: str, labels: List[Dict[str, Any]], limit: int = 4) -> List[str]:
    hits: List[str] = []
    low = normalize_whitespace(text_blob).lower()
    if not low:
        return hits
    for label in labels:
        tag_id = str(label.get("id", "")).strip()
        keywords = label.get("keywords", [])
        if not tag_id or not isinstance(keywords, list):
            continue
        if any(str(keyword).lower() in low for keyword in keywords if keyword):
            hits.append(tag_id)
        if len(hits) >= limit:
            break
    return hits


def resolve_taxonomy_tags(
    root_causes: List[str],
    findings: str,
    what_worked: str,
    explicit_tags: Any,
    labels: List[Dict[str, Any]],
) -> List[str]:
    explicit_list = [normalize_taxonomy_id(tag) for tag in normalize_string_list(explicit_tags)]
    explicit_list = [tag for tag in explicit_list if tag]

    name_to_id: Dict[str, str] = {}
    known_ids = set()
    for label in labels:
        tag_id = str(label.get("id", "")).strip()
        if not tag_id:
            continue
        known_ids.add(tag_id)
        name_to_id[tag_id] = tag_id
        name_to_id[normalize_taxonomy_id(label.get("name"))] = tag_id

    normalized_explicit: List[str] = []
    for tag in explicit_list:
        normalized_explicit.append(name_to_id.get(tag, tag))

    blob = " ".join(root_causes + [findings, what_worked]).strip()
    inferred = infer_taxonomy_tags(blob, labels)

    merged: List[str] = []
    seen = set()
    for tag in normalized_explicit + inferred:
        if not tag or tag in seen:
            continue
        seen.add(tag)
        merged.append(tag)
    return merged[:6]


def compute_outcome_taxonomy_summary(store: Dict[str, Any], postmortems: List[Dict[str, Any]]) -> Dict[str, Any]:
    labels = get_taxonomy_labels(store)
    label_map = {str(label["id"]): label for label in labels}

    tag_totals: Dict[str, Dict[str, Any]] = {}
    for tag_id, label in label_map.items():
        tag_totals[tag_id] = {
            "tag": tag_id,
            "name": label.get("name", tag_id),
            "count": 0,
            "won_count": 0,
            "lost_count": 0,
            "withdrawn_count": 0,
            "no_response_count": 0,
        }

    total = 0
    tagged = 0
    for post in postmortems:
        if not isinstance(post, dict):
            continue
        total += 1
        outcome = normalize_whitespace(str(post.get("outcome", "lost"))).lower()
        tags = resolve_taxonomy_tags(
            root_causes=normalize_string_list(post.get("root_causes", [])),
            findings=normalize_whitespace(str(post.get("findings", ""))),
            what_worked=normalize_whitespace(str(post.get("what_worked", ""))),
            explicit_tags=post.get("taxonomy_tags", []),
            labels=labels,
        )
        if tags:
            tagged += 1
        for tag_id in tags:
            item = tag_totals.get(tag_id)
            if not item:
                item = {
                    "tag": tag_id,
                    "name": tag_id.replace("_", " ").title(),
                    "count": 0,
                    "won_count": 0,
                    "lost_count": 0,
                    "withdrawn_count": 0,
                    "no_response_count": 0,
                }
                tag_totals[tag_id] = item
            item["count"] += 1
            key = f"{outcome}_count"
            if key in item:
                item[key] += 1

    tag_totals_list = sorted(tag_totals.values(), key=lambda item: int(item.get("count", 0)), reverse=True)
    return {
        "total_postmortems": total,
        "tagged_postmortems": tagged,
        "coverage_percent": round((tagged / total) * 100.0, 2) if total > 0 else 0.0,
        "labels": labels,
        "top_tags": tag_totals_list[:8],
    }


def compute_phase1_metrics(store: Dict[str, Any]) -> Dict[str, Any]:
    opportunities = [item for item in store.get("opportunities", []) if isinstance(item, dict)]

    closed = [opp for opp in opportunities if normalize_pipeline_stage(opp.get("stage")) in TERMINAL_PIPELINE_STAGES]
    won = [opp for opp in opportunities if normalize_pipeline_stage(opp.get("stage")) == "won"]
    closed_count = len(closed)
    won_count = len(won)
    win_rate = float(won_count) / float(closed_count) if closed_count else 0.0

    realized_revenue_total = 0.0
    realized_hours_total = 0.0
    estimated_revenue_total = 0.0
    estimated_hours_total = 0.0

    for opp in opportunities:
        stage = normalize_pipeline_stage(opp.get("stage"))
        actual_revenue = parse_number(opp.get("actual_revenue_usd"))
        actual_hours = parse_number(opp.get("actual_hours"))
        expected_revenue = parse_number(opp.get("expected_revenue_usd"))
        estimated_hours = parse_number(opp.get("estimated_hours"))

        if actual_revenue is not None and actual_hours and actual_hours > 0:
            realized_revenue_total += actual_revenue
            realized_hours_total += actual_hours

        if stage not in TERMINAL_PIPELINE_STAGES and expected_revenue is not None and estimated_hours and estimated_hours > 0:
            estimated_revenue_total += expected_revenue
            estimated_hours_total += estimated_hours

    effective_hourly_realized = (
        round(realized_revenue_total / realized_hours_total, 2)
        if realized_hours_total > 0
        else None
    )
    effective_hourly_estimated_pipeline = (
        round(estimated_revenue_total / estimated_hours_total, 2)
        if estimated_hours_total > 0
        else None
    )

    target = store.get("success_targets", {})
    win_rate_target = parse_number(target.get("win_rate_min_percent")) or 0.0
    hourly_target = parse_number(target.get("effective_hourly_min_usd")) or 0.0

    return {
        "open_opportunity_count": len(opportunities) - closed_count,
        "closed_opportunity_count": closed_count,
        "won_count": won_count,
        "lost_count": max(0, closed_count - won_count),
        "win_rate_percent": round(win_rate * 100.0, 2),
        "effective_hourly_realized_usd": effective_hourly_realized,
        "effective_hourly_estimated_pipeline_usd": effective_hourly_estimated_pipeline,
        "target_checks": {
            "win_rate_target_percent": win_rate_target,
            "effective_hourly_target_usd": hourly_target,
            "win_rate_met": (win_rate * 100.0) >= win_rate_target if closed_count > 0 else False,
            "effective_hourly_met": (
                effective_hourly_realized is not None and effective_hourly_realized >= hourly_target
            ),
        },
    }


def score_band(score: float) -> str:
    if score >= 75:
        return "high"
    if score >= 55:
        return "medium"
    return "low"


def score_recommendation(score: float) -> str:
    if score >= 75:
        return "prioritize"
    if score >= 55:
        return "consider"
    return "deprioritize"


def score_hourly_component(hourly_rate: Optional[float], target_hourly: float) -> float:
    if hourly_rate is None or target_hourly <= 0:
        return 40.0
    ratio = hourly_rate / target_hourly
    if ratio >= 1.6:
        return 100.0
    if ratio >= 1.2:
        return 85.0
    if ratio >= 1.0:
        return 70.0
    if ratio >= 0.8:
        return 45.0
    if ratio >= 0.6:
        return 25.0
    return 5.0


def score_budget_component(expected_revenue: Optional[float]) -> float:
    if expected_revenue is None:
        return 35.0
    if expected_revenue >= 3000:
        return 100.0
    if expected_revenue >= 1500:
        return 78.0
    if expected_revenue >= 800:
        return 55.0
    if expected_revenue >= 350:
        return 32.0
    return 10.0


def score_clarity_component(opportunity: Dict[str, Any]) -> float:
    score = 100.0
    if not normalize_whitespace(str(opportunity.get("summary", ""))):
        score -= 30
    if not normalize_whitespace(str(opportunity.get("client", ""))):
        score -= 20
    if parse_number(opportunity.get("estimated_hours")) is None:
        score -= 15
    if parse_number(opportunity.get("expected_revenue_usd")) is None:
        score -= 15
    if not normalize_whitespace(str(opportunity.get("notes", ""))):
        score -= 10
    return max(0.0, score)


def score_strategic_component(text_blob: str, preferred_keywords: List[str]) -> Tuple[float, List[str]]:
    if not preferred_keywords:
        return 40.0, []
    hits: List[str] = []
    for keyword in preferred_keywords:
        normalized = normalize_whitespace(str(keyword)).lower()
        if normalized and normalized in text_blob and normalized not in hits:
            hits.append(normalized)
    if not hits:
        return 30.0, []
    score = min(100.0, 30.0 + len(hits) * 18.0)
    return score, hits[:4]


def score_risk_component(text_blob: str, risk_keywords: List[str]) -> Tuple[float, List[str]]:
    if not risk_keywords:
        return 80.0, []
    hits: List[str] = []
    for keyword in risk_keywords:
        normalized = normalize_whitespace(str(keyword)).lower()
        if normalized and normalized in text_blob and normalized not in hits:
            hits.append(normalized)
    penalty = min(75.0, len(hits) * 18.0)
    score = max(10.0, 100.0 - penalty)
    return score, hits[:4]


def enrich_scored_opportunity(opportunity: Dict[str, Any], store: Dict[str, Any]) -> Dict[str, Any]:
    enriched = dict(opportunity)

    scoring_profile = merge_scoring_profile(store.get("scoring_profile", {}))
    weights = scoring_profile.get("weights", {})
    w_hourly = float(parse_number(weights.get("hourly_fit")) or 0.28)
    w_budget = float(parse_number(weights.get("budget")) or 0.30)
    w_clarity = float(parse_number(weights.get("clarity")) or 0.15)
    w_strategic = float(parse_number(weights.get("strategic_fit")) or 0.17)
    w_risk = float(parse_number(weights.get("risk")) or 0.10)
    w_total = w_hourly + w_budget + w_clarity + w_strategic + w_risk
    if w_total <= 0:
        w_hourly, w_budget, w_clarity, w_strategic, w_risk = 0.28, 0.30, 0.15, 0.17, 0.10
        w_total = 1.0

    target_hourly = parse_number(store.get("success_targets", {}).get("effective_hourly_min_usd")) or 85.0

    expected_revenue = parse_number(opportunity.get("expected_revenue_usd"))
    estimated_hours = parse_number(opportunity.get("estimated_hours"))
    hourly_rate = None
    if expected_revenue is not None and estimated_hours and estimated_hours > 0:
        hourly_rate = expected_revenue / estimated_hours

    text_blob = " ".join(
        normalize_whitespace(str(opportunity.get(field, ""))).lower()
        for field in ["title", "summary", "notes", "client", "platform"]
    )

    hourly_score = score_hourly_component(hourly_rate, target_hourly)
    budget_score = score_budget_component(expected_revenue)
    clarity_score = score_clarity_component(opportunity)
    strategic_score, strategic_hits = score_strategic_component(
        text_blob=text_blob,
        preferred_keywords=list(scoring_profile.get("preferred_keywords", [])),
    )
    risk_score, risk_hits = score_risk_component(
        text_blob=text_blob,
        risk_keywords=list(scoring_profile.get("risk_keywords", [])),
    )
    toxicity_keywords = list(scoring_profile.get("toxicity_keywords", []))
    toxicity_hits = detect_keyword_hits(text_blob, toxicity_keywords, limit=4)

    intake_gate = evaluate_intake_gate(
        text_blob=text_blob,
        expected_revenue_usd=expected_revenue,
        estimated_hourly_usd=hourly_rate,
        scoring_profile=scoring_profile,
    )
    hard_reject_hits = normalize_string_list(intake_gate.get("hard_reject_hits", []))
    heavy_penalty_hits = normalize_string_list(intake_gate.get("heavy_penalty_hits", []))
    risk_marker_hits = normalize_string_list(intake_gate.get("risk_marker_hits", []))
    intake_score = parse_number(intake_gate.get("intake_score"))

    stage = normalize_pipeline_stage(opportunity.get("stage"))
    stage_bonus_map = {
        "discovery": 0.0,
        "qualified": 2.0,
        "proposal": 4.0,
        "interview": 7.0,
        "negotiation": 9.0,
        "won": 5.0,
        "lost": 0.0,
    }
    stage_bonus = stage_bonus_map.get(stage, 0.0)

    base_score = (
        (hourly_score * w_hourly)
        + (budget_score * w_budget)
        + (clarity_score * w_clarity)
        + (strategic_score * w_strategic)
        + (risk_score * w_risk)
    ) / w_total

    penalty = 0.0
    if intake_gate.get("rejected"):
        for reason in intake_gate.get("reasons", []):
            if "budget" in reason.lower():
                penalty += 45.0
            elif "hourly" in reason.lower():
                penalty += 28.0
            else:
                penalty += 15.0
    if toxicity_hits:
        penalty += min(22.0, 6.0 + len(toxicity_hits) * 4.0)
    if clarity_score < 60 and ("urgent" in risk_hits or "asap" in risk_hits):
        penalty += 8.0

    final_score = max(0.0, min(100.0, base_score + stage_bonus - penalty))
    if intake_score is not None:
        final_score = min(final_score, intake_score)

    if intake_gate.get("rejected") and intake_gate.get("hard_reject_on_low_budget"):
        final_score = min(final_score, 18.0)
    if hard_reject_hits:
        final_score = min(final_score, 22.0)

    reasons: List[str] = []
    if hourly_rate is not None:
        reasons.append(f"Estimated hourly: ${hourly_rate:.1f}/h (target ${target_hourly:.0f}/h)")
    else:
        reasons.append("Hourly estimate incomplete (missing expected revenue or hours)")
    if expected_revenue is not None:
        reasons.append(f"Expected budget: ${expected_revenue:.0f}")
    if strategic_hits:
        reasons.append(f"Strategic match: {', '.join(strategic_hits)}")
    if risk_hits:
        reasons.append(f"Risk markers: {', '.join(risk_hits)}")
    if intake_gate.get("rejected"):
        reasons.extend(intake_gate.get("reasons", []))
    if hard_reject_hits:
        reasons.append(f"Hard reject markers: {', '.join(hard_reject_hits)}")
    if heavy_penalty_hits:
        reasons.append(f"Heavy penalty markers: {', '.join(heavy_penalty_hits)}")
    if risk_marker_hits:
        reasons.append(f"Risk marker hits: {', '.join(risk_marker_hits)}")
    if toxicity_hits:
        reasons.append(f"Toxicity markers: {', '.join(toxicity_hits)}")
    if clarity_score < 70:
        reasons.append("Context clarity is low; add summary/notes for better confidence")

    recommendation = score_recommendation(final_score)
    if intake_gate.get("rejected") or hard_reject_hits:
        recommendation = "deprioritize"

    enriched["score_v1"] = round(final_score, 1)
    enriched["score_band"] = score_band(final_score)
    enriched["score_recommendation"] = recommendation
    enriched["score_rationale"] = reasons[:6]
    enriched["estimated_hourly_usd"] = round(hourly_rate, 2) if hourly_rate is not None else None
    enriched["score_version"] = "v2"
    enriched["intake_gate_status"] = intake_gate.get("status", "allow")
    enriched["intake_gate_reasons"] = intake_gate.get("reasons", [])
    enriched["intake_score"] = round(intake_score, 2) if intake_score is not None else None
    enriched["hard_reject_hits"] = hard_reject_hits
    enriched["heavy_penalty_hits"] = heavy_penalty_hits
    enriched["risk_marker_hits"] = risk_marker_hits
    enriched["toxicity_hits"] = toxicity_hits
    return enriched


def build_pipeline_board(opportunities: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    columns: List[Dict[str, Any]] = []
    for stage in PIPELINE_STAGE_ORDER:
        stage_items = [
            item
            for item in opportunities
            if normalize_pipeline_stage(item.get("stage")) == stage
        ]
        stage_items = sorted(
            stage_items,
            key=lambda item: (
                float(parse_number(item.get("score_v1")) or -1.0),
                str(item.get("updated_at", "")),
            ),
            reverse=True,
        )
        total_expected = 0.0
        for item in stage_items:
            expected = parse_number(item.get("expected_revenue_usd"))
            if expected is not None:
                total_expected += expected

        columns.append(
            {
                "stage": stage,
                "count": len(stage_items),
                "expected_revenue_usd": round(total_expected, 2),
                "items": stage_items,
            }
        )
    return columns


def normalize_execution_project_record(record: Dict[str, Any]) -> Dict[str, Any]:
    milestones = normalize_milestones(record.get("milestones", []))
    status = normalize_execution_status(record.get("status"))
    progress_percent = compute_milestone_progress(milestones)
    if status == "done" and not record.get("completed_at"):
        completed_at = now_iso()[:10]
    else:
        completed_at = normalize_iso_date(record.get("completed_at"))

    planned_value = parse_number(record.get("planned_value_usd"))
    actual_value = parse_number(record.get("actual_value_usd"))
    planned_hours = parse_number(record.get("planned_hours"))
    actual_hours = parse_number(record.get("actual_hours"))

    return {
        "id": normalize_whitespace(str(record.get("id", ""))) or str(uuid.uuid4()),
        "opportunity_id": normalize_whitespace(str(record.get("opportunity_id", ""))),
        "title": truncate_text(str(record.get("title", "")), 180),
        "client": truncate_text(str(record.get("client", "")), 120),
        "status": status,
        "summary": truncate_text(str(record.get("summary", "")), 420),
        "job_url": normalize_whitespace(str(record.get("job_url", ""))),
        "start_date": normalize_iso_date(record.get("start_date")),
        "due_date": normalize_iso_date(record.get("due_date")),
        "completed_at": completed_at,
        "planned_value_usd": round(planned_value, 2) if planned_value is not None else None,
        "actual_value_usd": round(actual_value, 2) if actual_value is not None else None,
        "planned_hours": round(planned_hours, 2) if planned_hours is not None else None,
        "actual_hours": round(actual_hours, 2) if actual_hours is not None else None,
        "risks": normalize_string_list(record.get("risks", []))[:8],
        "next_actions": normalize_string_list(record.get("next_actions", []))[:8],
        "milestones": milestones,
        "progress_percent": progress_percent,
        "updated_at": normalize_whitespace(str(record.get("updated_at", ""))) or now_iso(),
        "created_at": normalize_whitespace(str(record.get("created_at", ""))) or now_iso(),
    }


def normalize_weekly_review_record(record: Dict[str, Any]) -> Dict[str, Any]:
    confidence = parse_number(record.get("confidence_percent"))
    if confidence is not None:
        confidence = max(0.0, min(100.0, confidence))

    return {
        "id": normalize_whitespace(str(record.get("id", ""))) or str(uuid.uuid4()),
        "week_start_date": normalize_iso_date(record.get("week_start_date")) or now_iso()[:10],
        "wins": normalize_string_list(record.get("wins", []))[:10],
        "misses": normalize_string_list(record.get("misses", []))[:10],
        "bottlenecks": normalize_string_list(record.get("bottlenecks", []))[:10],
        "experiments": normalize_string_list(record.get("experiments", []))[:10],
        "focus_next_week": normalize_string_list(record.get("focus_next_week", []))[:10],
        "confidence_percent": round(confidence, 1) if confidence is not None else None,
        "linked_project_ids": normalize_string_list(record.get("linked_project_ids", []))[:12],
        "updated_at": normalize_whitespace(str(record.get("updated_at", ""))) or now_iso(),
        "created_at": normalize_whitespace(str(record.get("created_at", ""))) or now_iso(),
    }


def normalize_playbook_record(record: Dict[str, Any]) -> Dict[str, Any]:
    priority_value = parse_number(record.get("priority"))
    if priority_value is None:
        priority_value = 50.0
    priority = max(0.0, min(100.0, float(priority_value)))

    usage_count_raw = parse_number(record.get("usage_count"))
    usage_count = int(max(0, usage_count_raw or 0))

    actions = normalize_string_list(record.get("actions", []))
    trigger_keywords = normalize_string_list(record.get("trigger_keywords", []))

    normalized_actions = [truncate_text(item, 220) for item in actions][:8]
    normalized_triggers = [truncate_text(item.lower(), 80) for item in trigger_keywords][:24]

    return {
        "id": normalize_whitespace(str(record.get("id", ""))) or str(uuid.uuid4()),
        "title": truncate_text(str(record.get("title", "Playbook")), 140),
        "objective": truncate_text(str(record.get("objective", "")), 260),
        "trigger_keywords": normalized_triggers,
        "actions": normalized_actions,
        "offer_template": truncate_text(str(record.get("offer_template", "")), 1200),
        "tags": normalize_string_list(record.get("tags", []))[:10],
        "active": parse_bool(record.get("active"), default=True),
        "priority": round(priority, 1),
        "usage_count": usage_count,
        "last_used_at": normalize_whitespace(str(record.get("last_used_at", ""))),
        "updated_at": normalize_whitespace(str(record.get("updated_at", ""))) or now_iso(),
        "created_at": normalize_whitespace(str(record.get("created_at", ""))) or now_iso(),
    }


def normalize_playbook_usage_event(record: Dict[str, Any]) -> Dict[str, Any]:
    outcome_raw = normalize_whitespace(str(record.get("outcome", "pending"))).lower()
    if outcome_raw not in {"pending", "won", "lost", "withdrawn", "no_response"}:
        outcome_raw = "pending"

    feedback_raw = record.get("feedback_score")
    feedback_score = parse_number(feedback_raw)
    if feedback_score is not None:
        feedback_score = max(-1.0, min(1.0, round(feedback_score)))

    feedback_label_raw = normalize_whitespace(str(record.get("feedback_label", ""))).lower()
    if feedback_label_raw in {"helpful", "positive", "good"}:
        feedback_score = 1.0
    elif feedback_label_raw in {"not_helpful", "negative", "bad"}:
        feedback_score = -1.0
    elif feedback_label_raw in {"neutral"}:
        feedback_score = 0.0

    feedback_label = ""
    if feedback_score is not None:
        if feedback_score >= 1:
            feedback_label = "helpful"
        elif feedback_score <= -1:
            feedback_label = "not_helpful"
        else:
            feedback_label = "neutral"

    revenue = parse_number(record.get("realized_revenue_usd"))
    hours = parse_number(record.get("realized_hours"))
    effective_hourly = None
    if revenue is not None and hours and hours > 0:
        effective_hourly = round(revenue / hours, 2)

    return {
        "id": normalize_whitespace(str(record.get("id", ""))) or str(uuid.uuid4()),
        "playbook_id": normalize_whitespace(str(record.get("playbook_id", ""))),
        "opportunity_id": normalize_whitespace(str(record.get("opportunity_id", ""))),
        "project_id": normalize_whitespace(str(record.get("project_id", ""))),
        "source": normalize_whitespace(str(record.get("source", "manual"))) or "manual",
        "notes": truncate_text(str(record.get("notes", "")), 600),
        "matched_triggers": normalize_string_list(record.get("matched_triggers", []))[:12],
        "outcome": outcome_raw,
        "outcome_linked_at": normalize_whitespace(str(record.get("outcome_linked_at", ""))),
        "realized_revenue_usd": round(revenue, 2) if revenue is not None else None,
        "realized_hours": round(hours, 2) if hours is not None else None,
        "effective_hourly_usd": effective_hourly,
        "feedback_score": int(feedback_score) if feedback_score is not None else None,
        "feedback_label": feedback_label,
        "feedback_note": truncate_text(str(record.get("feedback_note", "")), 280),
        "feedback_updated_at": normalize_whitespace(str(record.get("feedback_updated_at", ""))),
        "updated_at": normalize_whitespace(str(record.get("updated_at", ""))) or now_iso(),
        "created_at": normalize_whitespace(str(record.get("created_at", ""))) or now_iso(),
    }


def build_playbook_usage_event(
    store: Dict[str, Any],
    playbook_id: str,
    opportunity_id: str = "",
    project_id: str = "",
    notes: str = "",
    matched_triggers: Optional[List[str]] = None,
    source: str = "manual",
) -> Dict[str, Any]:
    opportunities = [item for item in store.get("opportunities", []) if isinstance(item, dict)]
    execution_projects = [normalize_execution_project_record(item) for item in store.get("execution_projects", []) if isinstance(item, dict)]
    by_opportunity = {str(item.get("id")): item for item in opportunities}
    by_project = {str(item.get("id")): item for item in execution_projects}

    linked_opportunity = by_opportunity.get(opportunity_id) if opportunity_id else None
    linked_project = by_project.get(project_id) if project_id else None

    if not linked_opportunity and linked_project:
        project_opp_id = normalize_whitespace(str(linked_project.get("opportunity_id", "")))
        linked_opportunity = by_opportunity.get(project_opp_id)
        if not opportunity_id:
            opportunity_id = project_opp_id

    outcome = "pending"
    if linked_opportunity:
        stage = normalize_pipeline_stage(linked_opportunity.get("stage"))
        if stage in {"won", "lost"}:
            outcome = stage

    realized_revenue = None
    realized_hours = None
    if linked_opportunity:
        realized_revenue = (
            parse_number(linked_opportunity.get("actual_revenue_usd"))
            or parse_number(linked_opportunity.get("expected_revenue_usd"))
        )
        realized_hours = (
            parse_number(linked_opportunity.get("actual_hours"))
            or parse_number(linked_opportunity.get("estimated_hours"))
        )
    if linked_project:
        realized_revenue = parse_number(linked_project.get("actual_value_usd")) or realized_revenue
        realized_hours = parse_number(linked_project.get("actual_hours")) or realized_hours

    now = now_iso()
    return normalize_playbook_usage_event(
        {
            "id": str(uuid.uuid4()),
            "playbook_id": playbook_id,
            "opportunity_id": opportunity_id,
            "project_id": project_id,
            "source": source,
            "notes": notes,
            "matched_triggers": matched_triggers or [],
            "outcome": outcome,
            "outcome_linked_at": now if outcome != "pending" else "",
            "realized_revenue_usd": realized_revenue,
            "realized_hours": realized_hours,
            "feedback_score": None,
            "feedback_label": "",
            "feedback_note": "",
            "feedback_updated_at": "",
            "updated_at": now,
            "created_at": now,
        }
    )


def link_playbook_usage_outcomes_from_opportunity(store: Dict[str, Any], opportunity: Dict[str, Any]) -> None:
    opportunity_id = normalize_whitespace(str(opportunity.get("id", "")))
    if not opportunity_id:
        return

    stage = normalize_pipeline_stage(opportunity.get("stage"))
    if stage not in {"won", "lost"}:
        return

    usage_events = store.get("playbook_usage_events", [])
    if not isinstance(usage_events, list):
        return

    now = now_iso()
    revenue = parse_number(opportunity.get("actual_revenue_usd")) or parse_number(opportunity.get("expected_revenue_usd"))
    hours = parse_number(opportunity.get("actual_hours")) or parse_number(opportunity.get("estimated_hours"))

    for event in usage_events:
        if not isinstance(event, dict):
            continue
        if normalize_whitespace(str(event.get("opportunity_id", ""))) != opportunity_id:
            continue
        current_outcome = normalize_whitespace(str(event.get("outcome", ""))).lower()
        if current_outcome and current_outcome != "pending":
            continue
        event["outcome"] = stage
        event["outcome_linked_at"] = now
        if revenue is not None:
            event["realized_revenue_usd"] = revenue
        if hours is not None:
            event["realized_hours"] = hours
        event["updated_at"] = now


def link_playbook_usage_outcomes_from_postmortem(store: Dict[str, Any], postmortem: Dict[str, Any]) -> None:
    opportunity_id = normalize_whitespace(str(postmortem.get("opportunity_id", "")))
    outcome = normalize_whitespace(str(postmortem.get("outcome", ""))).lower()
    if not opportunity_id or outcome not in {"won", "lost", "withdrawn", "no_response"}:
        return

    usage_events = store.get("playbook_usage_events", [])
    if not isinstance(usage_events, list):
        return

    opportunities = [item for item in store.get("opportunities", []) if isinstance(item, dict)]
    linked_opportunity = next((item for item in opportunities if str(item.get("id")) == opportunity_id), None)
    revenue = parse_number(linked_opportunity.get("actual_revenue_usd")) if linked_opportunity else None
    hours = parse_number(linked_opportunity.get("actual_hours")) if linked_opportunity else None
    now = now_iso()

    for event in usage_events:
        if not isinstance(event, dict):
            continue
        if normalize_whitespace(str(event.get("opportunity_id", ""))) != opportunity_id:
            continue
        current_outcome = normalize_whitespace(str(event.get("outcome", ""))).lower()
        if current_outcome and current_outcome != "pending":
            continue
        event["outcome"] = outcome
        event["outcome_linked_at"] = now
        if revenue is not None:
            event["realized_revenue_usd"] = revenue
        if hours is not None:
            event["realized_hours"] = hours
        event["updated_at"] = now


def build_playbook_performance_profile(
    usage_events: List[Dict[str, Any]],
) -> Dict[str, Dict[str, Any]]:
    grouped: Dict[str, List[Dict[str, Any]]] = {}
    for raw_event in usage_events:
        event = normalize_playbook_usage_event(raw_event) if isinstance(raw_event, dict) else {}
        playbook_id = normalize_whitespace(str(event.get("playbook_id", "")))
        if not playbook_id:
            continue
        grouped.setdefault(playbook_id, []).append(event)

    profiles: Dict[str, Dict[str, Any]] = {}
    for playbook_id, events in grouped.items():
        resolved = [item for item in events if str(item.get("outcome")) in {"won", "lost", "withdrawn", "no_response"}]
        won = [item for item in events if str(item.get("outcome")) == "won"]
        lost = [item for item in events if str(item.get("outcome")) in {"lost", "withdrawn", "no_response"}]
        feedback_values = [
            parse_number(item.get("feedback_score"))
            for item in events
            if parse_number(item.get("feedback_score")) is not None
        ]
        positive_feedback = len([value for value in feedback_values if value is not None and value > 0])
        negative_feedback = len([value for value in feedback_values if value is not None and value < 0])

        revenue_total = 0.0
        hours_total = 0.0
        for event in events:
            revenue = parse_number(event.get("realized_revenue_usd"))
            hours = parse_number(event.get("realized_hours"))
            if revenue is not None:
                revenue_total += revenue
            if hours is not None and hours > 0:
                hours_total += hours

        win_rate = round((len(won) / len(resolved)) * 100.0, 2) if resolved else None
        effective_hourly = round(revenue_total / hours_total, 2) if hours_total > 0 else None
        avg_feedback_score = round(sum(feedback_values) / len(feedback_values), 2) if feedback_values else None
        profiles[playbook_id] = {
            "usage_events": len(events),
            "resolved_events": len(resolved),
            "won_events": len(won),
            "lost_events": len(lost),
            "win_rate_percent": win_rate,
            "effective_hourly_usd": effective_hourly,
            "avg_feedback_score": avg_feedback_score,
            "positive_feedback": positive_feedback,
            "negative_feedback": negative_feedback,
        }

    return profiles


def score_playbook_match(
    playbook: Dict[str, Any],
    text_blob: str,
    forced_hits: Optional[List[str]] = None,
    performance_hint: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    active = parse_bool(playbook.get("active"), default=True)
    if not active:
        return {"score": 0.0, "hits": [], "active": False}

    keywords = normalize_string_list(playbook.get("trigger_keywords", []))
    if not keywords:
        return {"score": 0.0, "hits": [], "active": True}

    hits = list(forced_hits or detect_keyword_hits(text_blob, keywords, limit=8))
    if not hits:
        return {"score": 0.0, "hits": [], "active": True}

    priority = parse_number(playbook.get("priority")) or 50.0
    base_score = (len(hits) * 28.0) + (priority * 0.35)
    adaptive_delta = 0.0

    hint = performance_hint or {}
    resolved_events = int(parse_number(hint.get("resolved_events")) or 0)
    usage_events = int(parse_number(hint.get("usage_events")) or 0)
    win_rate = parse_number(hint.get("win_rate_percent"))
    effective_hourly = parse_number(hint.get("effective_hourly_usd"))
    avg_feedback_score = parse_number(hint.get("avg_feedback_score"))
    positive_feedback = int(parse_number(hint.get("positive_feedback")) or 0)
    negative_feedback = int(parse_number(hint.get("negative_feedback")) or 0)

    # Adaptive recommendation layer: promote proven playbooks, downrank harmful patterns.
    if resolved_events >= 2 and win_rate is not None:
        if win_rate >= 70:
            adaptive_delta += 10.0
        elif win_rate >= 55:
            adaptive_delta += 6.0
        elif win_rate < 35:
            adaptive_delta -= 10.0
        elif win_rate < 45:
            adaptive_delta -= 5.0

    if effective_hourly is not None:
        if effective_hourly >= 110:
            adaptive_delta += 6.0
        elif effective_hourly >= 85:
            adaptive_delta += 3.0
        elif effective_hourly < 50:
            adaptive_delta -= 6.0

    if usage_events >= 8:
        adaptive_delta += 2.0

    if avg_feedback_score is not None:
        adaptive_delta += max(-8.0, min(8.0, avg_feedback_score * 6.0))
    elif positive_feedback > negative_feedback and positive_feedback >= 2:
        adaptive_delta += 3.0
    elif negative_feedback > positive_feedback and negative_feedback >= 2:
        adaptive_delta -= 4.0

    score = min(100.0, max(0.0, base_score + adaptive_delta))
    return {
        "score": round(score, 1),
        "base_score": round(base_score, 1),
        "adaptive_delta": round(adaptive_delta, 1),
        "hits": hits[:6],
        "active": True,
    }


def build_playbook_suggestions(
    store: Dict[str, Any],
    context_text: str = "",
    opportunity_id: str = "",
    project_id: str = "",
    limit: int = 6,
) -> Dict[str, Any]:
    playbooks = [
        normalize_playbook_record(item)
        for item in store.get("playbooks", [])
        if isinstance(item, dict)
    ]
    if not playbooks:
        playbooks = [normalize_playbook_record(item) for item in default_playbooks()]

    opportunities = [item for item in store.get("opportunities", []) if isinstance(item, dict)]
    projects = [normalize_execution_project_record(item) for item in store.get("execution_projects", []) if isinstance(item, dict)]
    postmortems = [item for item in store.get("postmortems", []) if isinstance(item, dict)]
    usage_events = [
        normalize_playbook_usage_event(item)
        for item in store.get("playbook_usage_events", [])
        if isinstance(item, dict)
    ]
    performance_profiles = build_playbook_performance_profile(usage_events)

    context_parts: List[str] = []
    if context_text:
        context_parts.append(normalize_whitespace(context_text))

    selected_opportunity: Optional[Dict[str, Any]] = None
    if opportunity_id:
        selected_opportunity = next((item for item in opportunities if str(item.get("id")) == opportunity_id), None)
        if selected_opportunity:
            context_parts.extend(
                [
                    str(selected_opportunity.get("title", "")),
                    str(selected_opportunity.get("summary", "")),
                    str(selected_opportunity.get("notes", "")),
                    " ".join(normalize_string_list(selected_opportunity.get("score_rationale", []))),
                ]
            )

    selected_project: Optional[Dict[str, Any]] = None
    if project_id:
        selected_project = next((item for item in projects if str(item.get("id")) == project_id), None)
        if selected_project:
            context_parts.extend(
                [
                    str(selected_project.get("title", "")),
                    str(selected_project.get("summary", "")),
                    " ".join(normalize_string_list(selected_project.get("risks", []))),
                    " ".join(normalize_string_list(selected_project.get("next_actions", []))),
                ]
            )

    if not context_parts:
        active_projects = [
            item for item in projects
            if normalize_execution_status(item.get("status")) in {"blocked", "at_risk", "active"}
        ][:5]
        for item in active_projects:
            context_parts.extend(
                [
                    str(item.get("title", "")),
                    str(item.get("summary", "")),
                    " ".join(normalize_string_list(item.get("risks", []))),
                ]
            )
        for post in sort_by_updated_desc(postmortems)[:4]:
            context_parts.append(str(post.get("findings", "")))

    context_blob = normalize_whitespace(" ".join(context_parts)).lower()

    scoped_hits: Dict[str, List[str]] = {}
    if selected_opportunity:
        scoped_hits["pb_scope_lock_change_order"] = detect_keyword_hits(
            normalize_whitespace(
                " ".join(
                    [
                        str(selected_opportunity.get("title", "")),
                        str(selected_opportunity.get("summary", "")),
                        str(selected_opportunity.get("notes", "")),
                    ]
                )
            ).lower(),
            ["out of scope", "one more thing", "extra feature", "quick change", "small tweak", "unlimited revisions"],
            limit=4,
        )

    if selected_project:
        scope_creep_hint = False
        planned_hours = parse_number(selected_project.get("planned_hours"))
        actual_hours = parse_number(selected_project.get("actual_hours"))
        if planned_hours and actual_hours and planned_hours > 0 and actual_hours > planned_hours * 1.25:
            scope_creep_hint = True
        if scope_creep_hint:
            scoped_hits.setdefault("pb_scope_lock_change_order", []).append("scope creep")

    suggestions: List[Dict[str, Any]] = []
    for playbook in playbooks:
        record = score_playbook_match(
            playbook,
            context_blob,
            forced_hits=scoped_hits.get(str(playbook.get("id"))),
            performance_hint=performance_profiles.get(str(playbook.get("id"))),
        )
        if record.get("score", 0.0) <= 0:
            continue

        profile = performance_profiles.get(str(playbook.get("id")), {})
        suggestion = {
            "playbook_id": playbook.get("id"),
            "title": playbook.get("title"),
            "objective": playbook.get("objective"),
            "score": record.get("score"),
            "base_score": record.get("base_score"),
            "adaptive_delta": record.get("adaptive_delta"),
            "matched_triggers": record.get("hits", []),
            "actions": list(playbook.get("actions", []))[:4],
            "offer_template": playbook.get("offer_template", ""),
            "tags": list(playbook.get("tags", []))[:6],
            "usage_count": int(parse_number(playbook.get("usage_count")) or 0),
            "historical_win_rate_percent": profile.get("win_rate_percent"),
            "historical_effective_hourly_usd": profile.get("effective_hourly_usd"),
            "historical_resolved_events": profile.get("resolved_events", 0),
            "historical_feedback_score": profile.get("avg_feedback_score"),
            "historical_feedback_positive": profile.get("positive_feedback", 0),
            "historical_feedback_negative": profile.get("negative_feedback", 0),
        }
        suggestions.append(suggestion)

    suggestions = sorted(
        suggestions,
        key=lambda item: (
            float(parse_number(item.get("score")) or 0.0),
            float(parse_number(item.get("historical_win_rate_percent")) or 0.0),
            int(parse_number(item.get("usage_count")) or 0),
        ),
        reverse=True,
    )[: max(1, min(12, limit))]

    return {
        "suggestions": suggestions,
        "context_meta": {
            "used_context_text": bool(normalize_whitespace(context_text)),
            "used_opportunity": bool(selected_opportunity),
            "used_project": bool(selected_project),
            "context_chars": len(context_blob),
            "playbooks_considered": len(playbooks),
            "adaptive_profiles": len(performance_profiles),
        },
    }


def compute_playbook_summary(
    playbooks: List[Dict[str, Any]],
    usage_events: List[Dict[str, Any]],
    opportunities: List[Dict[str, Any]],
    execution_projects: List[Dict[str, Any]],
) -> Dict[str, Any]:
    normalized_playbooks = [normalize_playbook_record(item) for item in playbooks if isinstance(item, dict)]
    normalized_usage_events = [normalize_playbook_usage_event(item) for item in usage_events if isinstance(item, dict)]
    total_playbooks = len(normalized_playbooks)
    active_playbooks = [item for item in normalized_playbooks if parse_bool(item.get("active"), default=True)]
    total_usage = sum(int(parse_number(item.get("usage_count")) or 0) for item in normalized_playbooks)

    context_parts: List[str] = []
    for opp in opportunities[:12]:
        if normalize_pipeline_stage(opp.get("stage")) in {"won", "lost"}:
            continue
        context_parts.extend(
            [
                str(opp.get("title", "")),
                str(opp.get("summary", "")),
                str(opp.get("notes", "")),
            ]
        )
    for project in execution_projects[:12]:
        if normalize_execution_status(project.get("status")) in {"done", "archived"}:
            continue
        context_parts.extend(
            [
                str(project.get("title", "")),
                str(project.get("summary", "")),
                " ".join(normalize_string_list(project.get("risks", []))),
            ]
        )
    context_blob = normalize_whitespace(" ".join(context_parts)).lower()

    trigger_counts: Dict[str, int] = {}
    for playbook in active_playbooks:
        hits = detect_keyword_hits(context_blob, normalize_string_list(playbook.get("trigger_keywords", [])), limit=6)
        if hits:
            trigger_counts[str(playbook.get("id"))] = len(hits)

    top_triggered = sorted(trigger_counts.items(), key=lambda x: x[1], reverse=True)[:6]
    playbook_by_id = {str(item.get("id")): item for item in active_playbooks}
    top_triggered_rows = [
        {
            "id": pb_id,
            "title": playbook_by_id.get(pb_id, {}).get("title", pb_id),
            "hits": hits,
        }
        for pb_id, hits in top_triggered
    ]

    performance_rows: List[Dict[str, Any]] = []
    for playbook in normalized_playbooks:
        pb_id = str(playbook.get("id"))
        pb_events = [item for item in normalized_usage_events if str(item.get("playbook_id")) == pb_id]
        if not pb_events:
            continue

        resolved_events = [item for item in pb_events if str(item.get("outcome")) in {"won", "lost", "withdrawn", "no_response"}]
        won_events = [item for item in pb_events if str(item.get("outcome")) == "won"]
        lost_events = [item for item in pb_events if str(item.get("outcome")) in {"lost", "withdrawn", "no_response"}]
        pending_events = [item for item in pb_events if str(item.get("outcome")) == "pending"]
        feedback_values = [
            parse_number(item.get("feedback_score"))
            for item in pb_events
            if parse_number(item.get("feedback_score")) is not None
        ]
        avg_feedback = round(sum(feedback_values) / len(feedback_values), 2) if feedback_values else None
        positive_feedback = len([value for value in feedback_values if value is not None and value > 0])
        negative_feedback = len([value for value in feedback_values if value is not None and value < 0])

        revenue_total = 0.0
        hours_total = 0.0
        for event in pb_events:
            revenue = parse_number(event.get("realized_revenue_usd"))
            hours = parse_number(event.get("realized_hours"))
            if revenue is not None:
                revenue_total += revenue
            if hours and hours > 0:
                hours_total += hours
        effective_hourly = round(revenue_total / hours_total, 2) if hours_total > 0 else None
        win_rate = round((len(won_events) / len(resolved_events)) * 100.0, 2) if resolved_events else None

        performance_rows.append(
            {
                "id": pb_id,
                "title": playbook.get("title"),
                "usage_events": len(pb_events),
                "resolved_events": len(resolved_events),
                "pending_events": len(pending_events),
                "won_events": len(won_events),
                "lost_events": len(lost_events),
                "win_rate_percent": win_rate,
                "effective_hourly_usd": effective_hourly,
                "revenue_total_usd": round(revenue_total, 2),
                "avg_feedback_score": avg_feedback,
                "positive_feedback": positive_feedback,
                "negative_feedback": negative_feedback,
            }
        )

    top_performing = sorted(
        performance_rows,
        key=lambda item: (
            float(parse_number(item.get("win_rate_percent")) or -1.0),
            float(parse_number(item.get("effective_hourly_usd")) or -1.0),
            float(parse_number(item.get("avg_feedback_score")) or 0.0),
            int(parse_number(item.get("usage_events")) or 0),
        ),
        reverse=True,
    )[:6]

    all_feedback_values = [
        parse_number(item.get("feedback_score"))
        for item in normalized_usage_events
        if parse_number(item.get("feedback_score")) is not None
    ]
    feedback_positive = len([value for value in all_feedback_values if value is not None and value > 0])
    feedback_negative = len([value for value in all_feedback_values if value is not None and value < 0])
    feedback_avg = round(sum(all_feedback_values) / len(all_feedback_values), 2) if all_feedback_values else None

    return {
        "total_playbooks": total_playbooks,
        "active_playbooks": len(active_playbooks),
        "total_usage_count": total_usage,
        "usage_events_count": len(normalized_usage_events),
        "feedback_events_count": len(all_feedback_values),
        "feedback_positive_count": feedback_positive,
        "feedback_negative_count": feedback_negative,
        "feedback_avg_score": feedback_avg,
        "triggered_now_count": len(trigger_counts),
        "top_triggered_playbooks": top_triggered_rows,
        "top_performing_playbooks": top_performing,
    }


def compute_delivery_intelligence(
    projects: List[Dict[str, Any]],
    target_hourly_usd: float = 85.0,
    toxicity_keywords: Optional[List[str]] = None,
) -> Dict[str, Any]:
    total_projects = len(projects)
    status_counts = {status: 0 for status in EXECUTION_STATUS_ORDER}
    overdue_milestones = 0
    milestone_total = 0
    milestone_done = 0
    today = datetime.now(timezone.utc).date()

    realized_value = 0.0
    realized_hours = 0.0
    planned_value_total = 0.0
    planned_hours_total = 0.0
    risk_counter: Dict[str, int] = {}
    toxicity_counter: Dict[str, int] = {}
    cycle_days: List[int] = []
    communication_red_zone_projects = 0
    scope_creep_projects = 0
    under_target_hourly_projects = 0

    toxicity_terms = toxicity_keywords or default_scoring_profile().get("toxicity_keywords", [])

    for project in projects:
        status = normalize_execution_status(project.get("status"))
        status_counts[status] = status_counts.get(status, 0) + 1

        planned_value = parse_number(project.get("planned_value_usd"))
        planned_hours = parse_number(project.get("planned_hours"))
        actual_value = parse_number(project.get("actual_value_usd"))
        actual_hours = parse_number(project.get("actual_hours"))

        if planned_value is not None:
            planned_value_total += planned_value
        if planned_hours is not None and planned_hours > 0:
            planned_hours_total += planned_hours
        if actual_value is not None and actual_hours and actual_hours > 0:
            realized_value += actual_value
            realized_hours += actual_hours
            project_effective_hourly = actual_value / actual_hours
            if target_hourly_usd > 0 and project_effective_hourly < target_hourly_usd:
                under_target_hourly_projects += 1

        for risk in normalize_string_list(project.get("risks", [])):
            key = risk.lower()
            risk_counter[key] = risk_counter.get(key, 0) + 1

        milestones = normalize_milestones(project.get("milestones", []))
        for milestone in milestones:
            milestone_total += 1
            milestone_status = normalize_milestone_status(milestone.get("status"))
            if milestone_status == "done":
                milestone_done += 1
            due_date = parse_iso_date(milestone.get("due_date"))
            if due_date and milestone_status != "done" and due_date < today:
                overdue_milestones += 1

        comm_text_blob = " ".join(
            [
                normalize_whitespace(str(project.get("summary", ""))),
                " ".join(normalize_string_list(project.get("risks", []))),
                " ".join(normalize_string_list(project.get("next_actions", []))),
            ]
        )
        toxicity_hits = detect_keyword_hits(comm_text_blob, list(toxicity_terms), limit=8)
        for hit in toxicity_hits:
            toxicity_counter[hit] = toxicity_counter.get(hit, 0) + 1
        if toxicity_hits or status in {"blocked", "at_risk"}:
            communication_red_zone_projects += 1

        if planned_hours and actual_hours and planned_hours > 0 and actual_hours > planned_hours * 1.25:
            scope_creep_projects += 1
        elif planned_value and planned_hours and actual_value and actual_hours and planned_hours > 0 and actual_hours > 0:
            planned_hourly = planned_value / planned_hours
            actual_hourly = actual_value / actual_hours
            if planned_hourly > 0 and actual_hourly < planned_hourly * 0.75:
                scope_creep_projects += 1

        if status == "done":
            start = parse_iso_date(project.get("start_date") or project.get("created_at"))
            completed = parse_iso_date(project.get("completed_at") or project.get("updated_at"))
            if start and completed and completed >= start:
                cycle_days.append((completed - start).days)

    avg_cycle_days = round(sum(cycle_days) / len(cycle_days), 1) if cycle_days else None
    risk_items = sorted(risk_counter.items(), key=lambda x: x[1], reverse=True)
    toxicity_items = sorted(toxicity_counter.items(), key=lambda x: x[1], reverse=True)
    delivery_effective_hourly = round(realized_value / realized_hours, 2) if realized_hours > 0 else None

    return {
        "total_projects": total_projects,
        "active_projects": status_counts.get("planning", 0) + status_counts.get("active", 0) + status_counts.get("at_risk", 0) + status_counts.get("blocked", 0),
        "blocked_projects": status_counts.get("blocked", 0),
        "at_risk_projects": status_counts.get("at_risk", 0),
        "done_projects": status_counts.get("done", 0),
        "overdue_milestones": overdue_milestones,
        "milestone_completion_rate_percent": round((milestone_done / milestone_total) * 100.0, 2) if milestone_total > 0 else 0.0,
        "delivery_effective_hourly_usd": delivery_effective_hourly,
        "planned_effective_hourly_usd": round(planned_value_total / planned_hours_total, 2) if planned_hours_total > 0 else None,
        "avg_cycle_days": avg_cycle_days,
        "target_hourly_usd": round(target_hourly_usd, 2),
        "effective_hourly_alert": bool(delivery_effective_hourly is not None and target_hourly_usd > 0 and delivery_effective_hourly < target_hourly_usd),
        "scope_creep_projects": scope_creep_projects,
        "under_target_hourly_projects": under_target_hourly_projects,
        "communication_red_zone_projects": communication_red_zone_projects,
        "status_breakdown": status_counts,
        "top_risks": [{"risk": key, "count": count} for key, count in risk_items[:6]],
        "top_toxicity_markers": [{"marker": key, "count": count} for key, count in toxicity_items[:6]],
    }


def compute_weekly_feedback_summary(reviews: List[Dict[str, Any]]) -> Dict[str, Any]:
    total_reviews = len(reviews)
    if not reviews:
        return {
            "total_reviews": 0,
            "last_week_start_date": "",
            "average_confidence_percent": None,
            "momentum_delta_percent": None,
            "top_bottlenecks": [],
        }

    confidence_values = [
        parse_number(item.get("confidence_percent"))
        for item in reviews
        if parse_number(item.get("confidence_percent")) is not None
    ]
    average_confidence = (
        round(sum(confidence_values) / len(confidence_values), 2)
        if confidence_values
        else None
    )

    last_block = confidence_values[:4]
    prev_block = confidence_values[4:8]
    momentum_delta = None
    if last_block and prev_block:
        momentum_delta = round((sum(last_block) / len(last_block)) - (sum(prev_block) / len(prev_block)), 2)

    bottleneck_counter: Dict[str, int] = {}
    for item in reviews:
        for bottleneck in normalize_string_list(item.get("bottlenecks", [])):
            key = bottleneck.lower()
            bottleneck_counter[key] = bottleneck_counter.get(key, 0) + 1

    top_bottlenecks = sorted(bottleneck_counter.items(), key=lambda x: x[1], reverse=True)[:6]
    return {
        "total_reviews": total_reviews,
        "last_week_start_date": normalize_iso_date(reviews[0].get("week_start_date")),
        "average_confidence_percent": average_confidence,
        "momentum_delta_percent": momentum_delta,
        "top_bottlenecks": [{"label": label, "count": count} for label, count in top_bottlenecks],
    }


def monday_for_date(value: Any = None) -> str:
    base_date = parse_iso_date(value)
    if base_date is None:
        base_date = datetime.now(timezone.utc).date()
    return (base_date - timedelta(days=base_date.weekday())).isoformat()


def unique_items(items: List[str], limit: int) -> List[str]:
    cleaned: List[str] = []
    seen = set()
    for item in items:
        text = normalize_whitespace(str(item))
        if not text:
            continue
        key = text.lower()
        if key in seen:
            continue
        seen.add(key)
        cleaned.append(text)
        if len(cleaned) >= limit:
            break
    return cleaned


def build_weekly_review_suggestion(store: Dict[str, Any], week_start_date: str = "") -> Dict[str, Any]:
    normalized_projects = [
        normalize_execution_project_record(item)
        for item in store.get("execution_projects", [])
        if isinstance(item, dict)
    ]
    postmortems = [
        item for item in store.get("postmortems", [])
        if isinstance(item, dict)
    ]

    week_start = monday_for_date(week_start_date)
    week_start_dt = parse_iso_date(week_start) or datetime.now(timezone.utc).date()
    week_end_dt = week_start_dt + timedelta(days=6)
    today = datetime.now(timezone.utc).date()

    done_projects_this_week = 0
    done_milestones_this_week = 0
    overdue_milestones = 0
    active_or_risky: List[Tuple[float, Dict[str, Any]]] = []
    risk_counter: Dict[str, int] = {}

    wins: List[str] = []
    misses: List[str] = []
    raw_focus_actions: List[str] = []

    for project in normalized_projects:
        status = normalize_execution_status(project.get("status"))
        due_date = parse_iso_date(project.get("due_date"))
        milestones = normalize_milestones(project.get("milestones", []))

        overdue_for_project = 0
        completed_for_project = 0
        for milestone in milestones:
            ms_status = normalize_milestone_status(milestone.get("status"))
            ms_due = parse_iso_date(milestone.get("due_date"))
            ms_done = parse_iso_date(milestone.get("completed_at"))
            if ms_status == "done":
                completed_for_project += 1
                if ms_done and week_start_dt <= ms_done <= week_end_dt:
                    done_milestones_this_week += 1
            if ms_due and ms_status != "done" and ms_due < today:
                overdue_milestones += 1
                overdue_for_project += 1

        completed_at = parse_iso_date(project.get("completed_at"))
        if status == "done" and completed_at and week_start_dt <= completed_at <= week_end_dt:
            done_projects_this_week += 1
            wins.append(
                f"Delivered project '{project.get('title', 'Untitled')}' for {project.get('client') or 'client'}."
            )

        if completed_for_project > 0 and status in {"active", "at_risk", "blocked"}:
            wins.append(
                f"Progress in '{project.get('title', 'Untitled')}': {completed_for_project} milestones completed."
            )

        risks = normalize_string_list(project.get("risks", []))
        for risk in risks:
            key = risk.lower()
            risk_counter[key] = risk_counter.get(key, 0) + 1

        if status in {"blocked", "at_risk"}:
            misses.append(
                f"Project '{project.get('title', 'Untitled')}' is {status.replace('_', ' ')}."
            )

        if due_date and status in {"planning", "active", "at_risk", "blocked"} and due_date < today:
            misses.append(
                f"Project '{project.get('title', 'Untitled')}' is past due date ({due_date.isoformat()})."
            )

        if overdue_for_project > 0:
            misses.append(
                f"Project '{project.get('title', 'Untitled')}' has {overdue_for_project} overdue milestones."
            )

        for action in normalize_string_list(project.get("next_actions", [])):
            raw_focus_actions.append(f"{project.get('title', 'Project')}: {action}")

        risk_score = 0.0
        if status == "blocked":
            risk_score += 6.0
        elif status == "at_risk":
            risk_score += 4.0
        elif status == "active":
            risk_score += 1.5
        elif status == "planning":
            risk_score += 1.0
        risk_score += min(4.0, overdue_for_project * 1.5)
        risk_score += min(3.0, len(risks) * 0.8)
        progress = parse_number(project.get("progress_percent")) or 0.0
        if status in {"active", "at_risk", "blocked"} and progress < 35:
            risk_score += 1.5
        active_or_risky.append((risk_score, project))

    risk_items_sorted = sorted(risk_counter.items(), key=lambda x: x[1], reverse=True)
    bottlenecks = [label for label, _ in risk_items_sorted[:6]]

    if not bottlenecks and overdue_milestones > 0:
        bottlenecks.append("deadline slippage")
    if not bottlenecks and any(item[0] > 3 for item in active_or_risky):
        bottlenecks.append("delivery uncertainty")

    if done_projects_this_week == 0 and done_milestones_this_week > 0:
        wins.append(f"Closed {done_milestones_this_week} milestone(s) this week.")
    if done_projects_this_week == 0 and done_milestones_this_week == 0:
        wins.append("Maintained delivery continuity; no major outages during current week.")

    postmortem_hits = sort_by_updated_desc(postmortems)[:6]
    for post in postmortem_hits:
        finding = truncate_text(str(post.get("findings", "")), 130)
        if finding:
            misses.append(f"Postmortem signal: {finding}")

    sorted_risky_projects = sorted(active_or_risky, key=lambda item: item[0], reverse=True)
    linked_project_ids = [
        str(project.get("id"))
        for score, project in sorted_risky_projects
        if score > 0 and str(project.get("id"))
    ][:6]

    focus_next_week = unique_items(raw_focus_actions, limit=8)
    if not focus_next_week:
        for _, project in sorted_risky_projects[:4]:
            title = project.get("title", "Project")
            focus_next_week.append(f"{title}: clarify scope and lock acceptance criteria.")
    focus_next_week = unique_items(focus_next_week, limit=8)

    bottleneck_blob = " ".join(bottlenecks).lower()
    experiments: List[str] = []
    if "scope" in bottleneck_blob:
        experiments.append("Introduce scope-lock checklist before every sprint handoff.")
    if "communication" in bottleneck_blob or "response" in bottleneck_blob:
        experiments.append("Run 2 fixed client syncs/week with written decision recap.")
    if "deadline" in bottleneck_blob or "slippage" in bottleneck_blob or overdue_milestones > 0:
        experiments.append("Add mid-week milestone checkpoint with early risk escalation.")
    if not experiments:
        experiments = [
            "Track daily top-1 blocker and resolve it within 24h.",
            "Run Friday mini-retro and convert 1 insight into next-week action.",
        ]
    experiments = unique_items(experiments, limit=6)

    blocked_count = len([1 for _, project in active_or_risky if normalize_execution_status(project.get("status")) == "blocked"])
    at_risk_count = len([1 for _, project in active_or_risky if normalize_execution_status(project.get("status")) == "at_risk"])
    confidence = 78.0
    confidence -= blocked_count * 6.0
    confidence -= at_risk_count * 3.0
    confidence -= min(15.0, float(overdue_milestones) * 1.5)
    confidence += min(8.0, done_projects_this_week * 2.0 + done_milestones_this_week * 0.5)
    confidence = max(35.0, min(92.0, confidence))

    return {
        "week_start_date": week_start,
        "wins": unique_items(wins, limit=8),
        "misses": unique_items(misses, limit=8),
        "bottlenecks": unique_items(bottlenecks, limit=8),
        "experiments": experiments,
        "focus_next_week": focus_next_week,
        "confidence_percent": round(confidence, 1),
        "linked_project_ids": linked_project_ids,
        "source_signals": {
            "projects_considered": len(normalized_projects),
            "done_projects_this_week": done_projects_this_week,
            "done_milestones_this_week": done_milestones_this_week,
            "overdue_milestones": overdue_milestones,
            "blocked_projects": blocked_count,
            "at_risk_projects": at_risk_count,
        },
    }


def build_phase1_payload(store: Dict[str, Any]) -> Dict[str, Any]:
    opportunities = [item for item in store.get("opportunities", []) if isinstance(item, dict)]
    opportunities = sort_by_updated_desc(opportunities)
    opportunities = [enrich_scored_opportunity(item, store) for item in opportunities]
    decisions = sort_by_updated_desc([item for item in store.get("decisions", []) if isinstance(item, dict)])
    raw_postmortems = sort_by_updated_desc([item for item in store.get("postmortems", []) if isinstance(item, dict)])
    raw_execution_projects = sort_by_updated_desc([item for item in store.get("execution_projects", []) if isinstance(item, dict)])
    raw_weekly_reviews = sort_by_updated_desc([item for item in store.get("weekly_reviews", []) if isinstance(item, dict)])
    raw_playbooks = sort_by_updated_desc([item for item in store.get("playbooks", []) if isinstance(item, dict)])
    raw_playbook_usage_events = sort_by_updated_desc([item for item in store.get("playbook_usage_events", []) if isinstance(item, dict)])

    labels = get_taxonomy_labels(store)
    postmortems: List[Dict[str, Any]] = []
    for item in raw_postmortems:
        normalized = dict(item)
        normalized["taxonomy_tags"] = resolve_taxonomy_tags(
            root_causes=normalize_string_list(item.get("root_causes", [])),
            findings=normalize_whitespace(str(item.get("findings", ""))),
            what_worked=normalize_whitespace(str(item.get("what_worked", ""))),
            explicit_tags=item.get("taxonomy_tags", []),
            labels=labels,
        )
        postmortems.append(normalized)

    execution_projects = [normalize_execution_project_record(item) for item in raw_execution_projects]
    weekly_reviews = [normalize_weekly_review_record(item) for item in raw_weekly_reviews]
    playbooks = [normalize_playbook_record(item) for item in raw_playbooks]
    playbook_usage_events = [normalize_playbook_usage_event(item) for item in raw_playbook_usage_events]
    taxonomy_summary = compute_outcome_taxonomy_summary(store, postmortems)
    scoring_profile = merge_scoring_profile(store.get("scoring_profile", {}))
    target_hourly = parse_number(store.get("success_targets", {}).get("effective_hourly_min_usd")) or 85.0
    delivery_intelligence = compute_delivery_intelligence(
        execution_projects,
        target_hourly_usd=float(target_hourly),
        toxicity_keywords=list(scoring_profile.get("toxicity_keywords", [])),
    )
    weekly_feedback_summary = compute_weekly_feedback_summary(weekly_reviews)
    playbook_summary = compute_playbook_summary(playbooks, playbook_usage_events, opportunities, execution_projects)
    backup_items = list_ops_backups(limit=8)
    backup_summary = {
        "total_backups": len(list_ops_backups(limit=100)),
        "latest_backup_at": backup_items[0].get("updated_at") if backup_items else "",
        "items": backup_items,
        "backup_dir": BACKUP_DIR,
    }

    return {
        "status": "success",
        "ops_store_path": OPS_STORE_PATH,
        "success_targets": store.get("success_targets", {}),
        "scoring_profile": scoring_profile,
        "outcome_taxonomy": store.get("outcome_taxonomy", default_outcome_taxonomy()),
        "outcome_taxonomy_summary": taxonomy_summary,
        "metrics": compute_phase1_metrics(store),
        "pipeline_board": build_pipeline_board(opportunities),
        "opportunities": opportunities,
        "decisions": decisions,
        "postmortems": postmortems,
        "execution_projects": execution_projects,
        "weekly_reviews": weekly_reviews,
        "playbooks": playbooks,
        "playbook_usage_events": playbook_usage_events,
        "delivery_intelligence": delivery_intelligence,
        "weekly_feedback_summary": weekly_feedback_summary,
        "playbook_summary": playbook_summary,
        "backup_summary": backup_summary,
        "updated_at": store.get("updated_at"),
    }


def delete_record_by_id(store: Dict[str, Any], collection_key: str, record_id: str) -> bool:
    records = store.get(collection_key, [])
    if not isinstance(records, list):
        return False

    original_len = len(records)
    records = [item for item in records if str(item.get("id")) != record_id]
    if len(records) == original_len:
        return False

    store[collection_key] = records
    return True


def build_proposal_pack(store: Dict[str, Any], opportunity_id: str) -> Dict[str, Any]:
    raw_opportunities = [item for item in store.get("opportunities", []) if isinstance(item, dict)]
    matched = next((item for item in raw_opportunities if str(item.get("id")) == opportunity_id), None)
    if not matched:
        raise HTTPException(status_code=404, detail="Opportunity not found")

    opportunity = enrich_scored_opportunity(matched, store)

    all_decisions = [item for item in store.get("decisions", []) if isinstance(item, dict)]
    linked_decisions: List[Dict[str, Any]] = []
    for decision in all_decisions:
        linked_ids = normalize_string_list(decision.get("linked_opportunity_ids", []))
        if opportunity_id in linked_ids:
            linked_decisions.append(decision)
    if not linked_decisions:
        linked_decisions = [
            item
            for item in all_decisions
            if normalize_whitespace(str(item.get("status", "active"))).lower() in {"active", "validated"}
        ][:4]

    all_postmortems = [item for item in store.get("postmortems", []) if isinstance(item, dict)]
    linked_postmortems = [item for item in all_postmortems if str(item.get("opportunity_id", "")) == opportunity_id]
    if not linked_postmortems:
        linked_postmortems = all_postmortems[:4]

    playbook_context = normalize_whitespace(
        " ".join(
            [
                str(opportunity.get("title", "")),
                str(opportunity.get("summary", "")),
                str(opportunity.get("notes", "")),
                " ".join(str(item.get("findings", "")) for item in linked_postmortems[:3]),
            ]
        )
    )
    playbook_payload = build_playbook_suggestions(
        store,
        context_text=playbook_context,
        opportunity_id=opportunity_id,
        project_id="",
        limit=3,
    )
    playbook_recommendations: List[Dict[str, Any]] = []
    for item in playbook_payload.get("suggestions", []):
        if not isinstance(item, dict):
            continue
        playbook_recommendations.append(
            {
                "playbook_id": normalize_whitespace(str(item.get("playbook_id", ""))),
                "title": truncate_text(str(item.get("title", "")), 140),
                "score": round(parse_number(item.get("score")) or 0.0, 1),
                "matched_triggers": normalize_string_list(item.get("matched_triggers", []))[:5],
                "actions": normalize_string_list(item.get("actions", []))[:3],
                "offer_template": truncate_text(str(item.get("offer_template", "")), 240),
                "historical_win_rate_percent": parse_number(item.get("historical_win_rate_percent")),
                "historical_effective_hourly_usd": parse_number(item.get("historical_effective_hourly_usd")),
                "historical_feedback_score": parse_number(item.get("historical_feedback_score")),
            }
        )

    score_value = parse_number(opportunity.get("score_v1"))
    score_recommendation = str(opportunity.get("score_recommendation", "consider"))
    hourly_estimate = parse_number(opportunity.get("estimated_hourly_usd"))

    proof_points: List[str] = []
    for decision in linked_decisions:
        summary = normalize_whitespace(str(decision.get("summary", "")))
        impact = normalize_whitespace(str(decision.get("expected_impact", "")))
        rationale = normalize_whitespace(str(decision.get("rationale", "")))
        if summary:
            text = summary
            if impact:
                text += f" | Impact: {impact}"
            elif rationale:
                text += f" | Why: {truncate_text(rationale, 90)}"
            proof_points.append(text)
    proof_points = proof_points[:6]

    risk_flags: List[str] = []
    for line in opportunity.get("score_rationale", []) or []:
        lower = str(line).lower()
        if "risk" in lower or "low" in lower or "missing" in lower:
            risk_flags.append(str(line))
    for post in linked_postmortems[:3]:
        findings = normalize_whitespace(str(post.get("findings", "")))
        if findings:
            risk_flags.append(f"Postmortem signal: {truncate_text(findings, 140)}")
    if not risk_flags:
        risk_flags.append("No explicit high-risk markers detected; validate scope early.")

    questions_for_client: List[str] = []
    if parse_number(opportunity.get("estimated_hours")) is None:
        questions_for_client.append("Can you clarify expected scope and total delivery hours?")
    if parse_number(opportunity.get("expected_revenue_usd")) is None:
        questions_for_client.append("What budget range is approved for this scope?")
    if not normalize_whitespace(str(opportunity.get("summary", ""))):
        questions_for_client.append("What are the top 3 outcomes this project must achieve?")
    questions_for_client.extend([
        "What is your preferred communication cadence and timezone overlap?",
        "How will success be measured in the first 2 weeks?",
    ])
    dedup_questions: List[str] = []
    seen_q = set()
    for q in questions_for_client:
        key = q.lower()
        if key in seen_q:
            continue
        seen_q.add(key)
        dedup_questions.append(q)
    questions_for_client = dedup_questions[:5]

    scope_assumptions = [
        f"Primary stack likely includes: {normalize_whitespace(str(opportunity.get('summary', 'web development tasks')))}.",
        "Delivery split: rapid initial audit, implementation milestones, and QA validation.",
        "All changes include documented handoff notes and rollback-safe deployment approach.",
    ]

    negotiation_plan = [
        "Lead with measurable outcomes and timeline confidence before discussing discounting.",
        "Anchor price to expected business impact and implementation risk reduction.",
        "Offer tiered options: core scope first, then upsell iteration/maintenance pack.",
    ]
    for rec in playbook_recommendations[:2]:
        title = normalize_whitespace(str(rec.get("title", "")))
        triggers = normalize_string_list(rec.get("matched_triggers", []))
        actions = normalize_string_list(rec.get("actions", []))
        trigger_text = ", ".join(triggers[:3]) if triggers else "context fit"
        action_text = actions[0] if actions else "apply structured negotiation boundary"
        if title:
            negotiation_plan.append(f"Playbook '{title}' due to {trigger_text}: {action_text}.")
    negotiation_plan = unique_items(negotiation_plan, limit=6)

    return {
        "opportunity_id": opportunity_id,
        "generated_at": now_iso(),
        "version": "v2",
        "opportunity": {
            "id": opportunity.get("id"),
            "title": opportunity.get("title"),
            "client": opportunity.get("client"),
            "stage": opportunity.get("stage"),
            "summary": opportunity.get("summary"),
            "expected_revenue_usd": parse_number(opportunity.get("expected_revenue_usd")),
            "estimated_hours": parse_number(opportunity.get("estimated_hours")),
        },
        "score_summary": {
            "score_v1": round(score_value, 1) if score_value is not None else None,
            "recommendation": score_recommendation,
            "estimated_hourly_usd": round(hourly_estimate, 2) if hourly_estimate is not None else None,
            "rationale": list(opportunity.get("score_rationale", []))[:4],
        },
        "why_this_project": [
            f"Score recommendation: {score_recommendation}.",
            "Opportunity aligns with current service focus and near-term revenue goals.",
            "Potential to convert into longer-term support/maintenance engagement.",
        ],
        "proof_points": proof_points,
        "risk_flags": risk_flags[:6],
        "questions_for_client": questions_for_client,
        "scope_assumptions": scope_assumptions,
        "negotiation_plan": negotiation_plan,
        "playbook_recommendations": playbook_recommendations,
        "cover_letter_draft": "",
    }


def get_message_plain_text(message: Dict[str, Any], max_chars: int = 1200) -> str:
    parts = message.get("parts", [])
    collected: List[str] = []
    if isinstance(parts, list):
        for part in parts:
            if isinstance(part, str):
                collected.append(part)
            elif isinstance(part, dict) and "text" in part:
                collected.append(str(part.get("text", "")))
    elif isinstance(parts, str):
        collected.append(parts)

    joined = "\n".join(collected)
    joined = joined.replace("[THOUGHT_BLOCK]", "").replace("[/THOUGHT_BLOCK]", "")
    return truncate_text(joined, max_chars)


def read_attachment_snippet(filename: str, include_text: bool = True, max_chars: int = 1400) -> str:
    if not filename:
        return ""

    suffix = os.path.splitext(filename)[1].lower()
    if suffix in {".pdf"}:
        return f"PDF attachment: {filename}"
    if suffix in {".png", ".jpg", ".jpeg", ".gif", ".webp"}:
        return f"Image attachment: {filename}"
    if suffix in {".mp4", ".mov", ".avi", ".mkv"}:
        return f"Video attachment: {filename}"
    if suffix in {".mp3", ".wav", ".m4a"}:
        return f"Audio attachment: {filename}"

    if not include_text or suffix not in TEXT_ATTACHMENT_EXTENSIONS:
        return f"File attachment: {filename}"

    path = os.path.join(ATTACHMENTS_PATH, filename)
    if not os.path.exists(path):
        return f"File attachment (missing locally): {filename}"

    try:
        with open(path, "r", encoding="utf-8", errors="ignore") as attachment_file:
            text = attachment_file.read(max_chars * 2)
        text = truncate_text(text, max_chars)
        if text:
            return f"{filename}: {text}"
        return f"File attachment: {filename}"
    except Exception:
        return f"File attachment: {filename}"


def extract_attachment_digests(attachments: List[Dict[str, Any]], include_text: bool = True) -> List[Dict[str, Any]]:
    digests: List[Dict[str, Any]] = []
    for attachment in attachments or []:
        if not isinstance(attachment, dict):
            continue
        name = str(attachment.get("name") or "").strip()
        if not name:
            continue
        summary = read_attachment_snippet(name, include_text=include_text)
        digests.append({
            "attachment_id": name,
            "summary": truncate_text(summary, 420),
            "source_attachment_ids": [name],
        })
    return digests


def split_history_chunks(messages: List[Dict[str, Any]], chunk_size: int, overlap: int) -> List[Tuple[int, int, List[Dict[str, Any]]]]:
    if chunk_size < 1:
        chunk_size = DEFAULT_CHUNK_SIZE
    overlap = max(0, min(overlap, chunk_size - 1))
    step = max(1, chunk_size - overlap)

    chunks: List[Tuple[int, int, List[Dict[str, Any]]]] = []
    start = 0
    total = len(messages)
    while start < total:
        end = min(total, start + chunk_size)
        chunks.append((start, end, messages[start:end]))
        if end >= total:
            break
        start += step
    return chunks


def fact_priority(text: str) -> str:
    low = text.lower()
    if re.search(r"\b\d{4}\b|\$|%|deadline|email|phone|visa|relocat|salary|linkedin|github", low):
        return "hard"
    if re.search(r"\d", low) or any(
        marker in low
        for marker in ["experience", "skill", "python", "react", "fastapi", "position", "company", "requirement", "cover letter"]
    ):
        return "high"
    return "normal"


def extract_fact_candidates(text: str, limit: int = 12) -> List[str]:
    candidates: List[str] = []
    seen = set()
    chunks = re.split(r"(?<=[.!?])\s+|\n+", text)
    for chunk in chunks:
        normalized = normalize_whitespace(chunk)
        if len(normalized) < 20 or len(normalized) > 260:
            continue
        low = normalized.lower()
        is_fact_like = bool(re.search(r"\d", normalized)) or any(
            key in low
            for key in ["experience", "years", "position", "company", "deadline", "salary", "remote", "hybrid", "visa", "portfolio"]
        )
        if not is_fact_like:
            continue
        dedupe_key = low[:180]
        if dedupe_key in seen:
            continue
        seen.add(dedupe_key)
        candidates.append(normalized)
        if len(candidates) >= limit:
            break
    return candidates


def summarize_chunk(
    chunk_id: str,
    turn_start: int,
    turn_end: int,
    messages: List[Dict[str, Any]],
    include_attachments: bool,
) -> Dict[str, Any]:
    timeline_lines: List[str] = []
    source_attachment_ids: List[str] = []
    fact_source_text: List[str] = []

    for offset, message in enumerate(messages, start=turn_start):
        role = str(message.get("role", "user")).upper()
        text = get_message_plain_text(message, max_chars=460)
        if text:
            timeline_lines.append(f"{role}#{offset}: {text}")
            fact_source_text.append(text)

        if include_attachments:
            digests = extract_attachment_digests(message.get("attachments", []) or [], include_text=True)
            if digests:
                digest_preview = " | ".join(d["summary"] for d in digests[:3])
                timeline_lines.append(f"ATTACH#{offset}: {digest_preview}")
                fact_source_text.extend(d["summary"] for d in digests[:3])
                for digest in digests:
                    source_attachment_ids.extend(digest.get("source_attachment_ids", []))

    summary = truncate_text("\n".join(timeline_lines[:14]), 2600)
    facts: List[Dict[str, Any]] = []
    for index, fact_text in enumerate(extract_fact_candidates("\n".join(fact_source_text), limit=10), start=1):
        facts.append({
            "id": f"{chunk_id}-fact-{index}",
            "text": fact_text,
            "priority": fact_priority(fact_text),
            "source_turn_ids": list(range(turn_start, turn_end + 1)),
            "source_attachment_ids": sorted(set(source_attachment_ids)),
        })

    token_estimate = estimate_tokens_from_text(summary + "\n".join(f["text"] for f in facts))
    return {
        "chunk_id": chunk_id,
        "turn_start": turn_start,
        "turn_end": turn_end,
        "summary": summary,
        "facts": facts,
        "token_estimate": token_estimate,
        "updated_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
    }


def rank_relevant_chunks(chunk_summaries: List[Dict[str, Any]], task: str, max_chunks: int = 4) -> List[Dict[str, Any]]:
    if not chunk_summaries:
        return []

    task_terms = set(re.findall(r"[A-Za-zА-Яа-я0-9_]{4,}", task.lower()))
    scored: List[Tuple[float, Dict[str, Any]]] = []

    for index, chunk in enumerate(chunk_summaries):
        haystack = (chunk.get("summary", "") + " " + " ".join(f.get("text", "") for f in chunk.get("facts", []))).lower()
        term_hits = sum(1 for term in task_terms if term in haystack)
        recency_bonus = (index + 1) / max(1, len(chunk_summaries))
        score = float(term_hits) + recency_bonus
        scored.append((score, chunk))

    scored.sort(key=lambda item: item[0], reverse=True)
    return [item[1] for item in scored[:max_chunks]]


def packet_token_estimate(packet: Dict[str, Any]) -> int:
    return estimate_tokens_from_text(json.dumps(packet, ensure_ascii=False))


def compact_writer_packet(packet: Dict[str, Any], token_budget: int) -> Dict[str, Any]:
    compacted = {
        "version": packet.get("version", 0),
        "task": packet.get("task", ""),
        "brief": packet.get("brief", ""),
        "latest_turns": list(packet.get("latest_turns", [])),
        "must_keep_facts": list(packet.get("must_keep_facts", [])),
        "relevant_chunk_summaries": list(packet.get("relevant_chunk_summaries", [])),
        "token_budget": token_budget,
    }

    compacted["input_token_estimate"] = packet_token_estimate(compacted)

    while compacted["input_token_estimate"] > token_budget and compacted["relevant_chunk_summaries"]:
        compacted["relevant_chunk_summaries"].pop()
        compacted["input_token_estimate"] = packet_token_estimate(compacted)

    while compacted["input_token_estimate"] > token_budget and len(compacted["latest_turns"]) > 2:
        compacted["latest_turns"].pop(0)
        compacted["input_token_estimate"] = packet_token_estimate(compacted)

    while compacted["input_token_estimate"] > token_budget and len(compacted["must_keep_facts"]) > 6:
        compacted["must_keep_facts"].pop()
        compacted["input_token_estimate"] = packet_token_estimate(compacted)

    if compacted["input_token_estimate"] > token_budget and len(compacted["brief"]) > 240:
        compacted["brief"] = truncate_text(compacted["brief"], 240)
        compacted["input_token_estimate"] = packet_token_estimate(compacted)

    return compacted


def build_canonical_memory(chunk_size: int, overlap: int, include_attachments: bool) -> Dict[str, Any]:
    global canonical_memory, memory_dirty

    if not current_history:
        raise HTTPException(status_code=400, detail="Load history first before rebuilding memory.")

    chunk_size = max(10, min(int(chunk_size), 80))
    overlap = max(0, min(int(overlap), chunk_size - 1))

    chunk_summaries: List[Dict[str, Any]] = []
    for chunk_index, (start, end, chunk_messages) in enumerate(split_history_chunks(current_history, chunk_size, overlap), start=1):
        chunk_id = f"chunk-{chunk_index}"
        chunk_summaries.append(
            summarize_chunk(
                chunk_id=chunk_id,
                turn_start=start + 1,
                turn_end=end,
                messages=chunk_messages,
                include_attachments=include_attachments,
            )
        )

    deduped_facts: Dict[str, Dict[str, Any]] = {}
    for chunk in chunk_summaries:
        for fact in chunk.get("facts", []):
            key = normalize_whitespace(str(fact.get("text", "")).lower())
            if not key:
                continue
            existing = deduped_facts.get(key)
            if not existing:
                deduped_facts[key] = fact
                continue
            priorities = {"normal": 0, "high": 1, "hard": 2}
            if priorities.get(fact.get("priority", "normal"), 0) > priorities.get(existing.get("priority", "normal"), 0):
                deduped_facts[key] = fact

    all_facts = list(deduped_facts.values())
    all_facts.sort(key=lambda fact: {"hard": 0, "high": 1, "normal": 2}.get(fact.get("priority", "normal"), 3))
    must_keep_facts = all_facts[:18]

    last_user_messages = [msg for msg in current_history if msg.get("role") == "user"]
    objective = (
        truncate_text(get_message_plain_text(last_user_messages[-1]), 220)
        if last_user_messages
        else "Prepare cover letters with high alignment to job requirements."
    )

    candidate_lines = []
    vacancy_lines = []
    for fact in all_facts:
        text = fact.get("text", "")
        low = text.lower()
        if any(marker in low for marker in ["experience", "project", "built", "skill", "stack", "years"]):
            candidate_lines.append(text)
        if any(marker in low for marker in ["position", "company", "requirement", "job", "hiring", "deadline"]):
            vacancy_lines.append(text)

    candidate_profile = truncate_text("; ".join(candidate_lines[:8]), 520)
    vacancy_profile = truncate_text("; ".join(vacancy_lines[:8]), 520)

    canonical_memory = {
        "version": int(canonical_memory.get("version", 0)) + 1,
        "objective": objective,
        "candidate_profile": candidate_profile,
        "vacancy_profile": vacancy_profile,
        "style_rules": [
            "Write concise and specific cover letters.",
            "Prioritize measurable achievements over generic claims.",
            "Match job requirements explicitly.",
            "Avoid hallucinated experience.",
        ],
        "constraints": [
            "Do not invent facts.",
            "Keep alignment with provided context only.",
        ],
        "must_keep_facts": must_keep_facts,
        "open_questions": [],
        "chunk_summaries": chunk_summaries,
        "config": {
            "chunk_size": chunk_size,
            "overlap": overlap,
            "include_attachments": include_attachments,
        },
        "updated_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
    }

    memory_dirty = False
    return canonical_memory


def ensure_memory_ready() -> Dict[str, Any]:
    if not current_history:
        raise HTTPException(status_code=400, detail="Load history first before using writer context.")

    if canonical_memory and not memory_dirty:
        return canonical_memory

    return build_canonical_memory(
        chunk_size=DEFAULT_CHUNK_SIZE,
        overlap=DEFAULT_CHUNK_OVERLAP,
        include_attachments=True,
    )


def build_writer_packet(task: str, token_budget: int, latest_turns_count: int) -> Dict[str, Any]:
    memory = ensure_memory_ready()
    latest_turns_count = max(2, min(int(latest_turns_count), 12))
    token_budget = max(400, min(int(token_budget), 4000))

    latest_messages = current_history[-latest_turns_count:]
    latest_turns: List[str] = []
    for message in latest_messages:
        role = "Strategist" if message.get("role") == "model" else "User"
        timestamp = normalize_timestamp(message.get("timestamp"))
        latest_turns.append(f"{role} [{timestamp}]: {get_message_plain_text(message, max_chars=520)}")

    relevant_chunks = rank_relevant_chunks(memory.get("chunk_summaries", []), task=task, max_chunks=4)
    must_keep_facts = list(memory.get("must_keep_facts", []))[:12]

    brief_parts = [
        f"Objective: {memory.get('objective', '')}",
        f"Candidate profile: {memory.get('candidate_profile', '')}",
        f"Vacancy profile: {memory.get('vacancy_profile', '')}",
        "Style: " + "; ".join(memory.get("style_rules", [])),
        "Constraints: " + "; ".join(memory.get("constraints", [])),
    ]
    brief = "\n".join(part for part in brief_parts if normalize_whitespace(part))

    packet = {
        "version": memory.get("version", 0),
        "task": task,
        "brief": truncate_text(brief, 1800),
        "latest_turns": latest_turns,
        "must_keep_facts": must_keep_facts,
        "relevant_chunk_summaries": relevant_chunks,
        "token_budget": token_budget,
    }
    return compact_writer_packet(packet, token_budget=token_budget)


def get_writer_client() -> genai.Client:
    if client is not None:
        return client
    if DEFAULT_API_KEY:
        return genai.Client(api_key=DEFAULT_API_KEY)
    raise HTTPException(status_code=400, detail="API key is required for writer model.")


def extract_response_text(response: Any) -> str:
    text = getattr(response, "text", None)
    if isinstance(text, str) and text.strip():
        return text

    try:
        parts = response.candidates[0].content.parts
        collected = []
        for part in parts:
            if hasattr(part, "text") and part.text:
                collected.append(part.text)
        if collected:
            return "\n".join(collected)
    except Exception:
        pass

    return ""


def get_gemini_history(messages):
    """Convert local normalized history to Gemini history format for the new SDK."""
    gemini_history = []
    for msg in messages:
        role = msg.get("role", "user")
        if role == "assistant": role = "model"
        timestamp = normalize_timestamp(msg.get("timestamp"))
        
        # New SDK expects Content objects with Part objects
        parts = [types.Part.from_text(text=f"[TIMESTAMP]{timestamp}[/TIMESTAMP]")]
        for p in msg.get("parts", []):
            if isinstance(p, str):
                parts.append(types.Part.from_text(text=p))
            elif isinstance(p, dict) and "text" in p:
                parts.append(types.Part.from_text(text=p["text"]))
        
        if parts:
            gemini_history.append(types.Content(role=role, parts=parts))
    return gemini_history

@app.post("/api/load_history")
async def load_history(data: dict):
    global client, chat_session, current_history, total_tokens, current_file_path, current_model_name, canonical_memory, memory_dirty
    api_key = data.get("api_key") or DEFAULT_API_KEY
    file_path = data.get("history_file_path")
    
    if not api_key:
        raise HTTPException(status_code=400, detail="API Key is required")
    if not file_path:
        raise HTTPException(status_code=400, detail="history_file_path is required")
    
    # Check for file using Smart Search (look in parent directories)
    filename = os.path.basename(file_path)
    search_start = os.path.isabs(file_path) and os.path.dirname(file_path) or os.getcwd()
    
    found_path = None
    current_search_dir = search_start
    
    # Search up to 6 levels up to find the file (covers deep dist folders)
    for _ in range(7):
        # Check for .synced first, then raw .json
        for candidate_name in [filename + ".synced", filename]:
            check_path = os.path.join(current_search_dir, candidate_name)
            if os.path.exists(check_path):
                found_path = check_path
                logger.info("Smart Search found file at: %s", found_path)
                break
        if found_path: break
        
        # Move up
        new_parent = os.path.dirname(current_search_dir)
        if new_parent == current_search_dir: break # Reached root
        current_search_dir = new_parent

    if not found_path:
        logger.warning("Smart Search failed for %s starting from %s", filename, search_start)
        target_path = os.path.join(HISTORY_FILE_DIR, filename)
        try:
            os.makedirs(os.path.dirname(target_path), exist_ok=True)
            with open(target_path, "w", encoding="utf-8") as new_history:
                json.dump({"contents": []}, new_history, ensure_ascii=False, indent=2)
            found_path = target_path
            logger.info("Created empty history file at %s", target_path)
        except Exception as e:
            error_id = log_exception(f"Failed creating empty history file: {target_path}", e)
            raise HTTPException(status_code=500, detail=to_user_error("Cannot initialize history file", error_id))
    
    target_path = found_path
    current_file_path = target_path
    
    logger.info("Resolved history path: %s", target_path)
    
    # Initialize the new SDK client
    client = genai.Client(api_key=api_key)
    
    try:
        with open(target_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except Exception as e:
        error_id = log_exception(f"Failed reading history JSON: {target_path}", e)
        raise HTTPException(status_code=500, detail=to_user_error("Error reading history JSON", error_id))
        
    # Normalize structure and store in memory for pagination
    messages = []
    contents = []
    
    # Defensive key checking
    # Normalize structure and store in memory for pagination
    messages = []
    contents = []
    
    # Defensive key checking for different AI Studio export formats
    if isinstance(data, dict):
        if "contents" in data and isinstance(data["contents"], list):
            contents = data["contents"]
        elif "chunkedPrompt" in data and "chunks" in data["chunkedPrompt"]:
            contents = data["chunkedPrompt"]["chunks"]
        elif "messages" in data and isinstance(data["messages"], list):
            contents = data["messages"]
    elif isinstance(data, list):
        contents = data

    for item in contents:
        # Standardize 'content' wrapper if present
        if "content" in item:
            role = item.get("role") or item["content"].get("role", "user")
            item_parts = item["content"].get("parts", [])
            attachments = item.get("attachments", []) or item["content"].get("attachments", [])
        else:
            role = item.get("role", "user")
            item_parts = item.get("parts", [])
            attachments = item.get("attachments", [])

        parts = []
        # Handle cases where parts is a single string or missing
        if isinstance(item_parts, str):
            item_parts = [{"text": item_parts}]
        elif not isinstance(item_parts, list):
            item_parts = []
            if "text" in item:
                item_parts.append({"text": item["text"]})

        for p in item_parts:
            text = ""
            is_thought = False
            if isinstance(p, str): 
                text = p
            elif isinstance(p, dict): 
                text = p.get("text", "")
                is_thought = p.get("thought", False) or item.get("isThought", False)
            
            if text:
                if is_thought:
                    parts.append(f"[THOUGHT_BLOCK]{text}[/THOUGHT_BLOCK]")
                else:
                    parts.append(text)
        
        # Check for AI Studio drive-style attachments (same as before)
        drive_keys = ["driveImage", "driveDocument", "driveFile", "driveVideo"]
        for dk in drive_keys:
            if dk in item and "id" in item[dk]:
                fid = item[dk]["id"]
                for ext in ["png", "pdf", "txt", "mp4", "jpg", "jpeg"]:
                    fname = f"{fid}.{ext}"
                    fpath = os.path.join(ATTACHMENTS_PATH, fname)
                    if os.path.exists(fpath):
                        mtype = "image/png"
                        if ext == "pdf": mtype = "application/pdf"
                        elif ext == "txt": mtype = "text/plain"
                        elif ext == "mp4": mtype = "video/mp4"
                        if not any(a.get("name") == fname for a in attachments):
                            attachments.append({
                                "name": fname,
                                "type": mtype,
                                "size": os.path.getsize(fpath),
                                "url": f"{BASE_URL}/attachments/{fname}"
                            })
                        break

        for att in attachments:
            if isinstance(att, dict) and att.get("url", "").startswith("/attachments/"):
                att["url"] = BASE_URL + att["url"]
        
        if parts or attachments:
            item_timestamp = (
                item.get("timestamp")
                or item.get("createTime")
                or item.get("updatedTime")
                or (item.get("content", {}) if isinstance(item.get("content"), dict) else {}).get("timestamp")
            )
            messages.append({
                "role": role,
                "parts": parts,
                "attachments": attachments,
                "timestamp": normalize_timestamp(item_timestamp),
            })
    
    current_history = messages
    canonical_memory = {}
    memory_dirty = True
    logger.info("Normalized %s messages from %s source items", len(current_history), len(contents))
    
    # Initialize total_tokens estimate - using ~0.3 tokens per character + overhead
    total_chars = sum(len("".join(m["parts"])) for m in current_history)
    # Estimate: chars / 3.3 (approx 0.3 tokens/char) + 4 tokens overhead per message
    total_tokens = int(total_chars / 3.3) + (len(current_history) * 4)
    
    # Initialize chat session with history context using new SDK
    history_context = get_gemini_history(current_history)
    logger.info("Initializing chat session with %s historical messages", len(history_context))
    
    model_name = data.get("model", "gemini-3.1-pro-preview") if isinstance(data, dict) else "gemini-3.1-pro-preview"
    chat_session = client.chats.create(model=model_name, history=history_context)
    current_model_name = model_name
    
    return {"status": "success", "file": target_path, "total_messages": len(current_history), "total_tokens": total_tokens}

@app.post("/api/sync_drive")
async def sync_drive(data: dict):
    global memory_dirty
    links_string = data.get("links_string", "")
    import sync_drive
    try:
        sync_drive.process_history(links_string=links_string)
        memory_dirty = True
        return {"status": "success"}
    except Exception as e:
        error_id = log_exception("sync_drive failed", e)
        raise HTTPException(status_code=500, detail=to_user_error("Drive sync failed", error_id))

@app.get("/api/history")
async def get_history(offset: int = 0, limit: int = 20):
    global current_history, total_tokens, memory_dirty
    
    # Re-normalize if someone calls this without load_history (fallback to hardcoded file)
    if not current_history:
        logger.info("current_history is empty in get_history, attempting fallback load")
        filename = "Работа над собой 3.json.synced"
        abs_path = os.path.join(HISTORY_FILE_DIR, filename)
        if not os.path.exists(abs_path):
            abs_path = os.path.join(HISTORY_FILE_DIR, "Работа над собой 3.json")
            
        logger.info("Fallback path: %s", abs_path)
        if os.path.exists(abs_path):
            try:
                with open(abs_path, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    contents = []
                    if isinstance(data, dict):
                        if "contents" in data: contents = data["contents"]
                        elif "chunkedPrompt" in data: contents = data["chunkedPrompt"].get("chunks", [])
                    elif isinstance(data, list): contents = data
                    
                    for item in contents:
                        # Standardize 'content' wrapper if present
                        if "content" in item:
                            role = item.get("role") or item["content"].get("role", "user")
                            item_parts = item["content"].get("parts", [])
                            attachments = item.get("attachments", []) or item["content"].get("attachments", [])
                        else:
                            role = item.get("role", "user")
                            item_parts = item.get("parts", [])
                            attachments = item.get("attachments", [])

                        parts = []
                        if isinstance(item_parts, str): item_parts = [{"text": item_parts}]
                        elif not isinstance(item_parts, list):
                            item_parts = []
                            if "text" in item: item_parts.append({"text": item["text"]})

                        for p in item_parts:
                            text = ""
                            is_thought = False
                            if isinstance(p, str): text = p
                            elif isinstance(p, dict):
                                text = p.get("text", "")
                                is_thought = p.get("thought", False) or item.get("isThought", False)
                            if text:
                                if is_thought: parts.append(f"[THOUGHT_BLOCK]{text}[/THOUGHT_BLOCK]")
                                else: parts.append(text)
                        
                        # Check for AI Studio drive-style attachments
                        drive_keys = ["driveImage", "driveDocument", "driveFile", "driveVideo"]
                        for dk in drive_keys:
                            if dk in item and "id" in item[dk]:
                                fid = item[dk]["id"]
                                for ext in ["png", "pdf", "txt", "mp4", "jpg", "jpeg"]:
                                    fname = f"{fid}.{ext}"
                                    fpath = os.path.join(ATTACHMENTS_PATH, fname)
                                    if os.path.exists(fpath):
                                        mtype = "image/png"
                                        if ext == "pdf": mtype = "application/pdf"
                                        elif ext == "txt": mtype = "text/plain"
                                        elif ext == "mp4": mtype = "video/mp4"
                                        if not any(a.get("name") == fname for a in attachments):
                                            attachments.append({
                                                "name": fname,
                                                "type": mtype,
                                                "size": os.path.getsize(fpath),
                                                "url": f"{BASE_URL}/attachments/{fname}"
                                            })
                                        break
                                        
                        for att in attachments:
                            if isinstance(att, dict) and att.get("url", "").startswith("/attachments/"): att["url"] = BASE_URL + att["url"]
                        
                        if parts or attachments:
                            item_timestamp = (
                                item.get("timestamp")
                                or item.get("createTime")
                                or item.get("updatedTime")
                                or (item.get("content", {}) if isinstance(item.get("content"), dict) else {}).get("timestamp")
                            )
                            current_history.append({
                                "role": role,
                                "parts": parts,
                                "attachments": attachments,
                                "timestamp": normalize_timestamp(item_timestamp),
                            })
                    logger.info("Fallback normalized %s messages", len(current_history))
                    # Recalculate total_tokens in fallback too
                    total_chars = sum(len("".join(m["parts"])) for m in current_history)
                    total_tokens = int(total_chars / 3.3) + (len(current_history) * 4)
                    memory_dirty = True
            except Exception as e:
                logger.warning("Fallback history normalization failed: %s", e)

    # Paginate from the end
    total = len(current_history)
    start = max(0, total - offset - limit)
    end = max(0, total - offset)
    
    paged_messages = current_history[start:end]
    has_more = start > 0
    logger.info("Returning history batch %s:%s (total=%s, has_more=%s)", start, end, total, has_more)
    
    return {
        "messages": paged_messages,
        "has_more": has_more,
        "total": total,
        "total_tokens": total_tokens
    }


@app.get("/api/ops/phase1")
async def get_phase1_ops():
    store = ensure_ops_store()
    return build_phase1_payload(store)


@app.post("/api/ops/targets")
async def update_phase1_targets(data: dict):
    store = ensure_ops_store()
    targets = store.get("success_targets", {})

    hourly = parse_number(data.get("effective_hourly_min_usd"))
    win_rate_percent = parse_number(data.get("win_rate_min_percent"))
    notes = normalize_whitespace(str(data.get("notes", targets.get("notes", ""))))

    if hourly is not None and hourly > 0:
        targets["effective_hourly_min_usd"] = round(hourly, 2)
    if win_rate_percent is not None and 0 <= win_rate_percent <= 100:
        targets["win_rate_min_percent"] = round(win_rate_percent, 2)
    if notes:
        targets["notes"] = notes

    store["success_targets"] = targets
    save_ops_store(store)
    return build_phase1_payload(store)


@app.post("/api/ops/backup/create")
async def create_ops_backup(data: dict):
    store = ensure_ops_store()
    try:
        backup_item = create_ops_backup_zip()
    except Exception as e:
        error_id = log_exception("ops_backup_create failed", e)
        raise HTTPException(status_code=500, detail=to_user_error("Cannot create backup", error_id))

    payload = build_phase1_payload(store)
    payload["created_backup"] = backup_item
    return payload


@app.post("/api/ops/backup/open_dir")
async def open_ops_backup_dir(data: dict):
    os.makedirs(BACKUP_DIR, exist_ok=True)
    try:
        if os.name == "nt":
            os.startfile(BACKUP_DIR)  # type: ignore[attr-defined]
        elif sys.platform == "darwin":
            subprocess.Popen(["open", BACKUP_DIR])
        else:
            subprocess.Popen(["xdg-open", BACKUP_DIR])
        return {"status": "success", "path": BACKUP_DIR}
    except Exception as e:
        error_id = log_exception("ops_backup_open_dir failed", e)
        raise HTTPException(status_code=500, detail=to_user_error("Cannot open backup directory", error_id))


@app.post("/api/ops/scoring/profile")
async def update_scoring_profile(data: dict):
    store = ensure_ops_store()
    profile = merge_scoring_profile(store.get("scoring_profile", {}))
    default_profile = default_scoring_profile()

    preferred_keywords = normalize_string_list(data.get("preferred_keywords", profile.get("preferred_keywords", [])))
    risk_keywords = normalize_string_list(data.get("risk_keywords", profile.get("risk_keywords", [])))
    heavy_penalty_keywords = normalize_string_list(data.get("heavy_penalty_keywords", profile.get("heavy_penalty_keywords", [])))
    risk_marker_keywords = normalize_string_list(data.get("risk_marker_keywords", profile.get("risk_marker_keywords", profile.get("risk_keywords", []))))
    toxicity_keywords = normalize_string_list(data.get("toxicity_keywords", profile.get("toxicity_keywords", [])))
    hard_reject_keywords = normalize_string_list(data.get("hard_reject_keywords", profile.get("hard_reject_keywords", [])))

    input_weights = data.get("weights", {})
    merged_weights = dict(default_profile.get("weights", {}))
    if isinstance(profile.get("weights"), dict):
        merged_weights.update(profile.get("weights", {}))
    if isinstance(input_weights, dict):
        for key in ["hourly_fit", "budget", "clarity", "strategic_fit", "risk"]:
            parsed = parse_number(input_weights.get(key))
            if parsed is not None and parsed >= 0:
                merged_weights[key] = float(parsed)

    default_guardrails = default_profile.get("intake_guardrails", {})
    existing_guardrails = profile.get("intake_guardrails", {})
    input_guardrails = data.get("intake_guardrails", {})
    merged_guardrails = dict(default_guardrails if isinstance(default_guardrails, dict) else {})
    if isinstance(existing_guardrails, dict):
        merged_guardrails.update(existing_guardrails)
    if isinstance(input_guardrails, dict):
        min_budget_usd = parse_number(input_guardrails.get("min_budget_usd"))
        min_hourly_usd = parse_number(input_guardrails.get("min_hourly_usd"))
        min_hourly_exception_usd = parse_number(input_guardrails.get("min_hourly_exception_usd"))
        reject_score_threshold = parse_number(input_guardrails.get("reject_score_threshold"))
        if min_budget_usd is not None and min_budget_usd > 0:
            merged_guardrails["min_budget_usd"] = float(min_budget_usd)
        if min_hourly_usd is not None and min_hourly_usd > 0:
            merged_guardrails["min_hourly_usd"] = float(min_hourly_usd)
        if min_hourly_exception_usd is not None and min_hourly_exception_usd > 0:
            merged_guardrails["min_hourly_exception_usd"] = float(min_hourly_exception_usd)
        if reject_score_threshold is not None and 0 <= reject_score_threshold <= 100:
            merged_guardrails["reject_score_threshold"] = float(reject_score_threshold)
        if "skip_model_on_reject" in input_guardrails:
            merged_guardrails["skip_model_on_reject"] = parse_bool(
                input_guardrails.get("skip_model_on_reject"),
                default=bool(merged_guardrails.get("skip_model_on_reject", True)),
            )
        if "hard_reject_on_low_budget" in input_guardrails:
            merged_guardrails["hard_reject_on_low_budget"] = parse_bool(
                input_guardrails.get("hard_reject_on_low_budget"),
                default=bool(merged_guardrails.get("hard_reject_on_low_budget", True)),
            )

    current_version = int(parse_number(profile.get("version")) or 1)
    profile["version"] = max(current_version, int(parse_number(default_profile.get("version")) or 1))
    profile["preferred_keywords"] = preferred_keywords or default_profile["preferred_keywords"]
    profile["risk_keywords"] = risk_keywords or default_profile["risk_keywords"]
    profile["heavy_penalty_keywords"] = heavy_penalty_keywords or default_profile.get("heavy_penalty_keywords", [])
    profile["risk_marker_keywords"] = risk_marker_keywords or default_profile.get("risk_marker_keywords", default_profile.get("risk_keywords", []))
    profile["toxicity_keywords"] = toxicity_keywords or default_profile.get("toxicity_keywords", [])
    profile["hard_reject_keywords"] = hard_reject_keywords or default_profile.get("hard_reject_keywords", [])
    profile["intake_guardrails"] = merged_guardrails
    profile["weights"] = merged_weights

    store["scoring_profile"] = merge_scoring_profile(profile)
    save_ops_store(store)
    return build_phase1_payload(store)


@app.post("/api/ops/outcome_taxonomy")
async def update_outcome_taxonomy(data: dict):
    store = ensure_ops_store()
    existing = store.get("outcome_taxonomy", default_outcome_taxonomy())
    labels_input = data.get("labels", existing.get("labels", []))

    parsed_labels: List[Dict[str, Any]] = []
    if isinstance(labels_input, list):
        for item in labels_input:
            if isinstance(item, str):
                tag_id = normalize_taxonomy_id(item)
                if not tag_id:
                    continue
                parsed_labels.append({
                    "id": tag_id,
                    "name": normalize_whitespace(item) or tag_id.replace("_", " ").title(),
                    "keywords": [normalize_whitespace(item).lower()],
                })
                continue
            if isinstance(item, dict):
                tag_id = normalize_taxonomy_id(item.get("id") or item.get("name"))
                if not tag_id:
                    continue
                name = normalize_whitespace(str(item.get("name", tag_id.replace("_", " ").title())))
                keywords = [k.lower() for k in normalize_string_list(item.get("keywords", []))]
                parsed_labels.append({
                    "id": tag_id,
                    "name": name,
                    "keywords": keywords,
                })

    if not parsed_labels:
        parsed_labels = default_outcome_taxonomy()["labels"]

    version = int(parse_number(existing.get("version")) or 1)
    store["outcome_taxonomy"] = {
        "version": version + 1,
        "labels": parsed_labels,
    }
    save_ops_store(store)
    return build_phase1_payload(store)


@app.post("/api/ops/proposal_pack")
async def generate_proposal_pack(data: dict):
    opportunity_id = normalize_whitespace(str(data.get("opportunity_id", "")))
    include_ai_draft = bool(data.get("include_ai_draft", True))
    if not opportunity_id:
        raise HTTPException(status_code=400, detail="opportunity_id is required")

    store = ensure_ops_store()
    pack = build_proposal_pack(store, opportunity_id=opportunity_id)

    if include_ai_draft:
        try:
            writer_client = get_writer_client()
            prompt = (
                "You are a proposal writer for Upwork web development bids.\n"
                "Use only provided context. Keep concise and concrete.\n"
                "Write a cover letter in 150-220 words.\n"
                "Structure:\n"
                "- 1 short intro sentence\n"
                "- 2-3 impact-focused paragraphs\n"
                "- 1 closing sentence with CTA\n"
                "Do not hallucinate technologies not present in context.\n\n"
                "Context packet:\n"
                f"{json.dumps(pack, ensure_ascii=False)}"
            )
            response = writer_client.models.generate_content(
                model=WRITER_MODEL,
                contents=prompt,
                config=types.GenerateContentConfig(
                    temperature=0.35,
                    max_output_tokens=900,
                    top_p=0.9,
                ),
            )
            draft = extract_response_text(response)
            pack["cover_letter_draft"] = draft or ""
        except Exception as e:
            logger.warning("proposal_pack draft generation failed: %s", e)
            pack["cover_letter_draft"] = ""
            pack["draft_error"] = "AI draft generation failed; structured pack is still available."

    return {"status": "success", "pack": pack}


@app.post("/api/ops/opportunity/autofill")
async def autofill_opportunity(
    source_text: str = Form(""),
    source_url: str = Form(""),
    stage_hint: str = Form("discovery"),
    file: Optional[UploadFile] = File(None),
):
    source_sections: List[str] = []
    multimodal_parts: List[Any] = []

    normalized_source_text = truncate_text(str(source_text or ""), AUTOFILL_MAX_SOURCE_CHARS)
    normalized_source_url = normalize_whitespace(str(source_url or ""))
    hinted_stage = normalize_pipeline_stage(stage_hint)

    if normalized_source_text:
        source_sections.append(f"Pasted job text:\n{normalized_source_text}")

    if normalized_source_url:
        source_sections.append(f"Job URL: {normalized_source_url}")
        fetched_url_text = fetch_url_text_snippet(normalized_source_url)
        if fetched_url_text:
            source_sections.append(f"URL page text:\n{fetched_url_text}")

    temp_path: Optional[str] = None
    file_mode = ""
    file_name = ""
    try:
        if file is not None and file.filename:
            file_name = normalize_whitespace(file.filename) or "attachment"
            content = await file.read()
            if content:
                suffix = os.path.splitext(file_name)[1].lower()
                mime_type = infer_mime_type(file_name, file.content_type)
                if mime_type.startswith("text/") or suffix in TEXT_ATTACHMENT_EXTENSIONS:
                    decoded = content.decode("utf-8", errors="ignore")
                    if decoded:
                        source_sections.append(
                            f"Attachment text ({file_name}):\n{truncate_text(decoded, AUTOFILL_MAX_FILE_TEXT_CHARS)}"
                        )
                        file_mode = "text"
                else:
                    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix or ".bin") as tmp:
                        tmp.write(content)
                        temp_path = tmp.name

                    gemini_file = writer_client.files.upload(
                        file=temp_path,
                        config={"mime_type": mime_type},
                    )
                    while getattr(gemini_file, "state", None) and getattr(gemini_file.state, "name", "") == "PROCESSING":
                        time.sleep(1.5)
                        gemini_file = writer_client.files.get(name=gemini_file.name)
                    if getattr(gemini_file, "state", None) and getattr(gemini_file.state, "name", "") == "FAILED":
                        raise HTTPException(status_code=400, detail=f"Uploaded file failed processing: {file_name}")

                    multimodal_parts.append(gemini_file)
                    file_mode = "multimodal"
    finally:
        if temp_path and os.path.exists(temp_path):
            try:
                os.unlink(temp_path)
            except Exception:
                pass

    if not source_sections and not multimodal_parts:
        raise HTTPException(status_code=400, detail="Provide source_text, source_url, or a file for autofill")

    source_packet = truncate_text("\n\n".join(source_sections), AUTOFILL_MAX_SOURCE_CHARS)
    store = ensure_ops_store()
    scoring_profile = merge_scoring_profile(store.get("scoring_profile", {}))
    pre_budget_signals = extract_budget_signals(source_packet)
    pre_effort_signals = extract_effort_signals(source_packet)
    pre_budget = parse_number(pre_budget_signals.get("fixed_max"))
    pre_hourly = parse_number(pre_budget_signals.get("hourly_max"))
    pre_hours = parse_number(pre_effort_signals.get("hours_max"))
    if pre_hourly is None and pre_budget is not None and pre_hours and pre_hours > 0:
        pre_hourly = pre_budget / pre_hours
    intake_gate = evaluate_intake_gate(
        text_blob=source_packet,
        expected_revenue_usd=pre_budget,
        estimated_hourly_usd=pre_hourly,
        scoring_profile=scoring_profile,
    )
    if intake_gate.get("rejected") and intake_gate.get("skip_model_on_reject"):
        gate_title = guess_title_from_text(normalized_source_text) or "Filtered lead (intake gate)"
        gate_notes = " ".join(intake_gate.get("reasons", []))
        signal_lines = []
        for signal_name in ["fixed_max", "hourly_max"]:
            value = intake_gate.get("signals", {}).get(signal_name)
            if value is not None:
                signal_lines.append(f"{signal_name}={value}")
        if signal_lines:
            gate_notes = f"{gate_notes} Signals: {', '.join(signal_lines)}"
        return {
            "status": "success",
            "autofill": {
                "title": gate_title,
                "client": "",
                "stage": hinted_stage,
                "expected_revenue_usd": None,
                "estimated_hours": None,
                "summary": "Lead filtered by intake gate before AI processing.",
                "notes": truncate_text(gate_notes, 420),
                "job_url": normalized_source_url,
                "confidence_percent": 99.0,
                "missing_fields": ["client", "expected_revenue_usd", "estimated_hours"],
                "signals": intake_gate.get("reasons", []),
            },
            "intake_gate": intake_gate,
            "source_meta": {
                "used_url": bool(normalized_source_url),
                "used_file": bool(file_name),
                "file_mode": file_mode,
                "skipped_model_call": True,
            },
        }

    writer_client = get_writer_client()
    prompt = (
        "You are an extraction model for Upwork opportunity cards.\n"
        "Extract structured fields from provided context.\n"
        "Return ONLY one JSON object, no markdown and no extra text.\n"
        "Use this schema exactly:\n"
        "{\n"
        "  \"title\": string,\n"
        "  \"client\": string,\n"
        "  \"stage\": string,\n"
        "  \"expected_revenue_usd\": number|null,\n"
        "  \"estimated_hours\": number|null,\n"
        "  \"summary\": string,\n"
        "  \"notes\": string,\n"
        "  \"job_url\": string,\n"
        "  \"confidence\": number,\n"
        "  \"missing_fields\": string[],\n"
        "  \"signals\": string[]\n"
        "}\n"
        "Rules:\n"
        "- Keep summary concise (max 260 chars).\n"
        "- Keep notes concise (max 420 chars).\n"
        f"- If stage is unclear, use \"{hinted_stage}\".\n"
        "- Confidence can be 0..1 or 0..100.\n"
        "- If value is unknown, use empty string or null and include the field in missing_fields.\n"
        "- Do not hallucinate client name, budget, or timeline."
    )
    if source_packet:
        prompt += f"\n\nContext text:\n{source_packet}"
    if multimodal_parts:
        prompt += "\n\nA job screenshot/document is attached."

    try:
        response = writer_client.models.generate_content(
            model=WRITER_MODEL,
            contents=[prompt, *multimodal_parts],
            config=types.GenerateContentConfig(
                temperature=0.15,
                max_output_tokens=700,
                top_p=0.9,
            ),
        )
    except Exception as e:
        error_id = log_exception("opportunity_autofill generation failed", e)
        raise HTTPException(status_code=500, detail=to_user_error("Autofill request failed", error_id))

    raw_text = extract_response_text(response)
    parsed = extract_json_object(raw_text)
    if not parsed:
        raise HTTPException(status_code=502, detail="Autofill model returned invalid JSON")

    title = truncate_text(str(parsed.get("title", "")), 180)
    summary = truncate_text(str(parsed.get("summary", "")), 260)
    notes = truncate_text(str(parsed.get("notes", "")), 420)
    client_name = truncate_text(str(parsed.get("client", "")), 120)
    normalized_job_url = normalize_whitespace(str(parsed.get("job_url") or normalized_source_url))

    if not title and summary:
        title = truncate_text(summary, 120)
    if not title:
        title = "Untitled opportunity"

    expected_revenue = parse_number(parsed.get("expected_revenue_usd"))
    estimated_hours = parse_number(parsed.get("estimated_hours"))
    if expected_revenue is not None and expected_revenue < 0:
        expected_revenue = None
    if estimated_hours is not None and estimated_hours <= 0:
        estimated_hours = None

    deterministic_signals: List[str] = []
    deterministic_budget = extract_budget_signals(source_packet)
    deterministic_effort = extract_effort_signals(source_packet)
    fallback_applied = False

    fixed_max = parse_number(deterministic_budget.get("fixed_max"))
    hourly_max = parse_number(deterministic_budget.get("hourly_max"))
    effort_max = parse_number(deterministic_effort.get("hours_max"))

    if expected_revenue is None and fixed_max is not None:
        expected_revenue = fixed_max
        fallback_applied = True
        deterministic_signals.append(f"budget fallback: fixed_max={round(fixed_max, 2)}")

    if estimated_hours is None and effort_max is not None:
        estimated_hours = effort_max
        fallback_applied = True
        deterministic_signals.append(f"hours fallback: effort_max={round(effort_max, 2)}")

    if expected_revenue is None and hourly_max is not None and estimated_hours and estimated_hours > 0:
        expected_revenue = hourly_max * estimated_hours
        fallback_applied = True
        deterministic_signals.append("budget estimated from hourly x hours")

    if estimated_hours is None and expected_revenue is not None and hourly_max and hourly_max > 0:
        estimated_hours = expected_revenue / hourly_max
        fallback_applied = True
        deterministic_signals.append("hours estimated from budget / hourly")

    confidence_raw = parse_number(parsed.get("confidence"))
    confidence_percent: Optional[float] = None
    if confidence_raw is not None:
        confidence_percent = confidence_raw * 100.0 if confidence_raw <= 1 else confidence_raw
        confidence_percent = max(0.0, min(100.0, confidence_percent))

    estimated_hourly = None
    if expected_revenue is not None and estimated_hours and estimated_hours > 0:
        estimated_hourly = expected_revenue / estimated_hours

    final_intake_gate = evaluate_intake_gate(
        text_blob=source_packet,
        expected_revenue_usd=expected_revenue,
        estimated_hourly_usd=estimated_hourly,
        scoring_profile=scoring_profile,
    )

    missing_fields = normalize_autofill_labels(parsed.get("missing_fields", []), limit=10)
    missing_set = {field.lower(): field for field in missing_fields}
    if expected_revenue is None:
        missing_set.setdefault("expected_revenue_usd", "expected_revenue_usd")
    else:
        missing_set.pop("expected_revenue_usd", None)
    if estimated_hours is None:
        missing_set.setdefault("estimated_hours", "estimated_hours")
    else:
        missing_set.pop("estimated_hours", None)
    if not client_name:
        missing_set.setdefault("client", "client")
    missing_fields = list(missing_set.values())[:10]

    raw_signals = normalize_autofill_labels(parsed.get("signals", []), limit=8)
    gate_signals = normalize_autofill_labels(final_intake_gate.get("reasons", []), limit=4)
    signals = normalize_autofill_labels(raw_signals + deterministic_signals + gate_signals, limit=12)

    return {
        "status": "success",
        "autofill": {
            "title": title,
            "client": client_name,
            "stage": normalize_pipeline_stage(parsed.get("stage") or hinted_stage),
            "expected_revenue_usd": round(expected_revenue, 2) if expected_revenue is not None else None,
            "estimated_hours": round(estimated_hours, 2) if estimated_hours is not None else None,
            "summary": summary,
            "notes": notes,
            "job_url": normalized_job_url,
            "confidence_percent": round(confidence_percent, 1) if confidence_percent is not None else None,
            "missing_fields": missing_fields,
            "signals": signals,
        },
        "intake_gate": final_intake_gate,
        "source_meta": {
            "used_url": bool(normalized_source_url),
            "used_file": bool(file_name),
            "file_mode": file_mode,
            "fallback_applied": fallback_applied,
        },
    }


@app.post("/api/ops/opportunity")
async def upsert_opportunity(data: dict):
    title = normalize_whitespace(str(data.get("title", "")))
    if not title:
        raise HTTPException(status_code=400, detail="title is required")

    store = ensure_ops_store()
    opportunities = store.get("opportunities", [])
    if not isinstance(opportunities, list):
        opportunities = []

    record_id = normalize_whitespace(str(data.get("id", ""))) or str(uuid.uuid4())
    stage = normalize_pipeline_stage(data.get("stage", "discovery"))
    now = now_iso()

    expected_revenue = parse_number(data.get("expected_revenue_usd"))
    estimated_hours = parse_number(data.get("estimated_hours"))
    actual_revenue = parse_number(data.get("actual_revenue_usd"))
    actual_hours = parse_number(data.get("actual_hours"))
    probability_percent = parse_number(data.get("probability_percent"))

    normalized = {
        "id": record_id,
        "title": title,
        "client": normalize_whitespace(str(data.get("client", ""))),
        "platform": normalize_whitespace(str(data.get("platform", "Upwork"))),
        "stage": stage,
        "job_url": normalize_whitespace(str(data.get("job_url", ""))),
        "summary": normalize_whitespace(str(data.get("summary", ""))),
        "notes": normalize_whitespace(str(data.get("notes", ""))),
        "expected_revenue_usd": round(expected_revenue, 2) if expected_revenue is not None else None,
        "estimated_hours": round(estimated_hours, 2) if estimated_hours is not None else None,
        "actual_revenue_usd": round(actual_revenue, 2) if actual_revenue is not None else None,
        "actual_hours": round(actual_hours, 2) if actual_hours is not None else None,
        "probability_percent": round(probability_percent, 1) if probability_percent is not None else None,
        "tags": normalize_string_list(data.get("tags", [])),
        "updated_at": now,
    }

    existing_index = next((index for index, item in enumerate(opportunities) if str(item.get("id")) == record_id), None)
    if existing_index is None:
        normalized["created_at"] = now
        opportunities.append(normalized)
    else:
        created_at = opportunities[existing_index].get("created_at") or now
        normalized["created_at"] = created_at
        opportunities[existing_index] = normalized

    store["opportunities"] = opportunities
    link_playbook_usage_outcomes_from_opportunity(store, normalized)
    store["playbook_usage_events"] = [
        normalize_playbook_usage_event(item)
        for item in store.get("playbook_usage_events", [])
        if isinstance(item, dict)
    ]
    save_ops_store(store)
    return build_phase1_payload(store)


@app.post("/api/ops/opportunity/stage")
async def update_opportunity_stage(data: dict):
    record_id = normalize_whitespace(str(data.get("id", "")))
    if not record_id:
        raise HTTPException(status_code=400, detail="id is required")

    next_stage = normalize_pipeline_stage(data.get("stage", "discovery"))
    store = ensure_ops_store()
    opportunities = store.get("opportunities", [])

    target = next((item for item in opportunities if str(item.get("id")) == record_id), None)
    if not target:
        raise HTTPException(status_code=404, detail="Opportunity not found")

    target["stage"] = next_stage
    target["updated_at"] = now_iso()
    link_playbook_usage_outcomes_from_opportunity(store, target)
    store["playbook_usage_events"] = [
        normalize_playbook_usage_event(item)
        for item in store.get("playbook_usage_events", [])
        if isinstance(item, dict)
    ]

    save_ops_store(store)
    return build_phase1_payload(store)


@app.post("/api/ops/opportunity/delete")
async def delete_opportunity(data: dict):
    record_id = normalize_whitespace(str(data.get("id", "")))
    if not record_id:
        raise HTTPException(status_code=400, detail="id is required")

    store = ensure_ops_store()
    deleted = delete_record_by_id(store, "opportunities", record_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Opportunity not found")

    save_ops_store(store)
    return build_phase1_payload(store)


@app.post("/api/ops/execution_bridge/from_opportunity")
async def bridge_execution_from_opportunity(data: dict):
    opportunity_id = normalize_whitespace(str(data.get("opportunity_id", "")))
    if not opportunity_id:
        raise HTTPException(status_code=400, detail="opportunity_id is required")

    store = ensure_ops_store()
    opportunities = [item for item in store.get("opportunities", []) if isinstance(item, dict)]
    target = next((item for item in opportunities if str(item.get("id")) == opportunity_id), None)
    if not target:
        raise HTTPException(status_code=404, detail="Opportunity not found")

    if normalize_pipeline_stage(target.get("stage")) != "won":
        raise HTTPException(status_code=400, detail="Execution bridge is allowed only for won opportunities")

    execution_projects = store.get("execution_projects", [])
    if not isinstance(execution_projects, list):
        execution_projects = []

    existing = next(
        (
            item
            for item in execution_projects
            if str(item.get("opportunity_id", "")) == opportunity_id
            and normalize_execution_status(item.get("status")) != "archived"
        ),
        None,
    )

    now = now_iso()
    created = False
    if existing:
        existing["updated_at"] = now
    else:
        created = True
        milestone_templates = [
            {"id": str(uuid.uuid4()), "title": "Kickoff and requirements alignment", "status": "todo"},
            {"id": str(uuid.uuid4()), "title": "Core implementation and iterations", "status": "todo"},
            {"id": str(uuid.uuid4()), "title": "QA, handoff, and final delivery", "status": "todo"},
        ]
        bootstrapped = normalize_execution_project_record(
            {
                "id": str(uuid.uuid4()),
                "opportunity_id": opportunity_id,
                "title": target.get("title", "Delivery project"),
                "client": target.get("client", ""),
                "status": "planning",
                "summary": target.get("summary", ""),
                "job_url": target.get("job_url", ""),
                "start_date": now[:10],
                "planned_value_usd": parse_number(target.get("actual_revenue_usd")) or parse_number(target.get("expected_revenue_usd")),
                "actual_value_usd": parse_number(target.get("actual_revenue_usd")),
                "planned_hours": parse_number(target.get("actual_hours")) or parse_number(target.get("estimated_hours")),
                "actual_hours": parse_number(target.get("actual_hours")),
                "risks": normalize_string_list(target.get("score_rationale", []))[:3],
                "next_actions": [
                    "Confirm exact deliverables and acceptance criteria with client.",
                    "Lock scope and timeline in milestone plan.",
                ],
                "milestones": milestone_templates,
                "created_at": now,
                "updated_at": now,
            }
        )
        execution_projects.append(bootstrapped)

    store["execution_projects"] = execution_projects
    save_ops_store(store)
    payload = build_phase1_payload(store)
    payload["execution_bridge"] = {
        "opportunity_id": opportunity_id,
        "created": created,
    }
    return payload


@app.post("/api/ops/execution_project")
async def upsert_execution_project(data: dict):
    title = truncate_text(str(data.get("title", "")), 180)
    if not title:
        raise HTTPException(status_code=400, detail="title is required")

    store = ensure_ops_store()
    execution_projects = store.get("execution_projects", [])
    if not isinstance(execution_projects, list):
        execution_projects = []

    record_id = normalize_whitespace(str(data.get("id", ""))) or str(uuid.uuid4())
    now = now_iso()
    incoming = {
        "id": record_id,
        "opportunity_id": normalize_whitespace(str(data.get("opportunity_id", ""))),
        "title": title,
        "client": normalize_whitespace(str(data.get("client", ""))),
        "status": data.get("status", "planning"),
        "summary": normalize_whitespace(str(data.get("summary", ""))),
        "job_url": normalize_whitespace(str(data.get("job_url", ""))),
        "start_date": data.get("start_date", ""),
        "due_date": data.get("due_date", ""),
        "completed_at": data.get("completed_at", ""),
        "planned_value_usd": data.get("planned_value_usd"),
        "actual_value_usd": data.get("actual_value_usd"),
        "planned_hours": data.get("planned_hours"),
        "actual_hours": data.get("actual_hours"),
        "risks": data.get("risks", []),
        "next_actions": data.get("next_actions", []),
        "milestones": data.get("milestones", []),
        "updated_at": now,
    }

    existing_index = next((index for index, item in enumerate(execution_projects) if str(item.get("id")) == record_id), None)
    if existing_index is None:
        incoming["created_at"] = now
        normalized = normalize_execution_project_record(incoming)
        execution_projects.append(normalized)
    else:
        created_at = execution_projects[existing_index].get("created_at") or now
        incoming["created_at"] = created_at
        normalized = normalize_execution_project_record(incoming)
        execution_projects[existing_index] = normalized

    store["execution_projects"] = execution_projects
    save_ops_store(store)
    return build_phase1_payload(store)


@app.post("/api/ops/execution_project/delete")
async def delete_execution_project(data: dict):
    project_id = normalize_whitespace(str(data.get("id", "")))
    if not project_id:
        raise HTTPException(status_code=400, detail="id is required")

    store = ensure_ops_store()
    deleted = delete_record_by_id(store, "execution_projects", project_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Execution project not found")

    save_ops_store(store)
    return build_phase1_payload(store)


@app.post("/api/ops/weekly_review")
async def upsert_weekly_review(data: dict):
    store = ensure_ops_store()
    weekly_reviews = store.get("weekly_reviews", [])
    if not isinstance(weekly_reviews, list):
        weekly_reviews = []

    review_id = normalize_whitespace(str(data.get("id", ""))) or str(uuid.uuid4())
    now = now_iso()
    incoming = {
        "id": review_id,
        "week_start_date": data.get("week_start_date", now[:10]),
        "wins": data.get("wins", []),
        "misses": data.get("misses", []),
        "bottlenecks": data.get("bottlenecks", []),
        "experiments": data.get("experiments", []),
        "focus_next_week": data.get("focus_next_week", []),
        "confidence_percent": data.get("confidence_percent"),
        "linked_project_ids": data.get("linked_project_ids", []),
        "updated_at": now,
    }

    existing_index = next((index for index, item in enumerate(weekly_reviews) if str(item.get("id")) == review_id), None)
    if existing_index is None:
        incoming["created_at"] = now
        normalized = normalize_weekly_review_record(incoming)
        weekly_reviews.append(normalized)
    else:
        created_at = weekly_reviews[existing_index].get("created_at") or now
        incoming["created_at"] = created_at
        normalized = normalize_weekly_review_record(incoming)
        weekly_reviews[existing_index] = normalized

    store["weekly_reviews"] = weekly_reviews
    save_ops_store(store)
    return build_phase1_payload(store)


@app.post("/api/ops/weekly_review/suggest")
async def suggest_weekly_review(data: dict):
    store = ensure_ops_store()
    week_start_date = normalize_iso_date(data.get("week_start_date"))
    suggestion = build_weekly_review_suggestion(store, week_start_date=week_start_date)
    return {
        "status": "success",
        "suggestion": suggestion,
    }


@app.post("/api/ops/weekly_review/delete")
async def delete_weekly_review(data: dict):
    review_id = normalize_whitespace(str(data.get("id", "")))
    if not review_id:
        raise HTTPException(status_code=400, detail="id is required")

    store = ensure_ops_store()
    deleted = delete_record_by_id(store, "weekly_reviews", review_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Weekly review not found")

    save_ops_store(store)
    return build_phase1_payload(store)


@app.post("/api/ops/playbook")
async def upsert_playbook(data: dict):
    title = truncate_text(str(data.get("title", "")), 140)
    if not title:
        raise HTTPException(status_code=400, detail="title is required")

    store = ensure_ops_store()
    playbooks = store.get("playbooks", [])
    if not isinstance(playbooks, list):
        playbooks = []

    record_id = normalize_whitespace(str(data.get("id", ""))) or str(uuid.uuid4())
    existing_item = next((item for item in playbooks if str(item.get("id")) == record_id), None)
    now = now_iso()
    default_usage_count = int(parse_number(existing_item.get("usage_count")) or 0) if isinstance(existing_item, dict) else 0
    default_last_used_at = normalize_whitespace(str(existing_item.get("last_used_at", ""))) if isinstance(existing_item, dict) else ""
    incoming = {
        "id": record_id,
        "title": title,
        "objective": normalize_whitespace(str(data.get("objective", ""))),
        "trigger_keywords": data.get("trigger_keywords", []),
        "actions": data.get("actions", []),
        "offer_template": str(data.get("offer_template", "")),
        "tags": data.get("tags", []),
        "active": data.get("active", True),
        "priority": data.get("priority", 50),
        "usage_count": data.get("usage_count", default_usage_count),
        "last_used_at": data.get("last_used_at", default_last_used_at),
        "updated_at": now,
    }

    existing_index = next((index for index, item in enumerate(playbooks) if str(item.get("id")) == record_id), None)
    if existing_index is None:
        incoming["created_at"] = now
        normalized = normalize_playbook_record(incoming)
        playbooks.append(normalized)
    else:
        created_at = playbooks[existing_index].get("created_at") or now
        incoming["created_at"] = created_at
        normalized = normalize_playbook_record(incoming)
        playbooks[existing_index] = normalized

    store["playbooks"] = playbooks
    save_ops_store(store)
    return build_phase1_payload(store)


@app.post("/api/ops/playbook/delete")
async def delete_playbook(data: dict):
    playbook_id = normalize_whitespace(str(data.get("id", "")))
    if not playbook_id:
        raise HTTPException(status_code=400, detail="id is required")

    store = ensure_ops_store()
    deleted = delete_record_by_id(store, "playbooks", playbook_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Playbook not found")
    usage_events = store.get("playbook_usage_events", [])
    if isinstance(usage_events, list):
        store["playbook_usage_events"] = [
            item
            for item in usage_events
            if isinstance(item, dict) and normalize_whitespace(str(item.get("playbook_id", ""))) != playbook_id
        ]

    save_ops_store(store)
    return build_phase1_payload(store)


@app.post("/api/ops/playbook/mark_used")
async def mark_playbook_used(data: dict):
    playbook_id = normalize_whitespace(str(data.get("id", "")))
    if not playbook_id:
        raise HTTPException(status_code=400, detail="id is required")

    store = ensure_ops_store()
    playbooks = store.get("playbooks", [])
    if not isinstance(playbooks, list):
        raise HTTPException(status_code=404, detail="Playbook not found")

    target = next((item for item in playbooks if str(item.get("id")) == playbook_id), None)
    if not target:
        raise HTTPException(status_code=404, detail="Playbook not found")

    target["usage_count"] = int(parse_number(target.get("usage_count")) or 0) + 1
    target["last_used_at"] = now_iso()
    target["updated_at"] = now_iso()

    opportunity_id = normalize_whitespace(str(data.get("opportunity_id", "")))
    project_id = normalize_whitespace(str(data.get("project_id", "")))
    notes = normalize_whitespace(str(data.get("notes", "")))
    source = normalize_whitespace(str(data.get("source", "manual"))) or "manual"
    matched_triggers = normalize_string_list(data.get("matched_triggers", []))

    usage_event = build_playbook_usage_event(
        store,
        playbook_id=playbook_id,
        opportunity_id=opportunity_id,
        project_id=project_id,
        notes=notes,
        matched_triggers=matched_triggers,
        source=source,
    )
    usage_events = store.get("playbook_usage_events", [])
    if not isinstance(usage_events, list):
        usage_events = []
    usage_events.append(usage_event)
    store["playbook_usage_events"] = [
        normalize_playbook_usage_event(item)
        for item in usage_events
        if isinstance(item, dict)
    ]

    store["playbooks"] = [normalize_playbook_record(item) for item in playbooks if isinstance(item, dict)]
    save_ops_store(store)
    payload = build_phase1_payload(store)
    payload["playbook_usage_event"] = usage_event
    return payload


@app.post("/api/ops/playbook/suggest")
async def suggest_playbook(data: dict):
    store = ensure_ops_store()
    context_text = truncate_text(str(data.get("context_text", "")), 3000)
    opportunity_id = normalize_whitespace(str(data.get("opportunity_id", "")))
    project_id = normalize_whitespace(str(data.get("project_id", "")))
    limit = int(parse_number(data.get("limit")) or 6)
    suggestion = build_playbook_suggestions(
        store,
        context_text=context_text,
        opportunity_id=opportunity_id,
        project_id=project_id,
        limit=limit,
    )
    return {
        "status": "success",
        **suggestion,
    }


@app.post("/api/ops/playbook/usage/delete")
async def delete_playbook_usage_event(data: dict):
    event_id = normalize_whitespace(str(data.get("id", "")))
    if not event_id:
        raise HTTPException(status_code=400, detail="id is required")

    store = ensure_ops_store()
    deleted = delete_record_by_id(store, "playbook_usage_events", event_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Playbook usage event not found")

    save_ops_store(store)
    return build_phase1_payload(store)


@app.post("/api/ops/playbook/usage/feedback")
async def update_playbook_usage_feedback(data: dict):
    event_id = normalize_whitespace(str(data.get("id", "")))
    if not event_id:
        raise HTTPException(status_code=400, detail="id is required")

    feedback_score_raw = data.get("feedback_score")
    feedback_score: Optional[int] = None
    if isinstance(feedback_score_raw, str):
        lowered = normalize_whitespace(feedback_score_raw).lower()
        if lowered in {"helpful", "positive", "good", "1", "+1"}:
            feedback_score = 1
        elif lowered in {"not_helpful", "negative", "bad", "-1"}:
            feedback_score = -1
        elif lowered in {"neutral", "0"}:
            feedback_score = 0
    if feedback_score is None:
        parsed = parse_number(feedback_score_raw)
        if parsed is not None:
            feedback_score = int(max(-1.0, min(1.0, round(parsed))))
    if feedback_score is None:
        raise HTTPException(status_code=400, detail="feedback_score must be one of -1, 0, 1")

    feedback_note = normalize_whitespace(str(data.get("feedback_note", "")))

    store = ensure_ops_store()
    usage_events = store.get("playbook_usage_events", [])
    if not isinstance(usage_events, list):
        raise HTTPException(status_code=404, detail="Playbook usage event not found")

    target = next((item for item in usage_events if isinstance(item, dict) and str(item.get("id")) == event_id), None)
    if not target:
        raise HTTPException(status_code=404, detail="Playbook usage event not found")

    now = now_iso()
    target["feedback_score"] = feedback_score
    target["feedback_label"] = "helpful" if feedback_score > 0 else ("not_helpful" if feedback_score < 0 else "neutral")
    target["feedback_note"] = feedback_note
    target["feedback_updated_at"] = now
    target["updated_at"] = now

    store["playbook_usage_events"] = [
        normalize_playbook_usage_event(item)
        for item in usage_events
        if isinstance(item, dict)
    ]
    save_ops_store(store)
    payload = build_phase1_payload(store)
    payload["updated_usage_event"] = next(
        (item for item in payload.get("playbook_usage_events", []) if str(item.get("id")) == event_id),
        None,
    )
    return payload


@app.post("/api/ops/decision")
async def upsert_decision(data: dict):
    summary = normalize_whitespace(str(data.get("summary", "")))
    if not summary:
        raise HTTPException(status_code=400, detail="summary is required")

    store = ensure_ops_store()
    decisions = store.get("decisions", [])
    if not isinstance(decisions, list):
        decisions = []

    decision_id = normalize_whitespace(str(data.get("id", ""))) or str(uuid.uuid4())
    confidence_percent = parse_number(data.get("confidence_percent"))
    now = now_iso()

    status = normalize_whitespace(str(data.get("status", "active"))).lower()
    if status not in {"active", "validated", "superseded", "discarded"}:
        status = "active"

    normalized = {
        "id": decision_id,
        "summary": summary,
        "context": normalize_whitespace(str(data.get("context", ""))),
        "options_considered": normalize_string_list(data.get("options_considered", [])),
        "chosen_option": normalize_whitespace(str(data.get("chosen_option", ""))),
        "rationale": normalize_whitespace(str(data.get("rationale", ""))),
        "expected_impact": normalize_whitespace(str(data.get("expected_impact", ""))),
        "confidence_percent": round(confidence_percent, 1) if confidence_percent is not None else None,
        "review_due_at": normalize_whitespace(str(data.get("review_due_at", ""))),
        "linked_opportunity_ids": normalize_string_list(data.get("linked_opportunity_ids", [])),
        "status": status,
        "updated_at": now,
    }

    existing_index = next((index for index, item in enumerate(decisions) if str(item.get("id")) == decision_id), None)
    if existing_index is None:
        normalized["created_at"] = now
        decisions.append(normalized)
    else:
        created_at = decisions[existing_index].get("created_at") or now
        normalized["created_at"] = created_at
        decisions[existing_index] = normalized

    store["decisions"] = decisions
    save_ops_store(store)
    return build_phase1_payload(store)


@app.post("/api/ops/decision/delete")
async def delete_decision(data: dict):
    decision_id = normalize_whitespace(str(data.get("id", "")))
    if not decision_id:
        raise HTTPException(status_code=400, detail="id is required")

    store = ensure_ops_store()
    deleted = delete_record_by_id(store, "decisions", decision_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Decision not found")

    save_ops_store(store)
    return build_phase1_payload(store)


@app.post("/api/ops/postmortem")
async def upsert_postmortem(data: dict):
    findings = normalize_whitespace(str(data.get("findings", "")))
    if not findings:
        raise HTTPException(status_code=400, detail="findings is required")

    store = ensure_ops_store()
    postmortems = store.get("postmortems", [])
    if not isinstance(postmortems, list):
        postmortems = []
    labels = get_taxonomy_labels(store)

    postmortem_id = normalize_whitespace(str(data.get("id", ""))) or str(uuid.uuid4())
    outcome = normalize_whitespace(str(data.get("outcome", "lost"))).lower()
    if outcome not in {"won", "lost", "withdrawn", "no_response"}:
        outcome = "lost"

    root_causes = normalize_string_list(data.get("root_causes", []))
    what_worked = normalize_whitespace(str(data.get("what_worked", "")))
    taxonomy_tags = resolve_taxonomy_tags(
        root_causes=root_causes,
        findings=findings,
        what_worked=what_worked,
        explicit_tags=data.get("taxonomy_tags", []),
        labels=labels,
    )

    now = now_iso()
    normalized = {
        "id": postmortem_id,
        "opportunity_id": normalize_whitespace(str(data.get("opportunity_id", ""))),
        "outcome": outcome,
        "root_causes": root_causes,
        "what_worked": what_worked,
        "findings": findings,
        "taxonomy_tags": taxonomy_tags,
        "action_items": normalize_string_list(data.get("action_items", [])),
        "confidence_adjustment": normalize_whitespace(str(data.get("confidence_adjustment", ""))),
        "updated_at": now,
    }

    existing_index = next((index for index, item in enumerate(postmortems) if str(item.get("id")) == postmortem_id), None)
    if existing_index is None:
        normalized["created_at"] = now
        postmortems.append(normalized)
    else:
        created_at = postmortems[existing_index].get("created_at") or now
        normalized["created_at"] = created_at
        postmortems[existing_index] = normalized

    store["postmortems"] = postmortems
    link_playbook_usage_outcomes_from_postmortem(store, normalized)
    store["playbook_usage_events"] = [
        normalize_playbook_usage_event(item)
        for item in store.get("playbook_usage_events", [])
        if isinstance(item, dict)
    ]
    save_ops_store(store)
    return build_phase1_payload(store)


@app.post("/api/ops/postmortem/delete")
async def delete_postmortem(data: dict):
    postmortem_id = normalize_whitespace(str(data.get("id", "")))
    if not postmortem_id:
        raise HTTPException(status_code=400, detail="id is required")

    store = ensure_ops_store()
    deleted = delete_record_by_id(store, "postmortems", postmortem_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Postmortem not found")

    save_ops_store(store)
    return build_phase1_payload(store)


@app.post("/api/memory/rebuild")
async def memory_rebuild(data: dict):
    chunk_size = int(data.get("chunk_size", DEFAULT_CHUNK_SIZE))
    overlap = int(data.get("overlap", DEFAULT_CHUNK_OVERLAP))
    include_attachments = bool(data.get("include_attachments", True))

    memory = build_canonical_memory(
        chunk_size=chunk_size,
        overlap=overlap,
        include_attachments=include_attachments,
    )
    return {
        "status": "success",
        "version": memory.get("version", 0),
        "chunk_count": len(memory.get("chunk_summaries", [])),
        "total_facts": len(memory.get("must_keep_facts", [])),
        "updated_at": memory.get("updated_at"),
    }


@app.post("/api/memory/update")
async def memory_update(data: dict):
    config = canonical_memory.get("config", {})
    chunk_size = int(data.get("chunk_size", config.get("chunk_size", DEFAULT_CHUNK_SIZE)))
    overlap = int(data.get("overlap", config.get("overlap", DEFAULT_CHUNK_OVERLAP)))
    include_attachments = bool(data.get("include_attachments", config.get("include_attachments", True)))

    memory = build_canonical_memory(
        chunk_size=chunk_size,
        overlap=overlap,
        include_attachments=include_attachments,
    )
    return {
        "status": "success",
        "version": memory.get("version", 0),
        "chunk_count": len(memory.get("chunk_summaries", [])),
        "total_facts": len(memory.get("must_keep_facts", [])),
    }


@app.post("/api/memory/context")
async def memory_context(data: dict):
    task = str(data.get("task", "draft_cover_letter"))
    token_budget = int(data.get("token_budget", DEFAULT_WRITER_TOKEN_BUDGET))
    latest_turns_count = int(data.get("latest_turns_count", 5))

    packet = build_writer_packet(
        task=task,
        token_budget=token_budget,
        latest_turns_count=latest_turns_count,
    )

    return {
        "packet": packet,
        "memory_version": packet.get("version", 0),
        "input_token_estimate": packet.get("input_token_estimate", 0),
    }


@app.post("/api/cover_writer")
async def cover_writer(data: dict):
    instruction = normalize_whitespace(str(data.get("instruction", "")))
    mode = normalize_whitespace(str(data.get("mode", "draft")))
    token_budget = int(data.get("token_budget", DEFAULT_WRITER_TOKEN_BUDGET))
    latest_turns_count = int(data.get("latest_turns_count", 5))
    task = normalize_whitespace(str(data.get("task", "draft_cover_letter")))

    if not instruction:
        raise HTTPException(status_code=400, detail="instruction is required")

    writer_client = get_writer_client()
    packet = build_writer_packet(
        task=task,
        token_budget=token_budget,
        latest_turns_count=latest_turns_count,
    )

    prompt = (
        "You are CoverLetterWriter. Your only responsibility is writing and revising cover letters.\n"
        "Never invent facts. Use only the context packet.\n"
        f"Mode: {mode}\n"
        f"User instruction: {instruction}\n\n"
        "Context packet (JSON):\n"
        f"{json.dumps(packet, ensure_ascii=False)}\n\n"
        "Output requirements:\n"
        "- Produce final cover letter text only.\n"
        "- Keep language professional and specific.\n"
        "- If context is missing, add a short [NEEDS_INFO] section at the end."
    )

    try:
        response = writer_client.models.generate_content(
            model=WRITER_MODEL,
            contents=prompt,
            config=types.GenerateContentConfig(
                temperature=0.4,
                max_output_tokens=2048,
                top_p=0.9,
            ),
        )
        text = extract_response_text(response)
        if not text:
            raise ValueError("Writer model returned empty response.")

        return {
            "text": text,
            "used_model": WRITER_MODEL,
            "memory_version": packet.get("version", 0),
            "input_token_estimate": packet.get("input_token_estimate", 0),
        }
    except HTTPException:
        raise
    except Exception as e:
        error_id = log_exception("cover_writer failed", e)
        raise HTTPException(status_code=500, detail=to_user_error("Cover writer request failed", error_id))


@app.post("/api/chat")
async def send_message(
    message: str = Form(...),
    files: List[UploadFile] = File(None),
    model: str = Form("gemini-3.1-pro-preview"),
    temperature: float = Form(1.0),
    media_resolution: str = Form("Default"),
    thinking_level: str = Form("High"),
    system_instructions: str = Form(""),
    google_search: str = Form("false"),
    code_execution: str = Form("false"),
    client_id: str = Form("")
):
    global client, chat_session, current_history, total_tokens, current_file_path, current_model_name, current_google_search, current_code_execution, current_system_instructions, memory_dirty
    
    logger.info("send_message model=%s grounding=%s code_exec=%s", model, google_search, code_execution)
    
    if not client:
        raise HTTPException(status_code=400, detail="Please load history first to initialize the client")
    
    # Only recreate if model changed, tools changed, or no session exists
    tools_changed = (current_google_search != google_search or current_code_execution != code_execution)
    system_changed = (current_system_instructions != system_instructions)
    
    if not chat_session or current_model_name != model or tools_changed or system_changed:
        logger.info(
            "Creating new chat session for %s (tools_changed=%s, system_changed=%s)",
            model,
            tools_changed,
            system_changed,
        )
        
        # Build config for chat creation
        config_params = {}
        
        # Configure tools using the new SDK format
        tools = []
        if google_search == "true":
            tools.append(types.Tool(google_search=types.GoogleSearch()))
        if code_execution == "true":
            tools.append(types.Tool(code_execution=types.ToolCodeExecution()))
        
        if tools:
            config_params["tools"] = tools
        
        if system_instructions:
            config_params["system_instruction"] = system_instructions
            
        history_context = get_gemini_history(current_history)
        logger.info("Restoring chat session with %s historical messages", len(history_context))
        
        chat_session = client.chats.create(
            model=model,
            history=history_context,
            config=types.GenerateContentConfig(**config_params) if config_params else None
        )
        current_model_name = model
        current_google_search = google_search
        current_code_execution = code_execution
        current_system_instructions = system_instructions

    try:
        logger.info("Using model=%s thinking_level=%s", model, thinking_level)

        content_parts = []
        user_parts = [message] if message else []
        user_attachments = []

        if files:
            for file in files:
                suffix = os.path.splitext(file.filename)[1].lower() if file.filename else ""
                
                # Determine MIME type - fallback to extension-based detection
                mime_type = file.content_type
                if not mime_type or mime_type == "application/octet-stream":
                    mime_map = {
                        ".png": "image/png",
                        ".jpg": "image/jpeg",
                        ".jpeg": "image/jpeg",
                        ".gif": "image/gif",
                        ".webp": "image/webp",
                        ".pdf": "application/pdf",
                        ".txt": "text/plain",
                        ".md": "text/markdown",
                        ".py": "text/x-python",
                        ".js": "text/javascript",
                        ".ts": "text/typescript",
                        ".json": "application/json",
                        ".mp4": "video/mp4",
                        ".mp3": "audio/mpeg",
                        ".wav": "audio/wav",
                    }
                    mime_type = mime_map.get(suffix, "text/plain")
                    logger.info("Inferred MIME type '%s' for %s", mime_type, file.filename)
                
                # We save to attachments dir with a unique name to avoid collisions
                safe_filename = f"{uuid.uuid4()}{suffix}"
                fpath = os.path.join(ATTACHMENTS_PATH, safe_filename)
                
                # First save to a temp file for Gemini upload
                with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
                    content = await file.read()
                    tmp.write(content)
                    tmp_path = tmp.name
                
                # Upload to Gemini using new SDK
                gemini_file = client.files.upload(file=tmp_path, config={"mime_type": mime_type})
                
                # Wait for active state (required for large images/videos)
                while gemini_file.state.name == "PROCESSING":
                    logger.info("File %s is processing...", gemini_file.name)
                    time.sleep(2)
                    gemini_file = client.files.get(name=gemini_file.name)
                
                if gemini_file.state.name == "FAILED":
                    raise Exception(f"File {gemini_file.name} failed to process")

                content_parts.append(gemini_file)
                os.unlink(tmp_path)
                
                # Save locally for persistence
                with open(fpath, 'wb') as f:
                    f.write(content)
                
                user_attachments.append({
                    "name": safe_filename,
                    "type": file.content_type,
                    "size": len(content),
                    "url": f"/attachments/{safe_filename}"
                })
        
        if message:
            content_parts.append(message)
        
        if not content_parts:
            raise HTTPException(status_code=400, detail="No message or files provided")
        
        # Send message using the new SDK
        response = chat_session.send_message(content_parts)
        
        # Extract thoughts and text from response parts
        thought_parts = []
        text_parts = []
        
        try:
            # The genai SDK response has candidates[0].content.parts
            # Each part might have 'thought' (boolean) or we check the specific attribute
            for part in response.candidates[0].content.parts:
                # In the new SDK, thoughts are often in their own parts
                # We check for the 'thought' attribute specifically
                if hasattr(part, 'thought') and part.thought:
                    if part.text:
                        thought_parts.append(part.text)
                elif hasattr(part, 'text') and part.text:
                    # Double check if the text itself looks like a thought (fallback) or if it's just text
                    text_parts.append(part.text)
        except Exception as e:
            logger.warning("Error extracting response parts, fallback to response.text: %s", e)
            text_parts = [response.text]
        
        # Build the model response with thought blocks
        model_response_parts = []
        if thought_parts:
            for tp in thought_parts:
                model_response_parts.append(f"[THOUGHT_BLOCK]{tp}[/THOUGHT_BLOCK]")
        
        # Sometimes thoughts come as part of text if tool calling is involved or different model versions
        # but with thinking=High/Medium, it should be in thought_parts.
        
        model_response_parts.extend(text_parts)
        model_response_text = "\n".join(model_response_parts)
        
        logger.info("Response has %s thought parts and %s text parts", len(thought_parts), len(text_parts))
        
        # Update local history (with full URLs for the UI)
        ui_attachments = []
        for att in user_attachments:
            ui_att = att.copy()
            ui_att["url"] = BASE_URL + att["url"]
            ui_attachments.append(ui_att)

        user_timestamp = now_iso()
        model_timestamp = now_iso()

        user_msg = {
            "role": "user", 
            "parts": user_parts,
            "attachments": ui_attachments,
            "timestamp": user_timestamp,
        }
        model_msg = {
            "role": "model",
            "parts": [model_response_text],
            "attachments": [],
            "timestamp": model_timestamp,
        }
        
        current_history.append(user_msg)
        current_history.append(model_msg)
        memory_dirty = True
        
        # PERSISTENCE: Save to JSON file
        if current_file_path and os.path.exists(current_file_path):
            try:
                with open(current_file_path, 'r', encoding='utf-8') as f:
                    file_data = json.load(f)
                
                # Create original-style entry for persistence
                persistent_user = {
                    "role": "user", 
                    "parts": [{"text": p} for p in user_parts],
                    "attachments": user_attachments,
                    "timestamp": user_timestamp,
                }
                persistent_model = {
                    "role": "model", 
                    "parts": [{"text": model_response_text}],
                    "timestamp": model_timestamp,
                }

                
                if isinstance(file_data, dict):
                    if "contents" in file_data:
                        file_data["contents"].append(persistent_user)
                        file_data["contents"].append(persistent_model)
                    elif "chunkedPrompt" in file_data:
                        if "chunks" not in file_data["chunkedPrompt"]:
                            file_data["chunkedPrompt"]["chunks"] = []
                        file_data["chunkedPrompt"]["chunks"].append(persistent_user)
                        file_data["chunkedPrompt"]["chunks"].append(persistent_model)
                elif isinstance(file_data, list):
                    file_data.append(persistent_user)
                    file_data.append(persistent_model)
                
                with open(current_file_path, 'w', encoding='utf-8') as f:
                    json.dump(file_data, f, ensure_ascii=False, indent=2)
                logger.info("Saved new messages to %s", current_file_path)
            except Exception as e:
                logger.warning("Failed saving new messages to %s: %s", current_file_path, e)
        else:
            logger.warning(
                "Cannot save history: current_file_path=%s exists=%s",
                current_file_path,
                os.path.exists(current_file_path) if current_file_path else "N/A",
            )


        # Update token estimate - using same heuristic as initialization
        msg_chars = len("".join(user_parts)) + len(model_response_text)
        total_tokens += int(msg_chars / 3.3) + 8 # +8 for 2 messages overhead

        await ws_manager.broadcast_json({
            "type": "chat_appended",
            "file": current_file_path,
            "source_client_id": client_id,
            "messages": [user_msg, model_msg],
            "total_tokens": total_tokens,
        })

        
        return {
            "text": model_response_text,
            "role": "model",
            "total_tokens": total_tokens
        }

    except HTTPException:
        raise
    except Exception as e:
        error_id = log_exception("send_message failed", e)
        raise HTTPException(status_code=500, detail=to_user_error("Chat request failed", error_id))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

