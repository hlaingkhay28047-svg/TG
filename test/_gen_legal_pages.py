# -*- coding: utf-8 -*-
"""Emits docs/privacy/index.html and docs/terms/index.html.

The two pages share a shell — the same CSP, the same styling, the same
language toggle, the same contact block — and differ only in their body.
Writing them by hand would guarantee they drift, and the repo has no build
step to share a stylesheet at serve time (and the CSP forbids an external
one), so the shell lives here once and both files are emitted from it.
sweep_v533_legal.js asserts the emitted shells are still byte-identical.
"""
import io, os, re

ROOT = "/home/user/TG"

CONTACT = {
    "fb":  "https://www.facebook.com/share/1KZppNL9gw/",
    "tg":  "https://t.me/hlaingnoomkhay1551991",
    # the owner's link carried _r/_t analytics params; the canonical profile
    # URL is what belongs on a page people are told to trust
    "tt":  "https://www.tiktok.com/@hlainghoomkhay1551991",
    "ph1": "09688200680",
    "ph2": "09942113540",
}

STYLE = """
:root{
  --ink:#0b0d14; --panel:#131826; --panel-2:#182032;
  --line:rgba(217,164,65,.28); --line-soft:rgba(243,239,230,.38);
  --gold:#d9a441; --gold-hi:#f4d488; --cream:#f3efe6; --muted:#a8a394;
}
*{box-sizing:border-box}
html,body{margin:0;padding:0}
body{
  background:var(--ink); color:var(--cream);
  font-family:system-ui,-apple-system,"Segoe UI","Noto Sans Myanmar","Padauk",Roboto,sans-serif;
  font-size:15px; line-height:1.7;
  padding:24px 16px calc(48px + env(safe-area-inset-bottom));
}
.wrap{max-width:760px;margin:0 auto}
.mark{display:inline-block;color:var(--gold-hi);font-family:"Arial Black","Segoe UI Black",Roboto,sans-serif;font-size:20px;font-weight:900;letter-spacing:.11em;line-height:.9}
.kick{margin:8px 0 0;font-size:10.5px;font-weight:800;letter-spacing:.26em;text-transform:uppercase;color:var(--gold)}
h1{font-size:24px;line-height:1.3;margin:14px 0 4px}
h2{font-size:13px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--gold);margin:28px 0 8px}
h3{font-size:16px;margin:20px 0 6px}
p,li{margin:8px 0}
ul{padding-left:20px}
a{color:var(--gold-hi)}
.upd{color:var(--muted);font-size:13px;margin:0 0 8px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:16px 18px;margin:18px 0}
.card.warn{border-color:var(--line-soft)}
table{width:100%;border-collapse:collapse;margin:10px 0;font-size:14px}
th,td{border:1px solid var(--line-soft);padding:8px 10px;text-align:left;vertical-align:top}
th{color:var(--gold);font-size:12px;letter-spacing:.08em;text-transform:uppercase}
.scroll{overflow-x:auto}
.contact a{display:inline-flex;align-items:center;min-height:48px;padding:10px 14px;margin:4px 6px 4px 0;border:1px solid var(--line-soft);border-radius:11px;text-decoration:none;font-weight:700}
.foot{margin-top:36px;padding-top:16px;border-top:1px solid var(--line-soft);color:var(--muted);font-size:13px}
.foot a{margin-right:12px;display:inline-block;min-height:44px;line-height:44px}
:where(a,button):focus-visible{outline:2px solid var(--gold);outline-offset:2px}
/* data-lang, NOT [lang] -- <html lang="my"> matches [lang] too, so the
   selector this replaces hid the entire document including the toggle that
   was supposed to unhide it. Caught by rendering the page, not by reading
   it. */
[data-lang]:not(.on){display:none}
.langbar{margin:12px 0 0}
.langbar button{min-height:44px;padding:8px 14px;margin-right:6px;background:var(--panel-2);color:var(--cream);border:1px solid var(--line-soft);border-radius:10px;font:inherit;font-weight:700;cursor:pointer}
.langbar button[aria-pressed="true"]{background:var(--gold);border-color:var(--gold);color:#1a1408}
"""

