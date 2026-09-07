Hero motion clips (v5.57.0; greeting clips v5.58.0)
===================================================

Drop one looping clip PAIR per page banner here — an .mp4 (H.264, for
Safari/iOS) AND an .webm (VP9) sibling with the same basename — named
EXACTLY after the still (send me just the mp4s; I transcode the webm
siblings). Two-step drop-in: (1) put the pair here, (2) add the basename
to PH_MOTION_CLIPS in docs/app/index.html — only listed clips are probed,
so a missing file never costs a console 404. The app then picks the
format the browser can actually decode:

  banner-archer.mp4            Setup (Home)
  banner-train-station.mp4     Reference Library
  hero-mermaid.mp4             Meitu Studio
  banner-flower-portrait.mp4   Evoto Pro + Freeform Create (shared)
  banner-flower-gown.mp4       Retouch Pro
  banner-naga.mp4              Image to Video
  banner-superhero.mp4         Video Upscale
  banner-path-batch.mp4        Batch Looks (Path)
  banner-coral-fairy.mp4       Text to Image
  banner-fairy-forest.mp4      My Gallery
  banner-golden-temple.mp4     Workflows (hero-strip, joined v5.58.0)
  banner-imagine.mp4           Imagine (one-tap AI tools; 6.29.1 wave)

The three Home greeting arts follow the SAME pair contract but live on
their own manifest — GREET_MOTION_CLIPS in docs/app/index.html (the
page-hero list is pinned at exactly ten by the test sweep):

  hero-greet-morning.mp4       Home greeting, before 11:00
  hero-greet-afternoon.mp4     Home greeting, 11:00-15:59
  hero-greet-evening.mp4       Home greeting, from 16:00

The app probes for these at runtime and fades a clip in over its still the
moment it can play; a missing or failing file silently leaves the clean
still — nothing else to wire. Spec per mp4: H.264, 1280x720 (or the
still's aspect), 5-8s, loop-friendly (first and last frames close), muted,
target 1.5-2.5 MB (ffmpeg -crf 26-28). Generated with an image-to-video
model from the still itself with identity/outfit/background locked, so the
banner comes alive without changing the picture.

These files are intentionally OUTSIDE the service worker's LIB_CACHE
(sw.js excludes lib/banners/motion/) — the browser's HTTP cache owns them.
