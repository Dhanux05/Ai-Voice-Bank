"""Add two DEMO accounts if the database has no accounts.   python -m app.scripts.seed

  phone 9876543210  PIN 1234  (Manju Kumar)
  phone 9876543211  PIN 5678  (Ravi Singh)
"""
from ..db import connect
from ..schema import ensure_schema
from ..security import hash_pin

DEMO = [
    (100000000001, "Manju Kumar", "Bangalore Main", 5000, "1234", "manju@example.com", "9876543210"),
    (100000000002, "Ravi Singh", "Mysore Branch", 3000, "5678", "ravi@example.com", "9876543211"),
]


def main() -> None:
    conn = connect()
    try:
        ensure_schema(conn)
        if conn.execute("SELECT COUNT(*) c FROM accounts").fetchone()["c"]:
            print("Accounts already exist - nothing seeded.")
            return
        for acc, name, branch, bal, pin, email, phone in DEMO:
            conn.execute(
                "INSERT INTO accounts(account_number, full_name, branch_name, balance, pin, email, phone) VALUES (?,?,?,?,?,?,?)",
                (acc, name, branch, bal, hash_pin(pin), email, phone),
            )
        print("Seeded 2 demo accounts (phone 9876543210 / PIN 1234 and phone 9876543211 / PIN 5678).")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
