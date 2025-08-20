
(() => {
  // ===== Helpers =====
  const $ = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
  const API = ((window.__FOODY__ && window.__FOODY__.FOODY_API) || window.foodyApi || 'https://foodyback-production.up.railway.app').replace(/\/+$/,'');

  // toast
  function toast(msg){
    let box = $('#toast');
    if(!box){ box = document.createElement('div'); box.id='toast'; document.body.appendChild(box); }
    const el = document.createElement('div'); el.className='toast'; el.textContent = msg;
    box.appendChild(el); setTimeout(()=> el.remove(), 3200);
  }

  // fetch JSON with small helper
  async function getJSON(path){
    const res = await fetch(API + path, { headers: { 'Accept': 'application/json' } });
    if(!res.ok){
      let msg = res.status + ' ' + res.statusText;
      try { const j = await res.json(); if (j && (j.detail||j.message)) msg = j.detail||j.message; } catch(_){}
      throw new Error(msg);
    }
    try { return await res.json(); } catch(_) { return []; }
  }

  // ===== State =====
  const state = {
    offers: [],
    current: null, // current offer object
  };

  // ===== Rendering =====
  function money(n){ const v = Number(n||0); return isFinite(v) ? Math.round(v) + ' ₽' : '—'; }
  function discount(old, price){
    const o = Number(old||0), p = Number(price||0);
    if(!(o>0 && p>0) || p>=o) return 0;
    return Math.round((1 - p/o) * 100);
  }
  function short(text, n=120){
    const s = String(text||'').replace(/\s+/g,' ').trim();
    if (!s) return '';
    return s.length > n ? s.slice(0, n-1).trim() + '…' : s;
  }
  function fmtDate(iso){
    if(!iso) return '—';
    try { return new Date(iso).toLocaleString('ru-RU', { dateStyle:'short', timeStyle:'short' }); }
    catch(_){ return '—'; }
  }

  function renderGrid(list){
    const grid = $('#grid'); const skeleton = $('#gridSkeleton');
    if (skeleton) skeleton.classList.add('hidden');
    if (!grid) return;

    if (!Array.isArray(list) || list.length === 0){
      grid.innerHTML = '<div class="card">Ничего не найдено. Попробуйте поменять фильтры.</div>';
      return;
    }

    const cards = list.map(o => {
      const id = o.id ?? o.offer_id ?? o._id ?? '';
      const img = o.image_url || o.photo_url || '';
      const title = o.title || o.name || 'Без названия';
      const price = (o.price_cents!=null ? o.price_cents/100 : (o.price ?? 0));
      const old = (o.original_price_cents!=null ? o.original_price_cents/100 : (o.original_price ?? 0));
      const disc = discount(old, price);
      const qtyLeft = (o.qty_left ?? o.qty ?? o.quantity ?? o.qty_total ?? '');
      const exp = fmtDate(o.expires_at || o.expires || o.until);
      const desc = short(o.description || o.desc || '');
      return `
        <div class="card item" data-offer-id="${id}" role="button" tabindex="0" aria-label="Открыть ${title}">
          <div class="grid two">
            <div class="full" style="display:flex; gap:12px; align-items:center;">
              <div style="width:82px; height:82px; border-radius:12px; overflow:hidden; background:#10161d; border:1px solid var(--border); flex:0 0 82px;">
                ${img ? `<img src="${img}" alt="" style="width:100%;height:100%;object-fit:cover;display:block;">` : ''}
              </div>
              <div style="flex:1; min-width:0">
                <div class="card-title" style="margin:0 0 6px 0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${title}</div>
                <div class="muted small desc" style="display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;">${desc||'Без описания'}</div>
              </div>
            </div>
            <div style="display:flex; gap:10px; align-items:center;">
              <div class="price" style="font-weight:800">${money(price)}</div>
              ${old ? `<div class="old muted" style="text-decoration:line-through">${money(old)}</div>` : ''}
              ${disc ? `<div class="badge">-${disc}%</div>` : ''}
            </div>
            <div class="muted small" style="text-align:right;">Остаток: ${qtyLeft||'—'} · До: ${exp}</div>
          </div>
        </div>
      `;
    }).join('');
    grid.innerHTML = cards;
  }

  // ===== Sheet (details) =====
  function openSheet(offer){
    if (!offer) return;
    state.current = offer;
    const sheet = $('#sheet'); if (!sheet) return;
    sheet.dataset.offerId = offer.id ?? offer.offer_id ?? '';
    $('#sTitle').textContent = offer.title || offer.name || '—';
    $('#sImg').src = offer.image_url || offer.photo_url || '';
    const price = (offer.price_cents!=null ? offer.price_cents/100 : (offer.price ?? 0));
    const old = (offer.original_price_cents!=null ? offer.original_price_cents/100 : (offer.original_price ?? 0));
    $('#sPrice').textContent = money(price);
    $('#sOld').textContent = old ? money(old) : '—';
    $('#sQty').textContent = 'Остаток: ' + (offer.qty_left ?? offer.qty ?? offer.quantity ?? offer.qty_total ?? '—');
    $('#sExp').textContent = 'Действует до: ' + fmtDate(offer.expires_at || offer.expires || offer.until);
    $('#sLeft').textContent = '';
    $('#sDesc').textContent = offer.description || offer.desc || '—';
    const btn = $('#reserveBtn');
    if (btn){
      btn.dataset.offerId = String(sheet.dataset.offerId || '');
      btn.disabled = false;
      btn.textContent = 'Забронировать';
    }
    sheet.classList.remove('hidden'); sheet.setAttribute('aria-hidden','false');
  }
  function closeSheet(){
    const sheet = $('#sheet'); if (!sheet) return;
    sheet.classList.add('hidden'); sheet.setAttribute('aria-hidden','true');
  }

  // click handlers for grid -> open sheet
  function bindGridClicks(){
    $('#grid')?.addEventListener('click', (e)=>{
      const card = e.target.closest('.item[data-offer-id]');
      if (!card) return;
      const id = card.getAttribute('data-offer-id');
      const offer = state.offers.find(o => String(o.id ?? o.offer_id ?? '') === String(id));
      if (offer) openSheet(offer);
    });
    $('#grid')?.addEventListener('keydown', (e)=>{
      if (e.key === 'Enter' || e.key === ' '){
        const card = e.target.closest('.item[data-offer-id]');
        if (!card) return;
        e.preventDefault();
        const id = card.getAttribute('data-offer-id');
        const offer = state.offers.find(o => String(o.id ?? o.offer_id ?? '') === String(id));
        if (offer) openSheet(offer);
      }
    });
    $('#sheetClose')?.addEventListener('click', closeSheet);
  }

  // ===== Booking & QR =====
  async function post(url, body){
    const res = await fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body||{}) });
    const ct = res.headers.get('content-type')||'';
    const data = ct.includes('application/json') ? await res.json().catch(()=> ({})) : {};
    if (!res.ok) {
      const msg = data?.detail || data?.message || (res.status + ' ' + res.statusText);
      throw new Error(msg);
    }
    return data;
  }
  async function createReservation(offerId){
    const body = { offer_id: offerId };
    const tries = [
      API + '/api/v1/public/reservations',
      API + '/api/v1/reservations',
      API + '/api/v1/public/reserve',
      API + '/api/v1/reserve'
    ];
    let lastErr = null;
    for (const u of tries){
      try { return await post(u, body); } catch(e){ lastErr = e; }
    }
    throw lastErr || new Error('Не удалось создать бронь');
  }
  function extractCode(resp){
    if (!resp) return '';
    if (typeof resp === 'string') return resp;
    return resp.code || resp.reservation_code || resp.token || resp.id || resp.reservation_id || '';
  }
  async function drawQr(code){
    const canvas = $('#qrCanvas');
    if (!canvas || !window.QRCode) return;
    const ctx = canvas.getContext('2d'); ctx.clearRect(0,0,canvas.width,canvas.height);
    await new Promise(res => QRCode.toCanvas(canvas, String(code), { width: canvas.width }, res));
  }
  async function onReserve(){
    const btn = $('#reserveBtn');
    const sheet = $('#sheet');
    const offerId = btn?.dataset?.offerId || sheet?.dataset?.offerId || (state.current && (state.current.id ?? state.current.offer_id));
    if (!offerId){
      toast('Не удаётся определить оффер для брони');
      return;
    }
    if (btn.disabled) return;
    const old = btn.textContent;
    btn.disabled = true; btn.textContent = 'Оформляем…';
    try {
      const resp = await createReservation(offerId);
      const code = extractCode(resp);
      if (!code) throw new Error('Сервер не вернул код брони');
      $('#qrCodeText').textContent = String(code);
      await drawQr(code);
      $('#qrModal').classList.remove('hidden');
      $('#qrModal').setAttribute('aria-hidden','false');
      toast('Бронь оформлена ✓');
    } catch (e){
      toast(e.message || 'Ошибка бронирования');
    } finally {
      btn.disabled = false; btn.textContent = old;
    }
  }
  function closeQr(){
    $('#qrModal')?.classList.add('hidden');
    $('#qrModal')?.setAttribute('aria-hidden','true');
  }

  // ===== Load & filters (minimal) =====
  async function load(){
    const skeleton = $('#gridSkeleton'); if (skeleton) skeleton.classList.remove('hidden');
    try {
      const data = await getJSON('/api/v1/public/offers');
      const list = (data && (data.items || data.results)) ? (data.items || data.results) : (Array.isArray(data) ? data : []);
      state.offers = list;
      renderGrid(list);
    } catch(e){
      toast('Не удалось загрузить офферы: ' + (e.message||e));
      const grid = $('#grid'); if (grid) grid.innerHTML = '<div class="card">Ошибка загрузки</div>';
    } finally {
      if (skeleton) skeleton.classList.add('hidden');
    }
  }

  function bindToolbar(){
    $('#refresh')?.addEventListener('click', load);
  }

  // ===== Init =====
  function init(){
    bindToolbar();
    bindGridClicks();
    $('#reserveBtn')?.addEventListener('click', onReserve);
    $('#qrOk')?.addEventListener('click', closeQr);
    $('#qrClose')?.addEventListener('click', closeQr);
    load();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
