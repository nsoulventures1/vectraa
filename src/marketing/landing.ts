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
  {
    path: '/signature-to-svg',
    title: 'Signature to SVG Converter — Free & Private | Vectraa',
    description: 'Turn a scanned or photographed signature into clean SVG paths with Vectraa. The signature preset runs in your browser, so the image is not uploaded.',
    eyebrow: 'FREE SIGNATURE TO SVG',
    heading: 'Signature → SVG.',
    lead: 'Convert a handwritten signature into scalable SVG paths without uploading the scan.',
    intro: 'A signature is a thin, high-contrast mark. Photographic tracing invents extra colors and nodes. Vectraa includes a signature preset for handwriting and initials, and the scan stays in your browser the whole time.',
    benefits: [
      { title: 'Signature preset', body: 'Tracing tuned for handwriting, initials and other monochrome marks.' },
      { title: 'Private by default', body: 'The scan is not uploaded to Vectraa. Conversion runs on your device.' },
      { title: 'Scales cleanly', body: 'Inspect the curves, then use the SVG in documents, email and print.' },
    ],
  },
  {
    path: '/png-to-svg-for-cricut',
    title: 'PNG to SVG for Cricut — Free Cutting Converter | Vectraa',
    description: 'Convert a PNG into an SVG you can prepare for Cricut, vinyl and laser cutting. Vectraa traces paths in your browser and shows what to check before you cut.',
    eyebrow: 'PNG TO SVG FOR CRICUT',
    heading: 'PNG → SVG for Cricut.',
    lead: 'Turn a high-contrast PNG into SVG paths you can import into Cricut Design Space and other cutting software.',
    intro: 'Cricut follows paths, not pixels. A photograph or a soft shadow becomes a messy cut. Start with a solid silhouette or a flat-color design, trace it in Vectraa, then remove specks and test on scrap. Vectraa does not set blade pressure or material. Your machine software does.',
    benefits: [
      { title: 'Paths, not a wrapped PNG', body: 'The download is SVG geometry a cutter can follow.' },
      { title: 'Complexity you can see', body: 'Check path count and tiny specks before you import the file.' },
      { title: 'No upload', body: 'The PNG is traced in your browser. It is not sent to a conversion server.' },
    ],
  },
  {
    path: '/image-to-vector',
    title: 'Image to Vector Online Free — No Account | Vectraa',
    description: 'Convert an image to a vector online for free with Vectraa. JPG, PNG and WebP become genuine SVG paths in your browser, with no account and no watermark.',
    eyebrow: 'IMAGE TO VECTOR ONLINE FREE',
    heading: 'Image to vector, free online.',
    lead: 'Vectraa is a free online image-to-vector converter for JPG, PNG and WebP. No account, no watermark and no install.',
    intro: 'Online does not have to mean uploaded. Vectraa opens in your browser and traces the artwork on your device. You get SVG paths you can zoom, compare and download. Photographs with soft detail may stay simpler as a high-resolution image. Logos, icons and line art are the strongest candidates.',
    benefits: [
      { title: 'Free, with no account', body: 'Convert and download without signing up.' },
      { title: 'Real vectors', body: 'The SVG is paths, not your photo hidden inside an SVG file.' },
      { title: 'Stays on your device', body: 'The image is not uploaded to a conversion server.' },
    ],
  },
  {
    path: '/png-to-svg-no-upload',
    title: 'PNG to SVG No Upload — Private Converter | Vectraa',
    description: 'Convert PNG to SVG without uploading the file. Vectraa traces transparent artwork to vector paths locally in your browser.',
    eyebrow: 'PNG TO SVG WITH NO UPLOAD',
    heading: 'PNG to SVG, no upload.',
    lead: 'Trace a PNG to SVG without sending the file to a server. Vectraa keeps the image in your browser.',
    intro: 'Many free PNG to SVG sites ask you to upload a logo to their server. Vectraa does the opposite: the file is decoded and traced on your device, then you download the SVG. Transparent backgrounds are detected so logo artwork can keep a clear background.',
    benefits: [
      { title: 'Nothing to upload', body: 'The PNG does not leave the browser for basic conversion.' },
      { title: 'Transparency-aware', body: 'Clear backgrounds are detected before tracing.' },
      { title: 'Download and go', body: 'No account and no watermark on the SVG.' },
    ],
  },
  {
    path: '/convert-logo-to-svg',
    title: 'Convert Logo to SVG — Free & Private | Vectraa',
    description: 'Convert a logo to SVG with Vectraa. Trace a JPG, PNG or WebP logo into clean paths in your browser, then inspect edges before you download.',
    eyebrow: 'CONVERT LOGO TO SVG',
    heading: 'Convert your logo to SVG.',
    lead: 'Turn a raster logo into scalable SVG paths, free, without uploading the file.',
    intro: 'A logo needs smooth edges and a limited palette. Vectraa can treat logo-like artwork with a logo preset and optional Logo Rescue cleanup for noisy JPGs, then export genuine SVG paths. For a longer walkthrough, use the guide on converting a logo without losing quality.',
    benefits: [
      { title: 'Built for logos', body: 'Flat-color marks are traced for recognizable geometry, not photographic detail.' },
      { title: 'Logo Rescue', body: 'Optional local cleanup for compressed JPG logos before the trace.' },
      { title: 'Check the result', body: 'Zoom in and compare with the original before you replace a brand file.' },
    ],
  },
];

export function currentLandingPage(pathname = window.location.pathname): LandingPage | null {
  const normalized = pathname.length > 1 ? pathname.replace(/\/$/, '') : pathname;
  return LANDING_PAGES.find((page) => page.path === normalized) ?? null;
}
