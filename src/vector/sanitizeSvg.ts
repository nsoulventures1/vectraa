const FORBIDDEN_TAGS = ['script', 'foreignObject', 'iframe', 'object', 'embed', 'image', 'audio', 'video', 'canvas'];
const EVENT_ATTR = /\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi;
const DANGEROUS_HREF = /\s(?:href|xlink:href)\s*=\s*(["'])(?:\s*(?:javascript:|data:text\/html|https?:|\/\/)[\s\S]*?)\1/gi;
const DANGEROUS_STYLE_URL = /url\(\s*(['"]?)(?:javascript:|data:text\/html|https?:|\/\/)[\s\S]*?\1\s*\)/gi;

export function sanitizeGeneratedSvg(svg: string): string {
  let clean = svg;

  for (const tag of FORBIDDEN_TAGS) {
    const paired = new RegExp(`<${tag}\\b[\\s\\S]*?<\\/${tag}\\s*>`, 'gi');
    const selfClosing = new RegExp(`<${tag}\\b[^>]*?\\/?>`, 'gi');
    clean = clean.replace(paired, '').replace(selfClosing, '');
  }

  clean = clean
    .replace(EVENT_ATTR, '')
    .replace(DANGEROUS_HREF, '')
    .replace(DANGEROUS_STYLE_URL, 'none')
    .replace(/javascript:/gi, '')
    .replace(/data:text\/html/gi, '');

  return clean.trim();
}

export function containsForbiddenSvgContent(svg: string): boolean {
  const forbiddenTag = new RegExp(`<(?:${FORBIDDEN_TAGS.join('|')})\\b`, 'i');
  return forbiddenTag.test(svg)
    || /\son[a-z]+\s*=/i.test(svg)
    || /javascript:/i.test(svg)
    || /data:text\/html/i.test(svg)
    || /(?:href|xlink:href)\s*=\s*["']\s*(?:https?:|\/\/)/i.test(svg);
}
