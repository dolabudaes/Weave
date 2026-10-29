from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import re
import secrets
import shutil
import sqlite3
import time
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Optional

from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

ROOT = Path(__file__).resolve().parents[2]
PROJECT_ROOT = Path(__file__).resolve().parents[3]


def load_project_env() -> None:
    path = PROJECT_ROOT / ".env"
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, _, value = stripped.partition("=")
        key = key.strip()
        value = value.strip().strip("\"'")
        if key and key not in os.environ:
            os.environ[key] = value


load_project_env()

DATA_DIR = ROOT / "data"
UPLOAD_DIR = DATA_DIR / "uploads"
DB_PATH = Path(os.getenv("SQLITE_PATH", DATA_DIR / "weave.db"))
SOCIALPERSONA_USERS_DIR = PROJECT_ROOT / "socialpersona-6E9B" / "data" / "users"
CARTOONSET_DIR = PROJECT_ROOT / "CartoonSet-100"
PERSONA_AVATAR_DIR = UPLOAD_DIR / "avatars" / "persona"
SECRET = os.getenv("JWT_SECRET", "dev-secret-change-me")
ACCESS_TTL = 60 * 60
REFRESH_TTL = 60 * 60 * 24 * 14

DATA_DIR.mkdir(parents=True, exist_ok=True)
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="Weave API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:3001",
        "http://localhost:3002",
        "http://localhost:8081",
        "http://localhost:8082",
        "http://localhost:8091",
        "http://localhost:8096",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3001",
        "http://127.0.0.1:3002",
        "http://127.0.0.1:8081",
        "http://127.0.0.1:8082",
        "http://127.0.0.1:8091",
        "http://127.0.0.1:8096",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.mount("/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def execute(sql: str, params: tuple[Any, ...] = ()) -> sqlite3.Cursor:
    with db() as conn:
        cur = conn.execute(sql, params)
        conn.commit()
        return cur


def query(sql: str, params: tuple[Any, ...] = ()) -> list[dict[str, Any]]:
    with db() as conn:
        rows = conn.execute(sql, params).fetchall()
        return [dict(row) for row in rows]


def one(sql: str, params: tuple[Any, ...] = ()) -> Optional[dict[str, Any]]:
    rows = query(sql, params)
    return rows[0] if rows else None


def encode_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False)


def decode_json(value: Optional[str], default: Any) -> Any:
    if not value:
        return default
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return default


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 120_000).hex()
    return f"pbkdf2_sha256${salt}${digest}"


def verify_password(password: str, password_hash: str) -> bool:
    try:
        _, salt, digest = password_hash.split("$", 2)
    except ValueError:
        return False
    check = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 120_000).hex()
    return hmac.compare_digest(check, digest)


def sign_token(user_id: int, role: str, ttl: int, token_type: str) -> str:
    payload = {"sub": user_id, "role": role, "type": token_type, "exp": int(time.time()) + ttl}
    body = base64.urlsafe_b64encode(json.dumps(payload).encode()).decode().rstrip("=")
    sig = hmac.new(SECRET.encode(), body.encode(), hashlib.sha256).hexdigest()
    return f"{body}.{sig}"


def parse_token(token: str, expected_type: str = "access") -> dict[str, Any]:
    try:
        body, sig = token.split(".", 1)
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid token format")
    expected = hmac.new(SECRET.encode(), body.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, sig):
        raise HTTPException(status_code=401, detail="Invalid token signature")
    payload = json.loads(base64.urlsafe_b64decode(body + "=" * (-len(body) % 4)))
    if payload.get("type") != expected_type or payload.get("exp", 0) < int(time.time()):
        raise HTTPException(status_code=401, detail="Token expired")
    return payload


def socialpersona_public_username(anon_suffix: str) -> str:
    return f"user{int(anon_suffix)}"


def socialpersona_pool_number(anon_suffix: str) -> int:
    return int(anon_suffix)


def socialpersona_email(public_username: str) -> str:
    return f"{public_username.lower()}@socialpersona.local"


def socialpersona_anon_suffix(username: str) -> Optional[str]:
    name = (username or "").strip().lower()
    if name.startswith("persona_"):
        return name.removeprefix("persona_").zfill(5)
    match = re.fullmatch(r"sp(\d+)", name)
    if match:
        return str(int(match.group(1))).zfill(5)
    match = re.fullmatch(r"user(\d+)", name)
    if match:
        return str(int(match.group(1))).zfill(5)
    return None


def is_socialpersona_username(username: str) -> bool:
    name = (username or "").strip().lower()
    if name == "user0":
        return False
    return name.startswith("persona_") or bool(re.fullmatch(r"sp\d+", name)) or bool(re.fullmatch(r"user\d+", name))


def ensure_persona_avatar(pool_number: int) -> str:
    if pool_number < 1 or pool_number > 100:
        return ""
    PERSONA_AVATAR_DIR.mkdir(parents=True, exist_ok=True)
    dest = PERSONA_AVATAR_DIR / f"user{pool_number}.png"
    source = CARTOONSET_DIR / f"{pool_number:03d}.png"
    if source.exists():
        if not dest.exists() or source.stat().st_mtime > dest.stat().st_mtime:
            shutil.copy2(source, dest)
        return f"/uploads/avatars/persona/user{pool_number}.png"
    return ""


def normalize_login_identifier(raw: str) -> str:
    value = (raw or "").strip()
    lower = value.lower()
    if "@" in lower:
        return lower
    if re.fullmatch(r"user\d+", lower):
        return socialpersona_email(lower)
    if lower.startswith("anon_"):
        suffix = lower.removeprefix("anon_").zfill(5)
        return socialpersona_email(socialpersona_public_username(suffix))
    if lower.startswith("persona_"):
        suffix = lower.removeprefix("persona_").zfill(5)
        return socialpersona_email(socialpersona_public_username(suffix))
    if lower.isdigit():
        return socialpersona_email(socialpersona_public_username(lower.zfill(5)))
    return lower


def current_user(authorization: Optional[str] = Header(default=None)) -> dict[str, Any]:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Please sign in first")
    payload = parse_token(authorization.removeprefix("Bearer ").strip())
    user = one("SELECT * FROM users WHERE id = ?", (payload["sub"],))
    if not user or user["status"] != "active":
        raise HTTPException(status_code=403, detail="Account is unavailable")
    return user


