// buyer/app.js — фикс QR (скрытый canvas), фильтр табов, сортировка, ресторан в карточке
(() => {
  const $  = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
  const API = ((window.__FOODY__ && window.__FOODY__.FOODY_API) || window.foodyApi || '').replace(/\/+$/,'');

  // ---- Helpers
  const fmtMoney = n => (isFinite(+n) ? (Math.round(+n) + ' ₽') : '—');
  const safeNum  = v => { const n = Number(v); return isFinite(n) ? n : 0; };
  const discountPct = (old, now) => {
    const o = safeNum(old), p = safeNum(now);
    if (!(o>0 && p>0) || p>=o) return 0;
    return Math.round((1 - p/o) * 100);
  };
  const fmtDT = (x) => {
    if (!x) return '—';
    try { return new Date(x).toLocaleString('ru-RU', { dateStyle:'short', timeStyle:'short' }); }
    catch(_) { return '—'; }
  };
  const telLink = (p) => {
    const d = String(p||'').replace(/[^\d+]/g,'');
    if (!d) return '#';
    return d.startsWith('+') ? `tel:${d}` : `tel:+${d}`;
  };
  const numOr = (v, def=1) => { const n = parseInt(String(v||'').trim(), 10); return isFinite(n)&&n>0 ? n : def; };

  // Адрес/телефон/название (под разные ключи)
  const getAddr = (o) =>
    (o.restaurant_address || o.address || o.merchant_address || o?.merchant?.address || o?.restaurant?.address || '') + '';
  const getPhoneRaw = (o) =>
    (o.restaurant_phone || o.phone || o.merchant_phone || o?.merchant?.phone || o?.restaurant?.phone || o.contact_phone || '') + '';
  const getRestName = (o) =>
    (o.restaurant_name || o.merchant_name || o.name_restaurant || o?.restaurant?.name || o?.merchant?.name || '') + '';

  // ---- State
  let __offers = [];
  let __cat = '';                // активная категория
  let __sort = 'soon';           // активная сортировка

  // ---- Fetch
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

  // ---- Card
  function cardHTML(o){
    const id    = o.id ?? o.offer_id ?? o._id ?? '';
    const img   = o.image_url || o.photo_url || '';
    const title = o.title || o.name || 'Без названия';
    const desc  = (o.description || o.desc || '').trim();
    const price = (o.price_cents!=null ? o.price_cents/100 : (o.price ?? 0));
    const old   = (o.original_price_cents!=null ? o.original_price_cents/100 : (o.original_price ?? 0));
    const pct   = discountPct(old, price);
    const until = fmtDT(o.expires_at || o.expires || o.until);
    const qty   = o.qty_left ?? o.qty ?? o.quantity ?? o.qty_total ?? 0;

    const addr  = getAddr(o);
    const phone = getPhoneRaw(o);
    const rname = getRestName(o);

    return `
      <div class="offer-card" data-id="${id}">
        <div class="offer-card__img">
          ${img ? `<img src="${img}" alt="">` : `<div class="ph">🍱</div>`}
        </div>
        <div class="offer-card__body">
          <div class="offer-card__title" title="${title}">${title}</div>
          ${rname ? `<div class="offer-card__rest">🏪 ${rname}</div>` : ''}
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

  // ---- Filter + Sort
  const norm = (v) => String(v||'').trim().toLowerCase();
  function filtered(){
    let arr = [...__offers];
    if (__cat) {
      arr = arr.filter(o => norm(o.category) === norm(__cat));
    }
    // sort
    arr.sort((a, b) => {
      const aPrice = (a.price_cents!=null ? a.price_cents/100 : (a.price ?? 0));
      const bPrice = (b.price_cents!=null ? b.price_cents/100 : (b.price ?? 0));
      const aOld   = (a.original_price_cents!=null ? a.original_price_cents/100 : (a.original_price ?? 0));
      const bOld   = (b.original_price_cents!=null ? b.original_price_cents/100 : (b.original_price ?? 0));
      const aPct   = discountPct(aOld, aPrice);
      const bPct   = discountPct(bOld, bPrice);
      const aExp   = a.expires_at || a.expires || a.until || '';
      const bExp   = b.expires_at || b.expires || b.until || '';
      const ad = aExp ? +new Date(aExp) : Infinity;
      const bd = bExp ? +new Date(bExp) : Infinity;

      switch (__sort){
        case 'discount':   return (bPct - aPct) || (aPrice - bPrice);
        case 'price_asc':  return (aPrice - bPrice);
        case 'price_desc': return (bPrice - aPrice);
        case 'soon':
        default:           return (ad - bd);
      }
    });
    return arr;
  }
  function rerender(){ render(filtered()); }

  // клики по чипсам категорий
  document.addEventListener('click', (e)=>{
    const chip = e.target.closest('#catChips .chip');
    if (chip){
      __cat = chip.dataset.cat || '';
      $$('#catChips .chip').forEach(c => c.classList.toggle('active', c===chip));
      rerender();
    }
    const openBtn = e.target.closest('[data-open]');
    if (openBtn){
      const id = openBtn.getAttribute('data-open');
      const item = __offers.find(x => String(x.id ?? x.offer_id ?? '') === String(id));
      if (item) openModal(item);
    }
    if (e.target.matches('[data-close]')) closeModal();

    const qbtn = e.target.closest('.qbtn');
    if (qbtn){
      const dir = qbtn.getAttribute('data-qty');
      const inp = $('#m_qty');
      if (inp){
        const cur = numOr(inp.value, 1);
        inp.value = Math.max(1, cur + (dir === '+1' ? 1 : -1));
      }
    }
  });

  // сортировка
  $('#sort')?.addEventListener('change', (e)=>{ __sort = e.target.value || 'soon'; rerender(); });

  // Маска телефона (простая RU)
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

  // ---- QR: рисуем только когда блок уже показан
  function drawQR(text){
    const canvas = document.getElementById('qr_canvas');
    if (!canvas) return;

    // белая подложка (без «черного квадрата»)
    try {
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0,0,canvas.width,canvas.height);
    } catch(_){}

    const fallback = () => {
      try {
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#000';
        ctx.font = '14px monospace';
        ctx.fillText('QR недоступен', 70, 120);
      } catch(_){}
    };

    let tries = 0;
    (function waitAndDraw(){
      if (window.QRCode && typeof window.QRCode.toCanvas === 'function') {
        try {
          window.QRCode.toCanvas(
            canvas,
            String(text),
            { errorCorrectionLevel:'M', margin:2, scale:6, color:{ dark:'#000000', light:'#ffffff' } },
            (err)=>{ if (err) fallback(); }
          );
        } catch(_) { fallback(); }
        return;
      }
      if (++tries <= 30) return setTimeout(waitAndDraw, 50); // ждём библиотеку до ~1.5с
      fallback();
    })();
  }

  // Reserve → QR (сначала показать блок, затем rAF, затем рисовать)
  async function reserve(){
    const modal = $('#offerModal');
    const id = modal.dataset.offerId;
    if (!id) return;

    const qty = Math.max(1, parseInt($('#m_qty')?.value || '1',10));
    const phoneDigits = ( $('#m_user_phone')?.value || '' ).replace(/\D+/g,'');
    const err = $('#m_err');
    if (err) err.style.display='none';

    if (phoneDigits.length < 11){
      if (err){ err.textContent = 'Введите телефон в формате +7 900 000 00 00'; err.style.display='block'; }
      return;
    }

    const payloads = [
      { offer_id: id, qty, phone: phoneDigits },
      { offerId: id, qty, phone: phoneDigits },
      { id, qty, phone: phoneDigits }
    ];
    const endpoints = [
      '/api/v1/public/reservations',
      '/api/v1/reservations/public',
      '/api/v1/reservations',
      '/api/v1/public/reserve'     // наш основной
    ];

    let data=null, lastErr=null;
    outer: for (const p of endpoints){
      for (const payload of payloads){
        try{
          const r = await fetch(API + p, {
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body: JSON.stringify(payload)
          });
          const ct = r.headers.get('content-type')||'';
          const j = ct.includes('application/json') ? await r.json() : await r.text();
          if (!r.ok) throw new Error((j && (j.detail||j.message)) || (r.status+' '+r.statusText));
          data = j; break outer;
        }catch(e){ lastErr=e; }
      }
    }

    if (!data){
      const msg = lastErr?.message || String(lastErr) || 'Не удалось создать бронь';
      if (err){ err.textContent = /not\s*found/i.test(msg) ? 'Оффер не найден или истёк. Обновите страницу.' : msg; err.style.display='block'; }
      return;
    }

    const code = data.code || data.reservation_code || data.id || data.qr || '';
    if (!code){
      if (err){ err.textContent = 'Сервер не вернул код брони'; err.style.display='block'; }
      return;
    }

    if ($('#qr_code_text')) $('#qr_code_text').textContent = code;
    if ($('#qr_wrap')) { $('#qr_wrap').style.display = ''; await new Promise(requestAnimationFrame); }
    drawQR(code);
  }

  $('#m_reserve')?.addEventListener('click', reserve);

  // ---- Modal
  const modal = $('#offerModal');

  function openModal(o){
    const img = o.image_url || o.photo_url || '';
    $('#m_img').innerHTML = img ? `<img src="${img}" alt="">` : `<div class="ph" style="height:100%;display:grid;place-items:center;font-size:48px">🍱</div>`;
    $('#m_title').textContent = o.title || o.name || 'Без названия';
    $('#m_desc').textContent  = (o.description || o.desc || '').trim() || '';

    const price = (o.price_cents!=null ? o.price_cents/100 : (o.price ?? 0));
    const old   = (o.original_price_cents!=null ? o.original_price_cents/100 : (o.original_price ?? 0));
    const pct   = discountPct(old, price);
    $('#m_price_now').textContent = fmtMoney(price);
    const mOld = $('#m_price_old');
    if (old) { mOld.style.display=''; mOld.textContent = fmtMoney(old); } else { mOld.style.display='none'; }
    const mBadge = $('#m_badge');
    if (pct) { mBadge.style.display=''; mBadge.textContent = `-${pct}%`; } else { mBadge.style.display='none'; }

    const addr = getAddr(o);
    const phone = getPhoneRaw(o);
    const rname = getRestName(o);
    if ($('#m_rest'))  $('#m_rest').textContent  = rname || '—';
    if ($('#m_addr'))  $('#m_addr').textContent  = addr  || '—';
    if ($('#m_phone')) {
      const mPhone = $('#m_phone');
      mPhone.textContent = phone || '—';
      mPhone.href = phone ? telLink(phone) : '#';
    }

    const until = fmtDT(o.expires_at || o.expires || o.until);
    if ($('#m_until')) {
      $('#m_until').textContent = until;
      if ($('#m_until_wrap')) $('#m_until_wrap').style.display = until ? '' : 'none';
    }

    const left = o.qty_left ?? o.qty ?? o.quantity ?? o.qty_total ?? 0;
    if ($('#m_left')) $('#m_left').textContent = left ? `(доступно: ${left})` : '';
    if ($('#m_qty'))  $('#m_qty').value = 1;

    if ($('#m_err')) $('#m_err').style.display = 'none';
    if ($('#qr_wrap')) $('#qr_wrap').style.display = 'none';

    modal.setAttribute('aria-hidden','false');
    modal.dataset.offerId = o.id ?? o.offer_id ?? '';
  }
  function closeModal(){ modal.setAttribute('aria-hidden','true'); }
  document.addEventListener('keydown', (e)=>{ if (e.key==='Escape') closeModal(); });

  // ---- Init
  async function init(){
    try {
      __offers = await getOffers();
      rerender();
    } catch(e) {
      const host = $('#offers');
      if (host) host.innerHTML = `<div class="card" style="padding:16px">Ошибка загрузки: ${(e?.message||e)}</div>`;
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
