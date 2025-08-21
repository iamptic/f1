
/*! Foody Merchant · QR & Reservations (drop‑in) — v1
   - Builds QR/Брони pane UI if missing
   - Scans QR (BarcodeDetector -> jsQR fallback)
   - Lists reservations with filters & search
   - Redeems by code via API
*/
(function(){
  const API = ((window.__FOODY__ && window.__FOODY__.FOODY_API) || window.foodyApi || 'https://foodyback-production.up.railway.app').replace(/\/+$/,'');
  const $ = (s,r=document)=>r.querySelector(s);
  const $$ = (s,r=document)=>Array.from(r.querySelectorAll(s));

  // ---- Auth ----
  function authKey(){ try{ return localStorage.getItem('foody_key') || (JSON.parse(localStorage.getItem('foody_auth')||'null')||{}).api_key || ''; }catch(_){ return ''; } }
  function restaurantId(){ try{ return localStorage.getItem('foody_restaurant_id') || (JSON.parse(localStorage.getItem('foody_auth')||'null')||{}).restaurant_id || ''; }catch(_){ return ''; } }
  function authed(){ return !!authKey(); }

  // ---- Toast ----
  function toast(msg, ms=2600){
    let box = $('#toast'); if(!box){ box = document.createElement('div'); box.id='toast'; document.body.appendChild(box); }
    const el = document.createElement('div'); el.className='toast'; el.textContent = msg;
    box.appendChild(el); setTimeout(()=> el.remove(), ms);
  }

  // ---- API ----
  async function api(path, { method='GET', body=null, headers={}, raw=false }={}){
    const h = { 'Accept':'application/json', ...headers };
    if (!(body instanceof FormData)) h['Content-Type'] = h['Content-Type'] || 'application/json';
    const key = authKey(); if (key) h['X-Foody-Key'] = key;
    const url = API + path;
    const res = await fetch(url, { method, headers:h, body });
    if (raw) return res;
    if (!res.ok){
      let msg = res.status + ' ' + res.statusText;
      try{ const j = await res.json(); if (j?.detail || j?.message) msg = j.detail || j.message; }catch(_){}
      throw new Error(msg);
    }
    const ct = res.headers.get('content-type')||'';
    if (ct.includes('application/json')) { try{ return await res.json(); }catch(_){ return null; } }
    return await res.text();
  }

  // ---- Build UI if missing ----
  function ensurePane(){
    let pane = $('#qr'); // prefer #qr
    if (!pane){
      // maybe id="qr" is not present — create pane and a tab button if possible
      const content = $('.content') || document.body;
      pane = document.createElement('section');
      pane.className='pane'; pane.id='qr';
      content.appendChild(pane);
      // Try add a tab button
      const tabs = $('#tabs') || $('.segmented');
      if (tabs){
        const b = document.createElement('button'); b.className='seg-btn'; b.dataset.tab='qr'; b.textContent='QR / Брони';
        tabs.appendChild(b);
        b.addEventListener('click', () => activateTab());
      }
    }
    if (!pane.querySelector('.qr-wrap')){
      pane.innerHTML = `
        <div class="card">
          <div class="card-title">QR / Брони</div>
          <div class="grid" style="gap:12px">
            <div class="qr-wrap" style="display:grid; gap:10px">
              <div class="scan-video" style="position:relative; border:1px solid var(--border); border-radius:16px; overflow:hidden; background:#0f141c">
                <video id="qrVideo" autoplay playsinline style="width:100%; max-height:56vh; display:block;"></video>
                <canvas id="qrCanvas" width="640" height="480" class="hidden" style="display:none"></canvas>
                <div id="scanHint" class="muted" style="position:absolute; left:10px; bottom:10px;">Наведите камеру на QR‑код</div>
              </div>
              <div class="row" style="display:flex; gap:8px; flex-wrap:wrap; align-items:center">
                <input id="manualCode" class="w-full" placeholder="Ввести код вручную…" style="flex:1; min-width:200px" />
                <button id="redeemManualBtn" class="btn btn-primary" type="button">Погасить</button>
                <button id="startScanBtn" class="btn" type="button">Запустить сканер</button>
                <button id="stopScanBtn" class="btn" type="button">Остановить</button>
              </div>
              <div id="scanStatus" class="muted small"></div>
            </div>

            <div class="card-subtitle">Список броней</div>
            <div class="toolbar" style="display:flex; gap:8px; flex-wrap:wrap; align-items:center">
              <input id="resvSearch" placeholder="Поиск по коду/имени/офферу…" style="flex:1; min-width:220px" />
              <div class="chips" id="resvFilters" style="display:flex; gap:8px; flex-wrap:wrap">
                <button class="chip active" data-filter="active">Активные</button>
                <button class="chip" data-filter="redeemed">Погашенные</button>
                <button class="chip" data-filter="all">Все</button>
              </div>
            </div>
            <div id="resvList" class="list"></div>
            <div id="resvSkeleton" class="list hidden"></div>
            <div class="actions" style="display:flex; justify-content:center">
              <button id="loadMoreBtn" class="btn" type="button">Загрузить ещё</button>
            </div>
          </div>
        </div>
      `;
    }
  }

  // ---- Reservations state ----
  let resv = [], resvTotal = null, resvOffset = 0, RESV_LIMIT = 20, resvLoading=false;
  let resvFilter='active', resvTerm='';

  function showResvSkeleton(n=6){
    const box = $('#resvSkeleton'); if (!box) return;
    box.innerHTML='';
    for(let i=0;i<n;i++){ const s=document.createElement('div'); s.className='skeleton'; s.style.height='52px'; s.style.borderRadius='12px'; box.appendChild(s); }
    box.classList.remove('hidden');
  }
  function hideResvSkeleton(){ const box=$('#resvSkeleton'); if(box) box.classList.add('hidden'); }

  function statusBadge(st){
    st = String(st||'').toLowerCase();
    if (st==='redeemed') return '<span class="badge">Погашена</span>';
    if (st==='expired') return '<span class="badge">Истекла</span>';
    return '<span class="badge">Активна</span>';
  }
  function rowHTML(o){
    const code = o.code || o.qr_code || o.reservation_code || o.id || '—';
    const title = o.offer_title || o.title || '—';
    const name = o.customer_name || o.name || '—';
    const phone = o.customer_phone || o.phone || '';
    const created = o.created_at ? new Date(o.created_at).toLocaleString('ru-RU') : '—';
    const expires = o.expires_at ? new Date(o.expires_at).toLocaleString('ru-RU') : '—';
    const st = (o.status || (o.redeemed ? 'redeemed' : 'active')).toLowerCase();
    const canRedeem = (st==='active');
    return `
      <div class="list item" data-code="${code}" style="display:grid; grid-template-columns: 1fr auto; gap:10px; align-items:center; background:#12171e; border:1px solid var(--border); border-radius:12px; padding:10px;">
        <div>
          <div style="display:flex; align-items:center; gap:8px">
            <div class="code" style="font-family:ui-monospace; font-weight:800">#${code}</div>
            ${statusBadge(st)}
          </div>
          <div class="muted small">${title}</div>
          <div class="muted small">${name}${phone?` · ${phone}`:''}</div>
          <div class="muted small">Создана: ${created} · Истекает: ${expires}</div>
        </div>
        <div style="display:flex; gap:8px">
          <button class="btn ${canRedeem?'btn-primary':''}" data-action="redeem" ${canRedeem?'':'disabled'}>Погасить</button>
        </div>
      </div>`;
  }

  function renderReservations(){
    const box = $('#resvList'); if (!box) return;
    const list = resv.filter(o => {
      const st = (o.status || (o.redeemed ? 'redeemed' : 'active')).toLowerCase();
      if (resvFilter==='active' && st!=='active') return false;
      if (resvFilter==='redeemed' && st!=='redeemed') return false;
      if (resvTerm){
        const s = JSON.stringify(o).toLowerCase();
        if (!s.includes(resvTerm)) return false;
      }
      return true;
    });
    box.innerHTML = list.length ? list.map(rowHTML).join('') : `<div class="muted">Нет данных</div>`;
    $$('#resvList [data-action="redeem"]').forEach(b => {
      b.addEventListener('click', () => {
        const host = b.closest('[data-code]'); const code = host?.dataset.code || '';
        if (code) redeemCode(code);
      });
    });
    const more = $('#loadMoreBtn'); if (more) more.style.display = (resvTotal!==null && resvOffset>=resvTotal) ? 'none' : '';
  }

  async function loadReservationsBatch(){
    if(resvLoading) return;
    if(resvTotal!==null && resvOffset>=resvTotal) return;
    resvLoading = true; showResvSkeleton();
    try{
      const rid = restaurantId();
      const qs = new URLSearchParams(); qs.set('limit', 20); qs.set('offset', resvOffset);
      if (rid) qs.set('restaurant_id', rid);
      // Prefer merchant endpoint
      let data = await api(`/api/v1/merchant/reservations?` + qs.toString());
      if (!data || (!Array.isArray(data) && !Array.isArray(data.items))){
        // Fallbacks
        try{ data = await api('/api/v1/reservations?' + qs.toString()); }catch(_){}
      }
      const items = Array.isArray(data) ? data : (data?.items || []);
      resv = resv.concat(items);
      resvOffset += items.length;
      resvTotal = typeof data?.total === 'number' ? data.total : resvTotal;
      renderReservations();
    }catch(e){ console.error(e); toast('Не удалось загрузить брони: ' + e.message); }
    finally{ hideResvSkeleton(); resvLoading=false; }
  }

  function ensureReservationsLoaded(){
    if (resv.length===0){ resv=[]; resvOffset=0; resvTotal=null; loadReservationsBatch(); }
    else renderReservations();
  }

  // ---- Redeem ----
  async function redeemCode(code){
    if (!code) return toast('Нет кода');
    try{
      const payload = JSON.stringify({ code: String(code).trim() });
      // primary
      let res = await api('/api/v1/merchant/reservations/redeem', { method:'POST', body: payload });
      // success: update local
      toast('Погашено ✅');
      // mark item
      const i = resv.findIndex(x =>
        (x.code===code) || (x.qr_code===code) || (x.reservation_code===code) || (String(x.id||'')===String(code))
      );
      if (i>=0){ resv[i].status='redeemed'; resv[i].redeemed=true; renderReservations(); }
    }catch(e1){
      // fallback endpoint
      try{
        const payload = JSON.stringify({ code: String(code).trim() });
        await api('/api/v1/merchant/redeem', { method:'POST', body: payload });
        toast('Погашено ✅');
        const i = resv.findIndex(x =>
          (x.code===code) || (x.qr_code===code) || (x.reservation_code===code) || (String(x.id||'')===String(code))
        );
        if (i>=0){ resv[i].status='redeemed'; resv[i].redeemed=true; renderReservations(); }
      }catch(e2){
        let msg = String(e2.message||e1.message||'Ошибка гашения');
        if (/already/i.test(msg)) msg = 'Уже погашена';
        if (/not\s*found/i.test(msg)) msg = 'Бронь не найдена';
        toast(msg);
      }
    }
  }

  // ---- Scanner ----
  let stream=null, raf=null, detector=null, usingDetector=false;
  const needJsQR = () => !('BarcodeDetector' in window);

  function stopScan(){
    if (raf) { cancelAnimationFrame(raf); raf=null; }
    const video = $('#qrVideo');
    if (video) video.pause();
    if (stream){ stream.getTracks().forEach(t=>t.stop()); stream=null; }
    const st = $('#scanStatus'); if (st) st.textContent = 'Сканер остановлен';
  }

  function tickDetector(){
    const video = $('#qrVideo');
    const loop = async () => {
      if(!video || video.readyState < 2){ raf = requestAnimationFrame(loop); return; }
      try{
        const codes = await detector.detect(video);
        if(codes && codes.length){
          const value = String(codes[0].rawValue||'').trim();
          if(value){ stopScan(); redeemCode(value); return; }
        }
      }catch(_){}
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
  }

  function tickCanvas(){
    const video = $('#qrVideo');
    const canvas = $('#qrCanvas'); const ctx = canvas.getContext('2d');
    const loop = () => {
      if(!video || video.readyState < 2){ raf = requestAnimationFrame(loop); return; }
      canvas.width = video.videoWidth; canvas.height = video.videoHeight;
      ctx.drawImage(video, 0,0, canvas.width, canvas.height);
      try{
        const img = ctx.getImageData(0,0, canvas.width, canvas.height);
        const code = window.jsQR && window.jsQR(img.data, img.width, img.height);
        const value = code?.data ? String(code.data).trim() : '';
        if (value){ stopScan(); redeemCode(value); return; }
      }catch(_){}
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
  }

  async function startScan(){
    try{
      const video = $('#qrVideo');
      const st = $('#scanStatus');
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      stream = s; video.srcObject = s; await video.play();
      if ('BarcodeDetector' in window){
        try{ detector = new window.BarcodeDetector({ formats:['qr_code'] }); usingDetector=true; }catch(_){ usingDetector=false; }
      } else {
        usingDetector=false;
      }
      st.textContent = 'Сканер запущен';
      if (usingDetector) tickDetector();
      else {
        // ensure jsQR loaded
        if (!window.jsQR){
          const scr = document.createElement('script');
          scr.src = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js';
          document.head.appendChild(scr);
          await new Promise(res => { scr.onload=res; scr.onerror=res; setTimeout(res, 1500); });
        }
        tickCanvas();
      }
    }catch(e){
      console.error(e);
      const st = $('#scanStatus'); if (st) st.textContent = 'Не удалось получить доступ к камере';
      toast('Доступ к камере не получен');
    }
  }

  // ---- Wire up controls ----
  function bindUI(){
    const pane = $('#qr'); if (!pane) return;
    const fbox = $('#resvFilters');
    if (fbox){
      fbox.addEventListener('click', (e)=>{
        const chip = e.target.closest('.chip'); if (!chip) return;
        $$('#resvFilters .chip').forEach(x=>x.classList.toggle('active', x===chip));
        resvFilter = chip.dataset.filter || 'active';
        renderReservations();
      });
    }
    const s = $('#resvSearch'); if (s) s.addEventListener('input', () => { resvTerm = (s.value||'').toLowerCase(); renderReservations(); });
    const more = $('#loadMoreBtn'); if (more) more.addEventListener('click', loadReservationsBatch);
    const manual = $('#redeemManualBtn'); const input = $('#manualCode');
    if (manual) manual.addEventListener('click', () => { const c=(input?.value||'').trim(); if(c) redeemCode(c); });
    const st = $('#startScanBtn'); const sp = $('#stopScanBtn');
    if (st) st.addEventListener('click', startScan);
    if (sp) sp.addEventListener('click', stopScan);
  }

  // ---- Tab activation hook ----
  function activateTab(){
    ensurePane();
    bindUI();
    if (!authed()){ toast('Войдите в аккаунт'); return; }
    ensureReservationsLoaded();
  }

  // Expose small API for host app.js to call when switching tabs
  window.FOODY = window.FOODY || {};
  window.FOODY.qrReservations = { activate: activateTab, refresh: () => { resv=[]; resvOffset=0; resvTotal=null; loadReservationsBatch(); } };

  // Auto-activate if pane is visible on load
  document.addEventListener('DOMContentLoaded', () => {
    ensurePane(); bindUI();
    // If #qr pane is initially active — load
    const pane = $('#qr'); if (pane && pane.classList.contains('active')) activateTab();
  });
})();
