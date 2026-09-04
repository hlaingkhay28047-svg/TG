/* v6.69.0 — WHAT SHAPE A PHOTOGRAPH IS SENT AS (docs/app/index.html
   rhImageSize / rhNearestRatio / rhNeedsMeasuredRatio, ported byte-for-byte;
   test/verify_ratio_fit.js proves the two surfaces answer identically, which
   is why the probe below keeps the app's own indentation rather than the
   module's — it is a copy, and it is checked as one).
   RH_NODE_RATIO_MAP has no "auto" key, so `RH_NODE_RATIO_MAP[ratio] || "1"`
   sent "1" — 1:1, SQUARE — whenever the student left Ratio on Auto, which is
   the default. On the six endpoints whose documented enum has no auto value
   a portrait came back square, while the prompt inside the very same request
   promised "aspect ratio stays exactly as photographed". The request wins
   over the prompt every time, so no wording could have fixed this.
   Nothing here invents an enum value: when Auto is asked of an endpoint that
   cannot express it, IMAGE 1 is measured and the NEAREST of the seven
   DOCUMENTED ratios is sent in its place. The size is read from the file's
   own header rather than from an Image, because UXP's is not the browser's
   and a byte reader is the only probe both surfaces can share. */
(function (global) {
  "use strict";
  var RH_NODE_RATIO_MAP = { "1:1": "1", "3:4": "2", "4:3": "3", "9:16": "4", "16:9": "5", "2:3": "6", "3:2": "7" };
function rhB64Head(b64, bytes){
  /* base64 is 4 chars per 3 bytes; slice on a 4-char boundary so atob never
     sees a partial group. Only the header is decoded — a 12MB photograph
     costs the same as a thumbnail here. */
  var n=Math.ceil((bytes||65536)/3)*4;
  var s=b64.length>n ? b64.slice(0, n-(n%4)) : b64;
  var bin;
  try{ bin=atob(s); }catch(e){ return null; }
  var out=new Uint8Array(bin.length);
  for(var i=0;i<bin.length;i++) out[i]=bin.charCodeAt(i);
  return out;
}
/* v5.98.0 — the pixel size read from the file's own header, with no DOM.
   The panel runs in UXP, where `new Image()` is not the browser's, so a
   shared byte reader is the only way both surfaces can answer this question
   the same way — and it is testable in Node, which an Image is not.
   PNG, JPEG and WebP cover every format the pickers accept. */
function rhImageSize(b64){
  var d=rhB64Head(b64, 65536);
  if(!d || d.length<16) return null;
  /* PNG: 8-byte signature, then IHDR length+type, then width/height BE */
  if(d[0]===0x89 && d[1]===0x50 && d[2]===0x4E && d[3]===0x47){
    var pw=(d[16]<<24|d[17]<<16|d[18]<<8|d[19])>>>0, ph=(d[20]<<24|d[21]<<16|d[22]<<8|d[23])>>>0;
    return (pw&&ph)?{w:pw,h:ph}:null;
  }
  /* JPEG: walk the segment chain to the first SOFn that is not a
     DHT/DAC/RST marker; SOF gives height then width, both BE. */
  if(d[0]===0xFF && d[1]===0xD8){
    var i=2;
    while(i+9<d.length){
      if(d[i]!==0xFF){ i++; continue; }
      var mk=d[i+1];
      if(mk===0xD8||mk===0x01||(mk>=0xD0&&mk<=0xD7)){ i+=2; continue; }
      if(mk===0xD9||mk===0xDA) break;
      var len=(d[i+2]<<8)|d[i+3];
      if(len<2) break;
      if((mk>=0xC0&&mk<=0xC3)||(mk>=0xC5&&mk<=0xC7)||(mk>=0xC9&&mk<=0xCB)||(mk>=0xCD&&mk<=0xCF)){
        var jh=(d[i+5]<<8)|d[i+6], jw=(d[i+7]<<8)|d[i+8];
        return (jw&&jh)?{w:jw,h:jh}:null;
      }
      i+=2+len;
    }
    return null;
  }
  /* WebP: RIFF....WEBP then VP8 / VP8L / VP8X */
  if(d[0]===0x52&&d[1]===0x49&&d[2]===0x46&&d[3]===0x46&&d[8]===0x57&&d[9]===0x45&&d[10]===0x42&&d[11]===0x50){
    var c=String.fromCharCode(d[12],d[13],d[14],d[15]);
    if(c==="VP8X") return {w:((d[24]|d[25]<<8|d[26]<<16)>>>0)+1, h:((d[27]|d[28]<<8|d[29]<<16)>>>0)+1};
    if(c==="VP8L") return {w:(((d[21]|d[22]<<8)&0x3FFF)>>>0)+1, h:((((d[22]>>6)|d[23]<<2|(d[24]&0x0F)<<10)&0x3FFF)>>>0)+1};
    if(c==="VP8 ") return {w:((d[26]|d[27]<<8)&0x3FFF), h:((d[28]|d[29]<<8)&0x3FFF)};
    return null;
  }
  return null;
}
var RH_RATIO_WH = { "1:1":1, "3:4":0.75, "4:3":4/3, "9:16":0.5625, "16:9":16/9, "2:3":2/3, "3:2":1.5 };
function nearestRatio(w, h){
  if(!w || !h) return "";
  var a=w/h, best="", bd=Infinity;
  for(var k in RH_RATIO_WH){
    var d=Math.abs(Math.log(a/RH_RATIO_WH[k]));
    if(d<bd){ bd=d; best=k; }
  }
  return best;
}
function needsMeasuredRatio(cfg, ratio){
  if(RH_NODE_RATIO_MAP[ratio]) return false;
  if(!cfg) return false;
  if(cfg.kind==="zimage") return true;
  if(cfg.kind==="node") return !(cfg.node && cfg.node.auto);
  return false;
}
function measureDataUrl(dataUrl){
  var m=/^data:[^;,]*;base64,(.*)$/.exec(String(dataUrl||""));
  return m ? rhImageSize(m[1]) : null;
}
  /* the one call the adapter makes: hand it the model config, the student's
     ratio and IMAGE 1, and it hands back the ratio to actually send. */
  function resolve(cfg, ratio, dataUrl){
    if(!needsMeasuredRatio(cfg, ratio)) return ratio;
    var wh=measureDataUrl(dataUrl);
    var near=wh ? nearestRatio(wh.w, wh.h) : "";
    return near || ratio;
  }
  global.HNK = global.HNK || {};
  global.HNK.ratioFit = { resolve: resolve, nearestRatio: nearestRatio,
    needsMeasuredRatio: needsMeasuredRatio, imageSize: rhImageSize,
    measureDataUrl: measureDataUrl };
})(typeof globalThis !== "undefined" ? globalThis : this);
