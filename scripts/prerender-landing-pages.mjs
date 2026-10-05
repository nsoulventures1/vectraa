import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const sources = await Promise.all([
  readFile(resolve(root, 'src/marketing/landing.ts'), 'utf8'),
  readFile(resolve(root, 'src/marketing/guides.ts'), 'utf8'),
]);
const shell = await readFile(resolve(root, 'dist/index.html'), 'utf8');

const pages = [...sources.join('\n').matchAll(/\{\s*path:\s*'([^']+)',\s*title:\s*'([^']+)',\s*description:\s*'([^']+)'/g)]
  .map(([, path, title, description]) => ({ path, title, description }));

if (pages.length === 0) throw new Error('No SEO landing pages found to prerender.');

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function replaceMeta(html, selector, value) {
  const escaped = escapeHtml(value);
  return html.replace(selector, (tag) => tag.replace(/content="[^"]*"/, `content="${escaped}"`));
}

for (const page of pages) {
  const canonical = `https://vectraa.com${page.path}`;
  let html = shell.replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(page.title)}</title>`);
  html = replaceMeta(html, /<meta name="description"[^>]*>/, page.description);
  html = replaceMeta(html, /<meta property="og:title"[^>]*>/, page.title);
  html = replaceMeta(html, /<meta property="og:description"[^>]*>/, page.description);
  html = replaceMeta(html, /<meta property="og:url"[^>]*>/, canonical);
  html = replaceMeta(html, /<meta name="twitter:title"[^>]*>/, page.title);
  html = replaceMeta(html, /<meta name="twitter:description"[^>]*>/, page.description);
  html = html.replace(/<link rel="canonical"[^>]*>/, `<link rel="canonical" href="${canonical}" />`);
  if (page.path.startsWith('/guides/')) html = html.replace('<meta property="og:type" content="website" />', '<meta property="og:type" content="article" />');

  const output = resolve(root, 'dist', page.path.slice(1), 'index.html');
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, html);
}

console.log(`Prerendered ${pages.length} SEO landing and guide pages.`);
