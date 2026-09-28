# Gesture 3D Workbench 1.2 — validation results

Validated on Windows x64 on 2026-09-24. Release: `outputs/releases/1.2.0/Gesture 3D Workbench-win32-x64/Gesture 3D Workbench.exe`.

## Regressions addressed

- Fists with thumb/index contact previously failed the thumb-gap fist test and could join a two-pinch scale gesture. Classification now uses finger curl in joint space and gives fist evidence priority.
- Single uncertain pose frames previously removed the depth clutch. A recognized fist now latches until a deliberate open palm.
- A single missing hand previously ended a session. Established grabs now freeze for up to 600 ms and rebase on recovery. Longer loss commits the last stable result and disarms. Unconfirmed pinch dwell is reset on missing frames, preventing accidental clicks.
- Depth previously followed the camera sightline, which largely changed apparent size. Depth Z now changes only scene Z, with a guide/origin outline and numeric Z value.
- Rotation/tilt no longer require estimating a palm normal. The Rotate hand tool uses planar finger motion; a second pinch can steer relative to the first. Position and scale remain fixed.
- Estimated palm-size push/pull is off by default. The optional estimate remains available through Hand menu.

## Results

| Check | Result |
|---|---|
| Strict TypeScript / production build | Passed |
| Unit tests | **60 passed, 0 failed** |
| Finger-curl classification of a tucked-thumb fist | Passed |
| Tilted pinch/fist landmarks, noisy fist evidence and deliberate unlock | Passed |
| Brief occlusion, stale identity, detector order, crossing and pinch re-arming | Passed |
| Unconfirmed pinch cannot complete during missing frames | Passed |
| Z-only transform with invariant scale, rotation and X/Y | Passed |
| Rotation/tilt with fixed palm normals and invariant position/scale | Passed |
| Packaged startup and renderer protections | Passed |
| Mouse edits, inspector, undo/redo, validated file save/load | Passed |
| Actual bundled model on blank image | CPU inference, no hands expected |
| Actual bundled model on recorded two-hand image | 2 hands, 21 normalized and world landmarks each |
| Actual bundled model on recorded fist image | One hand; curl classifier latched fist and never started pinch |
| Gesture end-to-end checks | **22 passed**, recorded/synthetic input |
| Tucked-thumb fist and fist/pinch flicker | Z control retained; no accidental scale |
| Brief helper occlusion during depth | Object frozen, grab resumed without jump |
| Official recorded fist landmark replay through controller | Depth engaged; no size change |
| Pinch-operated Depth Z / Rotate / second-hand tilt | Passed; scale and unrelated transforms checked |
| One undo transaction for full gesture, including brief loss | Passed |
| Second-hand cancellation, pinch menu and local scene shelf | Passed |
| Minimum window hand menu | No scrolling required; screenshots inspected |
| Camera denial simulation and cancelled start | Passed |
| External requests / renderer errors | External requests blocked; no uncaught errors |

## Validation limit

**No live physical two-hand acceptance session was performed for version 1.2.** The actual-model tests use recorded images. The interaction suite uses synthetic articulated landmarks plus official recorded fist landmark replay, with a canvas camera and worker replacement only inside the test process. These tests establish the listed code behavior; they do not prove accuracy for every hand, lighting condition or webcam view.

The user’s physical-use report showed that 1.1's earlier synthetic tests did not establish usable controls. Version 1.2 adds regressions for those reported failures and dedicated controls that avoid depending on fist/palm-normal estimates. Camera-distance estimation is still approximate.

The old `camera-test-results.json` is historical version 1.0 evidence only. No camera capture was needed for this update. The user's earlier executable and scene files were preserved.

## Evidence

- `unit-test-results.json`: 60 unit tests.
- `desktop-test-results.json`: packaged UI, actual local model and error checks.
- `two-hand-test-results.json`: 22 controller/workflow checks, input type explicitly labelled.
- `depth-z-control.png`, `rotation-control.png`: inspected transforms, numeric feedback and guides.
- `two-hand-menu.png`, `two-hand-menu-minimum.png`: inspected full/minimum-size menus.
- Recorded fixtures and their Google storage sources/hashes: `tests/fixtures/README.md` in the source archive.

There is no production replay interface or testing backdoor. The scene schema remains version 1.
