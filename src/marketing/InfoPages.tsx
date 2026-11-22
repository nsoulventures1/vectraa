import { GUIDE_PAGES } from './guides';
import type { InfoPage } from './info';
import { LANDING_PAGES } from './landing';
import { SiteFooter } from './SiteChrome';

function Header() {
  return <header className="nav"><a className="brand" href="/">Vectraa<span>.</span></a><nav className="navLinks"><a href="/">Converter</a><a href="/about">About</a><a href="/privacy">Privacy</a></nav><div className="privacy">Private by design · processed on your device</div></header>;
}

function Directories() {
  return <>
    <section className="contentSection guideDirectory"><span className="sectionKicker">VECTOR LEARNING CENTER</span><h2>Get a better result before you export.</h2><div className="guideCards">{GUIDE_PAGES.map((guide) => <a key={guide.path} href={guide.path}><span>{guide.eyebrow}</span><strong>{guide.heading}</strong><small>{guide.readingTime}</small></a>)}</div></section>
    <section className="contentSection converterDirectory"><span className="sectionKicker">EXPLORE CONVERTERS</span><h2>Start with the workflow that matches your artwork.</h2><nav>{LANDING_PAGES.map((page) => <a key={page.path} href={page.path}>{page.heading}</a>)}</nav></section>
  </>;
}

export function InfoPageView({ page }: { page: InfoPage }) {
  return <main>
    <Header />
    <article className="guidePage">
      <header className="guideHero"><p className="eyebrow">{page.eyebrow}</p><h1>{page.heading}</h1><p className="lead">{page.lead}</p></header>
      <div className="guideBody">
        {page.sections.map((section) => <section key={section.heading}><h2>{section.heading}</h2>{section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</section>)}
        {page.path === '/privacy' ? <p><a className="guideCta" href="/">Back to the converter</a></p> : <p><a className="guideCta" href="/privacy">Read the privacy policy</a></p>}
      </div>
    </article>
    <Directories />
    <SiteFooter />
  </main>;
}

const NOT_FOUND_LINKS = [
  { href: '/', label: 'Image to SVG converter' },
  { href: '/png-to-svg', label: 'PNG to SVG' },
  { href: '/convert-logo-to-svg', label: 'Convert logo to SVG' },
  { href: '/signature-to-svg', label: 'Signature to SVG' },
  { href: '/about', label: 'About Vectraa' },
  { href: '/privacy', label: 'Privacy' },
];

export function NotFoundPage() {
  return <main>
    <Header />
    <article className="guidePage">
      <header className="guideHero"><p className="eyebrow">404</p><h1>This page is not on Vectraa.</h1><p className="lead">The address does not match a converter, guide, or policy page. The image converter is still on the homepage.</p></header>
      <section className="contentSection converterDirectory"><span className="sectionKicker">TRY ONE OF THESE</span><h2>Popular Vectraa pages</h2><nav>{NOT_FOUND_LINKS.map((link) => <a key={link.href} href={link.href}>{link.label}</a>)}</nav></section>
    </article>
    <SiteFooter />
  </main>;
}
