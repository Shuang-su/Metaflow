# Metaflow Viewer LOD Migration Validation Checklist

## Scope

This checklist validates the dual-path LOD migration in metaflow-viewer while keeping:

- legacy SOG compatibility
- streaming JSON support
- progress + status dual-channel semantics
- first-frame and timeout controls
- XR and existing UI behavior

## Preconditions

- Branch: feature/lod-migration-and-versioning
- Build command:
  - cd metaflow-viewer
  - npm run build
- Viewer state fields available:
  - loadingMode
  - loadingStage
  - loadingConflict
  - loadingStatus
  - progress

## Scenario A: Legacy SOG

Input:
- Traditional SOG resource without streaming JSON structural fields

Expected:
- loadingMode = legacy-sog
- loadingStage transitions include legacy-lod-loading
- progress/status dual-channel updates are visible
- hqMode updates splat budget
- retinaDisplay updates pixel ratio only
- firstFrame event fires and loading reaches complete

## Scenario B: Streaming JSON

Input:
- JSON resource with streaming structure fields (lods/levels/chunks/nodes/octree/meta/stream)

Expected:
- loadingMode = streaming-json
- loadingStage transitions include stream-schedule and stream-loading
- hqMode + retinaDisplay both influence streaming budget
- retinaDisplay still controls pixel ratio
- firstFrame event fires and loading reaches complete

## Scenario C: Subject + Environment

Input:
- environment + main model pair

Expected:
- environment stage appears before detect/download of the main model
- status text remains continuous (no empty state)
- final readyToRender and loaded become true

## Scenario D: Detection Conflict

Input:
- JSON where name-based and structure-based detection disagree

Expected:
- loadingConflict = true
- status text includes [冲突] prefix
- console warning logs filename and decision
- decision uses structure-first rule

## Timeout Behavior

Expected:
- sorter timeout sets loadingStage = timeout before forcing first frame
- LOD frame-ready timeout sets loadingStage = timeout before forcing first frame
- timeout path still resolves to complete without stuck loading UI

## Regression Safety

- XR entry/exit should still reconfigure camera as before
- Existing loading UI animation behavior should remain unchanged
- Existing style system should not be altered by migration

## Release Gate

A release candidate is acceptable only if all scenarios A-D pass and no build/type errors are present.
