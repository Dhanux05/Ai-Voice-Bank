"""Server-side neural text to speech (Kannada / Hindi / English) so every browser sounds right.

Uses the free `edge-tts` package (Microsoft Edge neural voices, no API key). Audio is cached on disk
and in the browser, so each phrase is generated once.
"""
import asyncio
import hashlib
import time
from collections import defaultdict, deque
from pathlib import Path

from fastapi import APIRouter, Query, Request, Response

from ..config import settings
from ..errors import AppError

router = APIRouter(prefix="/api", tags=["tts"])

_hits: dict[str, deque] = defaultdict(deque)
CACHE_HEADERS = {"Cache-Control": "public, max-age=31536000, immutable"}


def voice_for(lang: str) -> str:
    return {"en": settings.tts_voice_en, "hi": settings.tts_voice_hi, "kn": settings.tts_voice_kn}[lang]


def _rate_ok(ip: str) -> bool:
    now = time.time()
    q = _hits[ip]
    while q and q[0] < now - 60:
        q.popleft()
    if len(q) >= settings.tts_per_minute:
        return False
    q.append(now)
    return True


async def synthesize(text: str, voice: str) -> bytes:
    import edge_tts  # imported lazily so the rest of the API works even if the package is missing

    communicate = edge_tts.Communicate(text, voice, rate=settings.tts_rate)
    audio = bytearray()
    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            audio.extend(chunk["data"])
    if not audio:
        raise RuntimeError("empty audio")
    return bytes(audio)


@router.get("/tts")
async def tts(request: Request, lang: str = Query(..., pattern="^(en|hi|kn)$"), text: str = Query(..., min_length=1)):
    text = " ".join(text.split())[: settings.tts_max_chars]
    voice = voice_for(lang)
    key = hashlib.sha1(f"{voice}|{settings.tts_rate}|{text}".encode()).hexdigest()
    cache_dir = Path(settings.tts_cache_dir)
    path = cache_dir / f"{key}.mp3"

    if path.exists():
        return Response(path.read_bytes(), media_type="audio/mpeg", headers=CACHE_HEADERS)

    ip = request.client.host if request.client else "?"
    if not _rate_ok(ip):
        raise AppError("RATE_LIMITED", 429)
    try:
        audio = await asyncio.wait_for(synthesize(text, voice), timeout=15)
    except Exception as exc:  # network down, package missing, timeout...
        raise AppError("TTS_UNAVAILABLE", 503, reason=type(exc).__name__)
    try:
        cache_dir.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(".tmp")
        tmp.write_bytes(audio)
        tmp.replace(path)
    except OSError:
        pass
    return Response(audio, media_type="audio/mpeg", headers=CACHE_HEADERS)
