
/*! Foody merchant hotfix: offers RID + modal center + safe delete (v10, 2025-08-18) */
(function () {
  try {
    const LOG_PREFIX = '[foody-offers-hotfix]';
    const d = document;

    function log(...args){ try{ console.log(LOG_PREFIX, ...args); }catch(e){} }
    function warn(...args){ try{ console.warn(LOG_PREFIX, ...args); }catch(e){} }
    function err(...args){ try{ console.error(LOG_PREFIX, ...args); }catch(e){} }

    // ---- resolve restaurant_id from multiple sources
    function getRID() {
      try {
        const fromMeta = d.querySelector('meta[name="restaurant_id"]')?.content?.trim();
        const params = new URLSearchParams(location.search);
        const fromQS = params.get('restaurant_id') || params.get('rid');
        const ls = window.localStorage || {};
        const keys = [
          'restaurant_id','restaurantId','current_restaurant_id',
          'merchant_restaurant_id','rid'
        ];
        for (const k of keys) {
          if (ls.getItem && ls.getItem(k)) return ls.getItem(k);
          if (k in ls && typeof ls[k] === 'string' && ls[k]) return ls[k];
        }
        if (fromMeta) return fromMeta;
        if (fromQS) return fromQS;
      } catch(e) { /* ignore */ }
      return null;
    }

    // If we can infer from offers list container (data-restaurant-id), use it
    function getRIDFromDOM(){
      try {
        const el = d.querySelector('[data-restaurant-id]');
        if (el) return el.getAttribute('data-restaurant-id');
      } catch(e) {}
      return null;
    }

    function ensureRID() {
      let rid = getRID() || getRIDFromDOM();
      if (rid && String(rid).trim()) {
        // persist normalized key
        try { localStorage.setItem('restaurant_id', String(rid)); } catch(e){}
        return String(rid);
      }
      return null;
    }

    const REST_PATH = '/api/v1/merchant/offers';
    const METHODS_NEED_RID = new Set(['GET','DELETE','PATCH','PUT','POST']);

    // Append restaurant_id to URL if it targets offers endpoint
    function withRID(urlInput) {
      const rid = ensureRID();
      try {
        const u = new URL(urlInput, location.origin);
        if (!u.pathname.startsWith(REST_PATH)) return urlInput;
        if (rid && !u.searchParams.has('restaurant_id')) {
          u.searchParams.set('restaurant_id', rid);
          return u.toString();
        }
      } catch(e) { /* best effort */ }
      return urlInput;
    }

    // ---- Patch fetch
    if (!window.__foodyRIDFetchPatched) {
      const origFetch = window.fetch;
      window.fetch = function(input, init) {
        try {
          let method = (init && init.method) ? String(init.method).toUpperCase() : 'GET';
          let urlStr;
          if (typeof input === 'string') {
            urlStr = input;
          } else if (input && typeof input === 'object' && 'url' in input) {
            urlStr = input.url;
            if (!init) init = {};
            if (!init.method && input.method) method = String(input.method).toUpperCase();
          }
          if (urlStr && METHODS_NEED_RID.has(method)) {
            const patched = withRID(urlStr);
            if (patched !== urlStr) {
              input = patched;
              log('fetch patched', method, patched);
            }
          }
        } catch (e) { warn('fetch patch error', e); }
        return origFetch.call(this, input, init);
      };
      try { Object.defineProperty(window, '__foodyRIDFetchPatched', { value: true }); } catch(e){}
    }

    // ---- Patch XMLHttpRequest
    if (!window.__foodyRIDXHRPatched) {
      const origOpen = XMLHttpRequest.prototype.open;
      XMLHttpRequest.prototype.open = function(method, url, async, user, password){
        try {
          const m = String(method || 'GET').toUpperCase();
          if (METHODS_NEED_RID.has(m) && typeof url === 'string' && url.indexOf(REST_PATH) === 0) {
            const patched = withRID(url);
            if (patched !== url) {
              url = patched;
              log('xhr patched', m, url);
            }
          }
        } catch(e){ warn('xhr patch error', e); }
        return origOpen.call(this, method, url, async, user, password);
      };
      try { Object.defineProperty(window, '__foodyRIDXHRPatched', { value: true }); } catch(e){}
    }

    // ---- Safe delete helper (treat 404 as already deleted)
    async function safeDelete(offerId) {
      const rid = ensureRID();
      if (!offerId) throw new Error('No offerId');
      const variants = [
        `${REST_PATH}/${offerId}`,
        `${REST_PATH}/${offerId}/`
      ].map(withRID);
      for (const url of variants) {
        try {
          const resp = await fetch(url, { method: 'DELETE', {} });
          if (resp.ok) return true;
          if (resp.status === 404) return true; // already gone
        } catch(e) { /* try next */ }
      }
      return false;
    }

    // ---- Center existing modal with id=offerEditModal (do not change theme)
    function ensureModalCentered(){
      const modal = d.getElementById('offerEditModal');
      if (!modal) return;
      modal.style.position = 'fixed';
      modal.style.left = '50%';
      modal.style.top = '50%';
      modal.style.transform = 'translate(-50%, -50%)';
      modal.style.maxHeight = '90vh';
      modal.style.overflow = 'auto';
      modal.style.zIndex = 10000;
    }
    const obs = new MutationObserver(()=>ensureModalCentered());
    obs.observe(d.documentElement, {childList:true, subtree:true});
    ensureModalCentered();

    // ---- Hook delete buttons (delegated)
    d.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-action="delete-offer"], .js-delete-offer, .btn-delete-offer, [data-offer-delete]');
      if (!btn) return;
      const card = btn.closest('[data-offer-id], .offer-card, .offer-item');
      const id = btn.dataset.id || btn.getAttribute('data-id') || card?.getAttribute('data-offer-id') || card?.dataset?.offerId;
      if (!id) return; // fall back to native handler
      e.preventDefault();
      btn.disabled = true;
      btn.setAttribute('aria-busy','true');
      const ok = await safeDelete(id);
      btn.disabled = false;
      btn.removeAttribute('aria-busy');
      if (ok) {
        if (card && card.parentNode) card.parentNode.removeChild(card);
        log('deleted offer', id);
      } else {
        alert('Не удалось удалить оффер. Проверьте соединение и попробуйте ещё раз.');
      }
    }, { capture: true });

    // ---- Flatpickr wiring (if available)
    function initDatepickers(root = d){
      const fp = window.flatpickr;
      if (typeof fp !== 'function') return;
      const opts = {
        enableTime: true,
        time_24hr: true,
        dateFormat: 'Y-m-d H:i',
        locale: (window.flatpickr?.l10ns?.ru) ? window.flatpickr.l10ns.ru : undefined
      };
      ['best_before','expires_at','valid_until','expiry','expire_at'].forEach(name=>{
        root.querySelectorAll(`input[name="${name}"]`).forEach(inp => {
          if (!inp._fp_inited) { fp(inp, opts); inp._fp_inited = true; }
        });
      });
    }
    setInterval(()=>initDatepickers(), 1200);
    initDatepickers();

    // ---- Tiny sanity: avoid common typos crashing code (Boolean misspell etc)
    try { /* no-op to surface syntax errors at load */ } catch(e){}

    log('ready. RID=', ensureRID());
  } catch(e) {
    try { console.error('[foody-offers-hotfix] fatal', e); } catch(_){}
  }
})();
