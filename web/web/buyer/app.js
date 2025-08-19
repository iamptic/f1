(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const tg = window.Telegram?.WebApp;
  if (tg) {
    tg.expand();
    const apply = () => {
      const s = tg.colorScheme || 'dark';
      document.documentElement.dataset.theme = s;
    };
    apply();
    tg.onEvent?.('themeChanged', apply);
  }
  const API = (window.__FOODY__ && window.__FOODY__.FOODY_API) || "https://foodyback-production.up.railway.app";

  // State
  let offers = [];
  let total = null;
  let offset = 0;
  const LIMIT = 12;
  let loading = false;

  const grid = $('#grid');
  const gridSkeleton = $('#gridSkeleton');
  const q = $('#q');

  // Utilities
  function timeLeft(iso) {
    try {
      if (!iso) return '';
      const end = new Date(iso).getTime();
      const now = Date.now();
      const diff = Math.max(0, end - now);
      const m = Math.floor(diff / 60000), h = Math.floor(m / 60), mm = m % 60;
      if (h > 0) return h + 'ч ' + String(mm).padStart(2, '0') + 'м';
      return m + ' мин';
    } catch { return ''; }
  }

  function moneyRub(cents) {
    const p = (cents || 0) / 100;
    return p.toFixed(0) + ' ₽';
  }

  function discountPct(price_cents, original_price_cents) {
    const price = (price_cents || 0) / 100;
    const old = (original_price_cents || 0) / 100;
    if (old > 0 && price > 0) {
      return Math.max(0, Math.round((1 - price / old) * 100));
    }
    return 0;
  }

  // Render
  function render() {
    grid.innerHTML = '';
    const term = (q.value || '').toLowerCase();
    const list = offers
      .filter(o => !term || (o.title || '').toLowerCase().includes(term))
      .filter(o => (o.qty_left ?? 0) > 0 && (!o.expires_at || new Date(o.expires_at).getTime() > Date.now()))
      .sort((a, b) => new Date(a.expires_at || 0) - new Date(b.expires_at || 0));

    if (!list.length) {
      grid.innerHTML = '<div class="card"><div class="p">Нет офферов</div></div>';
      return;
    }

    list.forEach(o => {
      const el = document.createElement('div');
      el.className = 'card';
      const disc = discountPct(o.price_cents, o.original_price_cents);
      const left = timeLeft(o.expires_at);

      el.innerHTML = `
        ${o.image_url ? `<img src="${o.image_url}" alt="">` : `<div style="height:140px;background:#0d1218"></div>`}
        <div class="p">
          <div class="price">
            ${moneyRub(o.price_cents)}
            ${disc ? `<span class="badge">-${disc}%</span>` : ''}
            ${left ? `<span class="badge left">${left}</span>` : ''}
          </div>
          <div>${o.title || '—'}</div>
          <div class="meta"><span>Осталось: ${o.qty_left ?? '—'}</span>${o.category ? `<span class="badge">${o.category}</span>` : ''}</div>
        </div>
      `;
      el.onclick = () => open(o);
      grid.appendChild(el);
    });
  }

  function open(o) {
    $('#sTitle').textContent = o.title || '—';
    $('#sImg').src = o.image_url || '';
    $('#sPrice').textContent = moneyRub(o.price_cents);
    const old = (o.original_price_cents || 0) / 100;
    $('#sOld').textContent = old ? (old.toFixed(0) + ' ₽') : '—';
    $('#sQty').textContent = (o.qty_left ?? '—') + ' / ' + (o.qty_total ?? '—');
    $('#sExp').textContent = o.expires_at ? new Date(o.expires_at).toLocaleString('ru-RU') : '—';
    $('#sDesc').textContent = o.description || '';
    const left = timeLeft(o.expires_at);
    $('#sLeft').textContent = left ? ('Осталось: ' + left) : '—';
    $('#sheet').classList.remove('hidden');

    if (tg && tg.MainButton) {
      tg.MainButton.setParams({ text: 'Забронировать', is_active: true, is_visible: true });
      const handler = async () => {
        try {
          const resp = await fetch(API + '/api/v1/public/reserve', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              offer_id: o.id || o.offer_id,
              name: (tg.initDataUnsafe?.user?.first_name || 'TG'),
              phone: ''
            })
          });
          if (!resp.ok) throw new Error('reserve');
          toast('Забронировано ✅');
          tg.MainButton.hide();
        } catch (_) { toast('Не удалось забронировать'); }
      };
      tg.onEvent('mainButtonClicked', handler);
      $('#sheetClose')._off = () => { try { tg.offEvent('mainButtonClicked', handler); tg.MainButton.hide(); } catch {} };
    }

    $('#reserveBtn').onclick = async () => {
      try {
        const resp = await fetch(API + '/api/v1/public/reserve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ offer_id: o.id || o.offer_id, name: 'TG', phone: '' })
        });
        if (!resp.ok) throw new Error('reserve');
        toast('Забронировано ✅');
      } catch (_) { toast('Не удалось забронировать'); }
    };
  }

  $('#sheetClose').onclick = () => {
    $('#sheet').classList.add('hidden');
    try { $('#sheetClose')._off && $('#sheetClose')._off(); } catch {}
  };
  $('#refresh').onclick = resetAndLoad;
  q.oninput = render;

  const toastBox = $('#toast');
  const toast = (m) => {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = m;
    toastBox.appendChild(el);
    setTimeout(() => el.remove(), 3200);
  };

  // Data loading
  function showSkeleton(n = 8) {
    gridSkeleton.innerHTML = '';
    for (let i = 0; i < n; i++) {
      const s = document.createElement('div');
      s.className = 'card';
      gridSkeleton.appendChild(s);
    }
    gridSkeleton.classList.remove('hidden');
  }
  function hideSkeleton() {
    gridSkeleton.classList.add('hidden');
  }

  async function loadBatch() {
    if (loading) return;
    if (total !== null && offset >= total) return;
    loading = true;
    showSkeleton();
    try {
      const url = `${API}/api/v1/public/offers?limit=${LIMIT}&offset=${offset}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('feed');
      const payload = await res.json();
      const items = payload.items || Array.isArray(payload) ? payload : [];
      total = typeof payload.total === 'number' ? payload.total : null;
      // If server returns plain array (legacy), support it too
      const arr = Array.isArray(payload.items) ? payload.items : (Array.isArray(payload) ? payload : []);
      offers = offers.concat(arr);
      offset += arr.length;
      render();
    } catch (e) {
      console.error(e);
      toast('Не удалось загрузить витрину');
    } finally {
      hideSkeleton();
      loading = false;
    }
  }

  function resetAndLoad() {
    offers = [];
    total = null;
    offset = 0;
    render();
    loadBatch();
  }

  // Infinite scroll
  function onScroll() {
    const nearBottom = window.innerHeight + window.scrollY >= document.body.offsetHeight - 320;
    if (nearBottom) loadBatch();
  }
  window.addEventListener('scroll', onScroll);

  // Init
  document.addEventListener('DOMContentLoaded', () => {
    resetAndLoad();
  });
})();