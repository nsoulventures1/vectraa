import { describe, expect, it } from 'vitest';
import { classifyImageSignals, measureSignals, recommendationConfidence } from './analyzeImage';
import { deltaERgb, type Rgb } from './color';
import { JsVectorEngine } from './JsVectorEngine';
import { flatLogoFixture, illustrationFixture, lineArtFixture, signatureFixture } from './fixtures';
import { DEFAULT_OPTIONS } from './presets';
import type { VectorizeOptions } from './types';

/**
 * Counts measured on these same fixtures with the previous engine
 * (logo pipeline that merged ΔE 29.8 inks, and ImageTracer for the rest).
 */
const BEFORE = {
  logo: { nodes: 704, colours: 1 },
  signature: { nodes: 766 },
  lineArt: { nodes: 424 },
  illustration: { nodes: 7720, paths: 385 },
};

const engine = new JsVectorEngine();

function signalsOf(image: ImageData) {
  return measureSignals(image.data, image.width, image.height, image.width, image.height);
}

function parseColours(svg: string): Rgb[] {
  const found = new Map<string, Rgb>();
  for (const match of svg.matchAll(/(?:fill|stroke)="rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)"/g)) {
    const color = { r: Number(match[1]), g: Number(match[2]), b: Number(match[3]) };
    if (color.r > 245 && color.g > 245 && color.b > 245) continue;
    found.set(`${color.r},${color.g},${color.b}`, color);
  }
  return [...found.values()];
}

async function trace(image: ImageData, options: VectorizeOptions) {
  return engine.vectorizeImageData(image, options);
}

describe('conversion regression', () => {
  it('classifies a flat logo, a signature, line art and an illustration', () => {
    const logo = signalsOf(flatLogoFixture().image);
    const signature = signalsOf(signatureFixture().image);
    const lineArt = signalsOf(lineArtFixture().image);
    const illustration = signalsOf(illustrationFixture().image);
    expect(classifyImageSignals(logo)).toBe('logo');
    expect(classifyImageSignals(signature)).toBe('signature');
    expect(classifyImageSignals(lineArt)).toBe('line-art');
    expect(classifyImageSignals(illustration)).toBe('illustration');
    expect(recommendationConfidence(logo, 'logo')).toBeGreaterThanOrEqual(75);
    expect(recommendationConfidence(signature, 'signature')).toBeGreaterThanOrEqual(75);
    expect(recommendationConfidence(lineArt, 'line-art')).toBeGreaterThanOrEqual(70);
  });

  it('keeps the wordmark colour and replaces the ring with a circle', async () => {
    const fixture = flatLogoFixture();
    const result = await trace(fixture.image, DEFAULT_OPTIONS.logo);
    const colours = parseColours(result.svg);
    expect(result.svg).toContain('<circle');
    expect(colours.length).toBeGreaterThan(BEFORE.logo.colours);
    for (const ink of fixture.inks) {
      const nearest = Math.min(...colours.map((color) => deltaERgb(color, ink)));
      expect(nearest, `missing ink ${ink.r},${ink.g},${ink.b} in ${JSON.stringify(colours)}`).toBeLessThan(8);
    }
    expect(result.quality.nodesApprox).toBeLessThan(BEFORE.logo.nodes);
  });

  it('traces a signature with far fewer nodes than ImageTracer', async () => {
    const result = await trace(signatureFixture().image, DEFAULT_OPTIONS.signature);
    expect(result.quality.nodesApprox).toBeLessThan(BEFORE.signature.nodes * 0.4);
    expect(result.quality.validSvg).toBe(true);
    expect(result.svg).not.toContain('<image');
  });

  it('fits line art to circles and lines instead of dense outlines', async () => {
    const result = await trace(lineArtFixture().image, DEFAULT_OPTIONS['line-art']);
    expect(result.svg).toContain('<circle');
    expect(result.svg).toMatch(/<line\b|<rect\b/);
    expect(result.quality.nodesApprox).toBeLessThan(BEFORE.lineArt.nodes * 0.5);
  });

  it('keeps an illustration’s separate colours and cuts the path count', async () => {
    const fixture = illustrationFixture();
    const result = await trace(fixture.image, DEFAULT_OPTIONS.illustration);
    const colours = parseColours(result.svg);
    for (const ink of fixture.inks) {
      const nearest = Math.min(...colours.map((color) => deltaERgb(color, ink)));
      expect(nearest, `missing ${JSON.stringify(ink)} in ${JSON.stringify(colours)}`).toBeLessThan(12);
    }
    expect(result.quality.paths).toBeLessThan(BEFORE.illustration.paths / 2);
    expect(result.quality.nodesApprox).toBeLessThan(BEFORE.illustration.nodes / 2);
  });
});
