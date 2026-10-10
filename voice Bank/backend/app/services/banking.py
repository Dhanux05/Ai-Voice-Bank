"""Core money logic. plan_*() validates and previews; apply_*() runs inside a BEGIN IMMEDIATE transaction.

apply_*() always re-plans from fresh data inside the transaction, so a stale preview can never
overdraw an account or double-spend.
"""
import random
import time
from datetime import timedelta

from ..config import settings
from ..db import iso, ts, utcnow
from ..errors import AppError
from ..money import from_paise, to_paise
from .emi import LOAN_TYPES, NAME_TO_KEY, calculate_emi, interest_for


# ---- lookups & helpers ------------------------------------------------------------------------------
def get_account(conn, account_number: int):
    row = conn.execute("SELECT * FROM accounts WHERE account_number=?", (account_number,)).fetchone()
    if not row:
        raise AppError("ACCOUNT_NOT_FOUND", 404)
    return row


def get_account_by_phone(conn, phone: str):
    return conn.execute("SELECT * FROM accounts WHERE phone=?", (phone,)).fetchone()


def balance_paise(row) -> int:
    return to_paise(row["balance"] or 0)


def mask_digits(value, keep: int = 4) -> str:
    s = str(value)
    return "X" * max(0, len(s) - keep) + s[-keep:]


def new_txid() -> str:
    return f"TXN{time.time_ns() // 1000}{random.randint(100, 999)}"


def _set_balance(conn, account_number: int, paise: int) -> None:
    conn.execute("UPDATE accounts SET balance=? WHERE account_number=?", (from_paise(paise), account_number))


def _ledger(conn, *, txid, from_acc, to_acc, kind, amount_paise, balance_after_paise, owner, when) -> None:
    conn.execute(
        """INSERT INTO transactions(transaction_id, from_account, to_account, transaction_type, amount,
                                    balance_after, owner_account, timestamp)
           VALUES (?,?,?,?,?,?,?,?)""",
        (txid, from_acc, to_acc, kind, from_paise(amount_paise), from_paise(balance_after_paise), owner, ts(when)),
    )


# ---- risk inputs --------------------------------------------------------------------------------------
def debit_history(conn, account_number: int, now):
    since = ts(now - timedelta(days=90))
    rows = conn.execute(
        """SELECT amount, timestamp FROM transactions
           WHERE owner_account=? AND timestamp>=?
             AND (transaction_type IN ('Withdrawal','Loan EMI Payment')
                  OR (transaction_type='Transfer' AND from_account=owner_account))""",
        (account_number, since),
    ).fetchall()
    from ..db import parse_ts
    return [{"amount_paise": to_paise(r["amount"]), "ts": parse_ts(r["timestamp"])} for r in rows]


def recent_pin_fails(conn, account_number: int, now) -> int:
    return conn.execute(
        "SELECT COUNT(*) c FROM security_events WHERE account_number=? AND kind='pin_fail' AND created_at>=?",
        (account_number, ts(now - timedelta(hours=24))),
    ).fetchone()["c"]


def loans_last_24h(conn, account_number: int, now) -> int:
    return conn.execute(
        "SELECT COUNT(*) c FROM loans WHERE account_number=? AND applied_date>=?",
        (account_number, ts(now - timedelta(hours=24))),
    ).fetchone()["c"]


def has_sent_to(conn, sender: int, recipient: int) -> bool:
    return conn.execute(
        "SELECT 1 FROM transactions WHERE owner_account=? AND transaction_type='Transfer' "
        "AND from_account=? AND to_account=? LIMIT 1",
        (sender, sender, recipient),
    ).fetchone() is not None


