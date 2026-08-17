import { NextRequest, NextResponse } from 'next/server';
import { readArticle, isPubliclyFetchable } from '@/utils/readArticle';

export const runtime = 'nodejs';
export const maxDuration = 30;

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
  const check = isPubliclyFetchable(target);
  if (!check.ok) return NextResponse.json({ error: check.reason }, { status: 400 });

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
