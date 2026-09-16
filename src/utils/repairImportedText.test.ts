/**
 * Checks for the read-time repair applied to imported books.
 *
 * Run with:  npm run check:repair
 * Node 22 strips the types, so this needs no test runner and no dependency.
 *
 * The property that matters is that a reader never sees markdown source. The
 * renderer prints the literal text for any URL it cannot vouch for, so every
 * image reference that survives this repair has to be one `safeUrl` accepts —
 * and every one it drops has to leave the prose around it intact.
 */

import { dropDanglingImages, repairImportedText } from './repairImportedText.ts';
import { renderMarkdownHtml } from './markdownHtml.ts';

let passed = 0;
const failures: string[] = [];

function check(name: string, condition: boolean, detail = '') {
  if (condition) { passed++; return; }
  failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
}

function eq(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  check(name, a === e, `expected ${e}, got ${a}`);
}

/* ============================================================
   The bug as it was reported: an epub's internal paths
   ============================================================ */

eq(
  'relative epub path becomes its caption',
  dropDanglingImages('![The Secret to Money](../images/00040.jpeg)'),
  '*The Secret to Money*',
);

eq(
  'a path with no alt text disappears entirely',
  dropDanglingImages('![](../images/00030.jpeg)'),
  '',
);

eq(
  'prose either side of a dropped image survives',
  dropDanglingImages('Before.\n\n![A plate](../img/1.png)\n\nAfter.'),
  'Before.\n\n*A plate*\n\nAfter.',
);

eq(
  'several references in one chapter are all handled',
  dropDanglingImages('![One](../a.jpeg) then ![Two](../b.jpeg)'),
  '*One* then *Two*',
);

/* ============================================================
   What must NOT be touched
   ============================================================ */

const dataUrl = 'data:image/webp;base64,UklGRg==';
eq(
  'an inlined data URL is left exactly as it was',
  dropDanglingImages(`![Plate](${dataUrl})`),
  `![Plate](${dataUrl})`,
);

eq(
  'an http image is left alone',
  dropDanglingImages('![Remote](https://example.com/a.png)'),
  '![Remote](https://example.com/a.png)',
);

eq(
  'a vault image reference is left alone',
  dropDanglingImages('![Pasted](braindot:img/abc123)'),
  '![Pasted](braindot:img/abc123)',
);

eq(
  'a fenced code block keeps its example verbatim',
  dropDanglingImages('```md\n![alt](../images/x.png)\n```'),
  '```md\n![alt](../images/x.png)\n```',
);

eq(
  'a tilde fence is held out too',
  dropDanglingImages('~~~\n![alt](../images/x.png)\n~~~\n\n![Real](../y.png)'),
  '~~~\n![alt](../images/x.png)\n~~~\n\n*Real*',
);

eq(
  'text with no images is returned untouched',
  dropDanglingImages('Just a paragraph with a [link](https://example.com).'),
  'Just a paragraph with a [link](https://example.com).',
);

eq(
  'a link is not mistaken for an image',
  dropDanglingImages('See [the chapter](../text/ch2.xhtml).'),
  'See [the chapter](../text/ch2.xhtml).',
);

/* ============================================================
   The property, checked through the renderer itself
   ============================================================ */

const chapter = [
  '# Chapter 34',
  '',
  '![The Secret to Money](../images/00040.jpeg)',
  '',
  '"Whatever the mind can conceive it can achieve."',
  '',
  '![JackCanfield_BOOK_FN_sml](../images/00030.jpeg)',
  '',
  '## Jack Canfield',
].join('\n');

const rendered = renderMarkdownHtml(repairImportedText(chapter));
check(
  'no markdown image source reaches the rendered page',
  !rendered.includes('!['),
  rendered.slice(0, 200),
);
check('the caption is kept as prose', rendered.includes('The Secret to Money'));
check('the heading either side survives', rendered.includes('Chapter 34') && rendered.includes('Jack Canfield'));

/* ============================================================
   The repair still does its original job
   ============================================================ */

// Well-formed prose must come back byte-identical: the image pass runs on
// every imported book now, so it must not disturb one that was already fine.
const healthy = [
  'The first paragraph runs to a comfortable length and finishes on a full stop.',
  '',
  'The second one does the same, so nothing here looks hard-wrapped at all.',
].join('\n');
eq('a healthy book is returned unchanged', repairImportedText(healthy), healthy);
eq('empty content is returned unchanged', repairImportedText(''), '');

/* ============================================================
   Result
   ============================================================ */

if (failures.length > 0) {
  console.error(`\nImport repair checks: ${passed} passed, ${failures.length} FAILED\n`);
  for (const f of failures) console.error('  ✗ ' + f);
  process.exit(1);
}
console.log(`Import repair checks: all ${passed} passed.`);
