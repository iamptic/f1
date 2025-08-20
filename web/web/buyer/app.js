(() => {
  const $ = (s, r=document) => r.querySelector(s);
  const API = (window.__FOODY__ && window.__FOODY__.FOODY_API) || "https://foodyback-production.up.railway.app";

  // --- utils (без изменений) ---
  const money = c => Math.round((c||0)/100) + " ₽";
  const discountPct = (p, o) => { const price=(p||0)/100, old=(o||0)/100; return (old>0&&price>0)? Math.max(0, Math.round((1-price/old)*100)) : 0; };
  const timeLeft = iso => { try{ if(!iso) return ""; const diff=Math.max(0,new Date(iso).getTime()-Date.now()); const m=Math.floor(diff/60000),h=Math.floor(m/60),mm=m%60; return h>0?`${h}ч ${String(mm).padStart(2,'0')}м`:`${m} мин`; }catch{return "";} };
  const toRad = d => d*Math.PI/180;
  const haversineKm = (a,b) => { if(!a||!b) return null; const R=6371, dLat=toRad(b.lat-a.lat), dLng=toRad(b.lng-a.lng); const sa=Math.sin(dLat/2)**2+Math.cos(toRad(a.lat))*Math.cos(toRad(b.lat))*Math.sin(dLng/2)**2; return 2*R*Math.asin(Math.sqrt(sa)); };
  const debounce = (fn,t=300)=>{ let id; return (...a)=>{ clearTimeout(id); id=setTimeout(()=>fn(...a),t); }; };

  // --- state/persist (без изм.) ---
  const FILTERS_KEY="buyer_filters_v2";
  const geo={ get:()=>{ try{return JSON.parse(localStorage.getItem("buyer_geo")||"null");}catch{return null;} }, set:(o)=>localStorage.setItem("buyer_geo",JSON.stringify(o||{})) };
  const state={ q:"", cat:"all", radius:0, sort:"expire" };
  const saveFilters = debounce(()=>localStorage.setItem(FILTERS_KEY, JSON.stringify(state)),200);
  const loadFilters = ()=>{ try{ const s=JSON.parse(localStorage.getItem(FILTERS_KEY)||"null"); if(!s) return; if(typeof s.q==="string") state.q=s.q; if(typeof s.cat==="string") state.cat=s.cat; if(typeof s.radius==="number") state.radius=s.radius; if(typeof s.sort==="string") state.sort=s.sort; }catch{} };

  // --- data/ui refs ---
  let offers=[], total=null, offset=0, LO=12, loading=false, currentOffer=null;
  const grid=$('#grid'), gridSkeleton=$('#gridSkeleton'), search=$('#search');
  const catsChips=$('#catsChips'), radiusChips=$('#radiusChips'), sortChips=$('#sortChips'), geoBtn=$('#geoBtn');
  const toastBox=$('#toast')||(()=>{const d=document.createElement('div'); d.id='toast'; document.body.appendChild(d); return d;})();
  const toast = (m)=>{ const el=document.createElement('div'); el.className='toast'; el.textContent=m; toastBox.appendChild(el); setTimeout(()=>el.remove(),3200); };

  // --- categories ---
  const CATEGORY_LABELS={ pizza:"Пицца", sushi:"Суши", burgers:"Бургеры", dessert:"Десерты", coffee:"Кофе", bakery:"Выпечка", salad:"Салаты", grill:"Гриль", drinks:"Напитки" };
  const labelCat = c => { if(!c) return "Другое"; const k=String(c).toLowerCase(); return CATEGORY_LABELS[k] || (k[0].toUpperCase()+k.slice(1)); };

  // --- chips builders (как было) ---
  function buildChipsFromOffers(list){
    const set = new Set(list.map(o => (o.category||o.cat||"").toString().toLowerCase()).filter(Boolean));
    const cats=["all", ...Array.from(set).sort()];
    catsChips.innerHTML=cats.map(c=>`<button class="chip${state.cat===c?' active':''}" data-cat="${c}">${c==='all'?'Все':labelCat(c)}</button>`).join("");
    catsChips.onclick=(e)=>{ const b=e.target.closest('.chip'); if(!b) return; state.cat=b.dataset.cat; [...catsChips.children].forEach(x=>x.classList.toggle('active', x.dataset.cat===state.cat)); saveFilters(); render(); };

    const radii=[0,3,5,10,20];
    radiusChips.innerHTML=radii.map(r=>`<button class="chip${state.radius===r?' active':''}" data-r="${r}">${r? r+' км':'Любое'}</button>`).join("");
    radiusChips.onclick=(e)=>{ const b=e.target.closest('.chip'); if(!b) return; state.radius=Number(b.dataset.r)||0; [...radiusChips.children].forEach(x=>x.classList.toggle('active', Number(x.dataset.r)===state.radius)); saveFilters(); render(); };

    const sorts=[["expire","Скоро истекают"],["near","Ближе ко мне"],["discount","Больше скидка"],["cheap","Дешевле"],["expensive","Дороже"]];
    sortChips.innerHTML=sorts.map(([k,t])=>`<button class="chip${state.sort===k?' active':''}" data-sort="${k}">${t}</button>`).join("");
    sortChips.onclick=(e)=>{ const b=e.target.closest('.chip'); if(!b) return; state.sort=b.dataset.sort; [...sortChips.children].forEach(x=>x.classList.toggle('active', x.dataset.sort===state.sort)); saveFilters(); render(); };
  }

  // --- loading & render (как было) ---
  function showSkeleton(n=8){ gridSkeleton.innerHTML=''; for(let i=0;i<n;i++){ const s=document.createElement('div'); s.className='card'; gridSkeleton.appendChild(s);} gridSkeleton.classList.remove('hidden'); }
  function hideSkeleton(){ gridSkeleton.classList.add('hidden'); }
  async function loadBatch(){
    if(loading) return; if(total!==null && offset>=total) return;
    loading=true; showSkeleton();
    try{
      const url=`${API}/api/v1/public/offers?limit=${LO}&offset=${offset}`;
      const res=await fetch(url); if(!res.ok) throw new Error('feed');
      const payload=await res.json();
      const arr=Array.isArray(payload.items)?payload.items:(Array.isArray(payload)?payload:[]);
      total=typeof payload.total==='number'?payload.total:null;
      offers=offers.concat(arr); offset+=arr.length;
      if(offset===arr.length){ buildChipsFromOffers(offers); smartRadius(); }
      render();
    }catch(e){ console.error(e); toast('Не удалось загрузить витрину'); }
    finally{ hideSkeleton(); loading=false; }
  }
  function smartRadius(){
    const g=geo.get(); if(!g) return;
    const withDist=offers.map(o=>({o,d:distanceFor(o,g)})).filter(x=>x.d!=null).sort((a,b)=>a.d-b.d);
    const N=withDist.length; if(N>=1 && state.radius===0){ const p90=withDist[Math.min(N-1,Math.floor(N*0.9))].d; state.radius=p90<=3?3:p90<=5?5:p90<=10?10:20; [...radiusChips.children].forEach(x=>x.classList.toggle('active',Number(x.dataset.r)===state.radius)); saveFilters(); }
  }
  const distanceFor=(o,g)=>{ const lat=o.lat??o.latitude??o.restaurant_lat??null; const lng=o.lng??o.longitude??o.restaurant_lng??null; if(lat==null||lng==null) return null; return haversineKm({lat:g.lat,lng:g.lng},{lat:Number(lat),lng:Number(lng)}); };

  function render(){
    const term=(state.q||"").toLowerCase(), g=geo.get();
    const list=offers
      .map(o=>({...o,__disc:discountPct(o.price_cents,o.original_price_cents),__dist:g?distanceFor(o,g):null}))
      .filter(o=>(!term||(o.title||"").toLowerCase().includes(term)))
      .filter(o=>state.cat==='all'||(String(o.category||'').toLowerCase()===state.cat))
      .filter(o=>state.radius===0||(o.__dist!=null&&o.__dist<=state.radius))
      .filter(o=>(o.qty_left??0)>0&&(!o.expires_at||new Date(o.expires_at).getTime()>Date.now()));

    list.sort((a,b)=>{
      const s=state.sort;
      if(s==='near'){ const ad=a.__dist??1e9, bd=b.__dist??1e9; return ad-bd; }
      if(s==='discount'){ return (b.__disc||0)-(a.__disc||0); }
      if(s==='cheap'){ return (a.price_cents||0)-(b.price_cents||0); }
      if(s==='expensive'){ return (b.price_cents||0)-(a.price_cents||0); }
      return new Date(a.expires_at||0)-new Date(b.expires_at||0);
    });

    grid.innerHTML='';
    if(!list.length){ grid.innerHTML=`<div class="card"><div class="p">Ничего не найдено. Попробуйте изменить фильтры.</div></div>`; return; }
    list.forEach(o=>{
      const el=document.createElement('div'); el.className='card';
      const disc=o.__disc, left=timeLeft(o.expires_at), km=(o.__dist!=null)?`~${o.__dist.toFixed(1)} км`:'';
      el.innerHTML=`
        ${o.image_url?`<img src="${o.image_url}" alt="">`:`<div style="height:140px;background:#0d1218"></div>`}
        <div class="p">
          <div class="price">
            ${money(o.price_cents)}
            ${disc?`<span class="badge">-${disc}%</span>`:''}
            ${left?`<span class="badge left">${left}</span>`:''}
            ${km?`<span class="badge left">${km}</span>`:''}
          </div>
          <div>${o.title||'—'}</div>
          <div class="meta"><span>Осталось: ${o.qty_left ?? '—'}</span>${o.category?`<span class="badge">${labelCat(o.category)}</span>`:''}</div>
        </div>`;
      el.onclick=()=>openOffer(o);
      grid.appendChild(el);
    });
  }

  // --- offer sheet ---
  function openOffer(o){
    currentOffer=o;
    $('#sTitle').textContent=o.title||'—';
    $('#sImg').src=o.image_url||'';
    $('#sPrice').textContent=money(o.price_cents);
    const old=(o.original_price_cents||0)/100; $('#sOld').textContent=old?(old.toFixed(0)+' ₽'):'—';
    $('#sQty').textContent=(o.qty_left??'—')+' / '+(o.qty_total??'—');
    $('#sExp').textContent=o.expires_at?new Date(o.expires_at).toLocaleString('ru-RU'):'—';
    $('#sLeft').textContent=timeLeft(o.expires_at)?('Осталось: '+timeLeft(o.expires_at)):'—';
    $('#sDesc').textContent=o.description||'';
    setModal('#sheet', true);
  }
  $('#sheetClose').onclick=()=>setModal('#sheet', false);

  // --- резервация ---
  const extractReservationCode = (data) => {
    if(!data||typeof data!=='object') return "";
    return data.code || data.reservation_code || data.qr_code ||
           (data.reservation && (data.reservation.code || data.reservation.qr_code)) ||
           (data.data && (data.data.code || data.data.qr_code)) || "";
  };
  const extractQrPayload = (data) => {
    if(!data||typeof data!=='object') return "";
    return data.qr_url || data.url || extractReservationCode(data) || "";
  };

  let reserveBusy=false;
  $('#reserveBtn').onclick = async (ev)=>{
    ev?.preventDefault?.();
    if(reserveBusy) return;
    const btn=ev?.currentTarget||$('#reserveBtn');
    const o=currentOffer, offer_id=o && (o.id ?? o.offer_id);
    if(!offer_id){ toast('Оффер не найден'); return; }

    try{
      reserveBusy=true; if(btn) btn.disabled=true;
      const resp=await fetch(API+'/api/v1/public/reserve',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({offer_id, name:'Гость', phone:''})});
      let data={}; try{ data=await resp.json(); }catch{}
      if(!resp.ok){
        const d=(data && (data.detail||data.error||data.message))||'';
        let msg='Не удалось забронировать';
        if(/offer not found/i.test(d)) msg='Оффер не найден';
        else if(/sold out/i.test(d)) msg='Остаток закончился';
        else if(/expired/i.test(d)) msg='Оффер истёк';
        toast(msg); return;
      }
      toast('Забронировано ✅');
      const it=offers.find(x=>(x.id??x.offer_id)===offer_id); if(it&&typeof it.qty_left==='number') it.qty_left=Math.max(0,it.qty_left-1);
      render(); setModal('#sheet', false);

      const payload=extractQrPayload(data);
      showQR(payload);
    }catch(e){ console.error(e); toast('Сеть недоступна'); }
    finally{ reserveBusy=false; if(btn) btn.disabled=false; }
  };

 // ——— Lazy-load qrcode либы и отрисовка с безопасным fallback ———
function loadQrLib() {
  return new Promise((resolve, reject) => {
    if (window.QRCode || (typeof QRCode !== 'undefined')) return resolve();
    // уже вставляли?
    if (document.getElementById('qr-lib')) {
      const check = () => (window.QRCode || (typeof QRCode !== 'undefined')) ? resolve() : setTimeout(check, 50);
      return check();
    }
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js';
    s.id = 'qr-lib';
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('QR lib load error'));
    document.head.appendChild(s);
  });
}