SCRIPT = """
(function(){
  "use strict";
  /* Two full translations live in the markup rather than in a dictionary,
     because a legal text is read as a whole and a half-substituted one is
     worse than useless. The toggle only decides which of the two is shown,
     and the choice is remembered under the same key the app uses so a
     Burmese customer who follows a link from the app stays in Burmese. */
  function show(l){
    var secs = document.querySelectorAll("[data-lang]");
    for (var i=0;i<secs.length;i++){
      secs[i].className = secs[i].getAttribute("data-lang")===l ? "on" : "";
    }
    document.documentElement.lang = l;
    var bs = document.querySelectorAll(".langbar button");
    for (var j=0;j<bs.length;j++){
      bs[j].setAttribute("aria-pressed", String(bs[j].getAttribute("data-set")===l));
    }
    try { localStorage.setItem("hnk_ws_lang", l); } catch(e){}
  }
  var start = "my";
  try {
    var v = localStorage.getItem("hnk_ws_lang");
    if (v === "en") start = "en";
    else if (v && v !== "my") start = (navigator.language||"en").toLowerCase().indexOf("my")===0 ? "my" : "en";
  } catch(e){}
  var bs = document.querySelectorAll(".langbar button");
  for (var j=0;j<bs.length;j++){
    bs[j].addEventListener("click", function(){ show(this.getAttribute("data-set")); });
  }
  show(start);
})();
"""

def contact_block(lang):
    if lang == "my":
        head = "ဆက်သွယ်ရန်"
        lead = ("အောက်ပါ လမ်းကြောင်းတွေထဲက တစ်ခုခုကနေ ဆက်သွယ်နိုင်ပါတယ်။ "
                "အကောင့်ဖျက်ဖို့၊ ကိုယ်ရေးအချက်အလက် တောင်းဖို့၊ ငွေပြန်အမ်းဖို့ "
                "ဒါမှမဟုတ် ပြဿနာတစ်ခုခု ရှိရင် ဒီကနေပဲ ဆက်သွယ်ပါ။")
        labels = ("Facebook", "Telegram", "TikTok")
        phone = "ဖုန်း"
    else:
        head = "Contact"
        lead = ("Reach us through any of these. Use the same routes to delete "
                "your account, ask for a copy of your data, ask about a refund, "
                "or report a problem.")
        labels = ("Facebook", "Telegram", "TikTok")
        phone = "Phone"
    return f"""<h2>{head}</h2>
<p>{lead}</p>
<p class="contact">
  <a href="{CONTACT['fb']}" target="_blank" rel="noopener noreferrer">{labels[0]}</a>
  <a href="{CONTACT['tg']}" target="_blank" rel="noopener noreferrer">{labels[1]}</a>
  <a href="{CONTACT['tt']}" target="_blank" rel="noopener noreferrer">{labels[2]}</a>
</p>
<p class="contact">{phone} &nbsp;
  <a href="tel:+959{CONTACT['ph1'][2:]}">{CONTACT['ph1']}</a>
  <a href="tel:+959{CONTACT['ph2'][2:]}">{CONTACT['ph2']}</a>
</p>"""

def foot(lang, other_href, other_label):
    home = "ပင်မစာမျက်နှာ" if lang=="my" else "Home"
    app  = "Web Studio ဖွင့်မယ်" if lang=="my" else "Open Web Studio"
    return f"""<p class="foot">
  <a href="/">{home}</a><a href="/app/">{app}</a><a href="{other_href}">{other_label}</a>
</p>"""

def page(title_my, title_en, body_my, body_en, other_href, other_label_my, other_label_en, updated):
    return f"""<!doctype html>
<html lang="my">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<!-- Nothing on this page is loaded from anywhere else, so the policy can say
     exactly that and the browser enforces it. -->
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src 'self' data:; base-uri 'none'; form-action 'none'">
<meta name="referrer" content="strict-origin-when-cross-origin">
<title>{title_en} — HNK Create Studio</title>
<meta name="description" content="{title_en} for HNK Create Studio.">
<style>{STYLE}</style>
</head>
<body>
<main class="wrap">
  <span class="mark">HNK</span>
  <p class="kick">CREATE STUDIO</p>

  <div class="langbar">
    <button type="button" data-set="my" aria-pressed="true">မြန်မာ</button>
    <button type="button" data-set="en" aria-pressed="false">English</button>
  </div>

  <div data-lang="my" class="on">
    <h1>{title_my}</h1>
    <p class="upd">နောက်ဆုံး ပြင်ဆင်သည့်ရက် — {updated}</p>
{body_my}
{contact_block("my")}
{foot("my", other_href, other_label_my)}
  </div>

  <div data-lang="en">
    <h1>{title_en}</h1>
    <p class="upd">Last updated — {updated}</p>
{body_en}
{contact_block("en")}
{foot("en", other_href, other_label_en)}
  </div>
</main>
<script>{SCRIPT}</script>
</body>
</html>
"""

