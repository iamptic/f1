(() => {
  const $ = (s,r=document)=>r.querySelector(s);
  const tg = window.Telegram?.WebApp; if (tg){ tg.expand(); const apply=()=>{const s=tg.colorScheme||'dark';document.documentElement.dataset.theme=s;}; apply(); tg.onEvent?.('themeChanged',apply); }
  const API = (window.__FOODY__&&window.__FOODY__.FOODY_API)||"https://foodyback-production.up.railway.app";

  let offers=[];
  const grid = $('#grid'), q = $('#q');

  function render(){
    grid.inne
  function timeLeft(iso){
    try{
      if (!iso) return '';
      const end = new Date(iso).getTime();
      const now = Date.now();
      const diff = Math.max(0, end - now);
      const m = Math.floor(diff/60000), h = Math.floor(m/60), mm = m%60;
      if (h>0) return h+'ч '+String(mm).padStart(2,'0')+'м';
      return m+' мин';
    }catch(_){ return ''; }
  }
rHTML = '';
    const qs = (q.value||'').toLowerCase();
    const list = offers
      .filter(o => (!qs || (o.title||'').toLowerCase().includes(qs)))
      .filter(o => (o.qty_left??0)>0 && (!o.expires_at || new Date(o.expires_at).getTime()>Date.now()))
      .sort((a,b)=> new Date(a.expires_at||0) - new Date(b.expires_at||0));
    if (!list.length){ grid.innerHTML = '<div class="card"><div class="p">Нет офферов</div></div>'; return; }
    list.forEach(o=>{
      const price = (o.price_cents||0)/100, old = (o.original_price_cents||0)/100;
      const disc = old>0? Math.round((1-price/old)*100):0;
      const el = document.createElement('div'); el.className='card';
      el.innerHTML = '<img src="'+(o.image_url||'')+'" alt="">' +
        '<div class="p"><div class="price">'+price.toFixed(0)+' ₽'+(old?'<span class="badge">-'+disc+'%</span>':'')+'</div>' +
        '<div>'+(o.title||'—')+'</div>' +
        '<div class="meta"><span>Осталось: '+(o.qty_left??'—')+'</span></div></div>';
      el.onclick = ()=>open(o); grid.appendChild(el);
    });
  }

  function open(o){
    $('#sTitle').textContent = o.title||'—';
    $('#sImg').src = o.image_url||'';
    $('#sPrice').textContent = ((o.price_cents||0)/100).toFixed(0)+' ₽';
    const old=(o.original_price_cents||0)/100; $('#sOld').textContent = old? (old.toFixed(0)+' ₽') : '—';
    $('#sQty').textContent = (o.qty_left??'—') + ' / ' + (o.qty_total??'—');
    $('#sExp').textContent = o.expires_at? new Date(o.expires_at).toLocaleString('ru-RU') : '—';
    $('#sDesc').textContent = o.description||'';
    const left = timeLeft(o.expires_at); if (left) $('#sLeft').textContent = 'Осталось: '+left;
    $('#sheet').classList.remove('hidden');

    if (tg && tg.MainButton){
      tg.MainButton.setParams({text:'Забронировать', is_active:true, is_visible:true});
      const handler = async ()=>{
        try{
          const resp = await fetch(API+'/api/v1/public/reserve', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ offer_id: o.id||o.offer_id, name: (tg.initDataUnsafe?.user?.first_name||'TG'), phone:'' }) });
          if(!resp.ok) throw new Error('reserve');
          toast('Забронировано ✅');
          tg.MainButton.hide();
        }catch(_){ toast('Не удалось забронировать'); }
      };
      tg.onEvent('mainButtonClicked', handler);
      // store to remove later
      $('#sheetClose')._off = ()=>{ try{ tg.offEvent('mainButtonClicked', handler); tg.MainButton.hide(); }catch(_){} };
    }

    $('#reserveBtn').onclick = async ()=>{
      try{
        const resp = await fetch(API+'/api/v1/public/reserve',{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ offer_id: o.id||o.offer_id, name:'TG', phone:'' }) });
        if(!resp.ok) throw new Error('reserve');
        toast('Забронировано ✅');
      }catch(_){ toast('Не удалось забронировать'); }
    };
  }
  $('#sheetClose').onclick = ()=>{ $('#sheet').classList.add('hidden'); try{ $('#sheetClose')._off && $('#sheetClose')._off(); }catch(_){} };
  $('#refresh').onclick = load;
  q.oninput = render;

  const toastBox = document.getElementById('toast');
  const toast = (m)=>{ const el=document.createElement('div'); el.className='toast'; el.textContent=m; toastBox.appendChild(el); setTimeout(()=>el.remove(),3200); };

  async function load(){ try{ $('#gridSkeleton').classList.remove('hidden'); offers = await fetch(API+'/public/offers').then(r=>r.json()).catch(()=>[]); } finally { $('#gridSkeleton').classList.add('hidden'); } render(); }
  load();
})();