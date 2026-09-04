#!/usr/bin/env python3
"""Compose the Video Smart Workflow cards' before -> after guide art.

WHY. The owner, twice, looking at the shipped deck: a student should be able to
glance at a card and know what it does. The first art was nine pretty stills
that said nothing -- an "Anime" card wearing a photorealistic portrait, an
"Erase subtitles" card with no subtitle anywhere in it, a "Make it longer" card
showing a stack of photographs. A card's picture has exactly one job: show the
transformation the card performs.

So every card wears the SAME composition, and a student learns it once:

    +---------------------------+---------------------------+
    |                           |                           |
    |   a frame of the SOURCE   >   the same moment AFTER    |
    |                           |                           |
    |  BEFORE                   |                    AFTER  |
    +---------------------------+---------------------------+

The two halves are real frames -- the left from the clip that was submitted,
the right from what the endpoint actually returned. Nothing is illustrated,
mocked up or borrowed: if a card claims an effect, the right half IS that
effect, produced by the card's own request (tools/v2v_card_request.js) through
the card's own endpoint.

Usage:
  python3 tools/build_v2v_card_art.py --pairs <dir> [--out docs/app/lib/vid]

  <dir> holds the lane's downloads: v2v-source.mp4 plus one v2v-<cardKey>.mp4
  per card. A card with no result clip is SKIPPED and named on stdout -- a
  missing render must never quietly leave last month's picture in place.
"""
import argparse
import json
import os
import subprocess
import sys

from PIL import Image, ImageDraw, ImageFont

CARD_W, CARD_H = 960, 640
GOLD = (217, 164, 65)
INK = (13, 15, 22)

# Which moment of each clip tells that card's story. Most cards change the
# frame in place, so the same timestamp on both sides is the honest compare.
# Two do not:
#   vtExtend   adds time AFTER the last frame, so the right half must come
#              from beyond where the source ended, or the pair shows nothing.
#   vtRestore  is about detail, which a 720p-wide view hides -- both halves
#              are the same crop, magnified, so the difference is visible.
#   vtChar30   is the one card whose BEFORE is not the clip at all. DreamActor
#              animates the PHOTOGRAPH and takes its motion from the video, so
#              the result is the photo's person and the photo's world in
#              motion. Pairing it against a frame of the driving clip showed
#              two unrelated scenes and taught a student the wrong thing; the
#              honest pair is the still photograph beside the same person
#              moving.
FRAME_PLAN = {
    "vtExtend":    {"left": "end", "right": "tail"},
    "vtRestore4K": {"left": "mid", "right": "mid", "zoom": 2.4},
    # the whole point of this card is MOTION, which a middle frame of a gentle
    # performance cannot show at all: the pair came back looking identical.
    # Late in the clip the head has actually turned.
    "vtChar30":    {"left_from_pairs": "v2v-ref.png", "right": "late"},
}


def probe_duration(path):
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "csv=p=0", path],
        capture_output=True, text=True, check=True).stdout.strip()
    return float(out or 0)


def grab(path, when, dest):
    """One frame at `when` seconds, as a JPEG."""
    subprocess.run(
        ["ffmpeg", "-y", "-v", "error", "-ss", "%.3f" % max(0.0, when),
         "-i", path, "-frames:v", "1", "-q:v", "2", dest],
        check=True)
    return dest


def cover(im, w, h, zoom=1.0):
    """Fill w x h without distortion, centred; zoom crops in first."""
    if zoom and zoom > 1.0:
        cw, ch = int(im.width / zoom), int(im.height / zoom)
        x, y = (im.width - cw) // 2, (im.height - ch) // 2
        im = im.crop((x, y, x + cw, y + ch))
    s = max(w / im.width, h / im.height)
    im = im.resize((max(1, int(im.width * s)), max(1, int(im.height * s))), Image.LANCZOS)
    x, y = (im.width - w) // 2, (im.height - h) // 2
    return im.crop((x, y, x + w, y + h))


def load_font(size, bold=False):
    for name in (["DejaVuSans-Bold.ttf"] if bold else []) + ["DejaVuSans.ttf"]:
        for root in ("/usr/share/fonts/truetype/dejavu", "/usr/share/fonts/TTF",
                     "/usr/share/fonts"):
            p = os.path.join(root, name)
            if os.path.exists(p):
                try:
                    return ImageFont.truetype(p, size)
                except Exception:
                    pass
    return ImageFont.load_default()


def tick(draw, xy, text, font, align_right=False):
    """A small pill so BEFORE/AFTER read on any footage, light or dark."""
    x, y = xy
    tw = draw.textlength(text, font=font)
    th = font.size + 2
    pad_x, pad_y = 12, 7
    w, h = tw + pad_x * 2, th + pad_y * 2
    if align_right:
        x -= w
    draw.rounded_rectangle([x, y, x + w, y + h], radius=h / 2, fill=(0, 0, 0, 165))
    draw.text((x + pad_x, y + pad_y - 1), text, font=font, fill=(255, 255, 255))
    return w


