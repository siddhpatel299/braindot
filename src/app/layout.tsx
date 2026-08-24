import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { StorageAlert } from "@/components/second-brain/StorageAlert";
import { ConvexClientProvider } from "@/lib/convex";

export const metadata: Metadata = {
  title: "Braindot — PKM",
  description: "A command-palette-first personal knowledge management app. VSCode dark aesthetic, JetBrains Mono throughout.",
  keywords: ["PKM", "Braindot", "Zettelkasten", "Notes", "Markdown"],
  authors: [{ name: "Braindot" }],
  icons: {
    icon: "/logo.svg",
  },
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
    <html lang="en" suppressHydrationWarning>
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
