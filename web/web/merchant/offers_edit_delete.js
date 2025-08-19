// Foody v17 — Delete offer fix V2 (handles 204 No Content; no await...catch misuse)
window.deleteOffer = async function(offerId) {
  if (!offerId) return;
  if (!confirm("Удалить оффер?")) return;

  const api = (window.FOODY_API || 'https://foodyback-production.up.railway.app').replace(/\/$/, '');
  try {
    const res = await fetch(`${api}/api/v1/merchant/offers/${offerId}`, {
      method: "DELETE",
      credentials: "include"
    });

    if (res.status === 204 || res.status === 200) {
      const row = document.querySelector(`#offerList .row[data-id='${offerId}']`)
                || document.getElementById(`offer-${offerId}`)
                || document.querySelector(`[data-offer-id='${offerId}']`);
      if (row) row.remove();

      const upd = window.loadOffers || window.refreshOffers;
      if (typeof upd === "function") { try { upd(); } catch(_) {} }

      showToast("Оффер удалён");
      return;
    }

    let msg;
    try { msg = await res.text(); }
    catch(e) { msg = res.statusText; }
    alert("Ошибка удаления: " + msg);

  } catch (err) {
    console.error("Delete error", err);
    alert("Ошибка сети при удалении");
  }
};

function showToast(text) {
  let box = document.getElementById("toast");
  if (!box) {
    box = document.createElement("div");
    box.id = "toast";
    document.body.appendChild(box);
  }
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = text;
  box.appendChild(el);
  setTimeout(() => el.remove(), 2200);
}