// Convert pasted rich HTML (articles, docs, web pages) into clean Markdown
// so it renders properly in the editor's preview. When the clipboard has no
// HTML — plain text, or copied Markdown — we leave it untouched.

import TurndownService from 'turndown';

let service: TurndownService | null = null;

function getService(): TurndownService {
  if (service) return service;
  const td = new TurndownService({
    headingStyle: 'atx', // # Heading
    hr: '---',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
    emDelimiter: '*',
    strongDelimiter: '**',
    linkStyle: 'inlined',
  });

  // Drop noise that carries no reading value
  td.remove(['script', 'style', 'noscript', 'iframe', 'head', 'meta', 'link', 'button', 'svg']);

  // Strikethrough (turndown core doesn't cover <del>/<s>)
  td.addRule('strikethrough', {
    filter: ['del', 's'] as unknown as (keyof HTMLElementTagNameMap)[],
    replacement: (content) => `~~${content}~~`,
  });

  // <figure><img><figcaption> → image + italic caption
  td.addRule('figure', {
    filter: 'figure',
    replacement: (_content, node) => {
      const el = node as HTMLElement;
      const img = el.querySelector('img');
      const cap = el.querySelector('figcaption');
      const alt = img?.getAttribute('alt') || '';
      const src = img?.getAttribute('src') || '';
      const parts: string[] = [];
      if (src) parts.push(`![${alt}](${src})`);
      if (cap?.textContent?.trim()) parts.push(`*${cap.textContent.trim()}*`);
      return parts.length ? `\n\n${parts.join('\n')}\n\n` : '';
    },
  });

  service = td;
  return td;
}

/** True when the pasted HTML is worth converting (has real structure). */
export function looksLikeRichHtml(html: string): boolean {
  if (!html) return false;
  // A single wrapping <meta>/<span> from a plain-text copy isn't "rich"
  return /<(h[1-6]|p|ul|ol|li|blockquote|pre|code|a|strong|em|b|i|table|img|figure|br|hr|div)\b/i.test(html);
}

export function htmlToMarkdown(html: string): string {
  try {
    const md = getService().turndown(html);
    // Collapse the excessive blank lines turndown can leave behind
    return md.replace(/\n{3,}/g, '\n\n').trim();
  } catch {
    return '';
  }
}
