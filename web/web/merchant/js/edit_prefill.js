// Foody v17 — Edit modal prefill (ALL fields incl. photo)
(function(){
  const API = (window.FOODY_API || 'https://foodyback-production.up.railway.app').replace(/\/$/, '');

  // Helpers
  const $ = (sel, root=document) => root.querySelector(sel);
  const dtToInput = (s) => {
    if(!s) return '';
    const d = new Date(s);
    if(isNaN(d)) return '';
    const z = new Date(d.getTime() - d.getTimezoneOffset()*60000);
    return z.toISOString().slice(0,16);
  };
  const dToInput = (s) => {
    if(!s) return '';
    const d = new Date(s);
    if(isNaN(d)) return '';
    const z = new Date(d.getTime() - d.getTimezoneOffset()*60000);
    return z.toISOString().slice(0,10);
  };

  async function fetchOffer(id){
    try{
      const res = await fetch(`${API}/api/v1/merchant/offers/${id}`, { credentials: 'include' });
      if(!res.ok){ return null; }
      const ct = res.headers.get('content-type')||'';
      if(ct.includes('application/json')) return await res.json();
      return null;
    }catch(e){ console.error('fetchOffer', e); return null; }
  }

  function set(v){ return v==null? '' : v; }

  // Photo preview glue: works with our uploader.js if present, otherwise gracefully falls back
  function previewPhotoFromUrl(form, url){
    if(!url) return;
    // A) our uploader.js present -> .uploader .thumb img
    const thumbImg = form && form.querySelector('.uploader .thumb img');
    if(thumbImg){
      thumbImg.src = url;
      const wrap = form.querySelector('.uploader');
      if(wrap){ wrap.classList.add('success'); }
    }
    // B) hidden field to keep old url if no new file selected
    let keep = form.querySelector('input[type="hidden"][name="photo_url"]');
    if(!keep){
      keep = document.createElement('input');
      keep.type = 'hidden';
      keep.name = 'photo_url';
      form.appendChild(keep);
    }
    keep.value = url;

    // If user later picks a file, we clear keep.value so backend stores new image
    const file = form.querySelector('input[type="file"]');
    if(file){
      file.addEventListener('change', ()=>{ if(file.files && file.files[0]) keep.value = ''; }, { once:true });
    }
  }

  function fillForm(form, offer){
    if(!form || !offer) return;
    // Guess input names used in repo
    const map = {
      id: ['id','offer_id'],
      title: ['title','name'],
      price: ['price','new_price','cost'],
      description: ['description','desc','details'],
      stock: ['stock','quantity','left','count'],
      expires_at: ['expires_at','expiresAt','valid_until'],
      product_expire_date: ['product_expire_date','productExpireDate','best_before'],
      photo_url: ['photo_url','image_url','photo','image']
    };

    function setVal(names, val){
      for(const n of names){
        const el = form.querySelector(`[name="${n}"]`) || form.querySelector(`#${n}`);
        if(el){
          el.value = val;
          return true;
        }
      }
      return false;
    }

    setVal(map.id, offer.id);
    setVal(map.title, set(offer.title));
    setVal(map.price, set(offer.price));
    setVal(map.description, set(offer.description));
    setVal(map.stock, set(offer.stock ?? offer.quantity));

    // dates
    setVal(map.expires_at, dtToInput(offer.expires_at));
    setVal(map.product_expire_date, dToInput(offer.product_expire_date));

    // photo preview + keep hidden url
    const url = offer.photo_url || offer.image_url;
    previewPhotoFromUrl(form, url);
  }

  // Intercept Edit clicks to prefill before modal becomes visible
  function delegateClicks(){
    document.addEventListener('click', async (e)=>{
      const btn = e.target.closest('[data-edit],[data-offer-edit],[data-id].btn-edit, button.btn-edit, button:contains("Редактировать"), .edit-offer');
      if(!btn) return;
      // Try to get id
      const id = btn.dataset.edit || btn.dataset.offerEdit || btn.dataset.id || btn.getAttribute('data-id') || btn.value;
      if(!id) return;

      // Locate modal + form
      const modal = document.getElementById('offerEditModal') || document.querySelector('#offerModal, .edit-modal, .modal');
      const form = modal && (modal.querySelector('#offerEditForm') || modal.querySelector('form'));
      if(!form) return;

      // Fetch offer and fill
      const offer = await fetchOffer(id);
      if(offer){ fillForm(form, offer); }
      // else: no-op; modal will show empty as before
    });
  }

  // In case modal opens by script without click (e.g. deep link), we try to prefill once opened
  function observeModalOpen(){
    const modal = document.getElementById('offerEditModal');
    if(!modal) return;
    const form = modal.querySelector('#offerEditForm') || modal.querySelector('form');
    if(!form) return;

    const obs = new MutationObserver(async (muts)=>{
      const visible = modal.classList.contains('_open') ||
                      modal.classList.contains('open') ||
                      modal.getAttribute('aria-hidden') === 'false' ||
                      (modal.style.display && modal.style.display !== 'none');
      if(!visible) return;
      // get id from a hidden input or from a data attr on modal
      const idEl = form.querySelector('[name="id"], #id');
      const id = idEl && idEl.value;
      if(!id) return;
      const offer = await fetchOffer(id);
      if(offer){ fillForm(form, offer); }
    });
    obs.observe(modal, { attributes:true, attributeFilter:['class','style','aria-hidden'] });
  }

  function init(){ delegateClicks(); observeModalOpen(); }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();