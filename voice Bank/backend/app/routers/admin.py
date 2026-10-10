"""Admin API (header X-Admin-Token). Account number and PIN are never editable; PIN is never returned.
Editable: name, phone, balance."""
import json
import sqlite3

from fastapi import APIRouter, Depends, Query

from ..db import get_db, immediate, iso, ts, utcnow
from ..errors import AppError
from ..money import from_paise, to_paise
from ..schemas import AdminBalanceIn, AdminUpdateIn
from ..security import admin_required
from ..services import banking
from .loans import loan_to_dict

router = APIRouter(prefix="/api/admin", tags=["admin"], dependencies=[Depends(admin_required)])


def _user(row) -> dict:
    locked = False
    if row["locked_until"]:
        from ..db import parse_ts
        locked = parse_ts(row["locked_until"]) > utcnow()
    return {
        "account_number": row["account_number"],
        "full_name": row["full_name"],
        "branch_name": row["branch_name"],
        "balance": row["balance"] or 0,
        "email": row["email"],
        "phone": row["phone"],
        "locked": locked,
        "disabled": bool(row["disabled"]),
        "disabled_at": iso(row["disabled_at"]),
        "joined": iso(row["created_at"]),
    }


def _get(conn, acc_no: int):
    row = conn.execute("SELECT * FROM accounts WHERE account_number=?", (acc_no,)).fetchone()
    if not row:
        raise AppError("ACCOUNT_NOT_FOUND", 404)
    return row


@router.get("/users")
def users(q: str = Query("", max_length=60), conn=Depends(get_db)):
    like = f"%{q.strip()}%"
    rows = conn.execute(
        """SELECT * FROM accounts WHERE ?='%%' OR CAST(account_number AS TEXT) LIKE ? OR full_name LIKE ?
           OR phone LIKE ? OR branch_name LIKE ? ORDER BY account_number""",
        (like, like, like, like, like),
    ).fetchall()
    return {"count": len(rows), "users": [_user(r) for r in rows]}


@router.get("/users/{account_number}")
def user(account_number: int, conn=Depends(get_db)):
    return {"user": _user(_get(conn, account_number))}


@router.put("/users/{account_number}")
def update_user(account_number: int, body: AdminUpdateIn, conn=Depends(get_db)):
    fields = body.model_dump(exclude_none=True)
    if not fields:
        raise AppError("NO_FIELDS", 400, message="Nothing to update.")
    try:
        with immediate(conn):
            _get(conn, account_number)
            if "phone" in fields and conn.execute(
                "SELECT 1 FROM accounts WHERE phone=? AND account_number!=?", (fields["phone"], account_number)
            ).fetchone():
                raise AppError("PHONE_EXISTS", 409)
            sets = ", ".join(f"{k}=?" for k in fields)
            conn.execute(f"UPDATE accounts SET {sets} WHERE account_number=?", (*fields.values(), account_number))
    except sqlite3.IntegrityError:
        raise AppError("PHONE_EXISTS", 409)
    return {"user": _user(_get(conn, account_number))}


@router.put("/users/{account_number}/balance")
def update_balance(account_number: int, body: AdminBalanceIn, conn=Depends(get_db)):
    new = to_paise(body.balance)
    with immediate(conn):
        row = _get(conn, account_number)
        old = banking.balance_paise(row)
        conn.execute("UPDATE accounts SET balance=? WHERE account_number=?", (from_paise(new), account_number))
        delta = new - old
        if delta != 0:
            banking._ledger(conn, txid="ADM" + banking.new_txid()[3:], from_acc=account_number, to_acc=account_number,
                            kind="Admin Balance Update", amount_paise=delta, balance_after_paise=new,
                            owner=account_number, when=utcnow())
    return {"account_number": account_number, "old_balance": from_paise(old), "new_balance": from_paise(new)}


@router.post("/users/{account_number}/unlock")
def unlock(account_number: int, conn=Depends(get_db)):
    _get(conn, account_number)
    conn.execute("UPDATE accounts SET locked_until=NULL, pin_attempts=0 WHERE account_number=?", (account_number,))
    return {"ok": True}


