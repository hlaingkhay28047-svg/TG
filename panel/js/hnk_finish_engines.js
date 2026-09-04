/* ============================================================
   HNK HD Finish engines — LIFTED, do not edit by hand.
   Source of truth: the web app's own RH_FINISH_ENGINES table and its
   rhFinishEngine / rhFinishWH / rhFinishBody helpers
   (docs/app/index.html), copied verbatim by
   tools/build_panel_finish_engines.js so a retouch finished in Photoshop
   and a retouch finished in the browser send RunningHub the same body.
   ============================================================ */
(function () {
"use strict";

/* the app reads its size tier through this helper; the panel's own copy
   lives in the studio module, so the lifted body builder gets it here */
function rhScaleFromSize(sizeSel){
  var s=String(sizeSel||"").toLowerCase();
  return s==="4k" ? "6x" : s==="2k" ? "4x" : "2x";
}

var RH_FINISH_ENGINES = [
  /* today's behaviour, kept as the default so nothing changes unasked */
  { id:"standard", apiPath:"topazlabs/image-upscale-standard-v2",       body:"scale",    face:true,
    label:{my:"ပုံမှန်",en:"Standard",shn:"ပုၵ်ႉမၢၼ်ႇ",kac:"Hkrang",th:"มาตรฐาน",zh:"标准",vi:"Tiêu chuẩn",id:"Standar",ms:"Standard"} },
  { id:"faces",    apiPath:"topazlabs/image-upscale-detail-faces",      body:"detail",   face:false,
    label:{my:"မျက်နှာ အသေးစိတ်",en:"Face detail",shn:"ၼႃႈ လမ်ႇလွင်ႈ",kac:"Myiman detail",th:"รายละเอียดใบหน้า",zh:"面部细节",vi:"Chi tiết khuôn mặt",id:"Detail wajah",ms:"Perincian wajah"} },
  { id:"fidelity", apiPath:"topazlabs/image-upscale-high-fidelity-v3",  body:"fidelity", face:true,
    label:{my:"ပရင့်ထုတ် (High Fidelity)",en:"For print",shn:"တႃႇ Print",kac:"Print na",th:"สำหรับพิมพ์",zh:"用于印刷",vi:"Để in",id:"Untuk cetak",ms:"Untuk cetak"} },
  { id:"lowres",   apiPath:"topazlabs/image-upscale/low-resolution-v2", body:"scale",    face:true,
    label:{my:"ပုံသေး / ဓာတ်ပုံဟောင်း",en:"Small or old photo",shn:"ၶႅပ်းလဵၵ်ႉ/ၵဝ်ႇ",kac:"Sumla kaji/dinghpring",th:"ภาพเล็กหรือเก่า",zh:"小图或旧照片",vi:"Ảnh nhỏ hoặc cũ",id:"Foto kecil atau lama",ms:"Foto kecil atau lama"} },
  { id:"restore",  apiPath:"image-enhance/hypir-balance",               body:"hypir",    face:false,
    label:{my:"ပြန်လည်ပြုပြင် (HYPIR)",en:"Restore (HYPIR)",shn:"မႄးၶိုၼ်း (HYPIR)",kac:"Bai galaw (HYPIR)",th:"ฟื้นฟู (HYPIR)",zh:"修复 (HYPIR)",vi:"Phục hồi (HYPIR)",id:"Pulihkan (HYPIR)",ms:"Pulihkan (HYPIR)"} }
];
function rhFinishEngine(id){
  return RH_FINISH_ENGINES.filter(function(e){ return e.id===id; })[0] || RH_FINISH_ENGINES[0];
}
function rhFinishWH(sizeSel){
  var z=String(sizeSel||"").toLowerCase();
  if(z==="4k") return {w:3840,h:2160};
  if(z==="2k") return {w:2560,h:1440};
  if(z==="1k") return {w:1920,h:1080};
  return null;
}
function rhFinishBody(engine, imageUrl, sizeSel, faceMode){
  var e=engine||RH_FINISH_ENGINES[0];
  var body={ imageUrl: imageUrl||"" };
  var wh=rhFinishWH(sizeSel);
  if(e.body==="scale"){
    body.scale = rhScaleFromSize(sizeSel) || "2x";
  } else if(e.body==="detail"){
    if(wh){ body.outputWidth=wh.w; body.outputHeight=wh.h; }
    body.detailStrength = 6;                 /* the endpoint's own default */
  } else if(e.body==="fidelity"){
    if(wh){ body.outputWidth=wh.w; body.outputHeight=wh.h; }
    body.strength = 0.25;                    /* the endpoint's own default */
  } else if(e.body==="hypir"){
    /* upscale is REQUIRED here and is a plain integer factor, not an enum */
    var z=String(sizeSel||"").toLowerCase();
    body.upscale = (z==="4k") ? 4 : (z==="2k") ? 2 : 1;
  }
  if(e.face){
    if(faceMode==="keep"){ body.faceEnhancement=false; }
    else if(faceMode==="strong"){ body.faceEnhancement=true; body.faceEnhancementStrength=1; }
    /* "auto" sends nothing — the published default is the historical behaviour */
  }
  return body;
}

/* The student's stored choice. svGet is the studio module's settings store,
   which is present whenever a retouch page is mounted; before that (and in
   a plain node require) the app's own defaults stand, which are exactly the
   endpoint and body this panel has always sent. */
function settings() {
  var g = (typeof globalThis.svGet === "function") ? globalThis.svGet : function (k, d) { return d; };
  return { engine: rhFinishEngine(g("st_fin_engine", "standard")), face: g("st_fin_face", "auto") };
}

var API = { list: RH_FINISH_ENGINES, get: rhFinishEngine, body: rhFinishBody, settings: settings };
if (typeof module !== "undefined" && module.exports) module.exports = API;
else {
  globalThis.HNK = globalThis.HNK || {};
  globalThis.HNK.finishEngines = API;
  /* the lifted studio slices call these by their app names */
  globalThis.RH_FINISH_ENGINES = RH_FINISH_ENGINES;
  globalThis.rhFinishEngine = rhFinishEngine;
  globalThis.rhFinishBody = rhFinishBody;
  globalThis.rhFinishSettings = settings;
}
})();
