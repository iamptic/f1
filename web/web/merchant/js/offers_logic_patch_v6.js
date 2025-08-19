/* Foody merchant offers logic patch v6 (no design changes)
 * - Always uses restaurant_id=... for LIST/DELETE/PATCH/PUT
 * - Robust "Редактировать" open (delegation by text or data-action)
 * - Modal centered with minimal local CSS (or inline)
 * - Flatpickr calendars if available
 * - Soft 404 on DELETE
 */
(function(){
  const API = window.FOODY_API || 'https://foodyback-production.up.railway.app';
  function getRID(){
    const keys = ['restaurant_id','restaurantId','current_restaurant_id','merchant_restaurant_id'];
    for (const k of keys){
      const v = localStorage.getItem(k);
      if (v && String(v).trim()) return String(v).trim();
    }
    // DOM fallback
    const el = document.querySelector('[data-restaurant-id], #restaurantId, input[name=restaurant_id]');
    if (el){
      const v = el.getAttribute('data-restaurant-id') || el.value || el.textContent;
      if (v && String(v).trim()) return String(v).trim();
    }
    return null;
  }
  function withRID(url){
    const rid = getRID();
    if (!rid) return url; // let backend 422, user will see toast with hint
    const hasQ = url.includes('?');
    if (hasQ){
      if (url.includes('restaurant_id=')) return url;
      return url + '&restaurant_id=' + encodeURIComponent(rid);
    }
    return url + '?restaurant_id=' + encodeURIComponent(rid);
  }
  const ENDPOINTS = {
    list: ()=> withRID(`${API}/api/v1/merchant/offers`),
    item: (id)=> withRID(`${API}/api/v1/merchant/offers/${id}`),
    itemSlash: (id)=> withRID(`${API}/api/v1/merchant/offers/${id}/`),
  };

  const state = { items: [], loading:false, loadToken:0 };
  const D = {
    grid: document.getElementById('offersGrid') || document.querySelector('.offers-grid') || document.querySelector('#my-offers .grid'),
    table: document.getElementById('offersTable') || null,
    empty: document.getElementById('offersEmpty') || null,
    modal: document.getElementById('offerEditModal') || null,
    form: document.getElementById('offerEditForm') || null,
  };

  function toast(msg){
    const n=document.createElement('div'); n.textContent=msg;
    n.style.cssText='position:fixed;right:16px;bottom:16px;background:#111;padding:10px 14px;border-radius:10px;color:#fff;z-index:2000';
    document.body.appendChild(n); setTimeout(()=>n.remove(),2600);
  }

  // Minimal modal CSS once (scoped to #offerEditModal)
  function ensureModalCSS(){
    if (document.getElementById('foody-modal-center-css')) return;
    const css = `#offerEditModal[data-foody]{position:fixed;inset:0;display:grid;place-items:center;z-index:1000}
#offerEditModal[data-foody] ._backdrop{position:absolute;inset:0;background:rgba(0,0,0,.55)}
#offerEditModal[data-foody] ._dialog{position:relative;max-width:min(720px,96vw);width:100%}
._scrolllock{overflow:hidden!important}`;
    const s = document.createElement('style'); s.id='foody-modal-center-css'; s.textContent = css;
    document.head.appendChild(s);
  }

  function ensureModal(){
    ensureModalCSS();
    if (D.modal && D.form) return;
    const html = `<div id="offerEditModal" data-foody hidden>
      <div class="_backdrop" data-close></div>
      <div class="_dialog">
        <form id="offerEditForm" class="offer-edit-form">
          <input type="hidden" name="id">
          <!-- The actual fields must already exist in your HTML via template/partials.
               If not, we still render a safe minimal set to avoid crash. -->
          <div class="_body">
            <label>Название <input name="title" required></label>
            <label>Новая цена <input type="number" name="price" min="0" step="1" required></label>
            <label>Количество, шт <input type="number" name="left_qty" min="0" step="1" required></label>
            <label>Срок годности продукта <input name="best_before" data-calendar></label>
            <label>Срок действия <input name="expires_at" data-calendar></label>
            <label>Описание <textarea name="description" rows="3"></textarea></label>
          </div>
          <div class="_footer" style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px">
            <button type="button" data-close>Отмена</button>
            <button type="submit">Сохранить</button>
          </div>
        </form>
      </div>
    </div>`;
    document.body.insertAdjacentHTML('beforeend', html);
    D.modal = document.getElementById('offerEditModal');
    D.form = document.getElementById('offerEditForm');
    document.addEventListener('click', (e)=>{ if(e.target.closest('[data-close]')) closeModal(); });
  }

  function openModal(){ ensureModal(); D.modal.hidden=false; document.documentElement.classList.add('_scrolllock'); document.body.classList.add('_scrolllock'); }
  function closeModal(){ if(!D.modal) return; D.modal.hidden=true; document.documentElement.classList.remove('_scrolllock'); document.body.classList.remove('_scrolllock'); }

  function initCalendars(scope){
    const root = scope || D.form || document;
    const inputs = root.querySelectorAll('input[name="best_before"], input[name="expires_at"], input[data-calendar]');
    if (!inputs.length) return;
    if (typeof window.flatpickr === 'function'){
      inputs.forEach(inp => {
        window.flatpickr(inp, { enableTime:true, time_24hr:true, dateFormat:'Y-m-d H:i', locale:(window.flatpickr.l10ns && window.flatpickr.l10ns.ru) ? 'ru' : undefined });
      });
    } else {
      // rely on native datetime-local if present
      inputs.forEach(inp => { if (!inp.type || inp.type==='text') try{ inp.type='datetime-local'; }catch(_){ /* ignore */ } });
    }
  }

  function leftTime(ts){ const end = new Date(ts).getTime(); const diff=end-Date.now(); if(diff<=0) return 'истёк'; const m=Math.floor(diff/60000), h=Math.floor(m/60); return h?`${h} ч ${m%60} мин`:`${m} мин`; }
  function status(o){ if(o.is_active===false) return 'Скрыт'; if(new Date(o.expires_at).getTime()<=Date.now()) return 'Истёк'; return 'Активен'; }
  function money(n){ return new Intl.NumberFormat('ru-RU').format(n||0) + ' ₽'; }
  function esc(s){ return (s||'').replace(/[&<>"']/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',\"'\":'&#39;' }[m])); }
  function getId(el){ const host = el.closest('[data-id]') || el.closest('tr'); return host ? host.getAttribute('data-id') : null; }

  async function listOffers(){
    if (state.loading) return;
    state.loading = true; const tok = ++state.loadToken;
    try{
      const res = await fetch(ENDPOINTS.list(), { headers: auth() });
      if (tok !== state.loadToken) return;
      if (!res.ok){
        if (res.status===422){ toast('Нужно выбрать ресторан (restaurant_id).'); }
        throw new Error('list_fail');
      }
      const data = await res.json();
      const items = Array.isArray(data.items) ? data.items : (Array.isArray(data) ? data : []);
      state.items = items;
      render();
    }catch(e){ console.error(e); }
    finally{ state.loading=false; }
  }

  function auth(){ const t = localStorage.getItem('authToken') || localStorage.getItem('token'); return t ? { 'Authorization': 'Bearer '+t } : {}; }

  function render(){
    if (D.grid){
      const html = state.items.map(o => {
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
              <button data-action="edit-offer">Редактировать</button>
              <button data-action="toggle-offer">${o.is_active===false?'Показать':'Скрыть'}</button>
              <button data-action="delete-offer">Удалить</button>
            </div>
          </div>
        </article>`;
      }).join('');
      D.grid.innerHTML = html;
    } else if (D.table){
      const tbody = D.table.tBodies[0] || D.table.createTBody();
      const rows = state.items.map(o => `<tr data-id="${o.id}">
        <td>${esc(o.title)}</td><td>${money(o.price)}</td><td>${o.left_qty ?? 0}</td><td>${status(o)}</td>
        <td class="offers-actions">
          <button data-action="edit-offer">Редактировать</button>
          <button data-action="toggle-offer">${o.is_active===false?'Показать':'Скрыть'}</button>
          <button data-action="delete-offer">Удалить</button>
        </td>
      </tr>`).join('');
      tbody.innerHTML = rows;
    }
  }

  // Robust delegation (buttons or text content)
  document.addEventListener('click', (e)=>{
    const btn = e.target.closest('button, a');
    if (!btn) return;
    const action = btn.getAttribute('data-action') || btn.dataset.action;
    const text = (btn.textContent||'').trim();
    if (action==='edit-offer' || text==='Редактировать'){
      onEdit(e, btn);
    } else if (action==='delete-offer' || text==='Удалить'){
      onDelete(e, btn);
    } else if (action==='toggle-offer' || text==='Показать' || text==='Скрыть'){
      onToggle(e, btn);
    }
  });

  function fillForm(o){
    const f = D.form;
    if (!f) return;
    (f.querySelector('[name=id]')||{}).value = o.id ?? '';
    (f.querySelector('[name=title]')||{}).value = o.title ?? '';
    (f.querySelector('[name=price]')||{}).value = o.price ?? '';
    (f.querySelector('[name=left_qty]')||{}).value = o.left_qty ?? '';
    (f.querySelector('[name=description]')||{}).value = o.description ?? '';
    // dates
    const toInput=(ts)=>{ if(!ts) return ''; const d=new Date(ts); const p=n=>String(n).padStart(2,'0'); return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
    const best = f.querySelector('[name=best_before]'); if (best) best.value = toInput(o.best_before || o.bestBefore || '');
    const exp  = f.querySelector('[name=expires_at]'); if (exp) exp.value = toInput(o.expires_at || o.expiresAt || '');
    initCalendars(f);
  }

  function onEdit(e, btn){
    e.preventDefault();
    const id = getId(btn);
    const o = state.items.find(x => String(x.id)===String(id));
    if (!o){ toast('Оффер не найден в списке'); return; }
    ensureModal();
    fillForm(o);
    openModal();
  }

  async function onToggle(e, btn){
    e.preventDefault();
    const id = getId(btn);
    const o = state.items.find(x => String(x.id)===String(id));
    if (!o) return;
    const next = !(o.is_active===false);
    const body = JSON.stringify({ is_active: !next });
    const headers = { 'Content-Type':'application/json', ...auth() };
    try{
      let res = await fetch(ENDPOINTS.item(id), { method:'PATCH', headers, body });
      if (!res.ok) res = await fetch(ENDPOINTS.itemSlash(id), { method:'PATCH', headers, body });
      if (!res.ok) throw new Error('toggle_fail');
      o.is_active = !next;
      render();
    }catch(err){ console.error(err); toast('Не удалось изменить статус'); }
  }

  async function onDelete(e, btn){
    e.preventDefault();
    if (!confirm('Удалить оффер? Действие необратимо.')) return;
    const id = getId(btn);
    try{
      let res = await fetch(ENDPOINTS.item(id), { method:'DELETE', headers: { ...auth() } });
      if (!res.ok) res = await fetch(ENDPOINTS.itemSlash(id), { method:'DELETE', headers: { ...auth() } });
      if (!res.ok && res.status!==404) throw new Error('delete_fail');
      // remove locally
      state.items = state.items.filter(x => String(x.id)!==String(id));
      render(); toast(res.status===404 ? 'Оффер уже удалён' : 'Оффер удалён');
    }catch(err){ console.error(err); toast('Не удалось удалить оффер'); }
  }

  // Submit save
  document.addEventListener('submit', async (e)=>{
    if (e.target && e.target.id==='offerEditForm'){
      e.preventDefault();
      const f = e.target;
      const id = (f.querySelector('[name=id]')||{}).value;
      const hasPhoto = f.querySelector('input[type=file][name=photo]')?.files?.[0];
      const headers = hasPhoto ? { ...auth() } : { 'Content-Type':'application/json', ...auth() };
      let body;
      if (hasPhoto){
        const fd = new FormData();
        fd.append('title', (f.title?.value||'').trim());
        fd.append('price', Number(f.price?.value||0));
        fd.append('left_qty', Number(f.left_qty?.value||0));
        if (f.description) fd.append('description', (f.description.value||'').trim());
        if (f.best_before && f.best_before.value) fd.append('best_before', new Date(f.best_before.value).toISOString());
        if (f.expires_at && f.expires_at.value) fd.append('expires_at', new Date(f.expires_at.value).toISOString());
        fd.append('photo', hasPhoto);
        body = fd;
      } else {
        body = JSON.stringify({
          title: (f.title?.value||'').trim(),
          price: Number(f.price?.value||0),
          left_qty: Number(f.left_qty?.value||0),
          description: (f.description?.value||'').trim(),
          best_before: f.best_before && f.best_before.value ? new Date(f.best_before.value).toISOString() : undefined,
          expires_at: f.expires_at && f.expires_at.value ? new Date(f.expires_at.value).toISOString() : undefined,
        });
      }
      try{
        let res = await fetch(ENDPOINTS.item(id), { method:'PATCH', headers, body });
        if (!res.ok) res = await fetch(ENDPOINTS.itemSlash(id), { method:'PATCH', headers, body });
        if (!res.ok) res = await fetch(ENDPOINTS.item(id), { method:'PUT', headers, body });
        if (!res.ok) res = await fetch(ENDPOINTS.itemSlash(id), { method:'PUT', headers, body });
        if (!res.ok) throw new Error('save_fail');
        const updated = await res.json().catch(()=> ({}));
        const i = state.items.findIndex(x=>String(x.id)===String(id));
        if (i>-1) state.items[i] = { ...state.items[i], ...updated };
        render(); closeModal(); toast('Изменения сохранены');
      }catch(err){ console.error(err); toast('Не удалось сохранить оффер'); }
    }
  });

  // Initial
  document.addEventListener('DOMContentLoaded', ()=>{
    listOffers();
    setInterval(()=>{ listOffers(); }, 60000);
    // In case modal exists in DOM, init calendars
    if (D.form) initCalendars(D.form);
  });
})();