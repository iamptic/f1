/* Foody Merchant — QR/Reservations fixes */
(() => {
  const $ = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
  const state = {
    api: (window.__FOODY__ && window.__FOODY__.FOODY_API) || window.foodyApi || 'https://foodyback-production.up.railway.app',
    rid: localStorage.getItem('foody_restaurant_id') || '',
    key: localStorage.getItem('foody_key') || '',
  };

  async function api(path, { method='GET', headers={}, body=null } = {}){
    const url = `${state.api}${path}`;
    const h = { 'Content-Type': 'application/json', ...headers };
    if (state.key) h['X-Foody-Key'] = state.key;
    const res = await fetch(url, { method, headers: h, body });
    if (!res.ok){
      let msg = res.status + ' ' + res.statusText;
      try { const j = await res.json(); if (j?.detail) msg = j.detail; } catch(_){}
      throw new Error(msg);
    }
    try { return await res.json(); } catch(_){ return null; }
  }

  function toast(msg){
    let box = $('#toast'); if(!box){ box = document.createElement('div'); box.id = 'toast'; document.body.appendChild(box); }
    const el = document.createElement('div'); el.className='toast'; el.textContent=msg; box.appendChild(el); setTimeout(()=>el.remove(), 2600);
  }

  // === QR Redeem ===
  async function redeem(code){
    const msg = $('#qr_msg');
    if (!code){ if(msg){ msg.textContent='Введите код'; msg.className='tag badge-warn'; } return; }
    try {
      await api(`/api/v1/merchant/reservations/${encodeURIComponent(code)}/redeem`, { method:'POST' });
      if (msg){ msg.textContent='Погашено ✓'; msg.className='tag badge-ok'; }
      try { loadReservations(true); } catch(_){}
    } catch (e) {
      if (msg){ msg.textContent='Ошибка: '+(e.message||e); msg.className='tag badge-warn'; }
    }
  }
  async function startScan(){
    const msg = $('#qr_msg'); const video = $('#qr_video');
    if (!('BarcodeDetector' in window)){ if (msg){ msg.textContent='Сканер не поддерживается. Введите код вручную'; msg.className='tag badge-warn'; } return; }
    try{
      const stream = await navigator.mediaDevices.getUserMedia({ video:{ facingMode:'environment' } });
      video.srcObject = stream; await video.play();
      const det = new BarcodeDetector({ formats:['qr_code'] });
      const timer = setInterval(async () => {
        try{
          const codes = await det.detect(video);
          if (codes && codes[0]){
            clearInterval(timer); stream.getTracks().forEach(t=>t.stop());
            const val = codes[0].rawValue || '';
            const input = $('#qr_code'); if (input) input.value = val;
            redeem(val);
          }
        }catch(_){}
      }, 350);
    }catch(e){
      if (msg){ msg.textContent='Не удалось открыть камеру'; msg.className='tag badge-warn'; }
    }
  }
  function initQrTab(){
    const r = $('#qr_redeem_btn'); const s = $('#qr_scan_btn');
    if (r && !r.dataset.bound){ r.dataset.bound='1'; r.addEventListener('click', ()=> redeem(($('#qr_code')||{}).value||'')); }
    if (s && !s.dataset.bound){ s.dataset.bound='1'; s.addEventListener('click', startScan); }
  }

  // === Reservations List ===
  function uniqBy(arr, keyFn){
    const seen = new Set(); const out=[];
    for (const x of (arr||[])){ const k = keyFn(x); if (k==null || seen.has(k)) continue; seen.add(k); out.push(x); }
    return out;
  }
  function renderReservations(items){
    const wrap = $('#res_rows'); if (!wrap) return;
    wrap.innerHTML = '';
    (items||[]).forEach((r)=>{
      const st = (r.status||'').toLowerCase();
      const stRu = st==='active'?'Активная': st.includes('redeem')?'Погашена': st.includes('cancel')?'Отменена': st.includes('expire')?'Истёкшая': r.status || '—';
      const code = r.code || r.id || '';
      const offer = r.offer_title || r.offer_id || '';
      const created = (r.created_at? new Date(r.created_at).toLocaleString('ru-RU') : '');
      const until = (r.expires_at? new Date(r.expires_at).toLocaleString('ru-RU') : '');
      const row = document.createElement('div'); row.className='row';
      row.innerHTML = `<div>${created}</div><div>${code}</div><div>${offer}</div><div>${stRu}</div><div>${until}</div>
      <div style="display:flex;gap:6px;justify-content:flex-end;">
        <button class="btn btn-ghost btn-small" data-action="redeem" data-code="${code}">Погасить</button>
        <button class="btn btn-ghost btn-small" data-action="cancel" data-code="${code}">Отменить</button>
      </div>`;
      wrap.appendChild(row);
    });
    // delegated actions
    if (!wrap.dataset.bound){
      wrap.dataset.bound = '1';
      wrap.addEventListener('click', async (e)=>{
        const btn = e.target.closest('[data-action]'); if (!btn) return;
        const code = btn.dataset.code || ''; const act = btn.dataset.action;
        if (act==='redeem'){ redeem(code); }
        if (act==='cancel'){
          try{
            await api(`/api/v1/merchant/reservations/${encodeURIComponent(code)}/cancel`, { method:'POST' });
            toast('Отменено'); loadReservations(true);
          }catch(err){ toast('Ошибка: ' + (err.message||err)); }
        }
      });
    }
  }
  function loadReservations(reset=false){
    try{
      const rid = state.rid || Number(localStorage.getItem('foody_restaurant_id')||0);
      const key = state.key || localStorage.getItem('foody_key') || '';
      if (!rid || !key){
        const wrap = $('#res_rows'); if (wrap) wrap.innerHTML='';
        const empty = $('#reservationsEmpty'); if (empty){ empty.textContent='Войдите, чтобы просматривать брони'; empty.style.display=''; }
        return;
      }
      if (!window.__resvState || reset){ window.__resvState = { items:[], offset:0, limit:50, total:null }; }
      const st = window.__resvState;
      const params = new URLSearchParams();
      params.set('restaurant_id', String(rid));
      params.set('status', ($('#resvStatus')||{}).value||'');
      params.set('q', ($('#resvSearch')||{}).value||'');
      params.set('limit', String(st.limit));
      params.set('offset', String(st.offset));
      fetch(`${state.api}/api/v1/merchant/reservations?`+params.toString(), { headers:{ 'X-Foody-Key': key } })
        .then(r=>r.json().then(d=>[r.status,d]))
        .then(([code, data])=>{
          if (code>=200 && code<300){
            const list = Array.isArray(data.items)? data.items : (Array.isArray(data)? data : []);
            st.total = data.total ?? st.total; st.offset += list.length;
            const merged = (st.items||[]).concat(list);
            st.items = uniqBy(merged, x => x.id ?? x.code ?? `${x.offer_id||''}:${x.created_at||''}`);
            renderReservations(st.items);
          }
        }).catch(()=>{});
    }catch(e){ console.error(e); }
  }

  // === Router hooks ===
  document.addEventListener('click', (e)=>{
    const btn = e.target.closest('[data-tab]'); if (!btn) return;
    const tab = btn.dataset.tab;
    if (tab === 'qr'){ initQrTab(); loadReservations(true); }
  });
  window.addEventListener('DOMContentLoaded', ()=>{
    // If QR section is initially visible
    if (location.hash.includes('qr') || $('#qr')?.classList.contains('active')){
      initQrTab(); loadReservations(true);
    }
  });
})();