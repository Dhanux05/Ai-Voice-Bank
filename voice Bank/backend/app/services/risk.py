"""Smart transaction risk detection: transparent, rule-based, unit-testable.

score() is a pure function: give it the facts, get {"score", "level", "reasons"} back.
Reason codes are translated in the browser (en / hi / kn).
"""
from datetime import timedelta
from statistics import mean

from ..config import settings

# points added per signal
W = {
    "LARGE_SHARE_OF_BALANCE": 25,      # >= 50% of balance
    "ALMOST_ALL_OF_BALANCE": 45,       # >= 80% of balance (replaces the line above)
    "ABOVE_USUAL_AMOUNT": 25,          # > 3x the user's average debit (needs >= 3 past debits)
    "NEW_BIGGEST_AMOUNT": 15,          # bigger than anything sent before
    "NEW_RECIPIENT": 15,
    "RAPID_TRANSACTIONS": 25,          # >= 3 debits in 10 minutes
    "MANY_TODAY": 15,                  # >= 5 debits in 24 hours
    "UNUSUAL_HOUR": 15,                # 00:00-04:59 local time
    "RECENT_FAILED_PINS": 20,          # >= 2 wrong PINs in 24 hours
    "REPEATED_AMOUNT": 10,             # same amount >= 2 times in 24 hours
    "ROUND_LARGE_AMOUNT": 10,          # round figure >= 50,000
    "HIGH_VALUE": 20,                  # >= 1,00,000
    "MULTIPLE_LOANS_TODAY": 30,        # loan applications repeated within 24 hours
    "LARGE_LOAN": 15,                  # >= 5,00,000 loan
}


def level_for(score: int) -> str:
    if score >= settings.risk_high:
        return "high"
    if score >= settings.risk_medium:
        return "medium"
    return "low"


def score(*, kind, amount_paise, balance_paise, debits, now, recent_pin_fails=0,
          is_new_recipient=False, loans_last_24h=0) -> dict:
    """
    debits: list of past outgoing amounts [{"amount_paise": int, "ts": aware datetime}] (newest first or any order)
    now: aware UTC datetime
    """
    reasons: list[str] = []
    pts = 0

    def add(code, points=None):
        nonlocal pts
        if code not in reasons:
            reasons.append(code)
            pts += W[code] if points is None else points

    amount = amount_paise / 100

    # -- time of day (local)
    local_hour = (now + timedelta(minutes=settings.tz_offset_minutes)).hour
    if local_hour < 5:
        add("UNUSUAL_HOUR")

    if recent_pin_fails >= 2:
        add("RECENT_FAILED_PINS")

    if kind == "loan_apply":
        if loans_last_24h >= 1:
            add("MULTIPLE_LOANS_TODAY")
        if amount >= 500000:
            add("LARGE_LOAN")
    else:
        # -- size relative to balance (balance BEFORE the debit)
        if balance_paise > 0:
            share = amount_paise / balance_paise
            if share >= 0.8:
                add("ALMOST_ALL_OF_BALANCE")
            elif share >= 0.5:
                add("LARGE_SHARE_OF_BALANCE")

        # -- size relative to history
        past = [d["amount_paise"] for d in debits]
        if len(past) >= 3:
            avg = mean(past)
            if avg > 0 and amount_paise > 3 * avg:
                add("ABOVE_USUAL_AMOUNT")
        if past and amount_paise > max(past) and "ABOVE_USUAL_AMOUNT" not in reasons:
            add("NEW_BIGGEST_AMOUNT")

        if kind == "transfer" and is_new_recipient:
            add("NEW_RECIPIENT")

        # -- velocity
        ten = [d for d in debits if d["ts"] >= now - timedelta(minutes=10)]
        day = [d for d in debits if d["ts"] >= now - timedelta(hours=24)]
        if len(ten) >= 3:
            add("RAPID_TRANSACTIONS")
        if len(day) >= 5:
            add("MANY_TODAY")
        if sum(1 for d in day if d["amount_paise"] == amount_paise) >= 2:
            add("REPEATED_AMOUNT")

        # -- size on its own
        if amount >= 100000:
            add("HIGH_VALUE")
        if amount >= 50000 and amount % 10000 == 0:
            add("ROUND_LARGE_AMOUNT")

    pts = min(100, pts)
    return {"score": pts, "level": level_for(pts), "reasons": reasons}
