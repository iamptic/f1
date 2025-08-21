// buyer/app.js — vitrine patch r2 (address/phone mapping + robust reservation)
(() => {
  const $ = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
  const API = ((window.__FOODY__ && window.__FOODY__.FOODY_API) || window.foodyApi || '').replace(/\/+$/,'');
  const toastBox = $('#toast');
  const toast = (t)=>{ const el=document.createElement('div');el.className='toast';el.textContent=t;toastBox.appendChild(el);setTimeout(()=>el.remove(),2500); };

  // ---- Helpers
  const fmtMoney = n => (isFinite(+n) ? (Math.round(+n) + ' ₽') : '—');
  const safeNum = v => { const n = Number(v); return isFinite(n) ? n : 0; };
  const discount = (old, now) => {
    const o = safeNum(old), p = safeNum(now);
    if (!(o>0 && p>0) || p>=o) return 0;
    return Math.round((1 - p/o) * 100);
  };
  const fmtDT = (x) => {
    if (!x) return '—';
    try { return new Date(x).toLocaleString('ru-RU', { dateStyle:'short', timeStyle:'short' }); }
    catch(_) { return '—'; }
  };

  // ---- Address / phone resolvers (расширенные)
  function getAddr(o){
    // top-level
    const top = (o.restaurant_address || o.address || o.merchant_address || o.vendor_address || '').trim();
    if (top) return top;
    // nested
    const r = o.restaurant || o.merchant || o.vendor || o.place || o.shop || {};
    return (r.address || r.addr || r.location || '').trim();
  }
  function getPhoneRaw(o){
    // top-level
    const top = (o.restaurant_phone || o.merchant_phone || o.vendor_phone || o.phone || o.contact_phone || '').toString().trim();
    if (top) return top;
    // nested
    const r = o.restaurant || o.merchant || o.vendor || o.place || o.shop || {};
    return (r.phone || r.contact_phone || r.tel || '').toString().trim();
  }
  const telLink = (p) => {
    const d = (p||'').replace(/[^\d+]/g,'');
    if (!d) return '#';
    return d.startsWith('+') ? `tel:${d}` : `tel:+${d}`;
  };
  const numOr = (v, def=1) => { const n = parseInt(String(v||'').trim(), 10); return isFinite(n)&&n>0 ? n : def; };

  // ---- State
  let __offers = [];

  // ---- Fetch & render
  async function getOffers(){
    const endpoints = [
      '/api/v1/public/offers',
      '/api/v1/offers/public',
      '/api/v1/offers'
    ];
    let lastErr = null;
    for (const p of endpoints){
      try {
        const res = await fetch(API + p, { headers:{'Accept':'application/json'} });
        const ct = res.headers.get('content-type')||'';
        const data = ct.includes('application/json') ? await res.json() : await res.text();
        if (!res.ok) throw new Error((data && (data.detail||data.message)) || (res.status+' '+res.statusText));
        const list = Array.isArray(data) ? data : (data.items || data.results || []);
        return list || [];
      } catch(e){ lastErr = e; }
    }
    throw lastErr || new Error('Не удалось загрузить офферы');
  }

  function cardHTML(o){
    const id = o.id ?? o.offer_id ?? o._id ?? '';
    const img = o.image_url || o.photo_url || '';
    const title = o.title || o.name || 'Без названия';
    const desc = (o.description || o.desc || '').trim();
    const price = (o.price_cents!=null ? o.price_cents/100 : (o.price ?? 0));
    const old   = (o.original_price_cents!=null ? o.original_price_cents/100 : (o.original_price ?? 0));
    const pct   = discount(old, price);
    const until = fmtDT(o.expires_at || o.expires || o.until);
    const qty   = o.qty_left ?? o.qty ?? o.quantity ?? o.qty_total ?? 0;

    const addr  = getAddr(o);
    const phone = getPhoneRaw(o);

    return `
      <div class="offer-card" data-id="${id}">
        <div class="offer-card__img">
          ${img ? `<img src="${img}" alt="">` : `<div class="ph">🍱</div>`}
        </div>
        <div class="offer-card__body">
          <div class="offer-card__title" title="${title}">${title}</div>
          ${desc ? `<div class="offer-card__desc">${desc}</div>` : ''}

          <div class="price">
            <span class="now">${fmtMoney(price)}</span>
            ${old ? `<span class="old">${fmtMoney(old)}</span>` : ''}
            ${pct ? `<span class="badge">-${pct}%</span>` : ''}
          </div>

          <div class="meta">
            ${addr ? `<div class="contact-line" title="${addr}"><span class="ico">📍</span><span>${addr}</span></div>` : ''}
            ${phone ? `<div class="contact-line"><span class="ico">📞</span><a href="${telLink(phone)}">${phone}</a></div>` : ''}
            <div class="contact-line"><span class="ico">⏳</span><span>До: ${until}</span></div>
            <div class="contact-line"><span class="ico">🧮</span><span>Остаток: ${qty}</span></div>
          </div>

          <button class="btn btn-primary" data-open="${id}">Купить со скидкой</button>
        </div>
      </div>
    `;
  }

  function render(list){
    const host = $('#offers');
    if (!list?.length){
      host.innerHTML = `<div class="card" style="padding:16px">Офферов пока нет</div>`;
      return;
    }
    host.innerHTML = list.map(cardHTML).join('');
  }

  // ---- Sorting / Filtering
  function applyFilters(){
    const cat = $('#category')?.value || '';
    const sort = $('#sort')?.value || 'soon';
    let arr = [...__offers];
    if (cat) arr = arr.filter(o => (o.category || o.cat || 'other') === cat);

    const priceOf = o => (o.price_cents!=null ? o.price_cents/100 : (o.price ?? 0));
    const oldOf   = o => (o.original_price_cents!=null ? o.original_price_cents/100 : (o.original_price ?? 0));
    const pctOf   = o => discount(oldOf(o), priceOf(o));
    const dtOf    = o => {
      const s = o.expires_at || o.expires || o.until;
      const d = s ? new Date(s) : null;
      return d ? +d : Infinity;
    };

    if (sort === 'discount') arr.sort((a,b)=> pctOf(b)-pctOf(a));
    else if (sort === 'price_asc') arr.sort((a,b)=> priceOf(a)-priceOf(b));
    else if (sort === 'price_desc') arr.sort((a,b)=> priceOf(b)-priceOf(a));
    else arr.sort((a,b)=> dtOf(a)-dtOf(b)); // soon

    render(arr);
  }

  // ---- Modal + Reserve
  const modal = $('#offerModal');
  function openModal(o){
    // image
    const img = o.image_url || o.photo_url || '';
    $('#m_img').innerHTML = img ? `<img src="${img}" alt="">` : `<div class="ph" style="height:100%;display:grid;place-items:center;font-size:48px">🍱</div>`;
    // text
    $('#m_title').textContent = o.title || o.name || 'Без названия';
    const desc = (o.description || o.desc || '').trim();
    $('#m_desc').textContent = desc || '';

    const price = (o.price_cents!=null ? o.price_cents/100 : (o.price ?? 0));
    const old   = (o.original_price_cents!=null ? o.original_price_cents/100 : (o.original_price ?? 0));
    const pct   = discount(old, price);
    $('#m_price_now').textContent = fmtMoney(price);
    const mOld = $('#m_price_old');
    if (old) { mOld.style.display=''; mOld.textContent = fmtMoney(old); } else { mOld.style.display='none'; }
    const mBadge = $('#m_badge');
    if (pct) { mBadge.style.display=''; mBadge.textContent = `-${pct}%`; } else { mBadge.style.display='none'; }

    const addr = getAddr(o); const phone = getPhoneRaw(o);
    $('#m_addr').textContent = addr || '—';
    const mPhone = $('#m_phone');
    mPhone.textContent = phone || '—';
    mPhone.href = phone ? telLink(phone) : '#';

    const until = fmtDT(o.expires_at || o.expires || o.until);
    $('#m_until').textContent = until;
    $('#m_until_wrap').style.display = until ? '' : 'none';

    const left = o.qty_left ?? o.qty ?? o.quantity ?? o.qty_total ?? 0;
    $('#m_left').textContent = left ? `(доступно: ${left})` : '';
    $('#m_qty').value = 1;

    $('#m_err').style.display = 'none';
    $('#qr_wrap').style.display = 'none';

    modal.setAttribute('aria-hidden','false');
    modal.dataset.offerId = o.id ?? o.offer_id ?? '';
  }
  function closeModal(){ modal.setAttribute('aria-hidden','true'); }

  document.addEventListener('click', (e)=>{
    const btn = e.target.closest('[data-open]');
    if (btn){
      const id = btn.getAttribute('data-open');
      const item = __offers.find(x => String(x.id ?? x.offer_id ?? '') === String(id));
      if (item) openModal(item);
    }
    if (e.target.matches('[data-close]')) closeModal();

    const qbtn = e.target.closest('.qbtn');
    if (qbtn){
      const dir = qbtn.getAttribute('data-qty');
      const inp = $('#m_qty');
      const cur = numOr(inp.value, 1);
      const next = Math.max(1, cur + (dir === '+1' ? 1 : -1));
      inp.value = next;
    }
  });

  // Phone mask
  function formatRuPhone(d){
    if (!d) return '+7 ';
    if (d[0]==='8') d='7'+d.slice(1);
    if (d[0]==='9') d='7'+d;
    if (d[0]!=='7') d='7'+d;
    d = d.replace(/\D+/g,'').slice(0,11);
    const r = d.slice(1);
    let out = '+7 ';
    if (r.length>0) out+=r.slice(0,3);
    if (r.length>3) out+=' '+r.slice(3,6);
    if (r.length>6) out+=' '+r.slice(6,8);
    if (r.length>8) out+=' '+r.slice(8,10);
    return out;
  }
  const phoneInput = $('#m_user_phone');
  if (phoneInput){
    const h=()=>{ const d=(phoneInput.value||'').replace(/\D+/g,''); phoneInput.value = formatRuPhone(d); };
    phoneInput.addEventListener('input',h); phoneInput.addEventListener('blur',h); h();
  }

  // Reserve → QR (расширенные эндпоинты + алиасы)
  async function reserve(){
    const id = modal.dataset.offerId;
    if (!id) return;
    const qty = Math.max(1, parseInt($('#m_qty').value||'1',10));
    const phoneDigits = ( $('#m_user_phone').value || '' ).replace(/\D+/g,'');
    const err = $('#m_err');
    err.style.display='none';

    if (phoneDigits.length < 11){
      err.textContent = 'Введите телефон в формате +7 900 000 00 00';
      err.style.display='block';
      return;
    }

    const basePayload = { offer_id: id, qty, phone: phoneDigits };
    const altPayloads = [
      basePayload,
      { offerId: id, qty, phone: phoneDigits },
      { offer_id: id, quantity: qty, phone: phoneDigits },
      { id, qty, phone: phoneDigits }
    ];

    const endpoints = [
      '/api/v1/public/reservations',
      '/api/v1/reservations/public',
      '/api/v1/reservations',
      `/api/v1/public/offers/${encodeURIComponent(id)}/reserve`,
      '/api/v1/public/reservations/create',
      '/api/v1/public/booking'
    ];

    let data=null, lastErr=null;
    outer: for (const p of endpoints){
      for (const payload of altPayloads){
        try{
          const r = await fetch(API + p, {
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body: JSON.stringify(payload)
          });
          const ct = r.headers.get('content-type')||'';
          const j = ct.includes('application/json') ? await r.json() : await r.text();
          if (!r.ok) {
            const msg = (j && (j.detail||j.message)) || (r.status+' '+r.statusText);
            throw new Error(msg);
          }
          data = j; break outer;
        }catch(e){ lastErr=e; }
      }
    }

    if (!data){
      const msg = String(lastErr?.message || 'Не удалось создать бронь');
      err.textContent = /not\s*found/i.test(msg) ? 'Оффер не найден или истёк. Обновите страницу.' : msg;
      err.style.display='block';
      return;
    }

    const code = data.code || data.reservation_code || data.id || data.qr || '';
    if (!code){
      err.textContent = 'Сервер не вернул код брони';
      err.style.display='block';
      return;
    }
    drawQR(code);
    $('#qr_code_text').textContent = code;
    $('#qr_wrap').style.display = '';
    toast('Бронь создана. Показан QR-код.');
  }

  $('#m_reserve')?.addEventListener('click', reserve);

  // Надежная отрисовка QR (белая подложка + fallback)
  function drawQR(text){
    const canvas = $('#qr_canvas');
    if (!canvas) return;

    try {
      const ctx = canvas.getContext('2d', { willReadFrequently:false, desynchronized:true });
      ctx.save();
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0,0,canvas.width,canvas.height);
      ctx.restore();
    } catch(_){}

    if (window.QRCode && typeof window.QRCode.toCanvas === 'function'){
      window.QRCode.toCanvas(canvas, String(text), {
        errorCorrectionLevel:'M',
        margin: 2,
        scale: 6,
        color: { dark:'#000000', light:'#ffffff' }
      }, (err)=>{
        if (err) {
          try {
            const url = canvas.toDataURL('image/png');
            const img = new Image();
            img.src = url;
            const wrap = canvas.parentElement;
            if (wrap) { wrap.replaceChild(img, canvas); img.width=240; img.height=240; }
          } catch(_){}
        }
      });
    } else {
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#000';
      ctx.font = '14px monospace';
      ctx.fillText('QR недоступен', 50, 120);
    }
  }

  // Init
  async function init(){
    try {
      __offers = await getOffers();
      applyFilters();
    } catch(e) {
      $('#offers').innerHTML = `<div class="card" style="padding:16px">Ошибка загрузки: ${(e.message||e)}</div>`;
    }
  }

  document.addEventListener('change', (e)=>{
    if (e.target.id === 'category' || e.target.id === 'sort') applyFilters();
  });
  document.addEventListener('keydown', (e)=>{ if (e.key==='Escape') closeModal(); });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
