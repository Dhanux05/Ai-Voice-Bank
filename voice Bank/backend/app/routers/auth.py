import secrets
import sqlite3

from fastapi import APIRouter, Depends

from ..db import get_db, immediate
from ..errors import AppError
from ..schemas import LoginIn, RegisterIn
from ..security import check_pin, create_session, current_account, hash_pin
from ..services.banking import get_account_by_phone
from ..money import from_paise, to_paise

router = APIRouter(prefix="/api/auth", tags=["auth"])


def public_account(row) -> dict:
    return {
        "account_number": row["account_number"],
        "full_name": row["full_name"],
        "phone": row["phone"],
        "branch_name": row["branch_name"],
        "balance": from_paise(to_paise(row["balance"] or 0)),
    }


@router.post("/register", status_code=201)
def register(body: RegisterIn, conn=Depends(get_db)):
    requested = int(body.account_number) if body.account_number else None
    if requested is not None and requested <= 0:
        raise AppError("INVALID_ACCOUNT_NUMBER", 422)
    try:
        with immediate(conn):
            if conn.execute("SELECT 1 FROM accounts WHERE phone=?", (body.phone,)).fetchone():
                raise AppError("PHONE_EXISTS", 409)
            if requested is not None:
                account_number = requested
                if conn.execute("SELECT 1 FROM accounts WHERE account_number=?", (account_number,)).fetchone():
                    raise AppError("ACCOUNT_EXISTS", 409)
            else:                                    # random 12-digit number, never starting with 0, guaranteed unused
                for _ in range(30):
                    account_number = secrets.randbelow(9 * 10**11) + 10**11
                    if not conn.execute("SELECT 1 FROM accounts WHERE account_number=?", (account_number,)).fetchone():
                        break
                else:
                    raise AppError("ACCOUNT_EXISTS", 409)
            conn.execute(
                """INSERT INTO accounts(account_number, full_name, branch_name, balance, pin, phone, pin_attempts, created_at)
                   VALUES (?,?,?,?,?,?,0,datetime('now'))""",
                (account_number, body.full_name, body.branch_name, 0, hash_pin(body.pin), body.phone),
            )
    except sqlite3.IntegrityError:
        raise AppError("ACCOUNT_EXISTS", 409)
    return {
        "account_number": account_number,
        "full_name": body.full_name,
        "phone": body.phone,
        "branch_name": body.branch_name,
        "balance": 0,
    }


@router.post("/login")
def login(body: LoginIn, conn=Depends(get_db)):
    acc = get_account_by_phone(conn, body.phone)
    if not acc:
        raise AppError("INVALID_CREDENTIALS", 401)
    check_pin(conn, acc, body.pin, login=True)
    acc = conn.execute("SELECT * FROM accounts WHERE account_number=?", (acc["account_number"],)).fetchone()
    return {"token": create_session(acc["account_number"]), "account": public_account(acc)}


@router.get("/me")
def me(acc=Depends(current_account)):
    d = public_account(acc)
    d.pop("balance")                      # the balance is only shown after the PIN is entered again
    return d
