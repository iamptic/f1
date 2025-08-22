from os import getenv
import os
from typing import Any, Dict, Optional, Set, List, Tuple

import asyncpg
from fastapi import FastAPI, HTTPException, Body, Request, Query, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from datetime import datetime, timezone, time as dtime, timedelta
import hashlib
import secrets as _secrets
import random
import string

APP_NAME = "Foody API"

DATABASE_URL = os.getenv("DATABASE_URL") or "postgresql://postgres:postgres@localhost:5432/postgres"
RUN_MIGRATIONS = os.getenv("RUN_MIGRATIONS", "1") == "1"

# --- CORS ---
CORS_ORIGINS = [o.strip() for o in os.getenv("CORS_ORIGINS", "").split(",") if o.strip()] or [
    "https://foodyweb-production.up.railway.app",
    "https://foodybot-production.up.railway.app",
]

RECOVERY_SECRET = os.getenv("RECOVERY_SECRET", "foodyDevRecover123")
RESERVATION_TTL_MINUTES = int(getenv("RESERVATION_TTL_MINUTES", "30"))

app = FastAPI(title=APP_NAME, version="1.1")

# --- QR как PNG ---
try:
    import segno
except Exception:
    segno = None

@app.get("/api/v1/public/qr/{text}.png")
async def public_qr_png(text: str):
    if segno is None:
        raise HTTPException(status_code=501, detail="QR generator not available on server")
    try:
        import io
        qr = segno.make(text, error='m')
        buf = io.BytesIO()
        qr.save(buf, kind="png", scale=6, border=2)
        return Response(buf.getvalue(), media_type="image/png")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"qr render failed: {e}")

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
    max_age=86400,
)

_pool: Optional[asyncpg.Pool] = None

async def _connect_pool():
    global _pool
    if _pool is None:
        _pool = await asyncpg.create_pool(DATABASE_URL, min_size=1, max_size=10)

async def _close_pool():
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None

async def _migrate():
    if not RUN_MIGRATIONS:
        return
    async with _pool.acquire() as conn:
        await conn.execute("""
        CREATE TABLE IF NOT EXISTS merchants (
            id SERIAL PRIMARY KEY,
            name TEXT,
            login TEXT UNIQUE,
            auth_login TEXT,
            password_hash TEXT,
            api_key TEXT UNIQUE,
            phone TEXT,
            email TEXT,
            address TEXT,
            city TEXT,
            lat DOUBLE PRECISION,
            lng DOUBLE PRECISION,
            open_time TIME,
            close_time TIME,
            created_at TIMESTAMPTZ DEFAULT now()
        );
        """)
        for ddl in [
            "ALTER TABLE merchants ADD COLUMN IF NOT EXISTS login TEXT;",
            "ALTER TABLE merchants ADD COLUMN IF NOT EXISTS auth_login TEXT;",
            "ALTER TABLE merchants ADD COLUMN IF NOT EXISTS open_time TIME;",
            "ALTER TABLE merchants ADD COLUMN IF NOT EXISTS close_time TIME;",
        ]:
            await conn.execute(ddl)

        await conn.execute("""
        UPDATE merchants
           SET login = COALESCE(NULLIF(login,''), NULLIF(auth_login,''), NULLIF(phone,''), email)
         WHERE login IS NULL OR login = '';
        """)
        await conn.execute("""
        UPDATE merchants
           SET auth_login = COALESCE(NULLIF(auth_login,''), login)
         WHERE auth_login IS NULL OR auth_login = '';
        """)
        await conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS merchants_login_unique ON merchants(login);")

        await conn.execute("""
        CREATE TABLE IF NOT EXISTS offers (
            id SERIAL PRIMARY KEY,
            merchant_id INTEGER,
            restaurant_id INTEGER,
            title TEXT NOT NULL,
            price_cents INTEGER NOT NULL DEFAULT 0,
            original_price_cents INTEGER,
            qty_total INTEGER NOT NULL DEFAULT 1,
            qty_left INTEGER NOT NULL DEFAULT 1,
            expires_at TIMESTAMPTZ,
            image_url TEXT,
            category TEXT,
            description TEXT,
            created_at TIMESTAMPTZ DEFAULT now()
        );
        """)

        cols = await conn.fetch("""
            SELECT column_name FROM information_schema.columns
            WHERE table_name='offers' AND table_schema=current_schema()
        """)
        colset: Set[str] = {r["column_name"] for r in cols}

        if "merchant_id" not in colset:
            await conn.execute("ALTER TABLE offers ADD COLUMN IF NOT EXISTS merchant_id INTEGER;")
        if "restaurant_id" not in colset:
            await conn.execute("ALTER TABLE offers ADD COLUMN IF NOT EXISTS restaurant_id INTEGER;")
        if "created_at" not in colset:
            await conn.execute("ALTER TABLE offers ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();")

        await conn.execute("UPDATE offers SET restaurant_id = COALESCE(restaurant_id, merchant_id) WHERE restaurant_id IS NULL;")
        await conn.execute("UPDATE offers SET merchant_id   = COALESCE(merchant_id, restaurant_id) WHERE merchant_id IS NULL;")

        await conn.execute("""
        CREATE TABLE IF NOT EXISTS reservations (
            id SERIAL PRIMARY KEY,
            offer_id INTEGER NOT NULL,
            restaurant_id INTEGER,
            code TEXT UNIQUE,
            name TEXT,
            phone TEXT,
            status TEXT NOT NULL DEFAULT 'active',
            expires_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ DEFAULT now(),
            redeemed_at TIMESTAMPTZ
        );
        """)
        await conn.execute("CREATE INDEX IF NOT EXISTS reservations_offer_idx ON reservations(offer_id);")
        await conn.execute("CREATE INDEX IF NOT EXISTS reservations_restaurant_idx ON reservations(restaurant_id);")
        await conn.execute("CREATE INDEX IF NOT EXISTS reservations_status_idx ON reservations(status);")
        await conn.execute("CREATE INDEX IF NOT EXISTS reservations_code_idx ON reservations(code);")

