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
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased">
        <ConvexClientProvider>
          {children}
          <Toaster />
        </ConvexClientProvider>
      </body>
    </html>
  );
}
