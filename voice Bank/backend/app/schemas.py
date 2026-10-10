"""Request models (pydantic v2). Strict validation: bad money/PIN/phone input never reaches the DB."""
from decimal import Decimal
from typing import Annotated, Literal, Optional

from pydantic import BaseModel, BeforeValidator, ConfigDict, Field, StringConstraints

from .config import settings


def _digits(value):
    """Keep only digits (so '98765 43210' or '+91 98765-43210' works)."""
    if isinstance(value, str):
        d = "".join(ch for ch in value if ch.isdigit())
        if len(d) == 12 and d.startswith("91"):
            d = d[2:]
        return d
    return value


Phone = Annotated[str, BeforeValidator(_digits), StringConstraints(pattern=r"^\d{10}$")]
AccountNumber = Annotated[str, BeforeValidator(_digits), StringConstraints(pattern=r"^\d{4,12}$")]
Pin = Annotated[str, StringConstraints(pattern=r"^\d{4}$")]
Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=60)]
Amount = Annotated[Decimal, Field(gt=0, le=Decimal(settings.max_amount), max_digits=12, decimal_places=2)]


class RegisterIn(BaseModel):
    full_name: Name
    phone: Phone
    account_number: Optional[AccountNumber] = None   # normally omitted: the server issues a random number
    pin: Pin
    branch_name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=50)] = "Main Branch"


class LoginIn(BaseModel):
    phone: Phone
    pin: Pin


class DepositIn(BaseModel):
    amount: Amount


class PreviewIn(BaseModel):
    kind: Literal["withdraw", "transfer", "loan_apply", "loan_pay"]
    amount: Optional[Amount] = None
    to_phone: Optional[Phone] = None
    loan_type: Optional[str] = None
    tenure_months: Optional[int] = Field(default=None, ge=1, le=600)
    loan_id: Optional[str] = Field(default=None, max_length=40)


class ConfirmIn(BaseModel):
    token: str = Field(min_length=10, max_length=200)
    pin: Pin
    acknowledge_risk: bool = False


class EmiIn(BaseModel):
    loan_type: str
    amount: Amount
    tenure_months: int = Field(ge=1, le=600)


class AdminUpdateIn(BaseModel):
    """Only name and phone are editable. Any other field (pin, account_number, ...) is rejected."""
    model_config = ConfigDict(extra="forbid")
    full_name: Optional[Name] = None
    phone: Optional[Phone] = None


class AdminBalanceIn(BaseModel):
    balance: Annotated[Decimal, Field(ge=0, le=Decimal(settings.max_amount) * 100, max_digits=14, decimal_places=2)]
