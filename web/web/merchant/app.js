(() => {
  const $  = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
  const on = (sel, evt, fn) => { const el=$(sel); if(el) el.addEventListener(evt, fn, {passive:false}); };

  const state = {
    api: (window.__FOODY__ && window.__FOODY__.FOODY_API) || window.foodyApi || 'https://foodyback-production.up.railway.app',
    rid: localStorage.getItem('foody_restaurant_id') || '',
    key: localStorage.getItem('foody_key') || '',
  };

  // ===== toast
  const toastBox = $('#toast');
  function showToast(msg){
    if(!toastBox) return alert(msg);
    const el=document.createElement('div'); el.className='toast'; el.textContent=msg;
    toastBox.appendChild(el); setTimeout(()=>el.remove(), 4200);
  }

  function toggleLogout(v){ const b=$('#logoutBtn'); if(b) b.style.display = v?'':'none'; }
  function gate(){
    const authed = !!(state.rid && state.key);
    const tabs = $('#tabs'); const bn = $('.bottom-nav');
    if(!authed){ if(tabs) tabs.style.display='none'; if(bn) bn.style.display='none'; toggleLogout(false); activateTab('auth'); return false; }
    if(tabs) tabs.style.display=''; if(bn) bn.style.display='';
    toggleLogout(true); activateTab('offers'); try{ refreshDashboard(); }catch(_){}
    return true;
  }
  on('#logoutBtn','click', () => {
    try{ localStorage.removeItem('foody_restaurant_id'); localStorage.removeItem('foody_key'); }catch(_){}
    state.rid=''; state.key=''; showToast('Вы вышли');
    toggleLogout(false); activateTab('auth');
    const tabs=$('#tabs'); const bn=$('.bottom-nav'); if(tabs) tabs.style.display='none'; if(bn) bn.style.display='none';
  });

  // ===== helpers
  async function api(path, { method='GET', headers={}, body=null, raw=false } = {}){
    const url = `${state.api}${path}`;
    const h = { 'Content-Type': 'application/json', ...headers };
    if(state.key) h['X-Foody-Key'] = state.key;
    const res = await fetch(url, { method, headers: h, body });
    if(res.status===204) return raw?res:null;
    if(!res.ok){
      let msg = `${res.status} ${res.statusText}`;
      try { const ct=res.headers.get('content-type')||''; if(ct.includes('json')){ const j=await res.json(); if(j?.detail||j?.message) msg = j.detail||j.message; } } catch(_){}
      throw new Error(msg);
    }
    if(raw) return res;
    const ct = res.headers.get('content-type')||'';
    return ct.includes('json') ? (await res.json().catch(()=>null)) : (await res.text().catch(()=>'')); 
  }

  // ===== Tabs
  function activateTab(tab){
    try {
      $$('.seg-btn').forEach(b=>b.classList.toggle('active', b.dataset.tab===tab));
      $$('.nav-btn').forEach(b=>b.classList.toggle('active', b.dataset.tab===tab));
      $$('.pane').forEach(p=>p.classList.toggle('active', p.id===tab));
      if(tab==='offers') loadOffers();
      if(tab==='profile') loadProfile();
      if(tab==='qr'){ initQrTab(); loadReservations(); }
    } catch(e){ console.warn('activateTab',e); }
  }
  on('#tabs','click',(e)=>{ const b=e.target.closest('.seg-btn'); if(b?.dataset.tab) activateTab(b.dataset.tab); });
  on('.bottom-nav','click',(e)=>{ const b=e.target.closest('.nav-btn'); if(b?.dataset.tab) activateTab(b.dataset.tab); });

  document.addEventListener('click',(e)=>{ const el=e.target.closest('[data-tab]'); if(el){ e.preventDefault(); activateTab(el.dataset.tab); } }, true);

  // ======= OFFERS / PROFILE (укорочено; оставь свои текущие реализации)
  async function loadOffers(){ /* оставлено без изменений в твоей сборке */ }
  async function loadProfile(){ /* оставлено без изменений в твоей сборке */ }

  // =================== QR / RESERVATIONS ===================
  let __qrTimer = null;

  function normalizeReservation(r){
    const code = r?.code || r?.reservation_code || r?.qr_code || r?.reservation?.code || r?.reservation?.qr_code || '';
    const title = r?.offer_title || r?.offer?.title || r?.title || '—';
    const status = (r?.status || '').toLowerCase() || 'active'; // active|redeemed|cancelled
    const created = r?.created_at || r?.createdAt || r?.created || null;
    const expires = r?.expires_at || r?.expiresAt || r?.expires || null;
    return { code, title, status, created, expires };
  }

  async function fetchReservations(){
    // основной путь
    try {
      const q = await api(`/api/v1/merchant/reservations?restaurant_id=${encodeURIComponent(state.rid)}`);
      const list = q?.items || q?.results || (Array.isArray(q)?q:[]);
      return list.map(normalizeReservation);
    } catch(e1){
      // запасной путь (некоторые бэки отдают список без query-параметра, только по ключу)
      try {
        const q = await api(`/api/v1/merchant/reservations`);
        const list = q?.items || q?.results || (Array.isArray(q)?q:[]);
        return list.map(normalizeReservation);
      } catch(e2){
        throw e2;
      }
    }
  }

  function fmtDateRu(iso){
    try{ return new Intl.DateTimeFormat('ru-RU',{dateStyle:'short', timeStyle:'short'}).format(new Date(iso)); }catch(_){ return '—'; }
  }

  function renderReservations(items){
    const root = $('#qrList'); if(!root) return;
    if(!items?.length){
      root.innerHTML = `<div class="row"><div class="muted">Нет активных броней</div></div>`;
      return;
    }
    const head = `<div class="row head"><div>Код</div><div>Оффер</div><div class="hide-sm">Создана</div><div class="hide-sm">Действует до</div><div></div></div>`;
    const rows = items.map(r=>{
      const badge = r.status==='redeemed' ? 'badge-ok' : (r.status==='cancelled'?'badge-warn':'');
      return `<div class="row" data-code="${r.code}">
        <div><span class="tag ${badge}">${r.code || '—'}</span></div>
        <div>${r.title}</div>
        <div class="hide-sm">${r.created?fmtDateRu(r.created):'—'}</div>
        <div class="hide-sm">${r.expires?fmtDateRu(r.expires):'—'}</div>
        <div class="actions">
          ${r.status==='active'
            ? `<button class="btn btn-primary" data-action="redeem">Погасить</button>
               <button class="btn btn-ghost" data-action="cancel">Отменить</button>`
            : `<span class="muted">${r.status==='redeemed'?'Погашена':'Отменена'}</span>`
          }
        </div>
      </div>`;
    }).join('');
    root.innerHTML = head + rows;

    // делегирование действий
    root.onclick = async (e)=>{
      const btn = e.target.closest('button'); if(!btn) return;
      const row = btn.closest('.row'); const code = row?.dataset.code;
      if(!code) return;
      if(btn.dataset.action==='redeem'){
        await redeem(code);
        // визуально обновим строку
        row.querySelector('.actions').innerHTML = `<span class="muted">Погашена</span>`;
        const tag = row.querySelector('.tag'); if(tag){ tag.classList.remove('badge-warn'); tag.classList.add('badge-ok'); }
      }
      if(btn.dataset.action==='cancel'){
        try{
          await api(`/api/v1/merchant/reservations/${encodeURIComponent(code)}/cancel`, { method:'POST' });
          showToast('Отменено');
          row.querySelector('.actions').innerHTML = `<span class="muted">Отменена</span>`;
          const tag = row.querySelector('.tag'); if(tag){ tag.classList.remove('badge-ok'); tag.classList.add('badge-warn'); }
        }catch(err){ showToast('Не удалось отменить: ' + (err.message||err)); }
      }
    };
  }

  async function loadReservations(){
    const root = $('#qrList'); if(root) root.innerHTML = `<div class="skeleton"></div><div class="skeleton"></div>`;
    try{
      const list = await fetchReservations();
      // по умолчанию показываем активные сверху
      list.sort((a,b)=>{
        const aw = a.status==='active'?0:1, bw = b.status==='active'?0:1;
        if(aw!==bw) return aw-bw;
        return (new Date(b.created||0)) - (new Date(a.created||0));
      });
      renderReservations(list);
    }catch(err){
      if(root) root.innerHTML = `<div class="row"><div class="muted">Не удалось загрузить брони: ${err.message||err}</div></div>`;
    }
    // авто-обновление каждые 20с на вкладке QR
    clearInterval(__qrTimer);
    __qrTimer = setInterval(()=>{
      const qrPane = $('#qr'); if(!qrPane || !qrPane.classList.contains('active')) return; // обновлять только когда видимая
      loadReservations();
    }, 20000);
  }

  // --- погашение по коду
  async function redeem(code){
    const msg = $('#qr_msg');
    if(!code){ if(msg){ msg.textContent='Введите код'; msg.className='tag badge-warn'; } return; }
    try{
      await api(`/api/v1/merchant/reservations/${encodeURIComponent(code)}/redeem`, { method:'POST' });
      if(msg){ msg.textContent='Погашено ✓'; msg.className='tag badge-ok'; }
      try{ refreshDashboard && refreshDashboard(); }catch(_){}
    }catch(e){
      if(msg){ msg.textContent = 'Ошибка: ' + (e.message||e); msg.className='tag badge-warn'; }
    }
  }

  // --- сканирование QR через BarcodeDetector
  async function startScan(){
    const msg = $('#qr_msg'); const video = $('#qr_video');
    if(!('BarcodeDetector' in window)){
      if(msg){ msg.textContent='Сканер не поддерживается: введите код вручную'; msg.className='tag badge-warn'; }
      return;
    }
    try{
      const stream = await navigator.mediaDevices.getUserMedia({ video:{ facingMode:'environment' } });
      video.srcObject = stream; await video.play();
      const det = new BarcodeDetector({ formats:['qr_code'] });
      const timer = setInterval(async () => {
        try{
          const codes = await det.detect(video);
          if(codes && codes[0]){
            clearInterval(timer);
            stream.getTracks().forEach(t=>t.stop());
            const val = codes[0].rawValue || '';
            const input = $('#qr_code'); if(input) input.value = val;
            redeem(val);
          }
        }catch(_){}
      }, 350);
    }catch(e){
      if(msg){ msg.textContent='Не удалось открыть камеру'; msg.className='tag badge-warn'; }
    }
  }

  function initQrTab(){
    const r = $('#qr_redeem_btn'); const s = $('#qr_scan_btn');
    if(r && !r.dataset.bound){ r.dataset.bound='1'; r.addEventListener('click', ()=> redeem(($('#qr_code')||{}).value||'')); }
    if(s && !s.dataset.bound){ s.dataset.bound='1'; s.addEventListener('click', startScan); }
  }

  // ===== init
  document.addEventListener('DOMContentLoaded', () => {
    gate(); // покажет нужные табы/кнопки
    // универсальная маршрутизация
    document.addEventListener('click', (ev) => {
      const el = ev.target.closest('[data-tab]');
      if (el) { ev.preventDefault(); activateTab(el.dataset.tab); }
    }, true);
  });
})();
