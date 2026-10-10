"""Create an empty database with all tables.   python -m app.scripts.init_db"""
from ..config import settings
from ..db import connect
from ..schema import ensure_schema


def main() -> None:
    conn = connect()
    try:
        notes = ensure_schema(conn)
    finally:
        conn.close()
    print(f"Database ready: {settings.db_path}")
    for note in notes:
        print("NOTE:", note)


if __name__ == "__main__":
    main()
