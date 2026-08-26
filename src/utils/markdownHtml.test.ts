/**
 * Checks for the markdown renderer and for the marks laid over it.
 *
 * Run with:  npm run check:markdown
 * Node 22 strips the types, so this needs no test runner and no dependency.
 *
 * Highlights are found by searching the rendered document for the reader's
 * passage, and the failure mode that matters is a match landing somewhere the
 * reader cannot see: inside a tag, inside an attribute, inside an entity.
 * That corrupts the page rather than mis-marking it — class="md-h md-h2" with
 * a <mark> spliced into it is no longer a heading — so most of what is checked
 * here is that the markup comes out the other side untouched.
 */

import { applyHighlights, renderMarkdownHtml, safeUrl } from './markdownHtml.ts';

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
   Fixtures
   ============================================================ */

let seq = 0;
function mark(text: string, color = 'yellow') {
  seq++;
  return { id: `hl_${seq}`, text, color };
}

/** The tags of a document, in order — the structure a mark must not disturb. */
function tagsOf(html: string): string[] {
  return html.match(/<[^>]*>/g) ?? [];
}

/** What the page says once the markup is taken away. */
function textOf(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&(amp|lt|gt|quot|#39);/g, (m, e: string) =>
      ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" }[e] ?? m));
}

/** Marking changes what is emphasised, never what is written or how. */
function survives(name: string, html: string, highlights: { id: string; text: string; color: string }[]) {
  const out = applyHighlights(html, highlights);
  eq(`${name}: the text is unchanged`, textOf(out), textOf(html));
  eq(`${name}: the tags are unchanged`,
    tagsOf(out).filter((t) => !/^<\/?mark[ >]/.test(t)), tagsOf(html));
  return out;
}

/* ============================================================
   The renderer's escaping
   ------------------------------------------------------------
   Everything below rests on this: the renderer escapes every "<" it finds in
   prose, so every "<" left in its output opens a tag. If that stops being
   true, scanning for tags stops being sound.
   ============================================================ */

eq('a heading carries its classes',
  renderMarkdownHtml('## Class design'),
  '<h2 class="md-h md-h2">Class design</h2>');

eq('angle brackets in prose are escaped',
  renderMarkdownHtml('5 < 6 && "x" and Bob\'s'),
  '<p class="md-p">5 &lt; 6 &amp;&amp; &quot;x&quot; and Bob&#39;s</p>');

eq('a code block escapes its contents',
  renderMarkdownHtml('~~~html\n<div class="x">\n~~~'.replace(/~~~/g, '```')),
  '<pre class="md-codeblock"><div class="md-codeblock-lang">html</div>'
  + '<code>&lt;div class=&quot;x&quot;&gt;</code></pre>');

check('a javascript: url is refused', safeUrl('javascript:alert(1)') === null);
check('an https url is kept', safeUrl('https://example.com/a') === 'https://example.com/a');

/* ============================================================
   Marks land on the text
   ============================================================ */

eq('a passage is wrapped where it is written',
  applyHighlights('<p class="md-p">the quick fox</p>', [{ id: 'h1', text: 'quick', color: 'yellow' }]),
  '<p class="md-p">the <mark class="hl-yellow" data-hl-id="h1">quick</mark> fox</p>');

// The bug this file exists for. "class" is an ordinary English word and also
// the name of every attribute the renderer emits; replacing it blind put a
// <mark> inside class="md-h md-h2" and the heading stopped being a heading.
{
  const html = renderMarkdownHtml('## Class design\n\nThe class keyword is quiet.');
  const out = survives('a word that is also an attribute name', html, [mark('class')]);
  eq('a word that is also an attribute name: only the prose is marked', out,
    '<h2 class="md-h md-h2">Class design</h2>\n'
    + '<p class="md-p">The <mark class="hl-yellow" data-hl-id="hl_1">class</mark> keyword is quiet.</p>');
}

// The same trap wearing the renderer's other hats: a tag name, and an
// attribute that images carry.
{
  const html = renderMarkdownHtml('~~~js\nconst code = 1;\n~~~'.replace(/~~~/g, '```'));
  const out = survives('a word that is also a tag name', html, [mark('code')]);
  check('a word that is also a tag name: the pre and code tags stand',
    out.includes('<pre class="md-codeblock">') && out.includes('<code>'), out);
  check('a word that is also a tag name: the prose word is marked',
    out.includes('>const <mark class="hl-yellow" data-hl-id="hl_2">code</mark> = 1;</code>'), out);
}

{
  const html = renderMarkdownHtml('![a data plot](https://example.com/plot.png)\n\nThe data is thin.');
  const out = survives('a word that is also an attribute', html, [mark('data')]);
  check('a word that is also an attribute: the img tag is intact',
    out.includes('<img class="md-image" src="https://example.com/plot.png" alt="a data plot" loading="lazy" />'), out);
  check('a word that is also an attribute: the prose word is marked',
    out.includes('The <mark class="hl-yellow" data-hl-id="hl_3">data</mark> is thin.'), out);
}

// A URL is the longest run of text in a document that the reader never sees.
{
  const html = renderMarkdownHtml('Read [the highlight guide](https://example.com/highlight/api).');
  const out = survives('a word inside a url', html, [mark('highlight')]);
  check('a word inside a url: the href is intact',
    out.includes('href="https://example.com/highlight/api"'), out);
  eq('a word inside a url: only the link text is marked',
    (out.match(/<mark /g) ?? []).length, 1);
}

/* ============================================================
   Marks land on the text a reader would select
   ============================================================ */

// Escaped text is compared as the reader sees it, not as it is stored, so a
// passage containing a quote or an ampersand still matches.
eq('a passage containing an apostrophe matches',
  applyHighlights(renderMarkdownHtml("Bob's book & mine"), [{ id: 'h1', text: "Bob's book & mine", color: 'green' }]),
  '<p class="md-p"><mark class="hl-green" data-hl-id="h1">Bob&#39;s book &amp; mine</mark></p>');

// And the other direction: the letters of an entity are markup, not text.
// "amp" is three characters, so it clears the minimum a selection needs.
{
  const html = renderMarkdownHtml('Salt & pepper');
  eq('the innards of an entity are not text', applyHighlights(html, [mark('amp')]), html);
}

eq('a passage from another chapter is simply absent',
  applyHighlights('<p class="md-p">the quick fox</p>', [{ id: 'h1', text: 'a slow bear', color: 'purple' }]),
  '<p class="md-p">the quick fox</p>');

eq('no marks, no change',
  applyHighlights('<p class="md-p">the quick fox</p>', []),
  '<p class="md-p">the quick fox</p>');

eq('an empty passage marks nothing',
  applyHighlights('<p class="md-p">the quick fox</p>', [{ id: 'h1', text: '', color: 'yellow' }]),
  '<p class="md-p">the quick fox</p>');

// Every occurrence is marked, as it was before — the margin finds the first.
{
  const out = applyHighlights('<p class="md-p">fox and fox</p>', [{ id: 'h1', text: 'fox', color: 'yellow' }]);
  eq('a repeated passage is marked at every occurrence', (out.match(/data-hl-id="h1"/g) ?? []).length, 2);
}

// A passage cut by markup is left alone. It was never marked before either —
// the words are not adjacent in the document — and half a mark would be worse.
{
  const html = renderMarkdownHtml('the **quick** brown fox');
  eq('a passage broken by markup is left unmarked', applyHighlights(html, [mark('quick brown')]), html);
}

/* ============================================================
   Marks do not collide
   ============================================================ */

// One <mark> inside another would hand the margin two elements for one id,
// and the one it scrolls to is whichever the browser reaches first.
{
  const out = survives('overlapping passages', '<p class="md-p">the quick brown fox</p>',
    [mark('quick brown'), mark('brown fox')]);
  eq('overlapping passages: one wins outright', (out.match(/<mark /g) ?? []).length, 1);
  check('overlapping passages: the first one made wins', out.includes('>quick brown</mark>'), out);
}

{
  const out = applyHighlights('<p class="md-p">the brown fox</p>',
    [{ id: 'short', text: 'brown', color: 'yellow' }, { id: 'long', text: 'brown fox', color: 'green' }]);
  eq('two passages starting together: the longer wins', out,
    '<p class="md-p">the <mark class="hl-green" data-hl-id="long">brown fox</mark></p>');
}

// The id and the colour are written into attributes, so they are escaped too.
// Neither can carry a quote today; nothing should depend on that staying true.
{
  const out = applyHighlights('<p class="md-p">fox</p>', [{ id: 'a" onload="x', text: 'fox', color: 'yellow' }]);
  check('a quote in an id cannot end the attribute', !out.includes('onload="x"'), out);
  check('a quote in an id is escaped', out.includes('data-hl-id="a&quot; onload=&quot;x"'), out);
}

/* ============================================================
   A whole document
   ============================================================ */

{
  const doc = [
    '# A Study in Scarlet',
    '',
    '> [!note] The data is thin.',
    '',
    'The `class` of problem here is one of *figure* and ground, and the',
    'code that draws it is [documented](https://example.com/code/figure).',
    '',
    '- a figure',
    '- some data',
    '',
    '~~~py',
    'class Figure:  # the code',
    '    pass',
    '~~~',
  ].join('\n').replace(/~~~/g, '```');
  const html = renderMarkdownHtml(doc);
  const out = survives('a whole document', html,
    ['class', 'data', 'figure', 'code', 'ground', 'https://example.com'].map((t) => mark(t)));
  check('a whole document: no mark escaped into a tag', !/<[a-z]+[^>]*<mark/.test(out), out);
  check('a whole document: every mark is closed',
    (out.match(/<mark /g) ?? []).length === (out.match(/<\/mark>/g) ?? []).length);
  check('a whole document: something was actually marked', out.includes('<mark '));
  check('a whole document: the url in the href was not marked',
    out.includes('href="https://example.com/code/figure"'), out);
}

/* ============================================================
   Result
   ============================================================ */

if (failures.length > 0) {
  console.error(`\nMarkdown checks: ${passed} passed, ${failures.length} FAILED\n`);
  for (const f of failures) console.error('  ✗ ' + f);
  process.exit(1);
}
console.log(`Markdown checks: all ${passed} passed.`);
