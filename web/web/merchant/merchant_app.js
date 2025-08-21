
(() => {
  const $ = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
  const on = (sel, evt, fn) => { const el = $(sel); if (el) el.addEventListener(evt, fn, { passive: false }); };

  const state = {
    api: (window.__FOODY__ && window.__FOODY__.FOODY_API) || window.foodyApi || 'https://foodyback-production.up.railway.app',
    rid: localStorage.getItem('foody_restaurant_id') || '',
    key: localStorage.getItem('foody_key') || '',
  };

  // ---- Toast helper
  const toastBox = $('#toast');
  const showToast = (msg) => {
    if (!toastBox) return alert(msg);
    const el = document.createElement('div'); el.className = 'toast'; el.textContent = msg;
    toastBox.appendChild(el); setTimeout(() => el.remove(), 3500);
  };

  // ------------- API wrapper -------------
  async function api(path, { method='GET', headers={}, body=null, raw=false } = {}) {
    const url = `${state.api}${path}`;
    const h = { 'Content-Type': 'application/json', ...headers };
    if (state.key) h['X-Foody-Key'] = state.key;
    const res = await fetch(url, { method, headers: h, body });
    if (res.status === 204) return raw ? res : null;
    if (!res.ok) {
      const ct = res.headers.get('content-type') || '';
      let msg = `${res.status} ${res.statusText}`;
      if (ct.includes('application/json')) {
        try { const j = await res.json(); msg = j.detail || j.message || msg; } catch(_){}
      } else {
        try { const t = await res.text(); if (t) msg += ` — ${t.slice(0,180)}`; } catch(_){}
      }
      throw new Error(msg);
    }
    return raw ? res : (await res.json().catch(()=>null));
  }

  // ------------------- Tabs / Gate -------------------
  function activateTab(tab) {
    try {
      // toggle UI
      $$('.seg-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
      $$('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
      const panes = $$('.pane');
      if (panes.length) panes.forEach(p => p.classList.toggle('active', p.id === tab));
      else { const t = document.getElementById(tab); if (t) t.classList.add('active'); }

      // ---- ensure tab-specific inits always run (FIX)
      if (tab === 'qr') { 
        try { initQrTab(); } catch(_) {}
        try { bindReservationsUI(); } catch(_) {}
        try { loadReservations(true); } catch(_) {}
      }
      if (tab === 'offers') loadOffers();
      if (tab === 'profile') loadProfile();
      if (tab === 'export') updateCreds && updateCreds();
      if (tab === 'create') initCreateTab && initCreateTab();
    } catch (e) { console.warn('activateTab failed', e); }
  }

  function gate(){
    const authed = !!(state.rid && state.key);
    if (!authed) {
      activateTab('auth');
      const tabs = $('#tabs'); if (tabs) tabs.style.display = 'none';
      const bn = $('.bottom-nav'); if (bn) bn.style.display = 'none';
      return false;
    }
    const tabs = $('#tabs'); if (tabs) tabs.style.display = '';
    const bn = $('.bottom-nav'); if (bn) bn.style.display = '';
    activateTab('offers');
    return true;
  }

  // ----------------- QR / Reservations -----------------
  async function redeem(code){
    const msg = document.getElementById('qr_msg');
    if (!code) { if(msg){msg.textContent='Введите код'; msg.className='tag badge-warn';} return; }
    try {
      await api(`/api/v1/merchant/reservations/${encodeURIComponent(code)}/redeem`, { method:'POST' });
      if (msg){ msg.textContent = 'Погашено ✓'; msg.className='tag badge-ok'; }
      try { loadReservations(true); } catch(_){}
    } catch (e) {
      if (msg){ msg.textContent = 'Ошибка: ' + (e.message||e); msg.className='tag badge-warn'; }
    }
  }
  async function cancelRes(code){
    const msg = document.getElementById('qr_msg');
    if (!code) { if(msg){msg.textContent='Введите код'; msg.className='tag badge-warn';} return; }
    try {
      await api(`/api/v1/merchant/reservations/${encodeURIComponent(code)}/cancel`, { method:'POST' });
      if (msg){ msg.textContent = 'Отменено'; msg.className='tag'; }
      try { loadReservations(true); } catch(_){}
    } catch (e) {
      if (msg){ msg.textContent = 'Ошибка: ' + (e.message||e); msg.className='tag badge-warn'; }
    }
  }
  async function startScan(){
    const msg = document.getElementById('qr_msg');
    const video = document.getElementById('qr_video');
    if (!('BarcodeDetector' in window)) {
      if (msg){ msg.textContent='Сканер не поддерживается: введите код вручную'; msg.className='tag badge-warn'; }
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video:{ facingMode:'environment' } });
      video.srcObject = stream; await video.play();
      const det = new BarcodeDetector({ formats:['qr_code'] });
      const timer = setInterval(async () => {
        try {
          const codes = await det.detect(video);
          if (codes && codes[0]){
            clearInterval(timer);
            stream.getTracks().forEach(t=>t.stop());
            const val = codes[0].rawValue || '';
            const input = document.getElementById('qr_code'); if (input) input.value = val;
            redeem(val);
          }
        } catch(_) {}
      }, 350);
    } catch (e) {
      if (msg){ msg.textContent='Не удалось открыть камеру'; msg.className='tag badge-warn'; }
    }
  }
  function initQrTab(){
    const r = document.getElementById('qr_redeem_btn');
    const s = document.getElementById('qr_scan_btn');
    if (r && !r.dataset.bound){ r.dataset.bound='1'; r.addEventListener('click', ()=> redeem((document.getElementById('qr_code')||{}).value||'')); }
    if (s && !s.dataset.bound){ s.dataset.bound='1'; s.addEventListener('click', startScan); }
  }

  // ---- Reservations list
  function uniqBy(arr, keyFn){
    const seen = new Set(); const out = [];
    for (const x of arr||[]){ const k = keyFn(x); if (k==null || seen.has(k)) continue; seen.add(k); out.push(x); }
    return out;
  }
  function renderReservationsList(items){
    const wrap = document.getElementById('res_rows');
    if (!wrap) return;
    wrap.innerHTML = '';
    (items||[]).forEach((r)=>{
      const tr = document.createElement('div');
      tr.className = 'row';
      const st = (r.status||'').toLowerCase();
      const ru = st==='active'?'Активна': st.includes('redeem')?'Погашена': st==='expired'?'Истекла': st.includes('cancel')?'Отменена': (r.status||'—');
      const code = r.code || r.id || '';
      const created = (r.created_at? new Date(r.created_at).toLocaleString('ru-RU') : '');
      const until = (r.expires_at? new Date(r.expires_at).toLocaleString('ru-RU') : '');
      tr.innerHTML = `<div>${created}</div><div>${code}</div><div>${r.offer_title||r.offer_id||''}</div><div>${ru}</div><div>${until}</div><div style="display:flex;gap:6px;justify-content:flex-end;"><button class="btn btn-ghost btn-small" data-action="redeem" data-code="${code}">Погасить</button><button class="btn btn-ghost btn-small" data-action="cancel" data-code="${code}">Отменить</button></div>`;
      wrap.appendChild(tr);
    });
  }

  function bindReservationsUI(){
    if (bindReservationsUI._bound) return;
    bindReservationsUI._bound = true;
    const reload = () => loadReservations(true);
    const debounce = (fn, t=350)=>{ let id; return (...a)=>{ clearTimeout(id); id=setTimeout(()=>fn(...a), t); }; };
    on('#resvRefresh','click', reload);
    on('#resvStatus','change', reload);
    const search = $('#resvSearch');
    if (search && !search._bound){ search._bound = true; search.addEventListener('input', debounce(reload, 350)); }
    // delegated buttons in rows
    const list = $('#reservationsList') || document;
    list.addEventListener('click', (e)=>{
      const btnR = e.target.closest('[data-action="redeem"]');
      const btnC = e.target.closest('[data-action="cancel"]');
      if (btnR) redeem(btnR.getAttribute('data-code'));
      if (btnC) cancelRes(btnC.getAttribute('data-code'));
    });
  }

  function loadReservations(reset=false){
    try{
      const rid = Number(localStorage.getItem('foody_restaurant_id') || localStorage.getItem('restaurant_id') || 0);
      const key = localStorage.getItem('foody_key') || localStorage.getItem('api_key') || '';
      const empty = document.getElementById('reservationsEmpty');
      if (!rid || !key){
        renderReservationsList([]);
        if (empty){ empty.textContent='Войдите, чтобы просматривать брони'; empty.style.display=''; }
        return;
      }
      if (!window.__resvState || reset){ window.__resvState = { items:[], offset:0, limit:50, total:null }; }
      const st = window.__resvState;
      const params = new URLSearchParams();
      params.set('restaurant_id', String(rid));
      const sel = (id) => (document.getElementById(id)||{});
      params.set('status', sel('resvStatus').value||'');
      params.set('q', sel('resvSearch').value||'');
      params.set('limit', String(st.limit));
      params.set('offset', String(st.offset));
      fetch((state.api) + '/api/v1/merchant/reservations?' + params.toString(), {
        headers:{ 'X-Foody-Key': key }
      })
        .then(r => r.json().then(d => [r.status, d]))
        .then(([code, data]) => {
          if (code>=200 && code<300){
            const list = Array.isArray(data.items)? data.items : (Array.isArray(data)? data : []);
            st.total = data.total ?? st.total;
            st.offset += list.length;
            const merged = st.items.concat(list);
            st.items = uniqBy(merged, x => x.id ?? x.code ?? x._id ?? `${x.offer_id||''}:${x.created_at||''}`);
            renderReservationsList(st.items);   // <-- FIX: correct renderer
            if (empty){ empty.textContent = st.items.length ? '' : 'Пока нет броней'; }
          } else {
            if (empty){ empty.textContent = 'Не удалось загрузить список'; }
          }
        })
        .catch(()=>{ if (empty){ empty.textContent = 'Ошибка сети'; } });
    }catch(e){ console.error(e); }
  }

  // ---------------- Boot ----------------
  document.addEventListener('DOMContentLoaded', () => {
    // make any element with [data-tab] route tabs
    document.addEventListener('click', (ev) => {
      const el = ev.target.closest('[data-tab]');
      if (el) { ev.preventDefault(); const t = el.getAttribute('data-tab') || el.dataset.tab; if (t) activateTab(t); }
    }, true);
    const ok = gate();
    try { if (ok) { /* keep offers as initial tab; QR fixes when switching */ } } catch(_) {}
  });
})();
