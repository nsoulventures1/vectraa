import { describe, expect, it } from 'vitest';
import { cleanSvgForExport, svgFilename } from './exportSvg';

describe('SVG export', () => {
  it('removes comments, metadata and data attributes', () => {
    const svg = '<svg data-test="x"><!-- hello --><metadata>private</metadata><path data-id="1" d="M0 0Z" /></svg>';
    const clean = cleanSvgForExport(svg);
    expect(clean).not.toContain('hello');
    expect(clean).not.toContain('metadata');
    expect(clean).not.toContain('data-test');
    expect(clean).toContain('<path');
  });

  it('creates safe predictable filenames', () => {
    expect(svgFilename('My Logo FINAL.jpg')).toBe('My-Logo-FINAL.svg');
    expect(svgFilename('brand.png', '-rescued')).toBe('brand-rescued.svg');
  });
});
