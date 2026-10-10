"""Single-use confirmation tokens: preview creates one, confirm consumes it atomically."""
import hashlib
import json
import secrets
from datetime import timedelta

from ..config import settings
from ..db import parse_ts, ts, utcnow
from ..errors import AppError


def _hash(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


def create(conn, account_number: int, kind: str, payload: dict, risk_level: str, risk_event_id: int | None) -> tuple[str, str]:
    raw = secrets.token_urlsafe(32)
    expires = utcnow() + timedelta(seconds=settings.confirm_ttl_seconds)
    conn.execute(
        """INSERT INTO confirmation_tokens(token_hash, account_number, kind, payload, risk_level, risk_event_id, expires_at)
           VALUES (?,?,?,?,?,?,?)""",
        (_hash(raw), account_number, kind, json.dumps(payload), risk_level, risk_event_id, ts(expires)),
    )
    # housekeeping: forget tokens older than a day
    conn.execute("DELETE FROM confirmation_tokens WHERE expires_at < ?", (ts(utcnow() - timedelta(days=1)),))
    return raw, ts(expires)


def peek(conn, account_number: int, raw: str):
    """Read-only check used before the PIN is verified (does NOT consume)."""
    row = conn.execute("SELECT * FROM confirmation_tokens WHERE token_hash=?", (_hash(raw),)).fetchone()
    if not row or row["account_number"] != account_number:
        raise AppError("TOKEN_INVALID", 400)
    if row["used"]:
        raise AppError("TOKEN_USED", 400)
    if parse_ts(row["expires_at"]) < utcnow():
        raise AppError("TOKEN_EXPIRED", 400)
    return row


def consume(conn, account_number: int, raw: str):
    """Call INSIDE the money transaction. Marks the token used; rolls back with the transaction on failure."""
    row = peek(conn, account_number, raw)
    changed = conn.execute(
        "UPDATE confirmation_tokens SET used=1 WHERE token_hash=? AND used=0", (row["token_hash"],)
    ).rowcount
    if changed != 1:
        raise AppError("TOKEN_USED", 400)
    return row, json.loads(row["payload"])