UPDATED = "2026-08-22"

# ---------------------------------------------------------------- privacy
PRIV_MY = """<p>HNK Create Studio က သင့်ရဲ့ ဓာတ်ပုံတွေကို ကျွန်တော်တို့ဆာဗာပေါ် <b>လုံးဝ မတင်ပါဘူး</b>။
ဒီစာမျက်နှာက ဘာတွေ သိမ်းထားသလဲ၊ ဘာတွေ လုံးဝ မသိမ်းဘူးလဲ ဆိုတာကို အတိအကျ ဖော်ပြထားပါတယ်။</p>

<div class="card">
<h3>အတိုချုပ်</h3>
<ul>
  <li>သင့်ဓာတ်ပုံတွေ ကျွန်တော်တို့ဆီ မရောက်ပါ — browser ကနေ သင်ရွေးထားတဲ့ AI provider ဆီ တိုက်ရိုက် သွားပါတယ်။</li>
  <li>သင့် API key တွေ ကျွန်တော်တို့ဆီ မရောက်ပါ — သင့် browser ထဲမှာပဲ ရှိပါတယ်။</li>
  <li>ရလဒ်ပုံတွေ သင့် browser ရဲ့ သိုလှောင်ခန်း (IndexedDB) ထဲမှာပဲ ရှိပါတယ်။</li>
  <li>Analytics၊ tracker၊ ကြော်ငြာ၊ third-party script <b>တစ်ခုမှ မပါပါဘူး</b>။ ဒါကို သင်ကိုယ်တိုင် စစ်လို့ရပါတယ် — စာမျက်နှာရဲ့ source ကို ကြည့်လိုက်ပါ။</li>
</ul>
</div>

<h2>၁။ ကျွန်တော်တို့ဆာဗာမှာ သိမ်းထားတာတွေ</h2>
<p>အကောင့်နဲ့ ငွေပေးချေမှု စီမံဖို့အတွက် Supabase ပေါ်မှာ အောက်ပါအရာတွေကို သိမ်းပါတယ်။</p>
<div class="scroll">
<table>
<tr><th>အချက်အလက်</th><th>ဘာကြောင့်</th></tr>
<tr><td>အီးမေးလ်၊ နာမည်</td><td>အကောင့် ဖန်တီးဖို့နဲ့ ဝင်ဖို့</td></tr>
<tr><td>စကားဝှက်</td><td>Supabase က hash လုပ်ပြီး သိမ်းပါတယ်။ မူရင်းစကားဝှက်ကို ကျွန်တော်တို့ <b>ဘယ်တော့မှ မမြင်ရပါ</b>။</td></tr>
<tr><td>Plan အခြေအနေ၊ သက်တမ်းကုန်ရက်၊ ခွင့်ပြုထားတဲ့ device အရေအတွက်</td><td>Premium ဖွင့်ပေးဖို့</td></tr>
<tr><td>Device id နဲ့ label</td><td>Device id က <b>သင့် browser ထဲမှာ ကျပန်း ထုတ်လိုက်တဲ့ နံပါတ်</b>ပါ — fingerprint မဟုတ်ပါ။ Label က &ldquo;Android · Chrome&rdquo; လိုမျိုး အကြမ်းဖျင်းပဲ ဖြစ်ပါတယ်။ Device အရေအတွက် ကန့်သတ်ဖို့ သုံးပါတယ်။</td></tr>
<tr><td>ငွေလွှဲနံပါတ် နောက်ဆုံး ၆ လုံး</td><td>Admin က ငွေလွှဲမှုကို စစ်ဖို့</td></tr>
<tr><td>ငွေလွှဲပြေစာ screenshot</td><td>Admin က စစ်ဖို့။ Private bucket ထဲ သင့်အကောင့် id အောက်မှာ သိမ်းပါတယ် — အခြားသုံးစွဲသူတွေ မမြင်ရပါ။</td></tr>
</table>
</div>

<h2>၂။ ကျွန်တော်တို့ဆီ ဘယ်တော့မှ မရောက်တာတွေ</h2>
<ul>
  <li><b>သင့်ဓာတ်ပုံတွေ။</b> ပုံတစ်ပုံ generate လုပ်တဲ့အခါ browser ကနေ သင်ရွေးထားတဲ့ provider (Google Gemini၊ RunningHub၊ OpenAI) ဆီ တိုက်ရိုက် သွားပါတယ်။ HNK မှာ ပုံသိမ်းတဲ့ ဆာဗာ မရှိပါဘူး။</li>
  <li><b>သင့် API key တွေ။</b> Browser ရဲ့ localStorage ထဲမှာ သိမ်းပြီး၊ သင်ရွေးထားတဲ့ provider ဆီကိုပဲ ပို့ပါတယ်။</li>
  <li><b>ရလဒ်ပုံတွေနဲ့ Gallery။</b> သင့် browser ရဲ့ IndexedDB ထဲမှာ ရှိပါတယ်။ Browser ရဲ့ data ကို ရှင်းလိုက်ရင် ပျောက်သွားပါမယ်။</li>
</ul>

<h2>၃။ အခြားဘယ်သူတွေ ကိုင်တွယ်သလဲ</h2>
<ul>
  <li><b>Supabase</b> — အကောင့်၊ database နဲ့ ငွေလွှဲပြေစာ သိုလှောင်မှု</li>
  <li><b>DigitalOcean</b> — ဒီဝဘ်ဆိုက်နဲ့ web app ကို host လုပ်ပေးတာ</li>
  <li><b>သင်ရွေးထားတဲ့ AI provider</b> — သင်ပို့လိုက်တဲ့ ပုံတွေအတွက်။ အဲဒီပုံတွေကို သူတို့ဘယ်လိုကိုင်တွယ်တယ်ဆိုတာက <b>သူတို့ရဲ့ စည်းကမ်းအတိုင်း</b> ဖြစ်ပါတယ် — ကျွန်တော်တို့ ထိန်းချုပ်လို့ မရပါ။ Key မယူခင် သူတို့ရဲ့ privacy policy ကို ဖတ်ပါ။</li>
</ul>

<h2>၄။ ဘယ်လောက်ကြာကြာ သိမ်းထားလဲ</h2>
<ul>
  <li>အကောင့်အချက်အလက် — အကောင့်ရှိနေသရွေ့</li>
  <li>ငွေလွှဲပြေစာ — ငွေပေးချေမှု မှတ်တမ်းအဖြစ် သိမ်းထားပါတယ်။ ဖျက်ချင်ရင် ဆက်သွယ်ပါ။</li>
  <li>Device မှတ်တမ်း — သင်ကိုယ်တိုင် app ထဲကနေ ဖျက်လို့ရပါတယ်</li>
</ul>

<h2>၅။ သင့်အခွင့်အရေး</h2>
<p>သင့်အချက်အလက်တွေကို ကြည့်ဖို့၊ ပြင်ဖို့၊ ဖျက်ဖို့ တောင်းဆိုနိုင်ပါတယ်။ အကောင့်တစ်ခုလုံး ဖျက်ချင်ရင်လည်း အောက်က လမ်းကြောင်းတွေကနေ ပြောပါ။ Device တွေကိုတော့ app ထဲက Setup စာမျက်နှာကနေ သင်ကိုယ်တိုင် ဖျက်လို့ရပါတယ်။</p>

<h2>၆။ ကလေးများ</h2>
<p>ဒီဝန်ဆောင်မှုက အသက် ၁၃ နှစ်အောက် ကလေးများအတွက် မဟုတ်ပါ။</p>

<h2>၇။ ဒီမူဝါဒ ပြောင်းလဲခြင်း</h2>
<p>ပြောင်းလဲမှုရှိရင် အထက်က &ldquo;နောက်ဆုံး ပြင်ဆင်သည့်ရက်&rdquo; ကို ပြောင်းပါမယ်။ အရေးကြီးတဲ့ ပြောင်းလဲမှုဆိုရင် app ထဲကနေပါ အသိပေးပါမယ်။</p>"""

