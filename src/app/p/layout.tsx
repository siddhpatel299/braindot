// The shell every published page sits in.
//
// The app's body is `height: 100vh; overflow: hidden` — correct for a desk
// that owns the window, wrong for a document someone scrolls. This div is
// `body > div:first-child`, so it inherits that 100vh and hands the scrolling
// back.

export default function PublishedLayout({ children }: { children: React.ReactNode }) {
  return <div className="pub-shell sb-scroll">{children}</div>;
}
