import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const dist = new URL('../dist/', import.meta.url);

function htmlFiles(directory: URL): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = new URL(entry.name + (entry.isDirectory() ? '/' : ''), directory);
    if (entry.isDirectory()) found.push(...htmlFiles(path));
    else if (entry.name.endsWith('.html')) found.push(path.pathname);
  }
  return found;
}

function pngSize(file: URL) {
  const bytes = readFileSync(file);
  expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), bytes: bytes.length };
}

function schemaGraph(html: string): object[] {
  const json = html.match(/<script id="vectraa-page-schema" type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1];
  expect(json, 'JSON-LD script').toBeTruthy();
  const schema = JSON.parse(json!) as { '@context': string; '@graph': object[] };
  expect(schema['@context']).toBe('https://schema.org');
  return schema['@graph'];
}

describe('built HTML head', () => {
  const pages = htmlFiles(dist);

  it('prerenders more than the homepage', () => {
    expect(pages.length).toBeGreaterThan(10);
    expect(pages.some((page) => page.endsWith('/dist/index.html'))).toBe(true);
    expect(pages.some((page) => page.endsWith('/404.html'))).toBe(true);
    expect(pages.some((page) => page.includes('/png-to-svg/'))).toBe(true);
  });

  it('parses homepage JSON-LD as the Vectraa brand', () => {
    const home = pages.find((page) => page.endsWith('/dist/index.html'));
    const graph = schemaGraph(readFileSync(home!, 'utf8'));
    const organization = graph.find((node) => (node as { '@type'?: string })['@type'] === 'Organization');
    const website = graph.find((node) => (node as { '@type'?: string })['@type'] === 'WebSite');
    const application = graph.find((node) => {
      const kind = (node as { '@type'?: string | string[] })['@type'];
      return Array.isArray(kind) && kind.includes('WebApplication') && kind.includes('SoftwareApplication');
    });
    expect(organization).toMatchObject({
      '@id': 'https://vectraa.com/#organization',
      name: 'Vectraa',
      alternateName: ['vectraa.com', 'Vectraa SVG Converter'],
      url: 'https://vectraa.com/',
      logo: { '@type': 'ImageObject', url: 'https://vectraa.com/icon-512.png', width: 512, height: 512 },
    });
    expect(website).toMatchObject({
      name: 'Vectraa',
      alternateName: 'vectraa.com',
      url: 'https://vectraa.com/',
      publisher: { '@id': 'https://vectraa.com/#organization' },
    });
    expect(application).toMatchObject({
      publisher: { '@id': 'https://vectraa.com/#organization' },
    });
    expect(JSON.stringify(graph)).not.toContain('sameAs');
  });

  it('parses JSON-LD on every indexable page', () => {
    for (const page of pages) {
      const html = readFileSync(page, 'utf8');
      if (html.includes('content="noindex"')) continue;
      const graph = schemaGraph(html);
      expect(graph.some((node) => (node as { name?: string })['name'] === 'Vectraa')).toBe(true);
    }
  });

  it('links PNG favicons on every prerendered page', () => {
    for (const page of pages) {
      const html = readFileSync(page, 'utf8');
      expect(html, page).toContain('<link rel="icon" href="/favicon.ico" sizes="48x48" />');
      expect(html, page).toContain('<link rel="icon" href="/icon.svg" type="image/svg+xml" />');
      expect(html, page).toContain('<link rel="icon" type="image/png" sizes="96x96" href="/favicon-96x96.png" />');
      expect(html, page).toContain('<link rel="icon" type="image/png" sizes="192x192" href="/favicon-192x192.png" />');
      expect(html, page).toContain('<meta property="og:site_name" content="Vectraa" />');
    }
  });

  it('ships square PNG favicons rendered at the linked sizes', () => {
    expect(pngSize(new URL('favicon-96x96.png', dist))).toMatchObject({ width: 96, height: 96 });
    expect(pngSize(new URL('favicon-192x192.png', dist))).toMatchObject({ width: 192, height: 192 });
    expect(pngSize(new URL('favicon-96x96.png', dist)).bytes).toBeGreaterThan(500);
    expect(pngSize(new URL('favicon-192x192.png', dist)).bytes).toBeGreaterThan(500);
  });
});