def _hash_password(pw: str) -> str:
    salt = hashlib.sha256(RECOVERY_SECRET.encode()).hexdigest()[:16]
    return hashlib.sha256((salt + pw).encode()).hexdigest()

def _generate_api_key() -> str:
    return _secrets.token_hex(24)

def _short_code(n: int = 6) -> str:
    alphabet = string.ascii_uppercase + string.digits
    return "".join(random.choice(alphabet) for _ in range(n))

def _to_time_str(val: Any) -> Optional[str]:
    if val is None:
        return None
    if isinstance(val, str):
        return val[:5]
    try:
        return val.strftime("%H:%M")
    except Exception:
        return None

def _parse_time(val: Any) -> Optional[dtime]:
    if not val:
        return None
    if isinstance(val, dtime):
        return val
    if isinstance(val, str):
        s = val.strip()
        if not s:
            return None
        parts = s.split(":")
        try:
          h = int(parts[0]); m = int(parts[1]) if len(parts) > 1 else 0; sec = int(parts[2]) if len(parts) > 2 else 0
          if h == 24 and m == 0 and sec == 0:
              return dtime(23, 59, 59)
          return dtime(h, m, sec)
        except Exception:
          return None
    return None

def _parse_expires_at(s: str) -> Optional[datetime]:
    if not s:
        return None
    try:
        if s.endswith("Z"):
            return datetime.fromisoformat(s.replace("Z","+00:00"))
        return datetime.fromisoformat(s).replace(tzinfo=timezone.utc)
    except Exception:
        return None

async def _require_auth(conn: asyncpg.Connection, restaurant_id: int, api_key: str):
    if not api_key:
        raise HTTPException(status_code=401, detail="missing api key")
    row = await conn.fetchrow("SELECT id FROM merchants WHERE id=$1 AND api_key=$2", restaurant_id, api_key)
    if not row:
        raise HTTPException(status_code=401, detail="invalid api key")

def _get_api_key(req: Request) -> str:
    return req.headers.get("X-Foody-Key") or req.headers.get("x-foody-key") or ""

class RegisterRequest(BaseModel):
    name: str
    login: str
    password: str
    city: Optional[str] = None

class LoginRequest(BaseModel):
    login: str
    password: str

