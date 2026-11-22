import { describe, expect, it } from 'vitest';
import { LANDING_PAGES, currentLandingPage } from './landing';
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
