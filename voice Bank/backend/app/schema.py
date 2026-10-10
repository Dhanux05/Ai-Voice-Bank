"""Database schema creation + legacy migration (idempotent; safe to run on every start)."""
import shutil
import sqlite3
from datetime import datetime
from pathlib import Path

from .security import hash_pin

ACCOUNTS_SQL = """
CREATE TABLE IF NOT EXISTS accounts (
  account_number INTEGER PRIMARY KEY,
  full_name VARCHAR(50),
  branch_name VARCHAR(50),
  balance INTEGER,
  pin VARCHAR(80),
  email VARCHAR(100),
  phone VARCHAR(20)
)"""

TRANSACTIONS_SQL = """
CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  transaction_id VARCHAR(60) UNIQUE,
  from_account INTEGER,
  to_account INTEGER,
  transaction_type VARCHAR(30),
  amount REAL,
  balance_after REAL,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (from_account) REFERENCES accounts(account_number),
  FOREIGN KEY (to_account) REFERENCES accounts(account_number)
)"""

LOANS_SQL = """
CREATE TABLE IF NOT EXISTS loans (
  loan_id TEXT PRIMARY KEY,
  account_number INTEGER NOT NULL,
  loan_type TEXT NOT NULL,
  principal REAL NOT NULL,
  interest_rate REAL NOT NULL,
  tenure_months INTEGER NOT NULL,
  emi_amount REAL NOT NULL,
  total_payable REAL NOT NULL,
  outstanding_balance REAL NOT NULL,
  emis_paid INTEGER DEFAULT 0,
  status TEXT DEFAULT 'Active',
  applied_date DATETIME DEFAULT CURRENT_TIMESTAMP,
  disbursed_date DATETIME DEFAULT CURRENT_TIMESTAMP,
  closed_date DATETIME,
  FOREIGN KEY (account_number) REFERENCES accounts(account_number)
)"""

LOAN_PAYMENTS_SQL = """
CREATE TABLE IF NOT EXISTS loan_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  payment_id TEXT UNIQUE,
  loan_id TEXT NOT NULL,
  account_number INTEGER NOT NULL,
  amount REAL NOT NULL,
  principal_component REAL NOT NULL,
  interest_component REAL NOT NULL,
  outstanding_after REAL NOT NULL,
  payment_date DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (loan_id) REFERENCES loans(loan_id)
)"""

SECURITY_SQL = """
CREATE TABLE IF NOT EXISTS security_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_number INTEGER NOT NULL,
  kind TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
)"""

RISK_SQL = """
CREATE TABLE IF NOT EXISTS risk_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_number INTEGER NOT NULL,
  kind TEXT NOT NULL,
  amount REAL NOT NULL,
  score INTEGER NOT NULL,
  level TEXT NOT NULL,
  reasons TEXT NOT NULL,
  outcome TEXT NOT NULL DEFAULT 'previewed',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
)"""

TOKENS_SQL = """
CREATE TABLE IF NOT EXISTS confirmation_tokens (
  token_hash TEXT PRIMARY KEY,
  account_number INTEGER NOT NULL,
  kind TEXT NOT NULL,
  payload TEXT NOT NULL,
  risk_level TEXT NOT NULL,
  risk_event_id INTEGER,
  expires_at TEXT NOT NULL,
  used INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
)"""


def _columns(conn: sqlite3.Connection, table: str) -> set[str]:
    return {row[1] for row in conn.execute(f"PRAGMA table_info({table})")}


def _add_column(conn: sqlite3.Connection, table: str, name: str, ddl: str) -> None:
    if name not in _columns(conn, table):
        conn.execute(f"ALTER TABLE {table} ADD COLUMN {name} {ddl}")


def ensure_schema(conn: sqlite3.Connection) -> list[str]:
    """Create/upgrade tables. Returns human-readable notes (e.g. duplicate phone numbers)."""
    notes: list[str] = []
    for sql in (ACCOUNTS_SQL, TRANSACTIONS_SQL, LOANS_SQL, LOAN_PAYMENTS_SQL, SECURITY_SQL, RISK_SQL, TOKENS_SQL):
        conn.execute(sql)
    _add_column(conn, "accounts", "pin_attempts", "INTEGER DEFAULT 0")
    _add_column(conn, "accounts", "locked_until", "TEXT")
    _add_column(conn, "accounts", "disabled", "INTEGER DEFAULT 0")
    _add_column(conn, "accounts", "disabled_at", "TEXT")
    _add_column(conn, "accounts", "created_at", "TEXT")
    _add_column(conn, "transactions", "owner_account", "INTEGER")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_tx_owner ON transactions(owner_account, id)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_sec ON security_events(account_number, kind, created_at)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_risk_acc ON risk_events(account_number, id)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_loans_acc ON loans(account_number)")
    try:
        conn.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS ux_accounts_phone ON accounts(phone) "
            "WHERE phone IS NOT NULL AND phone != ''"
        )
    except sqlite3.IntegrityError:
        dupes = conn.execute(
            "SELECT phone, COUNT(*) c FROM accounts WHERE phone IS NOT NULL AND phone != '' "
            "GROUP BY phone HAVING c > 1"
        ).fetchall()
        notes.append(
            "Duplicate phone numbers found (fix them in Admin or SQL, then restart): "
            + ", ".join(f"{d['phone']} x{d['c']}" for d in dupes)
        )
    return notes


def migrate_legacy(conn: sqlite3.Connection) -> dict:
    """Upgrade an existing Node-era bank.db in place. Idempotent."""
    report = {"notes": [], "pins_hashed": 0, "phones_normalised": 0, "owners_backfilled": 0, "accounts_without_pin": 0}

    # Normalise phones (digits only) before the unique index is created
    rows = conn.execute("SELECT account_number, phone FROM accounts WHERE phone IS NOT NULL AND phone != ''").fetchall()
    for r in rows:
        digits = "".join(ch for ch in str(r["phone"]) if ch.isdigit())
        if len(digits) == 12 and digits.startswith("91"):
            digits = digits[2:]
        if digits != r["phone"] and len(digits) == 10:
            try:
                conn.execute("UPDATE accounts SET phone=? WHERE account_number=?", (digits, r["account_number"]))
                report["phones_normalised"] += 1
            except sqlite3.IntegrityError:
                report["notes"].append(f"Could not normalise phone of account {r['account_number']} (duplicate).")

    report["notes"] += ensure_schema(conn)

    # Hash plain-text PINs
    for r in conn.execute("SELECT account_number, pin FROM accounts").fetchall():
        pin = r["pin"]
        if pin is None or str(pin) == "":
            report["accounts_without_pin"] += 1
            continue
        if not str(pin).startswith("$2"):
            conn.execute("UPDATE accounts SET pin=? WHERE account_number=?", (hash_pin(str(pin)), r["account_number"]))
            report["pins_hashed"] += 1

    # Ledger owner column for per-account history (no duplicate transfer rows)
    cur = conn.execute(
        """UPDATE transactions SET owner_account = CASE
               WHEN transaction_type = 'Transfer' AND transaction_id LIKE '%\\_R' ESCAPE '\\' THEN to_account
               ELSE from_account END
           WHERE owner_account IS NULL"""
    )
    report["owners_backfilled"] = cur.rowcount if cur.rowcount and cur.rowcount > 0 else 0
    return report


def backup_db(db_path: str) -> str | None:
    p = Path(db_path)
    if not p.exists():
        return None
    target = p.with_name(f"{p.stem}.backup-{datetime.now().strftime('%Y%m%d-%H%M%S')}{p.suffix}")
    shutil.copy2(p, target)
    return str(target)
