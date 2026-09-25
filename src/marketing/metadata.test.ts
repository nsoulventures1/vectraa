import { describe, expect, it } from 'vitest';
import { LANDING_PAGES, currentLandingPage } from './landing';

describe('SEO landing pages', () => {
  it('defines unique paths, titles and descriptions', () => {
    expect(new Set(LANDING_PAGES.map((page) => page.path)).size).toBe(LANDING_PAGES.length);
    expect(new Set(LANDING_PAGES.map((page) => page.title)).size).toBe(LANDING_PAGES.length);
    for (const page of LANDING_PAGES) {
      expect(page.description.length).toBeGreaterThan(80);
      expect(page.benefits).toHaveLength(3);
    }
  });

  it('normalizes trailing slashes', () => {
    expect(currentLandingPage('/png-to-svg/')?.path).toBe('/png-to-svg');
    expect(currentLandingPage('/unknown')).toBeNull();
  });
});
