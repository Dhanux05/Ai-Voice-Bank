import json
import sqlite3
import threading
from datetime import datetime, timedelta, timezone

import pytest

from app.config import settings
from app.db import connect
from app.money import to_paise
from app.services import confirmation, risk
from .conftest import login, make_account


def balance(client, headers):
    return client.get("/api/balance", headers=headers).json()["balance"]


def do_tx(client, headers, body, pin="1234", ack=False):
    p = client.post("/api/tx/preview", json=body, headers=headers)
    assert p.status_code == 200, p.text
    c = client.post("/api/tx/confirm", json={"token": p.json()["token"], "pin": pin, "acknowledge_risk": ack},
                    headers=headers)
    return p.json(), c


# ---------------------------------------------------------------- registration & validation
def test_register_and_login(client):
    r = client.post("/api/auth/register", json={"full_name": "Kiran K", "phone": "9000000001",
                                                "account_number": "123456789012", "pin": "4321"})
    assert r.status_code == 201
    assert client.post("/api/auth/login", json={"phone": "9000000001", "pin": "4321"}).status_code == 200


def test_register_duplicates_and_bad_input(client):
    body = {"full_name": "Kiran K", "phone": "9000000001", "account_number": "1234", "pin": "4321"}
    assert client.post("/api/auth/register", json=body).status_code == 201
    r = client.post("/api/auth/register", json={**body, "account_number": "9999"})
    assert r.status_code == 409 and r.json()["code"] == "PHONE_EXISTS"
    r = client.post("/api/auth/register", json={**body, "phone": "9000000002"})
    assert r.status_code == 409 and r.json()["code"] == "ACCOUNT_EXISTS"
    for bad, code in [({"pin": "12"}, "PIN_FORMAT"), ({"phone": "123"}, "INVALID_PHONE"),
                      ({"account_number": "12"}, "INVALID_ACCOUNT_NUMBER"), ({"full_name": "K"}, "INVALID_NAME")]:
        r = client.post("/api/auth/register", json={**body, "phone": "9000000009", "account_number": "5555", **bad})
        assert r.status_code == 422 and r.json()["code"] == code, (bad, r.text)


def test_pin_is_hashed_and_never_returned(two_users):
    conn = connect()
    stored = conn.execute("SELECT pin FROM accounts WHERE account_number=100000000001").fetchone()["pin"]
    conn.close()
    assert stored.startswith("$2") and stored != "1234"
    h = login(two_users)
    assert "pin" not in json.dumps(two_users.get("/api/balance", headers=h).json()).lower()


def test_legacy_plaintext_pin_is_upgraded_on_login(client):
    conn = connect()
    conn.execute("INSERT INTO accounts(account_number, full_name, balance, pin, phone) VALUES (1111,'Old User',50,'4444','9111111111')")
    conn.close()
    assert client.post("/api/auth/login", json={"phone": "9111111111", "pin": "4444"}).status_code == 200
    conn = connect()
    assert conn.execute("SELECT pin FROM accounts WHERE account_number=1111").fetchone()["pin"].startswith("$2")
    conn.close()


@pytest.mark.parametrize("amount", [0, -5, -0.01, "abc", 1.234, 10**9])
def test_bad_amounts_rejected_everywhere(two_users, amount):
    h = login(two_users)
    assert two_users.post("/api/deposit", json={"amount": amount}, headers=h).status_code == 422
    for body in ({"kind": "withdraw", "amount": amount}, {"kind": "transfer", "amount": amount, "to_phone": "9876543211"}):
        assert two_users.post("/api/tx/preview", json=body, headers=h).status_code == 422
    assert balance(two_users, h) == 10000


def test_authentication_required(two_users):
    for method, path in [("get", "/api/balance"), ("get", "/api/transactions"), ("post", "/api/deposit"),
                         ("post", "/api/tx/preview"), ("get", "/api/loans")]:
        r = getattr(two_users, method)(path)
        assert r.status_code in (401, 422)
    assert two_users.get("/api/balance", headers={"Authorization": "Bearer junk.token"}).status_code == 401


