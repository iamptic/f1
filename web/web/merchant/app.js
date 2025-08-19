
(() => {
  const $ = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => r.querySelectorAll(s);
  const tg = window.Telegram?.WebApp;
  if (tg) { tg.expand(); }

  const FOODY_API = (window.__FOODY__ && window.__FOODY__.FOODY_API) || "https://foodyback-production.up.railway.app";

  // ---------------- Toast ----------------
  const toastBox = $('#toast') || (()=>{ const d=document.createElement('div'); d.id='toast'; document.body.appendChild(d); return d; })();
  function toast(m){ const el=document.createElement('div'); el.className='toast'; el.textContent=m; toastBox.appendChild(el); setTimeout(()=>el.remove(), 3200); }
  window.FOODY = window.FOODY || {}; window.FOODY.toast = toast;

  // ---------------- Gate ----------------
  function getAuth(){ try{ const s=localStorage.getItem('foody_auth'); return s?JSON.parse(s):null; }catch(_){ return null; } }
  function isAuthed(){ const a=getAuth(); return !!(a && a.restaurant_id && a.api_key); }
  function toggleGateUI(){
    const authed = isAuthed();
    $$('.need-auth').forEach(el => el.classList.toggle('hidden', authed));
    const dash = $('#section-dashboard') || $('.merchant-dashboard'); if (dash) dash.classList.toggle('hidden', !authed);
    const tabs = $('#tabs'); if (tabs) tabs.style.display = '';
    const logoutBtn = $('#logoutBtn'); if (logoutBtn) logoutBtn.style.display = '';
  }
  window.FOODY.getAuth = getAuth;
  window.FOODY.isAuthed = isAuthed;
  window.FOODY.toggleGateUI = toggleGateUI;

  // storage + logout click reactions
  window.addEventListener('storage', e => { if (e.key === 'foody_auth') toggleGateUI(); });
  document.addEventListener('click', e => {
    const btn = e.target.closest('#logoutBtn,[data-logout]'); if (!btn) return;
    setTimeout(toggleGateUI,150);
  });

  // ---------------- Tabs ----------------
  function norm(name){
    if (!name) return '';
    const t = (''+name).toLowerCase().trim().replace(/^#/,'');
    if (t.includes('дашборд')||t==='dashboard') return 'dashboard';
    if (t.includes('оффер')||t==='offers') return 'offers';
    if (t.includes('создат')||t==='create') return 'create';
    if (t.includes('профил')||t==='profile') return 'profile';
    if (t.includes('брон')||t.includes('qr')||t.includes('reserve')) return 'reservations';
    if (t.startsWith('section-')) return t.replace('section-','');
    return t;
  }
  function setActiveTab(name){
    const n = norm(name)||'dashboard';
    const id = 'section-'+n;
    const sections = Array.from($$('[id^="section-"]'));
    let target = $('#'+id) || sections[0];
    sections.forEach(el => el.classList.toggle('hidden', el!==target));
    $$('.seg-btn, .nav-btn, [data-tab], a[href^="#"]').forEach(btn=>{
      const key = norm(btn.dataset.tab||btn.dataset.target||btn.dataset.name||(btn.getAttribute('href')||'').replace('#','')||btn.id);
      btn.classList.toggle('active', key === (target ? target.id.replace('section-','') : ''));
    });
    try{ history.replaceState(null,'','#'+(target?target.id.replace('section-',''):'dashboard')); }catch(_){}
    try{ document.body.dataset.mode = target?target.id.replace('section-',''):'dashboard'; }catch(_){}
    if ((target && target.id === 'section-reservations') && !window.__resvInit) { window.__resvInit = true; Reservations.init(); }
  }
  document.addEventListener('click', e => {
    const btn = e.target.closest('.seg-btn,.nav-btn,[data-tab],a[href^="#"]'); if (!btn) return;
    const name = btn.dataset.tab||btn.dataset.target||btn.dataset.name||(btn.getAttribute('href')||'').replace('#','')||btn.id;
    if (!name) return; if (btn.tagName==='A'&&btn.getAttribute('href')?.startsWith('#')) e.preventDefault();
    setActiveTab(name);
  });
  window.addEventListener('hashchange', () => setActiveTab((location.hash||'').replace('#','')));

  // ---------------- Offers (minimal list + CSV) ----------------
  const Offers = (()=>{
    const els = { table: $('#offersTable'), empty: $('#offersEmpty') };
    function money(c){ return Math.round((c||0)/100)+' ₽'; }
    async function load(){
      const auth=getAuth(); if(!auth) return;
      const u=new URL(FOODY_API+'/api/v1/merchant/offers'); u.searchParams.set('limit','100'); u.searchParams.set('offset','0');
      const res = await fetch(u.toString(), { headers: { 'X-Foody-Key': auth.api_key } });
      const payload = await res.json().catch(()=>({items:[]}));
      const items = Array.isArray(payload.items)?payload.items:[];
      if(!items.length){ els.empty.style.display=''; els.table.innerHTML=''; return; }
      els.empty.style.display='none';
      els.table.innerHTML='';
      items.forEach(o=>{
        const tr=document.createElement('tr'); tr.dataset.offerId=o.id;
        tr.dataset.offer=''; tr.dataset.title=o.title||''; tr.dataset.category=o.category||'';
        tr.dataset.priceCents=o.price_cents||0; tr.dataset.originalPriceCents=o.original_price_cents||0;
        tr.dataset.qtyLeft=o.qty_left??''; tr.dataset.qtyTotal=o.qty_total??''; tr.dataset.expiresAt=o.expires_at||'';
        tr.innerHTML=`<td>${o.id}</td><td><div class="title">${o.title||'—'}</div></td><td>${money(o.price_cents)}</td><td>${o.qty_left??'—'}</td><td>${o.expires_at?new Date(o.expires_at).toLocaleString('ru-RU'):'—'}</td><td></td>`;
        els.table.appendChild(tr);
      });
      // KPI
      $('#kpiOffers').textContent = String(items.length);
    }
    function exportCsv(){
      const rows=[['id','title','price_cents','original_price_cents','qty_total','qty_left','expires_at']];
      $$('#offersTable tr').forEach(tr=>{
        rows.push([tr.dataset.offerId,tr.querySelector('.title')?.textContent||'', tr.dataset.priceCents, tr.dataset.originalPriceCents, tr.dataset.qtyTotal, tr.dataset.qtyLeft, tr.dataset.expiresAt]);
      });
      const csv = rows.map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\\n');
      const blob = new Blob([csv],{type:'text/csv;charset=utf-8;'});
      const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='offers.csv'; a.click(); URL.revokeObjectURL(a.href);
    }
    return { load, exportCsv };
  })();

  // ---------------- Reservations ----------------
  const Reservations = (()=>{
    const els = {
      table: $('#resvTable'), wrap: $('#resvTableWrap'), more: $('#resvMore'),
      filter: $('#resvFilter'), refresh: $('#resvRefresh'), empty: $('#resvEmpty'), count: $('#resvCount')
    };
    const st = { items: [], total: null, offset: 0, limit: 20, status: "", loading: false };

    function fmtDT(iso){ try{ return iso?new Date(iso).toLocaleString('ru-RU'):'—'; }catch(_){ return '—'; } }
    function renderRow(r){
      const tr=document.createElement('tr'); tr.dataset.resvId=r.id;
      const badge = `<span class="badge st-${r.status}">${r.status}</span>`;
      const act = r.status==='active'?`<button class="btn" data-resv-cancel="${r.id}">Отменить</button>`:'';
      tr.innerHTML = `<td>${r.id}</td><td><div class="title">${r.title||'—'}</div><div class="muted">#${r.offer_id}</div></td><td>${badge}</td><td>${fmtDT(r.expires_at)}</td><td>${fmtDT(r.created_at)}</td><td class="act">${act}</td>`;
      return tr;
    }
    function render(){
      els.table.innerHTML='';
      if(!st.items.length){ els.empty.style.display=''; els.count.textContent=''; return; }
      els.empty.style.display='none';
      st.items.forEach(r=>els.table.appendChild(renderRow(r)));
      const shown=st.items.length, total=st.total??shown;
      els.count.textContent=`Показано ${shown} из ${total}`;
      els.more.style.display=(st.total!==null && shown<total)?'':'none';
      // KPI: active/expired
      try{
        const act=st.items.filter(x=>x.status==='active').length;
        const exp=st.items.filter(x=>x.status==='expired').length;
        $('#kpiResvActive').textContent=String(act);
        $('#kpiResvExpired').textContent=String(exp);
      }catch(_){}
    }
    async function load(){
      if(st.loading) return; st.loading=true;
      try{
        const auth=getAuth(); if(!auth) throw new Error('no auth');
        const u = new URL(FOODY_API+'/api/v1/merchant/reservations');
        if(st.status) u.searchParams.set('status_filter', st.status);
        u.searchParams.set('limit', String(st.limit)); u.searchParams.set('offset', String(st.offset));
        const res = await fetch(u.toString(), { headers:{'X-Foody-Key': auth.api_key} });
        if(!res.ok) throw new Error('load');
        const payload = await res.json();
        const items = Array.isArray(payload.items)?payload.items:[];
        st.total = typeof payload.total==='number'?payload.total:items.length;
        st.items = st.items.concat(items);
        st.offset += items.length;
        render();
      }catch(e){ console.error(e); toast('Не удалось загрузить бронирования'); }
      finally{ st.loading=false; }
    }
    function reset(){ st.items=[]; st.total=null; st.offset=0; render(); load(); }
    async function cancel(id){
      try{
        const auth=getAuth(); if(!auth) throw new Error('no auth');
        const res = await fetch(FOODY_API+`/api/v1/merchant/reservations/${id}/cancel`, { method:'POST', headers:{'X-Foody-Key':auth.api_key} });
        const data = await res.json().catch(()=>({}));
        if(!res.ok || !data.ok) throw new Error(data.detail||'cancel');
        const row = st.items.find(x=>x.id===id); if(row) row.status='cancelled';
        const tr = els.table.querySelector(`[data-resv-id="${id}"]`);
        if(tr){ tr.querySelector('td:nth-child(3)').innerHTML='<span class="badge st-cancelled">cancelled</span>'; tr.querySelector('td:nth-child(6)').innerHTML=''; tr.style.transition='background-color .4s'; tr.style.backgroundColor='rgba(248,113,113,.12)'; setTimeout(()=>tr.style.backgroundColor='',500); }
        toast('Бронь отменена');
      }catch(e){ console.error(e); toast('Не удалось отменить бронь'); }
    }
    function bind(){
      els.filter.onchange = ()=>{ st.status=els.filter.value||''; reset(); };
      els.refresh.onclick = ()=> reset();
      els.more.onclick = ()=> load();
      els.wrap.addEventListener('click', e=>{ const b=e.target.closest('[data-resv-cancel]'); if(!b) return; const id=Number(b.dataset.resvCancel||0); if(id) cancel(id); });
    }
    function init(){ bind(); reset(); }
    return { init };
  })();

  // ---------------- Create form (presets only) ----------------
  (()=>{
    document.addEventListener('click', e=>{
      const b=e.target.closest('.presets .badge'); if(!b) return; e.preventDefault();
      const p=Number(b.dataset.discount||0); const price=$('#cPrice'), old=$('#cOld');
      if(!price||!old) return;
      const op=parseFloat(old.value.replace(',','.'))||0; if(!op){ toast('Укажите старую цену'); return; }
      const np=Math.round(op*(1-p/100)); price.value=String(np);
    });
  })();

  // ---------------- Init ----------------
  function bootstrapAuthFromParams(){
      try{
        const u=new URL(location.href);
        const api_key=u.searchParams.get('api_key')||u.hash.match(/api_key=([^&]+)/)?.[1];
        const rid=u.searchParams.get('restaurant_id')||u.hash.match(/restaurant_id=(\d+)/)?.[1];
        if(api_key && rid){
          localStorage.setItem('foody_auth', JSON.stringify({api_key:api_key, restaurant_id:Number(rid)}));
        }
      }catch(_){}
    }
    document.addEventListener('DOMContentLoaded', ()=>{
      bootstrapAuthFromParams();
    toggleGateUI();
    setActiveTab((location.hash||'').replace('#','')||'dashboard');
    $('#refreshOffers')?.addEventListener('click', Offers.load);
    $('#exportCsv')?.addEventListener('click', Offers.exportCsv);
    $('#backToLK')?.addEventListener('click', ()=>{ setActiveTab('dashboard'); });
  });
})();
