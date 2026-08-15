import { describe, expect, it } from 'vitest';
import { browserSupportMessage, detectBrowserCapabilities } from './capabilities';

describe('browser capability diagnostics', () => {
  it('reports a complete supported environment', () => {
    const scope = {
      WebAssembly: {},
      Worker: function Worker() {},
      createImageBitmap: () => Promise.resolve({}),
      document: { createElement: () => ({}) },
      URL: { createObjectURL: () => 'blob:test' },
    } as unknown as typeof globalThis;
    const result = detectBrowserCapabilities(scope);
    expect(result.supported).toBe(true);
    expect(result.reasons).toEqual([]);
    expect(browserSupportMessage(result)).toBe('');
  });

  it('explains missing capabilities', () => {
    const result = detectBrowserCapabilities({} as typeof globalThis);
    expect(result.supported).toBe(false);
    expect(result.reasons.length).toBe(5);
    expect(browserSupportMessage(result)).toContain('cannot run Vectraa');
  });
});
