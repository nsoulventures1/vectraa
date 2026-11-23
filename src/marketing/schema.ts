import type { Faq } from './faq';

export const SITE_ORIGIN = 'https://vectraa.com';
export const OG_IMAGE_PATH = '/og-image.png';
export const OG_IMAGE_URL = `${SITE_ORIGIN}${OG_IMAGE_PATH}`;
export const OG_IMAGE_WIDTH = 1200;
export const OG_IMAGE_HEIGHT = 630;
export const CONTENT_UPDATED = '2026-11-22';

export type SchemaKind = 'home' | 'landing' | 'guide' | 'info' | 'not-found';

export type SchemaPage = {
  kind: SchemaKind;
  path: string;
  title: string;
  description: string;
  heading?: string;
  faqs?: Faq[];
  datePublished?: string;
  dateModified?: string;
};

export function absoluteUrl(path: string): string {
  return new URL(path, SITE_ORIGIN).toString();
}

export function ogImageAlt(heading?: string): string {
  return heading ? `Vectraa — ${heading}` : 'Vectraa, a free private image-to-SVG converter';
}

export function buildPageSchema(page: SchemaPage): { '@context': string; '@graph': object[] } | null {
  if (page.kind === 'not-found') return null;

  const url = absoluteUrl(page.path);
  const organizationId = `${SITE_ORIGIN}/#organization`;
  const websiteId = `${SITE_ORIGIN}/#website`;
  const applicationId = `${SITE_ORIGIN}/#application`;

  const graph: object[] = [
    {
      '@type': 'Organization',
      '@id': organizationId,
      name: 'Vectraa',
      alternateName: ['vectraa.com', 'Vectraa SVG Converter'],
      url: `${SITE_ORIGIN}/`,
      logo: { '@type': 'ImageObject', url: `${SITE_ORIGIN}/icon-512.png`, width: 512, height: 512 },
    },
    {
      '@type': 'WebSite',
      '@id': websiteId,
      name: 'Vectraa',
      alternateName: 'vectraa.com',
      url: `${SITE_ORIGIN}/`,
      description: 'Free, private, in-browser image-to-SVG converter.',
      publisher: { '@id': organizationId },
    },
  ];

  if (page.kind === 'home' || page.kind === 'landing') {
    graph.push({
      '@type': ['WebApplication', 'SoftwareApplication'],
      '@id': applicationId,
      name: 'Vectraa',
      url: `${SITE_ORIGIN}/`,
      publisher: { '@id': organizationId },
      applicationCategory: 'DesignApplication',
      operatingSystem: 'Web browser',
      browserRequirements: 'Requires JavaScript. Runs locally in a current browser.',
      isAccessibleForFree: true,
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
      description: 'Vectraa converts JPG, PNG and WebP images to genuine SVG paths in the browser. Images are not uploaded.',
      featureList: [
        'PNG to SVG',
        'JPG to SVG',
        'WebP to SVG',
        'Signature to SVG',
        'Logo to SVG',
        'PNG to SVG for Cricut',
        'Private conversion with no upload',
      ],
    });
  }

  const webPage: Record<string, unknown> = {
    '@type': 'WebPage',
    '@id': `${url}#webpage`,
    url,
    name: page.title,
    description: page.description,
    isPartOf: { '@id': websiteId },
    primaryImageOfPage: { '@type': 'ImageObject', url: OG_IMAGE_URL, width: OG_IMAGE_WIDTH, height: OG_IMAGE_HEIGHT },
  };
  if (page.kind === 'home' || page.kind === 'landing') webPage.about = { '@id': applicationId };
  graph.push(webPage);

  if (page.kind === 'guide') {
    graph.push({
      '@type': 'Article',
      '@id': `${url}#article`,
      headline: page.heading ?? page.title,
      description: page.description,
      datePublished: page.datePublished ?? '2026-10-05',
      dateModified: page.dateModified ?? CONTENT_UPDATED,
      mainEntityOfPage: url,
      author: { '@id': organizationId },
      publisher: { '@id': organizationId },
      image: OG_IMAGE_URL,
    });
  }

  if (page.faqs?.length) {
    graph.push({
      '@type': 'FAQPage',
      '@id': `${url}#faq`,
      url,
      mainEntity: page.faqs.map((faq) => ({
        '@type': 'Question',
        name: faq.question,
        acceptedAnswer: { '@type': 'Answer', text: faq.answer },
      })),
    });
  }

  if (page.path !== '/') {
    graph.push({
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Vectraa', item: `${SITE_ORIGIN}/` },
        { '@type': 'ListItem', position: 2, name: page.heading ?? page.title, item: url },
      ],
    });
  }

  return { '@context': 'https://schema.org', '@graph': graph };
}

export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}
