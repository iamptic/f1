
/* === Foody v16 Tab Fix — pane.active toggler === */
(function(){
  const $ = (s,r=document)=>r.querySelector(s);
  const $$ = (s,r=document)=>Array.from(r.querySelectorAll(s));
  const norm = (s)=>String(s||'').trim().toLowerCase();

  function resolveKeyFromEl(el){
    if (!el) return null;
    const dt = el.getAttribute('data-tab'); if (dt) return norm(dt);
    const ac = el.getAttribute('aria-controls'); if (ac) return norm(ac);
    if (el.tagName==='A' && el.hash) return norm(el.hash.slice(1));
    const t = norm(el.textContent);
    if (/^дашборд|dashboard|главная$/.test(t)) return 'dashboard';
    if (/^офферы|offers|мои офферы$/.test(t)) return 'offers';
    if (/^создать|create|\+$/.test(t)) return 'create';
    if (/^профиль|profile|аккаунт$/.test(t)) return 'profile';
    if (/^экспорт|export$/.test(t)) return 'export';
    if (/^вход|логин|auth|signin$/.test(t)) return 'auth';
    return null;
  }

  function findPane(key){
    if (!key) return null;
    return document.getElementById(key) || null;
  }

  function setActiveTabUI(key){
    $$('[data-tab]').forEach(b => b.classList.toggle('active', (b.getAttribute('data-tab')||'').toLowerCase()===key));
    $$('[aria-controls]').forEach(b => b.classList.toggle('active', (b.getAttribute('aria-controls')||'').toLowerCase()===key));
    $$('.bottom-nav [data-tab]').forEach(b => b.classList.toggle('active', (b.getAttribute('data-tab')||'').toLowerCase()===key));
  }

  window.activateTab = function(tabLike){
    const key = (String(tabLike||'').trim().toLowerCase());
    const target = findPane(key) || document.getElementById('dashboard');
    // Hide all panes
    $$('.pane').forEach(p => { p.classList.remove('active'); p.style.display='none'; });
    // Show target
    if (target){ target.classList.add('active'); target.style.display=''; }
    setActiveTabUI(key);
  };

  document.addEventListener('click', function(e){
    const t = e.target.closest('[data-tab], [aria-controls], a[href^="#"]'); if (!t) return;
    const key = resolveKeyFromEl(t); if (!key) return;
    if (t.tagName==='A') e.preventDefault();
    const isAuth = !!(localStorage.getItem('foody_restaurant_id') && localStorage.getItem('foody_key'));
    if (!isAuth && !['dashboard','auth','login','signin','export'].includes(key)){
      activateTab('dashboard'); return;
    }
    activateTab(key);
  }, { capture:true });

  document.addEventListener('DOMContentLoaded', ()=>{
    const isAuth = !!(localStorage.getItem('foody_restaurant_id') && localStorage.getItem('foody_key'));
    const def = isAuth ? 'offers' : 'auth';
    activateTab(def);
  });
})();
/* === end Foody v16 Tab Fix === */