# ---------------------------------------------------------------- lockout
def test_pin_lockout_after_five_failures(two_users):
    for i in range(4):
        r = two_users.post("/api/auth/login", json={"phone": "9876543210", "pin": "0000"})
        assert r.status_code == 401
    r = two_users.post("/api/auth/login", json={"phone": "9876543210", "pin": "0000"})
    assert r.status_code == 423 and r.json()["code"] == "ACCOUNT_LOCKED"
    r = two_users.post("/api/auth/login", json={"phone": "9876543210", "pin": "1234"})   # correct PIN still locked
    assert r.status_code == 423


# ---------------------------------------------------------------- transfers, history
def test_transfer_moves_money_atomically_and_history_is_clean(two_users):
    a, b = login(two_users), login(two_users, "9876543211", "5678")
    prev, res = do_tx(two_users, a, {"kind": "transfer", "amount": 2500.50, "to_phone": "9876543211"})
    assert res.status_code == 200, res.text
    assert balance(two_users, a) == 7499.50 and balance(two_users, b) == 5500.50
    ha = two_users.get("/api/transactions", headers=a).json()
    hb = two_users.get("/api/transactions", headers=b).json()
    assert ha["total"] == 1 and hb["total"] == 1                     # no duplicate rows
    assert ha["items"][0]["direction"] == "out" and ha["items"][0]["balance_after"] == 7499.50
    assert hb["items"][0]["direction"] == "in" and hb["items"][0]["balance_after"] == 5500.50
    assert ha["items"][0]["counterparty_name"] == "Ravi Singh"
    assert hb["items"][0]["counterparty_name"] == "Asha Rao"


def test_transfer_errors(two_users):
    a = login(two_users)
    r = two_users.post("/api/tx/preview", json={"kind": "transfer", "amount": 10, "to_phone": "9876543210"}, headers=a)
    assert r.json()["code"] == "SELF_TRANSFER"
    r = two_users.post("/api/tx/preview", json={"kind": "transfer", "amount": 10, "to_phone": "9000000000"}, headers=a)
    assert r.json()["code"] == "RECIPIENT_NOT_FOUND"
    r = two_users.post("/api/tx/preview", json={"kind": "transfer", "amount": 99999, "to_phone": "9876543211"}, headers=a)
    assert r.json()["code"] == "INSUFFICIENT_FUNDS"


def test_failed_transaction_rolls_back_everything(two_users):
    a = login(two_users)
    p = two_users.post("/api/tx/preview", json={"kind": "withdraw", "amount": 9000}, headers=a).json()
    conn = connect()                                                    # money disappears after the preview
    conn.execute("UPDATE accounts SET balance=100 WHERE account_number=100000000001")
    conn.close()
    r = two_users.post("/api/tx/confirm", json={"token": p["token"], "pin": "1234"}, headers=a)
    assert r.json()["code"] == "INSUFFICIENT_FUNDS"
    assert balance(two_users, a) == 100
    conn = connect()
    assert conn.execute("SELECT used FROM confirmation_tokens").fetchone()["used"] == 0   # token not burned
    conn.close()


def test_concurrent_withdrawals_cannot_overdraw(two_users):
    a = login(two_users)
    tokens = [two_users.post("/api/tx/preview", json={"kind": "withdraw", "amount": 6000}, headers=a).json()["token"]
              for _ in range(4)]
    results = []

    def go(t):
        results.append(two_users.post("/api/tx/confirm", json={"token": t, "pin": "1234", "acknowledge_risk": True},
                                      headers=a).status_code)

    threads = [threading.Thread(target=go, args=(t,)) for t in tokens]
    [t.start() for t in threads]
    [t.join() for t in threads]
    assert results.count(200) == 1
    assert balance(two_users, a) == 4000


