// Foody — Pretty Photo Uploader (dropzone + preview + clipboard)
(function(){
  const MAX_MB = 5;
  const ACCEPT = ['image/jpeg','image/png','image/webp'];

  function $(sel, root=document){ return root.querySelector(sel); }
  function el(tag, cls){ const n=document.createElement(tag); if(cls) n.className=cls; return n; }
  function fmtSize(bytes){
    if(bytes==null) return '';
    const mb = bytes/1024/1024;
    return (mb>=1? mb.toFixed(2)+' МБ' : (bytes/1024|0)+' КБ');
  }

  function enhanceInput(fileInput){
    if(!fileInput || fileInput.__enhanced) return;
    fileInput.__enhanced = true;

    // Build UI
    const wrap = el('label', 'uploader');
    const thumb = el('div','thumb'); thumb.innerHTML = '<svg width="28" height="28" viewBox="0 0 24 24" fill="none"><path d="M3 7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V7z" stroke="#475569"/><path d="M8.5 13.5 10 12l2.5 3L16 11l3 4" stroke="#64748b"/><circle cx="9" cy="8" r="1.5" fill="#64748b"/></svg>';
    const info = el('div','info');
    const title = el('div','title'); title.textContent = 'Загрузите фото оффера';
    const hint = el('div','hint'); hint.textContent = 'JPG/PNG/WebP до 5 МБ. Перетащите файл сюда или выберите.';
    const actions = el('div','actions');
    const choose = el('button','btn'); choose.type='button'; choose.textContent='Выбрать файл';
    const clear = el('button','btn'); clear.type='button'; clear.textContent='Очистить';
    actions.append(choose, clear);
    info.append(title, hint, actions);
    wrap.append(thumb, info);
    fileInput.parentElement.insertBefore(wrap, fileInput);
    wrap.append(fileInput); // file input sits on top (opacity:0) to trigger native picker

    const errorEl = el('div','error-text');
    wrap.after(errorEl);

    function setError(msg){
      if(msg){ wrap.classList.add('error'); errorEl.textContent = msg; }
      else { wrap.classList.remove('error'); errorEl.textContent = ''; }
    }
    function setPreview(file){
      if(!file){ thumb.innerHTML = '<svg width="28" height="28" viewBox="0 0 24 24" fill="none"><path d="M3 7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V7z" stroke="#475569"/><path d="M8.5 13.5 10 12l2.5 3L16 11l3 4" stroke="#64748b"/><circle cx="9" cy="8" r="1.5" fill="#64748b"/></svg>'; title.textContent='Загрузите фото оффера'; hint.textContent='JPG/PNG/WebP до 5 МБ. Перетащите файл сюда или выберите.'; wrap.classList.remove('success'); return; }
      const reader = new FileReader();
      reader.onload = e => {
        thumb.innerHTML = '';
        const img = new Image();
        img.src = e.target.result;
        thumb.appendChild(img);
        title.textContent = file.name + ' · ' + fmtSize(file.size);
        hint.textContent = 'Файл выбран. Можно заменить или очистить.';
        wrap.classList.add('success');
      };
      reader.readAsDataURL(file);
    }

    function acceptFile(file){
      if(!file) return;
      if(!ACCEPT.includes(file.type)){
        setError('Поддерживаются только JPG, PNG, WebP');
        fileInput.value = '';
        setPreview(null);
        return;
      }
      if(file.size > MAX_MB*1024*1024){
        setError('Размер больше ' + MAX_MB + ' МБ');
        fileInput.value = '';
        setPreview(null);
        return;
      }
      setError('');
      // Assign to input via DataTransfer (so форма отправит файл)
      const dt = new DataTransfer();
      dt.items.add(file);
      fileInput.files = dt.files;
      setPreview(file);
    }

    // Handlers
    fileInput.addEventListener('change', e => {
      const f = e.target.files && e.target.files[0];
      acceptFile(f);
    });
    choose.addEventListener('click', () => fileInput.click());
    clear.addEventListener('click', () => { fileInput.value=''; setPreview(null); });

    // Drag & Drop
    ;['dragenter','dragover'].forEach(ev=>wrap.addEventListener(ev, e=>{ e.preventDefault(); wrap.classList.add('drag'); }));
    ;['dragleave','drop'].forEach(ev=>wrap.addEventListener(ev, e=>{ e.preventDefault(); wrap.classList.remove('drag'); }));
    wrap.addEventListener('drop', e => {
      const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      acceptFile(f);
    });

    // Paste from clipboard
    document.addEventListener('paste', e => {
      if(!wrap.isConnected) return;
      const items = e.clipboardData && e.clipboardData.files;
      if(items && items[0]) acceptFile(items[0]);
    });

    // If file already preset (e.g. edit form), show preview
    if(fileInput.files && fileInput.files[0]) setPreview(fileInput.files[0]);
  }

  function init(){
    // Try to find the file input in the Create/Edit offer form.
    // Be robust: look for first file input in a form that has name like 'offer' or id contains 'offer'.
    const candidates = [
      'form#offerCreateForm input[type=file]',
      'form#offerEditForm input[type=file]',
      'form[id*="offer"] input[type=file]',
      'form[action*="offers"] input[type=file]',
      'input[type=file][name="photo"]',
      'input[type=file][name="image"]',
      'input[type=file]'
    ];
    for(const sel of candidates){
      const inp = document.querySelector(sel);
      if(inp){ enhanceInput(inp); break; }
    }
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();