(function(){
  // ====== CONFIG ======
  const API_BASE = (window.FOODY_API || 'https://foodyback-production.up.railway.app').replace(/\/+$/,'');
  const PATH = '/api/v1/merchant/offers';

  // ====== RESTAURANT ID DETECTION ======
  function getRestaurantId(){
    const fromLS = localStorage.getItem('restaurant_id')
      || localStorage.getItem('restaurantId')
      || localStorage.getItem('current_restaurant_id')
      || localStorage.getItem('merchant_restaurant_id');
    if (fromLS) return fromLS;

    // try <meta name="restaurant_id" content="...">
    const meta = document.querySelector('meta[name="restaurant_id"]');
    if (meta && meta.content) return meta.content;

    // try data on body
    const ds = document.body && document.body.dataset ? document.body.dataset.restaurantId : null;
    if (ds) return ds;

    // try querystring ?restaurant_id=...
    const m = new URL(location.href).searchParams.get('restaurant_id');
    if (m) return m;

    return null; // as last resort backend may default, but our API needs it
  }

  function addRestId(url){
    const rid = getRestaurantId();
    try{
      const u = new URL(url, location.origin);
      if (rid && !u.searchParams.get('restaurant_id')) u.searchParams.set('restaurant_id', rid);
      return u.pathname + (u.search ? u.search : '');
    }catch(_){
      // fallback for relative strings
      if (!rid) return url;
      return url + (url.includes('?') ? '&' : '?') + 'restaurant_id=' + encodeURIComponent(rid);
    }
  }

  const ENDPOINTS = {
    list: () => `${API_BASE}${PATH}`,
    item: (id) => `${API_BASE}${PATH}/${id}`,
    itemSlash: (id) => `${API_BASE}${PATH}/${id}/`,
  };

  // ====== STATE & DOM ======
  const state = { items: [], loading:false, page:1, pageSize:50, token:0 };
  const D = {
    grid:  document.getElementById('offersGrid') || document.querySelector('.offers-grid') || document.querySelector('#my-offers .grid'),
    table: document.getElementById('offersTable') || null,
    empty: document.getElementById('offersEmpty') || null,
  };

  function authHeaders(){
    const t = localStorage.getItem('authToken') || localStorage.getItem('access_token') || '';
    return t ? { 'Authorization': 'Bearer ' + t } : {};
  }

  function toast(msg){
    const n=document.createElement('div');
    n.textContent=msg;
    n.style.cssText='position:fixed;right:16px;bottom:16px;background:#111;padding:10px 14px;border-radius:10px;color:#fff;z-index:2000;max-width:60vw';
    document.body.appendChild(n); setTimeout(()=>n.remove(),2500);
  }

  // ====== MODAL (no global CSS changes) ======
  function ensureModal(){
    if (document.getElementById('offerEditModal')) return;
    const html = `<div id="offerEditModal" hidden style="position:fixed;inset:0;display:grid;place-items:center;z-index:1000;">
      <div data-close style="position:absolute;inset:0;background:rgba(0,0,0,.55)"></div>
      <div style="position:relative;background:#151a21;border-radius:16px;width:min(720px,94vw);box-shadow:0 10px 30px rgba(0,0,0,.45);color:#e5e7eb">
        <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid #222">
          <h3 style="margin:0;font:inherit">Редактировать оффер</h3>
          <button data-close aria-label="Закрыть" style="background:transparent;border:none;color:#e5e7eb;font-size:22px;cursor:pointer">&times;</button>
        </div>
        <form id="offerEditForm" style="padding:14px 16px;display:grid;gap:10px">
          <input type="hidden" name="id"/>
          <label>Название
            <input name="title" required placeholder="Название оффера" style="width:100%;background:#0e1116;border:1px solid #2a2f39;border-radius:12px;padding:10px;color:#e5e7eb"/>
          </label>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
            <label>Старая цена
              <input type="number" name="old_price" min="0" step="1" style="width:100%;background:#0e1116;border:1px solid #2a2f39;border-radius:12px;padding:10px;color:#e5e7eb"/>
            </label>
            <label>Новая цена
              <input type="number" name="price" min="0" step="1" required style="width:100%;background:#0e1116;border:1px solid #2a2f39;border-radius:12px;padding:10px;color:#e5e7eb"/>
            </label>
          </div>
          <label>Количество, шт
            <input type="number" name="left_qty" min="0" step="1" required style="width:100%;background:#0e1116;border:1px solid #2a2f39;border-radius:12px;padding:10px;color:#e5e7eb"/>
          </label>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
            <label>Срок годности продукта
              <input name="best_before" type="text" placeholder="YYYY-MM-DD HH:mm" style="width:100%;background:#0e1116;border:1px solid #2a2f39;border-radius:12px;padding:10px;color:#e5e7eb"/>
            </label>
            <label>Срок действия оффера
              <input name="expires_at" type="text" placeholder="YYYY-MM-DD HH:mm" required style="width:100%;background:#0e1116;border:1px solid #2a2f39;border-radius:12px;padding:10px;color:#e5e7eb"/>
            </label>
          </div>
          <label>Категория
            <select name="category" style="width:100%;background:#0e1116;border:1px solid #2a2f39;border-radius:12px;padding:10px;color:#e5e7eb">
              <option value="">Другое</option>
              <option>Готовые блюда</option><option>Напитки</option><option>Выпечка</option>
            </select>
          </label>
          <label>Описание
            <textarea name="description" rows="3" placeholder="Короткое описание" style="width:100%;background:#0e1116;border:1px solid #2a2f39;border-radius:12px;padding:10px;color:#e5e7eb"></textarea>
          </label>
          <div style="display:flex;justify-content:flex-end;gap:8px;padding-top:8px">
            <button type="button" data-close style="padding:10px 14px;border-radius:12px;background:transparent;border:1px solid #334155;color:#e5e7eb;cursor:pointer">Отмена</button>
            <button type="submit" id="offerEditSaveBtn" style="padding:10px 14px;border-radius:12px;background:#3b82f6;border:none;color:#fff;cursor:pointer">Сохранить</button>
          </div>
        </form>
      </div>
    </div>`;
    document.body.insertAdjacentHTML('beforeend', html);
    document.addEventListener('click', (e)=>{ if(e.target.closest('[data-close]')) closeModal(); });
  }
  function openModal(){ ensureModal(); const m=document.getElementById('offerEditModal'); m.hidden=false; document.documentElement.style.overflow='hidden'; }
  function closeModal(){ const m=document.getElementById('offerEditModal'); if(!m) return; m.hidden=true; document.documentElement.style.overflow=''; }

  // ====== HELPERS ======
  function esc(s){ return (s||'').replace(/[&<>"']/g, (m)=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',\"'\":'&#39;' }[m]) ); }
  function money(n){ return new Intl.NumberFormat('ru-RU').format(n||0)+' ₽'; }
  function leftTime(ts){ const end=new Date(ts).getTime(), d=end-Date.now(); if(d<=0) return 'истёк'; const m=Math.floor(d/60000), h=Math.floor(m/60); return h?`${h} ч ${m%60} мин`:`${m} мин`; }
  function status(o){ if(o.is_active===false) return 'Скрыт'; if(new Date(o.expires_at).getTime()<=Date.now()) return 'Истёк'; return 'Активен'; }
  function toLocalInput(ts){ if(!ts) return ''; const d=new Date(ts); const p=n=>String(n).padStart(2,'0'); return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`; }
  function fromLocalInput(s){ if(!s) return null; // accept 'YYYY-MM-DD HH:mm' or datetime-local
    if (s.includes('T')) return new Date(s).toISOString();
    // replace space with 'T' to ISO
    const iso = s.replace(' ', 'T') + ':00';
    const d = new Date(iso); return isNaN(d.getTime()) ? null : d.toISOString();
  }
  function cardHTML(o){
    const img = o.photo_url || o.image_url || '';
    const disc = o.discount_percent ? `–${o.discount_percent}%` : '';
    return `<article class="card" data-id="${o.id}">
      ${img?`<div class="media"><img src="${img}" alt=""></div>`:''}
      <div class="body">
        <div class="meta"><span class="status">${status(o)}</span><span class="time">${leftTime(o.expires_at)}</span></div>
        <h4>${esc(o.title)}</h4>
        <div class="meta"><span class="price">${money(o.price)}</span><span class="disc">${disc}</span></div>
        <div class="meta"><span>Остаток: ${o.left_qty ?? 0}</span></div>
        <div class="offers-actions">
          <button class="btn btn-ghost js-edit" data-action="edit-offer">Редактировать</button>
          <button class="btn js-toggle">${o.is_active===false?'Показать':'Скрыть'}</button>
          <button class="btn btn-danger js-del">Удалить</button>
        </div>
      </div>
    </article>`;
  }

  // ====== LOAD LIST (always with restaurant_id) ======
  async function loadOffers(){
    if(state.loading) return; state.loading=true; const tok=++state.token;
    try{
      const base = ENDPOINTS.list();
      const url = addRestId(base) + `&page=${state.page}&page_size=${state.pageSize}`;
      const res = await fetch(url, { headers: { ...authHeaders() }});
      if(tok!==state.token) return;
      if(!res.ok) throw new Error('LIST_' + res.status);
      const data = await res.json();
      const items = Array.isArray(data.items)?data.items:(Array.isArray(data)?data:[]);
      state.items = items;
      render();
    }catch(e){
      console.error(e); toast('Не удалось загрузить офферы');
    }finally{ state.loading=false; }
  }

  // ====== RENDER ======
  function render(){
    if (D.grid){
      D.grid.innerHTML = state.items.map(cardHTML).join('');
      wire(D.grid);
    } else if (D.table){
      const tbody = D.table.tBodies[0] || D.table.createTBody();
      tbody.innerHTML = state.items.map(o => `<tr data-id="${o.id}">
        <td>${esc(o.title)}</td><td>${money(o.price)}</td><td>${o.left_qty??0}</td><td>${status(o)}</td>
        <td class="offers-actions"><button class="js-edit" data-action="edit-offer">Редактировать</button><button class="js-toggle">${o.is_active===false?'Показать':'Скрыть'}</button><button class="js-del">Удалить</button></td>
      </tr>`).join('');
      wire(tbody);
    }
  }

  function getId(el){ const host = el.closest('[data-id]') || el.closest('tr'); return host ? host.getAttribute('data-id') : null; }

  function wire(root){
    root.querySelectorAll('.js-edit, [data-action="edit-offer"]').forEach(b=> b.onclick = onEdit);
    root.querySelectorAll('.js-del').forEach(b=> b.onclick = onAskDelete);
    root.querySelectorAll('.js-toggle').forEach(b=> b.onclick = onToggle);
  }

  // ====== EDIT ======
  function onEdit(e){
    const id = getId(e.target); if(!id) return;
    const o = state.items.find(x => String(x.id)===String(id)); if(!o) return;
    ensureModal();
    const f = document.getElementById('offerEditForm');
    f.id.value = o.id;
    f.title.value = o.title || '';
    if (f.old_price) f.old_price.value = o.old_price ?? '';
    f.price.value = o.price ?? 0;
    f.left_qty.value = o.left_qty ?? 0;
    f.description.value = o.description || '';
    if (f.category) f.category.value = o.category || '';
    if (f.best_before) f.best_before.value = toLocalInput(o.best_before);
    if (f.expires_at) f.expires_at.value = toLocalInput(o.expires_at);
    initCalendars();
    openModal();
  }

  function initCalendars(){
    // use flatpickr if available on page
    const f = document.getElementById('offerEditForm');
    const opts = {enableTime:true, time_24hr:true, dateFormat:'Y-m-d H:i'};
    if (window.flatpickr){
      if (f.best_before && !f.best_before._fp) window.flatpickr(f.best_before, opts);
      if (f.expires_at && !f.expires_at._fp) window.flatpickr(f.expires_at, opts);
    } else {
      // leave as plain text/datetime-local; no global CSS changes
    }
  }

  document.addEventListener('submit', async (e)=>{
    if (e.target && e.target.id === 'offerEditForm'){
      e.preventDefault();
      const f = e.target;
      const id = f.id.value;
      const saveBtn = document.getElementById('offerEditSaveBtn'); if (saveBtn){ saveBtn.disabled=true; saveBtn.textContent='Сохранение…'; }
      const payload = {
        title: f.title.value.trim(),
        price: Number(f.price.value),
        left_qty: Number(f.left_qty.value),
        description: f.description.value.trim(),
      };
      if (f.old_price && f.old_price.value) payload.old_price = Number(f.old_price.value);
      if (f.category && f.category.value) payload.category = f.category.value;
      if (f.best_before && f.best_before.value) payload.best_before = fromLocalInput(f.best_before.value);
      if (f.expires_at && f.expires_at.value) payload.expires_at = fromLocalInput(f.expires_at.value);

      try{
        // PATCH item with restaurant_id, try with and without trailing slash; fallback to PUT
        const urls = [ addRestId(ENDPOINTS.item(id)), addRestId(ENDPOINTS.itemSlash(id)) ];
        let ok=false, updated=null;
        for (const m of ['PATCH','PUT']){
          for (const u of urls){
            const res = await fetch(u, { method:m, headers: { 'Content-Type':'application/json', ...authHeaders() }, body: JSON.stringify(payload) });
            if (res.ok){ ok=true; updated = await res.json().catch(()=>({})); break; }
          }
          if (ok) break;
        }
        if (!ok) throw new Error('SAVE_FAIL');
        // merge back to state
        const i = state.items.findIndex(x => String(x.id)===String(id));
        if (i>-1){
          state.items[i] = { ...state.items[i], ...updated, ...payload };
        }
        render(); closeModal(); toast('Изменения сохранены');
      }catch(err){ console.error(err); toast('Не удалось сохранить оффер'); }
      finally{ if (saveBtn){ saveBtn.disabled=false; saveBtn.textContent='Сохранить'; } }
    }
  });

  // ====== TOGGLE ACTIVE ======
  async function onToggle(e){
    const id = getId(e.target); if(!id) return;
    const item = state.items.find(x => String(x.id)===String(id)); if(!item) return;
    const next = item.is_active===false ? true : false;
    const payload = { is_active: next };
    const urls = [ addRestId(ENDPOINTS.item(id)), addRestId(ENDPOINTS.itemSlash(id)) ];
    const btn = e.target; btn.disabled=true;
    try{
      let ok=false;
      for (const u of urls){
        const res = await fetch(u, { method:'PATCH', headers:{ 'Content-Type':'application/json', ...authHeaders() }, body: JSON.stringify(payload) });
        if (res.ok){ ok=true; break; }
      }
      if (!ok) throw new Error('TOGGLE_FAIL');
      item.is_active = next; render();
    }catch(err){ console.error(err); toast('Не удалось изменить статус'); }
    finally{ btn.disabled=false; }
  }

  // ====== DELETE ======
  function onAskDelete(e){
    const id = getId(e.target); if(!id) return;
    if (!confirm('Удалить оффер? Действие необратимо.')) return;
    doDelete(id);
  }
  async function doDelete(id){
    const urls = [ addRestId(ENDPOINTS.item(id)), addRestId(ENDPOINTS.itemSlash(id)) ];
    try{
      let ok=false, notFound=false;
      for (const u of urls){
        const res = await fetch(u, { method:'DELETE', headers:{ ...authHeaders() } });
        if (res.ok){ ok=true; break; }
        if (res.status===404){ notFound=true; }
      }
      if (!ok && !notFound) throw new Error('DELETE_FAIL');
      state.items = state.items.filter(x => String(x.id)!==String(id));
      render();
      toast(notFound ? 'Оффер уже удалён' : 'Оффер удалён');
    }catch(err){ console.error(err); toast('Не удалось удалить оффер'); }
  }

  // ====== INIT ======
  // If there's no restaurant_id, warn once
  if (!getRestaurantId()){
    console.warn('[Foody] restaurant_id не найден. Установите его в localStorage.restaurant_id');
  }

  loadOffers();
})();