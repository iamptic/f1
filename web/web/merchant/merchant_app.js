
/*! Foody Merchant — Dashboard & Offers as Cards (v17) */
(function(){
  const $ = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
  const API = ((window.__FOODY__ && window.__FOODY__.FOODY_API) || window.foodyApi || 'https://foodyback-production.up.railway.app').replace(/\/+$/,'');

  // ---- Toast ----
  function toast(msg, ms=2500){
    let box = $('#toast'); if(!box){ box = document.createElement('div'); box.id='toast'; document.body.appendChild(box); }
    const el = document.createElement('div'); el.className='toast'; el.textContent = msg;
    box.appendChild(el); setTimeout(()=> el.remove(), ms);
  }

  // ---- Helpers ----
  const money = v => (isFinite(+v) ? (Math.round(+v) + ' ₽') : '—');
  const pct = n => isFinite(+n) ? (Math.round(+n) + '%') : '—';
  function safeNum(x){ const n = Number(x||0); return isFinite(n) ? n : 0; }
  function discount(old, price){
    const o = safeNum(old), p = safeNum(price);
    if (!(o>0 && p>0) || p>=o) return 0;
    return Math.round((1 - p/o) * 100);
  }
  function fmtDT(x){
    if(!x) return '—';
    try { return new Date(x).toLocaleString('ru-RU', { dateStyle:'short', timeStyle:'short' }); }
    catch(_){ return '—'; }
  }
  function hoursLeft(dt){
    if(!dt) return Infinity;
    const t = new Date(dt).getTime() - Date.now();
    return t/36e5;
  }

  async function getJSON(url, opts={}){
    const res = await fetch(url, { credentials: 'include', headers: { 'Accept':'application/json' }, ...opts });
    if (!res.ok){
      let msg = res.status + ' ' + res.statusText;
      try { const j = await res.json(); if (j?.detail || j?.message) msg = j.detail || j.message; } catch(_){}
      throw new Error(msg);
    }
    try { return await res.json(); } catch(_){ return null; }
  }

  // ---- Data ----
  async function fetchOffers(){
    // Try several endpoints; normalize to array
    const tries = [
      API + '/api/v1/merchant/offers',
      API + '/api/v1/offers',
    ];
    let lastErr=null;
    for (const u of tries){
      try {
        const j = await getJSON(u);
        const list = (Array.isArray(j) ? j : (j?.items || j?.results || [])) || [];
        return list;
      } catch(e){ lastErr=e; }
    }
    throw lastErr || new Error('Не удалось загрузить офферы');
  }

  async function fetchReservationsToday(){
    const today = new Date(); const y=today.getFullYear(); const m=('0'+(today.getMonth()+1)).slice(-2); const d=('0'+today.getDate()).slice(-2);
    const date = `${y}-${m}-${d}`;
    const tries = [
      API + `/api/v1/merchant/reservations?date=${date}`,
      API + `/api/v1/reservations?date=${date}`,
      API + `/api/v1/merchant/reservations/today`,
    ];
    for (const u of tries){
      try {
        const j = await getJSON(u);
        const list = (Array.isArray(j) ? j : (j?.items || j?.results || [])) || [];
        return list;
      } catch(_){}
    }
    return []; // optional
  }

  // ---- Dashboard ----
  function renderDashboardStats(offers, reservations){
    const box = $('#dashStats'); if (!box) return;
    const active = offers.filter(o => (o.active ?? o.is_active ?? true));
    const soon = offers.filter(o => hoursLeft(o.expires_at || o.expires || o.until) <= 2);
    const qtyLeft = offers.reduce((s,o)=> s + safeNum(o.qty_left ?? o.quantity ?? o.qty ?? 0), 0);
    const revenue = offers.reduce((s,o)=> {
      const price = (o.price_cents!=null ? o.price_cents/100 : (o.price ?? 0));
      const left = safeNum(o.qty_left ?? o.quantity ?? o.qty ?? 0);
      return s + (price * left);
    }, 0);
    const redeemedToday = (reservations||[]).filter(r => {
      const st = (r.status||'').toLowerCase();
      return st.includes('redeem') || st.includes('погаш');
    }).length;

    box.innerHTML = `
      <div class="kpi">
        <div class="kpi-val">${active.length}</div>
        <div class="kpi-label">Активных офферов</div>
      </div>
      <div class="kpi">
        <div class="kpi-val">${qtyLeft}</div>
        <div class="kpi-label">Остаток порций</div>
      </div>
      <div class="kpi">
        <div class="kpi-val">${money(revenue)}</div>
        <div class="kpi-label">Потенциал выручки</div>
      </div>
      <div class="kpi">
        <div class="kpi-val">${soon.length}</div>
        <div class="kpi-label">Истекает ≤ 2 часа</div>
      </div>
      <div class="kpi">
        <div class="kpi-val">${redeemedToday}</div>
        <div class="kpi-label">Погашено сегодня</div>
      </div>
    `;
  }

  // ---- Offers as cards ----
  function cardHTML(o){
    const id = o.id ?? o.offer_id ?? '';
    const img = o.image_url || o.photo_url || '';
    const title = o.title || o.name || 'Без названия';
    const price = (o.price_cents!=null ? o.price_cents/100 : (o.price ?? 0));
    const original = (o.original_price_cents!=null ? o.original_price_cents/100 : (o.original_price ?? 0));
    const disc = discount(original, price);
    const qty = o.qty_left ?? o.quantity ?? o.qty ?? 0;
    const exp = fmtDT(o.expires_at || o.expires || o.until);
    const active = (o.active ?? o.is_active ?? true);
    const desc = (o.description || o.desc || '').trim();
    return `
      <div class="offer-card" data-id="${id}">
        <div class="offer-card__img">${img ? `<img src="${img}" alt="">` : `<div class="ph"></div>`}</div>
        <div class="offer-card__body">
          <div class="offer-card__title" title="${title}">${title}</div>
          ${desc ? `<div class="offer-card__desc">${desc}</div>` : ''}
          <div class="offer-card__meta">
            <div class="price">
              <span class="now">${money(price)}</span>
              ${original ? `<span class="old">${money(original)}</span>` : ''}
              ${disc ? `<span class="badge">-${disc}%</span>` : ''}
            </div>
            <div class="muted small">Остаток: ${qty} · До: ${exp}</div>
          </div>
          <div class="offer-card__actions">
            <button class="btn" data-act="edit" data-id="${id}">Редактировать</button>
            <button class="btn btn-danger" data-act="delete" data-id="${id}">Удалить</button>
            <label class="switch">
              <input type="checkbox" data-act="toggle" data-id="${id}" ${active ? 'checked':''}>
              <span>Активен</span>
            </label>
          </div>
        </div>
      </div>
    `;
  }

  async function renderOffers(offers){
    const host = $('#offerCards') || $('#offerList');
    if (!host) return;
    if (!offers?.length){
      host.innerHTML = `<div class="card">У вас пока нет офферов. Нажмите «Создать оффер».</div>`;
      return;
    }
    host.innerHTML = `<div class="offer-grid">` + offers.map(cardHTML).join('') + `</div>`;
  }

  // ---- Actions ----
  async function deleteById(id){
    const url = API + `/api/v1/merchant/offers/${id}`;
    const res = await fetch(url, { method:'DELETE', credentials:'include' });
    if (!(res.status===200 || res.status===204)) {
      let msg = res.status + ' ' + res.statusText;
      try { const t = await res.text(); if (t) msg = t; } catch(_){}
      throw new Error(msg);
    }
  }
  async function toggleActive(id, val){
    // Try PATCH or PUT
    const tries = [
      { m:'PATCH', body:{ active: !!val } },
      { m:'PUT', body:{ active: !!val } },
    ];
    let lastErr=null;
    for (const t of tries){
      try{
        const r = await fetch(API + `/api/v1/merchant/offers/${id}`, {
          method: t.m, credentials:'include',
          headers:{ 'Content-Type':'application/json' },
          body: JSON.stringify(t.body)
        });
        if (!r.ok) throw new Error((await r.text()) || (r.status+' '+r.statusText));
        return;
      } catch(e){ lastErr=e; }
    }
    throw lastErr || new Error('Не удалось изменить статус');
  }

  function bindActions(state){
    document.addEventListener('click', async (e)=>{
      const del = e.target.closest('button[data-act="delete"]');
      const edit = e.target.closest('button[data-act="edit"]');
      if (del){
        const id = del.dataset.id;
        if (!id) return;
        if (!confirm('Удалить оффер?')) return;
        try { await deleteById(id); toast('Оффер удалён'); await reload(state); }
        catch(err){ toast('Ошибка удаления: ' + (err.message||err)); }
      }
      if (edit){
        const id = edit.dataset.id;
        // Открытие вашей модалки редактирования, если есть:
        const btn = document.querySelector(`[data-edit="${id}"], [data-offer-edit="${id}"]`);
        if (btn) { btn.click(); return; }
        // Иначе — эмитим кастомное событие для вашего кода
        document.dispatchEvent(new CustomEvent('foody:edit-offer', { detail:{ id } }));
      }
    });
    document.addEventListener('change', async (e)=>{
      const tgl = e.target.closest('input[type="checkbox"][data-act="toggle"]');
      if (tgl){
        const id = tgl.dataset.id; const val = !!tgl.checked;
        try { await toggleActive(id, val); toast(val? 'Включен' : 'Выключен'); }
        catch(err){ toast('Ошибка статуса: ' + (err.message||err)); tgl.checked = !val; }
      }
    });
  }

  // ---- Reload ----
  async function reload(state){
    $('#offersSkeleton')?.classList.remove('hidden');
    try {
      const [offers, reservations] = await Promise.all([fetchOffers(), fetchReservationsToday()]);
      state.offers = offers;
      renderDashboardStats(offers, reservations);
      await renderOffers(offers);
    } catch(e){
      toast(e.message || 'Ошибка загрузки');
    } finally {
      $('#offersSkeleton')?.classList.add('hidden');
    }
  }

  // ---- INIT ----
  function init(){
    const s = { offers: [] };
    bindActions(s);
    reload(s);
    // manual refresh button optional
    const refresh = $('#offersRefresh'); if (refresh) refresh.addEventListener('click', ()=> reload(s));
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
