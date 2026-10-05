export type GuideSection = {
  heading: string;
  paragraphs: string[];
  tips?: string[];
};

export type GuidePage = {
  path: string;
  title: string;
  description: string;
  eyebrow: string;
  heading: string;
  lead: string;
  updated: string;
  readingTime: string;
  sections: GuideSection[];
  relatedConverter: { path: string; label: string };
};

export const GUIDE_PAGES: GuidePage[] = [
  {
    path: '/guides/convert-logo-to-svg',
    title: 'How to Convert a Logo to SVG Without Losing Quality | Vectraa',
    description: 'Learn how to convert a JPG or PNG logo to a clean SVG, choose the right source file, inspect tracing quality and avoid common vectorization problems.',
    eyebrow: 'LOGO VECTORIZATION GUIDE',
    heading: 'How to convert a logo to SVG without losing quality',
    lead: 'A practical workflow for turning raster brand artwork into scalable paths while preserving edges, colors and recognizable geometry.',
    updated: 'October 5, 2026',
    readingTime: '6 min read',
    relatedConverter: { path: '/logo-vectorizer', label: 'Vectorize your logo free' },
    sections: [
      {
        heading: 'Start with the strongest source file',
        paragraphs: ['Vector tracing can only interpret the pixels it receives. Use the largest, cleanest version of the logo you can find. A transparent PNG is usually better than a small JPEG copied from a website because JPEG compression creates fuzzy edges and stray colors.'],
        tips: ['Prefer a large PNG or lossless image.', 'Avoid screenshots, shadows and textured backgrounds.', 'Crop excess space so the logo fills the canvas.'],
      },
      {
        heading: 'Use logo-focused tracing',
        paragraphs: ['Logos usually need fewer colors, smoother boundaries and less noise than photographs. Vectraa detects logo-like artwork and can apply Logo Rescue to simplify compression artifacts, remove a near-white background and compare multiple trace candidates before choosing a result.'],
      },
      {
        heading: 'Inspect the SVG before using it',
        paragraphs: ['Zoom in on curves, corners and small lettering. Compare the vector against the original, then check path count, approximate nodes and file size. A visually accurate result with an extreme node count can be difficult to edit or cut.'],
        tips: ['Check thin gaps and enclosed counters in letters.', 'Confirm brand colors against an approved reference.', 'Ask your printer or fabricator about required color and cutting settings.'],
      },
      {
        heading: 'Know when automatic tracing is not enough',
        paragraphs: ['Very small text, gradients, photographic effects and badly damaged artwork may need manual redrawing. Automatic vectorization is strongest when the original has clear edges and a limited palette. Keep the original image as a visual reference and never replace an approved brand master without review.'],
      },
    ],
  },
  {
    path: '/guides/png-vs-svg-for-printing',
    title: 'PNG vs SVG for Printing: Which Format Should You Use? | Vectraa',
    description: 'Compare PNG and SVG for printing, signage, apparel and packaging. Learn when a raster image is enough and when scalable vector paths are the better choice.',
    eyebrow: 'PRINT FILE GUIDE',
    heading: 'PNG vs SVG for printing: which format should you use?',
    lead: 'Choose the right artwork format for print, packaging, apparel and signage without confusing resolution with vector quality.',
    updated: 'October 5, 2026',
    readingTime: '5 min read',
    relatedConverter: { path: '/png-to-svg', label: 'Convert PNG to SVG free' },
    sections: [
      {
        heading: 'The short answer',
        paragraphs: ['Use SVG for logos, icons, lettering and flat illustrations that must scale cleanly. Use PNG for photographs, textured artwork and finished raster graphics when the pixel dimensions are already sufficient for the final print size.'],
      },
      {
        heading: 'Why SVG scales cleanly',
        paragraphs: ['SVG describes shapes and paths instead of storing a fixed grid of pixels. A genuine vector can be enlarged without becoming blocky, which makes it useful for signs, packaging and other jobs that may reuse the same artwork at many sizes.'],
        tips: ['Confirm that the SVG contains paths rather than an embedded raster image.', 'Outline or supply fonts when the production vendor requests it.', 'Review colors and transparency in the vendor’s preferred software.'],
      },
      {
        heading: 'When PNG is still the better file',
        paragraphs: ['Photographs and complex painted effects can require thousands of vector shapes. In those cases a high-resolution PNG may look better, remain smaller and be easier for the print workflow to process. The required pixel dimensions depend on the physical size and the printer’s specifications.'],
      },
      {
        heading: 'Prepare files for a production handoff',
        paragraphs: ['Export the SVG at the intended proportions, inspect small details and keep a reference PNG alongside it. Always ask the production vendor which color mode, bleed, fonts and file format they require; SVG support varies between print and machine workflows.'],
      },
    ],
  },
  {
    path: '/guides/prepare-svg-for-cricut-laser-cutting',
    title: 'How to Prepare an SVG for Cricut and Laser Cutting | Vectraa',
    description: 'Prepare SVG artwork for Cricut, vinyl and laser cutting by cleaning paths, removing tiny details, checking closed shapes and testing machine-specific settings.',
    eyebrow: 'CUTTING WORKFLOW GUIDE',
    heading: 'How to prepare an SVG for Cricut and laser cutting',
    lead: 'Turn traced artwork into a practical cutting file by controlling complexity, overlaps, small gaps and production tolerances.',
    updated: 'October 5, 2026',
    readingTime: '6 min read',
    relatedConverter: { path: '/line-art-vectorizer', label: 'Vectorize line art free' },
    sections: [
      {
        heading: 'Begin with simple, high-contrast artwork',
        paragraphs: ['Cutting machines follow geometry, not visual appearance. Solid silhouettes, clear outlines and limited colors are easier to prepare than photographs, soft shadows or textured artwork. Use the line-art preset for monochrome drawings and the logo preset for flat-color designs.'],
      },
      {
        heading: 'Reduce unnecessary complexity',
        paragraphs: ['Thousands of tiny paths and nodes can slow design software and create rough motion. Inspect the vector health report, remove specks and simplify details that are smaller than the material or machine can reproduce.'],
        tips: ['Delete isolated paths caused by image noise.', 'Merge touching shapes when the workflow requires a single cut.', 'Keep enough space between adjacent cut lines.'],
      },
      {
        heading: 'Check shapes, layers and overlaps',
        paragraphs: ['Closed shapes are important for many fill and cutting operations. Look for doubled outlines, open ends and stacked shapes that could make the machine repeat a cut. Separate colors into deliberate layers when producing multi-color vinyl or engraving passes.'],
      },
      {
        heading: 'Test before final production',
        paragraphs: ['Machine, blade, power, speed and material settings are not stored reliably as universal SVG instructions. Import the SVG into the machine’s software, check its physical dimensions and run a small test using the exact material. Follow the manufacturer’s safety guidance and never leave a laser unattended.'],
      },
    ],
  },
  {
    path: '/guides/reduce-svg-nodes',
    title: 'How to Reduce SVG Nodes and File Size After Tracing | Vectraa',
    description: 'Learn why traced SVG files contain too many nodes, how to simplify paths without ruining shapes, and how to balance visual accuracy with editability.',
    eyebrow: 'SVG CLEANUP GUIDE',
    heading: 'How to reduce SVG nodes and file size after tracing',
    lead: 'Make automatically traced vectors easier to edit, share and manufacture without flattening the details that matter.',
    updated: 'October 5, 2026',
    readingTime: '5 min read',
    relatedConverter: { path: '/image-to-svg', label: 'Create a cleaner SVG' },
    sections: [
      {
        heading: 'Why traced SVGs become complex',
        paragraphs: ['A tracer follows visible pixel boundaries. Compression noise, gradients, shadows and textured backgrounds create many small color regions, which can become separate paths with large numbers of nodes. More nodes do not automatically mean a more accurate or useful vector.'],
      },
      {
        heading: 'Clean the raster before tracing',
        paragraphs: ['Cropping, denoising and reducing unimportant colors can prevent complexity instead of repairing it later. For poor logo files, Vectraa’s Logo Rescue performs local cleanup before tracing. For photographs, accept that high visual fidelity often requires more geometry.'],
        tips: ['Remove an unwanted background.', 'Increase useful contrast without clipping thin details.', 'Use the preset that matches the artwork type.'],
      },
      {
        heading: 'Balance fidelity and editability',
        paragraphs: ['Compare the result at the size where it will actually be used. Simplify smooth curves carefully, then check corners, lettering and small gaps. If a reduction changes the silhouette or closes an important gap, undo it and keep more detail in that region.'],
      },
      {
        heading: 'Use the quality report as a warning system',
        paragraphs: ['Vectraa reports paths, approximate nodes, SVG size and visual fidelity. Treat these as diagnostic signals rather than a universal pass or fail score. A detailed illustration can legitimately be complex, while a simple logo should usually remain compact.'],
      },
    ],
  },
];

export function currentGuidePage(pathname = window.location.pathname): GuidePage | null {
  const normalized = pathname.length > 1 ? pathname.replace(/\/$/, '') : pathname;
  return GUIDE_PAGES.find((page) => page.path === normalized) ?? null;
}
