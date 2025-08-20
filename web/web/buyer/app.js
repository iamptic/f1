(() => {
  const API = (window.FOODY_API || 'https://foodyback-production.up.railway.app').replace(/\/+$/,'');
  const $  = (s,r=document)=>r.querySelector(s);
  const $$ = (s,r=document)=>Array.from(r.querySelectorAll(s));

  /* ---------- Toast ---------- */
  function toast(msg){
    const box = $('#toast') || document.body.appendChild(Object.assign(document.createElement('div'),{id:'toast'}));
    const n = document.createElement('div'); n.className='toast'; n.textContent = msg;
    box.appendChild(n); setTimeout(()=>n.remove(), 2800);
  }

  /* ---------- Modal helpers ---------- */
  const modal = $('#reserveModal');
  let qrTimer = null;

  function openModal(){
    if(!modal) return;
    modal.setAttribute('aria-hidden','false');
    // фокус на кнопку «Готово» — доступность
    const btn = modal.querySelector('[data-modal-close]');
    if (btn) setTimeout(()=>btn.focus({preventScroll:true}), 50);
    // Esc
    window.addEventListener('keydown', escClose, { once:true });
  }
  function escClose(e){ if(e.key === 'Escape') closeModal(); }
  function closeModal(){
    if(!modal) return;
    modal.setAttribute('aria-hidden','true');
    // очистим QR canvas и таймеры
    try{ if(qrTimer) { clearInterval(qrTimer); qrTimer=null; } }catch(_){}
    const ctx = $('#qrCanvas')?.getContext('2d');
    if (ctx){
      ctx.clearRect(0,0,ctx.canvas.width, ctx.canvas.height);
      ctx.fillStyle = '#0a1220';
      ctx.fillRect(0,0,ctx.canvas.width, ctx.canvas.height);
    }
  }
  // делегирование на все элементы закрытия
  document.addEventListener('click', (e)=>{
    if (e.target.closest('[data-modal-close]')) { closeModal(); }
  });

  /* ---------- Simple QR (без внешних библиотек) ---------- 
     Это не «умный» генератор, но для коротких кодов резервов (A-Z0-9, 6-10 симв.)
     рисует читабельный квадратный код (псевдо‑QR по шаблону). Если хотите true-QR —
     можно подключить qrcode.js, но этот лёгкий вариант работает оффлайн. */
  function drawPseudoQR(text){
    const cv = $('#qrCanvas'); if(!cv) return;
    const ctx = cv.getContext('2d');
    const W = cv.width, H = cv.height;
    ctx.fillStyle = '#0a1220'; ctx.fillRect(0,0,W,H);
    // рамка
    ctx.strokeStyle = '#0a1b2e'; ctx.lineWidth = 6; ctx.strokeRect(6,6,W-12,H-12);
    // seed из строки
    let s = 0; for (let i=0;i<text.length;i++) s = (s*31 + text.charCodeAt(i)) >>> 0;
    // сетка 25x25
    const N = 25, cell = Math.floor((W-24)/N);
    const ox = Math.floor((W - cell*N)/2), oy = Math.floor((H - cell*N)/2);
    for(let y=0;y<N;y++){
      for(let x=0;x<N;x++){
        // «углы» как якоря
        const inFinder =
          (x<5 && y<5) || (x>N-6 && y<5) || (x<5 && y>N-6);
        let on;
        if (inFinder){
          on = (x===0||y===0||x===4||y===4) || (x>1&&x<4&&y>1&&y<4);
        } else {
          s ^= (x+1)*(y+3) + (x<<y) + (y<<x);
          on = ((s>>((x+y)%13)) & 1) === 1;
        }
        ctx.fillStyle = on ? '#eef6ff' : '#0a1220';
        ctx.fillRect(ox+x*cell, oy+y*cell, cell-1, cell-1);
      }
    }
  }

  /* ---------- Резервирование оффера ---------- */
  async function reserveOffer(offerId){
    try{
      const res = await fetch(`${API}/api/v1/reservations`, {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ offer_id: offerId })
      });
      const ct = res.headers.get('content-type')||'';
      const data = ct.includes('application/json') ? await res.json() : {};
      if(!res.ok) throw new Error(data?.detail || `Ошибка ${res.status}`);
      // ожидаем code/id
      const code = data.code || data.id || data.reservation_code;
      if (!code){ toast('Бронь создана, но код не получен'); return; }

      // заполним модалку и откроем
      $('#reserveCode').textContent = code;
      drawPseudoQR(String(code).trim());
      openModal();
      toast('Оффер забронирован ✓');
    } catch(e){
      toast(String(e.message||e) || 'Не удалось забронировать');
    }
  }

  /* ---------- Пример биндинга на кнопки карточек ---------- */
  document.addEventListener('click', (e)=>{
    const btn = e.target.closest('[data-reserve-id]');
    if(!btn) return;
    const id = btn.getAttribute('data-reserve-id');
    if (id) reserveOffer(id);
  });

  /* ---------- (опционально) демо-отрисовка карточек, уберите у себя ---------- */
  function demoCard(id,title,price,old){
    const el = document.createElement('div');
    el.className='card';
    el.innerHTML = `
      <div class="card__title">${title}</div>
      <div class="card__prices"><b>${price} ₽</b> &nbsp;<span class="old">${old} ₽</span></div>
      <div class="card__actions">
        <button class="btn btn-primary" data-reserve-id="${id}">Забронировать</button>
      </div>`;
    return el;
  }
  const offersBox = $('#offers');
  if (offersBox && !offersBox.children.length){
    offersBox.append(
      demoCard(101,'Сеты суши «Закат»',190,380),
      demoCard(102,'Эклеры ассорти, 4 шт',120,240)
    );
  }
})();
