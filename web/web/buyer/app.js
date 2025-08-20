(() => {
  const $ = (s, r=document) => r.querySelector(s);
  const API = (window.__FOODY__ && window.__FOODY__.FOODY_API) || "https://foodyback-production.up.railway.app";

  let offers = []; let total=null; let offset=0; const LIMIT=24; let loading=false;
  const grid = $('#grid'), gridSkeleton = $('#gridSkeleton'), q=$('#q'), catSel=$('#cat'), sortSel=$('#sort');
  const geoBtn=$('#geoBtn'), radiusSel=$('#radius'), geoNote=$('#geoNote');

  // Localize categories (fallback to original if not in map)
  const CAT_LABELS = {
    bakery: 'Выпечка',
    bread: 'Хлеб',
    coffee: 'Кофе',
    drinks: 'Напитки',
    desserts: 'Десерты',
    sushi: 'Суши',
    pizza: 'Пицца',
    burgers: 'Бургеры',
    salads: 'Салаты',
    soup: 'Супы',
    hot: 'Горячие блюда',
    grill: 'Гриль',
    fish: 'Рыба',
    meat: 'Мясо',
    poultry: 'Птица',
    vegan: 'Веган',
    vegetarian: 'Вегетарианское',
    breakfast: 'Завтраки',
    lunch: 'Обеды',
    dinner: 'Ужины',
    other: 'Другое'
  };

  // Geolocation state
  let myGeo = loadGeo();
  updateGeoNote();

  function loadGeo(){
    try{
      const raw = localStorage.getItem('buyer_geo');
      return raw ? JSON.parse(raw) : null;
    }catch{ return null; }
  }
  function saveGeo(obj){
    try{ localStorage.setItem('buyer_geo', JSON.stringify(obj||null)); }catch{}
  }
  function updateGeoNote(){
    if(myGeo && myGeo.lat && myGeo.lng){
      geoNote.textContent = `Моё местоположение сохранено: ${myGeo.address || (myGeo.lat.toFixed(4)+','+myGeo.lng.toFixed(4))}`;
    }else{
      geoNote.textContent = 'Подсказка: нажмите «Моя гео», чтобы видеть расстояние и сортировать по близости';
    }
  }

  // Distance utilities
  const R = 6371; // km
  function toRad(v){ return v * Math.PI / 180; }
  function haversine(lat1, lon1, lat2, lon2){
    if([lat1,lon1,lat2,lon2].some(v=>v===undefined||v===null)) return null;
    const dLat = toRad(lat2-lat1);
    const dLon = toRad(lon2-lon1);
    const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }

  function timeLeft(iso){ try{ if(!iso) return ''; const diff=Math.max(0,new Date(iso).getTime()-Date.now()); const m=Math.floor(diff/60000), h=Math.floor(m/60), mm=m%60; return h>0? `${h}ч ${String(mm).padStart(2,'0')}м` : `${m} мин`; }catch{ return ''; } }
  function money(c){ return Math.round((c||0)/100)+' ₽'; }
  function discountPct(p, o){ const price=(p||0)/100, old=(o||0)/100; return (old>0&&price>0)?Math.max(0,Math.round((1-price/old)*100)):0; }
  const toastBox = document.getElementById('toast') || (()=>{ const d=document.createElement('div'); d.id='toast'; document.body.appendChild(d); return d; })();
  const toast = (m) => { const el=document.createElement('div'); el.className='toast'; el.textContent=m; toastBox.appendChild(el); setTimeout(()=>el.remove(), 3200); };

  function normalizeCat(c){
    if(!c) return '';
    const key = String(c).toLowerCase().trim();
    return CAT_LABELS[key] ? { key, label: CAT_LABELS[key] } : { key, label: c };
  }

  function buildCats(){
    const uniq = new Map();
    offers.forEach(o => {
      const c = o.category || o.cat || o.type;
      if(!c) return;
      const n = normalizeCat(c);
      uniq.set(n.key, n.label);
    });
    const opts = ['<option value="">Все категории</option>']
      .concat([...uniq.entries()].sort((a,b)=> a[1].localeCompare(b[1],'ru')).map(([k,l])=>`<option value="${k}">${l}</option>`));
    catSel.innerHTML = opts.join('');
  }

  function decorateOffer(o){
    // Extract possible lat/lng from offer or restaurant fields
    const lat = o.lat ?? o.latitude ?? o.restaurant_lat ?? o.restaurant_latitude;
    const lng = o.lng ?? o.longitude ?? o.restaurant_lng ?? o.restaurant_longitude;
    const deco = { ...o };
    if(myGeo && myGeo.lat && myGeo.lng && lat!=null && lng!=null){
      deco._distance_km = haversine(myGeo.lat, myGeo.lng, Number(lat), Number(lng));
    }else{
      deco._distance_km = null;
    }
    const cat = normalizeCat(o.category || o.cat || o.type);
    deco._cat_key = cat.key; deco._cat_label = cat.label;
    deco._discount = discountPct(o.price_cents, o.original_price_cents);
    return deco;
  }

  function render(){
    grid.innerHTML='';
    const term=(q.value||'').toLowerCase();
    const catKey = catSel.value||'';
    const rad = Number(radiusSel.value||0)||0;
    // decorate list
    const list = offers.map(decorateOffer)
      .filter(o=>!term||(o.title||'').toLowerCase().includes(term))
      .filter(o=>(o.qty_left??0)>0 && (!o.expires_at || new Date(o.expires_at).getTime() > Date.now()))
      .filter(o=>!catKey || o._cat_key===catKey)
      .filter(o=> !rad || (o._distance_km!=null && o._distance_km<=rad));

    // sorting
    const sortBy = sortSel.value || 'expire';
    list.sort((a,b)=>{
      if(sortBy==='near'){
        const da = a._distance_km ?? 1e9, db = b._distance_km ?? 1e9;
        return da - db;
      }else if(sortBy==='discount'){
        return (b._discount||0) - (a._discount||0);
      }else if(sortBy==='cheap'){
        return (a.price_cents||0) - (b.price_cents||0);
      }else if(sortBy==='expensive'){
        return (b.price_cents||0) - (a.price_cents||0);
      }else{ // expire
        return new Date(a.expires_at||0) - new Date(b.expires_at||0);
      }
    });

    if(!list.length){ grid.innerHTML='<div class="card"><div class="p">Ничего не найдено</div></div>'; return; }

    list.forEach(o=>{
      const el=document.createElement('div'); el.className='card';
      const left=timeLeft(o.expires_at);
      const distBadge = (o._distance_km!=null) ? `<span class="badge">~${o._distance_km.toFixed(1)} км</span>` : '';
      el.innerHTML = `
        ${o.image_url ? `<img src="${o.image_url}" alt="">` : `<div style="height:140px;background:#0d1218"></div>`}
        <div class="p">
          <div class="price">
            ${money(o.price_cents)}
            ${o._discount?`<span class="badge">-${o._discount}%</span>`:''}
            ${left?`<span class="badge left">${left}</span>`:''}
            ${distBadge}
          </div>
          <div>${o.title || '—'}</div>
          <div class="meta"><span>Осталось: ${o.qty_left ?? '—'}</span>${o._cat_label?`<span class="badge">${o._cat_label}</span>`:''}</div>
        </div>`;
      el.onclick = () => open(o);
      grid.appendChild(el);
    });
  }

  function open(o){
    const deco = decorateOffer(o);
    $('#sTitle').textContent=deco.title||'—';
    $('#sImg').src=deco.image_url||'';
    $('#sPrice').textContent=money(deco.price_cents);
    const old=(deco.original_price_cents||0)/100; $('#sOld').textContent=old? (old.toFixed(0)+' ₽'):'—';
    $('#sQty').textContent=(deco.qty_left??'—') + ' / ' + (deco.qty_total??'—');
    $('#sExp').textContent=deco.expires_at? new Date(deco.expires_at).toLocaleString('ru-RU'):'—';
    $('#sDesc').textContent=deco.description||'';
    const left=timeLeft(deco.expires_at); $('#sLeft').textContent=left?('Осталось: '+left):'—';
    $('#sheet').classList.remove('hidden');
    $('#sheet').setAttribute('aria-hidden','false');
    $('#reserveBtn').onclick = () => reserve(deco);
  }
  $('#sheetClose').onclick = () => { $('#sheet').classList.add('hidden'); $('#sheet').setAttribute('aria-hidden','true'); };
  $('#qrClose').onclick = closeQR;
  $('#qrOk').onclick = closeQR;
  function closeQR(){ $('#qrModal').classList.add('hidden'); $('#qrModal').setAttribute('aria-hidden','true'); }

  $('#refresh').onclick = resetAndLoad;
  q.oninput = render;
  catSel.onchange = render;
  sortSel.onchange = render;
  radiusSel.onchange = render;

  // Geolocation
  geoBtn.onclick = async () => {
    if(!navigator.geolocation){ toast('Геолокация не поддерживается'); return; }
    geoBtn.disabled = true;
    navigator.geolocation.getCurrentPosition(async pos => {
      const { latitude:lat, longitude:lng } = pos.coords || {};
      myGeo = { lat, lng };
      // Try to fetch address (best effort)
      try{
        const resp = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`, {headers: {'Accept-Language':'ru'}});
        const data = await resp.json();
        myGeo.address = data?.display_name || null;
      }catch{}
      saveGeo(myGeo); updateGeoNote(); render();
      geoBtn.disabled = false;
    }, err => {
      toast('Не удалось получить геопозицию');
      geoBtn.disabled = false;
    }, { enableHighAccuracy:true, timeout:9000 });
  };

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
      const resp = await fetch(API + '/api/v1/public/reserve', {
        mode:'cors', cache:'no-store', referrerPolicy:'no-referrer',
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ offer_id: o.id || o.offer_id, name: 'Buyer', phone: '', lat: myGeo?.lat, lng: myGeo?.lng, address: myGeo?.address })
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

      const code = data.code || data.reservation_code || data.qr_code || (data.reservation && (data.reservation.code || data.reservation.qr_code));
      const qrPayload = data.qr_url || data.url || code || '';
      showQRCode(qrPayload || code || '');
    }catch(e){ console.error(e); toast('Сеть недоступна (CORS?)'); }
  }

  function showSkeleton(n=12){
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
      offers = offers.concat(arr);
      offset += arr.length;
      buildCats();
      render();
    }catch(e){ console.error(e); toast('Не удалось загрузить витрину'); }
    finally{ hideSkeleton(); loading=false; }
  }

  function resetAndLoad(){ offers=[]; total=null; offset=0; render(); loadBatch(); }
  function onScroll(){ const nearBottom = window.innerHeight + window.scrollY >= document.body.offsetHeight - 320; if(nearBottom) loadBatch(); }
  window.addEventListener('scroll', onScroll);
  document.addEventListener('DOMContentLoaded', resetAndLoad);
})();
