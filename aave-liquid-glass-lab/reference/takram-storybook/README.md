# Takram Storybook reference

This directory is a pinned, read-only reference for the information architecture and Storybook configuration used by Takram Design Engineering's `three-geospatial` project.

- Source: https://github.com/takram-design-engineering/three-geospatial
- Commit: `b012ad06d858fc035d88aacfd73f092f93c994e4`
- License: MIT, preserved in `LICENSE`
- Local snapshot: `source/storybook/` (configuration, `src/`, types and project files)
- Runtime reference: `runtime/story.png`, `runtime/docs.png`, and `runtime/page-structure.json`

The snapshot is used only to study README/MDX organization, story/component separation, fullscreen examples, theming, and permanent addon-panel suppression. Its Three.js examples and runtime packages are not imported by the Web Liquid Glass Storybook.

The upstream `storybook/assets/` directory is intentionally excluded because it contains hundreds of megabytes of geospatial demo binaries rather than Storybook source. The pinned source commit and runtime screenshots are sufficient for this research use.

The Liquid Glass implementation continues to use the Aave live/origin evidence under `../origin/` as its technical source of truth.
