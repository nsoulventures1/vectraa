import type { GuidePage } from './guides';
import { HOME_FAQS } from './faq';
import type { InfoPage } from './info';
import type { LandingPage } from './landing';
import { buildPageSchema, ogImageAlt, OG_IMAGE_URL, serializeJsonLd, type SchemaPage } from './schema';

const DEFAULT_TITLE = 'Vectraa — Free JPG, PNG & WebP to SVG Vector Converter';
const DEFAULT_DESCRIPTION = 'Vectraa is a free online vector converter for turning JPG, PNG and WebP images into clean SVG paths. Smart tracing, no account, and private browser processing. Images are not uploaded.';

function setMeta(selector: string, attribute: string, value: string) {
  document.querySelector<HTMLMetaElement>(selector)?.setAttribute(attribute, value);
}

export type MetadataTarget = {
  landing?: LandingPage | null;
  guide?: GuidePage | null;
  info?: InfoPage | null;
  notFound?: boolean;
};

export function pageModel(target: MetadataTarget): SchemaPage {
  if (target.notFound) {
    return {
      kind: 'not-found',
      path: '/404',
      title: 'Page not found | Vectraa',
      description: 'This Vectraa address does not exist. Open the free image-to-SVG converter or choose another page.',
      heading: 'This page is not on Vectraa.',
    };
  }
  if (target.guide) {
    return {
      kind: 'guide',
      path: target.guide.path,
      title: target.guide.title,
      description: target.guide.description,
      heading: target.guide.heading,
      faqs: target.guide.faqs,
      datePublished: '2026-10-05',
      dateModified: '2026-11-22',
    };
  }
  if (target.info) {
    return {
      kind: 'info',
      path: target.info.path,
      title: target.info.title,
      description: target.info.description,
      heading: target.info.heading,
    };
  }
  if (target.landing) {
    return {
      kind: 'landing',
      path: target.landing.path,
      title: target.landing.title,
      description: target.landing.description,
      heading: target.landing.heading,
      faqs: HOME_FAQS,
    };
  }
  return {
    kind: 'home',
    path: '/',
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    heading: 'Anything → Vector.',
    faqs: HOME_FAQS,
  };
}

export function applyPageMetadata(target: MetadataTarget | LandingPage | GuidePage | null) {
  const model = pageModel(isMetadataTarget(target) ? target : { landing: target && !('sections' in target) ? target : null, guide: target && 'sections' in target ? target : null });
  document.title = model.title;
  setMeta('meta[name="description"]', 'content', model.description);
  setMeta('meta[property="og:title"]', 'content', model.title);
  setMeta('meta[property="og:description"]', 'content', model.description);
  setMeta('meta[property="og:image"]', 'content', OG_IMAGE_URL);
  setMeta('meta[property="og:image:alt"]', 'content', ogImageAlt(model.heading));
  setMeta('meta[name="twitter:title"]', 'content', model.title);
  setMeta('meta[name="twitter:description"]', 'content', model.description);
  setMeta('meta[name="twitter:image"]', 'content', OG_IMAGE_URL);
  setMeta('meta[name="twitter:image:alt"]', 'content', ogImageAlt(model.heading));
  setMeta('meta[property="og:type"]', 'content', model.kind === 'guide' ? 'article' : 'website');

  const canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (model.kind === 'not-found') {
    setMeta('meta[name="robots"]', 'content', 'noindex');
    canonical?.remove();
    setMeta('meta[property="og:url"]', 'content', 'https://vectraa.com/404');
  } else {
    const canonicalUrl = new URL(model.path, 'https://vectraa.com').toString();
    setMeta('meta[name="robots"]', 'content', 'index,follow,max-image-preview:large');
    setMeta('meta[property="og:url"]', 'content', canonicalUrl);
    if (canonical) canonical.href = canonicalUrl;
  }

  const schema = buildPageSchema(model);
  let script = document.querySelector<HTMLScriptElement>('#vectraa-page-schema');
  if (!script) {
    script = document.createElement('script');
    script.id = 'vectraa-page-schema';
    script.type = 'application/ld+json';
    document.head.appendChild(script);
  }
  script.textContent = schema ? serializeJsonLd(schema) : '';
}

function isMetadataTarget(value: MetadataTarget | LandingPage | GuidePage | null): value is MetadataTarget {
  if (!value) return false;
  return 'landing' in value || 'guide' in value || 'info' in value || 'notFound' in value;
}
