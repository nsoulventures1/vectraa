export type Faq = {
  question: string;
  answer: string;
};

export const HOME_FAQS: Faq[] = [
  {
    question: 'Is the downloaded file a real vector?',
    answer: 'Yes. Vectraa exports SVG geometry made from vector paths rather than embedding your original raster image inside an SVG wrapper.',
  },
  {
    question: 'Does my image leave my browser?',
    answer: 'No. Vectraa traces JPG, PNG and WebP images on your device. The picture and the SVG are not uploaded to Vectraa.',
  },
  {
    question: 'Can I use the SVG for printing or cutting?',
    answer: 'SVG is suitable for many print and cutting workflows. Always confirm final size, colors and machine settings with your printer, Cricut software or production vendor.',
  },
];
