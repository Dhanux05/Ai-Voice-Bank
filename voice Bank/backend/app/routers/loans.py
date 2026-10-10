from fastapi import APIRouter, Depends

from ..db import get_db, iso
from ..errors import AppError
from ..money import from_paise, to_paise
from ..schemas import EmiIn
from ..security import current_account
from ..services import banking
from ..services.emi import LOAN_TYPES, calculate_emi

router = APIRouter(prefix="/api/loans", tags=["loans"])


def loan_to_dict(row) -> dict:
    d = banking.loan_dues(row)
    return {
        "loan_id": row["loan_id"],
        "loan_type": row["loan_type"],
        "principal": row["principal"],
        "interest_rate": row["interest_rate"],
        "tenure_months": row["tenure_months"],
        "emi_amount": row["emi_amount"],
        "total_payable": row["total_payable"],
        "outstanding_balance": row["outstanding_balance"],
        "emis_paid": row["emis_paid"],
        "status": row["status"],
        "applied_date": iso(row["applied_date"]),
        "closed_date": iso(row["closed_date"]),
        "next_due": from_paise(d["next_due"]) if row["status"] == "Active" else 0,
        "payoff_amount": from_paise(d["payoff"]) if row["status"] == "Active" else 0,
    }


@router.get("/types")
def types():
    return {"loan_types": [{"key": k, **v} for k, v in LOAN_TYPES.items()]}


@router.post("/calculate-emi")
def calculate(body: EmiIn):
    cfg = LOAN_TYPES.get(body.loan_type)
    if not cfg:
        raise AppError("INVALID_LOAN_TYPE", 400)
    r = calculate_emi(to_paise(body.amount), cfg["interest_rate"], body.tenure_months)
    return {
        "principal": float(body.amount),
        "interest_rate": cfg["interest_rate"],
        "tenure_months": body.tenure_months,
        "emi": from_paise(r["emi"]),
        "total_payable": from_paise(r["total_payable"]),
        "total_interest": from_paise(r["total_interest"]),
    }


@router.get("")
def my_loans(acc=Depends(current_account), conn=Depends(get_db)):
    rows = conn.execute(
        "SELECT * FROM loans WHERE account_number=? ORDER BY applied_date DESC, rowid DESC", (acc["account_number"],)
    ).fetchall()
    return {"loans": [loan_to_dict(r) for r in rows]}


@router.get("/{loan_id}")
def one_loan(loan_id: str, acc=Depends(current_account), conn=Depends(get_db)):
    row = conn.execute(
        "SELECT * FROM loans WHERE loan_id=? AND account_number=?", (loan_id, acc["account_number"])
    ).fetchone()
    if not row:
        raise AppError("LOAN_NOT_FOUND", 404)
    pays = conn.execute(
        "SELECT * FROM loan_payments WHERE loan_id=? ORDER BY id DESC", (loan_id,)
    ).fetchall()
    return {
        "loan": loan_to_dict(row),
        "payments": [
            {
                "payment_id": p["payment_id"], "amount": p["amount"],
                "principal_component": p["principal_component"], "interest_component": p["interest_component"],
                "outstanding_after": p["outstanding_after"], "payment_date": iso(p["payment_date"]),
            }
            for p in pays
        ],
    }
