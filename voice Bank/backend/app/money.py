"""Money is handled as integer paise internally; the DB keeps rupees (REAL) for compatibility."""
from decimal import ROUND_HALF_UP, Decimal


def to_paise(value) -> int:
    if value is None:
        return 0
    return int((Decimal(str(value)) * 100).quantize(Decimal(1), rounding=ROUND_HALF_UP))


def from_paise(paise: int) -> float:
    return float(Decimal(int(paise)) / 100)
