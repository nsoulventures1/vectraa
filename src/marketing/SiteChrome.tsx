import type { ReactNode } from 'react';
import type { Faq } from './faq';

export function FaqList({ items }: { items: Faq[] }) {
  return <div className="faqList">{items.map((item) => <details key={item.question}><summary>{item.question}</summary><p>{item.answer}</p></details>)}</div>;
}

export function SiteFooter({ extra }: { extra?: ReactNode }) {
  return <footer className="footer"><div><a className="brand" href="/">Vectraa<span>.</span></a><p>Private, browser-based image vectorization. No account and no watermark.</p></div><nav><a href="/about">About</a><a href="/privacy">Privacy</a><a href="/#faq">FAQ</a><a href="/sitemap.xml">Sitemap</a>{extra}</nav></footer>;
}
