# Vectraa architecture — V1

## Goal

Ship a genuinely useful, free raster-to-vector web application without requiring a paid conversion backend.

## Processing boundary

Basic JPG/PNG/WebP conversion is local-first:

1. Browser validates the file.
2. Browser decodes it locally.
3. Lightweight analysis chooses/suggests a preset.
4. CPU-heavy tracing executes away from the main UI thread.
5. Vectraa validates the returned SVG before rendering it.
6. Structural quality metrics are computed.
7. User previews and downloads the SVG.
8. Object URLs, decoded bitmaps and worker resources are released.

No normal conversion requires a Vectraa image-storage service.

## Vector engine boundary

UI code depends only on the `VectorEngine` interface. The first adapter will target the browser/WASM VTracer ecosystem. This avoids coupling product UX to one tracing implementation.

## Safety

Generated SVG is treated as untrusted markup until inspected. The application must never inject arbitrary uploaded SVG into the page. Raster input is restricted to supported MIME types and bounded sizes.

## Future AI

Describe → Vector is intentionally outside the V1 core processing path. Its provider will sit behind a separate replaceable interface so paid APIs, self-hosted generation, or native vector models can be evaluated later without contaminating free raster conversion economics.

## Hosting

The V1 application compiles to static assets. This keeps deployment compatible with free static hosting and means tracing compute scales with users' devices rather than our server bill.
