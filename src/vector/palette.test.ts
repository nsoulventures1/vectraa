import { describe, expect, it } from 'vitest';
import { deltaERgb } from './color';
import { flatLogoFixture } from './fixtures';
import { learnSeparatedPalette } from './palette';

describe('separated palette', () => {
  it('keeps a near-black wordmark distinct from a dark brand green', () => {
    const { image, inks } = flatLogoFixture();
    const palette = learnSeparatedPalette(image, 8);
    expect(palette.length).toBeGreaterThanOrEqual(2);
    for (const ink of inks) {
      const nearest = Math.min(...palette.map((color) => deltaERgb(color, ink)));
      expect(nearest, `missing ${ink.r},${ink.g},${ink.b} in ${JSON.stringify(palette)}`).toBeLessThan(8);
    }
  });
});
