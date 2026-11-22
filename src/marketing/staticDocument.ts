import { HOME_FAQS } from './faq';
import { GUIDE_PAGES, type GuidePage } from './guides';
import { INFO_PAGES, type InfoPage } from './info';
import { LANDING_PAGES, type LandingPage } from './landing';

const HOME_TITLE = 'Vectraa — Free JPG, PNG & WebP to SVG Vector Converter';
const HOME_DESCRIPTION = 'Vectraa is a free online vector converter for turning JPG, PNG and WebP images into clean SVG paths. Smart tracing, no account, and private browser processing. Images are not uploaded.';

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function header(links: Array<{ href: string; label: string }>): string {
  const nav = links.map((link) => `<a href="${escapeHtml(link.href)}">${escapeHtml(link.label)}</a>`).join('');
  return `<header class="nav"><a class="brand" href="/">Vectraa<span>.</span></a><nav class="navLinks">${nav}</nav><div class="privacy">Private by design · processed on your device</div></header>`;
}

function footer(): string {
  return `<footer class="footer"><div><a class="brand" href="/">Vectraa<span>.</span></a><p>Private, browser-based image vectorization. No account and no watermark.</p></div><nav><a href="/about">About</a><a href="/privacy">Privacy</a><a href="/#faq">FAQ</a><a href="/sitemap.xml">Sitemap</a></nav></footer>`;
}

function converterDirectory(): string {
  const links = LANDING_PAGES.map((page) => `<a href="${escapeHtml(page.path)}">${escapeHtml(page.heading)}</a>`).join('');
  return `<section class="contentSection converterDirectory"><span class="sectionKicker">EXPLORE CONVERTERS</span><h2>Start with the workflow that matches your artwork.</h2><nav>${links}</nav></section>`;
}

function guideDirectory(): string {
  const cards = GUIDE_PAGES.map((guide) => `<a href="${escapeHtml(guide.path)}"><span>${escapeHtml(guide.eyebrow)}</span><strong>${escapeHtml(guide.heading)}</strong><small>${escapeHtml(guide.readingTime)}</small></a>`).join('');
  return `<section class="contentSection guideDirectory"><span class="sectionKicker">VECTOR LEARNING CENTER</span><h2>Get a better result before you export.</h2><p class="sectionLead">Practical guidance for logo cleanup, printing, cutting machines and manageable SVG files.</p><div class="guideCards">${cards}</div></section>`;
}

function faqBlock(items: Array<{ question: string; answer: string }>): string {
  const details = items.map((item) => `<details><summary>${escapeHtml(item.question)}</summary><p>${escapeHtml(item.answer)}</p></details>`).join('');
  return `<section id="faq" class="contentSection"><span class="sectionKicker">FAQ</span><h2>Useful answers before you export.</h2><div class="faqList">${details}</div></section>`;
}

function studio(): string {
  return `<section class="studio" aria-label="Converter"><div class="source card"><div class="cardHead"><span>ORIGINAL</span></div><div class="drop"><span class="uploadIcon">↑</span><strong>Drop your image here</strong><small>The converter runs in your browser. JPG, PNG, WebP · up to 20 MB. Your image is not uploaded.</small></div></div><div class="result card"><div class="cardHead"><span>VECTOR</span></div><div class="empty"><span>◇</span><strong>Your vector will appear here</strong><small>Real SVG paths — not a raster image wrapped in an SVG file.</small></div></div></section>`;
}

