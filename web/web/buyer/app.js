(() => {
  const $ = (s, r=document) => r.querySelector(s);
  const API = (window.__FOODY__ && window.__FOODY__.FOODY_API) || "https://foodyback-production.up.railway.app";

  // ====== Utils
  const money = c => Math.round((c||0)/100) + " ₽";
  const discountPct = (p, o) => {
    const price=(p||0)/100, old=(o||0)/100;
    return (old>0&&price>0)? Math.max(0, Math.round((1-price/old)*100)) : 0;
  };
  const timeLeft = iso => {
    try{
      if(!iso) return "";
      const diff = Math.max(0, new Date(iso).getTime() - Date.now());
      const m = Math.floor(diff/60000), h = Math.floor(m/60), mm = m%60;
      return h>0 ? `${h}ч ${String(mm).padStart(2,'0')}м` : `${m} мин`;
    }catch{return "";}
  };
  const toRad = d => d * Math.PI / 180;
  const haversineKm = (a, b) => {
    if(!a||!b) return null;
    const R=6371, dLat=toRad(b.lat-a.lat), dLng=toRad(b.lng-a.lng);
    const sa = Math.sin(dLat/2)**2 + Math.cos(toRad(a.lat))*Math.cos(toRad(b.lat))*Math.sin(dLng/2)**2;
    return 2*R*Math.asin(Math.sqrt(sa));
  };
  const debounce = (fn, t=300) => { let id; return (...a)=>{ clearTimeout(id); id=setTimeout(()=>fn(...a), t); }; };

  // ====== State + persistence
  const FILTERS_KEY = "buyer_filters_v2";
  const geo = {
    get: () => {
      try{ return JSON.parse(localStorage.getItem("buyer_geo")||"null"); }catch{ return null; }
    },
    set: (obj) => { localStorage.setItem("buyer_geo", JSON.stringify(obj||{})); }
  };
  const state = {
    q: "", cat: "all", radius: 0,
    sort: "expire" // expire | near | discount | cheap | expensive
  };
  const saveFilters = debounce(() => {
    localStorage.setItem(FILTERS_KEY, JSON.stringify(state));
  }, 200);
  const loadFilters = () => {
    try{
      const j = localStorage.getItem(FILTERS_KEY);
      if(!j) return;
      const s = JSON.parse(j);
      if(typeof s.q==="string") state.q = s.q;
      if(typeof s.cat==="string") state.cat = s.cat;
      if(typeof s.radius==="number") state.radius = s.radius;
      if(typeof s.sort==="string") state.sort = s.sort;
    }catch{}
  };

  // ====== Data
  let offers = [];
  let total = null, offset=0, LO=12, loading=false;
  let currentOffer = null;
  let qty = 1, qtyMax = 1;

  // ====== UI refs
  const grid = $('#grid'), gridSkeleton = $('#gridSkeleton');
  const search = $('#search');
  const catsChips = $('#catsChips');
  const radiusChips = $('#radiusChips');
  const sortChips = $('#sortChips');
  const geoBtn = $('#geoBtn');

  const toastBox = $('#toast') || (()=>{ const d=document.createElement('div'); d.id='toast'; document.body.appendChild(d); return d; })();
  const toast = (m) => { const el=document.createElement('div'); el.className='toast'; el.textContent=m; toastBox.appendChild(el); setTimeout(()=>el.remove(), 3200); };

  // ====== Category labels (RU)
  const CATEGORY_LABELS = {
    pizza: "Пицца", sushi: "Суши", burgers: "Бургеры", dessert: "Десерты",
    coffee: "Кофе", bakery: "Выпечка", salad: "Салаты", grill: "Гриль", drinks: "Напитки"
  };
  const labelCat = (c) => {
    if(!c) return "Другое";
    const key = String(c).toLowerCase();
    return CATEGORY_LABELS[key] || (key[0].toUpperCase()+key.slice(1));
  };

  // ====== Build chips
  function buildChipsFromOffers(list){
    // категории из фида
    const set = new Set(list.map(o => (o.category || o.cat || "").toString().toLowerCase()).filter(Boolean));
    const cats = ["all", ...Array.from(set).sort()];
    catsChips.innerHTML = cats.map(c => `<button class="chip${state.cat===c?' active':''}" data-cat="${c}">${c==='all'?'Все':labelCat(c)}</button>`).join("");
    catsChips.onclick = (e) => {
      const b = e.target.closest('.chip'); if(!b) return;
      state.cat = b.dataset.cat;
      [...catsChips.children].forEach(x=>x.classList.toggle('active', x.dataset.cat===state.cat));
      saveFilters(); render();
    };

    // радиусы
    const radii = [0,3,5,10,20]; // 0 = любое
    radiusChips.innerHTML = radii.map(r => `<button class="chip${state.radius===r?' active':''}" data-r="${r}">${r? r+' км':'Любое'}</button>`).join("");
    radiusChips.onclick = (e) => {
      const b=e.target.closest('.chip'); if(!b) return;
      state.radius = Number(b.dataset.r)||0;
      [...radiusChips.children].forEach(x=>x.classList.toggle('active', Number(x.dataset.r)===state.radius));
      saveFilters(); render();
    };

    // сортировки
    const sorts = [
      ["expire","Скоро истекают"],
      ["near","Ближе ко мне"],
      ["discount","Больше скидка"],
      ["cheap","Дешевле"],
      ["expensive","Дороже"]
    ];
    sortChips.innerHTML = sorts.map(([k,t]) => `<button class="chip${state.sort===k?' active':''}" data-sort="${k}">${t}</button>`).join("");
    sortChips.onclick = (e) => {
      const b=e.target.closest('.chip'); if(!b) return;
      state.sort = b.dataset.sort;
      [...sortChips.children].forEach(x=>x.classList.toggle('active', x.dataset.sort===state.sort));
      saveFilters(); render();
    };
  }

  // ====== Fetch & render
  function showSkeleton(n=8){
    gridSkeleton.innerHTML=''; for(let i=0;i<n;i++){ const s=document.createElement('div'); s.className='card'; gridSkeleton.appendChild(s); }
    gridSkeleton.classList.remove('hidden');
  }
  function hideSkeleton(){ gridSkeleton.classList.add('hidden'); }

  async function loadBatch(){
    if(loading) return; if(total!==null && offset>=total) return;
    loading=true; showSkeleton();
    try{
      const url = `${API}/api/v1/public/offers?limit=${LO}&offset=${offset}`;
      const res = await fetch(url);
      if(!res.ok) throw new Error('feed');
      const payload = await res.json();
      const arr = Array.isArray(payload.items)? payload.items : (Array.isArray(payload)?payload:[]);
      total = typeof payload.total==='number'? payload.total : null;
      offers = offers.concat(arr);
      offset += arr.length;
      if(offset===arr.length){ // первая подгрузка
        buildChipsFromOffers(offers);
        smartRadius(); // если есть гео — подберём радиус
      }
      render();
    }catch(e){ console.error(e); toast('Не удалось загрузить витрину'); }
    finally{ hideSkeleton(); loading=false; }
  }

  function smartRadius(){
    const g = geo.get(); if(!g) return;
    const withDist = offers.map(o => ({o, d: distanceFor(o,g)})).filter(x=>x.d!=null).sort((a,b)=>a.d-b.d);
    const N = withDist.length;
    if(N>=1 && state.radius===0){ // подставляем только если пользователь сам не выбирал радиус
      const p90 = withDist[Math.min(N-1, Math.floor(N*0.9))].d;
      state.radius = p90<=3 ? 3 : p90<=5 ? 5 : p90<=10 ? 10 : 20;
      [...radiusChips.children].forEach(x=>x.classList.toggle('active', Number(x.dataset.r)===state.radius));
      saveFilters();
    }
  }

  function distanceFor(o, g){
    const lat = o.lat ?? o.latitude ?? o.restaurant_lat ?? null;
    const lng = o.lng ?? o.longitude ?? o.restaurant_lng ?? null;
    if(lat==null || lng==null) return null;
    return haversineKm({lat:g.lat,lng:g.lng},{lat:Number(lat),lng:Number(lng)});
  }

  function render(){
    const term = (state.q||"").toLowerCase();
    const g = geo.get();
    const list = offers
      .map(o => ({...o, __disc: discountPct(o.price_cents, o.original_price_cents), __dist: g? distanceFor(o,g) : null }))
      .filter(o => (!term || (o.title||"").toLowerCase().includes(term)))
      .filter(o => state.cat==='all' || (String(o.category||'').toLowerCase()===state.cat))
      .filter(o => state.radius===0 || (o.__dist!=null && o.__dist<=state.radius))
      .filter(o => (o.qty_left??0)>0 && (!o.expires_at || new Date(o.expires_at).getTime()>Date.now()));

    // сортировки
    const sort = state.sort;
    list.sort((a,b) => {
      if(sort==='near'){
        const ad=a.__dist??1e9, bd=b.__dist??1e9; return ad-bd;
      }else if(sort==='discount'){
        return (b.__disc||0) - (a.__disc||0);
      }else if(sort==='cheap'){
        return (a.price_cents||0) - (b.price_cents||0);
      }else if(sort==='expensive'){
        return (b.price_cents||0) - (a.price_cents||0);
      }else{ // expire
        return new Date(a.expires_at||0) - new Date(b.expires_at||0);
      }
    });

    grid.innerHTML = '';
    if(!list.length){
      grid.innerHTML = `<div class="card"><div class="p">Ничего не найдено. Попробуйте изменить фильтры.</div></div>`;
      return;
    }
    list.forEach(o => {
      const el = document.createElement('div'); el.className='card';
      const disc = o.__disc, left = timeLeft(o.expires_at);
      const km = (o.__dist!=null) ? `~${o.__dist.toFixed(1)} км` : '';
      const hasOld = (o.original_price_cents||0) > (o.price_cents||0);
      const oldText = hasOld ? Math.round((o.original_price_cents||0)/100) + " ₽" : "";
      el.innerHTML = `
        ${o.image_url ? `<img src="${o.image_url}" alt="">` : `<div style="height:140px;background:#0d1218"></div>`}
        <div class="p">
          <div class="price">
            <span>${money(o.price_cents)}</span>
            ${hasOld?`<span class="old small">${oldText}</span>`:''}
            ${disc?`<span class="badge">-${disc}%</span>`:''}
            ${left?`<span class="badge left">${left}</span>`:''}
            ${km?`<span class="badge left">${km}</span>`:''}
          </div>
          <div>${o.title||'—'}</div>
          <div class="meta">
            <div class="row"><span>Осталось: ${o.qty_left ?? '—'}</span>${o.category?`<span class="badge">${labelCat(o.category)}</span>`:''}</div>
          </div>
        </div>`;
      el.onclick = () => openOffer(o);
      grid.appendChild(el);
    });
  }


  // Robust reservation code/QR extraction
  function _pickCode(obj){
    if (!obj) return '';
    if (typeof obj === 'string') return obj;
    if (obj.code) return obj.code;
    if (obj.qr_code) return obj.qr_code;
    if (obj.reservation_code) return obj.reservation_code;
    if (obj.token) return obj.token;
    return '';
  }
  function getReservationCode(data){
    try{
      if (!data) return '';
      // direct fields
      let code = data.code || data.qr_code || data.reservation_code || '';
      // nested common shapes
      if (!code && data.reservation) code = _pickCode(data.reservation);
      if (!code && data.data) code = _pickCode(data.data);
      if (!code && Array.isArray(data.items) && data.items.length) code = _pickCode(data.items[0]);
      if (!code && data.id) code = data.id;
      return String(code||'').trim();
    }catch(_){ return ''; }
  }
  function getQrPayload(data){
    try{
      return (data.qr_url || data.url || '').trim();
    }catch(_){ return ''; }
  }

  // ====== Offer sheet + reserve + QR
  function openOffer(o){
    currentOffer = o;
    qtyMax = Math.max(1, Number(o.qty_left ?? 1));
    qty = 1;
    $('#sTitle').textContent = o.title||'—';
    $('#sImg').src = o.image_url||'';
    $('#sPrice').textContent = money(o.price_cents);
    const old=(o.original_price_cents||0)/100; $('#sOld').textContent=old? (old.toFixed(0)+' ₽'):'—';
    $('#sQty').textContent = (o.qty_left??'—') + ' / ' + (o.qty_total??'—');
    $('#sExp').textContent = o.expires_at? new Date(o.expires_at).toLocaleString('ru-RU'):'—';
    $('#sLeft').textContent = timeLeft(o.expires_at)? ('Осталось: '+timeLeft(o.expires_at)) : '—';
    $('#sDesc').textContent = o.description||'';

    // address & phone
    const addr = o.restaurant_address || o.address || o.addr || '';
    const phone = o.restaurant_phone || o.phone || o.restaurant_phone_number || '';
    $('#sAddr').textContent = addr ? addr : 'Адрес не указан';
    const phoneEl = $('#sPhone');
    if (phone){
      phoneEl.innerHTML = `Телефон: <a href="tel:${String(phone).replace(/[^+\d]/g,'')}">${phone}</a>`;
    } else {
      phoneEl.textContent = 'Телефон не указан';
    }

    // qty UI
    const qtyInput = $('#qtyInput');
    qtyInput.value = String(qty);
    qtyInput.min = "1";
    qtyInput.max = String(qtyMax);

    setModal('#sheet', true);
    updateReserveBtnTotal();
  }
  $('#sheetClose').onclick = () => setModal('#sheet', false);

  function clampQty(v){
    v = Math.floor(Number(v)||1);
    if (v<1) v=1;
    if (v>qtyMax) v=qtyMax;
    return v;
  }
  function updateReserveBtnTotal(){
    const o = currentOffer; if(!o) return;
    const total = Math.round(((o.price_cents||0)*qty)/100);
    $('#reserveBtn').textContent = `Забронировать (${qty} • ${total} ₽)`;
  }

  $('#qtyDec').onclick = () => {
    qty = clampQty(qty-1);
    $('#qtyInput').value = String(qty);
    updateReserveBtnTotal();
  };
  $('#qtyInc').onclick = () => {
    qty = clampQty(qty+1);
    $('#qtyInput').value = String(qty);
    updateReserveBtnTotal();
  };
  $('#qtyInput').oninput = (e) => {
    qty = clampQty(e.target.value);
    e.target.value = String(qty);
    updateReserveBtnTotal();
  };

  $('#reserveBtn').onclick = async () => {
    const o = currentOffer; if(!o) return;
    try{
      const body = { offer_id: o.id || o.offer_id, name:'Гость', phone:'', qty };
      const resp = await fetch(API + '/api/v1/public/reserve', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify(body)
      });
      const data = await resp.json().catch(()=>({}));
      if(!resp.ok){
        let msg = data?.detail || 'Не удалось забронировать';
        if (data?.detail === 'offer expired') msg = 'Оффер истёк';
        if (data?.detail === 'sold out') msg = 'Остаток закончился';
        toast(msg); return;
      }
      toast('Забронировано ✅');
      // локально уменьшим остаток
      const it = offers.find(x => x.id===o.id || x.offer_id===o.offer_id);
      if (it && typeof it.qty_left==='number') it.qty_left = Math.max(0, it.qty_left-qty);
      render();
      setModal('#sheet', false);

      const code = getReservationCode(data);
      const payload = getQrPayload(data) || code;
      if (!code && !payload) { toast('Бронь оформлена, но код не получен'); return; }
      showQR(payload || code);
    }catch(e){ console.error(e); toast('Сеть недоступна'); }
  };

  function showQR(text){
    const canvas = $('#qrCanvas');
    const code = (text||'').toString().trim() || 'NO_CODE';
    $('#qrCodeText').textContent = code;
    setModal('#qrModal', true);
    // draw a tick later to ensure modal/canvas is visible for crisp QR
    setTimeout(()=>{
      try{
        if (window.QRCode && typeof window.QRCode.toCanvas==='function'){
          window.QRCode.toCanvas(canvas, code, { width:220, margin:1 }, ()=>{});
        } else if (canvas && canvas.getContext){
          const ctx = canvas.getContext('2d'); ctx.clearRect(0,0,canvas.width,canvas.height);
          ctx.fillStyle = '#111'; ctx.fillRect(0,0,canvas.width,canvas.height);
          ctx.fillStyle = '#fff'; ctx.fillText(code, 10, 20);
        }
      }catch(e){}
    }, 30);
  }
  $('#qrClose').onclick = () => setModal('#qrModal', false);
  $('#qrOk').onclick = () => setModal('#qrModal', false);

  function setModal(sel, open){
    const m = $(sel); if(!m) return;
    m.setAttribute('aria-hidden', open? 'false':'true');
  }

  // ====== Geolocation
  geoBtn.onclick = async () => {
    try{
      const pos = await new Promise((res,rej)=>navigator.geolocation.getCurrentPosition(res, rej, {enableHighAccuracy:true, timeout:10000}));
      const { latitude:lat, longitude:lng } = pos.coords;
      geo.set({lat, lng});
      toast('Геопозиция сохранена');
      smartRadius();
      render();
    }catch(e){ toast('Не удалось получить геопозицию'); }
  };

  // ====== Events
  search.oninput = () => { state.q = search.value||""; saveFilters(); render(); };
  function onScroll(){ const nearBottom = window.innerHeight + window.scrollY >= document.body.offsetHeight - 320; if(nearBottom) loadBatch(); }
  window.addEventListener('scroll', onScroll);

  // ====== Start
  document.addEventListener('DOMContentLoaded', () => {
    loadFilters();
    search.value = state.q || "";
    offers = []; total=null; offset=0; loadBatch();
  });
})();