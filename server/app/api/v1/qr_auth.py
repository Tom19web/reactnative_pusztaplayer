import secrets, string
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Form
from fastapi.responses import HTMLResponse
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.models import QrSessionModel

router = APIRouter(tags=["auth"])

AUTH_PAGE_HTML = """<!DOCTYPE html>
<html lang="hu">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>PusztaPlayer - Bejelentkezes</title>
<style>
body{background:#0a0a0a;color:#fff;font-family:sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0}
.card{background:#1a1a2e;border-radius:12px;padding:24px;max-width:380px;width:90%;border:2px solid #00d4ff}
h2{color:#00d4ff;text-align:center;margin:0 0 16px}
label{display:block;margin:8px 0 4px;font-size:13px;color:#aaa}
input{width:100%;padding:10px;border:1px solid #333;border-radius:6px;background:#111;color:#fff;font-size:14px;box-sizing:border-box}
button{width:100%;padding:12px;margin-top:16px;background:#00d4ff;color:#000;border:none;border-radius:6px;font-size:16px;font-weight:bold;cursor:pointer}
.error{color:#ff4444;font-size:13px;margin-top:8px;text-align:center}
</style></head>
<body>
<div class="card">
<h2>PusztaPlayer</h2>
<form method="post">
<label>Felhasznalonev</label><input name="username" required>
<label>Jelszo</label><input name="password" type="password" required>
<label>Email (opcionalis)</label><input name="email">
<label>Becenev (opcionalis)</label><input name="nickname">
<button type="submit">Bejelentkezes</button>
</form>
</div></body></html>"""

SUCCESS_HTML = """<!DOCTYPE html>
<html lang="hu">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sikeres bejelentkezes</title>
<style>body{background:#0a0a0a;color:#00d4ff;font-family:sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;font-size:24px}</style>
</head><body>Sikeres bejelentkezes! A TV-n megjelenik a fomenu.</body></html>"""

EXPIRED_HTML = """<!DOCTYPE html>
<html lang="hu">
<head><meta charset="utf-8"><title>Lejart</title>
<style>body{background:#0a0a0a;color:#ff4444;font-family:sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;font-size:20px}</style>
</head><body>A QR kod lejart. Kerj ujat a TV-n!</body></html>"""


def generate_code(length: int = 8) -> str:
    chars = string.ascii_uppercase + string.digits
    return "".join(secrets.choice(chars) for _ in range(length))


@router.post("/auth/qr-request")
async def qr_request(db: AsyncSession = Depends(get_db)):
    code = generate_code()
    expires_at = datetime.now(timezone.utc) + timedelta(seconds=300)

    session = QrSessionModel(
        code=code,
        status="pending",
        expires_at=expires_at,
    )
    db.add(session)
    await db.commit()

    return {
        "code": code,
        "auth_url": f"https://live.pusztaplay.eu/api/v1/auth?code={code}",
        "expires_in": 300,
    }


@router.get("/auth/qr-poll")
async def qr_poll(code: str, db: AsyncSession = Depends(get_db)):
    stmt = select(QrSessionModel).where(QrSessionModel.code == code)
    result = await db.execute(stmt)
    session = result.scalar_one_or_none()

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    if datetime.now(timezone.utc) > session.expires_at:
        session.status = "expired"
        await db.commit()
        return {"status": "expired"}

    if session.status == "authenticated":
        return {
            "status": "authenticated",
            "xtream_user": session.xtream_user or "",
            "xtream_pass": session.xtream_pass or "",
            "user_email": session.user_email or "",
            "nickname": session.nickname or "",
            "phone": session.phone or "",
            "api_key": session.api_key or "",
        }

    return {"status": "pending"}


@router.get("/auth", response_class=HTMLResponse)
async def auth_page(code: str, db: AsyncSession = Depends(get_db)):
    stmt = select(QrSessionModel).where(QrSessionModel.code == code)
    result = await db.execute(stmt)
    session = result.scalar_one_or_none()

    if not session or datetime.now(timezone.utc) > session.expires_at:
        return HTMLResponse(EXPIRED_HTML, status_code=410)

    return HTMLResponse(
        AUTH_PAGE_HTML.replace("method=\"post\"", f"method=\"post\" action=\"/api/v1/auth/submit?code={code}\""),
    )


@router.post("/auth/submit")
async def auth_submit(
    code: str,
    username: str = Form(...),
    password: str = Form(...),
    email: str = Form(""),
    nickname: str = Form(""),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(QrSessionModel).where(QrSessionModel.code == code)
    result = await db.execute(stmt)
    session = result.scalar_one_or_none()

    if not session or datetime.now(timezone.utc) > session.expires_at:
        return HTMLResponse(EXPIRED_HTML, status_code=410)

    session.status = "authenticated"
    session.xtream_user = username
    session.xtream_pass = password
    session.user_email = email
    session.nickname = nickname
    session.api_key = secrets.token_hex(16)
    await db.commit()

    return HTMLResponse(SUCCESS_HTML)