function homeSections(page: LandingPage | null): string {
  const landing = page ? `<section class="contentSection landingContent"><span class="sectionKicker">BUILT FOR THIS WORKFLOW</span><h2>${escapeHtml(page.heading)}</h2><p class="sectionLead">${escapeHtml(page.intro)}</p><div class="contentGrid">${page.benefits.map((benefit, index) => `<article><b>0${index + 1}</b><h3>${escapeHtml(benefit.title)}</h3><p>${escapeHtml(benefit.body)}</p></article>`).join('')}</div></section>` : '';
  return `<section class="trust"><div><b>01</b><strong>Local processing</strong><p>Your image stays in the browser. Basic conversion is not uploaded.</p></div><div><b>02</b><strong>Smart adaptive tracing</strong><p>Vectraa spends extra passes only when the quality data says they are useful.</p></div><div><b>03</b><strong>No account. No watermark.</strong><p>Convert and download without creating an account.</p></div></section><section id="how-it-works" class="contentSection"><span class="sectionKicker">HOW IT WORKS</span><h2>From raster image to genuine SVG paths.</h2><div class="contentGrid"><article><b>1</b><h3>Analyze</h3><p>Vectraa inspects the image locally and recommends a tracing workflow based on detail, colors, transparency and edge structure.</p></article><article><b>2</b><h3>Trace intelligently</h3><p>Adaptive passes balance visual similarity against clean, editable vector structure.</p></article><article><b>3</b><h3>Inspect and export</h3><p>Compare the original with the SVG, review vector health, and download a clean SVG file.</p></article></div></section><section id="privacy" class="contentSection privacySection"><span class="sectionKicker">PRIVACY</span><h2>Your artwork stays in your browser.</h2><p class="sectionLead">Vectraa traces JPG, PNG and WebP files on your device. The image and the SVG are not uploaded. <a href="/privacy">Read the privacy policy</a>.</p><div class="privacyFacts"><span>No account required</span><span>No watermark</span><span>Images never leave the browser</span></div></section>${faqBlock(HOME_FAQS)}${landing}${guideDirectory()}${converterDirectory()}`;
}

export function renderHomeBody(): string {
  return `${header([{ href: '#workspace', label: 'Workspace' }, { href: '#how-it-works', label: 'How it works' }, { href: '/about', label: 'About' }, { href: '/privacy', label: 'Privacy' }, { href: '#faq', label: 'FAQ' }])}<main><section class="hero"><p class="eyebrow">FREE PRIVATE VECTOR STUDIO</p><h1>Anything <span>→</span> Vector.</h1><p class="lead">Turn JPG, PNG and WebP artwork into clean, scalable SVG — directly in your browser. Images are not uploaded.</p></section>${studio()}${homeSections(null)}${footer()}</main>`;
}

export function renderLandingBody(page: LandingPage): string {
  return `${header([{ href: '/', label: 'Converter' }, { href: '#how-it-works', label: 'How it works' }, { href: '/about', label: 'About' }, { href: '/privacy', label: 'Privacy' }, { href: '#faq', label: 'FAQ' }])}<main><section class="hero"><p class="eyebrow">${escapeHtml(page.eyebrow)}</p><h1>${escapeHtml(page.heading)}</h1><p class="lead">${escapeHtml(page.lead)}</p></section>${studio()}${homeSections(page)}${footer()}</main>`;
}

export function renderGuideBody(page: GuidePage): string {
  const sections = page.sections.map((section) => `<section><h2>${escapeHtml(section.heading)}</h2>${section.paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join('')}${section.tips ? `<ul>${section.tips.map((tip) => `<li>${escapeHtml(tip)}</li>`).join('')}</ul>` : ''}</section>`).join('');
  const faqs = `<section class="guideFaq"><h2>Questions before you export</h2><div class="faqList">${page.faqs.map((faq) => `<details><summary>${escapeHtml(faq.question)}</summary><p>${escapeHtml(faq.answer)}</p></details>`).join('')}</div></section>`;
  return `${header([{ href: '/', label: 'Converter' }, { href: '/about', label: 'About' }, { href: '/privacy', label: 'Privacy' }])}<main><article id="guide" class="guidePage"><header class="guideHero"><p class="eyebrow">${escapeHtml(page.eyebrow)}</p><h1>${escapeHtml(page.heading)}</h1><p class="lead">${escapeHtml(page.lead)}</p><div class="guideMeta"><span>Updated ${escapeHtml(page.updated)}</span><span>${escapeHtml(page.readingTime)}</span></div><a class="guideCta" href="${escapeHtml(page.relatedConverter.path)}">${escapeHtml(page.relatedConverter.label)} <span aria-hidden="true">→</span></a></header><div class="guideBody">${sections}</div>${faqs}<aside class="guideConversion"><span class="sectionKicker">TRY IT ON YOUR ARTWORK</span><h2>Turn the advice into a cleaner vector.</h2><p>Vectraa analyzes the source on your device and lets you inspect the SVG before downloading.</p><a class="guideCta" href="${escapeHtml(page.relatedConverter.path)}">${escapeHtml(page.relatedConverter.label)} <span aria-hidden="true">→</span></a></aside></article>${guideDirectory()}${converterDirectory()}${footer()}</main>`;
}

