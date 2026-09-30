# Studio compatibility source

Read-only compatibility implementations from MF-58 `5aa9af46`, MIT. Viewer5.20 uses DOM annotation hotspots and lacks Studio capture-time hooks; importing its new runtime would regress Studio rendering. This snapshot stays internal to Studio and does not replace any Viewer5.20 code. Only background-gradient type import points at current schema.

annotation.ts SHA-256 8a433a156ea28616134e8bb30a25a987f6c1cd93211935f6bfde2d1d3b26fbe9
hotspot-drawing.ts SHA-256 fecafafb5ee2800463fad52e04d2cd5b1f3316663288b4c05ec8bac1b2407ec4
background-gradient.ts SHA-256 60d94687f7803b2b0a69deb480bb0e511575e07e653df1e7818067af9aa8fbda
gsplat-reveal-radial.ts SHA-256 255fd48ec8ffc6d4f9cf5564318c65d2bd48b402ebe15764fcb6eccd94b76c4b