class OfferCreate(BaseModel):
    merchant_id: Optional[int] = None
    restaurant_id: int
    title: str
    price: float
    original_price: Optional[float] = None
    qty_total: int = 1
    qty_left: Optional[int] = None
    expires_at: str
    image_url: Optional[str] = None
    category: Optional[str] = None
    description: Optional[str] = None

@app.on_event("startup")
async def startup_event():
    await _connect_pool()
    await _migrate()

@app.on_event("shutdown")
async def shutdown_event():
    await _close_pool()

@app.get("/health")
async def health():
    return {"ok": True, "service": APP_NAME}

@app.post("/api/v1/merchant/register_public")
async def register_public(payload: RegisterRequest):
    async with _pool.acquire() as conn:
        login_digits = "".join([c for c in payload.login if c.isdigit()])
        exists = await conn.fetchrow("SELECT id FROM merchants WHERE login=$1", login_digits)
        if exists:
            raise HTTPException(status_code=409, detail="merchant with this login already exists")
        api_key = _generate_api_key()
        password_hash = _hash_password(payload.password)
        row = await conn.fetchrow(
            """
            INSERT INTO merchants (name, login, phone, city, password_hash, api_key, auth_login)
            VALUES ($1,$2,$3,$4,$5,$6,$7)
            RETURNING id
            """,
            payload.name.strip(), login_digits, login_digits, payload.city, password_hash, api_key, login_digits
        )
        return {"restaurant_id": row["id"], "api_key": api_key}

@app.post("/api/v1/merchant/login")
async def login(payload: LoginRequest):
    async with _pool.acquire() as conn:
        login_digits = "".join([c for c in payload.login if c.isdigit()])
        row = await conn.fetchrow("SELECT id, password_hash, api_key FROM merchants WHERE login=$1", login_digits)
        if not row or row["password_hash"] != _hash_password(payload.password):
            raise HTTPException(status_code=401, detail="invalid login or password")
        return {"restaurant_id": row["id"], "api_key": row["api_key"]}

@app.get("/api/v1/merchant/profile")
async def get_profile(restaurant_id: int, request: Request):
    api_key = _get_api_key(request)
    async with _pool.acquire() as conn:
        await _require_auth(conn, restaurant_id, api_key)
        row = await conn.fetchrow(
            "SELECT id, name, login, phone, email, address, city, lat, lng, open_time, close_time FROM merchants WHERE id=$1",
            restaurant_id
        )
        if not row:
            raise HTTPException(status_code=404, detail="not found")
        d = dict(row)
        d["open_time"] = _to_time_str(d.get("open_time"))
        d["close_time"] = _to_time_str(d.get("close_time"))
        d["work_from"] = d["open_time"]
        d["work_to"] = d["close_time"]
        return d

@app.put("/api/v1/merchant/profile")
async def update_profile(payload: Dict[str, Any] = Body(...), request: Request = None):
    restaurant_id = int(payload.get("restaurant_id") or 0)
    if not restaurant_id:
        raise HTTPException(status_code=400, detail="restaurant_id required")

    api_key = _get_api_key(request) if request else ""

    async with _pool.acquire() as conn:
        await _require_auth(conn, restaurant_id, api_key)

        name    = (payload.get("name") or "").strip() or None
        phone   = (payload.get("phone") or "").strip() or None
        address = (payload.get("address") or "").strip() or None
        city    = (payload.get("city") or "").strip() or None
        lat     = payload.get("lat", None)
        lng     = payload.get("lng", None)

        open_time_raw  = payload.get("open_time")  or payload.get("work_from") or None
        close_time_raw = payload.get("close_time") or payload.get("work_to")   or None
        open_time  = _parse_time(open_time_raw)
        close_time = _parse_time(close_time_raw)

        await conn.execute(
            """
            UPDATE merchants SET
                name       = COALESCE($2, name),
                phone      = COALESCE($3, phone),
                address    = COALESCE($4, address),
                city       = COALESCE($5, city),
                lat        = COALESCE($6, lat),
                lng        = COALESCE($7, lng),
                open_time  = COALESCE($8, open_time),
                close_time = COALESCE($9, close_time)
            WHERE id = $1
            """,
            restaurant_id, name, phone, address, city, lat, lng, open_time, close_time
        )
        return {"ok": True}

