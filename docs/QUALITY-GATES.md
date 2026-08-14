# Vectraa quality gates

A stage does not advance merely because it renders or produces an SVG.

## Gate 1 — Vector engine

Must pass before the public converter UI is considered complete:

- Safe SVG structure for all successful conversions.
- No scripts, event handlers or active external content in rendered output.
- Representative tests for: flat logo, multicolor logo, icon, signature, line art, sketch, transparent PNG, noisy JPEG, text-heavy artwork, illustration and complex photographic input.
- No silent success for an input class the engine cannot represent faithfully.
- Output opens at multiple scales without raster embedding masquerading as vector output.
- Path/node complexity is measured and surfaced internally.
- Browser memory is released after conversion.
- Failed conversion leaves the original file untouched and provides a useful error.

## Gate 2 — Core UX

- Upload, drag/drop and supported paste flow.
- Mobile and desktop layouts.
- Original/vector preview.
- Zoom comparison.
- Presets and bounded advanced controls.
- Download produces a valid `.svg` file.
- No account and no watermark for basic conversion.

## Gate 3 — Performance

- Heavy tracing does not freeze the main UI thread.
- Large-file limits are enforced before expensive processing.
- Static application remains deployable on a free hosting tier.

## Gate 4 — Security and privacy

- Input type/size validation.
- SVG active-content rejection/sanitization.
- No basic-conversion image upload to Vectraa servers.
- No artwork in analytics or logs.

## Gate 5 — Production

- Build and tests pass in CI.
- Mobile smoke tests pass.
- Lighthouse/performance review completed.
- SEO essentials and legal/privacy copy accurately match implementation.
- Deployment is reproducible from the repository.
