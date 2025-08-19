
/*! Foody Merchant Tabs+Gate Fix — 2025-08-19 */
(function(){
  const NS = window.FOODY = window.FOODY || {};
  const $ = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => r.querySelectorAll(s);

  // ---------- GATE (guest vs dashboard) ----------
  function getAuth(){
    try{ const s = localStorage.getItem('foody_auth'); return s ? JSON.parse(s) : null; }catch(_){ return null; }
  }
  function isAuthed(){
    const a = getAuth(); return !!(a && a.restaurant_id && a.api_key);
  }
  function toggleGateUI(){
    const authed = isAuthed();
    // hide all guest prompts
    $$('.need-auth').forEach(el => el.style.display = authed ? 'none' : '');
    // show merchant dashboard / sections
    const dash = $('#section-dashboard') || $('.merchant-dashboard');
    if (dash) dash.classList.toggle('hidden', !authed);
    // tabs bar (if any) — show only for authed
    const tabs = $('#tabs') || $('.seg-controls') || $('.bottom-nav');
    if (tabs) tabs.style.display = authed ? '' : 'none';
    // logout button visibility
    const logoutBtn = $('#logoutBtn') || $('[data-logout]');
    if (logoutBtn) logoutBtn.style.display = authed ? '' : 'none';
  }
  NS.toggleGateUI = toggleGateUI;
  NS.getAuth = getAuth;
  NS.isAuthed = isAuthed;

  // reflect storage changes (login in other tab, logout etc.)
  window.addEventListener('storage', (e) => { if (e.key === 'foody_auth') toggleGateUI(); });

  // try to react to logout button click
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('#logoutBtn, [data-logout]');
    if (!btn) return;
    setTimeout(toggleGateUI, 150); // let host logic clear storage, then toggle
  });

  // ---------- TABS (top/bottom/data-tab/hash) ----------
  const SECTION_CACHE = new Set();
  function scanSections(){
    SECTION_CACHE.clear();
    $$('[id^="section-"]').forEach(el => SECTION_CACHE.add(el.id));
  }
  function norm(name){
    if (!name) return '';
    const t = (''+name).toLowerCase().trim().replace(/^#/, '');
    if (t.includes('дашборд') || t === 'dashboard') return 'dashboard';
    if (t.includes('оффер') || t === 'offers') return 'offers';
    if (t.includes('создат') || t === 'create') return 'create';
    if (t.includes('профил') || t === 'profile') return 'profile';
    if (t.includes('qr') || t.includes('брон') || t.includes('reserve')) return 'qr';
    if (t.startsWith('section-')) return t.replace('section-','');
    return t;
  }
  function setActiveTab(name){
    scanSections();
    const n = norm(name) || 'dashboard';
    const id = 'section-' + n;
    let target = $('#'+id);
    if (!target){
      // fallback to first section
      const first = Array.from(SECTION_CACHE)[0];
      if (first) target = $('#'+first);
    }
    // show/hide sections
    $$('[id^="section-"]').forEach(el => {
      const show = (el === target);
      el.classList.toggle('hidden', !show);
    });
    // highlight buttons
    $$('.seg-btn, .nav-btn, [data-tab], [href^="#"]').forEach(btn => {
      const key = norm(btn.dataset.tab || btn.dataset.target || btn.dataset.name || (btn.getAttribute('href')||'').replace('#','') || btn.id);
      btn.classList.toggle('active', key === (target ? target.id.replace('section-','') : ''));
    });
    // sync hash + body dataset
    try { history.replaceState(null, '', '#'+(target ? target.id.replace('section-','') : 'dashboard')); } catch(_){}
    try { document.body.dataset.mode = (target ? target.id.replace('section-','') : 'dashboard'); } catch(_){}
  }
  NS.setActiveTab = setActiveTab;

  // Delegated clicks for any tab-like buttons
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.seg-btn, .nav-btn, [data-tab], a[href^="#"]');
    if (!btn) return;
    const name = btn.dataset.tab || btn.dataset.target || btn.dataset.name || (btn.getAttribute('href')||'').replace('#','') || btn.id;
    if (!name) return;
    // prevent jump scrolling for hash links
    if (btn.tagName === 'A' && btn.getAttribute('href')?.startsWith('#')) e.preventDefault();
    setActiveTab(name);
  });
  window.addEventListener('hashchange', () => setActiveTab((location.hash||'').replace('#','')));

  // ---------- INIT ----------
  document.addEventListener('DOMContentLoaded', () => {
    toggleGateUI();
    const initial = (location.hash||'').replace('#','') || 'dashboard';
    setActiveTab(initial);
  });

  // small debug helper
  NS.debugGate = () => ({ authed: isAuthed(), auth: getAuth() });
})();
