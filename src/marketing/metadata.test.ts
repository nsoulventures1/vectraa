import { describe, expect, it } from 'vitest';
import { INFO_PAGES } from './info';
import { LANDING_PAGES, currentLandingPage, inlineLinkSegments } from './landing';
import { GUIDE_PAGES, currentGuidePage } from './guides';

describe('SEO landing pages', () => {
  it('defines unique paths, titles and descriptions', () => {
    expect(new Set(LANDING_PAGES.map((page) => page.path)).size).toBe(LANDING_PAGES.length);
    expect(new Set(LANDING_PAGES.map((page) => page.title)).size).toBe(LANDING_PAGES.length);
    for (const page of LANDING_PAGES) {
      expect(page.title).toContain('Vectraa');
      expect(page.description.length).toBeGreaterThan(80);
      expect(page.benefits).toHaveLength(3);
    }
    for (const path of ['/signature-to-svg', '/png-to-svg-for-cricut', '/image-to-vector', '/png-to-svg-no-upload', '/convert-logo-to-svg']) {
      expect(LANDING_PAGES.some((page) => page.path === path)).toBe(true);
    }
  });

  it('normalizes trailing slashes', () => {
    expect(currentLandingPage('/png-to-svg/')?.path).toBe('/png-to-svg');
    expect(currentLandingPage('/unknown')).toBeNull();
  });

  it('uses the requested titles, descriptions, headings and leads on the format landers', () => {
    const allowed = new Set([
      '/',
      ...LANDING_PAGES.map((page) => page.path),
      ...GUIDE_PAGES.map((page) => page.path),
      ...INFO_PAGES.map((page) => page.path),
    ]);
    const expected = [
      {
        path: '/image-to-svg',
        title: 'Image to SVG Converter — Free Image to Vector, No Upload | Vectraa',
        description: 'Free image to SVG and vector image converter that runs in your browser. Vectraa traces JPG, PNG and WebP into real SVG paths — no upload, no account and no watermark.',
        eyebrow: 'FREE IMAGE TO SVG CONVERTER',
        heading: 'Image to SVG — a free vector image converter.',
        lead: 'Convert an image to SVG or a vector in your browser, for free. Vectraa is an image-to-vector converter that traces JPG, PNG and WebP into genuine SVG paths. Your file is not uploaded, and the download has no watermark.',
        links: 'Need a specific format? Try the [JPG to SVG](/jpg-to-svg), [PNG to SVG](/png-to-svg) or [WebP to SVG](/webp-to-svg) converter, or read the guides on [converting a logo](/guides/convert-logo-to-svg) and [reducing SVG nodes](/guides/reduce-svg-nodes).',
      },
      {
        path: '/jpg-to-svg',
        title: 'JPG to SVG Converter — Free JPG to Vector Online | Vectraa',
        description: 'Convert a JPG to SVG or a vector online, free in your browser. Vectraa traces JPEG images into editable SVG paths with no upload, no account and no watermark.',
        eyebrow: 'FREE JPG TO SVG CONVERTER',
        heading: 'JPG to SVG — a free JPG to vector converter.',
        lead: 'Convert a JPG or JPEG to SVG online, in your browser. This free JPG-to-vector converter does not upload your image and does not add a watermark to the SVG.',
        links: 'For other formats, use the [image to SVG](/image-to-svg) or [PNG to SVG](/png-to-svg) converter. If the JPG is a logo, see [how to convert a logo to SVG](/guides/convert-logo-to-svg).',
      },
      {
        path: '/webp-to-svg',
        title: 'WebP to SVG Converter — Free, No Upload | Vectraa',
        description: 'Convert WebP to SVG online, free in your browser. Vectraa traces WebP graphics into scalable SVG paths with no upload, no account and no watermark.',
        eyebrow: 'FREE WEBP TO SVG CONVERTER',
        heading: 'WebP to SVG converter.',
        lead: 'Convert WebP to SVG in your browser, for free. The image stays on your device — no upload and no watermark on the download.',
        links: 'You can also convert a [PNG](/png-to-svg), [JPG](/jpg-to-svg) or any [image to SVG](/image-to-svg). After tracing, [reduce SVG nodes](/guides/reduce-svg-nodes) if the file is too complex.',
      },
      {
        path: '/png-to-svg',
        title: 'PNG to SVG Converter — Free, No Upload | Vectraa',
        description: 'Convert PNG to SVG online, free in your browser. Vectraa traces transparent PNG artwork into genuine SVG paths with no upload, no account and no watermark.',
        eyebrow: 'FREE PNG TO SVG CONVERTER',
        heading: 'PNG to SVG converter.',
        lead: 'Convert a PNG to SVG in your browser, for free. Transparency is preserved, the file is not uploaded, and the download has no watermark.',
        links: 'Using the SVG for print or cutting? Read [PNG vs SVG for printing](/guides/png-vs-svg-for-printing) and [how to prepare an SVG for Cricut and laser cutting](/guides/prepare-svg-for-cricut-laser-cutting), or try [PNG to SVG for Cricut](/png-to-svg-for-cricut).',
      },
    ];
    for (const copy of expected) {
      const page = LANDING_PAGES.find((item) => item.path === copy.path);
      expect(page).toMatchObject(copy);
      const written = [...copy.links.matchAll(/\[([^[\]]+)\]\((\/[^)\s]*)\)/g)].map((match) => match[2]);
      const rendered = inlineLinkSegments(copy.links).filter((segment) => segment.href).map((segment) => segment.href);
      expect(rendered).toEqual(written);
      expect(inlineLinkSegments(copy.links).map((segment) => segment.text).join('')).toBe(copy.links.replace(/\[([^[\]]+)\]\((\/[^)\s]*)\)/g, '$1'));
      for (const href of written) expect(allowed.has(href), href).toBe(true);
    }
  });
});

describe('search-focused guides', () => {
  it('defines unique, substantial pages with relevant converter links', () => {
    expect(new Set(GUIDE_PAGES.map((page) => page.path)).size).toBe(GUIDE_PAGES.length);
    expect(GUIDE_PAGES).toHaveLength(4);
    for (const page of GUIDE_PAGES) {
      expect(page.path.startsWith('/guides/')).toBe(true);
      expect(page.description.length).toBeGreaterThan(100);
      expect(page.title).toContain('Vectraa');
      expect(page.sections.length).toBeGreaterThanOrEqual(4);
      expect(page.faqs.length).toBeGreaterThanOrEqual(3);
      expect(LANDING_PAGES.some((landing) => landing.path === page.relatedConverter.path)).toBe(true);
    }
  });

  it('normalizes guide trailing slashes', () => {
    expect(currentGuidePage('/guides/convert-logo-to-svg/')?.path).toBe('/guides/convert-logo-to-svg');
    expect(currentGuidePage('/guides/unknown')).toBeNull();
  });
});
