import { NextRequest, NextResponse } from 'next/server';
import { readArticle, isPubliclyFetchable } from '@/utils/readArticle';
import { guard, HOUR, DAY } from '@/lib/apiGuard';

export const runtime = 'nodejs';
export const maxDuration = 30;

/**
 * This endpoint fetches an address the caller chooses, which makes the
 * deployment a general-purpose retriever for anyone who finds it. urlGuard
 * decides *where* it may reach; this decides *how often*. Without it the
 * server's address and bandwidth are free to borrow in a loop — and a fetch
 * originating from us is a fetch attributed to us.
 *
 * Set well above what reading looks like: saving a dozen articles in an
 * afternoon is a normal session, a thousand is not a reader.
 */
const ARTICLE_QUOTA = { user: 120, userWindowMs: HOUR, anon: 10, anonWindowMs: DAY };

export async function POST(req: NextRequest) {
  let target = '';
  try {
    const body = await req.json();
    target = String(body?.url ?? '');
  } catch {
    return NextResponse.json({ error: 'Send a JSON body with a url.' }, { status: 400 });
  }

  // A refused address is the caller's mistake and worth a 400; a page that
  // simply could not be read is a normal outcome and answered with 200 so the
  // client can show the reason next to the link.
  //
  // Checked before the meter so a typo does not cost the reader an allowance.
  const check = isPubliclyFetchable(target);
  if (!check.ok) return NextResponse.json({ error: check.reason }, { status: 400 });

  const allowed = await guard(req, 'article', ARTICLE_QUOTA);
  if (!allowed.ok) return allowed.response;

  const article = await readArticle(target);
  if (!article.ok) {
    return NextResponse.json({
      error: article.error,
      title: article.title || null,
      siteName: article.siteName || null,
      leadImage: article.leadImage,
      excerpt: article.excerpt,
      url: article.url,
    });
  }

  return NextResponse.json({
    title: article.title,
    author: article.author,
    siteName: article.siteName,
    leadImage: article.leadImage,
    excerpt: article.excerpt,
    url: article.url,
    via: article.via,
    words: article.content.split(/\s+/).length,
    content: article.content,
  });
}
