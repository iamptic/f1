(() => {
  const $ = (s, r=document) => r.querySelector(s);
  const API = (window.__FOODY__ && window.__FOODY__.FOODY_API) || "https://foodyback-production.up.railway.app";

  let offers = []; let total=null; let offset=0; const LIMIT=12; let loading=false;
  const grid = $('#grid'), gridSkeleton = $('#gridSkeleton'), q=$('#q');

  function timeLeft(iso){ try{ if(!iso) return ''; const diff=Math.max(0,new Date(iso).getTime()-Date.now()); const m=Math.floor(diff/60000), h=Math.floor(m/60), mm=m%60; return h>0? `${h}ч ${String(mm).padStart(2,'0')}м` : `${m} мин`; }catch{ return ''; } }
  function money(c){ return Math.round((c||0)/100)+' ₽'; }
  function disc(p, o){ const price=(p||0)/100, old=(o||0)/100; return (old>0&&price>0)?Math.max(0,Math.round((1-price/old)*100)):0; }
  const toastBox = document.getElementById('toast') || (()=>{ const d=document.createElement('div'); d.id='toast'; document.body.appendChild(d); return d; })();
  const toast = (m) => { const el=document.createElement('div'); el.className='toast'; el.textContent=m; toastBox.appendChild(el); setTimeout(()=>el.remove(), 3200); };

  function render(){
    grid.innerHTML='';
    const term=(q.value||'').toLowerCase();
    const list = offers
      .filter(o=>!term||(o.title||'').toLowerCase().includes(term))
      .filter(o=>(o.qty_left??0)>0 && (!o.expires_at || new Date(o.expires_at).getTime() > Date.now()))
      .sort((a,b)=>new Date(a.expires_at||0)-new Date(b.expires_at||0));
    if(!list.length){ grid.innerHTML='<div class="card"><div class="p">Нет офферов</div></div>'; return; }
    list.forEach(o=>{
      const el=document.createElement('div'); el.className='card';
      const d=disc(o.price_cents,o.original_price_cents); const left=timeLeft(o.expires_at);
      el.innerHTML = `
        ${o.image_url ? `<img src="${o.image_url}" alt="">` : `<div style="height:140px;background:#0d1218"></div>`}
        <div class="p">
          <div class="price">
            ${money(o.price_cents)}
            ${d?`<span class="badge">-${d}%</span>`:''}
            ${left?`<span class="badge left">${left}</span>`:''}
          </div>
          <div>${o.title || '—'}</div>
          <div class="meta"><span>Осталось: ${o.qty_left ?? '—'}</span>${o.category?`<span class="badge">${o.category}</span>`:''}</div>
        </div>`;
      el.onclick = () => open(o);
      grid.appendChild(el);
    });
  }

  function open(o){
    $('#sTitle').textContent=o.title||'—';
    $('#sImg').src=o.image_url||'';
    $('#sPrice').textContent=money(o.price_cents);
    const old=(o.original_price_cents||0)/100; $('#sOld').textContent=old? (old.toFixed(0)+' ₽'):'—';
    $('#sQty').textContent=(o.qty_left??'—') + ' / ' + (o.qty_total??'—');
    $('#sExp').textContent=o.expires_at? new Date(o.expires_at).toLocaleString('ru-RU'):'—';
    $('#sDesc').textContent=o.description||'';
    const left=timeLeft(o.expires_at); $('#sLeft').textContent=left?('Осталось: '+left):'—';
    $('#sheet').classList.remove('hidden');
    $('#sheet').setAttribute('aria-hidden','false');
    $('#reserveBtn').onclick = () => reserve(o);
  }
  $('#sheetClose').onclick = () => { $('#sheet').classList.add('hidden'); $('#sheet').setAttribute('aria-hidden','true'); };
  $('#qrClose').onclick = closeQR;
  $('#qrOk').onclick = closeQR;
  function closeQR(){ $('#qrModal').classList.add('hidden'); $('#qrModal').setAttribute('aria-hidden','true'); stopPoll(); }

  $('#refresh').onclick = resetAndLoad;
  q.oninput = render;

  function showQRCode(text){
    const payload = String(text||'').trim();
    const canvas = document.getElementById('qrCanvas');
    if (!canvas || !window.QRCode) return;
    const ctx = canvas.getContext('2d'); ctx.clearRect(0,0,canvas.width,canvas.height);
    window.QRCode.toCanvas(canvas, payload || 'NO_CODE', { width: 220, margin: 1 }, (err)=>{ if (err) console.error(err); });
    $('#qrCodeText').textContent = payload || '—';
    const m = $('#qrModal'); m.classList.remove('hidden'); m.setAttribute('aria-hidden','false');
  }

  // === Reservation state (persist + poll) ===
  const LS_KEY = 'foody_last_reservation';
  function saveReservation(obj){ try{ localStorage.setItem(LS_KEY, JSON.stringify(obj||{})); }catch{} }
  function readReservation(){ try{ return JSON.parse(localStorage.getItem(LS_KEY)||'null'); }catch{ return null; } }
  let pollTimer=null;
  function stopPoll(){ if (pollTimer){ clearInterval(pollTimer); pollTimer=null; } }
  function startPoll(idOrCode, expiresAt){
    stopPoll();
    updateTimer(expiresAt);
    pollTimer = setInterval(async ()=>{
      updateTimer(expiresAt);
      try{
        const resp = await fetch(`${API}/api/v1/public/reservations/${encodeURIComponent(idOrCode)}`, {cache:'no-store'});
        if(!resp.ok) return;
        const data = await resp.json().catch(()=>null);
        if(!data) return;
        $('#qrStatus').textContent = data.status ? `Статус: ${data.status}` : '';
        if (data.status && (data.status !== 'active')){
          toast(data.status === 'redeemed' ? 'Бронь погашена ✓' : data.status === 'expired' ? 'Бронь истекла' : 'Статус изменён');
          stopPoll();
        }
      }catch{}
    }, 3500);
  }
  function updateTimer(expiresAt){
    try{
      const el=$('#qrTimer');
      if(!el || !expiresAt){ el.textContent=''; return; }
      const left=timeLeft(expiresAt);
      el.textContent = left ? `Осталось: ${left}` : '';
    }catch{}
  }

  function showReservation(res){
    const code = res.code || res.reservation_code || res.qr_code;
    const payload = res.qr_url || res.url || code || '';
    showQRCode(payload || code || '');
    startPoll(code || res.id, res.expires_at);
  }

  async function reserve(o){
    try{
      const resp = await fetch(API + '/api/v1/public/reserve', {
        mode:'cors', cache:'no-store', referrerPolicy:'no-referrer',
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ offer_id: o.id || o.offer_id, name: 'Buyer', phone: '' })
      });
      const data = await resp.json().catch(()=>({}));
      if(!resp.ok){
        let msg = data?.detail || 'Не удалось забронировать';
        if (data?.detail === 'offer expired') msg = 'Оффер истёк';
        if (data?.detail === 'sold out') msg = 'Остаток закончился';
        toast(msg);
        return;
      }
      toast('Забронировано ✅');
      const item = offers.find(x => x.id === o.id || x.offer_id === o.offer_id);
      if (item && typeof item.qty_left === 'number') item.qty_left = Math.max(0, item.qty_left - 1);
      render();
      $('#sheet').classList.add('hidden'); $('#sheet').setAttribute('aria-hidden','true');

      const resObj = { id: data.id, offer_id: data.offer_id, code: data.code, expires_at: data.expires_at };
      saveReservation(resObj);
      showReservation(resObj);
    }catch(e){ console.error(e); toast('Сеть недоступна (CORS?)'); }
  }

  function showSkeleton(n=8){
    gridSkeleton.innerHTML=''; for(let i=0;i<n;i++){ const s=document.createElement('div'); s.className='card'; gridSkeleton.appendChild(s); }
    gridSkeleton.classList.remove('hidden');
  }
  function hideSkeleton(){ gridSkeleton.classList.add('hidden'); }

  async function loadBatch(){
    if(loading) return; if(total!==null && offset>=total) return;
    loading=true; showSkeleton();
    try{
      const url = `${API}/api/v1/public/offers?limit=${LIMIT}&offset=${offset}`;
      const res = await fetch(url);
      if(!res.ok) throw new Error('feed');
      const payload = await res.json();
      const arr = Array.isArray(payload.items)? payload.items : (Array.isArray(payload)?payload:[]);
      total = typeof payload.total==='number'? payload.total : null;
      offers = offers.concat(arr); offset += arr.length; render();
    }catch(e){ console.error(e); toast('Не удалось загрузить витрину'); }
    finally{ hideSkeleton(); loading=false; }
  }
  function resetAndLoad(){ offers=[]; total=null; offset=0; render(); loadBatch(); }
  function onScroll(){ const nearBottom = window.innerHeight + window.scrollY >= document.body.offsetHeight - 320; if(nearBottom) loadBatch(); }
  window.addEventListener('scroll', onScroll);
  \1
  try{ gateUI(); }catch(_){}
    resetAndLoad();
    // if there is unfinished reservation, show it again
    const last = readReservation();
    if(last && last.code){ showReservation(last); }
  });
})();


