import { describe, expect, it } from 'vitest';
import { containsForbiddenSvgContent, sanitizeGeneratedSvg } from './sanitizeSvg';

describe('SVG sanitization', () => {
  it('removes active and embedded content', () => {
    const dirty = '<svg><script>alert(1)</script><foreignObject><div>bad</div></foreignObject><image href="https://evil.test/a.png"/><path onclick="bad()" d="M0 0Z"/></svg>';
    const clean = sanitizeGeneratedSvg(dirty);
    expect(clean).not.toContain('<script');
    expect(clean).not.toContain('foreignObject');
    expect(clean).not.toContain('<image');
    expect(clean).not.toContain('onclick');
    expect(containsForbiddenSvgContent(clean)).toBe(false);
  });

  it('removes dangerous links and javascript protocols', () => {
    const clean = sanitizeGeneratedSvg('<svg><a href="javascript:alert(1)"><path d="M0 0Z"/></a></svg>');
    expect(clean.toLowerCase()).not.toContain('javascript:');
  });

  it('preserves normal vector geometry', () => {
    const safe = '<svg xmlns="http://www.w3.org/2000/svg"><path fill="#123456" d="M0 0L10 10Z"/></svg>';
    expect(sanitizeGeneratedSvg(safe)).toBe(safe);
  });
});
