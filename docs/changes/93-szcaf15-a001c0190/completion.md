# MF-93 — SZCAF15 Tribbie / Tribios publication

Status: **published and production observation passed**. Implements the user-approved conversion, review and production publication plan. Product PR [#94](https://github.com/Shuang-su/Metaflow/pull/94); release-record PR [#95](https://github.com/Shuang-su/Metaflow/pull/95).

## Published result

- Viewer **5.20.1**, index schema **1.2**, **100 resources**, **25 SZCAF15**; no Viewer runtime or Editor behavior change.
- User-confirmed **崩坏：星穹铁道 缇宝 / Tribbie / Tribios**, ID `szcaf15-a001c0190`, directory `data/ACG/SZCAF15/A001C0190_260726_PQWJ/`.
- [Canonical route](https://metaflow.shuang-su.com/acg/szcaf15/honkai_star_rail-tribbie); aliases [tribbie](https://metaflow.shuang-su.com/acg/szcaf15/tribbie), [tribios](https://metaflow.shuang-su.com/acg/szcaf15/tribios).
- Full subject LOD0 865,623-point SOG, independently generated subject voxel, separate 55,029-point compressed PLY environment, confirmed-camera settings and 4096×4096 static lossless WebP. Rotation -90,0,0; converter 3.6.4; no decimation, crop or extra scale.
- Product SHA `ff201e5b2e09184395605fc1e255f64db0c7210f`; release-record commit/tag target `6e95a914da25f74041bbecb24ba1bd60a1bc22f8`; [viewer-v5.20.1 Release](https://github.com/Shuang-su/Metaflow/releases/tag/viewer-v5.20.1).
- Actual Netlify production deployment **`6abc7de6a1ea57eba3620225`**, promoted unchanged from the verified candidate at **2026-09-30T03:17:05.416Z**. CLI deploy API has `commit_ref: null`; the embedded runtime, index and analytics report **5.20.1 / ff201e5**.

## Acceptance evidence

| Area | Actual result |
| --- | --- |
| Conversion | SOG ZIP/CRC and decoded point count; compressed PLY decoded point count; voxel header/bin length, orientation and visual overlap passed |
| Source protection | 48 source files unchanged; 10,202 existing data entities and 31 Editor files matched SHA-256 baselines |
| Camera and cover | User position/forward/FOV 65 preserved; native captureFrame 4096²; one VP8L frame; decoded pixels equal PNG intermediate; 1:1/16:9/9:16 framing compared |
| Catalog | New ID/route/aliases collision-free, including separator-normalized paths; all 99 existing resource objects exactly unchanged by route; legacy duplicate IDs preserved |
| Engineering | `validate_data.py --check-files`; five Python publication/data tests; ten event-route/version tests; final tag's eight version-history tests; Node 20.19.0 typecheck and production build; Git diff checks |
| Browsers | Chromium WebGL/WebGPU/mobile and WebKit WebGL desktop/mobile: 5/5; environment/collision/reset verified on formal route; settled scene visually inspected |
| Interaction | Synthetic animation advances; first active exit enters orbit; grounded walking and reset return work; no script errors |
| Candidate | 507 HTTP route/asset checks; six new SHA-256 downloads; canonical route, two aliases, old SZCAF15 resource and streamed Dayun rendering passed |
| Production | 507 HTTP checks, six new file SHA-256 downloads, both alias first frames and three representative browser sessions passed; actual analytics POSTs 200 with 5.20.1 / ff201e5 context and one startup/first-frame/summary per session |
| Observation | 2026-09-30T03:17:34.414Z → 2026-09-30T03:32:37.739Z (903.3s), 26 periodic checks, two continuously open scenes (Tribbie and Dayun); zero script/HTTP errors or lost contexts; analytics responses 200, startup/first-frame/summary each exactly once per session. |

Detailed conversion parameters, camera and output hashes: [review](review.md). Reproducible scripts, manifests, rendered comparisons, HTTP reports and browser evidence are retained in project `.codex-work/resource-review-szcaf15-a001c0190/`.

## Deviations and limitations

- User naming replaces the earlier Trianne visual proposal. Date 2026-07-26 remains inferred from the source directory; equipment is unknown; tags remain review-only and no public schema field was added. Costume wording is not an official skin attribution.
- First build used shell-default Node 26 arm64; switching PATH to required Node 20.19.0 x64 resolved the mismatch without dependency changes. First interaction harness paused the animation via scrubTo, then incorrectly expected the active-exit policy; resuming before Escape validated the documented behavior without a product change.
- The candidate origin is intentionally outside the deployed analytics allowlist. Candidate analytics POST receipt check failed on CORS. Paired existing-production POSTs returned 200. No Supabase origin policy, function, secret or database was modified. Production endpoint configuration was checked before promotion; actual production POST receipt/build/duplicate checks were performed after promotion.
- Mobile tests use browser emulation; no physical mobile or XR headset validation. Full Viewer runtime suite was not rerun for this resource-only change; targeted data, route, version, build and browser checks cover the changed scope. Implementer self-review, not independent review.
- Existing Dayun malformed streamed metadata and the accepted upstream LOD memory increment remain unchanged; this resource release does not claim to repair or rebenchmark them.

## Rollback and local integration

Rollback target remains the verified 5.20.0 deployment `6ab9587c6a912037fe9fa43e`. No rollback was required.

Local integration follows merging this completion record. The final merge SHA and preservation result are posted on MF-93. Baseline local main `6590c6e1f6cd08e6f53dc6f05cb7e2f74a107787` is protected by `codex/mf-93-main-before-sync`; preserve its 19 unique commits, Aave tree `21866b204ccfd87690cdec7cf840c74a97505cd3`, and the untracked Swiftgram directory (82,602 files).
