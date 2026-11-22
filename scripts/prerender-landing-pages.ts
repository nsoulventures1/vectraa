import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPageSchema, ogImageAlt, OG_IMAGE_URL, serializeJsonLd } from '../src/marketing/schema.ts';
import { sitemapXml } from '../src/marketing/routes.ts';
import { NOT_FOUND_DOCUMENT, renderedDocuments, type RenderedDocument } from '../src/marketing/staticDocument.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const shell = await readFile(resolve(root, 'dist/index.html'), 'utf8');

function escapeAttribute(value: string) {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
}

function replaceMeta(html: string, pattern: RegExp, value: string) {
  const escaped = escapeAttribute(value);
  if (!pattern.test(html)) throw new Error(`Could not update meta tag ${pattern}`);
  return html.replace(pattern, (tag) => tag.replace(/content="[^"]*"/, `content="${escaped}"`));
}

function applyDocument(document: RenderedDocument, options: { notFound?: boolean } = {}) {
  const canonical = `https://vectraa.com${document.path === '/' ? '/' : document.path}`;
  let html = shell.replace(/<title>[^<]*<\/title>/, `<title>${escapeAttribute(document.title)}</title>`);
  html = replaceMeta(html, /<meta name="description"[^>]*>/, document.description);
  html = replaceMeta(html, /<meta name="robots"[^>]*>/, document.robots);
  html = replaceMeta(html, /<meta property="og:type"[^>]*>/, document.ogType);
  html = replaceMeta(html, /<meta property="og:title"[^>]*>/, document.title);
  html = replaceMeta(html, /<meta property="og:description"[^>]*>/, document.description);
  html = replaceMeta(html, /<meta property="og:url"[^>]*>/, options.notFound ? 'https://vectraa.com/404' : canonical);
  html = replaceMeta(html, /<meta property="og:image"[^>]*>/, OG_IMAGE_URL);
  html = replaceMeta(html, /<meta property="og:image:alt"[^>]*>/, ogImageAlt(document.heading));
  html = replaceMeta(html, /<meta name="twitter:title"[^>]*>/, document.title);
  html = replaceMeta(html, /<meta name="twitter:description"[^>]*>/, document.description);
  html = replaceMeta(html, /<meta name="twitter:image"[^>]*>/, OG_IMAGE_URL);
  html = replaceMeta(html, /<meta name="twitter:image:alt"[^>]*>/, ogImageAlt(document.heading));
  if (options.notFound) html = html.replace(/\s*<link rel="canonical"[^>]*>/, '');
  else html = html.replace(/<link rel="canonical"[^>]*>/, `<link rel="canonical" href="${canonical}" />`);

  const schema = buildPageSchema({
    kind: document.kind,
    path: document.path === '/404' ? '/404' : document.path,
    title: document.title,
    description: document.description,
    heading: document.heading,
    faqs: document.faqs,
    datePublished: document.kind === 'guide' ? '2026-10-05' : undefined,
    dateModified: document.kind === 'guide' ? '2026-11-22' : undefined,
  });
  const json = schema ? serializeJsonLd(schema) : '';
  html = html.replace(/<script id="vectraa-page-schema" type="application\/ld\+json">[\s\S]*?<\/script>/, `<script id="vectraa-page-schema" type="application/ld+json">${json}</script>`);
  if (!html.includes('<div id="root">')) throw new Error('Shell is missing #root');
  html = html.replace('<div id="root"></div>', `<div id="root">${document.body}</div>`);
  if (html.includes('<div id="root"></div>')) throw new Error(`Failed to inject content for ${document.path}`);
  return html;
}

const documents = renderedDocuments();
if (documents.length < 11) throw new Error(`Expected the full public page set, found ${documents.length}.`);

for (const document of documents) {
  const html = applyDocument(document);
  if (document.kind !== 'home' && !html.includes('<h1>')) throw new Error(`${document.path} is missing an h1`);
  if (document.kind === 'home' && !html.includes('<h1>')) throw new Error('Homepage is missing an h1');
  const output = document.path === '/'
    ? resolve(root, 'dist/index.html')
    : resolve(root, 'dist', document.path.slice(1), 'index.html');
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, html);
}

const notFoundHtml = applyDocument(NOT_FOUND_DOCUMENT, { notFound: true });
if (notFoundHtml.includes('rel="canonical"')) throw new Error('404 page must not advertise a canonical URL.');
if (!notFoundHtml.includes('content="noindex"')) throw new Error('404 page must be noindex.');
if (!notFoundHtml.includes('<h1>')) throw new Error('404 page is missing an h1');
await writeFile(resolve(root, 'dist/404.html'), notFoundHtml);

const sitemap = sitemapXml();
await writeFile(resolve(root, 'dist/sitemap.xml'), sitemap);
await writeFile(resolve(root, 'public/sitemap.xml'), sitemap);

console.log(`Prerendered ${documents.length} public pages plus a real 404 page.`);
