/* === ВЕСЬ ТВОЙ ТЕКУЩИЙ app.js (как у тебя в проекте) — оставляем без изменений выше === */
/* ……………………………… (содержимое твоего файла) ……………………………… */


/* =========================================================
   BUYER: Бронь + QR-код (устойчивый к разным эндпоинтам/ответам)
   ========================================================= */
(function(){
  const $ = (s, r=document) => r.querySelector(s);

  // База API из config.js / window.__FOODY__ / window.foodyApi
  function foodyBase(){
    try { return (window.__FOODY__ && window.__FOODY__.FOODY_API) || window.foodyApi || 'https://foodyback-production.up.railway.app'; }
    catch(_) { return 'https://foodyback-production.up.railway.app'; }
  }
  function joinApi(path){
    const base = foodyBase();
    if (/^https?:\/\//i.test(path)) return path;
    return base.replace(/\/+$/,'') + path;
  }

  // Достаём текст ошибки из ответа (json/text)
  async function extractError(res){
    try{
      const ct = res.headers.get('content-type') || '';
      if (ct.includes('application/json')){
        const j = await res.json().catch(()=>null);
        if (j && (j.detail || j.message)) return j.detail || j.message;
      } else {
        const t = await res.text().catch(()=> '');
        if (t) return t.slice(0, 200);
      }
    }catch(_){}
    return res.status + ' ' + res.statusText;
  }

  // Универсальный POST без авторизации (покупатель)
  async function post(u, body){
    const res = await fetch(u, {
      method: 'POST',
      headers: { 'Content-Type':'application/json' },
      body: JSON.stringify(body||{})
    });
    if (!res.ok){ throw new Error(await extractError(res)); }
    const ct = res.headers.get('content-type') || '';
    return ct.includes('application/json') ? (await res.json().catch(()=>({}))) : (await res.text());
  }

  // Создание брони: пробуем несколько путей и форматов
  async function createReservation(offerId){
    const body = { offer_id: Number(offerId)||offerId };
    const tries = [
      () => post(joinApi('/api/v1/public/reservations'), body),
      () => post(joinApi('/api/v1/reservations'), body),
      () => post(joinApi('/api/v1/public/reserve'), body),
      () => post(joinApi('/api/v1/reserve'), body),
      // fallback c querystring
      () => post(joinApi('/api/v1/reservations?offer_id=' + encodeURIComponent(offerId)), {}),
      () => post(joinApi('/api/v1/public/reservations?offer_id=' + encodeURIComponent(offerId)), {}),
      () => post(joinApi('/api/v1/reserve?offer_id=' + encodeURIComponent(offerId)), {}),
      () => post(joinApi('/api/v1/public/reserve?offer_id=' + encodeURIComponent(offerId)), {}),
    ];
    let lastErr = null;
    for (const t of tries){
      try { const r = await t(); return r; } catch(e){ lastErr = e; }
    }
    throw lastErr || new Error('Не удалось создать бронь');
  }

  // Извлекаем код из разных форматов ответа
  function pickReservationCode(data){
    if (!data) return '';
    if (typeof data === 'string') return data;
    if (data.code) return data.code;
    if (data.reservation_code) return data.reservation_code;
    if (data.reservation?.code) return data.reservation.code;
    if (data.data?.code) return data.data.code;
    if (data.id) return String(data.id);
    return '';
  }

  // Показ модалки с QR
  function showQrModal(code){
    const modal = $('#qrModal');
    const canvas = $('#qrCanvas');
    const textEl = $('#qrCodeText');
    if (!modal || !canvas || !textEl){
      alert('Бронь оформлена. Код: ' + code);
      return;
    }
    textEl.textContent = code || '—';
    try {
      // Библиотека подключена в index.html: https://cdn.jsdelivr.net/npm/qrcode…
      // Рисуем QR (данные — сам код; при желании можно зашить JSON)
      const payload = String(code||'').trim() || '—';
      window.QRCode.toCanvas(canvas, payload, { width: 220, margin: 1 }, function(err){
        if (err) { console.warn('QR draw error', err); }
      });
    } catch(e){ console.warn('QR lib error', e); }
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden','false');
  }

  function hideQrModal(){
    const modal = $('#qrModal');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden','true');
  }

  // Берём offer_id из sheet / последнего клика
  function getCurrentOfferId(){
    const sheet = $('#sheet');
    const fromSheet = sheet?.dataset?.offerId || sheet?.getAttribute?.('data-offer-id');
    const last = window.__currentOfferId;
    return fromSheet || last || '';
  }

  // Обработчик «Забронировать»
  async function onReserveClick(e){
    e.preventDefault();
    const btn = e.currentTarget;
    const offerId = getCurrentOfferId();
    if (!offerId){
      try { (window.showToast||alert)('Не удаётся определить оффер для брони'); } catch(_){ alert('Не удаётся определить оффер для брони'); }
      return;
    }
    const oldText = btn.textContent;
    btn.disabled = true; btn.textContent = 'Оформляем…';
    try{
      const res = await createReservation(offerId);
      const code = pickReservationCode(res);
      if (!code) throw new Error('Сервер не вернул код брони');
      showQrModal(code);
    } catch(err){
      const msg = String(err?.message||err||'Ошибка бронирования');
      try { (window.showToast||alert)(msg); } catch(_){ alert(msg); }
    } finally {
      btn.disabled = false; btn.textContent = oldText;
    }
  }

  // Пробуем сохранять текущий offer_id при кликах по карточкам/гридy
  function wireCardClicks(){
    document.addEventListener('click', (ev)=>{
      const card = ev.target.closest('[data-offer-id],[data-id]');
      if (!card) return;
      const id = card.dataset.offerId || card.dataset.id;
      if (!id) return;
      window.__currentOfferId = id;
      const sheet = $('#sheet');
      if (sheet) sheet.dataset.offerId = id;
    }, true);
  }

  // Отслеживаем открытие нижнего листа (sheet) — вдруг атрибут уже ставится где-то в коде
  function observeSheet(){
    const sheet = $('#sheet');
    if (!sheet) return;
    const obs = new MutationObserver(()=>{
      const hidden = sheet.classList.contains('hidden') || sheet.getAttribute('aria-hidden') === 'true';
      if (!hidden){
        const id = sheet.dataset.offerId || sheet.getAttribute('data-offer-id');
        if (id) window.__currentOfferId = id;
      }
    });
    obs.observe(sheet, { attributes:true, attributeFilter:['class','style','aria-hidden','data-offer-id'] });
  }

  // Кнопки закрытия модалки
  function wireQrModalControls(){
    const ok = $('#qrOk'); if (ok && !ok.dataset.bound){ ok.dataset.bound='1'; ok.addEventListener('click', hideQrModal); }
    const x = $('#qrClose'); if (x && !x.dataset.bound){ x.dataset.bound='1'; x.addEventListener('click', hideQrModal); }
  }

  // Инициализация
  function init(){
    const r = $('#reserveBtn');
    if (r && !r.dataset.bound){ r.dataset.bound='1'; r.addEventListener('click', onReserveClick); }
    wireQrModalControls();
    wireCardClicks();
    observeSheet();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
