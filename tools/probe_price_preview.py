#!/usr/bin/env python3
"""v6.22.0 — ask RunningHub, for every video model / video tool / the upscaler,
whether it ACCEPTS the exact body the app would send. POST /openapi/v2/price-preview/
<apiPath> is the app's own pre-submit cost line: it validates the body and quotes
the price without running the job, so nothing here spends a credit.

Media: the placeholders in the body dump are swapped for one real uploaded still
and one real uploaded clip (media/upload/binary, free). If an upload fails the
placeholders stay, and the report says so.

The key arrives ONLY in the RH_KEY environment variable and is never printed;
requests and responses are logged without headers. Usage:
  RH_KEY=... python3 tools/probe_price_preview.py out/bodies.json out/results.json [--group all|video|tools] [--ids a,b] [--dry]
                                              [--variants '{"<id>": [{"field": "value", "drop": null}, ...]}']
--variants probes candidate bodies for a row ALONGSIDE it — the row's own body plus each patch
(a null value drops the field) — as <id>~1, <id>~2 …, so a bare "301 PARAMS_INVALID" can be
narrowed to the field that causes it without touching the source.
"""
import json, os, re, sys, time, urllib.request, urllib.error, mimetypes, uuid

BASE = "https://www.runninghub.ai/openapi/v2"
PH = { "https://placeholder.invalid/FIRST.jpg": "img1", "https://placeholder.invalid/SECOND.jpg": "img2", "https://placeholder.invalid/VIDEO.mp4": "vid" }
args = sys.argv[1:]
def opt(name, default=None):
    if name in args:
        i = args.index(name); return args[i + 1] if i + 1 < len(args) else default
    return default
DRY = "--dry" in args
GROUP = opt("--group", "all")   # all | video | tools | image | t2i   (v6.26.0: image = every RH_MODELS body at each reference count)
IDS = [x for x in (opt("--ids", "") or "").replace(" ", ",").split(",") if x]
VARIANTS = json.loads(opt("--variants", "") or "{}")   # {id: [ {field: value | null}, ... ]}
src, dst = args[0], args[1]
KEY = os.environ.get("RH_KEY", "")
if not KEY and not DRY:
    print("no RH_KEY in the environment"); sys.exit(2)

