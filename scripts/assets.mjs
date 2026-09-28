import { mkdir, cp, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
await mkdir('public/vendor', { recursive: true });
await mkdir('public/models', { recursive: true });
await cp('node_modules/@mediapipe/tasks-vision/wasm', 'public/vendor/wasm', { recursive: true });
await cp('node_modules/@mediapipe/tasks-vision/vision_bundle.js', 'public/vendor/vision_bundle.js');
const url = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
const path = 'public/models/hand_landmarker.task';
let bytes;
try { bytes = await readFile(path); } catch { const response = await fetch(url); if (!response.ok) throw new Error(`Model download failed: ${response.status}`); bytes = Buffer.from(await response.arrayBuffer()); await writeFile(path, bytes); }
if(bytes.length<1_000_000) throw new Error('Model is unexpectedly small.');
await writeFile('public/models/provenance.json',JSON.stringify({source:url,license:'Apache-2.0',sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length,mediapipeVersion:'1.0.1'},null,2));
console.log(`Bundled model (${bytes.length} bytes) and local MediaPipe WASM.`);
