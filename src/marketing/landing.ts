export type LandingPage = {
  path: string;
  title: string;
  description: string;
  eyebrow: string;
  heading: string;
  lead: string;
  intro: string;
  benefits: Array<{ title: string; body: string }>;
};

export const LANDING_PAGES: LandingPage[] = [
  {
    path: '/png-to-svg',
    title: 'PNG to SVG Converter — Free & Private | Vectraa',
    description: 'Convert PNG artwork to genuine SVG paths in your browser. Preserve transparency, inspect the result and download without an account or watermark.',
    eyebrow: 'FREE PNG TO SVG CONVERTER',
    heading: 'PNG → Vector.',
    lead: 'Turn transparent PNG logos, icons and artwork into clean, scalable SVG paths directly in your browser.',
    intro: 'PNG is excellent for finished raster artwork, but it becomes blurry when enlarged. Vectraa analyzes edges, colors and transparency before choosing a tracing workflow for a reusable SVG.',
    benefits: [
      { title: 'Preserve transparency', body: 'Transparent artwork is detected and routed through a suitable vector workflow.' },
      { title: 'Inspect before download', body: 'Compare the PNG and SVG side by side and zoom in to review edge quality.' },
      { title: 'Private by design', body: 'Core conversion runs locally in your browser without requiring an account.' },
    ],
  },
  {
    path: '/jpg-to-svg',
    title: 'JPG to SVG Converter — Free Online Vectorizer | Vectraa',
    description: 'Convert JPG and JPEG images to editable SVG vector paths with smart tracing, Logo Rescue and private browser processing.',
    eyebrow: 'FREE JPG TO SVG CONVERTER',
    heading: 'JPG → Vector.',
    lead: 'Convert JPEG logos, illustrations and artwork into scalable SVG with automatic analysis and smart tracing.',
    intro: 'JPEG compression can introduce noise and blurred edges. Vectraa evaluates the source first, then applies a suitable preset or Logo Rescue workflow before tracing.',
    benefits: [
      { title: 'Clean compressed artwork', body: 'Logo Rescue can simplify colors, reduce noise and remove near-white backgrounds.' },
      { title: 'Choose the intended use', body: 'Review checks for web, print, branding, packaging, signage and cutting workflows.' },
      { title: 'Download real paths', body: 'The exported SVG contains vector geometry rather than a raster image hidden inside SVG.' },
    ],
  },
  {
    path: '/webp-to-svg',
    title: 'WebP to SVG Converter — Free & Browser-Based | Vectraa',
    description: 'Convert WebP graphics to scalable SVG paths privately in your browser. No account, no watermark and no software installation.',
    eyebrow: 'FREE WEBP TO SVG CONVERTER',
    heading: 'WebP → Vector.',
    lead: 'Transform WebP logos, icons and illustrations into editable, resolution-independent SVG artwork.',
    intro: 'WebP reduces image size for the web, while SVG provides scalable geometry. Vectraa analyzes your WebP and selects an adaptive tracing workflow for its visual structure.',
    benefits: [
      { title: 'Browser-based', body: 'Convert on a current desktop browser without installing design software.' },
      { title: 'Adaptive tracing', body: 'Vectraa compares candidate traces and chooses the strongest result.' },
      { title: 'Production guidance', body: 'Purpose-aware checks flag common risks before you hand the SVG to a vendor.' },
    ],
  },
  {
    path: '/logo-vectorizer',
    title: 'Free Logo Vectorizer — Convert Logo to SVG | Vectraa',
    description: 'Vectorize a JPG, PNG or WebP logo into clean SVG paths. Restore poor logo files with local Logo Rescue and smart color tracing.',
    eyebrow: 'FREE LOGO VECTORIZER',
    heading: 'Logo → Vector.',
    lead: 'Recover scalable brand artwork from JPG, PNG and WebP logo files with purpose-built tracing and Logo Rescue.',
    intro: 'Logos need clean edges, controlled colors and reusable geometry. Vectraa detects logo-like artwork and can apply local cleanup before generating genuine SVG paths.',
    benefits: [
      { title: 'Logo Rescue', body: 'Reduce JPEG noise, simplify colors and remove near-white backgrounds before tracing.' },
      { title: 'Brand-color focus', body: 'Logo workflows prioritize strong flat-color regions and recognizable geometry.' },
      { title: 'Ready for handoff', body: 'Download a branding-focused SVG and verify final production requirements with your vendor.' },
    ],
  },
  {
    path: '/image-to-svg',
    title: 'Image to SVG Converter — Free Online Vectorizer | Vectraa',
    description: 'Convert JPG, PNG and WebP images to genuine SVG vector paths with adaptive tracing, comparison tools and private local processing.',
    eyebrow: 'FREE IMAGE TO SVG CONVERTER',
    heading: 'Image → Vector.',
    lead: 'Convert raster artwork into scalable SVG paths with automatic image analysis and best-of-three tracing.',
    intro: 'Different artwork needs different treatment. Vectraa evaluates detail, colors, transparency and edge structure before recommending a vector workflow.',
    benefits: [
      { title: 'Automatic analysis', body: 'Artwork is classified as a logo, illustration, line art, signature or high-detail image.' },
      { title: 'Best-of-three tracing', body: 'Multiple candidates are compared instead of returning the first available trace.' },
      { title: 'Honest quality checks', body: 'Review fidelity, vector health, path count, file size and workflow warnings.' },
    ],
  },
  {
    path: '/line-art-vectorizer',
    title: 'Line Art Vectorizer — Convert Drawing to SVG | Vectraa',
    description: 'Convert line drawings, signatures and monochrome artwork to scalable SVG paths with a dedicated browser-based tracing preset.',
    eyebrow: 'FREE LINE ART VECTORIZER',
    heading: 'Line art → Vector.',
    lead: 'Create scalable SVG paths from drawings, outlines, signatures and high-contrast monochrome artwork.',
    intro: 'Fine outlines need different tracing settings than colorful logos or photographs. Vectraa provides dedicated line-art and signature presets to preserve useful structure.',
    benefits: [
      { title: 'Fine-line preset', body: 'Use tracing tuned for outlines and high-contrast source artwork.' },
      { title: 'Zoom inspection', body: 'Inspect the vector at up to 4× before downloading it.' },
      { title: 'Cutting guidance', body: 'Check common complexity risks for Cricut and laser workflows before production.' },
    ],
  },
];

export function currentLandingPage(pathname = window.location.pathname): LandingPage | null {
  const normalized = pathname.length > 1 ? pathname.replace(/\/$/, '') : pathname;
  return LANDING_PAGES.find((page) => page.path === normalized) ?? null;
}
