// Markdown-to-HTML renderer for Preview mode.
// This produces clean semantic HTML that we style via CSS classes.

import { IMAGE_SCHEME, isImageRef, refToId } from './imageStore.ts';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Note bodies routinely arrive from pasted web pages, and this HTML is handed
 * to dangerouslySetInnerHTML — so a URL is only emitted if its scheme cannot
 * execute. `javascript:` and friends fall through to null and render as text.
 */
export function safeUrl(raw: string): string | null {
  const url = raw.trim();
  if (url.startsWith(IMAGE_SCHEME)) return url;
  if (/^https?:\/\//i.test(url)) return url;
  if (/^mailto:/i.test(url)) return url;
  if (/^[#/]/.test(url)) return url; // in-page anchor or site-relative
  if (/^data:image\/(png|jpe?g|gif|webp|avif|svg\+xml);/i.test(url)) return url;
  return null;
}

/** `![alt](src)` → an <img>, or the literal text if the URL is not safe. */
function renderImage(match: string, alt: string, src: string): string {
  const safe = safeUrl(src);
  if (!safe) return match;
  if (isImageRef(safe)) {
    // src is filled in after mount, once IndexedDB resolves the blob.
    return `<img class="md-image" data-img-id="${refToId(safe)}" alt="${alt}" />`;
  }
  return `<img class="md-image" src="${safe}" alt="${alt}" loading="lazy" />`;
}

// An image alone on its own line is a block, not a word inside a paragraph.
const LONE_IMAGE = /^!\[([^\]]*)\]\(([^)]+)\)\s*$/;

/**
 * Placeholder delimiter for images parked during inline rendering. A private-use
 * code point: it cannot be typed into a note, no markdown rule matches it, and
 * unlike NUL it does not make source files look binary to git.
 */
export const IMG_SLOT = String.fromCharCode(0xE000);

function renderInline(s: string): string {
  let out = escapeHtml(s);
  // Images are parked as placeholders before anything else runs. Their alt text
  // ends up inside an HTML attribute, and the emphasis rules below match raw
  // characters — a filename like "11_58_33 AM" would otherwise get an <em>
  // injected into the middle of alt="…", breaking the tag. Restored at the end.
  const images: string[] = [];
  out = out.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (match, alt: string, src: string) => {
    const html = renderImage(match, alt, src);
    if (html === match) return match; // unsafe URL — left as plain text
    images.push(html);
    return `${IMG_SLOT}${images.length - 1}${IMG_SLOT}`;
  });
  // wiki-links  [[Title]]
  out = out.replace(
    /\[\[([^\]]+)\]\]/g,
    (_m, p1) => `<a class="md-wiki" data-wiki="${escapeHtml(p1)}">[[${escapeHtml(p1)}]]</a>`,
  );
  // inline code  `text`
  out = out.replace(/`([^`\n]+)`/g, '<code class="md-code">$1</code>');
  // bold  **text**
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  // strikethrough  ~~text~~
  out = out.replace(/~~([^~\n]+)~~/g, '<del>$1</del>');
  // underline  <u>text</u>
  out = out.replace(/&lt;u&gt;([^&\n]+)&lt;\/u&gt;/g, '<u>$1</u>');
  // italic  *text* or _text_
  out = out.replace(/(^|[^*_])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
  out = out.replace(/(^|[^*_])_([^_\n]+)_(?!_)/g, '$1<em>$2</em>');
  // markdown links  [text](url). The leading-character capture keeps this off
  // any "![" that renderImage declined to convert.
  out = out.replace(
    /(^|[^!])\[([^\]]+)\]\(([^)]+)\)/g,
    (match, pre: string, text: string, url: string) => {
      const safe = safeUrl(url);
      if (!safe) return match;
      // Leaving for another site earns a new tab; moving around inside this
      // one does not. Site-relative hrefs are how a published folder links
      // its own pages together, and an anchor is a jump within the page —
      // spawning a tab for either is just a tab the reader has to close.
      const leaving = /^(https?:|mailto:)/i.test(safe);
      const target = leaving ? ' target="_blank" rel="noopener noreferrer"' : '';
      return `${pre}<a class="md-link" href="${safe}"${target}>${text}</a>`;
    },
  );
  // Put the images back now that no rule can reach inside their attributes.
  out = out.replace(new RegExp(IMG_SLOT + '(\\d+)' + IMG_SLOT, 'g'), (_m, i: string) => images[Number(i)]);
  return out;
}

export function renderMarkdownHtml(body: string): string {
  const lines = body.split('\n');
  const blocks: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Code block
    if (/^```/.test(line)) {
      const lang = line.replace(/^```/, '').trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) {
        codeLines.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++; // skip closing ```
      const langLabel = lang ? `<div class="md-codeblock-lang">${escapeHtml(lang)}</div>` : '';
      blocks.push(`<pre class="md-codeblock">${langLabel}<code>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
      continue;
    }

    // Callout block
    const calloutMatch = line.match(/^>\s*\[!([^\]]+)\]/);
    if (calloutMatch) {
      const calloutType = calloutMatch[1].toLowerCase();
      const calloutBody: string[] = [];
      const rest = line.replace(/^>\s*\[![^\]]+\]\s*/, '');
      if (rest.trim()) calloutBody.push(rest);
      i++;
      while (i < lines.length && /^>/.test(lines[i])) {
        calloutBody.push(lines[i].replace(/^>\s?/, ''));
        i++;
      }
      blocks.push(
        `<div class="md-callout md-callout-${calloutType}">` +
        `<div class="md-callout-label">${escapeHtml(calloutType)}</div>` +
        `<div class="md-callout-body">${calloutBody.map((l) => renderInline(l)).join('<br/>')}</div>` +
        `</div>`
      );
      continue;
    }

    // Blockquote (non-callout)
    if (/^>\s/.test(line)) {
      const quoteLines: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        quoteLines.push(lines[i].replace(/^>\s?/, ''));
        i++;
      }
      blocks.push(`<blockquote class="md-quote">${quoteLines.map((l) => `<p>${renderInline(l)}</p>`).join('')}</blockquote>`);
      continue;
    }

    // Headings
    const hMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (hMatch) {
      const level = hMatch[1].length;
      const text = renderInline(hMatch[2]);
      blocks.push(`<h${level} class="md-h md-h${level}">${text}</h${level}>`);
      i++;
      continue;
    }

    // A lone image on its own line renders as a figure rather than a word
    // inside a paragraph, so it can size and centre itself.
    const imgOnly = line.match(LONE_IMAGE);
    if (imgOnly) {
      const html = renderInline(line.trim());
      blocks.push(`<figure class="md-figure">${html}</figure>`);
      i++;
      continue;
    }

    // Horizontal rule
    if (/^---+\s*$/.test(line) || /^\*\*\*+\s*$/.test(line)) {
      blocks.push('<hr class="md-hr" />');
      i++;
      continue;
    }

    // Bullet list
    if (/^\s*[-*+]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
        const itemText = lines[i].replace(/^\s*[-*+]\s+/, '');
        items.push(`<li>${renderInline(itemText)}</li>`);
        i++;
      }
      blocks.push(`<ul class="md-ul">${items.join('')}</ul>`);
      continue;
    }

    // Numbered list
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        const itemText = lines[i].replace(/^\s*\d+\.\s+/, '');
        items.push(`<li>${renderInline(itemText)}</li>`);
        i++;
      }
      blocks.push(`<ol class="md-ol">${items.join('')}</ol>`);
      continue;
    }

    // Empty line
    if (line.trim() === '') {
      i++;
      continue;
    }

    // Paragraph (collect consecutive non-empty, non-special lines)
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !/^#{1,6}\s/.test(lines[i]) &&
      !/^```/.test(lines[i]) &&
      !/^>\s/.test(lines[i]) &&
      !/^\s*[-*+]\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i]) &&
      !/^---+\s*$/.test(lines[i])
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    if (paraLines.length > 0) {
      blocks.push(`<p class="md-p">${paraLines.map((l) => renderInline(l)).join('<br/>')}</p>`);
    }
  }

  return blocks.join('\n');
}

