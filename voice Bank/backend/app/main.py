"""AI Voice Banking - FastAPI application.

Run from the backend folder:   uvicorn app.main:app --reload --port 5000
Open:                          http://localhost:5000        (API docs: /docs)
"""
import contextlib
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from . import errors
from .config import settings
from .db import connect
from .routers import accounts, admin, auth, loans, tts, tx
from .schema import ensure_schema


@contextlib.asynccontextmanager
async def lifespan(_: FastAPI):
    conn = connect()
    try:
        for note in ensure_schema(conn):
            print("[startup] NOTE:", note)
    finally:
        conn.close()
    if not settings.admin_token:
        print("[startup] ADMIN_TOKEN is not set - the admin panel is disabled until you set it in backend/.env")
    yield


app = FastAPI(title="AI Voice Banking", version="2.0.0", lifespan=lifespan)
errors.install(app)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_origins.split(",") if o.strip()],
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Authorization", "Content-Type", "X-Admin-Token"],
)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("Referrer-Policy", "same-origin")
    response.headers.setdefault("Permissions-Policy", "microphone=(self)")
    if request.url.path.startswith("/api"):
        response.headers.setdefault("Cache-Control", "no-store")
    return response


@app.get("/api/health", tags=["health"])
def health():
    conn = connect()
    try:
        conn.execute("SELECT 1 FROM accounts LIMIT 1")
        return {"status": "ok", "db": "ok", "admin_configured": bool(settings.admin_token)}
    finally:
        conn.close()


for r in (auth.router, accounts.router, tx.router, loans.router, admin.router, tts.router):
    app.include_router(r)

# Only the web/ folder is served - never bank.db, .env or the source code.
_web = Path(settings.web_dir)
if _web.is_dir():
    app.mount("/", StaticFiles(directory=str(_web), html=True), name="web")