@app.get("/api/v1/merchant/offers")
async def list_offers(restaurant_id: int, request: Request):
    api_key = _get_api_key(request)
    async with _pool.acquire() as conn:
        await _require_auth(conn, restaurant_id, api_key)
        rows = await conn.fetch(
            """
            SELECT id, restaurant_id, title, price_cents, original_price_cents, qty_total, qty_left,
                   expires_at, image_url, category, description
            FROM offers
            WHERE restaurant_id=$1
            ORDER BY created_at DESC
            """,
            restaurant_id
        )
        out = []
        for r in rows:
            d = dict(r)
            if d.get("expires_at"):
                d["expires_at"] = d["expires_at"].astimezone(timezone.utc).isoformat()
            out.append(d)
        return out

class OfferCreate(BaseModel):
    merchant_id: Optional[int] = None
    restaurant_id: int
    title: str
    price: float
    original_price: Optional[float] = None
    qty_total: int = 1
    qty_left: Optional[int] = None
    expires_at: str
    image_url: Optional[str] = None
    category: Optional[str] = None
    description: Optional[str] = None

@app.post("/api/v1/merchant/offers")
async def create_offer(payload: OfferCreate, request: Request):
    api_key = _get_api_key(request)
    async with _pool.acquire() as conn:
        rid = int(payload.merchant_id or payload.restaurant_id)
        await _require_auth(conn, rid, api_key)

        price_val = float(payload.price or 0)
        original_val = float(payload.original_price) if payload.original_price is not None else None
        price_cents = int(round(price_val * 100)) if payload.price is not None else None
        orig_cents  = int(round(original_val * 100)) if original_val is not None else None

        qty_total = payload.qty_total or 1
        qty_left = payload.qty_left if payload.qty_left is not None else qty_total

        expires = _parse_expires_at(payload.expires_at)
        if not expires:
            raise HTTPException(status_code=400, detail="invalid expires_at")

        image_url = (payload.image_url or "").strip()

        try:
            row = await conn.fetchrow(
                """
                INSERT INTO offers (
                    merchant_id, restaurant_id, title,
                    price, price_cents,
                    original_price, original_price_cents,
                    qty_total, qty_left, expires_at,
                    image_url, category, description
                )
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
                RETURNING id
                """,
                rid, rid, payload.title,
                price_val if payload.price is not None else None,
                price_cents,
                original_val,
                orig_cents,
                qty_total, qty_left, expires,
                image_url, payload.category, payload.description
            )
        except Exception:
            try:
                row = await conn.fetchrow(
                    """
                    INSERT INTO offers (
                        merchant_id, restaurant_id, title,
                        price_cents, original_price_cents,
                        qty_total, qty_left, expires_at,
                        image_url, category, description
                    )
                    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
                    RETURNING id
                    """,
                    rid, rid, payload.title,
                    price_cents, orig_cents,
                    qty_total, qty_left, expires,
                    image_url, payload.category, payload.description
                )
            except Exception:
                row = await conn.fetchrow(
                    """
                    INSERT INTO offers (
                        merchant_id, restaurant_id, title,
                        price, original_price,
                        qty_total, qty_left, expires_at,
                        image_url, category, description
                    )
                    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
                    RETURNING id
                    """,
                    rid, rid, payload.title,
                    price_val if payload.price is not None else None,
                    original_val,
                    qty_total, qty_left, expires,
                    image_url, payload.category, payload.description
                )
        return {"id": row["id"]}

class OfferUpdate(BaseModel):
    title: Optional[str] = None
    price: Optional[float] = None
    original_price: Optional[float] = None
    qty_total: Optional[int] = None
    qty_left: Optional[int] = None
    expires_at: Optional[str] = None
    image_url: Optional[str] = None
    category: Optional[str] = None
    description: Optional[str] = None

