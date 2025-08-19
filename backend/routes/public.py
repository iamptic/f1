# backend/routes/public.py
# Minimal public endpoints for buyer-facing offer feed.

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from typing import Optional, List
from datetime import datetime

# Adjust imports to your project layout if needed.
from backend.db import get_db  # noqa: F401
from backend.models import Offer, Restaurant  # noqa: F401

router = APIRouter(prefix="/api/v1/public", tags=["public"])


def _is_active(offer: "Offer") -> bool:
    # Active: not expired by expires_at and qty_left > 0 (if tracked)
    now = datetime.utcnow()
    if offer.expires_at and offer.expires_at < now:
        return False
    if getattr(offer, "qty_left", None) is not None and offer.qty_left <= 0:
        return False
    return True


@router.get("/offers")
def list_offers(
    db: Session = Depends(get_db),
    city: Optional[str] = Query(None, description="Filter by city (restaurant.city)"),
    category: Optional[str] = Query(None, description="Offer category"),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    q = db.query(Offer).join(Restaurant, Offer.restaurant_id == Restaurant.id)

    if city:
        q = q.filter(Restaurant.city.ilike(f"%{city}%"))
    if category:
        q = q.filter(Offer.category == category)

    # Only active offers for buyer feed
    offers = q.order_by(Offer.expires_at.is_(None).desc(), Offer.expires_at.asc()).all()
    active = [o for o in offers if _is_active(o)]
    total = len(active)
    slice_ = active[offset : offset + limit]

    # FastAPI will serialize ORM models; adjust to dict if needed
    return {"total": total, "limit": limit, "offset": offset, "items": slice_}