// === Auth gating helpers ===
function isAuthed(){
  try{
    const k1 = localStorage.getItem('api_key');
    const k2 = localStorage.getItem('foody_key');
    return !!(k1 || k2);
  }catch(_){ return false; }
}

function show(el, yes=true){ if(!el) return; el.style.display = yes ? '' : 'none'; }

function gateUI(){
  const authed = isAuthed();
  // optional containers - hide if they exist
  show(document.getElementById('tabs-auth'), authed);
  show(document.getElementById('auth-panel'), !authed);
  show(document.getElementById('logoutBtn'), authed);
  // QR tab states
  try{
    const scanBtn = document.getElementById('qr_scan_btn');
    const redeemBtn = document.getElementById('qr_redeem_btn');
    const msg = document.getElementById('qr_msg');
    if (scanBtn) scanBtn.disabled = !authed;
    if (redeemBtn) redeemBtn.disabled = !authed;
    if (msg){
      if (!authed) { msg.textContent='Войдите, чтобы сканировать и гасить брони'; msg.className='tag badge-warn'; }
      else { msg.textContent='Сканер выключен'; msg.className='tag'; }
    }
  }catch(_){}
}


// Dashboard CTA → auth if not authed
function wireDashboardCTA(){
  const authed = isAuthed();
  const goCreate = document.getElementById('ctaCreateOffer');
  const goMy = document.getElementById('ctaMyOffers');
  const authPanel = document.getElementById('auth-panel');
  function toAuth(ev){ if(!authed && authPanel){ ev.preventDefault(); authPanel.scrollIntoView({behavior:'smooth', block:'start'}); } }
  if (goCreate && !goCreate.dataset.bound){ goCreate.dataset.bound='1'; goCreate.addEventListener('click', toAuth); }
  if (goMy && !goMy.dataset.bound){ goMy.dataset.bound='1'; goMy.addEventListener('click', toAuth); }
}
try{ wireDashboardCTA(); }catch(_){}
