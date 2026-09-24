/* ============================================================
   docs/app/data/album-module.js — the Album page's own module (6.125.0).

   Wave I (the template library, the PSD reader, the one-dialog build, the standees, the
   mockup, the sheet background, the marks and the logo) added 173 KB to the shell and the
   A4 ceiling in verify_app_data_files ran out. Every table that could leave the shell has
   already left it (libwf · hnkdata · imagine · album · whatsnew · tutorials · trmore · the
   eighteen packs), so this time the ALBUM MODULE ITSELF left — 376 KB of code that only the
   Album page ever runs. It is the same text, between the same two markers the panel lifter
   reads (tools/build_panel_album.js), loaded by a <script src> at exactly the point in the
   document where it used to sit, so nothing about its order or its globals changed.
   ============================================================ */
/* ---- ALBUM_MODULE ---- */
/* ALBUM (6.102.0 wave A) — the studio's album pages. A print SIZE, a LAYOUT for one to six
   photos, the photos themselves, a line or two of text, and a JPG at that size's own DPI.

   THE RULE THE WHOLE PAGE IS BUILT ON: every rectangle in data/album.js is a FRACTION of the
   page's safe area (0..1), never a pixel and never a millimetre. That is what makes the owner's
   "size အစုံ ကြိုက်သလိုပြောင်းလဲလို့ရတာ" true — a layout drawn for 12×36 inches is the same four
   numbers at 10×30, at A4, at 4:5 for Instagram, or at whatever width × height the studio types
   in. Nothing is re-drawn when the size changes; the safe area is recomputed and the same
   fractions are multiplied through it.

   THE SAFE AREA IS THE PRINT SHOP'S, NOT OURS: 3 mm of bleed off every outer edge, and on a
   panoramic spread another 5 mm clear of the binding down the middle. Both are drawn as guides
   so a student can see what the trimmer and the gutter will eat, and both are honoured by the
   export whether the guides are showing or not.

   THE SAME BLOCK runs in the web app and — from Wave D — in the Photoshop panel; the host hands
   in an adapter (ALBUM.init(host, root)) for the things the two surfaces do differently: strings,
   file picking, durable storage, gallery, export and toast. ES5, createElement only, no CSS grid
   and no object-fit (the panel's renderer draws neither).

   The maths is pure and runs in Node — test/verify_album_pages.js drives ALBUM.math over built
   frames; only the canvas half needs a browser, which both surfaces have. */
var ALBUM_DATA = window.HNK_ALBUM;
var ALBUM = (function(){
  "use strict";
  var D = ALBUM_DATA;
  var H = null, ROOT = null, MOUNTED = false, DRAWN = false;
  var MAXP = 6;                       /* the owner asked for one to six; the templates stop there */
  var DOC_KEY = "hnk_album_doc_v1";   /* the durable album, in the host's own store */
  var THUMB_W = 96;                   /* the page rail's thumbnails */
  var PREVIEW_MAX = 1400;             /* the stage never draws bigger than this on its long edge */
  /* 6.105.0 wave C — HOW MANY PHOTOGRAPHS ONE ALBUM MAY HOLD. Every photograph is kept in the
     album record as a data URL measured at 2,400 px on its long edge (the host's readFiles), so
     forty of them is roughly twenty-five megabytes written to the student's own store on a
     debounced save. That is a number a phone can carry; four hundred is not, and the honest
     place to say so is here rather than in a browser's out-of-quota error. */
  var MAXA = (D && D.maxAlbum) || 40;
  /* ======================= 6.121.0 WAVE F — THE ALBUM DESIGNER =======================
     The owner's reference video: an album designer whose spreads come out looking like a
     magazine — a kicker, a headline, a sentence of copy and a hairline rule beside the
     photographs on cream paper — with a photo tray that says where each picture is used, a
     layout picker that previews the spread's OWN photographs, a black-and-white treatment
     per frame, a whole-book view, undo, and a print check. This wave adds every one of them
     to the page wave A began, and keeps every rule the earlier waves set: fractions of the
     safe area, ES5, createElement, no CSS grid, one maths for painter and hit test. */
  var FX_LIST = (D && D.fx && D.fx.length) ? D.fx : ["", "bw", "sepia", "warm", "cool", "fade"];
  var PAPERS = (D && D.papers && D.papers.length) ? D.papers : ["#ffffff", "#f6f1e7", "#141416"];
  var STYLES = ["editorial", "classic", "minimal", "script"];
  var DENSITIES = ["airy", "balanced", "dense"];
  var GOLD = "#b08d57";                 /* the hairline's ink — the studio's own gold, from the ink row */
  var HIST_MAX = 40;                    /* undo steps kept; each one is the album with its photographs interned */
  var HIST = [], REDO = [], CUR_SNAP = null, UNDOING = false, TEXT_COMMIT = null, SRC_POOL = [];
  var TPL_FILTER = "";                  /* the layout rail's family filter — a view preference, not part of the album */
  /* ======================= 6.122.0 WAVE G ======================= */
  /* THE ORNAMENTS AND OVERLAYS. Twenty-four alpha masks in six families (data/album.js `orn`,
     drawn by tools/build_album_ornaments.js) that a page wears tinted — gold, white, ink, rose,
     sage — and five page textures laid over everything with their own blend. An ornament is a
     decor entry of kind "orn" with a centre, a width (fractions of the safe area; the height
     follows the mask's own aspect), a turn, a tint and a flip; the overlay is one field on the
     page. Both are selectable on the stage like a photograph or a line. */
  var ORN = D.orn || [], ORN_FAMS = D.ornFamilies || [], OVL = D.ovl || [];
  var OVL_AMTS = D.ovlAmounts || ["light", "medium", "strong"];
  var TINTS = D.tints || { gold: GOLD }, TINT_NAMES = ["gold", "white", "ink", "rose", "sage"];
  var ORN_FAM = "";                     /* the family the ornament card is filtered to; "" is every family */
  var ORN_W_MIN = 0.03, ORN_W_MAX = 1.5, DECOR_MAX = 32;
  /* THE PHOTO QUALITY. The host stores every photograph at this many pixels on its long edge:
     Standard is the 2,400 every album before this wave used; Print keeps 4,000, which is what a
     36-inch spread needs to clear 100 ppi. It applies to photographs added from now on. */
  var PHOTO_MAX = { std: 2400, print: 4000 }, QUALITY_KEY = "hnk_album_quality_v1", QUALITY = "std";
  /* THE SHELF. Several albums in the store, each under its own key, one index record naming
     them; the album saved before this wave becomes the shelf's first entry on the first open. */
  var SHELF_KEY = "hnk_album_shelf_v1", SHELF = null, SHELF_MAX = 24, SHELF_NAME_MAX = 40;
  var THUMB_T = null, THUMB_PX = 160;
  function ornById(id){ var i; for (i=0;i<ORN.length;i++) if (ORN[i].id === id) return ORN[i]; return null; }
  function ovlById(id){ var i; for (i=0;i<OVL.length;i++) if (OVL[i].id === id) return OVL[i]; return null; }
  function tintHex(t){ if (t && /^#[0-9a-fA-F]{6}$/.test(t)) return t; return TINTS[t] || TINTS.gold || GOLD; }
  /* the number an ornament carries within its family — "Corner 3" — and the family's word */
  function ornLabel(id){
    var o = ornById(id); if (!o) return id;
    var n = 0, i; for (i=0;i<ORN.length;i++){ if (ORN[i].fam === o.fam) n++; if (ORN[i].id === id) break; }
    return L("alb_orn_fam_" + o.fam) + " " + n;
  }
  /* where the masks and textures live: the Photoshop panel keeps them under icons/album/, the
     app beside its other art; a host that answers assetSrc decides */
  function assetSrc(kind, file){
    if (H && typeof H.asset === "function"){ try { var a = H.asset(kind, file); if (a) return a; } catch(e){} }
    return (D.ornDir || "lib/album/") + kind + "/" + file;
  }
  function ornSrc(id){ return assetSrc("orn", id + ".png"); }
  function ovlSrc(id){ return assetSrc("ovl", id + ".png"); }

  /* ======================= THE MATHS (pure, Node-testable) ======================= */

  function clamp(v, lo, hi){ return v < lo ? lo : (v > hi ? hi : v); }
  function sizeById(id){
    for (var i=0;i<D.sizes.length;i++) if (D.sizes[i].id===id) return D.sizes[i];
    return null;
  }
  function tplById(id){
    for (var i=0;i<D.templates.length;i++) if (D.templates[i].id===id) return D.templates[i];
    return null;
  }
  function tplsFor(n){
    var out=[]; for (var i=0;i<D.templates.length;i++) if (D.templates[i].n===n) out.push(D.templates[i]);
    return out;
  }
  /* mm on the page, in this size's own pixels */
  function mmPx(mm, dpi){ return (mm/25.4)*dpi; }
  /* THE PAGE IN PIXELS. An inch size is multiplied by its DPI; a social size is already pixels
     and its "dpi" is only what the file will claim. A custom size goes through the same door. */
  function pagePx(sz){
    if (!sz) return null;
    var dpi = sz.dpi||300;
    if (sz.unit === "px") return { w: Math.round(sz.w), h: Math.round(sz.h), dpi: dpi };
    if (sz.unit === "mm") return { w: Math.round(mmPx(sz.w,dpi)), h: Math.round(mmPx(sz.h,dpi)), dpi: dpi };
    if (sz.unit === "cm") return { w: Math.round(mmPx(sz.w*10,dpi)), h: Math.round(mmPx(sz.h*10,dpi)), dpi: dpi };
    return { w: Math.round(sz.w*dpi), h: Math.round(sz.h*dpi), dpi: dpi };   /* inches */
  }
  /* THE SAFE AREA. Bleed comes off all four edges. On a spread the binding takes another
     gutterMm on EACH side of the centre line, so the safe area is the two halves minus that
     band — expressed here as one rectangle whose width is short by the whole band, because a
     layout's fractions must not straddle a gap that the binding will swallow. */
  function safeArea(sz){
    var px = pagePx(sz); if (!px) return null;
    var b = mmPx(D.bleedMm, px.dpi);
    var r = { x:b, y:b, w:px.w-2*b, h:px.h-2*b, page:px, bleed:b, gutter:0 };
    if (sz.group === "spread"){
      r.gutter = mmPx(D.gutterMm, px.dpi);   /* one side of the spine; the guide draws both */
    }
    return r;
  }
  /* THE LAYOUT RECTANGLE (6.106.0, wave D). Every photograph until now was laid out over the SAFE
     AREA, which is the trim inset by the bleed — so nothing on an album page could reach the paper's
     edge, and the template family called "Full bleed" stopped three millimetres short of it.
     A page marked `bleed` is laid out over the trim GROWN by that same bleed instead: the picture
     runs past the trim on all four sides and the guillotine cuts through it, which is the only way
     a photograph reaches the edge of a printed page at all.
     Words never move. drawTexts is handed the safe area whatever the page is marked, because type
     that bleeds is type that gets cut off. */
  function layoutRect(safe, pg){
    /* 6.125.0 wave I — a template's frames are fractions of the whole trim, and a template drawn for a spread already
       knows where its binding falls: the page rectangle itself, with no bleed growth and no gutter slide */
    if (safe && pg && pg.lib && libTpl(pg)) return { x: 0, y: 0, w: safe.page.w, h: safe.page.h, page: safe.page, bleed: safe.bleed, gutter: 0 };
    if (!safe || !pg || !pg.bleed) return safe;
    var b = safe.bleed;
    return { x: -b, y: -b, w: safe.page.w + 2*b, h: safe.page.h + 2*b,
             page: safe.page, bleed: b, gutter: safe.gutter };
  }
  /* A CELL'S PIXEL RECTANGLE. The fractions multiply straight through the safe area; on a
     spread a cell that would cross the binding is pushed clear of it, never stretched over it. */
  function cellRect(c, safe){
    var r = { x: safe.x + c.x*safe.w, y: safe.y + c.y*safe.h, w: c.w*safe.w, h: c.h*safe.h };
    if (safe.gutter > 0){
      var mid = safe.x + safe.w/2, g = safe.gutter;
      if (r.x + r.w > mid - g && r.x < mid + g && !(r.x < mid - g && r.x + r.w > mid + g)){
        /* it lands INSIDE the binding band without spanning it — slide it to the nearer side */
        if (r.x + r.w/2 < mid) r.x = Math.min(r.x, mid - g - r.w);
        else r.x = Math.max(r.x, mid + g);
      }
    }
    return r;
  }
  function cellRects(tpl, safe){
    var out=[], i;
    if (!tpl || !safe) return out;
    for (i=0;i<tpl.cells.length;i++) out.push(cellRect(tpl.cells[i], safe));
    return out;
  }
  /* COVER FIT. The photo fills the cell and the overflow is cropped — never letterboxed, never
     squashed. anchorY (0..1) decides WHICH part of the overflow survives: 0.5 is the middle,
     and a portrait with a face high in the frame wants less than that.
     6.110.0 — AND A ZOOM. The student pinches, or turns a wheel, or presses +: the cell does not
     change, the source rectangle shrinks. Because the rectangle only ever gets SMALLER than the
     cover rectangle, a zoomed photograph still covers its cell — there is no value of zoom at or
     above 1 that can put a white edge inside a frame. A call with no zoom is the call wave A
     made, to the pixel: z is 1, scale is the cover scale, and every number below is unchanged. */
  var ZOOM_MIN = 1, ZOOM_MAX = 6;
  function coverFit(iw, ih, cw, ch, anchorX, anchorY, zoom){
    if (!(iw>0 && ih>0 && cw>0 && ch>0)) return null;
    var ax = (anchorX==null) ? 0.5 : clamp(anchorX,0,1);
    var ay = (anchorY==null) ? 0.5 : clamp(anchorY,0,1);
    var z = (zoom==null || !isFinite(zoom)) ? 1 : clamp(zoom, ZOOM_MIN, ZOOM_MAX);
    var scale = Math.max(cw/iw, ch/ih) * z;
    var sw = cw/scale, sh = ch/scale;          /* the source rectangle, in the photo's own pixels */
    var sx = (iw - sw) * ax, sy = (ih - sh) * ay;
    return { sx: clamp(sx,0,Math.max(0,iw-sw)), sy: clamp(sy,0,Math.max(0,ih-sh)), sw: sw, sh: sh, scale: scale, zoom: z };
  }
  /* THE CROP, MOVED BY A DRAG. dxPage / dyPage are page pixels the finger travelled; fit.scale is
     how many page pixels one of the photograph's own pixels is drawn as, zoom included, so the
     division is the whole of the conversion. The picture follows the finger: dragging right moves
     the source rectangle LEFT. A rectangle already against an edge stays there — a cell is never
     allowed to show anything that is not photograph. */
  function panFit(ph, cell, dxPage, dyPage){
    var fit = coverFit(ph.w, ph.h, cell.w, cell.h, (ph.anchor||{}).x, (ph.anchor||{}).y, ph.zoom);
    if (!fit) return false;
    var maxx = Math.max(0, ph.w - fit.sw), maxy = Math.max(0, ph.h - fit.sh);
    var sx = fit.sx - dxPage / fit.scale, sy = fit.sy - dyPage / fit.scale;
    ph.anchor = { x: maxx > 0 ? clamp(sx,0,maxx)/maxx : 0.5,
                  y: maxy > 0 ? clamp(sy,0,maxy)/maxy : 0.5 };
    ph.manual = true;
    return true;
  }
  /* THE CROP, ZOOMED ABOUT A POINT. atx / aty are where in the cell the gesture is centred (0..1),
     so the piece of photograph under two fingers stays under them while the rest grows around it.
     Pressing + with no point named zooms about the middle of the cell. */
  function zoomFit(ph, cell, z2, atx, aty){
    var fit = coverFit(ph.w, ph.h, cell.w, cell.h, (ph.anchor||{}).x, (ph.anchor||{}).y, ph.zoom);
    if (!fit) return false;
    var ax = (atx==null) ? 0.5 : clamp(atx,0,1), ay = (aty==null) ? 0.5 : clamp(aty,0,1);
    var srcX = fit.sx + ax*fit.sw, srcY = fit.sy + ay*fit.sh;
    var z = clamp(z2, ZOOM_MIN, ZOOM_MAX);
    var base = Math.max(cell.w/ph.w, cell.h/ph.h) * z;
    var sw2 = cell.w/base, sh2 = cell.h/base;
    var maxx = Math.max(0, ph.w - sw2), maxy = Math.max(0, ph.h - sh2);
    var sx2 = srcX - ax*sw2, sy2 = srcY - ay*sh2;
    ph.zoom = z;
    ph.anchor = { x: maxx > 0 ? clamp(sx2,0,maxx)/maxx : 0.5,
                  y: maxy > 0 ? clamp(sy2,0,maxy)/maxy : 0.5 };
    ph.manual = true;
    return true;
  }
  /* WHERE THE PEOPLE ARE, cheaply. A skin-tone mass over a small thumbnail: the same YCbCr
     window the Retouch stage uses for its own skin mask, with the default (unwindowed) bounds,
     counted into a centroid. It is not a face detector and never claims to be one — it answers
     "the subject sits about here" so a cover crop takes the head instead of the feet. With no
     skin found at all it says so and the caller keeps the middle. */
  function subjectAnchor(data, w, h){
    if (!data || !(w>0) || !(h>0)) return null;
    var n=w*h, i, p, R, G, B, cb, cr, sx=0, sy=0, hit=0;
    for (i=0,p=0;i<n;i++,p+=4){
      if (data[p+3] < 8) continue;
      R=data[p]; G=data[p+1]; B=data[p+2];
      cb = 128 - 0.168736*R - 0.331264*G + 0.5*B;
      cr = 128 + 0.5*R - 0.418688*G - 0.081312*B;
      if (cb>=77 && cb<=127 && cr>=133 && cr<=173){ sx += (i%w); sy += ((i/w)|0); hit++; }
    }
    if (hit < Math.max(12, n*0.004)) return null;      /* too little to be a person */
    return { x: (sx/hit)/w, y: (sy/hit)/h, mass: hit/n };
  }
  /* The anchor a cover crop should use for this photo in this cell. A subject found high in the
     frame pulls the crop up; the pull is capped so a crop never runs off the picture, and a
     landscape cell over a landscape photo is left alone (there is no vertical overflow to aim). */
  function anchorFor(subject, iw, ih, cw, ch){
    var a = { x:0.5, y:0.5, why:"centre" };
    if (!subject) return a;
    var fit = coverFit(iw, ih, cw, ch, 0.5, 0.5);
    if (!fit) return a;
    var overY = ih - fit.sh, overX = iw - fit.sw;
    if (overY > 1){
      /* put the subject's centroid where the crop's own centroid is, then pull back by a third
         so a mis-read never swings the whole frame */
      var want = clamp((subject.y*ih - fit.sh/2) / overY, 0, 1);
      a.y = clamp(0.5 + (want-0.5)*0.67, 0, 1); a.why = "subject";
    }
    if (overX > 1){
      var wantX = clamp((subject.x*iw - fit.sw/2) / overX, 0, 1);
      a.x = clamp(0.5 + (wantX-0.5)*0.67, 0, 1); a.why = "subject";
    }
    return a;
  }
  /* SMART AUTO-FLOW. Which of this count's templates suits THESE photos? Each cell is scored
     against the photo that would land in it: a portrait photo in a portrait cell keeps almost
     all of itself, the same photo in a wide cell loses its head and its feet. The score is the
     fraction of the photo that survives the cover crop, averaged over the cells, with a nudge
     toward the rhythm's suggestion so consecutive pages do not all pick the same shape. */
  function tplScore(tpl, shapes){
    if (!tpl || tpl.n !== shapes.length) return -1;
    var total = 0, i;
    for (i=0;i<tpl.cells.length;i++){
      var c = tpl.cells[i], s = shapes[i];
      if (!s || !(s.w>0) || !(s.h>0)) { total += 0.5; continue; }
      var cellAR = (c.w / c.h), photoAR = (s.w / s.h);
      /* the fraction of the photo the cover crop keeps: the smaller of the two aspect ratios
         over the larger — 1.0 when the shapes agree, 0.5 when one is twice the other */
      total += (cellAR > photoAR) ? (photoAR/cellAR) : (cellAR/photoAR);
    }
    return total / tpl.cells.length;
  }
  function autoTemplate(shapes, pageIndex){
    var n = shapes.length; if (!(n>=1 && n<=MAXP)) return null;
    var list = tplsFor(n); if (!list.length) return null;
    var best = null, bestScore = -1, i;
    var seedIdx = (D.rhythm && D.rhythm.length) ? (pageIndex|0) % D.rhythm.length : 0;
    var seed = (D.rhythm && D.rhythm.length) ? D.rhythm[seedIdx] : 0;
    for (i=0;i<list.length;i++){
      var sc = tplScore(list[i], shapes);
      /* the rhythm's nudge: a small, fixed bonus for the template the rhythm points at, never
         enough to beat a template that fits the photos visibly better */
      if ((i % list.length) === (seed % list.length)) sc += 0.04;
      if (sc > bestScore){ bestScore = sc; best = list[i]; }
    }
    return best ? { tpl: best, score: bestScore } : null;
  }
  /* the shape a page's photos make, for autoTemplate */
  /* HOW AN ALBUM BREAKS INTO PAGES (6.105.0 wave C). The opener always takes ONE photograph —
     it is the page the occasion's words are set on — and after it the occasion's own plan
     cycles. The last page never keeps a single orphan photograph when the page before it has
     room: a spread that ends on one lonely picture reads as a mistake, and no print shop can
     fix it after the fact. Pure arithmetic, so test/verify_album_occasions.js drives it in Node. */
  function planPages(count, plan, density){
    var out = [], left = Math.max(0, count|0), i = 0, n;
    if (!left) return out;
    if (!(plan && plan.length)) plan = [2];
    out.push(1); left -= 1;
    while (left > 0){
      n = plan[i % plan.length]; i++;
      /* 6.121.0 — how full the pages run: airy halves the plan (never below one), dense adds a
         photograph to every page (never past six); balanced is the occasion's own plan */
      if (density === "airy") n = Math.max(1, Math.round(n*0.6));
      else if (density === "dense") n = Math.min(MAXP, (n|0) + 1);
      if (!(n >= 1)) n = 1;
      if (n > MAXP) n = MAXP;
      if (n > left) n = left;
      out.push(n); left -= n;
    }
    /* the orphan: the last page holds ONE photograph. Walk back to the nearest page with room
       and give it there. Looking only one page back was not enough — the `event` plan ends on a
       page of six, and a full page cannot take the orphan, so it stayed. Never the opener: page
       one carries the occasion's words and is meant to hold a single photograph. */
    if (out.length > 2 && out[out.length-1] === 1){
      var j = out.length - 2;
      while (j > 0 && out[j] >= MAXP) j--;
      if (j > 0 && out[j] < MAXP){ out[j] += 1; out.pop(); }
    }
    return out;
  }

  function shapesOf(photos){
    var out=[], i;
    for (i=0;i<photos.length;i++) out.push({ w: photos[i].w||1, h: photos[i].h||1 });
    return out;
  }

  /* ======================= THE DOCUMENT ======================= */

  /* One album. Pages hold PHOTOS (a data URL plus its measured size, its subject anchor and the
     student's own nudge) and TEXTS (a role from data/album.js and the words). Everything else is
     derived, so a document that loses a template id or a size id falls back rather than breaking. */
  var DOC = null, IMGS = {}, SAVE_T = null;

  function blankDoc(){
    return { v:5, sizeId:"12x36", custom:{ w:12, h:36, unit:"in", dpi:300 },
             /* 6.107.0 wave E — the free size keeps two preferences of its own: which preset group
                the chips are showing while a custom size is in use, and whether dragging one side
                drags the other with it. */
             customGroup:"spread", lockRatio:false,
             guides:true, view:"page", cur:0, pair:(D.defPair || "classic"), occ:(D.defOcc || ""),
             /* 6.121.0 wave F — the design: which look the story lines are set in, the paper,
                how full each page is laid, whether the opener bleeds as a cover, and the tray
                of photographs not yet on a page */
             style:"editorial", paper:PAPERS[0], density:"balanced", cover:false, pool:[],
             /* 6.125.0 wave I — the couple, the date and the venue every template's slots are filled from, and the studio's logo */
             info:{ bride:"", groom:"", date:"", venue:"" }, logo:"",
             pages:[ blankPage() ] };
  }
  /* 6.121.0 — decor is what the design engine draws that is not a photograph or a line of type
     (a hairline rule, a scrim under an overlaid headline); story is which of the occasion's
     headline sets this page opens on, -1 until the engine has set one */
  /* 6.125.0 wave I — lib is the template this page is laid from ("" for a layout), bg its own background photograph */
  function blankPage(){ return { photos:[], texts:[], tplId:"", auto:true, bleed:false, decor:[], story:-1, overlay:null, lib:"", bg:null }; }
  function curSize(){
    if (DOC.sizeId === "custom"){
      var c = DOC.custom || {};
      return { id:"custom", group:"custom", w:+c.w||12, h:+c.h||36, unit:c.unit||"in", dpi:+c.dpi||300 };
    }
    return sizeById(DOC.sizeId) || sizeById("12x36");
  }
  function curPage(){ return DOC.pages[clamp(DOC.cur,0,DOC.pages.length-1)] || DOC.pages[0]; }
  /* the template a page is actually drawn with: the student's pick, else auto-flow, else the
     first template of that count — a page never has "no layout" */
  function pageTpl(pg, idx){
    var lt = libTpl(pg); if (lt) return lt;                 /* 6.125.0 wave I — a page laid from a template: its frames are the cells */
    var n = clamp(pg.photos.length, 1, MAXP);
    if (!pg.auto && pg.tplId){ var t = tplById(pg.tplId); if (t && t.n === n) return t; }
    var a = autoTemplate(shapesOf(pg.photos.slice(0,MAXP)), idx||0);
    return (a && a.tpl) || tplsFor(n)[0] || null;
  }

  function saveSoon(){
    if (SAVE_T) return;
    SAVE_T = setTimeout(function(){ SAVE_T = null; saveNow(); }, 600);
  }
  function saveNow(){
    if (!H || typeof H.store !== "function" || !DOC) return;
    try {
      if (SHELF && SHELF.cur){ H.store(docKey(SHELF.cur), DOC); shelfTouch(); saveShelf(); thumbSoon(); }
      else H.store(DOC_KEY, DOC);
    } catch(e){}
  }
  /* ---- the shelf (6.122.0 wave G) ---- */
  function docKey(id){ return DOC_KEY + ":" + id; }
  function newId(){ return "a" + Date.now().toString(36) + Math.floor(Math.random()*46656).toString(36); }
  function shelfBlank(){ return { v:1, cur:"", items:[] }; }
  function shelfEntry(id, name){ return { id:id, name:name || "", occ:"", sizeId:"", pages:1, photos:0, updated:Date.now(), thumb:"" }; }
  function shelfItem(id){ var i; if (!SHELF) return null; for (i=0;i<SHELF.items.length;i++) if (SHELF.items[i].id === id) return SHELF.items[i]; return null; }
  function shelfIndex(it){ return SHELF ? SHELF.items.indexOf(it) : -1; }
  function albumName(it){ return (it && it.name) ? it.name : L("alb_shelf_untitled").replace("{N}", String(shelfIndex(it)+1)); }
  function normShelf(sh){
    var out = shelfBlank(), i, list = (sh && sh.items && sh.items.length) ? sh.items : [];
    for (i=0;i<list.length && out.items.length<SHELF_MAX;i++){
      var it = list[i]; if (!it || typeof it.id !== "string" || !/^[a-z0-9]{3,24}$/.test(it.id)) continue;
      out.items.push({ id:it.id, name:String(it.name||"").slice(0, SHELF_NAME_MAX), occ:String(it.occ||""), sizeId:String(it.sizeId||""),
                       pages:Math.max(1, it.pages|0), photos:Math.max(0, it.photos|0), updated:+it.updated||0,
                       thumb:(typeof it.thumb === "string" && /^data:image\//.test(it.thumb)) ? it.thumb : "" });
    }
    out.cur = (sh && typeof sh.cur === "string") ? sh.cur : "";
    return out;
  }
  function saveShelf(){ if (!H || typeof H.store !== "function" || !SHELF) return; try { H.store(SHELF_KEY, SHELF); } catch(e){} }
  /* the open album's facts on its shelf entry — read by the tiles, never by the album itself */
  function shelfTouch(){
    var it = shelfItem(SHELF.cur); if (!it || !DOC) return;
    var n = 0, i; for (i=0;i<DOC.pages.length;i++) n += DOC.pages[i].photos.length;
    it.pages = DOC.pages.length; it.photos = n; it.occ = DOC.occ; it.sizeId = DOC.sizeId; it.updated = Date.now();
  }
  function thumbSoon(){ if (THUMB_T) return; THUMB_T = setTimeout(function(){ THUMB_T = null; makeThumb(); }, 1500); }
  /* the entry's picture is the opener, drawn small — a page of the shelf, not a page of the album */
  function makeThumb(){
    if (!DOC || !SHELF || typeof document === "undefined") return Promise.resolve(false);
    var it = shelfItem(SHELF.cur), sz = curSize(), px = pagePx(sz); if (!it || !px) return Promise.resolve(false);
    var cv = document.createElement("canvas");
    return drawPage(cv, DOC.pages[0], 0, { scale: THUMB_PX / px.w, guides: false }).then(function(ok){
      var url = null; if (ok){ try { url = cv.toDataURL("image/jpeg", 0.6); } catch(e){ url = null; } }
      cv.width = cv.height = 1;
      if (url && url !== it.thumb){ it.thumb = url; saveShelf(); paintShelf(); }
      return !!url;
    }).catch(function(){ return false; });
  }
  function loadQuality(){
    if (!H || typeof H.restore !== "function") return Promise.resolve(QUALITY);
    return Promise.resolve().then(function(){ return H.restore(QUALITY_KEY); }).then(function(q){
      if (q === "print" || q === "std") QUALITY = q; return QUALITY;
    }).catch(function(){ return QUALITY; });
  }
  function setQuality(q){
    if (q !== "print" && q !== "std") return false;
    QUALITY = q;
    if (H && typeof H.store === "function"){ try { H.store(QUALITY_KEY, q); } catch(e){} }
    render();
    return true;
  }
  /* the shelf comes up first; the album it names is the one loaded. An index that never existed
     is built around the album saved under the old single key, which keeps its place. */
  function loadDoc(){
    if (!H || typeof H.restore !== "function"){ SHELF = shelfBlank(); SHELF.items.push(shelfEntry(newId())); SHELF.cur = SHELF.items[0].id; return Promise.resolve(null); }
    return Promise.resolve().then(function(){ return H.restore(SHELF_KEY); }).then(function(sh){
      if (sh && sh.items && sh.items.length){
        SHELF = normShelf(sh);
        var it = shelfItem(SHELF.cur) || SHELF.items[0]; SHELF.cur = it.id;
        return Promise.resolve().then(function(){ return H.restore(docKey(it.id)); }).catch(function(){ return null; });
      }
      return Promise.resolve().then(function(){ return H.restore(DOC_KEY); }).catch(function(){ return null; }).then(function(old){
        SHELF = shelfBlank();
        var id = newId(), it = shelfEntry(id);
        if (old && old.pages && old.pages.length){
          it.pages = old.pages.length; it.occ = old.occ || ""; it.sizeId = old.sizeId || "";
          try { H.store(docKey(id), old); } catch(e){}
        }
        SHELF.items.push(it); SHELF.cur = id; saveShelf();
        return old || null;
      });
    }).catch(function(){
      if (!SHELF){ SHELF = shelfBlank(); SHELF.items.push(shelfEntry(newId())); SHELF.cur = SHELF.items[0].id; }
      return null;
    });
  }
  function freshHistory(){ SEL = null; HIST = []; REDO = []; CUR_SNAP = null; commit(); }
  function openAlbum(id){
    var it = shelfItem(id); if (!it || id === SHELF.cur) return Promise.resolve(false);
    saveNow();
    SHELF.cur = id; saveShelf();
    return Promise.resolve().then(function(){ return H.restore(docKey(id)); }).catch(function(){ return null; }).then(function(saved){
      DOC = (saved && saved.pages && saved.pages.length) ? normalize(saved) : blankDoc();
      freshHistory(); render();
      H.toast(L("alb_shelf_opened").replace("{A}", albumName(it)), "ok");
      return true;
    });
  }
  function shelfRoom(){
    if (SHELF.items.length < SHELF_MAX) return true;
    H.toast(L("alb_shelf_full").replace("{N}", String(SHELF_MAX)), ""); return false;
  }
  /* a new album keeps the choices that are about the studio rather than the pictures */
  function newAlbum(){
    if (!shelfRoom()) return false;
    saveNow();
    var id = newId(), it = shelfEntry(id); it.occ = DOC.occ; it.sizeId = DOC.sizeId;
    SHELF.items.push(it); SHELF.cur = id;
    var d = blankDoc();
    d.occ = DOC.occ; d.sizeId = DOC.sizeId; d.custom = DOC.custom; d.customGroup = DOC.customGroup; d.pair = DOC.pair;
    d.style = DOC.style; d.paper = DOC.paper; d.density = DOC.density; d.guides = DOC.guides;
    DOC = d; freshHistory(); saveNow(); render();
    H.toast(L("alb_shelf_made"), "ok");
    return true;
  }
  function duplicateAlbum(){
    if (!shelfRoom()) return false;
    saveNow();
    var cur = shelfItem(SHELF.cur), id = newId(), it = shelfEntry(id, (albumName(cur) + " 2").slice(0, SHELF_NAME_MAX));
    it.occ = DOC.occ; it.sizeId = DOC.sizeId; it.pages = DOC.pages.length; it.photos = (cur && cur.photos) || 0; it.thumb = (cur && cur.thumb) || "";
    SHELF.items.push(it); SHELF.cur = id;
    DOC = normalize(JSON.parse(JSON.stringify(DOC)));
    freshHistory(); saveNow(); render();
    H.toast(L("alb_shelf_made"), "ok");
    return true;
  }
  function renameAlbum(name){
    var it = shelfItem(SHELF.cur); if (!it) return false;
    it.name = String(name || "").replace(/\s+/g, " ").trim().slice(0, SHELF_NAME_MAX);
    saveShelf(); paintShelf();
    return true;
  }
  function deleteAlbum(){
    var it = shelfItem(SHELF.cur); if (!it) return Promise.resolve(false);
    return askP(L("alb_shelf_del_q").replace("{A}", albumName(it))).then(function(ok){
      if (!ok) return false;
      var at = SHELF.items.indexOf(it); SHELF.items.splice(at, 1);
      try { if (H && typeof H.remove === "function") H.remove(docKey(it.id)); else if (H && typeof H.store === "function") H.store(docKey(it.id), null); } catch(e){}
      if (!SHELF.items.length) SHELF.items.push(shelfEntry(newId()));
      var next = SHELF.items[Math.min(Math.max(0, at), SHELF.items.length-1)];
      SHELF.cur = next.id; saveShelf();
      return Promise.resolve().then(function(){ return H.restore(docKey(next.id)); }).catch(function(){ return null; }).then(function(saved){
        DOC = (saved && saved.pages && saved.pages.length) ? normalize(saved) : blankDoc();
        freshHistory(); saveNow(); render();
        H.toast(L("alb_shelf_deleted"), "ok");
        return true;
      });
    });
  }

  /* ======================= DRAWING ======================= */

  function imgFor(src){
    if (IMGS[src]) return Promise.resolve(IMGS[src]);
    return new Promise(function(res){
      var im = new Image();
      im.onload = function(){ IMGS[src] = im; res(im); };
      im.onerror = function(){ res(null); };
      try { im.src = src; } catch(e){ res(null); }
    });
  }
  /* ======================= THE LOOK OF A FRAME (6.121.0, wave F) =======================

     The reference video turns one photograph on a spread black and white and leaves the rest in
     colour. Six looks here — none, black & white, sepia, warm, cool, faded — one per frame, on
     the stage, in the page rail, in the JPEG, in the PDF and on the PSD layer alike, because
     every one of those goes through drawPhotoFx. Where the renderer has a canvas filter the look
     is the filter; where it has none (or refuses it) the SAME look is computed over the pixels,
     so a phone whose browser lacks the property prints the same picture the monitor showed. */
  function fxFilter(fx){
    if (fx === "bw") return "grayscale(1)";
    if (fx === "sepia") return "sepia(0.85)";
    if (fx === "warm") return "sepia(0.28) saturate(1.15) brightness(1.03)";
    if (fx === "cool") return "saturate(0.85) hue-rotate(-12deg) brightness(1.02)";
    if (fx === "fade") return "contrast(0.82) brightness(1.08) saturate(0.8)";
    return "";
  }
  /* the same six looks over RGBA bytes — pure, so a test measures it in Node */
  function fxPixels(data, fx){
    var i, n = data.length, r, g, b, l;
    if (fx === "bw"){ for (i=0;i<n;i+=4){ l = 0.2126*data[i] + 0.7152*data[i+1] + 0.0722*data[i+2]; data[i]=data[i+1]=data[i+2]=l; } }
    else if (fx === "sepia"){ for (i=0;i<n;i+=4){ r=data[i]; g=data[i+1]; b=data[i+2];
      data[i]   = Math.min(255, 0.393*r + 0.769*g + 0.189*b);
      data[i+1] = Math.min(255, 0.349*r + 0.686*g + 0.168*b);
      data[i+2] = Math.min(255, 0.272*r + 0.534*g + 0.131*b); } }
    else if (fx === "warm"){ for (i=0;i<n;i+=4){ data[i] = Math.min(255, data[i]*1.06 + 6); data[i+2] = Math.max(0, data[i+2]*0.92 - 4); } }
    else if (fx === "cool"){ for (i=0;i<n;i+=4){ data[i] = Math.max(0, data[i]*0.94 - 2); data[i+2] = Math.min(255, data[i+2]*1.06 + 6); } }
    else if (fx === "fade"){ for (i=0;i<n;i+=4){ r=data[i]; g=data[i+1]; b=data[i+2]; l = 0.2126*r + 0.7152*g + 0.0722*b;
      data[i]   = Math.min(255, 128 + (r*0.8 + l*0.2 - 128)*0.82 + 12);
      data[i+1] = Math.min(255, 128 + (g*0.8 + l*0.2 - 128)*0.82 + 12);
      data[i+2] = Math.min(255, 128 + (b*0.8 + l*0.2 - 128)*0.82 + 12); } }
    return data;
  }
  var FILTER_OK = null;
  function filterOk(){
    if (FILTER_OK !== null) return FILTER_OK;
    FILTER_OK = false;
    try {
      var c = document.createElement("canvas"); c.width = c.height = 2;
      var x = c.getContext("2d");
      if (x && ("filter" in x)){ x.filter = "grayscale(1)"; FILTER_OK = (x.filter === "grayscale(1)"); x.filter = "none"; }
    } catch(e){ FILTER_OK = false; }
    return FILTER_OK;
  }
  function drawPhotoFx(x, im, fit, dx, dy, dw, dh, fx){
    var f = fxFilter(fx);
    if (!f){ try { x.drawImage(im, fit.sx, fit.sy, fit.sw, fit.sh, dx, dy, dw, dh); } catch(e){} return; }
    if (filterOk()){
      x.save();
      try { x.filter = f; x.drawImage(im, fit.sx, fit.sy, fit.sw, fit.sh, dx, dy, dw, dh); } catch(e2){}
      x.restore();
      return;
    }
    try {
      x.drawImage(im, fit.sx, fit.sy, fit.sw, fit.sh, dx, dy, dw, dh);
      var rx = Math.max(0, Math.floor(dx)), ry = Math.max(0, Math.floor(dy));
      var rw = Math.min(x.canvas.width - rx, Math.ceil(dx + dw) - rx), rh = Math.min(x.canvas.height - ry, Math.ceil(dy + dh) - ry);
      if (rw > 0 && rh > 0){ var px = x.getImageData(rx, ry, rw, rh); fxPixels(px.data, fx); x.putImageData(px, rx, ry); }
    } catch(e3){}
  }
  /* THE DECOR (6.121.0). A rule is a hairline the width the design gave it; a scrim is the soft
     dark gradient laid over the foot of a photograph so white type reads on it. Both are
     fractions of the safe area like everything else, so they follow the size. */
  /* ---- 6.122.0 wave G: the ornaments and the overlay ---- */
  /* the rectangle an ornament fills, in the safe area's fractions: the width is stored, the
     height follows the mask's own aspect through the page's, so the drawing is never squashed */
  function ornBox(d, safe){
    var o = ornById(d.id), ar = (o && o.ar) || 1;
    var w = clamp(+d.w || 0.1, ORN_W_MIN, ORN_W_MAX);
    var h = w * (safe.w / safe.h) / ar;
    return { x: +d.x || 0, y: +d.y || 0, w: w, h: h, rot: (+d.rot || 0) * Math.PI/180, flip: !!d.flip };
  }
  /* a tinted copy of a mask at the size it is about to be drawn: the mask is white on
     transparent, so a source-in fill paints exactly its shape and nothing else */
  function tintMask(im, w, h, hex){
    var cw = Math.max(1, Math.min(4096, Math.round(w))), ch = Math.max(1, Math.min(4096, Math.round(h)));
    var c = document.createElement("canvas"); c.width = cw; c.height = ch;
    var x = c.getContext("2d"); if (!x) return null;
    x.drawImage(im, 0, 0, cw, ch);
    x.globalCompositeOperation = "source-in";
    x.fillStyle = hex; x.fillRect(0, 0, cw, ch);
    return c;
  }
  function drawOrn(x, d, safe, scale, m){
    var im = IMGS[ornSrc(d.id)]; if (!im) return;
    var b = ornBox(d, safe);
    var W = b.w*safe.w*scale, Hh = b.h*safe.h*scale;
    if (!(W > 0.5 && Hh > 0.5)) return;
    var cx = (safe.x + m)*scale + safe.w*scale*b.x, cy = (safe.y + m)*scale + safe.h*scale*b.y;
    var tinted = tintMask(im, W, Hh, tintHex(d.tint)); if (!tinted) return;
    x.save();
    x.translate(cx, cy);
    if (b.rot) x.rotate(b.rot);
    if (b.flip) x.scale(-1, 1);
    x.drawImage(tinted, -W/2, -Hh/2, W, Hh);
    x.restore();
  }
  /* the page under its texture, laid on with the overlay's own blend where the renderer has
     it. A renderer that does not know the operation leaves it at source-over — read back here
     — and gets a lighter plain wash rather than a grey slab over the pictures. */
  function drawOverlay(x, pg, safe, scale, m){
    var ov = pg && pg.overlay; if (!ov || !ov.id) return;
    var spec = ovlById(ov.id); if (!spec) return;
    var im = IMGS[ovlSrc(ov.id)]; if (!im) return;
    var amt = spec.amounts[ov.amount] || spec.amounts.medium || 0.5;
    var W = (safe.page.w + 2*m)*scale, Hh = (safe.page.h + 2*m)*scale;
    x.save();
    try { x.globalCompositeOperation = spec.blend; } catch(e){}
    if (x.globalCompositeOperation !== spec.blend){ x.globalCompositeOperation = "source-over"; amt = amt * 0.4; }
    x.globalAlpha = amt;
    x.drawImage(im, 0, 0, W, Hh);
    x.restore();
  }
  /* every picture a page's decor needs, in the cache before the page is drawn */
  function decorImgs(pg){
    var list = [], i, dc = (pg && pg.decor) || [];
    for (i=0;i<dc.length;i++){
      if (dc[i] && dc[i].kind === "orn" && ornById(dc[i].id)) list.push(imgFor(ornSrc(dc[i].id)));
      if (dc[i] && dc[i].kind === "logo" && DOC && DOC.logo) list.push(imgFor(DOC.logo));   /* 6.125.0 */
    }
    if (pg && pg.overlay && pg.overlay.id && ovlById(pg.overlay.id)) list.push(imgFor(ovlSrc(pg.overlay.id)));
    /* 6.125.0 wave I — the sheet's background photograph, and the template's two pictures */
    if (pg && pg.bg && pg.bg.src) list.push(imgFor(pg.bg.src));
    var rec = libRec(pg && pg.lib);
    if (rec && rec.bg) list.push(imgFor(rec.bg));
    if (rec && rec.fg) list.push(imgFor(rec.fg));
    return Promise.all(list);
  }
  /* the photographs into their cells — the one loop the stage, the rail, the export and the
     PSD's flattened overlay layer all draw with */
  function paintCells(x, rects, photos, ims, scale, m){
    var i;
    for (i=0;i<rects.length;i++){
      var r = rects[i], im = ims[i], ph = photos[i];
      var dx = (r.x+m)*scale, dy = (r.y+m)*scale, dw = r.w*scale, dh = r.h*scale;
      if (!im || !ph){
        /* an empty cell is an empty cell — a light frame, never a broken picture */
        x.fillStyle = "#f2f2f4"; x.fillRect(dx,dy,dw,dh);
        continue;
      }
      var a = ph.anchor || { x:0.5, y:0.5 };
      var fit = coverFit(im.naturalWidth||im.width, im.naturalHeight||im.height, r.w, r.h, a.x, a.y, ph.zoom);
      if (!fit) continue;
      drawPhotoFx(x, im, fit, dx, dy, dw, dh, ph.fx);
    }
  }
  /* the whole page in one synchronous pass over the cache — for the PSD's overlay layer, which
     is painted inside a layer loop that cannot wait */
  function paintPageSync(x, pg, idx, safe, scale, m){
    var lay = layoutRect(safe, pg), tpl = pageTpl(pg, idx), rects = cellRects(tpl, lay);
    var photos = pg.photos.slice(0, rects.length), ims = [], i;
    for (i=0;i<photos.length;i++) ims.push(IMGS[photos[i].src] || null);
    paintPageBase(x, pg, idx, safe, scale, m, rects, photos, ims);
  }
  /* 6.125.0 wave I — ONE ORDER FOR EVERY PAINTER: the paper, the sheet's own background photograph, the template's
     picture (or a standee's paper) under the frames, the photographs, the template's layers over them, the decor,
     the type, the texture. The stage, the rail, the JPEG, the PDF and the PSD's flattened overlay all go through here. */
  function paintPageBase(x, pg, idx, safe, scale, m, rects, photos, ims){
    var W = (safe.page.w + 2*m)*scale, Hh = (safe.page.h + 2*m)*scale;
    x.fillStyle = (DOC && DOC.paper) || "#ffffff"; x.fillRect(0, 0, W, Hh);
    drawSheetBg(x, pg, safe, scale, m);
    drawLibUnder(x, pg, safe, scale, m);
    paintCells(x, rects, photos, ims, scale, m);
    drawLibOver(x, pg, safe, scale, m);
    drawDecor(x, pg, safe, scale, m);
    drawTexts(x, pg, safe, scale, m);
    drawOverlay(x, pg, safe, scale, m);
  }
  function drawDecor(x, pg, safe, scale, m){
    m = m || 0;
    var list = (pg && pg.decor) || [], i;
    for (i=0;i<list.length;i++){
      var d = list[i]; if (!d) continue;
      if (d.kind === "orn"){ drawOrn(x, d, safe, scale, m); continue; }     /* 6.122.0 */
      if (d.kind === "mark"){ drawMark(x, d, safe, scale, m); continue; }   /* 6.125.0 wave I — a date block or a monogram */
      if (d.kind === "logo"){ drawLogo(x, d, safe, scale, m); continue; }   /* 6.125.0 wave I — the studio's logo */
      var X = (safe.x+m)*scale + safe.w*scale*d.x, Y = (safe.y+m)*scale + safe.h*scale*d.y;
      var W = safe.w*scale*d.w, Hh = safe.h*scale*(d.h||0);
      x.save();
      if (d.kind === "rule"){
        x.fillStyle = d.color || GOLD;
        x.fillRect(X, Y - Math.max(0.5, safe.h*scale*0.0016), Math.max(1, W), Math.max(1, safe.h*scale*0.0032));
      } else if (d.kind === "scrim" && Hh > 0){
        var g = x.createLinearGradient(0, Y, 0, Y + Hh);
        g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, "rgba(0,0,0,0.62)");
        x.fillStyle = g; x.fillRect(X, Y, W, Hh);
      }
      x.restore();
    }
  }

  /* ONE PAGE ONTO A CANVAS. `scale` is how much of the page's own pixels this canvas carries —
     1 for the export, a fraction for the stage and the rail. The guides are drawn only when
     asked, and never by the export. */
  function drawPage(cv, pg, idx, opt){
    opt = opt || {};
    var sz = curSize(), safe = safeArea(sz);
    if (!safe) return Promise.resolve(false);
    var scale = opt.scale || 1;
    /* 6.106.0 — the print file asks for the page PLUS its bleed, so the overflow a bleeding
       photograph needs actually exists in the pixels the PDF is handed. One offset carries it:
       the page's own origin sits at (m, m) in the canvas, and m is zero everywhere else. */
    var m = opt.bleed ? safe.bleed : 0;
    var W = Math.max(1, Math.round((safe.page.w + 2*m)*scale));
    var Hh = Math.max(1, Math.round((safe.page.h + 2*m)*scale));
    cv.width = W; cv.height = Hh;
    var x = cv.getContext("2d"); if (!x) return Promise.resolve(false);
    x.fillStyle = (DOC && DOC.paper) || "#ffffff"; x.fillRect(0,0,W,Hh);   /* 6.121.0 — the paper */
    /* 6.104.0 — the faces first, then the photographs. One gate for the stage, the page
       rail and the export alike, so what is downloaded is what was on screen.
       6.125.0 wave I — and the template this page is laid from before either, so the first draw of a
       reopened album already has its frames; the layout is asked for only once the record is in. */
    return libLoad(pg.lib).then(function(){ return fontsReady(pg); }).then(function(){
      var lay = layoutRect(safe, pg), tpl = pageTpl(pg, idx), rects = cellRects(tpl, lay);
      var photos = pg.photos.slice(0, rects.length);
      return Promise.all(photos.map(function(ph){ return imgFor(ph.src); })).then(function(ims){
        return decorImgs(pg).then(function(){ return ims; });   /* 6.122.0 — the ornaments and the overlay too */
      }).then(function(ims){
        paintPageBase(x, pg, idx, safe, scale, m, rects, photos, ims);
        if (opt.guides) drawGuides(x, safe, scale, m);
        /* 6.110.0 — the marquee is the LAST thing drawn and it is drawn only when the stage asks
           for it. Every export path (the page JPEG, the whole-album PDF, the layered PSD, the page
           rail's thumbnails) calls drawPage without `sel`, so what a student downloads can never
           carry the handles they were dragging a moment earlier. */
        if (opt.sel) drawSel(x, pg, safe, rects, scale, m, opt.sel);
        return true;
      });
    });
  }
  /* ======================= THE TYPE (6.104.0 wave B) =======================

     Wave A drew all seven roles in Georgia, at one weight, because there was nothing
     else to draw them in. This is the something else: twenty OFL families under
     lib/fonts/, twelve pairings over them, and one rule that decides which face a line
     is actually set in.

     THE RULE, in order: the student's own pick for that line, else the pairing's face
     for that line's SIDE (title · subtitle · names are the display side; date · quote ·
     caption · page number are the reading side), else the first family. Nothing here
     can name a family whose woff2 is not on disk — tools/build_album_fonts.js verifies
     the folder against its record before tools/build_album_data.js will fold the table
     into window.HNK_ALBUM at all.

     AND THE BURMESE RULE, which is why every stack is a list and not a name: a Latin
     display face has no Burmese glyphs. Every stack ends at a family that does, so a
     title typed "Ko Ko & Ma Ma · မင်္ဂလာပါ" sets the Latin in Playfair Display and the
     Burmese in Padauk, on one line, at one size, with nobody asked to know. */
  var FACES_IN = false;
  function ensureFaces(){
    if (FACES_IN) return;
    if (typeof document === "undefined" || !document.head) return;
    FACES_IN = true;
    if (document.getElementById("albFontFaces")) return;
    var css = [], i, j, dir = D.fontDir || "lib/fonts/";
    for (i=0;i<D.fonts.length;i++){
      var f = D.fonts[i];
      for (j=0;j<f.files.length;j++){
        var fl = f.files[j], range = D.ranges[fl.r];
        if (!range) continue;
        css.push('@font-face{font-family:"' + f.css + '";font-style:normal;font-weight:' + fl.w +
                 ';font-display:swap;src:url("' + dir + fl.f + '") format("woff2");unicode-range:' + range + '}');
      }
    }
    var st = document.createElement("style");
    st.id = "albFontFaces"; st.textContent = css.join("\n");
    document.head.appendChild(st);
  }
  function roleById(id){ var i; for (i=0;i<D.roles.length;i++) if (D.roles[i].id === id) return D.roles[i]; return null; }
  function fontById(id){ var i; for (i=0;i<D.fonts.length;i++) if (D.fonts[i].id === id) return D.fonts[i]; return null; }
  function pairById(id){ var i; for (i=0;i<D.pairs.length;i++) if (D.pairs[i].id === id) return D.pairs[i]; return null; }
  function curPair(){ return pairById(DOC && DOC.pair) || pairById(D.defPair) || D.pairs[0]; }
  function occById(id){ var i, L = D.occasions || []; for (i=0;i<L.length;i++) if (L[i].id === id) return L[i]; return null; }
  function curOcc(){ return occById(DOC && DOC.occ) || occById(D.defOcc) || (D.occasions || [])[0] || null; }
  function fontForText(tx){
    var own = (tx && tx.font) ? fontById(tx.font) : null;
    if (own) return own;
    var p = curPair(), side = D.roleSide[tx && tx.role] || "b";
    return fontById(side === "t" ? p.t : p.b) || D.fonts[0];
  }
  /* a family that ships only 400 is asked for 400 — never a synthesised bold, which
     on a printed title is a smeared outline rather than a heavier face */
  function weightFor(font, role){
    var want = (role && role.weight >= 600) ? 700 : 400;
    if (want === 700 && font && font.w.indexOf(700) < 0) want = 400;
    return want;
  }
  /* WHICH SCRIPTS A LINE IS ACTUALLY WRITTEN IN. Myanmar covers Burmese, Shan and Mon
     (the extended blocks are theirs), Thai its own. Everything else the picked family
     answers for. */
  var RE_MY = /[\u1000-\u109F\uA9E0-\uA9FE\uAA60-\uAA7F]/;
  var RE_TH = /[\u0E01-\u0E5B]/;
  /* THE FACES A PAGE NEEDS, BEFORE IT IS DRAWN. A canvas asked to set text in a face the
     document has not loaded silently draws the fallback — and the export is a canvas, so
     the album a student downloads would not be the album they were shown. Every draw goes
     through here first, for exactly the characters that page actually carries.

     ONE FAMILY AT A TIME, NOT THE WHOLE STACK, and that was measured rather than assumed:
     asking for the stack loaded the fallbacks too, so an all-Latin title "Ko Ko" fetched
     Padauk's and Noto Sans Thai's Latin subsets as well — 18 KB of faces no glyph on that
     page would ever come from. The picked family is always loaded; a fallback is loaded
     only when the line really carries a script the picked family cannot set. */
  function needFor(f, text){
    var out = [f], i, o;
    function add(script){
      for (i=0;i<(f.fb||[]).length;i++){ o = fontById(f.fb[i]); if (o && o.script === script){ out.push(o); return; } }
    }
    if (RE_MY.test(text) && f.script !== "my") add("my");
    if (RE_TH.test(text) && f.script !== "th") add("th");
    return out;
  }
  function fontsReady(pg){
    ensureFaces();
    if (typeof document === "undefined" || !document.fonts || typeof document.fonts.load !== "function") return Promise.resolve(false);
    var jobs = [], i, j, list = (pg && pg.texts) || [];
    for (i=0;i<list.length;i++){
      var tx = list[i]; if (!tx || !tx.text) continue;
      var f = fontForText(tx); if (!f) continue;
      var text = String(tx.text), w = weightFor(f, roleById(tx.role)), need = needFor(f, text);
      for (j=0;j<need.length;j++){
        try { jobs.push(Promise.resolve(document.fonts.load(w + ' 40px "' + need[j].css + '"', text))["catch"](function(){ return null; })); }
        catch(e){ /* a renderer that refuses the shorthand keeps its fallback */ }
      }
    }
    jobs = jobs.concat(markFontJobs(pg));   /* 6.125.0 — the marks' three faces */
    if (!jobs.length) return Promise.resolve(true);
    return Promise.all(jobs).then(function(){ return true; }, function(){ return false; });
  }

  /* 6.121.0 — WORDS INTO LINES no wider than maxW. Split on spaces; a word wider than the whole
     measure (a Burmese or Chinese run, which has none) is broken by character so nothing is ever
     lost off the edge. Pure over the measuring context, so the painter and the hit test agree. */
  function wrapLines(x, text, maxW){
    var words = String(text).split(/\s+/), out = [], cur = "", i, w, k, piece;
    for (i=0;i<words.length;i++){
      w = words[i]; if (!w) continue;
      if (x.measureText(w).width > maxW){
        if (cur){ out.push(cur); cur = ""; }
        piece = "";
        for (k=0;k<w.length;k++){
          if (x.measureText(piece + w.charAt(k)).width > maxW && piece){ out.push(piece); piece = ""; }
          piece += w.charAt(k);
        }
        cur = piece; continue;
      }
      var test = cur ? cur + " " + w : w;
      if (x.measureText(test).width <= maxW || !cur) cur = test;
      else { out.push(cur); cur = w; }
    }
    if (cur) out.push(cur);
    return out.length ? out : [""];
  }
  /* WHERE A LINE SITS, AND HOW BIG IT IS (6.110.0). Two things need this answer — the painter,
     and the hit test that decides which line a finger landed on — and they must agree to the
     pixel, or the student drags the date and the title moves. So there is one answer, and both
     ask it. Everything returned is in the canvas's own pixels (page pixels × scale).
     `size` is the student's multiplier over the role's own fraction of the page; `rot` their
     rotation in degrees about the middle of the line. A line that has neither is laid out exactly
     where wave B laid it: size 1 and rot 0 reduce every number below to the old ones. */
  var TEXT_MIN = 0.4, TEXT_MAX = 3;
  function textLayout(x, tx, role, safe, scale, m){
    m = m || 0;
    var px = Math.max(8, role.size * safe.h * scale * clamp(+tx.size || 1, TEXT_MIN, TEXT_MAX));
    var face = fontForText(tx);
    var font = weightFor(face, role) + " " + Math.round(px) + "px " + ((face && face.stack) || "Georgia, serif");
    var words = role.caps ? String(tx.text).toUpperCase() : String(tx.text);
    var sp = (role.track > 0) ? role.track*px : 0;
    var chars = null, w = 0, j, lines = null, lh = px*1.25;
    x.save(); x.font = font;
    if (tx.w > 0){
      /* 6.121.0 — A BLOCK, NOT A LINE. Body copy wraps to the width the design gave it (a
         fraction of the safe area); the block is measured as its widest line by its line count,
         and it is drawn line by line about the same centre every other line is drawn about. */
      lines = wrapLines(x, words, Math.max(8, tx.w*safe.w*scale));
      for (j=0;j<lines.length;j++) w = Math.max(w, x.measureText(lines[j]).width);
      lh = px*1.32; sp = 0;
    } else if (sp > 0){
      /* letter-spacing by hand: this renderer has no letterSpacing property to set */
      chars = words.split("");
      for (j=0;j<chars.length;j++) w += x.measureText(chars[j]).width + sp;
      w -= sp;
    } else {
      w = x.measureText(words).width;
    }
    x.restore();
    return { px: px, font: font, words: words, chars: chars, sp: sp, lines: lines, lh: lh,
             w: Math.max(1, w), h: lines ? lh*lines.length : px*1.25,
             cx: (safe.x+m)*scale + safe.w*scale*((tx.x==null)?0.5:tx.x),
             cy: (safe.y+m)*scale + safe.h*scale*((tx.y==null)?0.92:tx.y),
             rot: ((+tx.rot || 0) % 360) * Math.PI/180 };
  }
  /* the left edge a line of this width starts at, in its own rotated frame */
  function textLeft(L, align){ return (align === "left") ? 0 : (align === "right") ? -L.w : -L.w/2; }
  /* the text roles the student filled in, laid on the safe area's own fractions */
  function drawTexts(x, pg, safe, scale, m){
    m = m || 0;
    var i, list = pg.texts || [];
    for (i=0;i<list.length;i++){
      var tx = list[i]; if (!tx || !tx.text) continue;
      var role = roleById(tx.role); if (!role) continue;
      var L = textLayout(x, tx, role, safe, scale, m);
      x.save();
      x.fillStyle = tx.color || "#1b1b1f";
      x.textBaseline = "middle";
      x.textAlign = "left";                 /* the alignment is in the left edge, so a rotation
                                               turns the line about its own middle either way */
      x.font = L.font;
      x.translate(L.cx, L.cy);
      if (L.rot) x.rotate(L.rot);
      var at = textLeft(L, tx.align || "center"), j;
      if (L.lines){
        /* 6.121.0 — a wrapped block: each line about its own middle, the block about the centre;
           a left-aligned block keeps a straight left edge, a centred one a straight axis */
        var y0 = -L.h/2 + L.lh/2, al = tx.align || "center", lw;
        for (j=0;j<L.lines.length;j++){
          lw = x.measureText(L.lines[j]).width;
          x.fillText(L.lines[j], (al === "left") ? 0 : (al === "right") ? -lw : -lw/2, y0 + j*L.lh);
        }
      } else if (L.sp > 0){
        for (j=0;j<L.chars.length;j++){ x.fillText(L.chars[j], at, 0); at += x.measureText(L.chars[j]).width + L.sp; }
      } else {
        x.fillText(L.words, at, 0);
      }
      x.restore();
    }
  }
  /* WHAT THE TRIMMER AND THE BINDING WILL EAT. Red is the bleed the guillotine takes; the
     centre band is the gutter a flush-mount spread loses into its own spine. Guides are a
     preview only — the export never carries them. */
  function drawGuides(x, safe, scale, m){
    m = m || 0;
    var M = m*scale;
    var W = safe.page.w*scale, Hh = safe.page.h*scale, b = safe.bleed*scale;
    x.save();
    x.strokeStyle = "rgba(214,54,54,.85)"; x.lineWidth = Math.max(1, 1*scale*2);
    x.setLineDash([Math.max(4,6*scale*2), Math.max(3,4*scale*2)]);
    x.strokeRect(M+b, M+b, W-2*b, Hh-2*b);
    if (safe.gutter > 0){
      var mid = (safe.x+m)*scale + safe.w*scale/2, g = safe.gutter*scale;
      x.strokeStyle = "rgba(38,110,200,.85)";
      x.beginPath(); x.moveTo(mid-g, M); x.lineTo(mid-g, M+Hh); x.stroke();
      x.beginPath(); x.moveTo(mid+g, M); x.lineTo(mid+g, M+Hh); x.stroke();
    }
    x.restore();
  }

  /* ======================= THE TOUCH (6.110.0) =======================

     The owner, with four photographs of the live Album page:
     "လက်နဲ့ mouse နဲ့ ပုံအတွင်းပိုင်းကို လိုသလိုပြင်လို့ရအောင် overlay တို့ Texts တို့လဲ အဲ့လို
     ဆွဲချုံချဲ့လို့ရအောင်" — let the inside of a photograph be adjusted by finger and by mouse,
     and let the overlays and the words be dragged and resized the same way.

     Until this wave every crop on an album page was decided FOR the student. A photograph
     arrived, a skin-tone centroid said roughly where the subject was, and anchorFor turned that
     into one number per axis. It is a good guess and it is only a guess: the one thing a studio
     actually does with a wedding page is push the bride an inch left so the arch behind her is
     centred, and there was no way to say so. The words were worse — seven roles at seven fixed
     positions, every album in the country carrying its title at exactly 12% of the page.

     WHAT THIS IS. The stage canvas becomes the editing surface. A tap selects the photograph or
     the line under it; a drag moves it; two fingers (or a wheel, or the + and −) zoom it; two
     fingers turn a line. Nothing here invents a second geometry: a drag ends in ph.anchor and
     ph.zoom, which is what coverFit already reads, and in tx.x / tx.y / tx.size / tx.rot, which
     is what textLayout already reads. The export is therefore not a separate code path that has
     to be kept in step — it is the same drawPage, minus the marquee.

     AND IT IS NOT ONLY A GESTURE. Every one of these moves has a button beside the stage. A
     Photoshop panel reads no pointer events worth trusting, a student may be on a laptop
     trackpad, and a hand that shakes should still be able to nudge a crop one step at a time. */

  var SEL = null;                 /* {kind:"photo"|"text"|"decor", i:index} on the page being looked at (6.122.0: decor = an ornament) */
  var SELBOX = null;              /* the rail under the stage, refilled in place — never a render */
  var VIEW = { scale:1, safe:null, cells:[], spread:false };   /* what the stage was last drawn with */
  var PTRS = {}, DRAG = null, PINCH = null;
  var NUDGE = 0.02;               /* one press of an arrow: 2% of the cell, 1% of the page for a line */

  function ptrCount(){ var n = 0, k; for (k in PTRS) if (Object.prototype.hasOwnProperty.call(PTRS,k)) n++; return n; }
  function ptrIds(){ var out = [], k; for (k in PTRS) if (Object.prototype.hasOwnProperty.call(PTRS,k)) out.push(k); return out; }
  /* the cells the page being looked at is actually drawn with */
  function curCells(){
    var safe = safeArea(curSize()); if (!safe) return [];
    var pg = curPage();
    return cellRects(pageTpl(pg, DOC.cur), layoutRect(safe, pg));
  }
  /* WHAT IS SELECTED, or nothing. A selection is an index, and indexes go stale — a photograph is
     removed, a page is deleted, an album is replaced. Every reader comes through here, so a stale
     one is dropped rather than throwing or, worse, quietly moving a different photograph. */
  function selObj(){
    if (!SEL || !DOC) return null;
    var pg = curPage(); if (!pg) { SEL = null; return null; }
    if (SEL.kind === "photo"){
      var ph = pg.photos[SEL.i];
      if (!ph || SEL.i >= Math.min(pg.photos.length, curCells().length)) { SEL = null; return null; }
      return ph;
    }
    if (SEL.kind === "decor"){
      var dd = (pg.decor || [])[SEL.i];
      if (!dd || !decorOk(dd)) { SEL = null; return null; }   /* 6.125.0 — an ornament, a mark or the logo */
      return dd;
    }
    var tx = pg.texts[SEL.i];
    if (!tx || !tx.text || !roleById(tx.role)) { SEL = null; return null; }
    return tx;
  }
  /* THE MARQUEE. Gold, dashed, with four corner ticks — drawn on the stage and nowhere else.
     A photograph is outlined at its cell; a line at the box textLayout measured for it, turned
     with it, so what is highlighted is what a drag will actually move. */
  function drawSel(x, pg, safe, rects, scale, m, sel){
    if (!sel) return;
    m = m || 0;
    var w = Math.max(1.5, 2*scale*2), tick = Math.max(8, 14*scale*2);
    x.save();
    x.strokeStyle = "rgba(230,192,122,.95)"; x.lineWidth = w;
    if (sel.kind === "photo"){
      var r = rects[sel.i]; if (!r){ x.restore(); return; }
      var dx = (r.x+m)*scale, dy = (r.y+m)*scale, dw = r.w*scale, dh = r.h*scale;
      x.setLineDash([Math.max(6,10*scale*2), Math.max(4,7*scale*2)]);
      x.strokeRect(dx, dy, dw, dh);
      x.setLineDash([]);
      var c = [[dx,dy,1,1],[dx+dw,dy,-1,1],[dx,dy+dh,1,-1],[dx+dw,dy+dh,-1,-1]], i;
      for (i=0;i<c.length;i++){
        x.beginPath();
        x.moveTo(c[i][0] + c[i][2]*tick, c[i][1]);
        x.lineTo(c[i][0], c[i][1]);
        x.lineTo(c[i][0], c[i][1] + c[i][3]*tick);
        x.stroke();
      }
    } else if (sel.kind === "decor"){
      var od = (pg.decor || [])[sel.i]; if (!od || od.kind !== "orn") { x.restore(); return; }
      var ob = ornBox(od, safe), oW = ob.w*safe.w*scale, oH = ob.h*safe.h*scale, opad = Math.max(4, Math.min(oW, oH)*0.06);
      x.translate((safe.x + m)*scale + safe.w*scale*ob.x, (safe.y + m)*scale + safe.h*scale*ob.y);
      if (ob.rot) x.rotate(ob.rot);
      x.setLineDash([Math.max(5,8*scale*2), Math.max(3,5*scale*2)]);
      x.strokeRect(-oW/2-opad, -oH/2-opad, oW+2*opad, oH+2*opad);
      x.setLineDash([]);
      x.beginPath(); x.arc(oW/2+opad, oH/2+opad, Math.max(3, 5*scale*2), 0, Math.PI*2); x.stroke();
    } else {
      var tx = (pg.texts || [])[sel.i]; if (!tx) { x.restore(); return; }
      var role = roleById(tx.role); if (!role) { x.restore(); return; }
      var L = textLayout(x, tx, role, safe, scale, m);
      var left = textLeft(L, tx.align || "center"), pad = Math.max(4, L.h*0.25);
      x.translate(L.cx, L.cy);
      if (L.rot) x.rotate(L.rot);
      x.setLineDash([Math.max(5,8*scale*2), Math.max(3,5*scale*2)]);
      x.strokeRect(left-pad, -L.h/2-pad, L.w+2*pad, L.h+2*pad);
      x.setLineDash([]);
      x.beginPath(); x.arc(left+L.w+pad, L.h/2+pad, Math.max(3, 5*scale*2), 0, Math.PI*2); x.stroke();
    }
    x.restore();
  }
  /* WHICH LINE A FINGER LANDED ON. Topmost first — the last line drawn is the one on top — and
     the point is carried into the line's own rotated frame before the box is asked, so a turned
     title is grabbed where it is seen and not where it would have been unturned. */
  function hitText(x, pg, safe, scale, px, py){
    var list = pg.texts || [], i;
    for (i=list.length-1;i>=0;i--){
      var tx = list[i]; if (!tx || !tx.text) continue;
      var role = roleById(tx.role); if (!role) continue;
      var L = textLayout(x, tx, role, safe, scale, 0);
      var dx = px - L.cx, dy = py - L.cy;
      if (L.rot){
        var c = Math.cos(-L.rot), sn = Math.sin(-L.rot);
        var rx = dx*c - dy*sn, ry = dx*sn + dy*c;
        dx = rx; dy = ry;
      }
      var left = textLeft(L, tx.align || "center"), pad = Math.max(10, L.h*0.4);
      if (dx >= left-pad && dx <= left+L.w+pad && dy >= -L.h/2-pad && dy <= L.h/2+pad) return i;
    }
    return -1;
  }
  /* WHICH ORNAMENT A FINGER LANDED ON — topmost first, the point carried into the ornament's own
     turned frame; a small pad so a thin divider can be picked up at all */
  function hitOrn(pg, safe, px, py){
    var list = (pg && pg.decor) || [], i;
    for (i=list.length-1;i>=0;i--){
      var d = list[i]; if (!decorOk(d)) continue;              /* 6.125.0 — a mark and the logo are picked up the same way */
      var b = decorBox(d, safe), W = b.w*safe.w, Hh = b.h*safe.h;
      var dx = px - (safe.x + safe.w*b.x), dy = py - (safe.y + safe.h*b.y);
      if (b.rot){
        var c = Math.cos(-b.rot), sn = Math.sin(-b.rot);
        var rx = dx*c - dy*sn, ry = dx*sn + dy*c;
        dx = rx; dy = ry;
      }
      var pad = Math.max(safe.w*0.012, Math.min(W, Hh)*0.15);
      if (Math.abs(dx) <= W/2 + pad && Math.abs(dy) <= Hh/2 + pad) return i;
    }
    return -1;
  }
  /* which filled cell holds this point */
  function hitCell(cells, n, px, py){
    var i;
    for (i=0;i<cells.length && i<n;i++){
      var r = cells[i];
      if (px >= r.x && px <= r.x+r.w && py >= r.y && py <= r.y+r.h) return i;
    }
    return -1;
  }
  /* A LINE BEATS A PHOTOGRAPH. A caption sits on top of the picture it belongs to, so a tap that
     could be either is the line — which is also the one a student cannot otherwise reach. */
  function pickAt(x, px, py){
    var pg = curPage(), safe = VIEW.safe;
    if (!pg || !safe) return null;
    /* PAGE PIXELS, NOT CANVAS PIXELS. pagePt() has already divided the scale out, and the cells
       are the page's own rectangles — so the layout the hit test asks for is the layout at
       scale 1. The geometry is the same at any scale; measuring both sides in the same one is
       the whole of the rule. */
    var t = hitText(x, pg, safe, 1, px, py);
    if (t >= 0) return { kind:"text", i:t };
    var od = hitOrn(pg, safe, px, py);                   /* 6.122.0 — an ornament sits over the photographs */
    if (od >= 0) return { kind:"decor", i:od };
    var c = hitCell(VIEW.cells, pg.photos.length, px, py);
    if (c >= 0) return { kind:"photo", i:c };
    return null;
  }

  /* ---- the moves, one per gesture and one per button ---- */

  function selCell(){ var cells = curCells(); return (SEL && SEL.kind === "photo") ? cells[SEL.i] : null; }
  function moveSel(dxPage, dyPage){
    var o = selObj(); if (!o) return false;
    if (SEL.kind === "photo"){
      var cell = selCell(); if (!cell) return false;
      return panFit(o, cell, dxPage, dyPage);
    }
    var safe = VIEW.safe || safeArea(curSize()); if (!safe) return false;
    if (SEL.kind === "decor"){                            /* 6.122.0 — an ornament may sit off the safe area, on the bleed */
      o.x = clamp((+o.x || 0) + dxPage/safe.w, -0.3, 1.3);
      o.y = clamp((+o.y || 0) + dyPage/safe.h, -0.3, 1.3);
      return true;
    }
    o.x = clamp(((o.x==null)?0.5:o.x) + dxPage/safe.w, 0, 1);
    o.y = clamp(((o.y==null)?0.92:o.y) + dyPage/safe.h, 0, 1);
    return true;
  }
  /* zoom a photograph about a point in its cell, or grow a line about its own middle */
  function scaleSel(f, atx, aty){
    var o = selObj(); if (!o) return false;
    if (SEL.kind === "photo"){
      var cell = selCell(); if (!cell) return false;
      return zoomFit(o, cell, (+o.zoom || 1) * f, atx, aty);
    }
    if (SEL.kind === "decor"){ o.w = clamp((+o.w || 0.1) * f, ORN_W_MIN, ORN_W_MAX); return true; }
    o.size = clamp((+o.size || 1) * f, TEXT_MIN, TEXT_MAX);
    return true;
  }
  function scaleSelTo(z, atx, aty){
    var o = selObj(); if (!o) return false;
    if (SEL.kind === "photo"){
      var cell = selCell(); if (!cell) return false;
      return zoomFit(o, cell, z, atx, aty);
    }
    if (SEL.kind === "decor"){ o.w = clamp(z, ORN_W_MIN, ORN_W_MAX); return true; }
    o.size = clamp(z, TEXT_MIN, TEXT_MAX);
    return true;
  }
  /* only a line turns: a photograph that turns inside a rectangular cell shows the paper at its
     corners, which is the one thing a cover crop exists to prevent */
  function rotSel(deg){
    var o = selObj(); if (!o || SEL.kind === "photo") return false;   /* 6.122.0 — an ornament turns like a line */
    var r = ((+o.rot || 0) + deg) % 360;
    if (r > 180) r -= 360; if (r < -180) r += 360;
    o.rot = r;
    return true;
  }
  /* BACK TO WHAT THE PAGE CHOSE. A photograph goes back to the anchor the subject finder and the
     cell's own shape imply — and drops its manual flag, so the layout may move it again. A line
     goes back to its role's place, upright, at its own size. */
  function resetSel(){
    var o = selObj(); if (!o) return false;
    if (SEL.kind === "photo"){
      var cell = selCell();
      o.zoom = 1; o.manual = false;
      o.anchor = cell ? anchorFor(o.subject, o.w, o.h, cell.w, cell.h) : { x:0.5, y:0.5 };
      return true;
    }
    if (SEL.kind === "decor"){                            /* 6.122.0 — back to the catalogue's size, upright, unflipped */
      o.rot = 0;
      if (o.kind === "orn"){ var od = ornById(o.id); o.flip = false; if (od) o.w = od.def.w; }
      else o.w = (o.kind === "logo") ? 0.14 : MARK_W;      /* 6.125.0 — a mark or the logo, at the size it landed */
      return true;
    }
    o.size = 1; o.rot = 0; o.x = 0.5; o.y = (o.role === "title") ? 0.12 : 0.92;
    return true;
  }
  /* a move happened: the album is saved, the stage is redrawn, and the rail's own numbers follow.
     `live` is a drag in progress — the page rail's forty thumbnails are not redrawn per frame. */
  function touchChanged(live){
    saveSoon();
    repaint(!!live);
    if (!live){ fillSelBar(); commit(); }
  }

  /* ---- the pointer ---- */

  /* the point in PAGE pixels, which is the only coordinate system the maths above knows. The
     canvas is drawn at VIEW.scale and laid out by CSS at whatever width the card gives it, so
     both divisions are needed and neither may be assumed to be 1. */
  function pagePt(cv, ev){
    var r = cv.getBoundingClientRect();
    if (!(r.width > 0) || !(VIEW.scale > 0)) return null;
    var kx = cv.width / r.width, ky = (r.height > 0) ? cv.height / r.height : kx;
    return { x: (ev.clientX - r.left) * kx / VIEW.scale, y: (ev.clientY - r.top) * ky / VIEW.scale };
  }
  function pinchOf(ids){
    var a = PTRS[ids[0]], b = PTRS[ids[1]];
    var dx = b.x - a.x, dy = b.y - a.y;
    return { d: Math.sqrt(dx*dx + dy*dy), a: Math.atan2(dy, dx) * 180/Math.PI,
             x: (a.x + b.x)/2, y: (a.y + b.y)/2 };
  }
  function startPinch(){
    var ids = ptrIds(); if (ids.length < 2) { PINCH = null; return; }
    var o = selObj(); if (!o) { PINCH = null; return; }
    var g = pinchOf(ids);
    PINCH = { d0: g.d || 1, a0: g.a, x: g.x, y: g.y,
              z0: (SEL.kind === "photo") ? (+o.zoom || 1) : (SEL.kind === "decor") ? (+o.w || 0.1) : (+o.size || 1),
              r0: (SEL.kind === "photo") ? 0 : (+o.rot || 0) };
  }
  function applyPinch(){
    var ids = ptrIds(); if (ids.length < 2 || !PINCH) return;
    var o = selObj(); if (!o) return;
    var g = pinchOf(ids);
    var cell = selCell();
    var atx = 0.5, aty = 0.5;
    if (cell && cell.w > 0 && cell.h > 0){
      atx = clamp((g.x - cell.x)/cell.w, 0, 1);
      aty = clamp((g.y - cell.y)/cell.h, 0, 1);
    }
    scaleSelTo(PINCH.z0 * (g.d / (PINCH.d0 || 1)), atx, aty);
    if (SEL.kind !== "photo"){
      var d = g.a - PINCH.a0;
      if (d > 180) d -= 360; if (d < -180) d += 360;
      o.rot = PINCH.r0 + d;
      moveSel(g.x - PINCH.x, g.y - PINCH.y);
    }
    PINCH.x = g.x; PINCH.y = g.y;
  }
  /* THE STAGE IS BOUND ONCE PER CANVAS. render() builds a new canvas on every rebuild, so the
     flag lives on the element rather than in the module: a card drawn twice binds twice and a
     single drag would move the crop two steps. */
  function bindStage(cv){
    if (!cv || cv.__albTouch) return;
    cv.__albTouch = true;
    var hasPtr = (typeof window !== "undefined") && !!window.PointerEvent;

    function down(ev){
      if (DOC.view !== "page") return;
      var x = cv.getContext("2d"); if (!x) return;
      var p = pagePt(cv, ev); if (!p) return;
      var hit = pickAt(x, p.x, p.y);
      /* A TAP ON THE PAPER LETS GO. Without this a student who has finished with a photograph has
         no way to put the handles away, and the arrows under the stage keep moving something they
         are no longer looking at. */
      if (!hit){ if (SEL){ SEL = null; fillSelBar(); repaint(false); } return; }
      if (!SEL || SEL.kind !== hit.kind || SEL.i !== hit.i){ SEL = hit; fillSelBar(); }
      PTRS[ev.pointerId == null ? "m" : ev.pointerId] = p;
      if (ptrCount() >= 2) startPinch();
      else { DRAG = { }; if (cv.classList) cv.classList.add("dragging"); }
      if (hasPtr && cv.setPointerCapture) { try { cv.setPointerCapture(ev.pointerId); } catch(e){} }
      if (ev.preventDefault) ev.preventDefault();
    }
    function move(ev){
      var id = (ev.pointerId == null) ? "m" : ev.pointerId;
      if (!Object.prototype.hasOwnProperty.call(PTRS, id)) return;
      var p = pagePt(cv, ev); if (!p) return;
      if (ptrCount() >= 2){ PTRS[id] = p; applyPinch(); }
      else {
        var last = PTRS[id];
        PTRS[id] = p;
        moveSel(p.x - last.x, p.y - last.y);
      }
      touchChanged(true);
      if (ev.preventDefault) ev.preventDefault();
    }
    function up(ev){
      var id = (ev.pointerId == null) ? "m" : ev.pointerId;
      if (!Object.prototype.hasOwnProperty.call(PTRS, id)) return;
      delete PTRS[id];
      PINCH = null;
      if (ptrCount() === 0){ DRAG = null; if (cv.classList) cv.classList.remove("dragging"); touchChanged(false); }
      else startPinch();
    }
    if (hasPtr){
      cv.addEventListener("pointerdown", down, false);
      cv.addEventListener("pointermove", move, false);
      cv.addEventListener("pointerup", up, false);
      cv.addEventListener("pointercancel", up, false);
    } else {
      /* a host without pointer events still gets the mouse: one button, no pinch, same maths */
      cv.addEventListener("mousedown", down, false);
      cv.addEventListener("mousemove", move, false);
      cv.addEventListener("mouseup", up, false);
      cv.addEventListener("mouseleave", up, false);
    }
    /* the wheel zooms what is under it — and selects it first, so one turn does the whole job */
    cv.addEventListener("wheel", function(ev){
      if (DOC.view !== "page") return;
      var x = cv.getContext("2d"); if (!x) return;
      var p = pagePt(cv, ev); if (!p) return;
      var hit = pickAt(x, p.x, p.y); if (!hit) return;
      if (!SEL || SEL.kind !== hit.kind || SEL.i !== hit.i){ SEL = hit; }
      var cell = selCell(), atx = 0.5, aty = 0.5;
      if (cell && cell.w > 0 && cell.h > 0){
        atx = clamp((p.x - cell.x)/cell.w, 0, 1);
        aty = clamp((p.y - cell.y)/cell.h, 0, 1);
      }
      scaleSel((ev.deltaY < 0) ? 1.12 : 1/1.12, atx, aty);
      touchChanged(false);
      if (ev.preventDefault) ev.preventDefault();
    }, { passive:false });
    /* two taps put it back the way the page chose it */
    cv.addEventListener("dblclick", function(ev){
      if (DOC.view !== "page") return;
      var x = cv.getContext("2d"); if (!x) return;
      var p = pagePt(cv, ev); if (!p) return;
      var hit = pickAt(x, p.x, p.y); if (!hit) return;
      SEL = hit; resetSel(); touchChanged(false);
      if (ev.preventDefault) ev.preventDefault();
    }, false);
  }

  /* ---- the rail under the stage ---- */

  function selBtn(label, title, fn){
    var b = E("button","btn", label);
    b.type = "button";
    if (title){ b.title = title; b.setAttribute("aria-label", title); }
    b.onclick = fn;
    return b;
  }
  /* REFILLED, NEVER RE-RENDERED. Selecting a photograph must not rebuild the album page: a
     render() replaces every node on it, which would take the caret out of a caption being
     typed and drop the very canvas the finger is still on. */
  function fillSelBar(){
    var box = SELBOX || document.getElementById("albSelBox");
    if (!box) return;
    SELBOX = box;
    box.innerHTML = "";
    var bar = E("div","alb-selbar");
    if (DOC.view !== "page"){
      bar.appendChild(E("span","alb-selnone", L(DOC.view === "book" ? "alb_book_note" : DOC.view === "3d" ? "alb_3d_note" : "alb_spread_note")));
      box.appendChild(bar);
      return;
    }
    var o = selObj();
    if (!o){
      bar.appendChild(E("span","alb-selnone", L("alb_sel_none")));
      box.appendChild(bar);
      return;
    }
    var isPhoto = (SEL.kind === "photo"), isOrn = (SEL.kind === "decor");
    var name = isPhoto
      ? L("alb_sel_photo").replace("{N}", String(SEL.i+1))
      : isOrn ? ((o.kind === "orn") ? L("alb_sel_orn").replace("{N}", decorLabel(o)) : decorLabel(o))   /* 6.125.0 wave I — a mark and the logo carry their own name */
      : L("alb_sel_text").replace("{R}", pick9((roleById(o.role) || {}).label || {}));
    var reads = isPhoto
      ? "×" + (Math.round((+o.zoom || 1)*100)/100)
      : isOrn ? Math.round((+o.w || 0.1)*100) + "% · " + Math.round(+o.rot || 0) + "°"
      : "×" + (Math.round((+o.size || 1)*100)/100) + " · " + Math.round(+o.rot || 0) + "°";
    bar.appendChild(E("span","alb-selname", name + " · " + reads));
    box.appendChild(bar);

    var ops = [
      selBtn("−", L("alb_zoom_out"), function(){ scaleSel(1/1.15); touchChanged(false); }),
      selBtn("+", L("alb_zoom_in"),  function(){ scaleSel(1.15);   touchChanged(false); })
    ];
    if (!isPhoto){
      ops.push(selBtn("↺", L("alb_rot_l"), function(){ rotSel(-3); touchChanged(false); }));
      ops.push(selBtn("↻", L("alb_rot_r"), function(){ rotSel(3);  touchChanged(false); }));
    }
    /* the reset carries its WORD, not a third circular arrow beside the two rotations — three
       of them in a row and a student presses the wrong one */
    ops.push(selBtn(L("alb_reset_one"), L("alb_reset_one"), function(){ resetSel(); touchChanged(false); }));
    var orow = grid("btn", ops, albWidth()); orow.id = "albSelOps";
    box.appendChild(orow);

    var safe = VIEW.safe || safeArea(curSize());
    var cell = selCell();
    var sx = isPhoto ? (cell ? cell.w*NUDGE : 0) : (safe ? safe.w*NUDGE/2 : 0);
    var sy = isPhoto ? (cell ? cell.h*NUDGE : 0) : (safe ? safe.h*NUDGE/2 : 0);
    var mv = [
      selBtn("←", L("alb_move_l"), function(){ moveSel(-sx, 0); touchChanged(false); }),
      selBtn("→", L("alb_move_r"), function(){ moveSel(sx, 0);  touchChanged(false); }),
      selBtn("↑", L("alb_move_u"), function(){ moveSel(0, -sy); touchChanged(false); }),
      selBtn("↓", L("alb_move_d"), function(){ moveSel(0, sy);  touchChanged(false); })
    ];
    var mrow = grid("btn", mv, albWidth()); mrow.id = "albSelMove";
    box.appendChild(mrow);
    /* 6.121.0 wave F — THE LOOK OF THIS FRAME, AND WHAT TO DO WITH IT. The video turns one
       photograph on a spread black and white; here six looks, one tap each, and beside them
       the four moves a frame needs: another file into it, a trade of cells with its neighbour
       either way, and off the page (into the tray it goes, never lost). A line gets its one. */
    if (isPhoto){
      var fxc = [], fi;
      for (fi=0; fi<FX_LIST.length; fi++){
        (function(fx){
          var b = chip(L("alb_fx_" + (fx || "none")), (o.fx || "") === fx, function(){ setFx(fx); });
          b.id = "albFx_" + (fx || "none"); b.className += " alb-fx";
          fxc.push(b);
        })(FX_LIST[fi]);
      }
      box.appendChild(subh(L("alb_fx")));
      var frow = grid("size", fxc, albWidth()); frow.id = "albSelFx";
      box.appendChild(frow);
      var rp = selBtn(L("alb_replace"), L("alb_replace"), function(){ PICK_MODE = "replace"; if (H && typeof H.pickFiles === "function") H.pickFiles(); });
      rp.id = "albSelReplace";
      if (H && typeof H.wirePick === "function"){ try { H.wirePick(rp, function(){ PICK_MODE = "replace"; }); } catch(e){} }
      var sl = selBtn(L("alb_swap_l"), L("alb_swap_l"), function(){ swapSel(-1); }); sl.id = "albSelSwapL"; sl.disabled = (SEL.i === 0);
      var sr = selBtn(L("alb_swap_r"), L("alb_swap_r"), function(){ swapSel(1); }); sr.id = "albSelSwapR"; sr.disabled = (SEL.i >= curPage().photos.length - 1);
      var rm = selBtn(L("alb_remove"), L("alb_remove"), function(){ removeSelected(); }); rm.id = "albSelRemove";
      var arow = grid("btn", [rp, sl, sr, rm], albWidth()); arow.id = "albSelActs";
      box.appendChild(arow);
    } else if (isOrn){
      /* 6.122.0 — the ornament's tint, and what to do with it: mirror it, another copy beside
         it, or off the page */
      var tc = [], ti;
      for (ti=0; ti<(o.kind === "logo" ? 0 : TINT_NAMES.length); ti++){   /* 6.125.0 — a mark takes the tints; the logo keeps its own colours */
        (function(tn){
          var b = chip("", (o.tint || "gold") === tn, function(){ setTint(tn); });
          b.id = "albTint_" + tn; b.className += " alb-tintchip";
          var sw = E("span","alb-swatch"); sw.style.backgroundColor = tintHex(tn); b.appendChild(sw);
          b.appendChild(E("span", null, L("alb_tint_" + tn)));
          tc.push(b);
        })(TINT_NAMES[ti]);
      }
      if (tc.length){ box.appendChild(subh(L("alb_tint"))); var trow = grid("size", tc, albWidth()); trow.id = "albSelTints"; box.appendChild(trow); }
      var fl = selBtn(L("alb_flip"), L("alb_flip"), function(){ flipSel(); }); fl.id = "albSelFlip";
      var du = selBtn(L("alb_dup"), L("alb_dup"), function(){ dupSel(); }); du.id = "albSelDup";
      var ro = selBtn(L("alb_remove_orn"), L("alb_remove_orn"), function(){ removeSelected(); }); ro.id = "albSelRemove";
      var arow3 = grid("btn", (o.kind === "orn") ? [fl, du, ro] : [du, ro], albWidth()); arow3.id = "albSelActs";   /* 6.125.0 — only a mask mirrors */
      box.appendChild(arow3);
    } else {
      /* 6.125.0 wave I — the twelve text styles: a face and a size in one tap, each chip set in its own face */
      var stc = [], si;
      for (si=0; si<TEXT_STYLES.length; si++){
        (function(st){
          var f = fontById(st.font); if (!f) return;
          var b = chip(f.name, o.style === st.id, function(){ applyTextStyle(st.id); });
          b.id = "albTs_" + st.id; b.className += " alb-tschip"; b.style.fontFamily = f.stack || "";
          stc.push(b);
        })(TEXT_STYLES[si]);
      }
      if (stc.length){ box.appendChild(subh(L("alb_ts_h"))); var strow = grid("size", stc, albWidth()); strow.id = "albSelStyles"; box.appendChild(strow); }
      var rml = selBtn(L("alb_remove_line"), L("alb_remove_line"), function(){ removeSelected(); }); rml.id = "albSelRemove";
      var arow2 = grid("btn", [rml], albWidth()); arow2.id = "albSelActs";
      box.appendChild(arow2);
    }
  }
  /* ---- the ornament's own moves (6.122.0 wave G) ---- */
  function setTint(t){
    var o = selObj(); if (!o || SEL.kind !== "decor" || o.kind === "logo") return false;   /* 6.125.0 — the logo keeps its own colours */
    o.tint = (TINT_NAMES.indexOf(t) >= 0 || /^#[0-9a-fA-F]{6}$/.test(t)) ? t : "gold";
    touchChanged(false);
    return true;
  }
  function flipSel(){
    var o = selObj(); if (!o || SEL.kind !== "decor" || o.kind !== "orn") return false;   /* only a mask mirrors */
    o.flip = !o.flip; touchChanged(false); return true;
  }
  function dupSel(){
    var o = selObj(); if (!o || SEL.kind !== "decor") return false;
    var pg = curPage(); if ((pg.decor || []).length >= DECOR_MAX){ H.toast(L("alb_orn_full").replace("{N}", String(DECOR_MAX)), ""); return false; }
    var c = JSON.parse(JSON.stringify(o));                 /* 6.125.0 — an ornament, a mark or the logo, whatever it carries */
    c.x = clamp((+o.x||0) + 0.05, -0.3, 1.3); c.y = clamp((+o.y||0) + 0.05, -0.3, 1.3); c.auto = false;
    pg.decor.push(c);
    SEL = { kind:"decor", i: pg.decor.length-1 };
    onDocChange(false);
    return true;
  }
  /* a new ornament lands where its family belongs — a corner in the corner, a frame around the
     page, a divider across the middle — selected and ready to be moved */
  function addOrnament(id){
    var o = ornById(id); if (!o || !DOC) return false;
    var pg = curPage();
    if (DOC.view !== "page"){ DOC.view = "page"; }
    if (!pg.decor) pg.decor = [];
    if (pg.decor.length >= DECOR_MAX){ H.toast(L("alb_orn_full").replace("{N}", String(DECOR_MAX)), ""); return false; }
    pg.decor.push({ kind:"orn", id:id, x:o.def.x, y:o.def.y, w:o.def.w, rot:o.def.rot||0, tint:"gold", flip:false, auto:false });
    SEL = { kind:"decor", i: pg.decor.length-1 };
    onDocChange(false);
    H.toast(L("alb_orn_added").replace("{N}", ornLabel(id)), "ok");
    return true;
  }
  function setOverlay(id, amount){
    var pg = curPage(); if (!pg) return false;
    if (!id || !ovlById(id)){ pg.overlay = null; onDocChange(false); return true; }
    var amt = (OVL_AMTS.indexOf(amount) >= 0) ? amount : ((pg.overlay && pg.overlay.amount) || "medium");
    pg.overlay = { id:id, amount:amt };
    onDocChange(false);
    return true;
  }
  /* the same overlay on every page of the album */
  function overlayAll(){
    var pg = curPage(), i, n = 0; if (!pg) return 0;
    for (i=0;i<DOC.pages.length;i++){ DOC.pages[i].overlay = pg.overlay ? { id:pg.overlay.id, amount:pg.overlay.amount } : null; n++; }
    onDocChange(false);
    return n;
  }
  /* the two history buttons follow the history without a render */
  function syncUndoBtns(){
    if (typeof document === "undefined") return;
    var u = document.getElementById("albUndo"), r = document.getElementById("albRedo");
    if (u) u.disabled = !HIST.length;
    if (r) r.disabled = !REDO.length;
  }

  /* ======================= THE PAGE ======================= */

  /* ======================= THE WIDTH, AND THE COLUMNS (6.107.0, wave E) =======================

     The owner, with three photographs of this page: "မသပ်ရပ်ဘူး professional မဆန်ဘူး ui ux က
     နောက်ပြီး အရှင်ချိန်လို့ရအောင်လုပ်ပေးပါ ဖုန်းကွန်ပျုတာ photoshop မှာ" — it is untidy and
     unprofessional, and make it adjustable, on a phone, a computer and in Photoshop.

     MEASURED, NOT DECLARED. Every ragged row in those photographs came from the same thing:
     the rails were `flex-wrap` over items of their own natural widths, so nine occasion chips
     fell 4 / 4 / 1 in three different heights and four page buttons came out 160, 85, 111 and
     132 px wide. A stylesheet could fix that on the web with a grid and a breakpoint — but the
     Photoshop panel this module was written to be lifted into draws no CSS grid and honours no
     @media rule (panel/index.html carries none), so a layout that depends on either is a layout
     that is tidy on a phone and ragged in Photoshop.

     The width is therefore measured HERE, in script, and the column count is written onto the
     rail as a class. albWidth asks the album root for its own clientWidth first; where that
     reads zero — which is exactly what Photoshop's renderer returns — it falls back to the
     6.79.0 ruler race (innerWidth, outerWidth, the visual viewport, then a matchMedia binary
     search), less the padding every ancestor declares, which getComputedStyle echoes without
     any layout at all. A browser never reaches past the first line. */
  function albCssPx(cs, prop){ var v = parseFloat(cs && cs[prop]); return isFinite(v) ? v : 0; }
  function albViewportW(){
    var w = (typeof window !== "undefined" && window.innerWidth) || 0; if (w > 0) return w;
    try { w = window.outerWidth || 0; if (w > 0) return w; } catch(e){}
    try { w = (window.visualViewport && window.visualViewport.width) || 0; if (w > 0) return w; } catch(e){}
    try {
      if (typeof window.matchMedia !== "function") return 0;
      if (!window.matchMedia("(min-width: 1px)").matches || window.matchMedia("(min-width: 20000px)").matches) return 0;
      var lo = 1, hi = 20000, i;
      for (i=0;i<16 && hi-lo>1;i++){ var mid = Math.floor((lo+hi)/2); if (window.matchMedia("(min-width: "+mid+"px)").matches) lo = mid; else hi = mid; }
      return lo;
    } catch(e2){ return 0; }
  }
  var ALB_FALLBACK_W = 340;           /* the Photoshop panel's own column, where nothing measures */
  function albWidth(){
    var el = ROOT;
    if (el && el.clientWidth > 0) return el.clientWidth;
    if (H && typeof H.stageWidth === "function"){ try { var hw = H.stageWidth(el); if (hw > 0) return hw; } catch(e){} }
    var vw = albViewportW(); if (!(vw > 0)) return ALB_FALLBACK_W;
    var n = el, pad = 0, guard = 0;
    while (n && n.nodeType === 1 && guard++ < 40){
      var cs = null; try { cs = getComputedStyle(n); } catch(e3){ cs = null; }
      if (cs) pad += albCssPx(cs,"paddingLeft") + albCssPx(cs,"paddingRight")
                   + albCssPx(cs,"borderLeftWidth") + albCssPx(cs,"borderRightWidth")
                   + albCssPx(cs,"marginLeft") + albCssPx(cs,"marginRight");
      if (n === document.body) break;
      n = n.parentNode;
    }
    return Math.max(200, vw - pad);
  }
  /* WHOLE ROWS WHERE THE COUNT ALLOWS. Nine occasions at four columns is the 4 / 4 / 1 the owner
     photographed; at three it is three tidy rows of three. So the cap that the width earns is
     the LARGEST column count tried, and the count actually used is the largest whole divisor of
     the item count at or below it — falling back to the cap when the count is prime. */
  function evenCols(n, cap){
    var c = Math.min(cap, Math.max(1, n)), i;
    if (c < 2) return 1;
    for (i=c;i>=2;i--) if (n % i === 0) return i;
    return c;
  }
  /* the cap each kind of rail earns at a measured width. A chip with a drawing in it wants a
     cell near its drawing's size; a chip with only words wants as few columns as read well. */
  function albCap(kind, w){
    var narrow = w < 380, phone = w < 560, mid = w < 820;
    if (kind === "occ")  return narrow ? 4 : phone ? 5 : mid ? 6 : 9;
    if (kind === "tpl")  return narrow ? 4 : phone ? 5 : mid ? 7 : 8;
    if (kind === "size") return narrow ? 2 : phone ? 3 : mid ? 4 : 6;
    if (kind === "pair") return narrow ? 2 : phone ? 3 : mid ? 4 : 6;
    if (kind === "btn")  return narrow ? 2 : phone ? 2 : 4;
    return 2;
  }
  function albCols(kind, n, w){ return evenCols(n, albCap(kind, (w > 0) ? w : albWidth())); }
  /* a rail of even cells: every item gets the same width, and align-items:stretch gives every
     item in a row the same height whether its label wrapped or not */
  function grid(kind, items, w){
    var row = E("div", "alb-grid alb-c" + albCols(kind, items.length, w)), i;
    for (i=0;i<items.length;i++){
      var cell = E("div","alb-cell");
      cell.appendChild(items[i]);
      row.appendChild(cell);
    }
    return row;
  }
  /* a small uppercase heading inside a card — the hierarchy the photographs had none of */
  function subh(text){ return E("p","subh", text); }
  /* the width bucket the page was last drawn at. A resize only redraws when it crosses one of
     these, because render() replaces every node and a student typing a caption would lose the
     caret to a one-pixel window drag. */
  function widthBucket(w){ return w < 380 ? 0 : w < 560 ? 1 : w < 820 ? 2 : 3; }
  var BUCKET = -1, RESZ = null, RESIZE_BOUND = false;
  function onResize(){
    if (RESZ) clearTimeout(RESZ);
    RESZ = setTimeout(function(){
      RESZ = null;
      if (!ROOT || !MOUNTED) return;
      if (widthBucket(albWidth()) === BUCKET) { repaint(); return; }
      render();
    }, 140);
  }

  function L(k){ return (H && typeof H.t === "function") ? H.t(k) : k; }
  function E(tag, cls, txt){ var e=document.createElement(tag); if(cls) e.className=cls; if(txt!=null) e.textContent=txt; return e; }
  function chip(label, on, fn){
    var b = E("button", "chip" + (on ? " on" : ""), label);
    b.onclick = fn; return b;
  }
  function pick9(o){ return (H && typeof H.pick9 === "function") ? H.pick9(o) : (o && (o.en || o.my)) || ""; }

  /* ---- the size card ---- */
  /* ======================= THE OCCASION (6.105.0 wave C) ======================= */

  /* Which picker opened the file dialog. The host's mirror input is ONE input shared by both
     buttons, and the native overlay the phone needs (nativePick) swallows the button's own
     click — so the mode is set through the overlay's `before` hook rather than read off the
     event, which is the only place both routes pass through. */
  var PICK_MODE = "page";

  /* 6.122.0 — the question is asked as a promise: the browser's confirm answers at once, the
     Photoshop panel's own dialog answers when it is closed, and the code after it waits either way */
  function askP(msg){
    if (H && typeof H.confirm === "function"){
      try { return Promise.resolve(H.confirm(msg)).then(function(v){ return !!v; }).catch(function(){ return true; }); }
      catch(e){ return Promise.resolve(true); }
    }
    return Promise.resolve(true);   /* a host with no way to ask is a host that already asked */
  }
  function hasWork(){
    var i;
    if (!DOC || !DOC.pages) return false;
    if (DOC.pages.length > 1) return true;
    for (i=0;i<DOC.pages.length;i++){
      if (DOC.pages[i].photos.length) return true;
      var k, tx = DOC.pages[i].texts || [];
      for (k=0;k<tx.length;k++) if (tx[k].text) return true;
    }
    return false;
  }

  /* the occasion's own starter lines, on the page the album opens with. STARTERS: every one is
     a line the student is expected to type over. They are here so the first page opens with
     something set in the album's own face, in the language the student reads, rather than an
     empty box that says nothing about how the page will look. */
  function openerTexts(o){
    if (!o || !o.words) return [];
    return [
      { role:"title",    text: pick9(o.words.title)    || "", x:0.5, y:0.12, align:"center", color:o.ink, font:"" },
      { role:"subtitle", text: pick9(o.words.subtitle) || "", x:0.5, y:0.22, align:"center", color:o.ink, font:"" },
      { role:"quote",    text: pick9(o.words.quote)    || "", x:0.5, y:0.88, align:"center", color:o.ink, font:"" }
    ];
  }

  /* Picking an occasion sets the three decisions a student should not have to make one at a
     time — the pairing, the print size and the ink — and never touches a photograph or a word
     they have already typed. A line keeps a colour the student chose themselves; only lines
     still wearing the default or the previous occasion's ink move. */
  function setOccasion(id){
    var o = occById(id); if (!o || !DOC) return;
    var prev = curOcc(), was = (prev && prev.ink) || INKS[0], i, k, tx;
    DOC.occ = o.id;
    DOC.pair = o.pair;
    if (sizeById(o.size)) DOC.sizeId = o.size;
    for (i=0;i<DOC.pages.length;i++){
      tx = DOC.pages[i].texts || [];
      for (k=0;k<tx.length;k++) if (tx[k].color === was || tx[k].color === INKS[0]) tx[k].color = o.ink;
    }
    onDocChange(true);
  }

  /* MAKE THE ALBUM. The student hands over a card full of photographs; the occasion decides the
     size, the pairing, the ink and where the pages break, and each page then picks its own
     layout through the same auto-flow one page uses. This REPLACES what is on screen, so it
     asks first whenever there is anything to lose. */
  function makeAlbum(srcs){
    var all = srcs || [], list = all.slice(0, MAXA);
    if (!list.length) return Promise.resolve(0);
    if (hasWork()) return askP(L("alb_make_replace")).then(function(ok){ return ok ? makeAlbumGo(all) : 0; });
    return makeAlbumGo(all);
  }
  function makeAlbumGo(all){
    var list = all.slice(0, MAXA), over = all.length - list.length;
    var o = curOcc(), photos = [], step = 0;
    H.toast(L("alb_make_busy").replace("{N}", String(list.length)), "");
    return list.reduce(function(chain, src){
      return chain.then(function(){
        progress(step++, list.length);                     /* 6.121.0 — the bar, one photograph at a time */
        return readPhoto(src).then(function(ph){ if (ph) photos.push(ph); });
      });
    }, Promise.resolve()).then(function(){
      progress(list.length, list.length);
      if (!photos.length){ H.toast(L("alb_make_none"), "err"); return 0; }
      var counts = planPages(photos.length, o && o.plan, DOC.density), doc = blankDoc(), at = 0, i, pg;
      doc.guides = DOC.guides;
      /* 6.121.0 — the design choices outlive the album they were made on */
      doc.style = DOC.style; doc.paper = DOC.paper; doc.density = DOC.density; doc.cover = DOC.cover;
      doc.info = infoOf(); doc.logo = DOC.logo || "";   /* 6.125.0 — the couple and the logo outlive the album too */
      if (o){
        doc.occ = o.id;
        doc.pair = o.pair;
        if (sizeById(o.size)) doc.sizeId = o.size;
      }
      doc.pages = [];
      for (i=0;i<counts.length;i++){
        pg = blankPage();
        pg.photos = photos.slice(at, at + counts[i]);
        at += counts[i];
        doc.pages.push(pg);
      }
      if (o) doc.pages[0].texts = openerTexts(o);
      doc.cur = 0;
      /* 6.121.0 — every photograph is in the tray, with the pages it is used on */
      doc.pool = [];
      for (i=0;i<photos.length;i++) doc.pool.push(clonePhoto(photos[i]));
      DOC = doc;
      SEL = null;
      for (i=0;i<DOC.pages.length;i++) reAnchor(DOC.pages[i], i);
      /* 6.121.0 — the design engine writes every page's story lines, and the cover if asked */
      designPagesQuiet();
      for (i=0;i<DOC.pages.length;i++) reAnchor(DOC.pages[i], i);
      saveSoon();
      commit();
      render();
      H.toast(L("alb_make_done").replace("{N}", String(photos.length)).replace("{P}", String(DOC.pages.length)), "ok");
      if (over > 0) H.toast(L("alb_make_cap").replace("{N}", String(MAXA)), "");
      return photos.length;
    });
  }

  /* An occasion chip is a drawing of the first three pages the plan lays out — the opener and
     the two it opens on — each with the layout the auto-flow would actually pick at that
     position. Nothing else tells a student what "wedding" and "newborn" differ by before they
     have put a single photograph in.
     The name beside it is set in the STUDIO's face, never the album's: the album's twenty
     families are declared under handles nothing else in the app names, and a chip that used one
     would pull a typeface down on a page that has not asked for one yet. */
  /* THE OCCASION'S PLAN, DRAWN. Three mini pages — the opener and the two page counts the plan
     repeats — each with the layout that count would actually pick. 6.107.0 cuts the canvas at
     twice the size it is shown at (168 x 56 for a cell up to 104 px wide), gives every page a
     hairline frame and every cell a gap, so a monitor gets a drawing rather than a blown-up
     blur, and a phone gets three readable pages instead of the plain yellow blocks the owner
     photographed. */
  function planSketch(o){
    var cv = document.createElement("canvas");
    cv.className = "alb-plan"; cv.width = 168; cv.height = 56;
    var x = cv.getContext("2d"); if (!x) return cv;
    x.fillStyle = "#12161d"; x.fillRect(0,0,168,56);
    var counts = [1, (o.plan[0]|0) || 1, (o.plan[1]|0) || 1], i, j;
    for (i=0;i<3;i++){
      var ox = i*56 + 4, oy = 4, pw = 48, ph = 48;
      var n = clamp(counts[i], 1, MAXP), sq = [], k;
      for (k=0;k<n;k++) sq.push({ w:1, h:1 });
      var a = autoTemplate(sq, i), t = (a && a.tpl) || tplsFor(n)[0];
      x.fillStyle = "#ffffff"; x.fillRect(ox, oy, pw, ph);
      x.strokeStyle = "#8a7124"; x.lineWidth = 1; x.strokeRect(ox+0.5, oy+0.5, pw-1, ph-1);
      x.fillStyle = "#c9a227";
      if (t){
        for (j=0;j<t.cells.length;j++){
          var c = t.cells[j];
          x.fillRect(ox + Math.round(c.x*pw) + 1, oy + Math.round(c.y*ph) + 1,
                     Math.max(2, Math.round(c.w*pw) - 2), Math.max(2, Math.round(c.h*ph) - 2));
        }
      }
    }
    return cv;
  }

  function occasionCard(){
    var card = E("section","card"); card.id = "albOccCard";
    card.appendChild(E("h2", null, L("alb_occ")));
    var list = D.occasions || [], cur = curOcc(), i, w = albWidth(), chips = [];
    for (i=0;i<list.length;i++){
      (function(oc){
        var b = E("button","chip alb-occ" + ((cur && cur.id === oc.id) ? " on" : ""), "");
        b.id = "albOcc_" + oc.id;
        b.title = pick9(oc.note);
        b.appendChild(planSketch(oc));
        b.appendChild(E("span","alb-occname", pick9(oc.name)));
        b.onclick = function(){ setOccasion(oc.id); };
        chips.push(b);
      })(list[i]);
    }
    var row = grid("occ", chips, w); row.id = "albOccs";
    card.appendChild(row);
    /* 6.107.0 — the note used to repeat the whole size line the size card prints one card
       lower, edge to edge: "... 36 x 12 in - 10800 x 3600 px - 300 DPI - bleed 3 mm - gutter
       5 mm". The occasion's own two facts are what belongs here; the size belongs to the size
       card, where it can now be changed. */
    var note = E("p","mut"); note.id = "albOccNote";
    if (cur){
      var pr = pairById(cur.pair);
      note.textContent = pick9(cur.note) + (pr ? (" \u00b7 " + pick9(pr.label)) : "");
    } else note.textContent = L("alb_occ_note");
    card.appendChild(note);

    var mrow = E("div","row");
    var mk = E("button","btn btn-gold grow", L("alb_make")); mk.id = "albMake";
    mk.onclick = function(){ PICK_MODE = "album"; if (H && typeof H.pickFiles === "function") H.pickFiles(); };
    mrow.appendChild(mk);
    /* the same 6.23.1 rule the photo button follows: the phone's own picker is laid over the
       button on EVERY render, and it carries the mode with it */
    if (H && typeof H.wirePick === "function"){ try { H.wirePick(mk, function(){ PICK_MODE = "album"; }); } catch(e){} }
    card.appendChild(mrow);
    card.appendChild(E("p","mut", L("alb_make_hint").replace("{N}", String(MAXA))));
    return card;
  }

  /* ======================= THE SIZE, FREELY SET (6.107.0, wave E) =======================

     "အရှင်ချိန်လို့ရအောင်လုပ်ပေးပါ" — make it adjustable. Until this wave the album's page size
     could only be one of twenty-four fixed chips; a free size existed, but it was hidden behind
     a seventh group chip called "Custom", it started at 12 x 36 inches whatever was on screen,
     and it offered nothing but four bare number boxes. A studio that prints for a customer is
     told a size, and it is rarely one of twenty-four.

     So the free control is now ALWAYS on the card, under the presets, and it is both things the
     owner asked for: a number you TYPE and a rail you DRAG. It starts from the size on screen —
     touch it and the size you were looking at is copied in first, so dragging moves the page you
     have, not a panorama you never chose. A lock keeps the proportion while you drag; a swap
     turns the page on its side; the unit and the DPI are the student's too.

     AND IT CANNOT BE ASKED FOR A PAGE THAT CANNOT BE MADE. Every bound below is derived from
     SIDE_MAX, not guessed: at 300 DPI sixty inches is 18,000 px and allowed, at 600 DPI the same
     sixty inches is 36,000 px and the control stops at forty. Past MP_WARN the card says so in
     the student's own language rather than letting a phone run out of canvas half way through a
     PDF of forty pages. */
  var SIDE_MAX = 24000;    /* px on one side: past this no canvas in this studio will draw the page */
  var MP_WARN  = 120;      /* megapixels: a phone's canvas gives out around here */
  var UNIT_SPAN = { "in":{ min:2,  max:60,   step:0.25 },
                    "cm":{ min:5,  max:150,  step:0.5  },
                    "mm":{ min:50, max:1500, step:1    },
                    "px":{ min:400,max:20000,step:20   } };

  function unitToPx(v, unit, dpi){
    if (unit === "px") return v;
    if (unit === "mm") return mmPx(v, dpi);
    if (unit === "cm") return mmPx(v*10, dpi);
    return v*dpi;
  }
  function pxToUnit(px, unit, dpi){
    if (unit === "px") return px;
    if (unit === "mm") return px/dpi*25.4;
    if (unit === "cm") return px/dpi*2.54;
    return px/dpi;
  }
  /* the largest number this unit may carry at this DPI without the page passing SIDE_MAX */
  function unitMax(unit, dpi){
    var span = UNIT_SPAN[unit] || UNIT_SPAN["in"];
    var ceil = pxToUnit(SIDE_MAX, unit, dpi);
    var m = Math.min(span.max, ceil);
    return Math.max(span.min, Math.round(m*100)/100);
  }
  /* THE FREE SIZE STARTS FROM WHAT IS ON SCREEN. Touching any control copies the size the
     student is looking at into DOC.custom and switches to it — the one thing the old card
     could not do, and the reason its 12 x 36 default was the first thing every student saw. */
  function seedCustom(){
    if (DOC.sizeId === "custom") return DOC.custom || (DOC.custom = { w:12, h:36, unit:"in", dpi:300 });
    var sz = curSize() || { w:8, h:12, unit:"in", dpi:300 };
    DOC.custom = { w: sz.w, h: sz.h, unit: sz.unit, dpi: sz.dpi || 300 };
    DOC.sizeId = "custom";
    return DOC.custom;
  }
  function customNow(){ return DOC.custom || (DOC.custom = { w:12, h:36, unit:"in", dpi:300 }); }

  function sizeCard(){
    var card = E("section","card"); card.id = "albSizeCard";
    card.appendChild(E("h2", null, L("alb_size_h")));
    var sz = curSize(), px = pagePx(sz), w = albWidth();

    /* what you are making, said once and said loud */
    var val = E("p","alb-value"); val.id = "albSizeVal";
    val.textContent = (sz.unit === "px") ? (sz.w + " \u00d7 " + sz.h + " px")
                                         : (trim(sz.w) + " \u00d7 " + trim(sz.h) + " " + sz.unit);
    card.appendChild(val);
    var sub = E("p","alb-sub"); sub.id = "albSizeNote";
    sub.textContent = sizeLine(sz, px);
    card.appendChild(sub);
    var warn = sizeWarning(px);
    if (warn){ var wn = E("p","alb-warn", warn); wn.id = "albSizeWarn"; card.appendChild(wn); }

    /* the presets, in even columns */
    card.appendChild(subh(L("alb_size_preset")));
    var gi, gchips = [];
    for (gi=0; gi<D.sizeGroups.length; gi++){
      (function(g){
        if (g.id === "custom") return;      /* 6.107.0 — the free size is a block of its own now */
        gchips.push(chip(pick9(g.label), (curGroup()===g.id), function(){ setGroup(g.id); }));
      })(D.sizeGroups[gi]);
    }
    var groups = grid("size", gchips, w); groups.id = "albGroups";
    card.appendChild(groups);

    var schips = [], i, gnow = curGroup();
    for (i=0;i<D.sizes.length;i++){
      if (D.sizes[i].group !== gnow) continue;
      (function(sp){
        var lbl = (sp.unit === "px") ? (sp.w + "\u00d7" + sp.h) : (trim(sp.w) + " \u00d7 " + trim(sp.h) + " " + sp.unit);
        schips.push(chip(lbl, DOC.sizeId === sp.id, function(){ DOC.sizeId = sp.id; onDocChange(true); }));
      })(D.sizes[i]);
    }
    var list = grid("size", schips, w); list.id = "albSizes";
    card.appendChild(list);

    /* the free size */
    card.appendChild(subh(L("alb_size_own")));
    card.appendChild(freeSize());
    return card;
  }
  function trim(n){ return (Math.round(n*100)/100) + ""; }
  /* 6.107.0 — "custom" is no longer one of the groups: it is the block under them. A document
     saved by an older version may still carry a size id of "custom", so the reader keeps it. */
  function curGroup(){
    if (DOC.sizeId === "custom") return DOC.customGroup || "portrait";
    var s = sizeById(DOC.sizeId);
    return s ? s.group : "spread";
  }
  function setGroup(id){
    var i; for (i=0;i<D.sizes.length;i++) if (D.sizes[i].group === id){ DOC.sizeId = D.sizes[i].id; break; }
    DOC.customGroup = id;
    onDocChange(true);
  }
  /* "10800 x 3600 px - 300 DPI - bleed 3 mm - gutter 5 mm" — everything the size decides that is
     not the size itself. The size's own numbers are the headline above this line, not part of it. */
  function sizeLine(sz, px){
    var parts = [];
    if (sz.unit !== "px") parts.push(px.w + " \u00d7 " + px.h + " px");
    parts.push(px.dpi + " DPI");
    parts.push(L("alb_bleed") + " " + D.bleedMm + " mm");
    if (sz.group === "spread") parts.push(L("alb_gutter") + " " + D.gutterMm + " mm");
    return parts.join(" \u00b7 ");
  }
  /* a page nobody's machine will finish is said so here, before forty of them are laid out */
  function sizeWarning(px){
    if (!px) return "";
    var mp = (px.w*px.h)/1000000;
    if (px.w > SIDE_MAX || px.h > SIDE_MAX)
      return L("alb_size_max").replace("{N}", String(SIDE_MAX));
    if (mp > MP_WARN)
      return L("alb_size_big").replace("{W}", String(px.w)).replace("{H}", String(px.h))
                              .replace("{M}", String(Math.round(mp)));
    return "";
  }

  /* THE FREE SIZE BLOCK. Two rows that each carry a number box and a rail over the same value —
     type it or drag it, whichever the student reaches for — then the unit, the DPI, a swap and a
     ratio lock. Every one of them seeds from the size on screen the first time it is touched. */
  function freeSize(){
    var box = E("div"); box.id = "albFree";
    var c = customNow(), on = (DOC.sizeId === "custom");
    var unit = on ? c.unit : (curSize().unit || "in");
    var dpi  = on ? (c.dpi||300) : (curSize().dpi||300);
    var span = UNIT_SPAN[unit] || UNIT_SPAN["in"];
    var lo = span.min, hi = unitMax(unit, dpi), step = span.step;
    var shown = on ? c : curSize();
    var cur = { w: clamp(shown.w, lo, hi), h: clamp(shown.h, lo, hi) };

    function commit(key, v){
      var k = seedCustom();
      var lim = unitMax(k.unit, k.dpi||300), sp = UNIT_SPAN[k.unit] || UNIT_SPAN["in"];
      var nv = clamp(v, sp.min, lim);
      if (DOC.lockRatio && (key === "w" || key === "h")){
        var other = (key === "w") ? "h" : "w";
        var ratio = (cur[other] > 0 && cur[key] > 0) ? (cur[other]/cur[key]) : 1;
        k[other] = clamp(Math.round(nv*ratio*100)/100, sp.min, lim);
      }
      k[key] = nv;
      onDocChange(true);
    }
    function dim(key, label){
      var row = E("div","alb-dim");
      row.appendChild(E("span","alb-dimlab", label));
      var n = document.createElement("input");
      n.type = "number"; n.id = "albFree" + key.toUpperCase(); n.className = "inp alb-num";
      n.value = trim(cur[key]); n.min = lo; n.max = hi; n.step = step;
      var r = document.createElement("input");
      r.type = "range"; r.id = "albRange" + key.toUpperCase(); r.className = "alb-rng";
      r.min = lo; r.max = hi; r.step = step; r.value = String(cur[key]);
      n.oninput = function(){ var v = parseFloat(n.value); if (isFinite(v)) commit(key, v); };
      r.oninput = function(){ var v = parseFloat(r.value); if (isFinite(v)) commit(key, v); };
      row.appendChild(n); row.appendChild(r);
      return row;
    }
    box.appendChild(dim("w", L("alb_width")));
    box.appendChild(dim("h", L("alb_height")));

    var opts = E("div","alb-opts"); opts.id = "albFreeOpts";
    var us = document.createElement("select"); us.id = "albCustomUnit"; us.className = "inp alb-sel";
    ["in","cm","mm","px"].forEach(function(u){
      var o = document.createElement("option"); o.value = u; o.textContent = u;
      if (unit === u) o.selected = true; us.appendChild(o);
    });
    /* CHANGING THE UNIT DOES NOT CHANGE THE PAGE. Eight inches asked for in centimetres is
       20.32 cm, not 8 cm — the numbers are converted through the pixels they already mean. */
    us.onchange = function(){
      var k = seedCustom(), old = k.unit, d = k.dpi || 300, nu = us.value;
      var pw = unitToPx(k.w, old, d), ph = unitToPx(k.h, old, d);
      var sp = UNIT_SPAN[nu] || UNIT_SPAN["in"], lim = unitMax(nu, d);
      k.unit = nu;
      k.w = clamp(Math.round(pxToUnit(pw, nu, d)*100)/100, sp.min, lim);
      k.h = clamp(Math.round(pxToUnit(ph, nu, d)*100)/100, sp.min, lim);
      onDocChange(true);
    };
    opts.appendChild(us);

    var dp = document.createElement("input");
    dp.type = "number"; dp.id = "albCustomDpi"; dp.className = "inp alb-dpi";
    dp.value = dpi; dp.min = 72; dp.max = 600; dp.step = 1;
    dp.title = "DPI";
    dp.oninput = function(){
      var v = parseFloat(dp.value); if (!isFinite(v)) return;
      var k = seedCustom();
      k.dpi = clamp(Math.round(v), 72, 600);
      var sp = UNIT_SPAN[k.unit] || UNIT_SPAN["in"], lim = unitMax(k.unit, k.dpi);
      k.w = clamp(k.w, sp.min, lim); k.h = clamp(k.h, sp.min, lim);
      onDocChange(true);
    };
    opts.appendChild(dp);
    opts.appendChild(E("span","mut","DPI"));

    var sw = E("button","chip", L("alb_swap")); sw.id = "albSwap";
    sw.onclick = function(){ var k = seedCustom(), t = k.w; k.w = k.h; k.h = t; onDocChange(true); };
    opts.appendChild(sw);

    var lk = E("button","chip" + (DOC.lockRatio ? " on" : ""), L("alb_lock")); lk.id = "albLock";
    lk.onclick = function(){ DOC.lockRatio = !DOC.lockRatio; onDocChange(false); };
    opts.appendChild(lk);

    box.appendChild(opts);
    var note = E("p","mut", L("alb_size_own_note").replace("{N}", String(SIDE_MAX)));
    note.id = "albFreeNote";
    box.appendChild(note);
    return box;
  }

  /* ---- the page rail ---- */
  function pagesCard(){
    var card = E("section","card"); card.id = "albPagesCard";
    card.appendChild(E("h2", null, L("alb_pages_h")));
    var rail = E("div","alb-rail"); rail.id = "albRail";
    var i;
    for (i=0;i<DOC.pages.length;i++){
      (function(idx){
        var cell = E("div","alb-pagecell" + (idx === DOC.cur ? " on" : ""));
        cell.setAttribute("data-page", String(idx));
        var cv = document.createElement("canvas");
        cv.className = "alb-thumb"; cv.id = "albThumb_" + idx;
        cv.width = THUMB_W; cv.height = 1;
        cell.appendChild(cv);
        var n = E("span","alb-pagenum", String(idx+1)); cell.appendChild(n);
        cell.onclick = function(){ DOC.cur = idx; onDocChange(false); };
        if (DOC.pages.length > 1){
          var x = E("button","alb-pagex","✕");
          x.id = "albPageX_" + idx;
          x.title = L("alb_page_del");
          x.onclick = function(ev){
            ev.stopPropagation();
            DOC.pages.splice(idx,1);
            DOC.cur = clamp(DOC.cur, 0, DOC.pages.length-1);
            onDocChange(false);
            H.toast(L("alb_page_gone"), "ok");
          };
          cell.appendChild(x);
        }
        rail.appendChild(cell);
      })(i);
    }
    card.appendChild(rail);
    /* 6.107.0 — these four were a wrapping row of their own natural widths: 160, 85, 111 and
       132 px, breaking 3 + 1. One rail, one width. */
    var add = E("button","btn","+ " + L("alb_page_add")); add.id = "albPageAdd";
    add.onclick = function(){ DOC.pages.push(blankPage()); DOC.cur = DOC.pages.length-1; onDocChange(false); };
    var dup = E("button","btn", L("alb_page_dup")); dup.id = "albPageDup";
    dup.onclick = function(){
      var src = curPage();
      DOC.pages.splice(DOC.cur+1, 0, JSON.parse(JSON.stringify(src)));
      DOC.cur += 1; onDocChange(false);
    };
    var close = E("button","btn", L("alb_close_add")); close.id = "albPageClose";
    close.onclick = function(){ DOC.pages.push(closingPage()); DOC.cur = DOC.pages.length-1; onDocChange(false); };
    var sh = E("button","btn", L("alb_shuffle")); sh.id = "albShuffle";
    sh.onclick = function(){
      var n = shuffleAlbum(Math.random);
      H.toast(n ? L("alb_shuffle_done").replace("{N}", String(n)) : L("alb_layout_none"), n ? "ok" : "");
    };
    var prow = grid("btn", [add, dup, close, sh], albWidth()); prow.id = "albPageOps";
    card.appendChild(prow);
    return card;
  }

  /* ---- the stage ---- */
  function stageCard(){
    var card = E("section","card"); card.id = "albStageCard";
    card.appendChild(E("h2", null, L("alb_stage_h")));
    var box = E("div","alb-stage"); box.id = "albStage";
    var cv = null;
    if (DOC.view === "book"){
      /* 6.121.0 — THE BOOK. Every page at once, laid as the book falls (the opener alone on the
         right, then facing pairs), each with its number and three small buttons: open it,
         design it again, delete it. A tap on the page itself opens it. */
      box.appendChild(bookView());
    } else if (DOC.view === "3d"){
      /* 6.125.0 wave I — the mockup: the open spread as a book on a table, or a standee on its base */
      var c3 = document.createElement("canvas"); c3.id = "albCanvas3d"; c3.className = "alb-canvas alb-canvas3d"; c3.width = 8; c3.height = 8;
      box.appendChild(c3);
    } else {
      cv = document.createElement("canvas"); cv.id = "albCanvas"; cv.className = "alb-canvas";
      cv.width = 8; cv.height = 8;
      box.appendChild(cv);
    }
    card.appendChild(box);
    if (DOC.view === "3d") view3dOps(card);                  /* 6.125.0 wave I */
    /* 6.107.0 — the note used to ride in the same flex row as the two chips and dropped under
       them as a third "column" at every width, computer included. It is a sentence: it gets
       its own line, and the chips get a rail. */
    var g = E("button","chip" + (DOC.guides ? " on" : ""), L("alb_guides")); g.id = "albGuides";
    g.onclick = function(){ DOC.guides = !DOC.guides; onDocChange(false); };
    var sp = E("button","chip" + (DOC.view === "spread" ? " on" : ""), L("alb_spread")); sp.id = "albSpread";
    sp.onclick = function(){ DOC.view = (DOC.view === "spread") ? "page" : "spread"; onDocChange(false); };
    /* 6.121.0 — the third view, and the two history buttons */
    var bk = E("button","chip" + (DOC.view === "book" ? " on" : ""), L("alb_book")); bk.id = "albBook";
    bk.onclick = function(){ DOC.view = (DOC.view === "book") ? "page" : "book"; onDocChange(false); };
    /* 6.125.0 wave I — the fourth view: the mockup */
    var d3 = E("button","chip" + (DOC.view === "3d" ? " on" : ""), L("alb_3d")); d3.id = "alb3d";
    d3.onclick = function(){ DOC.view = (DOC.view === "3d") ? "page" : "3d"; onDocChange(false); };
    var row = grid("size", [sp, bk, d3, g], albWidth()); row.id = "albStageOps";
    card.appendChild(row);
    var un = E("button","btn", "\u21b6 " + L("alb_undo")); un.id = "albUndo"; un.type = "button"; un.disabled = !HIST.length;
    un.onclick = function(){ undo(); };
    var re = E("button","btn", "\u21b7 " + L("alb_redo")); re.id = "albRedo"; re.type = "button"; re.disabled = !REDO.length;
    re.onclick = function(){ redo(); };
    var hrow = grid("btn", [un, re], albWidth()); hrow.id = "albHistory";
    card.appendChild(hrow);
    /* 6.110.0 — the adjusting rail. It is refilled in place by fillSelBar() whenever the
       selection or one of its numbers changes, and it is built here so it sits directly under
       the picture it is talking about. */
    card.appendChild(issuesBar());                           /* 6.125.0 wave I — "sheet 3 of 12 · 1 issue · fix this sheet" */
    var selbox = E("div", null); selbox.id = "albSelBox";
    card.appendChild(selbox);
    SELBOX = selbox;
    var tnote = E("p","mut", L("alb_touch_note")); tnote.id = "albTouchNote";
    card.appendChild(tnote);
    var note = E("p","mut", L("alb_guides_note")); note.id = "albGuidesNote";
    card.appendChild(note);
    if (cv) bindStage(cv);
    fillSelBar();
    return card;
  }
  /* ---- the book (6.121.0, wave F) ---- */
  var BOOK_MAX = 420;      /* one page of the book never draws wider than this on a monitor */
  function bookPageW(){
    var w = albWidth();
    return Math.max(120, Math.min(BOOK_MAX, Math.floor((w - 40) / 2)));
  }
  function bookView(){
    var book = E("div","alb-book"); book.id = "albBook";
    var n = DOC.pages.length, i, row = null, pw = bookPageW();
    function pageCell(idx){
      var cell = E("div","alb-bookpage" + (idx === DOC.cur ? " on" : ""));
      cell.setAttribute("data-page", String(idx));
      cell.style.width = pw + "px";
      var cv = document.createElement("canvas"); cv.className = "alb-bookcv"; cv.id = "albBook_" + idx;
      cv.width = pw; cv.height = 1;
      cv.onclick = function(){ DOC.cur = idx; DOC.view = "page"; onDocChange(false); };
      cell.appendChild(cv);
      var lab = E("div","alb-booklab");
      lab.appendChild(E("span","alb-booknum", String(idx+1)));
      var ops = E("span","alb-bookops");
      var ed = E("button","alb-bookbtn","\u270e"); ed.type = "button"; ed.title = L("alb_book_edit"); ed.setAttribute("aria-label", L("alb_book_edit")); ed.id = "albBookEdit_" + idx;
      ed.onclick = function(){ DOC.cur = idx; DOC.view = "page"; onDocChange(false); };
      var rd = E("button","alb-bookbtn","\u2726"); rd.type = "button"; rd.title = L("alb_redesign"); rd.setAttribute("aria-label", L("alb_redesign")); rd.id = "albBookDesign_" + idx;
      rd.onclick = function(){
        if (idx === 0){ H.toast(L("alb_design_opener"), ""); return; }
        if (!DOC.pages[idx].photos.length){ H.toast(L("alb_design_none"), ""); return; }
        designPage(DOC.pages[idx], idx, { next: hasDesign(DOC.pages[idx]) }); onDocChange(false);
      };
      ops.appendChild(ed); ops.appendChild(rd);
      if (n > 1){
        var dl = E("button","alb-bookbtn","\u2715"); dl.type = "button"; dl.title = L("alb_page_del"); dl.setAttribute("aria-label", L("alb_page_del")); dl.id = "albBookDel_" + idx;
        dl.onclick = function(){ DOC.pages.splice(idx,1); DOC.cur = clamp(DOC.cur, 0, DOC.pages.length-1); onDocChange(false); H.toast(L("alb_page_gone"), "ok"); };
        ops.appendChild(dl);
      }
      lab.appendChild(ops);
      cell.appendChild(lab);
      return cell;
    }
    function blank(){ var b = E("div","alb-bookpage blank"); b.style.width = pw + "px"; return b; }
    /* the opener alone on the right; then facing pairs; an even count ends alone on the left */
    row = E("div","alb-bookrow"); row.appendChild(blank()); row.appendChild(pageCell(0)); book.appendChild(row);
    for (i=1;i<n;i+=2){
      row = E("div","alb-bookrow");
      row.appendChild(pageCell(i));
      if (i+1 < n) row.appendChild(pageCell(i+1)); else row.appendChild(blank());
      book.appendChild(row);
    }
    return book;
  }
  function drawBook(px){
    var i, pw = bookPageW();
    for (i=0;i<DOC.pages.length;i++){
      (function(idx){
        var cv = document.getElementById("albBook_" + idx);
        if (!cv) return;
        drawPage(cv, DOC.pages[idx], idx, { scale: pw / px.w, guides: false });
      })(i);
    }
  }

  /* ---- the photos ---- */
  function photosCard(){
    var card = E("section","card"); card.id = "albPhotosCard";
    var pg = curPage();
    card.appendChild(E("h2", null, L("alb_photos_h") + " · " + pg.photos.length + " / " + pageMax(pg)));   /* 6.125.0 — eight from a template */
    var strip = E("div","alb-strip"); strip.id = "albStrip";
    var i;
    for (i=0;i<pg.photos.length;i++){
      (function(idx){
        var ph = pg.photos[idx];
        var t = E("div","alb-tile"); t.setAttribute("data-photo", String(idx));
        var im = document.createElement("img"); im.className = "alb-tileimg";
        im.alt = ""; im.src = ph.src; t.appendChild(im);
        var x = E("button","alb-tilex","✕"); x.id = "albPhotoX_" + idx;
        x.onclick = function(ev){ ev.stopPropagation(); pg.photos.splice(idx,1); onDocChange(false); };
        t.appendChild(x);
        if (idx > 0){
          var lft = E("button","alb-tilemv","‹"); lft.id = "albPhotoL_" + idx;
          lft.onclick = function(ev){
            ev.stopPropagation();
            var tmp = pg.photos[idx-1]; pg.photos[idx-1] = pg.photos[idx]; pg.photos[idx] = tmp;
            onDocChange(false);
          };
          t.appendChild(lft);
        }
        strip.appendChild(t);
      })(i);
    }
    card.appendChild(strip);
    var row = E("div","row");
    var add = E("button","btn btn-gold grow","+ " + L("alb_photo_add")); add.id = "albAddPhotos";
    add.onclick = function(){ PICK_MODE = "page"; if (H && typeof H.pickFiles === "function") H.pickFiles(); };
    row.appendChild(add);
    /* the phone's own picker is laid over the button every time it is drawn — the module
       rebuilds this card on each change, so a one-shot wire at boot would last one render
       (the 6.23.1 Redmi rule, which only holds if the overlay follows the button) */
    if (H && typeof H.wirePick === "function") { try { H.wirePick(add, function(){ PICK_MODE = "page"; }); } catch(e){} }
    card.appendChild(row);
    if (pg.photos.length >= pageMax(pg)){
      card.appendChild(E("p","mut", L("alb_photo_full")));
    }
    /* 6.121.0 wave F — THE TRAY. Every photograph in the album, each with the number of pages it
       is on (a photograph on none is dimmed), so a picture used twice or never is seen before the
       book is printed. A tap puts it into the selected frame, or onto this page; ✕ takes it off
       every page and out of the tray; the two buttons add to the album without placing, and clear
       what is on no page. */
    card.appendChild(subh(L("alb_tray_h") + " \u00b7 " + DOC.pool.length + " / " + MAXA));
    var tray = E("div","alb-strip alb-tray"); tray.id = "albTray";
    var u = usage(), ti;
    if (!DOC.pool.length) tray.appendChild(E("p","mut alb-trayempty", L("alb_tray_empty")));
    for (ti=0; ti<DOC.pool.length; ti++){
      (function(idx){
        var ph = DOC.pool[idx], n = (u[ph.src] || []).length;
        var t = E("div","alb-tile alb-traytile" + (n ? "" : " unused"));
        t.id = "albTray_" + idx; t.setAttribute("data-tray", String(idx));
        t.setAttribute("role","button"); t.tabIndex = 0;
        t.title = L("alb_used_on").replace("{N}", String(n));
        t.setAttribute("aria-label", L("alb_used_on").replace("{N}", String(n)));
        var im = document.createElement("img"); im.className = "alb-tileimg"; im.alt = ""; im.src = ph.src; t.appendChild(im);
        t.appendChild(E("span","alb-badge" + (n ? "" : " zero"), String(n)));
        var x = E("button","alb-tilex","\u2715"); x.type = "button"; x.id = "albTrayX_" + idx; x.title = L("alb_tray_x");
        x.onclick = function(ev){
          ev.stopPropagation();
          (n ? askP(L("alb_tray_remove_q").replace("{N}", String(n))) : Promise.resolve(true)).then(function(ok){
            if (!ok) return;
            removeEverywhere(ph.src);
            H.toast(L("alb_tray_removed"), "ok");
          });
        };
        t.appendChild(x);
        t.onclick = function(){ placeFromTray(idx); };
        t.onkeydown = function(ev){ if (ev.key === "Enter" || ev.key === " "){ ev.preventDefault(); placeFromTray(idx); } };
        tray.appendChild(t);
      })(ti);
    }
    card.appendChild(tray);
    var tadd = E("button","btn","+ " + L("alb_tray_add")); tadd.id = "albTrayAdd";
    tadd.onclick = function(){ PICK_MODE = "pool"; if (H && typeof H.pickFiles === "function") H.pickFiles(); };
    if (H && typeof H.wirePick === "function") { try { H.wirePick(tadd, function(){ PICK_MODE = "pool"; }); } catch(e2){} }
    var tun = E("button","btn", L("alb_tray_unused")); tun.id = "albTrayUnused";
    tun.onclick = function(){
      var k = removeUnused();
      H.toast(k ? L("alb_tray_unused_done").replace("{N}", String(k)) : L("alb_tray_none_unused"), k ? "ok" : "");
    };
    var trow = grid("btn", [tadd, tun], albWidth()); trow.id = "albTrayOps";
    card.appendChild(trow);
    var tn = E("p","mut", L("alb_tray_note")); tn.id = "albTrayNote";
    card.appendChild(tn);
    /* 6.122.0 wave G — how many pixels each photograph is kept at */
    card.appendChild(subh(L("alb_qual_h")));
    var qs = chip(L("alb_qual_std").replace("{N}", String(PHOTO_MAX.std)), QUALITY === "std", function(){ setQuality("std"); });
    qs.id = "albQual_std";
    var qp = chip(L("alb_qual_print").replace("{N}", String(PHOTO_MAX.print)), QUALITY === "print", function(){ setQuality("print"); });
    qp.id = "albQual_print";
    var qrow = grid("size", [qs, qp], albWidth()); qrow.id = "albQuality";
    card.appendChild(qrow);
    var qn = E("p","mut", L("alb_qual_note").replace("{N}", String(PHOTO_MAX.print))); qn.id = "albQualNote";
    card.appendChild(qn);
    return card;
  }
  /* ======================= THE SHELF (6.122.0, wave G) =======================

     An album designer keeps projects, and a studio has several on the go: the wedding being
     laid out, the newborn session waiting for its last pictures, the graduation from last month
     a customer wants one more copy of. Every album is its own record in the store; the shelf is
     the strip of them across the top of the page, the open one ringed in gold, each with the
     opener drawn small, its name and its counts. */
  function shelfCard(){
    var card = E("section","card"); card.id = "albShelfCard";
    card.appendChild(E("h2", null, L("alb_shelf_h") + " \u00b7 " + (SHELF ? SHELF.items.length : 0) + " / " + SHELF_MAX));
    var strip = E("div","alb-strip alb-shelf"); strip.id = "albShelf";
    card.appendChild(strip);
    var w = albWidth();
    var nw = E("button","btn btn-gold","+ " + L("alb_shelf_new")); nw.id = "albShelfNew"; nw.onclick = function(){ newAlbum(); };
    var dp = E("button","btn", L("alb_shelf_dup")); dp.id = "albShelfDup"; dp.onclick = function(){ duplicateAlbum(); };
    var rn = E("button","btn", L("alb_shelf_ren")); rn.id = "albShelfRen";
    rn.onclick = function(){
      var row = document.getElementById("albShelfNameRow"); if (!row) return;
      var open = (row.style.display === "none");
      row.style.display = open ? "" : "none";
      if (open){ var inp = document.getElementById("albShelfName"); if (inp){ try { inp.focus(); inp.select(); } catch(e){} } }
    };
    var dl = E("button","btn", L("alb_shelf_del")); dl.id = "albShelfDel"; dl.onclick = function(){ deleteAlbum(); };
    var ops = grid("btn", [nw, dp, rn, dl], w); ops.id = "albShelfOps";
    card.appendChild(ops);
    var nrow = E("div","row"); nrow.id = "albShelfNameRow"; nrow.style.display = "none";
    var inp = document.createElement("input"); inp.type = "text"; inp.className = "inp grow"; inp.id = "albShelfName";
    inp.maxLength = SHELF_NAME_MAX; inp.placeholder = L("alb_shelf_name"); inp.setAttribute("aria-label", L("alb_shelf_name"));
    inp.value = (SHELF && shelfItem(SHELF.cur) && shelfItem(SHELF.cur).name) || "";
    var sv = E("button","btn btn-gold", L("alb_shelf_save")); sv.id = "albShelfSave"; sv.type = "button";
    sv.onclick = function(){ renameAlbum(inp.value); nrow.style.display = "none"; H.toast(L("alb_shelf_renamed"), "ok"); };
    inp.onkeydown = function(ev){ if (ev.key === "Enter"){ ev.preventDefault(); sv.onclick(); } };
    nrow.appendChild(inp); nrow.appendChild(sv);
    card.appendChild(nrow);
    var note = E("p","mut", L("alb_shelf_note")); note.id = "albShelfNote";
    card.appendChild(note);
    paintShelf(strip);
    return card;
  }
  /* the tiles, refilled in place when a name or a picture changes — never a render */
  function paintShelf(strip){
    strip = strip || ((typeof document !== "undefined") && document.getElementById("albShelf"));
    if (!strip || !SHELF) return;
    strip.innerHTML = "";
    var i;
    for (i=0;i<SHELF.items.length;i++){
      (function(it){
        var on = (it.id === SHELF.cur);
        var t = E("div","alb-tile alb-shelftile" + (on ? " on" : "")); t.id = "albShelf_" + it.id;
        t.setAttribute("role","button"); t.tabIndex = 0; t.setAttribute("aria-pressed", on ? "true" : "false");
        var pic = E("div","alb-shelfpic");
        if (it.thumb){ var im = document.createElement("img"); im.className = "alb-tileimg"; im.alt = ""; im.src = it.thumb; pic.appendChild(im); }
        t.appendChild(pic);
        t.appendChild(E("span","alb-shelfname", albumName(it)));
        t.appendChild(E("span","alb-shelfmeta", L("alb_shelf_meta").replace("{P}", String(it.pages||1)).replace("{N}", String(it.photos||0))));
        t.onclick = function(){ openAlbum(it.id); };
        t.onkeydown = function(ev){ if (ev.key === "Enter" || ev.key === " "){ ev.preventDefault(); openAlbum(it.id); } };
        strip.appendChild(t);
      })(SHELF.items[i]);
    }
  }
  /* ======================= THE ORNAMENTS (6.122.0, wave G) =======================

     The reference program drops clip-art on a page from a side panel. Here: six families of
     four, each a mask the page tints, filtered by family, one tap to place; and under them the
     five overlays, a texture over the whole page at one of three strengths, with a button that
     lays the same one on every page. */
  function ornCard(){
    var card = E("section","card"); card.id = "albOrnCard";
    card.appendChild(E("h2", null, L("alb_orn_h")));
    var w = albWidth(), pg = curPage(), i;
    var fams = [chip(L("alb_orn_all"), !ORN_FAM, function(){ ORN_FAM = ""; render(); })];
    fams[0].id = "albOrnFam_all";
    for (i=0;i<ORN_FAMS.length;i++){
      (function(f){
        var b = chip(L("alb_orn_fam_" + f), ORN_FAM === f, function(){ ORN_FAM = (ORN_FAM === f) ? "" : f; render(); });
        b.id = "albOrnFam_" + f; fams.push(b);
      })(ORN_FAMS[i]);
    }
    var frow = grid("size", fams, w); frow.id = "albOrnFams"; card.appendChild(frow);
    var tiles = [];
    for (i=0;i<ORN.length;i++){
      (function(o){
        if (ORN_FAM && o.fam !== ORN_FAM) return;
        var b = E("button","chip alb-orntile",""); b.id = "albOrn_" + o.id; b.type = "button";
        b.title = ornLabel(o.id); b.setAttribute("aria-label", ornLabel(o.id));
        var im = document.createElement("img"); im.className = "alb-ornimg"; im.alt = ""; im.src = ornSrc(o.id);
        b.appendChild(im);
        b.onclick = function(){ addOrnament(o.id); };
        tiles.push(b);
      })(ORN[i]);
    }
    var trow = grid("tpl", tiles, w); trow.id = "albOrns"; card.appendChild(trow);
    card.appendChild(E("p","mut", L("alb_orn_note")));
    /* the overlays */
    card.appendChild(subh(L("alb_ovl_h")));
    var cur = (pg.overlay && pg.overlay.id) || "";
    var oc = [chip(L("alb_ovl_none"), !cur, function(){ setOverlay("", ""); })];
    oc[0].id = "albOvl_none";
    for (i=0;i<OVL.length;i++){
      (function(ov){
        var b = chip(L("alb_ovl_" + ov.id), cur === ov.id, function(){ setOverlay(ov.id, pg.overlay && pg.overlay.amount); });
        b.id = "albOvl_" + ov.id; oc.push(b);
      })(OVL[i]);
    }
    var orow = grid("size", oc, w); orow.id = "albOvls"; card.appendChild(orow);
    if (cur){
      var ac = [];
      for (i=0;i<OVL_AMTS.length;i++){
        (function(a){
          var b = chip(L("alb_ovl_" + a), (pg.overlay.amount || "medium") === a, function(){ setOverlay(cur, a); });
          b.id = "albOvlAmt_" + a; ac.push(b);
        })(OVL_AMTS[i]);
      }
      var arow = grid("size", ac, w); arow.id = "albOvlAmts"; card.appendChild(arow);
    }
    var all = E("button","btn", L("alb_ovl_all")); all.id = "albOvlAll";
    all.onclick = function(){ var n = overlayAll(); H.toast(L("alb_ovl_all_done").replace("{P}", String(n)), "ok"); };
    var alrow = grid("btn", [all], w); alrow.id = "albOvlOps"; card.appendChild(alrow);
    card.appendChild(E("p","mut", L("alb_ovl_note")));
    marksSection(card);                                      /* 6.125.0 wave I — the date blocks, the monograms and the studio's logo */
    return card;
  }

  /* ---- the layout chips ---- */
  function layoutCard(){
    var card = E("section","card"); card.id = "albLayoutCard";
    var pg = curPage();
    card.appendChild(E("h2", null, L("alb_layout_h")));
    if (pg.lib && libTpl(pg)){
      /* 6.125.0 wave I — this page is laid from a template: its frames are its layout, and a layout may take it back */
      var recL = libRec(pg.lib), itm = null, ai, allI = libItems(); for (ai=0; ai<allI.length; ai++) if (allI[ai].id === pg.lib) itm = allI[ai];
      var lfrom = E("p","alb-selname", L("alb_lib_from").replace("{A}", (itm && itm.name) || pg.lib).replace("{N}", String(recL.frames.length))); lfrom.id = "albLayoutLib";
      card.appendChild(lfrom);
      var off = E("button","btn", L("alb_lib_clear")); off.type = "button"; off.id = "albLayoutClearLib"; off.onclick = function(){ clearLib(); };
      var offrow = grid("btn", [off], albWidth()); offrow.id = "albLayoutLibOps"; card.appendChild(offrow);
      return card;
    }
    if (!pg.photos.length){
      card.appendChild(E("p","mut", L("alb_layout_none")));
      return card;
    }
    var w = albWidth();
    /* 6.106.0 — off the safe area and over the trim. The one switch that decides whether a
       photograph on this page stops 3 mm short of the paper's edge or runs off it. */
    var bb = E("button","chip" + (pg.bleed ? " on" : ""), L("alb_edge")); bb.id = "albBleed";
    bb.onclick = function(){ pg.bleed = !pg.bleed; onDocChange(true); };
    /* 6.107.0 — Auto rides WITH the edge switch, not inside the template rail. It is a mode,
       not a layout; and in Burmese its word is 71 px wide, which did not fit the 61 px cell a
       rail of template drawings earns on a 340 px panel. */
    var au = E("button","chip" + (pg.auto ? " on" : ""), L("alb_auto")); au.id = "albAuto";
    au.onclick = function(){ pg.auto = true; onDocChange(false); };
    var bl = grid("btn", [au, bb], w); bl.id = "albLayoutModes";
    card.appendChild(bl);
    var bn = E("p","mut", L("alb_edge_note")); bn.id = "albBleedNote";
    card.appendChild(bn);
    var n = clamp(pg.photos.length, 1, MAXP);
    card.appendChild(subh(L("alb_layout_pick").replace("{N}", String(n))));
    var chips = [];
    var all = tplsFor(n), list = [], i, fams = [], fi;
    /* 6.121.0 — THE FAMILY FILTER. Thirteen layouts for four photographs is a wall; the video's
       picker sorts its layouts by kind. One chip per family this count offers, All first; a
       family the count does not have is simply not offered, and a filter that would leave the
       rail empty is dropped rather than shown empty. A view preference, never saved. */
    for (i=0;i<all.length;i++) if (fams.indexOf(all[i].fam) < 0) fams.push(all[i].fam);
    if (TPL_FILTER && fams.indexOf(TPL_FILTER) < 0) TPL_FILTER = "";
    for (i=0;i<all.length;i++) if (!TPL_FILTER || all[i].fam === TPL_FILTER) list.push(all[i]);
    if (fams.length > 1){
      var fchips = [chip(L("alb_tpl_all"), !TPL_FILTER, function(){ TPL_FILTER = ""; render(); })];
      fchips[0].id = "albTplFam_all";
      for (fi=0; fi<fams.length; fi++){
        (function(fam){
          var fb = chip(pick9(D.fams[fam] || {}) || fam, TPL_FILTER === fam, function(){ TPL_FILTER = (TPL_FILTER === fam) ? "" : fam; render(); });
          fb.id = "albTplFam_" + fam;
          fchips.push(fb);
        })(fams[fi]);
      }
      var frow = grid("size", fchips, w); frow.id = "albTplFams";
      card.appendChild(frow);
    }
    for (i=0;i<list.length;i++){
      (function(t){
        var b = E("button","chip alb-tpl" + ((!pg.auto && pg.tplId === t.id) ? " on" : ""), "");
        b.id = "albTpl_" + t.id;
        b.title = pick9(D.fams[t.fam] || {}) || t.fam;
        b.appendChild(tplSketch(t, pg));
        b.onclick = function(){ pg.auto = false; pg.tplId = t.id; onDocChange(false); };
        chips.push(b);
      })(list[i]);
    }
    var row = grid("tpl", chips, w); row.id = "albTpls";
    card.appendChild(row);
    var tpl = pageTpl(pg, DOC.cur);
    /* 6.107.0 — THIS LINE USED TO PRINT A TEMPLATE ID. The owner photographed it reading
       "6 + 7 - f4d": the family's name, then the identifier this build happens to use for the
       template inside it, printed to a student as if it meant something. It is a debugging
       aid, and it is gone; what belongs here is the family's name, how many photographs the
       layout holds, and whether the page picked it or the student did. */
    var note = E("p","mut"); note.id = "albLayoutNote";
    note.textContent = tpl
      ? (pick9(D.fams[tpl.fam] || {}) + " \u00b7 " +
         L("alb_layout_of").replace("{N}", String(tpl.cells.length)) + " \u00b7 " +
         (pg.auto ? L("alb_auto") : L("alb_layout_yours")))
      : "";
    card.appendChild(note);
    return card;
  }
  /* A TEMPLATE CHIP IS A DRAWING OF ITS OWN CELLS — the only honest label a layout has.
     6.107.0 cuts it at 88 x 52 (twice the 44 x 26 of wave A) with a gap between the cells and
     a hairline frame around the page, so a cell up to 92 px wide gets a drawing rather than a
     doubled-up blur, and six of them beside each other read as six different layouts. */
  /* 6.121.0 — AND WITH THE PAGE'S OWN PHOTOGRAPHS IN IT. Handed the page, each cell is drawn
     with the photograph that would land there (the same cover crop and the same look the stage
     would give it) — so the rail is thirteen previews of THIS spread rather than thirteen
     diagrams. A photograph not yet decoded is drawn gold and the sketch is painted again when it
     arrives; with no page (the tests, the occasion chips) the drawing is wave A's. */
  function tplSketch(t, pg){
    var cv = document.createElement("canvas");
    cv.className = "alb-sketch"; cv.width = 88; cv.height = 52;
    var x = cv.getContext("2d"); if (!x) return cv;
    var photos = (pg && pg.photos) || [], pending = false;
    function paint(){
      x.fillStyle = (pg && DOC && DOC.paper) || "#ffffff"; x.fillRect(0,0,88,52);
      var i;
      for (i=0;i<t.cells.length;i++){
        var c = t.cells[i];
        var dx = Math.round(c.x*88) + 1, dy = Math.round(c.y*52) + 1, dw = Math.max(2, Math.round(c.w*88) - 2), dh = Math.max(2, Math.round(c.h*52) - 2);
        var ph = photos[i], im = ph ? IMGS[ph.src] : null;
        if (im && ph){
          var a = ph.anchor || { x:0.5, y:0.5 };
          var fit = coverFit(im.naturalWidth||im.width, im.naturalHeight||im.height, dw, dh, a.x, a.y, ph.zoom);
          if (fit){ drawPhotoFx(x, im, fit, dx, dy, dw, dh, ph.fx); continue; }
        }
        x.fillStyle = "#c9a227"; x.fillRect(dx, dy, dw, dh);
        if (ph && !im && !pending){ pending = true; imgFor(ph.src).then(function(){ pending = false; paint(); }); }
      }
    }
    paint();
    return cv;
  }

  /* ---- the design (6.121.0, wave F) ---- */
  /* One card for the decisions the reference video makes with a theme picker: the STYLE the
     story lines are set in, the PAPER, how FULL the pages run, whether the opener is a COVER,
     and the engine's four verbs — this page, every page, the next story set, clear. */
  var PAPER_NAMES = ["white", "cream", "black"];
  function designCard(){
    var card = E("section","card"); card.id = "albDesignCard";
    card.appendChild(E("h2", null, L("alb_design_h")));
    var w = albWidth(), pg = curPage(), i;
    card.appendChild(subh(L("alb_style")));
    var sc = [];
    for (i=0;i<STYLES.length;i++){
      (function(st){
        var b = chip(L("alb_style_" + st), DOC.style === st, function(){ DOC.style = st; if (anyDesign()) designAll(); else onDocChange(false); });
        b.id = "albStyle_" + st; sc.push(b);
      })(STYLES[i]);
    }
    var srow = grid("size", sc, w); srow.id = "albStyles"; card.appendChild(srow);
    card.appendChild(subh(L("alb_paper")));
    var pc = [];
    for (i=0;i<PAPERS.length;i++){
      (function(p, nm){
        var b = chip("", DOC.paper === p, function(){ DOC.paper = p; if (anyDesign()) designAll(); else onDocChange(false); });
        b.id = "albPaper_" + nm; b.className += " alb-paperchip";
        var sw = E("span","alb-swatch"); sw.style.backgroundColor = p; b.appendChild(sw);
        b.appendChild(E("span", null, L("alb_paper_" + nm)));
        pc.push(b);
      })(PAPERS[i], PAPER_NAMES[i] || ("p" + i));
    }
    var prow = grid("size", pc, w); prow.id = "albPapers"; card.appendChild(prow);
    card.appendChild(subh(L("alb_density")));
    var dc = [];
    for (i=0;i<DENSITIES.length;i++){
      (function(d){
        var b = chip(L("alb_density_" + d), DOC.density === d, function(){
          DOC.density = d;
          var k = relayAlbum();
          if (k) H.toast(L("alb_relay_done").replace("{P}", String(k)), "ok"); else onDocChange(false);
        });
        b.id = "albDensity_" + d; dc.push(b);
      })(DENSITIES[i]);
    }
    var drow = grid("size", dc, w); drow.id = "albDensities"; card.appendChild(drow);
    var cov = E("button","chip" + (DOC.cover ? " on" : ""), L("alb_cover")); cov.id = "albCover";
    cov.onclick = function(){ DOC.cover = !DOC.cover; if (DOC.cover) coverDesign(DOC.pages[0]); else uncover(DOC.pages[0]); onDocChange(true); };
    var relay = E("button","btn", L("alb_relay")); relay.id = "albRelay";
    relay.onclick = function(){ var k = relayAlbum(); H.toast(k ? L("alb_relay_done").replace("{P}", String(k)) : L("alb_layout_none"), k ? "ok" : ""); };
    var crow = grid("btn", [cov, relay], w); crow.id = "albDesignModes"; card.appendChild(crow);
    card.appendChild(subh(L("alb_story")));
    var d1 = E("button","btn btn-gold", L("alb_design_page")); d1.id = "albDesignPage";
    d1.onclick = function(){
      if (DOC.cur === 0){ H.toast(L("alb_design_opener"), ""); return; }
      if (!pg.photos.length){ H.toast(L("alb_design_none"), ""); return; }
      designPage(pg, DOC.cur); onDocChange(false);
    };
    var d2 = E("button","btn btn-gold", L("alb_design_all")); d2.id = "albDesignAll";
    d2.onclick = function(){ var k = designAll(); H.toast(k ? L("alb_design_done").replace("{P}", String(k)) : L("alb_design_none"), k ? "ok" : ""); };
    var d3 = E("button","btn", L("alb_story_next")); d3.id = "albStoryNext";
    d3.onclick = function(){
      if (DOC.cur === 0){ H.toast(L("alb_design_opener"), ""); return; }
      if (!pg.photos.length){ H.toast(L("alb_design_none"), ""); return; }
      designPage(pg, DOC.cur, { next: true }); onDocChange(false);
    };
    var d4 = E("button","btn", L("alb_design_clear")); d4.id = "albDesignClear";
    d4.onclick = function(){ clearDesign(pg); pg.story = -1; onDocChange(false); };
    var dr = grid("btn", [d1, d2, d3, d4], w); dr.id = "albDesignOps"; card.appendChild(dr);
    var note = E("p","mut"); note.id = "albDesignNote";
    var st = (pg.story >= 0) ? storyFor(DOC.occ, pg.story) : null;
    note.textContent = L("alb_design_note") + (st ? (" \u00b7 " + L("alb_story_of").replace("{A}", String(st.idx+1)).replace("{B}", String(st.count)) + " \u00b7 " + pick9(st.headline)) : "");
    card.appendChild(note);
    bgSection(card);                                         /* 6.125.0 wave I — the sheet's background photograph */
    return card;
  }
  /* ---- the print check (6.121.0, wave F) ---- */
  function checkLine(f){
    return L("alb_check_" + f.kind).replace("{P}", String(f.page+1)).replace("{N}", String((f.i|0)+1))
                                    .replace("{D}", String(f.ppi || "")).replace("{Q}", String((f.other|0)+1));
  }
  function checkCard(){
    var card = E("section","card"); card.id = "albCheckCard";
    card.appendChild(E("h2", null, L("alb_check_h")));
    var finds = printCheck(DOC, curSize()), i, list = E("div","alb-checks"); list.id = "albChecks";
    if (!finds.length){
      var ok = E("p","alb-checkok", "\u2713 " + L("alb_check_ok")); ok.id = "albCheckOk";
      list.appendChild(ok);
    } else {
      var shown = finds.slice(0, 12);
      for (i=0;i<shown.length;i++){
        (function(f){
          var row = E("button","alb-checkrow " + f.kind, checkLine(f)); row.type = "button";
          row.setAttribute("data-page", String(f.page));
          row.onclick = function(){
            DOC.cur = f.page; DOC.view = "page";
            SEL = (f.i == null) ? null : { kind: (f.kind === "edge") ? "text" : "photo", i: f.i };
            SELPAGE = f.page;
            onDocChange(false);
          };
          list.appendChild(row);
        })(shown[i]);
      }
      if (finds.length > shown.length) list.appendChild(E("p","mut", L("alb_check_n").replace("{N}", String(finds.length))));
    }
    card.appendChild(list);
    var cn = E("p","mut", L("alb_check_note").replace("{S}", String(PPI_SOFT)).replace("{L}", String(PPI_LOW))); cn.id = "albCheckNote";
    card.appendChild(cn);
    return card;
  }

  /* ---- the words ---- */
  /* the ink a printed line is actually set in. Six, not a colour wheel: near-black for
     paper, white for a line laid over a dark photograph, and four the studio's own
     albums use. A page that offers only black puts the caption on a night portrait
     where nobody can read it, which is what this row is here to stop.
     6.105.0 — the row moved into data/album.js, because an occasion names one of these
     as its default and the generator has to be able to refuse a default nothing offers. */
  var INKS = (D.inks && D.inks.length) ? D.inks : ["#1b1b1f", "#ffffff", "#6b6b73", "#8a6a3b", "#b08d57", "#7a2f36"];

  function textCard(){
    var card = E("section","card"); card.id = "albTextCard";
    if (albWidth() >= 820) card.className = "card alb-lab-side";
    var pg = curPage();
    card.appendChild(E("h2", null, L("alb_text_h")));

    /* the pairing — one tap sets the display face and the reading face together */
    card.appendChild(subh(L("alb_pair")));
    var pi, pcur = curPair(), pchips = [], w = albWidth();
    for (pi=0; pi<D.pairs.length; pi++){
      (function(p){
        pchips.push(chip(pick9(p.label), (pcur && pcur.id === p.id), function(){
          DOC.pair = p.id; onDocChange(false);
        }));
      })(D.pairs[pi]);
    }
    var prow = grid("pair", pchips, w); prow.id = "albPairs";
    card.appendChild(prow);
    var pn = E("p","mut"); pn.id = "albPairNote";
    pn.textContent = L("alb_pair_note") + " · " +
      L("alb_font_count").replace("{N}", String(D.fonts.length)).replace("{P}", String(D.pairs.length));
    card.appendChild(pn);

    var i;
    for (i=0;i<D.roles.length;i++){
      (function(role){
        var cur = null, k;
        for (k=0;k<pg.texts.length;k++) if (pg.texts[k].role === role.id) cur = pg.texts[k];
        function ensure(){
          if (!cur){ cur = { role: role.id, text:"", x:0.5, y: role.id==="title" ? 0.12 : 0.92,
                             size:1, rot:0,
                             align:"center", color:"#1b1b1f", font:"" }; pg.texts.push(cur); }
          return cur;
        }
        /* 6.107.0 — THE ROLE NAME WENT ABOVE THE FIELD. It used to be a fixed 92 px column
           on the left of the same row, which left an input, a font picker and six ink discs
           to share what was left of a 306 px panel: seven rows of 141 px, a card 1,465 px
           tall. As a caption it costs one short line and gives the whole width back. */
        var row = E("div","alb-textrow" + ((i === D.roles.length-1) ? " last" : ""));
        row.appendChild(E("span","alb-rolelab", pick9(role.label)));
        var field = E("div","alb-field");
        var inp = document.createElement("input");
        inp.type = "text"; inp.className = "inp"; inp.id = "albText_" + role.id;
        inp.maxLength = 120;
        inp.value = cur ? cur.text : "";
        inp.placeholder = pick9(role.label);
        /* 6.104.0 — TYPING NO LONGER REBUILDS THE PAGE. onDocChange() empties #albRoot and
           draws every card again, so in wave A each keystroke replaced the very input the
           student was typing into and the caret went with it. The words change nothing but
           the canvas, so only the canvas is redrawn — and debounced, because it is a print
           sized page. */
        inp.oninput = function(){ var c = ensure(); c.text = inp.value; c.auto = false; onTextChange(); };   /* 6.121.0 — typed over: the engine never replaces it */
        field.appendChild(inp);

        /* the face for this one line: Auto (the pairing decides) or a family by name */
        var sel = document.createElement("select");
        sel.className = "inp alb-fontsel"; sel.id = "albFont_" + role.id;
        var o0 = document.createElement("option");
        o0.value = ""; o0.textContent = L("alb_font_auto");
        if (!(cur && cur.font)) o0.selected = true;
        sel.appendChild(o0);
        var fi;
        for (fi=0; fi<D.fonts.length; fi++){
          var f = D.fonts[fi];
          var o = document.createElement("option");
          o.value = f.id; o.textContent = f.name;
          if (cur && cur.font === f.id) o.selected = true;
          sel.appendChild(o);
        }
        sel.onchange = function(){ ensure().font = sel.value; onTextChange(); };
        field.appendChild(sel);

        /* the ink */
        var inks = E("div","alb-inks");
        var ii;
        for (ii=0; ii<INKS.length; ii++){
          (function(hex){
            var b = document.createElement("button");
            b.type = "button";
            b.className = "alb-ink" + (((cur && cur.color) || "#1b1b1f") === hex ? " on" : "");
            b.style.backgroundColor = hex;
            b.setAttribute("data-ink", hex);
            b.setAttribute("aria-label", L("alb_ink") + " " + hex);
            b.onclick = function(){
              ensure().color = hex;
              var all = inks.getElementsByTagName("button"), q;
              for (q=0;q<all.length;q++) all[q].className = "alb-ink" + (all[q].getAttribute("data-ink") === hex ? " on" : "");
              onTextChange();
            };
            inks.appendChild(b);
          })(INKS[ii]);
        }
        field.appendChild(inks);
        row.appendChild(field);
        card.appendChild(row);
      })(D.roles[i]);
    }
    card.appendChild(E("p","mut", L("alb_text_note")));
    card.appendChild(E("p","mut", L("alb_font_my")));
    return card;
  }

  /* ---- export ---- */
  /* 6.107.0 — FIVE BUTTONS IN TWO NAMED GROUPS. They were one ragged block: two "grow"
     buttons that took 543 px each on a monitor beside an "All pages" that stayed 188, and
     133 / 133 / 188 / 133 / 133 in a 340 px panel. They also mixed two different jobs —
     three of them make a file of THIS page and two make a file of the WHOLE album — with
     nothing on the card saying which was which. */
  /* ONE PDF, EVERY PAGE. Each page is drawn once at its real print size WITH its bleed, the
     renderer's own JPEG bytes go straight into the file, and the canvas is dropped before the
     next one is drawn — an album of forty pages never has two of them alive at once. */
  function exportPdf(){
    var sz = curSize(), px = pagePx(sz), shots = [], i = 0, n = DOC.pages.length;
    if (!px) return Promise.resolve(false);
    H.toast(L("alb_export_busy"), "");
    function step(){
      if (i >= n) return Promise.resolve(true);
      var at = i++;
      var cv = document.createElement("canvas");
      return drawPage(cv, DOC.pages[at], at, { scale: 1, guides: false, bleed: true }).then(function(ok){
        var url = null;
        if (ok){ try { url = cv.toDataURL("image/jpeg", 0.92); } catch(e){ url = null; } }
        var w = cv.width, h = cv.height;
        cv.width = cv.height = 1;
        var by = url ? dataUrlBytes(url) : null;
        if (by) shots.push({ jpeg: by, w: w, h: h });
        return new Promise(function(go){ setTimeout(go, 0); }).then(step);
      });
    }
    return step().then(function(){
      if (!shots.length){ H.toast(L("alb_export_fail"), "err"); return false; }
      var bytes = pdfOfShots(shots, px, "HNK album " + curSize().id);
      var name = "hnk-album-" + curSize().id + ".pdf";
      return Promise.resolve(sendFile(bytes, name, "application/pdf")).then(function(){
        H.toast(L("alb_pdf_done").replace("{N}", String(shots.length))
                                 .replace("{M}", String(Math.max(1, Math.round(bytes.length/1048576)))), "ok");
        return true;
      });
    }).catch(function(){ H.toast(L("alb_export_fail"), "err"); return false; });
  }
  /* THE OPEN PAGE, IN LAYERS. Big pages make big files and a browser that cannot hold one says
     so rather than dying quietly: over the soft ceiling the student is told the size and asked,
     over the hard one the studio refuses and names the PDF instead. */
  function exportPsd(){
    var sz = curSize(), px = pagePx(sz);
    if (!px) return Promise.resolve(false);
    var mb = Math.max(1, Math.round(psdEstimate(curPage(), DOC.cur)/1048576));
    if (mb > PSD_HARD_MB){ H.toast(L("alb_psd_no").replace("{N}", String(mb)), "err"); return Promise.resolve(false); }
    var go = (mb > PSD_SOFT_MB) ? askP(L("alb_psd_big").replace("{N}", String(mb))) : Promise.resolve(true);
    return go.then(function(ok){
      if (!ok) return false;
      H.toast(L("alb_export_busy"), "");
      return psdOfPage(DOC.cur).then(function(bytes){
        if (!bytes || !bytes.length){ H.toast(L("alb_export_fail"), "err"); return false; }
        var name = "hnk-album-" + (DOC.cur+1) + "-" + curSize().id + ".psd";
        return Promise.resolve(sendFile(bytes, name, "image/vnd.adobe.photoshop")).then(function(){
          H.toast(L("alb_pdf_done").replace("{N}", "1")
                                   .replace("{M}", String(Math.max(1, Math.round(bytes.length/1048576)))), "ok");
          return true;
        });
      });
    }).catch(function(){ H.toast(L("alb_export_fail"), "err"); return false; });
  }
  /* 6.122.0 — THE PAGE, OPEN IN PHOTOSHOP. The same layered file the PSD button writes, handed
     to a host that can open it as a document; only a host that can offers the button. */
  function openInPs(){
    if (!H || typeof H.openInPs !== "function") return Promise.resolve(false);
    var sz = curSize(), px = pagePx(sz);
    if (!px) return Promise.resolve(false);
    var mb = Math.max(1, Math.round(psdEstimate(curPage(), DOC.cur)/1048576));
    if (mb > PSD_HARD_MB){ H.toast(L("alb_psd_no").replace("{N}", String(mb)), "err"); return Promise.resolve(false); }
    H.toast(L("alb_export_busy"), "");
    return psdOfPage(DOC.cur).then(function(bytes){
      if (!bytes || !bytes.length){ H.toast(L("alb_export_fail"), "err"); return false; }
      var name = "hnk-album-" + (DOC.cur+1) + "-" + curSize().id + ".psd";
      return Promise.resolve(H.openInPs(bytes, name)).then(function(ok){
        H.toast(ok ? L("alb_open_ps_done") : L("alb_open_ps_fail"), ok ? "ok" : "err");
        return !!ok;
      });
    }).catch(function(){ H.toast(L("alb_open_ps_fail"), "err"); return false; });
  }
  /* A print file is tens of megabytes, and a data: URL of one is a string the phone has to hold
     twice. A host that can take the bytes themselves is given them; anything else still gets the
     data URL it always got. */
  function sendFile(bytes, name, mime){
    if (H && typeof H.exportFile === "function") return H.exportFile(bytes, name, mime);
    var bin = "", i, CH = 0x8000;
    for (i=0;i<bytes.length;i+=CH) bin += String.fromCharCode.apply(null, bytes.subarray(i, i+CH));
    return H.exportOut("data:" + mime + ";base64," + btoa(bin), name);
  }
  function pageJpeg(idx){
    var pg = DOC.pages[idx]; if (!pg) return Promise.resolve(null);
    var cv = document.createElement("canvas");
    return drawPage(cv, pg, idx, { scale: 1, guides: false }).then(function(ok){
      if (!ok) return null;
      try { return cv.toDataURL("image/jpeg", 0.92); } catch(e){ return null; }
    });
  }
  function exportPage(toGallery){
    var idx = DOC.cur;
    H.toast(L("alb_export_busy"), "");
    return pageJpeg(idx).then(function(url){
      if (!url){ H.toast(L("alb_export_fail"), "err"); return false; }
      var name = "hnk-album-" + (idx+1) + "-" + curSize().id + ".jpg";
      if (toGallery && typeof H.saveGallery === "function"){
        return Promise.resolve(H.saveGallery(url, name)).then(function(){ H.toast(L("alb_export_saved"), "ok"); return true; });
      }
      H.exportOut(url, name);
      H.toast(L("alb_export_done"), "ok");
      return true;
    }).catch(function(){ H.toast(L("alb_export_fail"), "err"); return false; });
  }
  function exportAll(){
    var i = 0, n = DOC.pages.length;
    H.toast(L("alb_export_busy"), "");
    function step(){
      if (i >= n){ H.toast(L("alb_export_done"), "ok"); return true; }
      var at = i++;
      return pageJpeg(at).then(function(url){
        if (url) H.exportOut(url, "hnk-album-" + (at+1) + "-" + curSize().id + ".jpg");
        return new Promise(function(r){ setTimeout(r, 400); }).then(step);
      });
    }
    return step().catch(function(){ H.toast(L("alb_export_fail"), "err"); return false; });
  }

  /* ======================= TAKING A PHOTO IN ======================= */

  /* Every photo that arrives is measured once and asked, once, where its subject sits. Both
     answers are stored with it, so the crop is decided when the picture lands rather than on
     every repaint, and a reopened album crops exactly as it did before. */
  function addPhotos(items){
    var pg = curPage(), room = pageMax(pg) - pg.photos.length;   /* 6.125.0 — eight frames from a template */
    if (room <= 0){ H.toast(L("alb_photo_full"), ""); return Promise.resolve(0); }
    var take = items.slice(0, room), added = 0;
    return take.reduce(function(chain, src){
      return chain.then(function(){
        return imgFor(src).then(function(im){
          if (!im) return;
          var w = im.naturalWidth||im.width, h = im.naturalHeight||im.height;
          if (!(w>0 && h>0)) return;
          var subj = measureSubject(im, w, h);
          /* 6.110.0 — zoom 1 and manual false: the page still chooses this photograph's crop,
             until the student touches it. */
          var ph = { src: src, w: w, h: h, subject: subj, anchor: { x:0.5, y:0.5 }, zoom: 1, manual: false, fx: "" };
          pg.photos.push(ph);
          poolAdd(ph);                       /* 6.121.0 — into the tray as well */
          added++;
        });
      });
    }, Promise.resolve()).then(function(){
      reAnchor(pg);
      onDocChange(false);
      if (items.length > room) H.toast(L("alb_photo_some"), "");
      return added;
    });
  }
  /* the subject's centroid, read once off a 64px thumbnail — small enough to be free, big
     enough that a face is several pixels across */
  function measureSubject(im, w, h){
    try {
      var k = 64 / Math.max(w,h), cw = Math.max(1, Math.round(w*k)), ch = Math.max(1, Math.round(h*k));
      var c = document.createElement("canvas"); c.width = cw; c.height = ch;
      var x = c.getContext("2d"); if (!x) return null;
      x.drawImage(im, 0, 0, cw, ch);
      var px = x.getImageData(0, 0, cw, ch);
      return subjectAnchor(px.data, cw, ch);
    } catch(e){ return null; }
  }
  /* the anchors the current layout implies — recomputed whenever the layout or the size moves,
     because a crop that was right in a tall cell is wrong in a wide one */
  function reAnchor(pg, idx){
    var sz = curSize(), safe = safeArea(sz);
    if (!safe) return;
    /* 6.105.0 — the page's OWN index, not always the open one. The auto-flow scores a template
       partly on where the page falls in the album (the rhythm's nudge), so anchoring every page
       of a freshly laid-out album against page 0's template cropped most of them for a layout
       they are not drawn with. */
    /* 6.106.0 — and against the page's own layout rectangle: a bleeding page's cells are bigger
       and a different shape, so a crop chosen against the safe area is the wrong crop. */
    var tpl = pageTpl(pg, (idx == null) ? DOC.cur : idx);
    var rects = cellRects(tpl, layoutRect(safe, pg)), i;
    for (i=0;i<pg.photos.length && i<rects.length;i++){
      var ph = pg.photos[i], r = rects[i];
      /* 6.110.0 — A CROP THE STUDENT SET IS THEIRS. reAnchor runs on every layout change, every
         size change and every page rebuild; without this line the studio pushes the bride an inch
         left, taps the next template, and the app quietly puts her back. "Back to what the page
         chose" is a button (resetSel), never something that happens on its own. */
      if (ph.manual) continue;
      ph.anchor = anchorFor(ph.subject, ph.w, ph.h, r.w, r.h);
    }
  }

  /* ======================= RENDER ======================= */

  var REDRAW = null;
  function onDocChange(sizeMoved){
    if (sizeMoved){ var i; for (i=0;i<DOC.pages.length;i++) reAnchor(DOC.pages[i], i); }
    else reAnchor(curPage(), DOC.cur);
    saveSoon();
    commit();
    render();
  }
  /* words, a face or an ink changed: the document is saved and the canvases are redrawn,
     and NOTHING in the DOM is replaced (see the oninput comment in textCard) */
  function onTextChange(){
    saveSoon();
    if (REDRAW) clearTimeout(REDRAW);
    REDRAW = setTimeout(repaint, 90);
    /* 6.121.0 — one undo step per pause in typing, not one per keystroke */
    if (TEXT_COMMIT) clearTimeout(TEXT_COMMIT);
    TEXT_COMMIT = setTimeout(function(){ TEXT_COMMIT = null; commit(); }, 700);
  }

  /* ======================= UNDO · REDO (6.121.0, wave F) =======================

     Forty steps, each the whole album — but an album carries its photographs as data URLs, and
     forty copies of forty photographs is a gigabyte. So a step INTERNS them: every `src` is
     swapped for its index in one pool while the record is written and swapped back when it is
     read, and a step is a few kilobytes of layout, words and crops. The pool only grows; a
     photograph a student removed and then un-removed is the same bytes it was. */
  function srcId(s){ var i = SRC_POOL.indexOf(s); if (i < 0){ SRC_POOL.push(s); i = SRC_POOL.length - 1; } return i; }
  function snap(){
    return JSON.stringify(DOC, function(k, v){ return (k === "src" && typeof v === "string") ? { "@": srcId(v) } : v; });
  }
  function unsnap(str){
    return JSON.parse(str, function(k, v){ return (v && typeof v === "object" && typeof v["@"] === "number") ? (SRC_POOL[v["@"]] || "") : v; });
  }
  /* the album changed: remember what it was. Called after every change the page makes, and
     harmless when nothing actually moved (a click that changed no number is not a step). */
  function commit(){
    if (!DOC || UNDOING) return;
    var s;
    try { s = snap(); } catch(e){ return; }
    if (CUR_SNAP === null){ CUR_SNAP = s; return; }
    if (s === CUR_SNAP) return;
    HIST.push(CUR_SNAP);
    if (HIST.length > HIST_MAX) HIST.shift();
    REDO = [];
    CUR_SNAP = s;
    syncUndoBtns();
  }
  function restoreSnap(s){
    UNDOING = true;
    try { DOC = normalize(unsnap(s)); CUR_SNAP = s; SEL = null; onDocChange(true); }
    finally { UNDOING = false; }
    fillSelBar();
  }
  function undo(){
    if (!HIST.length){ H.toast(L("alb_nothing_undo"), ""); return false; }
    REDO.push(CUR_SNAP); restoreSnap(HIST.pop()); return true;
  }
  function redo(){
    if (!REDO.length) return false;
    HIST.push(CUR_SNAP); restoreSnap(REDO.pop()); return true;
  }
  /* the keys a designer's hands expect, on the album page only and never inside a field:
     Ctrl/Cmd+Z undo · Ctrl/Cmd+Shift+Z or Ctrl+Y redo · Delete removes what is selected ·
     the arrows nudge it. One listener, bound at init. */
  var KEYS_BOUND = false;
  function albumOn(){
    if (typeof document === "undefined") return false;
    /* the app's page is #pgAlbum, the Photoshop panel's #pageAlbum (6.122.0) */
    var pg = document.getElementById("pgAlbum") || document.getElementById("pageAlbum");
    return !!(pg && pg.classList && pg.classList.contains("on"));
  }
  function onKey(ev){
    if (!MOUNTED || !albumOn()) return;
    var tag = ((ev.target && ev.target.tagName) || "").toUpperCase();
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (ev.target && ev.target.isContentEditable)) return;
    var mod = ev.ctrlKey || ev.metaKey, k = ev.key;
    if (mod && (k === "z" || k === "Z")){ ev.preventDefault(); if (ev.shiftKey) redo(); else undo(); return; }
    if (mod && (k === "y" || k === "Y")){ ev.preventDefault(); redo(); return; }
    if (mod) return;
    if (k === "Delete" || k === "Backspace"){ if (selObj()){ ev.preventDefault(); removeSelected(); } return; }
    if (DOC.view !== "page" || !selObj()) return;
    var cell = selCell(), safe = VIEW.safe || safeArea(curSize());
    var sx = (SEL.kind === "photo") ? (cell ? cell.w*NUDGE : 0) : (safe ? safe.w*NUDGE/2 : 0);
    var sy = (SEL.kind === "photo") ? (cell ? cell.h*NUDGE : 0) : (safe ? safe.h*NUDGE/2 : 0);
    if (k === "ArrowLeft"){ ev.preventDefault(); moveSel(-sx, 0); touchChanged(false); }
    else if (k === "ArrowRight"){ ev.preventDefault(); moveSel(sx, 0); touchChanged(false); }
    else if (k === "ArrowUp"){ ev.preventDefault(); moveSel(0, -sy); touchChanged(false); }
    else if (k === "ArrowDown"){ ev.preventDefault(); moveSel(0, sy); touchChanged(false); }
  }
  var SELPAGE = -1;
  function render(){
    if (!ROOT) return;
    DRAWN = true;
    /* 6.110.0 — the selection belongs to the page it was made on. Turning to page 4 with
       "photo 2" still selected would hand the arrows a different photograph. */
    if (SELPAGE !== DOC.cur){ SEL = null; SELPAGE = DOC.cur; }
    /* 6.107.0 — every rail is built against ONE measurement, taken here. Measuring per rail
       would let a card built before the stage canvas exists disagree with the one after it. */
    BUCKET = widthBucket(albWidth());
    ROOT.innerHTML = "";
    ROOT.appendChild(shelfCard());           /* 6.122.0 wave G */
    ROOT.appendChild(occasionCard());
    ROOT.appendChild(sizeCard());
    ROOT.appendChild(pagesCard());
    ROOT.appendChild(stageCard());
    ROOT.appendChild(photosCard());
    ROOT.appendChild(layoutCard());
    ROOT.appendChild(libCard());             /* 6.125.0 wave I */
    ROOT.appendChild(designCard());          /* 6.121.0 wave F */
    ROOT.appendChild(ornCard());             /* 6.122.0 wave G */
    ROOT.appendChild(textCard());
    ROOT.appendChild(exportCard());
    ROOT.appendChild(checkCard());           /* 6.121.0 wave F */
    if (REDRAW) clearTimeout(REDRAW);
    REDRAW = setTimeout(repaint, 0);
  }
  /* the stage and every thumbnail, at whatever scale each one can afford.
     6.110.0 — `live` is a drag in progress: the stage is the only canvas that has to keep up
     with a finger, and an album of forty pages must not redraw forty thumbnails per frame. */
  function repaint(live){
    REDRAW = null;
    var sz = curSize(), px = pagePx(sz);
    if (!px) return;
    var stage = document.getElementById("albCanvas");
    if (stage){
      var box = document.getElementById("albStage");
      var avail = (box && box.clientWidth) || 0;
      if (!(avail > 0)) avail = 360;                          /* a renderer with no ruler still draws */
      /* 6.106.0 — a spread is two pages wide, so it gets half the room each */
      var spread = (DOC.view === "spread");
      var room = Math.min(avail, PREVIEW_MAX) / (spread ? 2 : 1);
      var scale = Math.min(1, room / px.w);
      /* 6.110.0 — THE STAGE'S OWN GEOMETRY, WRITTEN DOWN. A pointer arrives in client pixels and
         has to become page pixels; the cell it landed in has to be the cell this canvas was drawn
         with. Both are known here and nowhere else, so here is where they are recorded. */
      var safeNow = safeArea(sz);
      VIEW = { scale: scale, safe: safeNow, spread: spread,
               cells: (spread || !safeNow) ? [] : cellRects(pageTpl(curPage(), DOC.cur), layoutRect(safeNow, curPage())) };
      if (spread) drawSpread(stage, spreadOf(DOC.cur, DOC.pages.length), scale);
      else drawPage(stage, curPage(), DOC.cur, { scale: scale, guides: !!DOC.guides, sel: selObj() ? SEL : null });
    } else if (DOC.view === "book" && document.getElementById("albBook")){
      drawBook(px);                                   /* 6.121.0 — every page of the book */
    } else if (DOC.view === "3d" && document.getElementById("albCanvas3d")){
      draw3d(document.getElementById("albCanvas3d")); /* 6.125.0 wave I — the mockup */
    }
    if (live) return;
    var i;
    for (i=0;i<DOC.pages.length;i++){
      (function(idx){
        var cv = document.getElementById("albThumb_" + idx);
        if (!cv) return;
        drawPage(cv, DOC.pages[idx], idx, { scale: THUMB_W / px.w, guides: false });
      })(i);
    }
  }

  /* ======================= THE SPREAD (6.106.0, wave D) =======================

     An album is not read a page at a time. It is opened, and two pages face each other across
     the fold; a picture that works alone can fight the one beside it. So the stage can show the
     spread the open page belongs to, laid out the way the book actually falls: page one on its
     own on the right, then 2–3, 4–5, and a last page alone on the left if the count is even. */
  function spreadOf(i, n){
    if (!(n > 0)) return [null, null];
    if (i <= 0) return [null, 0];
    var k = i - 1, start = 1 + (k - (k % 2));
    return [start, (start + 1 < n) ? start + 1 : null];
  }
  function drawSpread(cv, pair, scale){
    var sz = curSize(), px = pagePx(sz);
    if (!px) return Promise.resolve(false);
    var W = Math.max(1, Math.round(px.w*scale)), Hh = Math.max(1, Math.round(px.h*scale));
    cv.width = W*2; cv.height = Hh;
    var x = cv.getContext("2d"); if (!x) return Promise.resolve(false);
    x.fillStyle = "#e9e9ee"; x.fillRect(0,0,W*2,Hh);
    function side(at, dx){
      if (at == null) return Promise.resolve(true);
      var one = document.createElement("canvas");
      return drawPage(one, DOC.pages[at], at, { scale: scale, guides: !!DOC.guides }).then(function(ok){
        if (ok) { try { x.drawImage(one, dx, 0); } catch(e){} }
        one.width = one.height = 1;
        return true;
      });
    }
    return side(pair[0], 0).then(function(){ return side(pair[1], W); }).then(function(){
      /* the fold: where the two pages meet and where a flush-mount album loses a few millimetres */
      x.save();
      x.fillStyle = "rgba(0,0,0,.14)"; x.fillRect(W - Math.max(1, 2*scale*3), 0, Math.max(2, 4*scale*3), Hh);
      x.restore();
      return true;
    });
  }

  /* ======================= SHUFFLE (6.106.0, wave D) =======================

     Every photograph out of every page, dealt back in a new order into the SAME page counts. The
     album's shape does not move: the plan, the templates and the words stay exactly where they
     were, and only which picture sits in which cell changes. Nothing is ever lost — the deal is
     pure arithmetic over one list, and the test drives it with its own generator so the result is
     something to check rather than something to hope for. */
  function dealOut(list, counts, rnd){
    var a = list.slice(), i, j, t;
    for (i = a.length - 1; i > 0; i--){
      j = Math.floor(rnd() * (i + 1));
      if (!(j >= 0 && j <= i)) j = 0;
      t = a[i]; a[i] = a[j]; a[j] = t;
    }
    var out = [], at = 0, k;
    for (k = 0; k < counts.length; k++) out.push(a.slice(at, at + counts[k])), at += counts[k];
    return out;
  }
  function shuffleAlbum(rnd){
    var all = [], counts = [], i;
    for (i=0;i<DOC.pages.length;i++){ counts.push(DOC.pages[i].photos.length); all = all.concat(DOC.pages[i].photos); }
    if (all.length < 2) return 0;
    var dealt = dealOut(all, counts, rnd || Math.random);
    for (i=0;i<DOC.pages.length;i++) DOC.pages[i].photos = dealt[i];
    onDocChange(true);
    return all.length;
  }

  /* ======================= THE DESIGN ENGINE (6.121.0, wave F) =======================

     The owner's reference video sets every spread like a magazine page: a small kicker in
     letter-spaced capitals, a headline, a sentence of copy, a hairline rule, all of it beside
     the photographs and none of it typed by the person making the album. That is a DESIGN
     ENGINE, and this is the studio's: for each page it finds the room the layout leaves
     (a template's own text slot, else the largest empty band, else the foot of the biggest
     photograph under a scrim), takes the occasion's story set for that page — nine occasions,
     four kicker + headline pairs and two bodies each, in nine languages, from data/album.js —
     composes the block in the album's STYLE (editorial · classic · minimal · script), fits it
     to the room by measuring the real faces, and writes the result onto the page as ordinary
     texts and decor marked `auto`. Ordinary means: the student can drag, retype, recolour or
     delete every line the engine placed exactly as they would one they typed. A retyped line
     drops its `auto` and is never replaced; a redesign replaces only the engine's own.

     Everything the engine writes is a fraction of the safe area, like every other mark on an
     album page, so the same design survives a size change and prints from the same drawPage. */

  var PPI_SOFT = 150, PPI_LOW = 100;   /* the print check's two lines: sharp above, soft, too soft */

  /* the occasion's story set for a page index — the sets cycle, so a long album repeats them
     in order rather than stopping; pure, so the test drives it in Node */
  function storyFor(occId, idx){
    var S = (D && D.stories) || {}, st = S[occId] || S[D.defOcc] || null;
    if (!st || !st.lines || !st.lines.length) return null;
    var n = st.lines.length, k = (((idx|0) % n) + n) % n;
    var bodies = (st.body && st.body.length) ? st.body : [];
    return { idx: k, count: n, kicker: st.lines[k].k, headline: st.lines[k].h,
             body: bodies.length ? bodies[k % bodies.length] : null };
  }
  /* THE ROOM A LAYOUT LEAVES. The unit square is cut into a 40 x 40 grid, every cell (grown by
     a hair so gutters count as full) marks its squares, and the largest rectangle of unmarked
     squares is the answer — the classic largest-rectangle-in-a-histogram, one pass per row.
     Pure arithmetic over the template's fractions; nothing of the page or the browser in it. */
  var GRID_N = 40;
  function freeRegion(cells){
    var N = GRID_N, occ = [], r, c, i, k;
    for (r=0;r<N;r++){ occ.push([]); for (c=0;c<N;c++) occ[r].push(0); }
    for (i=0;i<(cells||[]).length;i++){
      var ce = cells[i]; if (!ce) continue;
      var x0 = Math.max(0, Math.floor((ce.x - 0.01)*N)), x1 = Math.min(N-1, Math.ceil((ce.x + ce.w + 0.01)*N) - 1);
      var y0 = Math.max(0, Math.floor((ce.y - 0.01)*N)), y1 = Math.min(N-1, Math.ceil((ce.y + ce.h + 0.01)*N) - 1);
      for (r=y0;r<=y1;r++) for (c=x0;c<=x1;c++) occ[r][c] = 1;
    }
    var h = [], best = null, bestA = 0;
    for (c=0;c<N;c++) h.push(0);
    for (r=0;r<N;r++){
      for (c=0;c<N;c++) h[c] = occ[r][c] ? 0 : h[c] + 1;
      var st = [];
      for (c=0;c<=N;c++){
        var cur = (c === N) ? 0 : h[c];
        while (st.length && h[st[st.length-1]] >= cur){
          var top = st.pop(), height = h[top], left = st.length ? st[st.length-1] + 1 : 0, width = c - left;
          if (height*width > bestA){ bestA = height*width; best = { x: left/N, y: (r - height + 1)/N, w: width/N, h: height/N }; }
        }
        st.push(c);
      }
      k = 0;
    }
    return best;
  }
  function overlaps(a, c){ return a.x < c.x + c.w && a.x + a.w > c.x && a.y < c.y + c.h && a.y + a.h > c.y; }
  /* WHERE THE BLOCK GOES, in order: the template's own text slot (a column of slots is one
     region), the largest empty band if it is big enough to read, else the foot of the biggest
     photograph as an OVERLAY (white ink over a scrim). On a spread the block never straddles the
     binding: a region that touches the band is cut to the wider side of it. Pure. */
  function designRegion(tpl, spread, gutFrac){
    if (!tpl) return null;
    var slots = tpl.texts || [], cells = tpl.cells || [], i, r = null, bb = null;
    for (i=0;i<slots.length;i++){
      var sl = slots[i]; if (!sl || !(sl.w > 0)) continue;
      if (!bb) bb = { x: sl.x, y: sl.y, x2: sl.x + sl.w, y2: sl.y + sl.h };
      else if (Math.abs(sl.x - bb.x) < 0.02 || Math.abs((sl.x + sl.w) - bb.x2) < 0.02){
        bb.y = Math.min(bb.y, sl.y); bb.y2 = Math.max(bb.y2, sl.y + sl.h);
        bb.x = Math.min(bb.x, sl.x); bb.x2 = Math.max(bb.x2, sl.x + sl.w);
      }
    }
    if (bb && bb.x2 - bb.x >= 0.18){
      r = { x: bb.x, y: bb.y, w: bb.x2 - bb.x, h: bb.y2 - bb.y, mode: "slot" };
      for (i=0;i<cells.length;i++) if (overlaps(r, cells[i])){ r.mode = "overlay"; r.cell = cells[i]; break; }
      /* a slot drawn over a photograph is one line tall; the block needs room above it */
      if (r.mode === "overlay" && r.h < 0.24){ var y2 = r.y + r.h; r.y = Math.max(0, y2 - 0.26); r.h = y2 - r.y; }
      /* a slot beside the photographs that is one line tall (an opener's title line) sits in a band
         the layout left empty — the block takes the band, which holds the kicker and the copy too */
      if (r.mode === "slot" && r.h < 0.22){
        var bandS = freeRegion(cells);
        if (bandS && bandS.h > r.h && bandS.w >= 0.2 && overlaps(bandS, r)) r = { x: bandS.x, y: bandS.y, w: bandS.w, h: bandS.h, mode: "band" };
      }
    }
    if (!r){
      var band = freeRegion(cells);
      if (band && band.w >= 0.2 && band.h >= 0.14){ band.mode = "band"; r = band; }
    }
    if (!r){
      var big = null;
      for (i=0;i<cells.length;i++) if (!big || cells[i].w*cells[i].h > big.w*big.h) big = cells[i];
      if (!big) return null;
      r = { x: big.x + big.w*0.06, y: big.y + big.h*0.58, w: big.w*0.88, h: big.h*0.36, mode: "overlay", cell: big };
    }
    if (spread && gutFrac > 0){
      var lo = 0.5 - gutFrac, hi = 0.5 + gutFrac, x2 = r.x + r.w;
      if (r.x < hi && x2 > lo){
        var leftW = lo - r.x, rightW = x2 - hi;
        if (leftW >= rightW && leftW > 0.05) r.w = leftW;
        else if (rightW > 0.05){ r.x = hi; r.w = rightW; }
        r.binding = true;
      }
    }
    return r;
  }
  function paperDark(hex){
    var m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(hex || ""));
    if (!m) return false;
    var l = 0.2126*parseInt(m[1],16) + 0.7152*parseInt(m[2],16) + 0.0722*parseInt(m[3],16);
    return l < 110;
  }
  /* the measuring context: the page's own canvas where there is one; a caller's ruler (the
     Node test) or a character estimate where there is none. wrapLines only asks measureText. */
  var MEAS = null;
  function measureCtx(font, measure){
    if (typeof measure === "function") return { font: font, measureText: function(t){ return { width: measure(t, font) }; } };
    if (!MEAS){ try { var cv = document.createElement("canvas"); cv.width = cv.height = 4; MEAS = cv.getContext("2d"); } catch(e){ MEAS = null; } }
    if (!MEAS){
      var px = parseFloat((/(\d+(?:\.\d+)?)px/.exec(font) || [0, 12])[1]) || 12;
      return { font: font, measureText: function(t){ return { width: String(t).length * px * 0.55 }; } };
    }
    MEAS.font = font;
    return MEAS;
  }
  /* THE BLOCK. Kicker · rule · headline · body in the album's style, fitted to the region by
     measuring the real faces at the real page size: too tall and the type shrinks (never below
     TEXT_MIN), still too tall and the body goes, then the rule, then the kicker — the headline
     is the one line that always survives. Returns texts and decor, every number a fraction of
     the safe area; `skip` names roles the student already filled on this page, which the
     engine leaves alone. */
  function composeBlock(region, story, style, opts){
    opts = opts || {};
    var safe = opts.safe || { w: 3600, h: 3600 }, skip = opts.skip || {};
    var overlay = (region.mode === "overlay");
    var dark = overlay || paperDark(opts.paper);
    var inkMain = dark ? "#ffffff" : ((opts.ink && /^#[0-9a-fA-F]{6}$/.test(opts.ink)) ? opts.ink : INKS[0]);
    var inkBody = dark ? "#ffffff" : INKS[0], inkKick = GOLD;
    var kick = pick9(story.kicker || {}) || "", head = pick9(story.headline || {}) || "", body = story.body ? (pick9(story.body) || "") : "";
    /* a short band (the strip under a row of photographs, the foot of a frame) holds a kicker and a
       headline at a readable size or three lines nobody can read — it gets no body */
    if (region.h < 0.26) body = "";
    var padX = Math.min(0.03, region.w*0.06), padY = Math.min(0.02, region.h*0.08);
    var innerW = Math.max(0.05, region.w - 2*padX);
    var centre = (style === "classic" || style === "script");
    var align = centre ? "center" : "left";
    var x = centre ? region.x + region.w/2 : region.x + padX;
    var els = [];
    function el(role, text, ink, extra){
      if (!text || skip[role] || !roleById(role)) return;
      var e = { role: role, text: String(text).slice(0,120), size: 1, align: align, color: ink, font: "", w: innerW }, k;
      for (k in (extra || {})) if (Object.prototype.hasOwnProperty.call(extra, k)) e[k] = extra[k];
      els.push(e);
    }
    function rule(frac){ els.push({ rule: true, w: Math.min(0.1, innerW*frac) }); }
    if (style === "classic"){ rule(0.5); el("subtitle", kick, inkKick, { w: 0 }); el("title", head, inkMain); rule(0.5); el("quote", body, inkBody); }
    else if (style === "minimal"){ el("date", kick, inkKick, { w: 0 }); el("caption", head, inkMain, { size: 1.3 }); }
    else if (style === "script"){ el("title", head, inkMain, { font: fontById("greatvibes") ? "greatvibes" : "", size: 1.2 }); el("subtitle", kick, inkKick, { w: 0 }); }
    else { el("subtitle", kick, inkKick, { w: 0 }); rule(0.35); el("title", head, inkMain); el("quote", body, inkBody); }
    var size = 1, total = 0, avail = Math.max(1, region.h*safe.h - 2*padY*safe.h), guard = 0, i;
    function measureAll(){
      total = 0;
      for (i=0;i<els.length;i++){
        var e = els[i];
        if (e.rule){ e.hPx = Math.max(2, safe.h*0.004); e.gapPx = safe.h*0.012; total += e.hPx + e.gapPx; continue; }
        var role = roleById(e.role), face = fontForText(e);
        var px = Math.max(8, role.size*safe.h*clamp(e.size*size, TEXT_MIN, TEXT_MAX));
        var font = weightFor(face, role) + " " + Math.round(px) + "px " + ((face && face.stack) || "Georgia, serif");
        var ctx = measureCtx(font, opts.measure);
        var words = role.caps ? e.text.toUpperCase() : e.text;
        var lines = (e.w > 0) ? wrapLines(ctx, words, Math.max(8, e.w*safe.w)) : [words];
        e.lines = lines.length; e.px = px;
        e.hPx = (e.w > 0) ? px*1.32*lines.length : px*1.25;
        e.gapPx = px*0.35;
        total += e.hPx + e.gapPx;
      }
      if (els.length) total -= els[els.length-1].gapPx;
    }
    measureAll();
    while (total > avail && guard++ < 10){
      if (size > 0.7) size = Math.max(0.7, size * Math.max(0.6, (avail/total)*0.97));
      else {
        var dropped = false, di;
        for (di=els.length-1; di>=0 && !dropped; di--) if (els[di].role === "quote") { els.splice(di,1); dropped = true; }
        for (di=els.length-1; di>=0 && !dropped; di--) if (els[di].rule) { els.splice(di,1); dropped = true; }
        for (di=els.length-1; di>=0 && !dropped; di--) if (els[di].role !== "title" && els[di].role !== "caption") { els.splice(di,1); dropped = true; }
        if (!dropped) break;
      }
      measureAll();
    }
    var startPx = padY*safe.h + (overlay ? Math.max(0, avail - total) : Math.max(0, (avail - total)/2));
    var cursor = region.y*safe.h + startPx, texts = [], decor = [];
    for (i=0;i<els.length;i++){
      var e2 = els[i];
      if (e2.rule){
        decor.push({ kind: "rule", x: centre ? x - e2.w/2 : x, y: (cursor + e2.hPx/2)/safe.h, w: e2.w, h: 0, color: GOLD, auto: true });
      } else {
        texts.push({ role: e2.role, text: e2.text, x: x, y: (cursor + e2.hPx/2)/safe.h,
                     size: clamp(e2.size*size, TEXT_MIN, TEXT_MAX), rot: 0, align: align, color: e2.color,
                     font: e2.font || "", w: e2.w, auto: true });
      }
      cursor += e2.hPx + e2.gapPx;
    }
    if (overlay && region.cell){
      var c = region.cell;
      decor.unshift({ kind: "scrim", x: c.x, y: c.y + c.h*0.42, w: c.w, h: c.h*0.58, color: GOLD, auto: true });
    }
    return { texts: texts, decor: decor, region: region, size: size, lines: els.length };
  }
  /* the engine's own marks off a page; the student's stay */
  function clearDesign(pg){
    var i, t = [], d = [];
    for (i=0;i<(pg.texts||[]).length;i++) if (!pg.texts[i].auto) t.push(pg.texts[i]);
    for (i=0;i<(pg.decor||[]).length;i++) if (!pg.decor[i].auto) d.push(pg.decor[i]);
    pg.texts = t; pg.decor = d;
  }
  function hasDesign(pg){ var i; for (i=0;i<(pg.texts||[]).length;i++) if (pg.texts[i].auto) return true; return false; }
  function anyDesign(){ var i; for (i=0;i<DOC.pages.length;i++) if (hasDesign(DOC.pages[i])) return true; return false; }
  /* ONE PAGE, DESIGNED. The opener is the occasion's own page (its words were set when the
     album was made) and is left alone unless it is the cover; a page with no photograph (the
     closing page) has nothing to write beside. `next` turns to the occasion's next story set. */
  function designPage(pg, idx, opt){
    opt = opt || {};
    if (!pg || !DOC) return false;
    clearDesign(pg);
    if (idx === 0){ pg.story = -1; return false; }
    if (!pg.photos.length){ pg.story = -1; return false; }
    var o = curOcc(), sz = curSize(), safe = safeArea(sz); if (!safe) return false;
    var k = (pg.story >= 0) ? pg.story : Math.max(0, idx - 1);
    if (opt.next) k += 1;
    var story = storyFor(o && o.id, k); if (!story) return false;
    pg.story = story.idx;
    var tpl = pageTpl(pg, idx);
    var region = designRegion(tpl, safe.gutter > 0, safe.gutter / safe.w);
    if (!region) return false;
    var have = {}, i;
    for (i=0;i<pg.texts.length;i++) if (pg.texts[i].text) have[pg.texts[i].role] = true;
    var out = composeBlock(region, story, DOC.style, { paper: DOC.paper, ink: (o && o.ink) || INKS[0], safe: safe, skip: have });
    pg.texts = pg.texts.concat(out.texts).slice(0, D.roles.length);
    pg.decor = (pg.decor || []).concat(out.decor).slice(0, DECOR_MAX);   /* 6.122.0 — the student's ornaments stay */
    return true;
  }
  /* THE COVER. The opener's photograph runs off the paper (the full-bleed layout, bleed on) and
     the occasion's words move to the bottom left in white over a scrim — the front of the book. */
  function coverDesign(pg){
    if (!pg || !pg.photos.length) return false;
    if (tplById("f1a")){ pg.tplId = "f1a"; pg.auto = false; }
    pg.bleed = true;
    var i, tx, ys = { title: 0.80, subtitle: 0.735, quote: 0.885, names: 0.70, date: 0.93, caption: 0.93, folio: 0.95 };
    for (i=0;i<pg.texts.length;i++){
      tx = pg.texts[i]; if (!tx.text) continue;
      tx.x = 0.07; tx.align = "left"; tx.color = "#ffffff"; tx.w = 0.62; tx.cover = true;
      if (ys[tx.role] != null) tx.y = ys[tx.role];
    }
    var keep = [];
    for (i=0;i<(pg.decor||[]).length;i++) if (!pg.decor[i].auto) keep.push(pg.decor[i]);
    keep.push({ kind: "scrim", x: -0.05, y: 0.5, w: 1.1, h: 0.55, color: GOLD, auto: true });
    pg.decor = keep;
    return true;
  }
  function uncover(pg){
    if (!pg) return false;
    var o = curOcc(), ink = (o && o.ink) || INKS[0], i, tx, ys = { title: 0.12, subtitle: 0.22, quote: 0.88 };
    pg.auto = true; pg.bleed = false; pg.tplId = "";
    for (i=0;i<pg.texts.length;i++){
      tx = pg.texts[i]; if (!tx.cover) continue;
      tx.x = 0.5; tx.align = "center"; tx.color = ink; tx.w = 0; tx.cover = false;
      if (ys[tx.role] != null) tx.y = ys[tx.role];
    }
    clearDesign(pg);
    return true;
  }
  /* every page through the engine, without a render — makeAlbum and relayAlbum call this
     before their own render; the buttons call designAll */
  function designPagesQuiet(){
    var i, n = 0;
    for (i=0;i<DOC.pages.length;i++){
      if (i === 0){ if (DOC.cover && coverDesign(DOC.pages[0])) n++; else if (!DOC.cover && DOC.pages[0].bleed && DOC.pages[0].texts.some(function(t){ return t.cover; })) uncover(DOC.pages[0]); continue; }
      if (designPage(DOC.pages[i], i)) n++;
    }
    return n;
  }
  function designAll(){
    var n = designPagesQuiet();
    onDocChange(true);
    return n;
  }
  /* THE PAGES, LAID AGAIN. Every photograph out of every page in order, dealt back in by the
     occasion's plan at the album's DENSITY. The opener keeps its words and its cover; a closing
     page (words, no photograph) stays at the end; a designed album is designed again. */
  function relayAlbum(){
    var all = [], i, o = curOcc(), hadDesign = anyDesign(), tail = null, pg;
    for (i=0;i<DOC.pages.length;i++) all = all.concat(DOC.pages[i].photos);
    if (all.length < 2) return 0;
    var last = DOC.pages[DOC.pages.length-1];
    if (DOC.pages.length > 1 && !last.photos.length && last.texts.some(function(t){ return !!t.text; })) tail = last;
    var counts = planPages(all.length, o && o.plan, DOC.density), pages = [], at = 0, p0 = DOC.pages[0];
    for (i=0;i<counts.length;i++){ pg = blankPage(); pg.photos = all.slice(at, at + counts[i]); at += counts[i]; pages.push(pg); }
    pages[0].texts = p0.texts; pages[0].decor = p0.decor; pages[0].bleed = p0.bleed; pages[0].tplId = p0.tplId; pages[0].auto = p0.auto;
    if (tail) pages.push(tail);
    DOC.pages = pages;
    DOC.cur = clamp(DOC.cur, 0, pages.length-1);
    SEL = null;
    for (i=0;i<DOC.pages.length;i++) reAnchor(DOC.pages[i], i);
    if (hadDesign) designPagesQuiet();
    onDocChange(true);
    return pages.length;
  }

  /* ======================= THE PRINT CHECK (6.121.0, wave F) =======================

     What a print shop would send back, said before the file is made: a photograph stretched
     over a spread until it prints at 60 pixels to the inch, an empty page, a line sitting on
     the trim, one picture used on two pages, a face in the binding. Pure over a document and
     a size (drawPage's own maths: the same cell rectangles and the same cover crop), so the
     test measures the studio's rule rather than a copy of it. Every finding names its page. */
  function printCheck(doc, sz){
    var out = [], safe = safeArea(sz);
    if (!doc || !doc.pages || !safe) return out;
    var dpi = safe.page.dpi || 300, seen = {}, i, k;
    for (i=0;i<doc.pages.length;i++){
      var pg = doc.pages[i], hasText = false;
      for (k=0;k<(pg.texts||[]).length;k++) if (pg.texts[k] && pg.texts[k].text) hasText = true;
      if (!pg.photos.length){ if (!hasText) out.push({ page: i, kind: "empty" }); continue; }
      var tpl = pageTpl(pg, i), rects = cellRects(tpl, layoutRect(safe, pg)), mid = safe.x + safe.w/2;
      for (k=0;k<pg.photos.length && k<rects.length;k++){
        var ph = pg.photos[k], r = rects[k], a = ph.anchor || { x:0.5, y:0.5 };
        var fit = coverFit(ph.w, ph.h, r.w, r.h, a.x, a.y, ph.zoom);
        if (fit){
          var ppi = Math.round(dpi / fit.scale);
          if (ppi < PPI_LOW) out.push({ page: i, i: k, kind: "low", ppi: ppi });
          else if (ppi < PPI_SOFT) out.push({ page: i, i: k, kind: "soft", ppi: ppi });
          if (safe.gutter > 0 && ph.subject && r.x < mid && r.x + r.w > mid){
            var subX = r.x + (ph.subject.x*ph.w - fit.sx)*fit.scale;
            if (Math.abs(subX - mid) < safe.gutter*1.5) out.push({ page: i, i: k, kind: "gutter" });
          }
        }
        if (seen[ph.src] != null && seen[ph.src] !== i) out.push({ page: i, i: k, kind: "dup", other: seen[ph.src] });
        else if (seen[ph.src] == null) seen[ph.src] = i;
      }
      for (k=0;k<(pg.texts||[]).length;k++){
        var tx = pg.texts[k]; if (!tx || !tx.text) continue;
        if (tx.x < 0.03 || tx.x > 0.97 || tx.y < 0.03 || tx.y > 0.97) out.push({ page: i, i: k, kind: "edge" });
      }
    }
    return out;
  }

  /* ======================= THE TRAY, AND THE FRAME (6.121.0, wave F) =======================

     The video's photo tray: every photograph in the album with a number on it — how many pages
     use it — so a picture used twice, or not at all, is seen before the book is printed. Here the
     tray is DOC.pool: a photograph enters it when it is added by any door (a page, the tray's
     own button, Make the album) and stays until the ✕ takes it out of the tray AND off every
     page. Tapping a tray photograph puts it into the selected frame, or onto the open page. */
  function usage(){
    var m = {}, i, k, s;
    for (i=0;i<DOC.pages.length;i++) for (k=0;k<DOC.pages[i].photos.length;k++){
      s = DOC.pages[i].photos[k].src; if (!m[s]) m[s] = []; if (m[s].indexOf(i) < 0) m[s].push(i);
    }
    return m;
  }
  function inPool(src){ var i; for (i=0;i<DOC.pool.length;i++) if (DOC.pool[i].src === src) return i; return -1; }
  function clonePhoto(ph){
    return { src: ph.src, w: ph.w, h: ph.h, subject: ph.subject || null, anchor: { x:0.5, y:0.5 }, zoom: 1, manual: false, fx: ph.fx || "" };
  }
  function poolAdd(ph){ if (inPool(ph.src) < 0 && DOC.pool.length < MAXA){ DOC.pool.push(clonePhoto(ph)); return true; } return false; }
  /* a photograph read once, for any door: measured, its subject found */
  function readPhoto(src){
    return imgFor(src).then(function(im){
      if (!im) return null;
      var w = im.naturalWidth||im.width, h = im.naturalHeight||im.height;
      if (!(w>0 && h>0)) return null;
      return { src: src, w: w, h: h, subject: measureSubject(im, w, h), anchor: { x:0.5, y:0.5 }, zoom: 1, manual: false, fx: "" };
    });
  }
  function addToPool(items){
    var room = MAXA - DOC.pool.length, take = (items || []).slice(0, Math.max(0, room)), added = 0;
    if (!take.length){ H.toast(L("alb_make_cap").replace("{N}", String(MAXA)), ""); return Promise.resolve(0); }
    return take.reduce(function(chain, src){
      return chain.then(function(){ return readPhoto(src).then(function(ph){ if (ph && poolAdd(ph)) added++; }); });
    }, Promise.resolve()).then(function(){ return added; });
  }
  /* a tray photograph into the selected frame, else onto the open page */
  function placeFromTray(pi){
    var ph = DOC.pool[pi]; if (!ph) return false;
    var pg = curPage(), o = selObj();
    if (o && SEL.kind === "photo"){
      var fx = o.fx || "", cp = clonePhoto(ph); cp.fx = fx;
      pg.photos[SEL.i] = cp;
      reAnchor(pg, DOC.cur); onDocChange(false);
      H.toast(L("alb_replaced"), "ok");
      return true;
    }
    if (pg.photos.length >= pageMax(pg)){ H.toast(L("alb_photo_full"), ""); return false; }
    pg.photos.push(clonePhoto(ph));
    reAnchor(pg, DOC.cur); onDocChange(false);
    H.toast(L("alb_placed").replace("{P}", String(DOC.cur+1)), "ok");
    return true;
  }
  function removeEverywhere(src){
    var i, n = 0, keep;
    keep = []; for (i=0;i<DOC.pool.length;i++) if (DOC.pool[i].src !== src) keep.push(DOC.pool[i]); DOC.pool = keep;
    for (i=0;i<DOC.pages.length;i++){
      var b = DOC.pages[i].photos.length, k, kp = [];
      for (k=0;k<b;k++) if (DOC.pages[i].photos[k].src !== src) kp.push(DOC.pages[i].photos[k]);
      DOC.pages[i].photos = kp; n += b - kp.length;
    }
    SEL = null;
    onDocChange(true);
    return n;
  }
  function removeUnused(){
    var u = usage(), keep = [], i;
    for (i=0;i<DOC.pool.length;i++) if (u[DOC.pool[i].src]) keep.push(DOC.pool[i]);
    var n = DOC.pool.length - keep.length;
    DOC.pool = keep;
    if (n) onDocChange(false);
    return n;
  }
  /* the selected frame takes a new file; the frame's look stays */
  function replaceSelected(items){
    var o = selObj(), src = items && items[0];
    if (!o || SEL.kind !== "photo" || !src) return Promise.resolve(0);
    var pg = curPage(), at = SEL.i, fx = o.fx || "";
    return readPhoto(src).then(function(ph){
      if (!ph) return 0;
      ph.fx = fx;
      pg.photos[at] = ph;
      poolAdd(ph);
      reAnchor(pg, DOC.cur); onDocChange(false);
      H.toast(L("alb_replaced"), "ok");
      return 1;
    });
  }
  /* the selected photograph trades cells with its neighbour; the selection follows it */
  function swapSel(dir){
    var o = selObj(); if (!o || SEL.kind !== "photo") return false;
    var pg = curPage(), j = SEL.i + dir;
    if (j < 0 || j >= pg.photos.length) return false;
    pg.photos[SEL.i] = pg.photos[j]; pg.photos[j] = o;
    SEL = { kind: "photo", i: j };
    reAnchor(pg, DOC.cur); onDocChange(false);
    return true;
  }
  /* the selected photograph off the page (it stays in the tray); the selected line gone */
  function removeSelected(){
    var o = selObj(); if (!o) return false;
    var pg = curPage();
    if (SEL.kind === "photo") pg.photos.splice(SEL.i, 1);
    else if (SEL.kind === "decor") pg.decor.splice(SEL.i, 1);       /* 6.122.0 */
    else pg.texts.splice(SEL.i, 1);
    SEL = null;
    onDocChange(false);
    return true;
  }
  function setFx(fx){
    var o = selObj(); if (!o || SEL.kind !== "photo") return false;
    o.fx = (FX_LIST.indexOf(fx) >= 0) ? fx : "";
    touchChanged(false);
    return true;
  }
  /* the bar a long job shows — Make the album reads every photograph, forty of them on a phone
     is seconds — drawn once under the occasion card and removed when the count is reached */
  function progress(a, b, key){
    if (typeof document === "undefined") return;
    var box = document.getElementById("albProgress");
    if (!(b > 0) || a >= b){ if (box && box.parentNode) box.parentNode.removeChild(box); return; }
    if (!box){
      var host = document.getElementById("albOccCard") || ROOT; if (!host) return;
      box = E("div","alb-prog"); box.id = "albProgress";
      box.setAttribute("role","progressbar"); box.setAttribute("aria-valuemin","0"); box.setAttribute("aria-valuemax","100");
      var bar = E("div","alb-progbar"); bar.id = "albProgBar";
      var lab = E("p","alb-proglab"); lab.id = "albProgLab";
      box.appendChild(bar); box.appendChild(lab);
      host.appendChild(box);
    }
    var pct = Math.round(100*a/b), bar2 = document.getElementById("albProgBar"), lab2 = document.getElementById("albProgLab");
    if (bar2) bar2.style.width = pct + "%";
    box.setAttribute("aria-valuenow", String(pct));
    if (lab2) lab2.textContent = L(key || "alb_make_prog").replace("{A}", String(a+1)).replace("{B}", String(b));
  }

  /* ======================= THE CLOSING PAGE (6.106.0, wave D) =======================

     The studio signs its own work. A page with no photograph on it, carrying the studio's name in
     the album's own display face and the occasion's line under it, in the student's language and
     in the occasion's ink — the colophon a printed album ends on. It is an ordinary page after
     that: the words can be retyped, the ink changed, a photograph dropped onto it. */
  var STUDIO_MARK = "HNK Create Studio";
  function closingPage(){
    var o = curOcc(), pg = blankPage();
    pg.tplId = "f1i"; pg.auto = false;                  /* the opener template: type, room, no grid */
    var ink = (o && o.ink) || INKS[0];
    pg.texts.push({ role:"title", text: STUDIO_MARK, x:0.5, y:0.46, align:"center", color: ink, font:"" });
    if (o && o.note) pg.texts.push({ role:"caption", text: pick9(o.note), x:0.5, y:0.58, align:"center", color: ink, font:"" });
    return pg;
  }

  /* ======================= THE PRINT FILE (6.106.0, wave D) =======================

     Everything the album could make until now was a JPEG of one page: the right pixels inside a
     file no print shop accepts as artwork. This is the file they do accept.

     ONE PDF, EVERY PAGE, AT THE ALBUM'S OWN SIZE, and each page carries the three boxes a press
     operator reads before anything else:
       MediaBox   the sheet — the trim, plus the bleed, plus the room the marks need
       BleedBox   the trim grown by the bleed: exactly the pixels drawPage({bleed:true}) drew
       TrimBox    the finished page — where the guillotine lands
     with eight crop marks, a pair per corner, starting OUTSIDE the bleed so they never print on
     the artwork and always survive the cut.

     THE PHOTOGRAPHS ARE NOT RE-ENCODED. The page is drawn once at its real print size and handed
     to toDataURL("image/jpeg"); those same bytes become a /DCTDecode image stream. A PDF writer
     that decodes and re-encodes a JPEG throws away a generation of quality for nothing.

     There is no library here. A PDF is a byte file with a cross-reference table and the whole of
     one is below, so test/verify_album_output.js parses what comes out instead of trusting it. */

  var PDF_MARK_MM = 4;          /* how long a crop mark is */
  var PT_PER_IN = 72;           /* a PDF point */

  function u8s(str){ var i, a = new Uint8Array(str.length); for (i=0;i<str.length;i++) a[i] = str.charCodeAt(i) & 255; return a; }
  function b64Bytes(b64){
    var bin = atob(b64), i, a = new Uint8Array(bin.length);
    for (i=0;i<bin.length;i++) a[i] = bin.charCodeAt(i) & 255;
    return a;
  }
  function dataUrlBytes(url){
    var m = /^data:[^;,]*;base64,([\s\S]*)$/.exec(url || "");
    if (!m) return null;
    try { return b64Bytes(m[1]); } catch(e){ return null; }
  }
  /* PDF numbers: three decimals, no exponent, and never "100" written as "1" by a greedy strip */
  function nPdf(v){
    if (!isFinite(v)) v = 0;
    var s = (Math.round(v*1000)/1000).toFixed(3);
    if (s.indexOf(".") >= 0) s = s.replace(/0+$/, "").replace(/\.$/, "");
    return s;
  }
  function pdfText(s){ return String(s == null ? "" : s).replace(/[\\()]/g, "\\$&").replace(/[^\x20-\x7e]/g, "?"); }
  function joinBytes(list){
    var n = 0, i, at = 0;
    for (i=0;i<list.length;i++) n += list[i].length;
    var out = new Uint8Array(n);
    for (i=0;i<list.length;i++){ out.set(list[i], at); at += list[i].length; }
    return out;
  }

  /* shots: [{ jpeg: Uint8Array, w: px, h: px }] — one per album page, drawn WITH its bleed. */
  function pdfOfShots(shots, px, title){
    var dpi = px.dpi || 300, perPx = PT_PER_IN / dpi;
    var bleedPt = mmPx(D.bleedMm, dpi) * perPx;
    var markPt  = (PDF_MARK_MM / 25.4) * PT_PER_IN;
    var trimW = px.w * perPx, trimH = px.h * perPx;
    var O = bleedPt + markPt;                       /* the trim's own origin on the sheet */
    var sheetW = trimW + 2*O, sheetH = trimH + 2*O;

    var out = [], at = 0, xref = [];
    function put(a){ out.push(a); at += a.length; }
    function obj(n, body){ xref[n] = at; put(u8s(n + " 0 obj\n" + body + "\nendobj\n")); }
    function objStream(n, dict, bytes){
      xref[n] = at;
      put(u8s(n + " 0 obj\n" + dict + "\nstream\n"));
      put(bytes);
      put(u8s("\nendstream\nendobj\n"));
    }

    put(u8s("%PDF-1.4\n"));
    put(new Uint8Array([0x25, 0xE2, 0xE3, 0xCF, 0xD3, 0x0A]));   /* the binary comment every reader wants */

    var n = shots.length, i, kids = [];
    for (i=0;i<n;i++) kids.push((4 + i*3) + " 0 R");

    obj(1, "<< /Type /Catalog /Pages 2 0 R >>");
    obj(2, "<< /Type /Pages /Count " + n + " /Kids [" + kids.join(" ") + "] >>");
    /* 6.122.0 — the same block runs inside the Photoshop panel, which has no APP_VER; each surface names its own release */
    var ver = (typeof APP_VER === "string") ? APP_VER : ((typeof PANEL_VERSION === "string") ? PANEL_VERSION : "");
    obj(3, "<< /Producer (HNK Create Studio " + pdfText(ver) + ") /Creator (HNK Create Studio) /Title (" + pdfText(title || "HNK album") + ") >>");

    for (i=0;i<n;i++){
      var P = 4 + i*3, C = 5 + i*3, X = 6 + i*3, sh = shots[i];
      /* the artwork sits on the BleedBox, which is where drawPage's extra margin already put it */
      var bx = markPt, by = markPt, bw = trimW + 2*bleedPt, bh = trimH + 2*bleedPt;
      var body = "q\n" + nPdf(bw) + " 0 0 " + nPdf(bh) + " " + nPdf(bx) + " " + nPdf(by) + " cm\n/Im0 Do\nQ\n";
      /* the marks: outside the bleed on every side, so the cut goes through the corner of a pair */
      var L = O, R = O + trimW, B = O, T = O + trimH, g = bleedPt, m = markPt, lines = [
        [0, B, m, B], [L, 0, L, m],
        [R + g, B, sheetW, B], [R, 0, R, m],
        [0, T, m, T], [L, T + g, L, sheetH],
        [R + g, T, sheetW, T], [R, T + g, R, sheetH]
      ], k;
      body += "q\n0 G\n0.4 w\n";
      for (k=0;k<lines.length;k++){
        body += nPdf(lines[k][0]) + " " + nPdf(lines[k][1]) + " m " + nPdf(lines[k][2]) + " " + nPdf(lines[k][3]) + " l S\n";
      }
      body += "Q\n";
      var cs = u8s(body);
      obj(P, "<< /Type /Page /Parent 2 0 R" +
             " /MediaBox [0 0 " + nPdf(sheetW) + " " + nPdf(sheetH) + "]" +
             " /BleedBox [" + nPdf(O-g) + " " + nPdf(O-g) + " " + nPdf(R+g) + " " + nPdf(T+g) + "]" +
             " /TrimBox [" + nPdf(L) + " " + nPdf(B) + " " + nPdf(R) + " " + nPdf(T) + "]" +
             " /Resources << /XObject << /Im0 " + X + " 0 R >> /ProcSet [/PDF /ImageC] >>" +
             " /Contents " + C + " 0 R >>");
      objStream(C, "<< /Length " + cs.length + " >>", cs);
      objStream(X, "<< /Type /XObject /Subtype /Image /Width " + sh.w + " /Height " + sh.h +
                   " /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length " + sh.jpeg.length + " >>", sh.jpeg);
    }

    var count = 4 + n*3, startx = at, rows = "xref\n0 " + count + "\n0000000000 65535 f \n";
    for (i=1;i<count;i++){
      var off = xref[i] || 0, s = String(off);
      while (s.length < 10) s = "0" + s;
      rows += s + " 00000 n \n";
    }
    put(u8s(rows));
    put(u8s("trailer\n<< /Size " + count + " /Root 1 0 R /Info 3 0 R >>\nstartxref\n" + startx + "\n%%EOF\n"));
    return joinBytes(out);
  }

  /* ======================= THE LAYERED FILE (6.106.0, wave D) =======================

     A PDF is finished work. A retoucher who has to nudge one photograph or reset one line wants
     the page BEFORE it was finished, and that is a .psd: a white base, one layer per photograph,
     one layer per line of type, every one of them still its own object.

     The canvas is the TRIM — the page as it will be cut, not the sheet — because this is the
     artwork document, not the press file. Layers are clipped to it; a bleeding photograph simply
     runs off the edge of the document, which is what it does on paper.

     Written byte by byte: an 8BPS header, the resolution block so Photoshop opens it at the right
     DPI, the layer records, every channel PackBits-compressed, and the flattened composite that a
     reader without layer support shows. The test reads the file back with ag-psd — an
     implementation that owes nothing to this one — and compares names, rectangles and pixels. */

  /* The ceilings are in BYTES, not in pixels, because bytes are what a browser runs out of.
     A twelve-by-thirty-six panorama is only 38 megapixels and would pass any pixel ceiling
     worth setting; the layered file it makes is a quarter of a gigabyte, and no phone is
     going to hold that. The estimate below is what the student is shown and what these two
     numbers are compared against, so the warning and the refusal say the same thing the
     button says. */
  var PSD_SOFT_MB = 80;         /* above this the student is told the size and asked */
  var PSD_HARD_MB = 220;        /* above this no browser is going to hold the file: say so */

  function ByteBag(){ this.a = new Uint8Array(1 << 16); this.n = 0; }
  ByteBag.prototype.need = function(k){
    if (this.n + k <= this.a.length) return;
    var cap = this.a.length;
    while (cap < this.n + k) cap *= 2;
    var b = new Uint8Array(cap); b.set(this.a.subarray(0, this.n)); this.a = b;
  };
  ByteBag.prototype.byte = function(v){ this.need(1); this.a[this.n++] = v & 255; };
  ByteBag.prototype.put = function(src, off, n){ this.need(n); this.a.set(src.subarray(off, off+n), this.n); this.n += n; };
  ByteBag.prototype.take = function(){ return this.a.subarray(0, this.n); };

  /* PackBits, the run-length coding every PSD channel is written in. A run of three or more equal
     bytes is worth a two-byte code; anything shorter stays literal, because a two-byte run inside
     a literal stretch costs a byte to leave and a byte to come back. */
  function packRow(src, n, bag){
    var i = 0, was = bag.n;
    while (i < n){
      var run = 1;
      while (i + run < n && src[i+run] === src[i] && run < 128) run++;
      if (run >= 3){ bag.byte(257 - run); bag.byte(src[i]); i += run; }
      else {
        var st = i, lit = 0;
        while (i < n && lit < 128){
          if (i + 2 < n && src[i] === src[i+1] && src[i] === src[i+2]) break;
          i++; lit++;
        }
        bag.byte(lit - 1);
        bag.put(src, st, lit);
      }
    }
    return bag.n - was;
  }
  /* One canvas, however tall, read a band at a time and split into PSD channels. The band keeps
     the ImageData small: a full-size album page read in one call is hundreds of megabytes. */
  function rleCanvas(cv, order){
    var w = cv.width, h = cv.height, x = cv.getContext("2d");
    var nch = order.length, bags = [], counts = [], c;
    for (c=0;c<nch;c++){ bags.push(new ByteBag()); counts.push(new Uint16Array(h)); }
    var row = new Uint8Array(w), y = 0;
    var band = Math.max(1, Math.min(h, Math.floor(4e6 / Math.max(1, w))));
    while (y < h){
      var rows = Math.min(band, h - y);
      var d = x.getImageData(0, y, w, rows).data, r, i;
      for (c=0;c<nch;c++){
        var comp = order[c];
        for (r=0;r<rows;r++){
          var base = r*w*4 + comp;
          for (i=0;i<w;i++) row[i] = d[base + i*4];
          counts[c][y+r] = packRow(row, w, bags[c]);
        }
      }
      y += rows;
    }
    return { w: w, h: h, counts: counts, bags: bags };
  }
  function chanBytes(rle, c){
    var h = rle.h, head = new Uint8Array(2 + 2*h), i, k = 0;
    head[k++] = 0; head[k++] = 1;                      /* compression 1 = RLE */
    for (i=0;i<h;i++){ head[k++] = (rle.counts[c][i] >> 8) & 255; head[k++] = rle.counts[c][i] & 255; }
    return joinBytes([head, rle.bags[c].take()]);
  }
  function be16(v){ return new Uint8Array([(v>>8)&255, v&255]); }
  function be32(v){ return new Uint8Array([(v>>>24)&255, (v>>>16)&255, (v>>>8)&255, v&255]); }
  function pascal4(name){
    var s = String(name).replace(/[^\x20-\x7e]/g, "?").slice(0, 63);
    var len = 1 + s.length, pad = (4 - (len % 4)) % 4;
    var a = new Uint8Array(len + pad), i;
    a[0] = s.length;
    for (i=0;i<s.length;i++) a[1+i] = s.charCodeAt(i) & 255;
    return a;
  }

  /* THE LAYERS OF ONE PAGE, bottom to top: the white base, then each photograph in its own cell,
     then each line of type in a band of its own. Each one knows its rectangle and how to paint
     itself into a canvas of exactly that rectangle. */
  function pageLayers(pg, idx){
    var sz = curSize(), safe = safeArea(sz);
    if (!safe) return [];
    var W = safe.page.w, Hh = safe.page.h;
    var lay = layoutRect(safe, pg), tpl = pageTpl(pg, idx), rects = cellRects(tpl, lay);
    var out = [], i;
    out.push({ name: "Background", rect: { l:0, t:0, r:W, b:Hh }, flat: (DOC && DOC.paper) || "#ffffff" });
    /* 6.125.0 wave I — the sheet's own background photograph, and the template's picture under the frames */
    if (bgOf(pg)) out.push({ name: "Sheet background", rect: { l:0, t:0, r:W, b:Hh }, paint: function(x){ drawSheetBg(x, pg, safe, 1, 0); } });
    var libR = libRec(pg.lib);
    if (libR) out.push({ name: "Template background", rect: { l:0, t:0, r:W, b:Hh }, paint: function(x){ drawLibUnder(x, pg, safe, 1, 0); } });
    var photos = pg.photos.slice(0, rects.length);
    for (i=0;i<photos.length;i++){
      (function(ph, r, at){
        /* the rectangle is ROUNDED, not floored and ceiled, and the photograph is drawn to fill
           exactly that: an outward round leaves a one-pixel transparent seam down every join
           between two cells, which is a hairline of nothing in the middle of a printed page. */
        var l0 = Math.round(r.x), t0 = Math.round(r.y);
        var r0 = Math.round(r.x + r.w), b0 = Math.round(r.y + r.h);
        var l = Math.max(0, l0), t = Math.max(0, t0), rr = Math.min(W, r0), bb = Math.min(Hh, b0);
        if (!(rr > l && bb > t)) return;
        out.push({ name: "Photo " + (at+1), rect: { l:l, t:t, r:rr, b:bb }, paint: function(x){
          var im = IMGS[ph.src];
          if (!im) return;
          var a = ph.anchor || { x:0.5, y:0.5 };
          var fit = coverFit(im.naturalWidth||im.width, im.naturalHeight||im.height, r.w, r.h, a.x, a.y, ph.zoom);
          if (!fit) return;
          drawPhotoFx(x, im, fit, l0 - l, t0 - t, r0 - l0, b0 - t0, ph.fx);   /* 6.121.0 — the layer wears the look too */
        } });
      })(photos[i], rects[i], i);
    }
    /* 6.125.0 wave I — the template's own layers above the frames */
    if (libR && libR.fg && !libR.builtin) out.push({ name: "Template layers", rect: { l:0, t:0, r:W, b:Hh }, paint: function(x){ drawLibOver(x, pg, safe, 1, 0); } });
    /* 6.121.0 — the design's rules and scrims, one layer of their own between the photographs
       and the type, so a retoucher can switch them off in Photoshop without losing a word */
    if (pg.decor && pg.decor.length){
      out.push({ name: "Design", rect: { l:0, t:0, r:W, b:Hh }, paint: function(x){ drawDecor(x, pg, safe, 1, 0); } });
    }
    var texts = pg.texts || [];
    for (i=0;i<texts.length;i++){
      (function(tx, at){
        /* placeholder kept in order: the type layers come next */
        if (!tx || !tx.text) return;
        var role = null, k;
        for (k=0;k<D.roles.length;k++) if (D.roles[k].id === tx.role) role = D.roles[k];
        if (!role) return;
        var size = Math.max(8, role.size * safe.h * clamp(+tx.size || 1, TEXT_MIN, TEXT_MAX));
        var cy = safe.y + safe.h*((tx.y==null)?0.92:tx.y);
        /* 6.121.0 — a wrapped block is taller than a line: give the layer the whole block plus a line each side */
        var half = size*1.4 + (tx.w > 0 ? size*1.32*3 : 0);
        var t = Math.max(0, Math.floor(cy - half)), b = Math.min(Hh, Math.ceil(cy + half));
        if (!(b > t)) return;
        out.push({ name: role.id.charAt(0).toUpperCase() + role.id.slice(1), rect: { l:0, t:t, r:W, b:b }, paint: function(x){
          x.translate(0, -t);
          drawTexts(x, { texts: [tx] }, safe, 1, 0);
        } });
      })(texts[i], i);
    }
    /* 6.122.0 — THE OVERLAY. A texture needs the page beneath it to blend with, so its layer is
       the finished page with the texture on: switch it off in Photoshop and the clean layers
       below are there to work on. It is the top layer and it is named for what it is. */
    if (pg.overlay && pg.overlay.id && ovlById(pg.overlay.id)){
      out.push({ name: "Overlay (flat)", rect: { l:0, t:0, r:W, b:Hh }, paint: function(x){ paintPageSync(x, pg, idx, safe, 1, 0); } });
    }
    return out;
  }
  /* estimated bytes on disk: the composite plus every layer's own rectangle, four channels each,
     with the compression PackBits actually gets on photographs */
  function psdEstimate(pg, idx){
    var sz = curSize(), px = pagePx(sz);
    if (!px) return 0;
    var total = px.w*px.h*3, list = pageLayers(pg, idx), i;
    for (i=0;i<list.length;i++){
      var r = list[i].rect;
      total += (r.r - r.l) * (r.b - r.t) * (list[i].flat ? 0.02 : 4);
    }
    return Math.round(total * 0.92);
  }
  function psdOfPage(idx){
    var pg = DOC.pages[idx], sz = curSize(), px = pagePx(sz);
    if (!pg || !px) return Promise.resolve(null);
    /* the same gate drawPage uses: no layer is painted before its face and its photograph are in */
    return libLoad(pg.lib).then(function(){ return fontsReady(pg); }).then(function(){   /* 6.125.0 — and its template */
      return Promise.all((pg.photos||[]).map(function(p){ return imgFor(p.src); }));
    }).then(function(){ return decorImgs(pg); })                 /* 6.122.0 — the ornaments' masks and the texture */
      .then(function(){ return psdBuild(pg, idx, px); });
  }
  function psdBuild(pg, idx, px){
    var list = pageLayers(pg, idx);
    if (!list.length) return Promise.resolve(null);
    var records = [], channels = [];
    /* the layers, one at a time, so only one page-sized canvas is alive at any moment */
    function layerAt(i){
      if (i >= list.length) return Promise.resolve(true);
      var L = list[i], r = L.rect, w = r.r - r.l, h = r.b - r.t;
      var cv = document.createElement("canvas");
      cv.width = w; cv.height = h;
      var x = cv.getContext("2d");
      if (!x) return Promise.reject(new Error("no renderer"));
      if (L.flat){ x.fillStyle = L.flat; x.fillRect(0, 0, w, h); }
      else { x.save(); try { L.paint(x); } catch(e){} x.restore(); }
      var rle = rleCanvas(cv, [3, 0, 1, 2]);           /* alpha first, then R G B — the PSD order */
      cv.width = cv.height = 1;                         /* let the renderer drop it now */
      var ids = [-1, 0, 1, 2], blocks = [], c;
      for (c=0;c<4;c++) blocks.push(chanBytes(rle, c));
      var info = [];
      for (c=0;c<4;c++) info.push(joinBytes([be16(ids[c] & 0xffff), be32(blocks[c].length)]));
      var name = pascal4(L.name);
      var extra = joinBytes([be32(0), be32(0), name]);
      records.push(joinBytes([
        be32(r.t), be32(r.l), be32(r.b), be32(r.r),
        be16(4), joinBytes(info),
        u8s("8BIMnorm"), new Uint8Array([255, 0, 0, 0]),
        be32(extra.length), extra
      ]));
      for (c=0;c<4;c++) channels.push(blocks[c]);
      return new Promise(function(go){ setTimeout(go, 0); }).then(function(){ return layerAt(i+1); });
    }
    return layerAt(0).then(function(){
      /* the flattened page, which is what a reader without layer support shows */
      var flat = document.createElement("canvas");
      return drawPage(flat, pg, idx, { scale: 1, guides: false }).then(function(){
        var merged = rleCanvas(flat, [0, 1, 2]);
        flat.width = flat.height = 1;
        var h = px.h, cnt = new Uint8Array(2 + 2*h*3), k = 0, c, i;
        cnt[k++] = 0; cnt[k++] = 1;
        for (c=0;c<3;c++) for (i=0;i<h;i++){ cnt[k++] = (merged.counts[c][i] >> 8) & 255; cnt[k++] = merged.counts[c][i] & 255; }
        var mergedBytes = [cnt];
        for (c=0;c<3;c++) mergedBytes.push(merged.bags[c].take());

        var layerBody = joinBytes([be16(records.length), joinBytes(records), joinBytes(channels)]);
        if (layerBody.length % 2) layerBody = joinBytes([layerBody, new Uint8Array(1)]);
        var layerSection = joinBytes([be32(layerBody.length), layerBody, be32(0)]);

        /* the one image resource that matters: what DPI this document is */
        var res = joinBytes([
          u8s("8BIM"), be16(1005), new Uint8Array([0, 0]), be32(16),
          be32((px.dpi|0) << 16), be16(1), be16(1),
          be32((px.dpi|0) << 16), be16(1), be16(1)
        ]);
        var header = joinBytes([
          u8s("8BPS"), be16(1), new Uint8Array(6),
          be16(3), be32(px.h), be32(px.w), be16(8), be16(3)
        ]);
        return joinBytes([header, be32(0), be32(res.length), res,
                          be32(layerSection.length), layerSection].concat(mergedBytes));
      });
    });
  }

  /* ======================= 6.125.0 WAVE I — THE TEMPLATE LIBRARY =======================

     The owner's two SS Album recordings: a LIBRARY of layered PSD templates the studio has bought
     or drawn — imported one file or one folder at a time, sorted into groups (prewedding · wedding ·
     engagement · baby · yearbook · family · standee), starred, binned, searched — and an album BUILT
     from it: so many sheets, so many photographs a sheet, by group or at random, the couple's names
     and the date set into every template's own text slots, then checked. Here the same, and more:
     the PSD is read IN THE PAGE (psdTemplate below — no server, no library, a file never leaves the
     device), twelve standee designs ship built in, the library survives a relaunch in the host's own
     store as one index record plus one record a template, and a page laid from a template keeps
     every move the rest of this module knows — its frames are cells, its slots are lines.

     EVERY FRAME IS A FRACTION OF THE PAGE (0..1 of the trim), as every layout is a fraction of the
     safe area: one template drawn for 30×30 lays the same way on 12×36 and on a 60×200 standee. */
  var LIBD = D.lib || { max: 400, preview: 2000, previewPrint: 3000, thumb: 320, maxPhotos: 8, fileMax: 400*1024*1024, photoWords: [], textWords: [] };
  var LIB_MAXP = LIBD.maxPhotos || 8;
  var LIB_KEY = "hnk_album_lib_v1";
  var LIB_PAGE = 24;                 /* tiles a page of the library shows */
  var LIBI = null;                   /* the index: { v, items:[…], b:{ builtinId:{ star, trash } } } */
  var LIBR = {};                     /* records read from the store, by id */
  var LIBP = {};                     /* reads in flight, by id */
  var LIBT = {};                     /* tile pictures (data URLs) by id, standees drawn once */
  var LIBV = { group: "*", orient: "", n: 0, star: false, trash: false, q: "", page: 0, sel: {}, build: false, busy: null, last: null, ai: null };
  var STANDEES = D.standees || [], SD_WORDS = D.standeeWords || {}, LIB_GROUPS = D.libGroups || [];
  var MARKS = D.marks || { date: [], mono: [] }, TEXT_STYLES = D.textStyles || [];
  var LIB_ORIENTS = ["land", "port", "sq"];

  function libBlank(){ return { v: 1, items: [], b: {} }; }
  function sdById(id){ var i; for (i=0;i<STANDEES.length;i++) if (STANDEES[i].id === id) return STANDEES[i]; return null; }
  function libGroupById(id){ var i; for (i=0;i<LIB_GROUPS.length;i++) if (LIB_GROUPS[i].id === id) return LIB_GROUPS[i]; return null; }
  function libGroupLabel(id){
    if (!id) return L("alb_lib_ungrouped");
    var g = libGroupById(id); if (!g) return id;
    if (g.occ){ var o = occById(g.occ); if (o && o.name) return pick9(o.name); }
    return pick9(g.label || {}) || id;
  }
  function orientOf(w, h){ return (w > h*1.05) ? "land" : (h > w*1.05) ? "port" : "sq"; }
  function libKey(id){ return LIB_KEY + ":" + id; }
  function libNewId(){ return "t" + Date.now().toString(36) + Math.floor(Math.random()*46656).toString(36); }
  /* a saved index is never trusted blind: an id that is not one, a group this build no longer ships, a count past the ceiling */
  function normLib(x){
    var out = libBlank(), list = (x && x.items && x.items.length) ? x.items : [], i, seen = {};
    for (i=0;i<list.length && out.items.length<(LIBD.max||400);i++){
      var it = list[i]; if (!it || typeof it.id !== "string" || !/^[a-z0-9]{3,24}$/.test(it.id) || seen[it.id]) continue;
      seen[it.id] = true;
      out.items.push({ id: it.id, name: String(it.name || "").slice(0, 60), group: libGroupById(it.group) ? it.group : "",
                       orient: (LIB_ORIENTS.indexOf(it.orient) >= 0) ? it.orient : "port", n: clamp(it.n|0, 0, LIB_MAXP),
                       w: Math.max(1, it.w|0), h: Math.max(1, it.h|0), dpi: clamp(it.dpi|0 || 300, 72, 1200),
                       star: !!it.star, trash: !!it.trash, added: +it.added || 0, kind: (it.kind === "json") ? "json" : "psd", texts: Math.max(0, it.texts|0) });
    }
    var b = (x && x.b && typeof x.b === "object") ? x.b : {}, k;
    for (k in b) if (Object.prototype.hasOwnProperty.call(b, k) && sdById(k)) out.b[k] = { star: !!b[k].star, trash: !!b[k].trash };
    return out;
  }
  function saveLib(){ if (!H || typeof H.store !== "function" || !LIBI) return; try { H.store(LIB_KEY, LIBI); } catch(e){} }
  function libLoadIndex(){
    if (LIBI) return Promise.resolve(LIBI);
    if (!H || typeof H.restore !== "function"){ LIBI = libBlank(); return Promise.resolve(LIBI); }
    return Promise.resolve().then(function(){ return H.restore(LIB_KEY); }).then(function(x){ LIBI = normLib(x); return LIBI; })
      .catch(function(){ LIBI = libBlank(); return LIBI; });
  }
  function libItem(id){ var i; if (!LIBI) return null; for (i=0;i<LIBI.items.length;i++) if (LIBI.items[i].id === id) return LIBI.items[i]; return null; }
  /* the library as one list: the twelve built-in standees first, then what the studio imported */
  function libItems(){
    var out = [], i, sd, meta;
    for (i=0;i<STANDEES.length;i++){
      sd = STANDEES[i]; meta = (LIBI && LIBI.b[sd.id]) || {};
      out.push({ id: sd.id, name: sdName(sd, i), group: "standee", orient: "port", n: sd.n, w: 600, h: 2000, dpi: 150,
                 star: !!meta.star, trash: !!meta.trash, added: 0, kind: "standee", texts: sd.texts.length, builtin: true });
    }
    if (LIBI) for (i=0;i<LIBI.items.length;i++) out.push(LIBI.items[i]);
    return out;
  }
  function sdName(sd, i){
    var k, t;
    for (k=0;k<sd.texts.length;k++){ t = sd.texts[k]; if (t.word && SD_WORDS[t.word] && t.word !== "and") return pick9(SD_WORDS[t.word]); }
    return L("alb_lib_sd").replace("{N}", String(i+1));
  }
  /* a standee design as a record: its frames are page fractions already; its slots carry the album's own words */
  function sdRec(sd){
    if (!sd) return null;
    if (LIBR[sd.id]) return LIBR[sd.id];
    var texts = [], i, t;
    for (i=0;i<sd.texts.length;i++){
      t = sd.texts[i];
      texts.push({ role: t.role, text: t.word ? pick9(SD_WORDS[t.word] || {}) : "", x: t.x + t.w/2, y: t.y + t.h/2, w: t.w, rel: t.h, align: t.align || "center", color: "", font: "", word: t.word || "" });
    }
    LIBR[sd.id] = { id: sd.id, builtin: true, look: sd.look || "editorial", frames: sd.cells, texts: texts, w: 600, h: 2000, n: sd.n, bg: "", fg: "" };
    return LIBR[sd.id];
  }
  function libRec(id){ if (!id) return null; var sd = sdById(id); if (sd) return sdRec(sd); return LIBR[id] || null; }
  /* a record read once from the store; a page that names a template nobody has any more draws as a plain page */
  function libLoad(id){
    if (!id) return Promise.resolve(null);
    var r = libRec(id); if (r) return Promise.resolve(r);
    if (LIBP[id]) return LIBP[id];
    if (!H || typeof H.restore !== "function") return Promise.resolve(null);
    LIBP[id] = Promise.resolve().then(function(){ return H.restore(libKey(id)); }).then(function(rec){
      delete LIBP[id];
      if (rec && rec.frames && rec.frames.length){ LIBR[id] = normRec(rec, id); return LIBR[id]; }
      return null;
    }).catch(function(){ delete LIBP[id]; return null; });
    return LIBP[id];
  }
  function normRec(rec, id){
    var out = { id: id, frames: [], texts: [], w: Math.max(1, rec.w|0), h: Math.max(1, rec.h|0), dpi: rec.dpi|0 || 300,
                bg: (typeof rec.bg === "string" && /^data:image\//.test(rec.bg)) ? rec.bg : "",
                fg: (typeof rec.fg === "string" && /^data:image\//.test(rec.fg)) ? rec.fg : "",
                thumb: (typeof rec.thumb === "string" && /^data:image\//.test(rec.thumb)) ? rec.thumb : "",
                fonts: rec.fonts || [], fontsMissing: rec.fontsMissing || [], warn: rec.warn || [] }, i, f, t;
    for (i=0;i<rec.frames.length && out.frames.length<LIB_MAXP;i++){
      f = rec.frames[i]; if (!f || !(isFinite(f.x) && isFinite(f.y) && f.w > 0 && f.h > 0)) continue;
      out.frames.push({ x: clamp(+f.x, -0.2, 1.2), y: clamp(+f.y, -0.2, 1.2), w: clamp(+f.w, 0.01, 1.4), h: clamp(+f.h, 0.01, 1.4) });
    }
    for (i=0;i<(rec.texts||[]).length && out.texts.length<12;i++){
      t = rec.texts[i]; if (!t || !roleById(t.role)) continue;
      out.texts.push({ role: t.role, text: String(t.text || "").slice(0, 120), x: isFinite(t.x) ? clamp(+t.x, 0, 1) : 0.5, y: isFinite(t.y) ? clamp(+t.y, 0, 1) : 0.9,
                       w: isFinite(t.w) ? clamp(+t.w, 0, 1) : 0, rel: isFinite(t.rel) ? clamp(+t.rel, 0.005, 0.3) : 0.03, align: t.align || "center",
                       color: (typeof t.color === "string" && /^#[0-9a-fA-F]{6}$/.test(t.color)) ? t.color : "", font: (t.font && fontById(t.font)) ? t.font : "" });
    }
    return out;
  }
  /* every template an album names, read before the album is drawn — so a reopened album draws its
     frames the first time, not the second */
  function libPreload(doc){
    var ids = {}, i, jobs = [];
    if (doc && doc.pages) for (i=0;i<doc.pages.length;i++) if (doc.pages[i].lib && !ids[doc.pages[i].lib]){ ids[doc.pages[i].lib] = true; jobs.push(libLoad(doc.pages[i].lib)); }
    return Promise.all(jobs);
  }
  /* THE TEMPLATE A PAGE IS LAID FROM, as a layout: its frames are the cells, page fractions through
     a page-sized layout rectangle (layoutRect knows) */
  function libTpl(pg){
    if (!pg || !pg.lib) return null;
    var r = libRec(pg.lib); if (!r || !r.frames || !r.frames.length) return null;
    return { id: "lib:" + pg.lib, n: r.frames.length, cells: r.frames, fam: "lib", lib: true };
  }
  /* how many photographs THIS page may hold: eight from a template, six from a layout */
  function pageMax(pg){ return (pg && pg.lib && libTpl(pg)) ? LIB_MAXP : MAXP; }

  /* ---- the standee's look: the paper it stands on, drawn under its frames ---- */
  var LOOK_INK = { editorial: ["#f6f1e7", "#b08d57"], classic: ["#ffffff", "#8a6a3b"], minimal: ["#ffffff", "#1b1b1f"], script: ["#fbf5ee", "#7a2f36"] };
  function drawLook(x, look, X, Y, W, Hh){
    var c = LOOK_INK[look] || LOOK_INK.editorial;
    x.save();
    x.fillStyle = c[0]; x.fillRect(X, Y, W, Hh);
    x.strokeStyle = c[1]; x.globalAlpha = 0.9;
    var inset = Math.max(2, W*0.035), lw = Math.max(1, W*0.004);
    x.lineWidth = lw;
    if (look === "classic"){ x.strokeRect(X + inset, Y + inset, W - 2*inset, Hh - 2*inset); x.lineWidth = lw*0.5; x.strokeRect(X + inset*1.6, Y + inset*1.6, W - 3.2*inset, Hh - 3.2*inset); }
    else if (look === "editorial"){ x.fillStyle = c[1]; x.fillRect(X + inset, Y + Hh - inset*1.4, W - 2*inset, lw*1.5); x.fillRect(X + inset, Y + inset*0.9, W*0.18, lw*1.5); }
    else if (look === "script"){ x.globalAlpha = 0.18; x.fillStyle = c[1]; x.beginPath(); x.arc(X + W*0.5, Y + Hh*0.985, W*0.42, Math.PI, 0); x.fill(); x.globalAlpha = 0.9; x.beginPath(); x.moveTo(X + inset, Y + Hh - inset*2); x.lineTo(X + W - inset, Y + Hh - inset*2); x.stroke(); }
    else { x.fillStyle = c[1]; x.fillRect(X + W*0.44, Y + Hh - inset*1.6, W*0.12, lw*2); }
    x.restore();
  }
  /* a template's picture under the frames (its flattened background, or a standee's paper) and over them (its layers above the lowest frame) */
  function libDrawImg(x, im, safe, scale, m){
    var W = (safe.page.w + 2*m)*scale, Hh = (safe.page.h + 2*m)*scale, iw = im.naturalWidth || im.width, ih = im.naturalHeight || im.height;
    if (!(iw > 0 && ih > 0)) return;
    /* the template was drawn for the trim; it is stretched to the trim and grown by the bleed the same way on every side */
    var tx = m*scale, ty = m*scale, tw = safe.page.w*scale, th = safe.page.h*scale;
    x.drawImage(im, tx - m*scale, ty - m*scale, tw + 2*m*scale, th + 2*m*scale);
  }
  function drawLibUnder(x, pg, safe, scale, m){
    var r = libRec(pg && pg.lib); if (!r) return;
    if (r.builtin){ drawLook(x, r.look, 0, 0, (safe.page.w + 2*m)*scale, (safe.page.h + 2*m)*scale); return; }
    var im = r.bg ? IMGS[r.bg] : null; if (im) libDrawImg(x, im, safe, scale, m);
  }
  function drawLibOver(x, pg, safe, scale, m){
    var r = libRec(pg && pg.lib); if (!r || r.builtin || !r.fg) return;
    var im = IMGS[r.fg]; if (im) libDrawImg(x, im, safe, scale, m);
  }

  /* ---- a template onto the open page ---- */
  var INFO_KEYS = ["bride", "groom", "date", "venue"];
  function infoOf(){ if (!DOC.info) DOC.info = { bride: "", groom: "", date: "", venue: "" }; return DOC.info; }
  function namesLine(){ var f = infoOf(), a = (f.bride || "").trim(), b = (f.groom || "").trim(); return a && b ? a + " " + (pick9(SD_WORDS.and || {}) || "&") + " " + b : (a || b); }
  /* what a template's slot says on THIS album: the couple, the date, the venue, or the slot's own words */
  function slotText(t){
    var f = infoOf();
    if (t.role === "names") return namesLine() || t.text || "";
    if (t.role === "date") return (f.date || "").trim() || t.text || "";
    if (t.role === "caption" && (f.venue || "").trim()) return f.venue.trim();
    return t.text || "";
  }
  function slotTexts(rec, pg){
    var out = [], have = {}, i, t, o = curOcc(), ink = (o && o.ink) || INKS[0], sz = curSize(), safe = safeArea(sz);
    for (i=0;i<(pg.texts||[]).length;i++) if (pg.texts[i].text && !pg.texts[i].auto) have[pg.texts[i].role] = true;
    for (i=0;i<rec.texts.length && out.length + (pg.texts||[]).length < D.roles.length;i++){
      t = rec.texts[i]; if (have[t.role]) continue;
      var words = slotText(t); if (!words) continue;
      var role = roleById(t.role); if (!role) continue;
      /* the slot's height is a fraction of the page; the role draws at role.size × the safe height × size — solve for size */
      var size = (safe && t.rel > 0) ? clamp((t.rel * safe.page.h * 0.72) / (role.size * safe.h), TEXT_MIN, TEXT_MAX) : 1;
      out.push({ role: t.role, text: String(words).slice(0, 120), x: t.x, y: t.y, align: t.align || "center", color: t.color || ink, font: t.font || "", size: size, rot: 0, w: t.w > 0.2 ? t.w : 0, auto: true, cover: false });
      have[t.role] = true;
    }
    return out;
  }
  function applyLib(id, quiet){
    var rec = libRec(id); if (!rec || !DOC) return false;
    var pg = curPage(), sd = sdById(id);
    if (DOC.view !== "page") DOC.view = "page";
    pg.lib = id; pg.auto = false; pg.tplId = ""; pg.bleed = false;
    /* the engine's own lines make way for the template's slots; typed lines stay */
    clearDesign(pg);
    pg.texts = (pg.texts || []).concat(slotTexts(rec, pg)).slice(0, D.roles.length);
    /* frames past the photographs it has are filled from the tray's unused pictures */
    var u = usage(), i, need = rec.frames.length - pg.photos.length;
    for (i=0;i<DOC.pool.length && need>0;i++) if (!(u[DOC.pool[i].src] || []).length){ pg.photos.push(clonePhoto(DOC.pool[i])); need--; }
    if (pg.photos.length > rec.frames.length) pg.photos = pg.photos.slice(0, rec.frames.length);
    reAnchor(pg, DOC.cur);
    onDocChange(false);
    if (!quiet){
      H.toast(L("alb_lib_applied").replace("{N}", String(rec.frames.length)), "ok");
      if (sd && curSize().group !== "standee") H.toast(L("alb_lib_sd_size"), "");
    }
    return true;
  }
  function clearLib(){ var pg = curPage(); if (!pg.lib) return false; pg.lib = ""; pg.auto = true; clearDesign(pg); onDocChange(false); return true; }

  /* ---- the library card ---- */
  function libGroupsAll(){
    var out = [""], i;
    for (i=0;i<LIB_GROUPS.length;i++) out.push(LIB_GROUPS[i].id);
    return out;
  }
  function libFiltered(){
    var all = libItems(), out = [], i, it, q = (LIBV.q || "").toLowerCase();
    for (i=0;i<all.length;i++){
      it = all[i];
      if (!!it.trash !== !!LIBV.trash) continue;
      if (LIBV.group !== "*" && (it.group || "") !== LIBV.group) continue;
      if (LIBV.orient && it.orient !== LIBV.orient) continue;
      if (LIBV.n && it.n !== LIBV.n) continue;
      if (LIBV.star && !it.star) continue;
      if (q && (it.name || "").toLowerCase().indexOf(q) < 0 && libGroupLabel(it.group).toLowerCase().indexOf(q) < 0) continue;
      out.push(it);
    }
    return out;
  }
  function libSelIds(){ var k, out = []; for (k in LIBV.sel) if (LIBV.sel[k]) out.push(k); return out; }
  /* the tile's picture: the record's thumbnail, or a standee drawn small once */
  function libThumb(it, img){
    if (LIBT[it.id]){ img.src = LIBT[it.id]; return; }
    if (it.builtin){
      var sd = sdById(it.id), cv = document.createElement("canvas"), W = 96, Hh = 320; cv.width = W; cv.height = Hh;
      var x = cv.getContext("2d"); if (!x || !sd) return;
      drawLook(x, sd.look, 0, 0, W, Hh);
      var i, c; x.fillStyle = "#c9a227";
      for (i=0;i<sd.cells.length;i++){ c = sd.cells[i]; x.fillRect(c.x*W + 1, c.y*Hh + 1, Math.max(2, c.w*W - 2), Math.max(2, c.h*Hh - 2)); }
      x.fillStyle = (LOOK_INK[sd.look] || LOOK_INK.editorial)[1];
      for (i=0;i<sd.texts.length;i++){ c = sd.texts[i]; x.globalAlpha = 0.55; x.fillRect(c.x*W + W*0.12, (c.y + c.h*0.3)*Hh, c.w*W - W*0.24, Math.max(1, c.h*Hh*0.4)); }
      try { LIBT[it.id] = cv.toDataURL("image/png"); img.src = LIBT[it.id]; } catch(e){}
      return;
    }
    var rec = LIBR[it.id];
    if (rec && rec.thumb){ LIBT[it.id] = rec.thumb; img.src = rec.thumb; return; }
    libLoad(it.id).then(function(r){ if (r && r.thumb){ LIBT[it.id] = r.thumb; try { img.src = r.thumb; } catch(e){} } });
  }
  function libToggleStar(id){
    var it = libItem(id);
    if (it){ it.star = !it.star; } else if (sdById(id)){ LIBI.b[id] = LIBI.b[id] || { star: false, trash: false }; LIBI.b[id].star = !LIBI.b[id].star; }
    saveLib(); render();
  }
  function libSetTrash(ids, on){
    var i, it, n = 0;
    for (i=0;i<ids.length;i++){
      it = libItem(ids[i]);
      if (it){ it.trash = !!on; n++; }
      else if (sdById(ids[i])){ LIBI.b[ids[i]] = LIBI.b[ids[i]] || { star: false, trash: false }; LIBI.b[ids[i]].trash = !!on; n++; }
    }
    LIBV.sel = {}; saveLib(); render(); return n;
  }
  function libAssign(ids, group){
    var i, it, n = 0; if (!libGroupById(group) && group !== "") return 0;
    for (i=0;i<ids.length;i++){ it = libItem(ids[i]); if (it){ it.group = group; n++; } }
    LIBV.sel = {}; saveLib(); render(); return n;
  }
  /* out of the bin for good: the record leaves the store, and every page laid from it keeps its photographs as a plain page */
  function libDelete(ids){
    var i, k, n = 0, keep = [];
    for (i=0;i<LIBI.items.length;i++){
      if (ids.indexOf(LIBI.items[i].id) < 0){ keep.push(LIBI.items[i]); continue; }
      n++; delete LIBR[LIBI.items[i].id]; delete LIBT[LIBI.items[i].id];
      if (H && typeof H.remove === "function"){ try { H.remove(libKey(LIBI.items[i].id)); } catch(e){} }
    }
    LIBI.items = keep;
    for (i=0;i<ids.length;i++) if (sdById(ids[i]) && LIBI.b[ids[i]]){ LIBI.b[ids[i]].trash = false; }
    for (i=0;i<DOC.pages.length;i++) if (DOC.pages[i].lib && ids.indexOf(DOC.pages[i].lib) >= 0 && !sdById(DOC.pages[i].lib)){ DOC.pages[i].lib = ""; DOC.pages[i].auto = true; }
    for (k in LIBV.sel) delete LIBV.sel[k];
    saveLib(); saveSoon(); render(); return n;
  }
  function libCard(){
    var card = E("section","card"); card.id = "albLibCard";
    var all = libItems(), w = albWidth(), i;
    card.appendChild(E("h2", null, L("alb_lib_h") + " · " + all.length + " / " + ((LIBD.max || 400) + STANDEES.length)));
    /* the doors: a file, a folder, the JSON of a whole library — only a host that can open one draws each */
    var doors = [];
    if (H && typeof H.pickPsd === "function"){
      var b1 = E("button","btn btn-gold", L("alb_lib_import")); b1.id = "albLibImport"; b1.type = "button";
      b1.onclick = function(){ if (LIBV.busy) return; H.pickPsd(function(entries){ libImport(entries); }); };
      doors.push(b1);
    }
    if (H && typeof H.pickPsdFolder === "function"){
      var b2 = E("button","btn", L("alb_lib_import_dir")); b2.id = "albLibImportDir"; b2.type = "button";
      b2.onclick = function(){ if (LIBV.busy) return; H.pickPsdFolder(function(entries){ libImport(entries); }); };
      doors.push(b2);
    }
    var b3 = E("button","btn" + (LIBV.build ? " btn-gold" : ""), L("alb_build")); b3.id = "albBuildOpen"; b3.type = "button";
    b3.onclick = function(){ LIBV.build = !LIBV.build; render(); };
    doors.push(b3);
    var drow = grid("btn", doors, w); drow.id = "albLibDoors"; card.appendChild(drow);
    if (LIBV.busy) card.appendChild(libProgBox());
    else if (LIBV.last) card.appendChild(libSummary(LIBV.last));
    if (LIBV.build) card.appendChild(buildBox());
    if (LIBV.ai) card.appendChild(aiBox());
    /* the shelf of groups, with counts */
    var groups = libGroupsAll(), counts = {}, gi;
    for (i=0;i<all.length;i++) if (!all[i].trash) counts[all[i].group || ""] = (counts[all[i].group || ""] || 0) + 1;
    var gchips = [chip(L("alb_lib_all") + " " + all.filter(function(it){ return !it.trash; }).length, LIBV.group === "*", function(){ LIBV.group = "*"; LIBV.page = 0; render(); })];
    gchips[0].id = "albLibGroup_all";
    for (gi=0; gi<groups.length; gi++){
      (function(g){
        if (!g && !counts[""]) return;
        var b = chip(libGroupLabel(g) + " " + (counts[g] || 0), LIBV.group === g, function(){ LIBV.group = (LIBV.group === g) ? "*" : g; LIBV.page = 0; render(); });
        b.id = "albLibGroup_" + (g || "none"); gchips.push(b);
      })(groups[gi]);
    }
    var grow = grid("size", gchips, w); grow.id = "albLibGroups"; card.appendChild(grow);
    /* orientation · count · starred · bin · search */
    var f = [];
    for (i=0;i<LIB_ORIENTS.length;i++){
      (function(o){ var b = chip(L("alb_lib_or_" + o), LIBV.orient === o, function(){ LIBV.orient = (LIBV.orient === o) ? "" : o; LIBV.page = 0; render(); }); b.id = "albLibOr_" + o; f.push(b); })(LIB_ORIENTS[i]);
    }
    var st = chip("★ " + L("alb_lib_starred"), LIBV.star, function(){ LIBV.star = !LIBV.star; LIBV.page = 0; render(); }); st.id = "albLibStar"; f.push(st);
    var tr = chip(L("alb_lib_trash"), LIBV.trash, function(){ LIBV.trash = !LIBV.trash; LIBV.sel = {}; LIBV.page = 0; render(); }); tr.id = "albLibTrash"; f.push(tr);
    var frow = grid("size", f, w); frow.id = "albLibFilters"; card.appendChild(frow);
    var nc = [chip(L("alb_lib_any_n"), !LIBV.n, function(){ LIBV.n = 0; LIBV.page = 0; render(); })]; nc[0].id = "albLibN_0";
    for (i=1;i<=LIB_MAXP;i++){ (function(n){ var b = chip(String(n), LIBV.n === n, function(){ LIBV.n = (LIBV.n === n) ? 0 : n; LIBV.page = 0; render(); }); b.id = "albLibN_" + n; nc.push(b); })(i); }
    var nrow = grid("size", nc, w); nrow.id = "albLibNs"; card.appendChild(nrow);
    var q = document.createElement("input"); q.type = "search"; q.className = "inp"; q.id = "albLibQ"; q.placeholder = L("alb_lib_search"); q.value = LIBV.q || "";
    q.oninput = function(){ LIBV.q = q.value; LIBV.page = 0; fillLibTiles(); };
    var qrow = E("div","alb-field"); qrow.appendChild(q); card.appendChild(qrow);
    var tiles = E("div","alb-strip alb-libtiles"); tiles.id = "albLibTiles"; card.appendChild(tiles);
    var pager = E("div","alb-grid"); pager.id = "albLibPager"; card.appendChild(pager);
    var acts = E("div", null); acts.id = "albLibActs"; card.appendChild(acts);
    card.appendChild(E("p","mut", L("alb_lib_note")));
    LIBBOX = { tiles: tiles, pager: pager, acts: acts };
    fillLibTiles();
    return card;
  }
  var LIBBOX = null;
  /* the tiles are refilled in place — a search keystroke must not rebuild the card and lose the caret */
  function fillLibTiles(){
    if (!LIBBOX) return;
    var list = libFiltered(), tiles = LIBBOX.tiles, pager = LIBBOX.pager, acts = LIBBOX.acts, w = albWidth(), i;
    var pages = Math.max(1, Math.ceil(list.length / LIB_PAGE)); LIBV.page = clamp(LIBV.page, 0, pages - 1);
    var from = LIBV.page * LIB_PAGE, show = list.slice(from, from + LIB_PAGE), pg = curPage();
    tiles.innerHTML = "";
    if (!list.length) tiles.appendChild(E("p","mut alb-trayempty", L(LIBV.trash ? "alb_lib_trash_empty" : "alb_lib_empty")));
    for (i=0;i<show.length;i++){
      (function(it){
        var t = E("div","alb-tile alb-libtile" + (pg.lib === it.id ? " on" : "") + (LIBV.sel[it.id] ? " picked" : "")); t.id = "albLibT_" + it.id;
        t.setAttribute("role","button"); t.tabIndex = 0; t.title = it.name; t.setAttribute("data-lib", it.id);
        var im = document.createElement("img"); im.className = "alb-tileimg alb-libimg"; im.alt = ""; libThumb(it, im); t.appendChild(im);
        t.appendChild(E("span","alb-badge", String(it.n)));
        var nm = E("span","alb-libname", it.name || L("alb_lib_untitled")); t.appendChild(nm);
        var star = E("button","alb-tilemv alb-libstar" + (it.star ? " on" : ""), ""); star.type = "button"; star.id = "albLibStar_" + it.id; star.title = L("alb_lib_star");
        star.appendChild(E("span","alb-libdot", "\u2605"));   /* 6.125.0 — the disc is the mark, the button is the 40px reach around it */
        star.onclick = function(ev){ ev.stopPropagation(); libToggleStar(it.id); };
        t.appendChild(star);
        var ck = E("button","alb-tilex alb-libck", ""); ck.type = "button"; ck.id = "albLibCk_" + it.id; ck.title = L("alb_lib_select");
        ck.appendChild(E("span","alb-libdot", LIBV.sel[it.id] ? "\u2713" : ""));   /* 6.125.0 — same: a 24px disc inside a 40px reach */
        ck.onclick = function(ev){ ev.stopPropagation(); LIBV.sel[it.id] = !LIBV.sel[it.id]; fillLibTiles(); };
        t.appendChild(ck);
        t.onclick = function(){ if (LIBV.trash){ LIBV.sel[it.id] = !LIBV.sel[it.id]; fillLibTiles(); return; } applyLib(it.id); };
        t.onkeydown = function(ev){ if (ev.key === "Enter" || ev.key === " "){ ev.preventDefault(); t.onclick(); } };
        tiles.appendChild(t);
      })(show[i]);
    }
    pager.innerHTML = "";
    if (pages > 1){
      var pv = E("button","btn","‹"); pv.type = "button"; pv.id = "albLibPrev"; pv.disabled = LIBV.page === 0; pv.onclick = function(){ LIBV.page--; fillLibTiles(); };
      var nx = E("button","btn","›"); nx.type = "button"; nx.id = "albLibNext"; nx.disabled = LIBV.page >= pages - 1; nx.onclick = function(){ LIBV.page++; fillLibTiles(); };
      var lab = E("span","alb-selname", L("alb_lib_page").replace("{A}", String(LIBV.page+1)).replace("{B}", String(pages)) + " · " + list.length);
      var row = grid("btn", [pv, lab, nx], w); pager.appendChild(row);
    }
    acts.innerHTML = "";
    var sel = libSelIds();
    if (sel.length){
      acts.appendChild(subh(L("alb_lib_selected").replace("{N}", String(sel.length))));
      var ops = [];
      if (!LIBV.trash){
        var gs = libGroupsAll(), gi;
        var gsel = document.createElement("select"); gsel.className = "inp alb-sel"; gsel.id = "albLibAssign";
        var o0 = document.createElement("option"); o0.value = "__"; o0.textContent = L("alb_lib_assign"); gsel.appendChild(o0);
        for (gi=0; gi<gs.length; gi++){ var o = document.createElement("option"); o.value = gs[gi]; o.textContent = libGroupLabel(gs[gi]); gsel.appendChild(o); }
        gsel.onchange = function(){ if (gsel.value === "__") return; var n = libAssign(sel, gsel.value); H.toast(L("alb_lib_assigned").replace("{N}", String(n)), "ok"); };
        var gwrap = E("div","alb-opts"); gwrap.appendChild(gsel); acts.appendChild(gwrap);
        var sb = E("button","btn", "★ " + L("alb_lib_star")); sb.type = "button"; sb.id = "albLibStarSel";
        sb.onclick = function(){ var i2, it; for (i2=0;i2<sel.length;i2++){ it = libItem(sel[i2]); if (it) it.star = true; else if (sdById(sel[i2])){ LIBI.b[sel[i2]] = LIBI.b[sel[i2]] || {}; LIBI.b[sel[i2]].star = true; } } LIBV.sel = {}; saveLib(); render(); };
        var tb = E("button","btn", L("alb_lib_to_trash")); tb.type = "button"; tb.id = "albLibTrashSel";
        tb.onclick = function(){ var n = libSetTrash(sel, true); H.toast(L("alb_lib_trashed").replace("{N}", String(n)), "ok"); };
        ops.push(sb); ops.push(tb);
      } else {
        var rb = E("button","btn", L("alb_lib_restore")); rb.type = "button"; rb.id = "albLibRestore";
        rb.onclick = function(){ var n = libSetTrash(sel, false); H.toast(L("alb_lib_restored").replace("{N}", String(n)), "ok"); };
        var db = E("button","btn", L("alb_lib_delete")); db.type = "button"; db.id = "albLibDelete";
        db.onclick = function(){ askP(L("alb_lib_delete_q").replace("{N}", String(sel.length))).then(function(ok){ if (!ok) return; var n = libDelete(sel); H.toast(L("alb_lib_deleted").replace("{N}", String(n)), "ok"); }); };
        ops.push(rb); ops.push(db);
      }
      var cl = E("button","btn", L("alb_lib_unselect")); cl.type = "button"; cl.id = "albLibUnselect"; cl.onclick = function(){ LIBV.sel = {}; fillLibTiles(); };
      ops.push(cl);
      var orow = grid("btn", ops, w); orow.id = "albLibSelOps"; acts.appendChild(orow);
    }
    /* the page's own template: a way off it, and the library as a file */
    var tail = [];
    if (pg.lib){ var off = E("button","btn", L("alb_lib_clear")); off.type = "button"; off.id = "albLibClear"; off.onclick = function(){ clearLib(); }; tail.push(off); }
    var ex = E("button","btn", L("alb_lib_export")); ex.type = "button"; ex.id = "albLibExport"; ex.onclick = function(){ libExport(); }; tail.push(ex);
    if (H && typeof H.pickJson === "function"){ var imj = E("button","btn", L("alb_lib_import_json")); imj.type = "button"; imj.id = "albLibImportJson"; imj.onclick = function(){ H.pickJson(function(entries){ libImportJson(entries); }); }; tail.push(imj); }
    var trow = grid("btn", tail, w); trow.id = "albLibTail"; acts.appendChild(trow);
  }

  /* ---- importing: one file or one folder of them, read in the page, with a progress list ---- */
  function libProgBox(){
    var box = E("div","alb-libprog"); box.id = "albLibProg";
    var b = LIBV.busy;
    box.appendChild(E("p","alb-selname", L("alb_lib_busy").replace("{A}", String(b.done)).replace("{B}", String(b.total))));
    var bar = E("div","alb-prog"); var inner = E("div","alb-progbar"); inner.id = "albLibBar"; inner.style.width = Math.round(100*b.done/Math.max(1,b.total)) + "%"; bar.appendChild(inner); box.appendChild(bar);
    var cur = E("p","alb-proglab", b.cur ? (b.cur + (b.step ? " · " + b.step : "")) : ""); cur.id = "albLibCur"; box.appendChild(cur);
    var log = E("div","alb-ailog"); log.id = "albLibLog"; var i; for (i=Math.max(0,b.log.length-6);i<b.log.length;i++) log.appendChild(E("p","alb-ailine", b.log[i])); box.appendChild(log);
    return box;
  }
  function libProgTick(){
    var box = document.getElementById("albLibProg"); if (!box || !LIBV.busy) return;
    var b = LIBV.busy, bar = document.getElementById("albLibBar"), cur = document.getElementById("albLibCur"), log = document.getElementById("albLibLog");
    if (bar) bar.style.width = Math.round(100*b.done/Math.max(1,b.total)) + "%";
    if (cur) cur.textContent = b.cur ? (b.cur + (b.step ? " · " + b.step : "")) : "";
    var head = box.firstChild; if (head) head.textContent = L("alb_lib_busy").replace("{A}", String(b.done)).replace("{B}", String(b.total));
    if (log){ log.innerHTML = ""; var i; for (i=Math.max(0,b.log.length-6);i<b.log.length;i++) log.appendChild(E("p","alb-ailine", b.log[i])); }
  }
  function libSummary(s){
    var box = E("div","alb-libsum"); box.id = "albLibSummary";
    box.appendChild(E("p","alb-checkok", "✓ " + L("alb_lib_done").replace("{N}", String(s.ok)).replace("{F}", String(s.frames)).replace("{T}", String(s.texts))));
    var i; for (i=0;i<Math.min(8, s.skipped.length);i++) box.appendChild(E("p","alb-warn", s.skipped[i].name + " — " + libWhy(s.skipped[i].why)));
    if (s.warns.length) box.appendChild(E("p","mut", s.warns.slice(0, 4).join(" · ")));
    var ok = E("button","btn", L("alb_lib_dismiss")); ok.type = "button"; ok.id = "albLibDismiss"; ok.onclick = function(){ LIBV.last = null; render(); };
    box.appendChild(grid("btn", [ok], albWidth()));
    return box;
  }
  function libWhy(code){
    var k = "alb_lib_why_" + String(code || "").split(":")[0]; var s = L(k); if (s === k) s = L("alb_lib_why_read");
    return s.replace("{N}", String(code || "").split(":")[1] || "");
  }
  /* 6.125.0 — file names say where a template belongs. The words live beside the groups in
     data/album.js (`match` on each), so the module names no group in its own code and a studio
     that wants another word edits the table. Compiled once, in the table's order. */
  var GROUP_RE = null;
  function groupRules(){
    if (GROUP_RE) return GROUP_RE;
    GROUP_RE = [];
    for (var i=0;i<LIB_GROUPS.length;i++){
      var g = LIB_GROUPS[i]; if (!g || !g.id || !g.match) continue;
      try { GROUP_RE.push([g.id, new RegExp(g.match, "i")]); } catch(e){ /* a table a hand edited badly keeps the rest */ }
    }
    return GROUP_RE;
  }
  function guessGroup(name, path){
    var s = String(path || "") + " " + String(name || ""), i;
    var rules = groupRules();
    for (i=0;i<rules.length;i++) if (rules[i][1].test(s) && libGroupById(rules[i][0])) return rules[i][0];
    return "";
  }
  function baseName(n){ return String(n || "").replace(/^.*[\\\/]/, "").replace(/\.[a-z0-9]+$/i, "").replace(/[_]+/g, " ").trim().slice(0, 60); }
  function readEntry(e){
    if (!e) return Promise.resolve(null);
    try {
      if (typeof e.read === "function") return Promise.resolve(e.read());
      if (typeof e.arrayBuffer === "function") return e.arrayBuffer();
    } catch(err){ return Promise.reject(err); }
    return Promise.resolve(null);
  }
  function libImport(entries){
    var list = [], i, e;
    for (i=0;i<(entries||[]).length;i++){ e = entries[i]; if (!e) continue; if (/\.psd$/i.test(e.name || "")) list.push(e); }
    if (!list.length){ H.toast(L("alb_lib_none"), ""); return Promise.resolve(0); }
    var room = (LIBD.max || 400) - ((LIBI && LIBI.items.length) || 0);
    if (room <= 0){ H.toast(L("alb_lib_full").replace("{N}", String(LIBD.max || 400)), "err"); return Promise.resolve(0); }
    var sum = { ok: 0, frames: 0, texts: 0, skipped: [], warns: [] };
    if (list.length > room){ sum.skipped.push({ name: L("alb_lib_more").replace("{N}", String(list.length - room)), why: "full" }); list = list.slice(0, room); }
    LIBV.busy = { total: list.length, done: 0, cur: "", step: "", log: [] }; LIBV.last = null; LIBV.build = false;
    render();
    var at = 0;
    function one(){
      if (at >= list.length){ LIBV.busy = null; LIBV.last = sum; LIBV.group = "*"; LIBV.trash = false; LIBV.page = 0; saveLib(); render(); H.toast(L("alb_lib_done").replace("{N}", String(sum.ok)).replace("{F}", String(sum.frames)).replace("{T}", String(sum.texts)), sum.ok ? "ok" : ""); return sum.ok; }
      var e = list[at++], nm = baseName(e.name), b = LIBV.busy;
      b.cur = nm; b.step = L("alb_lib_step_read"); libProgTick();
      if (e.size > (LIBD.fileMax || 0)){ sum.skipped.push({ name: nm, why: "big:" + Math.round(e.size/1048576) }); b.done++; b.log.push("✕ " + nm); return tick(one); }
      return readEntry(e).then(function(buf){
        if (!buf || !buf.byteLength) throw psdErr("trunc");
        b.step = L("alb_lib_step_layers"); libProgTick();
        return psdTemplate(buf, { onStep: function(k2, n2){ b.step = L("alb_lib_step_layer").replace("{A}", String(k2)).replace("{B}", String(n2)); libProgTick(); } });
      }).then(function(t){
        b.step = L("alb_lib_step_save"); libProgTick();
        var id = libNewId(), rec = { id: id, name: nm, w: t.w, h: t.h, dpi: t.dpi, frames: t.frames, texts: t.texts, bg: t.bg, fg: t.fg, thumb: t.thumb || "", fonts: t.fonts, fontsMissing: t.fontsMissing, warn: t.warn };
        LIBR[id] = normRec(rec, id); LIBT[id] = rec.thumb;
        var it = { id: id, name: nm, group: guessGroup(nm, e.path), orient: t.orient, n: t.frames.length, w: t.w, h: t.h, dpi: t.dpi, star: false, trash: false, added: Date.now(), kind: "psd", texts: t.texts.length };
        LIBI.items.push(it);
        var stored = (H && typeof H.store === "function") ? H.store(libKey(id), rec) : false;
        return Promise.resolve(stored).then(function(){
          sum.ok++; sum.frames += t.frames.length; sum.texts += t.texts.length;
          var wi; for (wi=0; wi<t.warn.length; wi++) if (/^(noframes|16bit|frames:|fonts:)/.test(t.warn[wi])) sum.warns.push(nm + ": " + libWhy(t.warn[wi]));
          b.done++; b.log.push("✓ " + nm + " · " + L("alb_lib_row").replace("{F}", String(t.frames.length)).replace("{T}", String(t.texts.length)).replace("{W}", String(t.cmW)).replace("{H}", String(t.cmH)));
          libProgTick();
        });
      }).catch(function(err){
        var code = (err && err.code) ? err.code + (err.extra ? ":" + err.extra : "") : "read";
        sum.skipped.push({ name: nm, why: code }); b.done++; b.log.push("✕ " + nm + " — " + libWhy(code)); libProgTick();
      }).then(function(){ return tick(one); });
    }
    return one();
  }
  function tick(fn){ return new Promise(function(go){ setTimeout(go, 0); }).then(fn); }

  /* ---- the library as a file: every record, one JSON; and back ---- */
  function libExport(){
    if (!LIBI) return Promise.resolve(false);
    var ids = [], i; for (i=0;i<LIBI.items.length;i++) if (!LIBI.items[i].trash) ids.push(LIBI.items[i].id);
    if (!ids.length){ H.toast(L("alb_lib_none_export"), ""); return Promise.resolve(false); }
    H.toast(L("alb_export_busy"), "");
    return Promise.all(ids.map(libLoad)).then(function(recs){
      var out = { hnkAlbumLib: 1, v: APP_MARK, items: [], records: [] }, k;
      for (k=0;k<ids.length;k++){ if (!recs[k]) continue; out.items.push(libItem(ids[k])); out.records.push(recs[k]); }
      var bytes = utf8Bytes(JSON.stringify(out));
      return Promise.resolve(sendFile(bytes, "hnk-album-library.json", "application/json")).then(function(){ H.toast(L("alb_lib_exported").replace("{N}", String(out.records.length)).replace("{M}", String(Math.max(1, Math.round(bytes.length/1048576)))), "ok"); return true; });
    }).catch(function(){ H.toast(L("alb_export_fail"), "err"); return false; });
  }
  var APP_MARK = "6.132.0";
  function utf8Bytes(s){
    var out = [], i, c;
    for (i=0;i<s.length;i++){
      c = s.charCodeAt(i);
      if (c < 0x80) out.push(c);
      else if (c < 0x800){ out.push(0xc0 | (c>>6), 0x80 | (c & 63)); }
      else if (c >= 0xd800 && c < 0xdc00 && i+1 < s.length){ var d = s.charCodeAt(++i); c = 0x10000 + ((c - 0xd800) << 10) + (d - 0xdc00); out.push(0xf0 | (c>>18), 0x80 | ((c>>12)&63), 0x80 | ((c>>6)&63), 0x80 | (c&63)); }
      else out.push(0xe0 | (c>>12), 0x80 | ((c>>6)&63), 0x80 | (c&63));
    }
    return new Uint8Array(out);
  }
  function utf8Str(u8){
    var s = "", i = 0, c, n = u8.length;
    while (i < n){
      c = u8[i++];
      if (c < 0x80) s += String.fromCharCode(c);
      else if (c < 0xe0) s += String.fromCharCode(((c & 31) << 6) | (u8[i++] & 63));
      else if (c < 0xf0) s += String.fromCharCode(((c & 15) << 12) | ((u8[i++] & 63) << 6) | (u8[i++] & 63));
      else { var cp = ((c & 7) << 18) | ((u8[i++] & 63) << 12) | ((u8[i++] & 63) << 6) | (u8[i++] & 63); cp -= 0x10000; s += String.fromCharCode(0xd800 + (cp >> 10), 0xdc00 + (cp & 1023)); }
    }
    return s;
  }
  function libImportJson(entries){
    var e = (entries || [])[0]; if (!e) return Promise.resolve(0);
    return readEntry(e).then(function(buf){
      var data = JSON.parse(utf8Str(new Uint8Array(buf))), n = 0, i, it, rec;
      if (!data || data.hnkAlbumLib !== 1 || !data.items || !data.records) throw new Error("not a library");
      var room = (LIBD.max || 400) - LIBI.items.length;
      for (i=0;i<data.records.length && n<room;i++){
        rec = data.records[i]; it = data.items[i]; if (!rec || !it || !rec.frames || !rec.frames.length) continue;
        var id = libNewId(), nr = normRec(rec, id);
        LIBR[id] = nr; if (nr.thumb) LIBT[id] = nr.thumb;
        LIBI.items.push({ id: id, name: String(it.name || rec.name || "").slice(0, 60), group: libGroupById(it.group) ? it.group : "", orient: (LIB_ORIENTS.indexOf(it.orient) >= 0) ? it.orient : orientOf(nr.w, nr.h),
                          n: nr.frames.length, w: nr.w, h: nr.h, dpi: nr.dpi, star: !!it.star, trash: false, added: Date.now(), kind: "json", texts: nr.texts.length });
        if (H && typeof H.store === "function") H.store(libKey(id), { id: id, name: it.name, w: nr.w, h: nr.h, dpi: nr.dpi, frames: nr.frames, texts: nr.texts, bg: nr.bg, fg: nr.fg, thumb: nr.thumb, fonts: nr.fonts, fontsMissing: nr.fontsMissing, warn: nr.warn });
        n++;
      }
      saveLib(); LIBV.trash = false; LIBV.group = "*"; render();
      H.toast(L("alb_lib_json_done").replace("{N}", String(n)), n ? "ok" : "");
      return n;
    }).catch(function(){ H.toast(L("alb_lib_json_bad"), "err"); return 0; });
  }


  /* ======================= THE PSD READER (6.125.0, wave I) =======================

     The owner's recording: a studio points SS Album at a folder of 102 of its own Photoshop
     templates and, one by one, each file is read — "gộp 9 lớp → nền phẳng · 5 khung ảnh ·
     3 ô chữ · thiếu 2 font" — nine layers merged into a flat background, five photo frames,
     three text boxes, two fonts missing — and lands in the library as a template a customer's
     photographs can be poured into. That is the whole of what this reader does, and it does
     it on both surfaces from the same bytes: a .psd is a documented file (Adobe's own format
     note), so the module reads it itself — header, resolution, the layer records with their
     names, kinds, masks and blend modes, the PackBits channel data — and draws what the file
     describes onto a canvas. Nothing here depends on Photoshop being present; in the panel the
     same code runs and the same template comes out.

     WHAT A LAYER BECOMES. A TEXT layer (TySh) becomes an editable line in one of the page's
     roles, with its words, its place, its size, its colour and its face where the studio ships
     a matching one. A PHOTO layer — a placed smart object, a layer whose name says photo · ảnh
     · khung · frame · img (data/album.js lib.photoWords), a layer inside a group so named, or a
     flat grey placeholder the size of a frame — becomes a FRAME the album's photographs are
     cover-fitted into. Everything else visible is drawn flat: what sits BELOW the lowest frame
     into the background picture, what sits ABOVE it into a foreground picture with its alpha
     (a ribbon or a border that overlaps a frame keeps overlapping the photograph). Blend modes
     the canvas knows are honoured; a layer mask is applied; a hidden layer or group draws
     nothing; effects (lfx2) are flattened away as the recording's own reader does.

     WHAT IT REFUSES, by name: a PSB (version 2), a file past lib.fileMax, a depth that is not
     8 or 16 bits, a colour mode that is not RGB or Grayscale, a truncated file. A 16-bit file is
     read at its top byte. A layer with zip-compressed channels is skipped (Photoshop writes RLE
     for 8-bit layers). Everything is a number a test can measure. */

  var PSD_ERR = { notpsd: "notpsd", psb: "psb", depth: "depth", mode: "mode", trunc: "trunc", big: "big", descriptor: "descriptor" };
  function psdErr(code, extra){ var e = new Error("psd:" + code + (extra ? " " + extra : "")); e.code = code; e.extra = extra || ""; return e; }
  function rdStr(dv, at, n){ var s = "", i; for (i=0;i<n;i++) s += String.fromCharCode(dv.getUint8(at+i)); return s; }
  /* a unicode string: uint32 count of UTF-16BE code units; the trailing NUL Photoshop writes is dropped */
  function rdUni(dv, at){
    var n = dv.getUint32(at), s = "", i, c;
    for (i=0;i<n;i++){ c = dv.getUint16(at+4+i*2); if (c) s += String.fromCharCode(c); }
    return { s: s, end: at + 4 + n*2 };
  }
  /* a key: uint32 length, or a 4-byte key when the length is zero */
  function rdKey(dv, at){
    var n = dv.getUint32(at);
    if (n === 0) return { s: rdStr(dv, at+4, 4), end: at+8 };
    return { s: rdStr(dv, at+4, n), end: at+4+n };
  }
  /* THE DESCRIPTOR — the typed dictionary Photoshop stores a text layer's settings in */
  function rdDesc(dv, at){
    var name = rdUni(dv, at); at = name.end;
    var cls = rdKey(dv, at); at = cls.end;
    var count = dv.getUint32(at); at += 4;
    var out = {}, i;
    for (i=0;i<count;i++){
      var k = rdKey(dv, at); at = k.end;
      var type = rdStr(dv, at, 4); at += 4;
      var v = rdItem(dv, at, type); at = v.end;
      out[k.s] = v.v;
    }
    return { v: out, end: at };
  }
  function rdList(dv, at){
    var n = dv.getUint32(at), arr = [], i; at += 4;
    for (i=0;i<n;i++){ var type = rdStr(dv, at, 4); at += 4; var v = rdItem(dv, at, type); at = v.end; arr.push(v.v); }
    return { v: arr, end: at };
  }
  function rdItem(dv, at, type){
    var n, a, b, c, d, i, arr, t;
    switch (type){
      case "obj ":
        n = dv.getUint32(at); at += 4; arr = [];
        for (i=0;i<n;i++){
          t = rdStr(dv, at, 4); at += 4;
          if (t === "prop"){ a = rdUni(dv, at); b = rdKey(dv, a.end); c = rdKey(dv, b.end); at = c.end; arr.push({ prop: c.s }); }
          else if (t === "Clss"){ a = rdUni(dv, at); b = rdKey(dv, a.end); at = b.end; arr.push({ cls: b.s }); }
          else if (t === "Enmr"){ a = rdUni(dv, at); b = rdKey(dv, a.end); c = rdKey(dv, b.end); d = rdKey(dv, c.end); at = d.end; arr.push({ en: d.s }); }
          else if (t === "rele" || t === "Idnt" || t === "indx"){ a = rdUni(dv, at); b = rdKey(dv, a.end); at = b.end + 4; arr.push({}); }
          else if (t === "name"){ a = rdUni(dv, at); b = rdKey(dv, a.end); c = rdUni(dv, b.end); at = c.end; arr.push({ name: c.s }); }
          else throw psdErr(PSD_ERR.descriptor, "ref " + t);
        }
        return { v: arr, end: at };
      case "Objc": case "GlbO": return rdDesc(dv, at);
      case "VlLs": return rdList(dv, at);
      case "doub": return { v: dv.getFloat64(at), end: at+8 };
      case "UntF": return { v: dv.getFloat64(at+4), end: at+12 };
      case "TEXT": a = rdUni(dv, at); return { v: a.s, end: a.end };
      case "enum": a = rdKey(dv, at); b = rdKey(dv, a.end); return { v: b.s, end: b.end };
      case "long": return { v: dv.getInt32(at), end: at+4 };
      case "comp": return { v: dv.getInt32(at)*4294967296 + dv.getUint32(at+4), end: at+8 };
      case "bool": return { v: !!dv.getUint8(at), end: at+1 };
      case "type": case "GlbC": a = rdUni(dv, at); b = rdKey(dv, a.end); return { v: b.s, end: b.end };
      case "alis": n = dv.getUint32(at); return { v: null, end: at+4+n };
      case "tdta": n = dv.getUint32(at); return { v: { raw: at+4, len: n }, end: at+4+n };
      case "ObAr":
        at += 4; a = rdUni(dv, at); b = rdKey(dv, a.end); at = b.end; n = dv.getUint32(at); at += 4; arr = [];
        for (i=0;i<n;i++){ var k = rdKey(dv, at); at = k.end; t = rdStr(dv, at, 4); at += 4; var it = rdItem(dv, at, t); at = it.end; arr.push(it.v); }
        return { v: arr, end: at };
      case "UnFl":
        n = dv.getUint32(at+4); arr = [];
        for (i=0;i<n;i++) arr.push(dv.getFloat64(at+8+i*8));
        return { v: arr, end: at+8+n*8 };
      default: throw psdErr(PSD_ERR.descriptor, "type " + type);
    }
  }
  /* PackBits, one row: `n` bytes out */
  function unpackBits(src, at, end, out, o, n){
    var stop = o + n;
    while (o < stop && at < end){
      var h = src[at++];
      if (h < 128){ var k = h + 1; while (k-- > 0 && o < stop && at < end) out[o++] = src[at++]; }
      else if (h > 128){ var v = src[at++], m = 257 - h; while (m-- > 0 && o < stop) out[o++] = v; }
    }
    return at;
  }
  /* one channel of one layer → a plane of w*h bytes (8-bit: as stored; 16-bit: the top byte) */
  function psdChannel(u8, at, len, w, h, depth){
    var comp = (u8[at] << 8) | u8[at+1], plane = new Uint8Array(Math.max(0, w*h)), rows = h, i, o = 0, p, end = at + len;
    if (!(w > 0 && h > 0)) return { plane: plane, ok: true };
    if (comp === 0){
      p = at + 2;
      if (depth === 16){ for (i=0;i<w*h && p+1<end;i++,p+=2) plane[i] = u8[p]; }
      else { plane.set(u8.subarray(p, Math.min(end, p + w*h))); }
      return { plane: plane, ok: true };
    }
    if (comp === 1){
      var counts = [], q = at + 2;
      for (i=0;i<rows;i++){ counts.push((u8[q] << 8) | u8[q+1]); q += 2; }
      var rowBytes = w * (depth === 16 ? 2 : 1), row = new Uint8Array(rowBytes);
      for (i=0;i<rows;i++){
        unpackBits(u8, q, Math.min(end, q + counts[i]), row, 0, rowBytes); q += counts[i];
        if (depth === 16){ var x; for (x=0;x<w;x++) plane[o++] = row[x*2]; }
        else { plane.set(row, o); o += w; }
      }
      return { plane: plane, ok: true };
    }
    return { plane: plane, ok: false, comp: comp };   /* zip: Photoshop does not write it for 8-bit layers */
  }
  /* the EngineData block a text layer carries, read as PostScript-ish text: the face, the size,
     the fill colour and the justification of the FIRST style run */
  function psdEngine(u8, raw, len){
    var s = "", i, n = Math.min(len, 400000);
    for (i=0;i<n;i++) s += String.fromCharCode(u8[raw+i]);
    var out = { fonts: [], size: 0, color: "", align: "center", font: "" };
    var fs = /\/FontSet\s*\[([\s\S]*?)\n\s*\]/.exec(s);
    if (fs){
      var re = /\/Name \(\xFE\xFF([\s\S]*?)\)\s*\n/g, m;
      while ((m = re.exec(fs[1]))){ var nm = psUni(m[1]); if (nm && out.fonts.indexOf(nm) < 0) out.fonts.push(nm); }
    }
    var sz = /\/FontSize (\d+(?:\.\d+)?)/.exec(s); if (sz) out.size = parseFloat(sz[1]);
    var fi = /\/Font (\d+)/.exec(s); if (fi && out.fonts[+fi[1]]) out.font = out.fonts[+fi[1]]; else if (out.fonts.length) out.font = out.fonts[0];
    var fc = /\/FillColor\s*<<\s*\/Type 1\s*\/Values \[\s*([\d.\s-]+?)\s*\]/.exec(s);
    if (fc){
      var v = fc[1].trim().split(/\s+/).map(parseFloat);
      if (v.length >= 4){ var hx = function(x){ var q = Math.round(clamp(x,0,1)*255).toString(16); return q.length < 2 ? "0" + q : q; }; out.color = "#" + hx(v[1]) + hx(v[2]) + hx(v[3]); }
    }
    var ju = /\/Justification (\d)/.exec(s); if (ju) out.align = (ju[1] === "0") ? "left" : (ju[1] === "1") ? "right" : "center";
    return out;
  }
  /* a PostScript string of UTF-16BE bytes (each byte one char here), with \( \) \\ escapes */
  function psUni(str){
    var bytes = [], i, c;
    for (i=0;i<str.length;i++){ c = str.charAt(i); if (c === "\\" && i+1 < str.length){ i++; c = str.charAt(i); } bytes.push(c.charCodeAt(0) & 255); }
    var s = "";
    for (i=0;i+1<bytes.length;i+=2){ var u = (bytes[i] << 8) | bytes[i+1]; if (u) s += String.fromCharCode(u); }
    return s.replace(/\r/g, " ").trim();
  }
  /* a vector mask's path: is it one axis-aligned rectangle? Then its box, in page fractions. */
  function psdPathRect(u8, at, len){
    var dv = new DataView(u8.buffer, u8.byteOffset + at, len), p = 8, pts = [], W = 0, Hh = 0;
    while (p + 26 <= len){
      var sel = dv.getUint16(p);
      if (sel === 1 || sel === 2 || sel === 4 || sel === 5){
        var ay = dv.getInt32(p + 8) / 16777216, ax = dv.getInt32(p + 12) / 16777216;
        var iy = dv.getInt32(p + 2) / 16777216, ix = dv.getInt32(p + 6) / 16777216;
        var oy = dv.getInt32(p + 14) / 16777216, ox = dv.getInt32(p + 18) / 16777216;
        if (Math.abs(iy-ay) > 0.002 || Math.abs(ix-ax) > 0.002 || Math.abs(oy-ay) > 0.002 || Math.abs(ox-ax) > 0.002) return null;   /* a curve */
        pts.push({ x: ax, y: ay });
      }
      p += 26;
    }
    if (pts.length !== 4) return null;
    var xs = pts.map(function(q){ return q.x; }), ys = pts.map(function(q){ return q.y; });
    var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs), y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys), i;
    for (i=0;i<4;i++){ if ((Math.abs(pts[i].x-x0) > 0.003 && Math.abs(pts[i].x-x1) > 0.003) || (Math.abs(pts[i].y-y0) > 0.003 && Math.abs(pts[i].y-y1) > 0.003)) return null; }
    if (!(x1 - x0 > 0.01 && y1 - y0 > 0.01)) return null;
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }
  var PSD_BLEND = { "norm": "source-over", "pass": "source-over", "diss": "source-over", "mul ": "multiply", "scrn": "screen", "over": "overlay",
                    "dark": "darken", "lite": "lighten", "div ": "color-dodge", "idiv": "color-burn", "hLit": "hard-light", "sLit": "soft-light",
                    "diff": "difference", "smud": "exclusion", "hue ": "hue", "sat ": "saturation", "colr": "color", "lum ": "luminosity", "lddg": "lighter" };
  function wordsRe(list){ return new RegExp("(" + (list || []).map(function(w){ return String(w).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }).join("|") + ")", "i"); }

  /* READ THE FILE: the header, the resolution, every layer record and where its channel bytes are.
     Pure over the bytes — nothing drawn yet; the test in Node measures this half on its own. */
  function psdParse(buf){
    var u8 = new Uint8Array(buf), dv = new DataView(buf), at = 0, N = u8.length;
    if (N < 26 || rdStr(dv, 0, 4) !== "8BPS") throw psdErr(PSD_ERR.notpsd);
    var version = dv.getUint16(4); if (version === 2) throw psdErr(PSD_ERR.psb); if (version !== 1) throw psdErr(PSD_ERR.notpsd);
    var channels = dv.getUint16(12), height = dv.getUint32(14), width = dv.getUint32(18), depth = dv.getUint16(22), mode = dv.getUint16(24);
    if (depth !== 8 && depth !== 16) throw psdErr(PSD_ERR.depth, String(depth));
    if (mode !== 3 && mode !== 1) throw psdErr(PSD_ERR.mode, String(mode));   /* RGB or Grayscale */
    if (!(width > 0 && height > 0 && width <= 30000 && height <= 30000)) throw psdErr(PSD_ERR.trunc, "size");
    at = 26;
    var cmLen = dv.getUint32(at); at += 4 + cmLen;                         /* colour mode data */
    var resLen = dv.getUint32(at); var resEnd = at + 4 + resLen; at += 4;  /* image resources */
    var dpi = 72;
    while (at + 12 <= resEnd){
      if (rdStr(dv, at, 4) !== "8BIM") break;
      var rid = dv.getUint16(at+4), nl = dv.getUint8(at+6), nameLen = (nl + 1 + 1) & ~1;
      var p = at + 6 + nameLen, dlen = dv.getUint32(p), dstart = p + 4;
      if (rid === 0x03ED && dlen >= 16){ var h16 = dv.getUint32(dstart) / 65536; if (h16 > 1) dpi = Math.round(h16); }
      at = dstart + ((dlen + 1) & ~1);
    }
    at = resEnd;
    if (at + 4 > N) throw psdErr(PSD_ERR.trunc, "layers");
    var lmLen = dv.getUint32(at); var lmEnd = at + 4 + lmLen; at += 4;
    var layers = [], mergedAlpha = false;
    if (lmLen > 0 && at + 4 <= N){
      var liLen = dv.getUint32(at); at += 4;
      var liEnd = at + liLen;
      var count = dv.getInt16(at); at += 2;
      if (count < 0){ mergedAlpha = true; count = -count; }
      var li;
      for (li=0; li<count && at + 34 <= N; li++){
        var L = { top: dv.getInt32(at), left: dv.getInt32(at+4), bottom: dv.getInt32(at+8), right: dv.getInt32(at+12), chans: [], name: "", kind: "pixel",
                  visible: true, opacity: 255, clipping: 0, blend: "norm", mask: null, extra: {}, text: null, group: 0, vrect: null, fill: null, id: li };
        at += 16;
        var nch = dv.getUint16(at); at += 2;
        var ci; for (ci=0; ci<nch; ci++){ L.chans.push({ id: dv.getInt16(at), len: dv.getUint32(at+2) }); at += 6; }
        if (rdStr(dv, at, 4) !== "8BIM") throw psdErr(PSD_ERR.trunc, "layer " + li);
        L.blend = rdStr(dv, at+4, 4); L.opacity = dv.getUint8(at+8); L.clipping = dv.getUint8(at+9);
        var flags = dv.getUint8(at+10); L.visible = !(flags & 2);
        at += 12;
        var exLen = dv.getUint32(at); at += 4; var exEnd = at + exLen;
        var mkLen = dv.getUint32(at); at += 4;
        if (mkLen >= 20){
          L.mask = { top: dv.getInt32(at), left: dv.getInt32(at+4), bottom: dv.getInt32(at+8), right: dv.getInt32(at+12), def: dv.getUint8(at+16), flags: dv.getUint8(at+17) };
          L.mask.off = !!(L.mask.flags & 2);
        }
        at += mkLen;
        var brLen = dv.getUint32(at); at += 4 + brLen;                     /* blending ranges */
        var pn = dv.getUint8(at); L.name = rdStr(dv, at+1, pn); at += (pn + 1 + 3) & ~3;   /* pascal name, padded to 4 */
        while (at + 12 <= exEnd){
          var sig = rdStr(dv, at, 4); if (sig !== "8BIM" && sig !== "8B64") break;
          var key = rdStr(dv, at+4, 4), klen = dv.getUint32(at+8), kstart = at + 12;
          try {
            if (key === "luni"){ L.name = rdUni(dv, kstart).s || L.name; }
            else if (key === "lsct"){ L.group = dv.getUint32(kstart); }
            else if (key === "TySh"){
              var tp = kstart + 2 + 48 + 2 + 4;                             /* version, transform, text version, descriptor version */
              var yy = dv.getFloat64(kstart + 2 + 24), xx = dv.getFloat64(kstart + 2);   /* the transform's scale */
              var desc = rdDesc(dv, tp).v;
              var eng = (desc.EngineData && desc.EngineData.raw) ? psdEngine(u8, desc.EngineData.raw, desc.EngineData.len) : { fonts: [], size: 0, color: "", align: "center", font: "" };
              L.kind = "text";
              L.text = { words: String(desc["Txt "] || "").replace(/[\r\n\u0003]+/g, " ").trim(), scale: Math.max(Math.abs(yy) || 1, Math.abs(xx) || 1), eng: eng };
            }
            else if (key === "SoLd" || key === "SoLE"){ L.kind = "placed"; }
            else if (key === "vmsk" || key === "vsms"){ L.vrect = psdPathRect(u8, kstart, klen); L.extra.vector = true; }
            else if (key === "SoCo"){
              var sd = rdDesc(dv, kstart + 4).v, cl = sd["Clr "];
              if (cl && isFinite(cl["Rd  "])){ var hx2 = function(x){ var q = Math.round(clamp(x,0,255)).toString(16); return q.length < 2 ? "0" + q : q; }; L.fill = "#" + hx2(cl["Rd  "]) + hx2(cl["Grn "]) + hx2(cl["Bl  "]); }
              L.extra.solid = true;
            }
            else if (key === "levl" || key === "curv" || key === "brit" || key === "hue2" || key === "blnc" || key === "selc" || key === "phfl" || key === "grdm" || key === "expA" || key === "vibA" || key === "blwh" || key === "mixr" || key === "post" || key === "thrs" || key === "nvrt" || key === "lrFX" ){ if (key !== "lrFX") L.kind = "adjust"; }
            else if (key === "lfx2"){ L.extra.fx = true; }
          } catch(eK){ L.extra.bad = key; }
          at = kstart + ((klen + 1) & ~1);
        }
        at = exEnd;
        layers.push(L);
      }
      /* the channel image data follows the records, layer by layer, channel by channel */
      var lj, cj;
      for (lj=0; lj<layers.length; lj++){
        for (cj=0; cj<layers[lj].chans.length; cj++){ layers[lj].chans[cj].at = at; at += layers[lj].chans[cj].len; }
      }
      at = liEnd;
    }
    at = lmEnd;
    var merged = (at + 2 <= N) ? { at: at, comp: dv.getUint16(at) } : null;
    return { u8: u8, width: width, height: height, depth: depth, mode: mode, channels: channels, dpi: dpi, layers: layers, mergedAlpha: mergedAlpha, merged: merged };
  }

  /* THE LAYER TREE from the bottom-up list Photoshop writes: a closing divider (type 3) opens a
     group as the file is read upward, the group's own record (type 1 · 2) closes it. Every leaf
     learns whether every group above it is visible and the product of their opacities. */
  function psdTree(layers){
    var stack = [{ kids: [], vis: true, op: 1, names: [] }], i, L, top;
    for (i=0;i<layers.length;i++){
      L = layers[i];
      if (L.group === 3){ stack.push({ kids: [], vis: true, op: 1, names: [] }); continue; }
      if (L.group === 1 || L.group === 2){
        var g = stack.pop() || { kids: [], vis: true, op: 1, names: [] };
        top = stack[stack.length-1];
        var gvis = L.visible, gop = L.opacity/255;
        var k; for (k=0;k<g.kids.length;k++){ g.kids[k].vis = g.kids[k].vis && gvis; g.kids[k].op *= gop; g.kids[k].groups.push(L.name); }
        top.kids = top.kids.concat(g.kids);
        continue;
      }
      top = stack[stack.length-1];
      top.kids.push({ L: L, vis: L.visible, op: L.opacity/255, groups: [] });
    }
    while (stack.length > 1){ var g2 = stack.pop(); stack[stack.length-1].kids = stack[stack.length-1].kids.concat(g2.kids); }
    return stack[0].kids;   /* bottom to top, leaves only */
  }

  /* one leaf's pixels onto a canvas of its own size: RGB(A) planes, the layer mask applied */
  function psdLeafCanvas(P, L){
    var w = L.right - L.left, h = L.bottom - L.top;
    if (!(w > 0 && h > 0) || w*h > 60000000) return null;
    var planes = {}, i, bad = false;
    for (i=0;i<L.chans.length;i++){
      var ch = L.chans[i];
      if (ch.id < -1){
        if (L.mask && !L.mask.off && ch.id === -2){
          var mw = L.mask.right - L.mask.left, mh = L.mask.bottom - L.mask.top;
          if (mw > 0 && mh > 0){ var mr = psdChannel(P.u8, ch.at, ch.len, mw, mh, P.depth); if (mr.ok) planes.mask = { plane: mr.plane, w: mw, h: mh }; }
        }
        continue;
      }
      var r = psdChannel(P.u8, ch.at, ch.len, w, h, P.depth);
      if (!r.ok){ bad = true; continue; }
      planes[ch.id] = r.plane;
    }
    if (bad && !planes[0]) return null;
    var cv = document.createElement("canvas"); cv.width = w; cv.height = h;
    var x = cv.getContext("2d"); if (!x) return null;
    var img = x.createImageData(w, h), d = img.data, n = w*h, R = planes[0], G = planes[1] || planes[0], B = planes[2] || planes[0], A = planes[-1], p, q;
    if (!R) return null;
    for (i=0,q=0;i<n;i++,q+=4){ d[q] = R[i]; d[q+1] = G[i]; d[q+2] = B[i]; d[q+3] = A ? A[i] : 255; }
    if (planes.mask){
      var M = planes.mask, my, mx, gx, gy, mv, def = L.mask.def;
      for (my=0;my<h;my++){
        gy = L.top + my - L.mask.top;
        for (mx=0;mx<w;mx++){
          gx = L.left + mx - L.mask.left;
          mv = (gx >= 0 && gy >= 0 && gx < M.w && gy < M.h) ? M.plane[gy*M.w + gx] : def;
          if (mv < 255){ p = (my*w + mx)*4 + 3; d[p] = (d[p] * mv) / 255; }
        }
      }
    }
    x.putImageData(img, 0, 0);
    return cv;
  }
  /* is this pixel layer a flat placeholder — one colour, the size of a frame? Sampled, not scanned. */
  function psdIsFlat(cv){
    if (!cv) return false;
    var x = cv.getContext("2d"), w = cv.width, h = cv.height, sx = Math.max(1, Math.floor(w/12)), sy = Math.max(1, Math.floor(h/12)), i, j, first = null, hit = 0, tot = 0;
    try {
      for (j=Math.floor(sy/2); j<h; j+=sy) for (i=Math.floor(sx/2); i<w; i+=sx){
        var px = x.getImageData(i, j, 1, 1).data; tot++;
        if (px[3] < 128) continue;
        if (!first) first = px;
        if (Math.abs(px[0]-first[0]) + Math.abs(px[1]-first[1]) + Math.abs(px[2]-first[2]) < 30) hit++;
      }
    } catch(e){ return false; }
    return tot > 0 && hit >= tot * 0.9;
  }
  /* the page's face for a font the file names — by family keyword; "" leaves the pairing to decide */
  var FONT_MAP = [
    [/great ?vibes|brush|signature|hand|calligraph|pacifico|dancing|allura|sacramento|alex|script/i, "greatvibes"],
    [/parisienne|playlist|cursive/i, "parisienne"],
    [/playfair|didot|bodoni/i, "playfair"], [/cormorant|caslon|minion|times/i, "cormorant"], [/garamond/i, "garamond"],
    [/cinzel|trajan|roman/i, "cinzel"], [/baskerville|georgia/i, "baskerville"], [/lora|merriweather|pt serif/i, "lora"],
    [/marcellus/i, "marcellus"], [/italiana/i, "italiana"],
    [/montserrat|gotham|proxima|helvetica|arial|avenir|sf ?pro|segoe|utm/i, "montserrat"], [/raleway/i, "raleway"],
    [/lato|open ?sans|source ?sans/i, "lato"], [/jost|futura/i, "jost"], [/josefin/i, "josefin"], [/inter\b|roboto/i, "inter"],
    [/padauk|zawgyi|pyidaungsu|myanmar ?text/i, "padauk"], [/noto ?serif ?myanmar/i, "notoserifmy"], [/noto ?sans ?myanmar|myanmar/i, "notomy"],
    [/thai|sarabun|kanit|prompt|tahoma/i, "notothai"]
  ];
  function fontMap(name){
    var i; if (!name) return "";
    for (i=0;i<FONT_MAP.length;i++) if (FONT_MAP[i][0].test(name) && fontById(FONT_MAP[i][1])) return FONT_MAP[i][1];
    return "";
  }
  /* the role a text layer's words and size imply — the recording types "TÊN CÔ DÂU & TÊN CHÚ RỂ",
     "20.10.2026", "Welcome to the wedding of" into its templates, and so does every studio */
  function textRole(words, relSize){
    var w = String(words || "");
    if (/\d{1,2}\s*[./\-]\s*\d{1,2}\s*[./\-]\s*\d{2,4}|\b(20\d\d|19\d\d)\b|january|february|march|april|june|july|august|september|october|november|december|tháng/i.test(w)) return "date";
    if (/&|\band\b|\bvà\b|cô dâu|chú rể|bride|groom|ten co dau|ten chu re|သတိုးသမီး|သတိုးသား/i.test(w) && w.length < 60) return "names";
    if (/welcome|save the date|wedding day|our wedding|happy wedding|forever|now playing|ကြိုဆို|မင်္ဂလာ|chào mừng|đám cưới/i.test(w)) return relSize >= 0.035 ? "title" : "subtitle";
    if (/studio|photograph|www\.|\.com|@|hotline|tel|phone|địa điểm|venue|restaurant|hotel|nhà hàng/i.test(w)) return "caption";
    if (relSize >= 0.05) return "title";
    if (relSize >= 0.03) return "subtitle";
    if (relSize < 0.018) return "caption";
    return w.length > 40 ? "quote" : "subtitle";
  }

  /* THE TEMPLATE FROM THE FILE. Draws the two flat pictures at `longEdge` pixels, measures every frame
     and every line, and answers what the recording's progress dialog shows: layers · merged · frames ·
     texts · fonts missing · the size in cm · the warnings. Asynchronous only where a yield keeps the
     page alive; the heavy pixel work is synchronous per layer. */
  function psdTemplate(buf, opt){
    opt = opt || {};
    return new Promise(function(resolve, reject){
      var P;
      try { P = psdParse(buf); } catch(e){ reject(e); return; }
      var LIBD = D.lib || {}, photoRe = wordsRe(LIBD.photoWords || ["photo"]), leaves = psdTree(P.layers);
      var W = P.width, Hh = P.height, long = Math.max(W, Hh), k = Math.min(1, (opt.longEdge || (LIBD.preview || 2000)) / long);
      var cw = Math.max(1, Math.round(W*k)), ch = Math.max(1, Math.round(Hh*k));
      var bg = document.createElement("canvas"); bg.width = cw; bg.height = ch;
      var fg = document.createElement("canvas"); fg.width = cw; fg.height = ch;
      var bx = bg.getContext("2d"), fx = fg.getContext("2d");
      if (!bx || !fx){ reject(psdErr("canvas")); return; }
      bx.fillStyle = "#ffffff"; bx.fillRect(0, 0, cw, ch);
      /* pass 1: what is a frame, what is a line, what is decoration */
      var i, L, frames = [], texts = [], fonts = [], missing = [], layersN = 0, mergedN = 0, fgN = 0, warn = [], lowestFrame = Infinity, kinds = [];
      for (i=0;i<leaves.length;i++){
        L = leaves[i].L; layersN++;
        var kind = "deco";
        if (L.kind === "text") kind = "text";
        else if (L.kind === "adjust") kind = "adjust";
        else if (L.kind === "placed") kind = "photo";
        else if (photoRe.test(L.name) || leaves[i].groups.some(function(g){ return photoRe.test(g); })) kind = "photo";
        else if (L.clipping && i > 0 && kinds[i-1] === "photo") kind = "clip";
        kinds.push(kind);
        if (kind === "photo" && lowestFrame === Infinity) lowestFrame = i;
      }
      /* pass 2: the placeholders — a flat pixel layer the size of a frame, when the names said nothing */
      var flatCandidates = [];
      if (lowestFrame === Infinity){
        for (i=0;i<leaves.length;i++){
          L = leaves[i].L;
          if (kinds[i] !== "deco" || !leaves[i].vis || L.kind !== "pixel" || L.chans.length < 3) continue;
          var aw = (L.right-L.left)/W, ah = (L.bottom-L.top)/Hh;
          if (aw*ah < 0.02 || aw*ah > 0.9) continue;
          flatCandidates.push(i);
        }
      }
      var step = 0, total = leaves.length;
      function rectOf(L){
        var r;
        if (L.vrect) r = { x: L.vrect.x, y: L.vrect.y, w: L.vrect.w, h: L.vrect.h };
        else if (L.mask && !L.mask.off && L.mask.right > L.mask.left && L.mask.bottom > L.mask.top && (L.mask.right-L.mask.left)*(L.mask.bottom-L.mask.top) < (L.right-L.left)*(L.bottom-L.top))
          r = { x: L.mask.left/W, y: L.mask.top/Hh, w: (L.mask.right-L.mask.left)/W, h: (L.mask.bottom-L.mask.top)/Hh };
        else r = { x: L.left/W, y: L.top/Hh, w: (L.right-L.left)/W, h: (L.bottom-L.top)/Hh };
        var x0 = clamp(r.x, 0, 1), y0 = clamp(r.y, 0, 1), x1 = clamp(r.x + r.w, 0, 1), y1 = clamp(r.y + r.h, 0, 1);
        return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
      }
      function one(){
        if (step >= total){ finish(); return; }
        var idx = step++, leaf = leaves[idx]; L = leaf.L;
        var kind = kinds[idx];
        try {
          if (kind === "text"){
            if (leaf.vis && L.text && L.text.words){
              var eng = L.text.eng, pxSize = (eng.size || 0) * (L.text.scale || 1), rel = pxSize / Hh;
              var r = rectOf(L);
              if (eng.font){ if (fonts.indexOf(eng.font) < 0) fonts.push(eng.font); if (!fontMap(eng.font) && missing.indexOf(eng.font) < 0) missing.push(eng.font); }
              texts.push({ role: textRole(L.text.words, rel), text: L.text.words.slice(0, 120), x: r.x + r.w/2, y: r.y + r.h/2, w: r.w,
                           rel: rel, align: eng.align || "center", color: eng.color || "", font: fontMap(eng.font), pxSize: pxSize });
            }
          } else if (kind === "photo"){
            if (leaf.vis) frames.push(rectOf(L));
          } else if (kind === "deco" && leaf.vis && L.kind !== "adjust"){
            var cv = null, drawn = false;
            if (L.chans.length >= 1 && L.right > L.left && L.bottom > L.top && !L.extra.solid) cv = psdLeafCanvas(P, L);
            if (cv && flatCandidates.indexOf(idx) >= 0 && psdIsFlat(cv)){ frames.push(rectOf(L)); if (lowestFrame === Infinity || idx < lowestFrame) lowestFrame = idx; cv.width = cv.height = 1; }
            else {
              var target = (idx > lowestFrame) ? fx : bx;
              target.save();
              target.globalAlpha = clamp(leaf.op, 0, 1);
              try { target.globalCompositeOperation = PSD_BLEND[L.blend] || "source-over"; } catch(eB){}
              if (cv){ target.drawImage(cv, L.left*k, L.top*k, cv.width*k, cv.height*k); drawn = true; cv.width = cv.height = 1; }
              else if (L.extra.solid && L.fill){
                var fr = L.vrect ? L.vrect : { x: 0, y: 0, w: 1, h: 1 };
                target.fillStyle = L.fill; target.fillRect(fr.x*cw, fr.y*ch, fr.w*cw, fr.h*ch); drawn = true;
              }
              target.restore();
              if (drawn){ if (target === fx) fgN++; else mergedN++; }
            }
          }
        } catch(eL){ warn.push("layer " + (L.name || idx) + ": " + (eL && eL.message || eL)); }
        if (typeof opt.onStep === "function"){ try { opt.onStep(step, total); } catch(eS){} }
        setTimeout(one, 0);
      }
      function finish(){
        /* no layers at all (a flattened file): the merged picture is the whole template */
        if (!leaves.length && P.merged){
          try {
            var m = P.merged, u8 = P.u8, at = m.at + 2, chN = Math.min(P.channels, 4), planes = [], c, rows = Hh;
            if (m.comp === 0){ for (c=0;c<chN;c++){ planes.push(u8.subarray(at, at + W*Hh*(P.depth===16?2:1))); at += W*Hh*(P.depth===16?2:1); } }
            else if (m.comp === 1){
              var counts = [], q = at, r2; for (r2=0;r2<rows*chN;r2++){ counts.push((u8[q]<<8)|u8[q+1]); q += 2; }
              for (c=0;c<chN;c++){ var pl = new Uint8Array(W*Hh), o = 0, y; var row = new Uint8Array(W*(P.depth===16?2:1)); for (y=0;y<rows;y++){ unpackBits(u8, q, q + counts[c*rows+y], row, 0, row.length); q += counts[c*rows+y]; if (P.depth===16){ var xx2; for (xx2=0;xx2<W;xx2++) pl[o++] = row[xx2*2]; } else { pl.set(row, o); o += W; } } planes.push(pl); }
            }
            if (planes.length){
              var full = document.createElement("canvas"); full.width = W; full.height = Hh; var fxc = full.getContext("2d");
              var img = fxc.createImageData(W, Hh), d = img.data, n = W*Hh, ii, qq;
              for (ii=0,qq=0;ii<n;ii++,qq+=4){ d[qq] = planes[0][ii]; d[qq+1] = (planes[1]||planes[0])[ii]; d[qq+2] = (planes[2]||planes[0])[ii]; d[qq+3] = 255; }
              fxc.putImageData(img, 0, 0); bx.drawImage(full, 0, 0, cw, ch); full.width = full.height = 1; mergedN = 1;
            }
          } catch(eM){ warn.push("merged: " + (eM && eM.message || eM)); }
        }
        /* frames: drop the slivers, merge the near-duplicates, cap at the library's maximum */
        var clean = [], fi, fj;
        frames.sort(function(a, b){ return (a.y - b.y) || (a.x - b.x); });
        for (fi=0;fi<frames.length;fi++){
          var f = frames[fi]; if (f.w*f.h < 0.01 || f.w < 0.03 || f.h < 0.03) continue;
          var dup = false;
          for (fj=0;fj<clean.length;fj++){
            var g = clean[fj], ix = Math.max(0, Math.min(f.x+f.w, g.x+g.w) - Math.max(f.x, g.x)), iy = Math.max(0, Math.min(f.y+f.h, g.y+g.h) - Math.max(f.y, g.y));
            var inter = ix*iy, uni = f.w*f.h + g.w*g.h - inter;
            if (uni > 0 && inter/uni > 0.85){ dup = true; break; }
          }
          if (!dup) clean.push(f);
        }
        var maxP = (LIBD.maxPhotos || 8);
        if (clean.length > maxP){ warn.push("frames:" + clean.length); clean = clean.slice(0, maxP); }
        if (!clean.length) warn.push("noframes");
        if (P.depth === 16) warn.push("16bit");
        var fgHas = fgN > 0;
        var out = { w: W, h: Hh, dpi: P.dpi, cmW: Math.round(W / P.dpi * 254) / 100, cmH: Math.round(Hh / P.dpi * 254) / 100,
                    orient: (W > Hh*1.05) ? "land" : (Hh > W*1.05) ? "port" : "sq",
                    frames: clean, texts: texts.slice(0, 12), fonts: fonts, fontsMissing: missing, layers: layersN, merged: mergedN, fgLayers: fgN, warn: warn,
                    bg: bg.toDataURL("image/jpeg", 0.86), fg: fgHas ? fg.toDataURL("image/png") : "" };
        var tk = Math.min(1, (LIBD.thumb || 320) / Math.max(cw, ch)), tc = document.createElement("canvas");
        tc.width = Math.max(1, Math.round(cw*tk)); tc.height = Math.max(1, Math.round(ch*tk));
        var tx = tc.getContext("2d");
        if (tx){ tx.drawImage(bg, 0, 0, tc.width, tc.height); if (fgHas) tx.drawImage(fg, 0, 0, tc.width, tc.height);
          /* the frames drawn as light boxes on the tile, so a template reads as a template */
          tx.fillStyle = "rgba(201,162,39,0.55)"; var q2; for (q2=0;q2<clean.length;q2++){ var fr2 = clean[q2]; tx.fillRect(fr2.x*tc.width, fr2.y*tc.height, fr2.w*tc.width, fr2.h*tc.height); }
          out.thumb = tc.toDataURL("image/jpeg", 0.8); }
        bg.width = bg.height = fg.width = fg.height = tc.width = tc.height = 1;
        resolve(out);
      }
      one();
    });
  }

  /* ======================= BUILD THE ALBUM FROM TEMPLATES (the recording's "Tạo Album") =======================

     So many sheets, so many photographs a sheet, from which group of templates, by group or at random,
     the photographs in the order they came or portraits paired, the couple's names, the date and the
     venue set into every slot. What the recording does behind a spinner is done here in seven steps
     that are written to the card as they happen, because a studio that watches its album being laid
     trusts the result — and because every one of the seven is a real step (the subject finder, the
     shape scorer, the planner, the print check), not a progress bar over a sleep. */
  var BUILD = { method: "group", group: "*", sheets: 0, min: 1, max: 4, pair: true, order: true, outside: true, studio: true };
  var BUILD_METHODS = ["group", "random", "order"];
  /* HOW MANY PHOTOGRAPHS EACH SHEET TAKES. `want` sheets between min and max a sheet; a want the count
     cannot honour is pulled into the range it can; counts alternate fuller and lighter so facing sheets
     differ; a sheet of one whose photograph is a portrait borrows a second when a neighbour has one to spare. */
  function planSheets(total, want, min, max, shapes, pair){
    total = Math.max(0, total|0); if (!total) return [];
    min = clamp(min|0 || 1, 1, LIB_MAXP); max = clamp(max|0 || min, min, LIB_MAXP);
    var lo = Math.ceil(total/max), hi = Math.floor(total/min), s = want|0, i;
    if (hi < lo) hi = lo;
    if (!(s >= 1)) s = Math.round((lo + hi)/2);
    s = clamp(s, lo, hi);
    var out = [], base = Math.floor(total/s), rem = total - base*s;
    for (i=0;i<s;i++) out.push(base + (i < rem ? 1 : 0));
    for (i=0;i+1<out.length;i+=2){
      if (((i/2)|0) % 2 === 0){ if (out[i] > min && out[i+1] < max){ out[i]--; out[i+1]++; } }
      else if (out[i] < max && out[i+1] > min){ out[i]++; out[i+1]--; }
    }
    if (pair && shapes && shapes.length){
      var at = 0;
      for (i=0;i<out.length;i++){
        var sh = shapes[at];
        if (out[i] === 1 && sh && sh.h > sh.w && 1 < max){
          var j = (i+1 < out.length && out[i+1] > min) ? i+1 : (i > 0 && out[i-1] > min ? i-1 : -1);
          if (j >= 0){ out[j]--; out[i]++; }
        }
        at += out[i];
      }
    }
    var clean = []; for (i=0;i<out.length;i++) if (out[i] > 0) clean.push(out[i]);
    return clean;
  }
  /* the templates that may lay a sheet of `count` photographs — the library's (in the chosen group, or
     any group when allowed) and the studio's own layouts — each scored against the photographs' shapes */
  function buildCandidates(count, shapes, orient, o, used){
    var out = [], all = libItems(), i, it, rec, sc, tpl;
    for (i=0;i<all.length;i++){
      it = all[i]; if (it.trash || it.n !== count) continue;
      if (o.method === "group" && o.group !== "*" && (it.group || "") !== o.group && !o.outside) continue;
      rec = libRec(it.id); if (!rec) continue;
      tpl = { id: it.id, n: count, cells: rec.frames };
      sc = tplScore(tpl, shapes);
      if (o.method === "group" && o.group !== "*" && (it.group || "") !== o.group) sc -= 0.15;   /* outside the group: allowed, but after the group's own */
      if (it.orient !== orient) sc -= 0.1;
      if (used[it.id]) sc -= 0.08;
      if (it.star) sc += 0.03;
      out.push({ lib: it.id, score: sc });
    }
    if (o.studio && count <= MAXP){
      var list = tplsFor(count);
      for (i=0;i<list.length;i++){ sc = tplScore(list[i], shapes) - 0.05; if (used[list[i].id]) sc -= 0.08; out.push({ tpl: list[i].id, score: sc }); }
    }
    out.sort(function(a, b){ return b.score - a.score; });
    return out;
  }
  function pickCandidate(cands, method, rnd){
    if (!cands.length) return null;
    if (method === "random"){ var top = cands.slice(0, Math.min(3, cands.length)); return top[Math.floor((rnd || Math.random)() * top.length)]; }
    return cands[0];
  }
  /* portraits side by side: walk the list and, where a portrait is followed by a landscape and a portrait, bring the second portrait forward */
  function pairPortraits(list){
    var out = list.slice(), i;
    for (i=0;i+2<out.length;i++){
      var a = out[i], b = out[i+1], c = out[i+2];
      if (a.h > a.w && !(b.h > b.w) && c.h > c.w){ out[i+1] = c; out[i+2] = b; }
    }
    return out;
  }
  /* the light under a slot decides its ink: a template whose picture is dark there takes white words */
  function inkUnder(rec, t){
    var o = curOcc(), ink = (o && o.ink) || INKS[0];
    if (t.color) return t.color;
    if (!rec || rec.builtin) return (rec && rec.builtin && rec.look === "minimal") ? "#1b1b1f" : ink;
    var im = rec.thumb ? IMGS[rec.thumb] : null; if (!im) return ink;
    try {
      var cv = document.createElement("canvas"); cv.width = 32; cv.height = 32; var x = cv.getContext("2d"); if (!x) return ink;
      x.drawImage(im, 0, 0, 32, 32);
      var px = x.getImageData(clamp(Math.round(t.x*32) - 3, 0, 25), clamp(Math.round(t.y*32) - 1, 0, 29), 6, 2).data, i, lum = 0;
      for (i=0;i<px.length;i+=4) lum += 0.2126*px[i] + 0.7152*px[i+1] + 0.0722*px[i+2];
      lum /= (px.length/4);
      return lum < 110 ? "#ffffff" : ink;
    } catch(e){ return ink; }
  }
  function aiStart(){
    var keys = ["gather", "faces", "order", "plan", "pick", "lay", "check"], steps = [], i;
    for (i=0;i<keys.length;i++) steps.push({ k: keys[i], state: "wait", note: "" });
    LIBV.ai = { steps: steps, done: false, lines: [], t0: Date.now() };
  }
  function aiStep(i, state, note){
    var a = LIBV.ai; if (!a) return;
    a.steps[i].state = state; if (note != null) a.steps[i].note = note;
    if (i+1 < a.steps.length && state !== "run") a.steps[i+1].state = "run";
    aiTick();
  }
  function aiBox(){
    var box = E("div","alb-aibox"); box.id = "albAiBox";
    var a = LIBV.ai, i;
    box.appendChild(E("p","alb-selname", L("alb_ai_h")));
    var list = E("div","alb-ailog"); list.id = "albAiLog";
    for (i=0;i<a.steps.length;i++){
      var s = a.steps[i], row = E("p","alb-ailine alb-ai-" + s.state);
      row.id = "albAi_" + s.k;
      row.textContent = (s.state === "ok" ? "✓ " : s.state === "run" ? "… " : s.state === "warn" ? "! " : "· ") + "S" + (i+1) + " " + L("alb_ai_" + s.k) + (s.note ? " — " + s.note : "");
      list.appendChild(row);
    }
    box.appendChild(list);
    if (a.done){
      var ok = E("button","btn", L("alb_lib_dismiss")); ok.type = "button"; ok.id = "albAiDismiss"; ok.onclick = function(){ LIBV.ai = null; render(); };
      box.appendChild(grid("btn", [ok], albWidth()));
    }
    return box;
  }
  function aiTick(){
    var box = document.getElementById("albAiBox"); if (!box || !LIBV.ai) return;
    var fresh = aiBox(); box.parentNode.replaceChild(fresh, box);
  }
  function buildBox(){
    var box = E("div","alb-buildbox"); box.id = "albBuildBox";
    var w = albWidth(), i, info = infoOf();
    box.appendChild(subh(L("alb_build_h")));
    /* who and when: the couple, the date, the venue — set into every template's slots */
    var frow = E("div","alb-opts");
    for (i=0;i<INFO_KEYS.length;i++){
      (function(k){
        var inp = document.createElement("input"); inp.type = "text"; inp.className = "inp alb-info"; inp.id = "albInfo_" + k; inp.maxLength = 60;
        inp.placeholder = L("alb_info_" + k); inp.value = info[k] || "";
        inp.oninput = function(){ infoOf()[k] = inp.value; saveSoon(); if (k === "date") dateWarn(); };
        frow.appendChild(inp);
      })(INFO_KEYS[i]);
    }
    box.appendChild(frow);
    var dw = E("p","alb-warn"); dw.id = "albDateWarn"; box.appendChild(dw);
    var ap = E("button","btn", L("alb_info_apply")); ap.type = "button"; ap.id = "albInfoApply";
    ap.onclick = function(){ var n = applyInfo(); H.toast(L("alb_info_applied").replace("{N}", String(n)), n ? "ok" : ""); };
    box.appendChild(grid("btn", [ap], w));
    /* the method and the group */
    box.appendChild(subh(L("alb_build_method")));
    var mc = [];
    for (i=0;i<BUILD_METHODS.length;i++){ (function(mth){ var b = chip(L("alb_build_m_" + mth), BUILD.method === mth, function(){ BUILD.method = mth; render(); }); b.id = "albBuildM_" + mth; mc.push(b); })(BUILD_METHODS[i]); }
    var mrow = grid("size", mc, w); mrow.id = "albBuildMethods"; box.appendChild(mrow);
    var gs = libGroupsAll(), gc = [chip(L("alb_lib_all"), BUILD.group === "*", function(){ BUILD.group = "*"; render(); })]; gc[0].id = "albBuildG_all";
    for (i=0;i<gs.length;i++){ (function(g){ if (!g) return; var b = chip(libGroupLabel(g), BUILD.group === g, function(){ BUILD.group = g; render(); }); b.id = "albBuildG_" + g; gc.push(b); })(gs[i]); }
    var grow = grid("size", gc, w); grow.id = "albBuildGroups"; box.appendChild(grow);
    /* the numbers */
    var photos = DOC.pool.length, def = photos ? planSheets(photos, 0, BUILD.min, BUILD.max, null, false).length : 0;
    var nums = E("div","alb-opts");
    function num(id, label, val, lo, hi, set){
      var lab = E("label","alb-dimlab", label); lab.setAttribute("for", id);
      var inp = document.createElement("input"); inp.type = "number"; inp.className = "inp alb-num"; inp.id = id; inp.min = String(lo); inp.max = String(hi); inp.value = String(val);
      inp.onchange = function(){ set(clamp(parseInt(inp.value, 10) || lo, lo, hi)); render(); };
      nums.appendChild(lab); nums.appendChild(inp);
    }
    num("albBuildSheets", L("alb_build_sheets"), BUILD.sheets || def, 1, 200, function(v){ BUILD.sheets = v; });
    num("albBuildMin", L("alb_build_min"), BUILD.min, 1, LIB_MAXP, function(v){ BUILD.min = v; if (BUILD.max < v) BUILD.max = v; });
    num("albBuildMax", L("alb_build_max"), BUILD.max, 1, LIB_MAXP, function(v){ BUILD.max = v; if (BUILD.min > v) BUILD.min = v; });
    box.appendChild(nums);
    var sw = [];
    function tog(id, key, label){ var b = chip(label, !!BUILD[key], function(){ BUILD[key] = !BUILD[key]; render(); }); b.id = id; sw.push(b); }
    tog("albBuildPair", "pair", L("alb_build_pair")); tog("albBuildOrder", "order", L("alb_build_order")); tog("albBuildOutside", "outside", L("alb_build_outside")); tog("albBuildStudio", "studio", L("alb_build_studio"));
    var srow = grid("size", sw, w); srow.id = "albBuildSwitches"; box.appendChild(srow);
    var go = E("button","btn btn-gold", L("alb_build_go").replace("{N}", String(photos))); go.type = "button"; go.id = "albBuildGo"; go.disabled = !photos;
    go.onclick = function(){ buildAlbum(); };
    var cancel = E("button","btn", L("alb_build_close")); cancel.type = "button"; cancel.id = "albBuildClose"; cancel.onclick = function(){ LIBV.build = false; render(); };
    var grow2 = grid("btn", [go, cancel], w); grow2.id = "albBuildOps"; box.appendChild(grow2);
    box.appendChild(E("p","mut", L("alb_build_note")));
    setTimeout(dateWarn, 0);
    return box;
  }
  function dateWarn(){
    var el = document.getElementById("albDateWarn"); if (!el) return;
    var d = (infoOf().date || "").trim(), p = dateParts(d);
    el.textContent = (d && !p.ok) ? L("alb_date_warn") : "";
  }
  /* the couple, the date and the venue into every slot on every page that came from a template */
  function applyInfo(){
    var i, k, n = 0, pg, rec, t, tx;
    for (i=0;i<DOC.pages.length;i++){
      pg = DOC.pages[i]; rec = libRec(pg.lib); if (!rec) continue;
      for (k=0;k<(pg.texts||[]).length;k++){
        tx = pg.texts[k]; if (!tx.auto) continue;
        var slot = null, q; for (q=0;q<rec.texts.length;q++) if (rec.texts[q].role === tx.role){ slot = rec.texts[q]; break; }
        if (!slot) continue;
        t = slotText(slot); if (t && t !== tx.text){ tx.text = String(t).slice(0, 120); n++; }
      }
    }
    if (n) onDocChange(false);
    return n;
  }
  function buildAlbum(){
    if (!DOC.pool.length){ H.toast(L("alb_build_none"), ""); return Promise.resolve(0); }
    var go = hasWork() ? askP(L("alb_make_replace")) : Promise.resolve(true);
    return go.then(function(ok){ return ok ? buildGo(BUILD, Math.random) : 0; });
  }
  function buildGo(o, rnd){
    var photos = DOC.pool.map(clonePhoto), shapes, counts, plan = [], pages = [], used = {}, fromLib = 0, fromStudio = 0, kept = 0, lines = 0, i;
    aiStart(); LIBV.build = false; render();
    var sz = curSize(), safe = safeArea(sz), orient = safe ? orientOf(safe.page.w, safe.page.h) : "land";
    return tick(function(){
      /* S1 — the photographs */
      var land = 0, port = 0; for (i=0;i<photos.length;i++){ if (photos[i].w > photos[i].h) land++; else port++; }
      aiStep(0, "ok", L("alb_ai_n_gather").replace("{N}", String(photos.length)).replace("{L}", String(land)).replace("{P}", String(port)));
      /* S2 — the subjects (read once when each photograph arrived; read now for any that was not) */
      var missing = []; for (i=0;i<photos.length;i++) if (!photos[i].subject) missing.push(photos[i]);
      return missing.reduce(function(chain, ph){ return chain.then(function(){ return imgFor(ph.src).then(function(im){ if (im) ph.subject = measureSubject(im, ph.w, ph.h); }); }); }, Promise.resolve());
    }).then(function(){
      var found = 0; for (i=0;i<photos.length;i++) if (photos[i].subject) found++;
      aiStep(1, found ? "ok" : "warn", L("alb_ai_n_faces").replace("{N}", String(found)).replace("{T}", String(photos.length)));
      return tick(function(){
        /* S3 — the order */
        if (!o.order){ photos = pairPortraits(photos); }
        shapes = shapesOf(photos);
        aiStep(2, "ok", L(o.order ? "alb_ai_n_kept" : "alb_ai_n_paired"));
      });
    }).then(function(){ return tick(function(){
        /* S4 — the plan */
        counts = planSheets(photos.length, o.sheets, o.min, o.max, shapes, o.pair);
        var lo = Math.min.apply(null, counts), hi = Math.max.apply(null, counts);
        aiStep(3, "ok", L("alb_ai_n_plan").replace("{S}", String(counts.length)).replace("{A}", String(lo)).replace("{B}", String(hi)));
        /* every library template of a count the plan uses, read before it is scored */
        var need = {}, jobs = [], all = libItems();
        for (i=0;i<counts.length;i++) need[counts[i]] = true;
        for (i=0;i<all.length;i++) if (!all[i].trash && need[all[i].n] && !all[i].builtin) jobs.push(libLoad(all[i].id));
        return Promise.all(jobs);
    }); }).then(function(){ return tick(function(){
        /* S5 — the templates */
        var at = 0;
        for (i=0;i<counts.length;i++){
          var sh = shapes.slice(at, at + counts[i]);
          var cands = buildCandidates(counts[i], sh, orient, o, used), pick = pickCandidate(cands, o.method, rnd);
          if (pick){ used[pick.lib || pick.tpl] = true; if (pick.lib) fromLib++; else fromStudio++; }
          plan.push({ from: at, count: counts[i], pick: pick });
          at += counts[i];
        }
        aiStep(4, fromLib ? "ok" : "warn", L("alb_ai_n_pick").replace("{L}", String(fromLib)).replace("{S}", String(fromStudio)));
    }); }).then(function(){
      /* the template thumbnails, for the ink under each slot */
      var jobs = [];
      for (i=0;i<plan.length;i++){ var r = plan[i].pick && plan[i].pick.lib ? libRec(plan[i].pick.lib) : null; if (r && r.thumb) jobs.push(imgFor(r.thumb)); }
      return Promise.all(jobs);
    }).then(function(){ return tick(function(){
        /* S6 — the pages: frames, face-safe crops, the slots' words */
        var doc = blankDoc(), k;
        doc.guides = DOC.guides; doc.style = DOC.style; doc.paper = DOC.paper; doc.density = DOC.density; doc.cover = false;
        doc.occ = DOC.occ; doc.pair = DOC.pair; doc.sizeId = DOC.sizeId; doc.custom = DOC.custom; doc.customGroup = DOC.customGroup; doc.lockRatio = DOC.lockRatio;
        doc.info = infoOf(); doc.logo = DOC.logo || "";
        doc.pool = photos.map(clonePhoto);
        for (i=0;i<plan.length;i++){
          var p = plan[i], pg = blankPage(), rec = null;
          pg.photos = photos.slice(p.from, p.from + p.count).map(clonePhoto);
          if (p.pick && p.pick.lib){ pg.lib = p.pick.lib; pg.auto = false; rec = libRec(pg.lib); }
          else if (p.pick && p.pick.tpl){ pg.tplId = p.pick.tpl; pg.auto = false; }
          if (rec){
            var slots = slotTexts(rec, pg);
            for (k=0;k<slots.length;k++){ slots[k].color = inkUnder(rec, rec.texts[k] || slots[k]); lines++; }
            pg.texts = slots;
          }
          pages.push(pg);
        }
        doc.pages = pages; doc.cur = 0;
        DOC = doc; SEL = null;
        for (i=0;i<DOC.pages.length;i++){ reAnchor(DOC.pages[i], i); for (k=0;k<DOC.pages[i].photos.length;k++) if (DOC.pages[i].photos[k].anchor && DOC.pages[i].photos[k].anchor.why === "subject") kept++; }
        aiStep(5, "ok", L("alb_ai_n_lay").replace("{N}", String(kept)).replace("{T}", String(lines)));
    }); }).then(function(){ return tick(function(){
        /* S7 — the check */
        var finds = printCheck(DOC, curSize());
        aiStep(6, finds.length ? "warn" : "ok", L("alb_ai_n_check").replace("{N}", String(finds.length)));
        LIBV.ai.done = true;
        saveSoon(); commit(); render();
        H.toast(L("alb_build_done").replace("{P}", String(DOC.pages.length)).replace("{N}", String(photos.length)), "ok");
        return DOC.pages.length;
    }); }).catch(function(e){
      if (LIBV.ai){ var a = LIBV.ai, j; for (j=0;j<a.steps.length;j++) if (a.steps[j].state === "run") a.steps[j].state = "warn"; a.done = true; }
      render(); H.toast(L("alb_export_fail"), "err"); return 0;
    });
  }

  /* ---- the sheet's issues, and one button that fixes what it can (the recording's "! 1 issue · Fix this sheet") ---- */
  function sheetIssues(idx){ var all = printCheck(DOC, curSize()), out = [], i; for (i=0;i<all.length;i++) if (all[i].page === idx) out.push(all[i]); return out; }
  function issuesBar(){
    var box = E("div","alb-issues"); box.id = "albIssues";
    var n = DOC.pages.length, finds = sheetIssues(DOC.cur);
    var lab = E("span","alb-sheetlab", L("alb_sheet_of").replace("{A}", String(DOC.cur+1)).replace("{B}", String(n))); box.appendChild(lab);
    if (finds.length){
      var c = E("span","alb-issuechip", "! " + L("alb_issues_n").replace("{N}", String(finds.length))); c.id = "albIssueCount"; box.appendChild(c);
      var fx = E("button","btn alb-fixbtn", "✦ " + L("alb_fix_sheet")); fx.type = "button"; fx.id = "albFixSheet";
      fx.onclick = function(){ var k = fixSheet(DOC.cur); H.toast(k ? L("alb_fixed_n").replace("{N}", String(k)) : L("alb_fixed_none"), k ? "ok" : ""); };
      box.appendChild(fx);
    } else {
      var okc = E("span","alb-issueok", "✓ " + L("alb_issues_none")); okc.id = "albIssueOk"; box.appendChild(okc);
    }
    return box;
  }
  /* what a fix can do: a zoomed-in soft frame back to its cover crop, a photograph too small for its cell moved
     to a layout with a smaller cell, a duplicate swapped for a picture the album has not used, an empty page
     filled from the tray or dropped, a line pulled off the trim, a subject slid out of the binding */
  function fixSheet(idx){
    var pg = DOC.pages[idx]; if (!pg) return 0;
    var finds = sheetIssues(idx), n = 0, i, f, sz = curSize(), safe = safeArea(sz), u = usage();
    for (i=0;i<finds.length;i++){
      f = finds[i];
      if (f.kind === "empty"){
        var k; for (k=0;k<DOC.pool.length && pg.photos.length<1;k++) if (!(u[DOC.pool[k].src] || []).length) pg.photos.push(clonePhoto(DOC.pool[k]));
        if (!pg.photos.length && DOC.pages.length > 1){ DOC.pages.splice(idx, 1); DOC.cur = clamp(DOC.cur, 0, DOC.pages.length-1); n++; onDocChange(true); return n; }
        if (pg.photos.length) n++;
      } else if (f.kind === "low" || f.kind === "soft"){
        var ph = pg.photos[f.i]; if (!ph) continue;
        if ((+ph.zoom || 1) > 1){ ph.zoom = 1; ph.manual = false; n++; continue; }
        if (!pg.lib && pg.photos.length <= MAXP){
          /* the layout whose cell for this photograph is smallest, so more of its pixels are asked of it */
          var list = tplsFor(pg.photos.length), best = null, bestArea = Infinity, q, rects, cur = pageTpl(pg, idx);
          for (q=0;q<list.length;q++){ rects = cellRects(list[q], layoutRect(safe, pg)); if (rects[f.i] && rects[f.i].w*rects[f.i].h < bestArea && list[q].id !== (cur && cur.id)){ bestArea = rects[f.i].w*rects[f.i].h; best = list[q]; } }
          var curRects = cellRects(cur, layoutRect(safe, pg));
          if (best && curRects[f.i] && bestArea < curRects[f.i].w*curRects[f.i].h*0.8){ pg.tplId = best.id; pg.auto = false; n++; }
        }
      } else if (f.kind === "dup"){
        var k2, swapped = false;
        for (k2=0;k2<DOC.pool.length && !swapped;k2++) if (!(u[DOC.pool[k2].src] || []).length){ pg.photos[f.i] = clonePhoto(DOC.pool[k2]); u[DOC.pool[k2].src] = [idx]; swapped = true; n++; }
      } else if (f.kind === "edge"){
        var tx = pg.texts[f.i]; if (tx){ tx.x = clamp(tx.x, 0.06, 0.94); tx.y = clamp(tx.y, 0.06, 0.94); n++; }
      } else if (f.kind === "gutter"){
        var ph2 = pg.photos[f.i]; if (ph2){ ph2.anchor = { x: (ph2.anchor && ph2.anchor.x > 0.5) ? 0.85 : 0.15, y: (ph2.anchor && ph2.anchor.y) || 0.5 }; ph2.manual = true; n++; }
      }
    }
    if (n){ reAnchor(pg, idx); onDocChange(false); }
    return n;
  }

  /* ======================= THE MARKS, THE LOGO, THE TEXT STYLES AND THE SHEET'S BACKGROUND =======================

     The recording's "Thời gian" and "Ký tên" drawers: a DATE drawn eight ways (a stack, a dotted line, a
     calendar page, roman numerals, a ring, a script line, a tag, a split) and a MONOGRAM of the couple's
     initials drawn eight ways — decor a page wears beside its ornaments, from the album's own date and
     names, in the ornament's five tints. The studio's LOGO is a picture the album keeps once and every
     sheet may carry. Twelve TEXT STYLES set a line's face and size in one tap. And the recording's sheet
     background: one photograph behind the whole sheet, blurred, dimmed, zoomed, desaturated or mirrored,
     under a colour that washes the whole sheet or only its top or bottom. */
  var MARK_W = 0.18, MARK_ASPECT = { date: { stack: 1.1, dots: 0.36, calendar: 1.15, roman: 0.62, ring: 1, script: 0.5, tag: 0.72, split: 0.46 },
                                     mono: { circle: 1, diamond: 1, amp: 0.62, laurel: 1, seal: 1, line: 0.36, stamp: 0.92, script: 0.6 } };
  var MONTHS_EN = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"];
  var MONTHS_3 = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  var MY_DIGITS = "၀၁၂၃၄၅၆၇၈၉";
  function asciiDigits(s){ var out = "", i, k; for (i=0;i<s.length;i++){ k = MY_DIGITS.indexOf(s.charAt(i)); out += (k >= 0) ? String(k) : s.charAt(i); } return out; }
  /* the date as three numbers, from the shapes a studio types: 2026-11-12 · 12/11/2026 · 12.11.2026 · 12 Nov 2026 · Nov 12, 2026 · Burmese digits */
  function dateParts(s){
    var t = asciiDigits(String(s || "").trim()), m, d, mo, y;
    if (!t) return { ok: false, raw: "" };
    if ((m = /^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})$/.exec(t))){ y = +m[1]; mo = +m[2]; d = +m[3]; }
    else if ((m = /^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{2,4})$/.exec(t))){ d = +m[1]; mo = +m[2]; y = +m[3]; if (y < 100) y += 2000; }
    else if ((m = /^(\d{1,2})\s+([A-Za-z]{3,})\.?,?\s+(\d{4})$/.exec(t))){ d = +m[1]; mo = monthOf(m[2]); y = +m[3]; }
    else if ((m = /^([A-Za-z]{3,})\.?\s+(\d{1,2}),?\s+(\d{4})$/.exec(t))){ mo = monthOf(m[1]); d = +m[2]; y = +m[3]; }
    else return { ok: false, raw: t };
    if (!(mo >= 1 && mo <= 12 && d >= 1 && d <= 31 && y >= 1900 && y <= 2200)) return { ok: false, raw: t };
    return { ok: true, d: d, m: mo, y: y, raw: t };
  }
  function monthOf(w){ var i, s = String(w).slice(0, 3).toUpperCase(); for (i=0;i<12;i++) if (MONTHS_3[i] === s) return i+1; return 0; }
  function roman(n){
    var v = [1000, 900, 500, 400, 100, 90, 50, 40, 10, 9, 5, 4, 1], r = ["M", "CM", "D", "CD", "C", "XC", "L", "XL", "X", "IX", "V", "IV", "I"], out = "", i;
    n = n|0; if (!(n > 0)) return "";
    for (i=0;i<v.length;i++) while (n >= v[i]){ out += r[i]; n -= v[i]; }
    return out;
  }
  function pad2(n){ return (n < 10 ? "0" : "") + n; }
  /* the couple's initials — the first letter of each name; a name not yet typed shows a placeholder letter */
  function initials(){
    var f = infoOf(), a = (f.bride || "").trim(), b = (f.groom || "").trim();
    return [a ? a.charAt(0).toUpperCase() : "A", b ? b.charAt(0).toUpperCase() : "B"];
  }
  function markFont(kind){
    var id = kind === "script" ? "greatvibes" : kind === "sans" ? "montserrat" : "playfair";
    var f = fontById(id); return { css: f ? f.css : "", stack: (f && f.stack) || (kind === "script" ? "cursive" : kind === "sans" ? "sans-serif" : "Georgia, serif"), w: (f && f.w) || [400] };
  }
  function markFontJobs(pg){
    var jobs = [], seen = {}, i, dc = (pg && pg.decor) || [];
    if (typeof document === "undefined" || !document.fonts || typeof document.fonts.load !== "function") return jobs;
    for (i=0;i<dc.length;i++){
      if (!dc[i] || dc[i].kind !== "mark") continue;
      ["serif", "script", "sans"].forEach(function(k){ var f = markFont(k); if (f.css && !seen[f.css]){ seen[f.css] = true; try { jobs.push(Promise.resolve(document.fonts.load('400 40px "' + f.css + '"', "AB&12"))["catch"](function(){ return null; })); } catch(e){} } });
    }
    return jobs;
  }
  function markAspect(d){ var fam = MARK_ASPECT[d.fam] || {}; return fam[d.style] || 1; }
  /* every selectable decor kind's box — an ornament's from its mask, a mark's from its style, the logo's from its picture */
  function decorBox(d, safe){
    if (!d) return null;
    if (d.kind === "orn") return ornBox(d, safe);
    var w = clamp(+d.w || MARK_W, ORN_W_MIN, ORN_W_MAX), ar;
    if (d.kind === "logo"){ var im = IMGS[(DOC && DOC.logo) || ""]; ar = im ? ((im.naturalWidth || im.width) / Math.max(1, im.naturalHeight || im.height)) : 2; }
    else ar = 1 / markAspect(d);
    return { x: +d.x || 0, y: +d.y || 0, w: w, h: w * (safe.w / safe.h) / ar, rot: (+d.rot || 0) * Math.PI/180, flip: false };
  }
  function decorOk(d){
    if (!d) return false;
    if (d.kind === "orn") return !!ornById(d.id);
    if (d.kind === "mark") return !!(MARKS[d.fam] && MARKS[d.fam].indexOf(d.style) >= 0);
    if (d.kind === "logo") return !!(DOC && DOC.logo);
    return false;
  }
  function decorLabel(d){
    if (d.kind === "orn") return ornLabel(d.id);
    if (d.kind === "mark") return L("alb_mark_" + d.fam) + " " + ((MARKS[d.fam] || []).indexOf(d.style) + 1);
    return L("alb_logo");
  }
  function setText(x, font, px, weight){ x.font = (weight || 400) + " " + Math.max(4, Math.round(px)) + "px " + font.stack; }
  /* THE DATE, EIGHT WAYS. Drawn in a box W wide (the mark's own aspect gives its height), centred at 0,0. */
  function drawDateMark(x, style, W, Hh, ink){
    var p = dateParts(infoOf().date), serif = markFont("serif"), script = markFont("script"), sans = markFont("sans");
    x.fillStyle = ink; x.strokeStyle = ink; x.textAlign = "center"; x.textBaseline = "middle"; x.lineWidth = Math.max(1, W*0.012);
    if (!p.ok){ setText(x, serif, W*0.16); x.fillText(p.raw || L("alb_info_date"), 0, 0); return; }
    var mon = MONTHS_EN[p.m-1], mon3 = MONTHS_3[p.m-1], dd = pad2(p.d), yy = String(p.y);
    if (style === "stack"){ setText(x, sans, W*0.11); x.fillText(mon, 0, -Hh*0.34); setText(x, serif, W*0.5, 700); x.fillText(dd, 0, 0); setText(x, sans, W*0.11); x.fillText(yy, 0, Hh*0.36); }
    else if (style === "dots"){ setText(x, sans, W*0.14); x.fillText(dd + "  ·  " + pad2(p.m) + "  ·  " + yy, 0, 0); }
    else if (style === "calendar"){
      var r = W*0.06; x.beginPath(); x.rect(-W/2 + 1, -Hh/2 + 1, W - 2, Hh - 2); x.stroke();
      x.fillRect(-W/2 + 1, -Hh/2 + 1, W - 2, Hh*0.22); x.fillStyle = "#ffffff"; setText(x, sans, W*0.1, 700); x.fillText(mon, 0, -Hh/2 + Hh*0.12);
      x.fillStyle = ink; setText(x, serif, W*0.46, 700); x.fillText(dd, 0, Hh*0.1); setText(x, sans, W*0.09); x.fillText(yy, 0, Hh*0.38); r = r;
    }
    else if (style === "roman"){ setText(x, serif, W*0.13); x.fillText(roman(p.d) + " · " + roman(p.m) + " · " + roman(p.y), 0, -Hh*0.15); x.fillRect(-W*0.3, Hh*0.12, W*0.6, Math.max(1, W*0.008)); setText(x, sans, W*0.07); x.fillText(dd + " " + mon3 + " " + yy, 0, Hh*0.32); }
    else if (style === "ring"){ x.beginPath(); x.arc(0, 0, W*0.47, 0, Math.PI*2); x.stroke(); x.beginPath(); x.arc(0, 0, W*0.42, 0, Math.PI*2); x.lineWidth = Math.max(0.5, W*0.005); x.stroke(); setText(x, serif, W*0.34, 700); x.fillText(dd, 0, -W*0.02); setText(x, sans, W*0.08); x.fillText(mon3 + " " + yy, 0, W*0.22); }
    else if (style === "script"){ setText(x, script, W*0.2); x.fillText(p.d + " " + mon.charAt(0) + mon.slice(1).toLowerCase() + " " + yy, 0, 0); }
    else if (style === "tag"){ x.beginPath(); x.moveTo(-W/2 + Hh*0.35, -Hh/2 + 1); x.lineTo(W/2 - 1, -Hh/2 + 1); x.lineTo(W/2 - 1, Hh/2 - 1); x.lineTo(-W/2 + Hh*0.35, Hh/2 - 1); x.lineTo(-W/2 + 1, 0); x.closePath(); x.stroke(); setText(x, sans, W*0.12, 700); x.fillText(dd + " / " + pad2(p.m) + " / " + yy, W*0.06, 0); }
    else { setText(x, serif, W*0.22, 700); x.fillText(dd, -W*0.26, 0); x.fillRect(-Math.max(1, W*0.006), -Hh*0.4, Math.max(1, W*0.012), Hh*0.8); setText(x, sans, W*0.085); x.fillText(mon, W*0.24, -Hh*0.18); x.fillText(yy, W*0.24, Hh*0.2); }
  }
  /* THE MONOGRAM, EIGHT WAYS. */
  function drawMonoMark(x, style, W, Hh, ink){
    var ab = initials(), serif = markFont("serif"), script = markFont("script"), sans = markFont("sans"), amp = pick9(SD_WORDS.and || {}) || "&";
    x.fillStyle = ink; x.strokeStyle = ink; x.textAlign = "center"; x.textBaseline = "middle"; x.lineWidth = Math.max(1, W*0.014);
    if (style === "circle"){ x.beginPath(); x.arc(0, 0, W*0.48, 0, Math.PI*2); x.stroke(); setText(x, serif, W*0.42, 700); x.fillText(ab[0] + ab[1], 0, W*0.02); }
    else if (style === "diamond"){ x.save(); x.rotate(Math.PI/4); x.strokeRect(-W*0.34, -W*0.34, W*0.68, W*0.68); x.restore(); setText(x, serif, W*0.36, 700); x.fillText(ab[0] + ab[1], 0, W*0.02); }
    else if (style === "amp"){ setText(x, serif, W*0.4, 700); x.fillText(ab[0], -W*0.3, 0); x.fillText(ab[1], W*0.3, 0); setText(x, script, W*0.34); x.fillText(amp, 0, -W*0.02); }
    else if (style === "laurel"){
      var i, n = 9; x.lineWidth = Math.max(1, W*0.01);
      for (i=0;i<n;i++){ var a = Math.PI*0.65 + i*(Math.PI*0.7/(n-1)), r = W*0.44; x.beginPath(); x.ellipse(Math.cos(a)*r, Math.sin(a)*r, W*0.05, W*0.02, a + Math.PI/2, 0, Math.PI*2); x.fill(); x.beginPath(); x.ellipse(-Math.cos(a)*r, Math.sin(a)*r, W*0.05, W*0.02, -a - Math.PI/2, 0, Math.PI*2); x.fill(); }
      setText(x, serif, W*0.34, 700); x.fillText(ab[0] + amp + ab[1], 0, 0);
    }
    else if (style === "seal"){ x.beginPath(); x.arc(0, 0, W*0.48, 0, Math.PI*2); x.stroke(); x.beginPath(); x.arc(0, 0, W*0.40, 0, Math.PI*2); x.lineWidth = Math.max(0.5, W*0.006); x.stroke(); setText(x, serif, W*0.3, 700); x.fillText(ab[0] + " " + ab[1], 0, -W*0.02); setText(x, sans, W*0.07); x.fillText(namesLine() ? String(dateParts(infoOf().date).y || "") : "", 0, W*0.2); }
    else if (style === "line"){ setText(x, sans, W*0.16); x.fillText(ab[0] + "   " + amp + "   " + ab[1], 0, 0); x.fillRect(-W*0.5, Hh*0.42, W, Math.max(1, W*0.006)); x.fillRect(-W*0.5, -Hh*0.44, W, Math.max(1, W*0.006)); }
    else if (style === "stamp"){ x.strokeRect(-W*0.48, -Hh*0.48, W*0.96, Hh*0.96); x.lineWidth = Math.max(0.5, W*0.006); x.strokeRect(-W*0.43, -Hh*0.43, W*0.86, Hh*0.86); setText(x, serif, W*0.34, 700); x.fillText(ab[0] + ab[1], 0, -Hh*0.05); setText(x, sans, W*0.07); x.fillText((infoOf().venue || "").toUpperCase().slice(0, 18), 0, Hh*0.3); }
    else { setText(x, script, W*0.46); x.fillText(ab[0] + amp + ab[1], 0, 0); }
  }
  function drawMark(x, d, safe, scale, m){
    var b = decorBox(d, safe); if (!b) return;
    var W = b.w*safe.w*scale, Hh = b.h*safe.h*scale;
    if (!(W > 1 && Hh > 1)) return;
    var cx = (safe.x + m)*scale + safe.w*scale*b.x, cy = (safe.y + m)*scale + safe.h*scale*b.y;
    x.save(); x.translate(cx, cy); if (b.rot) x.rotate(b.rot);
    if (d.fam === "date") drawDateMark(x, d.style, W, Hh, tintHex(d.tint)); else drawMonoMark(x, d.style, W, Hh, tintHex(d.tint));
    x.restore();
  }
  function drawLogo(x, d, safe, scale, m){
    var im = IMGS[(DOC && DOC.logo) || ""]; if (!im) return;
    var b = decorBox(d, safe); if (!b) return;
    var W = b.w*safe.w*scale, Hh = b.h*safe.h*scale;
    if (!(W > 0.5 && Hh > 0.5)) return;
    var cx = (safe.x + m)*scale + safe.w*scale*b.x, cy = (safe.y + m)*scale + safe.h*scale*b.y;
    x.save(); x.translate(cx, cy); if (b.rot) x.rotate(b.rot); x.drawImage(im, -W/2, -Hh/2, W, Hh); x.restore();
  }
  function addMark(fam, style){
    if (!MARKS[fam] || MARKS[fam].indexOf(style) < 0 || !DOC) return false;
    var pg = curPage(); if (DOC.view !== "page") DOC.view = "page";
    if (!pg.decor) pg.decor = [];
    if (pg.decor.length >= DECOR_MAX){ H.toast(L("alb_orn_full").replace("{N}", String(DECOR_MAX)), ""); return false; }
    pg.decor.push({ kind: "mark", fam: fam, style: style, x: 0.5, y: (fam === "date") ? 0.86 : 0.14, w: MARK_W, rot: 0, tint: "gold", auto: false });
    SEL = { kind: "decor", i: pg.decor.length-1 };
    onDocChange(false);
    return true;
  }
  function setLogo(src){
    if (!src || !/^data:image\//.test(src) || !DOC) return false;
    DOC.logo = src;
    return imgFor(src).then(function(im){ if (!im){ DOC.logo = ""; return false; } onDocChange(false); H.toast(L("alb_logo_set"), "ok"); return true; });
  }
  function addLogo(){
    if (!DOC || !DOC.logo){ H.toast(L("alb_logo_none"), ""); return false; }
    var pg = curPage(); if (DOC.view !== "page") DOC.view = "page";
    if (!pg.decor) pg.decor = [];
    if (pg.decor.length >= DECOR_MAX){ H.toast(L("alb_orn_full").replace("{N}", String(DECOR_MAX)), ""); return false; }
    pg.decor.push({ kind: "logo", x: 0.9, y: 0.94, w: 0.14, rot: 0, auto: false });
    SEL = { kind: "decor", i: pg.decor.length-1 };
    onDocChange(false);
    return true;
  }
  function logoAll(){
    var i, n = 0, pg; if (!DOC.logo) return 0;
    for (i=0;i<DOC.pages.length;i++){
      pg = DOC.pages[i]; if (!pg.decor) pg.decor = [];
      var k, has = false; for (k=0;k<pg.decor.length;k++) if (pg.decor[k].kind === "logo") has = true;
      if (!has && pg.decor.length < DECOR_MAX){ pg.decor.push({ kind: "logo", x: 0.9, y: 0.94, w: 0.14, rot: 0, auto: false }); n++; }
    }
    if (n) onDocChange(false);
    return n;
  }
  function removeLogo(){
    var i, k, pg, keep;
    if (!DOC.logo) return false;
    for (i=0;i<DOC.pages.length;i++){ pg = DOC.pages[i]; keep = []; for (k=0;k<(pg.decor||[]).length;k++) if (pg.decor[k].kind !== "logo") keep.push(pg.decor[k]); pg.decor = keep; }
    DOC.logo = ""; SEL = null; onDocChange(false); return true;
  }
  /* ---- the twelve text styles ---- */
  function styleById(id){ var i; for (i=0;i<TEXT_STYLES.length;i++) if (TEXT_STYLES[i].id === id) return TEXT_STYLES[i]; return null; }
  function applyTextStyle(id){
    var o = selObj(); if (!o || SEL.kind !== "text") return false;
    var st = styleById(id); if (!st) return false;
    if (fontById(st.font)) o.font = st.font;
    o.size = clamp(+st.size || 1, TEXT_MIN, TEXT_MAX); o.style = st.id; o.auto = false;
    touchChanged(false);
    return true;
  }
  /* ---- the sheet's background photograph ---- */
  var BG_DEF = { blur: 14, bright: 100, zoom: 120, sat: 100, flip: false, tint: { color: "", mode: "full", amt: 45 } };
  var BG_TINTS = ["", "paper", "gold", "white", "ink", "rose", "sage"], BG_MODES = ["full", "top", "bottom"];
  function bgOf(pg){ return (pg && pg.bg && pg.bg.src) ? pg.bg : null; }
  function bgTintHex(c){ if (c === "paper") return (DOC && DOC.paper) || "#ffffff"; return tintHex(c); }
  function rgba(hex, a){ var m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || "#000000"); if (!m) return "rgba(0,0,0," + a + ")"; return "rgba(" + parseInt(m[1],16) + "," + parseInt(m[2],16) + "," + parseInt(m[3],16) + "," + a + ")"; }
  /* brightness and saturation over the small canvas's pixels — cheap, because the canvas is small */
  function bgPixels(cx, w, h, bright, sat){
    try {
      var img = cx.getImageData(0, 0, w, h), d = img.data, i, r, g, b, l;
      for (i=0;i<d.length;i+=4){
        r = d[i]; g = d[i+1]; b = d[i+2]; l = 0.2126*r + 0.7152*g + 0.0722*b;
        r = l + (r - l)*sat; g = l + (g - l)*sat; b = l + (b - l)*sat;
        d[i] = clamp(r*bright, 0, 255); d[i+1] = clamp(g*bright, 0, 255); d[i+2] = clamp(b*bright, 0, 255);
      }
      cx.putImageData(img, 0, 0);
    } catch(e){}
  }
  function drawSheetBg(x, pg, safe, scale, m){
    var bg = bgOf(pg); if (!bg) return;
    var im = IMGS[bg.src]; if (!im) return;
    var W = (safe.page.w + 2*m)*scale, Hh = (safe.page.h + 2*m)*scale, iw = im.naturalWidth || im.width, ih = im.naturalHeight || im.height;
    if (!(iw > 0 && ih > 0 && W > 1 && Hh > 1)) return;
    var blur = clamp(+bg.blur || 0, 0, 40), k = 1 + blur*0.45, sw = Math.max(2, Math.round(W/k)), sh = Math.max(2, Math.round(Hh/k));
    var c = document.createElement("canvas"); c.width = sw; c.height = sh; var cx = c.getContext("2d"); if (!cx) return;
    var fit = coverFit(iw, ih, sw, sh, 0.5, 0.5, clamp((+bg.zoom || 100)/100, 1, 3)); if (!fit) return;
    cx.save(); if (bg.flip){ cx.translate(sw, 0); cx.scale(-1, 1); } cx.drawImage(im, fit.sx, fit.sy, fit.sw, fit.sh, 0, 0, sw, sh); cx.restore();
    if ((+bg.bright || 100) !== 100 || (+bg.sat || 100) !== 100) bgPixels(cx, sw, sh, (+bg.bright || 100)/100, (+bg.sat || 100)/100);
    if (blur > 6){ var c2 = document.createElement("canvas"); c2.width = Math.max(1, sw >> 1); c2.height = Math.max(1, sh >> 1); var x2 = c2.getContext("2d"); if (x2){ x2.drawImage(c, 0, 0, c2.width, c2.height); cx.clearRect(0, 0, sw, sh); cx.drawImage(c2, 0, 0, sw, sh); c2.width = c2.height = 1; } }
    x.save();
    x.imageSmoothingEnabled = true;
    x.drawImage(c, 0, 0, W, Hh);
    var t = bg.tint;
    if (t && t.color){
      var hex = bgTintHex(t.color), a = clamp((+t.amt || 0)/100, 0, 1);
      if (t.mode === "top" || t.mode === "bottom"){
        var g = (t.mode === "top") ? x.createLinearGradient(0, 0, 0, Hh*0.65) : x.createLinearGradient(0, Hh, 0, Hh*0.35);
        g.addColorStop(0, rgba(hex, a)); g.addColorStop(1, rgba(hex, 0)); x.fillStyle = g;
      } else { x.fillStyle = rgba(hex, a); }
      x.fillRect(0, 0, W, Hh);
    }
    x.restore();
    c.width = c.height = 1;
  }
  function setSheetBg(src){
    var pg = curPage(); if (!pg) return false;
    if (!src){ pg.bg = null; onDocChange(false); return true; }
    var was = bgOf(pg);
    pg.bg = { src: src, blur: was ? was.blur : BG_DEF.blur, bright: was ? was.bright : BG_DEF.bright, zoom: was ? was.zoom : BG_DEF.zoom, sat: was ? was.sat : BG_DEF.sat, flip: was ? !!was.flip : false,
              tint: was ? { color: was.tint.color, mode: was.tint.mode, amt: was.tint.amt } : { color: BG_DEF.tint.color, mode: BG_DEF.tint.mode, amt: BG_DEF.tint.amt } };
    return imgFor(src).then(function(im){ if (!im){ pg.bg = null; return false; } onDocChange(false); return true; });
  }
  function bgSet(key, v, live){
    var bg = bgOf(curPage()); if (!bg) return false;
    if (key === "color" || key === "mode" || key === "amt") bg.tint[key] = v; else bg[key] = v;
    saveSoon(); repaint(!!live); if (!live) commit();
    return true;
  }
  function bgAll(){
    var bg = bgOf(curPage()), i, n = 0; if (!bg) return 0;
    for (i=0;i<DOC.pages.length;i++){ if (i === DOC.cur) continue; DOC.pages[i].bg = JSON.parse(JSON.stringify(bg)); n++; }
    onDocChange(false); return n;
  }
  function normBg(b){
    if (!b || typeof b.src !== "string" || !/^data:image\//.test(b.src)) return null;
    var t = (b.tint && typeof b.tint === "object") ? b.tint : {};
    return { src: b.src, blur: isFinite(b.blur) ? clamp(+b.blur, 0, 40) : BG_DEF.blur, bright: isFinite(b.bright) ? clamp(+b.bright, 40, 160) : 100,
             zoom: isFinite(b.zoom) ? clamp(+b.zoom, 100, 300) : BG_DEF.zoom, sat: isFinite(b.sat) ? clamp(+b.sat, 0, 200) : 100, flip: !!b.flip,
             tint: { color: (BG_TINTS.indexOf(t.color) >= 0 || /^#[0-9a-fA-F]{6}$/.test(t.color || "")) ? (t.color || "") : "", mode: (BG_MODES.indexOf(t.mode) >= 0) ? t.mode : "full", amt: isFinite(t.amt) ? clamp(+t.amt, 0, 100) : BG_DEF.tint.amt } };
  }
  /* the section the design card carries: a tile per tray photograph, the sliders, the tint */
  function bgSection(card){
    var pg = curPage(), w = albWidth(), bg = bgOf(pg), i;
    card.appendChild(subh(L("alb_bg_h")));
    var strip = E("div","alb-strip alb-bgstrip"); strip.id = "albBgStrip";
    var none = E("button","chip" + (bg ? "" : " on"), L("alb_bg_none")); none.type = "button"; none.id = "albBg_none"; none.onclick = function(){ setSheetBg(""); };
    strip.appendChild(none);
    var list = pg.photos.length ? [pg.photos[0]].concat(DOC.pool) : DOC.pool, seen = {};
    for (i=0;i<list.length;i++){
      (function(ph, idx){
        if (seen[ph.src]) return; seen[ph.src] = true;
        var t = E("div","alb-tile alb-bgtile" + (bg && bg.src === ph.src ? " on" : "")); t.id = "albBg_" + idx; t.setAttribute("role","button"); t.tabIndex = 0;
        var im = document.createElement("img"); im.className = "alb-tileimg"; im.alt = ""; im.src = ph.src; t.appendChild(im);
        t.onclick = function(){ setSheetBg(ph.src); };
        t.onkeydown = function(ev){ if (ev.key === "Enter" || ev.key === " "){ ev.preventDefault(); setSheetBg(ph.src); } };
        strip.appendChild(t);
      })(list[i], i);
    }
    card.appendChild(strip);
    if (!bg){ card.appendChild(E("p","mut", L("alb_bg_note"))); return; }
    function slider(id, key, label, lo, hi, val){
      var row = E("div","alb-dim");
      row.appendChild(E("span","alb-dimlab", label));
      var r = document.createElement("input"); r.type = "range"; r.className = "alb-rng"; r.id = id; r.min = String(lo); r.max = String(hi); r.step = "1"; r.value = String(val);
      r.setAttribute("aria-label", label);
      r.oninput = function(){ bgSet(key, +r.value, true); };
      r.onchange = function(){ bgSet(key, +r.value, false); };
      row.appendChild(r);
      card.appendChild(row);
    }
    slider("albBgBlur", "blur", L("alb_bg_blur"), 0, 40, bg.blur);
    slider("albBgBright", "bright", L("alb_bg_bright"), 40, 160, bg.bright);
    slider("albBgZoom", "zoom", L("alb_bg_zoom"), 100, 300, bg.zoom);
    slider("albBgSat", "sat", L("alb_bg_sat"), 0, 200, bg.sat);
    var fl = chip(L("alb_flip"), !!bg.flip, function(){ bgSet("flip", !bg.flip, false); render(); }); fl.id = "albBgFlip";
    var all = E("button","btn", L("alb_bg_all")); all.type = "button"; all.id = "albBgAll"; all.onclick = function(){ var n = bgAll(); H.toast(L("alb_bg_all_done").replace("{P}", String(n)), "ok"); };
    card.appendChild(grid("btn", [fl, all], w));
    card.appendChild(subh(L("alb_bg_tint")));
    var tc = [];
    for (i=0;i<BG_TINTS.length;i++){
      (function(tn){
        var b = chip("", bg.tint.color === tn, function(){ bgSet("color", tn, false); render(); }); b.id = "albBgTint_" + (tn || "none"); b.className += " alb-tintchip";
        if (tn){ var sw = E("span","alb-swatch"); sw.style.backgroundColor = bgTintHex(tn); b.appendChild(sw); }
        b.appendChild(E("span", null, tn ? L(tn === "paper" ? "alb_paper" : "alb_tint_" + tn) : L("alb_ovl_none")));
        tc.push(b);
      })(BG_TINTS[i]);
    }
    var trow = grid("size", tc, w); trow.id = "albBgTints"; card.appendChild(trow);
    if (bg.tint.color){
      var mc = [];
      for (i=0;i<BG_MODES.length;i++){ (function(md){ var b = chip(L("alb_bg_m_" + md), bg.tint.mode === md, function(){ bgSet("mode", md, false); render(); }); b.id = "albBgMode_" + md; mc.push(b); })(BG_MODES[i]); }
      var mrow = grid("size", mc, w); mrow.id = "albBgModes"; card.appendChild(mrow);
      slider("albBgAmt", "amt", L("alb_bg_amt"), 0, 100, bg.tint.amt);
    }
    card.appendChild(E("p","mut", L("alb_bg_note")));
  }
  /* the marks and the logo, in the ornament card */
  /* 6.125.0 — a mark tile is typography: painting it asks the browser for Playfair, Great Vibes and
     Montserrat. The ornaments card sits tenth on the page, so on a phone it is far below the fold, and
     the 6.122.0 rule stands: opening the Album page fetches no typeface. Each tile is therefore painted
     the moment it comes into view. Where the renderer has no IntersectionObserver — the Photoshop panel,
     whose faces are local files — every tile is painted at once, exactly as before. */
  var MARK_IO = null;
  function markTilePaint(cv){
    if (!cv || cv.__albPainted) return;
    cv.__albPainted = true;
    var x = cv.getContext("2d"); if (!x) return;
    x.save(); x.translate(60, cv.height/2);
    if (cv.__albFam === "date") drawDateMark(x, cv.__albStyle, 112, cv.height - 8, "#e6c07a");
    else drawMonoMark(x, cv.__albStyle, 112, cv.height - 8, "#e6c07a");
    x.restore();
  }
  function markTileLater(cv, fam, style){
    cv.__albFam = fam; cv.__albStyle = style;
    if (typeof IntersectionObserver !== "function"){ markTilePaint(cv); return; }
    try {
      if (!MARK_IO) MARK_IO = new IntersectionObserver(function(rows){
        for (var i=0;i<rows.length;i++){ if (rows[i].isIntersecting){ markTilePaint(rows[i].target); MARK_IO.unobserve(rows[i].target); } }
      }, { rootMargin: "300px" });
      MARK_IO.observe(cv);
    } catch(e){ markTilePaint(cv); }
  }
  function marksSection(card){
    var w = albWidth(), i, fam;
    var fams = ["date", "mono"];
    for (fam=0; fam<fams.length; fam++){
      (function(f){
        card.appendChild(subh(L("alb_mark_" + f)));
        var tiles = [], styles = MARKS[f] || [];
        for (i=0;i<styles.length;i++){
          (function(st, k){
            var b = E("button","chip alb-marktile",""); b.type = "button"; b.id = "albMark_" + f + "_" + st; b.title = L("alb_mark_" + f) + " " + (k+1); b.setAttribute("aria-label", b.title);
            var cv = document.createElement("canvas"); cv.className = "alb-markimg"; cv.width = 120; cv.height = Math.round(120*markAspect({ fam: f, style: st })) || 120;
            markTileLater(cv, f, st);   /* 6.125.0 — painted when the tile comes into view: the three faces are woff2 files, and a page that never reaches this card must not pull them */
            b.appendChild(cv);
            b.onclick = function(){ addMark(f, st); };
            tiles.push(b);
          })(styles[i], i);
        }
        var row = grid("tpl", tiles, w); row.id = "albMarks_" + f; card.appendChild(row);
      })(fams[fam]);
    }
    card.appendChild(E("p","mut", L("alb_mark_note")));
    card.appendChild(subh(L("alb_logo")));
    var ops = [];
    var pk = E("button","btn" + (DOC.logo ? "" : " btn-gold"), L(DOC.logo ? "alb_logo_change" : "alb_logo_pick")); pk.type = "button"; pk.id = "albLogoPick";
    pk.onclick = function(){ PICK_MODE = "logo"; if (H && typeof H.pickFiles === "function") H.pickFiles(); };
    if (H && typeof H.wirePick === "function"){ try { H.wirePick(pk, function(){ PICK_MODE = "logo"; }); } catch(e){} }
    ops.push(pk);
    if (DOC.logo){
      var ad = E("button","btn btn-gold", L("alb_logo_add")); ad.type = "button"; ad.id = "albLogoAdd"; ad.onclick = function(){ addLogo(); }; ops.push(ad);
      var al = E("button","btn", L("alb_logo_all")); al.type = "button"; al.id = "albLogoAll"; al.onclick = function(){ var n = logoAll(); H.toast(L("alb_logo_all_done").replace("{P}", String(n)), "ok"); }; ops.push(al);
      var rm = E("button","btn", L("alb_logo_remove")); rm.type = "button"; rm.id = "albLogoRemove"; rm.onclick = function(){ removeLogo(); }; ops.push(rm);
    }
    var lrow = grid("btn", ops, w); lrow.id = "albLogoOps"; card.appendChild(lrow);
    if (DOC.logo){ var pv = document.createElement("img"); pv.className = "alb-logopv"; pv.alt = ""; pv.src = DOC.logo; pv.id = "albLogoPv"; card.appendChild(pv); }
    card.appendChild(E("p","mut", L("alb_logo_note")));
  }

  /* ======================= THE 3D PREVIEW (the recording's book carousel and standee mockup) =======================

     The open spread as a book lying on a dark table — two pages in perspective, their outer edges further
     away than the spine, a fold of shadow between them — turned with two buttons; and a standee size as
     the board it will be: upright, on its base, seen from a little to one side, with the angle a slider
     sets. No library: each page is drawn by drawPage at a small scale and then laid in vertical slices,
     every slice scaled to its own depth, which is the whole of the perspective. */
  var V3D = { angle: 18, depth: 0.22, slices: 28, turn: null };
  function is3dStandee(){ return curSize().group === "standee"; }
  /* a page drawn small for the mockup */
  function pageFor3d(idx, scale){
    var cv = document.createElement("canvas");
    if (idx == null || !DOC.pages[idx]){ cv.width = cv.height = 1; return Promise.resolve(null); }
    return drawPage(cv, DOC.pages[idx], idx, { scale: scale, guides: false }).then(function(ok){ return ok ? cv : null; });
  }
  /* one page laid in slices from x0 (its far edge) to x1 (its near edge) about the vertical centre cy;
     the far edge stands `1-depth` as tall as the near one */
  function slicesTo(x, src, x0, x1, cy, Hh, depth, farLeft, turnK){
    if (!src) return;
    var S = V3D.slices, sw = src.width / S, i, span = Math.abs(x1 - x0) * (turnK == null ? 1 : turnK);
    for (i=0;i<S;i++){
      var t0 = i/S, t1 = (i+1)/S, tm = (t0+t1)/2;
      var near = farLeft ? tm : 1 - tm;                        /* 1 at the spine */
      var h = Hh * (1 - depth*(1 - near)), wx = span/S + 0.6;
      /* the left page's slices run from its far edge to the spine; the right page's from the spine outward */
      x.drawImage(src, i*sw, 0, sw, src.height, (x0 < x1) ? (x0 + span*t0) : (x1 + span*(1 - t1)), cy - h/2, wx, h);
    }
  }
  function draw3d(cv){
    var box = document.getElementById("albStage"), avail = (box && box.clientWidth) || 0; if (!(avail > 0)) avail = 360;
    var sz = curSize(), px = pagePx(sz); if (!px) return Promise.resolve(false);
    var W = Math.min(avail, 900) - 16, Hh = Math.round(W * (is3dStandee() ? 0.78 : 0.62));
    cv.width = Math.max(2, W*2); cv.height = Math.max(2, Hh*2);   /* drawn at two pixels per CSS pixel: a mockup is looked at closely */
    var x = cv.getContext("2d"); if (!x) return Promise.resolve(false);
    x.scale(2, 2);
    var g = x.createLinearGradient(0, 0, 0, Hh); g.addColorStop(0, "#1c2027"); g.addColorStop(1, "#0b0e13"); x.fillStyle = g; x.fillRect(0, 0, W, Hh);
    if (is3dStandee()) return drawStandee3d(x, W, Hh, px);
    var pair = spreadOf(DOC.cur, DOC.pages.length), pageW = W*0.36, scale = pageW / px.w, pageH = px.h*scale;
    if (pageH > Hh*0.78){ scale = (Hh*0.78) / px.h; pageW = px.w*scale; pageH = px.h*scale; }
    var cx = W/2, cy = Hh/2 - Hh*0.02;
    return pageFor3d(pair[0], scale).then(function(left){
      return pageFor3d(pair[1], scale).then(function(right){
        /* the table's shadow */
        x.save(); x.fillStyle = "rgba(0,0,0,.45)"; x.beginPath(); x.ellipse(cx, cy + pageH*0.52, pageW*1.9, pageH*0.12, 0, 0, Math.PI*2); x.fill(); x.restore();
        var depth = V3D.depth, turn = V3D.turn;
        /* the covers: a little larger than the pages, dark, under everything */
        x.fillStyle = "#2b2622"; x.fillRect(cx - pageW*1.03, cy - pageH*0.53, pageW*2.06, pageH*1.06);
        if (left) slicesTo(x, left, cx - pageW, cx, cy, pageH, depth, true, null); else { x.fillStyle = "#f4f1ea"; x.fillRect(cx - pageW, cy - pageH*(1-depth)/2, pageW, pageH*(1-depth)); }
        if (right){
          var k = turn ? Math.abs(Math.cos(turn.t*Math.PI)) : 1;
          slicesTo(x, right, cx + pageW*k, cx, cy, pageH, depth, false, null);
        }
        /* the fold */
        var f = x.createLinearGradient(cx - pageW*0.18, 0, cx + pageW*0.18, 0);
        f.addColorStop(0, "rgba(0,0,0,0)"); f.addColorStop(0.5, "rgba(0,0,0,.42)"); f.addColorStop(1, "rgba(0,0,0,0)");
        x.fillStyle = f; x.fillRect(cx - pageW*0.18, cy - pageH/2, pageW*0.36, pageH);
        /* the page's number under the book */
        x.fillStyle = "rgba(255,255,255,.72)"; x.font = "600 12px sans-serif"; x.textAlign = "center"; x.textBaseline = "top";
        var lab = (pair[0] != null ? String(pair[0]+1) : "") + (pair[0] != null && pair[1] != null ? " · " : "") + (pair[1] != null ? String(pair[1]+1) : "");
        x.fillText(L("alb_sheet_of").replace("{A}", lab).replace("{B}", String(DOC.pages.length)), cx, cy + pageH*0.56);
        if (left) left.width = left.height = 1; if (right) right.width = right.height = 1;
        return true;
      });
    });
  }
  /* the board on its base, turned by the angle */
  function drawStandee3d(x, W, Hh, px){
    var a = clamp(V3D.angle, -45, 45) * Math.PI/180, boardH = Hh*0.74, scale = boardH / px.h, boardW = px.w*scale;
    var cx = W/2, top = Hh*0.08, S = V3D.slices;
    return pageFor3d(DOC.cur, scale).then(function(pg){
      /* the floor and the shadow */
      x.save(); x.fillStyle = "rgba(0,0,0,.5)"; x.beginPath(); x.ellipse(cx, top + boardH + Hh*0.06, boardW*0.9, Hh*0.03, 0, 0, Math.PI*2); x.fill(); x.restore();
      var vis = boardW*Math.cos(a), lean = Math.sin(a), i;
      /* the base: a dark plinth under the board, foreshortened the same way */
      x.fillStyle = "#3a3f47"; x.fillRect(cx - vis*0.6, top + boardH + Hh*0.01, vis*1.2, Hh*0.03);
      x.fillStyle = "#23272e"; x.fillRect(cx - vis*0.5, top + boardH, vis, Hh*0.012);
      if (pg){
        var sw = pg.width / S;
        for (i=0;i<S;i++){
          var t = (i + 0.5)/S, k = 1 - Math.abs(lean)*0.22*(lean > 0 ? (1 - t) : t);
          var h = boardH*k, x0 = cx - vis/2 + vis*(i/S);
          x.drawImage(pg, i*sw, 0, sw, pg.height, x0, top + boardH/2 - h/2 + (1-k)*boardH*0.02, vis/S + 0.6, h);
        }
        /* the board's edge, and a sheen */
        x.fillStyle = "rgba(255,255,255,.06)"; x.fillRect(cx - vis/2, top, vis*0.25, boardH);
        pg.width = pg.height = 1;
      } else { x.fillStyle = "#f4f1ea"; x.fillRect(cx - vis/2, top, vis, boardH); }
      x.fillStyle = "rgba(255,255,255,.72)"; x.font = "600 12px sans-serif"; x.textAlign = "center"; x.textBaseline = "top";
      var sz = curSize();
      x.fillText(sz.w + " × " + sz.h + " " + sz.unit + " · " + Math.round(V3D.angle) + "°", cx, top + boardH + Hh*0.11);
      return true;
    });
  }
  /* a turn: the right page folds over six frames, then the spread moves on */
  function turnPage(dir){
    var n = DOC.pages.length, pair = spreadOf(DOC.cur, n), at = DOC.cur, next;
    if (dir > 0){ next = (pair[1] != null) ? pair[1] + 1 : (pair[0] != null ? pair[0] + 1 : at + 1); if (next >= n) return false; }
    else { next = (pair[0] != null) ? pair[0] - 1 : -1; if (pair[0] === 0) next = -1; if (next < 0) return false; }
    var frames = 6, i = 0;
    function step(){
      if (i > frames){ V3D.turn = null; DOC.cur = clamp(next, 0, n-1); onDocChange(false); return; }
      V3D.turn = { t: (i/frames)*0.5 }; i++;
      var cv = document.getElementById("albCanvas3d");
      if (cv) draw3d(cv).then(function(){ setTimeout(step, 24); }); else step();
    }
    if (dir > 0) step(); else { V3D.turn = null; DOC.cur = clamp(next, 0, n-1); onDocChange(false); }
    return true;
  }
  /* the stage card's 3D rail: the two turns, the angle for a standee (the canvas is the stage's own) */
  function view3dOps(card){
    var w = albWidth();
    var pv = E("button","btn", "‹ " + L("alb_3d_prev")); pv.type = "button"; pv.id = "alb3dPrev"; pv.onclick = function(){ turnPage(-1); };
    var nx = E("button","btn", L("alb_3d_next") + " ›"); nx.type = "button"; nx.id = "alb3dNext"; nx.onclick = function(){ turnPage(1); };
    var row = grid("btn", [pv, nx], w); row.id = "alb3dOps"; card.appendChild(row);
    if (is3dStandee()){
      var dim = E("div","alb-dim"); dim.appendChild(E("span","alb-dimlab", L("alb_3d_angle")));
      var r = document.createElement("input"); r.type = "range"; r.className = "alb-rng"; r.id = "alb3dAngle"; r.min = "-45"; r.max = "45"; r.step = "1"; r.value = String(V3D.angle);
      r.setAttribute("aria-label", L("alb_3d_angle"));
      r.oninput = function(){ V3D.angle = +r.value; var c = document.getElementById("albCanvas3d"); if (c) draw3d(c); };
      dim.appendChild(r); card.appendChild(dim);
    }
    var note = E("p","mut", L(is3dStandee() ? "alb_3d_standee_note" : "alb_3d_note")); note.id = "alb3dNote"; card.appendChild(note);
  }

  /* ======================= THE EXPORT DIALOG (the recording's Xuất ảnh) =======================

     JPG · PNG · PDF, the JPEG's quality, a spread split into its two pages, the files numbered in
     album order, and the whole album as ONE file — a ZIP written here (stored, not deflated: the
     pictures inside are already JPEGs), or into a folder where the host can save many. The choices
     are remembered on this device. */
  var EXPORT = { fmt: "jpg", q: 92, split: false, num: true, zip: true }, EXPORT_KEY = "hnk_album_export_v1", EXPORT_FMTS = ["jpg", "png", "pdf"];
  function loadExport(){
    if (!H || typeof H.restore !== "function") return Promise.resolve(EXPORT);
    return Promise.resolve().then(function(){ return H.restore(EXPORT_KEY); }).then(function(e){
      if (e && typeof e === "object"){
        if (EXPORT_FMTS.indexOf(e.fmt) >= 0) EXPORT.fmt = e.fmt;
        if (isFinite(e.q)) EXPORT.q = clamp(+e.q, 60, 100);
        EXPORT.split = !!e.split; EXPORT.num = (e.num !== false); EXPORT.zip = (e.zip !== false);
      }
      return EXPORT;
    }).catch(function(){ return EXPORT; });
  }
  function setExport(k, v, quiet){
    if (k === "fmt" && EXPORT_FMTS.indexOf(v) < 0) return false;
    if (k === "q") v = clamp(+v || 92, 60, 100);
    EXPORT[k] = v;
    if (H && typeof H.store === "function"){ try { H.store(EXPORT_KEY, EXPORT); } catch(e){} }
    if (!quiet) render();
    return true;
  }
  /* ---- a ZIP, stored ---- */
  var CRC_T = null;
  function crcTable(){ if (CRC_T) return CRC_T; var t = new Int32Array(256), n, c, k; for (n=0;n<256;n++){ c = n; for (k=0;k<8;k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); t[n] = c; } CRC_T = t; return t; }
  function crc32(u8){ var t = crcTable(), c = -1, i; for (i=0;i<u8.length;i++) c = t[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; }
  function le16(v){ return new Uint8Array([v & 255, (v >> 8) & 255]); }
  function le32(v){ return new Uint8Array([v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255]); }
  function dosTime(d){ d = d || new Date(); return { t: ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xffff, d: (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xffff }; }
  /* files: [{ name, bytes }] → one Uint8Array a ZIP reader accepts (local headers, central directory, end record) */
  function zipStore(files){
    var parts = [], central = [], off = 0, i, dt = dosTime(), f, nm, crc, loc;
    for (i=0;i<files.length;i++){
      f = files[i]; nm = utf8Bytes(String(f.name || ("file" + i))); crc = crc32(f.bytes);
      loc = joinBytes([le32(0x04034b50), le16(20), le16(0x0800), le16(0), le16(dt.t), le16(dt.d), le32(crc), le32(f.bytes.length), le32(f.bytes.length), le16(nm.length), le16(0), nm, f.bytes]);
      central.push(joinBytes([le32(0x02014b50), le16(20), le16(20), le16(0x0800), le16(0), le16(dt.t), le16(dt.d), le32(crc), le32(f.bytes.length), le32(f.bytes.length), le16(nm.length), le16(0), le16(0), le16(0), le16(0), le32(0), le32(off), nm]));
      parts.push(loc); off += loc.length;
    }
    var cd = joinBytes(central);
    var end = joinBytes([le32(0x06054b50), le16(0), le16(0), le16(files.length), le16(files.length), le32(cd.length), le32(off), le16(0)]);
    return joinBytes(parts.concat([cd, end]));
  }
  /* ---- the shots ---- */
  function fmtExt(){ return EXPORT.fmt === "png" ? "png" : "jpg"; }
  function fmtMime(){ return EXPORT.fmt === "png" ? "image/png" : "image/jpeg"; }
  function shotUrl(cv){ try { return EXPORT.fmt === "png" ? cv.toDataURL("image/png") : cv.toDataURL("image/jpeg", clamp(EXPORT.q, 60, 100)/100); } catch(e){ return null; } }
  /* the page drawn at print size, whole or one half of a spread */
  function pageShot(idx, half){
    var pg = DOC.pages[idx]; if (!pg) return Promise.resolve(null);
    var cv = document.createElement("canvas");
    return drawPage(cv, pg, idx, { scale: 1, guides: false }).then(function(ok){
      if (!ok) return null;
      if (!half) { var u = shotUrl(cv); cv.width = cv.height = 1; return u; }
      var w = cv.width >> 1, h = cv.height, c2 = document.createElement("canvas"); c2.width = Math.max(1, w); c2.height = h;
      var x = c2.getContext("2d"); if (!x) return null;
      x.drawImage(cv, half === "L" ? 0 : cv.width - w, 0, w, h, 0, 0, w, h);
      var url = shotUrl(c2); cv.width = cv.height = c2.width = c2.height = 1; return url;
    });
  }
  function shotList(){
    var out = [], i, split = EXPORT.split && curSize().group === "spread", seq = 1;
    for (i=0;i<DOC.pages.length;i++){
      if (split){ out.push({ idx: i, half: "L", seq: seq++ }); out.push({ idx: i, half: "R", seq: seq++ }); }
      else out.push({ idx: i, half: "", seq: seq++ });
    }
    return out;
  }
  function shotName(s){
    return (EXPORT.num ? pad2(s.seq) + "-" : "") + "hnk-album-" + (s.idx+1) + (s.half ? "-" + s.half : "") + "-" + curSize().id + "." + fmtExt();
  }
  function exportThis(toGallery){
    var idx = DOC.cur;
    if (EXPORT.fmt === "pdf" && !toGallery) return exportPdf();
    H.toast(L("alb_export_busy"), "");
    return pageShot(idx, "").then(function(url){
      if (!url){ H.toast(L("alb_export_fail"), "err"); return false; }
      var name = "hnk-album-" + (idx+1) + "-" + curSize().id + "." + fmtExt();
      if (toGallery && typeof H.saveGallery === "function") return Promise.resolve(H.saveGallery(url, name)).then(function(){ H.toast(L("alb_export_saved"), "ok"); return true; });
      H.exportOut(url, name); H.toast(L("alb_export_done"), "ok"); return true;
    }).catch(function(){ H.toast(L("alb_export_fail"), "err"); return false; });
  }
  /* the whole album: one ZIP, a folder, or one file after another */
  function exportAlbum(){
    if (EXPORT.fmt === "pdf") return exportPdf();
    var shots = shotList(), files = [], i = 0, many = (H && typeof H.saveMany === "function");
    H.toast(L("alb_export_busy"), "");
    function step(){
      if (i >= shots.length) return Promise.resolve(true);
      var s = shots[i++];
      progress(i-1, shots.length, "alb_export_prog");
      return pageShot(s.idx, s.half).then(function(url){
        if (url){
          if (EXPORT.zip || many) files.push({ name: shotName(s), bytes: dataUrlBytes(url) });
          else H.exportOut(url, shotName(s));
        }
        return new Promise(function(go){ setTimeout(go, (EXPORT.zip || many) ? 0 : 400); }).then(step);
      });
    }
    return step().then(function(){
      progress(shots.length, shots.length, "alb_export_prog");
      if (!(EXPORT.zip || many)){ H.toast(L("alb_export_done"), "ok"); return true; }
      if (!files.length){ H.toast(L("alb_export_fail"), "err"); return false; }
      if (many && !EXPORT.zip) return Promise.resolve(H.saveMany(files)).then(function(n){ H.toast(n ? L("alb_export_many_done").replace("{N}", String(n)) : L("alb_export_fail"), n ? "ok" : "err"); return !!n; });
      var bytes = zipStore(files), total = 0, k; for (k=0;k<files.length;k++) total += files[k].bytes.length;
      return Promise.resolve(sendFile(bytes, "hnk-album-" + curSize().id + ".zip", "application/zip")).then(function(){
        H.toast(L("alb_zip_done").replace("{N}", String(files.length)).replace("{M}", String(Math.max(1, Math.round(total/1048576)))), "ok"); return true;
      });
    }).catch(function(){ progress(1, 1); H.toast(L("alb_export_fail"), "err"); return false; });
  }
  function exportCard(){
    var card = E("section","card"); card.id = "albExportCard";
    card.appendChild(E("h2", null, L("alb_export_h")));
    var sz = curSize(), px = pagePx(sz), w = albWidth(), i;
    var note = E("p","mut"); note.id = "albExportNote";
    note.textContent = L("alb_export_note") + " " + px.w + " × " + px.h + " px · " + px.dpi + " DPI";
    card.appendChild(note);
    /* the format, the quality, the three switches */
    card.appendChild(subh(L("alb_exp_format")));
    var fc = [];
    for (i=0;i<EXPORT_FMTS.length;i++){ (function(f){ var b = chip(f.toUpperCase(), EXPORT.fmt === f, function(){ setExport("fmt", f); }); b.id = "albExpFmt_" + f; fc.push(b); })(EXPORT_FMTS[i]); }
    var frow = grid("size", fc, w); frow.id = "albExpFmts"; card.appendChild(frow);
    if (EXPORT.fmt === "jpg"){
      var dim = E("div","alb-dim"); dim.appendChild(E("span","alb-dimlab", L("alb_exp_quality")));
      var r = document.createElement("input"); r.type = "range"; r.className = "alb-rng"; r.id = "albExpQ"; r.min = "60"; r.max = "100"; r.step = "1"; r.value = String(EXPORT.q);
      r.setAttribute("aria-label", L("alb_exp_quality"));
      var qv = E("span","alb-selname", String(EXPORT.q)); qv.id = "albExpQv";
      r.oninput = function(){ qv.textContent = r.value; }; r.onchange = function(){ setExport("q", +r.value, true); };
      dim.appendChild(r); dim.appendChild(qv); card.appendChild(dim);
    }
    var sw = [];
    if (sz.group === "spread"){ var sp = chip(L("alb_exp_split"), EXPORT.split, function(){ setExport("split", !EXPORT.split); }); sp.id = "albExpSplit"; sw.push(sp); }
    var nu = chip(L("alb_exp_number"), EXPORT.num, function(){ setExport("num", !EXPORT.num); }); nu.id = "albExpNum"; sw.push(nu);
    var many = (H && typeof H.saveMany === "function");
    var zp = chip(L(many ? "alb_exp_folder" : "alb_exp_zip"), many ? !EXPORT.zip : EXPORT.zip, function(){ setExport("zip", !EXPORT.zip); }); zp.id = "albExpZip"; sw.push(zp);
    var srow = grid("size", sw, w); srow.id = "albExpSwitches"; card.appendChild(srow);

    card.appendChild(subh(L("alb_out_this")));
    var b = E("button","btn btn-gold", L("alb_export_jpg")); b.id = "albExport";
    b.onclick = function(){ exportThis(false); };
    var g = E("button","btn", L("alb_export_gal")); g.id = "albExportGal";
    g.onclick = function(){ exportThis(true); };
    var psd = E("button","btn", L("alb_out_psd")); psd.id = "albOutPsd";
    psd.onclick = function(){ exportPsd(); };
    var one = grid("btn", [b, g, psd], w); one.id = "albOutOne";
    card.appendChild(one);

    var shots = shotList();
    card.appendChild(subh(L("alb_out_album").replace("{N}", String(DOC.pages.length))));
    var pdf = E("button","btn btn-gold", L("alb_out_pdf")); pdf.id = "albOutPdf";
    pdf.onclick = function(){ exportPdf(); };
    var all = E("button","btn" + (EXPORT.fmt !== "pdf" ? " btn-gold" : ""), L("alb_export_files").replace("{N}", String(shots.length))); all.id = "albExportAll";
    all.onclick = function(){ exportAlbum(); };
    var manyRow = grid("btn", [all, pdf], w); manyRow.id = "albOutAll";
    card.appendChild(manyRow);
    if (H && typeof H.openInPs === "function"){
      var ops = E("button","btn btn-gold", L("alb_open_ps")); ops.id = "albOpenPs";
      ops.onclick = function(){ openInPs(); };
      var prow = grid("btn", [ops], w); prow.id = "albOutPs";
      card.appendChild(prow);
    }
    var sheet = E("p","mut"); sheet.id = "albOutNote";
    var dpi = px.dpi || 300, bmm = D.bleedMm, mm = 25.4/dpi;
    sheet.textContent = L("alb_out_sheet")
      .replace("{W}", trim(px.w*mm + 2*bmm + 2*PDF_MARK_MM))
      .replace("{H}", trim(px.h*mm + 2*bmm + 2*PDF_MARK_MM))
      .replace("{N}", String(DOC.pages.length))
      .replace("{M}", String(Math.max(1, Math.round(psdEstimate(curPage(), DOC.cur)/1048576))));
    card.appendChild(sheet);
    card.appendChild(E("p","mut", L("alb_exp_note")));
    return card;
  }

  /* ======================= THE PUBLIC FACE ======================= */

  /* 6.122.0 — IS THE PAGE ON SCREEN? Imagine's rule (getClientRects, and "yes" where a renderer cannot
     say): the app boots this module with #pgAlbum hidden, and a render there would fetch every
     ornament mask — 48 requests, 1.2 MB — on a boot that opened the Smart Workflow page. Hidden, the
     page is drawn on entry (switchPage → onEnter); nothing of it is fetched before it is opened. */
  function visible(){ try{ return !!(ROOT && ROOT.getClientRects && ROOT.getClientRects().length); }catch(e){ return true; } }

  var API = {
    init: function(host, root){
      H = host; ROOT = root;
      DOC = blankDoc();
      MOUNTED = true;
      /* 6.107.0 — the page follows the window. A resize that does not cross a column boundary
         only repaints the canvases; one that does rebuilds the rails at their new counts. The
         listener is bound once, on a host that has one; the Photoshop panel has no resize event
         and does not need one, because its column never changes width. */
      if (!RESIZE_BOUND && typeof window !== "undefined" && typeof window.addEventListener === "function"){
        try { window.addEventListener("resize", onResize, false); RESIZE_BOUND = true; } catch(e){}
      }
      if (!KEYS_BOUND && typeof document !== "undefined" && typeof document.addEventListener === "function"){
        try { document.addEventListener("keydown", onKey, false); KEYS_BOUND = true; } catch(e2){}
      }
      if (visible()) render();        /* an empty album is on screen before the store answers — when the page is */
      /* 6.125.0 — the library's index and the export choices come up with the album, and every template it names is read before it is drawn */
      loadQuality().then(function(){ return Promise.all([libLoadIndex(), loadExport()]); }).then(function(){ return loadDoc(); }).then(function(saved){
        if (saved && saved.pages && saved.pages.length) DOC = normalize(saved);
        return libPreload(DOC);
      }).then(function(){
        if (DRAWN || visible()) render();   /* 6.122.0 — the shelf and the quality chips are known now; a page never drawn waits for its entry */
        /* 6.121.0 — the first undo step is the album as it was opened, never the empty one before it */
        HIST = []; REDO = []; CUR_SNAP = null; commit();
      });
    },
    onEnter: function(){ if (MOUNTED) { render(); } },
    drawn: function(){ return DRAWN; },
    /* the host hands picked files in as data URLs — into the open page, or, when the student
       pressed "Make the album", into a whole new album laid out by the occasion */
    accept: function(urls, mode){
      /* the mode the button set, unless a caller names one outright — the Photoshop panel
         (wave D) has no file overlay to carry it, and a test should not have to fake one */
      var m = mode || PICK_MODE; PICK_MODE = "page";
      if (m === "album") return makeAlbum(urls || []);
      /* 6.121.0 — into the tray only, or into the selected frame */
      if (m === "pool") return addToPool(urls || []).then(function(n){
        if (n){ onDocChange(false); H.toast(L("alb_tray_added").replace("{N}", String(n)), "ok"); }
        return n;
      });
      if (m === "logo") return setLogo((urls || [])[0]);           /* 6.125.0 — the studio's logo */
      if (m === "replace") return replaceSelected(urls || []);
      return addPhotos(urls || []);
    },
    /* 6.121.0 wave F — the designer's own doors, for the buttons and for the test */
    undo: function(){ return undo(); },
    redo: function(){ return redo(); },
    history: function(){ return { undo: HIST.length, redo: REDO.length }; },
    design: function(next){ var ok = designPage(curPage(), DOC.cur, { next: !!next }); onDocChange(false); return ok; },
    designAll: function(){ return designAll(); },
    relay: function(){ return relayAlbum(); },
    check: function(){ return printCheck(DOC, curSize()); },
    setFx: function(fx){ return setFx(fx); },
    place: function(i){ return placeFromTray(i); },
    removeSelected: function(){ return removeSelected(); },
    swap: function(dir){ return swapSel(dir); },
    /* 6.122.0 wave G — the ornaments, the overlay, the shelf, the quality and the Photoshop door */
    photoMax: function(){ return PHOTO_MAX[QUALITY] || PHOTO_MAX.std; },
    quality: function(q){ if (q) setQuality(q); return QUALITY; },
    addOrnament: function(id){ return addOrnament(id); },
    setTint: function(t){ return setTint(t); },
    flip: function(){ return flipSel(); },
    duplicate: function(){ return dupSel(); },
    setOverlay: function(id, amount){ return setOverlay(id, amount); },
    overlayAll: function(){ return overlayAll(); },
    albums: function(){ return SHELF ? { cur: SHELF.cur, items: SHELF.items.map(function(it){ return { id: it.id, name: albumName(it), pages: it.pages, photos: it.photos, thumb: !!it.thumb }; }) } : null; },
    openAlbum: function(id){ return openAlbum(id); },
    newAlbum: function(){ return newAlbum(); },
    duplicateAlbum: function(){ return duplicateAlbum(); },
    renameAlbum: function(n){ return renameAlbum(n); },
    deleteAlbum: function(){ return deleteAlbum(); },
    openInPs: function(){ return openInPs(); },
    /* 6.125.0 wave I — the template library, the build, the marks, the sheet background, the export, the mockup */
    importPsd: function(entries){ return libImport(entries || []); },
    importLibraryJson: function(entries){ return libImportJson(entries || []); },
    exportLibrary: function(){ return libExport(); },
    library: function(){ return { items: libItems().map(function(it){ return { id: it.id, name: it.name, group: it.group || "", orient: it.orient, n: it.n, star: !!it.star, trash: !!it.trash, kind: it.kind, builtin: !!it.builtin }; }),
                                  view: { group: LIBV.group, orient: LIBV.orient, n: LIBV.n, star: LIBV.star, trash: LIBV.trash, q: LIBV.q, page: LIBV.page, sel: libSelIds(), busy: !!LIBV.busy, last: LIBV.last } }; },
    template: function(id){ return libRec(id); },
    loadTemplate: function(id){ return libLoad(id); },
    applyTemplate: function(id){ return applyLib(id); },
    clearTemplate: function(){ return clearLib(); },
    libraryView: function(k, v){ if (Object.prototype.hasOwnProperty.call(LIBV, k)){ LIBV[k] = v; LIBV.page = 0; render(); } return this.library().view; },
    star: function(id){ return libToggleStar(id); },
    trash: function(ids, on){ return libSetTrash(ids || [], on !== false); },
    assign: function(ids, g){ return libAssign(ids || [], g || ""); },
    deleteTemplates: function(ids){ return libDelete(ids || []); },
    build: function(opts){ var o = {}, k; for (k in BUILD) o[k] = BUILD[k]; if (opts) for (k in opts) o[k] = opts[k]; return buildGo(o, (opts && opts.rnd) || Math.random); },
    buildOptions: function(o){ var k; if (o) for (k in o) if (Object.prototype.hasOwnProperty.call(BUILD, k)) BUILD[k] = o[k]; return BUILD; },
    ai: function(){ return LIBV.ai; },
    info: function(o){ var f = infoOf(), k; if (o) for (k in o) if (INFO_KEYS.indexOf(k) >= 0) f[k] = String(o[k] || "").slice(0, 60); return f; },
    applyInfo: function(){ return applyInfo(); },
    issues: function(idx){ return sheetIssues(idx == null ? DOC.cur : idx); },
    fixSheet: function(idx){ return fixSheet(idx == null ? DOC.cur : idx); },
    addMark: function(fam, style){ return addMark(fam, style); },
    setLogo: function(src){ return setLogo(src); },
    addLogo: function(){ return addLogo(); },
    logoAll: function(){ return logoAll(); },
    removeLogo: function(){ return removeLogo(); },
    textStyle: function(id){ return applyTextStyle(id); },
    sheetBg: function(src){ return setSheetBg(src); },
    sheetBgSet: function(k, v){ var ok = bgSet(k, v, false); if (ok) render(); return ok; },   /* 6.125.0 wave I — the tint rows follow the colour, as the chips own onclick does */
    sheetBgAll: function(){ return bgAll(); },
    exportPrefs: function(k, v){ if (k) setExport(k, v, true); return EXPORT; },
    exportAlbum: function(){ return exportAlbum(); },
    exportThis: function(g){ return exportThis(!!g); },
    view: function(v){ if (v){ DOC.view = v; onDocChange(false); } return DOC.view; },
    turn: function(dir){ return turnPage(dir); },
    angle: function(a){ if (isFinite(a)) V3D.angle = clamp(+a, -45, 45); return V3D.angle; },
    __draw3dForTest: function(cv){ return draw3d(cv); },
    /* what the tests drive: the maths, with nothing of the browser in it */
    math: { ornBox: ornBox, ornById: ornById, ovlById: ovlById, tintHex: tintHex, hitOrn: hitOrn, normShelf: normShelf,
            ORN: ORN, OVL: OVL, TINTS: TINTS, PHOTO_MAX: PHOTO_MAX, DECOR_MAX: DECOR_MAX, ORN_W_MIN: ORN_W_MIN, ORN_W_MAX: ORN_W_MAX,
            pagePx: pagePx, safeArea: safeArea, cellRect: cellRect, cellRects: cellRects,
            coverFit: coverFit, subjectAnchor: subjectAnchor, anchorFor: anchorFor,
            tplScore: tplScore, autoTemplate: autoTemplate, tplsFor: tplsFor, tplById: tplById,
            sizeById: sizeById, mmPx: mmPx, planPages: planPages, occById: occById,
            /* 6.106.0 wave D */
            layoutRect: layoutRect, spreadOf: spreadOf, dealOut: dealOut, packRow: packRow,
            nPdf: nPdf, pdfOfShots: pdfOfShots, psdEstimate: psdEstimate, closingPage: closingPage,
            /* 6.107.0 wave E — the layout arithmetic the rails are built from, and the free
               size's own bounds, so a test measures what the page uses rather than a copy */
            evenCols: evenCols, albCap: albCap, widthBucket: widthBucket,
            unitToPx: unitToPx, pxToUnit: pxToUnit, unitMax: unitMax, sizeWarning: sizeWarning,
            /* 6.110.0 wave A of the touch programme — the two moves a finger makes, as pure
               arithmetic over a photograph and a cell, so a test measures the studio's own
               clamping rather than a copy of it */
            panFit: panFit, zoomFit: zoomFit, ZOOM_MIN: ZOOM_MIN, ZOOM_MAX: ZOOM_MAX,
            TEXT_MIN: TEXT_MIN, TEXT_MAX: TEXT_MAX,
            /* 6.121.0 wave F — the designer's arithmetic: the six looks over pixels, the room a
               layout leaves, where the block goes, the story sets, the block itself (with a
               caller's ruler), the print check and the density-aware page plan */
            fxPixels: fxPixels, fxFilter: fxFilter, freeRegion: freeRegion, designRegion: designRegion,
            storyFor: storyFor, composeBlock: composeBlock, printCheck: printCheck, paperDark: paperDark,
            PPI_SOFT: PPI_SOFT, PPI_LOW: PPI_LOW, FX_LIST: FX_LIST, PAPERS: PAPERS, STYLES: STYLES, DENSITIES: DENSITIES,
            /* 6.125.0 wave I — the library's arithmetic: the sheet planner, the shape pairing, the group guess, the date and the
               initials the marks draw, every decor kind's box, the three normalisers, the ZIP writer and its CRC, the PSD parser
               (pure over a buffer), the slot filler, the export list */
            planSheets: planSheets, pairPortraits: pairPortraits, guessGroup: guessGroup, baseName: baseName, dateParts: dateParts, roman: roman, initials: initials,
            decorBox: decorBox, decorOk: decorOk, markAspect: markAspect, normLib: normLib, normRec: normRec, normBg: normBg, zipStore: zipStore, crc32: crc32,
            psdParse: psdParse, textRole: textRole, fontMap: fontMap, shotList: shotList, slotTexts: slotTexts, orientOf: orientOf, libTpl: libTpl, pageMax: pageMax,
            LIB_MAXP: LIB_MAXP, LIBD: LIBD, STANDEES: STANDEES, MARKS: MARKS, TEXT_STYLES: TEXT_STYLES, LIB_GROUPS: LIB_GROUPS, BG_TINTS: BG_TINTS, BG_MODES: BG_MODES, EXPORT_FMTS: EXPORT_FMTS },
    /* the two files, driven straight by the test rather than through a download */
    pdf: exportPdf, psd: function(){ return psdOfPage(DOC.cur); },
    /* A page drawn, its cells measured, and the PSD button pressed, through the SHIPPED
       functions. A test that re-implements drawPage or re-derives a template to measure it
       measures its own copy; these three exist so that what test/verify_album_output.js
       drives is the code the student runs. */
    __drawForTest: function(cv, idx, opt){ return drawPage(cv, DOC.pages[idx], idx, opt || {}); },
    __cellsForTest: function(idx){
      var pg = DOC.pages[idx], safe = safeArea(curSize());
      if (!pg || !safe) return [];
      return cellRects(pageTpl(pg, idx), layoutRect(safe, pg));
    },
    __psdButton: function(){ return exportPsd(); },
    /* 6.110.0 — what the stage has hold of, and a way to take hold of something without a
       pointer. The walk drives real pointer events; these two are how it READS the result, and
       how the Photoshop panel (which has no pointer worth the name) could select from a list. */
    sel: function(){ return selObj() ? { kind: SEL.kind, i: SEL.i } : null; },
    select: function(kind, i){ SEL = (kind == null) ? null : { kind: kind, i: i }; fillSelBar(); repaint(); return this.sel(); },
    doc: function(){ return DOC; },
    setDoc: function(d){ DOC = normalize(d); onDocChange(true); },
    reset: function(){ DOC = blankDoc(); onDocChange(true); }
  };
  /* a saved album is never trusted blind: a size that no longer exists, a template that was
     renamed, a page with seven photos in it — each falls back rather than throwing */
  /* 6.121.0 — one photograph read back from a record, the same way on a page and in the tray */
  function normPhoto(q){
    return { src:q.src, w:+q.w||1, h:+q.h||1,
             subject: (q.subject && isFinite(q.subject.x) && isFinite(q.subject.y)) ? q.subject : null,
             anchor: (q.anchor && isFinite(q.anchor.x) && isFinite(q.anchor.y)) ? q.anchor : { x:0.5, y:0.5 },
             /* 6.110.0 — an album saved before this wave has neither, and reads back as
                the page laid it out: zoom 1, and a crop the layout may still choose. */
             zoom: isFinite(q.zoom) ? clamp(+q.zoom, ZOOM_MIN, ZOOM_MAX) : 1,
             manual: !!q.manual,
             /* 6.121.0 — the look a frame wears; a word the row does not offer is no look */
             fx: (typeof q.fx === "string" && FX_LIST.indexOf(q.fx) >= 0) ? q.fx : "" };
  }
  function normalize(d){
    var out = blankDoc();
    if (!d || typeof d !== "object") return out;
    if (d.sizeId === "custom" || sizeById(d.sizeId)) out.sizeId = d.sizeId;
    if (d.custom && typeof d.custom === "object"){
      /* 6.107.0 wave E — the bounds are the unit's own. Wave A clamped every stored custom
         size to 1..120, which is right for inches and silently turned a 2048 px page into a
         120 px one the moment the free control could ask for pixels at all. */
      var cu = (["in","cm","mm","px"].indexOf(d.custom.unit)>=0) ? d.custom.unit : "in";
      var cd = clamp(+d.custom.dpi||300,72,600);
      var csp = UNIT_SPAN[cu] || UNIT_SPAN["in"], clim = unitMax(cu, cd);
      out.custom = { w: clamp(+d.custom.w||csp.min, csp.min, clim),
                     h: clamp(+d.custom.h||csp.min, csp.min, clim),
                     unit: cu, dpi: cd };
    }
    /* 6.107.0 wave E */
    if (d.customGroup){ var gg, gok = false;
      for (gg=0; gg<D.sizeGroups.length; gg++) if (D.sizeGroups[gg].id === d.customGroup) gok = true;
      if (gok) out.customGroup = d.customGroup;
    }
    out.lockRatio = !!d.lockRatio;
    out.guides = (d.guides !== false);
    /* 6.106.0 — the stage's own view. An album saved before wave D has no `view` and opens on
       single pages, which is exactly where it was left. */
    out.view = (d.view === "spread" || d.view === "book" || d.view === "3d") ? d.view : "page";   /* 6.125.0 — and the mockup */
    /* 6.104.0 — the pairing, and the one migration this wave needs: wave A stored
       tx.font as a CSS stack string, and a stack is not a font id. An unknown value
       falls back to "" (the pairing decides), which is the same album with better
       type rather than a page that throws. */
    out.pair = pairById(d.pair) ? d.pair : (D.defPair || "classic");
    /* 6.121.0 wave F — the design's own fields; an album saved before this wave has none and
       opens as it was: editorial story lines waiting to be applied, white paper, no cover */
    out.style = (STYLES.indexOf(d.style) >= 0) ? d.style : "editorial";
    out.paper = (typeof d.paper === "string" && PAPERS.indexOf(d.paper.toLowerCase()) >= 0) ? d.paper.toLowerCase() : PAPERS[0];
    out.density = (DENSITIES.indexOf(d.density) >= 0) ? d.density : "balanced";
    out.cover = !!d.cover;
    /* 6.125.0 wave I — the couple, the date, the venue; the studio's logo */
    out.info = { bride: "", groom: "", date: "", venue: "" };
    if (d.info && typeof d.info === "object"){ var ik; for (ik=0; ik<INFO_KEYS.length; ik++) out.info[INFO_KEYS[ik]] = String(d.info[INFO_KEYS[ik]] || "").slice(0, 60); }
    out.logo = (typeof d.logo === "string" && /^data:image\//.test(d.logo)) ? d.logo : "";
    out.pool = [];
    var pool = (d.pool && d.pool.length) ? d.pool : [], pi;
    for (pi=0; pi<pool.length && out.pool.length<MAXA; pi++) if (pool[pi] && typeof pool[pi].src === "string" && pool[pi].src) out.pool.push(normPhoto(pool[pi]));
    /* 6.105.0 — the occasion, same rule: an id this build no longer ships falls back to the
       default rather than leaving curOcc() with nothing to answer with. */
    out.occ = occById(d.occ) ? d.occ : (D.defOcc || "");
    out.pages = [];
    var list = (d.pages && d.pages.length) ? d.pages : [blankPage()];
    var i, k;
    for (i=0;i<list.length && i<200;i++){
      var p = list[i] || {}, pg = blankPage();
      pg.auto = (p.auto !== false);
      pg.bleed = !!p.bleed;
      if (p.tplId && tplById(p.tplId)) pg.tplId = p.tplId;
      /* 6.125.0 wave I — the template this page is laid from (its record is read when the page is drawn) and its background */
      if (typeof p.lib === "string" && /^[a-z0-9_]{3,24}$/.test(p.lib)) pg.lib = p.lib;
      pg.bg = normBg(p.bg);
      /* 6.121.0 — the design's marks on a page; anything malformed is simply not a mark */
      pg.story = isFinite(p.story) ? Math.max(-1, p.story|0) : -1;
      var dc = (p.decor && p.decor.length) ? p.decor : [], di;
      for (di=0; di<dc.length && pg.decor.length<DECOR_MAX; di++){
        var dm = dc[di];
        if (!dm) continue;
        /* 6.122.0 — an ornament: a known mask, a place, a width, a turn, a tint, a flip */
        if (dm.kind === "orn"){
          if (!ornById(dm.id) || !(isFinite(dm.x) && isFinite(dm.y) && isFinite(dm.w))) continue;
          pg.decor.push({ kind:"orn", id:dm.id, x:clamp(+dm.x,-0.3,1.3), y:clamp(+dm.y,-0.3,1.3), w:clamp(+dm.w, ORN_W_MIN, ORN_W_MAX),
                          rot: isFinite(dm.rot) ? clamp(+dm.rot,-180,180) : 0,
                          tint: (TINT_NAMES.indexOf(dm.tint) >= 0 || /^#[0-9a-fA-F]{6}$/.test(dm.tint||"")) ? dm.tint : "gold",
                          flip: !!dm.flip, auto:false });
          continue;
        }
        /* 6.125.0 wave I — a mark: a known family and style, a place, a width, a turn, a tint; the logo: a place, a width, a turn */
        if (dm.kind === "mark"){
          if (!(MARKS[dm.fam] && MARKS[dm.fam].indexOf(dm.style) >= 0) || !(isFinite(dm.x) && isFinite(dm.y))) continue;
          pg.decor.push({ kind:"mark", fam:dm.fam, style:dm.style, x:clamp(+dm.x,-0.3,1.3), y:clamp(+dm.y,-0.3,1.3), w:isFinite(dm.w) ? clamp(+dm.w, ORN_W_MIN, ORN_W_MAX) : MARK_W,
                          rot: isFinite(dm.rot) ? clamp(+dm.rot,-180,180) : 0, tint: (TINT_NAMES.indexOf(dm.tint) >= 0 || /^#[0-9a-fA-F]{6}$/.test(dm.tint||"")) ? dm.tint : "gold", auto:false });
          continue;
        }
        if (dm.kind === "logo"){
          if (!out.logo || !(isFinite(dm.x) && isFinite(dm.y))) continue;
          pg.decor.push({ kind:"logo", x:clamp(+dm.x,-0.3,1.3), y:clamp(+dm.y,-0.3,1.3), w:isFinite(dm.w) ? clamp(+dm.w, ORN_W_MIN, ORN_W_MAX) : 0.14, rot: isFinite(dm.rot) ? clamp(+dm.rot,-180,180) : 0, auto:false });
          continue;
        }
        if (dm.kind !== "rule" && dm.kind !== "scrim") continue;
        if (!(isFinite(dm.x) && isFinite(dm.y) && isFinite(dm.w))) continue;
        pg.decor.push({ kind:dm.kind, x:clamp(+dm.x,-0.2,1.2), y:clamp(+dm.y,-0.2,1.2), w:clamp(+dm.w,0,1.4), h:isFinite(dm.h)?clamp(+dm.h,0,1.4):0,
                        color:(typeof dm.color === "string" && /^#[0-9a-fA-F]{6}$/.test(dm.color)) ? dm.color : GOLD, auto:!!dm.auto });
      }
      /* 6.122.0 — the overlay: a known texture at a known strength, or none */
      pg.overlay = (p.overlay && ovlById(p.overlay.id)) ? { id: p.overlay.id, amount: (OVL_AMTS.indexOf(p.overlay.amount) >= 0) ? p.overlay.amount : "medium" } : null;
      var ph = (p.photos && p.photos.length) ? p.photos : [];
      for (k=0;k<ph.length && pg.photos.length<(pg.lib ? LIB_MAXP : MAXP);k++){   /* 6.125.0 — eight from a template */
        var q = ph[k];
        if (!q || typeof q.src !== "string" || !q.src) continue;
        pg.photos.push(normPhoto(q));
      }
      var tx = (p.texts && p.texts.length) ? p.texts : [];
      for (k=0;k<tx.length && pg.texts.length<D.roles.length;k++){
        var t = tx[k]; if (!t || typeof t.text !== "string") continue;
        var ok = false, r;
        for (r=0;r<D.roles.length;r++) if (D.roles[r].id === t.role) ok = true;
        if (!ok) continue;
        pg.texts.push({ role:t.role, text:String(t.text).slice(0,120),
                        x: isFinite(t.x) ? clamp(t.x,0,1) : 0.5, y: isFinite(t.y) ? clamp(t.y,0,1) : 0.92,
                        /* 6.110.0 */
                        size: isFinite(t.size) ? clamp(+t.size, TEXT_MIN, TEXT_MAX) : 1,
                        rot: isFinite(t.rot) ? clamp(+t.rot, -180, 180) : 0,
                        align: t.align || "center",
                        color: (typeof t.color === "string" && /^#[0-9a-fA-F]{6}$/.test(t.color)) ? t.color : "#1b1b1f",
                        font: (t.font && fontById(t.font)) ? t.font : "",
                        /* 6.121.0 — a block's wrap width (a fraction of the safe area; 0 is one line)
                           and whether the design engine set this line (it may then replace it) */
                        w: isFinite(t.w) ? clamp(+t.w, 0, 1) : 0,
                        auto: !!t.auto, cover: !!t.cover,
                        style: (typeof t.style === "string" && styleById(t.style)) ? t.style : "" });   /* 6.125.0 — the text style it was set in */
      }
      out.pages.push(pg);
    }
    /* 6.121.0 — the tray carries every photograph a page uses, so an album saved before this
       wave opens with its tray full and its usage numbers right */
    var ui, uk, seenSrc = {};
    for (ui=0; ui<out.pool.length; ui++) seenSrc[out.pool[ui].src] = true;
    for (ui=0; ui<out.pages.length; ui++) for (uk=0; uk<out.pages[ui].photos.length; uk++){
      var up = out.pages[ui].photos[uk];
      if (!seenSrc[up.src] && out.pool.length < MAXA){ seenSrc[up.src] = true; out.pool.push(normPhoto({ src: up.src, w: up.w, h: up.h, subject: up.subject, fx: up.fx })); }
    }
    out.cur = clamp(+d.cur||0, 0, out.pages.length-1);
    /* 6.125.0 wave I — every template the album names is read now, and the stage repainted when the last one is in */
    libPreload(out).then(function(){ if (DOC === out && MOUNTED) repaint(); });
    return out;
  }
  return API;
})();
/* ---- /ALBUM_MODULE ---- */
