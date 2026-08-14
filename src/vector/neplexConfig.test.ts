import { describe, expect, it } from 'vitest';
import { DEFAULT_OPTIONS } from './presets';
import { toNeplexConfig } from './neplexConfig';

describe('toNeplexConfig', () => {
  it('uses binary tracing for signatures', () => {
    expect(toNeplexConfig(DEFAULT_OPTIONS.signature).binary).toBe(true);
  });

  it('keeps logos in color mode and cutout composition', () => {
    const config = toNeplexConfig(DEFAULT_OPTIONS.logo);
    expect(config.binary).toBe(false);
    expect(config.cutout).toBe(true);
  });

  it('gives high detail more fitting iterations than logo default', () => {
    expect(toNeplexConfig(DEFAULT_OPTIONS['high-detail']).maxIterations)
      .toBeGreaterThan(toNeplexConfig(DEFAULT_OPTIONS.logo).maxIterations);
  });
});
