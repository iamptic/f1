
/*! Foody merchant universal patch v13 (2025-08-19)
 *  - Global monkeypatch for fetch & XMLHttpRequest to always append ?restaurant_id=<RID>
 *    to /api/v1/merchant/offers* requests (GET/POST/PATCH/PUT/DELETE)
 *  - Adds X-FOODY-KEY header if available in window.CONFIG / window.FOODY_KEY
 *  - Centers edit modal (#offerEditModal) and initializes flatpickr on date fields
 *  - Defensive click handlers for Edit/Delete when original handlers fail
 *  - Zero design changes
 */
(function () {
  const d = document;
  const w = window;

  // --- resolve API & KEY
  const API_ROOT = (w.FOODY_API || w.CONFIG?.FOODY_API || "https://foodyback-production.up.railway.app").replace(/\/+$/, "");
  const OFFERS_RE = /^\/?api\/v1\/merchant\/offers(\/.*)?$/i;
  const FULL_OFFERS_RE = new RegExp("^" + API_ROOT.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + OFFERS_RE.source.replace(/^\^/, ""));
  const getKey = () => (w.FOODY_KEY || w.CONFIG?.X_FOODY_KEY || w.CONFIG?.FOODY_KEY || w.CONFIG?.X_FOODY || "");

  // --- resolve restaurant_id
  function getRID() {
    try {
      const v = localStorage.getItem("restaurant_id") || localStorage.getItem("restaurantId") || localStorage.getItem("rid");
      if (v) return String(v);
    } catch {}
    const m = d.querySelector('meta[name="restaurant_id"]');
    if (m?.content) return String(m.content);
    const qs = new URLSearchParams(location.search);
    if (qs.get("restaurant_id")) return qs.get("restaurant_id");
    if (qs.get("rid")) return qs.get("rid");
    const el = d.querySelector("[data-restaurant-id]");
    if (el?.getAttribute("data-restaurant-id")) return el.getAttribute("data-restaurant-id");
    return "";
  }
  function needsRID(u) {
    try {
      const U = new URL(u, location.origin);
      const path = U.pathname.replace(/^\/+/, "");
      return OFFERS_RE.test(path) || FULL_OFFERS_RE.test(U.href);
    } catch {
      // plain path like /api/...
      return OFFERS_RE.test(String(u).replace(/^https?:\/\/[^/]+/i, "").replace(/^\/+/, ""));
    }
  }
  function appendRID(u) {
    const rid = getRID();
    if (!rid) return u;
    try {
      const U = new URL(u, location.origin);
      if (!U.searchParams.has("restaurant_id")) U.searchParams.set("restaurant_id", rid);
      return U.toString();
    } catch {
      // bare path
      const sep = String(u).includes("?") ? "&" : "?";
      return String(u) + sep + "restaurant_id=" + encodeURIComponent(rid);
    }
  }

  // --- monkeypatch fetch
  const __origFetch = w.fetch;
  w.fetch = async function(input, init) {
    try {
      let url = typeof input === "string" ? input : input.url;
      let opts = init ? { ...init } : (typeof input === "object" ? { method: input.method, headers: input.headers, body: input.body, credentials: input.credentials } : {});
      if (!opts.method) opts.method = "GET";

      if (needsRID(url)) {
        url = appendRID(url);
        const headers = new Headers(opts.headers || (typeof input === "object" ? input.headers : undefined) || {});
        const key = getKey();
        if (key && !headers.has("x-foody-key")) headers.set("x-foody-key", key);
        if (!headers.has("content-type") && opts.method !== "GET" && !(opts.body instanceof FormData)) {
          headers.set("content-type", "application/json");
        }
        opts.headers = headers;
      }
      const res = await __origFetch(url, opts);
      // if DELETE returns 404 on offers, treat as success-like (already deleted) to avoid UI dead-end
      if (needsRID(url) && opts.method?.toUpperCase() === "DELETE" && res.status === 404) {
        return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
      }
      return res;
    } catch (e) {
      return __origFetch(input, init);
    }
  };

  // --- monkeypatch XMLHttpRequest
  const __XHR = w.XMLHttpRequest;
  function PatchedXHR() {
    const xhr = new __XHR();
    const origOpen = xhr.open;
    xhr.open = function(method, url, async, user, password) {
      try {
        if (needsRID(url)) {
          url = appendRID(url);
        }
      } catch {}
      return origOpen.call(this, method, url, async, user, password);
    };
    const origSend = xhr.send;
    xhr.send = function(body) {
      try {
        // add key header if possible
        const key = getKey();
        if (key && !this._foodyKeySet) {
          try { this.setRequestHeader("x-foody-key", key); } catch {}
          this._foodyKeySet = true;
        }
      } catch {}
      return origSend.call(this, body);
    };
    return xhr;
  }
  w.XMLHttpRequest = PatchedXHR;

  // --- modal centering (no CSS changes, only inline)
  function centerModal() {
    const m = d.getElementById("offerEditModal");
    if (!m) return;
    Object.assign(m.style, {
      position: "fixed",
      left: "50%",
      top: "50%",
      transform: "translate(-50%, -50%)",
      maxHeight: "90vh",
      overflow: "auto",
      zIndex: 10000
    });
  }
  centerModal();
  new MutationObserver(centerModal).observe(d.documentElement, { childList: true, subtree: true });

  // --- flatpickr hookup if present
  function initPickers(root = d) {
    if (typeof w.flatpickr !== "function") return;
    const opts = { enableTime: true, time_24hr: true, dateFormat: "Y-m-d H:i", locale: w.flatpickr?.l10ns?.ru || w.flatpickr?.l10ns?.default };
    ["best_before","expires_at","valid_until","expire_at","expiry"].forEach(name => {
      root.querySelectorAll(`input[name="${name}"]`).forEach(inp => {
        if (!inp._fpDone) { w.flatpickr(inp, opts); inp._fpDone = true; }
      });
    });
  }
  setTimeout(initPickers, 300);
  setInterval(initPickers, 1500);

  // --- defensive click handlers for Edit/Delete (in case app.js didn't bind or crashed)
  function closestOfferCard(el) {
    return el?.closest?.("[data-offer-id], .offer-card, .offer-item");
  }
  d.addEventListener("click", async (e) => {
    // DELETE
    const del = e.target.closest?.("[data-action='delete-offer'], .js-delete-offer, .btn-delete-offer, [data-offer-delete]");
    if (del) {
      const card = closestOfferCard(del);
      const id = del.dataset.id || del.getAttribute("data-id") || card?.dataset?.offerId || card?.getAttribute("data-offer-id");
      if (!id) return;
      e.preventDefault();
      del.disabled = true;
      try {
        const res = await fetch(API_ROOT + "/api/v1/merchant/offers/" + encodeURIComponent(id), { method: "DELETE" });
        // 200 OK by normal or transformed from 404 by fetch patch
        if (res.ok) card?.parentNode?.removeChild(card);
      } finally {
        del.disabled = false;
      }
      return;
    }
    // EDIT open
    const edit = e.target.closest?.("[data-action='edit-offer'], .js-edit-offer, .btn-edit-offer, [data-offer-edit]");
    if (edit) {
      const id = edit.dataset.id || edit.getAttribute("data-id");
      const modal = d.getElementById("offerEditModal");
      if (modal) {
        modal.classList.remove("hidden");
        centerModal();
        if (id) {
          try {
            const r = await fetch(API_ROOT + "/api/v1/merchant/offers/" + encodeURIComponent(id), { method: "GET" });
            if (r.ok) {
              const data = await r.json();
              const map = { title:"title", description:"description", price:"price", discount:"discount", best_before:"best_before", expires_at:"expires_at" };
              Object.keys(map).forEach(k => {
                const el = modal.querySelector(`[name="${map[k]}"]`);
                if (el && data[k] != null) el.value = data[k];
              });
              initPickers(modal);
            }
          } catch {}
        }
      }
    }
  }, { capture: true });

  // Guard against previous typo 'Bollean'
  const BooleanGuard = Boolean;
})();