@router.delete("/users/{account_number}")
def delete_user(account_number: int, conn=Depends(get_db)):
    with immediate(conn):
        _get(conn, account_number)
        has_tx = conn.execute("SELECT 1 FROM transactions WHERE from_account=? OR to_account=? LIMIT 1",
                              (account_number, account_number)).fetchone()
        has_loan = conn.execute("SELECT 1 FROM loans WHERE account_number=? LIMIT 1", (account_number,)).fetchone()
        if has_tx or has_loan:
            raise AppError("ACCOUNT_HAS_HISTORY", 409)
        conn.execute("DELETE FROM accounts WHERE account_number=?", (account_number,))
    return {"deleted": account_number}


_NO_MIRROR = "NOT (t.transaction_type='Transfer' AND t.transaction_id LIKE '%\\_R' ESCAPE '\\')"


def _tx_dict(r) -> dict:
    return {"id": r["id"], "transaction_id": r["transaction_id"], "type": r["transaction_type"],
            "from_account": r["from_account"], "to_account": r["to_account"],
            "from_name": r["from_name"], "to_name": r["to_name"], "amount": r["amount"],
            "balance_after": r["balance_after"], "timestamp": iso(r["timestamp"])}


_TX_SELECT = """SELECT t.*, fa.full_name AS from_name, ta.full_name AS to_name FROM transactions t
                LEFT JOIN accounts fa ON fa.account_number=t.from_account
                LEFT JOIN accounts ta ON ta.account_number=t.to_account"""


@router.get("/transactions")
def transactions(limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0), q: str = Query("", max_length=40),
                 type: str = Query("", max_length=30), conn=Depends(get_db)):
    like = f"%{q.strip()}%"
    where = f"{_NO_MIRROR} AND (?='' OR t.transaction_type=?) AND (?='%%' OR CAST(t.from_account AS TEXT) LIKE ? OR CAST(t.to_account AS TEXT) LIKE ? OR t.transaction_id LIKE ? OR fa.full_name LIKE ? OR ta.full_name LIKE ?)"
    args = (type, type, like, like, like, like, like, like)
    rows = conn.execute(f"{_TX_SELECT} WHERE {where} ORDER BY t.id DESC LIMIT ? OFFSET ?", (*args, limit, offset)).fetchall()
    total = conn.execute(f"SELECT COUNT(*) c FROM transactions t LEFT JOIN accounts fa ON fa.account_number=t.from_account "
                         f"LEFT JOIN accounts ta ON ta.account_number=t.to_account WHERE {where}", args).fetchone()["c"]
    return {"total": total, "limit": limit, "offset": offset, "transactions": [_tx_dict(r) for r in rows]}


def _loan_row(conn, r) -> dict:
    paid = conn.execute("SELECT COALESCE(SUM(amount),0) a, COALESCE(SUM(principal_component),0) p, MAX(payment_date) last "
                        "FROM loan_payments WHERE loan_id=?", (r["loan_id"],)).fetchone()
    total = r["total_payable"] or 0
    remaining = max(round(total - paid["a"], 2), 0) if r["status"] == "Active" else 0
    d = loan_to_dict(r)
    d.update({"account_number": r["account_number"], "full_name": r["full_name"] if "full_name" in r.keys() else None,
              "phone": r["phone"] if "phone" in r.keys() else None,
              "amount_paid": round(paid["a"], 2), "remaining_payable": remaining,
              "emis_left": max((r["tenure_months"] or 0) - (r["emis_paid"] or 0), 0) if r["status"] == "Active" else 0,
              "progress": round(min(100.0, (paid["a"] / total * 100) if total else 0), 1),
              "last_payment": iso(paid["last"])})
    return d


