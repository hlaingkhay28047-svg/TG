/* v5.11 — the face model runs entirely inside this worker.

   v5.10 shipped the detector on the main thread and refused the cpu backend
   because a synchronous cpu pass blocks the UI thread for roughly a second.
   v5.11 needed cpu allowed as a real fallback (a wrong retouch from the old
   geometric guess is worse than a pause — see the app's own stFaceBoot
   comment), which reopened exactly that blocking risk: the scan could now
   land in the middle of an ordinary slider drag, not just an explicit
   generate. Deferring the START of the scan (stFaceBusy) does not help once
   it has started — cpu inference is one long synchronous burst regardless of
   when it began.

   The only fix that actually removes the block is removing it from the main
   thread. face-api's own environment layer only auto-detects a real browser
   (window+document) or Node, so a Worker needs an explicit environment via
   env.setEnv — the two things worth noting there:
     - Image/Video are set to a class NOTHING will ever be an instance of.
       face-api's own getMediaDimensions() does `input instanceof env.Image`
       to decide whether to read naturalWidth/naturalHeight; pointing that at
       OffscreenCanvas (which has no naturalWidth) made every real detection
       throw "expected width and height to be valid numbers". Failing the
       instanceof check on purpose sends every real input down the width/
       height branch, which is what OffscreenCanvas actually has.
     - webgl inside a worker needs a real GPU context; this is a normal,
       supported browser capability, but not guaranteed everywhere, so the
       fallback to cpu here mirrors the main thread's — try webgl, fall back
       to cpu, and report which one actually ran. */
class STFaceEnvNever {}

let faModule = null, booted = null;

async function boot() {
  if (booted) return booted;
  booted = (async () => {
    const fa = await import("./face-api.esm.js");
    fa.env.setEnv({
      Canvas: OffscreenCanvas,
      CanvasRenderingContext2D: (typeof OffscreenCanvasRenderingContext2D !== "undefined") ? OffscreenCanvasRenderingContext2D : Object,
      Image: STFaceEnvNever,
      Video: STFaceEnvNever,
      ImageData: ImageData,
      createCanvasElement: () => new OffscreenCanvas(1, 1),
      createImageElement: () => new OffscreenCanvas(1, 1),
      fetch: self.fetch.bind(self),
      readFile: () => { throw new Error("no filesystem inside a worker"); }
    });
    try { fa.tf.removeBackend("wasm"); } catch (e) {}
    let backend = "webgl";
    try {
      await fa.tf.setBackend("webgl");
      await fa.tf.ready();
      if (fa.tf.getBackend() !== "webgl") throw new Error("webgl backend did not take");
    } catch (e) {
      backend = "cpu";
      await fa.tf.setBackend("cpu");
      await fa.tf.ready();
    }
    await Promise.all([
      fa.nets.tinyFaceDetector.loadFromUri("."),
      fa.nets.faceLandmark68Net.loadFromUri(".")
    ]);
    faModule = fa;
    return { fa, backend };
  })().catch(e => { booted = null; throw e; });
  return booted;
}

async function scan(bitmap, backend) {
  const fa = faModule;
  const c = new OffscreenCanvas(bitmap.width, bitmap.height);
  c.getContext("2d").drawImage(bitmap, 0, 0);
  bitmap.close();
  /* one fast confident pass, and a slower sensitive one ONLY on a miss —
     mirrors the sizes the main thread used to pick, now chosen here since
     the worker is the one that knows which backend actually loaded */
  const cpu = backend === "cpu";
  const run = (size, score) => fa.detectAllFaces(c, new fa.TinyFaceDetectorOptions({ inputSize: size, scoreThreshold: score })).withFaceLandmarks();
  let res = await run(cpu ? 320 : 416, 0.3);
  if (!res.length) res = await run(cpu ? 416 : 608, 0.2);
  return res.map(d => {
    const b = d.detection.box;
    return {
      score: Math.round(d.detection.score * 1000) / 1000,
      area: b.width * b.height,
      pts: d.landmarks.positions.map(q => [q.x, q.y])
    };
  });
}

self.onmessage = async (e) => {
  const m = e.data;
  try {
    const { backend } = await boot();
    const faces = await scan(m.bitmap, backend);
    self.postMessage({ id: m.id, ok: true, faces, w: m.w, h: m.h, backend });
  } catch (err) {
    self.postMessage({ id: m.id, ok: false, error: String((err && err.message) || err).slice(0, 200) });
  }
};
