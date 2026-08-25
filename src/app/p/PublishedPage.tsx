// The page a visitor without an account actually sees.
//
// It is the reader, not the editor: one column, the reading face, and no
// chrome that would only make sense to someone who owns the vault. Everything
// here renders on the server — there is no state, no sync, and nothing for
// the client bundle to do.

import Link from 'next/link';
import { renderMarkdownHtml } from '@/utils/markdownHtml';
import { readableDate, type PublicPage } from './read';

function href(slug: string, path: string): string {
  return path ? `/p/${slug}/${path}` : `/p/${slug}`;
}

export function PublishedPage({ data }: { data: PublicPage }) {
  const { publication, page } = data;
  const isFolder = page.kind === 'folder';
  const notes = page.children.filter((c) => c.kind === 'note');
  const folders = page.children.filter((c) => c.kind === 'folder');

  return (
    <article className="pub-article">
      {page.trail.length > 0 && (
        <nav className="pub-trail" aria-label="Breadcrumb">
          {page.trail.map((crumb, i) => (
            <span key={crumb.path || 'root'}>
              {i > 0 && <span className="pub-trail-sep">/</span>}
              <Link href={href(publication.slug, crumb.path)} className="pub-trail-link">
                {crumb.title}
              </Link>
            </span>
          ))}
        </nav>
      )}

      <header className="pub-head">
        <h1 className="pub-title">{page.title}</h1>
        {page.subtitle && <p className="pub-subtitle">{page.subtitle}</p>}
        <div className="pub-meta">
          {page.tags.map((tag) => (
            <span key={tag} className="pub-tag">
              {tag}
            </span>
          ))}
          {isFolder ? (
            <span>{countLabel(page.children.length, 'page')}</span>
          ) : (
            <span>{countLabel(page.wordCount, 'word')}</span>
          )}
          {readableDate(page.updatedAt) && <span>{readableDate(page.updatedAt)}</span>}
        </div>
      </header>

      {page.body.trim() && (
        <div
          className="pub-prose"
          dangerouslySetInnerHTML={{ __html: renderMarkdownHtml(page.body) }}
        />
      )}

      {/* A folder page is a table of contents. Notes first, then the
          subfolders — the same order the sidebar puts them in, so someone
          who has seen the app recognises the shape. */}
      {isFolder && (
        <div className="pub-index">
          {page.children.length === 0 && <p className="pub-empty">Nothing in here yet.</p>}
          {[...notes, ...folders].map((child) => (
            <Link key={child.path} href={href(publication.slug, child.path)} className="pub-index-row">
              <span className="pub-index-kind">{child.kind === 'folder' ? '▸' : '·'}</span>
              <span className="pub-index-text">
                <span className="pub-index-title">{child.title}</span>
                {child.subtitle && <span className="pub-index-sub">{child.subtitle}</span>}
              </span>
            </Link>
          ))}
        </div>
      )}

      <footer className="pub-foot">
        {page.path !== '' && (
          <Link href={href(publication.slug, '')} className="pub-foot-link">
            ← {publication.title}
          </Link>
        )}
        <span className="pub-foot-mark">
          Published with <a href="/landing">braindot</a>
        </span>
      </footer>
    </article>
  );
}

function countLabel(n: number, noun: string): string {
  return `${n.toLocaleString('en-GB')} ${noun}${n === 1 ? '' : 's'}`;
}
