#!/usr/bin/env python3
"""HNK marketing cinemagraphs via the RunningHub openapi/v2 API.

Mirrors the shipped web app's own client exactly (docs/app/index.html):
upload -> submit alibaba/wan-2.7/image-to-video -> poll /query -> download.
The key is NEVER stored in this file: pass it as the RH_KEY environment
variable. Outputs land in videodrop/ next to the repo root, plus a
videodrop/status.json report.

Usage:  RH_KEY=xxxx python3 tools/rh_video_gen.py
"""
import json, mimetypes, os, sys, time, urllib.request, urllib.error, uuid

KEY = os.environ.get("RH_KEY", "").strip()
if not KEY:
    print("set RH_KEY"); sys.exit(2)

BASE = "https://www.runninghub.ai"
V2 = BASE + "/openapi/v2"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "videodrop")
os.makedirs(OUT, exist_ok=True)

STYLE = ("Cinemagraph, living photograph, identical to the source image: same "
         "composition, colors, lighting. Camera fully static, locked off, no pan, "
         "no zoom. The person's face, head, hands and pose are completely frozen "
         "like the photograph. Everything moves slowly and gently, elegant "
         "seamless loop, photorealistic, no added objects, no text. ")

TARGETS = [
    ("brand-ad", "docs/assets/site/hero-fairy.jpg", "1080P",
     STYLE + "Only the world breathes: her white feathered wings sway very slowly, "
             "her back rises with soft sleeping breath, golden sun rays shimmer "
             "through the forest, butterflies flutter gently, gold dust drifts, "
             "leaves and mushrooms stir in a slow breeze."),
    ("app-hero", "docs/app/lib/wf/hero-banner.jpg", "720P",
     STYLE + "Only the environment breathes: soft light shimmers slowly, gentle "
             "atmospheric drift, fabric and foliage stir faintly."),
    ("banner-fairy-forest", "docs/app/lib/banners/banner-fairy-forest.jpg", "720P",
     STYLE + "Only the forest breathes: leaves stir, light rays shimmer, "
             "particles drift slowly through the air."),
    ("banner-coral-fairy", "docs/app/lib/banners/banner-coral-fairy.jpg", "720P",
     STYLE + "Only the scene breathes: soft glow pulses, petals or particles "
             "drift, gentle underwater-like light shimmer."),
    ("banner-golden-temple", "docs/app/lib/banners/banner-golden-temple.jpg", "720P",
     STYLE + "Only the scene breathes: warm golden light shimmers slowly, "
             "incense-like haze drifts, faint highlights glint."),
    ("banner-flower-gown", "docs/app/lib/banners/banner-flower-gown.jpg", "720P",
     STYLE + "Only the scene breathes: flower petals stir and drift very slowly, "
             "the gown fabric ripples faintly, soft light breathes."),
]

def call_json(path, body):
    req = urllib.request.Request(V2 + path, data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json", "Authorization": "Bearer " + KEY},
        method="POST")
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.load(r)

def upload(img_path):
    boundary = "hnk" + uuid.uuid4().hex
    name = "hnk_0.jpg" if img_path.lower().endswith((".jpg", ".jpeg")) else "hnk_0.png"
    ctype = mimetypes.guess_type(name)[0] or "application/octet-stream"
    data = open(img_path, "rb").read()
    body = (("--%s\r\nContent-Disposition: form-data; name=\"file\"; filename=\"%s\"\r\n"
             "Content-Type: %s\r\n\r\n") % (boundary, name, ctype)).encode() + data + \
           ("\r\n--%s--\r\n" % boundary).encode()
    req = urllib.request.Request(V2 + "/media/upload/binary", data=body,
        headers={"Content-Type": "multipart/form-data; boundary=" + boundary,
                 "Authorization": "Bearer " + KEY}, method="POST")
    with urllib.request.urlopen(req, timeout=180) as r:
        j = json.load(r)
    url = j.get("data", {}).get("download_url") or j.get("data", {}).get("fileName")
    if not url:
        raise RuntimeError("upload-failed: " + json.dumps(j)[:200])
    if not url.lower().startswith("http"):
        url = BASE + "/" + url.lstrip("/")
    return url

def generate(name, img, resolution, prompt):
    img_url = upload(os.path.join(ROOT, img))
    j = call_json("/alibaba/wan-2.7/image-to-video", {
        "prompt": prompt[:5000], "firstImageUrl": img_url,
        "resolution": resolution, "duration": "5"})
    task = j.get("taskId")
    if not task:
        raise RuntimeError("submit-failed: " + json.dumps(j)[:200])
    print(name, "task:", task, flush=True)
    start = time.time()
    while True:
        time.sleep(6)
        try:
            q = call_json("/query", {"taskId": task})
        except urllib.error.URLError:
            continue
        s = str(q.get("status", "")).upper()
        if s == "SUCCESS":
            results = q.get("results") or []
            urls = [r.get("url") for r in results if r.get("url")]
            if not urls:
                raise RuntimeError("no result url: " + json.dumps(q)[:200])
            out = os.path.join(OUT, name + ".mp4")
            req = urllib.request.Request(urls[0])
            with urllib.request.urlopen(req, timeout=600) as r:
                open(out, "wb").write(r.read())
            print(name, "saved", os.path.getsize(out), "bytes", flush=True)
            return
        if s == "FAILED":
            raise RuntimeError("generation FAILED: " + json.dumps(q)[:300])
        if time.time() - start > 900:
            raise RuntimeError("timeout waiting for task " + task)

status = {"done": [], "failed": []}
for name, img, res, prompt in TARGETS:
    out = os.path.join(OUT, name + ".mp4")
    if os.path.exists(out):
        print("skip", name); status["done"].append(name); continue
    try:
        generate(name, img, res, prompt)
        status["done"].append(name)
    except Exception as e:
        print(name, "ERROR:", str(e)[:300], flush=True)
        status["failed"].append({"name": name, "error": str(e)[:300]})
open(os.path.join(OUT, "status.json"), "w").write(json.dumps(status, indent=1))
print(json.dumps(status))
