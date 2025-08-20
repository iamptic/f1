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
    const left=timeLeft(o.expires_at); $('#sLeft').textContent=left?('Осталось: '+left):'—';

    // Prefill name/phone/address from localStorage
    const sName = $('#sName'), sPhone = $('#sPhone'), sAddress = $('#sAddress');
    const st = JSON.parse(localStorage.getItem('foody_buyer') || '{}');
    if (sName) sName.value = st.name || '';
    if (sPhone) sPhone.value = st.phone || '';
    if (sAddress) sAddress.value = st.address || '';

    $('#sheet').classList.remove('hidden');
    $('#sheet').setAttribute('aria-hidden','false');
    $('#reserveBtn').onclick = () => reserve(o);
  }
  $('#sheetClose').onclick = () => { $('#sheet').classList.add('hidden'); $('#sheet').setAttribute('aria-hidden','true'); };
  $('#qrClose').onclick = closeQR;
  $('#qrOk').onclick = closeQR;
  function closeQR(){ $('#qrModal').classList.add('hidden'); $('#qrModal').setAttribute('aria-hidden','true'); }

  $('#refresh').onclick = resetAndLoad;
  q.oninput = render;

  // ===== Geolocation & reverse geocode (Nominatim) =====
  async function reverseGeocode(lat, lng){
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}&accept-language=ru`;
    const res = await fetch(url, { headers: { 'User-Agent': 'FoodyApp/1.0 (contact: support@example.com)' } });
    const data = await res.json();
    // Compose readable address
    const a = data.address||{};
    const parts = [a.road, a.house_number, a.neighbourhood, a.city||a.town||a.village, a.state, a.country].filter(Boolean);
    return parts.join(', ') || data.display_name || '';
  }

  async function geolocate(){
    const sAddress = $('#sAddress'), sLat = $('#sLat'), sLng = $('#sLng');
    if (!navigator.geolocation){ toast('Геолокация не поддерживается'); return; }
    try{
      const pos = await new Promise((res,rej)=> navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy:true, timeout:10000 }));
      const { latitude:lat, longitude:lng } = pos.coords;
      let addr = '';
      try { addr = await reverseGeocode(lat, lng); } catch(_) {}
      if (sAddress) sAddress.value = addr || sAddress.value || '';
      if (sLat) sLat.value = lat; if (sLng) sLng.value = lng;
      // Save into localStorage for next time
      const st = JSON.parse(localStorage.getItem('foody_buyer') || '{}');
      st.address = sAddress?.value || ''; st.lat = lat; st.lng = lng;
      localStorage.setItem('foody_buyer', JSON.stringify(st));
      toast(addr ? 'Адрес подставлен' : 'Гео определено');
    }catch(e){
      toast('Не удалось определить гео');
    }
  }
  document.addEventListener('click', (ev)=>{
    const btn = ev.target.closest('#geoBtn');
    if (btn) { ev.preventDefault(); geolocate(); }
  });

  function showQRCode(text){
    const payload = String(text||'').trim();
    const canvas = document.getElementById('qrCanvas');
    if (!canvas || !window.QRCode) return;
    const ctx = canvas.getContext('2d'); ctx.clearRect(0,0,canvas.width,canvas.height);
    window.QRCode.toCanvas(canvas, payload || 'NO_CODE', { width: 220, margin: 1 }, (err)=>{
      if (err) console.error(err);
    });
    $('#qrCodeText').textContent = payload || '—';
    const m = $('#qrModal'); m.classList.remove('hidden'); m.setAttribute('aria-hidden','false');
  }

  async function reserve(o){
    try{
      const sName = $('#sName'), sPhone = $('#sPhone'), sAddress = $('#sAddress');
      const sLat = $('#sLat'), sLng = $('#sLng');
      const name = sName?.value?.trim() || 'Покупатель';
      const phone = sPhone?.value?.trim() || '';
      const address = sAddress?.value?.trim() || '';
      // Save minimal profile
      localStorage.setItem('foody_buyer', JSON.stringify({ name, phone, address, lat: sLat?.value||'', lng: sLng?.value||'' }));

      const body = {
        offer_id: o.id || o.offer_id,
        name, phone, address,
        lat: sLat?.value ? Number(sLat.value) : undefined,
        lng: sLng?.value ? Number(sLng.value) : undefined
      };

      const resp = await fetch(API + '/api/v1/public/reserve', {
        mode:'cors', cache:'no-store', referrerPolicy:'no-referrer',
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify(body)
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
      // локально уменьшаем остаток
      const item = offers.find(x => x.id === o.id || x.offer_id === o.offer_id);
      if (item && typeof item.qty_left === 'number') item.qty_left = Math.max(0, item.qty_left - 1);
      render();

      // закрыть карточку
      $('#sheet').classList.add('hidden'); $('#sheet').setAttribute('aria-hidden','true');

      // получить код для погашения
      const code = data.code || data.reservation_code || data.qr_code || (data.reservation && (data.reservation.code || data.reservation.qr_code));
      const qrPayload = data.qr_url || data.url || code || '';
      showQRCode(qrPayload || code || '');
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
  document.addEventListener('DOMContentLoaded', resetAndLoad);
})();
