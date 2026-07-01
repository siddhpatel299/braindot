import { NextResponse } from 'next/server';
import { readFileSync } from 'fs';
import { join } from 'path';

export const dynamic = 'force-static';

// Serve the landing page as raw HTML — NOT wrapped in the Next.js layout
// This fixes the scrolling issue (the layout's body had overflow:hidden)
export function GET() {
  const html = readFileSync(join(process.cwd(), 'src/app/landing/landing.html'), 'utf-8');
  return new NextResponse(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
    },
  });
}