function drawQrToCanvas(canvas, text) {
  const QR = window.QRCode || (typeof QRCode !== 'undefined' ? QRCode : null);
  if (QR && canvas) {
    QR.toCanvas(canvas, text || 'NO_CODE', {
      width: 220,
      margin: 1,
      color: { dark: '#e8edf2', light: '#0000' } // светлые модули на тёмной модалке
    }, () => {});
    return true;
  }
  return false;
}

function drawTextFallback(canvas, text) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  // фон и рамка для контраста
  ctx.fillStyle = '#0f141c';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = '#242b35';
  ctx.strokeRect(0.5, 0.5, canvas.width-1, canvas.height-1);
  // крупный код по центру
  ctx.fillStyle = '#e8edf2';
  ctx.font = 'bold 28px Inter, system-ui, Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(text || '').trim() || '—', canvas.width/2, canvas.height/2);
}

// ОБНОВЛЁННАЯ showQR
async function showQR(text){
  const code = (text||'').toString().trim();
  // открываем модалку сперва — чтобы canvas точно был в DOM
  setModal('#qrModal', true);
  document.getElementById('qrCodeText').textContent = code || '—';

  const canvas = document.getElementById('qrCanvas');
  // ждём либу; если что-то не так — рисуем текстом
  try {
    await loadQrLib();
    if (!drawQrToCanvas(canvas, code)) drawTextFallback(canvas, code);
  } catch {
    drawTextFallback(canvas, code);
  }
}

  // --- geo / events / start (как было) ---
  geoBtn.onclick=async()=>{ try{ const pos=await new Promise((res,rej)=>navigator.geolocation.getCurrentPosition(res,rej,{enableHighAccuracy:true,timeout:10000})); const {latitude:lat,longitude:lng}=pos.coords; geo.set({lat,lng}); toast('Геопозиция сохранена'); smartRadius(); render(); }catch{ toast('Не удалось получить геопозицию'); } };
  search.oninput=()=>{ state.q=search.value||""; saveFilters(); render(); };
  window.addEventListener('scroll', ()=>{ const nearBottom=window.innerHeight+window.scrollY>=document.body.offsetHeight-320; if(nearBottom) loadBatch(); });
  document.addEventListener('DOMContentLoaded', ()=>{ loadFilters(); search.value=state.q||""; offers=[]; total=null; offset=0; loadBatch(); });
})();