/* ============================================================
   Highlights
   ============================================================ */

/** The part of a highlight that decides how the passage is drawn. */
export interface HighlightSpan {
  id: string;
  text: string;
  color: string;
}

const ENTITY_CHARS: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'",
};

/**
 * The inverse of escapeHtml. One pass, so a decoded `&` cannot be read as the
 * start of the next entity: `&amp;lt;` is the text `&lt;`, never `<`.
 */
function unescapeHtml(s: string): string {
  return s.replace(/&(amp|lt|gt|quot|#39);/g, (m, name: string) => ENTITY_CHARS[name] ?? m);
}

/**
 * Index of the `>` closing the tag that opens at `start`, or -1 if the tag
 * never closes. Quotes are tracked because an attribute value may contain a
 * `>` of its own — a URL is the usual way that happens.
 */
function tagEnd(html: string, start: number): number {
  let quote = '';
  for (let i = start + 1; i < html.length; i++) {
    const c = html[i];
    if (quote) {
      if (c === quote) quote = '';
    } else if (c === '"' || c === "'") {
      quote = c;
    } else if (c === '>') {
      return i;
    }
  }
  return -1;
}

/** Wrap every occurrence of a highlight inside one run of escaped text. */
function markText(chunk: string, highlights: HighlightSpan[]): string {
  if (!chunk) return '';
  // Matching happens on the text a reader would select, so a passage can
  // neither hide inside an entity nor be defeated by one: `&amp;` is a single
  // `&` here, exactly as it is on screen.
  const text = unescapeHtml(chunk);

  const spans: { start: number; end: number; hl: HighlightSpan; rank: number }[] = [];
  highlights.forEach((hl, rank) => {
    let from = text.indexOf(hl.text);
    while (from !== -1) {
      spans.push({ start: from, end: from + hl.text.length, hl, rank });
      from = text.indexOf(hl.text, from + hl.text.length);
    }
  });
  if (spans.length === 0) return chunk;

  // Two marks cannot claim the same words: the longer passage wins, and
  // between equals the one made first. A <mark> nested in a <mark> would give
  // the margin two elements answering to one id.
  spans.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start) || a.rank - b.rank);

  let out = '';
  let at = 0;
  for (const s of spans) {
    if (s.start < at) continue;
    out += escapeHtml(text.slice(at, s.start));
    out += `<mark class="hl-${escapeHtml(s.hl.color)}" data-hl-id="${escapeHtml(s.hl.id)}">`
      + escapeHtml(text.slice(s.start, s.end))
      + '</mark>';
    at = s.end;
  }
  return out + escapeHtml(text.slice(at));
}

