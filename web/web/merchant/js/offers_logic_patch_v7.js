(function(){
  // ===== Foody merchant patch v7 (no design changes) =====
  const API_BASE = window.FOODY_API || 'https://foodyback-production.up.railway.app';
  const PATHS = {
    list: '/api/v1/merchant/offers',
    one:  (id)=> `/api/v1/merchant/offers/${id}`,
  };

  // --- read restaurant_id from many places ---
  function readRID(){
    const keys = ['restaurant_id','restaurantId','current_restaurant_id','merchant_restaurant_id','rid'];
    for (const k of keys){
      let v = localStorage.getItem(k);
      if (v){
        // try plain number
        if (/^\d+$/.test(v)) return v;
        // try JSON string { restaurant_id: N } or nested
        try{
          const obj = JSON.parse(v);
          for (const cand of ['restaurant_id','restaurantId','id','rid']){
            if (obj && obj[cand] && /^\d+$/.test(String(obj[cand]))) return String(obj[cand]);
          }
        }catch(_){}
      }
    }
    // try meta or data-* in DOM
    const el = document.querySelector('[data-restaurant-id]');
    if (el){ const dv = el.getAttribute('data-restaurant-id'); if (dv && /^\d+$/.test(dv)) return dv; }
    const meta = document.querySelector('meta[name="restaurant_id"]');
    if (meta && meta.content && /^\d+$/.test(meta.content)) return meta.content;
    // try parse JWT
    const tok = localStorage.getItem('authToken') || localStorage.getItem('token') || '';
    if (tok.split('.').length===3){
      try{
        const payload = JSON.parse(atob(tok.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));
        for (const cand of ['restaurant_id','rid','restaurantId']){
          if (payload && payload[cand] && /^\d+$/.test(String(payload[cand]))) return String(payload[cand]);
        }
      }catch(_){}
    }
    return null;
  }
  let RESTAURANT_ID = readRID();

  function withRID(url){
    try{
      const u = new URL(url, API_BASE);
      if (!u.searchParams.has('restaurant_id') && RESTAURANT_ID){
        u.searchParams.set('restaurant_id', RESTAURANT_ID);
      }
      return u.toString();
    }catch(_){
      // in case URL constructor fails
      const sep = url.includes('?') ? '&' : '?';
      return RESTAURANT_ID ? `${url}${sep}restaurant_id=${encodeURIComponent(RESTAURANT_ID)}` : url;
    }
  }

  function bearer(){ 
    const t = localStorage.getItem('authToken') || localStorage.getItem('token') || '';
    return t ? { 'Authorization': `Bearer ${t}` } : {};
  }

  // --- fetch helpers with fallbacks ---
  async function doGET(path, opts={}){
    const u = withRID(API_BASE + path);
    const res = await fetch(u, { headers: { ...bearer(), ...(opts.headers||{}) } });
    if (res.status===422 && !RESTAURANT_ID){
      // try to discover rid from error payload if provided
      try{ const j=await res.clone().json(); const rid = j?.required_params?.restaurant_id || j?.restaurant_id; if (rid) { RESTAURANT_ID = String(rid); return doGET(path, opts);} }catch(_){}
    }
    return res;
  }

  async function doPATCHorPUT(path, body, isForm=false){
    const methods = ['PATCH','PUT'];
    const variants = [path, path + '/', path]; // second variant with trailing slash
    for (const m of methods){
      for (let i=0;i<variants.length;i++){
        const u = withRID(API_BASE + variants[i]);
        const res = await fetch(u, { method: m, headers: isForm? { ...bearer() } : { 'Content-Type':'application/json', ...bearer() }, body });
        if (res.ok) return res;
      }
    }
    // return last response with .ok false
    const u = withRID(API_BASE + path);
    return fetch(u, { method:'PATCH', headers: isForm? { ...bearer() } : { 'Content-Type':'application/json', ...bearer() }, body });
  }

  async function doDELETE(path){
    const variants = [path, path + '/'];
    let lastRes = null;
    for (const v of variants){
      const u = withRID(API_BASE + v);
      const res = await fetch(u, { method:'DELETE', headers: { ...bearer() } });
      lastRes = res;
      if (res.ok) return res;
      if (res.status===404) return res; // treat as soft-success
    }
    return lastRes;
  }

  // ===== DOM =====
  const D = {
    container: document.getElementById('my-offers') || document.querySelector('.offers') || document,
    grid: document.getElementById('offersGrid') || document.querySelector('.offers-grid') || null,
    table: document.getElementById('offersTable') || null,
    empty: document.getElementById('offersEmpty') || null,
    loadMore: document.getElementById('offersLoadMore') || null,
  };

  // ===== Modal (centered, minimal CSS inline, zero global impact) =====
  function ensureModal(){
    if (document.getElementById('offerEditModal')) return true;
    const tpl = `<div id="offerEditModal" style="position:fixed;inset:0;z-index:2147483000;display:none">
      <div data-close style="position:absolute;inset:0;background:rgba(0,0,0,.5)"></div>
      <div role="dialog" aria-modal="true" style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);background:#0f172a;border-radius:16px;min-width:min(640px,94vw);max-width:94vw;color:#e5e7eb;box-shadow:0 10px 30px rgba(0,0,0,.4)">
        <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid #1f2937">
          <h3 style="margin:0;font:inherit">Редактировать оффер</h3>
          <button data-close aria-label="Закрыть" style="background:transparent;border:none;color:#94a3b8;font-size:22px;cursor:pointer">&times;</button>
        </div>
        <form id="offerEditForm" style="padding:14px 16px;display:grid;gap:10px">
          <input type="hidden" name="id"/>
          <label>Название
            <input name="title" required style="width:100%;background:#0b1220;border:1px solid #233043;border-radius:12px;padding:10px;color:#e5e7eb"/>
          </label>
          <label>Описание
            <textarea name="description" rows="3" style="width:100%;background:#0b1220;border:1px solid #233043;border-radius:12px;padding:10px;color:#e5e7eb"></textarea>
          </label>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
            <label>Цена
              <input type="number" name="price" min="0" step="1" required style="width:100%;background:#0b1220;border:1px solid #233043;border-radius:12px;padding:10px;color:#e5e7eb"/>
            </label>
            <label>Остаток
              <input type="number" name="left_qty" min="0" step="1" required style="width:100%;background:#0b1220;border:1px solid #233043;border-radius:12px;padding:10px;color:#e5e7eb"/>
            </label>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
            <label>Срок годности продукта
              <input type="text" name="best_before" id="editBest" style="width:100%;background:#0b1220;border:1px solid #233043;border-radius:12px;padding:10px;color:#e5e7eb"/>
            </label>
            <label>Срок действия
              <input type="text" name="expires_at" id="editExpires" required style="width:100%;background:#0b1220;border:1px solid #233043;border-radius:12px;padding:10px;color:#e5e7eb"/>
            </label>
          </div>
          <div style="display:flex;justify-content:flex-end;gap:8px;padding-top:10px;border-top:1px solid #1f2937">
            <button type="button" data-close style="padding:10px 14px;border-radius:12px;background:transparent;border:1px solid #334155;color:#e5e7eb">Отмена</button>
            <button type="submit" id="offerEditSaveBtn" style="padding:10px 14px;border-radius:12px;background:#3b82f6;border:none;color:#fff">Сохранить</button>
          </div>
        </form>
      </div>
    </div>`;
    document.body.insertAdjacentHTML('beforeend', tpl);
    document.addEventListener('click', (e)=>{ if (e.target.closest('[data-close]')) closeModal(); }, true);
    initFlatpickr();
    return true;
  }
  function openModal(){ ensureModal(); const m=document.getElementById('offerEditModal'); m.style.display='block'; document.documentElement.style.overflow='hidden'; document.body.style.overflow='hidden'; }
  function closeModal(){ const m=document.getElementById('offerEditModal'); if(!m) return; m.style.display='none'; document.documentElement.style.overflow=''; document.body.style.overflow=''; }

  function initFlatpickr(){
    // attach only if flatpickr exists
    if (typeof window.flatpickr === 'function'){
      const opts = { enableTime:true, time_24hr:true, dateFormat:'Y-m-d H:i' };
      const a = document.getElementById('editBest'); if (a && !a._fp) window.flatpickr(a, opts);
      const b = document.getElementById('editExpires'); if (b && !b._fp) window.flatpickr(b, opts);
    } else {
      // fall back to datetime-local
      const a = document.getElementById('editBest'); if (a){ a.type='datetime-local'; }
      const b = document.getElementById('editExpires'); if (b){ b.type='datetime-local'; }
    }
  }

  // ===== State + render =====
  const state = { items: [], byId: {} };

  function normalizeItems(payload){
    let items = [];
    if (Array.isArray(payload)) items = payload;
    else if (payload && Array.isArray(payload.items)) items = payload.items;
    else if (payload && payload.data && Array.isArray(payload.data)) items = payload.data;
    state.items = items;
    state.byId = Object.fromEntries(items.map(x=>[String(x.id), x]));
  }

  async function loadOffers(){
    try{
      const res = await doGET(PATHS.list);
      if (!res.ok){
        throw new Error('list_fail_' + res.status);
      }
      const data = await res.json().catch(()=>[]);
      normalizeItems(data);
      // We don't re-render your DOM design; we only bind actions.
      wireExistingActions();
    }catch(err){
      console.error(err);
      toast('Не удалось загрузить офферы');
    }
  }

  function wireExistingActions(){
    // Delegate clicks on the whole container (works for your markup)
    D.container.addEventListener('click', (e)=>{
      const btn = e.target.closest('button, a');
      if (!btn) return;
      const txt = (btn.textContent || '').trim().toLowerCase();
      if (btn.matches('[data-action="edit-offer"], .js-edit, .btn-edit') || txt.includes('редакт')){
        e.preventDefault(); startEdit(btn);
      } else if (btn.matches('[data-action="delete-offer"], .js-del, .btn-del') || txt.includes('удал')){
        e.preventDefault(); askDelete(btn);
      } else if (btn.matches('[data-action="toggle-offer"], .js-toggle') || txt.includes('скрыть') || txt.includes('показать')){
        e.preventDefault(); toggleActive(btn);
      }
    }, { passive:false });
  }

  function startEdit(btn){
    const host = btn.closest('[data-id]') || btn.closest('tr');
    const id = host && host.getAttribute('data-id') || findIdNear(btn);
    if (!id){ toast('Не найден id оффера'); return; }
    const o = state.byId[String(id)] || { id };
    ensureModal();
    const f = document.getElementById('offerEditForm');
    f.id.value = o.id;
    f.title.value = (o.title || '').trim();
    f.description.value = (o.description || '').trim();
    f.price.value = Number(o.price ?? 0);
    f.left_qty.value = Number(o.left_qty ?? 0);
    f.best_before.value = toLocal(o.best_before);
    f.expires_at.value = toLocal(o.expires_at);
    openModal();
    initFlatpickr();
  }

  function toLocal(ts){
    if (!ts) return '';
    const d = new Date(ts);
    if (isNaN(d)) return '';
    const p=n=>String(n).padStart(2,'0');
    return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  function findIdNear(el){
    // look for hidden inputs / data attributes inside row/card
    const hid = el.closest('tr, [data-id]');
    if (hid){
      const t = hid.querySelector('input[name="id"], [name="id"]');
      if (t && t.value) return t.value;
      const cand = hid.getAttribute('data-id'); if (cand) return cand;
    }
    // fallback: scan up to find number-looking text like "#123"
    const m = (el.closest('tr')||document).textContent.match(/#?(\d{1,6})/);
    return m? m[1] : null;
  }

  document.addEventListener('submit', async (e)=>{
    if (e.target && e.target.id === 'offerEditForm'){
      e.preventDefault();
      const form = e.target;
      const saveBtn = form.querySelector('#offerEditSaveBtn') || form.querySelector('[type=submit]');
      const payload = {
        title: form.title.value.trim(),
        description: form.description.value.trim(),
        price: Number(form.price.value),
        left_qty: Number(form.left_qty.value),
        expires_at: new Date(form.expires_at.value || form.expires_at.getAttribute('value')).toISOString(),
      };
      if (form.best_before && form.best_before.value) payload.best_before = new Date(form.best_before.value).toISOString();

      try{
        if (saveBtn){ saveBtn.disabled=true; saveBtn.textContent='Сохранение…'; }
        const id = form.id.value;
        let res = await doPATCHorPUT(PATHS.one(id), JSON.stringify(payload), false);
        if (!res.ok) throw new Error('save_fail_' + res.status);
        // merge locally
        state.byId[String(id)] = { ...(state.byId[String(id)]||{}), ...payload };
        toast('Сохранено'); closeModal();
      }catch(err){ console.error(err); toast('Не удалось сохранить оффер'); }
      finally{ if (saveBtn){ saveBtn.disabled=false; saveBtn.textContent='Сохранить'; } }
    }
  });

  async function toggleActive(btn){
    const host = btn.closest('[data-id]') || btn.closest('tr');
    const id = host && host.getAttribute('data-id') || findIdNear(btn);
    if (!id) return;
    const cur = state.byId[String(id)] || {};
    const next = !(cur.is_active === false ? false : true); // toggle
    try{
      const res = await doPATCHorPUT(PATHS.one(id), JSON.stringify({ is_active: next }), false);
      if (!res.ok) throw new Error('toggle_fail_' + res.status);
      state.byId[String(id)] = { ...cur, is_active: next };
      toast(next ? 'Оффер показан' : 'Оффер скрыт');
    }catch(err){ console.error(err); toast('Не удалось изменить статус'); }
  }

  function askDelete(btn){
    const host = btn.closest('[data-id]') || btn.closest('tr');
    const id = host && host.getAttribute('data-id') || findIdNear(btn);
    if (!id) return;
    if (!confirm('Удалить оффер? Действие необратимо.')) return;
    doDelete(id, host);
  }

  async function doDelete(id, hostEl){
    try{
      const res = await doDELETE(PATHS.one(id));
      if (!res.ok && res.status!==404) throw new Error('delete_fail_' + res.status);
      // remove DOM node softly
      const node = hostEl || document.querySelector(`[data-id="${CSS.escape(String(id))}"]`) || null;
      if (node) node.remove();
      delete state.byId[String(id)];
      toast(res.status===404 ? 'Оффер уже был удалён' : 'Оффер удалён');
    }catch(err){ console.error(err); toast('Не удалось удалить оффер'); }
  }

  function toast(msg){ 
    const n=document.createElement('div'); 
    n.textContent=msg; 
    n.style.cssText='position:fixed;right:16px;bottom:16px;background:#111;padding:10px 14px;border-radius:10px;color:#fff;z-index:2147483647';
    document.body.appendChild(n); setTimeout(()=>n.remove(),2600); 
  }

  // start
  loadOffers();
  // refresh list every 60s to keep fresh (no flicker)
  setInterval(loadOffers, 60000);
})();