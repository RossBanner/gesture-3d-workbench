# Third-party software and model notices

- Three.js 0.186.0, MIT license. Copyright 2010–2026 Three.js authors. License included in `public/vendor/LICENSE-three.txt` in source and `dist/vendor/LICENSE-three.txt` in the packaged archive. https://github.com/mrdoob/three.js
- MediaPipe Tasks Vision 1.0.1 and Hand Landmarker model version 1, Apache License 2.0. Copyright Google LLC / MediaPipe authors. Full license included in `public/vendor/LICENSE-mediapipe.txt` in source and `dist/vendor/LICENSE-mediapipe.txt` in the packaged archive. Model source and SHA-256 are recorded in `public/models/provenance.json`. https://github.com/google-ai-edge/mediapipe
- Electron 44.4.5, MIT license; Chromium and other third-party notices are supplied alongside the executable as `LICENSE` and `LICENSES.chromium.html`. https://github.com/electron/electron
- The source test fixture is an unmodified MediaPipe test image, attributed to the MediaPipe authors in `tests/fixtures/README.md`. It is not part of the runtime application.

Development/build tools are not included as runtime Node dependencies. Their versions and transitive dependencies are pinned in `package-lock.json`; their individual licenses are available in `node_modules` after `npm ci`.

Application code is provided under the MIT license in the root `LICENSE`. Third-party components retain their own licenses.
