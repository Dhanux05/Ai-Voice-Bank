"""Two-step money movement: /preview (validate + risk + token) then /confirm (PIN + execute)."""
import json

from fastapi import APIRouter, Depends

from ..db import get_db, immediate, ts, utcnow
from ..errors import AppError
from ..money import from_paise, to_paise
from ..schemas import ConfirmIn, PreviewIn
from ..security import check_pin, current_account
from ..services import banking, confirmation, risk

router = APIRouter(prefix="/api/tx", tags=["transactions"])


def _payload(body: PreviewIn) -> dict:
    if body.kind in ("withdraw", "transfer", "loan_apply") and body.amount is None:
        raise AppError("INVALID_AMOUNT", 422)
    if body.kind == "transfer" and not body.to_phone:
        raise AppError("INVALID_PHONE", 422)
    if body.kind == "loan_apply" and (not body.loan_type or not body.tenure_months):
        raise AppError("INVALID_LOAN_TYPE" if not body.loan_type else "INVALID_TENURE", 422)
    if body.kind == "loan_pay" and not body.loan_id:
        raise AppError("LOAN_NOT_FOUND", 404)
    p: dict = {}
    if body.amount is not None:
        p["amount_paise"] = to_paise(body.amount)
    if body.kind == "transfer":
        p["to_phone"] = body.to_phone
    if body.kind == "loan_apply":
        p["loan_type"] = body.loan_type
        p["tenure_months"] = body.tenure_months
    if body.kind == "loan_pay":
        p["loan_id"] = body.loan_id
    return p


@router.post("/preview")
def preview(body: PreviewIn, acc=Depends(current_account), conn=Depends(get_db)):
    p = _payload(body)
    pl = banking.plan(conn, acc, body.kind, p)
    now = utcnow()
    acc_no = acc["account_number"]

    assessment = risk.score(
        kind=body.kind,
        amount_paise=pl["amount_paise"],
        balance_paise=banking.balance_paise(acc),
        debits=banking.debit_history(conn, acc_no, now),
        now=now,
        recent_pin_fails=banking.recent_pin_fails(conn, acc_no, now),
        is_new_recipient=pl["new_recipient"],
        loans_last_24h=banking.loans_last_24h(conn, acc_no, now),
    )
    cur = conn.execute(
        "INSERT INTO risk_events(account_number, kind, amount, score, level, reasons, created_at) VALUES (?,?,?,?,?,?,?)",
        (acc_no, body.kind, from_paise(pl["amount_paise"]), assessment["score"], assessment["level"],
         json.dumps(assessment["reasons"]), ts(now)),
    )
    token, expires = confirmation.create(conn, acc_no, body.kind, p, assessment["level"], cur.lastrowid)
    return {
        "token": token,
        "expires_at": expires.replace(" ", "T") + "Z",
        "summary": pl["summary"],
        "risk": assessment,
        "requires_acknowledgement": assessment["level"] == "high",
    }


@router.post("/confirm")
def confirm(body: ConfirmIn, acc=Depends(current_account), conn=Depends(get_db)):
    acc_no = acc["account_number"]
    tok = confirmation.peek(conn, acc_no, body.token)            # exists, mine, unused, not expired
    if tok["risk_level"] == "high" and not body.acknowledge_risk:
        raise AppError("RISK_ACK_REQUIRED", 400)
    check_pin(conn, acc, body.pin)                                # wrong PIN never consumes the token

    try:
        with immediate(conn):
            row, payload = confirmation.consume(conn, acc_no, body.token)
            result = banking.apply(conn, acc_no, row["kind"], payload)
    except AppError:
        if tok["risk_event_id"]:
            conn.execute("UPDATE risk_events SET outcome='failed' WHERE id=?", (tok["risk_event_id"],))
        raise
    if tok["risk_event_id"]:
        conn.execute("UPDATE risk_events SET outcome='completed' WHERE id=?", (tok["risk_event_id"],))
    result["risk_level"] = tok["risk_level"]
    return result