# ---- planning (validation + preview numbers) ------------------------------------------------------------
def plan_withdraw(conn, acc, p):
    amt = p["amount_paise"]
    bal = balance_paise(acc)
    if amt > bal:
        raise AppError("INSUFFICIENT_FUNDS", 400, balance=from_paise(bal))
    return {
        "kind": "withdraw",
        "amount_paise": amt,
        "summary": {"kind": "withdraw", "amount": from_paise(amt), "balance_after": from_paise(bal - amt)},
        "new_recipient": False,
    }


def plan_transfer(conn, acc, p):
    amt = p["amount_paise"]
    recipient = get_account_by_phone(conn, p["to_phone"])
    if not recipient or recipient["disabled"]:
        raise AppError("RECIPIENT_NOT_FOUND", 404)
    if recipient["account_number"] == acc["account_number"]:
        raise AppError("SELF_TRANSFER", 400)
    bal = balance_paise(acc)
    if amt > bal:
        raise AppError("INSUFFICIENT_FUNDS", 400, balance=from_paise(bal))
    return {
        "kind": "transfer",
        "amount_paise": amt,
        "recipient": recipient,
        "summary": {
            "kind": "transfer",
            "amount": from_paise(amt),
            "to_name": recipient["full_name"],
            "to_phone_masked": mask_digits(p["to_phone"]),
            "balance_after": from_paise(bal - amt),
        },
        "new_recipient": not has_sent_to(conn, acc["account_number"], recipient["account_number"]),
    }


def plan_loan_apply(conn, acc, p):
    cfg = LOAN_TYPES.get(p["loan_type"])
    if not cfg:
        raise AppError("INVALID_LOAN_TYPE", 400)
    amt = p["amount_paise"]
    months = p["tenure_months"]
    if not (cfg["min_amount"] * 100 <= amt <= cfg["max_amount"] * 100):
        raise AppError("LOAN_AMOUNT_RANGE", 400, min=cfg["min_amount"], max=cfg["max_amount"])
    if not (cfg["min_tenure"] <= months <= cfg["max_tenure"]):
        raise AppError("LOAN_TENURE_RANGE", 400, min=cfg["min_tenure"], max=cfg["max_tenure"])
    calc = calculate_emi(amt, cfg["interest_rate"], months)
    bal = balance_paise(acc)
    return {
        "kind": "loan_apply",
        "amount_paise": amt,
        "calc": calc,
        "cfg": cfg,
        "summary": {
            "kind": "loan_apply",
            "loan_type": p["loan_type"],
            "loan_name": cfg["name"],
            "amount": from_paise(amt),
            "interest_rate": cfg["interest_rate"],
            "tenure_months": months,
            "emi": from_paise(calc["emi"]),
            "total_payable": from_paise(calc["total_payable"]),
            "total_interest": from_paise(calc["total_interest"]),
            "balance_after": from_paise(bal + amt),
        },
        "new_recipient": False,
    }


def loan_dues(loan) -> dict:
    outstanding = to_paise(loan["outstanding_balance"])
    interest = interest_for(outstanding, loan["interest_rate"])
    payoff = outstanding + interest
    emi = to_paise(loan["emi_amount"])
    return {"outstanding": outstanding, "interest": interest, "payoff": payoff, "next_due": min(emi, payoff)}


def plan_loan_pay(conn, acc, p):
    loan = conn.execute(
        "SELECT * FROM loans WHERE loan_id=? AND account_number=?", (p["loan_id"], acc["account_number"])
    ).fetchone()
    if not loan:
        raise AppError("LOAN_NOT_FOUND", 404)
    if loan["status"] != "Active":
        raise AppError("LOAN_CLOSED", 400)
    d = loan_dues(loan)
    pay = p.get("amount_paise") or d["next_due"]
    if pay > d["payoff"]:
        raise AppError("AMOUNT_EXCEEDS_DUE", 400, due=from_paise(d["payoff"]))
    bal = balance_paise(acc)
    if pay > bal:
        raise AppError("INSUFFICIENT_FUNDS", 400, balance=from_paise(bal))
    principal_part = min(max(pay - d["interest"], 0), d["outstanding"])
    after = d["outstanding"] - principal_part
    closes = pay == d["payoff"] or after <= 100        # residual under Re.1 counts as settled
    if closes:
        after = 0
    return {
        "kind": "loan_pay",
        "amount_paise": pay,
        "loan": loan,
        "interest": d["interest"],
        "principal": principal_part,
        "outstanding_after": after,
        "closes": closes,
        "summary": {
            "kind": "loan_pay",
            "loan_id": loan["loan_id"],
            "loan_name": loan["loan_type"],
            "amount": from_paise(pay),
            "interest_component": from_paise(d["interest"]),
            "principal_component": from_paise(principal_part),
            "outstanding_after": from_paise(after),
            "closes_loan": closes,
            "balance_after": from_paise(bal - pay),
        },
        "new_recipient": False,
    }


