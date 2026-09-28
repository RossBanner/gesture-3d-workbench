# Recorded MediaPipe fixtures

These unmodified fixtures are retained for recorded-image/landmark regression testing, with attribution to the Google MediaPipe authors. They are not live webcam recordings and are excluded from the runtime package. MediaPipe source and model notices: https://github.com/google-ai-edge/mediapipe (Apache-2.0).

| File | Source | SHA-256 |
|---|---|---|
| right_hands.jpg | https://storage.googleapis.com/mediapipe-assets/right_hands.jpg | See original bundled fixture |
| fist.jpg | https://storage.googleapis.com/mediapipe-assets/fist.jpg | 43fa1cabf3f90d574accc9a56986e2ee48638ce59fc65af1846487f73bb2ef24 |
| fist_landmarks.pbtxt | https://storage.googleapis.com/mediapipe-assets/fist_landmarks.pbtxt | 4b0ad2b00d5f2d140450f9f168af0f7422ecf6b630b7d64a213bcf6f04fb078b |

Downloaded 2026-09-24. The fist image exercises the actual bundled detector and curl classifier. The landmark fixture exercises pose classification and is replayed at a normalized screen location through the production controller in test processes. Synthetic fixtures are labelled separately in tests/hand-fixture.ts.
