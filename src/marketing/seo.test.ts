import { describe, expect, it } from 'vitest';
import { INFO_PAGES } from './info';
import { indexableRoutes, sitemapXml } from './routes';
import { buildPageSchema } from './schema';
import { NOT_FOUND_DOCUMENT, escapeHtml, renderedDocuments } from './staticDocument';

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
    expect(png?.body).toContain('PNG → Vector.');
    expect(png?.body).toContain('Transparent artwork');
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