def plan(conn, acc, kind: str, p: dict):
    if kind == "withdraw":
        return plan_withdraw(conn, acc, p)
    if kind == "transfer":
        return plan_transfer(conn, acc, p)
    if kind == "loan_apply":
        return plan_loan_apply(conn, acc, p)
    if kind == "loan_pay":
        return plan_loan_pay(conn, acc, p)
    raise AppError("INVALID_KIND", 400)


# ---- applying (call inside `with immediate(conn)`) -----------------------------------------------------
def apply(conn, account_number: int, kind: str, p: dict) -> dict:
    acc = get_account(conn, account_number)
    pl = plan(conn, acc, kind, p)          # re-validated against fresh balances
    now = utcnow()
    txid = new_txid()
    amt = pl["amount_paise"]
    bal = balance_paise(acc)
    base = {"kind": kind, "transaction_id": txid, "timestamp": iso(ts(now)), "amount": from_paise(amt)}

    if kind == "withdraw":
        new_bal = bal - amt
        _set_balance(conn, account_number, new_bal)
        _ledger(conn, txid=txid, from_acc=account_number, to_acc=account_number, kind="Withdrawal",
                amount_paise=amt, balance_after_paise=new_bal, owner=account_number, when=now)
        return {**base, "name": acc["full_name"], "balance_after": from_paise(new_bal)}

    if kind == "transfer":
        rec = pl["recipient"]
        new_s = bal - amt
        new_r = balance_paise(rec) + amt
        _set_balance(conn, account_number, new_s)
        _set_balance(conn, rec["account_number"], new_r)
        _ledger(conn, txid=txid + "_S", from_acc=account_number, to_acc=rec["account_number"], kind="Transfer",
                amount_paise=amt, balance_after_paise=new_s, owner=account_number, when=now)
        _ledger(conn, txid=txid + "_R", from_acc=account_number, to_acc=rec["account_number"], kind="Transfer",
                amount_paise=amt, balance_after_paise=new_r, owner=rec["account_number"], when=now)
        return {**base, "from_name": acc["full_name"], "from_phone_masked": mask_digits(acc["phone"] or ""),
                "to_name": rec["full_name"], "to_phone_masked": mask_digits(rec["phone"]),
                "balance_after": from_paise(new_s)}

    if kind == "loan_apply":
        cfg, calc = pl["cfg"], pl["calc"]
        loan_id = f"LN{time.time_ns() // 1000}{random.randint(100, 999)}"
        conn.execute(
            """INSERT INTO loans(loan_id, account_number, loan_type, principal, interest_rate, tenure_months,
                                 emi_amount, total_payable, outstanding_balance, status, applied_date, disbursed_date)
               VALUES (?,?,?,?,?,?,?,?,?,'Active',?,?)""",
            (loan_id, account_number, cfg["name"], from_paise(amt), cfg["interest_rate"], p["tenure_months"],
             from_paise(calc["emi"]), from_paise(calc["total_payable"]), from_paise(amt), ts(now), ts(now)),
        )
        new_bal = bal + amt
        _set_balance(conn, account_number, new_bal)
        _ledger(conn, txid=txid, from_acc=account_number, to_acc=account_number, kind="Loan Disbursement",
                amount_paise=amt, balance_after_paise=new_bal, owner=account_number, when=now)
        return {**base, "loan_id": loan_id, "loan_name": cfg["name"], "interest_rate": cfg["interest_rate"],
                "tenure_months": p["tenure_months"], "emi": from_paise(calc["emi"]),
                "total_payable": from_paise(calc["total_payable"]), "name": acc["full_name"],
                "balance_after": from_paise(new_bal)}

    if kind == "loan_pay":
        loan = pl["loan"]
        new_bal = bal - amt
        _set_balance(conn, account_number, new_bal)
        status = "Closed" if pl["closes"] else "Active"
        conn.execute(
            "UPDATE loans SET outstanding_balance=?, emis_paid=emis_paid+1, status=?, closed_date=? WHERE loan_id=?",
            (from_paise(pl["outstanding_after"]), status, ts(now) if pl["closes"] else None, loan["loan_id"]),
        )
        conn.execute(
            """INSERT INTO loan_payments(payment_id, loan_id, account_number, amount, principal_component,
                                         interest_component, outstanding_after, payment_date)
               VALUES (?,?,?,?,?,?,?,?)""",
            ("LNPAY" + txid[3:], loan["loan_id"], account_number, from_paise(amt), from_paise(pl["principal"]),
             from_paise(pl["interest"]), from_paise(pl["outstanding_after"]), ts(now)),
        )
        _ledger(conn, txid=txid, from_acc=account_number, to_acc=account_number, kind="Loan EMI Payment",
                amount_paise=amt, balance_after_paise=new_bal, owner=account_number, when=now)
        return {**base, "loan_id": loan["loan_id"], "loan_name": loan["loan_type"],
                "interest_component": from_paise(pl["interest"]), "principal_component": from_paise(pl["principal"]),
                "outstanding_after": from_paise(pl["outstanding_after"]), "loan_status": status,
                "name": acc["full_name"], "balance_after": from_paise(new_bal)}

    raise AppError("INVALID_KIND", 400)


