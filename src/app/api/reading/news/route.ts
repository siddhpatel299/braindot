import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 30;

// HN item text is HTML — strip tags and decode entities for clean excerpts
function htmlToText(html: string): string {
  return html
    .replace(/<p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .trim();
}

// Fetch tech news from Hacker News API
export async function GET(req: NextRequest) {
  const category = req.nextUrl.searchParams.get('category') || 'tech';

  try {
    if (category === 'tech') {
      const topRes = await fetch('https://hacker-news.firebaseio.com/v0/topstories.json');
      const storyIds: number[] = await topRes.json();
      const top12 = storyIds.slice(0, 12);

      const stories = await Promise.all(
        top12.map(async (id) => {
          const res = await fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`);
          return res.json();
        })
      );

      const items = stories
        .filter((s) => s && s.title && (s.url || s.text))
        .map((s) => ({
          id: `hn_${s.id}`,
          title: s.title,
          author: s.by || 'unknown',
          type: 'url' as const,
          source: 'Hacker News',
          url: s.url || `https://news.ycombinator.com/item?id=${s.id}`,
          score: s.score || 0,
          content: s.text ? htmlToText(s.text) : '',
          time: s.time || 0,
        }));

      return NextResponse.json({ items, category: 'tech' });
    }

    return NextResponse.json({ items: [], category });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg, items: [] }, { status: 500 });
  }
}
