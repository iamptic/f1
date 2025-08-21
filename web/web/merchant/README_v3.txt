Foody · Merchant Web (bundle v3) — QR/Брони URL-redeem primary
--------------------------------------------------------------
- Added qr_reservations.js (URL-style redeem: POST /api/v1/merchant/reservations/{code}/redeem)
  with fallbacks to body endpoints.
- Added qr_reservations.css.
- index.html patched to include the CSS/JS.

Auth expectations:
- localStorage.foody_key -> sent as X-Foody-Key
- localStorage.foody_restaurant_id (optional) -> sent as query for listing

Endpoints expected:
- GET  /api/v1/merchant/reservations?limit=&offset=[&restaurant_id=...]
- POST /api/v1/merchant/reservations/{code}/redeem
  (fallbacks supported: POST /api/v1/merchant/reservations/redeem {code}, /api/v1/merchant/redeem)

Scanner:
- BarcodeDetector primary; fallback to jsQR via CDN + canvas.

Deploy:
- Copy web/merchant to your repo. Ensure /config.js supplies window.__FOODY__.FOODY_API
- Start: node server.js
- Open: /web/merchant/
