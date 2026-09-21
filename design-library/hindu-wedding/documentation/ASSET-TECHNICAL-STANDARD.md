# Asset Technical Standard

The logical canvas is 1000 × 1778. Produce full backgrounds at 2160 × 3840 and a 1080 × 1920 delivery variant. Transparent components should be authored at least 2× their largest rendered dimensions, use sRGB, retain clean straight or premultiplied alpha as the pipeline requires, and show no halos.

- Backgrounds: optimized AVIF/WebP, with responsive 1080 and 2160 widths; target ≤600 KB and ≤1.5 MB respectively.
- Transparent raster components: lossless PNG master and optimized WebP delivery; target ≤750 KB per delivery variant.
- SVG: only original, reviewed, sanitized vectors with no scripts, external resources or embedded text that should remain editable.
- Animation: WebM or controlled Lottie where appropriate, a poster frame, and a static reduced-motion alternative; target ≤2 MB for ambient loops and ≤4 MB for a one-time opening.
- Selection card: 540 × 960; thumbnail: 270 × 480. Preserve 9:16 and show the component in a representative safe composition.
- Text: names, dates, venues and body copy remain semantic HTML, never baked into decorative art.

Compression must be visually inspected at 1× and 2× density. Record origin, licence evidence, prompts/source files, creator, versions, alt text and reviewer. Rejected files move outside selectable paths and are marked `REJECTED`; production manifests reference only `APPROVED` versions.