# ---------------------------------------------------------------- confirmation tokens
def test_token_single_use_expiry_and_binding(two_users):
    a, b = login(two_users), login(two_users, "9876543211", "5678")
    p = two_users.post("/api/tx/preview", json={"kind": "withdraw", "amount": 100}, headers=a).json()
    # another user cannot use it
    r = two_users.post("/api/tx/confirm", json={"token": p["token"], "pin": "5678"}, headers=b)
    assert r.json()["code"] == "TOKEN_INVALID"
    # wrong PIN does not burn it
    r = two_users.post("/api/tx/confirm", json={"token": p["token"], "pin": "9999"}, headers=a)
    assert r.json()["code"] == "INVALID_PIN" and r.json()["attempts_left"] == 4
    assert two_users.post("/api/tx/confirm", json={"token": p["token"], "pin": "1234"}, headers=a).status_code == 200
    r = two_users.post("/api/tx/confirm", json={"token": p["token"], "pin": "1234"}, headers=a)
    assert r.json()["code"] == "TOKEN_USED"
    assert balance(two_users, a) == 9900
    # expiry
    p2 = two_users.post("/api/tx/preview", json={"kind": "withdraw", "amount": 100}, headers=a).json()
    conn = connect()
    conn.execute("UPDATE confirmation_tokens SET expires_at='2000-01-01 00:00:00' WHERE used=0")
    conn.close()
    r = two_users.post("/api/tx/confirm", json={"token": p2["token"], "pin": "1234"}, headers=a)
    assert r.json()["code"] == "TOKEN_EXPIRED"


def test_cannot_move_money_without_confirmation(two_users):
    a = login(two_users)
    for path in ("/api/withdraw", "/api/transfer"):
        assert two_users.post(path, json={"amount": 100}, headers=a).status_code in (404, 405)


def test_high_risk_requires_acknowledgement(two_users):
    a = login(two_users)
    prev = two_users.post("/api/tx/preview", json={"kind": "transfer", "amount": 9500, "to_phone": "9876543211"},
                          headers=a).json()
    assert prev["risk"]["level"] == "high" and prev["requires_acknowledgement"]
    r = two_users.post("/api/tx/confirm", json={"token": prev["token"], "pin": "1234"}, headers=a)
    assert r.json()["code"] == "RISK_ACK_REQUIRED"
    r = two_users.post("/api/tx/confirm", json={"token": prev["token"], "pin": "1234", "acknowledge_risk": True}, headers=a)
    assert r.status_code == 200
    conn = connect()
    ev = conn.execute("SELECT * FROM risk_events ORDER BY id DESC").fetchone()
    conn.close()
    assert ev["level"] == "high" and ev["outcome"] == "completed"


# ---------------------------------------------------------------- loans
def test_loan_apply_and_repay_to_closure(two_users):
    a = login(two_users)
    prev, res = do_tx(two_users, a, {"kind": "loan_apply", "loan_type": "gold", "amount": 6000, "tenure_months": 3},
                      ack=True)
    assert res.status_code == 200, res.text
    loan_id = res.json()["loan_id"]
    assert balance(two_users, a) == 16000
    loans = two_users.get("/api/loans", headers=a).json()["loans"]
    assert loans[0]["status"] == "Active" and loans[0]["payoff_amount"] > 6000
    # pay more than due is rejected
    r = two_users.post("/api/tx/preview", json={"kind": "loan_pay", "loan_id": loan_id, "amount": 99999}, headers=a)
    assert r.json()["code"] in ("AMOUNT_EXCEEDS_DUE", "INSUFFICIENT_FUNDS")
    for _ in range(5):
        loan = two_users.get("/api/loans", headers=a).json()["loans"][0]
        if loan["status"] == "Closed":
            break
        _, res = do_tx(two_users, a, {"kind": "loan_pay", "loan_id": loan_id}, ack=True)
        assert res.status_code == 200, res.text
    loan = two_users.get(f"/api/loans/{loan_id}", headers=a).json()
    assert loan["loan"]["status"] == "Closed" and loan["loan"]["outstanding_balance"] == 0
    assert len(loan["payments"]) == loan["loan"]["emis_paid"] >= 3


def test_loan_limits_and_isolation(two_users):
    a, b = login(two_users), login(two_users, "9876543211", "5678")
    r = two_users.post("/api/tx/preview", json={"kind": "loan_apply", "loan_type": "gold", "amount": 100, "tenure_months": 3}, headers=a)
    assert r.json()["code"] == "LOAN_AMOUNT_RANGE"
    r = two_users.post("/api/tx/preview", json={"kind": "loan_apply", "loan_type": "nope", "amount": 6000, "tenure_months": 3}, headers=a)
    assert r.json()["code"] == "INVALID_LOAN_TYPE"
    _, res = do_tx(two_users, a, {"kind": "loan_apply", "loan_type": "gold", "amount": 6000, "tenure_months": 3}, ack=True)
    loan_id = res.json()["loan_id"]
    assert two_users.get(f"/api/loans/{loan_id}", headers=b).status_code == 404
    r = two_users.post("/api/tx/preview", json={"kind": "loan_pay", "loan_id": loan_id}, headers=b)
    assert r.json()["code"] == "LOAN_NOT_FOUND"


