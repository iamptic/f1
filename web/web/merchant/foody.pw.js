
/*! Foody PW — ensure toggle for all password fields (including repeat) */
(function(){
  function ready(fn){ if(document.readyState==='complete'||document.readyState==='interactive') setTimeout(fn,0); else document.addEventListener('DOMContentLoaded',fn); }
  function wrap(input){
    if (!input || input.closest('.pw-field')) return;
    var w = document.createElement('div'); w.className = 'pw-field';
    input.parentNode.insertBefore(w, input); w.appendChild(input);
    var btn = document.createElement('button'); btn.type='button'; btn.className='pw-toggle'; btn.setAttribute('aria-pressed','false'); btn.setAttribute('aria-label','Показать пароль');
    w.appendChild(btn);
    btn.addEventListener('click', function(){
      var show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      btn.setAttribute('aria-pressed', show ? 'true' : 'false');
      input.focus({preventScroll:true});
    });
  }
  function ensureAll(){ document.querySelectorAll('input[type="password"]').forEach(wrap); }
  ready(function(){ ensureAll(); try{ new MutationObserver(ensureAll).observe(document.body,{childList:true,subtree:true}); }catch(_){}});
})();
