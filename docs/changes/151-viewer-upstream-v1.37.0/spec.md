# MF-151: Viewer v1.37.0 / Metaflow 5.22.0

Status: accepted for implementation on 2026-10-18. [Issue #151](https://github.com/Shuang-su/Metaflow/issues/151) owns the scope; [plan.md](plan.md) is the approved implementation plan and [verification.md](verification.md) records actual results.

## Baseline and outcome

Start from production 5.21.11, product `a9b4f41782c9d96cae0aa1c2c81ea8eee7d3ebe9`, tag/build `988c8e7cbe5844af3133a38ac4a988af2601092b`, 100 resources/schema 1.2. Adopt upstream v1.37.0 `cd0e316e397929ffa87abd4833f73f8a0bd1fd2b` and PlayCanvas 2.23.0, retaining Metaflow behavior and Node 20.19.0. Publish website/repository version 5.22.0 after validation. Editor and Director retain their separately pinned dependencies and production artifacts; do not publish npm.

## Required behavior

- XR manipulates a per-instance scene root containing the subject and environment, including an environment that finishes loading during the session. Preserve their authored relative placement and restore the root on exit. Preserve custom dual-stick locomotion and WebGL fallback; suspend locomotion and teleport while two-hand manipulation is active. Restore camera, clipping, rendering, performance and scene state on exit or failure.
- Adopt upstream heading, post-effect/tone-map restoration, AR sky hiding, standalone-headset budget and distance-based XR LOD. A budget limits LOD selection, not the point count of monolithic scenes. No new XR voxel walking system.
- Annotation anchors and debug geometry follow the scene transform. Desktop annotation camera transitions are paused during XR. Original collision data stays in its authored coordinate system.
- Adopt annotation timing/retention/positioning and engine 2.23 debug-overlay replacements, including resource cleanup. Preserve official SVG lockup and animation, nine languages, transparent progress presentation and all loading/retry/poster behavior.
- Stochastic rendering is experimental, off by default, explicitly enabled on WebGPU, and falls back to sorted rendering on WebGL and during XR. `captureFrame` always uses sorted rendering, including when the preview is stochastic; renderer/picker switching is transactional and recovers on success, failure and destruction. Resume temporal accumulation after returning to the preview.

## Interfaces and invariants

Add upstream optional `stochastic`, `splatSource`, `variant` options to instance and generated/page inputs. No ordinary-user toggle. Keep Node HTML/settings imports engine-free and retain existing exports, globals, createViewer lifecycle and capture RGBA/options/serialization/first-frame contracts. Preserve source camera, settings migrations, progressive reveal, concurrent environment loading, legacy/tiled collision, Safari startup recovery, LOD byte progress, poster-before-UI and analytics cleanup.

Resource IDs, aliases, routes, models, settings, environments, voxels and covers stay unchanged; only release metadata changes. Upstream open PR328 is excluded. Existing local research commits and untracked directories are protected.

## Acceptance and release

Use the plan's build/package/data/browser/loading/capture/XR/lifecycle and paired-performance checks. Retain failed checks and corrections; do not weaken assertions to pass. Physical-device gaps are disclosed. The old accepted engine-memory increase does not authorize a new reproducible regression.

Normal product PR squash, final SHA backfill, immutable `viewer-v5.22.0` tag/Release, complete candidate with original Editor/Director and resources, production promotion/readback and at least 15 minutes of observation. Recheck the rollback deployment before promotion; initial candidate is 5.21.11 `6aca09261511aa373989bac4`. Then normally merge the remote release into local main, preserving research history.
