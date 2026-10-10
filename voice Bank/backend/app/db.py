"""SQLite helpers: one connection per request, explicit atomic transactions."""
import contextlib
import sqlite3
from datetime import datetime, timezone

from .config import settings


def connect() -> sqlite3.Connection:
    # isolation_level=None -> autocommit; we open transactions explicitly with BEGIN IMMEDIATE
    # check_same_thread=False: FastAPI may run a request's dependency and endpoint on different pool
    # threads; each connection is still used by exactly one request, one step at a time.
    conn = sqlite3.connect(settings.db_path, timeout=30, isolation_level=None, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys=ON")
    try:
        conn.execute("PRAGMA journal_mode=WAL")
    except sqlite3.DatabaseError:
        pass
    return conn


def get_db():
    conn = connect()
    try:
        yield conn
    finally:
        conn.close()


@contextlib.contextmanager
def immediate(conn: sqlite3.Connection):
    """Write transaction: takes the write lock up front so concurrent requests cannot interleave."""
    conn.execute("BEGIN IMMEDIATE")
    try:
        yield conn
    except BaseException:
        conn.execute("ROLLBACK")
        raise
    else:
        conn.execute("COMMIT")


# ---- time helpers (DB stores UTC as 'YYYY-MM-DD HH:MM:SS') -------------------------------------
def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def ts(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")


def parse_ts(value: str) -> datetime:
    return datetime.strptime(value[:19], "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc)


def iso(value):
    """DB timestamp -> ISO-8601 with Z so browsers show correct local time."""
    if not value:
        return None
    return value[:19].replace(" ", "T") + "Z"
