from fastapi import APIRouter, Depends, Query

from ..db import get_db, immediate
from ..schemas import DepositIn
from ..security import verified_account
from ..money import to_paise
from ..services import banking
from .auth import public_account

router = APIRouter(prefix="/api", tags=["account"])


@router.get("/balance")
def balance(acc=Depends(verified_account)):
    return public_account(acc)


@router.get("/transactions")
def transactions(limit: int = Query(20, ge=1, le=100), offset: int = Query(0, ge=0),
                 acc=Depends(verified_account), conn=Depends(get_db)):
    owner = acc["account_number"]
    rows = conn.execute(
        """SELECT t.*, a.full_name AS other_name
           FROM transactions t
           LEFT JOIN accounts a
             ON t.transaction_type='Transfer'
            AND a.account_number = CASE WHEN t.from_account=? THEN t.to_account ELSE t.from_account END
           WHERE t.owner_account=?
           ORDER BY t.id DESC LIMIT ? OFFSET ?""",
        (owner, owner, limit, offset),
    ).fetchall()
    total = conn.execute("SELECT COUNT(*) c FROM transactions WHERE owner_account=?", (owner,)).fetchone()["c"]
    return {"total": total, "limit": limit, "offset": offset,
            "items": [banking.tx_row_to_item(r, owner) for r in rows]}


@router.post("/deposit")
def deposit(body: DepositIn, acc=Depends(verified_account), conn=Depends(get_db)):
    with immediate(conn):
        return banking.deposit(conn, acc["account_number"], to_paise(body.amount))
