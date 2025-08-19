# backend/routes/offers.py
# Minimal, additive router to enable PATCH/DELETE for merchant offers.
# Assumes you already have SQLAlchemy models Offer, Restaurant and a get_db() dependency.
# Auth: X-Foody-Key header (same as other merchant endpoints).

from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.orm import Session
from typing import Optional
from pydantic import BaseModel, Field
from datetime import datetime

# Import your existing DB session generator and models.
# Adjust import paths if your project structure differs.
from backend.db import get_db  # noqa: F401
from backend.models import Offer, Restaurant  # noqa: F401

router = APIRouter(prefix="/api/v1/merchant/offers", tags=["merchant_offers"])


class OfferUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    image_url: Optional[str] = None
    price: Optional[float] = Field(None, ge=0)
    price_cents: Optional[int] = Field(None, ge=0)
    qty_total: Optional[int] = Field(None, ge=0)
    qty_left: Optional[int] = Field(None, ge=0)
    expires_at: Optional[datetime] = None


def _auth_restaurant(db: Session, x_foody_key: Optional[str]) -> "Restaurant":
    if not x_foody_key:
        raise HTTPException(status_code=401, detail="Missing X-Foody-Key")
    restaurant = db.query(Restaurant).filter(Restaurant.api_key == x_foody_key).first()
    if not restaurant:
        raise HTTPException(status_code=401, detail="Invalid X-Foody-Key")
    return restaurant


@router.patch("/{offer_id}")
def update_offer(
    offer_id: int,
    payload: OfferUpdate,
    db: Session = Depends(get_db),
    x_foody_key: Optional[str] = Header(None, convert_underscores=False, alias="X-Foody-Key"),
):
    restaurant = _auth_restaurant(db, x_foody_key)

    offer = db.query(Offer).filter(Offer.id == offer_id).first()
    if not offer:
        raise HTTPException(status_code=404, detail="Offer not found")
    if offer.restaurant_id != restaurant.id:
        raise HTTPException(status_code=403, detail="Not your offer")

    data = payload.dict(exclude_unset=True)

    # Keep price and price_cents consistent
    if "price" in data and data["price"] is not None:
        data["price_cents"] = int(round(float(data["price"]) * 100))
    if "price_cents" in data and data["price_cents"] is not None:
        data["price"] = float(data["price_cents"]) / 100.0

    # Basic qty validation
    qty_total = data.get("qty_total", offer.qty_total)
    qty_left = data.get("qty_left", offer.qty_left)
    if qty_left is not None and qty_total is not None and qty_left > qty_total:
        raise HTTPException(status_code=400, detail="qty_left cannot be greater than qty_total")

    for k, v in data.items():
        setattr(offer, k, v)

    db.add(offer)
    db.commit()
    db.refresh(offer)
    return offer  # matches shape returned by your GET list endpoint


@router.delete("/{offer_id}", status_code=204)
def delete_offer(
    offer_id: int,
    db: Session = Depends(get_db),
    x_foody_key: Optional[str] = Header(None, convert_underscores=False, alias="X-Foody-Key"),
):
    restaurant = _auth_restaurant(db, x_foody_key)

    offer = db.query(Offer).filter(Offer.id == offer_id).first()
    if not offer:
        raise HTTPException(status_code=404, detail="Offer not found")
    if offer.restaurant_id != restaurant.id:
        raise HTTPException(status_code=403, detail="Not your offer")

    db.delete(offer)
    db.commit()
    # 204 No Content is returned by the decorator