PRIV_EN = """<p>HNK Create Studio <b>never uploads your photos to our servers</b>. This page
states exactly what is stored, and what is never stored at all.</p>

<div class="card">
<h3>In short</h3>
<ul>
  <li>Your photos never reach us — they go from your browser straight to the AI provider you chose.</li>
  <li>Your API keys never reach us — they stay in your browser.</li>
  <li>Your results stay in your browser's own storage (IndexedDB).</li>
  <li>There is <b>no analytics, no tracker, no advertising and no third-party script of any kind</b>. You can check this yourself: view the page source.</li>
</ul>
</div>

<h2>1. What we store on our servers</h2>
<p>To run accounts and payments we store the following in Supabase.</p>
<div class="scroll">
<table>
<tr><th>Data</th><th>Why</th></tr>
<tr><td>Email, name</td><td>To create your account and sign you in</td></tr>
<tr><td>Password</td><td>Stored hashed by Supabase. We <b>never see</b> the password itself.</td></tr>
<tr><td>Plan status, expiry date, allowed device count</td><td>To unlock Premium</td></tr>
<tr><td>Device id and label</td><td>The device id is a <b>random number generated in your browser</b> — it is not a fingerprint. The label is coarse, such as &ldquo;Android · Chrome&rdquo;. Used only to enforce the device limit.</td></tr>
<tr><td>Last 6 digits of your transfer reference</td><td>So an admin can match your payment</td></tr>
<tr><td>Payment screenshot</td><td>For the admin to check. Kept in a private bucket under your own account id — other users cannot see it.</td></tr>
</table>
</div>

<h2>2. What never reaches us</h2>
<ul>
  <li><b>Your photos.</b> When you generate, the image goes from your browser directly to the provider you chose (Google Gemini, RunningHub, OpenAI). HNK operates no image server.</li>
  <li><b>Your API keys.</b> Kept in your browser's localStorage and sent only to that provider.</li>
  <li><b>Your results and Gallery.</b> Held in your browser's IndexedDB. Clearing your browser data deletes them.</li>
</ul>

<h2>3. Who else processes data</h2>
<ul>
  <li><b>Supabase</b> — accounts, database, and payment-screenshot storage</li>
  <li><b>DigitalOcean</b> — hosting for this site and the web app</li>
  <li><b>The AI provider you choose</b> — for the images you send it. What they do with those images is governed by <b>their</b> terms, not ours, and we cannot control it. Read their privacy policy before you get a key.</li>
</ul>

<h2>4. How long we keep it</h2>
<ul>
  <li>Account data — for as long as the account exists</li>
  <li>Payment screenshots — kept as the record of the payment. Ask us and we delete them.</li>
  <li>Device records — you can remove these yourself from inside the app</li>
</ul>

<h2>5. Your rights</h2>
<p>You can ask to see, correct or delete your data, including deleting the whole account, through any of the contact routes below. Devices you can remove yourself from the Setup page in the app.</p>

<h2>6. Children</h2>
<p>This service is not intended for children under 13.</p>

<h2>7. Changes to this policy</h2>
<p>If it changes we update the &ldquo;Last updated&rdquo; date above, and announce anything significant inside the app.</p>"""

