/* Classic worker: MediaPipe's supplied WASM loader uses importScripts. All assets are local. */
importScripts('./vendor/vision_bundle.js');
let landmarker;
self.onmessage = async ({ data }) => {
  try {
    if (data.type === 'init') {
      const files = await Vision.FilesetResolver.forVisionTasks(new URL('./vendor/wasm', self.location.href).href);
      // CPU detected both hands consistently in the recorded regression fixture on this machine;
      // the GPU delegate dropped one at the same thresholds. Three.js rendering still uses GPU.
      const options = { baseOptions: { modelAssetPath: new URL('./models/hand_landmarker.task', self.location.href).href, delegate: 'CPU' }, runningMode: 'VIDEO', numHands: 2, minHandDetectionConfidence: 0.5, minHandPresenceConfidence: 0.5, minTrackingConfidence: 0.5 };
      let delegate = 'CPU';
      try { landmarker = await Vision.HandLandmarker.createFromOptions(files, options); }
      catch { options.baseOptions.delegate = 'GPU'; delegate = 'GPU fallback'; landmarker = await Vision.HandLandmarker.createFromOptions(files, options); }
      self.postMessage({ type: 'ready', delegate });
    } else if (data.type === 'frame' && landmarker) {
      try {
        const start = performance.now();
        const result = landmarker.detectForVideo(data.frame, data.time);
        self.postMessage({ type: 'result', landmarks: result.landmarks, worldLandmarks: result.worldLandmarks, handedness: result.handedness, ms: performance.now() - start });
      } finally { data.frame.close(); }
    }
  } catch (error) { self.postMessage({ type: 'error', message: error instanceof Error ? error.message : String(error) }); }
};
