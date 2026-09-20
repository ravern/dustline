# Environment materials

The eight tiles in `public/textures/` were generated with OpenAI's built-in image generation tool. The complete prompt for each material is in [prompts.json](prompts.json). These are new albedo images, not extracted from another game.

Each image is resized to 1024 × 1024 and encoded with `cwebp -q 83 -m 6`. Together they occupy 2,383,026 bytes. WebP reduces download size; it is not GPU texture compression. A loaded 1K RGBA tile with mipmaps occupies roughly 5.3 MiB on the GPU. Tiles load on demand, share one texture per material across maps, and remain in a bounded eight-entry cache.

| Tile | Coverage per repeat | Use |
| --- | --- | --- |
| sand | 3 m | Yard hardpack, Derrick earth |
| concrete | 2 m | Walls, barriers, industrial floors |
| asphalt | 3 m | Roads, airport apron |
| steel | 1 m | Painted panels, containers, machinery |
| wood | 1 m | Crates, house siding |
| grass | 2 m | Homestead lawn |
| terrazzo | 2 m | Airport concourse |
| fabric | 0.5 m | Aircraft seats, carpet, furniture |

`src/surface-materials.ts` uses sRGB albedo, mipmaps, anisotropic filtering, and a single planar texture lookup per face. Coordinates come from world position after the instance transform, so large walls and narrow boxes retain the same texel scale. The steel color modulation is restrained to preserve the authored paint palette. High quality adds subtle bump detail from the same tile; Performance keeps the albedo but skips those extra bump samples. Animated character and weapon assets retain their existing authored UVs and textures.

Implementation references: [Three.js textures](https://threejs.org/docs/pages/Texture.html), [instanced rendering](https://threejs.org/docs/pages/InstancedMesh.html), and [static transform controls](https://threejs.org/docs/pages/Object3D.html).
