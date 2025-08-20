
/*! Foody Offer Photo — force FilePond init (dynamic loader + 1:1 crop) */
(function(){
  var CDNS = {
    css: [
      "https://unpkg.com/filepond@4.30.7/dist/filepond.min.css",
      "https://unpkg.com/filepond-plugin-image-preview@4.6.12/dist/filepond-plugin-image-preview.min.css"
    ],
    js: [
      "https://unpkg.com/filepond@4.30.7/dist/filepond.min.js",
      "https://unpkg.com/filepond-plugin-image-preview@4.6.12/dist/filepond-plugin-image-preview.min.js",
      "https://unpkg.com/filepond-plugin-file-validate-type@1.2.8/dist/filepond-plugin-file-validate-type.min.js",
      "https://unpkg.com/filepond-plugin-file-validate-size@2.2.8/dist/filepond-plugin-file-validate-size.min.js",
      "https://unpkg.com/filepond-plugin-image-crop@2.0.6/dist/filepond-plugin-image-crop.min.js"
    ]
  };
  function addCss(href){ return new Promise(function(res){ 
    if ([...document.styleSheets].some(s=>s.href && s.href.indexOf(href)>=0)) return res();
    var l=document.createElement('link'); l.rel='stylesheet'; l.href=href; l.onload=res; l.onerror=res; document.head.appendChild(l);
  });}
  function addJs(src){ return new Promise(function(res){
    if ([...document.scripts].some(s=>s.src && s.src.indexOf(src)>=0)) return res();
    var s=document.createElement('script'); s.src=src; s.defer=true; s.async=false; s.onload=res; s.onerror=res; document.head.appendChild(s);
  });}
  function ready(fn){ if(document.readyState==='complete'||document.readyState==='interactive') setTimeout(fn,0); else document.addEventListener('DOMContentLoaded',fn); }

  function hiddenUrlFor(input){
    var form = input.closest('form') || document;
    var h = form.querySelector('input[name="image_url"]');
    if(!h){ h=document.createElement('input'); h.type='hidden'; h.name='image_url'; h.id='offerImageUrl'; input.insertAdjacentElement('afterend', h); }
    return h;
  }
  function initOn(input){
    if(!input || input._pond || typeof FilePond==='undefined') return;
    var hidden = hiddenUrlFor(input);
    try {
      if (window.FilePondPluginImagePreview) FilePond.registerPlugin(FilePondPluginImagePreview);
      if (window.FilePondPluginFileValidateType) FilePond.registerPlugin(FilePondPluginFileValidateType);
      if (window.FilePondPluginFileValidateSize) FilePond.registerPlugin(FilePondPluginFileValidateSize);
      if (window.FilePondPluginImageCrop) FilePond.registerPlugin(FilePondPluginImageCrop);
    } catch(_) {}
    var files = hidden.value ? [{source:hidden.value, options:{type:'local'}}] : [];
    var pond = FilePond.create(input, {
      credits:false, files, allowMultiple:false, maxFiles:1,
      acceptedFileTypes:['image/*'], maxFileSize:'5MB',
      allowImagePreview:true, imagePreviewHeight:180,
      stylePanelAspectRatio:'1:1', imageCropAspectRatio:'1:1',
      labelIdle:'Перетащите фото или <span class="filepond--label-action">выберите</span>'
    });
    input._pond = pond;
    async function upload(file){
      try {
        var base = (window.__FOODY__ && window.__FOODY__.FOODY_API) || window.foodyApi || '';
        if (!base) throw new Error('FOODY_API missing');
        var fd = new FormData(); fd.append('file', file);
        var r = await fetch(base.replace(/\/+$/,'') + '/upload', { method:'POST', body: fd });
        if (!r.ok) throw new Error('Upload failed ' + r.status);
        var j = await r.json(); hidden.value = (j && (j.url || j.Location || j.location)) || '';
      } catch(e){ console.warn('upload failed', e); hidden.value=''; try{pond.removeFile();}catch(_){}} }
    pond.on('addfile', function(err, item){ if(!err && item && item.file) upload(item.file);});
    pond.on('removefile', function(){ hidden.value=''; });
  }
  function initAll(){
    var cont = document.getElementById('create') || document;
    var inputs = cont.querySelectorAll('input[type="file"]');
    inputs.forEach(initOn);
  }
  function observe(){
    try { new MutationObserver(initAll).observe(document.body, {childList:true, subtree:true}); } catch(_){}
  }
  async function boot(){
    try { await Promise.all(CDNS.css.map(addCss)); } catch(_){}
    try { for (const u of CDNS.js) { await addJs(u); } } catch(_){}
    initAll(); observe();
    document.addEventListener('click', function(e){ if(e.target.closest('[data-tab="create"]')) setTimeout(initAll, 50); }, true);
  }
  ready(boot);
})();
