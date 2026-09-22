# Performance Notes

| Budget | Recommendation |
|---|---:|
| First-load poster artwork | 250–450 KB AVIF/WebP |
| Individual later scene | 180–450 KB at rendered width |
| Transparent layer | 120–500 KB WebP/PNG as needed |
| Initial critical payload | ≤1.2 MB excluding fonts |
| Lazy-loaded still total | ≤4.5 MB typical invite |
| Ambient WebM delivery | 1.2–1.8 MB each (achieved) |
| Ambient MP4 fallback | 1.8–2.4 MB each (achieved) |
| One-time door animation | 1.5 MB WebM / 2.0 MB MP4 (achieved) |
| Total video fetched initially | 0 MB; poster first |

Generate responsive 540, 828, 1080, and 1440/2160 derivatives after approval. Prefer AVIF with WebP fallback for opaque scenes; retain PNG masters and use alpha WebP where browser support permits. Load the next scene near viewport, not every scene at start. Videos load only near their scene and only when motion/data preferences allow. On `save-data`, poor connection, autoplay failure, or reduced motion, use static posters. Self-host subsetted WOFF2 fonts and preload only the display face actually visible above the fold.

The five approved videos must never download together on first load. Preload only the opening poster; request the opening video after interaction readiness. Lazy-load ceremony and finale videos with an intersection margin near their scenes. If all five MP4 fallbacks were downloaded, they would total about 10.2 MB; normal navigation should avoid that cost.
