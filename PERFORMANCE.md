# Performance verification

The browser harness creates a real 32-player room on Yard, Homestead and Airfield, then sweeps the camera through 360 degrees in both graphics settings. An unmeasured sweep warms textures and shaders. It records renderer draw calls/triangles, received WebSocket bytes, heap size, and CDP `threadTicks` task/script CPU time. CPU milliseconds per second describe main-thread utilization, not GPU time or end-to-end frame latency.

```sh
npm run build
npm start
DUSTLINE_URL=http://localhost:3000 DUSTLINE_BENCH_LABEL=current npm run test:performance-browser
```

Results and screenshots go to ignored `test-results/performance/<label>/`. `DUSTLINE_BENCH_MAPS=yard` selects a smaller run; `DUSTLINE_BENCH_PROFILE=1` saves Chrome CPU profiles. Avoid simultaneous browser tests when comparing builds. Real spawn selection changes which actors are nearby, so repeat runs and retain individual results rather than promising a universal FPS gain.

## Reference comparison

An instrumented Chrome desktop run at 1440 × 900, device scale 1, compared the implementation with commit `3ef0449`. Both versions stayed at the display's 60 FPS cap. The warmed comparison averaged 55% fewer triangles, 18% fewer draw calls and 59% fewer received bytes. Aggregate main-thread CPU fell 11%; a separate paired run measured 23%. Individual CPU results were mixed in Performance mode, despite substantially lower geometry cost.

| Map / quality | Triangles before → after | CPU ms/s before → after |
| --- | ---: | ---: |
| Yard / High | 703,314 → 478,728 | 248 → 155 |
| Yard / Performance | 277,699 → 131,203 | 127 → 133 |
| Homestead / High | 353,974 → 126,200 | 138 → 129 |
| Homestead / Performance | 219,543 → 61,493 | 109 → 124 |
| Airfield / High | 337,935 → 93,501 | 140 → 131 |
| Airfield / Performance | 206,642 → 46,344 | 121 → 116 |

The main changes are genuine distant geometry (1,038 rather than 14,356 triangles per soldier), one skeleton per actor, retained LOD/weapon variants, cached joint references, pooled shot effects, static world transforms, shared material tiles, indexed snapshot lookups, cached minimap geometry, and changed-only HUD updates. Spatial collision queries retain original box order, with full-scan fallback after a contact moves the body. Regression tests compare movement, ray hits and grenade bounces against full scans, including mutable map geometry.

The transport negotiates self-contained, lossless compact snapshots while retaining legacy JSON support. Its mixed-client tests compare same-tick snapshots exactly through events, stalls and reconnects; no unreliable delivery or lossy position compression was introduced.

These optimizations follow the engine's existing capabilities: [Three.js instancing](https://threejs.org/docs/pages/InstancedMesh.html), [static transform controls](https://threejs.org/docs/pages/Object3D.html), and [texture filtering/mipmaps](https://threejs.org/docs/pages/Texture.html). They improve the existing WebGL game without requiring an engine migration or WebGPU-only hardware.
