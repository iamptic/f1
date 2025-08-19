// Foody v17 — Delete offer fix V3 (headers + 204/200/404 success + UI refresh)
(function(){
  function baseApi(){
    try { return (window.__FOODY__ && window.__FOODY__.FOODY_API) || window.foodyApi || window.FOODY_API || 'https://foodyback-production.up.railway.app'; }
    catch(_) { return 'https://foodyback-production.up.railway.app'; }
  }
  function foodyKey(){
    try { return localStorage.getItem('foody_key') || ''; } catch(_) { return ''; }
  }
  async function del(id){
    const api = baseApi().replace(/\/$/, '');
    const headers = {};
    const key = foodyKey();
    if (key) headers['X-Foody-Key'] = key;
    const res = await fetch(`${api}/api/v1/merchant/offers/${id}`, { method: 'DELETE', headers });
    return res;
  }
  function removeRow(id){
    const row = document.querySelector(`#offerList .row[data-id='${id}']`)
            || document.getElementById(`offer-${id}`)
            || document.querySelector(`[data-offer-id='${id}']`);
    if (row) row.remove();
  }
  function toast(text){
    let box = document.getElementById("toast");
    if (!box) { box = document.createElement("div"); box.id = "toast"; document.body.appendChild(box); }
    const el = document.createElement("div");
    el.className = "toast"; el.textContent = text;
    box.appendChild(el); setTimeout(() => el.remove(), 2200);
  }

  window.deleteOffer = async function(offerId){
    if (!offerId) return;
    if (!confirm("Удалить оффер?")) return;
    try {
      const res = await del(offerId);
      if (res.status === 204 || res.status === 200) {
        removeRow(offerId);
        try { (window.loadOffers||window.refreshOffers||window.refreshDashboard)?.(); } catch(_) {}
        toast("Оффер удалён");
        return;
      }
      // other statuses — if 404 treat as success
      if (res.status === 404) {
        removeRow(offerId);
        try { (window.loadOffers||window.refreshOffers||window.refreshDashboard)?.(); } catch(_) {}
        toast("Оффер удалён");
        return;
      }
      let msg = res.statusText;
      try { msg = (await res.text()) || res.statusText; } catch(_){}
      alert("Ошибка удаления: " + msg);
    } catch (err) {
      console.error("Delete error", err);
      alert("Ошибка сети при удалении");
    }
  };
})();