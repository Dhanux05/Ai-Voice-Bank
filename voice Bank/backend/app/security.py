"""PIN hashing, PIN lockout, signed session tokens, admin guard."""
import base64
import hashlib
import hmac
import json
import math
import time
from datetime import timedelta

import bcrypt
from fastapi import Depends, Header

from .config import settings
from .db import get_db, immediate, parse_ts, ts, utcnow
from .errors import AppError


# ---- PIN hashing ---------------------------------------------------------------------------------
def hash_pin(pin: str) -> str:
    return bcrypt.hashpw(pin.encode(), bcrypt.gensalt(rounds=10)).decode()


def is_hashed(stored) -> bool:
    return bool(stored) and str(stored).startswith("$2")


def verify_pin(stored, pin: str) -> bool:
    if stored is None or str(stored) == "":
        return False
    if is_hashed(stored):
        try:
            return bcrypt.checkpw(pin.encode(), str(stored).encode())
        except ValueError:
            return False
    return hmac.compare_digest(str(stored), pin)       # legacy plain-text PIN (upgraded on success)


def check_pin(conn, acc, pin: str, *, login: bool = False) -> None:
    """Verify PIN with lockout. Raises AppError. Failures are committed (never rolled back)."""
    now = utcnow()
    if acc["disabled"]:
        raise AppError("ACCOUNT_DISABLED", 403)
    if acc["locked_until"]:
        until = parse_ts(acc["locked_until"])
        if until > now:
            raise AppError("ACCOUNT_LOCKED", 423, minutes=max(1, math.ceil((until - now).total_seconds() / 60)))

    if verify_pin(acc["pin"], pin):
        new_pin = acc["pin"] if is_hashed(acc["pin"]) else hash_pin(pin)
        conn.execute(
            "UPDATE accounts SET pin_attempts=0, locked_until=NULL, pin=? WHERE account_number=?",
            (new_pin, acc["account_number"]),
        )
        return

    locked = False
    attempts = 0
    with immediate(conn):
        row = conn.execute("SELECT pin_attempts FROM accounts WHERE account_number=?", (acc["account_number"],)).fetchone()
        attempts = (row["pin_attempts"] or 0) + 1
        conn.execute("INSERT INTO security_events(account_number, kind) VALUES (?, 'pin_fail')", (acc["account_number"],))
        if attempts >= settings.max_pin_attempts:
            until = ts(now + timedelta(minutes=settings.lock_minutes))
            conn.execute(
                "UPDATE accounts SET pin_attempts=0, locked_until=? WHERE account_number=?",
                (until, acc["account_number"]),
            )
            locked = True
        else:
            conn.execute("UPDATE accounts SET pin_attempts=? WHERE account_number=?", (attempts, acc["account_number"]))
    if locked:
        raise AppError("ACCOUNT_LOCKED", 423, minutes=settings.lock_minutes)
    if login:
        raise AppError("INVALID_CREDENTIALS", 401)
    raise AppError("INVALID_PIN", 401, attempts_left=settings.max_pin_attempts - attempts)


# ---- session tokens (stateless, HMAC signed) ----------------------------------------------------------
def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _unb64(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def _sign(body: str) -> str:
    return _b64(hmac.new(settings.secret_key.encode(), body.encode(), hashlib.sha256).digest())


def create_session(account_number: int) -> str:
    body = _b64(json.dumps({"a": account_number, "e": int(time.time()) + settings.session_minutes * 60}).encode())
    return f"{body}.{_sign(body)}"


def parse_session(token: str) -> int:
    try:
        body, sig = token.split(".", 1)
        if not hmac.compare_digest(sig, _sign(body)):
            raise ValueError
        data = json.loads(_unb64(body))
        if int(data["e"]) < time.time():
            raise ValueError
        return int(data["a"])
    except Exception:
        raise AppError("UNAUTHORIZED", 401)


def current_account(authorization: str | None = Header(default=None), conn=Depends(get_db)):
    if not authorization or not authorization.lower().startswith("bearer "):
        raise AppError("UNAUTHORIZED", 401)
    account_number = parse_session(authorization[7:].strip())
    row = conn.execute("SELECT * FROM accounts WHERE account_number=?", (account_number,)).fetchone()
    if not row:
        raise AppError("UNAUTHORIZED", 401)
    if row["disabled"]:
        raise AppError("ACCOUNT_DISABLED", 403)
    return row


def verified_account(acc=Depends(current_account), x_pin: str | None = Header(default=None), conn=Depends(get_db)):
    """Session + the account PIN (X-Pin header) on every call. Used for viewing balance/history and for deposits."""
    if not x_pin or not (len(x_pin) == 4 and x_pin.isdigit()):
        raise AppError("PIN_REQUIRED", 401)
    check_pin(conn, acc, x_pin)
    return conn.execute("SELECT * FROM accounts WHERE account_number=?", (acc["account_number"],)).fetchone()


def admin_required(x_admin_token: str | None = Header(default=None)) -> None:
    if not settings.admin_token:
        raise AppError("ADMIN_NOT_CONFIGURED", 503)
    if not x_admin_token or not hmac.compare_digest(x_admin_token, settings.admin_token):
        raise AppError("ADMIN_UNAUTHORIZED", 401)
