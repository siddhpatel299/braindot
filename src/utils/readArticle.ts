// Braindot — reading a web page into an article, on the server.
//
// Lives outside the route so the edition builder can call it directly for a
// dozen stories instead of making a dozen HTTP requests to itself.

import { decodeEntities, htmlToMarkdownBlocks, tagText } from '@/utils/serverHtml';
import { isPubliclyFetchable, guardedFetch } from '@/utils/urlGuard';

// Re-exported because the article route answers 400 from it before doing any
// network work.
export { isPubliclyFetchable } from '@/utils/urlGuard';

const FETCH_TIMEOUT_MS = 12_000;
/** Identify honestly. Sites that would rather not be read by software should
 *  be able to tell. */
const READER_HEADERS = {
  'user-agent': 'Mozilla/5.0 (compatible; BraindotReader/1.0; +https://braindot.app)',
  accept: 'text/html,application/xhtml+xml',
  'accept-language': 'en',
};
const MAX_BYTES = 3_000_000;
/** Below this, whatever came back is navigation and cookie banners, not an article. */
const MIN_ARTICLE_CHARS = 600;

export interface ArticleRead {
  ok: boolean;
  /** Why it could not be read, in words a reader can act on. */
  error?: string;
  title: string;
  author: string | null;
  siteName: string;
  leadImage: string | null;
  excerpt: string;
  url: string;
  /** Markdown, including a leading `# title`. Empty when ok is false. */
  content: string;
  /** 'json-ld' when the publisher shipped the text, 'markup' when scraped. */
  via?: 'json-ld' | 'markup';
}