@router.get("/users/{account_number}/detail")
def user_detail(account_number: int, conn=Depends(get_db)):
    row = _get(conn, account_number)
    txs = conn.execute(f"{_TX_SELECT} WHERE t.owner_account=? ORDER BY t.id DESC LIMIT 50", (account_number,)).fetchall()
    loans_ = conn.execute("SELECT l.*, a.full_name, a.phone FROM loans l LEFT JOIN accounts a ON a.account_number=l.account_number "
                          "WHERE l.account_number=? ORDER BY l.rowid DESC", (account_number,)).fetchall()
    risks = conn.execute("SELECT * FROM risk_events WHERE account_number=? ORDER BY id DESC LIMIT 10", (account_number,)).fetchall()
    agg = conn.execute("""SELECT COALESCE(SUM(CASE WHEN transaction_type='Deposit' THEN amount END),0) dep,
                                 COALESCE(SUM(CASE WHEN transaction_type='Withdrawal' THEN amount END),0) wd,
                                 COUNT(*) n FROM transactions WHERE owner_account=?""", (account_number,)).fetchone()
    return {"user": _user(row), "summary": {"transactions": agg["n"], "deposited": agg["dep"], "withdrawn": agg["wd"]},
            "transactions": [{**_tx_dict(r), "direction": "out" if (r["transaction_type"] in ("Withdrawal", "Loan EMI Payment") or (r["transaction_type"] == "Transfer" and r["from_account"] == account_number)) else "in"} for r in txs],
            "loans": [_loan_row(conn, r) for r in loans_],
            "risk_events": [{"kind": r["kind"], "amount": r["amount"], "score": r["score"], "level": r["level"],
                             "reasons": json.loads(r["reasons"]), "outcome": r["outcome"], "created_at": iso(r["created_at"])} for r in risks]}


@router.post("/users/{account_number}/disable")
def disable(account_number: int, conn=Depends(get_db)):
    _get(conn, account_number)
    conn.execute("UPDATE accounts SET disabled=1, disabled_at=datetime('now') WHERE account_number=?", (account_number,))
    return {"user": _user(_get(conn, account_number))}


@router.post("/users/{account_number}/enable")
def enable(account_number: int, conn=Depends(get_db)):
    _get(conn, account_number)
    conn.execute("UPDATE accounts SET disabled=0, disabled_at=NULL, pin_attempts=0, locked_until=NULL WHERE account_number=?", (account_number,))
    return {"user": _user(_get(conn, account_number))}


@router.get("/dashboard")
def dashboard(conn=Depends(get_db)):
    a = conn.execute("""SELECT COUNT(*) n, COALESCE(SUM(disabled),0) dis, COALESCE(SUM(balance),0) total,
                               COALESCE(AVG(balance),0) avg FROM accounts""").fetchone()
    locked = conn.execute("SELECT COUNT(*) c FROM accounts WHERE locked_until IS NOT NULL AND locked_until > datetime('now')").fetchone()["c"]
    t = conn.execute(f"SELECT COUNT(*) n, COALESCE(SUM(t.amount),0) vol FROM transactions t WHERE {_NO_MIRROR} AND t.transaction_type IN ('Deposit','Withdrawal','Transfer')").fetchone()
    series = conn.execute(f"""SELECT date(t.timestamp) d, COUNT(*) n, COALESCE(SUM(t.amount),0) vol FROM transactions t
                              WHERE {_NO_MIRROR} AND t.transaction_type IN ('Deposit','Withdrawal','Transfer') AND t.timestamp >= date('now','-13 days')
                              GROUP BY d ORDER BY d""").fetchall()
    by_type = conn.execute(f"SELECT t.transaction_type k, COUNT(*) n, COALESCE(SUM(t.amount),0) vol FROM transactions t WHERE {_NO_MIRROR} GROUP BY k ORDER BY n DESC").fetchall()
    l = conn.execute("""SELECT COUNT(*) total, COALESCE(SUM(status='Active'),0) active, COALESCE(SUM(status='Closed'),0) closed,
                               COALESCE(SUM(principal),0) disbursed, COALESCE(SUM(outstanding_balance),0) outstanding FROM loans""").fetchone()
    collected = conn.execute("SELECT COALESCE(SUM(amount),0) c FROM loan_payments").fetchone()["c"]
    risk = conn.execute("SELECT level, COUNT(*) n FROM risk_events GROUP BY level").fetchall()
    recent = conn.execute(f"{_TX_SELECT} WHERE {_NO_MIRROR} ORDER BY t.id DESC LIMIT 8").fetchall()
    alerts = conn.execute("""SELECT r.*, a.full_name FROM risk_events r LEFT JOIN accounts a ON a.account_number=r.account_number
                             WHERE r.level IN ('high','medium') ORDER BY r.id DESC LIMIT 5""").fetchall()
    newest = conn.execute("SELECT * FROM accounts ORDER BY rowid DESC LIMIT 5").fetchall()
    return {
        "users": {"total": a["n"], "disabled": a["dis"], "active": a["n"] - a["dis"], "locked": locked,
                  "total_balance": a["total"], "average_balance": round(a["avg"], 2)},
        "transactions": {"total": t["n"], "volume": t["vol"]},
        "series": [{"date": r["d"], "count": r["n"], "volume": r["vol"]} for r in series],
        "by_type": [{"type": r["k"], "count": r["n"], "volume": r["vol"]} for r in by_type],
        "loans": {"total": l["total"], "active": l["active"], "closed": l["closed"], "disbursed": l["disbursed"],
                  "outstanding": l["outstanding"], "collected": collected},
        "risk": {r["level"]: r["n"] for r in risk},
        "recent": [_tx_dict(r) for r in recent],
        "alerts": [{"full_name": r["full_name"], "account_number": r["account_number"], "kind": r["kind"], "amount": r["amount"],
                    "level": r["level"], "score": r["score"], "reasons": json.loads(r["reasons"]), "created_at": iso(r["created_at"])} for r in alerts],
        "newest": [_user(r) for r in newest],
    }