# ---------------------------------------------------------------- terms
TERM_MY = """<p>HNK Create Studio ကို သုံးခြင်းဖြင့် အောက်ပါ စည်းကမ်းချက်များကို သဘောတူပြီး ဖြစ်ပါတယ်။</p>

<h2>၁။ ဝန်ဆောင်မှုက ဘာလဲ</h2>
<p>HNK Create Studio မှာ နှစ်ပိုင်း ပါပါတယ် — browser ထဲမှာ အလုပ်လုပ်တဲ့ <b>Web Studio</b> နဲ့ Adobe Photoshop အတွက် <b>HNK Ai Panel</b> ပါ။ နှစ်ခုလုံးက AI ပုံထုတ်လုပ်ငန်းအတွက် ကိရိယာတွေပါ။</p>

<h2>၂။ AI engine တွေအတွက် သင့်ကိုယ်ပိုင် key လိုပါတယ်</h2>
<p>ပုံထုတ်တာက Google Gemini၊ RunningHub ဒါမှမဟုတ် OpenAI ကနေ လုပ်ပါတယ်။ အဲဒီ provider တွေအတွက် <b>သင့်ကိုယ်ပိုင် API key</b> လိုပါတယ်။ အဲဒီ key ရဲ့ ကုန်ကျစရိတ်၊ ကန့်သတ်ချက်နဲ့ စည်းကမ်းတွေက သင်နဲ့ အဲဒီ provider ကြားက ကိစ္စဖြစ်ပြီး HNK ရဲ့ အခကြေးငွေထဲ မပါဝင်ပါဘူး။</p>

<h2>၃။ Premium နဲ့ ငွေပေးချေမှု</h2>
<ul>
  <li>App ကို သုံးဖို့ အကောင့်တစ်ခုနဲ့ သက်တမ်းရှိနေတဲ့ plan လိုပါတယ်။</li>
  <li>ငွေလွှဲပြီးရင် ငွေလွှဲပြေစာ screenshot နဲ့ လွှဲငွေနံပါတ် နောက်ဆုံး ၆ လုံးကို တင်ရပါမယ်။</li>
  <li><b>Admin က စစ်ဆေးပြီး လက်ခံမှသာ</b> Premium ဖွင့်ပေးပါမယ်။ ငွေလွှဲရုံနဲ့ အလိုအလျောက် မဖွင့်ပါဘူး။</li>
  <li>ဈေးနှုန်းတွေကို app ထဲမှာ ပြထားပါတယ်။ ပြောင်းလဲနိုင်ပါတယ် — ပြောင်းရင် သင်ရှိပြီးသား သက်တမ်းကို မထိပါဘူး။</li>
  <li>သက်တမ်း မကုန်ခင် ထပ်တိုးရင် ကျန်ရှိတဲ့ ရက်တွေ မပျောက်ဘဲ ပေါင်းထည့်ပေးပါတယ်။</li>
</ul>

<h2>၄။ Device ကန့်သတ်ချက်</h2>
<p>အကောင့်တစ်ခုကို device အရေအတွက် ကန့်သတ်ထားပါတယ် (ပုံမှန် ၂ ခု)။ Device တွေကို app ထဲက Setup စာမျက်နှာကနေ ကြည့်လို့၊ ဖျက်လို့ရပါတယ်။ ထပ်လိုချင်ရင် app ထဲကနေ ဝယ်လို့ရပါတယ်။</p>

<h2>၅။ သင့်ပုံတွေနဲ့ ရလဒ်တွေ</h2>
<ul>
  <li>သင်တင်တဲ့ ပုံတွေက <b>သင့်ပိုင်ဆိုင်မှု</b> ပါ။ ကျွန်တော်တို့ မသိမ်းပါ၊ မကြည့်ပါ၊ မသုံးပါ။</li>
  <li>အဲဒီပုံတွေကို တည်းဖြတ်ခွင့် သင့်မှာ ရှိရပါမယ် — အခြားသူတစ်ဦးရဲ့ ပုံဆိုရင် သူ့ရဲ့ခွင့်ပြုချက် လိုပါတယ်။</li>
  <li>ရလဒ်ပုံတွေကို စီးပွားဖြစ် သုံးလို့ရပါတယ်။ သို့သော် သင်ရွေးထားတဲ့ AI provider ရဲ့ စည်းကမ်းကလည်း သက်ဆိုင်ပါတယ်။</li>
</ul>

<h2>၆။ လုပ်လို့မရတာတွေ</h2>
<ul>
  <li>တခြားသူတစ်ဦးအဖြစ် ဟန်ဆောင်ဖို့ ပုံပြင်ဆင်ခြင်း</li>
  <li>ဥပဒေနဲ့ မညီတဲ့ ပုံများ ဖန်တီးခြင်း</li>
  <li>အကောင့်ကို ပြန်ရောင်းခြင်း၊ ဝေမျှခြင်း ဒါမှမဟုတ် device ကန့်သတ်ချက်ကို ရှောင်ဖယ်ဖို့ ကြိုးစားခြင်း</li>
</ul>

<h2>၇။ အာမခံချက် မရှိပါ</h2>
<p>AI ရဲ့ ရလဒ်တွေက အမြဲတမ်း မှန်ကန်တယ်၊ အဆင်ပြေတယ်လို့ အာမမခံနိုင်ပါ။ ပုံတိုင်း စိတ်ကြိုက်ဖြစ်မယ်လို့လည်း မပြောနိုင်ပါ။ ဝန်ဆောင်မှုကို &ldquo;ရှိတဲ့အတိုင်း&rdquo; ပေးပါတယ်။</p>

<h2>၈။ ငွေပြန်အမ်းခြင်း</h2>
<p>ငွေပြန်အမ်းရေး ကိစ္စတွေကို တစ်ခုချင်းစီ ကြည့်ပြီး ဆုံးဖြတ်ပါတယ်။ ပြဿနာရှိရင် အောက်က လမ်းကြောင်းတွေကနေ အမြန်ဆုံး ဆက်သွယ်ပါ။</p>

<h2>၉။ ရပ်ဆိုင်းခြင်း</h2>
<p>ဒီစည်းကမ်းချက်တွေကို ချိုးဖောက်ရင် အကောင့်ကို ရပ်ဆိုင်းနိုင်ပါတယ်။ သင်ကိုယ်တိုင်လည်း အချိန်မရွေး အကောင့်ဖျက်ခိုင်းလို့ရပါတယ်။</p>

<h2>၁၀။ ပြောင်းလဲမှုများ</h2>
<p>စည်းကမ်းချက် ပြောင်းရင် အထက်က ရက်စွဲကို ပြောင်းပါမယ်။</p>"""

