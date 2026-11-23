import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { INFO_PAGES } from './info';
import { indexableRoutes, sitemapXml } from './routes';
import { buildPageSchema } from './schema';
import { NOT_FOUND_DOCUMENT, escapeHtml, renderedDocuments } from './staticDocument';

const ICON_LINKS = [
  '<link rel="icon" href="/favicon.ico" sizes="48x48" />',
  '<link rel="icon" href="/icon.svg" type="image/svg+xml" />',
  '<link rel="icon" type="image/png" sizes="96x96" href="/favicon-96x96.png" />',
  '<link rel="icon" type="image/png" sizes="192x192" href="/favicon-192x192.png" />',
];

function graphNode(graph: object[], type: string): Record<string, unknown> {
  const node = graph.find((entry) => {
    const kind = (entry as { '@type'?: string | string[] })['@type'];
    return kind === type || (Array.isArray(kind) && kind.includes(type));
  });
  expect(node, type).toBeTruthy();
  return node as Record<string, unknown>;
}

describe('indexable routes', () => {
  it('lists privacy, about and the new converters once each', () => {
    const paths = indexableRoutes().map((route) => route.path);
    expect(new Set(paths).size).toBe(paths.length);
    for (const path of ['/', '/privacy', '/about', '/signature-to-svg', '/png-to-svg-for-cricut', '/image-to-vector', '/png-to-svg-no-upload', '/convert-logo-to-svg']) {
      expect(paths).toContain(path);
    }
    expect(paths).not.toContain('/404');
  });

  it('refreshes sitemap lastmod dates', () => {
    const xml = sitemapXml();
    expect(xml).toContain('<lastmod>2026-11-22</lastmod>');
    expect(xml).toContain('https://vectraa.com/privacy');
    expect(xml).toContain('https://vectraa.com/about');
    expect(xml).not.toContain('2026-10-05');
  });
});

describe('structured data', () => {
  it('describes the homepage as a web and software application with FAQs', () => {
    const home = renderedDocuments().find((page) => page.path === '/');
    const schema = buildPageSchema({
      kind: 'home',
      path: '/',
      title: home!.title,
      description: home!.description,
      heading: home!.heading,
      faqs: home!.faqs,
    });
    const serialized = JSON.stringify(schema);
    expect(serialized).toContain('SoftwareApplication');
    expect(serialized).toContain('WebApplication');
    expect(serialized).toContain('FAQPage');
    expect(serialized).toContain('Does my image leave my browser?');
    const parsed = JSON.parse(serialized) as { '@graph': object[] };
    expect(graphNode(parsed['@graph'], 'Organization')).toMatchObject({
      name: 'Vectraa',
      alternateName: ['vectraa.com', 'Vectraa SVG Converter'],
      url: 'https://vectraa.com/',
      logo: { '@type': 'ImageObject', url: 'https://vectraa.com/icon-512.png', width: 512, height: 512 },
    });
    expect(graphNode(parsed['@graph'], 'WebSite')).toMatchObject({
      name: 'Vectraa',
      alternateName: 'vectraa.com',
      url: 'https://vectraa.com/',
      publisher: { '@id': 'https://vectraa.com/#organization' },
    });
    expect(graphNode(parsed['@graph'], 'SoftwareApplication')).toMatchObject({
      publisher: { '@id': 'https://vectraa.com/#organization' },
    });
    expect(serialized).not.toContain('sameAs');
  });

  it('adds FAQPage structured data to guides', () => {
    const guide = renderedDocuments().find((page) => page.kind === 'guide');
    const schema = buildPageSchema({
      kind: 'guide',
      path: guide!.path,
      title: guide!.title,
      description: guide!.description,
      heading: guide!.heading,
      faqs: guide!.faqs,
      dateModified: '2026-11-22',
    });
    const serialized = JSON.stringify(schema);
    expect(serialized).toContain('FAQPage');
    expect(serialized).toContain('"@type":"Article"');
    expect(serialized).toContain('2026-11-22');
  });

  it('does not publish schema for a missing page', () => {
    expect(buildPageSchema({ kind: 'not-found', path: '/404', title: 'Missing', description: 'Missing' })).toBeNull();
  });
});

