import { NextRequest, NextResponse } from 'next/server';
import { decodeEntities, htmlToMarkdownBlocks } from '@/utils/serverHtml';
import { guard, HOUR, DAY } from '@/lib/apiGuard';

export const runtime = 'nodejs';
export const maxDuration = 60;

/** Time allowed for reading pages, well inside maxDuration so the response
 *  itself still has room to be built and sent. */
const PDF_TIME_BUDGET_MS = 40_000;
/** A backstop for pathological files, not a judgement about book length. */
const HARD_PAGE_CAP = 2000;

/**
 * Importing a book is the most expensive thing an anonymous caller can ask
 * this server to do — a zip is decompressed whole, hundreds of PDF pages are
 * parsed, and every illustration is re-encoded through sharp. It was the one
 * costly route with no meter on it, so the allowance the AI routes have
 * applies here too. Importing is a deliberate act a few times a session, not
 * a loop, so these are generous.
 */
const EXTRACT_QUOTA = { user: 30, userWindowMs: HOUR, anon: 3, anonWindowMs: DAY };

/**
 * The largest file that will be read.
 *
 * A cap has to exist and has to be checked before the body is buffered:
 * `formData()` reads the whole upload into memory first, so without this a
 * single request decides how much memory the instance uses. 40MB clears a
 * long illustrated book with room to spare — and note that a platform in
 * front of this may well have a smaller limit of its own.
 */
const MAX_UPLOAD_BYTES = 40 * 1024 * 1024;

const MAX_UPLOAD_MB = MAX_UPLOAD_BYTES / 1024 / 1024;

/**
 * `bytes` is only passed once there is a real file to measure. The
 * content-length check below cannot quote a size: it counts the multipart
 * framing too, so it reads a hair over the file itself and quoting it gives
 * the reader "that file is 40.0MB, the limit is 40MB".
 */
function tooLarge(bytes?: number) {
  const size = bytes === undefined ? '' : `That file is ${(bytes / 1024 / 1024).toFixed(1)}MB. `;
  return NextResponse.json(
    { error: `${size}Braindot reads files up to ${MAX_UPLOAD_MB}MB — try a smaller export, or split the book.` },
    { status: 413 },
  );
}


/**
 * Find the cover image inside an epub and return it as a small data URL.
 *
 * The manifest is asked first and guessed from filenames only as a fallback,
 * because plenty of books ship a "cover.xhtml" wrapper page alongside the
 * actual image and the name alone cannot tell them apart.
 *
 * The image is re-encoded to a shelf-sized JPEG. A cover straight out of an
 * epub is often 1–3MB, which would not survive the trip: the vault keeps it as
 * a data URL in localStorage and syncs it inside a document with a 1MB ceiling.
 */
