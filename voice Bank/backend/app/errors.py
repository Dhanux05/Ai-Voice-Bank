"""Uniform error shape: {"code": "...", "message": "...", ...extra}. The browser translates by code."""
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

MESSAGES = {
    "INVALID_CREDENTIALS": "Phone number or PIN is incorrect.",
    "INVALID_PIN": "Incorrect PIN.",
    "PIN_REQUIRED": "Enter your PIN to continue.",
    "ACCOUNT_LOCKED": "Too many wrong PINs. Account temporarily locked.",
    "ACCOUNT_DISABLED": "This account has been disabled. Please contact the bank.",
    "UNAUTHORIZED": "Please log in again.",
    "ADMIN_UNAUTHORIZED": "Invalid admin token.",
    "ADMIN_NOT_CONFIGURED": "ADMIN_TOKEN is not set on the server.",
    "PHONE_EXISTS": "This phone number is already registered.",
    "ACCOUNT_EXISTS": "This account number is already taken.",
    "RECIPIENT_NOT_FOUND": "No account found for that phone number.",
    "SELF_TRANSFER": "You cannot send money to yourself.",
    "INSUFFICIENT_FUNDS": "Insufficient balance.",
    "TOKEN_INVALID": "Confirmation is invalid.",
    "TOKEN_EXPIRED": "Confirmation expired. Please start again.",
    "TOKEN_USED": "This confirmation was already used.",
    "RISK_ACK_REQUIRED": "High-risk transaction needs your explicit approval.",
    "LOAN_NOT_FOUND": "Loan not found.",
    "LOAN_CLOSED": "This loan is already closed.",
    "AMOUNT_EXCEEDS_DUE": "Payment is more than the amount due.",
    "LOAN_AMOUNT_RANGE": "Loan amount is outside the allowed range.",
    "LOAN_TENURE_RANGE": "Loan tenure is outside the allowed range.",
    "INVALID_LOAN_TYPE": "Unknown loan type.",
    "ACCOUNT_NOT_FOUND": "Account not found.",
    "ACCOUNT_HAS_HISTORY": "Account has transactions or loans and cannot be deleted.",
    "FIELD_READONLY": "This field cannot be changed.",
    "TTS_UNAVAILABLE": "Voice service is not available.",
    "RATE_LIMITED": "Too many requests.",
}


class AppError(Exception):
    def __init__(self, code: str, status: int = 400, message: str | None = None, **extra):
        self.code = code
        self.status = status
        self.message = message or MESSAGES.get(code, code)
        self.extra = extra


def _field_code(field: str) -> str:
    mapping = {
        "full_name": "INVALID_NAME",
        "account_number": "INVALID_ACCOUNT_NUMBER",
        "to_phone": "INVALID_PHONE",
        "tenure_months": "INVALID_TENURE",
        "loan_type": "INVALID_LOAN_TYPE",
        "pin": "PIN_FORMAT",
    }
    return mapping.get(field, "INVALID_" + field.upper())


def install(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def _app_error(_: Request, exc: AppError):
        return JSONResponse(
            status_code=exc.status,
            content={"code": exc.code, "message": exc.message, **exc.extra},
        )

    @app.exception_handler(RequestValidationError)
    async def _validation(_: Request, exc: RequestValidationError):
        errors = exc.errors()
        for err in errors:
            if err.get("type") == "extra_forbidden":
                field = str(err["loc"][-1])
                return JSONResponse(
                    status_code=422,
                    content={"code": "FIELD_READONLY", "message": MESSAGES["FIELD_READONLY"], "field": field},
                )
        first = errors[0] if errors else {"loc": ("body", "input")}
        field = str(first["loc"][-1])
        return JSONResponse(
            status_code=422,
            content={"code": _field_code(field), "message": f"Invalid value for {field}.", "field": field},
        )