describe('prerendered HTML', () => {
  it('puts real copy in every public document', () => {
    for (const document of renderedDocuments()) {
      expect(document.title).toContain('Vectraa');
      expect(document.body).toContain('<h1>');
      expect(document.body).not.toContain('<div id="root"></div>');
    }
    const png = renderedDocuments().find((page) => page.path === '/png-to-svg');
    expect(png?.body).toContain('<h1>PNG to SVG converter.</h1>');
    expect(png?.body).toContain('href="/guides/png-vs-svg-for-printing"');
    expect(png?.body).toContain('href="/guides/prepare-svg-for-cricut-laser-cutting"');
    expect(png?.body).toContain('href="/png-to-svg-for-cricut"');
    expect(png?.body).toContain('Transparent artwork');
    const jpg = renderedDocuments().find((page) => page.path === '/jpg-to-svg');
    expect(jpg?.title).toBe('JPG to SVG Converter — Free JPG to Vector Online | Vectraa');
    expect(jpg?.body).toContain('<h1>JPG to SVG — a free JPG to vector converter.</h1>');
    expect(jpg?.body).toContain('href="/image-to-svg"');
    const webp = renderedDocuments().find((page) => page.path === '/webp-to-svg');
    expect(webp?.body).toContain('<h1>WebP to SVG converter.</h1>');
    expect(webp?.body).toContain('href="/guides/reduce-svg-nodes"');
    const image = renderedDocuments().find((page) => page.path === '/image-to-svg');
    expect(image?.body).toContain('<h1>Image to SVG — a free vector image converter.</h1>');
    expect(image?.description).toContain('no upload, no account and no watermark');
    const home = renderedDocuments().find((page) => page.path === '/');
    expect(home?.heading).toBe('Anything → Vector.');
    expect(home?.body).toContain('<h1>Anything <span>→</span> Vector.</h1>');
    expect(home?.body).not.toContain('class="heroLinks"');
    const privacy = renderedDocuments().find((page) => page.path === '/privacy');
    expect(privacy?.body.toLowerCase()).toContain('never leave the browser');
    expect(INFO_PAGES).toHaveLength(2);
  });

  it('renders a 404 document without treating it as the homepage', () => {
    expect(NOT_FOUND_DOCUMENT.robots).toBe('noindex');
    expect(NOT_FOUND_DOCUMENT.body).toContain('This page is not on Vectraa.');
    expect(NOT_FOUND_DOCUMENT.body).not.toContain('Anything');
  });

  it('escapes text that could break HTML', () => {
    expect(escapeHtml(`<script>"&"`)).toBe('&lt;script&gt;&quot;&amp;&quot;');
  });
});

describe('homepage head', () => {
  const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');

  it('names Vectraa in the title and site name', () => {
    expect(html).toMatch(/<title>[^<]*Vectraa[^<]*<\/title>/);
    expect(html).toContain('<meta property="og:site_name" content="Vectraa" />');
  });

  it('parses brand JSON-LD and keeps the application linked to the organization', () => {
    const json = html.match(/<script id="vectraa-page-schema" type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1];
    expect(json).toBeTruthy();
    const schema = JSON.parse(json!) as { '@context': string; '@graph': object[] };
    expect(schema['@context']).toBe('https://schema.org');
    expect(graphNode(schema['@graph'], 'Organization')).toMatchObject({
      '@id': 'https://vectraa.com/#organization',
      name: 'Vectraa',
      alternateName: ['vectraa.com', 'Vectraa SVG Converter'],
      url: 'https://vectraa.com/',
      logo: { '@type': 'ImageObject', url: 'https://vectraa.com/icon-512.png', width: 512, height: 512 },
    });
    expect(graphNode(schema['@graph'], 'WebSite')).toMatchObject({
      name: 'Vectraa',
      alternateName: 'vectraa.com',
      url: 'https://vectraa.com/',
      publisher: { '@id': 'https://vectraa.com/#organization' },
    });
    expect(graphNode(schema['@graph'], 'WebApplication')).toMatchObject({
      publisher: { '@id': 'https://vectraa.com/#organization' },
    });
    expect(json).not.toContain('sameAs');
  });

  it('links the existing icons and the square PNG favicons', () => {
    for (const link of ICON_LINKS) expect(html).toContain(link);
  });

  it('keeps the SVG icon on a white canvas with a viewBox', () => {
    const svg = readFileSync(new URL('../../public/icon.svg', import.meta.url), 'utf8');
    expect(svg).toContain('viewBox="0 0 32 32"');
    expect(svg).toContain('width="32"');
    expect(svg).toContain('height="32"');
    expect(svg).toContain('fill="#ffffff"');
    expect(svg).toContain('fill="#1f5536"');
    expect(svg).toContain('fill="#f7f8f5"');
  });
});
