# Vectraa Conversion Benchmark Protocol

Vectraa must be judged on more than whether an SVG opens. A useful vector should preserve the artwork while remaining reasonably editable, compact, and fast to produce.

## Benchmark families

Maintain representative source images for these five families:

1. Logo — flat marks, text-like geometry, 2–8 colors, transparent and solid backgrounds.
2. Signature — dark handwriting on light paper, including phone-camera noise.
3. Line art — monochrome icons, sketches, technical outlines, and thin strokes.
4. Illustration — moderate color count, smooth shapes, gradients flattened into regions.
5. High detail — textured artwork and difficult photographic sources used to expose engine limits.

Do not optimize only for easy examples. Each family should eventually include clean, compressed, low-resolution, anti-aliased, and noisy cases.

## Measurements

Every benchmark records:

- valid/safe SVG status
- Vectraa quality score
- path count
- approximate node count
- SVG byte size
- conversion time
- visual fidelity against the raster source (future browser-render comparison)

`assessVectorResult` combines the structural metrics into a 0–100 vector-health score. Structural health is not a substitute for visual fidelity; it prevents us from improving appearance by creating unusably huge vectors.

## Initial release gates

For ordinary logo, signature, and line-art fixtures:

- 100% safe, valid SVG output
- no embedded raster images
- no scripts or external resources
- vector-health target >= 80
- no unexplained catastrophic path/node growth between releases

For illustration and high-detail fixtures, thresholds are tracked separately because legitimate complexity is higher.

## Tuning rule

Preset changes must improve the benchmark set as a whole. Never tune a preset around one attractive example if it causes regressions across its family.

## Next benchmark milestone

Add browser-rendered source-vs-SVG comparison at a normalized resolution. This will let Vectraa measure pixel-level fidelity alongside structural health and is the prerequisite for automatic multi-pass preset selection.
