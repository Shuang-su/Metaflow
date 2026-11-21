# Desktop display session — fixed browser runtime handoff

User requested continued refinement with Wenjing as default and original assets preserved. Development remains in private Shuang-su/Metaflow-Companion. Only the accepted browser runtime is handed to the existing protected publisher; no private history, test fixtures, restricted motion bytes or credentials are embedded.

## Accepted candidate

- Tested source: `6e70455fcf87046f67fdf1d98145ebdcaa09ee77`
- Full CI: `44144629603` (build and seven browser flows, all success)
- Candidate artifact: `14355479168`
- Candidate ZIP SHA256: `fc716000fc5a71bea7aa58d43f221912858de0672500873e5e2b98f36f1a9939`
- Source PR10 merged: `b82336e67e968e506f2fc62cb6fabf6c3dfb0bbd`
- Session evidence: `14356336765`, SHA256 `7fe0b084f88cd54352982bab6d955cb701f9094f4bf7b40b399dde58e8332469`
- Release: `companion-2026-11-18-display-session`
- Exact target: `https://polite-semolina-b478fc.netlify.app/`
- Previous unique deploy: `6afc6be90e78b612de2a968d`; source8886f8c, motion-feedback release
- Output:72 files; changes only app.js, experience.css, new screen-awake.mjs/display-session.mjs and release.json. Original models, motions, scenes and dependencies are unchanged.

The data-only delta.xz.b64 contains strict UTF-8 deltas and hashes. Packed SHA256 `a161b1d5bffaef126e1a62ec472ad4b1fad9ebe7c257f49ff4396376870d440a`; decoded 14,922-byte JSON SHA256 `4e09f2d9b1b0494af092fa510bee8e16ea15f48acccc0d36865a84a906837de7`. Unchanged file records and two exact Netlify routing configurations are inherited from the previous fixed manifest. Every reconstructed file must match the accepted candidate. The prior app digest is captured before replacing its record, so production baseline validation cannot accidentally compare against the new app.

## Behavior

Screen-awake ownership follows actual browser fullscreen or immersive view, not a stale attempted-fullscreen flag. Exiting inline display releases the lease; actual fullscreen controls preserve the physical canvas. Visible switch/status, rejection/system-release hints and explicit retry never claim guaranteed permanent wake. No request on ordinary initial page load. Late cancelled requests release their own sentinels without reviving a session.

Existing hidden/cache safety pauses rendering and stops camera/audio/tilt. On return, previously tracking users choose resume or fixed view; no automatic camera restart. Invalid calibration opens setup instead. Tracking consent is not persisted. Wenjing default, all16 catalogue entries and original assets remain unchanged.

## Validation and limits

15 pure wake lifecycle tests plus existing application/build suites. Source browser checks exercise real Wenjing, actual UI, inline fallback, successful/rejected/released wake sentinels, fullscreen controls and preference toggle, background and cached-page transitions, explicit tracking recovery and invalid-calibration gate. Inputs for wake locks, fullscreen, visibility/cache and pending camera requests are simulated, not physical Apple/Safari lock-screen validation. Source screenshots reviewed by implementing assistant, not independent review.

First session fixture attempted to write to a not-yet-created documentElement. It was fixed by attaching the same mocked requestFullscreen to Element.prototype. Subsequent interaction assertions completed, but the exact known TFLite initialization INFO arrived on the console error channel. Following existing tracking-refinement tests, that exact line is retained as knownDiagnostics; no other console error is ignored and no interaction assertion/timeout/runtime was weakened.

## Protected publication

Reuse prior publisher only when Gitblob is `6013750f48fff9701271bf833d485e54073c6afa`. Preserve main-only existing production environment, exact site identity, old release/source/app digest, deployment lock, concurrent-publish guard and rollback only of this run's failed deploy. Branch build and browser child processes receive no deployment credentials.

Check all72 local runtime files,70 served resources and2 applied Netlify configurations. Draft then production runs actual remote model/idle/catalogue, display exit/retry/toggle and background/cache explicit-recovery flows. Record outcome in companion-session-publication.json, not inferred from a merged PR. Existing live deployment stays until draft acceptance. Main MetaFlow app, private repo visibility and protected environment settings are unchanged.

Original complete-scene parity, physical Safari/lock-screen/side-face/thermal validation and private-repo deployment-credential cutover remain separate unfinished items.
