# MF-81 — 12 approved resources, Viewer 5.19.3

Issue: https://github.com/Shuang-su/Metaflow/issues/81

## Contract
Publish the user-approved three Mangzhong captures and nine SZTUCampus Club Fair 2026 Fall scenes. Preserve existing 87 resource objects and routes. The public index remains schema 1.2; reuse existing `aliases`, `meta`, `files`, and `category` fields. No public tags or runtime behavior changes.

ACG directories remain `data/ACG/SZTUCCF260919/<source-number>_700101_RH8603/`. Every canonical and short route below has prefix `/acg/sztuccf260919/`.

| Source | Chinese title | Canonical suffix | Alias suffix |
|---|---|---|---|
| A003C0005 | Fate/stay night 间桐樱1 | fate_stay_night-sakura_matou-1 | sakuramatou1 |
| A003C0006 | Fate/stay night 间桐樱2 | fate_stay_night-sakura_matou-2 | sakuramatou2 |
| A003C0010 | EVA 明日香 · 赛车风服装 | evangelion-asuka-racing_outfit | asuka |
| A003C0011 | 明日方舟 安洁莉娜 | arknights-angelina | angelina |
| A003C0012 | 颂乐人偶 八幡海铃 · Timoris | ave_mujica-timoris | timoris |
| A003C0013 | 明日方舟 W | arknights-w | w |
| A003C0023 | 明日方舟 能天使 | arknights-exusiai | exusiai |
| A003C0024 | 明日方舟 拉普兰德 | arknights-lappland | lappland |
| A003C0025 | 酒红色蕾丝 Lolita | lolita-burgundy_lace | lolita |

ACG IDs are `sztuccf260919-<lowercase-source-number>`. Device and capture date are null. Event identity does not assert capture date. Gothic style and other unconfirmed tags are omitted.

Mangzhong directories are `data/Animals/Cats/mangzhong/<minute-id>/`, routes `/animals/cats/mangzhong/<minute-id>`, IDs `mangzhong-<minute-id>`: source 猫IMG_0803 → 2609160002, 猫IMG_0807 → 2609160028, 猫IMG_0808 → 2609160031. Titles preserve the approved 2026-09-16 hour/minute; no seconds or timezone inferred. Device null.

Each package includes scene.sog, settings.json, walk.voxel.json/bin, cover-4096.webp, plus environment.compressed.ply for ACG. Original settings camera, animation, background and post-processing remain unchanged; only the copied ACG environmentUrl is repaired to the published absolute data path. No model or cover transformation on import. Covers are 4096² static lossless WebP rendered at source camera/frame 0. Source exports and previous previews are immutable.

## Acceptance
99 resources; 12 exact approved mappings; canonical/alias collision checks; WebP discovery without changing JPG/PNG precedence among legacy files; source hashes and 9 valid environment references; existing 87 entries unchanged; original camera preserved. Verify local files, release metadata, build, and all 12 actual browser scene loads. After publication re-read production metadata and uploaded file hashes, canonical and alias routing. Static cover crop may clip head/feet in wide frames under original camera; this is accepted source framing, not dynamic-cover tooling.

## Release and rollback
PATCH 5.19.3, product SHA followed by release-record commit, append-only Ledger and Version History. Netlify existing production site; preserve Editor payload. Previous 5.19.2 deploy `6a8087d8ee37ee534090c5a2` is rollback target. Retain the previous deployment and record any rollback as a new event.
