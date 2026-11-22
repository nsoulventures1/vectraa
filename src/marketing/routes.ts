import { GUIDE_PAGES } from './guides';
import { INFO_PAGES } from './info';
import { LANDING_PAGES } from './landing';
import { CONTENT_UPDATED } from './schema';

export const SITEMAP_LASTMOD = CONTENT_UPDATED;

export type IndexableRoute = {
  path: string;
  lastmod: string;
};

export function indexableRoutes(): IndexableRoute[] {
  return [
    { path: '/', lastmod: SITEMAP_LASTMOD },
    ...LANDING_PAGES.map((page) => ({ path: page.path, lastmod: SITEMAP_LASTMOD })),
    ...GUIDE_PAGES.map((page) => ({ path: page.path, lastmod: SITEMAP_LASTMOD })),
    ...INFO_PAGES.map((page) => ({ path: page.path, lastmod: SITEMAP_LASTMOD })),
  ];
}

export function sitemapXml(routes = indexableRoutes()): string {
  const urls = routes.map((route) => `  <url><loc>https://vectraa.com${route.path === '/' ? '/' : route.path}</loc><lastmod>${route.lastmod}</lastmod></url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}