TERM_EN = """<p>By using HNK Create Studio you agree to these terms.</p>

<h2>1. What the service is</h2>
<p>HNK Create Studio is two things: <b>Web Studio</b>, which runs in your browser, and the <b>HNK Ai Panel</b> for Adobe Photoshop. Both are tools for AI photo work.</p>

<h2>2. You need your own key for the AI engines</h2>
<p>Generation runs on Google Gemini, RunningHub or OpenAI. You supply <b>your own API key</b> for whichever you use. The cost, limits and terms of that key are between you and that provider, and are not included in what you pay HNK.</p>

<h2>3. Premium and payment</h2>
<ul>
  <li>Using the app requires an account and an active plan.</li>
  <li>After transferring, you upload the payment screenshot and the last 6 digits of the transfer reference.</li>
  <li>Premium is unlocked <b>only after an admin has checked and accepted</b> the payment. Transferring alone does not unlock it automatically.</li>
  <li>Prices are shown in the app and may change. A change does not affect a period you have already paid for.</li>
  <li>Renewing before expiry adds time to what you have rather than replacing it.</li>
</ul>

<h2>4. Device limit</h2>
<p>Each account allows a limited number of devices (2 by default). You can see and remove your devices from the Setup page in the app, and buy additional slots there.</p>

<h2>5. Your photos and your results</h2>
<ul>
  <li>The photos you upload remain <b>yours</b>. We do not store them, look at them, or use them.</li>
  <li>You must have the right to edit those photos — if the photo is of someone else, you need their permission.</li>
  <li>You may use the results commercially. The terms of the AI provider you chose also apply.</li>
</ul>

<h2>6. What you may not do</h2>
<ul>
  <li>Edit images in order to impersonate someone</li>
  <li>Create images that are unlawful</li>
  <li>Resell or share your account, or attempt to work around the device limit</li>
</ul>

<h2>7. No warranty</h2>
<p>We cannot guarantee that AI results are always accurate or suitable, or that every image will be what you wanted. The service is provided &ldquo;as is&rdquo;.</p>

<h2>8. Refunds</h2>
<p>Refund requests are considered case by case. If something has gone wrong, contact us through the routes below as soon as possible.</p>

<h2>9. Suspension</h2>
<p>We may suspend an account that breaks these terms. You may ask us to delete your account at any time.</p>

<h2>10. Changes</h2>
<p>If these terms change we update the date above.</p>"""

priv = page("ကိုယ်ရေးအချက်အလက် မူဝါဒ", "Privacy Policy", PRIV_MY, PRIV_EN,
            "/terms/", "စည်းကမ်းချက်များ", "Terms of Service", UPDATED)
term = page("စည်းကမ်းချက်များ", "Terms of Service", TERM_MY, TERM_EN,
            "/privacy/", "ကိုယ်ရေးအချက်အလက် မူဝါဒ", "Privacy Policy", UPDATED)

io.open(os.path.join(ROOT, "docs/privacy/index.html"), "w", encoding="utf-8").write(priv)
io.open(os.path.join(ROOT, "docs/terms/index.html"), "w", encoding="utf-8").write(term)
print("privacy", len(priv), "bytes · terms", len(term), "bytes")
