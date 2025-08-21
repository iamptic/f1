// buyer/app.js — табы категорий + компактные карточки + устойчивый QR + название ресторана
(() => {
  const $  = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
  const API = ((window.__FOODY__ && window.__FOODY__.FOODY_API) || window.foodyApi || '').replace(/\/+$/,'');

  // ---- Helpers
  const fmtMoney = n => (isFinite(+n) ? (Math.round(+n) + ' ₽') : '—');
  const safeNum  = v => { const n = Number(v); return isFinite(n) ? n : 0; };
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
  const telLink = (p) => {
    const d = String(p||'').replace(/[^\d+]/g,'');
    if (!d) return '#';
    return d.startsWith('+') ? `tel:${d}` : `tel:+${d}`;
  };
  const numOr = (v, def=1) => { const n = parseInt(String(v||'').trim(), 10); return isFinite(n)&&n>0 ? n : def; };

  // Адрес/телефон/название с учетом разных ключей
  const getAddr = (o) =>
    (o.restaurant_address || o.address || o.merchant_address || o?.merchant?.address || o?.restaurant?.address || '') + '';
  const getPhoneRaw = (o) =>
    (o.restaurant_phone || o.phone || o.merchant_phone || o?.merchant?.phone || o?.restaurant?.phone || o.contact_phone || '') + '';
  const getRestName = (o) =>
    (o.restaurant_name || o.merchant_name || o.name_restaurant || o?.restaurant?.name || o?.merchant?.name || '') + '';

  // ---- Категории (табы)
  const catMap = {
    'готовые блюда':'ready_meal','готовое':'ready_meal','горячее':'ready_meal',
    'выпечка':'bakery','хлеб':'bakery','булочки':'bakery',
    'роллы':'rolls','ролл':'rolls',
    'суши':'sushi','роллы и суши':'sushi',
    'салат':'salad','салаты':'salad',
    'десерт':'dessert','десерты':'dessert','сладкое':'dessert',
    'другое':'other','прочее':'other','проч.':'other','other':'other'
  };
  const normCat = (v) => { if(!v) return ''; const s=String(v).trim().toLowerCase(); return catMap[s] || s; };
  let __cat = '';   // выбранная вкладка

  // ---- State
  let __offers = [];

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
    const pct   = discount(old, price);
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

  function applyFilters(){
    let arr = [...__offers];
    if (__cat) arr = arr.filter(o => normCat(o.category || o.cat || 'other') === __cat);
    render(arr);
  }

  // ---- Modal + Reserve
  const modal = $('#offerModal');

  function openModal(o){
    const img = o.image_url || o.photo_url || '';
    $('#m_img').innerHTML = img ? `<img src="${img}" alt="">` : `<div class="ph" style="height:100%;display:grid;place-items:center;font-size:48px">🍱</div>`;
    $('#m_title').textContent = o.title || o.name || 'Без названия';
    $('#m_desc').textContent  = (o.description || o.desc || '').trim() || '';

    const price = (o.price_cents!=null ? o.price_cents/100 : (o.price ?? 0));
    const old   = (o.original_price_cents!=null ? o.original_price_cents/100 : (o.original_price ?? 0));
    const pct   = discount(old, price);
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
      if (inp){
        const cur = numOr(inp.value, 1);
        inp.value = Math.max(1, cur + (dir === '+1' ? 1 : -1));
      }
    }

    // клики по табам категорий
    const chip = e.target.closest('#catChips .chip');
    if (chip){
      __cat = chip.dataset.cat || '';
      $$('#catChips .chip').forEach(c => c.classList.toggle('active', c===chip));
      applyFilters();
    }
  });

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

function drawQR(text){
  const code = String(text || '');
  const wrap = document.getElementById('qr_wrap');
  const canvas = document.getElementById('qr_canvas');

  // 1) Готовим <img> перед канвасом (если его ещё нет)
  let img = document.getElementById('qr_img');
  if (!img) {
    img = document.createElement('img');
    img.id = 'qr_img';
    img.width = 240;
    img.height = 240;
    img.alt = 'QR';
    img.style.display = 'none';
    if (canvas && canvas.parentNode) {
      canvas.parentNode.insertBefore(img, canvas); // не меняем макет
    }
  }

  // 2) Пробуем серверный PNG
  const url = API + '/api/v1/public/qr/' + encodeURIComponent(code) + '.png';
  const test = new Image();
  test.decoding = 'async';
  test.onload = () => {
    img.src = test.src;
    img.style.display = '';
    if (canvas) canvas.style.display = 'none';
  };
  test.onerror = () => {
    // 3) Фолбэк: старый клиентский рендер в canvas
    if (canvas) {
      canvas.style.display = '';
      try {
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0,0,canvas.width,canvas.height);
      } catch(_){}
      if (window.QRCode && typeof window.QRCode.toCanvas === 'function') {
        window.QRCode.toCanvas(
          canvas,
          code,
          { errorCorrectionLevel:'M', margin:2, scale:6, color:{dark:'#000', light:'#fff'} },
          (err)=>{
            if (err) {
              try{
                const ctx = canvas.getContext('2d');
                ctx.fillStyle = '#000'; ctx.font = '14px monospace';
                ctx.fillText('QR недоступен', 70, 120);
              }catch(_){}
            }
          }
        );
      } else {
        try{
          const ctx = canvas.getContext('2d');
          ctx.fillStyle = '#000'; ctx.font = '14px monospace';
          ctx.fillText('QR недоступен', 70, 120);
        }catch(_){}
      }
    }
  };
  // cache-buster, чтобы не залипало
  test.src = url + '?t=' + Date.now();
}