async function extractEpubCover(zip: any, opfEntryName: string, opfXml: string): Promise<string | null> {
  const entries = zip.getEntries();
  const opfDir = opfEntryName.includes('/') ? opfEntryName.slice(0, opfEntryName.lastIndexOf('/') + 1) : '';

  // Resolve an href that is relative to the OPF's own folder.
  const resolve = (href: string) => {
    const path = (opfDir + href.replace(/^\.\//, '')).replace(/[^/]+\/\.\.\//g, '');
    return entries.find((e: any) => e.entryName === path)
      || entries.find((e: any) => e.entryName.endsWith('/' + href))
      || entries.find((e: any) => e.entryName === href);
  };

  const manifest = [...opfXml.matchAll(/<item\b[^>]*>/gi)].map((m) => m[0]);
  const attr = (tag: string, name: string) =>
    tag.match(new RegExp(`${name}\\s*=\\s*["']([^"']+)["']`, 'i'))?.[1] ?? '';

  let entry: any = null;

  // 1. EPUB 3: the manifest item marked as the cover image.
  const byProperty = manifest.find((t) => /properties\s*=\s*["'][^"']*cover-image/i.test(t));
  if (byProperty) entry = resolve(attr(byProperty, 'href'));

  // 2. EPUB 2: <meta name="cover" content="theItemId"/> pointing into the manifest.
  if (!entry) {
    const metaId = opfXml.match(/<meta[^>]+name\s*=\s*["']cover["'][^>]+content\s*=\s*["']([^"']+)["']/i)?.[1];
    if (metaId) {
      const item = manifest.find((t) => attr(t, 'id') === metaId);
      if (item) entry = resolve(attr(item, 'href'));
    }
  }

  // 3. Any manifest image whose id or href mentions a cover.
  if (!entry) {
    const guess = manifest.find((t) =>
      /image\//i.test(attr(t, 'media-type')) && /cover/i.test(attr(t, 'id') + ' ' + attr(t, 'href')));
    if (guess) entry = resolve(attr(guess, 'href'));
  }

  // 4. Last resort: a file in the archive that looks like a cover image.
  if (!entry) {
    entry = entries.find((e: any) => /cover[^/]*\.(jpe?g|png|webp)$/i.test(e.entryName));
  }

  if (!entry) return null;

  try {
    const raw = entry.getData();
    if (!raw || raw.length === 0) return null;
    const { default: sharp } = await import('sharp');
    const out = await sharp(raw)
      .resize({ width: 320, height: 480, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 74, mozjpeg: true })
      .toBuffer();
    return `data:image/jpeg;base64,${out.toString('base64')}`;
  } catch {
    // A cover is a nicety. A book that fails to produce one still imports.
    return null;
  }
}

/**
 * How much of a book's bytes may be pictures.
 *
 * The text of an item is capped at 900_000 characters for the Convex sync
 * (see MAX_SYNCED_CONTENT in hooks/useVaultData), and an inlined image is
 * charged against the same budget because it lives in the same string. This
 * leaves room for a full-length book plus its illustrations; a heavily
 * illustrated art book will spend it and the rest of its plates are dropped.
 */
const IMAGE_BUDGET_BYTES = 360_000;
/** Nothing in a 68ch reading column needs more than this across. */
const IMAGE_MAX_WIDTH = 900;

/**
 * Turn an epub's internal image links into pictures that survive the import.
 *
 * A chapter's markup says `<img src="../images/00014.jpeg">`, which
 * htmlToMarkdownBlocks faithfully turns into `![alt](../images/00014.jpeg)`.
 * That path means something only inside the zip, so once the book was imported
 * the reader rendered the markdown as literal text — the reader saw the source
 * of an image rather than an image, which is worse than seeing nothing.
 *
 * So each one is resolved against the archive, re-encoded small, and inlined
 * as a data URL. Anything that cannot be resolved, or that no longer fits the
 * budget, is removed rather than left to render as source: the alt text is
 * kept as a caption where there is one, so the page still says what was there.
 */
async function inlineEpubImages(
  markdown: string,
  zip: any,
  chapterEntryName: string,
  budget: { left: number },
): Promise<string> {
  const refs = [...markdown.matchAll(/!\[([^\]]*)\]\(([^)\s]+)\)/g)];
  if (refs.length === 0) return markdown;

  const entries = zip.getEntries();
  const dir = chapterEntryName.includes('/')
    ? chapterEntryName.slice(0, chapterEntryName.lastIndexOf('/') + 1)
    : '';

  const resolve = (href: string) => {
    const cleaned = decodeURIComponent(href.split('#')[0].replace(/^\.\//, ''));
    // Collapse the "../" hops the href walks up out of the chapter's folder.
    const path = (dir + cleaned).replace(/[^/]+\/\.\.\//g, '');
    return entries.find((e: any) => e.entryName === path)
      || entries.find((e: any) => e.entryName.endsWith('/' + cleaned))
      || entries.find((e: any) => e.entryName === cleaned)
      // Last resort: match on the bare filename, which is enough in the many
      // epubs that keep every image in one folder.
      || entries.find((e: any) => e.entryName.endsWith('/' + cleaned.split('/').pop()));
  };

  let out = markdown;
  for (const [whole, alt, href] of refs) {
    // Anything already self-contained is left exactly as it is.
    if (/^(https?:|data:)/i.test(href)) continue;

    let replacement = alt.trim() ? `*${alt.trim()}*` : '';
    if (budget.left > 0) {
      const entry = resolve(href);
      const raw = entry?.getData();
      if (raw && raw.length > 0) {
        try {
          const { default: sharp } = await import('sharp');
          const encoded = await sharp(raw)
            .resize({ width: IMAGE_MAX_WIDTH, withoutEnlargement: true })
            .webp({ quality: 72 })
            .toBuffer();
          const url = `data:image/webp;base64,${encoded.toString('base64')}`;
          if (url.length <= budget.left) {
            budget.left -= url.length;
            replacement = `![${alt}](${url})`;
          }
        } catch {
          // An unreadable or exotic image falls through to its caption.
        }
      }
    }
    out = out.replace(whole, replacement);
  }
  return out;
}

// Extract text content from uploaded epub or pdf files
export async function POST(req: NextRequest) {
  try {
    // Refuse on the declared length before formData() buffers anything. The
    // header is the caller's claim, so file.size is checked again below once
    // there is a real file to measure — this only avoids reading a body we
    // already know we will not accept.
    const declared = Number(req.headers.get('content-length') ?? 0);
    if (declared > MAX_UPLOAD_BYTES) return tooLarge();

    const allowed = await guard(req, 'extract', EXTRACT_QUOTA);
    if (!allowed.ok) return allowed.response;

    const formData = await req.formData();
    const file = formData.get('file');
    if (!file || typeof file === 'string') {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }
    if (file.size > MAX_UPLOAD_BYTES) return tooLarge(file.size);

    const fileName = file.name.toLowerCase();
    // Only these two are parsed, and anything else previously fell through
    // every branch to return a "no content" body with a 200 — a success shape
    // for a request that was never going to work.
    if (!fileName.endsWith('.epub') && !fileName.endsWith('.pdf')) {
      return NextResponse.json(
        { error: 'Braindot reads EPUB and PDF files.' },
        { status: 415 },
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    let title = file.name.replace(/\.(epub|pdf)$/i, '');
    let author = 'Unknown';
    let chapters: { title: string; content: string }[] = [];
    let totalPages = 1;
    // How many pages were actually read, so the caller can say when a book
    // arrived incomplete instead of letting the reader discover it 30 pages in.
    let pagesRead = 0;
    let coverUrl: string | null = null;

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
          if (titleMatch) title = decodeEntities(titleMatch[1]).trim();
          if (authorMatch) author = decodeEntities(authorMatch[1]).trim();
          coverUrl = await extractEpubCover(zip, opfFiles[0].entryName, opfContent);
        }

        // Extract text from all HTML/XHTML files in the epub
        const htmlEntries = zip.getEntries().filter((e: any) =>
          (e.entryName.endsWith('.html') || e.entryName.endsWith('.xhtml') || e.entryName.endsWith('.htm')) &&
          !e.entryName.includes('toc') &&
          !e.entryName.includes('nav') &&
          !e.entryName.includes('cover')
        );

        // Shared across every chapter: one book gets one picture allowance.
        const imageBudget = { left: IMAGE_BUDGET_BYTES };

        for (const entry of htmlEntries) {
          const html = entry.getData().toString('utf8');
          const h1Match = html.match(/<h[12][^>]*>([\s\S]*?)<\/h[12]>/i);
          const chapterTitle = h1Match
            ? decodeEntities(h1Match[1].replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim()
            : `Chapter ${chapters.length + 1}`;

          const body = await inlineEpubImages(
            htmlToMarkdownBlocks(html), zip, entry.entryName, imageBudget,
          );
          if (body.length > 100) {
            // The heading is prepended only when the text does not already open
            // with it. The old code always prepended, so every chapter showed
            // its title twice before a word of prose — three times once the
            // length heuristic promoted the running head to a heading too.
            const firstBlock = body.split('\n\n')[0] || '';
            const opensWithTitle = /^#{1,3}\s+/.test(firstBlock)
              && firstBlock.replace(/^#{1,3}\s+/, '').toLowerCase() === chapterTitle.toLowerCase();
            chapters.push({
              title: chapterTitle,
              content: opensWithTitle ? body : `# ${chapterTitle}\n\n${body}`,
            });
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

        // Read until the budget runs out rather than stopping at a fixed page.
        //
        // This was `Math.min(pdf.numPages, 30)`, so every PDF became its first
        // thirty pages and said nothing about it — a 400-page book imported,
        // looked fine on the shelf, and ended a tenth of the way in. The cap
        // was there to stop the route timing out, which is a question about
        // seconds, not pages: a text-only page costs a few milliseconds, so
        // hundreds fit comfortably inside the budget below.
        const startedAt = Date.now();
        const maxPages = Math.min(pdf.numPages, HARD_PAGE_CAP);
        let lastPageRead = 0;
        for (let i = 1; i <= maxPages; i++) {
          if (Date.now() - startedAt > PDF_TIME_BUDGET_MS) break;
          lastPageRead = i;
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

        // pdf.js types `info` as a bare Object, so the fields it actually
        // carries have to be named here to be read.
        const info = (await pdf.getMetadata())?.info as
          | { Title?: string; Author?: string }
          | undefined;
        if (info?.Title) title = info.Title;
        if (info?.Author) author = info.Author;

        // The loop may have stopped early, so report what was read, not the cap.
        pagesRead = lastPageRead;

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
      coverUrl,
      content: fullContent || `# ${title}\n\n*No content could be extracted from this file.*`,
      totalPages,
      pagesRead: pagesRead || totalPages,
      /** True when the file holds more than what came back. */
      truncated: pagesRead > 0 && pagesRead < totalPages,
      chapters: chapters.length,
    });
  } catch (err: unknown) {
    // Logged in full, answered in general: a parser failure names paths and
    // library internals that the caller has no business reading.
    console.error('[/api/reading/extract] error:', err instanceof Error ? err.stack ?? err.message : err);
    return NextResponse.json(
      { error: 'That file could not be read. It may be corrupted or an unusual variant of the format.' },
      { status: 500 },
    );
  }
}
