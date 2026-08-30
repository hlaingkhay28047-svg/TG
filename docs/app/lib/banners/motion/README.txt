Hero motion clips (v5.57.0)
===========================

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

The app probes for these at runtime and fades a clip in over its still the
moment it can play; a missing or failing file silently leaves the Ken Burns
still — nothing else to wire. Spec per mp4: H.264, 1280x720 (or the
still's aspect), 5-8s, loop-friendly (first and last frames close), muted,
target 1.5-2.5 MB (ffmpeg -crf 26-28). Generated with an image-to-video
model from the still itself with identity/outfit/background locked, so the
banner comes alive without changing the picture.

These files are intentionally OUTSIDE the service worker's LIB_CACHE
(sw.js excludes lib/banners/motion/) — the browser's HTTP cache owns them.
