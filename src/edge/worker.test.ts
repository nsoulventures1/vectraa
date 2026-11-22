import { describe, expect, it, vi } from 'vitest';
import worker, { wwwRedirect } from './worker';

describe('www to apex redirect', () => {
  it('returns 301 to the apex with the same path and query', () => {
    const response = wwwRedirect(new Request('https://www.vectraa.com/png-to-svg?x=1'));
    expect(response?.status).toBe(301);
    expect(response?.headers.get('location')).toBe('https://vectraa.com/png-to-svg?x=1');
  });

  it('forces https and keeps a trailing slash', () => {
    const response = wwwRedirect(new Request('http://www.vectraa.com/png-to-svg/?x=1&y=a%26b'));
    expect(response?.status).toBe(301);
    expect(response?.headers.get('location')).toBe('https://vectraa.com/png-to-svg/?x=1&y=a%26b');
  });

  it('does not redirect the apex or workers.dev preview hosts', () => {
    expect(wwwRedirect(new Request('https://vectraa.com/png-to-svg?x=1'))).toBeNull();
    expect(wwwRedirect(new Request('https://vectraa.04201012bd.workers.dev/png-to-svg?x=1'))).toBeNull();
    expect(wwwRedirect(new Request('http://127.0.0.1:8787/png-to-svg?x=1'))).toBeNull();
  });

  it('redirects before assets are fetched', async () => {
    const fetchAsset = vi.fn(async () => new Response('asset', { status: 200 }));
    const response = await worker.fetch(new Request('https://www.vectraa.com/png-to-svg?x=1'), {
      ASSETS: { fetch: fetchAsset },
    });

    expect(response.status).toBe(301);
    expect(response.headers.get('location')).toBe('https://vectraa.com/png-to-svg?x=1');
    expect(fetchAsset).not.toHaveBeenCalled();
  });

  it('passes every other host through to assets unchanged', async () => {
    const incoming = new Request('https://vectraa.com/png-to-svg?x=1');
    const asset = new Response('page', {
      status: 200,
      headers: { 'content-security-policy': "default-src 'self'" },
    });
    const fetchAsset = vi.fn(async (request: Request) => {
      expect(request).toBe(incoming);
      return asset;
    });

    const response = await worker.fetch(incoming, { ASSETS: { fetch: fetchAsset } });
    expect(response).toBe(asset);
    expect(fetchAsset).toHaveBeenCalledOnce();
  });
});
