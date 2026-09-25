import type { LandingPage } from './landing';

const DEFAULT_TITLE = 'Free JPG & PNG to SVG Vector Converter | Vectraa';
const DEFAULT_DESCRIPTION = 'Convert JPG, PNG and WebP images to clean, genuine SVG vectors free in your browser. Smart tracing, no account and no watermark.';

function setMeta(selector: string, attribute: string, value: string) {
  document.querySelector<HTMLMetaElement>(selector)?.setAttribute(attribute, value);
}

export function applyPageMetadata(page: LandingPage | null) {
  const title = page?.title ?? DEFAULT_TITLE;
  const description = page?.description ?? DEFAULT_DESCRIPTION;
  const canonicalUrl = new URL(page?.path ?? '/', 'https://vectraa.com').toString();
  document.title = title;
  setMeta('meta[name="description"]', 'content', description);
  setMeta('meta[property="og:title"]', 'content', title);
  setMeta('meta[property="og:description"]', 'content', description);
  setMeta('meta[property="og:url"]', 'content', canonicalUrl);
  setMeta('meta[name="twitter:title"]', 'content', title);
  setMeta('meta[name="twitter:description"]', 'content', description);
  document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.setAttribute('href', canonicalUrl);

  const schema = {
    '@context': 'https://schema.org',
    '@type': page ? 'WebPage' : 'WebApplication',
    name: page?.heading ?? 'Vectraa Image to SVG Converter',
    description,
    url: canonicalUrl,
    isPartOf: { '@type': 'WebSite', name: 'Vectraa', url: 'https://vectraa.com/' },
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