def test_emi_calculator_public(client):
    r = client.post("/api/loans/calculate-emi", json={"loan_type": "personal", "amount": 100000, "tenure_months": 12})
    assert r.status_code == 200
    r_ = 12.5 / 12 / 100
    expected = 100000 * r_ * (1 + r_) ** 12 / ((1 + r_) ** 12 - 1)          # standard EMI formula
    assert abs(r.json()["emi"] - expected) < 0.01


# ---------------------------------------------------------------- admin
def test_admin_requires_token(two_users):
    assert two_users.get("/api/admin/users").status_code == 401
    assert two_users.get("/api/admin/users", headers={"X-Admin-Token": "wrong"}).status_code == 401
    settings.admin_token = ""
    assert two_users.get("/api/admin/users", headers={"X-Admin-Token": ""}).status_code == 503


def test_admin_edits_only_name_phone_balance(two_users):
    H = {"X-Admin-Token": "test-admin"}
    users = two_users.get("/api/admin/users", headers=H).json()["users"]
    assert len(users) == 2 and all("pin" not in u for u in users)
    r = two_users.put("/api/admin/users/100000000001", json={"full_name": "Asha R", "phone": "9000000099"}, headers=H)
    assert r.status_code == 200 and r.json()["user"]["full_name"] == "Asha R"
    for forbidden in ({"pin": "1111"}, {"account_number": 5}, {"branch_name": "X"}):
        r = two_users.put("/api/admin/users/100000000001", json=forbidden, headers=H)
        assert r.status_code == 422 and r.json()["code"] == "FIELD_READONLY"
    r = two_users.put("/api/admin/users/100000000001", json={"phone": "9876543211"}, headers=H)
    assert r.json()["code"] == "PHONE_EXISTS"
    r = two_users.put("/api/admin/users/100000000001/balance", json={"balance": 12345.5}, headers=H)
    assert r.json()["new_balance"] == 12345.5
    h = login(two_users, "9000000099", "1234")                    # PIN untouched, new phone works
    items = two_users.get("/api/transactions", headers=h).json()["items"]
    assert items[0]["type"] == "Admin Balance Update" and items[0]["direction"] == "in"
    assert two_users.put("/api/admin/users/100000000001/balance", json={"balance": -1}, headers=H).status_code == 422


def test_admin_delete_guard_and_stats(two_users):
    H = {"X-Admin-Token": "test-admin"}
    a = login(two_users)
    do_tx(two_users, a, {"kind": "withdraw", "amount": 100})
    assert two_users.delete("/api/admin/users/100000000001", headers=H).json()["code"] == "ACCOUNT_HAS_HISTORY"
    make_account(number=7777, phone="9222222222", name="Temp")
    assert two_users.delete("/api/admin/users/7777", headers=H).status_code == 200
    s = two_users.get("/api/admin/stats", headers=H).json()
    assert s["accounts"]["total"] == 2
    assert two_users.get("/api/admin/risk-events?level=low", headers=H).status_code == 200


# ---------------------------------------------------------------- risk engine (pure)
NOW = datetime(2026, 10, 10, 6, 30, tzinfo=timezone.utc)      # 12:00 IST


def hist(*amounts, minutes_ago=600):
    return [{"amount_paise": a * 100, "ts": NOW - timedelta(minutes=minutes_ago + i)} for i, a in enumerate(amounts)]


def test_risk_low_for_normal_payment():
    r = risk.score(kind="transfer", amount_paise=50000, balance_paise=10_000_000, debits=hist(400, 600, 500),
                   now=NOW, is_new_recipient=False)
    assert r["level"] == "low" and r["reasons"] == []


