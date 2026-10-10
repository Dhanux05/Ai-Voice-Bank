import os
import tempfile
from pathlib import Path

os.environ.setdefault("ADMIN_TOKEN", "test-admin")
os.environ.setdefault("SECRET_KEY", "test-secret")

import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.db import connect
from app.main import app
from app.schema import ensure_schema
from app.security import hash_pin


@pytest.fixture()
def db_path(tmp_path):
    settings.db_path = str(tmp_path / "test.db")
    settings.admin_token = "test-admin"
    settings.tts_cache_dir = str(tmp_path / "tts")
    conn = connect()
    ensure_schema(conn)
    conn.close()
    return settings.db_path


@pytest.fixture()
def client(db_path):
    with TestClient(app) as c:
        yield c


def make_account(number=100000000001, name="Asha Rao", phone="9876543210", pin="1234", balance=10000):
    conn = connect()
    conn.execute(
        "INSERT INTO accounts(account_number, full_name, branch_name, balance, pin, phone) VALUES (?,?,?,?,?,?)",
        (number, name, "Main Branch", balance, hash_pin(pin), phone),
    )
    conn.close()


def login(client, phone="9876543210", pin="1234"):
    r = client.post("/api/auth/login", json={"phone": phone, "pin": pin})
    assert r.status_code == 200, r.text
    return {"Authorization": "Bearer " + r.json()["token"], "X-Pin": pin}


@pytest.fixture()
def two_users(client):
    make_account()
    make_account(number=100000000002, name="Ravi Singh", phone="9876543211", pin="5678", balance=3000)
    return client
