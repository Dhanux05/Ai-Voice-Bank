"""Loan products and EMI maths (reducing balance). All amounts returned in paise."""
from ..money import to_paise

# Annual percentage rates; limits in rupees / months
LOAN_TYPES = {
    "personal": {"name": "Personal Loan", "interest_rate": 12.5, "min_amount": 10000, "max_amount": 1000000, "min_tenure": 6, "max_tenure": 60},
    "home": {"name": "Home Loan", "interest_rate": 8.5, "min_amount": 100000, "max_amount": 10000000, "min_tenure": 12, "max_tenure": 360},
    "vehicle": {"name": "Vehicle Loan", "interest_rate": 9.5, "min_amount": 50000, "max_amount": 2000000, "min_tenure": 12, "max_tenure": 84},
    "education": {"name": "Education Loan", "interest_rate": 7.5, "min_amount": 20000, "max_amount": 2000000, "min_tenure": 12, "max_tenure": 120},
    "gold": {"name": "Gold Loan", "interest_rate": 10.5, "min_amount": 5000, "max_amount": 500000, "min_tenure": 3, "max_tenure": 36},
    "business": {"name": "Business Loan", "interest_rate": 13.5, "min_amount": 50000, "max_amount": 5000000, "min_tenure": 6, "max_tenure": 84},
}
NAME_TO_KEY = {v["name"]: k for k, v in LOAN_TYPES.items()}


def calculate_emi(principal_paise: int, annual_rate: float, months: int) -> dict:
    """EMI = P*r*(1+r)^n / ((1+r)^n - 1). Returns paise values."""
    principal = principal_paise / 100
    r = annual_rate / 12 / 100
    if r == 0:
        emi = principal / months
    else:
        f = (1 + r) ** months
        emi = principal * r * f / (f - 1)
    emi_p = to_paise(round(emi, 2))
    total_p = emi_p * months
    return {"emi": emi_p, "total_payable": total_p, "total_interest": total_p - principal_paise}


def interest_for(outstanding_paise: int, annual_rate: float) -> int:
    return to_paise(round(outstanding_paise / 100 * annual_rate / 12 / 100, 2))