/**
 * Wrap each highlight's text in a `<mark>`.
 *
 * The passages are found in the document's *text*, never in its markup. A
 * plain replace over the rendered HTML cannot tell the two apart, so
 * highlighting an ordinary word — "class", "data", "code", "figure", a
 * fragment of a URL — used to land a `<mark>` in the middle of an attribute
 * and take the tag down with it.
 *
 * Sound because only this module's own output is walked: every literal `<` in
 * the prose has already been escaped, so every `<` that remains opens a tag.
 */
export function applyHighlights(html: string, highlights: HighlightSpan[]): string {
  const wanted = highlights.filter((h) => h.text.length > 0);
  if (wanted.length === 0) return html;

  const parts: string[] = [];
  let plain = 0;
  let i = 0;
  while (i < html.length) {
    if (html[i] !== '<') { i++; continue; }
    const end = tagEnd(html, i);
    if (end < 0) {
      // An unterminated `<`. It cannot come from the renderer, and markup we
      // cannot read is copied out whole rather than searched.
      parts.push(markText(html.slice(plain, i), wanted), html.slice(i));
      return parts.join('');
    }
    parts.push(markText(html.slice(plain, i), wanted), html.slice(i, end + 1));
    i = end + 1;
    plain = i;
  }
  parts.push(markText(html.slice(plain), wanted));
  return parts.join('');
}