@app.patch("/api/v1/merchant/offers/{offer_id}")
async def update_offer(offer_id: int, payload: OfferUpdate = Body(...), request: Request = None):
    api_key = _get_api_key(request) if request else ""
    async with _pool.acquire() as conn:
        offer_row = await conn.fetchrow("SELECT id, restaurant_id, qty_total, qty_left FROM offers WHERE id=$1", offer_id)
        if not offer_row:
            raise HTTPException(status_code=404, detail="offer not found")
        restaurant_id = int(offer_row["restaurant_id"] or 0)
        await _require_auth(conn, restaurant_id, api_key)

        cols = await conn.fetch("""
            SELECT column_name FROM information_schema.columns
            WHERE table_name='offers' AND table_schema=current_schema()
        """)
        colset = {r["column_name"] for r in cols}

        data = payload.dict(exclude_unset=True)
        updates: Dict[str, Any] = {}

        if "title" in data: updates["title"] = data["title"]
        if "description" in data: updates["description"] = data["description"]
        if "category" in data: updates["category"] = data["category"]
        if "image_url" in data: updates["image_url"] = (data["image_url"] or "").strip()

        if "price" in data and data["price"] is not None:
            price_val = float(data["price"])
            if "price" in colset:
                updates["price"] = price_val
            if "price_cents" in colset:
                updates["price_cents"] = int(round(price_val * 100))

        if "original_price" in data and data["original_price"] is not None:
            orig_val = float(data["original_price"])
            if "original_price" in colset:
                updates["original_price"] = orig_val
            if "original_price_cents" in colset:
                updates["original_price_cents"] = int(round(orig_val * 100))

        current_qty_total = offer_row["qty_total"]
        current_qty_left = offer_row["qty_left"]
        new_qty_total = data.get("qty_total", current_qty_total)
        new_qty_left  = data.get("qty_left", current_qty_left)
        if new_qty_total is not None and new_qty_left is not None and int(new_qty_left) > int(new_qty_total):
            raise HTTPException(status_code=400, detail="qty_left cannot be greater than qty_total")
        if "qty_total" in data and "qty_total" in colset:
            updates["qty_total"] = int(new_qty_total)
        if "qty_left" in data and "qty_left" in colset:
            updates["qty_left"] = int(new_qty_left)

        if "expires_at" in data:
            parsed = _parse_expires_at(data["expires_at"]) if data["expires_at"] else None
            updates["expires_at"] = parsed

        set_parts, values = [], []
        idx = 1
        for k, v in updates.items():
            if k not in colset:
                continue
            set_parts.append(f"{k} = ${idx}")
            values.append(v)
            idx += 1
        if not set_parts:
            row = await conn.fetchrow(
                """SELECT id, restaurant_id, title,
                          price_cents, original_price_cents,
                          qty_total, qty_left, expires_at, image_url, category, description
                   FROM offers WHERE id=$1""",
                offer_id
            )
            d = dict(row)
            if d.get("expires_at"):
                d["expires_at"] = d["expires_at"].astimezone(timezone.utc).isoformat()
            return d

        values.append(offer_id)
        query = f"UPDATE offers SET {', '.join(set_parts)} WHERE id = ${idx}"
        await conn.execute(query, *values)

        row = await conn.fetchrow(
            """SELECT id, restaurant_id, title, price_cents, original_price_cents, qty_total, qty_left,
                      expires_at, image_url, category, description
               FROM offers WHERE id=$1""",
            offer_id
        )
        if not row:
            raise HTTPException(status_code=404, detail="offer not found after update")
        d = dict(row)
        if d.get("expires_at"):
            d["expires_at"] = d["expires_at"].astimezone(timezone.utc).isoformat()
        return d

@app.delete("/api/v1/merchant/offers/{offer_id}", status_code=200)
async def delete_offer(offer_id: int, request: Request = None):
    api_key = _get_api_key(request) if request else ""
    async with _pool.acquire() as conn:
        offer_row = await conn.fetchrow("SELECT id, restaurant_id FROM offers WHERE id=$1", offer_id)
        if not offer_row:
            raise HTTPException(status_code=404, detail="offer not found")
        restaurant_id = int(offer_row["restaurant_id"] or 0)
        await _require_auth(conn, restaurant_id, api_key)

        await conn.execute("DELETE FROM offers WHERE id=$1", offer_id)
        return {"ok": True, "deleted_id": offer_id}