def test_risk_signals():
    base = dict(kind="transfer", balance_paise=10_000_000, now=NOW)
    r = risk.score(amount_paise=900_000, debits=hist(400, 600, 500), is_new_recipient=True, **base)
    assert "ABOVE_USUAL_AMOUNT" in r["reasons"] and "NEW_RECIPIENT" in r["reasons"]
    r = risk.score(amount_paise=50_000, debits=hist(500, 500, 500, minutes_ago=1), **base)
    assert "RAPID_TRANSACTIONS" in r["reasons"]
    r = risk.score(amount_paise=50_000, debits=hist(500, 500, minutes_ago=30), **base)
    assert "REPEATED_AMOUNT" in r["reasons"]
    night = datetime(2026, 10, 10, 21, 0, tzinfo=timezone.utc)                  # 02:30 IST
    r = risk.score(kind="withdraw", amount_paise=10_000, balance_paise=10_000_000, debits=[], now=night)
    assert "UNUSUAL_HOUR" in r["reasons"]
    r = risk.score(kind="withdraw", amount_paise=9_000_000, balance_paise=10_000_000, debits=[], now=NOW)
    assert "ALMOST_ALL_OF_BALANCE" in r["reasons"] and "LARGE_SHARE_OF_BALANCE" not in r["reasons"]
    r = risk.score(kind="withdraw", amount_paise=5_000_000, balance_paise=100_000_000, debits=[], now=NOW)
    assert {"ROUND_LARGE_AMOUNT"} <= set(r["reasons"])
    r = risk.score(kind="withdraw", amount_paise=1000, balance_paise=10_000_000, debits=[], now=NOW, recent_pin_fails=3)
    assert "RECENT_FAILED_PINS" in r["reasons"]
    r = risk.score(kind="loan_apply", amount_paise=60_000_000, balance_paise=0, debits=[], now=NOW, loans_last_24h=1)
    assert r["level"] in ("medium", "high") and {"MULTIPLE_LOANS_TODAY", "LARGE_LOAN"} <= set(r["reasons"])


# ---------------------------------------------------------------- legacy migration
def test_legacy_migration(tmp_path):
    from app.schema import migrate_legacy
    p = tmp_path / "legacy.db"
    c = sqlite3.connect(p)
    c.row_factory = sqlite3.Row
    c.executescript("""
      CREATE TABLE accounts (account_number INTEGER PRIMARY KEY, full_name VARCHAR(50), branch_name VARCHAR(50),
        balance INTEGER, pin VARCHAR(10), email VARCHAR(100), phone VARCHAR(20));
      CREATE TABLE transactions (id INTEGER PRIMARY KEY AUTOINCREMENT, transaction_id VARCHAR(50) UNIQUE,
        from_account INTEGER, to_account INTEGER, transaction_type VARCHAR(20), amount REAL, balance_after REAL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP);
      INSERT INTO accounts VALUES (1, 'A', 'B', 100, '1234', NULL, '+91 98765 43210');
      INSERT INTO accounts VALUES (2, 'C', 'B', 50, '5678', NULL, '9000000000');
      INSERT INTO transactions(transaction_id, from_account, to_account, transaction_type, amount, balance_after)
        VALUES ('TXN1_S', 1, 2, 'Transfer', 10, 90), ('TXN1_R', 1, 2, 'Transfer', 10, 60), ('TXN2', 1, 1, 'Deposit', 5, 95);
    """)
    rep = migrate_legacy(c)
    assert rep["pins_hashed"] == 2 and rep["phones_normalised"] == 1
    assert c.execute("SELECT phone FROM accounts WHERE account_number=1").fetchone()[0] == "9876543210"
    owners = {r[0]: r[1] for r in c.execute("SELECT transaction_id, owner_account FROM transactions")}
    assert owners == {"TXN1_S": 1, "TXN1_R": 2, "TXN2": 1}
    rep2 = migrate_legacy(c)                                              # idempotent
    assert rep2["pins_hashed"] == 0


# ---------------------------------------------------------------- tts + static safety
def test_tts_validation_and_cache(client, monkeypatch):
    from app.routers import tts as tts_mod

    async def fake(text, voice):
        return b"ID3-fake-" + voice.encode()

    monkeypatch.setattr(tts_mod, "synthesize", fake)
    r = client.get("/api/tts", params={"lang": "kn", "text": "ನಮಸ್ಕಾರ"})
    assert r.status_code == 200 and r.headers["content-type"] == "audio/mpeg" and b"kn-IN" in r.content
    monkeypatch.setattr(tts_mod, "synthesize", None)                       # second call must come from disk cache
    assert client.get("/api/tts", params={"lang": "kn", "text": "ನಮಸ್ಕಾರ"}).status_code == 200
    assert client.get("/api/tts", params={"lang": "fr", "text": "x"}).status_code == 422


