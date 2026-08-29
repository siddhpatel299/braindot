import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 30;

// Fetch trending research papers from arXiv API
export async function GET(req: NextRequest) {
  const category = req.nextUrl.searchParams.get('category') || 'ai';

  const queries: Record<string, string> = {
    ai: 'cat:cs.AI',
    ml: 'cat:cs.LG',
    cl: 'cat:cs.CL',
    cv: 'cat:cs.CV',
    physics: 'cat:physics',
    bio: 'cat:q-bio',
    math: 'cat:math',
    econ: 'cat:econ',
  };

  const searchQuery = queries[category] || queries.ai;

  try {
    const res = await fetch(
      `http://export.arxiv.org/api/query?search_query=${encodeURIComponent(searchQuery)}&max_results=12&sortBy=submittedDate&sortOrder=descending`,
      { headers: { 'Accept': 'application/xml' } }
    );
    const xml = await res.text();

    const entries: any[] = [];
    const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
    let match;
    while ((match = entryRegex.exec(xml)) !== null) {
      const entry = match[1];
      const title = entry.match(/<title>([\s\S]*?)<\/title>/)?.[1]?.trim().replace(/\n\s+/g, ' ') || '';
      const summary = entry.match(/<summary>([\s\S]*?)<\/summary>/)?.[1]?.trim().replace(/\n\s+/g, ' ') || '';
      const id = entry.match(/<id>([\s\S]*?)<\/id>/)?.[1]?.trim() || '';
      const authorMatches = entry.matchAll(/<name>([\s\S]*?)<\/name>/g);
      const authors: string[] = [];
      for (const am of authorMatches) authors.push(am[1].trim());
      const author = authors.slice(0, 3).join(', ') + (authors.length > 3 ? ' et al.' : '');
      const published = entry.match(/<published>([\s\S]*?)<\/published>/)?.[1]?.trim() || '';
      const link = id.replace('/abs/', '/pdf/');

      entries.push({
        id: `arxiv_${id.split('/abs/')[1] || id}`,
        title,
        author,
        type: 'pdf',
        source: 'arXiv',
        url: link,
        score: 0,
        content: summary,
        time: published ? new Date(published).getTime() / 1000 : 0,
      });
    }

    return NextResponse.json({ items: entries, category });
  } catch (err: unknown) {
    console.error('[/api/reading/papers] error:', err instanceof Error ? err.stack ?? err.message : err);
    return NextResponse.json({ error: 'arXiv could not be reached just now.', items: [] }, { status: 500 });
  }
}
