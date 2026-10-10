"""Upgrade your existing bank.db (from the Node version) in place.

Run from the backend folder:   python -m app.scripts.migrate_legacy
It makes a timestamped backup first, hashes plain-text PINs, adds the new tables/columns and
rebuilds per-account history ownership. Safe to run more than once.
"""
from ..config import settings
from ..db import connect
from ..schema import backup_db, migrate_legacy


def main() -> None:
    print(f"Database: {settings.db_path}")
    backup = backup_db(settings.db_path)
    print(f"Backup:   {backup or '(no existing database, nothing to back up)'}")
    conn = connect()
    try:
        report = migrate_legacy(conn)
    finally:
        conn.close()
    print("PINs hashed:               ", report["pins_hashed"])
    print("Phone numbers normalised:  ", report["phones_normalised"])
    print("History rows re-assigned:  ", report["owners_backfilled"])
    if report["accounts_without_pin"]:
        print("Accounts with NO PIN (cannot log in until reset in SQL):", report["accounts_without_pin"])
    for note in report["notes"]:
        print("NOTE:", note)
    print("Done.")


if __name__ == "__main__":
    main()