# === Public offers feed ===
@app.get("/api/v1/public/offers")
async def public_offers(
    city: Optional[str] = None,
    category: Optional[str] = None,
    limit: int = 20,
    offset: int = 0,
):
    if limit < 1: limit = 1
    if limit > 100: limit = 100
    if offset < 0: offset = 0

    where = [
        "(o.expires_at IS NULL OR o.expires_at > now())",
        "(o.qty_left IS NULL OR o.qty_left > 0)"
    ]
    params: List[Any] = []
    if city:
        where.append("m.city ILIKE $" + str(len(params)+1))
        params.append(f"%{city}%")
    if category:
        where.append("o.category = $" + str(len(params)+1))
        params.append(category)

    where_sql = " AND ".join(where)

    count_sql = f"""
        SELECT COUNT(*) AS cnt
          FROM offers o
          JOIN merchants m ON m.id = o.restaurant_id
         WHERE {where_sql}
    """

    list_sql = f"""
        SELECT
            o.id, o.restaurant_id, o.title,
            o.price_cents, o.original_price_cents,
            o.qty_total, o.qty_left, o.expires_at,
            o.image_url, o.category, o.description,
            m.name AS restaurant_name, m.address AS restaurant_address,
            m.phone AS restaurant_phone, m.city AS restaurant_city
        FROM offers o
        JOIN merchants m ON m.id = o.restaurant_id
        WHERE {where_sql}
        ORDER BY (o.expires_at IS NULL) DESC, o.expires_at ASC, o.created_at DESC
        LIMIT ${len(params)+1} OFFSET ${len(params)+2}
    """

    async with _pool.acquire() as conn:
        total_row = await conn.fetchrow(count_sql, *params)
        total = int(total_row["cnt"]) if total_row else 0

        rows = await conn.fetch(list_sql, *params, limit, offset)
        items: List[Dict[str, Any]] = []
        for r in rows:
            d = dict(r)
            if d.get("expires_at"):
                d["expires_at"] = d["expires_at"].astimezone(timezone.utc).isoformat()
            items.append(d)

        return {"total": total, "limit": limit, "offset": offset, "items": items}

# === Reservations

async def _expire_reservations(conn: asyncpg.Connection, restaurant_id: Optional[int] = None) -> int:
    params: List[Any] = []
    cond = "status='active' AND expires_at IS NOT NULL AND expires_at <= now()"
    if restaurant_id:
        cond += " AND restaurant_id=$1"
        params.append(restaurant_id)
    rows = await conn.fetch(f"SELECT id, offer_id FROM reservations WHERE {cond}", *params)
    changed = 0
    for r in rows:
        await conn.execute("UPDATE reservations SET status='expired' WHERE id=$1", r["id"])
        await conn.execute("UPDATE offers SET qty_left = qty_left + 1 WHERE id=$1 AND qty_left IS NOT NULL", r["offer_id"])
        changed += 1
    return changed

class PublicReserveIn(BaseModel):
    offer_id: int
    name: str = ""
    phone: str = ""

class PublicReserveOut(BaseModel):
    id: int
    offer_id: int
    code: Optional[str] = None
    expires_at: Optional[str] = None

@app.post("/api/v1/public/reserve", response_model=PublicReserveOut)
async def public_reserve(payload: PublicReserveIn = Body(...)):
    async with _pool.acquire() as conn:
        async with conn.transaction():
            row = await conn.fetchrow(
                """
                SELECT id, restaurant_id, qty_left, expires_at
                FROM offers
                WHERE id = $1
                FOR UPDATE
                """, payload.offer_id
            )
            if not row:
                raise HTTPException(status_code=404, detail="offer not found")

            now = datetime.now(timezone.utc)
            exp = row["expires_at"]
            if exp is not None and exp <= now:
                raise HTTPException(status_code=400, detail="offer expired")

            qty_left = row["qty_left"]
            if qty_left is not None and qty_left <= 0:
                raise HTTPException(status_code=400, detail="sold out")

            if qty_left is not None:
                upd = await conn.execute(
                    "UPDATE offers SET qty_left = qty_left - 1 WHERE id = $1 AND qty_left > 0",
                    payload.offer_id
                )
                if not upd.endswith("1"):
                    raise HTTPException(status_code=409, detail="no stock")

            r_expires = now + timedelta(minutes=RESERVATION_TTL_MINUTES)
            code = None
            for _ in range(5):
                c = _short_code(6)
                exists = await conn.fetchrow("SELECT 1 FROM reservations WHERE code=$1", c)
                if not exists:
                    code = c
                    break
            res = await conn.fetchrow(
                """
                INSERT INTO reservations (offer_id, restaurant_id, code, name, phone, status, expires_at, created_at)
                VALUES ($1, $2, $3, $4, $5, 'active', $6, $7)
                RETURNING id, offer_id, code, expires_at
                """,
                payload.offer_id, row["restaurant_id"], code,
                (payload.name or "").strip(), (payload.phone or "").strip(),
                r_expires, now,
            )
            out = dict(res)
            if out.get("expires_at"):
                out["expires_at"] = out["expires_at"].astimezone(timezone.utc).isoformat()
            return out