def post(path, body, timeout=40):
    req = urllib.request.Request(BASE + "/" + path.lstrip("/"), data=json.dumps(body).encode("utf-8"),
                                 headers={"Authorization": "Bearer " + KEY, "Content-Type": "application/json"}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, json.loads(r.read().decode("utf-8") or "null")
    except urllib.error.HTTPError as e:
        try: j = json.loads(e.read().decode("utf-8") or "null")
        except Exception: j = None
        return e.code, j
    except Exception as e:
        return 0, {"transport": str(e)[:160]}

def upload(path_on_disk, name):
    """media/upload/binary — multipart, returns the hosted URL or None."""
    if DRY: return "https://dry.invalid/" + name
    boundary = "----hnk" + uuid.uuid4().hex
    data = open(path_on_disk, "rb").read()
    ctype = mimetypes.guess_type(name)[0] or "application/octet-stream"
    body = (("--%s\r\nContent-Disposition: form-data; name=\"file\"; filename=\"%s\"\r\nContent-Type: %s\r\n\r\n" % (boundary, name, ctype)).encode() + data + ("\r\n--%s--\r\n" % boundary).encode())
    req = urllib.request.Request(BASE + "/media/upload/binary", data=body, headers={"Authorization": "Bearer " + KEY, "Content-Type": "multipart/form-data; boundary=" + boundary}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            j = json.loads(r.read().decode("utf-8") or "null")
    except Exception as e:
        print("upload failed for", name, "-", str(e)[:120]); return None
    d = j.get("data") if isinstance(j, dict) and isinstance(j.get("data"), dict) else (j or {})
    url = d.get("download_url") or d.get("fileName") or d.get("url")
    if not url: print("upload gave no url for", name, "-", json.dumps(j)[:200]); return None
    if not str(url).startswith("http"): url = "https://www.runninghub.ai/" + str(url).lstrip("/")
    return url

def unwrap(j):
    if isinstance(j, dict) and "code" in j and isinstance(j.get("data"), dict): return j["data"]
    return j if isinstance(j, dict) else {}

def classify(status, j):
    d = unwrap(j)
    if status == 0: return "TRANSPORT", (d.get("transport") or "")[:200]
    if d.get("errorCode") or d.get("errorMessage"):
        code = str(d.get("errorCode", ""))
        # 1501 PRICE_CONFIG_NOT_FOUND: RunningHub has no price table for the endpoint — the body was
        # not refused, the quote is simply unavailable (kling-video-o3 pro/std r2v, veo3.1 fast r2v)
        verdict = "NO-PRICE" if code == "1501" else "REJECTED"
        return verdict, ("%s %s" % (code, d.get("errorMessage", "")))[:200]
    if isinstance(j, dict) and j.get("code") not in (None, 0, "0") :
        return "REJECTED", ("%s %s" % (j.get("code"), j.get("msg") or j.get("message") or ""))[:200]
    if status >= 400: return "HTTP-" + str(status), json.dumps(j)[:200] if j is not None else ""
    if d.get("estimatedPrice") is not None or d.get("priceText") or d.get("priceTextEn"):
        return "OK", str(d.get("priceText") or d.get("priceTextEn") or d.get("estimatedPrice"))[:80]
    return "UNKNOWN", json.dumps(j)[:200] if j is not None else ""

dump = json.load(open(src, encoding="utf-8"))
items = []
if GROUP in ("all", "video"): items += [dict(v, group="video") for v in dump["video"]]
if GROUP in ("all", "tools"):
    items += [dict(t, group="tool") for t in dump["tools"]]
    if dump.get("upscale"): items.append(dict(dump["upscale"], group="tool", label="Video upscaler"))
if GROUP in ("all", "t2i"):
    items += [dict(v, group="t2i") for v in dump.get("t2i", [])]   # v6.26.0 — the text-to-image catalog
if GROUP in ("all", "image"):
    # v6.26.0 — one row per (model, reference count): "<id>@<n>"; `base` keeps the model id for the capacity table
    items += [dict(v, group="image", id="%s@%d" % (v["id"], v["n"]), base=v["id"]) for v in dump.get("image", [])]
if IDS: items = [i for i in items if i["id"] in IDS or i.get("base") in IDS]
if VARIANTS:
    extra = []
    for it in items:
        for k, patch in enumerate(VARIANTS.get(it["id"]) or VARIANTS.get(it.get("base") or "") or [], 1):   # v6.26.0 — image rows are "<id>@<n>": the model id keys their variants too
            body = dict(it.get("body") or {})
            for f, v in patch.items():
                if v is None: body.pop(f, None)
                else: body[f] = v
            extra.append(dict(it, id="%s~%d" % (it["id"], k), body=body, variant=patch))
    items += extra

media = {}
still = opt("--still", "docs/assets/site/ba/ba-retouch-before.jpg"); clip = opt("--clip", "docs/app/lib/banners/motion/banner-path-batch.mp4")
if os.path.exists(still): media["img1"] = upload(still, "probe-still.jpg"); media["img2"] = media["img1"]
if os.path.exists(clip): media["vid"] = upload(clip, "probe-clip.mp4")
print("media:", {k: ("uploaded" if v else "PLACEHOLDER") for k, v in media.items()})

def swap(x):
    if isinstance(x, str):
        mi = re.match(r"^https://placeholder\.invalid/IMG(\d+)\.jpg$", x)   # v6.26.0 — IMG1..IMG14 alternate the two stills
        if mi: return media.get("img1" if int(mi.group(1)) % 2 else "img2") or x
        return media.get(PH.get(x, ""), x) or x
    if isinstance(x, list): return [swap(y) for y in x]
    if isinstance(x, dict): return {k: swap(v) for k, v in x.items()}
    return x

results = []
for it in items:
    body = swap(it.get("body") or {})
    if DRY: status, j = 200, {"estimatedPrice": 0.1, "currency": "USD", "priceText": "dry"}
    else: status, j = post("price-preview/" + it["apiPath"], body)
    verdict, note = classify(status, j)
    results.append({"group": it["group"], "id": it["id"], "label": it.get("label"), "apiPath": it["apiPath"], "verdict": verdict, "note": note, "status": status, "sentKeys": sorted(body.keys()), "variant": it.get("variant"), "base": it.get("base"), "n": it.get("n"), "single": it.get("single")})
    print("%-9s %-42s %-60s %s" % (verdict, it["id"][:42], it["apiPath"][:60], note[:90]))
    if not DRY: time.sleep(0.25)

ok = sum(1 for r in results if r["verdict"] == "OK"); bad = [r for r in results if r["verdict"] != "OK"]
# v6.26.0 — image capacity: per model, the largest accepted reference count and the first refusal
cap = {}
for r in results:
    if r["group"] != "image": continue
    c = cap.setdefault(r["base"], {"apiPath": r["apiPath"], "single": bool(r.get("single")), "max": None, "okAt": [], "refused": {}})
    if r["verdict"] in ("OK", "NO-PRICE"): c["okAt"].append(r["n"]); c["max"] = max(c["max"] or 0, r["n"])
    else: c["refused"][str(r["n"])] = r["note"][:120]
summary = {"probed": len(results), "ok": ok, "notOk": len(bad), "media": {k: bool(v) for k, v in media.items()}, "imageCap": cap, "results": results}
json.dump(summary, open(dst, "w", encoding="utf-8"), indent=1, ensure_ascii=False)
md = ["## Model probe — %d probed, %d accepted, %d not accepted" % (len(results), ok, len(bad)), "",
      "media: " + ", ".join("%s=%s" % (k, "uploaded" if v else "placeholder") for k, v in media.items()), "",
      "| verdict | group | id | apiPath | note |", "|---|---|---|---|---|"]
for r in bad + [r for r in results if r["verdict"] == "OK"]:
    md.append("| %s | %s | `%s` | `%s` | %s |" % (r["verdict"], r["group"], r["id"], r["apiPath"], r["note"].replace("|", "\\|")))
if cap:
    md += ["", "## Image capacity (largest accepted reference count)", "", "| model | apiPath | single | max ok | ok at | refused |", "|---|---|---|---|---|---|"]
    for b, c in cap.items():
        md.append("| `%s` | `%s` | %s | %s | %s | %s |" % (b, c["apiPath"], "yes" if c["single"] else "", c["max"], ",".join(map(str, sorted(c["okAt"]))), "; ".join("%s: %s" % (k, v.replace("|", "\\|")) for k, v in c["refused"].items())))
gs = os.environ.get("GITHUB_STEP_SUMMARY")
if gs: open(gs, "a", encoding="utf-8").write("\n".join(md) + "\n")
print("===PROBE-JSON-BEGIN===")
print(json.dumps({"probed": len(results), "ok": ok, "notOk": [{"id": r["id"], "apiPath": r["apiPath"], "verdict": r["verdict"], "note": r["note"]} for r in bad], "imageCap": cap}, ensure_ascii=False))
print("===PROBE-JSON-END===")
