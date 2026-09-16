import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Source_Serif_4 } from "next/font/google";
import "./globals.css";

// Both faces are fetched at build time and served from our own origin, so a
// cold load makes no request to Google at all — no third-party connection to
// warm, no render-blocking stylesheet on the critical path, and the metrics
// are known up front, which is what keeps the swap from shifting the page.
// Each exposes a CSS variable; globals.css builds the stacks from them.
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  style: ["normal", "italic"],
  display: "swap",
  variable: "--font-jetbrains",
});

// Manrope — the entry world's face — is deliberately NOT loaded here. It is
// declared as an @font-face in glass-tokens.css against a file in /public,
// because /landing has no bundler and would otherwise need its own copy from
// a third party. One file, both surfaces.

// Source Serif 4 is the edition's face. opsz is the point of using it: the
// masthead at 3em and the body at 1em are drawn for their sizes rather than
// scaled from one master, so the axis has to be carried through.
const sourceSerif = Source_Serif_4({
  subsets: ["latin"],
  style: ["normal", "italic"],
  axes: ["opsz"],
  display: "swap",
  variable: "--font-source-serif",
});
import { Toaster } from "@/components/ui/toaster";
import { StorageAlert } from "@/components/second-brain/StorageAlert";
import { ConvexClientProvider } from "@/lib/convex";

export const metadata: Metadata = {
  // A template rather than a fixed string: a published note and the reader
  // both have a subject of their own, and a tab that says only "Braindot"
  // is useless once you have four of them open.
  title: {
    default: "Braindot — a thinking environment",
    template: "%s — Braindot",
  },
  description:
    "A personal knowledge management workspace where notes connect, reading flows in, and an AI tutor teaches you. Wiki-links, automatic backlinks, and a graph of your thinking.",
  keywords: ["PKM", "Braindot", "Zettelkasten", "Notes", "Markdown", "Backlinks"],
  authors: [{ name: "Braindot" }],
  icons: {
    icon: "/logo.svg",
  },
};

// Next ships width=device-width by default, but not viewport-fit — without it
// iOS letterboxes the app instead of letting the shell run under the home
// indicator and reclaim it with env(safe-area-inset-*). maximumScale stays at
// 5 rather than 1: pinch-zoom is an accessibility affordance, not a bug.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#141310" },
    { media: "(prefers-color-scheme: light)", color: "#efece4" },
  ],
};

// Inline script to set theme + editor font BEFORE React hydrates — prevents
// a flash of the wrong theme or reading font.
const themeScript = `
(function() {
  try {
    var saved = localStorage.getItem('sb-theme');
    var system = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    var theme = (saved === 'dark' || saved === 'light') ? saved : system;
    document.documentElement.setAttribute('data-theme', theme);
    // Prose reads in serif unless the user picked otherwise; the attribute is
    // only set for a non-default choice, so the CSS default does the rest.
    var ef = localStorage.getItem('sb-editor-font');
    if (ef === 'sans' || ef === 'mono') {
      document.documentElement.setAttribute('data-editor-font', ef);
    }
  } catch (e) {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${jetbrainsMono.variable} ${sourceSerif.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="antialiased">
        <ConvexClientProvider>{children}</ConvexClientProvider>
        <StorageAlert />
        <Toaster />
      </body>
    </html>
  );
}
