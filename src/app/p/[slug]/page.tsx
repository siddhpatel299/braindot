import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PublishedPage } from '../PublishedPage';
import { readPublicPage, summarise } from '../read';

// The root of a publication: the note itself, or a folder's contents page.
// Nested pages are the [...path] route next door; both render the same
// component, they only differ in which page they ask for.

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const data = await readPublicPage(slug, '');
  if (!data) {
    return { title: 'Not found — braindot', robots: { index: false, follow: false } };
  }
  const description = data.page.subtitle || summarise(data.page.body);
  return {
    title: `${data.page.title} — braindot`,
    description,
    // Unlisted and indexed are different kinds of public. A link is shared
    // with the people it was sent to unless the author says otherwise.
    robots: data.publication.indexable ? undefined : { index: false, follow: false },
    openGraph: { title: data.page.title, description, type: 'article' },
    twitter: { card: 'summary', title: data.page.title, description },
  };
}

export default async function Page({ params }: Props) {
  const { slug } = await params;
  const data = await readPublicPage(slug, '');
  if (!data) notFound();
  return <PublishedPage data={data} />;
}