def _parse_res_identifier(res: str) -> Tuple[str, Optional[int]]:
    if res.isdigit():
        return ("id", int(res))
    return ("code", res)

class ReservationOut(BaseModel):
    id: int
    offer_id: int
    restaurant_id: Optional[int] = None
    code: Optional[str] = None
    status: str
    expires_at: Optional[str] = None
    created_at: Optional[str] = None
    redeemed_at: Optional[str] = None
    name: Optional[str] = None
    phone: Optional[str] = None

@app.get("/api/v1/merchant/reservations")
async def merchant_reservations(
    restaurant_id: int,
    request: Request,
    status: Optional[str] = Query(None),
    q: Optional[str] = Query(None, description="search by code or phone"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    api_key = _get_api_key(request)
    async with _pool.acquire() as conn:
        await _require_auth(conn, restaurant_id, api_key)
        if status and status not in ('active','redeemed','expired','canceled'):
            raise HTTPException(status_code=400, detail='invalid status')
        await _expire_reservations(conn, restaurant_id)

        where = ["r.restaurant_id = $1"]
        params: List[Any] = [restaurant_id]
        if status:
            where.append("r.status = $" + str(len(params)+1))
            params.append(status)
        if q:
            where.append("(r.code ILIKE $" + str(len(params)+1) + " OR r.phone ILIKE $" + str(len(params)+1) + ")")
            params.append(f"%{q}%")

        where_sql = " AND ".join(where)
        total_row = await conn.fetchrow(f"SELECT COUNT(*) AS cnt FROM reservations r WHERE {where_sql}", *params)
        total = int(total_row["cnt"]) if total_row else 0

        sql = f"""
            SELECT r.id, r.offer_id, r.restaurant_id, r.code, r.status, r.expires_at, r.created_at, r.redeemed_at, r.name, r.phone
              FROM reservations r
             WHERE {where_sql}
             ORDER BY r.created_at DESC
             LIMIT ${len(params)+1} OFFSET ${len(params)+2}
        """
        rows = await conn.fetch(sql, *params, limit, offset)
        items = []
        for r in rows:
            d = dict(r)
            for k in ("expires_at", "created_at", "redeemed_at"):
                if d.get(k):
                    d[k] = d[k].astimezone(timezone.utc).isoformat()
            items.append(d)
        return {"total": total, "limit": limit, "offset": offset, "items": items}

@app.post("/api/v1/merchant/reservations/{res}/redeem")
async def merchant_reservation_redeem(res: str, restaurant_id: Optional[int] = Query(None), request: Request = None):
    api_key = _get_api_key(request) if request else ""
    key, val = _parse_res_identifier(res)
    async with _pool.acquire() as conn:
        if key == "id":
            r = await conn.fetchrow("SELECT * FROM reservations WHERE id=$1", val)
        else:
            r = await conn.fetchrow("SELECT * FROM reservations WHERE code=$1", val)
        if not r:
            raise HTTPException(status_code=404, detail="reservation not found")
        rid = r["restaurant_id"]
        await _require_auth(conn, rid, api_key)

        await _expire_reservations(conn, rid)

        if r["status"] != "active":
            raise HTTPException(status_code=400, detail="not active")
        if r["expires_at"] and r["expires_at"] <= datetime.now(timezone.utc):
            await conn.execute("UPDATE reservations SET status='expired' WHERE id=$1", r["id"])
            await conn.execute("UPDATE offers SET qty_left = qty_left + 1 WHERE id=$1 AND qty_left IS NOT NULL", r["offer_id"])
            raise HTTPException(status_code=400, detail="expired")

        await conn.execute("UPDATE reservations SET status='redeemed', redeemed_at=now() WHERE id=$1", r["id"])
        rr = await conn.fetchrow("SELECT id, offer_id, restaurant_id, code, status, expires_at, created_at, redeemed_at, name, phone FROM reservations WHERE id=$1", r["id"])
        d = dict(rr)
        for k in ("expires_at", "created_at", "redeemed_at"):
            if d.get(k):
                d[k] = d[k].astimezone(timezone.utc).isoformat()
        return d

@app.post("/api/v1/merchant/reservations/{res}/cancel")
async def merchant_reservation_cancel(res: str, restaurant_id: Optional[int] = Query(None), request: Request = None):
    api_key = _get_api_key(request) if request else ""
    key, val = _parse_res_identifier(res)
    async with _pool.acquire() as conn:
        if key == "id":
            r = await conn.fetchrow("SELECT * FROM reservations WHERE id=$1", val)
        else:
            r = await conn.fetchrow("SELECT * FROM reservations WHERE code=$1", val)
        if not r:
            raise HTTPException(status_code=404, detail="reservation not found")
        rid = r["restaurant_id"]
        await _require_auth(conn, rid, api_key)

        await _expire_reservations(conn, rid)

        if r["status"] != "active":
            raise HTTPException(status_code=400, detail="not active")

        await conn.execute("UPDATE reservations SET status='canceled' WHERE id=$1", r["id"])
        await conn.execute("UPDATE offers SET qty_left = qty_left + 1 WHERE id=$1 AND qty_left IS NOT NULL", r["offer_id"])
        rr = await conn.fetchrow("SELECT id, offer_id, restaurant_id, code, status, expires_at, created_at, redeemed_at, name, phone FROM reservations WHERE id=$1", r["id"])
        d = dict(rr)
        for k in ("expires_at", "created_at", "redeemed_at"):
            if d.get(k):
                d[k] = d[k].astimezone(timezone.utc).isoformat()
        return d

@app.get("/")
async def root():
    return {"ok": True, "service": APP_NAME}

@app.put("/api/v1/merchant/password")
async def change_password(payload: dict = Body(...), request: Request = None):
    restaurant_id = int(payload.get("restaurant_id") or 0)
    old_password = (payload.get("old_password") or "").strip()
    new_password = (payload.get("new_password") or "").strip()
    if not restaurant_id or not old_password or not new_password:
        raise HTTPException(status_code=400, detail="restaurant_id, old_password, new_password required")
    if len(new_password) < 6:
        raise HTTPException(status_code=400, detail="new password too short")

    api_key = request.headers.get("X-Foody-Key") if request else ""
    if not api_key:
        api_key = request.headers.get("x-foody-key") if request else ""
    async with _pool.acquire() as conn:
        await _require_auth(conn, restaurant_id, api_key)
        row = await conn.fetchrow("SELECT password_hash FROM merchants WHERE id=$1", restaurant_id)
        if not row or row["password_hash"] != _hash_password(old_password):
            raise HTTPException(status_code=401, detail="invalid current password")
        await conn.execute("UPDATE merchants SET password_hash=$2 WHERE id=$1", restaurant_id, _hash_password(new_password))
        return {"ok": True}

class PublicReservationStatusOut(BaseModel):
    id: int
    offer_id: int
    code: Optional[str] = None
    status: str
    expires_at: Optional[str] = None

@app.get("/api/v1/public/reservations/{res}", response_model=PublicReservationStatusOut)
async def public_reservation_status(res: str):
    async with _pool.acquire() as conn:
        row = None
        if res.isdigit():
            row = await conn.fetchrow(
                "SELECT id, offer_id, code, status, expires_at FROM reservations WHERE id=$1",
                int(res)
            )
        if not row:
            row = await conn.fetchrow(
                "SELECT id, offer_id, code, status, expires_at FROM reservations WHERE code=$1",
                res
            )
        if not row:
            raise HTTPException(status_code=404, detail="reservation not found")
        d = dict(row)
        if d.get("expires_at"):
            d["expires_at"] = d["expires_at"].astimezone(timezone.utc).isoformat()
        return d
