# Vectraa

**Anything → Vector.**

Vectraa is a privacy-first AI vector studio. The first public release focuses on free local raster-to-vector conversion for JPG, PNG and WebP files, with a roadmap for Logo Rescue, Sketch → Vector, Describe → Vector and production-oriented SVG optimization.

## Product principles

- Basic conversion should run on the user's device whenever practical.
- Uploaded artwork should not be stored for basic conversion.
- Free conversion must be genuinely useful and unwatermarked.
- Vector output quality matters more than feature count.
- The vector engine is isolated behind an adapter so it can improve without rewriting the product.
- Vectraa must remain deployable on a zero-cost static hosting tier for the MVP.

## Initial stack

- React + TypeScript + Vite
- Browser-side image analysis and vectorization
- Web Worker boundary for CPU-heavy tracing
- SVG sanitization and structural quality checks
- Vitest for unit tests
- Playwright-ready E2E structure
- Static production output for Cloudflare Pages

## Status

Foundation build in progress.