def admin_user(user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


class RegisterIn(BaseModel):
    email: str
    username: str = Field(min_length=2, max_length=32)
    password: str = Field(min_length=8)


class LoginIn(BaseModel):
    email: str
    password: str


class ProfileIn(BaseModel):
    display_name: str
    city: str
    bio: str = ""
    avatar_url: str = ""
    age_confirmed: bool = True
    accepts_local: bool = True
    accepts_online: bool = True


class VisibilityIn(BaseModel):
    accepts_online: bool = True
    show_name: bool = True
    show_city: bool = True
    show_intent: bool = True
    show_signals: bool = True
    share_posts: bool = True


class PostIn(BaseModel):
    text: str = ""
    image_url: str = ""
    original_url: str = ""
    posted_at: str = ""
    city: str = ""
    is_used_for_profile: bool = True
    visibility: str = "profile_only"


class SignalPatch(BaseModel):
    label: Optional[str] = None
    confirmation_status: Optional[str] = None


class IntentIn(BaseModel):
    raw_text: str
    local_or_online: str = "both"
    max_introductions_per_week: int = 3
    expires_in_days: int = 14


class DecisionIn(BaseModel):
    decision: str
    reason: str = ""


class PrivacyIn(BaseModel):
    allowed_fields: list[str]


class MessageIn(BaseModel):
    content: str = Field(min_length=1, max_length=2000)


class FeedbackIn(BaseModel):
    outcome: str
    accurate_factors: list[str] = []
    improvement_factors: list[str] = []
    comment: str = ""


class ReportIn(BaseModel):
    category: str
    description: str = ""


class AiChatIn(BaseModel):
    content: str = Field(min_length=1, max_length=2000)
    about_recommendation_id: Optional[int] = None


def init_db() -> None:
    ddl = [
        """CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL,
            username TEXT UNIQUE NOT NULL, role TEXT NOT NULL DEFAULT 'user', status TEXT NOT NULL DEFAULT 'active',
            is_test_account INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, last_login_at TEXT
        )""",
        """CREATE TABLE IF NOT EXISTS user_profiles (
            user_id INTEGER PRIMARY KEY, display_name TEXT, avatar_url TEXT, city TEXT, bio TEXT,
            age_confirmed INTEGER, accepts_local INTEGER, accepts_online INTEGER, onboarding_completed INTEGER DEFAULT 0,
            open_status TEXT DEFAULT 'open', open_until TEXT, created_at TEXT, updated_at TEXT,
            FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
        )""",
        """CREATE TABLE IF NOT EXISTS social_posts (
            id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, text TEXT, image_url TEXT, original_url TEXT,
            posted_at TEXT, city TEXT, is_used_for_profile INTEGER, visibility TEXT, status TEXT DEFAULT 'active', created_at TEXT,
            FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
        )""",
        """CREATE TABLE IF NOT EXISTS profile_signals (
            id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, signal_type TEXT, label TEXT, normalized_label TEXT,
            confidence REAL, confirmation_status TEXT, source_type TEXT, source_post_ids TEXT, evidence_summary TEXT,
            expires_at TEXT, created_at TEXT, updated_at TEXT,
            FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
        )""",
        """CREATE TABLE IF NOT EXISTS connection_intents (
            id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, raw_text TEXT, structured_summary TEXT,
            target_topics TEXT, target_context TEXT, local_or_online TEXT, max_introductions_per_week INTEGER,
            active_from TEXT, expires_at TEXT, status TEXT, embedding TEXT, created_at TEXT, updated_at TEXT,
            FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
        )""",
        """CREATE TABLE IF NOT EXISTS recommendations (
            id INTEGER PRIMARY KEY AUTOINCREMENT, source_user_id INTEGER, candidate_user_id INTEGER, source_intent_id INTEGER,
            directional_score_source_to_candidate REAL, directional_score_candidate_to_source REAL, reciprocal_score REAL,
            reason_for_source TEXT, reason_for_candidate TEXT, why_now TEXT, mismatch_note TEXT, evidence_json TEXT,
            status TEXT, created_at TEXT, expires_at TEXT
        )""",
        """CREATE TABLE IF NOT EXISTS recommendation_decisions (
            id INTEGER PRIMARY KEY AUTOINCREMENT, recommendation_id INTEGER, user_id INTEGER, decision TEXT, reason TEXT, created_at TEXT
        )""",
        """CREATE TABLE IF NOT EXISTS connections (
            id INTEGER PRIMARY KEY AUTOINCREMENT, user_a_id INTEGER, user_b_id INTEGER, recommendation_id INTEGER, status TEXT,
            privacy_a_confirmed INTEGER DEFAULT 0, privacy_b_confirmed INTEGER DEFAULT 0, privacy_a TEXT, privacy_b TEXT,
            created_at TEXT, closed_at TEXT
        )""",
        """CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT, connection_id INTEGER, sender_type TEXT, sender_user_id INTEGER,
            content TEXT, created_at TEXT, read_at TEXT, status TEXT
        )""",
        """CREATE TABLE IF NOT EXISTS connection_feedback (
            id INTEGER PRIMARY KEY AUTOINCREMENT, connection_id INTEGER, user_id INTEGER, outcome TEXT,
            accurate_factors TEXT, improvement_factors TEXT, comment TEXT, created_at TEXT
        )""",
        """CREATE TABLE IF NOT EXISTS blocks (blocker_user_id INTEGER, blocked_user_id INTEGER, created_at TEXT, PRIMARY KEY(blocker_user_id, blocked_user_id))""",
        """CREATE TABLE IF NOT EXISTS reports (
            id INTEGER PRIMARY KEY AUTOINCREMENT, reporter_user_id INTEGER, reported_user_id INTEGER, connection_id INTEGER,
            category TEXT, description TEXT, status TEXT, created_at TEXT, resolved_at TEXT, admin_note TEXT
        )""",
        """CREATE TABLE IF NOT EXISTS notifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, type TEXT, payload TEXT, read_at TEXT, created_at TEXT
        )""",
        """CREATE TABLE IF NOT EXISTS audit_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT, actor_type TEXT, actor_id INTEGER, action TEXT, target_type TEXT, target_id INTEGER,
            metadata TEXT, created_at TEXT
        )""",
        """CREATE TABLE IF NOT EXISTS ai_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, role TEXT NOT NULL, content TEXT NOT NULL,
            recommendation_ids TEXT, about_recommendation_id INTEGER, created_at TEXT,
            FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
        )""",
    ]
    with db() as conn:
        for sql in ddl:
            conn.execute(sql)
        columns = {row["name"] for row in conn.execute("PRAGMA table_info(user_profiles)")}
        for name, column_type in (
            ("show_name", "INTEGER NOT NULL DEFAULT 1"),
            ("show_city", "INTEGER NOT NULL DEFAULT 1"),
            ("show_intent", "INTEGER NOT NULL DEFAULT 1"),
            ("show_signals", "INTEGER NOT NULL DEFAULT 1"),
            ("share_posts", "INTEGER NOT NULL DEFAULT 1"),
        ):
            if name not in columns:
                conn.execute(f"ALTER TABLE user_profiles ADD COLUMN {name} {column_type}")
        conn.commit()


@app.on_event("startup")
def startup() -> None:
    init_db()
    seed_dev_data()
    execute(
        "UPDATE ai_messages SET content=? WHERE role='assistant' AND content LIKE 'I''m Wei.%'",
        ("I'm Noa. Tell me who you want to meet. One sharp detail is enough.",),
    )


def audit(actor_type: str, actor_id: int, action: str, target_type: str, target_id: int, metadata: Any = None) -> None:
    execute(
        "INSERT INTO audit_logs(actor_type, actor_id, action, target_type, target_id, metadata, created_at) VALUES(?,?,?,?,?,?,?)",
        (actor_type, actor_id, action, target_type, target_id, encode_json(metadata or {}), now_iso()),
    )


def make_auth(user: dict[str, Any]) -> dict[str, Any]:
    return {
        "access_token": sign_token(user["id"], user["role"], ACCESS_TTL, "access"),
        "refresh_token": sign_token(user["id"], user["role"], REFRESH_TTL, "refresh"),
        "token_type": "bearer",
        "user": public_user(user),
    }


def public_user(user: dict[str, Any]) -> dict[str, Any]:
    profile = one("SELECT * FROM user_profiles WHERE user_id = ?", (user["id"],)) or {}
    return {
        "id": user["id"],
        "email": user["email"],
        "username": user["username"],
        "role": user["role"],
        "status": user["status"],
        "is_test_account": bool(user["is_test_account"]),
        "profile": profile,
    }


@app.post("/auth/register")
def register(body: RegisterIn) -> dict[str, Any]:
    if one("SELECT id FROM users WHERE email = ?", (body.email,)):
        raise HTTPException(409, "Email is already registered")
    if one("SELECT id FROM users WHERE username = ?", (body.username,)):
        raise HTTPException(409, "Username is already taken")
    ts = now_iso()
    cur = execute(
        "INSERT INTO users(email,password_hash,username,role,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?)",
        (body.email, hash_password(body.password), body.username, "user", "active", ts, ts),
    )
    user_id = cur.lastrowid
    execute(
        "INSERT INTO user_profiles(user_id, display_name, city, bio, age_confirmed, accepts_local, accepts_online, onboarding_completed, created_at, updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
        (user_id, body.username, "Shanghai", "", 1, 1, 1, 0, ts, ts),
    )
    user = one("SELECT * FROM users WHERE id = ?", (user_id,))
    audit("user", user_id, "register", "user", user_id)
    return make_auth(user)


@app.post("/auth/login")
def login(body: LoginIn) -> dict[str, Any]:
    identifier = normalize_login_identifier(body.email)
    user = one("SELECT * FROM users WHERE email = ? OR username = ?", (identifier, identifier))
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(401, "Email or password is incorrect")
    execute("UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?", (now_iso(), now_iso(), user["id"]))
    return make_auth(one("SELECT * FROM users WHERE id = ?", (user["id"],)))


@app.post("/auth/refresh")
def refresh(refresh_token: str = Form(...)) -> dict[str, Any]:
    payload = parse_token(refresh_token, "refresh")
    user = one("SELECT * FROM users WHERE id = ?", (payload["sub"],))
    if not user:
        raise HTTPException(401, "User does not exist")
    return make_auth(user)


@app.post("/auth/logout")
def logout(_: dict[str, Any] = Depends(current_user)) -> dict[str, str]:
    return {"message": "Signed out"}


@app.post("/auth/forgot-password")
def forgot_password(email: str = Form(...)) -> dict[str, str]:
    return {"message": "If that email exists, reset instructions will be sent."}


@app.post("/auth/reset-password")
def reset_password() -> dict[str, str]:
    return {"message": "In development, ask an admin to reset the password."}


@app.get("/me")
def me(user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    return public_user(user)


@app.put("/me")
def update_me(body: ProfileIn, user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    execute(
        """UPDATE user_profiles SET display_name=?, avatar_url=?, city=?, bio=?, age_confirmed=?, accepts_local=?,
        accepts_online=?, onboarding_completed=1, open_until=?, updated_at=? WHERE user_id=?""",
        (
            body.display_name,
            body.avatar_url,
            body.city,
            body.bio,
            int(body.age_confirmed),
            int(body.accepts_local),
            int(body.accepts_online),
            (datetime.now(timezone.utc) + timedelta(days=14)).isoformat(),
            now_iso(),
            user["id"],
        ),
    )
    audit("user", user["id"], "update_profile", "user", user["id"])
    return me(user)


def _pref_on(value: Any, default: bool = True) -> bool:
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    try:
        return int(value) != 0
    except (TypeError, ValueError):
        return default


@app.put("/me/visibility")
def update_visibility(body: VisibilityIn, user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    execute(
        """UPDATE user_profiles
        SET accepts_online=?, show_name=?, show_city=?, show_intent=?, show_signals=?, share_posts=?, updated_at=?
        WHERE user_id=?""",
        (
            int(body.accepts_online),
            int(body.show_name),
            int(body.show_city),
            int(body.show_intent),
            int(body.show_signals),
            int(body.share_posts),
            now_iso(),
            user["id"],
        ),
    )
    audit("user", user["id"], "update_visibility", "user", user["id"])
    return me(user)


@app.delete("/me")
def delete_me(user: dict[str, Any] = Depends(current_user)) -> dict[str, str]:
    execute("UPDATE users SET status='deleted', email=?, username=?, updated_at=? WHERE id=?", (f"deleted-{user['id']}@weave.local", f"deleted-{user['id']}", now_iso(), user["id"]))
    audit("user", user["id"], "delete_account", "user", user["id"])
    return {"message": "Account deleted and anonymized."}


@app.get("/me/export")
def export_me(user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    return {
        "user": public_user(user),
        "posts": query("SELECT * FROM social_posts WHERE user_id=?", (user["id"],)),
        "signals": query("SELECT * FROM profile_signals WHERE user_id=?", (user["id"],)),
        "intents": query("SELECT * FROM connection_intents WHERE user_id=?", (user["id"],)),
    }


@app.post("/uploads")
async def upload(file: UploadFile = File(...), user: dict[str, Any] = Depends(current_user)) -> dict[str, str]:
    if file.content_type not in {"image/png", "image/jpeg", "image/webp"}:
        raise HTTPException(400, "Only png, jpg, and webp images are supported")
    raw = await file.read()
    if len(raw) > 5 * 1024 * 1024:
        raise HTTPException(400, "Images cannot exceed 5MB")
    suffix = Path(file.filename or "image.jpg").suffix.lower() or ".jpg"
    name = f"{user['id']}-{secrets.token_hex(8)}{suffix}"
    path = UPLOAD_DIR / name
    path.write_bytes(raw)
    return {"url": f"/uploads/{name}"}


@app.post("/posts")
def create_post(body: PostIn, user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    cur = execute(
        "INSERT INTO social_posts(user_id,text,image_url,original_url,posted_at,city,is_used_for_profile,visibility,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
        (user["id"], body.text, body.image_url, body.original_url, body.posted_at or now_iso(), body.city, int(body.is_used_for_profile), body.visibility, "active", now_iso()),
    )
    return one("SELECT * FROM social_posts WHERE id=?", (cur.lastrowid,))


@app.get("/posts")
def list_posts(user: dict[str, Any] = Depends(current_user)) -> list[dict[str, Any]]:
    posts = query("SELECT * FROM social_posts WHERE user_id=? AND status!='deleted' ORDER BY created_at DESC", (user["id"],))
    return decorate_posts(user["id"], posts)


@app.get("/posts/{post_id}")
def get_post(post_id: int, user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    post = one("SELECT * FROM social_posts WHERE id=? AND user_id=?", (post_id, user["id"]))
    if not post:
        raise HTTPException(404, "Post not found")
    return post


@app.put("/posts/{post_id}")
def update_post(post_id: int, body: PostIn, user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    if not get_post(post_id, user):
        raise HTTPException(404, "Post not found")
    execute(
        "UPDATE social_posts SET text=?, image_url=?, original_url=?, posted_at=?, city=?, is_used_for_profile=?, visibility=? WHERE id=? AND user_id=?",
        (body.text, body.image_url, body.original_url, body.posted_at, body.city, int(body.is_used_for_profile), body.visibility, post_id, user["id"]),
    )
    return get_post(post_id, user)


@app.delete("/posts/{post_id}")
def delete_post(post_id: int, user: dict[str, Any] = Depends(current_user)) -> dict[str, str]:
    execute("UPDATE social_posts SET status='deleted' WHERE id=? AND user_id=?", (post_id, user["id"]))
    return {"message": "Deleted"}


def local_analyze(posts: list[dict[str, Any]]) -> list[dict[str, Any]]:
    text = " ".join(p.get("text") or "" for p in posts).lower()
    mapping = {
        "stable_interest": [("city photography", ["摄影", "拍照", "影像", "photography", "camera"]), ("independent film", ["电影", "放映", "导演", "film", "cinema"]), ("walking", ["徒步", "路线", "户外", "walking", "outdoor"]), ("design", ["设计", "空间", "展览", "design", "space", "exhibition"])],
        "recent_topic": [("Shanghai culture spaces", ["上海", "空间", "展览", "shanghai", "gallery"]), ("city nights", ["夜晚", "夜景", "城市", "night", "city"]), ("small screenings", ["放映", "独立电影", "screening", "film"])],
        "interaction_preference": [("starts from a concrete topic", ["一起", "交流", "讨论", "talk", "discuss"]), ("comfortable starting online", ["线上", "先聊", "语音", "online", "chat"])],
    }
    out: list[dict[str, Any]] = []
    post_ids = [p["id"] for p in posts]
    for signal_type, rules in mapping.items():
        for label, keys in rules:
            hits = [k for k in keys if k in text]
            if hits:
                out.append(
                    {
                        "signal_type": signal_type,
                        "label": label,
                        "normalized_label": label,
                        "confidence": min(0.95, 0.55 + len(hits) * 0.12),
                        "confirmation_status": "pending",
                        "source_type": "user_submitted_posts",
                        "source_post_ids": post_ids,
                        "evidence_summary": f"Keywords from user-submitted posts: {', '.join(hits)}",
                    }
                )
    if not out:
        out.append(
            {
                "signal_type": "current_context",
                "label": "needs more context",
                "normalized_label": "needs more context",
                "confidence": 0.3,
                "confirmation_status": "needs_confirmation",
                "source_type": "insufficient_posts",
                "source_post_ids": post_ids,
                "evidence_summary": "There is not enough content yet for a stable signal.",
            }
        )
    return out


@app.post("/profile/analyze")
def analyze_profile(user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    posts = query("SELECT * FROM social_posts WHERE user_id=? AND is_used_for_profile=1 AND status='active'", (user["id"],))
    if len(posts) < 3:
        raise HTTPException(400, "Add at least 3 posts before building a profile")
    execute("DELETE FROM profile_signals WHERE user_id=? AND confirmation_status='pending'", (user["id"],))
    signals = local_analyze(posts)
    for s in signals:
        execute(
            """INSERT INTO profile_signals(user_id,signal_type,label,normalized_label,confidence,confirmation_status,source_type,source_post_ids,evidence_summary,created_at,updated_at)
            VALUES(?,?,?,?,?,?,?,?,?,?,?)""",
            (user["id"], s["signal_type"], s["label"], s["normalized_label"], s["confidence"], s["confirmation_status"], s["source_type"], encode_json(s["source_post_ids"]), s["evidence_summary"], now_iso(), now_iso()),
        )
    return {"provider": os.getenv("AI_PROVIDER", "local-dev-rule-analyzer"), "ai_configured": bool(os.getenv("AI_API_KEY")), "signals": query("SELECT * FROM profile_signals WHERE user_id=?", (user["id"],))}


@app.get("/profile/signals")
def profile_signals(user: dict[str, Any] = Depends(current_user)) -> list[dict[str, Any]]:
    return query("SELECT * FROM profile_signals WHERE user_id=? ORDER BY created_at DESC", (user["id"],))


@app.get("/profile/life-index")
def my_life_index(user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    return {"gold_profile": socialpersona_gold_profile(user["id"])}


@app.put("/profile/signals/{signal_id}")
def update_signal(signal_id: int, body: SignalPatch, user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    signal = one("SELECT * FROM profile_signals WHERE id=? AND user_id=?", (signal_id, user["id"]))
    if not signal:
        raise HTTPException(404, "Profile signal not found")
    execute(
        "UPDATE profile_signals SET label=COALESCE(?, label), normalized_label=COALESCE(?, normalized_label), confirmation_status=COALESCE(?, confirmation_status), updated_at=? WHERE id=?",
        (body.label, body.label, body.confirmation_status, now_iso(), signal_id),
    )
    return one("SELECT * FROM profile_signals WHERE id=?", (signal_id,))


@app.post("/profile/confirm")
def confirm_profile(user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    execute("UPDATE profile_signals SET confirmation_status='confirmed', updated_at=? WHERE user_id=? AND confirmation_status IN ('pending','needs_confirmation')", (now_iso(), user["id"]))
    execute("UPDATE user_profiles SET onboarding_completed=1, updated_at=? WHERE user_id=?", (now_iso(), user["id"]))
    return {"message": "Profile confirmed", "signals": profile_signals(user)}


@app.post("/profile/rebuild")
def rebuild_profile(user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    execute("DELETE FROM profile_signals WHERE user_id=?", (user["id"],))
    return analyze_profile(user)


TOPIC_ALIASES: dict[str, list[str]] = {
    "photography": ["photo", "camera", "film photography", "visual art", "creation", "拍照", "影像", "摄影"],
    "film": ["movie", "movies", "cinema", "tv", "entertainment", "独立电影", "放映", "电影"],
    "music": ["kpop", "k-pop", "concert", "album", "entertainment", "音乐"],
    "gaming": ["video game", "board game", "esports", "game", "游戏"],
    "food": ["cooking", "restaurant", "dining", "coffee", "drink", "recipe", "食物"],
    "travel": ["city exploration", "tourism", "sightseeing", "city", "旅行"],
    "outdoors": ["sports", "outdoor", "hiking", "fitness", "camping", "徒步", "户外"],
    "pets": ["pet", "dog", "cat", "宠物"],
    "exhibitions": ["exhibition", "museum", "gallery", "art", "visual art", "展览"],
    "city life": ["city", "urban", "street", "上海", "city exploration", "城市"],
    "writing": ["story", "book", "books", "写作", "故事"],
    "design": ["architecture", "space", "设计", "空间"],
    "online": ["线上"],
    "weekend": ["周末"],
}

LOW_SIGNAL_MATCH_TAGS = {
    "city",
    "urban",
    "street",
    "travel",
    "tourism",
    "sightseeing",
    "city exploration",
    "online",
    "weekend",
    "city life",
    "shanghai",
}


def topic_variants(label: str) -> set[str]:
    raw = (label or "").strip().lower()
    variants = {raw} if raw else set()
    for canonical, aliases in TOPIC_ALIASES.items():
        terms = [canonical.lower(), *[a.lower() for a in aliases]]
        if raw in terms or any(t and (t in raw or raw in t) for t in terms):
            variants.update(terms)
    return {v for v in variants if v}


def keywords(text: str) -> list[str]:
    lower = text.lower()
    found: list[str] = []
    for canonical, aliases in TOPIC_ALIASES.items():
        if canonical in found:
            continue
        if canonical.lower() in lower or any(alias.lower() in lower for alias in aliases):
            found.append(canonical)
    return found


def meaningful_match_tags(raw_tags: list[str]) -> list[str]:
    tags: list[str] = []
    for tag in raw_tags:
        for variant in topic_variants(str(tag)):
            if variant.lower() not in LOW_SIGNAL_MATCH_TAGS:
                tags.append(variant)
    return list(dict.fromkeys(tags))


def canonical_match_tags(raw_tags: list[str]) -> list[str]:
    tags: list[str] = []
    for tag in raw_tags:
        raw = str(tag or "").strip()
        lower = raw.lower()
        if not raw or lower in LOW_SIGNAL_MATCH_TAGS:
            continue
        matched = False
        for canonical, aliases in TOPIC_ALIASES.items():
            terms = [canonical.lower(), *[alias.lower() for alias in aliases]]
            if lower in terms or any(term and (term in lower or lower in term) for term in terms):
                if canonical.lower() not in LOW_SIGNAL_MATCH_TAGS:
                    tags.append(canonical)
                matched = True
        if not matched:
            tags.append(raw)
    return list(dict.fromkeys(tags))


def sort_match_tags(tags: set[str]) -> list[str]:
    return sorted(tags, key=lambda tag: (0 if tag in TOPIC_ALIASES else 1, tag.lower()))


def topic_phrase(topics: list[str], limit: int = 4) -> str:
    selected = [str(topic).strip() for topic in topics[:limit] if str(topic).strip()]
    return ", ".join(selected) if selected else "similar things"


@app.post("/intents")
def create_intent(body: IntentIn, user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    execute("UPDATE connection_intents SET status='paused' WHERE user_id=? AND status='active'", (user["id"],))
    topics = keywords(body.raw_text)
    summary = f"Looking for people into {topic_phrase(topics)}"
    now = datetime.now(timezone.utc)
    cur = execute(
        """INSERT INTO connection_intents(user_id,raw_text,structured_summary,target_topics,target_context,local_or_online,max_introductions_per_week,active_from,expires_at,status,embedding,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        (user["id"], body.raw_text, summary, encode_json(topics), body.raw_text, body.local_or_online, body.max_introductions_per_week, now.isoformat(), (now + timedelta(days=body.expires_in_days)).isoformat(), "active", encode_json(topics), now_iso(), now_iso()),
    )
    return one("SELECT * FROM connection_intents WHERE id=?", (cur.lastrowid,))


@app.get("/intents")
def list_intents(user: dict[str, Any] = Depends(current_user)) -> list[dict[str, Any]]:
    return query("SELECT * FROM connection_intents WHERE user_id=? ORDER BY created_at DESC", (user["id"],))


@app.get("/intents/{intent_id}")
def get_intent(intent_id: int, user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    intent = one("SELECT * FROM connection_intents WHERE id=? AND user_id=?", (intent_id, user["id"]))
    if not intent:
        raise HTTPException(404, "Connection intent not found")
    return intent


@app.put("/intents/{intent_id}")
def update_intent(intent_id: int, body: IntentIn, user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    get_intent(intent_id, user)
    topics = keywords(body.raw_text)
    execute("UPDATE connection_intents SET raw_text=?, structured_summary=?, target_topics=?, local_or_online=?, max_introductions_per_week=?, updated_at=? WHERE id=?", (body.raw_text, f"Looking for people into {topic_phrase(topics)}", encode_json(topics), body.local_or_online, body.max_introductions_per_week, now_iso(), intent_id))
    return get_intent(intent_id, user)


@app.delete("/intents/{intent_id}")
def delete_intent(intent_id: int, user: dict[str, Any] = Depends(current_user)) -> dict[str, str]:
    get_intent(intent_id, user)
    execute("UPDATE connection_intents SET status='deleted' WHERE id=?", (intent_id,))
    return {"message": "Deleted"}


@app.post("/intents/{intent_id}/pause")
def pause_intent(intent_id: int, user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    get_intent(intent_id, user)
    execute("UPDATE connection_intents SET status='paused' WHERE id=?", (intent_id,))
    return get_intent(intent_id, user)


@app.post("/intents/{intent_id}/activate")
def activate_intent(intent_id: int, user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    get_intent(intent_id, user)
    execute("UPDATE connection_intents SET status='active' WHERE id=?", (intent_id,))
    return get_intent(intent_id, user)


def recent_ai_topics(user_id: int) -> list[str]:
    rows = query(
        """SELECT content FROM ai_messages
        WHERE user_id=? AND role='user' AND IFNULL(about_recommendation_id, 0)=0
        ORDER BY id DESC LIMIT 16""",
        (user_id,),
    )
    raw_tags: list[str] = []
    for row in rows:
        raw_tags.extend(keywords(row.get("content") or ""))
    return canonical_match_tags(raw_tags)


def user_tags(user_id: int) -> list[str]:
    signals = query(
        "SELECT normalized_label FROM profile_signals WHERE user_id=? AND confirmation_status='confirmed' AND signal_type!='negative_interest'",
        (user_id,),
    )
    intent = one("SELECT target_topics FROM connection_intents WHERE user_id=? AND status='active' ORDER BY created_at DESC", (user_id,))
    raw_tags = [s["normalized_label"] for s in signals]
    raw_tags += decode_json(intent["target_topics"], []) if intent else []
    raw_tags += recent_ai_topics(user_id)
    return canonical_match_tags(raw_tags)


GOLD_DOMAIN_ORDER = [
    "sports_outdoor",
    "entertainment",
    "gaming",
    "food_drink",
    "travel_city_exploration",
    "photography_creation",
    "pets",
]

WEI_GREETING = "I'm Noa. Tell me who you want to meet. One sharp detail is enough."

PERSON_INTRO_TEMPLATE = """Quick read on {name}:
They're the kind of person who keeps {essence} close.

Life index
Steady — {steady}
Lately — {lately}
Skip — {skip}

Right now they're open to {intent}.

{closing}"""

CHAT_EMPTY_TEMPLATE = "Nothing clean landed. Give me one sharper detail — film, a slow coffee, a museum afternoon."


def socialpersona_user_dir(user_id: int) -> Optional[Path]:
    user = one("SELECT username FROM users WHERE id=?", (user_id,))
    username = str(user.get("username") or "") if user else ""
    suffix = socialpersona_anon_suffix(username)
    if not suffix:
        return None
    path = SOCIALPERSONA_USERS_DIR / f"anon_{suffix}"
    return path if path.exists() else None


def choose_caption(entry: dict[str, Any]) -> str:
    captions = entry.get("model_captions") or {}
    preferred = ["gpt-5.4", "gpt-4o-mini", "qwen3-vl-8b-instruct", "qwen2.5-vl-7b-instruct", "gemini-2.5-flash"]
    for model in preferred:
        summary = str((captions.get(model) or {}).get("summary") or "").strip()
        if summary and "Low-information image" not in summary:
            return summary
    for value in captions.values():
        summary = str((value or {}).get("summary") or "").strip()
        if summary:
            return summary
    return ""


def socialpersona_caption_map(user_id: int) -> dict[str, str]:
    user_dir = socialpersona_user_dir(user_id)
    if not user_dir:
        return {}
    posts_path = user_dir / "posts.jsonl"
    captions_path = user_dir / "image_captions.json"
    if not posts_path.exists() or not captions_path.exists():
        return {}
    try:
        raw_captions = json.loads(captions_path.read_text(encoding="utf-8")).get("captions", {})
    except json.JSONDecodeError:
        return {}
    caption_keys = sorted(raw_captions.keys(), key=lambda key: int(str(key).split("_")[-1]))
    image_index = 0
    by_post_id: dict[str, str] = {}
    with posts_path.open(encoding="utf-8") as f:
        for line in f:
            try:
                post = json.loads(line)
            except json.JSONDecodeError:
                continue
            post_id = str(post.get("post_id") or "")
            media = post.get("media") or []
            for _ in media:
                if image_index >= len(caption_keys):
                    break
                caption = choose_caption(raw_captions.get(caption_keys[image_index]) or {})
                image_index += 1
                if caption and post_id and post_id not in by_post_id:
                    by_post_id[post_id] = caption
    return by_post_id


def decorate_posts(user_id: int, posts: list[dict[str, Any]]) -> list[dict[str, Any]]:
    captions = socialpersona_caption_map(user_id)
    if not captions:
        return posts
    decorated = []
    for post in posts:
        next_post = dict(post)
        source_post_id = str(next_post.get("original_url") or "")
        caption = captions.get(source_post_id)
        if caption:
            next_post["image_caption"] = caption
        decorated.append(next_post)
    return decorated


def socialpersona_gold_profile(user_id: int) -> Optional[dict[str, Any]]:
    user_dir = socialpersona_user_dir(user_id)
    if not user_dir:
        return None
    profile_path = user_dir / "gold_profile.json"
    if not profile_path.exists():
        return None
    try:
        raw = json.loads(profile_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return None
    domains_by_name = {str(domain.get("domain")): domain for domain in raw.get("domains", [])}
    domains = []
    for name in GOLD_DOMAIN_ORDER:
        domains.append(
            domains_by_name.get(
                name,
                {
                    "domain": name,
                    "status": "inactive",
                    "long_term_interests": [],
                    "short_term_interests": [],
                    "negative_interests": [],
                },
            )
        )
    return {
        "user_id": raw.get("user_id"),
        "observation_window": raw.get("observation_window") or {},
        "domains": domains,
    }


def active_intent_for_user(user_id: int) -> Optional[dict[str, Any]]:
    intent = one("SELECT * FROM connection_intents WHERE user_id=? AND status='active' ORDER BY created_at DESC", (user_id,))
    if intent:
        intent["target_topics"] = decode_json(intent.get("target_topics"), [])
    return intent


def candidate_context(user_id: int, full_posts: bool = False) -> dict[str, Any]:
    signals = query(
        """SELECT signal_type,label,evidence_summary,source_type
        FROM profile_signals
        WHERE user_id=? AND confirmation_status='confirmed'
        ORDER BY signal_type,label
        LIMIT 30""",
        (user_id,),
    )
    limit = "" if full_posts else "LIMIT 20"
    posts = query(
        f"""SELECT id,text,original_url,posted_at,city,visibility
        FROM social_posts
        WHERE user_id=? AND status!='deleted'
        ORDER BY posted_at DESC, id DESC
        {limit}""",
        (user_id,),
    )
    return {
        "is_socialpersona_seed": is_socialpersona_seed(user_id),
        "signals": signals,
        "posts": decorate_posts(user_id, posts),
        "gold_profile": socialpersona_gold_profile(user_id),
        "active_intent": active_intent_for_user(user_id),
    }


def relationship_for(viewer_id: int, other_id: int) -> str:
    if find_pair_connection(viewer_id, other_id):
        return "connected"
    leaned = one(
        """SELECT d.id FROM recommendation_decisions d
        JOIN recommendations r ON r.id=d.recommendation_id
        WHERE d.user_id=? AND d.decision='interested'
          AND ((r.source_user_id=? AND r.candidate_user_id=?) OR (r.source_user_id=? AND r.candidate_user_id=?))
        LIMIT 1""",
        (viewer_id, viewer_id, other_id, other_id, viewer_id),
    )
    if leaned:
        return "one_way"
    return "open"


def redact_public_profile(person: dict[str, Any], context: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
    person = dict(person)
    profile = dict(person.get("profile") or {})
    context = dict(context)
    person["email"] = ""
    if not _pref_on(profile.get("show_name")):
        profile["display_name"] = ""
        profile["name_hidden"] = 1
        person["username"] = ""
    if not _pref_on(profile.get("show_city")):
        profile["city"] = ""
        profile["city_hidden"] = 1
        context["posts"] = [{**post, "city": ""} for post in context.get("posts") or []]
    if not _pref_on(profile.get("show_intent")):
        context["active_intent"] = None
    if not _pref_on(profile.get("show_signals")):
        profile["signals_hidden"] = 1
        context["signals"] = []
    if not _pref_on(profile.get("share_posts")):
        context["posts"] = []
    person["profile"] = profile
    return person, context


def recommendation_payload(rec: dict[str, Any], viewer_id: Optional[int] = None, full_context: bool = False) -> dict[str, Any]:
    other_id = rec["candidate_user_id"]
    viewer_side = "source"
    if viewer_id == rec["candidate_user_id"]:
        other_id = rec["source_user_id"]
        viewer_side = "candidate"
    other = public_user(one("SELECT * FROM users WHERE id=?", (other_id,)))
    relationship = relationship_for(viewer_id, int(other_id)) if viewer_id else "open"
    context = candidate_context(other_id, full_context)
    evidence = decode_json(rec["evidence_json"], {})
    if relationship != "connected":
        other, context = redact_public_profile(other, context)
        if other.get("profile", {}).get("signals_hidden") and isinstance(evidence, dict):
            evidence = {**evidence, "shared_tags": []}
    else:
        other = {**other, "email": ""}
    return {
        **rec,
        "viewer_side": viewer_side,
        "evidence_json": evidence,
        "candidate": other,
        "candidate_context": context,
        "reason_for_viewer": rec["reason_for_candidate"] if viewer_side == "candidate" else rec["reason_for_source"],
        "reason_for_other": rec["reason_for_source"] if viewer_side == "candidate" else rec["reason_for_candidate"],
        "relationship": relationship,
    }


@app.post("/recommendations/generate")
def generate_recommendations(user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    source_intent = one("SELECT * FROM connection_intents WHERE user_id=? AND status='active' ORDER BY created_at DESC", (user["id"],))
    if not source_intent:
        raise HTTPException(400, "Publish an active connection intent first")
    source_tags = set(user_tags(user["id"]))
    linked = linked_user_ids(user["id"])
    waiting = waiting_user_ids(user["id"])
    if linked:
        marks = ",".join("?" for _ in linked)
        execute(
            f"""UPDATE recommendations SET status='mutual_interest'
            WHERE source_user_id=? AND status IN ('new','active') AND candidate_user_id IN ({marks})""",
            (user["id"], *linked),
        )
    if is_socialpersona_seed(user["id"]):
        candidates = query(
            """SELECT u.* FROM users u JOIN user_profiles p ON p.user_id=u.id
            WHERE u.id != ? AND u.status='active' AND p.onboarding_completed=1 AND IFNULL(p.accepts_online, 1) != 0 AND u.role='user' AND u.is_test_account=1
            AND (u.username GLOB 'user[0-9]*' OR u.username GLOB 'sp[0-9]*' OR u.username LIKE 'persona[_]%')
            AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker_user_id=? AND b.blocked_user_id=u.id) OR (b.blocker_user_id=u.id AND b.blocked_user_id=?))
            LIMIT 120""",
            (user["id"], user["id"], user["id"]),
        )
    else:
        candidates = query(
            """SELECT u.* FROM users u JOIN user_profiles p ON p.user_id=u.id
            WHERE u.id != ? AND u.status='active' AND p.onboarding_completed=1 AND IFNULL(p.accepts_online, 1) != 0
            AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker_user_id=? AND b.blocked_user_id=u.id) OR (b.blocker_user_id=u.id AND b.blocked_user_id=?))
            LIMIT 80""",
            (user["id"], user["id"], user["id"]),
        )
    if waiting:
        marks = ",".join("?" for _ in waiting)
        execute(
            f"""UPDATE recommendations SET status='stale'
            WHERE source_user_id=? AND source_intent_id=? AND status='new' AND candidate_user_id NOT IN ({marks})""",
            (user["id"], source_intent["id"], *waiting),
        )
    else:
        execute(
            "UPDATE recommendations SET status='stale' WHERE source_user_id=? AND source_intent_id=? AND status='new'",
            (user["id"], source_intent["id"]),
        )
    created = []
    for c in candidates:
        if int(c["id"]) in linked or int(c["id"]) in waiting:
            continue
        cand_intent = one("SELECT * FROM connection_intents WHERE user_id=? AND status='active' ORDER BY created_at DESC", (c["id"],))
        if not cand_intent:
            continue
        cand_tags = set(user_tags(c["id"]))
        overlap = source_tags & cand_tags
        if not overlap:
            continue
        a_to_b = min(1.0, 0.35 + len(overlap) * 0.15)
        b_to_a = min(1.0, 0.35 + len(overlap) * 0.13)
        reciprocal = 2 * a_to_b * b_to_a / (a_to_b + b_to_a)
        if reciprocal < 0.45:
            continue
        shared_tags = sort_match_tags(overlap)
        reason_tags = topic_phrase(shared_tags, 3)
        evidence = {"shared_tags": shared_tags, "source_intent": source_intent["raw_text"], "candidate_intent": cand_intent["raw_text"]}
        reason_source = f"You both linger around {reason_tags}. Not a conclusion — just enough to start."
        reason_candidate = f"{reason_tags} is the overlap. They're looking for someone who can hold that texture too."
        why_now = "You're both open right now, so this still feels timely."
        mismatch_note = "Clarify online/offline and chat rhythm first. It will feel better than rushing the pace."
        exists = one("SELECT * FROM recommendations WHERE source_user_id=? AND candidate_user_id=? AND source_intent_id=?", (user["id"], c["id"], source_intent["id"]))
        if exists:
            execute(
                """UPDATE recommendations
                SET directional_score_source_to_candidate=?, directional_score_candidate_to_source=?, reciprocal_score=?,
                    reason_for_source=?, reason_for_candidate=?, why_now=?, mismatch_note=?, evidence_json=?, status='new'
                WHERE id=?""",
                (a_to_b, b_to_a, reciprocal, reason_source, reason_candidate, why_now, mismatch_note, encode_json(evidence), exists["id"]),
            )
            created.append(recommendation_payload(one("SELECT * FROM recommendations WHERE id=?", (exists["id"],)), user["id"]))
            continue
        cur = execute(
            """INSERT INTO recommendations(source_user_id,candidate_user_id,source_intent_id,directional_score_source_to_candidate,directional_score_candidate_to_source,reciprocal_score,reason_for_source,reason_for_candidate,why_now,mismatch_note,evidence_json,status,created_at,expires_at)
            VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (user["id"], c["id"], source_intent["id"], a_to_b, b_to_a, reciprocal, reason_source, reason_candidate, why_now, mismatch_note, encode_json(evidence), "new", now_iso(), (datetime.now(timezone.utc) + timedelta(days=7)).isoformat()),
        )
        created.append(recommendation_payload(one("SELECT * FROM recommendations WHERE id=?", (cur.lastrowid,)), user["id"]))
    created.sort(key=lambda r: (len((r.get("evidence_json") or {}).get("shared_tags") or []), r["reciprocal_score"]), reverse=True)
    return {"items": created[:5], "empty_message": None if created else "No mutual match fits both sides yet."}


@app.get("/recommendations")
def list_recommendations(user: dict[str, Any] = Depends(current_user)) -> list[dict[str, Any]]:
    active_intent = one("SELECT id FROM connection_intents WHERE user_id=? AND status='active' ORDER BY created_at DESC", (user["id"],))
    if active_intent:
        rows = query(
            """SELECT * FROM recommendations
            WHERE source_user_id=? AND source_intent_id=? AND status!='stale'""",
            (user["id"], active_intent["id"]),
        )
    else:
        rows = []
    linked = linked_user_ids(user["id"])
    waiting = waiting_user_ids(user["id"])
    paused = {int(row["user_id"]) for row in query("SELECT user_id FROM user_profiles WHERE IFNULL(accepts_online, 1)=0")}
    items = [
        recommendation_payload(r, user["id"])
        for r in rows
        if int(r["candidate_user_id"]) not in linked
        and int(r["candidate_user_id"]) not in waiting
        and int(r["candidate_user_id"]) not in paused
    ]
    items.sort(
        key=lambda r: (
            len((r.get("evidence_json") or {}).get("shared_tags") or []),
            r["reciprocal_score"],
            r["created_at"] or "",
        ),
        reverse=True,
    )
    return items


@app.get("/recommendations/waiting")
def list_waiting(user: dict[str, Any] = Depends(current_user)) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    for other_id in waiting_user_ids(user["id"]):
        rec = one(
            """SELECT * FROM recommendations
            WHERE (source_user_id=? AND candidate_user_id=?) OR (source_user_id=? AND candidate_user_id=?)
            ORDER BY id DESC LIMIT 1""",
            (user["id"], other_id, other_id, user["id"]),
        )
        if rec:
            items.append(recommendation_payload(rec, user["id"]))
    items.sort(key=lambda item: str(item.get("created_at") or ""), reverse=True)
    return items


@app.get("/recommendations/{rec_id}")
def get_recommendation(rec_id: int, user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    rec = one("SELECT * FROM recommendations WHERE id=? AND (source_user_id=? OR candidate_user_id=?)", (rec_id, user["id"], user["id"]))
    if not rec:
        raise HTTPException(404, "Recommendation not found")
    return recommendation_payload(rec, user["id"], full_context=True)


def save_ai_message(
    user_id: int,
    role: str,
    content: str,
    recommendation_ids: Optional[list[int]] = None,
    about_recommendation_id: Optional[int] = None,
) -> dict[str, Any]:
    cur = execute(
        """INSERT INTO ai_messages(user_id, role, content, recommendation_ids, about_recommendation_id, created_at)
        VALUES(?,?,?,?,?,?)""",
        (user_id, role, content, encode_json(recommendation_ids or []), about_recommendation_id, now_iso()),
    )
    return one("SELECT * FROM ai_messages WHERE id=?", (cur.lastrowid,)) or {}


def hydrate_ai_message(row: dict[str, Any], user_id: int) -> dict[str, Any]:
    rec_ids = decode_json(row.get("recommendation_ids"), [])
    linked = linked_user_ids(user_id)
    waiting = waiting_user_ids(user_id)
    recs = []
    for rec_id in rec_ids[:5]:
        rec = one(
            "SELECT * FROM recommendations WHERE id=? AND (source_user_id=? OR candidate_user_id=?)",
            (rec_id, user_id, user_id),
        )
        if not rec:
            continue
        other_id = rec["candidate_user_id"] if rec["source_user_id"] == user_id else rec["source_user_id"]
        if int(other_id) in linked or int(other_id) in waiting:
            continue
        recs.append(recommendation_payload(rec, user_id))
    return {
        "id": row["id"],
        "role": row["role"],
        "content": row["content"],
        "about_recommendation_id": row.get("about_recommendation_id"),
        "recommendations": recs,
        "created_at": row["created_at"],
    }


def ensure_ai_thread(user_id: int) -> None:
    if one("SELECT id FROM ai_messages WHERE user_id=? LIMIT 1", (user_id,)):
        return
    save_ai_message(user_id, "assistant", WEI_GREETING)


def gold_interest_labels(profile: Optional[dict[str, Any]], bucket: str, limit: int = 4) -> list[str]:
    labels: list[str] = []
    for domain in (profile or {}).get("domains") or []:
        status = str(domain.get("status") or "")
        if status == "inactive":
            continue
        for item in domain.get(bucket) or []:
            label = str(item.get("label") or "").strip()
            if label and label not in labels:
                labels.append(label)
            if len(labels) >= limit:
                return labels
    return labels


def person_display_name(payload: dict[str, Any]) -> str:
    candidate = payload.get("candidate") or {}
    profile = candidate.get("profile") or {}
    return str(profile.get("display_name") or candidate.get("username") or "this person")


def english_list(items: list[str], fallback: str) -> str:
    cleaned = [str(item).strip() for item in items if str(item).strip()][:3]
    if not cleaned:
        return fallback
    if len(cleaned) == 1:
        return cleaned[0]
    if len(cleaned) == 2:
        return f"{cleaned[0]} and {cleaned[1]}"
    return f"{cleaned[0]}, {cleaned[1]}, and {cleaned[2]}"


def compose_life_index_intro(payload: dict[str, Any]) -> str:
    name = person_display_name(payload)
    context = payload.get("candidate_context") or {}
    gold = context.get("gold_profile") or {}
    stable = gold_interest_labels(gold, "long_term_interests", 3)
    recent = gold_interest_labels(gold, "short_term_interests", 3)
    skip = gold_interest_labels(gold, "negative_interests", 2)
    evidence = payload.get("evidence_json") or {}
    intent = str(evidence.get("candidate_intent") or "").strip()
    if not intent:
        active = context.get("active_intent") or {}
        intent = str(active.get("raw_text") or "").strip()
    essence = english_list(stable or recent, "ordinary days with a point of view")
    relationship = str(payload.get("relationship") or "open")
    if relationship == "connected":
        closing = "You're already connected. Their thread is in Messages, so this isn't a new introduction."
    elif relationship == "one_way":
        closing = "You've already leaned in. This stays one-way until they do too — I won't open a thread early."
    else:
        closing = "If this feels like your people, tap Interested. If the energy is off, tap Not interested."
    return PERSON_INTRO_TEMPLATE.format(
        name=name,
        essence=essence,
        steady=english_list(stable, "still forming"),
        lately=english_list(recent, "nothing loud right now"),
        skip=english_list(skip, "nothing flagged"),
        intent=intent or "a slow, real conversation",
        closing=closing,
    )


def compose_match_reply(
    user_text: str,
    items: list[dict[str, Any]],
    empty_message: Optional[str],
    _username: str = "",
) -> str:
    if not items:
        return empty_message or CHAT_EMPTY_TEMPLATE
    topics = keywords(user_text)
    phrase = topic_phrase(topics, 2) if topics else "what you just said"
    return f"These people are into {phrase}."


LIVE_SIGNAL_TYPES = {"stable_interest", "recent_topic", "interaction_preference", "current_context"}
NOA_LIVE_SOURCE = "noa_live_analysis"


def ai_runtime() -> dict[str, Any]:
    provider = os.getenv("AI_PROVIDER", "local-dev-rule-analyzer").strip() or "local-dev-rule-analyzer"
    base_url = os.getenv("AI_BASE_URL", "").strip().rstrip("/")
    api_key = os.getenv("AI_API_KEY", "").strip()
    model = os.getenv("AI_TEXT_MODEL", "").strip()
    wants_live = provider == "openai-compatible"
    live = wants_live and bool(base_url and api_key and model)
    reason = None
    status = "ready"
    if wants_live and not live:
        missing = [name for name, value in (("AI_BASE_URL", base_url), ("AI_API_KEY", api_key), ("AI_TEXT_MODEL", model)) if not value]
        reason = "Set " + ", ".join(missing)
        status = "misconfigured"
    return {
        "provider": provider,
        "live": live,
        "status": status,
        "model": model if live else "local-rules",
        "base_url": base_url,
        "api_key": api_key,
        "failed_reason": reason,
    }


def public_ai_status(used: Optional[str] = None) -> dict[str, Any]:
    runtime = ai_runtime()
    return {
        "provider": runtime["provider"],
        "live": runtime["live"],
        "status": runtime["status"],
        "model": runtime["model"],
        "failed_reason": runtime["failed_reason"],
        "used": used or ("openai-compatible" if runtime["live"] else "local-dev-rule-analyzer"),
    }


def parse_model_payload(text: str) -> dict[str, Any]:
    cleaned = (text or "").strip()
    fenced = re.sub(r"^```(?:json)?\s*", "", cleaned)
    fenced = re.sub(r"\s*```$", "", fenced)
    start = fenced.find("{")
    end = fenced.rfind("}")
    if start >= 0 and end > start:
        try:
            data = json.loads(fenced[start : end + 1])
        except json.JSONDecodeError:
            data = None
        if isinstance(data, dict):
            return data
    return {"reply": cleaned, "looking_for": "", "signals": []}


def message_text(content: Any) -> str:
    if isinstance(content, str):
        return content.strip()
    if isinstance(content, list):
        parts = []
        for part in content:
            if isinstance(part, dict):
                parts.append(str(part.get("text") or part.get("content") or ""))
            else:
                parts.append(str(part))
        return "".join(parts).strip()
    return str(content or "").strip()


def complete_live_chat(system: str, messages: list[dict[str, str]]) -> dict[str, Any]:
    runtime = ai_runtime()
    if not runtime["live"]:
        raise RuntimeError(runtime["failed_reason"] or "Live model is not configured")
    body = json.dumps(
        {
            "model": runtime["model"],
            "temperature": 0.4,
            "messages": [{"role": "system", "content": system}, *messages],
        }
    ).encode("utf-8")
    request = urllib.request.Request(
        f"{runtime['base_url']}/chat/completions",
        data=body,
        headers={"Authorization": f"Bearer {runtime['api_key']}", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=45) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        raise RuntimeError(f"Live model returned HTTP {exc.code}") from exc
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
        raise RuntimeError("Live model did not respond") from exc
    try:
        text = message_text(payload["choices"][0]["message"]["content"])
    except (KeyError, IndexError, TypeError) as exc:
        raise RuntimeError("Live model returned an unreadable reply") from exc
    if not text:
        raise RuntimeError("Live model returned an empty reply")
    return parse_model_payload(text)


def normalize_live_signals(raw: Any) -> list[dict[str, str]]:
    if not isinstance(raw, list):
        return []
    signals: list[dict[str, str]] = []
    seen: set[str] = set()
    for item in raw[:8]:
        if not isinstance(item, dict):
            continue
        label = re.sub(r"\s+", " ", str(item.get("label") or "")).strip()[:80]
        key = label.lower()
        if not label or key in seen:
            continue
        seen.add(key)
        signal_type = str(item.get("signal_type") or "current_context").strip()
        if signal_type not in LIVE_SIGNAL_TYPES:
            signal_type = "current_context"
        evidence = re.sub(r"\s+", " ", str(item.get("evidence") or "")).strip()[:240]
        signals.append({"signal_type": signal_type, "label": label, "evidence": evidence or "Said in the Noa conversation."})
    return signals


def conversation_for_model(user_id: int) -> list[dict[str, str]]:
    rows = query(
        "SELECT role, content FROM ai_messages WHERE user_id=? ORDER BY id DESC LIMIT 12",
        (user_id,),
    )
    messages: list[dict[str, str]] = []
    for row in reversed(rows):
        content = str(row.get("content") or "").strip()[:1200]
        if not content:
            continue
        role = "assistant" if row.get("role") == "assistant" else "user"
        messages.append({"role": role, "content": content})
    return messages


def user_analysis_context(user_id: int) -> str:
    signals = query(
        """SELECT signal_type, label FROM profile_signals
        WHERE user_id=? AND confirmation_status='confirmed'
        ORDER BY id DESC LIMIT 12""",
        (user_id,),
    )
    posts = query(
        """SELECT text FROM social_posts
        WHERE user_id=? AND status='active' AND is_used_for_profile=1 AND TRIM(IFNULL(text, ''))!=''
        ORDER BY id DESC LIMIT 6""",
        (user_id,),
    )
    lines: list[str] = []
    if signals:
        lines.append("Confirmed signals: " + "; ".join(f"{row['signal_type']}: {row['label']}" for row in signals))
    snippets = [re.sub(r"\s+", " ", str(row.get("text") or "")).strip()[:180] for row in posts]
    snippets = [snippet for snippet in snippets if snippet]
    if snippets:
        lines.append("Posts this user submitted:\n- " + "\n- ".join(snippets))
    return "\n".join(lines) or "No confirmed profile or posts yet. Analyze only what they say in this chat."


def public_person_brief(payload: dict[str, Any]) -> str:
    context = payload.get("candidate_context") or {}
    gold = context.get("gold_profile") or {}
    evidence = payload.get("evidence_json") or {}
    intent = str(evidence.get("candidate_intent") or (context.get("active_intent") or {}).get("raw_text") or "").strip()
    return "\n".join(
        [
            f"Name: {person_display_name(payload)}",
            f"Relationship: {payload.get('relationship') or 'open'}",
            f"Why they might fit: {payload.get('reason_for_viewer') or ''}",
            f"Steady: {english_list(gold_interest_labels(gold, 'long_term_interests', 3), 'still forming')}",
            f"Lately: {english_list(gold_interest_labels(gold, 'short_term_interests', 3), 'nothing loud right now')}",
            f"Skip: {english_list(gold_interest_labels(gold, 'negative_interests', 2), 'nothing flagged')}",
            f"Open to: {intent or 'a slow, real conversation'}",
        ]
    )


def save_live_analysis(user_id: int, signals: list[dict[str, str]]) -> None:
    execute(
        "DELETE FROM profile_signals WHERE user_id=? AND source_type=? AND confirmation_status='pending'",
        (user_id, NOA_LIVE_SOURCE),
    )
    for signal in signals:
        execute(
            """INSERT INTO profile_signals(user_id,signal_type,label,normalized_label,confidence,confirmation_status,source_type,source_post_ids,evidence_summary,created_at,updated_at)
            VALUES(?,?,?,?,?,?,?,?,?,?,?)""",
            (
                user_id,
                signal["signal_type"],
                signal["label"],
                signal["label"],
                0.72,
                "pending",
                NOA_LIVE_SOURCE,
                encode_json([]),
                signal["evidence"],
                now_iso(),
                now_iso(),
            ),
        )


def ask_live_noa(user_id: int, about_payload: Optional[dict[str, Any]]) -> dict[str, Any]:
    if about_payload:
        system = (
            "You are Noa, a mutual friend inside Weave. Answer the user's question about one person. "
            "Use only the public card. Do not invent biography, contact details, or private history. "
            "Reply in the user's language, in 2-4 sentences. "
            'Return JSON only: {"reply":"...","looking_for":"","signals":[]}'
        )
        messages = [{"role": "user", "content": f"Public card:\n{public_person_brief(about_payload)}"}]
        messages.extend(conversation_for_model(user_id)[-4:])
    else:
        system = (
            "You are Noa, a mutual friend inside Weave. Talk with the user about who they want to meet and what their days are like. "
            "Then analyze only what this user actually said or submitted. Do not invent traits, cities, or relationships. "
            "signals must cover the conversation so far, not only the last sentence. "
            "signal_type is one of stable_interest, recent_topic, interaction_preference, current_context. "
            "label is a short English phrase. evidence quotes or paraphrases the user's own words. "
            "looking_for is one sentence about who they want to meet, or an empty string if they have not said. "
            "reply is 2-4 sentences in the user's language and should reflect what you understood. "
            'Return JSON only: {"reply":"...","looking_for":"...","signals":[{"signal_type":"recent_topic","label":"...","evidence":"..."}]}'
        )
        messages = [{"role": "user", "content": "Known context:\n" + user_analysis_context(user_id)}]
        messages.extend(conversation_for_model(user_id))
    parsed = complete_live_chat(system, messages)
    reply = str(parsed.get("reply") or "").strip()
    if not reply:
        raise RuntimeError("Live model returned an empty reply")
    return {
        "reply": reply[:2000],
        "looking_for": str(parsed.get("looking_for") or "").strip()[:300],
        "signals": [] if about_payload else normalize_live_signals(parsed.get("signals")),
    }


@app.get("/guide/messages")
@app.get("/ai/messages")
def list_ai_messages(user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    ensure_ai_thread(user["id"])
    rows = query("SELECT * FROM ai_messages WHERE user_id=? ORDER BY id ASC LIMIT 120", (user["id"],))
    return {"items": [hydrate_ai_message(row, user["id"]) for row in rows], "ai": public_ai_status()}


@app.post("/guide/chat")
@app.post("/ai/chat")
def ai_chat(body: AiChatIn, user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    ensure_ai_thread(user["id"])
    about_id = body.about_recommendation_id
    rec_ids: list[int] = []
    about_payload: Optional[dict[str, Any]] = None
    if about_id:
        rec = one(
            "SELECT * FROM recommendations WHERE id=? AND (source_user_id=? OR candidate_user_id=?)",
            (about_id, user["id"], user["id"]),
        )
        if not rec:
            rec = one(
                """SELECT * FROM recommendations
                WHERE source_user_id=? AND candidate_user_id=?
                ORDER BY created_at DESC""",
                (user["id"], about_id),
            )
        if rec:
            about_payload = recommendation_payload(rec, user["id"], full_context=True)

    user_row = save_ai_message(user["id"], "user", body.content.strip(), about_recommendation_id=about_id)
    live_result: Optional[dict[str, Any]] = None
    used = "local-dev-rule-analyzer"
    if ai_runtime()["live"]:
        try:
            live_result = ask_live_noa(user["id"], about_payload)
            used = "openai-compatible"
        except RuntimeError:
            live_result = None
            used = "local-fallback"

    analysis: list[dict[str, str]] = []
    if about_payload:
        assistant_text = live_result["reply"] if live_result else compose_life_index_intro(about_payload)
        if used == "local-fallback":
            assistant_text = f"{assistant_text}\n\nThe live model didn't answer, so this turn used the local rules."
        rec_ids = [int(about_payload["id"])]
    else:
        if live_result:
            analysis = live_result["signals"]
            save_live_analysis(user["id"], analysis)
        execute("UPDATE connection_intents SET status='paused' WHERE user_id=? AND status='active'", (user["id"],))
        topics = keywords(body.content)
        if live_result:
            topics = keywords(body.content + " " + live_result["looking_for"]) + [signal["label"] for signal in analysis]
        memory_topics = recent_ai_topics(user["id"])
        blended = canonical_match_tags(topics + memory_topics)[:12]
        looking_for = live_result["looking_for"] if live_result and live_result["looking_for"] else ""
        summary = looking_for or f"Looking for people into {topic_phrase(blended)}"
        now = datetime.now(timezone.utc)
        execute(
            """INSERT INTO connection_intents(user_id,raw_text,structured_summary,target_topics,target_context,local_or_online,max_introductions_per_week,active_from,expires_at,status,embedding,created_at,updated_at)
            VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (
                user["id"],
                body.content.strip(),
                summary,
                encode_json(blended),
                body.content.strip(),
                "both",
                3,
                now.isoformat(),
                (now + timedelta(days=14)).isoformat(),
                "active",
                encode_json(blended),
                now_iso(),
                now_iso(),
            ),
        )
        generated = generate_recommendations(user)
        items = generated.get("items") or []
        rec_ids = [int(item["id"]) for item in items[:5]]
        if live_result:
            assistant_text = live_result["reply"]
            if not items and generated.get("empty_message"):
                assistant_text = f"{assistant_text}\n\n{generated['empty_message']}"
        else:
            assistant_text = compose_match_reply(
                body.content,
                items,
                generated.get("empty_message"),
                str(user.get("username") or ""),
            )
        if used == "local-fallback":
            assistant_text = f"{assistant_text}\n\nThe live model didn't answer, so this turn used the local rules."

    assistant_row = save_ai_message(
        user["id"],
        "assistant",
        assistant_text,
        recommendation_ids=rec_ids,
        about_recommendation_id=about_id,
    )
    return {
        "user_message": hydrate_ai_message(user_row, user["id"]),
        "assistant_message": hydrate_ai_message(assistant_row, user["id"]),
        "ai": public_ai_status(used),
        "analysis": analysis,
    }


def is_socialpersona_seed(user_id: int) -> bool:
    user = one("SELECT username, role, is_test_account FROM users WHERE id=?", (user_id,))
    if not user or user["role"] == "admin":
        return False
    return bool(user["is_test_account"] and is_socialpersona_username(str(user["username"])))


def waiting_user_ids(user_id: int) -> set[int]:
    linked = linked_user_ids(user_id)
    rows = query(
        """SELECT r.source_user_id, r.candidate_user_id
        FROM recommendation_decisions d
        JOIN recommendations r ON r.id=d.recommendation_id
        WHERE d.user_id=? AND d.decision='interested'""",
        (user_id,),
    )
    waiting: set[int] = set()
    for row in rows:
        other = row["candidate_user_id"] if row["source_user_id"] == user_id else row["source_user_id"]
        other_id = int(other)
        if other_id != user_id and other_id not in linked:
            waiting.add(other_id)
    return waiting


def linked_user_ids(user_id: int) -> set[int]:
    rows = query(
        """SELECT user_a_id, user_b_id FROM connections
        WHERE status!='closed' AND (user_a_id=? OR user_b_id=?)""",
        (user_id, user_id),
    )
    linked: set[int] = set()
    for row in rows:
        other = row["user_b_id"] if row["user_a_id"] == user_id else row["user_a_id"]
        if other != user_id:
            linked.add(int(other))
    return linked


def find_pair_connection(user_a: int, user_b: int) -> Optional[dict[str, Any]]:
    rows = query(
        """SELECT * FROM connections
        WHERE status!='closed' AND (
            (user_a_id=? AND user_b_id=?) OR (user_a_id=? AND user_b_id=?)
        )""",
        (user_a, user_b, user_b, user_a),
    )
    if not rows:
        return None

    def rank(row: dict[str, Any]) -> tuple[int, int, int]:
        last = one("SELECT id FROM messages WHERE connection_id=? ORDER BY id DESC LIMIT 1", (row["id"],))
        status_rank = 0 if row["status"] == "active" else 1 if row["status"] == "privacy_pending" else 2
        return (status_rank, -(int(last["id"]) if last else 0), -int(row["id"]))

    return min(rows, key=rank)


def create_connection_if_mutual(rec: dict[str, Any]) -> Optional[dict[str, Any]]:
    a = one("SELECT * FROM recommendation_decisions WHERE recommendation_id=? AND user_id=? AND decision='interested'", (rec["id"], rec["source_user_id"]))
    b = one("SELECT * FROM recommendation_decisions WHERE recommendation_id=? AND user_id=? AND decision='interested'", (rec["id"], rec["candidate_user_id"]))
    if not a or not b:
        return None
    existing = find_pair_connection(int(rec["source_user_id"]), int(rec["candidate_user_id"]))
    if existing:
        execute("UPDATE recommendations SET status='mutual_interest' WHERE id=?", (rec["id"],))
        open_active_connection(int(existing["id"]))
        return one("SELECT * FROM connections WHERE id=?", (existing["id"],))
    cur = execute("INSERT INTO connections(user_a_id,user_b_id,recommendation_id,status,created_at) VALUES(?,?,?,?,?)", (rec["source_user_id"], rec["candidate_user_id"], rec["id"], "privacy_pending", now_iso()))
    conn_id = cur.lastrowid
    if is_socialpersona_seed(rec["source_user_id"]):
        execute("UPDATE connections SET privacy_a_confirmed=1, privacy_a=? WHERE id=?", (encode_json(["Name", "City", "Current intent", "Confirmed signals"]), conn_id))
    if is_socialpersona_seed(rec["candidate_user_id"]):
        execute("UPDATE connections SET privacy_b_confirmed=1, privacy_b=? WHERE id=?", (encode_json(["Name", "City", "Current intent", "Confirmed signals"]), conn_id))
    execute("UPDATE recommendations SET status='mutual_interest' WHERE id=?", (rec["id"],))
    open_active_connection(int(conn_id))
    return one("SELECT * FROM connections WHERE id=?", (conn_id,))


def open_active_connection(conn_id: int) -> None:
    raw = one("SELECT * FROM connections WHERE id=?", (conn_id,))
    if not raw or not raw["privacy_a_confirmed"] or not raw["privacy_b_confirmed"]:
        return
    if raw["status"] != "active":
        execute("UPDATE connections SET status='active' WHERE id=?", (conn_id,))
        raw = one("SELECT * FROM connections WHERE id=?", (conn_id,))
    if raw and not one("SELECT id FROM messages WHERE connection_id=? AND sender_type='system'", (conn_id,)):
        execute(
            "INSERT INTO messages(connection_id,sender_type,sender_user_id,content,created_at,status) VALUES(?,?,?,?,?,?)",
            (conn_id, "system", None, introduction_for(raw), now_iso(), "sent"),
        )


@app.post("/recommendations/{rec_id}/decision")
def decide_recommendation(rec_id: int, body: DecisionIn, user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    rec = get_recommendation(rec_id, user)
    if body.decision == "blocked":
        execute("INSERT OR IGNORE INTO blocks(blocker_user_id,blocked_user_id,created_at) VALUES(?,?,?)", (user["id"], rec["candidate_user_id"], now_iso()))
    execute("INSERT INTO recommendation_decisions(recommendation_id,user_id,decision,reason,created_at) VALUES(?,?,?,?,?)", (rec_id, user["id"], body.decision, body.reason, now_iso()))
    connection = create_connection_if_mutual(one("SELECT * FROM recommendations WHERE id=?", (rec_id,)) or rec)
    return {"recommendation": get_recommendation(rec_id, user), "connection": connection}


@app.post("/recommendations/{rec_id}/agree")
def agree_recommendation(rec_id: int, user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    rec = one("SELECT * FROM recommendations WHERE id=? AND (source_user_id=? OR candidate_user_id=?)", (rec_id, user["id"], user["id"]))
    if not rec:
        raise HTTPException(404, "Recommendation not found")
    if not one("SELECT id FROM recommendation_decisions WHERE recommendation_id=? AND user_id=? AND decision='interested'", (rec_id, user["id"])):
        execute(
            "INSERT INTO recommendation_decisions(recommendation_id,user_id,decision,reason,created_at) VALUES(?,?,?,?,?)",
            (rec_id, user["id"], "interested", "Agreed to connect.", now_iso()),
        )
    other_id = rec["candidate_user_id"] if user["id"] == rec["source_user_id"] else rec["source_user_id"]
    if is_socialpersona_seed(other_id) and not one("SELECT id FROM recommendation_decisions WHERE recommendation_id=? AND user_id=? AND decision='interested'", (rec_id, other_id)):
        execute(
            "INSERT INTO recommendation_decisions(recommendation_id,user_id,decision,reason,created_at) VALUES(?,?,?,?,?)",
            (rec_id, other_id, "interested", "Agreed from the waiting list.", now_iso()),
        )
    connection = create_connection_if_mutual(one("SELECT * FROM recommendations WHERE id=?", (rec_id,)) or rec)
    return {"recommendation": get_recommendation(rec_id, user), "connection": connection}


@app.get("/connections")
def list_connections(user: dict[str, Any] = Depends(current_user)) -> list[dict[str, Any]]:
    rows = query(
        "SELECT * FROM connections WHERE (user_a_id=? OR user_b_id=?) AND status!='closed' ORDER BY created_at DESC",
        (user["id"], user["id"]),
    )
    chosen: dict[int, dict[str, Any]] = {}
    for row in rows:
        other_id = int(row["user_b_id"] if row["user_a_id"] == user["id"] else row["user_a_id"])
        current = chosen.get(other_id)
        if current is None:
            chosen[other_id] = row
            continue
        chosen[other_id] = find_pair_connection(int(user["id"]), other_id) or current
    ordered = sorted(chosen.values(), key=lambda row: str(row.get("created_at") or ""), reverse=True)
    return [connection_payload(r, user["id"]) for r in ordered]


@app.get("/connections/{connection_id}")
def get_connection(connection_id: int, user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    row = one("SELECT * FROM connections WHERE id=? AND (user_a_id=? OR user_b_id=?)", (connection_id, user["id"], user["id"]))
    if not row:
        raise HTTPException(404, "Connection not found")
    return connection_payload(row, user["id"])


def connection_payload(row: dict[str, Any], viewer_id: int) -> dict[str, Any]:
    other_id = row["user_b_id"] if row["user_a_id"] == viewer_id else row["user_a_id"]
    intro = one(
        "SELECT content FROM messages WHERE connection_id=? AND sender_type='system' ORDER BY created_at ASC LIMIT 1",
        (row["id"],),
    )
    last = one(
        "SELECT content, sender_type FROM messages WHERE connection_id=? ORDER BY created_at DESC LIMIT 1",
        (row["id"],),
    )
    return {
        **row,
        "other_user": public_user(one("SELECT * FROM users WHERE id=?", (other_id,))),
        "introduction_message": str(intro["content"]) if intro else "",
        "last_message_preview": str(last["content"]) if last else "",
    }


def introduction_for(connection: dict[str, Any]) -> str:
    a = public_user(one("SELECT * FROM users WHERE id=?", (connection["user_a_id"],)))
    b = public_user(one("SELECT * FROM users WHERE id=?", (connection["user_b_id"],)))
    rec = one("SELECT * FROM recommendations WHERE id=?", (connection["recommendation_id"],)) if connection.get("recommendation_id") else None
    if not rec:
        return "The signal is mutual. Start with one light question and let the conversation grow."
    return f"The signal is mutual.\n\n{display_name_for_intro(a)}: {rec['reason_for_candidate']}\n\n{display_name_for_intro(b)}: {rec['reason_for_source']}\n\nNo need to trade whole life stories right away. Start with one light question and let the conversation grow."


def display_name_for_intro(user: dict[str, Any]) -> str:
    username = str(user.get("username") or "")
    suffix = socialpersona_anon_suffix(username)
    if suffix:
        return socialpersona_public_username(suffix)
    profile = user.get("profile") or {}
    display = str(profile.get("display_name") or "").strip()
    if display and not any("\u3400" <= ch <= "\u9fff" for ch in display):
        return display
    return username or "User"


@app.post("/connections/{connection_id}/privacy-confirmation")
def confirm_privacy(connection_id: int, body: PrivacyIn, user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    conn = get_connection(connection_id, user)
    raw = one("SELECT * FROM connections WHERE id=?", (connection_id,))
    if raw["user_a_id"] == user["id"]:
        execute("UPDATE connections SET privacy_a_confirmed=1, privacy_a=? WHERE id=?", (encode_json(body.allowed_fields), connection_id))
    else:
        execute("UPDATE connections SET privacy_b_confirmed=1, privacy_b=? WHERE id=?", (encode_json(body.allowed_fields), connection_id))
    raw = one("SELECT * FROM connections WHERE id=?", (connection_id,))
    if raw["privacy_a_confirmed"] and raw["privacy_b_confirmed"]:
        open_active_connection(connection_id)
    return get_connection(connection_id, user)


@app.post("/connections/{connection_id}/close")
def close_connection(connection_id: int, user: dict[str, Any] = Depends(current_user)) -> dict[str, str]:
    get_connection(connection_id, user)
    raw = one("SELECT * FROM connections WHERE id=?", (connection_id,))
    execute("UPDATE connections SET status='closed', closed_at=? WHERE id=?", (now_iso(), connection_id))
    if raw:
        release_pair_after_close(int(raw["user_a_id"]), int(raw["user_b_id"]))
    return {"message": "Connection closed"}


def release_pair_after_close(user_a: int, user_b: int) -> None:
    recs = query(
        """SELECT id FROM recommendations
        WHERE (source_user_id=? AND candidate_user_id=?) OR (source_user_id=? AND candidate_user_id=?)""",
        (user_a, user_b, user_b, user_a),
    )
    for rec in recs:
        execute(
            "DELETE FROM recommendation_decisions WHERE recommendation_id=? AND decision='interested' AND user_id IN (?, ?)",
            (rec["id"], user_a, user_b),
        )
        execute("UPDATE recommendations SET status='new' WHERE id=? AND status='mutual_interest'", (rec["id"],))


@app.get("/connections/{connection_id}/messages")
def list_messages(connection_id: int, user: dict[str, Any] = Depends(current_user)) -> list[dict[str, Any]]:
    get_connection(connection_id, user)
    return query("SELECT * FROM messages WHERE connection_id=? ORDER BY created_at ASC", (connection_id,))


@app.post("/connections/{connection_id}/messages")
def send_message(connection_id: int, body: MessageIn, user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    conn = get_connection(connection_id, user)
    if conn["status"] != "active":
        raise HTTPException(400, "Both sides must confirm visibility before chatting")
    cur = execute("INSERT INTO messages(connection_id,sender_type,sender_user_id,content,created_at,status) VALUES(?,?,?,?,?,?)", (connection_id, "user", user["id"], body.content, now_iso(), "sent"))
    return one("SELECT * FROM messages WHERE id=?", (cur.lastrowid,))


@app.post("/connections/{connection_id}/feedback")
def submit_feedback(connection_id: int, body: FeedbackIn, user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    get_connection(connection_id, user)
    cur = execute("INSERT INTO connection_feedback(connection_id,user_id,outcome,accurate_factors,improvement_factors,comment,created_at) VALUES(?,?,?,?,?,?,?)", (connection_id, user["id"], body.outcome, encode_json(body.accurate_factors), encode_json(body.improvement_factors), body.comment, now_iso()))
    return one("SELECT * FROM connection_feedback WHERE id=?", (cur.lastrowid,))


@app.get("/connections/{connection_id}/feedback-status")
def feedback_status(connection_id: int, user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    get_connection(connection_id, user)
    return {"submitted": bool(one("SELECT id FROM connection_feedback WHERE connection_id=? AND user_id=?", (connection_id, user["id"])))}


@app.post("/users/{user_id}/block")
def block_user(user_id: int, user: dict[str, Any] = Depends(current_user)) -> dict[str, str]:
    execute("INSERT OR IGNORE INTO blocks(blocker_user_id,blocked_user_id,created_at) VALUES(?,?,?)", (user["id"], user_id, now_iso()))
    return {"message": "Blocked"}


@app.delete("/users/{user_id}/block")
def unblock_user(user_id: int, user: dict[str, Any] = Depends(current_user)) -> dict[str, str]:
    execute("DELETE FROM blocks WHERE blocker_user_id=? AND blocked_user_id=?", (user["id"], user_id))
    return {"message": "Unblocked"}


@app.post("/users/{user_id}/report")
def report_user(user_id: int, body: ReportIn, user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    cur = execute("INSERT INTO reports(reporter_user_id,reported_user_id,category,description,status,created_at) VALUES(?,?,?,?,?,?)", (user["id"], user_id, body.category, body.description, "open", now_iso()))
    return one("SELECT * FROM reports WHERE id=?", (cur.lastrowid,))


@app.get("/admin/metrics")
def admin_metrics(_: dict[str, Any] = Depends(admin_user)) -> dict[str, Any]:
    total_users = one("SELECT COUNT(*) c FROM users")["c"]
    profiled = one("SELECT COUNT(*) c FROM user_profiles WHERE onboarding_completed=1")["c"]
    intents = one("SELECT COUNT(*) c FROM connection_intents WHERE status='active'")["c"]
    recs = one("SELECT COUNT(*) c FROM recommendations")["c"]
    interests = one("SELECT COUNT(*) c FROM recommendation_decisions WHERE decision='interested'")["c"]
    conns = one("SELECT COUNT(*) c FROM connections")["c"]
    msg_conns = one("SELECT COUNT(DISTINCT connection_id) c FROM messages WHERE sender_type='user'")["c"]
    reports = one("SELECT COUNT(*) c FROM reports WHERE status='open'")["c"]
    return {
        "registered users": total_users,
        "profiled users": profiled,
        "active intents": intents,
        "recommendations": recs,
        "one-way interests": interests,
        "mutual connections": conns,
        "connections with messages": msg_conns,
        "effective intro rate": round(msg_conns / conns, 2) if conns else 0,
        "open reports": reports,
    }


@app.get("/admin/users")
def admin_users(_: dict[str, Any] = Depends(admin_user)) -> list[dict[str, Any]]:
    return query("SELECT id,email,username,role,status,is_test_account,created_at,last_login_at FROM users ORDER BY created_at DESC")


@app.patch("/admin/users/{user_id}/status")
def admin_user_status(user_id: int, status: str = Form(...), admin: dict[str, Any] = Depends(admin_user)) -> dict[str, Any]:
    execute("UPDATE users SET status=?, updated_at=? WHERE id=?", (status, now_iso(), user_id))
    audit("admin", admin["id"], "update_user_status", "user", user_id, {"status": status})
    return one("SELECT id,email,username,role,status FROM users WHERE id=?", (user_id,))


@app.get("/admin/reports")
def admin_reports(_: dict[str, Any] = Depends(admin_user)) -> list[dict[str, Any]]:
    return query("SELECT * FROM reports ORDER BY created_at DESC")


@app.patch("/admin/reports/{report_id}")
def admin_report_update(report_id: int, status: str = Form(...), note: str = Form(""), admin: dict[str, Any] = Depends(admin_user)) -> dict[str, Any]:
    execute("UPDATE reports SET status=?, admin_note=?, resolved_at=? WHERE id=?", (status, note, now_iso(), report_id))
    audit("admin", admin["id"], "resolve_report", "report", report_id, {"status": status})
    return one("SELECT * FROM reports WHERE id=?", (report_id,))


@app.get("/admin/recommendations")
def admin_recommendations(_: dict[str, Any] = Depends(admin_user)) -> list[dict[str, Any]]:
    return query("SELECT * FROM recommendations ORDER BY created_at DESC LIMIT 100")


@app.get("/admin/ai-jobs")
def admin_ai_jobs(_: dict[str, Any] = Depends(admin_user)) -> list[dict[str, Any]]:
    runtime = ai_runtime()
    return [{"provider": runtime["provider"], "status": runtime["status"], "model": runtime["model"], "failed_reason": runtime["failed_reason"]}]


def delete_user_fully(user_id: int) -> None:
    for row in query("SELECT id FROM recommendations WHERE source_user_id=? OR candidate_user_id=?", (user_id, user_id)):
        execute("DELETE FROM recommendation_decisions WHERE recommendation_id=?", (row["id"],))
    execute("DELETE FROM recommendations WHERE source_user_id=? OR candidate_user_id=?", (user_id, user_id))
    for row in query("SELECT id FROM connections WHERE user_a_id=? OR user_b_id=?", (user_id, user_id)):
        execute("DELETE FROM messages WHERE connection_id=?", (row["id"],))
        execute("DELETE FROM connection_feedback WHERE connection_id=?", (row["id"],))
    execute("DELETE FROM connections WHERE user_a_id=? OR user_b_id=?", (user_id, user_id))
    execute("DELETE FROM blocks WHERE blocker_user_id=? OR blocked_user_id=?", (user_id, user_id))
    execute("DELETE FROM reports WHERE reporter_user_id=? OR reported_user_id=?", (user_id, user_id))
    execute("DELETE FROM notifications WHERE user_id=?", (user_id,))
    execute("DELETE FROM users WHERE id=?", (user_id,))


def purge_weave_local_placeholder_users() -> None:
    rows = query("SELECT id FROM users WHERE email LIKE '%@weave.local'")
    for row in rows:
        delete_user_fully(row["id"])


def seed_admin_user0() -> None:
    email = socialpersona_email("user0")
    username = "user0"
    ts = now_iso()
    password = hash_password(os.getenv("DEV_ADMIN_PASSWORD", "weave12345"))
    existing = one("SELECT id FROM users WHERE email=? OR username=?", (email, username))
    if existing:
        uid = existing["id"]
        execute(
            "UPDATE users SET email=?, username=?, password_hash=?, role=?, status=?, is_test_account=0, updated_at=? WHERE id=?",
            (email, username, password, "admin", "active", ts, uid),
        )
    else:
        cur = execute(
            "INSERT INTO users(email,password_hash,username,role,status,is_test_account,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)",
            (email, password, username, "admin", "active", 0, ts, ts),
        )
        uid = cur.lastrowid
    profile = one("SELECT user_id FROM user_profiles WHERE user_id=?", (uid,))
    if profile:
        execute(
            "UPDATE user_profiles SET display_name=?, city=?, bio=?, onboarding_completed=1, updated_at=? WHERE user_id=?",
            ("user0", "Online", "Weave development admin.", ts, uid),
        )
    else:
        execute(
            "INSERT INTO user_profiles(user_id,display_name,avatar_url,city,bio,age_confirmed,accepts_local,accepts_online,onboarding_completed,open_until,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
            (uid, "user0", "", "Online", "Weave development admin.", 1, 1, 1, 1, (datetime.now(timezone.utc) + timedelta(days=365)).isoformat(), ts, ts),
        )


def seed_user(email: str, username: str, display: str, bio: str, posts: list[str], intent: str, role: str = "user") -> None:
    if one("SELECT id FROM users WHERE email=?", (email,)):
        return
    ts = now_iso()
    cur = execute("INSERT INTO users(email,password_hash,username,role,status,is_test_account,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)", (email, hash_password("weave12345"), username, role, "active", 1, ts, ts))
    uid = cur.lastrowid
    execute("INSERT INTO user_profiles(user_id,display_name,avatar_url,city,bio,age_confirmed,accepts_local,accepts_online,onboarding_completed,open_until,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)", (uid, display, "", "Shanghai", bio, 1, 1, 1, 1, (datetime.now(timezone.utc) + timedelta(days=14)).isoformat(), ts, ts))
    for p in posts:
        execute("INSERT INTO social_posts(user_id,text,posted_at,city,is_used_for_profile,visibility,status,created_at) VALUES(?,?,?,?,?,?,?,?)", (uid, p, ts, "Shanghai", 1, "public_tags", "active", ts))
    for s in local_analyze(query("SELECT * FROM social_posts WHERE user_id=?", (uid,))):
        execute("INSERT INTO profile_signals(user_id,signal_type,label,normalized_label,confidence,confirmation_status,source_type,source_post_ids,evidence_summary,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)", (uid, s["signal_type"], s["label"], s["normalized_label"], s["confidence"], "confirmed", s["source_type"], encode_json(s["source_post_ids"]), s["evidence_summary"], ts, ts))
    topics = keywords(intent)
    execute("INSERT INTO connection_intents(user_id,raw_text,structured_summary,target_topics,target_context,local_or_online,max_introductions_per_week,active_from,expires_at,status,embedding,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)", (uid, intent, f"Looking for people into {topic_phrase(topics)}", encode_json(topics), intent, "both", 3, ts, (datetime.now(timezone.utc) + timedelta(days=14)).isoformat(), "active", encode_json(topics), ts, ts))


def interest_entries(domain: dict[str, Any]) -> list[tuple[str, str]]:
    entries: list[tuple[str, str]] = []
    for bucket, signal_type in (("long_term_interests", "stable_interest"), ("short_term_interests", "recent_topic")):
        for item in domain.get(bucket, []):
            label = str(item.get("label", "")).strip()
            if label:
                entries.append((signal_type, label))
    for item in domain.get("negative_interests", []):
        label = str(item.get("label", "")).strip()
        if label:
            entries.append(("negative_interest", label))
    return entries


def socialpersona_intent(labels: list[str]) -> str:
    if not labels:
        return "Looking for someone who notices the little things and can start from there."
    top = topic_phrase(labels, 4)
    return f"Looking for someone who notices {top}. No rush — start with one little thing."


def load_socialpersona_posts(posts_path: Path, max_posts: int) -> list[dict[str, Any]]:
    posts: list[dict[str, Any]] = []
    with posts_path.open(encoding="utf-8") as f:
        for line in f:
            if max_posts > 0 and len(posts) >= max_posts:
                break
            try:
                post = json.loads(line)
            except json.JSONDecodeError:
                continue
            text = str(post.get("text") or "").strip()
            media = post.get("media") or []
            if text or media:
                posts.append(post)
    return posts


def rebuild_socialpersona_content(
    uid: int,
    user_dir: Path,
    profile: dict[str, Any],
    labeled_entries: list[tuple[str, str, str]],
    labels: list[str],
    posts: list[dict[str, Any]],
    ts: str,
) -> None:
    execute("DELETE FROM social_posts WHERE user_id=?", (uid,))
    execute("DELETE FROM profile_signals WHERE user_id=?", (uid,))
    execute("DELETE FROM connection_intents WHERE user_id=?", (uid,))

    inserted_post_ids: list[int] = []
    for post in posts:
        text = str(post.get("text") or "").strip()
        post_cur = execute(
            "INSERT INTO social_posts(user_id,text,original_url,posted_at,city,is_used_for_profile,visibility,status,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
            (uid, text[:1600], str(post.get("post_id") or ""), str(post.get("created_at") or ts), "Online", 1, "public_tags", "active", ts),
        )
        inserted_post_ids.append(post_cur.lastrowid)

    source_ids = encode_json(inserted_post_ids)
    for domain, signal_type, label in labeled_entries:
        normalized = label.strip().lower()
        execute(
            """INSERT INTO profile_signals(user_id,signal_type,label,normalized_label,confidence,confirmation_status,source_type,source_post_ids,evidence_summary,created_at,updated_at)
            VALUES(?,?,?,?,?,?,?,?,?,?,?)""",
            (
                uid,
                signal_type,
                label,
                normalized,
                0.9 if signal_type != "negative_interest" else 0.75,
                "confirmed",
                "socialpersona_gold_profile",
                source_ids,
                f"From SocialPersona {user_dir.name} gold profile, domain: {domain}.",
                ts,
                ts,
            ),
        )

    topics = list(dict.fromkeys(k for label in labels[:12] for k in topic_variants(label)))
    intent = socialpersona_intent(labels)
    execute(
        "INSERT INTO connection_intents(user_id,raw_text,structured_summary,target_topics,target_context,local_or_online,max_introductions_per_week,active_from,expires_at,status,embedding,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
        (uid, intent, f"Looking for people into {topic_phrase(labels)}", encode_json(topics), intent, "online", 3, ts, (datetime.now(timezone.utc) + timedelta(days=30)).isoformat(), "active", encode_json(topics), ts, ts),
    )


def seed_socialpersona_users() -> None:
    if os.getenv("SEED_SOCIALPERSONA", "1") != "1" or not SOCIALPERSONA_USERS_DIR.exists():
        return
    limit = int(os.getenv("SOCIALPERSONA_SEED_LIMIT", "100"))
    max_posts = int(os.getenv("SOCIALPERSONA_POSTS_PER_USER", "0"))
    ts = now_iso()
    imported = 0

    for user_dir in sorted(SOCIALPERSONA_USERS_DIR.iterdir()):
        if imported >= limit:
            break
        if not user_dir.is_dir() or not user_dir.name.startswith("anon_"):
            continue

        anon_suffix = user_dir.name.removeprefix("anon_")
        pool_number = socialpersona_pool_number(anon_suffix)
        if pool_number < 1 or pool_number > 100:
            continue
        public_name = socialpersona_public_username(anon_suffix)
        username = public_name
        email = socialpersona_email(public_name)
        avatar_url = ensure_persona_avatar(pool_number)
        legacy_email = f"persona_{anon_suffix}@socialpersona.local"
        profile_path = user_dir / "gold_profile.json"
        posts_path = user_dir / "posts.jsonl"
        if not profile_path.exists() or not posts_path.exists():
            continue

        try:
            profile = json.loads(profile_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            continue

        active_domains = [d for d in profile.get("domains", []) if d.get("status") == "active"]
        labeled_entries: list[tuple[str, str, str]] = []
        for domain in active_domains:
            for signal_type, label in interest_entries(domain):
                labeled_entries.append((str(domain.get("domain", "interest")), signal_type, label))
        if not labeled_entries:
            continue

        labels = list(dict.fromkeys(label for _, signal_type, label in labeled_entries if signal_type != "negative_interest"))
        posts = load_socialpersona_posts(posts_path, max_posts)
        display = public_name
        bio = ""
        persona_password = hash_password(public_name)
        existing = one("SELECT id FROM users WHERE email IN (?, ?)", (email, legacy_email))
        if existing:
            uid = existing["id"]
            execute(
                "UPDATE users SET email=?, username=?, password_hash=?, updated_at=? WHERE id=?",
                (email, username, persona_password, ts, uid),
            )
            execute(
                "UPDATE user_profiles SET display_name=?, avatar_url=?, city=?, bio=?, accepts_local=0, onboarding_completed=1, open_until=?, updated_at=? WHERE user_id=?",
                (display, avatar_url, "Online", bio, (datetime.now(timezone.utc) + timedelta(days=30)).isoformat(), ts, uid),
            )
        else:
            cur = execute(
                "INSERT INTO users(email,password_hash,username,role,status,is_test_account,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)",
                (email, persona_password, username, "user", "active", 1, ts, ts),
            )
            uid = cur.lastrowid
            execute(
                "INSERT INTO user_profiles(user_id,display_name,avatar_url,city,bio,age_confirmed,accepts_local,accepts_online,onboarding_completed,open_until,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
                (uid, display, avatar_url, "Online", bio, 1, 0, 1, 1, (datetime.now(timezone.utc) + timedelta(days=30)).isoformat(), ts, ts),
            )

        current_posts = one("SELECT COUNT(*) c FROM social_posts WHERE user_id=?", (uid,))["c"]
        current_signals = one("SELECT COUNT(*) c FROM profile_signals WHERE user_id=? AND source_type='socialpersona_gold_profile'", (uid,))["c"]
        if current_posts != len(posts) or current_signals != len(labeled_entries):
            rebuild_socialpersona_content(uid, user_dir, profile, labeled_entries, labels, posts, ts)
        imported += 1


def seed_fixed_demo_connection() -> None:
    if os.getenv("SEED_DEMO_CONNECTION", "1") != "1":
        return
    source_name = os.getenv("DEV_DEMO_SOURCE_USER", "user1")
    for peer_name in ("user2", "user88"):
        seed_pair_connection(source_name, peer_name)


def seed_pair_connection(source_name: str, peer_name: str) -> None:
    source = one("SELECT id FROM users WHERE username=?", (source_name,))
    peer = one("SELECT id FROM users WHERE username=?", (peer_name,))
    if not source or not peer:
        return
    source_id = int(source["id"])
    peer_id = int(peer["id"])
    source_intent = one("SELECT * FROM connection_intents WHERE user_id=? AND status='active' ORDER BY created_at DESC", (source_id,))
    peer_intent = one("SELECT * FROM connection_intents WHERE user_id=? AND status='active' ORDER BY created_at DESC", (peer_id,))
    if not source_intent or not peer_intent:
        return

    ts = now_iso()
    privacy = encode_json(["Name", "City", "Current intent", "Confirmed signals"])
    overlap = set(user_tags(source_id)) & set(user_tags(peer_id))
    if not overlap:
        overlap = {"conversation"}
    shared = sort_match_tags(overlap)
    reason_tags = topic_phrase(shared, 3)
    evidence = encode_json(
        {
            "shared_tags": shared,
            "source_intent": source_intent["raw_text"],
            "candidate_intent": peer_intent["raw_text"],
        }
    )
    reason_source = f"You both left traces around {reason_tags}. It is not a conclusion, just enough for a natural opening."
    reason_candidate = f"{reason_tags} is why this signal lit up. The other person is also looking for someone who can hold these textures."

    rec = one(
        "SELECT * FROM recommendations WHERE source_user_id=? AND candidate_user_id=? AND source_intent_id=?",
        (source_id, peer_id, source_intent["id"]),
    )
    if not rec:
        cur = execute(
            """INSERT INTO recommendations(source_user_id,candidate_user_id,source_intent_id,directional_score_source_to_candidate,directional_score_candidate_to_source,reciprocal_score,reason_for_source,reason_for_candidate,why_now,mismatch_note,evidence_json,status,created_at,expires_at)
            VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (
                source_id,
                peer_id,
                source_intent["id"],
                0.82,
                0.8,
                0.81,
                reason_source,
                reason_candidate,
                "Dev demo: fixed mutual connection for chat testing.",
                "",
                evidence,
                "new",
                ts,
                (datetime.now(timezone.utc) + timedelta(days=30)).isoformat(),
            ),
        )
        rec = one("SELECT * FROM recommendations WHERE id=?", (cur.lastrowid,))
    else:
        execute(
            """UPDATE recommendations SET reason_for_source=?, reason_for_candidate=?, evidence_json=?, status='mutual_interest'
            WHERE id=?""",
            (reason_source, reason_candidate, evidence, rec["id"]),
        )

    rec_id = int(rec["id"])
    for uid in (source_id, peer_id):
        if not one("SELECT id FROM recommendation_decisions WHERE recommendation_id=? AND user_id=?", (rec_id, uid)):
            execute(
                "INSERT INTO recommendation_decisions(recommendation_id,user_id,decision,reason,created_at) VALUES(?,?,?,?,?)",
                (rec_id, uid, "interested", "Dev demo connection seed.", ts),
            )

    existing_conn = one(
        "SELECT * FROM connections WHERE (user_a_id=? AND user_b_id=?) OR (user_a_id=? AND user_b_id=?)",
        (source_id, peer_id, peer_id, source_id),
    )
    if existing_conn:
        conn_id = int(existing_conn["id"])
        execute(
            "UPDATE connections SET status='active', privacy_a_confirmed=1, privacy_b_confirmed=1, privacy_a=?, privacy_b=?, recommendation_id=? WHERE id=?",
            (privacy, privacy, rec_id, conn_id),
        )
    else:
        cur = execute(
            """INSERT INTO connections(user_a_id,user_b_id,recommendation_id,status,privacy_a_confirmed,privacy_b_confirmed,privacy_a,privacy_b,created_at)
            VALUES(?,?,?,?,?,?,?,?,?)""",
            (source_id, peer_id, rec_id, "active", 1, 1, privacy, privacy, ts),
        )
        conn_id = int(cur.lastrowid)

    if not one("SELECT id FROM messages WHERE connection_id=? AND sender_type='system'", (conn_id,)):
        raw = one("SELECT * FROM connections WHERE id=?", (conn_id,))
        execute(
            "INSERT INTO messages(connection_id,sender_type,sender_user_id,content,created_at,status) VALUES(?,?,?,?,?,?)",
            (conn_id, "system", None, introduction_for(raw), ts, "sent"),
        )
    if not one("SELECT id FROM messages WHERE connection_id=? AND sender_user_id=?", (conn_id, peer_id)):
        execute(
            "INSERT INTO messages(connection_id,sender_type,sender_user_id,content,created_at,status) VALUES(?,?,?,?,?,?)",
            (conn_id, "user", peer_id, "Hi — weave matched us. What small thing have you been noticing lately?", ts, "sent"),
        )


USER88_DEMO_THREAD = (
    ("user1", "Your latest posts have a mood. Want to start with one little thing?"),
    ("user88", "The TV shows, maybe. I keep coming back to them."),
    ("user1", "Lately it looks like Elmo and a movie marathon."),
    ("user88", "Sesame Street counts. We can leave the heavy dramas."),
    ("user1", "One episode, then. No recap required."),
)


def seed_user88_demo_thread() -> None:
    if os.getenv("SEED_DEMO_CONNECTION", "1") != "1":
        return
    people = {
        name: one("SELECT id FROM users WHERE username=?", (name,))
        for name, _ in USER88_DEMO_THREAD
    }
    user1 = people.get("user1")
    user88 = people.get("user88")
    if not user1 or not user88:
        return
    user1_id = int(user1["id"])
    user88_id = int(user88["id"])
    conn = one(
        "SELECT * FROM connections WHERE (user_a_id=? AND user_b_id=?) OR (user_a_id=? AND user_b_id=?)",
        (user1_id, user88_id, user88_id, user1_id),
    )
    if not conn:
        return
    conn_id = int(conn["id"])
    existing = query(
        "SELECT sender_user_id, content FROM messages WHERE connection_id=? AND sender_type='user' ORDER BY id",
        (conn_id,),
    )
    expected = [(int(people[name]["id"]), text) for name, text in USER88_DEMO_THREAD]
    if [(int(row["sender_user_id"]), row["content"]) for row in existing] == expected:
        return
    execute("DELETE FROM messages WHERE connection_id=? AND sender_type='user'", (conn_id,))
    start = datetime.now(timezone.utc) - timedelta(minutes=40)
    ids = {"user1": user1_id, "user88": user88_id}
    for index, (name, text) in enumerate(USER88_DEMO_THREAD):
        sent_at = (start + timedelta(minutes=index * 3)).isoformat()
        execute(
            "INSERT INTO messages(connection_id,sender_type,sender_user_id,content,created_at,status) VALUES(?,?,?,?,?,?)",
            (conn_id, "user", ids[name], text, sent_at, "sent"),
        )


def seed_demo_shortlist() -> None:
    if os.getenv("SEED_DEMO_CONNECTION", "1") != "1":
        return
    execute("DELETE FROM ai_messages WHERE content LIKE 'Example shortlist.%'")
    source = one("SELECT id FROM users WHERE username=?", ("user1",))
    if not source:
        return
    source_id = int(source["id"])
    source_intent = one("SELECT * FROM connection_intents WHERE user_id=? AND status='active' ORDER BY created_at DESC", (source_id,))
    if not source_intent:
        return
    source_tags = set(user_tags(source_id))
    linked = linked_user_ids(source_id)
    rows = query(
        """SELECT id, username FROM users
        WHERE is_test_account=1 AND role='user' AND username GLOB 'user[0-9]*' AND id!=?
        ORDER BY LENGTH(username), username""",
        (source_id,),
    )
    by_name = {str(row["username"]): row for row in rows}

    def usable(row: dict[str, Any]) -> Optional[tuple[dict[str, Any], list[str]]]:
        if int(row["id"]) in linked:
            return None
        peer_intent = one("SELECT * FROM connection_intents WHERE user_id=? AND status='active' ORDER BY created_at DESC", (row["id"],))
        if not peer_intent:
            return None
        shared = sort_match_tags(source_tags & set(user_tags(int(row["id"]))))
        if not shared:
            return None
        return peer_intent, shared

    def take(preferred: list[str], limit: int, skip: set[int]) -> list[tuple[dict[str, Any], dict[str, Any], list[str]]]:
        chosen: list[tuple[dict[str, Any], dict[str, Any], list[str]]] = []
        seen: set[int] = set()
        pool = [by_name[name] for name in preferred if name in by_name]
        pool.extend(row for row in rows if str(row["username"]) not in preferred)
        for row in pool:
            uid = int(row["id"])
            if uid in skip or uid in seen:
                continue
            found = usable(row)
            if not found:
                continue
            seen.add(uid)
            chosen.append((row, found[0], found[1]))
            if len(chosen) >= limit:
                break
        return chosen

    waiting = take(["user12", "user5"], 2, set())
    ts = now_iso()

    def upsert(row: dict[str, Any], peer_intent: dict[str, Any], shared: list[str], waiting_on_them: bool, reason: str) -> int:
        evidence = encode_json(
            {
                "shared_tags": shared,
                "source_intent": source_intent["raw_text"],
                "candidate_intent": peer_intent["raw_text"],
            }
        )
        rec = one(
            "SELECT * FROM recommendations WHERE source_user_id=? AND candidate_user_id=? ORDER BY id DESC",
            (source_id, row["id"]),
        )
        if rec:
            execute(
                """UPDATE recommendations
                SET source_intent_id=?, reason_for_source=?, reason_for_candidate=?, why_now=?, evidence_json=?, status='new'
                WHERE id=?""",
                (
                    source_intent["id"],
                    reason,
                    reason,
                    "Still open. Not connected yet.",
                    evidence,
                    rec["id"],
                ),
            )
            rec_id = int(rec["id"])
        else:
            cur = execute(
                """INSERT INTO recommendations(source_user_id,candidate_user_id,source_intent_id,directional_score_source_to_candidate,directional_score_candidate_to_source,reciprocal_score,reason_for_source,reason_for_candidate,why_now,mismatch_note,evidence_json,status,created_at,expires_at)
                VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (
                    source_id,
                    row["id"],
                    source_intent["id"],
                    0.74,
                    0.7,
                    0.72,
                    reason,
                    reason,
                    "Still open. Not connected yet.",
                    "",
                    evidence,
                    "new",
                    ts,
                    (datetime.now(timezone.utc) + timedelta(days=30)).isoformat(),
                ),
            )
            rec_id = int(cur.lastrowid)
        if waiting_on_them and not one(
            "SELECT id FROM recommendation_decisions WHERE recommendation_id=? AND user_id=? AND decision='interested'",
            (rec_id, source_id),
        ):
            execute(
                "INSERT INTO recommendation_decisions(recommendation_id,user_id,decision,reason,created_at) VALUES(?,?,?,?,?)",
                (rec_id, source_id, "interested", "Demo one-way interest. Waiting on them.", ts),
            )
        return rec_id

    for row, peer_intent, shared in waiting:
        upsert(row, peer_intent, shared, True, f"You both keep {topic_phrase(shared, 3)} in the index.")

    waiting_ids = {int(row["id"]) for row, _, _ in waiting}
    pool: list[tuple[dict[str, Any], dict[str, Any], list[str]]] = []
    for row in rows:
        if int(row["id"]) in waiting_ids:
            continue
        found = usable(row)
        if found:
            pool.append((row, found[0], found[1]))
    counts: dict[str, int] = {}
    for _, _, shared in pool:
        for tag in shared:
            counts[tag] = counts.get(tag, 0) + 1
    theme = "photography" if counts.get("photography", 0) >= 1 else ""
    if not theme:
        for preferred in ("food", "outdoors", "film"):
            if counts.get(preferred, 0) >= 2:
                theme = preferred
                break
    if not theme and counts:
        theme = max(counts, key=lambda tag: counts[tag])
    picks = [item for item in pool if theme and theme in item[2]][:4]
    asks = {
        "photography": "I'm into photography.",
        "food": "I'm into food.",
        "outdoors": "I like being outdoors.",
        "film": "I'm into film.",
    }
    ask = asks.get(theme, f"I'm into {theme}.")
    card_line = f"These people are into {theme}." if theme else ""
    rec_ids: list[int] = []
    for row, peer_intent, shared in picks:
        others = [tag for tag in shared if tag != theme][:2]
        extra = topic_phrase(others, 2) if others else ""
        reason = f"{theme.capitalize()} is on both indexes."
        if extra:
            reason += f" You also both keep {extra}."
        rec_ids.append(upsert(row, peer_intent, shared, False, reason))
    daily = [
        ("user", "I usually take a walk after dinner."),
        ("assistant", "After-dinner walks. I'll remember that."),
        ("user", "On weekends I cook more than I go out."),
        ("assistant", "Weekends cooking at home. I'll keep that too."),
        ("user", "If I have a free afternoon, I like a quiet museum."),
        ("assistant", "Quiet museums. I'll hold onto the walks, the cooking, and that."),
    ]
    known = [text for _, text in daily]
    known.extend(
        [
            "someone who shoots the city at night",
            "I'm into photography.",
            "I'm into food.",
            "I'm into film.",
            "I like being outdoors.",
            ask,
        ]
    )
    placeholders = ",".join("?" for _ in known)
    execute(
        f"""DELETE FROM ai_messages WHERE user_id=? AND (
            content LIKE 'Example shortlist.%'
            OR content LIKE 'Theme: %'
            OR content LIKE 'Who isn''t connected yet, around %'
            OR content LIKE 'Night city, noted.%'
            OR content LIKE 'Photography. A few people %'
            OR content LIKE 'Food, then. %'
            OR content LIKE 'Outdoors. You haven''t linked %'
            OR content LIKE 'Film. A few people still open %'
            OR content LIKE 'A few people you haven''t connected with yet are into %'
            OR content = ?
            OR content IN ({placeholders})
        )""",
        (source_id, card_line, *known),
    )
    for role, text in daily:
        save_ai_message(source_id, role, text)
    if theme and rec_ids:
        save_ai_message(source_id, "user", ask)
        save_ai_message(source_id, "assistant", card_line, recommendation_ids=rec_ids)


def seed_dev_data() -> None:
    if os.getenv("APP_ENV", "development") == "production":
        return
    purge_weave_local_placeholder_users()
    seed_admin_user0()
    seed_socialpersona_users()
    seed_fixed_demo_connection()
    seed_user88_demo_thread()
    seed_demo_shortlist()
