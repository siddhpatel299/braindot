import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { ConvexClientProvider } from "@/lib/convex";

export const metadata: Metadata = {
  title: "Second Brain — PKM",
  description: "A command-palette-first personal knowledge management app. VSCode dark aesthetic, JetBrains Mono throughout.",
  keywords: ["PKM", "Second Brain", "Zettelkasten", "Notes", "Markdown"],
  authors: [{ name: "Second Brain" }],
  icons: {
    icon: "/logo.svg",
  },
};

// Inline script to set theme BEFORE React hydrates — prevents flash of wrong theme
const themeScript = `
(function() {
  try {
    var saved = localStorage.getItem('sb-theme');
    var system = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    var theme = (saved === 'dark' || saved === 'light') ? saved : system;
    document.documentElement.setAttribute('data-theme', theme);
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
        <Toaster />
      </body>
    </html>
  );
}
