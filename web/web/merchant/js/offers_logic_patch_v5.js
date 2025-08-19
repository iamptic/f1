
// Foody merchant offers fix v5 (no design changes)
(function(){
  const API = window.FOODY_API || 'https://foodyback-production.up.railway.app';
  const EP = {
    list: (rid)=> rid? `${API}/api/v1/merchant/offers?restaurant_id=${encodeURIComponent(rid)}`
                     : `${API}/api/v1/merchant/offers`,
    item: (id)=> `${API}/api/v1/merchant/offers/${id}`,
  };

  const state = { items: [], lastRid:null, loadToken:0, loading:false };

  function ridFromStorage(){
    const keys = ['restaurant_id','restaurantId','current_restaurant_id','merchant_restaurant_id'];
    for(const k of keys){ const v=localStorage.getItem(k); if(v) return v; }
    return null;
  }

  function getRID(){ return state.lastRid || ridFromStorage(); }

  function auth(){ const t=localStorage.getItem('authToken') || localStorage.getItem('token'); return t? {'Authorization':`Bearer ${t}`} : {}; }

  // ---- Load list (remember restaurant_id if present on server) ----
  async function loadOffers(){
    if (state.loading) return;
    state.loading = true;
    const tok = ++state.loadToken;
    const rid = getRID();
    let url = EP.list(rid);
    try{
      const res = await fetch(url,{headers:{...auth()}});
      if (tok!==state.loadToken) return;
      if(!res.ok) throw new Error('list_fail');
      const data = await res.json();
      const items = Array.isArray(data.items)? data.items : (Array.isArray(data)? data : []);
      state.items = items;
      try{
        // try to infer rid from any URL we can read (not guaranteed)
        const u = new URL(res.url); const r=u.searchParams.get('restaurant_id'); if(r) state.lastRid=r;
      }catch{}
      render();
    }catch(e){
      console.error(e); toast('Не удалось загрузить офферы');
    }finally{ state.loading=false; }
  }

  // ---- Rendering helpers (respect existing layout) ----
  function fmtMoney(n){ return new Intl.NumberFormat('ru-RU').format(n||0)+' ₽'; }
  function leftTime(ts){ const end=new Date(ts).getTime(), d=end-Date.now(); if(d<=0) return 'истёк'; const m=Math.floor(d/6e4), h=Math.floor(m/60); return h?`${h} ч ${m%60} мин`:`${m} мин`; }
  function status(o){ if(o.is_active===false) return 'Скрыт'; if(new Date(o.expires_at).getTime()<=Date.now()) return 'Истёк'; return 'Активен'; }
  const sel = {
    list: document.querySelector('#offersGrid, .offers-grid, #my-offers .grid') || document.querySelector('#offersTable tbody') || document.querySelector('#offersTable'),
  };

  function rowHost(el){ return el.closest('[data-id]') || el.closest('tr'); }
  function getId(el){ const h=rowHost(el); return h?h.getAttribute('data-id'):null; }

  function render(){
    const host = sel.list; if(!host) return;
    // If cards already in DOM from your template/api, just (re)bind handlers:
    bindDelegates();
  }

  // ---- Delegated handlers (robust to any markup) ----
  function bindDelegates(){
    document.removeEventListener('click', onClick, true);
    document.addEventListener('click', onClick, true);
    // form submit for modal
    document.removeEventListener('submit', onSubmit, true);
    document.addEventListener('submit', onSubmit, true);
  }

  function matchActionButton(target, kinds){
    let el = target;
    while(el && el!==document){
      if (el.matches && (el.matches('[data-action]') || el.matches('.js-edit,.js-del,.js-toggle'))) {
        const act = el.dataset.action || (el.classList.contains('js-edit')?'edit':el.classList.contains('js-del')?'delete':el.classList.contains('js-toggle')?'toggle':'');
        if (kinds.includes(act)) return {el, act};
      }
      if (el.tagName==='BUTTON' || el.tagName==='A'){
        const txt = (el.textContent||'').trim().toLowerCase();
        if (kinds.includes('edit') && /редакт/i.test(txt)) return {el, act:'edit'};
        if (kinds.includes('delete') && /удалить/i.test(txt)) return {el, act:'delete'};
        if (kinds.includes('toggle') && /(скрыть|показать)/i.test(txt)) return {el, act:'toggle'};
      }
      el = el.parentElement;
    }
    return null;
  }

  function onClick(e){
    const m = matchActionButton(e.target, ['edit','delete','toggle']);
    if (!m) return;
    const id = getId(m.el);
    if (!id) return;
    if (m.act==='edit'){ e.preventDefault(); openEdit(id); }
    else if (m.act==='delete'){ e.preventDefault(); askDelete(id); }
    else if (m.act==='toggle'){ e.preventDefault(); toggleActive(id, m.el); }
  }

  // ---- Modal ----
  function ensureModal(){
    let modal = document.getElementById('offerEditModal');
    if (!modal){
      const div = document.createElement('div');
      div.id = 'offerEditModal';
      div.innerHTML = `
        <div class="_backdrop" data-close></div>
        <div class="_dlg">
          <div class="_hdr"><strong>Редактировать оффер</strong>
            <button data-close aria-label="Закрыть">×</button>
          </div>
          <form id="offerEditForm" class="_body">
            <input type="hidden" name="id" />
            <label>Название <input name="title" required></label>
            <label>Новая цена <input name="price" type="number" min="0" step="1" required></label>
            <label>Количество, шт <input name="left_qty" type="number" min="0" step="1" required></label>
            <label>Срок годности продукта <input id="editBest" name="best_before" placeholder="YYYY-MM-DD HH:mm"></label>
            <label>Срок действия <input id="editExpires" name="expires_at" placeholder="YYYY-MM-DD HH:mm" required></label>
            <label>Описание <textarea name="description" rows="3"></textarea></label>
            <div class="_ftr">
              <button type="button" data-close>Отмена</button>
              <button type="submit" id="offerEditSaveBtn">Сохранить</button>
            </div>
          </form>
        </div>`;
      document.body.appendChild(div);
      modal = div;
    }
    return modal;
  }

  function openEdit(id){
    const modal = ensureModal();
    const form = modal.querySelector('#offerEditForm');
    // center
    modal.classList.add('_open');
    document.documentElement.classList.add('_no-scroll');
    document.body.classList.add('_no-scroll');
    // fill fields from current state if we have it
    const o = state.items.find(x=>String(x.id)===String(id));
    form.id.value = id;
    if (o){
      form.title.value = o.title || '';
      form.price.value = o.price ?? '';
      form.left_qty.value = o.left_qty ?? '';
      form.description.value = o.description || '';
      form.expires_at.value = toLocal(o.expires_at);
      if (form.best_before) form.best_before.value = toLocal(o.best_before);
    }
    initCalendars();
    // close handlers
    modal.addEventListener('click', function h(ev){
      if (ev.target.closest('[data-close]') || ev.target===modal){ closeEdit(); modal.removeEventListener('click', h); }
    });
  }

  function closeEdit(){
    const modal = document.getElementById('offerEditModal');
    if (!modal) return;
    modal.classList.remove('_open');
    document.documentElement.classList.remove('_no-scroll');
    document.body.classList.remove('_no-scroll');
  }

  function toLocal(ts){
    if (!ts) return '';
    const d = new Date(ts);
    const p = n=> String(n).padStart(2,'0');
    return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }
  function toISO(s){
    if (!s) return null;
    // supports "YYYY-MM-DD HH:mm" or datetime-local "YYYY-MM-DDTHH:mm"
    const t = s.replace('T',' ');
    const m = t.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
    if(!m) return null;
    const d = new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:00`);
    return d.toISOString();
    }

  function initCalendars(){
    if (window.flatpickr){
      const opts = { enableTime:true, time_24hr:true, dateFormat:'Y-m-d H:i' , locale: (window.ru||undefined)};
      const best = document.getElementById('editBest'); if (best) flatpickr(best, opts);
      const exp = document.getElementById('editExpires'); if (exp) flatpickr(exp, opts);
    }
  }

  function onSubmit(e){
    if (e.target && e.target.id==='offerEditForm'){
      e.preventDefault();
      saveEdit(e.target);
    }
  }

  async function saveEdit(form){
    const id = form.id.value;
    const rid = getRID();
    const payload = {
      title: form.title.value.trim(),
      description: form.description.value.trim(),
      price: Number(form.price.value),
      left_qty: Number(form.left_qty.value),
    };
    const expiresIso = toISO(form.expires_at.value);
    if (expiresIso) payload.expires_at = expiresIso;
    const bestIso = form.best_before ? toISO(form.best_before.value) : null;
    if (bestIso) payload.best_before = bestIso;

    const urlVariants = [];
    if (rid){ urlVariants.push(`${EP.item(id)}?restaurant_id=${encodeURIComponent(rid)}`);
             urlVariants.push(`${EP.item(id)}/?restaurant_id=${encodeURIComponent(rid)}`); }
    urlVariants.push(EP.item(id));

    // PATCH then PUT fallback
    const methods = ['PATCH','PUT'];
    let ok = false, lastErr=null, respData=null;
    for (const m of methods){
      for (const u of urlVariants){
        try{
          const res = await fetch(u,{method:m, headers:{'Content-Type':'application/json',...auth()}, body: JSON.stringify(payload)});
          if (res.ok){ ok=true; try{ respData=await res.json(); }catch{}; break; }
          lastErr = await res.text();
        }catch(err){ lastErr = String(err); }
      }
      if (ok) break;
    }
    if (!ok){ console.error('save failed', lastErr); toast('Не удалось сохранить: Not Found'); return; }

    // merge local
    const i = state.items.findIndex(x=>String(x.id)===String(id));
    if (i>-1){
      state.items[i] = {...state.items[i], ...payload, ...(respData||{})};
    }
    render();
    closeEdit();
    toast('Изменения сохранены');
  }

  function askDelete(id){
    if (!confirm('Удалить оффер?')) return;
    doDelete(id);
  }
  async function doDelete(id){
    const rid = getRID();
    const urlVariants = [];
    if (rid){ urlVariants.push(`${EP.item(id)}?restaurant_id=${encodeURIComponent(rid)}`);
             urlVariants.push(`${EP.item(id)}/?restaurant_id=${encodeURIComponent(rid)}`); }
    urlVariants.push(EP.item(id));
    let success = false, code=0;
    for (const u of urlVariants){
      try{
        const res = await fetch(u, {method:'DELETE', headers:{...auth()}});
        code = res.status;
        if (res.ok || res.status===404){ success=true; break; }
      }catch(e){}
    }
    if (success){
      state.items = state.items.filter(x=>String(x.id)!==String(id));
      // also remove from DOM immediately
      const host = document.querySelector(`[data-id="${CSS.escape(String(id))}"]`);
      if (host) host.remove();
      toast(code===404 ? 'Оффер уже удалён' : 'Оффер удалён');
    }else{
      toast('Не удалось удалить');
    }
  }

  async function toggleActive(id, btn){
    const item = state.items.find(x=>String(x.id)===String(id));
    const next = item && item.is_active===false ? true : false;
    const rid = getRID();
    const url = rid ? `${EP.item(id)}?restaurant_id=${encodeURIComponent(rid)}` : EP.item(id);
    btn && (btn.disabled=true);
    try{
      const res = await fetch(url, {method:'PATCH', headers:{'Content-Type':'application/json', ...auth()}, body: JSON.stringify({is_active: next})});
      if (!res.ok) throw 0;
      if (item) item.is_active = next;
      toast(next?'Показан':'Скрыт');
    }catch(e){
      toast('Не удалось изменить статус');
    }finally{
      btn && (btn.disabled=false);
    }
  }

  function toast(msg){
    const n = document.createElement('div');
    n.textContent = msg;
    n.style.cssText = 'position:fixed;right:16px;bottom:16px;background:#0b0f14;color:#fff;padding:10px 14px;border-radius:10px;z-index:99999';
    document.body.appendChild(n); setTimeout(()=>n.remove(),2200);
  }

  // apply CSS for modal centering (scoped)
  (function ensureCSS(){
    const id='modal_center_fix_css';
    if (document.getElementById(id)) return;
    const link = document.createElement('link');
    link.id = id; link.rel='stylesheet'; link.href='./css/modal_center_fix.css';
    document.head.appendChild(link);
  })();

  // initial load
  loadOffers();
  // refresh silently
  setInterval(()=>{ if(!state.loading){ loadOffers(); } }, 60000);
})();
