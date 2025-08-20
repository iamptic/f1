(()=>{
  const API=(window.FOODY_API||'https://foodyback-production.up.railway.app').replace(/\/+$/,'');
  const $=(s,r=document)=>r.querySelector(s);

  function toast(msg){
    const box=$('#toast')||document.body.appendChild(Object.assign(document.createElement('div'),{id:'toast'}));
    const n=document.createElement('div');n.className='toast';n.textContent=msg;
    box.appendChild(n);setTimeout(()=>n.remove(),2800);
  }

  function setModal(sel,on){const el=$(sel);if(!el)return;el.setAttribute('aria-hidden',on?'false':'true');}

  function loadQrLib(){
    return new Promise((res,rej)=>{
      if(window.QRCode||(typeof QRCode!=='undefined')) return res();
      if(document.getElementById('qr-lib')){
        const wait=()=> (window.QRCode||(typeof QRCode!=='undefined')) ? res():setTimeout(wait,50);
        return wait();
      }
      const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js';
      s.id='qr-lib';s.onload=()=>res();s.onerror=()=>rej(new Error('qr load'));
      document.head.appendChild(s);
    });
  }
  function drawQr(canvas,text){
    const QR=window.QRCode||(typeof QRCode!=='undefined'?QRCode:null);
    if(QR&&canvas){QR.toCanvas(canvas,text||'NO_CODE',{width:220,margin:1,color:{dark:'#e8edf2',light:'#0000'}},()=>{});return true;}
    return false;
  }
  function drawTextFallback(canvas,text){
    if(!canvas) return;const ctx=canvas.getContext('2d');
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.fillStyle='#0f141c';ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.strokeStyle='#242b35';ctx.strokeRect(0.5,0.5,canvas.width-1,canvas.height-1);
    ctx.fillStyle='#e8edf2';ctx.font='bold 28px Inter, system-ui, Arial';ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillText(String(text||'').trim()||'—',canvas.width/2,canvas.height/2);
  }
  function showQR(text){
    const t=(text||'').toString().trim();$('#qrCodeText').textContent=t||'—';setModal('#qrModal',true);
    const canvas=$('#qrCanvas');
    loadQrLib().then(()=>drawQr(canvas,t)||drawTextFallback(canvas,t)).catch(()=>drawTextFallback(canvas,t));
  }
  document.addEventListener('click',(e)=>{if(e.target.closest('[data-close]')||e.target.classList.contains('modal-backdrop'))setModal('#qrModal',false);});
  window.addEventListener('keydown',(e)=>{if(e.key==='Escape')setModal('#qrModal',false);});

  async function reserveOffer(id){
    try{
      const res=await fetch(`${API}/api/v1/reservations`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({offer_id:id})});
      const data=await res.json();if(!res.ok) throw new Error(data?.detail||`Ошибка ${res.status}`);
      const code=data.code||data.id||data.reservation_code;if(!code){toast('Бронь создана, но код не получен');return;}
      showQR(code);toast('Оффер забронирован ✓');
    }catch(e){toast(String(e.message||e)||'Не удалось забронировать');}
  }

  document.addEventListener('click',(e)=>{const btn=e.target.closest('[data-reserve-id]');if(!btn)return;reserveOffer(btn.getAttribute('data-reserve-id'));});
})();