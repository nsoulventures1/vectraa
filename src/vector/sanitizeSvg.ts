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

  // ImageTracer commonly emits hundreds or thousands of adjacent path elements
  // with identical paint attributes. They are visually one colour layer, but each
  // tiny fragment becomes a separate SVG object. Merge only consecutive compatible
  // paths so paint order/layering is preserved while the resulting SVG becomes far
  // smaller and much more practical to edit in Illustrator/Inkscape/CorelDRAW.
  clean = mergeConsecutiveCompatiblePaths(clean);

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

function mergeConsecutiveCompatiblePaths(svg: string): string {
  const pathTag = /<path\b([^>]*?)\s*\/\s*>/gi;
  const matches = [...svg.matchAll(pathTag)];
  if (matches.length < 2) return svg;

  let output = '';
  let cursor = 0;
  let pendingAttrs: string | null = null;
  let pendingComparable: string | null = null;
  let pendingD = '';
  let pendingGap = '';

  const flush = () => {
    if (pendingAttrs === null) return;
    const attrsWithoutD = pendingAttrs.replace(/\s+d\s*=\s*"[^"]*"/i, '').trim();
    output += `<path ${attrsWithoutD} d="${pendingD.trim()}" />`;
    output += pendingGap;
    pendingAttrs = null;
    pendingComparable = null;
    pendingD = '';
    pendingGap = '';
  };

  for (const match of matches) {
    const start = match.index ?? 0;
    const gap = svg.slice(cursor, start);
    const attrs = match[1];
    const dMatch = attrs.match(/\s+d\s*=\s*"([^"]*)"/i);

    if (!dMatch) {
      flush();
      output += gap + match[0];
      cursor = start + match[0].length;
      continue;
    }

    const comparable = normalizePathAttributes(attrs.replace(dMatch[0], ''));
    const onlyWhitespaceGap = /^\s*$/.test(gap);

    if (pendingAttrs !== null && onlyWhitespaceGap && comparable === pendingComparable) {
      pendingD += ` ${dMatch[1].trim()}`;
      pendingGap = gap;
    } else {
      flush();
      output += gap;
      pendingAttrs = attrs;
      pendingComparable = comparable;
      pendingD = dMatch[1];
      pendingGap = '';
    }

    cursor = start + match[0].length;
  }

  flush();
  output += svg.slice(cursor);
  return output;
}

function normalizePathAttributes(attrs: string): string {
  return attrs
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\s*=\s*/g, '=');
}
