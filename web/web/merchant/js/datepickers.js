// Foody v17 — handy calendars for "product_expire_date" & "expires_at"
(function(){
  function $(sel, root=document){ return root.querySelector(sel); }
  function el(tag, cls){ const n=document.createElement(tag); if(cls) n.className=cls; return n; }

  function ensureStyles(){
    if(document.getElementById('foody-datepickers-css')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.id = 'foody-datepickers-css';
    link.href = './css/datepickers.css';
    document.head.appendChild(link);
  }

  function pad(n){ return n<10? '0'+n : ''+n; }
  function toLocalDateInput(d){
    return d.getFullYear() + '-' + pad(d.getMonth()+1) + '-' + pad(d.getDate());
  }
  function toLocalDateTimeInput(d){
    return toLocalDateInput(d) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  function attachProductExpireDate(inp){
    if(!inp) return;
    // Native date input with min=today
    const now = new Date();
    inp.type = 'date';
    inp.min = toLocalDateInput(now);
    // Quick buttons
    const row = el('div', 'quick-date-row');
    const todayBtn = el('button','qd'); todayBtn.type='button'; todayBtn.textContent='Сегодня';
    const tomorrowBtn = el('button','qd'); tomorrowBtn.type='button'; tomorrowBtn.textContent='Завтра';
    const plus3Btn = el('button','qd'); plus3Btn.type='button'; plus3Btn.textContent='+3 дня';
    const clearBtn = el('button','qd'); clearBtn.type='button'; clearBtn.textContent='Очистить';
    todayBtn.onclick = ()=>{ const d=new Date(); inp.value = toLocalDateInput(d); };
    tomorrowBtn.onclick = ()=>{ const d=new Date(); d.setDate(d.getDate()+1); inp.value = toLocalDateInput(d); };
    plus3Btn.onclick = ()=>{ const d=new Date(); d.setDate(d.getDate()+3); inp.value = toLocalDateInput(d); };
    clearBtn.onclick = ()=>{ inp.value=''; };

    row.append(todayBtn, tomorrowBtn, plus3Btn, clearBtn);
    inp.parentElement && inp.parentElement.appendChild(row);
  }

  function attachExpiresAt(inp){
    if(!inp) return;
    // Native datetime-local with step=300s (5 min) and min=now+5min
    const now = new Date();
    now.setMinutes(now.getMinutes()+5);
    inp.type = 'datetime-local';
    inp.step = 300;
    inp.min = toLocalDateTimeInput(now);

    // Quick buttons
    const row = el('div', 'quick-date-row');
    const h1 = el('button','qd'); h1.type='button'; h1.textContent='+1 час';
    const tonight = el('button','qd'); tonight.type='button'; tonight.textContent='Сегодня 23:00';
    const tomorrow12 = el('button','qd'); tomorrow12.type='button'; tomorrow12.textContent='Завтра 12:00';
    const clearBtn = el('button','qd'); clearBtn.type='button'; clearBtn.textContent='Очистить';

    h1.onclick = ()=>{ const d=new Date(); d.setHours(d.getHours()+1, 0,0,0); inp.value = toLocalDateTimeInput(d); };
    tonight.onclick = ()=>{ const d=new Date(); d.setHours(23,0,0,0); inp.value = toLocalDateTimeInput(d); };
    tomorrow12.onclick = ()=>{ const d=new Date(); d.setDate(d.getDate()+1); d.setHours(12,0,0,0); inp.value = toLocalDateTimeInput(d); };
    clearBtn.onclick = ()=>{ inp.value=''; };

    row.append(h1, tonight, tomorrow12, clearBtn);
    inp.parentElement && inp.parentElement.appendChild(row);
  }

  function init(){
    ensureStyles();
    // Try common names used in repo
    const productDate = document.querySelector('[name="product_expire_date"], #product_expire_date');
    const expiresAt = document.querySelector('[name="expires_at"], #expires_at');
    attachProductExpireDate(productDate);
    attachExpiresAt(expiresAt);
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init);
  }else{
    init();
  }
})();