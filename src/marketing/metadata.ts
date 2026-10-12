import type { LandingPage } from './landing';
import type { GuidePage } from './guides';

export const DEFAULT_HOME_TITLE = 'Vectraa — Free JPG, PNG & WebP to SVG Vector Converter';
export const DEFAULT_HOME_DESCRIPTION = 'Vectraa is a free online vector converter for turning JPG, PNG and WebP images into clean SVG paths. Smart tracing, no account and private browser processing.';

function setMeta(selector: string, attribute: string, value: string) {
  document.querySelector<HTMLMetaElement>(selector)?.setAttribute(attribute, value);
}

export function applyPageMetadata(page: LandingPage | GuidePage | null) {
  const title = page?.title ?? DEFAULT_HOME_TITLE;
  const description = page?.description ?? DEFAULT_HOME_DESCRIPTION;
  const canonicalUrl = new URL(page?.path ?? '/', 'https://vectraa.com').toString();
  document.title = title;
  setMeta('meta[name="description"]', 'content', description);
  setMeta('meta[property="og:title"]', 'content', title);
  setMeta('meta[property="og:description"]', 'content', description);
  setMeta('meta[property="og:url"]', 'content', canonicalUrl);
  setMeta('meta[name="twitter:title"]', 'content', title);
  setMeta('meta[name="twitter:description"]', 'content', description);
  document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.setAttribute('href', canonicalUrl);

  const isGuide = Boolean(page && 'sections' in page);
  const schema = {
    '@context': 'https://schema.org',
    '@type': isGuide ? 'Article' : page ? 'WebPage' : 'WebApplication',
    name: page?.heading ?? 'Vectraa Image to SVG Converter',
    description,
    url: canonicalUrl,
    isPartOf: { '@type': 'WebSite', name: 'Vectraa', url: 'https://vectraa.com/' },
    ...(isGuide ? {
      headline: page?.heading,
      datePublished: '2026-10-05',
      dateModified: '2026-10-05',
      author: { '@type': 'Organization', name: 'Vectraa', url: 'https://vectraa.com/' },
      publisher: { '@type': 'Organization', name: 'Vectraa', url: 'https://vectraa.com/' },
    } : {}),
    ...(page ? {} : { applicationCategory: 'DesignApplication', operatingSystem: 'Web browser', offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' } }),
  };
  let script = document.querySelector<HTMLScriptElement>('#vectraa-page-schema');
  if (!script) {
    script = document.createElement('script');
    script.id = 'vectraa-page-schema';
    script.type = 'application/ld+json';
    document.head.appendChild(script);
  }
  script.textContent = JSON.stringify(schema);
}