/** Chrome that sits around an article and is never part of it. */
function stripChrome(html: string): string {
  return html
    .replace(/<(nav|header|footer|aside|form|dialog|iframe|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<div\b[^>]*(?:class|id)\s*=\s*["'][^"']*(?:comment|sidebar|related|promo|newsletter|paywall|subscribe|share|social|cookie|advert)[^"']*["'][^>]*>[\s\S]*?<\/div>/gi, '');
}

/** Pull `<meta>` values by property or name. */
function meta(html: string, key: string): string {
  const re = new RegExp(`<meta[^>]+(?:property|name|itemprop)\\s*=\\s*["']${key}["'][^>]*>`, 'i');
  const tag = html.match(re)?.[0];
  const content = tag?.match(/\bcontent\s*=\s*["']([^"']*)["']/i)?.[1];
  return content ? decodeEntities(content).trim() : '';
}

/**
 * Many publishers ship the whole story in a JSON-LD block for search engines.
 * When they do it is cleaner than anything scraped out of the markup.
 */
function jsonLdArticle(html: string): { body: string; author: string; title: string } | null {
  const scripts = [...html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)];
  for (const [, raw] of scripts) {
    try {
      const parsed = JSON.parse(raw.trim());
      const nodes: Record<string, unknown>[] = Array.isArray(parsed)
        ? parsed
        : Array.isArray((parsed as Record<string, unknown>)['@graph'])
          ? (parsed as Record<string, unknown>)['@graph'] as Record<string, unknown>[]
          : [parsed];
      for (const node of nodes) {
        const body = typeof node?.articleBody === 'string' ? node.articleBody : '';
        if (body.length < MIN_ARTICLE_CHARS) continue;
        const rawAuthor = node.author as unknown;
        const author = typeof rawAuthor === 'string'
          ? rawAuthor
          : Array.isArray(rawAuthor)
            ? String((rawAuthor[0] as Record<string, unknown>)?.name ?? '')
            : String((rawAuthor as Record<string, unknown>)?.name ?? '');
        return {
          body: body.split(/\n{2,}|\r\n\r\n/).map((p) => p.trim()).filter(Boolean).join('\n\n'),
          author: author.trim(),
          title: typeof node.headline === 'string' ? node.headline : '',
        };
      }
    } catch {
      // A malformed block is not worth failing the whole read over.
    }
  }
  return null;
}

/** The narrowest region of the page that still holds the whole story. */
function articleRegion(html: string): string {
  for (const tag of ['article', 'main']) {
    const start = html.search(new RegExp(`<${tag}\\b`, 'i'));
    const end = html.toLowerCase().lastIndexOf(`</${tag}>`);
    if (start !== -1 && end > start) return html.slice(start, end);
  }
  const itemprop = html.match(/<div[^>]+itemprop\s*=\s*["']articleBody["'][\s\S]*/i)?.[0];
  if (itemprop) return itemprop;
  // No semantic container: keep the paragraphs and headings in document order
  // and let everything else go.
  const parts = [...html.matchAll(/<(p|h[1-3]|blockquote|ul|ol|pre)\b[^>]*>[\s\S]*?<\/\1>/gi)].map((m) => m[0]);
  return parts.join('\n');
}

/**
 * An index page — a homepage, a blog's front page, a comment thread — is a list
 * of headlines. It extracts to plenty of characters and none of it is a read.
 *
 * Judged per block rather than by overall link density: an encyclopaedia
 * article is full of links too, but they sit *inside* long paragraphs, while an
 * index is made of blocks that are nothing but a link.
 */
function looksLikeIndex(content: string): boolean {
  const blocks = content.split('\n\n').filter((b) => b.trim() && !b.startsWith('#'));
  if (blocks.length < 3) return false;
  const linkOnly = blocks.filter((b) => {
    const linkChars = [...b.matchAll(/\[([^\]]*)\]\([^)]*\)/g)].reduce((n, m) => n + m[1].length, 0);
    return b.length > 0 && linkChars / b.length > 0.6;
  }).length;
  return linkOnly / blocks.length > 0.5;
}

const fail = (url: string, error: string, extra: Partial<ArticleRead> = {}): ArticleRead => ({
  ok: false, error, title: '', author: null, siteName: '', leadImage: null,
  excerpt: '', url, content: '', ...extra,
});

/** Fetch a page and pull the article out of it. Never throws. */
export async function readArticle(target: string): Promise<ArticleRead> {
  const check = isPubliclyFetchable(target);
  if (!check.ok) return fail(target, check.reason);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const fetched = await guardedFetch(check.url, controller.signal, READER_HEADERS);
    if (!fetched.ok) return fail(check.url.toString(), fetched.reason);
    const { res } = fetched;

    if (!res.ok) {
      return fail(check.url.toString(), `The site returned ${res.status}. It may block automated readers.`);
    }
    const type = res.headers.get('content-type') || '';
    if (!/text\/html|application\/xhtml/i.test(type)) {
      return fail(check.url.toString(), 'That address is not a web page.');
    }

    const raw = await res.text();
    const html = raw.length > MAX_BYTES ? raw.slice(0, MAX_BYTES) : raw;

    const title =
      meta(html, 'og:title') ||
      decodeEntities(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '').trim() ||
      check.url.hostname;
    const siteName = meta(html, 'og:site_name') || check.url.hostname.replace(/^www\./, '');
    const leadImage = meta(html, 'og:image') || null;
    const excerpt = meta(html, 'og:description') || meta(html, 'description');

    const structured = jsonLdArticle(html);
    let content = structured?.body ?? '';
    let via: 'json-ld' | 'markup' = 'json-ld';
    if (content.length < MIN_ARTICLE_CHARS) {
      content = htmlToMarkdownBlocks(articleRegion(stripChrome(html)));
      via = 'markup';
    }

    const author =
      structured?.author ||
      meta(html, 'article:author') ||
      meta(html, 'author') ||
      tagText(html.match(/<[^>]+rel\s*=\s*["']author["'][^>]*>([\s\S]*?)<\//i)?.[1] ?? '') ||
      null;

    const base: Partial<ArticleRead> = { title, siteName, leadImage, excerpt, author };

    if (looksLikeIndex(content)) {
      return fail(check.url.toString(),
        'That looks like a list of links rather than a single article — open one of the stories from it instead.',
        base);
    }
    if (content.length < MIN_ARTICLE_CHARS) {
      return fail(check.url.toString(),
        'Only a fragment of this page could be read — it is probably behind a paywall or built by scripts in the browser.',
        base);
    }

    return {
      ok: true,
      title: structured?.title || title,
      author,
      siteName,
      leadImage,
      excerpt,
      url: check.url.toString(),
      via,
      content: `# ${structured?.title || title}\n\n${content}`,
    };
  } catch (err: unknown) {
    const aborted = err instanceof Error && err.name === 'AbortError';
    return fail(target, aborted ? 'The site took too long to answer.' : 'That page could not be reached.');
  } finally {
    clearTimeout(timer);
  }
}
