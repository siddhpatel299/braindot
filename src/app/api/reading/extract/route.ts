import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Extract text content from uploaded epub or pdf files
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const fileName = file.name.toLowerCase();
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    let title = file.name.replace(/\.(epub|pdf)$/i, '');
    let author = 'Unknown';
    let chapters: { title: string; content: string }[] = [];
    let totalPages = 1;

    if (fileName.endsWith('.epub')) {
      // EPUB is a zip file containing XHTML files
      // We'll extract text from the XHTML content
      try {
        // Use dynamic import to avoid build issues
        const { default: AdmZip } = await import('adm-zip');
        const zip = new AdmZip(buffer);

        // Try to read OPF for metadata
        const opfFiles = zip.getEntries().filter((e: any) => e.entryName.endsWith('.opf'));
        if (opfFiles.length > 0) {
          const opfContent = opfFiles[0].getData().toString('utf8');
          const titleMatch = opfContent.match(/<dc:title[^>]*>([^<]+)<\/dc:title>/i);
          const authorMatch = opfContent.match(/<dc:creator[^>]*>([^<]+)<\/dc:creator>/i);
          if (titleMatch) title = titleMatch[1].trim();
          if (authorMatch) author = authorMatch[1].trim();
        }

        // Extract text from all HTML/XHTML files in the epub
        const htmlEntries = zip.getEntries().filter((e: any) =>
          (e.entryName.endsWith('.html') || e.entryName.endsWith('.xhtml') || e.entryName.endsWith('.htm')) &&
          !e.entryName.includes('toc') &&
          !e.entryName.includes('nav') &&
          !e.entryName.includes('cover')
        );

        for (const entry of htmlEntries) {
          const html = entry.getData().toString('utf8');
          // Extract title from h1/h2 or title tag
          const h1Match = html.match(/<h[12][^>]*>([^<]+)<\/h[12]>/i);
          const chapterTitle = h1Match ? h1Match[1].trim() : `Chapter ${chapters.length + 1}`;

          // Strip HTML tags and get text
          let text = html
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
            .replace(/<[^>]+>/g, '\n')
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/\n{3,}/g, '\n\n')
            .trim();

          if (text.length > 100) {
            // Format as markdown
            const lines = text.split('\n').filter((l: string) => l.trim());
            const formatted = lines.map((l: string) => {
              const trimmed = l.trim();
              if (trimmed.length < 60 && !trimmed.endsWith('.')) {
                return `## ${trimmed}`;
              }
              return trimmed;
            }).join('\n\n');

            chapters.push({ title: chapterTitle, content: `# ${chapterTitle}\n\n${formatted}` });
          }
        }

        if (chapters.length === 0) {
          // Fallback: just extract all text
          let allText = '';
          for (const entry of htmlEntries) {
            const html = entry.getData().toString('utf8');
            allText += html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() + '\n\n';
          }
          if (allText.trim()) {
            chapters.push({ title: title, content: `# ${title}\n\n${allText.trim()}` });
          }
        }

        totalPages = Math.max(chapters.length, 1);
      } catch (e) {
        console.error('EPUB parse error:', e);
      }
    } else if (fileName.endsWith('.pdf')) {
      // For PDF, we need to extract text page by page
      try {
        const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
        const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buffer) });
        const pdf = await loadingTask.promise;
        totalPages = pdf.numPages;

        // Extract text from first 20 pages (to avoid timeout on huge PDFs)
        const maxPages = Math.min(pdf.numPages, 30);
        for (let i = 1; i <= maxPages; i++) {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          const text = textContent.items
            .map((item: any) => item.str)
            .join(' ')
            .replace(/\s+/g, ' ')
            .trim();

          if (text.length > 50) {
            chapters.push({
              title: i === 1 ? 'Introduction' : `Page ${i}`,
              content: `## ${i === 1 ? 'Introduction' : `Page ${i}`}\n\n${text}`,
            });
          }
        }

        // Try to get title from metadata
        const meta = await pdf.getMetadata();
        if (meta?.info?.Title) title = meta.info.Title;
        if (meta?.info?.Author) author = meta.info.Author;

        if (chapters.length === 0) {
          chapters.push({ title: title, content: `# ${title}\n\n*No extractable text found in this PDF. It may be a scanned document.*` });
        }
      } catch (e) {
        console.error('PDF parse error:', e);
        chapters.push({ title: title, content: `# ${title}\n\n*Failed to extract text from this PDF.*` });
      }
    }

    // Combine all chapters into one content string
    const fullContent = chapters.map(c => c.content).join('\n\n---\n\n');

    return NextResponse.json({
      title,
      author,
      content: fullContent || `# ${title}\n\n*No content could be extracted from this file.*`,
      totalPages,
      chapters: chapters.length,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('Extract error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
