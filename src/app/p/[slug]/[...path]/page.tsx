import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PublishedPage } from '../../PublishedPage';
import { readPublicPage, summarise } from '../../read';

// A page inside a published folder. The path segments are joined back into
// the same '/'-separated string that publishing stored, and looked up as a
// whole — there is no walking of the tree, and nothing here trusts a segment
// enough to build a query out of it.

interface Props {
  params: Promise<{ slug: string; path: string[] }>;
}

async function load(params: Props['params']) {
  const { slug, path } = await params;
  return { slug, data: await readPublicPage(slug, path.join('/')) };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { data } = await load(params);
  if (!data) {
    return { title: 'Not found — braindot', robots: { index: false, follow: false } };
  }
  const description = data.page.subtitle || summarise(data.page.body);
  return {
    title: `${data.page.title} — ${data.publication.title}`,
    description,
    robots: data.publication.indexable ? undefined : { index: false, follow: false },
    openGraph: { title: data.page.title, description, type: 'article' },
    twitter: { card: 'summary', title: data.page.title, description },
  };
}

export default async function Page({ params }: Props) {
  const { data } = await load(params);
  if (!data) notFound();
  return <PublishedPage data={data} />;
}
