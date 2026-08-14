import { describe, expect, it } from 'vitest';
import { assessPurpose, PURPOSES } from './purpose';

describe('production-purpose guidance', () => {
  it('contains explicit safety guidance for machine-adjacent workflows', () => {
    expect(PURPOSES.find((item) => item.id === 'laser')?.disclaimer).toContain('Not machine-certified');
    expect(PURPOSES.find((item) => item.id === 'embroidery')?.disclaimer).toContain('not an embroidery machine file');
  });

  it('flags likely open paths for cutting workflows', () => {
    const svg = '<svg><path d="M0 0 L10 10"/><path d="M0 0 L5 5 Z"/></svg>';
    const assessment = assessPurpose(svg, 'laser');
    expect(assessment.warnings.some((warning) => warning.includes('may be open'))).toBe(true);
  });

  it('flags excessive embroidery colors', () => {
    const paths = Array.from({ length: 13 }, (_, i) => `<path fill="#0000${String(i).padStart(2, '0')}" d="M0 0Z"/>`).join('');
    expect(assessPurpose(`<svg>${paths}</svg>`, 'embroidery').warnings.some((warning) => warning.includes('colors'))).toBe(true);
  });
});