def compose(before_jpg, after_jpg, dest, zoom=1.0):
    half = CARD_W // 2
    left = cover(Image.open(before_jpg).convert("RGB"), half, CARD_H, zoom)
    right = cover(Image.open(after_jpg).convert("RGB"), half, CARD_H, zoom)
    card = Image.new("RGB", (CARD_W, CARD_H), INK)
    card.paste(left, (0, 0))
    card.paste(right, (half, 0))

    over = Image.new("RGBA", card.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(over)
    # the seam: a gold hairline with a chevron sitting on it, so the eye reads
    # left-to-right rather than as two unrelated pictures
    d.rectangle([half - 2, 0, half + 1, CARD_H], fill=GOLD + (235,))
    r = 34
    cx, cy = half, CARD_H // 2
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=INK + (240,), outline=GOLD + (255,), width=3)
    d.polygon([(cx - 8, cy - 13), (cx + 11, cy), (cx - 8, cy + 13)], fill=GOLD + (255,))

    # TOP corners, not bottom: a burnt-in caption sits at the bottom of a
    # frame, so the subtitle card's BEFORE pill landed on the very caption the
    # card exists to remove. Nothing a card demonstrates lives up here.
    f = load_font(26, bold=True)
    tick(d, (22, 22), "BEFORE", f)
    tick(d, (CARD_W - 22, 22), "AFTER", f, align_right=True)

    card = Image.alpha_composite(card.convert("RGBA"), over).convert("RGB")
    card.save(dest, "JPEG", quality=88, optimize=True, progressive=True)
    return dest


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pairs", required=True, help="directory of lane downloads")
    ap.add_argument("--out", default=os.path.join("docs", "app", "lib", "vid"))
    ap.add_argument("--tmp", default=os.path.join("/tmp", "v2vart"))
    args = ap.parse_args()

    os.makedirs(args.out, exist_ok=True)
    os.makedirs(args.tmp, exist_ok=True)

    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    pack = subprocess.run(
        ["node", "-e",
         'const A=require("./panel/js/hnk_video_tool_wf.js");'
         'process.stdout.write(JSON.stringify(A.WF.map(w=>({key:w.key,art:w.art}))))'],
        cwd=root, capture_output=True, text=True, check=True).stdout
    cards = json.loads(pack)

    src = os.path.join(args.pairs, "v2v-source.mp4")
    if not os.path.exists(src):
        sys.exit("no v2v-source.mp4 in " + args.pairs +
                 " — the BEFORE half has to come from the clip that was submitted")

    made, skipped = [], []
    for c in cards:
        res = os.path.join(args.pairs, "v2v-%s.mp4" % c["key"])
        if not os.path.exists(res):
            skipped.append(c["key"])
            continue
        plan = FRAME_PLAN.get(c["key"], {})
        # Two cards were sent a PREPARED clip — one with a subtitle burnt in,
        # one deliberately softened — because a clean source gives those
        # endpoints nothing to do. The BEFORE half must be the clip the
        # endpoint actually received, or the pair compares the after against a
        # frame that was never submitted.
        own = os.path.join(args.pairs, "v2v-source-%s.mp4" % c["key"])
        before_src = own if os.path.exists(own) else src
        res_dur = probe_duration(res)
        # a card whose before is a still needs no frame grabbed for it
        # the reference PORTRAIT this lane generated, never a shipped poster
        left_still = plan.get("left_from_pairs")
        if left_still:
            left_still = os.path.join(args.pairs, left_still)
            if not os.path.exists(left_still):
                print("missing before-image for " + c["key"] + ": " + left_still, file=sys.stderr)
                skipped.append(c["key"])
                continue
        src_dur = 0.0 if left_still else probe_duration(before_src)

        def at(which, dur):
            if which == "end":
                return max(0.0, dur - 0.25)
            if which == "tail":
                return max(0.0, dur - 0.4)
            if which == "late":
                return max(0.0, dur * 0.82)
            return dur * 0.45

        rt = at(plan.get("right", "mid"), res_dur)
        if left_still:
            b = left_still
        else:
            lt = at(plan.get("left", "mid"), src_dur)
            b = grab(before_src, lt, os.path.join(args.tmp, c["key"] + "-b.jpg"))
        a = grab(res, rt, os.path.join(args.tmp, c["key"] + "-a.jpg"))
        dest = os.path.join(root, args.out, os.path.basename(c["art"]))
        compose(b, a, dest, zoom=plan.get("zoom", 1.0))
        made.append(os.path.basename(dest))

    for m in made:
        print("wrote", m)
    if skipped:
        print("NO RENDER, art left untouched: " + ", ".join(skipped), file=sys.stderr)
    print("%d card(s) rebuilt, %d without a render" % (len(made), len(skipped)))
    return 1 if skipped else 0


if __name__ == "__main__":
    sys.exit(main())
