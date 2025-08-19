(function(){
  // ===== Foody merchant offers logic (final, RID required) =====
  const API_BASE = window.FOODY_API || 'https://foodyback-production.up.railway.app';
  const PATH = `${API_BASE}/api/v1/merchant/offers`;

  // ---- RID helpers ----
  function getRID(){
    // strict: use restaurant_id first
    const ls = window.localStorage || {};
    const keys = ['restaurant_id','restaurantId','current_restaurant_id','merchant_restaurant_id'];
    for (const k of keys){
      const v = ls.getItem ? ls.getItem(k) : null;
      if (v) return v;
    }
    // meta fallback
    const m = document.querySelector('meta[name="restaurant_id"]');
    if (m && m.content) return m.content.trim();
    // url fallback
    const u = new URL(location.href);
    if (u.searchParams.get('restaurant_id')) return u.searchParams.get('restaurant_id');
    return null;
  }
  function withRID(url){
    const rid = getRID();
    const u = new URL(url, location.origin);
    if (rid) {
      if (!u.searchParams.get('restaurant_id')) u.searchParams.set('restaurant_id', rid);
    }
    return u.toString().replace(location.origin, '');
  }

  // ---- DOM ----
  const D = {
    grid:  document.getElementById('offersGrid') || document.querySelector('.offers-grid') || document.querySelector('#my-offers .grid'),
    table: document.getElementById('offersTable') || null,
    empty: document.getElementById('offersEmpty') || null,
  };

  // ---- State ----
  const state = { items:[], loading:false, token:0 };

  function auth(){ 
    const t = localStorage.getItem('authToken') || '';
    return t ? { 'Authorization': `Bearer ${t}` } : {};
  }
  function toast(msg){
    const n=document.createElement('div'); n.textContent=msg;
    n.style.cssText='position:fixed;right:16px;bottom:16px;background:#111;padding:10px 14px;border-radius:10px;color:#fff;z-index:3000';
    document.body.appendChild(n); setTimeout(()=>n.remove(),2400);
  }

  // ---- Modal (no design changes; inline styles only on this element) ----
  function ensureModal(){
    if (document.getElementById('offerEditModal')) return;
    const html = `<div id="offerEditModal" hidden style="position:fixed;inset:0;display:grid;place-items:center;z-index:2000">
      <div data-close style="position:absolute;inset:0;background:rgba(0,0,0,.55)"></div>
      <div style="position:relative;background:#151a21;border-radius:16px;width:min(680px,94vw);box-shadow:0 10px 30px rgba(0,0,0,.45);color:#e5e7eb">
        <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid #222">
          <h3 style="margin:0;font:inherit">Редактировать оффер</h3>
          <button data-close aria-label="Закрыть" style="background:transparent;border:none;color:#e5e7eb;font-size:22px;cursor:pointer">&times;</button>
        </div>
        <form id="offerEditForm" style="padding:14px 16px;display:grid;gap:10px">
          <input type="hidden" name="id"/>
          <label>Название <input name="title" required style="width:100%;background:#0e1116;border:1px solid #2a2f39;border-radius:12px;padding:10px;color:#e5e7eb"/></label>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
            <label>Старая цена <input type="number" name="old_price" min="0" step="1" style="width:100%;background:#0e1116;border:1px solid #2a2f39;border-radius:12px;padding:10px;color:#e5e7eb"/></label>
            <label>Новая цена <input type="number" name="price" min="0" step="1" required style="width:100%;background:#0e1116;border:1px solid #2a2f39;border-radius:12px;padding:10px;color:#e5e7eb"/></label>
          </div>
          <label>Количество, шт <input type="number" name="left_qty" min="0" step="1" required style="width:100%;background:#0e1116;border:1px solid #2a2f39;border-radius:12px;padding:10px;color:#e5e7eb"/></label>
          <label>Срок годности продукта <input name="best_before" id="editBest" style="width:100%;background:#0e1116;border:1px solid #2a2f39;border-radius:12px;padding:10px;color:#e5e7eb"/></label>
          <label>Срок действия <input name="expires_at" id="editExpires" required style="width:100%;background:#0e1116;border:1px solid #2a2f39;border-radius:12px;padding:10px;color:#e5e7eb"/></label>
          <label>Категория <select name="category" style="width:100%;background:#0e1116;border:1px solid #2a2f39;border-radius:12px;padding:10px;color:#e5e7eb">
            <option>Другое</option><option>Напитки</option><option>Выпечка</option><option>Горячее</option>
          </select></label>
          <label>Описание <textarea name="description" rows="3" style="width:100%;background:#0e1116;border:1px solid #2a2f39;border-radius:12px;padding:10px;color:#e5e7eb"></textarea></label>
          <div style="display:flex;justify-content:flex-end;gap:8px;padding-top:10px;border-top:1px solid #222;margin-top:6px">
            <button type="button" data-close style="padding:10px 14px;border-radius:12px;background:transparent;border:1px solid #334155;color:#e5e7eb">Отмена</button>
            <button type="submit" id="offerEditSaveBtn" style="padding:10px 14px;border-radius:12px;background:#3b82f6;border:none;color:#fff">Сохранить</button>
          </div>
        </form>
      </div></div>`;
    document.body.insertAdjacentHTML('beforeend', html);
    document.addEventListener('click',(e)=>{ if(e.target.closest('[data-close]')) closeModal(); });
    setupFlatpickr();
  }
  function openModal(){ ensureModal(); document.getElementById('offerEditModal').hidden=false; document.documentElement.style.overflow='hidden'; }
  function closeModal(){ const m=document.getElementById('offerEditModal'); if(!m) return; m.hidden=true; document.documentElement.style.overflow=''; }

  // ---- List / Render ----
  function money(n){ return new Intl.NumberFormat('ru-RU').format(n||0)+' ₽'; }
  function esc(s){ return (s||'').replace(/[&<>\"']/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;','\'':'&#39;' }[m])); }
  function cardHTML(o){
    return `<article class="card" data-id="${o.id}">
      <div class="body">
        <div class="meta"><span>${esc(o.title||'')}</span><span>${o.left_qty ?? 0} шт</span></div>
        <div class="meta"><span>${money(o.price)}</span><span>${o.expires_at? new Date(o.expires_at).toLocaleString('ru-RU'):''}</span></div>
        <div class="offers-actions">
          <button class="js-edit">Редактировать</button>
          <button class="js-del">Удалить</button>
        </div>
      </div>
    </article>`;
  }
  function rowHTML(o){
    return `<tr data-id="${o.id}">
      <td>${esc(o.title||'')}</td><td>${money(o.price)}</td><td>${o.left_qty ?? 0}</td>
      <td>${o.expires_at? new Date(o.expires_at).toLocaleString('ru-RU'):''}</td>
      <td><button class="js-edit">Редактировать</button> <button class="js-del">Удалить</button></td>
    </tr>`;
  }
  function render(){
    if (D.grid){
      D.grid.innerHTML = state.items.map(cardHTML).join('');
      bindActions(D.grid);
    } else if (D.table){
      const tb = D.table.tBodies[0] || D.table.createTBody();
      tb.innerHTML = state.items.map(rowHTML).join('');
      bindActions(tb);
    }
  }
  function bindActions(root){
    root.querySelectorAll('.js-edit').forEach(b=>b.onclick = onEdit);
    root.querySelectorAll('.js-del').forEach(b=>b.onclick = onDelete);
  }

  // ---- API ----
  async function listOffers(){
    const rid = getRID();
    if (!rid){ toast('Не найден restaurant_id'); return; }
    const url = withRID(`${PATH}`);
    const res = await fetch(url, { headers:{...auth()} });
    if (!res.ok){ throw new Error('list_fail'); }
    const data = await res.json();
    const items = Array.isArray(data.items)?data.items : (Array.isArray(data)?data:[]);
    state.items = items;
    render();
  }

  async function deleteOffer(id){
    const urls = [ withRID(`${PATH}/${id}`), withRID(`${PATH}/${id}/`) ];
    for (const u of urls){
      const r = await fetch(u, { method:'DELETE', headers:{...auth()} });
      if (r.ok || r.status===404) return true;
    }
    return false;
  }

  async function saveOffer(id, payload){
    // prefer PATCH, then PUT; both with rid; with/without trailing slash
    const bodies = [
      {method:'PATCH', url: withRID(`${PATH}/${id}`)},
      {method:'PATCH', url: withRID(`${PATH}/${id}/`)},
      {method:'PUT',   url: withRID(`${PATH}/${id}`)},
      {method:'PUT',   url: withRID(`${PATH}/${id}/`)}
    ];
    for (const b of bodies){
      const r = await fetch(b.url, { method:b.method, headers:{'Content-Type':'application/json', ...auth()}, body: JSON.stringify(payload)});
      if (r.ok) return await r.json().catch(()=>payload);
    }
    throw new Error('save_fail');
  }

  // ---- Actions ----
  function onEdit(e){
    const host = e.target.closest('[data-id]'); if(!host) return;
    const id = host.getAttribute('data-id');
    const o = state.items.find(x=>String(x.id)===String(id)); if(!o) return;
    ensureModal();
    const f = document.getElementById('offerEditForm');
    f.id.value = o.id;
    f.title.value = o.title || '';
    if (f.old_price) f.old_price.value = o.old_price ?? '';
    f.price.value = o.price ?? 0;
    f.left_qty.value = o.left_qty ?? 0;
    f.best_before.value = toLocal(o.best_before);
    f.expires_at.value = toLocal(o.expires_at);
    if (f.category) f.category.value = o.category || f.category.value;
    if (f.description) f.description.value = o.description || '';
    openModal();
    if (!f.__binded){
      f.addEventListener('submit', async (ev)=>{
        ev.preventDefault();
        const payload = {
          title: f.title.value.trim(),
          old_price: f.old_price ? Number(f.old_price.value||0): undefined,
          price: Number(f.price.value||0),
          left_qty: Number(f.left_qty.value||0),
          best_before: fromLocal(f.best_before.value),
          expires_at: fromLocal(f.expires_at.value),
          category: f.category ? f.category.value : undefined,
          description: f.description ? f.description.value.trim() : undefined
        };
        try{
          const upd = await saveOffer(f.id.value, payload);
          // merge into state
          const i = state.items.findIndex(x=>String(x.id)===String(f.id.value));
          if (i>-1) state.items[i] = { ...state.items[i], ...payload, ...upd };
          render(); closeModal(); toast('Сохранено');
        }catch(err){ console.error(err); toast('Не удалось сохранить'); }
      });
      f.__binded = true;
    }
  }

  async function onDelete(e){
    const host = e.target.closest('[data-id]'); if(!host) return;
    const id = host.getAttribute('data-id');
    if (!confirm('Удалить оффер?')) return;
    try{
      const ok = await deleteOffer(id);
      if (ok){
        state.items = state.items.filter(x=>String(x.id)!==String(id));
        render(); toast('Оффер удалён');
      } else {
        toast('Не удалось удалить');
      }
    }catch(err){ console.error(err); toast('Не удалось удалить'); }
  }

  // ---- Date helpers ----
  function toLocal(ts){
    if (!ts) return '';
    const d = new Date(ts); const p=n=>String(n).padStart(2,'0');
    return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }
  function fromLocal(s){
    if (!s) return null;
    // Accept "YYYY-MM-DD HH:mm" or "YYYY-MM-DDTHH:mm"
    const t = s.replace('T',' ');
    const d = new Date(t);
    return isNaN(+d) ? null : d.toISOString();
    }
  function setupFlatpickr(){
    if (window.flatpickr){
      const opts = { enableTime:true, time_24hr:true, dateFormat:'Y-m-d H:i', locale: (window.ru || undefined) };
      const best = document.getElementById('editBest'); if (best) window.flatpickr(best, opts);
      const exp  = document.getElementById('editExpires'); if (exp) window.flatpickr(exp, opts);
    }
  }

  // ---- Init ----
  async function init(){
    try{ await listOffers(); }
    catch(e){ console.error(e); toast('Ошибка загрузки офферов'); }
    document.addEventListener('click', (e)=>{
      const btn = e.target.closest('button, a');
      if (!btn) return;
      const txt = (btn.textContent||'').trim().toLowerCase();
      if (btn.classList.contains('js-edit') || txt==='редактировать') onEdit(e);
      if (btn.classList.contains('js-del') || txt==='удалить') onDelete(e);
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();