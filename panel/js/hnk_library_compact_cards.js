(function(global){
  'use strict';
  var doc = global.document;
  if(!doc){ return; }
  var API = {};
  var state = { data:null, all:[], filtered:[], visible:12, pageSize:12, collection:'All', category:'All', query:'', favorites:{} };
  var ids = { root:'hnkCompactLibraryCards', list:'hnkCompactLibraryList', count:'hnkCompactLibraryCount', search:'hnkCompactLibrarySearch', category:'hnkCompactLibraryCategory', more:'hnkCompactLibraryMore' };
  /* v6.47.0 — here 'button' means "a control", not "the Adobe widget". UXP
     paints its button widget with its own chrome and its own font stack, and
     on the owner's Photoshop that font has no Burmese: the filter row's
     'အားလုံး' arrived as an empty pill, and 'လမ်းညွှန်' / 'Studio ထဲထည့်မည်' /
     'နောက်ထပ်ပြမည်' the same. A div wears this panel's stylesheet and this
     panel's font stack, which render Burmese everywhere else on the page.
     The .type='button' the call sites set is a harmless no-op on a div. */
  function el(tag, cls, text){
    var n=doc.createElement(tag === 'button' ? 'div' : tag);
    if(tag === 'button'){ n.setAttribute('role','button'); n.setAttribute('tabindex','0'); }
    if(cls){n.className=cls;} if(text!==undefined){n.textContent=text;} return n; }
  /* v6.25 — THE CARDS SHIPPED IMAGELESS. Every record's paths point at the
     assets/user_library folders, which have never existed inside the CCX (an
     archive carrying 1,801 plates twice over would be ~100MB of inspectable
     client-side bytes), so every card fired onerror and rendered "Preview
     unavailable" — a visual library with no visuals. The same plates are
     served by the licensed web host the manifest already allows for the API,
     under the web app's own /app/lib/ui and /app/lib/full names, so the panel
     now reads them from there: online studios get the real art, offline ones
     keep the text cards exactly as before. */
  var ASSET_BASE='https://hnk-ai-tools-3-s4nnu.ondigitalocean.app/app/lib/';
  function resolveAsset(p){
    var s=String(p||'');
    var m=s.match(/^assets\/user_library(_ui|_thumb)?\/(.+)$/);
    if(!m){ return s; }
    return ASSET_BASE+(m[1]?'ui':'full')+'/'+m[2];
  }
  function getData(){ return global.HNK_LIBRARY_INDEX || (global.HNK && global.HNK.USER_LIBRARY_INDEX) || null; }
  function readFavorites(){
    try { var raw=global.localStorage && global.localStorage.getItem('hnkCompactLibraryFavorites'); state.favorites=raw?JSON.parse(raw):{}; }
    catch(e){ state.favorites={}; }
  }
  function saveFavorites(){ try{ if(global.localStorage){ global.localStorage.setItem('hnkCompactLibraryFavorites',JSON.stringify(state.favorites)); } }catch(e){} }
  function mm(item,key){ return item[key+'MM'] || item[key] || ''; }
  function normalized(s){ return String(s||'').toLowerCase().replace(/\s+/g,' ').trim(); }
  function matches(item){
    if(state.collection!=='All' && item.collection!==state.collection){ return false; }
    if(state.category!=='All' && item.family!==state.category){ return false; }
    if(!state.query){ return true; }
    var hay=normalized([item.id,item.title,item.titleMM,item.family,item.familyMM,item.group,item.groupMM,item.purpose,item.purposeMM,(item.tags||[]).join(' ')].join(' '));
    return hay.indexOf(state.query)!==-1;
  }
  function sortItems(list){
    return list.slice().sort(function(a,b){
      var af=a.featuredRank||9999, bf=b.featuredRank||9999;
      if(af!==bf){ return af-bf; }
      return (a.sourceNumber||0)-(b.sourceNumber||0);
    });
  }
  function applyFilters(){
    state.filtered=sortItems(state.all.filter(matches));
    state.visible=Math.min(state.pageSize,state.filtered.length);
    renderList();
  }
  function chip(text, protect){ return el('span','hnk-lib-chip'+(protect?' protect':''),text); }
  function guideItem(label,text){ var box=el('div','hnk-lib-guide-item'); box.appendChild(el('span','hnk-lib-guide-label',label)); box.appendChild(el('p','hnk-lib-guide-text',text)); return box; }
  function showToast(text){ var t=doc.getElementById('hnkCompactLibraryToast'); if(!t){return;} t.textContent=text; t.hidden=false; global.clearTimeout(t._timer); t._timer=global.setTimeout(function(){t.hidden=true;},2400); }
  function selectItem(item){
    var handled=false;
    try{
      if(global.HNK && typeof global.HNK.onLibraryPresetSelect==='function'){ global.HNK.onLibraryPresetSelect(item); handled=true; }
      else if(global.HNK && global.HNK.library && typeof global.HNK.library.select==='function'){ global.HNK.library.select(item); handled=true; }
    }catch(e){}
    try{
      var evt;
      if(typeof global.CustomEvent==='function'){ evt=new global.CustomEvent('hnk-library-select',{detail:item}); }
      else { evt=doc.createEvent('CustomEvent'); evt.initCustomEvent('hnk-library-select',true,true,item); }
      doc.dispatchEvent(evt);
    }catch(e){}
    showToast((handled?'Studio ထဲ ထည့်ပြီးပါပြီ · ':'ရွေးထားသည် · ')+item.title);
  }
  function openPreview(item){
    var modal=doc.getElementById('hnkCompactPreviewModal'); if(!modal){return;}
    var img=modal.querySelector('.hnk-preview-image');
    var title=modal.querySelector('.hnk-preview-title');
    var meta=modal.querySelector('.hnk-preview-meta');
    title.textContent=item.title;
    img.alt=item.title;
    img.src=resolveAsset(item.paths.full);
    meta.textContent=item.familyMM+' · '+item.ratio+' · '+item.tone+' · '+item.contrast+' · Full image shown with no crop';
    modal.classList.add('open');
    modal.setAttribute('aria-hidden','false');
  }
  function closePreview(){ var modal=doc.getElementById('hnkCompactPreviewModal'); if(modal){ modal.classList.remove('open'); modal.setAttribute('aria-hidden','true'); } }
  function createCard(item){
    var card=el('article','hnk-lib-card'); card.setAttribute('data-id',item.id);
    var main=el('div','hnk-lib-main');
    var media=el('button','hnk-lib-media'); media.type='button'; media.setAttribute('aria-label','Open full preview: '+item.title);
    /* v6.47.1 — EAGER. loading='lazy' asks the renderer to wait until the
       image is near the viewport, and this one has nothing driving that:
       the owner's Photoshop showed the first card's art and then a column
       of black boxes, with no 'Preview unavailable' anywhere — the mark of
       an image that was never asked to load rather than one that failed.
       A page shows twelve cards; twelve previews is not a burden. */
    var img=el('img','hnk-lib-image'); img.alt=item.title; img.loading='eager'; img.decoding='async'; img.src=resolveAsset(item.paths.preview);
    img.onerror=function(){ this.style.display='none'; media.appendChild(el('span','hnk-lib-purpose','Preview unavailable')); };
    media.appendChild(img); media.appendChild(el('span','hnk-lib-ratio',item.ratio)); media.addEventListener('click',function(){openPreview(item);});
    var info=el('div','hnk-lib-info');
    var tr=el('div','hnk-lib-title-row'); tr.appendChild(el('h3','hnk-lib-title',item.title));
    var fav=el('button','hnk-lib-fav'+(state.favorites[item.id]?' active':''),state.favorites[item.id]?'★':'☆'); fav.type='button'; fav.setAttribute('aria-label','Favorite');
    fav.addEventListener('click',function(){ state.favorites[item.id]=!state.favorites[item.id]; if(!state.favorites[item.id]){delete state.favorites[item.id];} saveFavorites(); fav.classList.toggle('active'); fav.textContent=state.favorites[item.id]?'★':'☆'; });
    tr.appendChild(fav); info.appendChild(tr);
    info.appendChild(el('p','hnk-lib-purpose',item.purposeMM));
    var chips=el('div','hnk-lib-chips'); chips.appendChild(chip(item.familyMM)); chips.appendChild(chip(item.ratio)); chips.appendChild(chip(item.tone+' · '+item.contrast)); chips.appendChild(chip('Identity Lock',true)); info.appendChild(chips);
    var actions=el('div','hnk-lib-actions');
    var detailBtn=el('button','hnk-lib-btn secondary','လမ်းညွှန်'); detailBtn.type='button';
    var chooseBtn=el('button','hnk-lib-btn primary','Studio ထဲထည့်မည်'); chooseBtn.type='button';
    actions.appendChild(detailBtn); actions.appendChild(chooseBtn); info.appendChild(actions);
    main.appendChild(media); main.appendChild(info); card.appendChild(main);
    var guide=el('div','hnk-lib-guide');
    guide.appendChild(guideItem('အသုံးပြုရန်',item.purposeMM));
    guide.appendChild(guideItem('ထည့်ရမည့်ပုံ',item.inputGuideMM));
    guide.appendChild(guideItem('ယူမည့်အရာ',item.referenceRoleMM));
    guide.appendChild(guideItem('မပြောင်းရ',item.preserveMM));
    guide.appendChild(guideItem('ရှောင်ရန်',item.avoidMM));
    guide.appendChild(guideItem('ဆက်တင်',item.recommendedStrength+' · Auto Ratio · Full Image / No Crop'));
    card.appendChild(guide);
    detailBtn.addEventListener('click',function(){ var open=guide.classList.toggle('open'); detailBtn.textContent=open?'ပိတ်မည်':'လမ်းညွှန်'; });
    chooseBtn.addEventListener('click',function(){selectItem(item);});
    return card;
  }
  function renderList(){
    var list=doc.getElementById(ids.list), count=doc.getElementById(ids.count), more=doc.getElementById(ids.more); if(!list){return;}
    while(list.firstChild){list.removeChild(list.firstChild);}
    var shown=state.filtered.slice(0,state.visible);
    if(!shown.length){ list.appendChild(el('div','hnk-library-empty','ကိုက်ညီသော asset မတွေ့ပါ။ Search / Category ကို ပြန်ရွေးပါ။')); }
    else { shown.forEach(function(item){list.appendChild(createCard(item));}); }
    if(count){ count.textContent=(shown.length?('1–'+shown.length):'0')+' / '+state.filtered.length; }
    if(more){ more.hidden=state.visible>=state.filtered.length; more.textContent='နောက်ထပ် '+Math.min(state.pageSize,state.filtered.length-state.visible)+' ခု ပြမည်'; }
  }
  function buildShell(host){
    var shell=el('section','hnk-library-shell');
    var head=el('div','hnk-library-head'); var hc=el('div'); hc.appendChild(el('h2','', 'Professional Visual Library')); hc.appendChild(el('p','', 'Compact cards · Full guideline · Auto Ratio · No Crop')); head.appendChild(hc); head.appendChild(el('span','hnk-library-count','0 / 0')); head.lastChild.id=ids.count; shell.appendChild(head);
    var controls=el('div','hnk-library-controls');
    var search=el('input','hnk-library-search'); search.id=ids.search; search.type='search'; search.placeholder='Title / category / mood ရှာရန်'; search.setAttribute('aria-label','Search library'); controls.appendChild(search);
    var select=el('select','hnk-library-select'); select.id=ids.category; var allOpt=el('option','', 'All categories'); allOpt.value='All'; select.appendChild(allOpt); var cats={}; state.all.forEach(function(x){cats[x.family]=x.familyMM;}); Object.keys(cats).sort().forEach(function(k){var opt=el('option','',cats[k]); opt.value=k; select.appendChild(opt);}); controls.appendChild(select);
    var row=el('div','hnk-library-filter-row');
    (function(){var pairs=[['All','အားလုံး']];var cc=(state.data&&state.data.collectionCounts)||{};Object.keys(cc).forEach(function(k){pairs.push([k,k+' '+cc[k]]);});return pairs;})().forEach(function(pair){ var b=el('button','hnk-library-filter'+(pair[0]==='All'?' active':''),pair[1]); b.type='button'; b.setAttribute('data-collection',pair[0]); b.addEventListener('click',function(){ state.collection=pair[0]; var buttons=row.querySelectorAll('.hnk-library-filter'); for(var i=0;i<buttons.length;i++){buttons[i].classList.toggle('active',buttons[i]===b);} applyFilters(); }); row.appendChild(b); });
    controls.appendChild(row); shell.appendChild(controls);
    var list=el('div','hnk-library-list'); list.id=ids.list; shell.appendChild(list);
    var more=el('button','hnk-library-more','နောက်ထပ်ပြမည်'); more.id=ids.more; more.type='button'; more.addEventListener('click',function(){ state.visible=Math.min(state.filtered.length,state.visible+state.pageSize); renderList(); }); shell.appendChild(more);
    var toast=el('div','hnk-library-toast'); toast.id='hnkCompactLibraryToast'; toast.hidden=true; shell.appendChild(toast);
    var modal=el('div','hnk-preview-modal'); modal.id='hnkCompactPreviewModal'; modal.setAttribute('aria-hidden','true');
    var dialog=el('div','hnk-preview-dialog'); var bar=el('div','hnk-preview-bar'); bar.appendChild(el('h3','hnk-preview-title','Preview')); var close=el('button','hnk-preview-close','×'); close.type='button'; close.addEventListener('click',closePreview); bar.appendChild(close); dialog.appendChild(bar); var wrap=el('div','hnk-preview-image-wrap'); var pi=el('img','hnk-preview-image'); wrap.appendChild(pi); dialog.appendChild(wrap); dialog.appendChild(el('p','hnk-preview-meta','')); modal.appendChild(dialog); modal.addEventListener('click',function(e){if(e.target===modal){closePreview();}}); shell.appendChild(modal);
    host.appendChild(shell);
    search.addEventListener('input',function(){ state.query=normalized(search.value); applyFilters(); });
    select.addEventListener('change',function(){ state.category=select.value; applyFilters(); });
    doc.addEventListener('keydown',function(e){ if(e.key==='Escape'){closePreview();} });
  }
  function locateHost(options){
    if(options && options.host){ return typeof options.host==='string'?doc.querySelector(options.host):options.host; }
    var existing=doc.getElementById(ids.root); if(existing){return existing;}
    var selectors=['#libraryCompactHost','#libraryCatalogHost','#pageLibrary .library-content','#pageLibrary','#libraryPage','.library-page','[data-page="library"]'];
    for(var i=0;i<selectors.length;i++){ var n=doc.querySelector(selectors[i]); if(n){ var host=el('div','hnk-library-root'); host.id=ids.root; n.appendChild(host); return host; } }
    return null;
  }
  API.mount=function(options){
    if(doc.querySelector('#'+ids.root+' .hnk-library-shell')){return true;}
    state.data=getData(); if(!state.data || !state.data.items){return false;}
    state.all=state.data.items.slice(); state.pageSize=state.data.defaultPageSize||12; readFavorites();
    var host=locateHost(options||{}); if(!host){return false;} host.classList.add('hnk-library-root'); buildShell(host); applyFilters(); return true;
  };
  API.refresh=function(){ state.data=getData(); if(state.data&&state.data.items){state.all=state.data.items.slice(); applyFilters();} };
  API.getItem=function(id){ for(var i=0;i<state.all.length;i++){if(state.all[i].id===id){return state.all[i];}} return null; };
  global.HNKCompactLibrary=API;
  function auto(){ API.mount({}); }
  if(doc.readyState==='loading'){doc.addEventListener('DOMContentLoaded',auto);} else {global.setTimeout(auto,0);}
})(window);
