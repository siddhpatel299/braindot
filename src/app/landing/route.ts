import { NextResponse } from 'next/server';
import { readFileSync } from 'fs';
import { join } from 'path';

export const dynamic = 'force-static';

/**
 * The landing page, served as raw HTML rather than through the Next layout.
 *
 * The app's `body` is `height:100dvh; overflow:hidden` — right for a desk that
 * owns the window, wrong for a page someone scrolls — so this route hands back
 * the document itself and keeps the layout out of it.
 *
 * The cost of that is no bundler, which means no `@import` of the design
 * system. The page used to answer that by keeping its own hand-copied palette,
 * and a copy is a thing that drifts: it sat a whole generation behind the app
 * until someone noticed the marketing page and the product were different
 * colours. So the tokens are read off disk here and inlined at the marker
 * instead. One file, two consumers, no second copy to forget.
 */
const TOKENS_MARKER = '/*@design-tokens@*/';

export function GET() {
  const root = process.cwd();
  const html = readFileSync(join(root, 'src/app/landing/landing.html'), 'utf-8');
  const tokens = readFileSync(join(root, 'src/app/glass-tokens.css'), 'utf-8');

  if (!html.includes(TOKENS_MARKER)) {
    // Fail loudly rather than serving an unstyled page: a silent miss here
    // looks like a CSS bug on a surface nobody is watching.
    throw new Error(
      `landing.html is missing the ${TOKENS_MARKER} marker — the design tokens have nowhere to go.`,
    );
  }

  return new NextResponse(html.replace(TOKENS_MARKER, tokens), {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
    },
  });
}
