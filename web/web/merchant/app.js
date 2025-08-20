(() => {
  const $ = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
  const on = (sel, evt, fn) => { const el = $(sel); if (el) el.addEventListener(evt, fn, { passive: false }); };

  const state = {
    api: (window.__FOODY__ && window.__FOODY__.FOODY_API) || window.foodyApi || 'https://foodyback-production.up.railway.app',
    rid: localStorage.getItem('foody_restaurant_id') || '',
    key: localStorage.getItem('foody_key') || '',
  };

  const KNOWN_CITIES = ["Москва","Санкт-Петербург","Казань","Екатеринбург","Сочи","Новосибирск","Нижний Новгород","Омск","Томск"];
  const CITY_OTHER = "Другой";

  const toastBox = $('#toast');
  const showToast = (msg) => {
    if (!toastBox) return alert(msg);
    try {
      const now = Date.now();
      if (!window.__toast) window.__toast = { last:'', ts:0 };
      if (msg && window.__toast.last === String(msg) && (now - window.__toast.ts) < 1200) return;
      window.__toast.last = String(msg); window.__toast.ts = now;
    } catch(_) {}
    const el = document.createElement('div'); el.className = 'toast'; el.textContent = msg;
    toastBox.appendChild(el); setTimeout(() => el.remove(), 4200);
  };

  function toggleLogout(visible){
    const btn = $('#logoutBtn'); if (!btn) return;
    btn.style.display = visible ? '' : 'none';
  }

  function updateCreds(){
    const el = $('#creds');
    if (el) el.textContent = JSON.stringify({ restaurant_id: state.rid, api_key: state.key }, null, 2);
  }

  function formatRuPhone(digits){
    if (!digits) return '+7 ';
    if (digits[0] === '8') digits = '7' + digits.slice(1);
    if (digits[0] === '9') digits = '7' + digits;
    if (digits[0] !== '7') digits = '7' + digits;
    digits = digits.replace(/\D+/g,'').slice(0, 11);
    const rest = digits.slice(1);
    let out = '+7 ';
    if (rest.length > 0) out += rest.slice(0,3);
    if (rest.length > 3) out += ' ' + rest.slice(3,6);
    if (rest.length > 6) out += ' ' + rest.slice(6,8);
    if (rest.length > 8) out += ' ' + rest.slice(8,10);
    return out;
  }
  function attachPhoneMask(input){
    if (!input || input.dataset.maskBound === '1') return;
    input.dataset.maskBound = '1';
    input.type = 'tel'; input.inputMode = 'tel'; input.autocomplete = 'tel';
    const handler = () => {
      const digits = (input.value || '').replace(/\D+/g,'');
      input.value = formatRuPhone(digits);
    };
    input.addEventListener('input', handler);
    input.addEventListener('blur', handler);
    handler();
  }
  function getDigits(v){ return (v||'').toString().replace(/\D+/g,''); }

  function setupPwToggle(btnId, inputId){
    const btn = document.getElementById(btnId);
    const inp = document.getElementById(inputId);
    if (!btn || !inp || btn.dataset.bound === '1') return;
    btn.dataset.bound = '1';
    const update = (show) => {
      inp.type = show ? 'text' : 'password';
      btn.setAttribute('aria-pressed', show ? 'true' : 'false');
      btn.setAttribute('aria-label', show ? 'Скрыть пароль' : 'Показать пароль');
      btn.textContent = show ? '🙈' : '👁';
    };
    btn.addEventListener('click', () => {
      const show = inp.type === 'password';
      update(show);
      inp.focus({ preventScroll: true });
    });
  }

  function activateTab(tab) {
    try {
      $$('.seg-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
      $$('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
      const panes = $$('.pane');
      if (panes.length) panes.forEach(p => p.classList.toggle('active', p.id === tab));
      else { const t = document.getElementById(tab); if (t) t.classList.add('active'); }
      if (tab === 'offers') loadOffers();
      if (tab === 'profile') loadProfile();
      if (tab === 'export') updateCreds();
      if (tab === 'create') initCreateTab();
    } catch (e) { console.warn('activateTab failed', e); }
  }
  on('#tabs','click', (e) => { const btn = e.target.closest('.seg-btn'); if (btn?.dataset.tab) activateTab(btn.dataset.tab); });
  on('.bottom-nav','click', (e) => { const btn = e.target.closest('.nav-btn'); if (btn?.dataset.tab) activateTab(btn.dataset.tab); });

  function gate(){
    const authed = !!(state.rid && state.key);
    if (!authed) {
      activateTab('auth');
      const tabs = $('#tabs'); if (tabs) tabs.style.display = 'none';
      const bn = $('.bottom-nav'); if (bn) bn.style.display = 'none';
      toggleLogout(false);
      return false;
    }
    const tabs = $('#tabs'); if (tabs) tabs.style.display = '';
    const bn = $('.bottom-nav'); if (bn) bn.style.display = '';
    activateTab('offers'); try{ refreshDashboard(); }catch(_){ }
    toggleLogout(true);
    return true;
  }

  on('#logoutBtn','click', () => {
    try { localStorage.removeItem('foody_restaurant_id'); localStorage.removeItem('foody_key'); } catch(_) {}
    state.rid = ''; state.key = ''; showToast('Вы вышли');
    toggleLogout(false); activateTab('auth');
    const tabs = $('#tabs'); if (tabs) tabs.style.display = 'none';
    const bn = $('.bottom-nav'); if (bn) bn.style.display = 'none';
  });

  function dtLocalToIso(v){
    if (!v) return null;
    try {
      const [d, t] = v.split(' ');
      const [Y,M,D] = d.split('-').map(x=>parseInt(x,10));
      const [h,m] = (t||'00:00').split(':').map(x=>parseInt(x,10));
      const dt = new Date(Y, (M-1), D, h, m);
      return new Date(dt.getTime() - dt.getTimezoneOffset()*60000).toISOString().slice(0,16)+':00Z';
    } catch(e){ return null; }
  }

  
async function api(path, { method='GET', headers={}, body=null, raw=false } = {}) {
    const url = `${state.api}${path}`;
    const h = { 'Content-Type': 'application/json', ...headers };
    if (state.key) h['X-Foody-Key'] = state.key;
    try {
      const res = await fetch(url, { method, headers: h, body });
      // --- Accept 204 No Content without trying to parse JSON
      if (res.status === 204) { 
        if (raw) return res; 
        return null; 
      }
      if (!res.ok) {
        const ct = res.headers.get('content-type')||'';
        let msg = `${res.status} ${res.statusText}`;
        if (ct.includes('application/json')) {
          let j = null;
          try { j = await res.json(); } catch(_) {}
          if (j && (j.detail || j.message)) msg = j.detail || j.message || msg;
        } else {
          let t = '';
          try { t = await res.text(); } catch(_) {}
          if (t) msg += ` — ${t.slice(0,180)}`;
        }
        throw new Error(msg);
      }
      if (raw) return res;
      const ct2 = res.headers.get('content-type') || '';
      if (ct2.includes('application/json')) {
        try { return await res.json(); } catch(_) { return null; }
      }
      try { return await res.text(); } catch(_) { return ''; }
    } catch (err) {
      if (String(err.message).includes('Failed to fetch')) throw new Error('Не удалось связаться с сервером. Проверьте соединение или CORS.');
      throw err;
    }
  }


const CityPicker = (() => {
    let target = null;
    function open(trg){
      target = trg;
      $('#cityModal')?.setAttribute('aria-hidden','false');
      $('#cityOtherWrap').style.display = 'none';
      $('#cityOtherInput').value = '';
      $('#citySearch').value = '';
      renderChips(KNOWN_CITIES.concat([CITY_OTHER]));
      highlightCurrent();
      setTimeout(()=> $('#citySearch')?.focus(), 10);
    }
    function close(){ $('#cityModal')?.setAttribute('aria-hidden','true'); target = null; }
    function highlightCurrent(){
      const val = getTargetInput()?.value || '';
      $$('.city-chip').forEach(ch => ch.classList.toggle('active', ch.dataset.value === val));
    }
    function getTargetInput(){ return target === 'profile' ? $('#profileCityValue') : $('#cityValue'); }
    function getTargetButton(){ return target === 'profile' ? $('#profileCityOpen') : $('#cityOpen'); }
    function setValue(city){
      const inp = getTargetInput();
      const btn = getTargetButton();
      if (inp) inp.value = city || '';
      if (btn) {
        btn.querySelector('.hint').style.display = city ? 'none' : '';
        btn.querySelector('.value').textContent = city || '';
      }
    }
    function applyOther(){
      const v = ($('#cityOtherInput')?.value || '').trim();
      if (!v) return;
      setValue(v); close();
    }
    function renderChips(items){
      const grid = $('#cityGrid'); if (!grid) return;
      grid.innerHTML = items.map(c => `<div class="city-chip" data-value="${c}">${c}</div>`).join('');
      grid.querySelectorAll('.city-chip').forEach(el => {
        el.addEventListener('click', () => {
          const val = el.dataset.value;
          if (val === CITY_OTHER) { $('#cityOtherWrap').style.display = ''; $('#cityOtherInput').focus(); }
          else { setValue(val); close(); }
        });
      });
    }
    function filter(q){
      const list = KNOWN_CITIES.filter(c => c.toLowerCase().includes(q.toLowerCase()));
      const items = q.trim() ? list.concat(list.includes(CITY_OTHER)?[]:[CITY_OTHER]) : KNOWN_CITIES.concat([CITY_OTHER]);
      renderChips(items);
      highlightCurrent();
    }
    function setInitial(btnId, inputId){
      const btn = $(btnId); const inp = $(inputId);
      if (!btn || !inp) return;
      const val = inp.value || '';
      btn.querySelector('.hint').style.display = val ? 'none' : '';
      btn.querySelector('.value').textContent = val || '';
    }
    on('#cityOpen','click', () => open('register'));
    on('#profileCityOpen','click', () => open('profile'));
    on('#cityBackdrop','click', close);
    on('#cityClose','click', close);
    on('#cityOtherApply','click', applyOther);
    on('#citySearch','input', e => filter(e.target.value || ''));
    return { open, close, setValue, setInitial };
  })();

  function bindWorkPresets(containerSel, fromSel, toSel){
    const box = document.querySelector(containerSel); if (!box) return;
    const form = box.closest('form');
    const from = form?.querySelector(fromSel);
    const to = form?.querySelector(toSel);
    if (!from || !to) return;
    box.addEventListener('click', (e) => {
      const chip = e.target.closest('.chip');
      if (!chip) return;
      const f = chip.dataset.from || '';
      const t = chip.dataset.to || '';
      if (f) from.value = f;
      if (t) to.value = t;
      from.dispatchEvent(new Event('input', { bubbles: true }));
      to.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }

  function bindDiscountPresets(){
    const box = $('#discountPresets'); if (!box) return;
    const priceEl = $('#offerPrice'), oldEl = $('#offerOldPrice');
    const round = (v) => Math.round(Number(v)||0);
    box.addEventListener('click', (e) => {
      const chip = e.target.closest('.chip'); if (!chip) return;
      const d = Number(chip.dataset.discount || '0'); if (!d) return;
      const base = Number(oldEl?.value) || Number(priceEl?.value) || 0;
      if (!base) return;
      const discounted = base * (1 - d/100);
      if (oldEl && !Number(oldEl.value||0)) oldEl.value = String(round(base));
      if (priceEl) priceEl.value = String(round(discounted));
      priceEl?.dispatchEvent(new Event('input', { bubbles: true }));
      oldEl?.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }

  
  function autoRoundOfferPrice(){
    try {
      const priceEl = $('#offerPrice');
      if (!priceEl || priceEl._roundBound) return;
      const doRound = () => {
        const v = parseFloat(String(priceEl.value||'').replace(',','.'));
        if (isFinite(v)) priceEl.value = String(Math.round(v));
      };
      ['change','blur'].forEach(ev => priceEl.addEventListener(ev, doRound));
      priceEl._roundBound = true;
    } catch(_) {}
  }
function bindExpirePresets(){
    const box = $('#expirePresets'); if (!box) return;
    const ex = $('#expires_at');
    const fp = ex? ex._flatpickr : null;
    const closeChip = $('#expireToClose');
    const closeStr = localStorage.getItem('foody_work_to') || '';
    if (closeChip && closeStr) { closeChip.style.display = ''; } else if (closeChip) { closeChip.style.display = 'none'; }

    function setDate(dt){
      if (fp && typeof fp.setDate === 'function') fp.setDate(dt, true);
      else ex.value = `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')} ${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`;
    }
    function todayAt(h, m){
      const now = new Date(); const dt = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0);
      if (dt <= now) dt.setDate(dt.getDate()+1);
      setDate(dt);
    }
    function toClose(){
      if (!closeStr) return;
      const [h,m] = closeStr.split(':').map(x=>parseInt(x,10));
      todayAt(h||21, m||0);
    }

    box.addEventListener('click', (e) => {
      const chip = e.target.closest('.chip'); if (!chip) return;
      if (chip.dataset.action === 'close') toClose();
    });
  }

  function bindAuthToggle(){
    const loginForm = $('#loginForm');
    const regForm = $('#registerForm');
    const modeLogin = $('#mode-login');
    const modeReg = $('#mode-register');
    const forms = $('.auth-forms');
    function apply(){
      const showLogin = modeLogin ? modeLogin.checked : true;
      if (loginForm) loginForm.style.display = showLogin ? 'grid' : 'none';
      if (regForm) regForm.style.display = showLogin ? 'none' : 'grid';
      if (forms) forms.setAttribute('data-mode', showLogin ? 'login' : 'register');
      const le = $('#loginError'); if (le) le.classList.add('hidden');
      const re = $('#registerError'); if (re) re.classList.add('hidden');
    }
    if (modeLogin) modeLogin.addEventListener('change', apply);
    if (modeReg) modeReg.addEventListener('change', apply);
    try { apply(); } catch(e) { console.warn('auth toggle init failed', e); }
  }

  attachPhoneMask($('#loginPhone'));
  attachPhoneMask($('#registerPhone'));
  attachPhoneMask($('#profilePhone'));
  setupPwToggle('toggleLoginPw','loginPassword');
  setupPwToggle('toggleRegisterPw','registerPassword');
  setupPwToggle('pwOldToggle','pwOld');
  setupPwToggle('pwNewToggle','pwNew');
  bindAuthToggle();

  function showInlineError(id, text){
    const el = $(id); if (!el) { showToast(text); return; }
    el.textContent = text; el.classList.remove('hidden');
    setTimeout(()=> el.classList.add('hidden'), 6000);
  }

  // --- Auth submit handlers ---
  on('#registerForm','submit', async (e) => {
    e.preventDefault();
    const btn = e.currentTarget.querySelector('button[type="submit"]'); if (btn) { btn.disabled = true; btn.textContent = 'Сохранение…'; }
    const fd = new FormData(e.currentTarget);
    let city = (fd.get('city')||'').toString().trim();
    if (!city) { showInlineError('#registerError','Пожалуйста, выберите город'); if (btn){btn.disabled=false;btn.textContent='Зарегистрироваться';} return; }
    const phoneDigits = getDigits(fd.get('login'));
    if (phoneDigits.length < 11) { showInlineError('#registerError','Введите телефон в формате +7 900 000 00 00'); if (btn){btn.disabled=false;btn.textContent='Зарегистрироваться';} return; }

    const payload = {
      name: (fd.get('name')||'').toString().trim(),
      login: phoneDigits,
      password: (fd.get('password')||'').toString().trim(),
      city,
    };
    const address = (fd.get('address')||'').toString().trim();
    const work_from = (fd.get('work_from')||'').toString().slice(0,5) || null;
    const work_to = (fd.get('work_to')||'').toString().slice(0,5) || null;
    try {
      const r = await api('/api/v1/merchant/register_public', { method: 'POST', body: JSON.stringify(payload) });
      if (!r.restaurant_id || !r.api_key) throw new Error('Неожиданный ответ API');
      state.rid = r.restaurant_id; state.key = r.api_key;
      try {
        localStorage.setItem('foody_restaurant_id', state.rid);
        localStorage.setItem('foody_key', state.key);
        localStorage.setItem('foody_city', city);
        localStorage.setItem('foody_reg_city', city);
        if (work_from) localStorage.setItem('foody_work_from', work_from);
        if (work_to) localStorage.setItem('foody_work_to', work_to);
      } catch(_) {}
      showToast('Ресторан создан ✅');
      try {
        const body = { restaurant_id: state.rid, address: address || city, city };
        if (work_from) { body.work_from = work_from; body.open_time = work_from; }
        if (work_to)   { body.work_to   = work_to;   body.close_time = work_to; }
        await api('/api/v1/merchant/profile', { method: 'PUT', body: JSON.stringify(body) });
      } catch(e) { console.warn('profile save (hours) failed', e); }
      gate(); activateTab('profile');
    } catch (err) {
      const msg = String(err.message||'Ошибка регистрации');
      if (msg.includes('409') || /already exists/i.test(msg)) showInlineError('#registerError','Такой телефон уже зарегистрирован.');
      else if (msg.includes('password')) showInlineError('#registerError','Пароль слишком короткий (мин. 6 символов).');
      else showInlineError('#registerError', msg);
      console.error(err);
    } finally {
      if (btn){btn.disabled=false;btn.textContent='Зарегистрироваться';}
    }
  });

  on('#loginForm','submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const phoneDigits = getDigits(fd.get('login'));
    if (phoneDigits.length < 11) { showInlineError('#loginError','Введите телефон в формате +7 900 000 00 00'); return; }
    const payload = { login: phoneDigits, password: (fd.get('password')||'').toString().trim() };
    try {
      const r = await api('/api/v1/merchant/login', { method: 'POST', body: JSON.stringify(payload) });
      state.rid = r.restaurant_id; state.key = r.api_key;
      try { localStorage.setItem('foody_restaurant_id', state.rid); localStorage.setItem('foody_key', state.key); } catch(_) {}
      showToast('Вход выполнен ✅');
      gate();
    } catch (err) {
      const msg = String(err.message||'');
      if (msg.includes('401') || /invalid login or password/i.test(msg)) showInlineError('#loginError', 'Неверный телефон или пароль.');
      else showInlineError('#loginError', msg || 'Ошибка входа');
      console.error(err);
    }
  });
  // --- end auth handlers ---

  function loadCityToProfileUI(city){
    const btn = $('#profileCityOpen'); const inp = $('#profileCityValue');
    if (btn && inp) {
      btn.querySelector('.hint').style.display = city ? 'none' : '';
      btn.querySelector('.value').textContent = city || '';
      inp.value = city || '';
    }
  }

  async function loadProfile() {
    if (!state.rid || !state.key) return;
    try {
      const p = await api(`/api/v1/merchant/profile?restaurant_id=${encodeURIComponent(state.rid)}`);
      const f = $('#profileForm'); if (!f) return;
      f.name.value = p.name || '';
      const phEl = $('#profilePhone'); if (phEl) { phEl.value = formatRuPhone(getDigits(p.phone)); }

      loadCityToProfileUI(p.city || localStorage.getItem('foody_city') || localStorage.getItem('foody_reg_city') || '');
      f.address.value = p.address || '';

      const lsFrom = localStorage.getItem('foody_work_from') || '';
      const lsTo   = localStorage.getItem('foody_work_to')   || '';
      const apiFrom = (p.work_from || p.open_time || '').slice(0,5);
      const apiTo   = (p.work_to   || p.close_time || '').slice(0,5);
      if (apiFrom) { f.work_from.value = apiFrom; try{ localStorage.setItem('foody_work_from', apiFrom);}catch(_){} }
      else if (lsFrom) { f.work_from.value = lsFrom; }

      if (apiTo) { f.work_to.value = apiTo; try{ localStorage.setItem('foody_work_to', apiTo);}catch(_){} }
      else if (lsTo) { f.work_to.value = lsTo; }

    } catch (err) { console.warn(err); showToast('Не удалось загрузить профиль: ' + err.message); }
  }

  on('#profileForm','submit', async (e) => {
    e.preventDefault();
    if (!state.rid || !state.key) return showToast('Сначала войдите');
    const btn = e.currentTarget.querySelector('button[type="submit"]'); if (btn) { btn.disabled = true; btn.textContent = 'Сохранение…'; }
    const saved = $('#profileSaved'); if (saved) saved.style.display = 'none';
    const fd = new FormData(e.currentTarget);
    const city = (fd.get('city')||'').toString().trim();
    if (!city) { showInlineError('#profileError', 'Укажите город'); if (btn){btn.disabled=false;btn.textContent='Сохранить';} return; }

    let work_from = (fd.get('work_from')||'').toString().slice(0,5) || null;
    let work_to   = (fd.get('work_to')||'').toString().slice(0,5) || null;
    if ((work_from && !work_to) || (!work_from && work_to)) {
      showInlineError('#profileError', 'Заполните оба поля времени (с и до), или очистите оба.');
      if (btn){btn.disabled=false;btn.textContent='Сохранить';}
      return;
    }

    const payload = {
      restaurant_id: state.rid,
      name: (fd.get('name')||'').toString().trim() || null,
      phone: getDigits(fd.get('phone')) || null,
      address: (fd.get('address')||'').toString().trim() || null,
      city: city || null,
      open_time: work_from, close_time: work_to,
      work_from, work_to,
    };
    try {
      try {
        localStorage.setItem('foody_city', city || '');
        if (work_from) localStorage.setItem('foody_work_from', work_from);
        if (work_to) localStorage.setItem('foody_work_to', work_to);
      } catch(_) {}
      await api('/api/v1/merchant/profile', { method: 'PUT', body: JSON.stringify(payload) });
      showToast('Профиль обновлен ✅');
      const pe = $('#profileError'); if (pe) pe.classList.add('hidden');
      if (saved) { saved.style.display = ''; setTimeout(()=> saved.style.display='none', 2500); }
      loadProfile();
    } catch (err) {
      const msg = String(err.message||'Ошибка сохранения');
      const pe = $('#profileError'); if (pe) { pe.classList.remove('hidden'); pe.textContent = msg; }
      showToast(msg);
      console.error(err);
    } finally {
      if (btn){btn.disabled=false;btn.textContent='Сохранить';}
    }
  });

  on('#pwForm','submit', async (e) => {
    e.preventDefault();
    if (!state.rid || !state.key) return showToast('Сначала войдите');
    const btn = e.currentTarget.querySelector('button[type="submit"]'); if (btn) { btn.disabled = true; btn.textContent = 'Сохранение…'; }
    const err = $('#pwError'); const ok = $('#pwSaved'); if (err) err.classList.add('hidden'); if (ok) ok.style.display = 'none';
    const oldp = $('#pwOld')?.value || ''; const newp = $('#pwNew')?.value || ''; const new2 = $('#pwNew2')?.value || '';
    if (newp.length < 6) { if (err){err.textContent='Новый пароль слишком короткий (мин. 6 символов).'; err.classList.remove('hidden');} if (btn){btn.disabled=false;btn.textContent='Сменить пароль';} return; }
    if (newp !== new2) { if (err){err.textContent='Пароли не совпадают.'; err.classList.remove('hidden');} if (btn){btn.disabled=false;btn.textContent='Сменить пароль';} return; }
    try {
      await api('/api/v1/merchant/password', { method: 'PUT', body: JSON.stringify({ restaurant_id: state.rid, old_password: oldp, new_password: newp }) });
      showToast('Пароль изменён ✅'); if (ok){ ok.style.display=''; setTimeout(()=> ok.style.display='none', 2500); }
      $('#pwOld').value=''; $('#pwNew').value=''; $('#pwNew2').value='';
    } catch (e2) {
      const msg = String(e2.message||'Ошибка'); if (err){ err.textContent = /401|invalid/i.test(msg) ? 'Неверный текущий пароль.' : msg; err.classList.remove('hidden'); }
    } finally {
      if (btn){btn.disabled=false;btn.textContent='Сменить пароль';}
    }
  });

  function initCreateTab(){
    try {
      const ex = $('#expires_at');
      if (window.flatpickr && ex && !ex._flatpickr) {
        if (window.flatpickr.l10ns && window.flatpickr.l10ns.ru) { flatpickr.localize(flatpickr.l10ns.ru); }
        flatpickr('#expires_at', {
          enableTime: true, time_24hr: true, minuteIncrement: 5,
          dateFormat: 'Y-m-d H:i', altInput: true, altFormat: 'd.m.Y H:i',
          defaultDate: new Date(Date.now() + 60*60*1000), minDate: 'today'
        });
      }
      bindDiscountPresets();
      bindExpirePresets();
      const bb = $('#best_before');
      if (window.flatpickr && bb && !bb._flatpickr) {
        if (window.flatpickr.l10ns && window.flatpickr.l10ns.ru) { flatpickr.localize(flatpickr.l10ns.ru); }
        flatpickr('#best_before', {
          enableTime: true, time_24hr: true, minuteIncrement: 5,
          dateFormat: 'Y-m-d H:i', altInput: true, altFormat: 'd.m.Y H:i',
          minDate: 'today'
        });
      }
      
      autoRoundOfferPrice();
    } catch (e) {}
  }

  async function loadOffers() {
    if (state._offersLoading) return; state._offersLoading = true;
    if (!state.rid || !state.key) return;
    const root = $('#offerList'); if (root) root.innerHTML = '<div class="skeleton"></div><div class="skeleton"></div>';
    try {
      const data = await api(`/api/v1/merchant/offers?restaurant_id=${encodeURIComponent(state.rid)}`);
      const list = (data && (data.items || data.results)) ? (data.items || data.results) : (Array.isArray(data) ? data : []);
      renderOffers(list);
    } catch (err) { console.error(err); if (root) root.innerHTML = '<div class="hint">Не удалось загрузить</div>'; } finally { state._offersLoading = false; }
  }

  function renderOffers(items){
    const root = $('#offerList'); if (!root) return;
    if (!Array.isArray(items) || items.length === 0) { root.innerHTML = '<div class="hint">Пока нет офферов</div>'; return; }
    const fmt = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeStyle: 'short' });
    const rows = items.map(o => {
      const price = o.price_cents!=null ? o.price_cents/100 : (o.price!=null ? Number(o.price) : 0);
      const old   = o.original_price_cents!=null ? o.original_price_cents/100 : (o.original_price!=null ? Number(o.original_price) : 0);
      const disc = old>0 ? Math.round((1 - price/old)*100) : 0;
      const exp = o.expires_at ? fmt.format(new Date(o.expires_at)) : '—';
      return `<div class="row" data-offer-id="${o.id}">
        <div>${o.title || '—'}</div>
        <div>${price.toFixed(2)}</div>
        <div>${disc?`-${disc}%`:'—'}</div>
        <div>${o.qty_left ?? '—'} / ${o.qty_total ?? '—'}</div>
        <div>${exp}</div>
        <div class="actions"><button class="btn btn-ghost" data-action="edit-offer">Редактировать</button><button class="btn btn-danger" data-action="delete">Удалить</button></div>
      </div>`;
    }).join('');
    const head = `<div class="row head"><div>Название</div><div>Цена</div><div>Скидка</div><div>Остаток</div><div>До</div><div></div></div>`;
    root.innerHTML = head + rows;
    // bind delete (delegated)
    if (!root.dataset.deleteBound){
      root.dataset.deleteBound = '1';
      
      // delegated edit
      root.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-action="edit-offer"]'); if (!btn) return;
        const row = btn.closest('.row'); const id = row && row.getAttribute('data-offer-id'); if (!id) return;
        // find item by id if available in state
        try {
          const items = (window.__FOODY_STATE__ && window.__FOODY_STATE__.offers) || null;
          let item = null; if (items && Array.isArray(items)) item = items.find(x=> String(x.id)===String(id));
          // If no cache, attempt to read from DOM (minimal set)
          openOfferEditModal(item || { id });
        } catch(_){ openOfferEditModal({ id }); }
      }, false);

      function openOfferEditModal(o){
        const m = $('#offerEditModal'); if (!m) return;
        $('#editId').value = o.id || '';
        $('#editTitle').value = o.title || '';
        $('#editOld').value = (o.original_price_cents!=null ? (o.original_price_cents/100) : (o.original_price || '')) || '';
        $('#editPrice').value = (o.price_cents!=null ? (o.price_cents/100) : (o.price || '')) || '';
        $('#editQty').value = (o.qty_total!=null ? o.qty_total : (o.total_qty!=null ? o.total_qty : '')) || '';
        $('#editExpires').value = o.expires_at ? formatLocal(o.expires_at) : (o.expires || '');
        $('#editCategory').value = o.category || 'other';
        $('#editDesc').value = o.description || '';
        m.classList.add('_open');
      }
      function formatLocal(iso){
        try{ const d=new Date(iso); const p=n=>String(n).padStart(2,'0'); return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`; }catch(_){ return ''; }
      }
      function toIsoLocal(str){
        if(!str) return null; const m = String(str).match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/); if(!m) return null;
        const [_,Y,M,D,h,mn] = m.map(Number); const dt = new Date(Y,M-1,D,h,mn); return new Date(dt.getTime()-dt.getTimezoneOffset()*60000).toISOString().replace(/\.\d{3}Z$/, 'Z');
      }
      const editForm = $('#offerEditForm');
      const editCancel = $('#offerEditCancel');
      if (editCancel) editCancel.addEventListener('click', (ev)=>{ ev.preventDefault(); const m=$('#offerEditModal'); if(m) m.classList.remove('_open'); });
      if (editForm) editForm.addEventListener('submit', async (ev)=>{
        ev.preventDefault();
        const id = $('#editId').value;
        const payload = {
          title: $('#editTitle').value.trim(),
          original_price: Number($('#editOld').value||0),
          price: Number($('#editPrice').value||0),
          qty_total: Number($('#editQty').value||0),
          expires_at: toIsoLocal($('#editExpires').value||''),
          category: $('#editCategory').value || 'other',
          description: $('#editDesc').value.trim()
        };
        try{
          await api(`/api/v1/merchant/offers/${id}`, { method:'PATCH', body: JSON.stringify(payload) });
          const m=$('#offerEditModal'); if(m) m.classList.remove('_open');
          showToast('Сохранено');
          loadOffers();
        }catch(err){ showToast('Не удалось сохранить: '+(err.message||err)); }
      });
    root.addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-action="delete"]'); if (!btn) return;
        const row = btn.closest('.row'); const id = row && row.getAttribute('data-offer-id'); if (!id) return;
        if (!confirm('Удалить оффер?')) return;
        try {
          await api(`/api/v1/merchant/offers/${id}`, { method: 'DELETE' });
          row.remove();
          try { refreshDashboard && refreshDashboard(); } catch(_){}
          showToast('Оффер удалён');
        } catch (err) {
          showToast('Не удалось удалить: '+ (err.message||err));
        }
      });
    }
  }

  
let __dashLastData = null;
// === Dashboard helpers (lightweight) ===
function safeNum(v){ const n = Number(v); return isFinite(n) ? n : 0; }
function parseMaybeDate(v){
  if (!v) return null;
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(v)) return new Date(v.replace(' ', 'T'));
  try { const d = new Date(v); return isNaN(d) ? null : d; } catch(_){ return null; }
}
function moneyFmt(n){ try{ return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g,' '); }catch(_){ return String(n); }}

function renderDashboard(offers){
  const guest = document.getElementById('dashGuest');
  const stats = document.getElementById('dashStats');
  const acts  = document.getElementById('dashActions');
  if (!stats || !acts){ if (guest) guest.style.display='block'; return; }

  const now = new Date();
  const soon = new Date(now.getTime()+2*60*60*1000);

  let active=0, qtySum=0, soonCount=0, revenue=0;

  const arr = Array.isArray(offers) ? offers : (offers?.items || offers?.results || []);
  for (const o of arr){
    const ex = parseMaybeDate(o.expires_at || o.expiresAt || o.expires || o.until);
    const qty = o.qty_left ?? o.qtyLeft ?? o.qty ?? o.qty_total ?? o.qtyTotal ?? 0;
    const pr  = o.price ?? o.new_price ?? o.final_price ?? 0;
    const isActive = (qty>0) && (!ex || ex>now);
    if (isActive){
      active++;
      qtySum += safeNum(qty);
      revenue += safeNum(pr) * safeNum(qty);
      if (ex && ex<=soon) soonCount++;
    }
  }

  const kActive = document.getElementById('kpiActive');
  const kQty    = document.getElementById('kpiQty');
  const kRev    = document.getElementById('kpiRevenue');
  const kSoon   = document.getElementById('kpiSoon');

  if (kActive) kActive.textContent = String(active);
  if (kQty)    kQty.textContent    = String(qtySum);
  if (kRev)    kRev.textContent    = moneyFmt(revenue)+' ₽';
  if (kSoon)   kSoon.textContent   = String(soonCount);

  if (guest) guest.style.display = 'none';
  stats.style.display = '';
  acts.style.display  = '';
}

async function refreshDashboard(){
  const guest = document.getElementById('dashGuest');
  const stats = document.getElementById('dashStats');
  const acts  = document.getElementById('dashActions');

  const authed = !!(state && state.rid && state.key);
  if (!authed){
    if (guest) guest.style.display='block';
    if (stats) stats.style.display='none';
    if (acts)  acts.style.display='none';
    return;
  }
  try{
    const data = await api(`/api/v1/merchant/offers?restaurant_id=${encodeURIComponent(state.rid)}`);
    const list = data?.items || data?.results || data || [];
    renderDashboard(list);
  }catch(e){
    if (guest) guest.style.display='block';
    if (stats) stats.style.display='none';
    if (acts)  acts.style.display='none';
  }
}


// --- Helpers for robust API POST (offers) ---
function foodyBase() {
  try {
    return (window.__FOODY__ && window.__FOODY__.FOODY_API) || window.foodyApi || '';
  } catch(_) { return ''; }
}
function joinApi(path) {
  const base = foodyBase();
  if (/^https?:\/\//i.test(path)) return path;
  if (/^https?:\/\//i.test(base)) return base.replace(/\/+$/, '') + path;
  return path; // fallback to relative
}


// --- Strong auth POST for offers (header X-Foody-Key, no query fallbacks) ---
function foodyBase() {
  try { return (window.__FOODY__ && window.__FOODY__.FOODY_API) || window.foodyApi || ''; }
  catch(_) { return ''; }
}
function joinApi(path) {
  const base = foodyBase();
  if (/^https?:\/\//i.test(path)) return path;
  if (/^https?:\/\//i.test(base)) return base.replace(/\/+$/, '') + path;
  return path;
}


function foodyBase() {
  try { return (window.__FOODY__ && window.__FOODY__.FOODY_API) || window.foodyApi || ''; }
  catch(_) { return ''; }
}
function joinApi(path) {
  const base = foodyBase();
  if (/^https?:\/\//i.test(path)) return path;
  if (/^https?:\/\//i.test(base)) return base.replace(/\/+$/, '') + path;
  return path;
}
async function postOfferStrict(payload) {
  const url = joinApi('/api/v1/merchant/offers');
  const headers = { 'Content-Type': 'application/json' };
  if (state && state.key) headers['X-Foody-Key'] = state.key;
  const doReq = async (u, body) => {
    const res = await fetch(u, { method: 'POST', headers, body: JSON.stringify(body), mode: 'cors' });
    const ct = res.headers.get('content-type') || '';
    const data = ct.includes('application/json') ? await res.json().catch(()=>({})) : await res.text();
    if (!res.ok) {
      const msg = typeof data==='object' && data && data.detail ? data.detail : ('Ошибка ' + res.status);
      const err = new Error(msg); err.status = res.status; err.data = data; throw err;
    }
    return data;
  };
  try {
    return await doReq(url, payload);
  } catch (e) {
    const msg = String(e?.data?.detail || e?.message || '');
    if (e.status === 500 && msg.includes('merchant_id')) {
      const u2 = url + (url.includes('?')?'&':'?') + 'merchant_id=' + encodeURIComponent(payload.merchant_id || payload.restaurant_id || '');
      return await doReq(u2, payload);
    }
    throw e;
  }
}


  // === QR / Reservations ===
  async function redeem(code){
    const msg = document.getElementById('qr_msg');
    if (!code) { if(msg){msg.textContent='Введите код'; msg.className='tag badge-warn';} return; }
    try {
      const res = await api(`/api/v1/merchant/reservations/${encodeURIComponent(code)}/redeem`, { method:'POST' });
      if (msg){ msg.textContent = 'Погашено ✓'; msg.className='tag badge-ok'; }
      try { refreshDashboard && refreshDashboard(); } catch(_){}
    } catch (e) {
      if (msg){ msg.textContent = 'Ошибка: ' + (e.message||e); msg.className='tag badge-warn'; }
    }
  }
  async function startScan(){
    const msg = document.getElementById('qr_msg');
    const video = document.getElementById('qr_video');
    if (!('BarcodeDetector' in window)) {
      if (msg){ msg.textContent='Сканер не поддерживается: введите код вручную'; msg.className='tag badge-warn'; }
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video:{ facingMode:'environment' } });
      video.srcObject = stream; await video.play();
      const det = new BarcodeDetector({ formats:['qr_code'] });
      const timer = setInterval(async () => {
        try {
          const codes = await det.detect(video);
          if (codes && codes[0]){
            clearInterval(timer);
            stream.getTracks().forEach(t=>t.stop());
            const val = codes[0].rawValue || '';
            const input = document.getElementById('qr_code'); if (input) input.value = val;
            redeem(val);
          }
        } catch(_) {}
      }, 350);
    } catch (e) {
      if (msg){ msg.textContent='Не удалось открыть камеру'; msg.className='tag badge-warn'; }
    }
  }
  function initQrTab(){
    const r = document.getElementById('qr_redeem_btn');
    const s = document.getElementById('qr_scan_btn');
    if (r && !r.dataset.bound){ r.dataset.bound='1'; r.addEventListener('click', ()=> redeem((document.getElementById('qr_code')||{}).value||'')); }
    if (s && !s.dataset.bound){ s.dataset.bound='1'; s.addEventListener('click', startScan); }
  }


document.addEventListener('DOMContentLoaded', () => {
    try {
      // Universal [data-tab] router (incl. dashboard buttons)
      document.addEventListener('click', (ev) => {
        try {
          const el = ev.target.closest('[data-tab]');
          if (el) { ev.preventDefault(); const t = el.getAttribute('data-tab') || el.dataset.tab; if (t) activateTab(t); }
        } catch(_) {}
      }, true);


// --- Dedup toasts for login/logout (avoid double "Вы вышли/вошли") ---
try {
  if (!window.__toastDedup && typeof window.showToast === 'function') {
    const __origShowToast = window.showToast;
    window.showToast = function(msg, ...rest) {
      try {
        if (msg && (String(msg).includes('Вы вышли') || String(msg).includes('Вы вошли'))) {
          const now = Date.now();
          if (window.__toastLast === msg && (now - (window.__toastLastTs || 0)) < 1000) {
            return; // drop duplicate within 1s
          }
          window.__toastLast = msg;
          window.__toastLastTs = now;
        }
      } catch(_) {}
      return __origShowToast(msg, ...rest);
    };
    window.__toastDedup = true;
  }
} catch(_) {}

      attachPhoneMask($('#loginPhone'));
      attachPhoneMask($('#registerPhone'));
      attachPhoneMask($('#profilePhone'));
      setupPwToggle('toggleLoginPw','loginPassword');
      setupPwToggle('toggleRegisterPw','registerPassword');
      setupPwToggle('pwOldToggle','pwOld');
      setupPwToggle('pwNewToggle','pwNew');
      CityPicker.setInitial('#cityOpen', '#cityValue');
      CityPicker.setInitial('#profileCityOpen', '#profileCityValue');
      bindWorkPresets('.work-presets[data-for="register"]', 'input[name="work_from"]', 'input[name="work_to"]');
      bindWorkPresets('.work-presets[data-for="profile"]', '#profile_work_from', '#profile_work_to');
      
// --- Dashboard actions: route buttons to tabs ---
try {
  on('#dashActions [data-tab]', 'click', (e) => {
    e.preventDefault();
    const t = e.currentTarget?.getAttribute('data-tab') || e.currentTarget?.dataset?.tab;
    if (t) activateTab(t);
  });
} catch(_) {}

// --- Offer create submit (strict auth + merchant_id) ---

// Offer create submit (strict + aliases + fallback)
on('#offerForm','submit', async (e) => {
  e.preventDefault();
  const form = e.currentTarget;
  const err = form.querySelector('#offerError');
  if (err) err.classList.add('hidden');

  const fd = new FormData(form);
  const toNum = (v) => { const n = parseFloat(String(v||'').replace(',', '.')); return isFinite(n) ? n : 0; };
  const toInt = (v) => { const n = parseInt(String(v||'').trim(), 10); return isFinite(n) ? n : 0; };
  const trim = (v) => String(v||'').trim();

  const rid = (state && (state.rid || state.restaurant_id)) || (parseInt(localStorage.getItem('foody_restaurant_id')||'0',10)) || null;

  const payload = {
    restaurant_id: rid || undefined,
    restaurantId: rid || undefined,
    merchant_id: rid || undefined,
    merchantId: rid || undefined,
    title: trim(fd.get('title')),
    original_price: toNum(fd.get('original_price')||fd.get('price_base')) || undefined,
    price: toNum(fd.get('price')),
    qty_total: toInt(fd.get('qty_total')||fd.get('quantity')),
    category: trim(fd.get('category')) || 'other',
    description: trim(fd.get('description')) || '',
    image_url: trim(fd.get('image_url')) || undefined,
  };
  const ex = trim(fd.get('expires_at'));
  if (ex) payload.expires_at = dtLocalToIso(ex) || ex;
  const bb = trim(fd.get('best_before'));
  if (bb) payload.best_before = dtLocalToIso(bb) || bb;
  
  // --- VALIDATE: expires_at must not exceed best_before ---
  {
    const parseLocal = (s)=>{
      if (!s) return null;
      try {
        const parts = s.includes('T') ? s.split('T') : s.split(' ');
        const [Y,M,D] = parts[0].split('-').map(x=>parseInt(x,10));
        const [h,m] = (parts[1]||'00:00').split(':').map(x=>parseInt(x,10));
        return new Date(Y, (M-1), D, h||0, m||0, 0, 0);
      } catch(_) { return null; }
    };
    const dEx = parseLocal(ex);
    const dBb = parseLocal(bb);
    if (dEx && dBb && dEx.getTime() > dBb.getTime()){
      showInlineError('#offerError','Срок действия оффера не может превышать срок годности продукта');
      return; // abort submit
    }
  }
;


  if (!payload.title) { showInlineError('#offerError','Укажите название'); return; }
  if (!(payload.qty_total > 0)) { showInlineError('#offerError','Количество должно быть больше 0'); return; }
  if (!(payload.price > 0)) { showInlineError('#offerError','Новая цена должна быть больше 0'); return; }
  if (payload.original_price && payload.price >= payload.original_price) { showInlineError('#offerError','Новая цена должна быть меньше обычной'); return; }
  if (!payload.expires_at) { showInlineError('#offerError','Укажите срок действия оффера'); return; }
  if (!rid) { showInlineError('#offerError','Вы не авторизованы. Войдите и попробуйте снова.'); activateTab('auth'); return; }

  const btn = form.querySelector('button[type="submit"]');
  try {
    if (btn) { btn.disabled = true; btn.textContent = 'Сохранение…'; }
    await postOfferStrict(payload);
    showToast('Оффер сохранён ✓');
    try { form.reset(); } catch(_){}
    activateTab('offers');
    try { await loadOffers(); } catch(_){}
    try { refreshDashboard && refreshDashboard(); } catch(_){}
  } catch (e2) {
    showInlineError('#offerError', e2?.message || 'Ошибка при сохранении');
    if (String(e2.message||'').startsWith('401')) activateTab('auth');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Создать оффер'; }
  }
});
const ok = gate(); 
    try { if (ok) { refreshDashboard(); } } catch(_) {}
if (!ok) activateTab('auth');
    } catch(e){ console.error(e); const a = document.getElementById('auth'); if (a) { a.classList.add('active'); } }
  });
})();


// Foody patch: make "Создать оффер" button full width (failsafe)
(function(){
  const onReady = (fn)=>{ if (document.readyState==='complete' || document.readyState==='interactive') setTimeout(fn,0);
                          else document.addEventListener('DOMContentLoaded', fn); };
  onReady(()=>{
    try {
      const form = document.getElementById('offerForm');
      if (!form) return;
      const btn = form.querySelector('button[type="submit"]');
      if (btn){ btn.classList.add('full'); btn.style.width='100%'; btn.style.display='block'; }
    } catch(_){}
  });
})();


  // Password eye toggle (global for auth & profile)
  document.addEventListener('click', function(e){
    const btn = e.target.closest('.pwd-toggle'); if (!btn) return;
    const input = btn.parentElement?.querySelector('input'); if (!input) return;
    const isText = input.type === 'text';
    input.type = isText ? 'password' : 'text';
    btn.setAttribute('aria-pressed', (!isText).toString());
    if (!isText) { input.setAttribute('data-pwd-is-text','1'); } else { input.removeAttribute('data-pwd-is-text'); }
  });


/* === Helpers for QR/Брони === */
function ruStatus(s){
  switch(String(s||'').toLowerCase()){
    case 'active': return 'Активна';
    case 'redeemed': return 'Погашена';
    case 'expired': return 'Истёкшая';
    case 'canceled':
    case 'cancelled': return 'Отменена';
    default: return s||'—';
  }
}
function uniqBy(arr, keyFn){
  const seen = new Set();
  const out = [];
  for (const x of arr||[]){
    const k = keyFn(x);
    if (k==null) continue;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(x);
  }
  return out;
}

function loadReservations(reset=false){
  try{
    const rid = (window.state && window.state.rid) || Number(localStorage.getItem('restaurant_id')||localStorage.getItem('foody_restaurant_id')||0);
    const key = (window.state && window.state.key) || localStorage.getItem('api_key') || localStorage.getItem('foody_key') || '';
    if (!rid || !key){
      const tbl = document.getElementById('reservationsTableBody');
      if (tbl) tbl.innerHTML = '';
      const empty = document.getElementById('reservationsEmpty');
      if (empty) { empty.textContent='Войдите, чтобы просматривать брони'; empty.style.display=''; }
      return;
    }
    if (!window.__resvState || reset){ window.__resvState = { items:[], offset:0, limit:50, total:null }; }
    const st = window.__resvState;
    const params = new URLSearchParams();
    params.set('restaurant_id', String(rid));
    params.set('status', (document.getElementById('resvStatus')||{}).value||'');
    params.set('q', (document.getElementById('resvSearch')||{}).value||'');
    params.set('limit', String(st.limit));
    params.set('offset', String(st.offset));
    fetch((window.__FOODY__?.FOODY_API||'https://foodyback-production.up.railway.app') + '/api/v1/merchant/reservations?' + params.toString(), {
      headers:{ 'X-Foody-Key': key }
    }).then(r=>r.json().then(d=>[r.status,d])).then(([code, data])=>{
      if (code>=200 && code<300){
        const list = Array.isArray(data.items)? data.items : (Array.isArray(data)? data : []);
        st.total = data.total ?? st.total;
        st.offset += list.length;
        const merged = st.items.concat(list);
        st.items = uniqBy(merged, x => x.id ?? x.code ?? x._id ?? `${x.offer_id||''}:${x.created_at||''}`);
        renderReservations(st.items);
      }
    }).catch(()=>{});
  }catch(e){ console.error(e); }
}


// Russian labels for reservation statuses
const STATUS_LABELS = { active:'Активная', redeemed:'Погашена', expired:'Истекла', canceled:'Отменена' };

// Safe render for reservations list (QR tab)
function renderReservationsList(items){
  const wrap = document.getElementById('res_rows') || document.getElementById('reservationsBody') || document.getElementById('tbody');
  if (!wrap) return;
  wrap.innerHTML = '';
  (items||[]).forEach((r)=>{
    const tr = document.createElement('div');
    tr.className = 'row';
    const st = (STATUS_LABELS[r.status] || r.status);
    const code = r.code || r.id;
    const offer = r.offer_title || r.offer_id || '';
    const created = (r.created_at? new Date(r.created_at).toLocaleString('ru-RU') : '');
    const until = (r.expires_at? new Date(r.expires_at).toLocaleString('ru-RU') : '');
    tr.innerHTML = `<div>${created}</div><div>${code}</div><div>${offer}</div><div>${st}</div><div>${until}</div>`;
    wrap.appendChild(tr);
  });
}


/* === Geolocation → Address autofill (registration & profile) === */
(function(){
  function ensureHiddenFields(targetId){
    var el = document.getElementById(targetId);
    if(!el) return null;
    var form = el.closest('form') || document;
    var lat = form.querySelector('input[name="lat"]') || document.createElement('input');
    var lng = form.querySelector('input[name="lng"]') || document.createElement('input');
    if(!lat.getAttribute('name')){ lat.type='hidden'; lat.name='lat'; form.appendChild(lat); }
    if(!lng.getAttribute('name')){ lng.type='hidden'; lng.name='lng'; form.appendChild(lng); }
    return {lat,lng,form,el};
  }
  function setAddress(targetId, text, lat, lng){
    var els = ensureHiddenFields(targetId);
    if(!els) return;
    els.el.value = text || '';
    els.lat.value = lat!=null? String(lat):'';
    els.lng.value = lng!=null? String(lng):'';
  }
  function composeAddress(obj){
    if(!obj) return '';
    var a = obj.address||{};
    var parts = [];
    if(a.road) parts.push(a.road);
    if(a.house_number) parts.push(a.house_number);
    var street = parts.join(' ').trim();
    var city = a.city || a.town || a.village || a.municipality || '';
    var state = a.state || '';
    var country = a.country || '';
    var result = [street, city, state, country].filter(Boolean).join(', ');
    return result || obj.display_name || '';
  }
  async function reverseGeocode(lat, lng){
    try{
      const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}&accept-language=ru`;
      const res = await fetch(url, { headers: { 'Accept':'application/json' } });
      if(!res.ok) throw new Error('geocode');
      const data = await res.json();
      return data;
    }catch(e){ return null; }
  }
  async function geoTo(targetId){
    var status = document.getElementById('geo_status');
    if(status){ status.textContent = 'Определяем местоположение…'; }
    if(!('geolocation' in navigator)){
      if(status){ status.textContent = 'Геолокация не поддерживается'; }
      return;
    }
    navigator.geolocation.getCurrentPosition(async (pos)=>{
      const lat = pos.coords.latitude, lng = pos.coords.longitude;
      if(status){ status.textContent = 'Ищем адрес…'; }
      const info = await reverseGeocode(lat, lng);
      const text = composeAddress(info);
      setAddress(targetId, text, lat, lng);
      if(status){ status.textContent = 'Адрес подставлен — проверьте и при необходимости исправьте.'; }
    }, (err)=>{
      if(status){ status.textContent = 'Не удалось получить геолокацию'; }
    }, { enableHighAccuracy:true, timeout: 10000 });
  }
  function onClick(e){
    var b = e.target.closest('.geoloc-btn');
    if(!b) return;
    var targetId = b.getAttribute('data-target') || 'address';
    geoTo(targetId);
  }
  document.addEventListener('click', onClick);
  // Auto-suggest on registration open: try once
  window.foodySuggestGeoOnce = window.foodySuggestGeoOnce || false;
  function maybeSuggest(){
    if(window.foodySuggestGeoOnce) return;
    window.foodySuggestGeoOnce = true;
    var regAddr = document.getElementById('reg_address');
    if(regAddr && !regAddr.value){
      // non-intrusive: show a small hint
      var hint = document.getElementById('geo_status');
      if(!hint){ hint = document.createElement('div'); hint.id='geo_status'; hint.className='muted'; regAddr.parentElement.appendChild(hint); }
      hint.textContent = 'Можно автоматически подставить адрес — нажмите «Определить гео»';
    }
  }
  document.addEventListener('DOMContentLoaded', maybeSuggest);
})();

(() => {
  // ===== Helpers =====
  const $ = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
  const API = ((window.__FOODY__ && window.__FOODY__.FOODY_API) || window.foodyApi || 'https://foodyback-production.up.railway.app').replace(/\/+$/,'');

  // toast
  function toast(msg){
    let box = $('#toast');
    if(!box){ box = document.createElement('div'); box.id='toast'; document.body.appendChild(box); }
    const el = document.createElement('div'); el.className='toast'; el.textContent = msg;
    box.appendChild(el); setTimeout(()=> el.remove(), 3200);
  }

  // fetch JSON with small helper
  async function getJSON(path){
    const res = await fetch(API + path, { headers: { 'Accept': 'application/json' } });
    if(!res.ok){
      let msg = res.status + ' ' + res.statusText;
      try { const j = await res.json(); if (j && (j.detail||j.message)) msg = j.detail||j.message; } catch(_){}
      throw new Error(msg);
    }
    try { return await res.json(); } catch(_) { return []; }
  }

  // ===== State =====
  const state = {
    offers: [],
    current: null, // current offer object
  };

  // ===== Rendering =====
  function money(n){ const v = Number(n||0); return isFinite(v) ? Math.round(v) + ' ₽' : '—'; }
  function discount(old, price){
    const o = Number(old||0), p = Number(price||0);
    if(!(o>0 && p>0) || p>=o) return 0;
    return Math.round((1 - p/o) * 100);
  }
  function short(text, n=120){
    const s = String(text||'').replace(/\s+/g,' ').trim();
    if (!s) return '';
    return s.length > n ? s.slice(0, n-1).trim() + '…' : s;
  }
  function fmtDate(iso){
    if(!iso) return '—';
    try { return new Date(iso).toLocaleString('ru-RU', { dateStyle:'short', timeStyle:'short' }); }
    catch(_){ return '—'; }
  }

  function renderGrid(list){
    const grid = $('#grid'); const skeleton = $('#gridSkeleton');
    if (skeleton) skeleton.classList.add('hidden');
    if (!grid) return;

    if (!Array.isArray(list) || list.length === 0){
      grid.innerHTML = '<div class="card">Ничего не найдено. Попробуйте поменять фильтры.</div>';
      return;
    }

    const cards = list.map(o => {
      const id = o.id ?? o.offer_id ?? o._id ?? '';
      const img = o.image_url || o.photo_url || '';
      const title = o.title || o.name || 'Без названия';
      const price = (o.price_cents!=null ? o.price_cents/100 : (o.price ?? 0));
      const old = (o.original_price_cents!=null ? o.original_price_cents/100 : (o.original_price ?? 0));
      const disc = discount(old, price);
      const qtyLeft = (o.qty_left ?? o.qty ?? o.quantity ?? o.qty_total ?? '');
      const exp = fmtDate(o.expires_at || o.expires || o.until);
      const desc = short(o.description || o.desc || '');
      return `
        <div class="card item" data-offer-id="${id}" role="button" tabindex="0" aria-label="Открыть ${title}">
          <div class="grid two">
            <div class="full" style="display:flex; gap:12px; align-items:center;">
              <div style="width:82px; height:82px; border-radius:12px; overflow:hidden; background:#10161d; border:1px solid var(--border); flex:0 0 82px;">
                ${img ? `<img src="${img}" alt="" style="width:100%;height:100%;object-fit:cover;display:block;">` : ''}
              </div>
              <div style="flex:1; min-width:0">
                <div class="card-title" style="margin:0 0 6px 0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${title}</div>
                <div class="muted small desc" style="display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;">${desc||'Без описания'}</div>
              </div>
            </div>
            <div style="display:flex; gap:10px; align-items:center;">
              <div class="price" style="font-weight:800">${money(price)}</div>
              ${old ? `<div class="old muted" style="text-decoration:line-through">${money(old)}</div>` : ''}
              ${disc ? `<div class="badge">-${disc}%</div>` : ''}
            </div>
            <div class="muted small" style="text-align:right;">Остаток: ${qtyLeft||'—'} · До: ${exp}</div>
          </div>
        </div>
      `;
    }).join('');
    grid.innerHTML = cards;
  }

  // ===== Sheet (details) =====
  function openSheet(offer){
    if (!offer) return;
    state.current = offer;
    const sheet = $('#sheet'); if (!sheet) return;
    sheet.dataset.offerId = offer.id ?? offer.offer_id ?? '';
    $('#sTitle').textContent = offer.title || offer.name || '—';
    $('#sImg').src = offer.image_url || offer.photo_url || '';
    const price = (offer.price_cents!=null ? offer.price_cents/100 : (offer.price ?? 0));
    const old = (offer.original_price_cents!=null ? offer.original_price_cents/100 : (offer.original_price ?? 0));
    $('#sPrice').textContent = money(price);
    $('#sOld').textContent = old ? money(old) : '—';
    $('#sQty').textContent = 'Остаток: ' + (offer.qty_left ?? offer.qty ?? offer.quantity ?? offer.qty_total ?? '—');
    $('#sExp').textContent = 'Действует до: ' + fmtDate(offer.expires_at || offer.expires || offer.until);
    $('#sLeft').textContent = '';
    $('#sDesc').textContent = offer.description || offer.desc || '—';
    const btn = $('#reserveBtn');
    if (btn){
      btn.dataset.offerId = String(sheet.dataset.offerId || '');
      btn.disabled = false;
      btn.textContent = 'Забронировать';
    }
    sheet.classList.remove('hidden'); sheet.setAttribute('aria-hidden','false');
  }
  function closeSheet(){
    const sheet = $('#sheet'); if (!sheet) return;
    sheet.classList.add('hidden'); sheet.setAttribute('aria-hidden','true');
  }

  // click handlers for grid -> open sheet
  function bindGridClicks(){
    $('#grid')?.addEventListener('click', (e)=>{
      const card = e.target.closest('.item[data-offer-id]');
      if (!card) return;
      const id = card.getAttribute('data-offer-id');
      const offer = state.offers.find(o => String(o.id ?? o.offer_id ?? '') === String(id));
      if (offer) openSheet(offer);
    });
    $('#grid')?.addEventListener('keydown', (e)=>{
      if (e.key === 'Enter' || e.key === ' '){
        const card = e.target.closest('.item[data-offer-id]');
        if (!card) return;
        e.preventDefault();
        const id = card.getAttribute('data-offer-id');
        const offer = state.offers.find(o => String(o.id ?? o.offer_id ?? '') === String(id));
        if (offer) openSheet(offer);
      }
    });
    $('#sheetClose')?.addEventListener('click', closeSheet);
  }

  // ===== Booking & QR =====
  async function post(url, body){
    const res = await fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body||{}) });
    const ct = res.headers.get('content-type')||'';
    const data = ct.includes('application/json') ? await res.json().catch(()=> ({})) : {};
    if (!res.ok) {
      const msg = data?.detail || data?.message || (res.status + ' ' + res.statusText);
      throw new Error(msg);
    }
    return data;
  }
  async function createReservation(offerId){
    const body = { offer_id: offerId };
    const tries = [
      API + '/api/v1/public/reservations',
      API + '/api/v1/reservations',
      API + '/api/v1/public/reserve',
      API + '/api/v1/reserve'
    ];
    let lastErr = null;
    for (const u of tries){
      try { return await post(u, body); } catch(e){ lastErr = e; }
    }
    throw lastErr || new Error('Не удалось создать бронь');
  }
  function extractCode(resp){
    if (!resp) return '';
    if (typeof resp === 'string') return resp;
    return resp.code || resp.reservation_code || resp.token || resp.id || resp.reservation_id || '';
  }
  async function drawQr(code){
    const canvas = $('#qrCanvas');
    if (!canvas || !window.QRCode) return;
    const ctx = canvas.getContext('2d'); ctx.clearRect(0,0,canvas.width,canvas.height);
    await new Promise(res => QRCode.toCanvas(canvas, String(code), { width: canvas.width }, res));
  }
  async function onReserve(){
    const btn = $('#reserveBtn');
    const sheet = $('#sheet');
    const offerId = btn?.dataset?.offerId || sheet?.dataset?.offerId || (state.current && (state.current.id ?? state.current.offer_id));
    if (!offerId){
      toast('Не удаётся определить оффер для брони');
      return;
    }
    if (btn.disabled) return;
    const old = btn.textContent;
    btn.disabled = true; btn.textContent = 'Оформляем…';
    try {
      const resp = await createReservation(offerId);
      const code = extractCode(resp);
      if (!code) throw new Error('Сервер не вернул код брони');
      $('#qrCodeText').textContent = String(code);
      await drawQr(code);
      $('#qrModal').classList.remove('hidden');
      $('#qrModal').setAttribute('aria-hidden','false');
      toast('Бронь оформлена ✓');
    } catch (e){
      toast(e.message || 'Ошибка бронирования');
    } finally {
      btn.disabled = false; btn.textContent = old;
    }
  }
  function closeQr(){
    $('#qrModal')?.classList.add('hidden');
    $('#qrModal')?.setAttribute('aria-hidden','true');
  }

  // ===== Load & filters (minimal) =====
  async function load(){
    const skeleton = $('#gridSkeleton'); if (skeleton) skeleton.classList.remove('hidden');
    try {
      const data = await getJSON('/api/v1/public/offers');
      const list = (data && (data.items || data.results)) ? (data.items || data.results) : (Array.isArray(data) ? data : []);
      state.offers = list;
      renderGrid(list);
    } catch(e){
      toast('Не удалось загрузить офферы: ' + (e.message||e));
      const grid = $('#grid'); if (grid) grid.innerHTML = '<div class="card">Ошибка загрузки</div>';
    } finally {
      if (skeleton) skeleton.classList.add('hidden');
    }
  }

  function bindToolbar(){
    $('#refresh')?.addEventListener('click', load);
  }

  // ===== Init =====
  function init(){
    bindToolbar();
    bindGridClicks();
    $('#reserveBtn')?.addEventListener('click', onReserve);
    $('#qrOk')?.addEventListener('click', closeQr);
    $('#qrClose')?.addEventListener('click', closeQr);
    load();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