def deposit(conn, account_number: int, amount_paise: int) -> dict:
    acc = get_account(conn, account_number)
    now = utcnow()
    txid = new_txid()
    new_bal = balance_paise(acc) + amount_paise
    _set_balance(conn, account_number, new_bal)
    _ledger(conn, txid=txid, from_acc=account_number, to_acc=account_number, kind="Deposit",
            amount_paise=amount_paise, balance_after_paise=new_bal, owner=account_number, when=now)
    return {"kind": "deposit", "transaction_id": txid, "timestamp": iso(ts(now)), "amount": from_paise(amount_paise),
            "name": acc["full_name"], "balance_after": from_paise(new_bal)}


# ---- presentation helpers ------------------------------------------------------------------------------------
def tx_row_to_item(r, owner: int) -> dict:
    kind = r["transaction_type"]
    amount = r["amount"] or 0
    if kind == "Transfer":
        direction = "out" if r["from_account"] == owner else "in"
    elif kind in ("Withdrawal", "Loan EMI Payment"):
        direction = "out"
    elif kind in ("Deposit", "Loan Disbursement"):
        direction = "in"
    else:                                   # Admin Balance Update stores a signed delta
        direction = "in" if amount >= 0 else "out"
    other = None
    if kind == "Transfer":
        other = r["to_account"] if direction == "out" else r["from_account"]
    return {
        "id": r["id"],
        "transaction_id": r["transaction_id"],
        "type": kind,
        "direction": direction,
        "amount": abs(amount),
        "balance_after": r["balance_after"],
        "counterparty_name": r["other_name"] if "other_name" in r.keys() else None,
        "counterparty_masked": mask_digits(other) if other else None,
        "timestamp": iso(r["timestamp"]),
    }