def test_tts_unavailable_is_reported(client, monkeypatch):
    from app.routers import tts as tts_mod

    async def boom(text, voice):
        raise OSError("offline")

    monkeypatch.setattr(tts_mod, "synthesize", boom)
    r = client.get("/api/tts", params={"lang": "hi", "text": "नमस्ते"})
    assert r.status_code == 503 and r.json()["code"] == "TTS_UNAVAILABLE"


def test_secrets_not_served(client):
    for path in ("/bank.db", "/backend/.env", "/backend/app/config.py", "/../bank.db", "/test.db"):
        assert client.get(path).status_code in (404, 400)
    assert client.get("/api/health").json()["status"] == "ok"


def test_register_issues_random_account_number(client):
    nums = []
    for i in range(3):
        r = client.post("/api/auth/register", json={"full_name": f"Auto User {i}", "phone": f"90000000{i:02d}", "pin": "1234"})
        assert r.status_code == 201, r.text
        nums.append(r.json()["account_number"])
    assert len(set(nums)) == 3
    assert all(100_000_000_000 <= n <= 999_999_999_999 for n in nums)


def test_balance_history_and_deposit_need_the_pin(two_users):
    from .conftest import login
    h = login(two_users)
    bearer = {"Authorization": h["Authorization"]}
    for method, path, kw in [("get", "/api/balance", {}), ("get", "/api/transactions", {}), ("post", "/api/deposit", {"json": {"amount": 10}})]:
        r = getattr(two_users, method)(path, headers=bearer, **kw)
        assert r.status_code == 401 and r.json()["code"] == "PIN_REQUIRED"
        r = getattr(two_users, method)(path, headers={**bearer, "X-Pin": "0000"}, **kw)
        assert r.status_code == 401 and r.json()["code"] == "INVALID_PIN"
    assert two_users.get("/api/balance", headers=h).status_code == 200
    assert "balance" not in two_users.get("/api/auth/me", headers=bearer).json()


# ---------------------------------------------------------------- admin panel: disable, detail, dashboard
def test_admin_disable_enable_and_detail(two_users):
    H = {"X-Admin-Token": "test-admin"}
    a = login(two_users)
    _, res = do_tx(two_users, a, {"kind": "loan_apply", "loan_type": "gold", "amount": 6000, "tenure_months": 3}, ack=True)
    loan_id = res.json()["loan_id"]
    do_tx(two_users, a, {"kind": "loan_pay", "loan_id": loan_id, "amount": 2100}, ack=True)
    d = two_users.get("/api/admin/users/100000000001/detail", headers=H).json()
    assert d["user"]["disabled"] is False and d["loans"][0]["amount_paid"] > 0
    assert d["loans"][0]["remaining_payable"] < d["loans"][0]["total_payable"] and 0 < d["loans"][0]["progress"] < 100
    assert d["transactions"] and d["summary"]["transactions"] >= 2
    dash = two_users.get("/api/admin/dashboard", headers=H).json()
    assert dash["users"]["total"] == 2 and dash["loans"]["active"] == 1 and dash["loans"]["collected"] > 0
    # disable: login, existing session and incoming transfers are all blocked
    assert two_users.post("/api/admin/users/100000000001/disable", headers=H).json()["user"]["disabled"] is True
    r = two_users.post("/api/auth/login", json={"phone": "9876543210", "pin": "1234"})
    assert r.status_code == 403 and r.json()["code"] == "ACCOUNT_DISABLED"
    assert two_users.get("/api/balance", headers=a).json()["code"] == "ACCOUNT_DISABLED"
    b = login(two_users, "9876543211", "5678")
    p = two_users.post("/api/tx/preview", json={"kind": "transfer", "to_phone": "9876543210", "amount": 10}, headers=b)
    assert p.status_code == 404
    assert two_users.post("/api/admin/users/100000000001/enable", headers=H).json()["user"]["disabled"] is False
    login(two_users)
    assert two_users.get("/api/admin/transactions?type=Deposit&q=x", headers=H).status_code == 200
    assert two_users.get("/api/admin/loans?status=Active", headers=H).json()["count"] == 1
