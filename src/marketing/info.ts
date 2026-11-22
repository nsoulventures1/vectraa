export type InfoPage = {
  path: '/privacy' | '/about';
  title: string;
  description: string;
  eyebrow: string;
  heading: string;
  lead: string;
  sections: Array<{ heading: string; paragraphs: string[] }>;
};

export const INFO_PAGES: InfoPage[] = [
  {
    path: '/privacy',
    title: 'Privacy Policy | Vectraa',
    description: 'Vectraa converts images to SVG in your browser. The picture and the SVG never leave your device, and you do not need an account.',
    eyebrow: 'PRIVACY POLICY',
    heading: 'Your images never leave the browser.',
    lead: 'Vectraa is a free image-to-SVG converter that runs on your device. The picture you choose is not uploaded to us.',
    sections: [
      {
        heading: 'What stays on your device',
        paragraphs: [
          'The JPG, PNG or WebP you open is decoded and traced in your browser. Vectraa does not receive the image, and it does not receive the SVG. Closing the tab discards the picture from the converter.',
          'Basic conversion does not require an account, and the downloaded SVG has no watermark.',
        ],
      },
      {
        heading: 'What a page view can still include',
        paragraphs: [
          'Like most websites, the network that hosts Vectraa can see that your browser requested a page. Cloudflare Web Analytics, when it is turned on for vectraa.com, records a page view. That measurement does not include your image or your SVG.',
        ],
      },
      {
        heading: 'History stored in this browser',
        paragraphs: [
          'After a successful conversion, Vectraa can save a short note on this device: the file name, the time, the preset, and quality figures. That note does not include the image or the SVG.',
          'Clear it from the workspace on the converter, or clear this site’s data in your browser. The note stays on that device until you do.',
        ],
      },
      {
        heading: 'Accounts and cookies',
        paragraphs: [
          'The public converter does not ask you to sign in and does not set an advertising cookie. If an optional account is added later, this page will describe it before it is turned on.',
        ],
      },
    ],
  },
  {
    path: '/about',
    title: 'About Vectraa — Private Image to SVG Converter',
    description: 'Vectraa is a free, private, in-browser converter that turns JPG, PNG and WebP artwork into genuine SVG paths. Images are not uploaded.',
    eyebrow: 'ABOUT VECTRAA',
    heading: 'Vectraa converts images to vectors, privately.',
    lead: 'Vectraa (vectraa.com) turns JPG, PNG and WebP artwork into real SVG paths, free, in your browser.',
    sections: [
      {
        heading: 'What you can convert',
        paragraphs: [
          'Logos, icons, line art, signatures and other simple artwork are the strongest fits. Vectraa compares the original with the vector so you can inspect edges before you download.',
          'The file you download is SVG geometry. It is not your photo wrapped inside an SVG.',
        ],
      },
      {
        heading: 'Why it stays in the browser',
        paragraphs: [
          'Tracing runs on your device. Vectraa does not upload the image for basic conversion, does not require an account, and does not add a watermark.',
          'You can read the plain-language version of that promise on the privacy policy.',
        ],
      },
      {
        heading: 'Where to start',
        paragraphs: [
          'Open the converter and drop in a PNG, JPG or WebP. Guides cover converting a logo, choosing PNG or SVG for print, preparing a file for Cricut or laser cutting, and reducing SVG nodes after a trace.',
        ],
      },
    ],
  },
];

export function currentInfoPage(pathname: string): InfoPage | null {
  const normalized = pathname.length > 1 ? pathname.replace(/\/$/, '') : pathname;
  return INFO_PAGES.find((page) => page.path === normalized) ?? null;
}
