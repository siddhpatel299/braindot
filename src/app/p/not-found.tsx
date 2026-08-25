import Link from 'next/link';

// Deliberately says nothing about which part was wrong. A slug that was never
// issued, one whose publication has been taken down, and a path that does not
// exist inside a live publication all land here — distinguishing them would
// confirm that a slug is real, which is the one thing an unguessable link is
// meant to withhold.

export default function NotFound() {
  return (
    <article className="pub-article pub-404">
      <h1 className="pub-title">Nothing here</h1>
      <p className="pub-subtitle">
        This link has expired, been taken down, or was never quite right.
      </p>
      <p className="pub-foot-mark">
        <Link href="/landing">braindot</Link>
      </p>
    </article>
  );
}
