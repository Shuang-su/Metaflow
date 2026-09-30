# MF97 local Studio source

Editable trial snapshot of the active MF58 Studio source at `5aa9af46`, copied from its tracked Git tree. The original MF58 worktree remains unchanged. The upstream source and bundled compatibility implementations retain their licenses and notices.

MF97 adds a narrow `@Nav 可导览` annotation metadata toggle, known-field compatibility warnings, and targeted roundtrip tests. It imports the same pure capability/merge helper as the Viewer. Annotation camera validation and the public project/settings format remain unchanged; files without camera are explicitly rejected.

Build output and dependencies are excluded task caches. This directory has not replaced the production Editor, and its presence does not establish an Editor release or version adoption. Studio save/export/reopen browser evidence uses a synthetic 600-point PLY and is distinct from full exhibition authoring acceptance. Commands and scope are in `../mf97-viewer-trial/README.md`.
