(() => {
  const $ = (s, r=document) => r.querySelector(s);
  const API = (window.__FOODY__ && window.__FOODY__.FOODY_API) || "https://foodyback-production.up.railway.app";
  const toastBox = $('#toast') || (()=>{ const d=document.createElement('div'); d.id='toast'; document.body.appendChild(d); return d; })();
  const toast = (m) => { const el=document.createElement('div'); el.className='toast'; el.textContent=m; toastBox.appendChild(el); setTimeout(()=>el.remove(), 3000); };

  // --- Auth creds from localStorage (baseline) ---
  const creds = () => ({ restaurant_id: Number(localStorage.getItem('restaurant_id')||0), api_key: localStorage.getItem('api_key')||'' });

  // --- Tabs ---
  function activateTab(tab){
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab===tab));
    document.querySelectorAll('.tab').forEach(s => s.classList.toggle('active', s.id===tab));
    if (tab !== 'qr') stopScan(); else initQrTab(true);
  }
  document.addEventListener('click', (e)=>{
    const b = e.target.closest('.tab-btn'); if(!b) return;
    activateTab(b.dataset.tab);
  });

  // --- QR / Reservations logic ---
  let qrStream = null;
  let scanning = false;
  let scanLoopReq = 0;
  let scanningGuard = false; // prevent double redeem

  async function startScan(){
    try{
      stopScan();
      const video = $('#qr_video');
      if(!video){ toast('Нет элемента видео'); return; }
      const constraints = { video: { facingMode: 'environment' } };
      qrStream = await navigator.mediaDevices.getUserMedia(constraints);
      video.srcObject = qrStream;
      await video.play();
      scanning = true;
      scanningGuard = false;
      if ('BarcodeDetector' in window){
        const det = new window.BarcodeDetector({ formats: ['qr_code','code_128','code_39','ean_13','ean_8','upc_a','upc_e'] });
        const loop = async () => {
          if (!scanning) return;
          try{
            const codes = await det.detect(video);
            if (codes && codes.length){
              const raw = (codes[0].rawValue || '').trim();
              if (raw && !scanningGuard){
                scanningGuard = true;
                stopScan();
                $('#qr_code').value = raw;
                redeem(raw);
                return;
              }
            }
          }catch(_){ /* ignore frame errors */ }
          scanLoopReq = requestAnimationFrame(loop);
        };
        scanLoopReq = requestAnimationFrame(loop);
      }else{
        toast('Сканер недоступен в этом браузере');
      }
    }catch(e){
      console.error(e);
      toast('Не удалось открыть камеру');
    }
  }

  function stopScan(){
    scanning = false;
    if (scanLoopReq) cancelAnimationFrame(scanLoopReq);
    const video = $('#qr_video');
    if (video) { try{ video.pause(); }catch(_){} video.srcObject = null; }
    if (qrStream){
      try{ qrStream.getTracks().forEach(t=>t.stop()); }catch(_){}
      qrStream = null;
    }
  }

  async function redeem(code){
    const { api_key } = creds();
    if(!code){ toast('Введите код'); return; }
    try{
      const res = await fetch(`${API}/api/v1/merchant/reservations/${encodeURIComponent(code)}/redeem`, {
        method: 'POST', headers: { 'X-Foody-Key': api_key }
      });
      const data = await res.json().catch(()=>({}));
      if(!res.ok){ throw new Error(data?.detail || 'Ошибка погашения'); }
      toast('Погашено ✅');
      // refresh list
      state.offset = 0; state.items = []; await loadList(true);
    }catch(e){
      toast(e.message || 'Не удалось погасить');
    }
  }

  // clipboard helper
  async function tryAutofillFromClipboard(el){
    if(!navigator.clipboard) return;
    try{
      const text = (await navigator.clipboard.readText() || '').trim();
      if (/^[A-Z0-9\-]{4,20}$/i.test(text)){
        el.value = text;
      }
    }catch(_){}
  }

  function initQrTab(focus=false){
    const input = $('#qr_code');
    const redeemBtn = $('#qr_redeem_btn');
    const scanBtn = $('#qr_scan_btn');
    const stopBtn = $('#qr_stop_btn');
    if (redeemBtn && !redeemBtn.dataset.bound){ redeemBtn.dataset.bound='1'; redeemBtn.onclick = () => redeem(input.value); }
    if (scanBtn && !scanBtn.dataset.bound){ scanBtn.dataset.bound='1'; scanBtn.onclick = startScan; }
    if (stopBtn && !stopBtn.dataset.bound){ stopBtn.dataset.bound='1'; stopBtn.onclick = stopScan; }
    if (input && !input.dataset.bound){
      input.dataset.bound='1';
      input.addEventListener('keydown', (ev)=>{ if(ev.key==='Enter'){ ev.preventDefault(); redeem(input.value); }});
    }
    if (focus && input){ input.focus(); tryAutofillFromClipboard(input); }
    // List controls
    const q = $('#qr_q'); const s = $('#qr_status'); const ref = $('#qr_refresh'); const more = $('#qr_more');
    if (q && !q.dataset.bound){ q.dataset.bound='1'; q.oninput = () => { state.q = q.value.trim(); loadList(true); }; }
    if (s && !s.dataset.bound){ s.dataset.bound='1'; s.onchange = () => { state.status = s.value; loadList(true); }; }
    if (ref && !ref.dataset.bound){ ref.dataset.bound='1'; ref.onclick = () => loadList(true); }
    if (more && !more.dataset.bound){ more.dataset.bound='1'; more.onclick = () => loadList(false); }
    loadList(true);
  }

  // stop camera when page hidden or before unload
  document.addEventListener('visibilitychange', () => { if (document.hidden) stopScan(); });
  window.addEventListener('beforeunload', stopScan);

  // --- List of reservations in the right panel ---
  const state = { items: [], total: 0, offset: 0, limit: 20, q: '', status: '', loading: false };
  function fmt(s){ if(!s) return '—'; try{ return new Date(s).toLocaleString('ru-RU'); }catch{ return s; } }
  function renderList(){
    $('#qr_total').textContent = `Всего: ${state.total}`;
    const tbody = $('#qr_tbody'); tbody.innerHTML = '';
    state.items.forEach(r => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${fmt(r.created_at)}</td>
        <td><b>${r.code || r.id}</b></td>
        <td>${r.offer_id}</td>
        <td>${r.status}</td>
        <td>${fmt(r.expires_at)}</td>
        <td>${r.phone || '—'}</td>
        <td>${r.status==='active' ? '<button class="btn primary" data-act="redeem" data-code="'+(r.code||r.id)+'">Погасить</button> <button class="btn" data-act="cancel" data-code="'+(r.code||r.id)+'">Отменить</button>' : ''}</td>
      `;
      tbody.appendChild(tr);
    });
  }
  async function loadList(reset){
    if(state.loading) return;
    const { restaurant_id, api_key } = creds();
    if(!restaurant_id || !api_key){ toast('Не авторизованы'); return; }
    if(reset){ state.offset=0; state.items=[]; }
    state.loading=true;
    try{
      const params = new URLSearchParams();
      params.set('restaurant_id', String(restaurant_id));
      if(state.status) params.set('status', state.status);
      if(state.q) params.set('q', state.q);
      params.set('limit', String(state.limit));
      params.set('offset', String(state.offset));
      const res = await fetch(`${API}/api/v1/merchant/reservations?`+params.toString(), { headers:{'X-Foody-Key': api_key} });
      const data = await res.json();
      if(!res.ok){ throw new Error(data?.detail || 'Ошибка загрузки'); }
      state.total = data.total || 0;
      const items = Array.isArray(data.items)? data.items : [];
      state.items = state.items.concat(items);
      state.offset += items.length;
      renderList();
    }catch(e){ toast(e.message || 'Сеть недоступна'); }
    finally{ state.loading=false; }
  }

  document.addEventListener('click', (ev)=>{
    const b = ev.target.closest('button[data-act]'); if(!b) return;
    const act = b.dataset.act; const code = b.dataset.code;
    if (act==='redeem') redeem(code);
    if (act==='cancel') cancelRes(code);
  });

  async function cancelRes(code){
    const { api_key } = creds();
    try{
      const res = await fetch(`${API}/api/v1/merchant/reservations/${encodeURIComponent(code)}/cancel`, {
        method:'POST', headers:{'X-Foody-Key': api_key}
      });
      const data = await res.json();
      if(!res.ok){ throw new Error(data?.detail || 'Ошибка отмены'); }
      toast('Отменено');
      state.offset=0; state.items=[]; await loadList(true);
    }catch(e){ toast(e.message || 'Не удалось отменить'); }
  }

  // Initial
  document.addEventListener('DOMContentLoaded', () => {
    // if opening directly on this page, initialize QR tab
    initQrTab(true);
  });
})();
