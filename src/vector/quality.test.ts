import { describe, expect, it } from 'vitest';
import { inspectSvg } from './quality';

describe('inspectSvg', () => {
  it('accepts a simple safe SVG', () => {
    const result = inspectSvg('<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0L10 10Z"/></svg>');
    expect(result.validSvg).toBe(true);
    expect(result.paths).toBe(1);
    expect(result.score).toBeGreaterThan(90);
  });

  it('rejects script content', () => {
    const result = inspectSvg('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    expect(result.validSvg).toBe(false);
    expect(result.score).toBe(0);
  });

  it('rejects event-handler content', () => {
    const result = inspectSvg('<svg xmlns="http://www.w3.org/2000/svg"><path onload="alert(1)" d="M0 0Z"/></svg>');
    expect(result.validSvg).toBe(false);
  });
});
