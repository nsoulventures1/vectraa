export function cleanSvgForExport(svg: string): string {
  return svg
    .replace(/<!--([\s\S]*?)-->/g, '')
    .replace(/<metadata\b[\s\S]*?<\/metadata>/gi, '')
    .replace(/\sdata-[\w-]+=("[^"]*"|'[^']*')/gi, '')
    .replace(/>\s+</g, '><')
    .trim();
}

export function svgFilename(originalName?: string, suffix = ''): string {
  const base = (originalName || 'vectraa')
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-z0-9_-]+/gi, '-')
    .replace(/^-+|-+$/g, '') || 'vectraa';
  return `${base}${suffix}.svg`;
}

export function downloadSvg(svg: string, filename: string): void {
  const clean = cleanSvgForExport(svg);
  const url = URL.createObjectURL(new Blob([clean], { type: 'image/svg+xml;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