export function renderInfoBody(page: InfoPage): string {
  const sections = page.sections.map((section) => `<section><h2>${escapeHtml(section.heading)}</h2>${section.paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join('')}</section>`).join('');
  const extra = page.path === '/privacy' ? '<p><a class="guideCta" href="/">Back to the converter</a></p>' : `<p><a class="guideCta" href="/privacy">Read the privacy policy</a></p>`;
  return `${header([{ href: '/', label: 'Converter' }, { href: '/about', label: 'About' }, { href: '/privacy', label: 'Privacy' }])}<main><article class="guidePage"><header class="guideHero"><p class="eyebrow">${escapeHtml(page.eyebrow)}</p><h1>${escapeHtml(page.heading)}</h1><p class="lead">${escapeHtml(page.lead)}</p></header><div class="guideBody">${sections}${extra}</div></article>${guideDirectory()}${converterDirectory()}${footer()}</main>`;
}

export function renderNotFoundBody(): string {
  const links = [
    { href: '/', label: 'Image to SVG converter' },
    { href: '/png-to-svg', label: 'PNG to SVG' },
    { href: '/convert-logo-to-svg', label: 'Convert logo to SVG' },
    { href: '/signature-to-svg', label: 'Signature to SVG' },
    { href: '/about', label: 'About Vectraa' },
    { href: '/privacy', label: 'Privacy' },
  ].map((link) => `<a href="${link.href}">${escapeHtml(link.label)}</a>`).join('');
  return `${header([{ href: '/', label: 'Converter' }, { href: '/about', label: 'About' }, { href: '/privacy', label: 'Privacy' }])}<main><article class="guidePage"><header class="guideHero"><p class="eyebrow">404</p><h1>This page is not on Vectraa.</h1><p class="lead">The address does not match a converter, guide, or policy page. The image converter is still on the homepage.</p></header><section class="contentSection converterDirectory"><span class="sectionKicker">TRY ONE OF THESE</span><h2>Popular Vectraa pages</h2><nav>${links}</nav></section></article>${footer()}</main>`;
}

export type RenderedDocument = {
  path: string;
  title: string;
  description: string;
  heading?: string;
  body: string;
  kind: 'home' | 'landing' | 'guide' | 'info' | 'not-found';
  faqs?: Array<{ question: string; answer: string }>;
  robots: string;
  ogType: 'website' | 'article';
};

export function renderedDocuments(): RenderedDocument[] {
  return [
    {
      path: '/',
      title: HOME_TITLE,
      description: HOME_DESCRIPTION,
      heading: 'Anything → Vector.',
      body: renderHomeBody(),
      kind: 'home',
      faqs: HOME_FAQS,
      robots: 'index,follow,max-image-preview:large',
      ogType: 'website',
    },
    ...LANDING_PAGES.map((page) => ({
      path: page.path,
      title: page.title,
      description: page.description,
      heading: page.heading,
      body: renderLandingBody(page),
      kind: 'landing' as const,
      faqs: HOME_FAQS,
      robots: 'index,follow,max-image-preview:large',
      ogType: 'website' as const,
    })),
    ...GUIDE_PAGES.map((page) => ({
      path: page.path,
      title: page.title,
      description: page.description,
      heading: page.heading,
      body: renderGuideBody(page),
      kind: 'guide' as const,
      faqs: page.faqs,
      robots: 'index,follow,max-image-preview:large',
      ogType: 'article' as const,
    })),
    ...INFO_PAGES.map((page) => ({
      path: page.path,
      title: page.title,
      description: page.description,
      heading: page.heading,
      body: renderInfoBody(page),
      kind: 'info' as const,
      robots: 'index,follow,max-image-preview:large',
      ogType: 'website' as const,
    })),
  ];
}

export const NOT_FOUND_DOCUMENT: RenderedDocument = {
  path: '/404',
  title: 'Page not found | Vectraa',
  description: 'This Vectraa address does not exist. Open the free image-to-SVG converter or choose another page.',
  heading: 'This page is not on Vectraa.',
  body: renderNotFoundBody(),
  kind: 'not-found',
  robots: 'noindex',
  ogType: 'website',
};
