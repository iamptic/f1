
/*! Foody Merchant · Geo Autofill — v1 */
(function(){
  function toast(msg){ 
    let box = document.querySelector('#toast'); 
    if(!box){ box=document.createElement('div'); box.id='toast'; document.body.appendChild(box);} 
    let el=document.createElement('div'); el.className='toast'; el.textContent=msg; 
    box.appendChild(el); setTimeout(()=>el.remove(),2800);
  }

  async function reverseGeocode(lat,lng){
    try{
      const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&accept-language=ru`;
      const res = await fetch(url); const j = await res.json();
      return j;
    }catch(e){ console.error(e); return null; }
  }

  async function detectAndFill(context){
    if(!navigator.geolocation){ toast('Геолокация не поддерживается'); return; }
    navigator.geolocation.getCurrentPosition(async pos => {
      const {latitude, longitude} = pos.coords;
      localStorage.setItem('foody_geo_lat', latitude);
      localStorage.setItem('foody_geo_lng', longitude);
      const data = await reverseGeocode(latitude, longitude);
      if(!data){ toast('Не удалось определить адрес'); return; }
      const address = data.display_name || '';
      const city = data.address?.city || data.address?.town || data.address?.village || '';
      if(context==='register'){
        const addrInput = document.querySelector('#registerForm [name="address"]');
        const cityInput = document.querySelector('#cityValue');
        if(addrInput && !addrInput.value) addrInput.value = address;
        if(cityInput && !cityInput.value && city) cityInput.value = city;
      } else if(context==='profile'){
        const addrInput = document.querySelector('#profileForm [name="address"]');
        const cityInput = document.querySelector('#profileCityValue');
        if(addrInput && !addrInput.value) addrInput.value = address;
        if(cityInput && !cityInput.value && city) cityInput.value = city;
      }
      toast('Адрес определён ✅');
    }, err => { toast('Не удалось получить геопозицию'); console.error(err); });
  }

  document.addEventListener('DOMContentLoaded', () => {
    const regAddr = document.querySelector('#registerForm [name="address"]');
    if(regAddr){
      const btn = document.createElement('button'); btn.type='button'; btn.textContent='Определить адрес';
      btn.className='btn btn-ghost'; btn.style.marginTop='6px';
      regAddr.parentNode.appendChild(btn);
      btn.addEventListener('click', ()=>detectAndFill('register'));
    }
    const profAddr = document.querySelector('#profileForm [name="address"]');
    if(profAddr){
      const btn = document.createElement('button'); btn.type='button'; btn.textContent='Определить адрес';
      btn.className='btn btn-ghost'; btn.style.marginTop='6px';
      profAddr.parentNode.appendChild(btn);
      btn.addEventListener('click', ()=>detectAndFill('profile'));
    }
  });
})();
