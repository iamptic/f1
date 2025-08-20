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
      if (tab === 'qr') { try{ initQrTab(); loadReservations(true); }catch(_){} }
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
      if (res.status === 204) { if (raw) return res; return null; }
      if (!res.ok) {
        const ct = res.headers.get('content-type')||'';
        let msg = `${res.status} ${res.statusText}`;
        if (ct.includes('application/json')) {
          let j = null; try { j = await res.json(); } catch(_) {}
          if (j && (j.detail || j.message)) msg = j.detail || j.message || msg;
        } else {
          let t = ''; try { t = await res.text(); } catch(_) {}
          if (t) msg += ` — ${t.slice(0,180)}`;
        }
        throw new Error(msg);
      }
      if (raw) return res;
      const ct2 = res.headers.get('content-type') || '';
      if (ct2.includes('application/json')) { try { return await res.json(); } catch(_) { return null; } }
      try { return await res.text(); } catch(_) { return ''; }
    } catch (err) {
      if (String(err.message).includes('Failed to fetch')) throw new Error('Не удалось связаться с сервером. Проверьте соединение или CORS.');
      throw err;
    }
  }

  // ===== City Picker =====
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
      const inp = getTargetInput(); const btn = getTargetButton();
      if (inp) inp.value = city || '';
      if (btn) { btn.querySelector('.hint').style.display = city ? 'none' : ''; btn.querySelector('.value').textContent = city || ''; }
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
      renderChips(items); highlightCurrent();
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

  // ===== Auth =====
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

  // ===== Профиль =====
  function loadCityToProfileUI(city){
    const btn = $('#profileCityOpen'); const inp = $('#profileCityValue');
    if (btn && inp) { btn.querySelector('.hint').style.display = city ? 'none' : ''; btn.querySelector('.value').textContent = city || ''; inp.value = city || ''; }
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
    } finally { if (btn){btn.disabled=false;btn.textContent='Сохранить';} }
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
    } finally { if (btn){btn.disabled=false;btn.textContent='Сменить пароль';} }
  });

  // ===== Офферы =====
  async function loadOffers() {
    if (state._offersLoading) return; state._offersLoading = true;
    if (!state.rid || !state.key) return;
    const root = $('#offerList'); if (root) root.innerHTML = '<div class="skeleton"></div><div class="skeleton"></div>';
    try {
      const data = await api(`/api/v1/merchant/offers?restaurant_id=${encodeURIComponent(state.rid)}`);
      const list = (data && (data.items || data.results)) ? (data.items || data.results) : (Array.isArray(data) ? data : []);
      renderOffers(list);
    } catch (err) {
      console.error(err);
      if (root) root.innerHTML = '<div class="hint">Не удалось загрузить</div>';
    } finally { state._offersLoading = false; }
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
        <div><button class="btn-ghost" data-edit="${o.id}">Ред.</button></div>
      </div>`;
    }).join('');
    root.innerHTML = `<div class="row head">
      <div>Название</div><div>Цена</div><div>Скидка</div><div>Ост.</div><div>Истекает</div><div></div>
    </div>${rows}`;
  }

  // ===== Брони / QR =====
  function statusRu(s){
    const map = { active:'Активна', redeemed:'Погашена', canceled:'Отменена', expired:'Истекла' };
    return map[s] || s || '—';
  }

  async function loadReservations(force=false){
    if (!state.rid || !state.key) return;
    if (state._resvLoading && !force) return;
    state._resvLoading = true;
    const root = $('#resvList'); if (root) root.innerHTML = '<div class="skeleton"></div>';
    try{
      const data = await api(`/api/v1/merchant/reservations?restaurant_id=${encodeURIComponent(state.rid)}`);
      const list = Array.isArray(data?.items) ? data.items : (Array.isArray(data)?data:[]);
      renderReservations(list);
    }catch(err){ console.warn(err); if (root) root.innerHTML = '<div class="hint">Не удалось загрузить</div>'; }
    finally{ state._resvLoading = false; }
  }

  function renderReservations(list){
    const root = $('#resvList'); if (!root) return;
    if (!list.length){ root.innerHTML = '<div class="hint">Броней пока нет</div>'; return; }
    const fmt = new Intl.DateTimeFormat('ru-RU', { dateStyle:'short', timeStyle:'short' });
    root.innerHTML = list.map(r => {
      const when = r.created_at ? fmt.format(new Date(r.created_at)) : '—';
      const code = r.code || r.reserve_code || '—';
      const st = statusRu(r.status);
      const canRedeem = r.status === 'active';
      return `<div class="list-cards item" data-res-id="${r.id}">
        <div>
          <div><strong>${r.offer_title || 'Оффер'}</strong></div>
          <div class="hint">Создана: ${when} • Код: <b>${code}</b></div>
          <div class="hint">Статус: <b>${st}</b></div>
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          <button class="btn-ghost" data-scan="${code}">Сканировать</button>
          <button class="btn btn-primary" data-redeem="${code}" ${canRedeem?'':'disabled'}>Погасить</button>
        </div>
      </div>`;
    }).join('');

    root.onclick = async (e) => {
      const btn = e.target.closest('button'); if (!btn) return;
      const code = btn.dataset.redeem || btn.dataset.scan;
      if (!code) return;
      if (btn.dataset.scan){
        // просто подсказка: используйте камеру/сканер в будущем
        showToast(`Скан: введите код ${code} (скоро подключим камеру)`);
        return;
      }
      if (btn.dataset.redeem){
        try{
          await api('/api/v1/merchant/reservations/redeem', { method:'POST', body: JSON.stringify({ restaurant_id: state.rid, code }) });
          showToast('Бронь погашена ✅');
          loadReservations(true);
        }catch(err){ showToast(String(err.message||'Ошибка погашения')); }
      }
    };
  }

  function initQrTab(){
    // можно вставить будущую инициализацию сканера, пока — ничего
  }

  // ===== Создание оффера =====
  function initCreateTab(){
    try {
      const ex = $('#expires_at');
      if (window.flatpickr && ex && !ex._flatpickr) {
        if (window.flatpickr.l10ns && window.flatpickr.l10ns.ru) { flatpickr.localize(flatpickr.l10ns.ru); }
        flatpickr('#expires_at', { enableTime:true, time_24hr:true, minuteIncrement:5, dateFormat:'Y-m-d H:i', altInput:true, altFormat:'d.m.Y H:i', defaultDate:new Date(Date.now()+60*60*1000), minDate:'today' });
      }
      const bb = $('#best_before');
      if (window.flatpickr && bb && !bb._flatpickr) {
        if (window.flatpickr.l10ns && window.flatpickr.l10ns.ru) { flatpickr.localize(flatpickr.l10ns.ru); }
        flatpickr('#best_before', { enableTime:true, time_24hr:true, minuteIncrement:5, dateFormat:'Y-m-d H:i', altInput:true, altFormat:'d.m.Y H:i', minDate:'today' });
      }
      bindDiscountPresets();
      autoRoundOfferPrice();
      bindExpirePresets();
    } catch (_) {}
  }

  // ==== старт
  bindWorkPresets('#profileWorkPresets','[name="work_from"]','[name="work_to"]');
  CityPicker.setInitial('#cityOpen', '#cityValue');
  CityPicker.setInitial('#profileCityOpen', '#profileCityValue');

  // клики на сегментах/нижнем меню переводят на вкладку
  on('#tabs','click', (e) => { const b = e.target.closest('[data-tab]'); if (b) activateTab(b.dataset.tab); });
  $$('.bottom-nav .nav-btn').forEach(b => b.addEventListener('click', () => activateTab(b.dataset.tab)));

  // Входной гейт
  if (!gate()) activateTab('auth'); else activateTab('offers');

})();