@router.get("/stats")
def stats(conn=Depends(get_db)):
    a = conn.execute(
        "SELECT COUNT(*) n, COALESCE(SUM(balance),0) total, COALESCE(AVG(balance),0) avg FROM accounts"
    ).fetchone()
    t = conn.execute("SELECT COUNT(*) n FROM transactions WHERE NOT (transaction_type='Transfer' AND transaction_id LIKE '%\\_R' ESCAPE '\\')").fetchone()["n"]
    r = conn.execute("SELECT COUNT(*) n FROM risk_events WHERE level='high'").fetchone()["n"]
    return {"accounts": {"total": a["n"], "total_balance": a["total"], "average_balance": round(a["avg"])},
            "transactions": {"total": t}, "high_risk_events": r}


@router.get("/loans")
def loans(status: str = Query("", pattern="^(|Active|Closed)$"), conn=Depends(get_db)):
    rows = conn.execute(
        """SELECT l.*, a.full_name, a.phone FROM loans l LEFT JOIN accounts a ON a.account_number = l.account_number
           WHERE (?='' OR l.status=?) ORDER BY l.applied_date DESC, l.rowid DESC""", (status, status)
    ).fetchall()
    return {"count": len(rows), "loans": [_loan_row(conn, r) for r in rows]}


@router.get("/loans/stats")
def loan_stats(conn=Depends(get_db)):
    s = conn.execute(
        """SELECT COUNT(*) total, COALESCE(SUM(status='Active'),0) active, COALESCE(SUM(status='Closed'),0) closed,
                  COALESCE(SUM(principal),0) disbursed, COALESCE(SUM(outstanding_balance),0) outstanding FROM loans"""
    ).fetchone()
    return {"total_loans": s["total"], "active_loans": s["active"], "closed_loans": s["closed"],
            "total_disbursed": s["disbursed"], "total_outstanding": s["outstanding"]}


@router.get("/risk-events")
def risk_events(level: str = Query("", pattern="^(|low|medium|high)$"), limit: int = Query(100, ge=1, le=500),
                conn=Depends(get_db)):
    rows = conn.execute(
        """SELECT r.*, a.full_name FROM risk_events r LEFT JOIN accounts a ON a.account_number=r.account_number
           WHERE (?='' OR r.level=?) ORDER BY r.id DESC LIMIT ?""", (level, level, limit)
    ).fetchall()
    return {"events": [
        {"id": r["id"], "account_number": r["account_number"], "full_name": r["full_name"], "kind": r["kind"],
         "amount": r["amount"], "score": r["score"], "level": r["level"], "reasons": json.loads(r["reasons"]),
         "outcome": r["outcome"], "created_at": iso(r["created_at"])} for r in rows]}
