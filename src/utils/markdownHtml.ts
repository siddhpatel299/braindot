// Markdown-to-HTML renderer for Preview mode.
// This produces clean semantic HTML that we style via CSS classes.

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderInline(s: string): string {
  let out = escapeHtml(s);
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
  // markdown links  [text](url)
  out = out.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a class="md-link" href="$2" target="_blank" rel="noopener">$1</a>',
  );
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
