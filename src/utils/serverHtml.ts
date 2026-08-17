// Braindot — turning fetched HTML into readable markdown, on the server.
//
// Shared by the epub importer and the article importer so a chapter and a
// news story come out looking the same in the reader. Deliberately regex-based
// rather than DOM-based: pulling in jsdom to read a news article would cost
// several megabytes in the bundle for a job that block-level tags describe
// perfectly well.

const ENTITIES: Record<string, string> = {
  nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
  ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’',
  mdash: '—', ndash: '–', hellip: '…', shy: '', middot: '·',
  laquo: '«', raquo: '»', deg: '°', eacute: 'é', egrave: 'è',
};

export function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_m, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&([a-z]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m);
}

/** Stands in for an author's <br> while the source's own wrapping is undone. */
const BR = '';

/** Strip tags and whitespace from a fragment, leaving plain text. */
export function tagText(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
}

/**
 * Convert a block of HTML to markdown.
 *
 * Block elements end a block; inline elements are dropped without breaking the
 * sentence they sit in; each paragraph is reflowed onto one line, because
 * source wrapping is an artefact of how the file was written, not something
 * the author meant.
 */
export function htmlToMarkdownBlocks(html: string, opts: { maxHeading?: number } = {}): string {
  const maxHeading = opts.maxHeading ?? 3;
  let s = html;

  s = s.replace(/<(style|script|head|svg|noscript|template)[^>]*>[\s\S]*?<\/\1>/gi, '');
  s = s.replace(/<!--[\s\S]*?-->/g, '');

  // Images carry meaning in an article; keep them with their alt text.
  s = s.replace(/<img\b[^>]*>/gi, (tag) => {
    const src = tag.match(/\bsrc\s*=\s*["']([^"']+)["']/i)?.[1]
      || tag.match(/\bdata-src\s*=\s*["']([^"']+)["']/i)?.[1];
    if (!src || src.startsWith('data:')) return '';
    const alt = tag.match(/\balt\s*=\s*["']([^"']*)["']/i)?.[1] ?? '';
    return `\n\n![${alt}](${src})\n\n`;
  });

  s = s.replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_m, lvl, inner) => {
    const text = tagText(inner);
    return text ? `\n\n${'#'.repeat(Math.min(Number(lvl), maxHeading))} ${text}\n\n` : '\n\n';
  });

  s = s.replace(/<(em|i)[^>]*>([\s\S]*?)<\/\1>/gi, (_m, _t, inner) => {
    const text = tagText(inner);
    return text ? `*${text}*` : '';
  });
  s = s.replace(/<(strong|b)[^>]*>([\s\S]*?)<\/\1>/gi, (_m, _t, inner) => {
    const text = tagText(inner);
    return text ? `**${text}**` : '';
  });
  s = s.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, (_m, inner) => {
    const text = tagText(inner);
    return text ? `\`${text}\`` : '';
  });
  s = s.replace(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_m, href, inner) => {
    const text = tagText(inner);
    if (!text) return '';
    // A bare in-page or javascript link is not worth a markdown link.
    if (/^(#|javascript:)/i.test(href)) return text;
    // A thumbnail wrapped in a link is a picture, not a link with a picture
    // for a label — nesting them produces [![](src) Headline](href), which
    // reads as punctuation soup. The image comes out of the label.
    const images = [...text.matchAll(/!\[[^\]]*\]\([^)]*\)/g)].map((m) => m[0]).join(' ');
    const label = text.replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();
    if (!label) return images;
    return images ? `${images} [${label}](${href})` : `[${label}](${href})`;
  });

  s = s.replace(/<li[^>]*>/gi, '\n\n- ');
  s = s.replace(/<blockquote[^>]*>/gi, '\n\n> ');
  s = s.replace(/<br\s*\/?>/gi, BR);
  s = s.replace(/<hr\s*\/?>/gi, '\n\n---\n\n');
  s = s.replace(/<\/(p|div|section|article|blockquote|li|tr|figure|figcaption|pre)>/gi, '\n\n');
  s = s.replace(/<[^>]+>/g, '');

  s = decodeEntities(s);

  const blocks = s
    .split(/\n{2,}/)
    .map((b) => b
      .replace(/\s*\n\s*/g, ' ')
      .replace(/[\t  ]+/g, ' ')
      .split(BR).join('\n')
      .trim())
    .filter(Boolean);

  return blocks.join('\n\n').replace(/\n{3,}/g, '\n\n').trim();
}
