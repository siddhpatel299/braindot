import { NextRequest, NextResponse } from 'next/server';
import { decodeEntities } from '@/utils/serverHtml';

export const runtime = 'nodejs';
export const maxDuration = 30;

export interface FeedItem {
  id: string;
  title: string;
  author: string;
  type: 'url';
  source: string;
  url: string;
  score: number;
  content: string;
  time: number;
}

/**
 * Where each section comes from.
 *
 * Only `tech` was ever implemented — science, business and world all returned
 * an empty array, so three quarters of the category strip did nothing. These
 * are public RSS feeds from outlets that publish them deliberately: no key,
 * no scraping, and the source is named on every story.
 */
const FEEDS: Record<string, { name: string; url: string }[]> = {
  world: [
    { name: 'BBC News', url: 'https://feeds.bbci.co.uk/news/world/rss.xml' },
    { name: 'The Guardian', url: 'https://www.theguardian.com/world/rss' },
    { name: 'NPR', url: 'https://feeds.npr.org/1004/rss.xml' },
  ],
  business: [
    { name: 'BBC Business', url: 'https://feeds.bbci.co.uk/news/business/rss.xml' },
    { name: 'The Guardian', url: 'https://www.theguardian.com/uk/business/rss' },
  ],
  science: [
    { name: 'BBC Science', url: 'https://feeds.bbci.co.uk/news/science_and_environment/rss.xml' },
    { name: 'NPR Science', url: 'https://feeds.npr.org/1007/rss.xml' },
  ],
};

const clean = (s: string) =>
  decodeEntities(s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, ''))
    .replace(/\s+/g, ' ')
    .trim();

const tag = (xml: string, name: string) =>
  xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, 'i'))?.[1] ?? '';

/** Parse the handful of RSS/Atom fields a reader actually needs. */
function parseFeed(xml: string, sourceName: string): FeedItem[] {
  const entries = [...xml.matchAll(/<(item|entry)\b[^>]*>([\s\S]*?)<\/\1>/gi)];
  return entries.map(([, , body]) => {
    const title = clean(tag(body, 'title'));
    const link =
      clean(tag(body, 'link')) ||
      body.match(/<link[^>]+href\s*=\s*["']([^"']+)["']/i)?.[1] ||
      clean(tag(body, 'guid'));
    const published = tag(body, 'pubDate') || tag(body, 'published') || tag(body, 'updated');
    const summary = clean(tag(body, 'description') || tag(body, 'summary'));
    const parsed = published ? Date.parse(clean(published)) : NaN;
    return {
      id: `rss_${sourceName.toLowerCase().replace(/\W+/g, '')}_${link.slice(-40)}`,
      title,
      author: sourceName,
      type: 'url' as const,
      source: sourceName,
      url: link,
      score: 0,
      content: summary,
      time: Number.isNaN(parsed) ? 0 : Math.floor(parsed / 1000),
    };
  }).filter((i) => i.title && /^https?:\/\//.test(i.url));
}

async function fetchFeed(feed: { name: string; url: string }): Promise<FeedItem[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(feed.url, {
      signal: controller.signal,
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; BraindotReader/1.0)' },
      next: { revalidate: 300 },
    });
    if (!res.ok) return [];
    return parseFeed(await res.text(), feed.name);
  } catch {
    // One outlet being down must not empty the whole section.
    return [];
  } finally {
    clearTimeout(timer);
  }
}

async function hackerNews(): Promise<FeedItem[]> {
  const topRes = await fetch('https://hacker-news.firebaseio.com/v0/topstories.json', {
    next: { revalidate: 300 },
  });
  const ids: number[] = await topRes.json();
  const stories = await Promise.all(
    ids.slice(0, 12).map(async (id) =>
      (await fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`)).json()),
  );
  return stories
    .filter((s) => s && s.title && (s.url || s.text))
    .map((s) => ({
      id: `hn_${s.id}`,
      title: decodeEntities(s.title),
      author: s.by || 'unknown',
      type: 'url' as const,
      source: 'Hacker News',
      url: s.url || `https://news.ycombinator.com/item?id=${s.id}`,
      score: s.score || 0,
      content: s.text ? clean(s.text) : '',
      time: s.time || 0,
    }));
}

/** Every source that feeds the front page, newest first. */
export async function collectNews(category: string): Promise<FeedItem[]> {
  if (category === 'tech') return hackerNews();
  const feeds = FEEDS[category];
  if (!feeds) return [];
  const batches = await Promise.all(feeds.map(fetchFeed));
  // Interleave outlets rather than concatenating them, so one prolific feed
  // cannot take the whole page.
  const merged: FeedItem[] = [];
  const maxLen = Math.max(0, ...batches.map((b) => b.length));
  for (let i = 0; i < maxLen; i++) {
    for (const batch of batches) if (batch[i]) merged.push(batch[i]);
  }
  return merged;
}

export async function GET(req: NextRequest) {
  const category = req.nextUrl.searchParams.get('category') || 'tech';
  try {
    const items = await collectNews(category);
    return NextResponse.json({ items: items.slice(0, 14), category });
  } catch (err: unknown) {
    console.error('[/api/reading/news] error:', err instanceof Error ? err.stack ?? err.message : err);
    return NextResponse.json({ error: 'The feeds could not be reached just now.', items: [] }, { status: 500 });
  }
}
